import type { ContextBundleV2 } from '@axhub/acp/runtime';
import type { PromptClientPreference } from '../../types';
import type { CanvasLocalContextRef } from './canvasReferenceImages';
import { getGenerationArtifactHistoryStore } from '../ai-generation/generationArtifactHistoryStore';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';

export type AiImageTaskStatus = 'running' | 'done' | 'error';
export type AiImageTaskStage =
  | 'submitting'
  | 'preparing-context'
  | 'generating-prompt'
  | 'generating'
  | 'downloading'
  | 'done'
  | 'error';
export type AiImageQuality = 'auto' | 'low' | 'medium' | 'high';
export type AiImageOutputFormat = 'png' | 'jpeg' | 'webp';
export type AiImageModeration = 'auto' | 'low';
export type AiImageBackground = 'auto' | 'transparent';

export interface AiImageTaskParams {
  size: string;
  quality: AiImageQuality;
  output_format: AiImageOutputFormat;
  output_compression: number | null;
  moderation: AiImageModeration;
  background?: AiImageBackground;
  n: number;
  themeName?: string;
  disable_prompt_optimization?: boolean;
}

export interface AiImageGenerateRequest {
  prompt: string;
  params: AiImageTaskParams;
  referenceImages?: string[];
  referenceAssetRefs?: AiImageReferenceAssetRef[];
  conversationId?: string;
  roundId?: string;
  referenceAssetIds?: string[];
  sourcePrompt?: string;
  localContextRefs?: CanvasLocalContextRef[];
  preferredPromptClient?: PromptClientPreference;
  generatorElementId?: string;
  contextBundle?: ContextBundleV2 | null;
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  thought?: string | null;
}

export interface AiImageReferenceAssetRef {
  id: string;
  assetPath: string;
  hash?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  createdAt?: number;
}

export interface AiImageTaskRecord {
  id: string;
  prompt: string;
  params: AiImageTaskParams;
  status: AiImageTaskStatus;
  stage: AiImageTaskStage;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  elapsed: number | null;
  outputImages: string[];
  actualParams?: Partial<AiImageTaskParams>;
  actualParamsByImage?: Record<string, Partial<AiImageTaskParams>>;
  revisedPromptByImage?: Record<string, string>;
  rawImageUrls?: string[];
  rawResponsePayload?: string;
  conversationId?: string;
  roundId?: string;
  interrupted?: boolean;
  referenceAssetRefs?: AiImageReferenceAssetRef[];
  referenceImages?: string[];
  sourcePrompt?: string;
  localContextRefs?: CanvasLocalContextRef[];
  generatorElementId?: string;
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  thought?: string | null;
}

export interface AiImageStoredImage {
  id: string;
  dataUrl: string;
  assetPath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  savedPath?: string;
  width?: number;
  height?: number;
  createdAt: number;
  source: 'generated';
}

export interface AiImageStoreState {
  tasks: AiImageTaskRecord[];
  images: Record<string, AiImageStoredImage>;
  imageConversations?: Record<string, unknown>[];
}

export interface AiImageTaskStore {
  getState(): AiImageStoreState;
  getTasks(): AiImageTaskRecord[];
  getImage(id: string): AiImageStoredImage | undefined;
  configure(options: { projectId: string; targetPath?: string | null }): Promise<void>;
  subscribe(listener: (state: AiImageStoreState) => void): () => void;
  load(): Promise<void>;
  submit(request: AiImageGenerateRequest, options?: {
    onCreated?: (task: AiImageTaskRecord) => void;
  }): Promise<AiImageTaskRecord>;
  deleteTask(taskId: string): void;
}

interface AiImageTaskStoreOptions {
  now?: () => number;
  storage?: Storage | null;
}

interface AssistantRuntimeInfo {
  apiBaseUrl: string;
  projectPath: string;
}

const HISTORY_LIMIT = 30;

