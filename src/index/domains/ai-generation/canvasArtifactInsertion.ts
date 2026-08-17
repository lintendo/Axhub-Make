import { CANVAS_AI_GENERATION_CUSTOM_TYPE } from './canvasAiGeneration';
import type { GenerationArtifactRecord } from './generationArtifactHistoryStore';
import {
  resolveAiArtifactResourceId,
  resolveAiArtifactResourceKey,
  type AiArtifactClassificationKind,
} from '../../../common/aiArtifactClassification';
import { buildMarkdownFileUrl } from '../../utils/markdownPreview';

export interface ApplyGenerationArtifactsToCanvasElementsOptions {
  projectId: string;
  elements: readonly any[];
  appState: any;
  artifacts: readonly GenerationArtifactRecord[];
  forceInsert?: boolean;
  replaceElementId?: string;
}

export interface ApplyGenerationArtifactsToCanvasElementsResult {
  elements: any[];
  files?: any[];
  insertedElementIds: string[];
  updatedElementIds: string[];
  selectedElementIds: Record<string, true>;
}

const ARTIFACT_WIDTH = 720;
const ARTIFACT_HEIGHT = 480;
const ARTIFACT_GAP = 24;
const PROTOTYPE_CONTENT_SCALE = 0.5;

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/').split(/[?#]/u)[0] || '';
  return normalized.split('/').filter(Boolean).pop() || normalized;
}

function resolveArtifactUrl(artifact: GenerationArtifactRecord): string {
  return stringField(artifact.assetRef?.url)
    || stringField(artifact.target.url)
    || stringField(artifact.target.uri)
    || stringField(artifact.target.href)
    || stringField(artifact.target.path);
}

function isMarkdownPath(value: string): boolean {
  return /\.(?:md|mdx)(?:$|[?#])/iu.test(value);
}

function normalizeLocalMarkdownPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || !isMarkdownPath(normalized)) return '';
  if (normalized.startsWith('?') || normalized.startsWith('/?')) return '';
  if (/^https?:\/\//iu.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocalhost) return '';
      const decodedPath = decodeURIComponent(parsed.pathname || '').replace(/^\/+/u, '');
      return decodedPath && isMarkdownPath(decodedPath) ? decodedPath : '';
    } catch {
      return '';
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized)) return '';
  const pathValue = normalized.replace(/^\/+/u, '');
  if (
    pathValue.startsWith('?')
    || pathValue.startsWith('api/')
    || pathValue.startsWith('spec-template.html?')
  ) {
    return '';
  }
  return pathValue;
}

function resolveEmbedUrl(artifact: GenerationArtifactRecord, url: string, projectId: string): string {
  if (artifact.kind !== 'document') return url;
  const markdownPath = normalizeLocalMarkdownPath(stringField(artifact.target.path))
    || normalizeLocalMarkdownPath(url);
  return markdownPath ? buildMarkdownFileUrl(markdownPath, projectId) : url;
}

function resolveResourceType(artifact: GenerationArtifactRecord): 'doc' | 'prototype' {
  return artifact.kind === 'prototype' ? 'prototype' : 'doc';
}

function resolveResourceId(artifact: GenerationArtifactRecord, url: string): string {
  return resolveAiArtifactResourceId({
    kind: artifact.kind as AiArtifactClassificationKind,
    path: artifact.target.path,
    uri: artifact.target.uri,
    url,
    resourceId: artifact.target.resourceId || artifact.metadata.resourceId,
    artifactId: artifact.target.artifactId,
    targetArtifactId: artifact.target.targetArtifactId,
    name: artifact.metadata.name,
  }) || basename(url || artifact.id);
}

function resolvePreviewKind(artifact: GenerationArtifactRecord): 'doc' | 'web' | 'image' {
  if (artifact.kind === 'image') return 'image';
  if (artifact.kind === 'prototype') return 'web';
  return 'doc';
}

