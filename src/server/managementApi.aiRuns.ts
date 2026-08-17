import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  AcpChatRunError,
  createAcpOneShotThreadId,
  normalizeAcpChatProvider,
  streamAcpChat,
  type AcpChatRunResult,
  type AcpToolOutputChunk,
} from './acpChatRunner.ts';
import {
  type AssistantRuntimeResponse,
  createAssistantRuntimeResponse,
  resolveAssistantRuntime,
} from './assistantRuntime.ts';
import {
  buildImageGenerationPrompt,
  collectImageRecordsFromValue,
  createPersistableRawResponsePayload,
  fetchImageRecordsFallback,
  normalizeAcpImageRecord,
  normalizeAiImageRequestParams,
  type AcpImageRecord,
  type AiImageTaskParams,
} from './aiImageGeneration.ts';
import { getRequestUrl, readJsonBody, sendJson } from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import {
  appendAiRunArtifactsToHistory,
  upsertAiRunTaskToHistory,
} from './managementApi.aiArtifactHistory.ts';
import {
  ACP_NO_RESPONSE_MIN_SECONDS,
  sanitizeAgentRunConcurrency,
} from './projectCore/server-config.ts';
import { classifyAiArtifact } from '../common/aiArtifactClassification.ts';
import { resolvePrototypeMainSpecStatus } from './managementApi.prototypeSpec.ts';

const DEFAULT_ACP_API_BASE_URL = 'http://localhost:32124/api';
const ACP_CHAT_NO_RESPONSE_CODE = 'ACP_CHAT_NO_RESPONSE';
const ACP_NO_RESPONSE_CONFIRMATION_POLL_INTERVAL_MS = 5000;
const DEFAULT_IMAGE_CONFIG = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
} satisfies Partial<AiImageTaskParams>;

interface AiRunsProjectContext {
  project: {
    id: string;
    root: string;
  };
  metadata?: any;
}

interface AiRunsHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
    body?: unknown,
  ) => AiRunsProjectContext | null;
  getServerConfigStoreForRequest: (options: ManagementApiOptions) => {
    getConfig: (params: { activeProjectRoot: string }) => any;
  };
}

export type AiRunScene = 'direct' | 'prototype' | 'image' | 'document';
export type AiArtifactKind = 'prototype' | 'image' | 'document' | 'drawio' | 'file' | 'link';
export type AiArtifactOperation = 'created' | 'updated';