function createTaskId(): string {
  return `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createConversationId(): string {
  return `ai-conversation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createRoundId(): string {
  return `ai-round-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function sha256(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

function parseImageSize(dataUrl: string): Promise<{ width?: number; height?: number }> {
  if (typeof Image === 'undefined') {
    return Promise.resolve({});
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined });
    image.onerror = () => resolve({});
    image.src = dataUrl;
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberField(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeImageMetadata(value: unknown): Partial<AiImageStoredImage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  return {
    ...(stringField(source.fileName) ? { fileName: stringField(source.fileName) } : {}),
    ...(stringField(source.mimeType) ? { mimeType: stringField(source.mimeType) } : {}),
    ...(numberField(source.sizeBytes) != null ? { sizeBytes: numberField(source.sizeBytes) } : {}),
    ...(stringField(source.savedPath) ? { savedPath: stringField(source.savedPath) } : {}),
    ...(numberField(source.width) != null ? { width: numberField(source.width) } : {}),
    ...(numberField(source.height) != null ? { height: numberField(source.height) } : {}),
  };
}

function normalizeLoadedState(value: unknown, options: { interruptRunning?: boolean } = {}): AiImageStoreState {
  if (!value || typeof value !== 'object') {
    return { tasks: [], images: {}, imageConversations: [] };
  }
  const data = value as Partial<AiImageStoreState>;
  const tasks = Array.isArray(data.tasks)
    ? data.tasks
        .filter((task): task is AiImageTaskRecord => Boolean(task?.id))
        .map((task) => {
          const { rawResponsePayload: _rawResponsePayload, ...safeTask } = task;
          if (options.interruptRunning === true && safeTask.status === 'running') {
            return {
              ...safeTask,
              status: 'error',
              stage: 'error',
              interrupted: true,
              error: '请求中断，可重新生成',
            } as AiImageTaskRecord;
          }
          return safeTask as AiImageTaskRecord;
        })
    : [];
  return {
    tasks,
    images: data.images && typeof data.images === 'object' ? data.images : {},
    imageConversations: Array.isArray(data.imageConversations) ? data.imageConversations : [],
  };
}

function normalizeTargetPath(value: string | null | undefined): string | undefined {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/u, '');
  if (normalized.startsWith('src/resources/') && normalized.endsWith('.excalidraw')) {
    const relativePath = normalized.slice('src/resources/'.length);
    const segments = relativePath.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
      return undefined;
    }
    return normalized;
  }
  const prototypeMatch = normalized.match(/^prototypes\/([^/]+)$/u);
  if (!prototypeMatch?.[1] || prototypeMatch[1].startsWith('.') || prototypeMatch[1].includes('..')) {
    return undefined;
  }
  return `prototypes/${prototypeMatch[1]}`;
}

function generationTasksEndpoint(projectId: string, value: string): string {
  return withProjectScope(
    `/api/ai/generation-tasks?targetPath=${encodeURIComponent(value)}`,
    { projectId },
  );
}

function generationArtifactsEndpoint(projectId: string, value: string): string {
  return withProjectScope(
    `/api/ai/artifact-history?targetPath=${encodeURIComponent(value)}`,
    { projectId },
  );
}

function createScopeKey(projectId: string | undefined, targetPath: string | undefined): string {
  return projectId ? `${projectId}:${targetPath || ''}` : '';
}

function resolvePromptGenerationProvider(preferredPromptClient?: PromptClientPreference): string {
  const normalized = String(preferredPromptClient || '').trim().toLowerCase();
  if (!normalized) return 'codex';
  if (normalized === 'openai' || normalized === 'acp:codex') return 'codex';
  if (normalized === 'claudecode' || normalized === 'acp:claude') return 'claude';
  if (normalized === 'gemini' || normalized === 'acp:gemini') return 'codex';
  if (normalized === 'acp:opencode') return 'opencode';
  return normalized.startsWith('local:') ? 'codex' : normalized;
}

function normalizeLocalContextRefs(value: unknown): CanvasLocalContextRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CanvasLocalContextRef[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const resourceType = source.resourceType === 'prototype' || source.resourceType === 'theme'
      ? source.resourceType
      : null;
    const resourceId = typeof source.resourceId === 'string' ? source.resourceId.trim() : '';
    if (!resourceType || !/^[a-z0-9_-]+$/iu.test(resourceId)) return [];
    const paths = Array.isArray(source.paths)
      ? source.paths
          .filter((path): path is string => typeof path === 'string')
          .map((path) => path.trim().replace(/\\/g, '/').replace(/^\/+/u, ''))
          .filter((path) => {
            if (!path || path.includes('..') || path.includes('\0') || path.startsWith('/')) return false;
            return resourceType === 'prototype'
              ? new RegExp(`^src/prototypes/${resourceId}/index\\.tsx?$`, 'iu').test(path)
              : new RegExp(`^src/themes/${resourceId}/(?:DESIGN\\.md|index\\.tsx?)$`, 'iu').test(path);
          })
      : [];
    if (!paths.length) return [];
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    const description = typeof source.description === 'string' ? source.description.trim() : '';
    return [{
      resourceType,
      resourceId,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      paths: Array.from(new Set(paths)),
    }];
  });
}

function buildCanvasAiImagePromptGenerationPrompt(params: {
  sourcePrompt: string;
  localContextRefs: CanvasLocalContextRef[];
  referenceImageCount: number;
}): string {
  const refsText = params.localContextRefs.map((ref, index) => [
    `${index + 1}. ${ref.resourceType} ${ref.resourceId}`,
    ref.title ? `标题：${ref.title}` : '',
    ref.description ? `说明：${ref.description}` : '',
    `文件路径：${ref.paths.join(', ')}`,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    '你正在为画布 AI 生图生成最终提示词。',
    '',
    '请根据用户原始需求和本地上下文文件路径，输出可以直接提交给图片生成接口的最终生图提示词。',
    '要求：只输出最终提示词，不要输出解释、标题、Markdown 代码块或文件内容。',
    '你可以在项目根目录内读取下列文件路径理解上下文；路径可能包含兼容候选文件，使用实际存在的文件。',
    '',
    `用户原始需求：${params.sourcePrompt}`,
    '',
    `已有参考图数量：${params.referenceImageCount}`,
    '',
    '本地上下文：',
    refsText,
  ].join('\n');
}

function buildAcpChatUrl(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.trim().replace(/\/+$/u, '');
  if (!normalized) {
    throw new Error('ACP API base URL 为空');
  }
  return normalized.endsWith('/chat') ? normalized : `${normalized}/chat`;
}

function createImagePromptThreadId(): string {
  return `image-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getChunkText(chunk: Record<string, unknown>, key: string): string {
  return typeof chunk[key] === 'string' ? chunk[key] as string : '';
}

function parseAcpSseEvent(rawEvent: string): Record<string, unknown>[] {
  const dataLines = rawEvent
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  if (!dataLines.length) return [];
  const data = dataLines.join('\n').trim();
  if (!data || data === '[DONE]') return [];
  const parsed = JSON.parse(data);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? [parsed as Record<string, unknown>]
    : [];
}

function parseAiRunSseEvent(rawEvent: string): Array<{ event: string; data: Record<string, unknown> }> {
  const lines = rawEvent
    .split(/\r?\n/u)
    .map((line) => line.trimEnd());
  const event = lines
    .find((line) => line.startsWith('event:'))
    ?.slice('event:'.length)
    .trim() || 'message';
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());
  if (!dataLines.length) return [];
  const dataText = dataLines.join('\n').trim();
  if (!dataText || dataText === '[DONE]') return [];
  const data = JSON.parse(dataText);
  return data && typeof data === 'object' && !Array.isArray(data)
    ? [{ event, data: data as Record<string, unknown> }]
    : [];
}

async function readAiRunSseEvents(
  response: Response,
  onEvent: (event: { event: string; data: Record<string, unknown> }) => Promise<void> | void,
): Promise<void> {
  if (!response.body) {
    throw new Error('AI run response body 不可读取');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consume = async (flush = false) => {
    for (;;) {
      const match = /\r?\n\r?\n/u.exec(buffer);
      if (!match || match.index === undefined) break;
      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      for (const event of parseAiRunSseEvent(rawEvent)) {
        await onEvent(event);
      }
    }
    if (flush && buffer.trim()) {
      const rawEvent = buffer;
      buffer = '';
      for (const event of parseAiRunSseEvent(rawEvent)) {
        await onEvent(event);
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    await consume();
  }
  buffer += decoder.decode();
  await consume(true);
}

async function readAcpChatText(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('ACP chat response body 不可读取');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  const consumeBuffer = (flush = false) => {
    for (;;) {
      const match = /\r?\n\r?\n/u.exec(buffer);
      if (!match || match.index === undefined) break;
      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      for (const chunk of parseAcpSseEvent(rawEvent)) {
        if (chunk.type === 'text-delta') {
          output += getChunkText(chunk, 'delta');
        } else if (chunk.type === 'error') {
          throw new Error(getChunkText(chunk, 'errorText') || getChunkText(chunk, 'message') || 'ACP chat stream failed');
        } else if (chunk.type === 'tool-output-error') {
          throw new Error(getChunkText(chunk, 'errorText') || getChunkText(chunk, 'message') || 'ACP tool output failed');
        }
      }
    }
    if (flush && buffer.trim()) {
      const rawEvent = buffer;
      buffer = '';
      for (const chunk of parseAcpSseEvent(rawEvent)) {
        if (chunk.type === 'text-delta') {
          output += getChunkText(chunk, 'delta');
        } else if (chunk.type === 'error') {
          throw new Error(getChunkText(chunk, 'errorText') || getChunkText(chunk, 'message') || 'ACP chat stream failed');
        } else if (chunk.type === 'tool-output-error') {
          throw new Error(getChunkText(chunk, 'errorText') || getChunkText(chunk, 'message') || 'ACP tool output failed');
        }
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    consumeBuffer();
  }

  buffer += decoder.decode();
  consumeBuffer(true);
  return output.trim();
}

async function getAssistantRuntimeForImagePromptGeneration(projectId: string): Promise<AssistantRuntimeInfo> {
  const response = await fetch(withProjectScope('/api/assistant/runtime?autoStart=false', { projectId }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || '加载助手运行时配置失败');
  }
  const apiBaseUrl = typeof body?.apiBaseUrl === 'string' ? body.apiBaseUrl.trim() : '';
  const projectPath = typeof body?.projectPath === 'string' ? body.projectPath.trim() : '';
  if (!apiBaseUrl) {
    throw new Error('ACP API base URL 为空');
  }
  return { apiBaseUrl, projectPath };
}

async function executeCanvasAiImagePromptGeneration(params: {
  projectId: string;
  sourcePrompt: string;
  localContextRefs: CanvasLocalContextRef[];
  referenceImageCount: number;
  preferredPromptClient?: PromptClientPreference;
}): Promise<string> {
  const runtime = await getAssistantRuntimeForImagePromptGeneration(params.projectId);
  const threadId = createImagePromptThreadId();
  const response = await fetch(buildAcpChatUrl(runtime.apiBaseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: threadId,
      threadId,
      provider: resolvePromptGenerationProvider(params.preferredPromptClient),
      workspacePath: runtime.projectPath,
      messages: [{
        id: `${threadId}-user`,
        role: 'user',
        parts: [{
          type: 'text',
          text: buildCanvasAiImagePromptGenerationPrompt(params),
        }],
      }],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText.trim() || '提示词生成失败');
  }
  const output = await readAcpChatText(response);
  if (!output) {
    throw new Error('ACP 没有返回提示词');
  }
  return output;
}

function trimState(input: AiImageStoreState): AiImageStoreState {
  const tasks = [...input.tasks]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, HISTORY_LIMIT)
    .map((task) => {
      const { rawResponsePayload: _rawResponsePayload, ...safeTask } = task;
      return safeTask as AiImageTaskRecord;
    });
  const referencedImages = new Set(tasks.flatMap((task) => task.outputImages));
  const images: Record<string, AiImageStoredImage> = {};
  for (const imageId of referencedImages) {
    const image = input.images[imageId];
    if (image) {
      images[imageId] = image;
    }
  }
  return {
    tasks,
    images,
    imageConversations: Array.isArray(input.imageConversations) ? input.imageConversations : [],
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeLoadedImageTaskParams(value: unknown, imageCount: number): AiImageTaskParams {
  const source = isRecord(value) ? value : {};
  const outputFormat: AiImageOutputFormat = source.output_format === 'jpeg' || source.output_format === 'webp'
    ? source.output_format
    : 'png';
  const outputCompression = source.output_compression == null
    ? null
    : typeof source.output_compression === 'number' && Number.isFinite(source.output_compression)
      ? Math.min(100, Math.max(0, Math.round(source.output_compression)))
      : null;
  const n = numberField(source.n);

  return {
    size: stringField(source.size) || 'auto',
    quality: source.quality === 'low' || source.quality === 'medium' || source.quality === 'high' ? source.quality : 'auto',
    output_format: outputFormat,
    output_compression: outputCompression,
    moderation: source.moderation === 'low' ? 'low' : 'auto',
    background: outputFormat === 'png' && source.background === 'transparent' ? 'transparent' : 'auto',
    n: n == null ? Math.max(1, imageCount) : Math.min(10, Math.max(1, Math.round(n))),
    themeName: stringField(source.themeName),
    disable_prompt_optimization: source.disable_prompt_optimization === true,
  };
}

function normalizeLoadedImageTask(value: unknown, imageIds: string[], options: { interruptRunning?: boolean }): AiImageTaskRecord | null {
  if (!isRecord(value)) return null;
  const id = stringField(value.taskId) || stringField(value.id);
  const prompt = stringField(value.prompt);
  if (!id || !prompt) return null;
  const createdAt = numberField(value.createdAt) || nowFromDateLike(value.createdAt) || Date.now();
  const updatedAt = numberField(value.updatedAt) || createdAt;
  const finishedAt = numberField(value.finishedAt) || (value.status === 'done' || value.status === 'error' ? updatedAt : null);
  const params = normalizeLoadedImageTaskParams(value.params, imageIds.length);
  const status: AiImageTaskStatus = value.status === 'error' ? 'error' : value.status === 'done' ? 'done' : 'running';
  const interrupted = options.interruptRunning === true && status === 'running';
  return {
    id,
    prompt,
    params,
    status: interrupted ? 'error' : status,
    stage: interrupted ? 'error' : status === 'done' ? 'done' : status === 'error' ? 'error' : 'generating',
    error: interrupted ? '请求中断，可重新生成' : stringField(value.error) || null,
    createdAt,
    finishedAt,
    elapsed: finishedAt ? Math.max(0, finishedAt - createdAt) : null,
    outputImages: imageIds,
    ...(stringField(value.conversationId) ? { conversationId: stringField(value.conversationId) } : {}),
    ...(stringField(value.roundId) ? { roundId: stringField(value.roundId) } : {}),
    ...(stringField(value.sourcePrompt) ? { sourcePrompt: stringField(value.sourcePrompt) } : {}),
    ...(stringField(value.generatorElementId) ? { generatorElementId: stringField(value.generatorElementId) } : {}),
    ...(stringField(value.provider) ? { provider: stringField(value.provider) } : {}),
    ...(stringField(value.model) ? { model: stringField(value.model) } : {}),
    ...(stringField(value.mode) ? { mode: stringField(value.mode) } : {}),
    ...(stringField(value.thought) ? { thought: stringField(value.thought) } : {}),
    ...(interrupted ? { interrupted: true } : {}),
  };
}

function nowFromDateLike(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function createStoredImageFromArtifact(value: unknown): AiImageStoredImage | null {
  if (!isRecord(value) || value.kind !== 'image') return null;
  const id = stringField(value.id) || stringField(value.artifactId);
  const assetRef = isRecord(value.assetRef) ? value.assetRef : {};
  const url = stringField(assetRef.url);
  if (!id || !url) return null;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  return {
    id,
    dataUrl: url,
    source: 'generated',
    createdAt: numberField(value.createdAt) || Date.now(),
    ...(stringField(assetRef.assetPath) ? { assetPath: stringField(assetRef.assetPath) } : {}),
    ...(stringField(metadata.fileName) || stringField(assetRef.fileName) ? { fileName: stringField(metadata.fileName) || stringField(assetRef.fileName) } : {}),
    ...(stringField(assetRef.mimeType) || stringField(metadata.mimeType) ? { mimeType: stringField(assetRef.mimeType) || stringField(metadata.mimeType) } : {}),
    ...(numberField(assetRef.sizeBytes) != null ? { sizeBytes: numberField(assetRef.sizeBytes) } : {}),
    ...(stringField(metadata.savedPath) ? { savedPath: stringField(metadata.savedPath) } : {}),
    ...(numberField(metadata.width) != null ? { width: numberField(metadata.width) } : {}),
    ...(numberField(metadata.height) != null ? { height: numberField(metadata.height) } : {}),
  };
}

function upsertImageConversation(
  conversations: unknown,
  params: {
    conversationId: string;
    roundId: string;
    prompt: string;
    sourcePrompt?: string;
    taskId: string;
    status: AiImageTaskStatus;
    createdAt: number;
    updatedAt: number;
    finishedAt?: number | null;
    outputImageIds?: string[];
    referenceImages?: string[];
    referenceAssetRefs?: AiImageReferenceAssetRef[];
    localContextRefs?: CanvasLocalContextRef[];
    error?: string | null;
  },
): Record<string, unknown>[] {
  const existing = Array.isArray(conversations) ? conversations.filter(isRecord) : [];
  const conversation = existing.find((item) => item.id === params.conversationId) || {
    id: params.conversationId,
    title: params.prompt.slice(0, 48) || '图片对话',
    rounds: [],
    messages: [],
    createdAt: params.createdAt,
  };
  const rounds = Array.isArray(conversation.rounds) ? conversation.rounds.filter(isRecord) : [];
  const messages = Array.isArray(conversation.messages) ? conversation.messages.filter(isRecord) : [];
  const nextRound = {
    ...(rounds.find((round) => round.id === params.roundId) || {}),
    id: params.roundId,
    prompt: params.prompt,
    taskId: params.taskId,
    outputTaskIds: [params.taskId],
    outputImageIds: params.outputImageIds || [],
    status: params.status,
    createdAt: rounds.find((round) => round.id === params.roundId)?.createdAt || params.createdAt,
    updatedAt: params.updatedAt,
    ...(params.finishedAt ? { finishedAt: params.finishedAt } : {}),
    ...(params.error ? { error: params.error } : {}),
    ...(params.referenceImages?.length ? { referenceImages: params.referenceImages } : {}),
    ...(params.referenceAssetRefs?.length ? { referenceAssetRefs: params.referenceAssetRefs } : {}),
    ...(params.sourcePrompt ? { sourcePrompt: params.sourcePrompt } : {}),
    ...(params.localContextRefs?.length ? { localContextRefs: params.localContextRefs } : {}),
  };
  const userMessageId = `message-${params.roundId}-user`;
  const assistantMessageId = `message-${params.roundId}-assistant`;
  const nextMessages = [
    ...messages.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId),
    {
      id: userMessageId,
      role: 'user',
      content: params.prompt,
      roundId: params.roundId,
      taskId: params.taskId,
      createdAt: params.createdAt,
      ...(params.referenceImages?.length ? { referenceImages: params.referenceImages } : {}),
      ...(params.referenceAssetRefs?.length ? { referenceAssetRefs: params.referenceAssetRefs } : {}),
      ...(params.sourcePrompt ? { sourcePrompt: params.sourcePrompt } : {}),
      ...(params.localContextRefs?.length ? { localContextRefs: params.localContextRefs } : {}),
    },
    ...(params.status === 'running'
      ? []
      : [{
          id: assistantMessageId,
          role: 'assistant',
          content: params.status === 'done'
            ? `生成完成，共 ${params.outputImageIds?.length || 0} 张`
            : params.error || '图片生成失败',
          roundId: params.roundId,
          taskId: params.taskId,
          outputTaskIds: [params.taskId],
          outputImageIds: params.outputImageIds || [],
          createdAt: params.finishedAt || params.updatedAt,
          ...(params.error ? { error: params.error } : {}),
        }]),
  ];
  const nextConversation = {
    ...conversation,
    id: params.conversationId,
    title: typeof conversation.title === 'string' && conversation.title.trim()
      ? conversation.title
      : params.prompt.slice(0, 48) || '图片对话',
    rounds: [
      ...rounds.filter((round) => round.id !== params.roundId),
      nextRound,
    ],
    messages: nextMessages,
    updatedAt: params.updatedAt,
  };
  return [
    nextConversation,
    ...existing.filter((item) => item.id !== params.conversationId),
  ];
}

export function createAiImageTaskStore(options: AiImageTaskStoreOptions = {}): AiImageTaskStore {
  const now = options.now || (() => Date.now());
  let state: AiImageStoreState = { tasks: [], images: {}, imageConversations: [] };
  let projectId: string | undefined;
  let targetPath: string | undefined;
  let loadRevision = 0;
  const listeners = new Set<(state: AiImageStoreState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  const setState = (nextState: AiImageStoreState, options: { trim?: boolean } = {}) => {
    state = options.trim ? trimState(nextState) : nextState;
    emit();
  };

  const isCurrentScope = (scopeKey: string) => scopeKey === createScopeKey(projectId, targetPath);

  const upsertTask = (task: AiImageTaskRecord, scopeKey?: string) => {
    if (scopeKey && !isCurrentScope(scopeKey)) return;
    setState({
      ...state,
      tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
    });
  };

  return {
    getState: () => state,
    getTasks: () => state.tasks,
    getImage: (id) => state.images[id],
    async configure({ projectId: nextProjectId, targetPath: nextTargetPath }) {
      const scope = requireProjectScope(nextProjectId);
      const normalizedTargetPath = normalizeTargetPath(nextTargetPath);
      const nextScopeKey = createScopeKey(scope.projectId, normalizedTargetPath);
      if (nextScopeKey === createScopeKey(projectId, targetPath)) return;
      projectId = scope.projectId;
      targetPath = normalizedTargetPath;
      loadRevision += 1;
      state = { tasks: [], images: {}, imageConversations: [] };
      emit();
      if (targetPath) {
        await this.load();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      const loadProjectId = projectId;
      const loadTargetPath = targetPath;
      if (!loadProjectId || !loadTargetPath) return;
      const revision = loadRevision;
      try {
        const [tasksResponse, artifactsResponse] = await Promise.all([
          fetch(generationTasksEndpoint(loadProjectId, loadTargetPath)),
          fetch(generationArtifactsEndpoint(loadProjectId, loadTargetPath)),
        ]);
        if (!tasksResponse.ok) {
          throw new Error(`加载图片任务失败 (${tasksResponse.status})`);
        }
        if (!artifactsResponse.ok) {
          throw new Error(`加载图片产物失败 (${artifactsResponse.status})`);
        }
        const [tasksBody, artifactsBody] = await Promise.all([
          tasksResponse.json().catch(() => ({})),
          artifactsResponse.json().catch(() => ({})),
        ]);
        if (revision !== loadRevision) return;
        const rawArtifacts = Array.isArray(artifactsBody?.artifacts) ? artifactsBody.artifacts : [];
        const imageArtifacts = rawArtifacts.filter((artifact: unknown) => isRecord(artifact) && artifact.kind === 'image');
        const images: Record<string, AiImageStoredImage> = {};
        const imageIdsByTask = new Map<string, string[]>();
        for (const artifact of imageArtifacts) {
          const image = createStoredImageFromArtifact(artifact);
          if (!image) continue;
          images[image.id] = image;
          const taskId = stringField((artifact as Record<string, unknown>).taskId);
          if (taskId) {
            imageIdsByTask.set(taskId, [...(imageIdsByTask.get(taskId) || []), image.id]);
          }
        }
        const rawTasks = Array.isArray(tasksBody?.tasks) ? tasksBody.tasks : [];
        const tasks = rawTasks
          .map((task: unknown) => {
            const taskId = isRecord(task) ? stringField(task.taskId) || stringField(task.id) : undefined;
            if (!taskId) return null;
            return normalizeLoadedImageTask(task, imageIdsByTask.get(taskId) || [], { interruptRunning: true });
          })
          .filter((task: AiImageTaskRecord | null): task is AiImageTaskRecord => Boolean(task))
          .filter((task) => task.outputImages.length || task.status === 'running' || task.status === 'error');
        let imageConversations: Record<string, unknown>[] = [];
        for (const task of tasks) {
          const conversationId = task.conversationId || `conversation-${task.id}`;
          const roundId = task.roundId || `round-${task.id}`;
          imageConversations = upsertImageConversation(imageConversations, {
            conversationId,
            roundId,
            prompt: task.prompt,
            sourcePrompt: task.sourcePrompt,
            taskId: task.id,
            status: task.status,
            createdAt: task.createdAt,
            updatedAt: task.finishedAt || task.createdAt,
            finishedAt: task.finishedAt,
            outputImageIds: task.outputImages,
            error: task.error,
          });
        }
        setState({ tasks, images, imageConversations }, { trim: true });
      } catch {
        if (revision !== loadRevision) return;
        state = normalizeLoadedState(state, { interruptRunning: true });
        emit();
      }
    },
    async submit(request, submitOptions = {}) {
      const scope = requireProjectScope(projectId);
      const submissionTargetPath = targetPath;
      const submissionScopeKey = createScopeKey(scope.projectId, submissionTargetPath);
      const createdAt = now();
      const conversationId = request.conversationId || createConversationId();
      const roundId = request.roundId || createRoundId();
      const sourcePrompt = String(request.sourcePrompt || request.prompt || '').trim();
      const localContextRefs = normalizeLocalContextRefs(request.localContextRefs);
      let task: AiImageTaskRecord = {
        id: createTaskId(),
        prompt: request.prompt,
        params: request.params,
        status: 'running',
        stage: localContextRefs.length ? 'preparing-context' : 'submitting',
        error: null,
        createdAt,
        finishedAt: null,
        elapsed: null,
        outputImages: [],
        conversationId,
        roundId,
        ...(request.generatorElementId ? { generatorElementId: request.generatorElementId } : {}),
        ...(request.provider !== undefined ? { provider: request.provider } : {}),
        ...(request.model !== undefined ? { model: request.model } : {}),
        ...(request.mode !== undefined ? { mode: request.mode } : {}),
        ...(request.thought !== undefined ? { thought: request.thought } : {}),
        ...(sourcePrompt && sourcePrompt !== request.prompt ? { sourcePrompt } : {}),
        ...(localContextRefs.length ? { sourcePrompt, localContextRefs } : {}),
        ...(Array.isArray(request.referenceImages) && request.referenceImages.length
          ? { referenceImages: request.referenceImages }
          : {}),
      };
      upsertTask(task, submissionScopeKey);
      setState({
        ...state,
        imageConversations: upsertImageConversation(state.imageConversations, {
          conversationId,
          roundId,
          prompt: task.prompt,
          sourcePrompt: task.sourcePrompt,
          taskId: task.id,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          referenceImages: request.referenceImages,
          referenceAssetRefs: request.referenceAssetRefs,
          localContextRefs,
        }),
      });
      submitOptions.onCreated?.(task);

      try {
        let generateRequest: AiImageGenerateRequest = {
          ...request,
          ...(localContextRefs.length ? { localContextRefs } : {}),
        };
        if (localContextRefs.length) {
          task = { ...task, stage: 'generating-prompt' };
          upsertTask(task);
          const generatedPrompt = await executeCanvasAiImagePromptGeneration({
            projectId: scope.projectId,
            sourcePrompt,
            localContextRefs,
            referenceImageCount: Array.isArray(request.referenceImages) ? request.referenceImages.length : 0,
            preferredPromptClient: request.preferredPromptClient,
          }).catch((error: any) => {
            throw new Error(`提示词生成失败：${error?.message || '未知错误'}`);
          });
          if (!isCurrentScope(submissionScopeKey)) return task;
          task = {
            ...task,
            prompt: generatedPrompt,
            sourcePrompt,
            localContextRefs,
          };
          upsertTask(task, submissionScopeKey);
          generateRequest = {
            ...generateRequest,
            prompt: generatedPrompt,
            sourcePrompt,
            localContextRefs,
          };
        }
        task = { ...task, stage: 'generating' };
        upsertTask(task, submissionScopeKey);
        const response = await fetch(withProjectScope('/api/ai/runs', { projectId: scope.projectId }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: scope.projectId,
            scene: 'image',
            ...generateRequest,
            taskId: task.id,
            conversationId,
            targetPath: submissionTargetPath,
          }),
        });
        if (!isCurrentScope(submissionScopeKey)) return task;
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
          const body = contentType.includes('application/json')
            ? await response.json().catch(() => ({}))
            : {};
          throw Object.assign(new Error(body?.error || '图片生成失败'), {
            rawImageUrls: body?.rawImageUrls,
          });
        }
        task = { ...task, stage: 'downloading' };
        upsertTask(task, submissionScopeKey);

        const outputImages: string[] = [];
        const actualParamsByImage: Record<string, Partial<AiImageTaskParams>> = {};
        const revisedPromptByImage: Record<string, string> = {};
        const rawImageUrls: string[] = [];

        await readAiRunSseEvents(response, async ({ event, data }) => {
          if (!isCurrentScope(submissionScopeKey)) return;
          if (event === 'run.error') {
            throw Object.assign(new Error(stringField(data.error) || '图片生成失败'), {
              rawImageUrls,
            });
          }
          if (event !== 'artifact.created' && event !== 'artifact.updated') return;
          const artifact = isRecord(data.artifact) ? data.artifact : {};
          if (artifact.kind !== 'image') return;
          getGenerationArtifactHistoryStore().upsertArtifact(artifact, {
            status: 'running',
            scope: { projectId: scope.projectId, targetPath: submissionTargetPath },
          });
          const dataUrl = stringField(artifact.dataUrl);
          if (!dataUrl) return;
          const id = await sha256(`${stringField(artifact.id) || ''}:${dataUrl}`);
          if (!isCurrentScope(submissionScopeKey)) return;
          if (outputImages.includes(id)) return;
          const size = await parseImageSize(dataUrl);
          if (!isCurrentScope(submissionScopeKey)) return;
          const metadata = normalizeImageMetadata(artifact.metadata);
          const storedImage: AiImageStoredImage = {
            id,
            dataUrl,
            ...metadata,
            width: size.width || metadata.width,
            height: size.height || metadata.height,
            createdAt,
            source: 'generated' as const,
          };
          outputImages.push(id);
          if (isRecord(artifact.actualParams)) {
            actualParamsByImage[id] = artifact.actualParams;
          }
          const revisedPrompt = stringField(artifact.revisedPrompt);
          if (revisedPrompt) {
            revisedPromptByImage[id] = revisedPrompt;
          }
          const rawUrl = stringField(artifact.rawUrl);
          if (rawUrl) {
            rawImageUrls.push(rawUrl);
          }
          task = {
            ...task,
            outputImages: [...outputImages],
            actualParams: isRecord(artifact.actualParams) ? artifact.actualParams : task.actualParams,
            actualParamsByImage: Object.keys(actualParamsByImage).length ? { ...actualParamsByImage } : undefined,
            revisedPromptByImage: Object.keys(revisedPromptByImage).length ? { ...revisedPromptByImage } : undefined,
            rawImageUrls: rawImageUrls.length ? [...rawImageUrls] : undefined,
          };
          setState({
            images: {
              ...state.images,
              [id]: storedImage,
            },
            tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
            imageConversations: upsertImageConversation(state.imageConversations, {
              conversationId,
              roundId,
              prompt: task.prompt,
              taskId: task.id,
              status: 'running',
              createdAt,
              updatedAt: createdAt,
              outputImageIds: outputImages,
              referenceImages: generateRequest.referenceImages,
              referenceAssetRefs: generateRequest.referenceAssetRefs,
              sourcePrompt: task.sourcePrompt,
              localContextRefs: task.localContextRefs,
            }),
          });
        });
        if (!isCurrentScope(submissionScopeKey)) return task;
        const finishedAt = now();
        task = {
          ...task,
          status: 'done',
          stage: 'done',
          finishedAt,
          elapsed: Math.max(0, finishedAt - createdAt),
          outputImages,
          actualParams: task.actualParams,
          actualParamsByImage: Object.keys(actualParamsByImage).length ? actualParamsByImage : undefined,
          revisedPromptByImage: Object.keys(revisedPromptByImage).length ? revisedPromptByImage : undefined,
          rawImageUrls: rawImageUrls.length ? rawImageUrls : undefined,
        };
        setState({
          images: state.images,
          tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
          imageConversations: upsertImageConversation(state.imageConversations, {
            conversationId,
            roundId,
            prompt: task.prompt,
            taskId: task.id,
            status: 'done',
            createdAt,
            updatedAt: finishedAt,
            finishedAt,
            outputImageIds: outputImages,
            referenceImages: generateRequest.referenceImages,
            referenceAssetRefs: generateRequest.referenceAssetRefs,
            sourcePrompt: task.sourcePrompt,
            localContextRefs: task.localContextRefs,
          }),
        }, { trim: true });
        return task;
      } catch (error: any) {
        const finishedAt = now();
        task = {
          ...task,
          status: 'error',
          stage: 'error',
          error: error?.message || '图片生成失败',
          rawImageUrls: Array.isArray(error?.rawImageUrls) ? error.rawImageUrls : undefined,
          finishedAt,
          elapsed: Math.max(0, finishedAt - createdAt),
        };
        if (!isCurrentScope(submissionScopeKey)) return task;
        upsertTask(task, submissionScopeKey);
        setState({
          ...state,
          imageConversations: upsertImageConversation(state.imageConversations, {
            conversationId,
            roundId,
            prompt: task.prompt,
            taskId: task.id,
            status: 'error',
            createdAt,
            updatedAt: finishedAt,
            finishedAt,
            referenceImages: request.referenceImages,
            referenceAssetRefs: task.referenceAssetRefs,
            sourcePrompt: task.sourcePrompt,
            localContextRefs: task.localContextRefs,
            error: task.error,
          }),
        });
        return task;
      }
    },
    deleteTask(taskId) {
      setState({
        ...state,
        tasks: state.tasks.filter((task) => task.id !== taskId),
      }, { trim: true });
    },
  };
}

let singletonStore: AiImageTaskStore | null = null;

export function getAiImageTaskStore(): AiImageTaskStore {
  if (!singletonStore) {
    singletonStore = createAiImageTaskStore();
  }
  return singletonStore;
}
