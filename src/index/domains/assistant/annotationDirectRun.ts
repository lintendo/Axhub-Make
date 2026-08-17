import type { AssistantContextV1 } from '../../types';
import { getAssistantContextCurrentFilePath } from '../../utils/assistantContext';
import { runAiStream, type AiRunSseEvent, type AiRunStreamResult } from '../ai-generation/aiRunClient';
import { mapAssistantContextToAcpContextBundle } from './assistantAcpContext';
import { resolvePrototypeConversationStorePath } from './assistantResourceThread';

export interface AnnotationDirectRunTarget {
  projectScope: string;
  currentFilePath: string;
  prototypePath: string;
  conversationStorePath: string;
}

export interface PreparedAnnotationDirectRunThread {
  runId: string;
  threadId: string;
  conversationId: string;
  target: AnnotationDirectRunTarget;
}

export interface SubmitAnnotationPromptViaApiOptions {
  context: AssistantContextV1;
  prompt: string;
  projectPath?: string | null;
  projectScope?: string | null;
  projectId: string;
  preferredPromptClient?: string | null;
  scene?: string | null;
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  thought?: string | null;
  permissionMode?: string | null;
  targetPath?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  referenceImages?: string[];
  agentRunConcurrency?: number;
  mcpServers?: unknown[];
  builtinToolSettings?: Record<string, unknown>;
  createRunId?: () => string;
  onRunStarting?: (message: string) => void;
  onPrepared?: (prepared: PreparedAnnotationDirectRunThread & { provider: string | null }) => void | Promise<void>;
  onAccepted?: (payload: {
    runId: string;
    threadId: string;
    conversationId: string;
    provider: string | null;
  }) => void | Promise<void>;
  onEvent?: (event: AiRunSseEvent) => void | Promise<void>;
  signal?: AbortSignal;
}

function normalizePath(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function toPrototypeRelativePath(value: unknown): string {
  const normalized = normalizePath(value).replace(/^\/+/u, '');
  const prototypeIndex = normalized.indexOf('src/prototypes/');
  return prototypeIndex >= 0 ? normalized.slice(prototypeIndex) : normalized;
}

function createAnnotationDirectRunId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `annotation-${Date.now().toString(36)}-${random}`;
}

export function resolveAnnotationDirectRunTarget(options: {
  context: AssistantContextV1;
  projectPath?: string | null;
  projectScope?: string | null;
}): AnnotationDirectRunTarget {
  const currentFilePath = toPrototypeRelativePath(getAssistantContextCurrentFilePath(options.context));
  const match = currentFilePath.match(/^src\/prototypes\/([^/]+)(?:\/|$)/u);
  const prototypeId = match?.[1]?.trim() || '';
  const prototypePath = prototypeId ? `src/prototypes/${prototypeId}` : '';
  const conversationStorePath = resolvePrototypeConversationStorePath({
    projectPath: options.projectPath,
    resourcePath: currentFilePath,
  });
  return {
    projectScope: String(options.projectScope || options.projectPath || '').trim(),
    currentFilePath,
    prototypePath,
    conversationStorePath,
  };
}

export function prepareAnnotationDirectRunThread(options: {
  target: AnnotationDirectRunTarget;
  threadId?: string | null;
  conversationId?: string | null;
  createRunId?: () => string;
}): PreparedAnnotationDirectRunThread {
  const runId = (options.createRunId || createAnnotationDirectRunId)();
  const threadId = normalizePath(options.threadId) || runId;
  const conversationId = normalizePath(options.conversationId) || threadId;
  return {
    runId,
    threadId,
    conversationId,
    target: options.target,
  };
}

export async function submitAnnotationPromptViaApi(
  options: SubmitAnnotationPromptViaApiOptions,
): Promise<AiRunStreamResult> {
  const target = resolveAnnotationDirectRunTarget({
    context: options.context,
    projectPath: options.projectPath,
    projectScope: options.projectScope,
  });
  const prepared = prepareAnnotationDirectRunThread({
    target,
    threadId: options.threadId,
    conversationId: options.conversationId,
    createRunId: options.createRunId,
  });
  const provider = String(options.provider || '').trim() || null;
  options.onRunStarting?.('正在连接 AI，请稍等。');
  await options.onPrepared?.({ ...prepared, provider });

  return runAiStream({
    scene: String(options.scene || '').trim() || 'direct',
    prompt: options.prompt,
    runId: prepared.runId,
    threadId: prepared.threadId,
    conversationId: prepared.conversationId,
    preferredPromptClient: options.preferredPromptClient,
    provider,
    conversationStorePath: target.conversationStorePath || undefined,
    model: options.model,
    mode: options.mode,
    thought: options.thought,
    permissionMode: options.permissionMode,
    projectId: options.projectId,
    context: options.context,
    contextBundle: mapAssistantContextToAcpContextBundle(options.context),
    referenceImages: options.referenceImages,
    targetPath: toPrototypeRelativePath(options.targetPath || target.currentFilePath) || target.currentFilePath,
    agentRunConcurrency: options.agentRunConcurrency,
    mcpServers: options.mcpServers,
    builtinToolSettings: options.builtinToolSettings,
    signal: options.signal,
  }, async (event) => {
    if (event.event === 'run.accepted') {
      const acceptedThreadId = String(event.data.threadId || prepared.threadId || '').trim();
      const acceptedRunId = String(event.data.runId || prepared.runId || '').trim();
      const acceptedConversationId = String(event.data.conversationId || acceptedThreadId || prepared.conversationId || '').trim();
      await options.onAccepted?.({
        runId: acceptedRunId,
        threadId: acceptedThreadId,
        conversationId: acceptedConversationId,
        provider,
      });
    }
    await options.onEvent?.(event);
  });
}