function resolveEmbedViewMode(artifact: GenerationArtifactRecord): 'link' | 'preview' {
  if (artifact.kind === 'prototype' || artifact.kind === 'document') return 'preview';
  return 'link';
}

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function createImageArtifactDataUrl(title: string, url: string): string {
  if (/^data:image\/[a-z0-9+.-]+(?:;[^,]*)?,.+/iu.test(url)) return url;
  const escapedTitle = title.replace(/[<&>"]/gu, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  }[char] || char));
  return encodeSvgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
  <rect width="720" height="480" rx="20" fill="#f8fafc"/>
  <rect x="36" y="36" width="648" height="408" rx="18" fill="#ffffff" stroke="#008F5D" stroke-width="6"/>
  <text x="72" y="126" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#13231d">${escapedTitle}</text>
  <text x="72" y="180" font-family="Arial, sans-serif" font-size="20" fill="#64748b">AI 生成图片产物</text>
</svg>`);
}

function createArtifactImageFile(fileId: string, title: string, url: string) {
  const dataURL = createImageArtifactDataUrl(title, url);
  const mimeMatch = dataURL.match(/^data:([^;,]+)[;,]/u);
  return {
    id: fileId as any,
    mimeType: (mimeMatch?.[1] || 'image/svg+xml') as any,
    dataURL,
    created: Date.now(),
    lastRetrieved: Date.now(),
  };
}

function toCanvasAiArtifact(artifact: GenerationArtifactRecord) {
  return {
    id: artifact.id,
    kind: artifact.kind === 'prototype'
      ? 'prototype'
      : artifact.kind === 'image'
        ? 'image'
        : artifact.kind === 'link'
          ? 'link'
          : artifact.kind === 'document'
            ? 'document'
            : artifact.kind === 'drawio'
              ? 'drawio'
              : 'file',
    operation: artifact.operation,
    source: artifact.source,
    target: artifact.target,
    metadata: artifact.metadata,
  };
}

function resolveArtifactResourceKey(artifact: GenerationArtifactRecord, url: string): string {
  const metadataKey = stringField(artifact.metadata.artifactResourceKey);
  const resolvedKey = resolveAiArtifactResourceKey({
      kind: artifact.kind as AiArtifactClassificationKind,
      path: artifact.target.path,
      uri: artifact.target.uri,
      url,
      resourceId: artifact.target.resourceId || artifact.metadata.resourceId,
      artifactId: artifact.target.artifactId,
      targetArtifactId: artifact.target.targetArtifactId,
      name: artifact.metadata.name,
    });
  return metadataKey.startsWith(`${artifact.kind}:`) ? metadataKey : resolvedKey;
}

function createArtifactElement(artifact: GenerationArtifactRecord, x: number, y: number, projectId: string) {
  const url = resolveArtifactUrl(artifact);
  const embedUrl = resolveEmbedUrl(artifact, url, projectId);
  const resourceType = resolveResourceType(artifact);
  const resourceId = resolveResourceId(artifact, url);
  const title = stringField(artifact.title) || stringField(artifact.metadata.title) || basename(resourceId) || 'AI 生成产物';
  const artifactResourceKey = resolveArtifactResourceKey(artifact, url);
  if (artifact.kind === 'image') {
    const fileId = `image-file-${artifact.id.replace(/[^a-z0-9_-]+/giu, '-').toLowerCase() || Date.now()}`;
    return {
      element: {
        id: randomId('assistant-image'),
        type: 'image' as const,
        x,
        y,
        width: ARTIFACT_WIDTH,
        height: ARTIFACT_HEIGHT,
        angle: 0 as any,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid' as any,
        strokeWidth: 0,
        strokeStyle: 'solid' as any,
        roughness: 0,
        opacity: 100,
        groupIds: [] as readonly string[],
        frameId: null,
        index: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: url || null,
        locked: false,
        fileId,
        status: 'saved',
        scale: [1, 1] as [number, number],
        crop: null,
        customData: {
          projectId,
          title,
          previewUrl: url,
          openUrl: url,
          previewKind: 'image',
          resourceType: 'preview',
          sourceResourceType: resourceType,
          resourceId,
          artifactResourceKey,
          generatedBy: CANVAS_AI_GENERATION_CUSTOM_TYPE,
          sourceArtifactId: artifact.id,
          aiArtifact: toCanvasAiArtifact(artifact),
        },
      },
      files: [createArtifactImageFile(fileId, title, url)],
    };
  }
  if (artifact.kind === 'drawio') {
    const fileId = `drawio-file-${artifact.id.replace(/[^a-z0-9_-]+/giu, '-').toLowerCase() || Date.now()}`;
    return {
      element: {
        id: randomId('assistant-drawio'),
        type: 'image' as const,
        x,
        y,
        width: ARTIFACT_WIDTH,
        height: ARTIFACT_HEIGHT,
        angle: 0 as any,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid' as any,
        strokeWidth: 0,
        strokeStyle: 'solid' as any,
        roughness: 0,
        opacity: 100,
        groupIds: [] as readonly string[],
        frameId: null,
        index: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: url || null,
        locked: false,
        fileId,
        status: 'saved',
        scale: [1, 1] as [number, number],
        crop: null,
        customData: {
          projectId,
          type: 'axhub-drawio',
          title,
          previewUrl: url,
          openUrl: url,
          previewKind: 'drawio',
          resourceType: 'preview',
          sourceResourceType: resourceType,
          resourceId,
          artifactResourceKey,
          generatedBy: CANVAS_AI_GENERATION_CUSTOM_TYPE,
          sourceArtifactId: artifact.id,
          aiArtifact: toCanvasAiArtifact(artifact),
        },
      },
      files: [createArtifactImageFile(fileId, title, url)],
    };
  }
  const previewUrl = embedUrl || (resourceType === 'doc' ? `/?doc=${encodeURIComponent(resourceId)}` : `/prototypes/${encodeURIComponent(resourceId)}`);
  const openUrl = previewUrl;
  const embedViewMode = resolveEmbedViewMode(artifact);
  return {
    id: randomId('assistant-artifact-embed'),
    type: 'embeddable' as const,
    x,
    y,
    width: ARTIFACT_WIDTH,
    height: ARTIFACT_HEIGHT,
    angle: 0 as any,
    strokeColor: '#008F5D',
    backgroundColor: 'transparent',
    fillStyle: 'solid' as any,
    strokeWidth: embedViewMode === 'link' ? 0 : 2,
    strokeStyle: 'solid' as any,
    roughness: 1,
    opacity: 100,
    groupIds: [] as readonly string[],
    frameId: null,
    index: null,
    roundness: { type: 3 as any },
    seed: Math.floor(Math.random() * 2147483647),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: openUrl,
    locked: false,
    customData: {
      projectId,
      ...(resourceType === 'doc' ? { type: 'axhub-doc' } : {}),
      title,
      previewUrl,
      openUrl,
      previewKind: resolvePreviewKind(artifact),
      resourceType: 'preview',
      sourceResourceType: resourceType,
      resourceId,
      artifactResourceKey,
      screenshotUrl: '',
      embedSizePreset: 'free',
      ...(artifact.kind === 'prototype' ? { embedContentScale: PROTOTYPE_CONTENT_SCALE } : {}),
      embedViewMode,
      ...(artifact.kind === 'prototype' ? { captureScreenshotOnMount: true } : {}),
      storedPreviewSize: {
        width: ARTIFACT_WIDTH,
        height: ARTIFACT_HEIGHT,
      },
      previewStrokeColor: '#008F5D',
      generatedBy: CANVAS_AI_GENERATION_CUSTOM_TYPE,
      sourceArtifactId: artifact.id,
      aiArtifact: toCanvasAiArtifact(artifact),
    },
  };
}

function updateArtifactElement(element: any, artifact: GenerationArtifactRecord, projectId: string): any {
  const created = createArtifactElement(artifact, element.x, element.y, projectId);
  const replacement = 'element' in created ? created.element : created;
  const nextCustomData = {
    ...element.customData,
    ...replacement.customData,
  };
  if (artifact.kind !== 'prototype') {
    delete nextCustomData.embedContentScale;
    delete nextCustomData.captureScreenshotOnMount;
  }
  return {
    ...element,
    version: (element.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
    link: replacement.link,
    customData: nextCustomData,
  };
}

function getElementArtifactResourceKey(element: any): string {
  return stringField(element?.customData?.artifactResourceKey);
}

function getViewportAnchor(appState: any): { x: number; y: number } {
  const zoom = Number(appState?.zoom?.value || 1) || 1;
  const width = Number(appState?.width || 1000);
  const height = Number(appState?.height || 700);
  const scrollX = Number(appState?.scrollX || 0);
  const scrollY = Number(appState?.scrollY || 0);
  return {
    x: scrollX * -1 + width / 2 / zoom - ARTIFACT_WIDTH / 2,
    y: scrollY * -1 + height / 2 / zoom - ARTIFACT_HEIGHT / 2,
  };
}

function softDeleteElement(element: any): any {
  return {
    ...element,
    isDeleted: true,
    version: (element.version || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

function intersects(left: any, right: any): boolean {
  if (left?.isDeleted || right?.isDeleted) return false;
  const leftX = Number(left.x || 0);
  const leftY = Number(left.y || 0);
  const rightX = Number(right.x || 0);
  const rightY = Number(right.y || 0);
  const leftWidth = Math.max(1, Number(left.width || ARTIFACT_WIDTH));
  const leftHeight = Math.max(1, Number(left.height || ARTIFACT_HEIGHT));
  const rightWidth = Math.max(1, Number(right.width || ARTIFACT_WIDTH));
  const rightHeight = Math.max(1, Number(right.height || ARTIFACT_HEIGHT));
  return (
    leftX < rightX + rightWidth
    && leftX + leftWidth > rightX
    && leftY < rightY + rightHeight
    && leftY + leftHeight > rightY
  );
}

function findFreePosition(elements: readonly any[], anchor: { x: number; y: number }, index: number): { x: number; y: number } {
  const base = {
    x: anchor.x + index * (ARTIFACT_WIDTH + ARTIFACT_GAP),
    y: anchor.y,
    width: ARTIFACT_WIDTH,
    height: ARTIFACT_HEIGHT,
  };
  for (let row = 0; row < 8; row += 1) {
    const candidate = {
      ...base,
      y: anchor.y + row * (ARTIFACT_HEIGHT + ARTIFACT_GAP),
    };
    if (!elements.some((element) => intersects(candidate, element))) {
      return { x: candidate.x, y: candidate.y };
    }
  }
  return {
    x: base.x,
    y: anchor.y + 8 * (ARTIFACT_HEIGHT + ARTIFACT_GAP),
  };
}

export function applyGenerationArtifactsToCanvasElements(
  options: ApplyGenerationArtifactsToCanvasElementsOptions,
): ApplyGenerationArtifactsToCanvasElementsResult {
  let elements = [...options.elements];
  const files: any[] = [];
  const insertedElementIds: string[] = [];
  const updatedElementIds: string[] = [];
  const selectedElementIds: Record<string, true> = {};
  const anchor = getViewportAnchor(options.appState);
  let insertionIndex = 0;
  let pendingReplacement = stringField(options.replaceElementId);

  for (const artifact of options.artifacts) {
    const artifactResourceKey = resolveArtifactResourceKey(artifact, resolveArtifactUrl(artifact));
    const existing = options.forceInsert
      ? null
      : elements.find((element) => (
        !element?.isDeleted
        && (
          element?.customData?.sourceArtifactId === artifact.id
          || (artifactResourceKey && getElementArtifactResourceKey(element) === artifactResourceKey)
        )
      ));
    if (existing) {
      if (pendingReplacement) {
        elements = elements.map((element) => (
          element?.id === pendingReplacement && !element?.isDeleted ? softDeleteElement(element) : element
        ));
        pendingReplacement = '';
      }
      elements = elements.map((element) => {
        if (element?.id !== existing.id) return element;
        const updated = updateArtifactElement(element, artifact, options.projectId);
        selectedElementIds[updated.id] = true;
        updatedElementIds.push(updated.id);
        return updated;
      });
      continue;
    }

    const replacementElement = pendingReplacement
      ? elements.find((element) => element?.id === pendingReplacement && !element?.isDeleted)
      : null;
    const position = replacementElement
      ? { x: Number(replacementElement.x) || anchor.x, y: Number(replacementElement.y) || anchor.y }
      : findFreePosition(elements, anchor, insertionIndex);
    const created = createArtifactElement(artifact, position.x, position.y, options.projectId);
    const inserted = 'element' in created ? created.element : created;
    if ('files' in created && created.files?.length) files.push(...created.files);
    if (replacementElement) {
      elements = elements.map((element) => (
        element?.id === pendingReplacement ? softDeleteElement(element) : element
      ));
      pendingReplacement = '';
    }
    elements = [...elements, inserted];
    selectedElementIds[inserted.id] = true;
    insertedElementIds.push(inserted.id);
    insertionIndex += 1;
  }

  return {
    elements,
    files,
    insertedElementIds,
    updatedElementIds,
    selectedElementIds,
  };
}
