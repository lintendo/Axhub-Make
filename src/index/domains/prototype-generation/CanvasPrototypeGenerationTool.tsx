import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { ItemData, PromptClientPreference } from '../../types';
import type { CanvasAiSubmitRequest } from '../shared/CanvasGenerationComposer';
import type { ThemeResourceItem } from '../resources/resource.types';
import PrototypeGenerationComposer, { type PrototypeGenerationComposerSettings } from './PrototypeGenerationComposer';
import {
  PROTOTYPE_PLACEHOLDER_FILE_ID,
  createPrototypeGeneratorElement,
  createPrototypeGeneratorPlaceholderFile,
  isPrototypeGeneratorElement,
  replacePrototypeGeneratorWithEmbeddable,
} from './canvasPrototypeGeneration';
import {
  getPrototypeGenerationTaskStore,
  type PrototypeGenerationTaskRecord,
} from './prototypeTaskStore';
import {
  createCanvasReferenceSnapshot,
  renderCanvasReferenceContext,
  type CanvasLocalContextRef,
  type CanvasReferenceSnapshot,
} from '../ai-image/canvasReferenceImages';
import {
  resolveCanvasGeneratorPlacement,
  type CanvasGeneratorPlacement,
} from '../shared/canvasGeneratorPlacement';
import { shouldDeleteCanvasGeneratorFromComposerKeydown } from '../shared/canvasGeneratorComposerKeydown';
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
import { withProjectScope } from '../../services/projectScope';

interface CanvasPrototypeGenerationToolProps {
  projectId: string;
  excalidrawAPI: any;
  containerRef: React.RefObject<HTMLDivElement>;
  canvasFilePath?: string;
  assistantProjectPath?: string;
  preferredPromptClient?: PromptClientPreference;
  prototypes?: ItemData[];
  themes?: ThemeResourceItem[];
  onRefreshPrototypes?: () => Promise<ItemData[]>;
  onSceneMutated?: () => void;
}

interface SelectedPrototypeGeneratorInfo {
  element: any;
  composerPlacement: {
    left: number;
    top: number;
    width: number;
  };
}

