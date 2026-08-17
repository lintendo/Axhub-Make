import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import AiImageGenerationComposer from './AiImageGenerationComposer';
import {
  AI_IMAGE_PLACEHOLDER_FILE_ID,
  createAiImageGeneratorElement,
  createAiImagePlaceholderFile,
  getAiImageDisplaySize,
  isAiImageElement,
  isAiImageGeneratorElement,
  shouldDeleteAiImageGeneratorFromComposerKeydown,
} from './canvasAiImage';
import {
  createCanvasReferenceSnapshot,
  renderCanvasReferenceContext,
  type CanvasLocalContextRef,
  type CanvasReferenceSnapshot,
} from './canvasReferenceImages';
import { getAiImageTaskStore, type AiImageTaskRecord } from './aiImageStore';
import { createCanvasImageArtifactEventFromAiImageTask, type CanvasImageArtifactEvent } from './canvasImageArtifacts';
import type { PromptClientPreference } from '../../types';
import type { ThemeResourceItem } from '../resources/resource.types';
import {
  resolveCanvasGeneratorPlacement,
  type CanvasGeneratorPlacement,
} from '../shared/canvasGeneratorPlacement';
import {
  pruneStableCanvasGeneratorOverlayBounds,
  resolveStableCanvasGeneratorOverlayBounds,
  type CanvasGeneratorOverlayBounds,
} from '../shared/canvasGeneratorOverlayPosition';
import { createCanvasGenerationComposerDraftStorageKey } from '../shared/canvasGenerationComposerDraft';
import CanvasNodeTitleLabel, {
  CANVAS_NODE_TITLE_LABEL_HEIGHT,
  CANVAS_NODE_TITLE_LABEL_MAX_WIDTH,
  CANVAS_NODE_TITLE_LABEL_OFFSET,
} from '../../components/content/canvas-embeds/CanvasNodeTitleLabel';
import { shouldFitElementIntoCanvasViewport } from '../../components/content/canvas-embeds/activePreviewViewport';

interface CanvasAiImageToolProps {
  projectId: string;
  excalidrawAPI: any;
  containerRef: React.RefObject<HTMLDivElement>;
  assistantProjectPath?: string;
  preferredPromptClient?: PromptClientPreference;
  themes?: ThemeResourceItem[];
  onImageArtifact?: (event: CanvasImageArtifactEvent) => void;
  onSceneMutated?: () => void;
}

interface SelectedAiInfo {
  element: any;
  kind: 'generator' | 'image';
  left: number;
  top: number;
  composerPlacement: {
    left: number;
    top: number;
    width: number;
  };
}

