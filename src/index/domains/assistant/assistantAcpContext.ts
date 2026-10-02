import {
  getAssistantCurrentFilePath,
  normalizeAssistantCurrentFileV1,
} from '../../../common/assistant-context/bridge';
import type { AssistantContextElementV1, AssistantContextV1 } from '../../../common/assistant-context/types';

type AcpContextItemKind = 'file' | 'annotation';
export type AcpPostMessageFilter = 'snapshot' | 'artifacts';

export interface AcpContextFileItem {
  kind: 'file';
  id?: string;
  hidden?: boolean;
  pinned?: boolean;
  path: string;
  name?: string;
  mimeType?: string;
  range?: {
    startLine?: number;
    endLine?: number;
    startColumn?: number;
    endColumn?: number;
  };
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AcpContextAnnotationItem {
  kind: 'annotation';
  id?: string;
  hidden?: boolean;
  pinned?: boolean;
  body: string;
  target:
    | {
      type: 'web-element';
      url?: string;
      selector?: string;
      elementId?: string;
      label?: string;
      rect?: Record<string, unknown>;
    }
    | {
      type: 'canvas-element';
      filePath?: string;
      canvasId?: string;
      elementId?: string;
      elementType?: string;
      label?: string;
      rect?: Record<string, unknown>;
      link?: string;
    }
    | {
      type: 'text';
      filePath?: string;
      quote?: string;
      range?: Record<string, unknown>;
      label?: string;
    };
  title?: string;
  status?: 'open' | 'resolved';
  source?: string;
  metadata?: Record<string, unknown>;
}

export type AcpContextItem = AcpContextFileItem | AcpContextAnnotationItem;

export interface AcpContextBundleV2 {
  version: '2';
  items: AcpContextItem[];
  updatedAt: string;
}

export interface AcpContextPostMessage {
  type: 'acp.context.add' | 'acp.context.replace';
  requestId?: string;
  payload: {
    items: AcpContextItem[];
    messageFilter?: AcpPostMessageFilter;
  };
}

export interface AssistantImageGenerationConfig {
  enabled?: boolean;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  savePathPattern?: string | null;
  saveDirectory?: string | null;
  preservePrompt?: boolean | null;
  lastTest?: unknown;
}

export type AcpRuntimeConfigField = 'builtinTools' | 'builtinToolSettings' | 'mcpServers' | 'commands';

export interface AcpRuntimeConfigurePostMessage {
  type: 'acp.runtime.configure';
  requestId?: string;
  payload: {
    merge?: boolean;
    builtinTools?: string[];
    builtinToolSettings?: Record<string, unknown>;
    mcpServers?: unknown[];
    commands?: unknown[];
  };
}

export interface AcpRuntimeClearPostMessage {
  type: 'acp.runtime.clear';
  requestId?: string;
  payload?: {
    fields?: AcpRuntimeConfigField[];
  };
}

export type AcpImageGenerationPostMessage =
  | AcpRuntimeConfigurePostMessage
  | AcpRuntimeClearPostMessage;

export type AcpCanvasMcpPostMessage =
  | AcpRuntimeConfigurePostMessage
  | AcpRuntimeClearPostMessage;

export type AcpPreviewMcpPostMessage =
  | AcpRuntimeConfigurePostMessage
  | AcpRuntimeClearPostMessage;

export interface AcpThemePostMessage {
  type: 'acp.theme.set';
  requestId?: string;
  payload: {
    theme: 'light' | 'dark';
  };
}

const ACP_IMAGE_GENERATION_TOOL_ID = 'image-generation';
const ACP_IMAGE_GENERATION_RUNTIME_CLEAR_FIELDS: AcpRuntimeConfigField[] = ['builtinTools', 'builtinToolSettings'];
const ACP_PREVIEW_MCP_NAME = 'axhub-preview';
const ACP_PREVIEW_MCP_PATH = '/api/mcp/axhub-preview';
const ACP_PREVIEW_MCP_TOKEN_HEADER = 'x-axhub-preview-mcp-token';
const ACP_PREVIEW_BRIDGE_CLIENT_ID_HEADER = 'x-axhub-preview-bridge-client-id';
const ACP_PREVIEW_VOICE_TOOLS_HEADER = 'x-axhub-preview-voice-tools';
const ACP_CANVAS_MCP_NAME = 'axhub-canvas';
const ACP_CANVAS_MCP_PATH = '/api/mcp/axhub-canvas';
const ACP_CANVAS_MCP_TOKEN_HEADER = 'x-axhub-canvas-mcp-token';
const ACP_MCP_RUNTIME_CLEAR_FIELDS: AcpRuntimeConfigField[] = ['mcpServers'];

export interface AssistantPreviewMcpConfig {
  makeOrigin?: string | null;
  previewToken?: string | null;
  previewBridgeClientId?: string | null;
  /** Restrict Make Commentary voice tools to explicitly opted-in direct runs. */
  voiceTools?: boolean | null;
  includeCanvas?: boolean | null;
  canvasToken?: string | null;
}

export interface AssistantCanvasMcpConfig {
  makeOrigin?: string | null;
  token?: string | null;
}

function normalizeContextPath(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function normalizeOptionalPostMessageString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeImageGenerationBaseUrl(value: unknown): string {
  return normalizeOptionalPostMessageString(value).replace(/\/+$/u, '');
}

function normalizeMakeOrigin(value: unknown): string {
  const normalized = normalizeOptionalPostMessageString(value).replace(/\/+$/u, '');
  if (!normalized) return '';
  try {
    return new URL(normalized).origin;
  } catch {
    return '';
  }
}

function getImageGenerationSecretFingerprint(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `${value.length}:${hash >>> 0}`;
}

function encodeContextIdPart(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, '/');
}

function resolveFileDisplayName(filePath: string, displayName?: string): string {
  const normalizedDisplayName = String(displayName || '').trim();
  const segments = filePath.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || filePath;
  if (normalizedDisplayName && normalizedDisplayName !== fileName) return normalizedDisplayName;
  if (/^index\.[cm]?[tj]sx?$/i.test(fileName) && segments.length > 1) {
    return segments[segments.length - 2] || fileName;
  }
  if (normalizedDisplayName) return normalizedDisplayName;
  return fileName.replace(/\.(?:[cm]?[tj]sx?|mdx?|json|excalidraw)$/i, '');
}

function getContextSource(context: AssistantContextV1): string {
  const source = context.extensions?.source;
  return typeof source === 'string' && source.trim() ? source.trim() : 'axhub-runtime';
}

function buildFileItem(context: AssistantContextV1): AcpContextFileItem | null {
  const currentFile = normalizeAssistantCurrentFileV1(context.currentFile);
  const filePath = normalizeContextPath(currentFile.path);
  if (!filePath) return null;

  return {
    kind: 'file',
    id: `axhub:file:${filePath}`,
    hidden: true,
    pinned: true,
    path: filePath,
    name: resolveFileDisplayName(filePath, currentFile.displayName),
    metadata: {
      source: getContextSource(context),
    },
  };
}

function buildSelectedElementAnnotation(
  item: AssistantContextElementV1,
  context: AssistantContextV1,
  filePath: string,
): AcpContextAnnotationItem | null {
  const selector = String(item?.selector || '').trim();
  const label = String(item?.label || '').trim();
  const tag = String(item?.tag || '').trim();
  const elementId = String((item as unknown as Record<string, unknown>)?.elementId || '').trim();
  if (!selector || !label) return null;

  return {
    kind: 'annotation',
    id: `axhub:selected-element:${filePath}:${encodeContextIdPart(selector)}`,
    body: label,
    target: {
      type: 'web-element',
      selector,
      ...(elementId ? { elementId } : {}),
      label,
    },
    ...(tag ? { title: tag } : {}),
    source: getContextSource(context),
    metadata: {
      filePath,
      selector,
      ...(elementId ? { elementId } : {}),
      ...(tag ? { tag } : {}),
    },
  };
}

function buildCanvasCommentAnnotation(comment: any, context: AssistantContextV1): AcpContextAnnotationItem | null {
  const target = comment?.target || {};
  const elementId = String(target.elementId || '').trim();
  const filePath = normalizeContextPath(target.filePath);
  const elementType = String(target.elementType || 'unknown').trim() || 'unknown';
  const preview = String(comment?.preview || '').trim();
  const body = String(comment?.body || '').trim() || preview || elementType || elementId;
  if (!body || !elementId) return null;

  return {
    kind: 'annotation',
    id: String(comment?.id || `axhub:canvas-annotation:${elementId}`),
    body,
    target: {
      type: 'canvas-element',
      ...(filePath ? { filePath } : {}),
      elementId,
      elementType,
      ...(preview ? { label: preview } : {}),
      ...(String(target.link || '').trim() ? { link: String(target.link).trim() } : {}),
    },
    ...(preview ? { title: preview } : {}),
    source: getContextSource(context),
    metadata: {
      ...(filePath ? { filePath } : {}),
      elementId,
      elementType,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getAcpContextItemKey(item: AcpContextItem): string {
  if (item.id) return `${item.kind}:${item.id}`;
  if (item.kind === 'file') return `file:${item.path}`;
  return `annotation:${item.body}:${JSON.stringify(item.target)}`;
}

function appendAcpContextItem(items: AcpContextItem[], seenKeys: Set<string>, item: AcpContextItem | null | undefined) {
  if (!item) return;
  const key = getAcpContextItemKey(item);
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  items.push(item);
}

function normalizeEmbeddedAcpContextItem(value: unknown): AcpContextItem | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'file') {
    const path = normalizeContextPath(value.path);
    if (!path) return null;
    const id = normalizeOptionalPostMessageString(value.id);
    const name = normalizeOptionalPostMessageString(value.name);
    const mimeType = normalizeOptionalPostMessageString(value.mimeType);
    return {
      kind: 'file',
      ...(id ? { id } : {}),
      ...(typeof value.hidden === 'boolean' ? { hidden: value.hidden } : {}),
      ...(typeof value.pinned === 'boolean' ? { pinned: value.pinned } : {}),
      path,
      ...(name ? { name } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
    };
  }
  if (value.kind === 'annotation') {
    const body = normalizeOptionalPostMessageString(value.body);
    if (!body || !isRecord(value.target)) return null;
    const id = normalizeOptionalPostMessageString(value.id);
    const title = normalizeOptionalPostMessageString(value.title);
    const source = normalizeOptionalPostMessageString(value.source);
    return {
      kind: 'annotation',
      ...(id ? { id } : {}),
      ...(typeof value.hidden === 'boolean' ? { hidden: value.hidden } : {}),
      ...(typeof value.pinned === 'boolean' ? { pinned: value.pinned } : {}),
      body,
      target: value.target as AcpContextAnnotationItem['target'],
      ...(title ? { title } : {}),
      ...(value.status === 'open' || value.status === 'resolved' ? { status: value.status } : {}),
      ...(source ? { source } : {}),
      ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
    };
  }
  return null;
}

function getCanvasGenerationExtension(context: AssistantContextV1): Record<string, unknown> | null {
  const extension = context.extensions?.canvasAiGeneration;
  return isRecord(extension) ? extension : null;
}

function getCanvasGenerationEmbeddedContextItems(context: AssistantContextV1): AcpContextItem[] {
  const extension = getCanvasGenerationExtension(context);
  const bundle = isRecord(extension?.contextBundle) ? extension.contextBundle : null;
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  return items.flatMap((item) => {
    const normalized = normalizeEmbeddedAcpContextItem(item);
    return normalized ? [normalized] : [];
  });
}

function getCanvasLocalContextRefFileItems(context: AssistantContextV1): AcpContextFileItem[] {
  const extension = getCanvasGenerationExtension(context);
  const refs = Array.isArray(extension?.localContextRefs) ? extension.localContextRefs : [];
  const items: AcpContextFileItem[] = [];
  for (const ref of refs) {
    if (!isRecord(ref)) continue;
    const resourceType = normalizeOptionalPostMessageString(ref.resourceType);
    const resourceId = normalizeOptionalPostMessageString(ref.resourceId);
    if (!resourceType || !resourceId) continue;
    const paths = Array.isArray(ref.paths)
      ? ref.paths.map(normalizeContextPath).filter(Boolean)
      : [];
    const name = normalizeOptionalPostMessageString(ref.title) || resolveFileDisplayName(paths[0] || resourceId);
    const description = normalizeOptionalPostMessageString(ref.description);
    for (const path of Array.from(new Set(paths))) {
      items.push({
        kind: 'file',
        id: `axhub:canvas-local-context:${resourceType}:${resourceId}:${path}`,
        path,
        name,
        ...(description ? { description } : {}),
        metadata: {
          source: 'axhub-make-canvas',
          resourceType,
          resourceId,
        },
      });
    }
  }
  return items;
}

export function mapAssistantContextToAcpContextBundle(
  context: AssistantContextV1,
  now: Date = new Date(),
): AcpContextBundleV2 {
  const items: AcpContextItem[] = [];
  const seenKeys = new Set<string>();
  const fileItem = buildFileItem(context);
  const filePath = fileItem?.path || getAssistantCurrentFilePath(context.currentFile);
  if (fileItem) {
    appendAcpContextItem(items, seenKeys, fileItem);
  }

  for (const selectedElement of Array.isArray(context.selectedElements) ? context.selectedElements : []) {
    const annotation = buildSelectedElementAnnotation(selectedElement, context, filePath);
    appendAcpContextItem(items, seenKeys, annotation);
  }

  const comments = Array.isArray(context.extensions?.comments) ? context.extensions.comments : [];
  for (const comment of comments) {
    const annotation = buildCanvasCommentAnnotation(comment, context);
    appendAcpContextItem(items, seenKeys, annotation);
  }

  for (const item of getCanvasGenerationEmbeddedContextItems(context)) {
    appendAcpContextItem(items, seenKeys, item);
  }

  for (const item of getCanvasLocalContextRefFileItems(context)) {
    appendAcpContextItem(items, seenKeys, item);
  }

  return {
    version: '2',
    items,
    updatedAt: now.toISOString(),
  };
}

export function buildAcpContextPostMessage(
  context: AssistantContextV1,
  mode: 'replace' | 'append' = 'replace',
  requestId?: string,
  now: Date = new Date(),
  messageFilter: AcpPostMessageFilter = 'snapshot',
): AcpContextPostMessage {
  const bundle = mapAssistantContextToAcpContextBundle(context, now);
  return {
    type: mode === 'append' ? 'acp.context.add' : 'acp.context.replace',
    ...(requestId ? { requestId } : {}),
    payload: {
      items: bundle.items,
      messageFilter,
    },
  };
}

export function buildAcpContextItemsPostMessage(
  items: AcpContextItem[],
  mode: 'replace' | 'append' = 'append',
  requestId?: string,
  messageFilter: AcpPostMessageFilter = 'snapshot',
): AcpContextPostMessage {
  return {
    type: mode === 'append' ? 'acp.context.add' : 'acp.context.replace',
    ...(requestId ? { requestId } : {}),
    payload: {
      items: Array.isArray(items) ? items : [],
      messageFilter,
    },
  };
}

export function buildAcpThemePostMessage(
  isDarkMode: boolean,
  requestId?: string,
): AcpThemePostMessage {
  return {
    type: 'acp.theme.set',
    ...(requestId ? { requestId } : {}),
    payload: {
      theme: isDarkMode ? 'dark' : 'light',
    },
  };
}

export function buildAcpImageGenerationPostMessage(
  config: AssistantImageGenerationConfig | null | undefined,
  requestId?: string,
): AcpImageGenerationPostMessage {
  const baseUrl = normalizeImageGenerationBaseUrl(config?.baseUrl);
  const apiKey = normalizeOptionalPostMessageString(config?.apiKey);
  const model = normalizeOptionalPostMessageString(config?.model);
  if (!baseUrl || !apiKey || !model) {
    return {
      type: 'acp.runtime.clear',
      ...(requestId ? { requestId } : {}),
      payload: {
        fields: ACP_IMAGE_GENERATION_RUNTIME_CLEAR_FIELDS,
      },
    };
  }

  const savePathPattern = normalizeOptionalPostMessageString(config?.savePathPattern);
  const saveDirectory = normalizeOptionalPostMessageString(config?.saveDirectory);
  const imageGenerationSettings = {
    ...(typeof config?.enabled === 'boolean' ? { enabled: config.enabled } : {}),
    baseUrl,
    apiKey,
    model,
    ...(savePathPattern ? { savePathPattern } : {}),
    ...(saveDirectory ? { saveDirectory } : {}),
    ...(typeof config?.preservePrompt === 'boolean' ? { preservePrompt: config.preservePrompt } : {}),
  };

  return {
    type: 'acp.runtime.configure',
    ...(requestId ? { requestId } : {}),
    payload: {
      merge: true,
      builtinTools: [ACP_IMAGE_GENERATION_TOOL_ID],
      builtinToolSettings: {
        [ACP_IMAGE_GENERATION_TOOL_ID]: imageGenerationSettings,
      },
    },
  };
}

export function getAcpImageGenerationConfigSignature(
  config: AssistantImageGenerationConfig | null | undefined,
): string {
  const baseUrl = normalizeImageGenerationBaseUrl(config?.baseUrl);
  const apiKey = normalizeOptionalPostMessageString(config?.apiKey);
  const model = normalizeOptionalPostMessageString(config?.model);
  if (!baseUrl || !apiKey || !model) {
    return JSON.stringify({
      type: 'acp.runtime.clear',
      payload: {
        fields: ACP_IMAGE_GENERATION_RUNTIME_CLEAR_FIELDS,
      },
    });
  }

  const savePathPattern = normalizeOptionalPostMessageString(config?.savePathPattern);
  const saveDirectory = normalizeOptionalPostMessageString(config?.saveDirectory);
  const imageGenerationSettings = {
    ...(typeof config?.enabled === 'boolean' ? { enabled: config.enabled } : {}),
    baseUrl,
    apiKeyFingerprint: getImageGenerationSecretFingerprint(apiKey),
    model,
    ...(savePathPattern ? { savePathPattern } : {}),
    ...(saveDirectory ? { saveDirectory } : {}),
    ...(typeof config?.preservePrompt === 'boolean' ? { preservePrompt: config.preservePrompt } : {}),
  };

  return JSON.stringify({
    type: 'acp.runtime.configure',
    payload: {
      merge: true,
      builtinTools: [ACP_IMAGE_GENERATION_TOOL_ID],
      builtinToolSettings: {
        [ACP_IMAGE_GENERATION_TOOL_ID]: imageGenerationSettings,
      },
    },
  });
}

export function buildAcpPreviewMcpServers(config: AssistantPreviewMcpConfig | null | undefined, redactSecrets = false): unknown[] | null {
  const makeOrigin = normalizeMakeOrigin(config?.makeOrigin);
  const previewToken = normalizeOptionalPostMessageString(config?.previewToken);
  if (!makeOrigin || !previewToken) {
    return null;
  }
  const previewBridgeClientId = normalizeOptionalPostMessageString(config?.previewBridgeClientId);
  const previewHeaders: unknown[] = [{
    name: ACP_PREVIEW_MCP_TOKEN_HEADER,
    ...(redactSecrets ? { hasValue: true } : { value: previewToken }),
  }];
  if (previewBridgeClientId) {
    previewHeaders.push({
      name: ACP_PREVIEW_BRIDGE_CLIENT_ID_HEADER,
      value: previewBridgeClientId,
    });
  }
  if (config?.voiceTools === true) {
    previewHeaders.push({
      name: ACP_PREVIEW_VOICE_TOOLS_HEADER,
      value: '1',
    });
  }

  const servers: unknown[] = [{
    name: ACP_PREVIEW_MCP_NAME,
    type: 'http',
    url: `${makeOrigin}${ACP_PREVIEW_MCP_PATH}`,
    headers: previewHeaders,
  }];

  const canvasToken = normalizeOptionalPostMessageString(config?.canvasToken);
  if (config?.includeCanvas === true && canvasToken) {
    const canvasServers = buildAcpCanvasMcpServers({
      makeOrigin,
      token: canvasToken,
    }, redactSecrets);
    if (canvasServers) {
      servers.push(...canvasServers);
    }
  }

  return servers;
}

export function buildAcpCanvasMcpServers(
  config: AssistantCanvasMcpConfig | null | undefined,
  redactSecrets = false,
): unknown[] | null {
  const makeOrigin = normalizeMakeOrigin(config?.makeOrigin);
  const token = normalizeOptionalPostMessageString(config?.token);
  if (!makeOrigin || !token) {
    return null;
  }

  return [{
    name: ACP_CANVAS_MCP_NAME,
    type: 'http',
    url: `${makeOrigin}${ACP_CANVAS_MCP_PATH}`,
    headers: [{
      name: ACP_CANVAS_MCP_TOKEN_HEADER,
      ...(redactSecrets ? { hasValue: true } : { value: token }),
    }],
  }];
}

export function buildAcpPreviewMcpPostMessage(
  config: AssistantPreviewMcpConfig | null | undefined,
  requestId?: string,
): AcpPreviewMcpPostMessage {
  const mcpServers = buildAcpPreviewMcpServers(config, false);
  if (!mcpServers) {
    return {
      type: 'acp.runtime.clear',
      ...(requestId ? { requestId } : {}),
      payload: {
        fields: ACP_MCP_RUNTIME_CLEAR_FIELDS,
      },
    };
  }

  return {
    type: 'acp.runtime.configure',
    ...(requestId ? { requestId } : {}),
    payload: {
      merge: false,
      mcpServers,
    },
  };
}

export function getAcpPreviewMcpConfigSignature(
  config: AssistantPreviewMcpConfig | null | undefined,
): string {
  const mcpServers = buildAcpPreviewMcpServers(config, true);
  if (!mcpServers) {
    return JSON.stringify({
      type: 'acp.runtime.clear',
      payload: {
        fields: ACP_MCP_RUNTIME_CLEAR_FIELDS,
      },
    });
  }

  return JSON.stringify({
    type: 'acp.runtime.configure',
    payload: {
      merge: false,
      mcpServers,
    },
  });
}

export function buildAcpCanvasMcpPostMessage(
  config: AssistantCanvasMcpConfig | null | undefined,
  requestId?: string,
): AcpCanvasMcpPostMessage {
  const mcpServers = buildAcpCanvasMcpServers(config, false);
  if (!mcpServers) {
    return {
      type: 'acp.runtime.clear',
      ...(requestId ? { requestId } : {}),
      payload: {
        fields: ACP_MCP_RUNTIME_CLEAR_FIELDS,
      },
    };
  }

  return {
    type: 'acp.runtime.configure',
    ...(requestId ? { requestId } : {}),
    payload: {
      merge: true,
      mcpServers,
    },
  };
}

export function getAcpCanvasMcpConfigSignature(
  config: AssistantCanvasMcpConfig | null | undefined,
): string {
  const mcpServers = buildAcpCanvasMcpServers(config, true);
  if (!mcpServers) {
    return JSON.stringify({
      type: 'acp.runtime.clear',
      payload: {
        fields: ACP_MCP_RUNTIME_CLEAR_FIELDS,
      },
    });
  }

  return JSON.stringify({
    type: 'acp.runtime.configure',
    payload: {
      merge: true,
      mcpServers,
    },
  });
}

export function getAcpContextPostMessageKinds(): AcpContextItemKind[] {
  return ['file', 'annotation'];
}