export interface AiArtifact {
  id: string;
  taskId?: string;
  conversationId?: string;
  kind: AiArtifactKind;
  operation: AiArtifactOperation;
  source: Record<string, unknown>;
  target?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  dataUrl?: string;
  revisedPrompt?: string;
  actualParams?: Partial<AiImageTaskParams>;
  rawUrl?: string;
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeScene(value: unknown): AiRunScene {
  const scene = safeText(value).toLowerCase();
  if (scene === 'image' || scene === 'prototype' || scene === 'document' || scene === 'direct') {
    return scene;
  }
  if (scene === 'canvas-prototype-generation' || scene === 'page') return 'prototype';
  if (scene === 'design') return 'image';
  return 'direct';
}

function resolvePrototypeIdFromTargetPath(value: unknown): string {
  const normalized = safeText(value).replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/^src\//u, '');
  const match = normalized.match(/^prototypes\/([^/]+)(?:\/.*)?$/u);
  return match?.[1] || '';
}

function resolveConfiguredAcpApiBaseUrl(assistantConfig: any): string {
  const apiBaseUrl = safeText(assistantConfig?.apiBaseUrl).replace(/\/+$/u, '');
  if (apiBaseUrl) return apiBaseUrl;
  const webBaseUrl = safeText(assistantConfig?.webBaseUrl).replace(/\/+$/u, '');
  return webBaseUrl ? `${webBaseUrl}/api` : DEFAULT_ACP_API_BASE_URL;
}

function resolvePromptProvider(value: unknown, fallback: unknown): string {
  const provider = normalizeAcpChatProvider(value || fallback);
  return provider === 'manual' ? 'codex' : provider;
}

export function resolveAiPurposePreference(scene: unknown, automation: any): {
  promptClient: unknown;
  model: unknown;
} {
  const normalized = safeText(scene).toLowerCase();
  if (normalized.includes('annotation') || normalized.includes('review')) {
    return {
      promptClient: automation?.annotationPromptClient,
      model: automation?.annotationModel,
    };
  }
  if (normalized.startsWith('canvas-')) {
    return {
      promptClient: automation?.canvasPromptClient,
      model: automation?.canvasModel,
    };
  }
  return {
    promptClient: automation?.conversationPromptClient,
    model: automation?.conversationModel,
  };
}

export function resolveAiRunTimeoutMs(scene: AiRunScene, config: any): number {
  const timeoutSeconds = Number(config?.automation?.acp?.timeout || 1800);
  const configuredSeconds = Math.round(Number.isFinite(timeoutSeconds) ? timeoutSeconds : 1800);
  return Math.max(ACP_NO_RESPONSE_MIN_SECONDS, Math.min(7200, configuredSeconds)) * 1000;
}

function writeSseHeaders(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendRunError(res: ServerResponse, error: any, extra: Record<string, unknown> = {}): void {
  if (!res.headersSent) {
    writeSseHeaders(res);
  }
  writeSseEvent(res, 'run.error', {
    status: 'error',
    error: error?.message || 'AI run failed',
    code: error?.code,
    ...(error?.details !== undefined ? { details: error.details } : {}),
    ...extra,
  });
  res.end();
}

function sendAcpRuntimeUnavailableRunError(res: ServerResponse, params: {
  runId: string;
  threadId: string;
  runtime: AssistantRuntimeResponse;
}): void {
  writeSseEvent(res, 'run.error', {
    status: 'error',
    error: params.runtime.health.message || '本地 ACP 服务未链接',
    code: 'ACP_RUNTIME_UNAVAILABLE',
    action: 'open-ai-settings',
    runId: params.runId,
    threadId: params.threadId,
    runtime: params.runtime,
  });
  res.end();
}

function getReferenceImages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(safeText).filter((image) => image.startsWith('data:image/'))
    : [];
}

function buildUserMessage(threadId: string, prompt: string, referenceImages: string[] = []) {
  return {
    id: `${threadId}-user`,
    role: 'user',
    parts: [
      { type: 'text', text: prompt },
      ...referenceImages.map((image) => ({ type: 'image', image })),
    ],
  };
}

function getImageGenerationSettings(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const imageGeneration = (value as Record<string, unknown>).imageGeneration;
  return imageGeneration && typeof imageGeneration === 'object' && !Array.isArray(imageGeneration)
    ? imageGeneration as Record<string, unknown>
    : null;
}

function resolveImageGenerationModel(config: any, overrideSettings?: unknown): string {
  const overrideImageGeneration = getImageGenerationSettings(overrideSettings);
  return safeText(overrideImageGeneration?.model) || safeText(config?.ai?.imageGeneration?.model);
}

function buildRunPrompt(params: {
  scene: AiRunScene;
  prompt: string;
  body: Record<string, any>;
  config: any;
}): {
  prompt: string;
  imageParams?: AiImageTaskParams;
  referenceImages?: string[];
  imageSavePathPattern?: string;
} {
  if (params.scene !== 'image') {
    return { prompt: params.prompt };
  }
  const imageModel = resolveImageGenerationModel(params.config, params.body.builtinToolSettings);
  const imageParams = normalizeAiImageRequestParams(
    params.body.params && typeof params.body.params === 'object' ? params.body.params : {},
    DEFAULT_IMAGE_CONFIG,
    { model: imageModel },
  );
  const referenceImages = getReferenceImages(params.body.referenceImages);
  const imageSavePathPattern = resolveImageSavePathPattern(params.body.targetPath, params.prompt);
  return {
    prompt: buildImageGenerationPrompt({
      prompt: params.prompt,
      requestParams: imageParams,
      referenceImages,
      imageModel,
      savePathPattern: imageSavePathPattern,
    }),
    imageParams,
    referenceImages,
    imageSavePathPattern,
  };
}

function sanitizeImageSavePathSegment(value: string): string {
  return value
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase()
    .slice(0, 40) || 'image';
}

function resolveImageSavePathPattern(targetPath: unknown, prompt: string): string | undefined {
  const normalizedTargetPath = safeText(targetPath).replace(/\\/g, '/').replace(/^\/+/u, '');
  const match = normalizedTargetPath.match(/^prototypes\/([^/]+)$/u);
  const prototypeId = match?.[1];
  if (!prototypeId || prototypeId.startsWith('.') || prototypeId.includes('..')) return undefined;
  const slug = sanitizeImageSavePathSegment(prompt);
  return `src/prototypes/${prototypeId}/.spec/generation-assets/images/${slug}-<index>.<ext>`;
}

function resolveImageBuiltinToolSettings(config: any, savePathPattern?: string, overrideSettings?: unknown): Record<string, unknown> | undefined {
  const overrideImageGeneration = isRecord(overrideSettings)
    && isRecord(overrideSettings.imageGeneration)
    ? overrideSettings.imageGeneration
    : null;
  const imageConfig = overrideImageGeneration || config?.ai?.imageGeneration || {};
  const imageGeneration = {
    ...(safeText(imageConfig.baseUrl) ? { baseUrl: safeText(imageConfig.baseUrl) } : {}),
    ...(safeText(imageConfig.apiKey) ? { apiKey: safeText(imageConfig.apiKey) } : {}),
    ...(safeText(imageConfig.model) ? { model: safeText(imageConfig.model) } : {}),
    ...(savePathPattern ? { savePathPattern } : {}),
  };
  return Object.keys(imageGeneration).length ? { imageGeneration } : undefined;
}

function shouldEnableImageGenerationBuiltinTool(scene: AiRunScene, builtinToolSettings: unknown): boolean {
  return scene === 'image'
    || (scene === 'direct'
      && isRecord(builtinToolSettings)
      && isRecord(builtinToolSettings.imageGeneration));
}

function createArtifactId(kind: AiArtifactKind, sourceId: string, index: number): string {
  const hash = crypto.createHash('sha1').update(`${kind}:${sourceId}:${index}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12);
  return `${kind}-${hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isCanvasArtifactListeningEnabled(body: Record<string, any>): boolean {
  return Boolean(
    safeText(body.canvasId)
    || safeText(body.canvasName)
    || safeText(body.generatorElementId)
    || safeText(body.targetElementId)
    || safeText(body.targetArtifactId),
  );
}

function normalizeArtifactPath(value: unknown, projectRoot: string): string {
  let raw = safeText(value);
  if (!raw) return '';
  raw = raw.replace(/^file:\/\//u, '');
  raw = raw.replace(/^axhub:\/\//u, '');
  if (path.isAbsolute(raw)) {
    const relative = path.relative(projectRoot, raw);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join('/');
    }
  }
  return raw.replace(/^\/+/u, '').replace(/\\/g, '/');
}

function resolveArtifactKind(params: {
  scene: AiRunScene;
  pathValue: string;
  uri: string;
  mimeType: string;
  title?: string;
  name?: string;
  fileName?: string;
}): AiArtifactKind {
  return classifyAiArtifact({
    path: params.pathValue,
    uri: params.uri,
    mimeType: params.mimeType,
    title: params.title,
    name: params.name,
    fileName: params.fileName,
    fallbackKind: params.scene === 'prototype'
      ? 'prototype'
      : params.scene === 'document'
        ? 'document'
        : undefined,
  }) as AiArtifactKind;
}

function resolveArtifactOperation(value: unknown, fallback: AiArtifactOperation): AiArtifactOperation {
  const operation = safeText(value).toLowerCase();
  if (operation === 'updated' || operation === 'modified' || operation === 'changed' || operation === 'deleted') return 'updated';
  if (operation === 'created' || operation === 'added' || operation === 'new') return 'created';
  return fallback;
}

function hasOldTextField(value: Record<string, unknown>): boolean {
  return typeof value.oldText === 'string';
}

function createArtifactTarget(body: Record<string, any>, pathValue: string, uri: string): Record<string, unknown> {
  return {
    ...(pathValue ? { path: pathValue } : {}),
    ...(uri ? { uri } : {}),
    ...(safeText(body.canvasId) ? { canvasId: safeText(body.canvasId) } : {}),
    ...(safeText(body.canvasName) ? { canvasName: safeText(body.canvasName) } : {}),
    ...(safeText(body.generatorElementId) ? { generatorElementId: safeText(body.generatorElementId) } : {}),
    ...(safeText(body.targetElementId) ? { elementId: safeText(body.targetElementId), targetElementId: safeText(body.targetElementId) } : {}),
    ...(safeText(body.targetArtifactId) ? { artifactId: safeText(body.targetArtifactId), targetArtifactId: safeText(body.targetArtifactId) } : {}),
    ...(safeText(body.targetPath) ? { targetPath: safeText(body.targetPath) } : {}),
  };
}

function createArtifactMetadata(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(safeText(record.name) ? { name: safeText(record.name) } : {}),
    ...(safeText(record.title) ? { title: safeText(record.title) } : {}),
    ...(safeText(record.mimeType) ? { mimeType: safeText(record.mimeType) } : {}),
    ...(safeText(record.mediaType) ? { mediaType: safeText(record.mediaType) } : {}),
    ...(safeText(record.description) ? { description: safeText(record.description) } : {}),
    ...(safeText(record.operation) ? { operation: safeText(record.operation) } : {}),
    ...(safeText(record.patch) ? { patch: safeText(record.patch) } : {}),
  };
}

function normalizeGenericArtifactFromRecord(params: {
  record: Record<string, unknown>;
  scene: AiRunScene;
  body: Record<string, any>;
  projectRoot: string;
  sourceType?: string;
  defaultOperation?: AiArtifactOperation;
  index: number;
}): AiArtifact | null {
  const rawType = safeText(params.record.type);
  if (rawType && rawType !== 'diff') return null;
  const uri = safeText(params.record.uri || params.record.url || params.record.href);
  const pathValue = normalizeArtifactPath(
    params.record.path || params.record.filePath || params.record.absolutePath || uri,
    params.projectRoot,
  );
  if (!pathValue && !uri && rawType !== 'diff') return null;

  const mimeType = safeText(params.record.mimeType || params.record.mediaType);
  const kind = resolveArtifactKind({
    scene: params.scene,
    pathValue,
    uri,
    mimeType,
    title: safeText(params.record.title),
    name: safeText(params.record.name),
    fileName: safeText(params.record.fileName),
  });
  const sourceType = params.sourceType
    || (rawType === 'diff' ? 'acp-diff' : 'acp-tool-output');
  const operation = resolveArtifactOperation(
    params.record.operation || params.record.status,
    params.defaultOperation || (hasOldTextField(params.record) ? 'updated' : 'created'),
  );
  const sourceId = safeText(params.record.toolCallId)
    || safeText(params.record.id)
    || safeText(params.record.uri)
    || safeText(params.record.path)
    || sourceType;
  return {
    id: createArtifactId(kind, sourceId, params.index),
    kind,
    operation,
    source: {
      type: sourceType,
      ...(safeText(params.record.toolCallId) ? { toolCallId: safeText(params.record.toolCallId) } : {}),
      ...(safeText(params.record.toolName) ? { toolName: safeText(params.record.toolName) } : {}),
    },
    target: createArtifactTarget(params.body, pathValue, uri),
    metadata: createArtifactMetadata(params.record),
  };
}

function collectGenericArtifactRecords(value: unknown, records: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectGenericArtifactRecords(item, records);
    return;
  }
  if (!isRecord(value)) return;

  const type = safeText(value.type);
  if (type === 'diff') {
    records.push(value);
  }

  for (const key of ['resources', 'resourceLinks', 'resource_links', 'diffs', 'fileDiffs', 'files', 'artifacts']) {
    if (Array.isArray(value[key])) {
      for (const item of value[key] as unknown[]) {
        if (isRecord(item) && !safeText(item.type)) {
          const inferredType = key === 'resourceLinks' || key === 'resource_links'
            ? 'resource_link'
            : key === 'diffs' || key === 'fileDiffs'
              ? 'diff'
              : 'resource';
          collectGenericArtifactRecords({ ...item, type: inferredType }, records);
        } else {
          collectGenericArtifactRecords(item, records);
        }
      }
    }
  }
}

function normalizeGenericArtifactsFromToolOutput(params: {
  toolOutput: AcpToolOutputChunk;
  scene: AiRunScene;
  body: Record<string, any>;
  projectRoot: string;
}): AiArtifact[] {
  const records: Record<string, unknown>[] = [];
  collectGenericArtifactRecords(params.toolOutput.output, records);
  collectGenericArtifactRecords(params.toolOutput.chunk?.structuredContent, records);
  return records
    .map((record, index) => normalizeGenericArtifactFromRecord({
      record: {
        ...record,
        toolCallId: record.toolCallId || params.toolOutput.toolCallId,
        toolName: record.toolName || params.toolOutput.toolName,
      },
      scene: params.scene,
      body: params.body,
      projectRoot: params.projectRoot,
      sourceType: 'acp-tool-output',
      index,
    }))
    .filter((artifact): artifact is AiArtifact => Boolean(artifact));
}

function normalizeGenericArtifactFromChunk(params: {
  chunk: Record<string, unknown>;
  scene: AiRunScene;
  body: Record<string, any>;
  projectRoot: string;
  index: number;
}): AiArtifact | null {
  return normalizeGenericArtifactFromRecord({
    record: params.chunk,
    scene: params.scene,
    body: params.body,
    projectRoot: params.projectRoot,
    index: params.index,
  });
}

function createArtifactSignature(artifact: AiArtifact): string {
  return JSON.stringify({
    kind: artifact.kind,
    operation: artifact.operation,
    source: artifact.source,
    target: artifact.target,
    dataUrl: artifact.dataUrl,
    rawUrl: artifact.rawUrl,
    fileName: artifact.metadata?.fileName,
  });
}

function getToolOutputRecords(toolOutput: AcpToolOutputChunk): AcpImageRecord[] {
  if (toolOutput.toolName && toolOutput.toolName !== 'generate_image' && toolOutput.toolName !== 'image-generation') {
    return [];
  }
  const records: AcpImageRecord[] = [];
  collectImageRecordsFromValue(toolOutput.output, records);
  collectImageRecordsFromValue(toolOutput.chunk?.structuredContent, records);
  return records;
}

async function normalizeImageArtifactsFromToolOutput(params: {
  toolOutput: AcpToolOutputChunk;
  requestParams: AiImageTaskParams;
  fetchImpl: typeof fetch;
}): Promise<AiArtifact[]> {
  const records = getToolOutputRecords(params.toolOutput);
  const artifacts: AiArtifact[] = [];
  let index = 0;
  for (const record of records) {
    const normalized = await normalizeAcpImageRecord(record, params.requestParams, params.fetchImpl);
    for (const image of normalized.images) {
      artifacts.push({
        id: createArtifactId('image', String(params.toolOutput.toolCallId || record.recordId || record.requestId || 'tool-output'), index),
        kind: 'image',
        operation: 'created',
        source: {
          type: 'acp-tool-output',
          toolCallId: params.toolOutput.toolCallId,
          toolName: params.toolOutput.toolName,
        },
        metadata: { ...image.metadata },
        dataUrl: image.dataUrl,
        revisedPrompt: image.revisedPrompt,
        actualParams: normalized.actualParams,
        ...(image.rawUrl ? { rawUrl: image.rawUrl } : {}),
      });
      index += 1;
    }
  }
  return artifacts;
}

function getChunkText(chunk: Record<string, unknown>, key: string): string {
  return typeof chunk[key] === 'string' ? chunk[key] as string : '';
}

function createCompletedPayload(params: {
  result: AcpChatRunResult;
  scene: AiRunScene;
  artifacts: AiArtifact[];
  taskId: string;
  conversationId: string;
}) {
  return {
    status: 'done',
    scene: params.scene,
    runId: params.result.id,
    threadId: params.result.threadId,
    taskId: params.taskId,
    conversationId: params.conversationId,
    provider: params.result.provider,
    output: params.result.output,
    reasoning: params.result.reasoning,
    runtimeHeaders: params.result.runtimeHeaders,
    finishReason: params.result.finishReason,
    artifacts: params.artifacts,
    toolOutputs: params.result.toolOutputs,
  };
}

export type AcpConversationRunState =
  | {
      status: 'completed';
      result: AcpChatRunResult;
    }
  | {
      status: 'failed';
      error: string;
      details?: unknown;
    }
  | {
      status: 'running' | 'unknown';
    };

function normalizeRunStatus(value: unknown): AcpConversationRunState['status'] {
  const status = safeText(value).toLowerCase();
  if (['completed', 'complete', 'done', 'success', 'succeeded', 'stop', 'stopped'].includes(status)) {
    return 'completed';
  }
  if (['failed', 'error', 'errored', 'cancelled', 'canceled'].includes(status)) {
    return 'failed';
  }
  if (['active', 'running', 'streaming', 'pending', 'in_progress', 'editing'].includes(status)) {
    return 'running';
  }
  return 'unknown';
}

function getMessageParts(message: Record<string, unknown>): Record<string, unknown>[] {
  const content = isRecord(message.content) ? message.content : {};
  const parts = Array.isArray(content.parts)
    ? content.parts
    : Array.isArray(message.parts)
      ? message.parts
      : [];
  return parts.filter((part): part is Record<string, unknown> => isRecord(part));
}

function getMessageAcpRun(message: Record<string, unknown>): Record<string, unknown> | null {
  const content = isRecord(message.content) ? message.content : {};
  const metadata = isRecord(content.metadata)
    ? content.metadata
    : isRecord(message.metadata)
      ? message.metadata
      : {};
  const custom = isRecord(metadata.custom) ? metadata.custom : {};
  return isRecord(custom.acpRun) ? custom.acpRun : null;
}

function collectConversationMessages(store: Record<string, unknown>): Record<string, unknown>[] {
  const messages = store.messages;
  if (Array.isArray(messages)) {
    return messages.filter((message): message is Record<string, unknown> => isRecord(message));
  }
  if (!isRecord(messages)) return [];
  const collected: Record<string, unknown>[] = [];
  for (const bucket of Object.values(messages)) {
    if (isRecord(bucket) && Array.isArray(bucket.messages)) {
      for (const message of bucket.messages) {
        if (isRecord(message)) collected.push(message);
      }
    }
  }
  return collected;
}

function acpRunMatchesRequest(acpRun: Record<string, unknown>, params: {
  runId: string;
  threadId: string;
  conversationId: string;
}): boolean {
  const expectedIds = [params.runId, params.threadId, params.conversationId]
    .map((value) => safeText(value))
    .filter(Boolean);
  if (!expectedIds.length) return false;
  const runIds = [
    acpRun.id,
    acpRun.runId,
    acpRun.threadId,
    acpRun.conversationId,
  ].map((value) => safeText(value)).filter(Boolean);
  return runIds.some((id) => expectedIds.includes(id));
}

function getLatestAssistantText(messages: Record<string, unknown>[]): string {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const role = safeText(message.role).toLowerCase();
    if (role === 'user') continue;
    const parts = getMessageParts(message);
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      const text = safeText(part.text);
      if (text) return text;
    }
  }
  return '';
}

function createAcpRunResultFromConversation(params: {
  runId: string;
  threadId: string;
  provider: string;
  acpRun: Record<string, unknown>;
  messages: Record<string, unknown>[];
}): AcpChatRunResult {
  const threadId = safeText(params.acpRun.threadId) || params.threadId;
  const provider = safeText(params.acpRun.provider) || params.provider || 'codex';
  const sessionId = safeText(params.acpRun.acpSessionId || params.acpRun.sessionId);
  const output = getLatestAssistantText(params.messages);
  return {
    success: true,
    id: params.runId,
    threadId,
    provider,
    output,
    reasoning: '',
    toolOutputs: [],
    runtimeHeaders: {
      raw: {},
      provider,
      threadId,
      ...(sessionId ? { sessionId } : {}),
    },
    finishReason: 'completed',
    errors: [],
    chunks: [],
  };
}

function resolveAcpRunFailure(acpRun: Record<string, unknown>): { error: string; details?: unknown } {
  const rawError = acpRun.error;
  const error = isRecord(rawError)
    ? safeText(rawError.message || rawError.error || rawError.code)
    : safeText(rawError);
  return {
    error: error || safeText(acpRun.message) || 'ACP run failed',
    ...(rawError !== undefined ? { details: rawError } : {}),
  };
}

export function resolveAcpConversationRunState(params: {
  conversationStorePath?: unknown;
  runId: string;
  threadId: string;
  conversationId: string;
  provider: string;
}): AcpConversationRunState {
  const conversationStorePath = safeText(params.conversationStorePath);
  if (!conversationStorePath || !path.isAbsolute(conversationStorePath) || !fs.existsSync(conversationStorePath)) {
    return { status: 'unknown' };
  }

  let store: Record<string, unknown>;
  try {
    const parsed = JSON.parse(fs.readFileSync(conversationStorePath, 'utf8'));
    if (!isRecord(parsed)) return { status: 'unknown' };
    store = parsed;
  } catch {
    return { status: 'unknown' };
  }

  const messages = collectConversationMessages(store);
  let sawRunning = false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const acpRun = getMessageAcpRun(messages[index]);
    if (!acpRun || !acpRunMatchesRequest(acpRun, params)) continue;
    const status = normalizeRunStatus(acpRun.status);
    if (status === 'completed') {
      return {
        status: 'completed',
        result: createAcpRunResultFromConversation({
          runId: params.runId,
          threadId: params.threadId,
          provider: params.provider,
          acpRun,
          messages,
        }),
      };
    }
    if (status === 'failed') {
      return {
        status: 'failed',
        ...resolveAcpRunFailure(acpRun),
      };
    }
    if (status === 'running') sawRunning = true;
  }
  return { status: sawRunning ? 'running' : 'unknown' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmAcpNoResponseState(params: {
  conversationStorePath?: unknown;
  runId: string;
  threadId: string;
  conversationId: string;
  provider: string;
  timeoutMs: number;
}): Promise<AcpConversationRunState> {
  let state = resolveAcpConversationRunState(params);
  if (state.status === 'completed' || state.status === 'failed') return state;
  const conversationStorePath = safeText(params.conversationStorePath);
  if (!conversationStorePath || !path.isAbsolute(conversationStorePath)) return state;

  const deadline = Date.now() + Math.max(0, params.timeoutMs);
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await delay(Math.min(ACP_NO_RESPONSE_CONFIRMATION_POLL_INTERVAL_MS, remaining));
    state = resolveAcpConversationRunState(params);
    if (state.status === 'completed' || state.status === 'failed') return state;
  }
  return state;
}

async function persistRunArtifactsSafely(params: {
  context: AiRunsProjectContext;
  targetPath: unknown;
  artifacts: AiArtifact[];
  taskId: string;
  conversationId: string;
  runId: string;
  threadId: string;
  status: 'running' | 'done' | 'error';
}): Promise<void> {
  try {
    await appendAiRunArtifactsToHistory({
      context: {
        project: { id: params.context.project.id, root: params.context.project.root },
        metadata: params.context.metadata,
      },
      targetPath: params.targetPath,
      artifacts: params.artifacts,
      taskId: params.taskId,
      conversationId: params.conversationId,
      runId: params.runId,
      threadId: params.threadId,
      status: params.status,
    });
  } catch (error) {
    console.warn('[Axhub AI Runs] Failed to persist artifact history:', error);
  }
}

async function persistRunTaskSafely(params: {
  context: AiRunsProjectContext;
  targetPath: unknown;
  task: Record<string, unknown>;
  taskId: string;
  conversationId: string;
  runId: string;
  threadId: string;
  scene: AiRunScene;
  prompt: string;
  generatorElementId?: string;
  status: 'running' | 'done' | 'error';
}): Promise<void> {
  try {
    await upsertAiRunTaskToHistory({
      context: {
        project: { id: params.context.project.id, root: params.context.project.root },
        metadata: params.context.metadata,
      },
      targetPath: params.targetPath,
      task: params.task,
      taskId: params.taskId,
      conversationId: params.conversationId,
      runId: params.runId,
      threadId: params.threadId,
      scene: params.scene,
      prompt: params.prompt,
      generatorElementId: params.generatorElementId,
      status: params.status,
    });
  } catch (error) {
    console.warn('[Axhub AI Runs] Failed to persist generation task:', error);
  }
}

export function handleAiRunsApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  handlers: AiRunsHandlers,
): boolean {
  if (pathname !== '/api/ai/runs') {
    return false;
  }

  if (req.method !== 'POST') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  readJsonBody(req).then(async (body) => {
    const request = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, any>
      : {};
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', request);
    if (!context) return;

    const rawScene = request.scene;
    const scene = normalizeScene(rawScene);
    const prompt = safeText(request.prompt);
    if (!prompt) {
      sendJson(res, { error: 'Prompt 不能为空', code: 'AI_RUN_PROMPT_EMPTY' }, { status: 400 });
      return;
    }

    const targetPrototypeId = scene === 'prototype'
      ? resolvePrototypeIdFromTargetPath(request.targetPath)
      : '';
    let prototypeSpecProjectPath = '';
    if (targetPrototypeId) {
      const spec = resolvePrototypeMainSpecStatus({
        project: context.project,
        metadata: context.metadata,
      }, targetPrototypeId);
      if (!spec.available || !spec.activePath) {
        sendJson(res, {
          error: spec.available
            ? '当前原型缺少主规格，请先创建并确认 .spec/spec.html 或 .spec/spec.md'
            : '当前原型没有可用的本地规格目录',
          code: spec.available ? 'PROTOTYPE_SPEC_REQUIRED' : 'PROTOTYPE_SPEC_UNAVAILABLE',
          action: 'open-prototype-spec',
          prototypeId: targetPrototypeId,
        }, { status: 409 });
        return;
      }
      prototypeSpecProjectPath = spec.projectPath || '';
    }

    const config = handlers.getServerConfigStoreForRequest(options).getConfig({ activeProjectRoot: context.project.root });
    const runId = safeText(request.runId || request.id) || createAcpOneShotThreadId(scene);
    const threadId = safeText(request.threadId) || runId;
    const taskId = safeText(request.taskId) || runId;
    const conversationId = safeText(request.conversationId) || threadId;
    const purposePreference = resolveAiPurposePreference(rawScene, config?.automation);
    const provider = resolvePromptProvider(
      request.preferredPromptClient || request.client || request.provider,
      purposePreference.promptClient,
    );
    const model = safeText(request.model) || safeText(purposePreference.model) || undefined;
    const agentRunConcurrency = sanitizeAgentRunConcurrency(
      request.agentRunConcurrency,
      config?.automation?.agentRunConcurrency,
    );
    const executionPrompt = prototypeSpecProjectPath
      ? [
          prompt,
          '',
          `规格文档：先读取并以 ${prototypeSpecProjectPath} 为准；修改原型时同步更新规格文档。`,
        ].join('\n')
      : prompt;
    const promptPlan = buildRunPrompt({ scene, prompt: executionPrompt, body: request, config });
    const aiRunTimeoutMs = resolveAiRunTimeoutMs(scene, config);
    const artifacts: AiArtifact[] = [];
    const emittedArtifactIds = new Set<string>();
    const emittedArtifactSignatures = new Set<string>();

    writeSseHeaders(res);
    writeSseEvent(res, 'run.accepted', {
      runId,
      threadId,
      taskId,
      conversationId,
      scene,
      projectId: context.project.id,
      projectRoot: context.project.root,
      targetPath: request.targetPath,
      generatorElementId: request.generatorElementId,
      agentRunConcurrency,
    });
    writeSseEvent(res, 'run.stage', { runId, stage: 'running' });

    try {
      let finalResult: AcpChatRunResult | null = null;
      let genericArtifactIndex = 0;
      const resolvedRuntime = await resolveAssistantRuntime({
        projectPath: context.project.root,
        assistantConfig: config?.assistant,
        autoStart: request.autoStart !== false,
        makeOrigin: getRequestUrl(req).origin,
      });
      const runtimeResponse = createAssistantRuntimeResponse({
        runtime: resolvedRuntime,
        projectId: context.project.id,
        projectRoot: context.project.root,
        req,
      });
      if (runtimeResponse.health.status !== 'ready') {
        sendAcpRuntimeUnavailableRunError(res, {
          runId,
          threadId,
          runtime: runtimeResponse,
        });
        return;
      }
      const acpApiBaseUrl = runtimeResponse.apiBaseUrl || resolveConfiguredAcpApiBaseUrl(config?.assistant);
      const enableImageGenerationBuiltinTool = shouldEnableImageGenerationBuiltinTool(scene, request.builtinToolSettings);
      await persistRunTaskSafely({
        context,
        targetPath: request.targetPath,
        task: {
          id: taskId,
          taskId,
          conversationId,
          runId,
          threadId,
          scene,
          prompt,
          sourcePrompt: safeText(request.sourcePrompt) || undefined,
          params: isRecord(request.params) ? request.params : {},
          context: isRecord(request.contextBundle)
            ? request.contextBundle
            : isRecord(request.context)
              ? request.context
              : {},
          targetPath: safeText(request.targetPath) || undefined,
          generatorElementId: safeText(request.generatorElementId) || undefined,
          status: 'running',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            provider,
            preferredPromptClient: safeText(request.preferredPromptClient),
            model: model || undefined,
            mode: safeText(request.mode || request.modeId),
            thought: safeText(request.thought || request.thoughtLevel),
            agentRunConcurrency,
          },
        },
        taskId,
        conversationId,
        runId,
        threadId,
        scene,
        prompt,
        generatorElementId: safeText(request.generatorElementId) || undefined,
        status: 'running',
      });
      const emitArtifact = async (artifact: AiArtifact) => {
        const signature = createArtifactSignature(artifact);
        if (emittedArtifactIds.has(artifact.id) || emittedArtifactSignatures.has(signature)) return;
        emittedArtifactIds.add(artifact.id);
        emittedArtifactSignatures.add(signature);
        const linkedArtifact: AiArtifact = {
          ...artifact,
          taskId,
          conversationId,
        };
        artifacts.push(linkedArtifact);
        await persistRunArtifactsSafely({
          context,
          targetPath: request.targetPath,
          artifacts: [linkedArtifact],
          taskId,
          conversationId,
          runId,
          threadId,
          status: 'running',
        });
        await persistRunTaskSafely({
          context,
          targetPath: request.targetPath,
          task: {
            id: taskId,
            taskId,
            conversationId,
            runId,
            threadId,
            scene,
            prompt,
            status: 'running',
            artifactIds: artifacts.map((item) => item.id),
            updatedAt: Date.now(),
          },
          taskId,
          conversationId,
          runId,
          threadId,
          scene,
          prompt,
          generatorElementId: safeText(request.generatorElementId) || undefined,
          status: 'running',
        });
        writeSseEvent(res, linkedArtifact.operation === 'updated' ? 'artifact.updated' : 'artifact.created', { runId, taskId, conversationId, artifact: linkedArtifact });
      };

      for await (const event of streamAcpChat({
        acpApiBaseUrl,
        id: runId,
        threadId,
        provider,
        scene,
        allowToolErrorDiagnostics: scene === 'direct',
        workspacePath: context.project.root,
        conversationStorePath: safeText(request.conversationStorePath) || undefined,
        model,
        modeId: safeText(request.modeId || request.mode) || undefined,
        thoughtLevel: safeText(request.thoughtLevel || request.thought) || undefined,
        permissionMode: safeText(request.permissionMode) || undefined,
        context: request.contextBundle || request.context,
        mcpServers: Array.isArray(request.mcpServers) ? request.mcpServers : undefined,
        builtinTools: enableImageGenerationBuiltinTool ? ['image-generation'] : undefined,
        builtinToolSettings: enableImageGenerationBuiltinTool
          ? resolveImageBuiltinToolSettings(config, promptPlan.imageSavePathPattern, request.builtinToolSettings)
          : undefined,
        messages: [buildUserMessage(threadId, promptPlan.prompt, getReferenceImages(request.referenceImages))],
      }, {
        timeoutMs: aiRunTimeoutMs,
      })) {
        finalResult = event.result;
        if (event.type === 'chunk') {
          const chunk = event.chunk;
          if (chunk.type === 'text-delta') {
            writeSseEvent(res, 'run.text.delta', { runId, delta: getChunkText(chunk, 'delta') });
          } else if (chunk.type === 'reasoning-delta') {
            writeSseEvent(res, 'run.reasoning.delta', { runId, delta: getChunkText(chunk, 'delta') });
          } else if (chunk.type === 'tool-output-available') {
            const toolOutput = event.result.toolOutputs[event.result.toolOutputs.length - 1];
            if (scene === 'image' && toolOutput && promptPlan.imageParams) {
              const imageArtifacts = await normalizeImageArtifactsFromToolOutput({
                toolOutput,
                requestParams: promptPlan.imageParams,
                fetchImpl: fetch,
              });
              for (const artifact of imageArtifacts) {
                await emitArtifact(artifact);
              }
            } else if (toolOutput && isCanvasArtifactListeningEnabled(request)) {
              const genericArtifacts = normalizeGenericArtifactsFromToolOutput({
                toolOutput,
                scene,
                body: request,
                projectRoot: context.project.root,
              });
              for (const artifact of genericArtifacts) {
                await emitArtifact(artifact);
              }
            }
          } else if (
            isCanvasArtifactListeningEnabled(request)
            && chunk.type === 'diff'
          ) {
            const artifact = normalizeGenericArtifactFromChunk({
              chunk,
              scene,
              body: request,
              projectRoot: context.project.root,
              index: genericArtifactIndex,
            });
            genericArtifactIndex += 1;
            if (artifact) await emitArtifact(artifact);
          }
        }
      }

      if (!finalResult) {
        throw new Error('ACP chat stream did not start');
      }

      if (scene === 'image' && promptPlan.imageParams && artifacts.length === 0) {
        const records = await fetchImageRecordsFallback({
          acpApiBaseUrl,
          workspacePath: context.project.root,
          threadId: finalResult.threadId,
          fetchImpl: fetch,
        });
        let index = 0;
        for (const record of records) {
          const normalized = await normalizeAcpImageRecord(record, promptPlan.imageParams, fetch);
          for (const image of normalized.images) {
            const artifact: AiArtifact = {
              id: createArtifactId('image', String(record.recordId || record.requestId || 'fallback'), index),
              kind: 'image',
              operation: 'created',
              source: { type: 'acp-image-records-fallback' },
              metadata: { ...image.metadata },
              dataUrl: image.dataUrl,
              revisedPrompt: image.revisedPrompt,
              actualParams: normalized.actualParams,
              ...(image.rawUrl ? { rawUrl: image.rawUrl } : {}),
            };
            await emitArtifact(artifact);
            index += 1;
          }
        }
      }

      await persistRunArtifactsSafely({
        context,
        targetPath: request.targetPath,
        artifacts,
        taskId,
        conversationId,
        runId,
        threadId,
        status: 'done',
      });
      await persistRunTaskSafely({
        context,
        targetPath: request.targetPath,
        task: {
          id: taskId,
          taskId,
          conversationId,
          runId,
          threadId: finalResult.threadId || threadId,
          scene,
          prompt,
          output: finalResult.output,
          status: 'done',
          artifactIds: artifacts.map((artifact) => artifact.id),
          updatedAt: Date.now(),
          finishedAt: Date.now(),
        },
        taskId,
        conversationId,
        runId,
        threadId: finalResult.threadId || threadId,
        scene,
        prompt,
        generatorElementId: safeText(request.generatorElementId) || undefined,
        status: 'done',
      });
      writeSseEvent(res, 'run.completed', createCompletedPayload({ result: finalResult, scene, artifacts, taskId, conversationId }));
      res.end();
    } catch (error: any) {
      let runError = error;
      if (
        error instanceof AcpChatRunError
        && error.code === ACP_CHAT_NO_RESPONSE_CODE
        && scene === 'direct'
      ) {
        const noResponseState = await confirmAcpNoResponseState({
          conversationStorePath: safeText(request.conversationStorePath) || undefined,
          runId,
          threadId,
          conversationId,
          provider,
          timeoutMs: aiRunTimeoutMs,
        });
        if (noResponseState.status === 'completed') {
          await persistRunArtifactsSafely({
            context,
            targetPath: request.targetPath,
            artifacts,
            taskId,
            conversationId,
            runId,
            threadId: noResponseState.result.threadId || threadId,
            status: 'done',
          });
          await persistRunTaskSafely({
            context,
            targetPath: request.targetPath,
            task: {
              id: taskId,
              taskId,
              conversationId,
              runId,
              threadId: noResponseState.result.threadId || threadId,
              scene,
              prompt,
              output: noResponseState.result.output,
              status: 'done',
              artifactIds: artifacts.map((artifact) => artifact.id),
              updatedAt: Date.now(),
              finishedAt: Date.now(),
              metadata: {
                provider,
                recoveredFrom: ACP_CHAT_NO_RESPONSE_CODE,
              },
            },
            taskId,
            conversationId,
            runId,
            threadId: noResponseState.result.threadId || threadId,
            scene,
            prompt,
            generatorElementId: safeText(request.generatorElementId) || undefined,
            status: 'done',
          });
          writeSseEvent(res, 'run.completed', createCompletedPayload({
            result: noResponseState.result,
            scene,
            artifacts,
            taskId,
            conversationId,
          }));
          res.end();
          return;
        }
        if (noResponseState.status === 'failed') {
          runError = new AcpChatRunError(noResponseState.error, {
            code: 'ACP_CHAT_STREAM_ERROR',
            statusCode: 502,
            ...(noResponseState.details !== undefined ? { details: noResponseState.details } : {}),
          });
        }
      }
      await persistRunTaskSafely({
        context,
        targetPath: request.targetPath,
        task: {
          id: taskId,
          taskId,
          conversationId,
          runId,
          threadId,
          scene,
          prompt,
          status: 'error',
          error: runError?.message || 'AI run failed',
          artifactIds: artifacts.map((artifact) => artifact.id),
          updatedAt: Date.now(),
          finishedAt: Date.now(),
          metadata: {
            provider,
            preferredPromptClient: safeText(request.preferredPromptClient),
            model: model || undefined,
            mode: safeText(request.mode || request.modeId),
            thought: safeText(request.thought || request.thoughtLevel),
            agentRunConcurrency,
            ...(runError?.code ? { errorCode: runError.code } : {}),
            ...(runError?.details !== undefined ? { errorDetails: runError.details } : {}),
          },
        },
        taskId,
        conversationId,
        runId,
        threadId,
        scene,
        prompt,
        generatorElementId: safeText(request.generatorElementId) || undefined,
        status: 'error',
      });
      if (runError instanceof AcpChatRunError) {
        sendRunError(res, runError, {
          runId,
          conversationId,
          threadId: runError.result?.threadId || threadId,
          output: runError.result?.output,
          errors: runError.result?.errors,
          chunk: runError.result?.errors.find((entry) => entry.chunk)?.chunk,
          rawResponsePayload: runError.result ? createPersistableRawResponsePayload(runError.result.toolOutputs) : undefined,
        });
        return;
      }
      sendRunError(res, runError, { runId, conversationId, threadId });
    }
  }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));

  return true;
}