interface GeneratorStatusOverlay {
  elementId: string;
  task: PrototypeGenerationTaskRecord;
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

const PROTOTYPE_COMPOSER_WIDTH = 640;
const PROTOTYPE_COMPOSER_GAP = 10;
const PROTOTYPE_COMPOSER_ESTIMATED_HEIGHT = 64;
const PROTOTYPE_COMPOSER_BOTTOM_INSET = 16;
const PROTO_GENERATOR_EVENT_NAME = 'axhub:insertPrototypeGenerator';
const PROTOTYPE_GENERATOR_TITLE_COLOR = '#008F5D';

type InsertPrototypeGeneratorEvent = CustomEvent<{
  referencePlacement?: CanvasGeneratorPlacement;
  referenceImages?: string[];
}>;

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

function clampComposerTop(anchorTop: number, containerHeight: number): number {
  const lowestVisibleTop = Math.max(
    PROTOTYPE_COMPOSER_BOTTOM_INSET,
    containerHeight - PROTOTYPE_COMPOSER_ESTIMATED_HEIGHT - PROTOTYPE_COMPOSER_BOTTOM_INSET,
  );
  return Math.max(
    PROTOTYPE_COMPOSER_BOTTOM_INSET,
    Math.min(anchorTop, lowestVisibleTop),
  );
}

function refreshPrototypePlaceholderFile(excalidrawAPI: any) {
  excalidrawAPI.addFiles([createPrototypeGeneratorPlaceholderFile()]);
}

function migratePrototypeGeneratorPlaceholders(excalidrawAPI: any): boolean {
  let changed = false;
  const elements = excalidrawAPI.getSceneElements().map((element: any) => {
    if (
      !isPrototypeGeneratorElement(element)
      || element.isDeleted
      || element.fileId === PROTOTYPE_PLACEHOLDER_FILE_ID
    ) {
      return element;
    }
    changed = true;
    return {
      ...element,
      fileId: PROTOTYPE_PLACEHOLDER_FILE_ID,
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

function stageLabel(task: PrototypeGenerationTaskRecord): string {
  if (task.status === 'error') return '失败';
  if (task.status === 'done') return task.outputPrototypeName ? `完成 ${task.outputPrototypeName}` : '完成';
  if (task.stage === 'submitting') return '提交中';
  if (task.stage === 'refreshing') return '刷新资源中';
  return '生成中';
}

function formatElapsed(task: PrototypeGenerationTaskRecord): string {
  const elapsed = task.elapsed ?? Math.max(0, Date.now() - task.createdAt);
  const seconds = Math.floor(elapsed / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function normalizePrototypeNames(items: ItemData[] | undefined): Set<string> {
  return new Set((items || []).map((item) => item.name).filter(Boolean));
}

function pickCreatedPrototype(items: ItemData[], beforePrototypeNames: Set<string>): ItemData | null {
  const createdItems = items.filter((item) => item?.name && !beforePrototypeNames.has(item.name));
  return createdItems[createdItems.length - 1] ?? null;
}

function pickPrototypeFromArtifact(items: ItemData[], artifact: any, fallbackNames: Set<string>): ItemData | null {
  if (!artifact || artifact.kind !== 'prototype') return null;
  const target = artifact.target && typeof artifact.target === 'object' ? artifact.target : {};
  const metadata = artifact.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : {};
  const candidates = [
    target.resourceId,
    target.artifactId,
    metadata.resourceId,
    metadata.name,
    metadata.title,
    typeof target.path === 'string' ? target.path.match(/(?:^|\/)prototypes\/([^/]+)/u)?.[1] : '',
    typeof target.targetPath === 'string' ? target.targetPath.match(/^prototypes\/([^/]+)/u)?.[1] : '',
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  for (const candidate of candidates) {
    const matched = items.find((item) => item?.name === candidate || item?.resourceId === candidate);
    if (matched) return matched;
  }
  return pickCreatedPrototype(items, fallbackNames);
}

async function fetchProjectPrototypes(projectId: string): Promise<ItemData[]> {
  const response = await fetch(withProjectScope('/api/entries.json', { projectId }));
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  return Array.isArray(body?.prototypes) ? body.prototypes : [];
}

function providerToPromptClientPreference(provider: string | null | undefined): PromptClientPreference {
  const normalized = String(provider || '').trim().toLowerCase();
  if (
    normalized === 'claude'
    || normalized === 'codex'
    || normalized === 'opencode'
  ) {
    return `acp:${normalized}` as PromptClientPreference;
  }
  return null;
}

export default function CanvasPrototypeGenerationTool({
  projectId,
  excalidrawAPI,
  containerRef,
  canvasFilePath,
  assistantProjectPath,
  preferredPromptClient,
  prototypes,
  themes,
  onRefreshPrototypes,
  onSceneMutated,
}: CanvasPrototypeGenerationToolProps) {
  const [selectedInfo, setSelectedInfo] = useState<SelectedPrototypeGeneratorInfo | null>(null);
  const [pendingInitialReferenceImagesState, setPendingInitialReferenceImages] = useState<string[]>([]);
  const [pendingInitialReferenceImagesGeneratorId, setPendingInitialReferenceImagesGeneratorId] = useState<string | null>(null);
  const [pendingInitialLocalContextRefsState, setPendingInitialLocalContextRefs] = useState<CanvasLocalContextRef[]>([]);
  const [pendingInitialLocalContextRefsGeneratorId, setPendingInitialLocalContextRefsGeneratorId] = useState<string | null>(null);
  const [taskRevision, setTaskRevision] = useState(0);
  const [canvasOverlayRevision, setCanvasOverlayRevision] = useState(0);
  const copiedCanvasReferenceRef = useRef<CanvasReferenceSnapshot | null>(null);
  const tasks = useMemo(() => getPrototypeGenerationTaskStore().getTasks(), [taskRevision]);
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

  useEffect(() => getPrototypeGenerationTaskStore().subscribe(() => setTaskRevision((revision) => revision + 1)), []);

  useEffect(() => {
    void getPrototypeGenerationTaskStore().configure({ projectId, targetPath: canvasFilePath });
  }, [canvasFilePath, projectId]);

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
      .filter((element: any) => isPrototypeGeneratorElement(element) && !element.isDeleted);
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
    const hasGenerator = excalidrawAPI.getSceneElements().some((element: any) => (
      isPrototypeGeneratorElement(element) && !element.isDeleted
    ));
    if (hasGenerator) {
      refreshPrototypePlaceholderFile(excalidrawAPI);
      if (migratePrototypeGeneratorPlaceholders(excalidrawAPI)) {
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
    if (!isPrototypeGeneratorElement(element)) {
      selectedGeneratorViewportFitRef.current.elementId = null;
      cancelPendingSelectedGeneratorViewportFit();
      setSelectedInfo(null);
      return;
    }
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

    const rect = container.getBoundingClientRect();
    const zoom = appState.zoom?.value || 1;
    const bottomCenter = canvasToScreen(
      element.x + (element.width || 0) / 2,
      element.y + (element.height || 0),
      appState.scrollX || 0,
      appState.scrollY || 0,
      zoom,
      rect.left,
      rect.top,
    );
    const composerWidth = Math.min(PROTOTYPE_COMPOSER_WIDTH, Math.max(320, rect.width - 32));
    const composerLeft = Math.max(
      16,
      Math.min(rect.width - composerWidth - 16, bottomCenter.x - rect.left - composerWidth / 2),
    );
    setSelectedInfo({
      element,
      composerPlacement: {
        left: composerLeft,
        top: clampComposerTop(
          bottomCenter.y - rect.top + PROTOTYPE_COMPOSER_GAP,
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
    if (selectedInfo) {
      container.setAttribute('data-axhub-prototype-generator-selected', 'true');
    } else {
      container.removeAttribute('data-axhub-prototype-generator-selected');
    }
    return () => {
      container.removeAttribute('data-axhub-prototype-generator-selected');
    };
  }, [containerRef, selectedInfo]);

  const ensurePlaceholderFile = useCallback(() => {
    const files = excalidrawAPI.getFiles?.() || {};
    if (!files[PROTOTYPE_PLACEHOLDER_FILE_ID]) {
      refreshPrototypePlaceholderFile(excalidrawAPI);
    }
  }, [excalidrawAPI]);

  const insertGenerator = useCallback((
    referenceImages?: string[],
    referencePlacement?: CanvasGeneratorPlacement,
    initialLocalContextRefs?: CanvasLocalContextRef[],
  ) => {
    setPendingInitialReferenceImages(referenceImages || []);
    setPendingInitialLocalContextRefs(initialLocalContextRefs || []);
    ensurePlaceholderFile();
    const appState = excalidrawAPI.getAppState();
    const placement = referencePlacement || resolveCanvasGeneratorPlacement({
      elements: excalidrawAPI.getSceneElements(),
      appState,
    });
    const generator = createPrototypeGeneratorElement({
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
    selectedGeneratorViewportFitRef.current.elementId = generator.id;
    setPendingInitialReferenceImagesGeneratorId(referenceImages?.length ? generator.id : null);
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
    const handleToolbarInsert = (event: InsertPrototypeGeneratorEvent) => {
      const referencePlacement = event.detail?.referencePlacement;
      if (event.detail?.referenceImages?.length) {
        setPendingInitialReferenceImages(event.detail.referenceImages);
        insertGenerator(event.detail.referenceImages, referencePlacement);
        return;
      }
      insertGenerator();
    };
    document.addEventListener('axhub:insertPrototypeGenerator', handleToolbarInsert as EventListener);
    return () => document.removeEventListener('axhub:insertPrototypeGenerator', handleToolbarInsert as EventListener);
  }, [insertGenerator]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return undefined;
    const handleComposerKeyDown = (event: KeyboardEvent) => {
      if (!selectedInfo) return;
      const composerRoot = container.querySelector('[data-axhub-prototype-composer]');
      if (!shouldDeleteCanvasGeneratorFromComposerKeydown({
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

  const refreshProjectPrototypes = useCallback(async () => {
    const refreshedFromHost = await onRefreshPrototypes?.();
    if (Array.isArray(refreshedFromHost)) {
      return refreshedFromHost;
    }
    return fetchProjectPrototypes(projectId);
  }, [onRefreshPrototypes]);

  const replaceGeneratorWithPrototype = useCallback((generatorId: string, prototype: ItemData, task: PrototypeGenerationTaskRecord) => {
    const existing = excalidrawAPI.getSceneElements().some((element: any) => (
      !element.isDeleted
      && element.customData?.generatedBy === 'axhub-prototype-generator'
      && element.customData?.sourceTaskId === task.id
    ));
    if (existing) return;
    const result = replacePrototypeGeneratorWithEmbeddable({
      elements: excalidrawAPI.getSceneElements(),
      generatorId,
      prototype,
      taskId: task.id,
    });
    excalidrawAPI.updateScene({
      elements: result.elements,
      appState: {
        selectedElementIds: result.selectedElementIds,
        selectedGroupIds: {},
      },
    });
    onSceneMutated?.();
  }, [excalidrawAPI, onSceneMutated]);

  const pasteCanvasReferenceImages = useCallback(async () => {
    const snapshot = copiedCanvasReferenceRef.current;
    if (!snapshot) return [];
    const context = await renderCanvasReferenceContext(snapshot);
    const images = context.referenceImages;
    if (selectedInfo?.element) {
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

  const handleSubmitPrompt = useCallback(async (
    request: CanvasAiSubmitRequest<PrototypeGenerationComposerSettings>,
  ) => {
    if (!selectedInfo?.element) {
      return { ok: false, text: '请先选择原型生成占位', error: '请先选择原型生成占位' };
    }

    const settings = request.sceneSettings || { themeName: '' };
    const referenceImages = request.referenceImages;
    const prompt = request.prompt;
    const beforePrototypeNames = normalizePrototypeNames(prototypes);
    const generatorId = selectedInfo.element.id;
    const selectedTheme = (themes || []).find((theme) => theme.name === settings.themeName) || null;
    const selectedPromptClient = providerToPromptClientPreference(request.provider) || preferredPromptClient;
    const task = await getPrototypeGenerationTaskStore().submit({
      prompt,
      preferredPromptClient: selectedPromptClient,
      provider: request.provider,
      model: request.model,
      mode: request.mode,
      thought: request.thought,
      contextBundle: request.contextBundle,
      canvasFilePath,
      canvasName: canvasFilePath,
      generatorElementId: generatorId,
      currentPrototype: null,
      knownPrototypes: prototypes,
      ...(referenceImages.length ? { referenceImages } : {}),
      settings: {
        count: typeof settings.count === 'number' ? settings.count : undefined,
        theme: selectedTheme
          ? { name: selectedTheme.name, displayName: selectedTheme.displayName }
          : null,
      },
    }, {
      onCreated: (createdTask) => {
        const elements = excalidrawAPI.getSceneElements().map((element: any) => (
          element.id === generatorId
            ? {
              ...element,
              version: (element.version || 0) + 1,
              versionNonce: Math.floor(Math.random() * 2147483647),
              updated: Date.now(),
              customData: {
                ...element.customData,
                generationTaskId: createdTask.id,
              },
            }
            : element
        ));
        excalidrawAPI.updateScene({ elements });
        onSceneMutated?.();
      },
      onAgentDone: async (runningTaskRecord) => {
        const refreshedPrototypes = await refreshProjectPrototypes();
        const createdPrototype = pickCreatedPrototype(refreshedPrototypes, beforePrototypeNames);
        if (createdPrototype) {
          replaceGeneratorWithPrototype(generatorId, createdPrototype, runningTaskRecord);
        }
        return createdPrototype;
      },
      onArtifact: async (artifact, runningTaskRecord) => {
        if (artifact.kind !== 'prototype') return;
        const refreshedPrototypes = await refreshProjectPrototypes();
        const prototype = pickPrototypeFromArtifact(refreshedPrototypes, artifact, beforePrototypeNames);
        if (prototype) {
          replaceGeneratorWithPrototype(generatorId, prototype, runningTaskRecord);
        }
      },
    });

    if (task.status === 'done') {
      if (task.outputPrototypeName) {
        toast.success(`原型已生成：${task.outputPrototypeName}`);
        return { ok: true, text: `原型已生成：${task.outputPrototypeName}` };
      }
      return { ok: true, text: task.note || 'AI 生成已完成，但暂未检测到新增原型资源。' };
    }

    toast.error(task.error || '原型生成失败');
    return { ok: false, text: task.error || '原型生成失败', error: task.error || '原型生成失败' };
  }, [
    canvasFilePath,
    excalidrawAPI,
    onSceneMutated,
    preferredPromptClient,
    prototypes,
    refreshProjectPrototypes,
    replaceGeneratorWithPrototype,
    selectedInfo,
    themes,
  ]);

  const generatorTitleLabels = useMemo<GeneratorTitleLabel[]>(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return [];
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState?.selectedElementIds || {};
    const rect = container.getBoundingClientRect();
    const zoom = appState.zoom?.value || 1;
    return excalidrawAPI.getSceneElements()
      .filter((element: any) => isPrototypeGeneratorElement(element) && !element.isDeleted)
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
          title: String(element.customData?.title || 'AI 生成原型'),
          left: topLeft.x - rect.left,
          top: topLeft.y - rect.top - CANVAS_NODE_TITLE_LABEL_HEIGHT - CANVAS_NODE_TITLE_LABEL_OFFSET,
          maxWidth: Math.min(CANVAS_NODE_TITLE_LABEL_MAX_WIDTH, width),
          isSelected: Boolean(selectedIds[element.id]),
        };
      });
  }, [canvasOverlayRevision, containerRef, excalidrawAPI, selectedInfo, taskRevision]);

  const generatorStatusOverlays = useMemo<GeneratorStatusOverlay[]>(() => {
    const container = containerRef.current;
    if (!container || !excalidrawAPI) return [];
    const appState = excalidrawAPI.getAppState();
    const rect = container.getBoundingClientRect();
    const zoom = appState.zoom?.value || 1;
    const generatorElements = excalidrawAPI.getSceneElements()
      .filter((element: any) => isPrototypeGeneratorElement(element) && !element.isDeleted);
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
  }, [canvasOverlayRevision, containerRef, excalidrawAPI, taskById, taskRevision]);
  const pendingInitialReferenceImages = useMemo(() => (
    selectedInfo?.element?.id === pendingInitialReferenceImagesGeneratorId
      ? pendingInitialReferenceImagesState
      : []
  ), [pendingInitialReferenceImagesGeneratorId, pendingInitialReferenceImagesState, selectedInfo]);
  const pendingInitialLocalContextRefs = useMemo(() => (
    selectedInfo?.element?.id === pendingInitialLocalContextRefsGeneratorId
      ? pendingInitialLocalContextRefsState
      : []
  ), [pendingInitialLocalContextRefsGeneratorId, pendingInitialLocalContextRefsState, selectedInfo]);
  const selectedPrototypeComposerDraftStorageKey = useMemo(() => (
    selectedInfo?.element?.id
      ? createCanvasGenerationComposerDraftStorageKey([
        assistantProjectPath,
        canvasFilePath,
        selectedInfo.element.id,
      ])
      : null
  ), [assistantProjectPath, canvasFilePath, selectedInfo]);

  return (
    <>
      {generatorTitleLabels.map((label) => (
        <CanvasNodeTitleLabel
          key={label.elementId}
          left={label.left}
          top={label.top}
          title={label.title}
          strokeColor={PROTOTYPE_GENERATOR_TITLE_COLOR}
          opacity={label.isSelected ? 1 : 0.55}
          maxWidth={label.maxWidth}
        />
      ))}

      {selectedInfo ? (
        <PrototypeGenerationComposer
          projectId={projectId}
          placement={selectedInfo.composerPlacement}
          allowAttachments={true}
          assistantProjectPath={assistantProjectPath}
          canPasteReferenceImages={Boolean(copiedCanvasReferenceRef.current)}
          draftStorageKey={selectedPrototypeComposerDraftStorageKey}
          initialReferenceImages={pendingInitialReferenceImages}
          initialLocalContextRefs={pendingInitialLocalContextRefs}
          onPasteReferenceImages={pasteCanvasReferenceImages}
          preferredPromptClient={preferredPromptClient}
          themes={themes}
          onSubmitPrompt={handleSubmitPrompt}
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
