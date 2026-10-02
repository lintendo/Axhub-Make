import { getGenerationArtifactHistoryStore } from './generationArtifactHistoryStore';
import { requireProjectScope } from '../../services/projectScope';

export interface AiRunClientRequest {
  projectId: string;
  scene: string;
  prompt: string;
  runId?: string;
  threadId?: string;
  taskId?: string;
  conversationId?: string;
  preferredPromptClient?: string | null;
  client?: string | null;
  context?: unknown;
  contextBundle?: unknown;
  model?: string | null;
  mode?: string | null;
  thought?: string | null;
  permissionMode?: string | null;
  provider?: string | null;
  conversationStorePath?: string | null;
  params?: unknown;
  referenceImages?: string[];
  canvasId?: string;
  canvasName?: string;
  canvasFilePath?: string;
  generatorElementId?: string;
  targetElementId?: string;
  targetArtifactId?: string;
  targetPath?: string;
  agentRunConcurrency?: number;
  mcpServers?: unknown[];
  builtinToolSettings?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AiRunClientResult {
  output: string;
  runId?: string;
  threadId?: string;
}

export interface AiRunSseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface AiRunStreamResult extends AiRunClientResult {
  artifacts: Record<string, unknown>[];
  reasoning: string;
}

export interface AiRunClientError extends Error {
  code?: string;
  action?: string;
  runtime?: unknown;
  data?: Record<string, unknown>;
}

function resolveAiRunClientErrorMessage(data: Record<string, unknown>): string {
  switch (data.code) {
    case 'ACP_CHAT_CANCEL_FAILED':
      return '当前 AI 任务仍在处理中，停止失败，本次新请求未发送。请稍后重试。';
    case 'ACP_CHAT_CANCELLED_BUT_SEND_FAILED':
      return '已停止上一轮 AI 任务，但新请求发送失败。请重试。';
    case 'ACP_CHAT_SEND_FAILED':
      return 'AI 请求发送失败。请检查本地 ACP 服务或稍后重试。';
    default:
      return String(data.error || 'AI 执行失败');
  }
}

function createAiRunClientError(data: Record<string, unknown>): AiRunClientError {
  const error = new Error(resolveAiRunClientErrorMessage(data)) as AiRunClientError;
  if (typeof data.code === 'string') error.code = data.code;
  if (typeof data.action === 'string') error.action = data.action;
  if (data.runtime && typeof data.runtime === 'object') error.runtime = data.runtime;
  error.data = data;
  return error;
}

function normalizeAiRunsApiOrigin(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\/+$/u, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

export function resolveAiRunsApiUrl(): string {
  const globals = typeof window === 'undefined'
    ? null
    : window as unknown as {
      __AXHUB_MAKE_API_ORIGIN__?: unknown;
    };
  const makeApiOrigin = normalizeAiRunsApiOrigin(globals?.__AXHUB_MAKE_API_ORIGIN__);
  return makeApiOrigin ? `${makeApiOrigin}/api/ai/runs` : '/api/ai/runs';
}

export function parseAiRunSseEvent(rawEvent: string): AiRunSseEvent[] {
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

export async function runAiText(params: AiRunClientRequest): Promise<AiRunClientResult> {
  const result = await runAiStream(params);
  return {
    output: result.output,
    ...(result.runId ? { runId: result.runId } : {}),
    ...(result.threadId ? { threadId: result.threadId } : {}),
  };
}

export async function runAiStream(
  params: AiRunClientRequest,
  onEvent?: (event: AiRunSseEvent) => void | Promise<void>,
): Promise<AiRunStreamResult> {
  const scope = requireProjectScope(params.projectId);
  const artifactScope = { projectId: scope.projectId, targetPath: params.targetPath };
  const response = await fetch(resolveAiRunsApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      scene: params.scene,
      prompt: params.prompt,
      runId: params.runId,
      threadId: params.threadId,
      taskId: params.taskId,
      conversationId: params.conversationId,
      preferredPromptClient: params.preferredPromptClient,
      client: params.client,
      projectId: scope.projectId,
      context: params.context,
      contextBundle: params.contextBundle,
      model: params.model,
      mode: params.mode,
      thought: params.thought,
      permissionMode: params.permissionMode,
      provider: params.provider,
      conversationStorePath: params.conversationStorePath,
      params: params.params,
      referenceImages: params.referenceImages,
      canvasId: params.canvasId,
      canvasName: params.canvasName,
      canvasFilePath: params.canvasFilePath,
      generatorElementId: params.generatorElementId,
      targetElementId: params.targetElementId,
      targetArtifactId: params.targetArtifactId,
      targetPath: params.targetPath,
      agentRunConcurrency: params.agentRunConcurrency,
      mcpServers: params.mcpServers,
      builtinToolSettings: params.builtinToolSettings,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String(body?.error || 'AI 执行失败'));
  }
  if (!response.body) {
    throw new Error('AI run response body 不可读取');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let reasoning = '';
  let runId = '';
  let threadId = '';
  const artifacts: Record<string, unknown>[] = [];

  const handleRawEvent = async (rawEvent: string) => {
    for (const event of parseAiRunSseEvent(rawEvent)) {
      await onEvent?.(event);
      if (event.event === 'run.accepted') {
        runId = String(event.data.runId || runId);
        threadId = String(event.data.threadId || threadId);
      } else if (event.event === 'run.text.delta') {
        output += typeof event.data.delta === 'string' ? event.data.delta : '';
      } else if (event.event === 'run.reasoning.delta') {
        reasoning += typeof event.data.delta === 'string' ? event.data.delta : '';
      } else if (event.event === 'artifact.created' || event.event === 'artifact.updated') {
        if (event.data.artifact && typeof event.data.artifact === 'object' && !Array.isArray(event.data.artifact)) {
          artifacts.push(event.data.artifact as Record<string, unknown>);
          getGenerationArtifactHistoryStore().upsertArtifact(event.data.artifact, { status: 'running', scope: artifactScope });
        }
      } else if (event.event === 'run.completed') {
        output = typeof event.data.output === 'string' ? event.data.output : output;
        reasoning = typeof event.data.reasoning === 'string' ? event.data.reasoning : reasoning;
        runId = String(event.data.runId || runId);
        threadId = String(event.data.threadId || threadId);
        if (Array.isArray(event.data.artifacts)) {
          artifacts.splice(
            0,
            artifacts.length,
            ...event.data.artifacts.filter((artifact): artifact is Record<string, unknown> => (
              Boolean(artifact && typeof artifact === 'object' && !Array.isArray(artifact))
            )),
          );
          for (const artifact of artifacts) {
            getGenerationArtifactHistoryStore().upsertArtifact(artifact, { status: 'done', scope: artifactScope });
          }
        }
      } else if (event.event === 'run.error') {
        throw createAiRunClientError(event.data);
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const match = /\r?\n\r?\n/u.exec(buffer);
      if (!match || match.index === undefined) break;
      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      await handleRawEvent(rawEvent);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) await handleRawEvent(buffer);

  return {
    output,
    reasoning,
    artifacts,
    ...(runId ? { runId } : {}),
    ...(threadId ? { threadId } : {}),
  };
}