interface GeneratorStatusOverlay {
  elementId: string;
  task: AiImageTaskRecord;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GeneratorTitleLabel {
  elementId: string;
  title: string;
  left: number;
  top: number;
  maxWidth: number;
  isSelected: boolean;
}

const AI_IMAGE_GENERATOR_DRAG_MIME = 'application/x-axhub-ai-image-generator';
const AI_IMAGE_COMPOSER_WIDTH = 640;
const AI_IMAGE_COMPOSER_GAP = 10;
const AI_IMAGE_COMPOSER_ESTIMATED_HEIGHT = 128;
const AI_IMAGE_COMPOSER_BOTTOM_INSET = 16;
const AI_IMAGE_GENERATOR_TITLE_COLOR = '#008F5D';

function canvasToScreen(
  canvasX: number,
  canvasY: number,
  scrollX: number,
  scrollY: number,
  zoom: number,
  containerLeft: number,
  containerTop: number,
) {
  return {
    x: containerLeft + (canvasX + scrollX) * zoom,
    y: containerTop + (canvasY + scrollY) * zoom,
  };
}

function screenToCanvas(
  clientX: number,
  clientY: number,
  appState: any,
  containerLeft: number,
  containerTop: number,
) {
  const zoom = appState.zoom?.value || 1;
  return {
    x: (clientX - containerLeft) / zoom - (appState.scrollX || 0),
    y: (clientY - containerTop) / zoom - (appState.scrollY || 0),
  };
}

function refreshAiImagePlaceholderFile(excalidrawAPI: any) {
  excalidrawAPI.addFiles([createAiImagePlaceholderFile()]);
}

function migrateAiImageGeneratorPlaceholders(excalidrawAPI: any): boolean {
  let changed = false;
  const elements = excalidrawAPI.getSceneElements().map((element: any) => {
    if (
      !isAiImageGeneratorElement(element)
      || element.isDeleted
      || element.fileId === AI_IMAGE_PLACEHOLDER_FILE_ID
    ) {
      return element;
    }
    changed = true;
    return {
      ...element,
      fileId: AI_IMAGE_PLACEHOLDER_FILE_ID,
      version: (element.version || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
    };
  });
  if (changed) {
    excalidrawAPI.updateScene({ elements });
  }
  return changed;
}

function stageLabel(task: AiImageTaskRecord): string {
  if (task.status === 'error') return '失败';
  if (task.status === 'done') return `完成 ${task.outputImages.length}/${task.params.n}`;
  if (task.stage === 'submitting') return '提交中';
  if (task.stage === 'preparing-context') return '准备上下文中';
  if (task.stage === 'generating-prompt') return '生成提示词中';
  if (task.stage === 'generating') return '生成图片中';
  if (task.stage === 'downloading') return '下载结果中';
  return '生成图片中';
}

function formatElapsed(task: AiImageTaskRecord): string {
  const elapsed = task.elapsed ?? Math.max(0, Date.now() - task.createdAt);
  const seconds = Math.floor(elapsed / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function clampComposerTop(anchorTop: number, containerHeight: number): number {
  const lowestVisibleTop = Math.max(
    AI_IMAGE_COMPOSER_BOTTOM_INSET,
    containerHeight - AI_IMAGE_COMPOSER_ESTIMATED_HEIGHT - AI_IMAGE_COMPOSER_BOTTOM_INSET,
  );
  return Math.max(
    AI_IMAGE_COMPOSER_BOTTOM_INSET,
    Math.min(anchorTop, lowestVisibleTop),
  );
}

export default function CanvasAiImageTool({
  projectId,
  excalidrawAPI,
  containerRef,
  assistantProjectPath,
  preferredPromptClient,
  themes,
  onImageArtifact,
  onSceneMutated,
}: CanvasAiImageToolProps) {
  const [pendingInitialReferenceImagesState, setPendingInitialReferenceImages] = useState<string[]>([]);
  const [pendingInitialReferenceImagesGeneratorId, setPendingInitialReferenceImagesGeneratorId] = useState<string | null>(null);
  const [pendingInitialLocalContextRefsState, setPendingInitialLocalContextRefs] = useState<CanvasLocalContextRef[]>([]);
  const [pendingInitialLocalContextRefsGeneratorId, setPendingInitialLocalContextRefsGeneratorId] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<SelectedAiInfo | null>(null);
  const [taskRevision, setTaskRevision] = useState(0);
  const [canvasOverlayRevision, setCanvasOverlayRevision] = useState(0);
  const copiedCanvasReferenceRef = useRef<CanvasReferenceSnapshot | null>(null);
  const emittedImageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());
  const tasks = useMemo(() => getAiImageTaskStore().getTasks(), [taskRevision]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const hasRunningTask = useMemo(() => tasks.some((task) => task.status === 'running'), [tasks]);
  const stableStatusOverlayBoundsRef = useRef<Map<string, CanvasGeneratorOverlayBounds>>(new Map());
  const canvasOverlaySignatureRef = useRef('');
  const selectedGeneratorViewportFitRef = useRef<{ elementId: string | null; raf: number }>({
    elementId: null,
    raf: 0,
  });

  const cancelPendingSelectedGeneratorViewportFit = useCallback(() => {
    if (selectedGeneratorViewportFitRef.current.raf) {
      cancelAnimationFrame(selectedGeneratorViewportFitRef.current.raf);
      selectedGeneratorViewportFitRef.current.raf = 0;
    }
  }, []);

  const emitIncrementalImageArtifacts = useCallback((task: AiImageTaskRecord) => {
    const consumedImageIds = emittedImageIdsByTaskRef.current.get(task.id) || new Set<string>();
    const artifactEvent = createCanvasImageArtifactEventFromAiImageTask(task, {
      sourceScene: 'design',
      consumedImageIds,
    });
    if (!artifactEvent) return;
    emittedImageIdsByTaskRef.current.set(task.id, new Set([
      ...consumedImageIds,
      ...artifactEvent.images.map((image) => image.imageId),
    ]));
    onImageArtifact?.(artifactEvent);
  }, [onImageArtifact]);

  useEffect(() => getAiImageTaskStore().subscribe((state) => {
    setTaskRevision((revision) => revision + 1);
    state.tasks.forEach(emitIncrementalImageArtifacts);
  }), [emitIncrementalImageArtifacts]);

  useEffect(() => {
    if (!hasRunningTask) return undefined;
    const timer = window.setInterval(() => setTaskRevision((revision) => revision + 1), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask]);

  const refreshCanvasOverlayRevision = useCallback(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) {
      if (canvasOverlaySignatureRef.current) {
        canvasOverlaySignatureRef.current = '';
        setCanvasOverlayRevision((revision) => (revision + 1) % 1000000);
      }
      return;
    }
    const generatorElements = excalidrawAPI.getSceneElements()
      .filter((element: any) => isAiImageGeneratorElement(element) && !element.isDeleted);
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState?.selectedElementIds || {};
    const signature = generatorElements.length
      ? [
          appState.scrollX || 0,
          appState.scrollY || 0,
          appState.zoom?.value || 1,
          ...(() => {
            const rect = container.getBoundingClientRect();
            return [rect.left, rect.top, rect.width, rect.height];
          })(),
          ...generatorElements.map((element: any) => [
            element.id,
            element.x,
            element.y,
            element.width,
            element.height,
            element.customData?.title || '',
            selectedIds[element.id] ? 1 : 0,
          ].join(':')),
        ].join('|')
      : 'empty';
    if (signature === canvasOverlaySignatureRef.current) return;
    canvasOverlaySignatureRef.current = signature;
    setCanvasOverlayRevision((revision) => (revision + 1) % 1000000);
  }, [containerRef, excalidrawAPI]);

  const refreshSelection = useCallback(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) {
      setSelectedInfo(null);
      return;
    }
    const hasAiImageGenerator = excalidrawAPI.getSceneElements().some((element: any) => (
      isAiImageGeneratorElement(element) && !element.isDeleted
    ));
    if (hasAiImageGenerator) {
      refreshAiImagePlaceholderFile(excalidrawAPI);
      if (migrateAiImageGeneratorPlaceholders(excalidrawAPI)) {
        onSceneMutated?.();
      }
    }
    const appState = excalidrawAPI.getAppState();
    const selectedIds = Object.keys(appState?.selectedElementIds || {});
    if (selectedIds.length !== 1) {
      selectedGeneratorViewportFitRef.current.elementId = null;
      cancelPendingSelectedGeneratorViewportFit();
      setSelectedInfo(null);
      return;
    }
    const element = excalidrawAPI.getSceneElements().find((item: any) => item.id === selectedIds[0] && !item.isDeleted);
    const kind = isAiImageGeneratorElement(element)
      ? 'generator'
      : isAiImageElement(element)
        ? 'image'
        : null;
    if (!element || !kind) {
      selectedGeneratorViewportFitRef.current.elementId = null;
      cancelPendingSelectedGeneratorViewportFit();
      setSelectedInfo(null);
      return;
    }
    if (kind === 'generator') {
      if (selectedGeneratorViewportFitRef.current.elementId !== element.id) {
        selectedGeneratorViewportFitRef.current.elementId = element.id;
        if (shouldFitElementIntoCanvasViewport({
          element,
          appState,
        })) {
          if (selectedGeneratorViewportFitRef.current.raf) {
            cancelAnimationFrame(selectedGeneratorViewportFitRef.current.raf);
          }
          selectedGeneratorViewportFitRef.current.raf = requestAnimationFrame(() => {
            selectedGeneratorViewportFitRef.current.raf = 0;
            excalidrawAPI.scrollToContent(element.id, {
              fitToContent: true,
              animate: false,
              maxZoom: 1.4,
            });
          });
        }
      }
    } else {
      selectedGeneratorViewportFitRef.current.elementId = null;
      cancelPendingSelectedGeneratorViewportFit();
    }
    const rect = container.getBoundingClientRect();
    const zoom = appState.zoom?.value || 1;
    const topLeft = canvasToScreen(
      element.x,
      element.y,
      appState.scrollX || 0,
      appState.scrollY || 0,
      zoom,
      rect.left,
      rect.top,
    );
    const topRight = canvasToScreen(
      element.x + (element.width || 0),
      element.y,
      appState.scrollX || 0,
      appState.scrollY || 0,
      zoom,
      rect.left,
      rect.top,
    );
    const bottomCenter = canvasToScreen(
      element.x + (element.width || 0) / 2,
      element.y + (element.height || 0),
      appState.scrollX || 0,
      appState.scrollY || 0,
      zoom,
      rect.left,
      rect.top,
    );
    const composerWidth = Math.min(AI_IMAGE_COMPOSER_WIDTH, Math.max(320, rect.width - 32));
    const composerLeft = Math.max(
      16,
      Math.min(rect.width - composerWidth - 16, bottomCenter.x - rect.left - composerWidth / 2),
    );
    setSelectedInfo({
      element,
      kind,
      left: topRight.x - rect.left + 8,
      top: topLeft.y - rect.top,
      composerPlacement: {
        left: composerLeft,
        top: clampComposerTop(
          bottomCenter.y - rect.top + AI_IMAGE_COMPOSER_GAP,
          rect.height,
        ),
        width: composerWidth,
      },
    });
  }, [containerRef, excalidrawAPI, onSceneMutated]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      refreshSelection();
      refreshCanvasOverlayRevision();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      cancelPendingSelectedGeneratorViewportFit();
    };
  }, [cancelPendingSelectedGeneratorViewportFit, refreshCanvasOverlayRevision, refreshSelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (selectedInfo?.kind === 'generator') {
      container.setAttribute('data-axhub-ai-image-generator-selected', 'true');
    } else {
      container.removeAttribute('data-axhub-ai-image-generator-selected');
    }
    return () => {
      container.removeAttribute('data-axhub-ai-image-generator-selected');
    };
  }, [containerRef, selectedInfo?.kind]);

  const ensurePlaceholderFile = useCallback(() => {
    const files = excalidrawAPI.getFiles?.() || {};
    if (!files[AI_IMAGE_PLACEHOLDER_FILE_ID]) {
      refreshAiImagePlaceholderFile(excalidrawAPI);
    }
  }, [excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    const hasAiImageGenerator = excalidrawAPI.getSceneElements().some((element: any) => (
      isAiImageGeneratorElement(element) && !element.isDeleted
    ));
    if (hasAiImageGenerator) {
      refreshAiImagePlaceholderFile(excalidrawAPI);
      if (migrateAiImageGeneratorPlaceholders(excalidrawAPI)) {
        onSceneMutated?.();
      }
    }
  }, [excalidrawAPI, onSceneMutated]);

  const insertGenerator = useCallback((
    point?: { x: number; y: number } | CanvasGeneratorPlacement,
    initialReferenceImages?: string[],
    initialLocalContextRefs?: CanvasLocalContextRef[],
  ) => {
    setPendingInitialReferenceImages(initialReferenceImages || []);
    setPendingInitialLocalContextRefs(initialLocalContextRefs || []);
    ensurePlaceholderFile();
    const appState = excalidrawAPI.getAppState();
    const placement = point
      ? {
          x: point.x,
          y: point.y,
          width: 'width' in point ? point.width : 360,
          height: 'height' in point ? point.height : 260,
          needsScroll: 'needsScroll' in point ? point.needsScroll : false,
        }
      : resolveCanvasGeneratorPlacement({
          elements: excalidrawAPI.getSceneElements(),
          appState,
        });
    const position = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };
    const generator = createAiImageGeneratorElement(position);
    selectedGeneratorViewportFitRef.current.elementId = generator.id;
    setPendingInitialReferenceImagesGeneratorId(initialReferenceImages?.length ? generator.id : null);
    setPendingInitialLocalContextRefsGeneratorId(initialLocalContextRefs?.length ? generator.id : null);
    excalidrawAPI.updateScene({
      elements: [...excalidrawAPI.getSceneElements(), generator],
      appState: {
        selectedElementIds: { [generator.id]: true },
        selectedGroupIds: {},
      },
    });
    if (placement.needsScroll) {
      const currentZoom = appState.zoom?.value || 1;
      requestAnimationFrame(() => {
        excalidrawAPI.scrollToContent(generator.id, {
          fitToContent: true,
          animate: true,
          minZoom: currentZoom,
          maxZoom: currentZoom,
        });
      });
    }
    onSceneMutated?.();
  }, [ensurePlaceholderFile, excalidrawAPI, onSceneMutated]);

  useEffect(() => {
    const handleToolbarInsert = () => insertGenerator();
    document.addEventListener('axhub:insertAiImageGenerator', handleToolbarInsert);
    return () => document.removeEventListener('axhub:insertAiImageGenerator', handleToolbarInsert);
  }, [insertGenerator]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return undefined;
    const handleComposerKeyDown = (event: KeyboardEvent) => {
      if (selectedInfo?.kind !== 'generator') return;
      const composerRoot = container.querySelector('[data-axhub-ai-image-composer]');
      if (!shouldDeleteAiImageGeneratorFromComposerKeydown({
        key: event.key,
        target: event.target,
        composerRoot,
      })) return;
      event.preventDefault();
      event.stopPropagation();
      const elements = excalidrawAPI.getSceneElements().map((element: any) => (
        element.id === selectedInfo.element.id
          ? {
            ...element,
            isDeleted: true,
            version: (element.version || 0) + 1,
            versionNonce: Math.floor(Math.random() * 2147483647),
            updated: Date.now(),
          }
          : element
      ));
      excalidrawAPI.updateScene({
        elements,
        appState: {
          selectedElementIds: {},
          selectedGroupIds: {},
        },
      });
      onSceneMutated?.();
    };
    document.addEventListener('keydown', handleComposerKeyDown, true);
    return () => document.removeEventListener('keydown', handleComposerKeyDown, true);
  }, [containerRef, excalidrawAPI, onSceneMutated, selectedInfo]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return undefined;

    const hasGeneratorDrag = (event: DragEvent) => (
      Array.from(event.dataTransfer?.types || []).includes(AI_IMAGE_GENERATOR_DRAG_MIME)
    );
    const handleDragOver = (event: DragEvent) => {
      if (!hasGeneratorDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = (event: DragEvent) => {
      if (!hasGeneratorDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = container.getBoundingClientRect();
      const point = screenToCanvas(
        event.clientX,
        event.clientY,
        excalidrawAPI.getAppState(),
        rect.left,
        rect.top,
      );
      insertGenerator(point);
    };

    container.addEventListener('dragover', handleDragOver, true);
    container.addEventListener('drop', handleDrop, true);
    return () => {
      container.removeEventListener('dragover', handleDragOver, true);
      container.removeEventListener('drop', handleDrop, true);
    };
  }, [containerRef, excalidrawAPI, insertGenerator]);

  useEffect(() => {
    if (!excalidrawAPI) return undefined;
    const handleCopy = () => {
      copiedCanvasReferenceRef.current = createCanvasReferenceSnapshot({
        elements: excalidrawAPI.getSceneElements(),
        files: excalidrawAPI.getFiles?.() || {},
        appState: excalidrawAPI.getAppState(),
      });
    };
    document.addEventListener('copy', handleCopy, true);
    return () => document.removeEventListener('copy', handleCopy, true);
  }, [excalidrawAPI]);

  const pasteCanvasReferenceImages = useCallback(async () => {
    const snapshot = copiedCanvasReferenceRef.current;
    if (!snapshot) return [];
    const context = await renderCanvasReferenceContext(snapshot);
    const images = context.referenceImages;
    if (selectedInfo?.kind === 'generator') {
      setPendingInitialLocalContextRefs((previous) => {
        const next = [...previous];
        const existingKeys = new Set(next.map((ref) => `${ref.resourceType}:${ref.resourceId}:${ref.paths.join('|')}`));
        for (const ref of context.localContextRefs) {
          const key = `${ref.resourceType}:${ref.resourceId}:${ref.paths.join('|')}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            next.push(ref);
          }
        }
        return next;
      });
      setPendingInitialLocalContextRefsGeneratorId(context.localContextRefs.length ? selectedInfo.element.id : pendingInitialLocalContextRefsGeneratorId);
    }
    if (images.length) {
      toast.info(`已添加 ${images.length} 张画布参考图`);
    }
    if (context.localContextRefs.length) {
      toast.info(`已添加 ${context.localContextRefs.length} 个本地上下文`);
    }
    return context;
  }, [pendingInitialLocalContextRefsGeneratorId, selectedInfo]);

  const handleImageTaskFinished = useCallback((task: AiImageTaskRecord) => {
    emitIncrementalImageArtifacts(task);
  }, [emitIncrementalImageArtifacts]);

  const generatorTitleLabels = useMemo<GeneratorTitleLabel[]>(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return [];
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState?.selectedElementIds || {};
    const rect = container.getBoundingClientRect();
    const zoom = appState.zoom?.value || 1;
    return excalidrawAPI.getSceneElements()
      .filter((element: any) => isAiImageGeneratorElement(element) && !element.isDeleted)
      .map((element: any) => {
        const topLeft = canvasToScreen(
          element.x,
          element.y,
          appState.scrollX || 0,
          appState.scrollY || 0,
          zoom,
          rect.left,
          rect.top,
        );
        const width = Math.max(1, (element.width || 0) * zoom);
        return {
          elementId: element.id,
          title: String(element.customData?.title || 'AI 生成图片'),
          left: topLeft.x - rect.left,
          top: topLeft.y - rect.top - CANVAS_NODE_TITLE_LABEL_HEIGHT - CANVAS_NODE_TITLE_LABEL_OFFSET,
          maxWidth: Math.min(CANVAS_NODE_TITLE_LABEL_MAX_WIDTH, width),
          isSelected: Boolean(selectedIds[element.id]),
        };
      });
  }, [canvasOverlayRevision, containerRef, excalidrawAPI, selectedInfo, taskRevision]);

  const resizeSelectedGeneratorForParams = useCallback((params: AiImageTaskRecord['params']) => {
    if (selectedInfo?.kind !== 'generator') return;
    const size = getAiImageDisplaySize(params.size);
    if (!size) return;
    if (selectedInfo.element.width === size.width && selectedInfo.element.height === size.height) return;
    const elements = excalidrawAPI.getSceneElements().map((element: any) => (
      element.id === selectedInfo.element.id
        ? {
          ...element,
          width: size.width,
          height: size.height,
          version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
          updated: Date.now(),
        }
        : element
    ));
    excalidrawAPI.updateScene({ elements });
    onSceneMutated?.();
  }, [excalidrawAPI, onSceneMutated, selectedInfo]);

  const generatorStatusOverlays = useMemo<GeneratorStatusOverlay[]>(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return [];
    const appState = excalidrawAPI.getAppState();
    const rect = container.getBoundingClientRect();
    const zoom = appState.zoom?.value || 1;
    const generatorElements = excalidrawAPI.getSceneElements()
      .filter((element: any) => isAiImageGeneratorElement(element) && !element.isDeleted);
    pruneStableCanvasGeneratorOverlayBounds(
      stableStatusOverlayBoundsRef.current,
      new Set(generatorElements.map((element: any) => String(element.id || ''))),
    );
    return generatorElements
      .map((element: any) => {
        const task = taskById.get(String(element.customData?.generationTaskId || ''));
        if (!task || task.status === 'done') return null;
        const bounds = resolveStableCanvasGeneratorOverlayBounds(
          element,
          appState,
          stableStatusOverlayBoundsRef.current,
        );
        const topLeft = canvasToScreen(
          bounds.x,
          bounds.y,
          appState.scrollX || 0,
          appState.scrollY || 0,
          zoom,
          rect.left,
          rect.top,
        );
        return {
          elementId: element.id,
          task,
          left: topLeft.x - rect.left,
          top: topLeft.y - rect.top,
          width: Math.max(120, bounds.width * zoom),
          height: Math.max(88, bounds.height * zoom),
        };
      })
      .filter((overlay): overlay is GeneratorStatusOverlay => Boolean(overlay));
  }, [canvasOverlayRevision, containerRef, excalidrawAPI, selectedInfo, taskById, taskRevision]);
  const pendingInitialReferenceImages = useMemo(() => (
    selectedInfo?.kind === 'generator' && selectedInfo.element?.id === pendingInitialReferenceImagesGeneratorId
      ? pendingInitialReferenceImagesState
      : []
  ), [pendingInitialReferenceImagesGeneratorId, pendingInitialReferenceImagesState, selectedInfo]);
  const pendingInitialLocalContextRefs = useMemo(() => (
    selectedInfo?.kind === 'generator' && selectedInfo.element?.id === pendingInitialLocalContextRefsGeneratorId
      ? pendingInitialLocalContextRefsState
      : []
  ), [pendingInitialLocalContextRefsGeneratorId, pendingInitialLocalContextRefsState, selectedInfo]);
  const selectedImageComposerDraftStorageKey = useMemo(() => (
    selectedInfo?.kind === 'generator'
      ? createCanvasGenerationComposerDraftStorageKey([
        assistantProjectPath,
        selectedInfo.element.id,
        'ai-image',
      ])
      : null
  ), [assistantProjectPath, selectedInfo]);

  return (
    <>
      {generatorTitleLabels.map((label) => (
        <CanvasNodeTitleLabel
          key={label.elementId}
          left={label.left}
          top={label.top}
          title={label.title}
          strokeColor={AI_IMAGE_GENERATOR_TITLE_COLOR}
          opacity={label.isSelected ? 1 : 0.55}
          maxWidth={label.maxWidth}
        />
      ))}

      {selectedInfo?.kind === 'generator' ? (
        <AiImageGenerationComposer
          projectId={projectId}
          placement={selectedInfo.composerPlacement}
          canPasteReferenceImages={Boolean(copiedCanvasReferenceRef.current)}
          conversationId={String(selectedInfo.element.customData?.conversationId || '')}
          assistantProjectPath={assistantProjectPath}
          draftStorageKey={selectedImageComposerDraftStorageKey}
          generatorElementId={selectedInfo.element.id}
          initialReferenceImages={pendingInitialReferenceImages}
          initialLocalContextRefs={pendingInitialLocalContextRefs}
          themes={themes}
          preferredPromptClient={preferredPromptClient}
          onPasteReferenceImages={pasteCanvasReferenceImages}
          onParamsChanged={resizeSelectedGeneratorForParams}
          onTaskStarted={(task) => {
            if (selectedInfo?.kind !== 'generator') return;
            const elements = excalidrawAPI.getSceneElements().map((element: any) => (
              element.id === selectedInfo.element.id
                ? {
                  ...element,
                  version: (element.version || 0) + 1,
                  versionNonce: Math.floor(Math.random() * 2147483647),
                  updated: Date.now(),
                  customData: {
                    ...element.customData,
                    generationTaskId: task.id,
                    conversationId: task.conversationId,
                    roundId: task.roundId,
                  },
                }
                : element
            ));
            excalidrawAPI.updateScene({ elements });
            onSceneMutated?.();
          }}
          onTaskFinished={handleImageTaskFinished}
        />
      ) : null}

      {generatorStatusOverlays.map((overlay) => (
        <div
          key={overlay.elementId}
          className={[
            'pointer-events-none absolute z-[25] flex items-center justify-center rounded-md border px-3 text-center shadow-sm backdrop-blur',
            overlay.task.status === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-primary/30 bg-background/85 text-foreground',
          ].join(' ')}
          style={{
            left: overlay.left,
            top: overlay.top,
            width: overlay.width,
            height: overlay.height,
          }}
        >
          <div className="grid max-w-[90%] justify-items-center gap-1 text-xs">
            {overlay.task.status === 'running' ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
            <div className="font-medium">{stageLabel(overlay.task)}</div>
            <div className="text-muted-foreground">{formatElapsed(overlay.task)}</div>
            {overlay.task.error ? (
              <div className="line-clamp-2 text-[11px] leading-4">{overlay.task.error}</div>
            ) : null}
          </div>
        </div>
      ))}

    </>
  );
}
