import { mapAcpOutputArtifactsToGenerationArtifacts } from './acpOutputArtifacts';
import type { CanvasAiGenerationRequest, CanvasAiGenerationResult } from './CanvasAiGenerationTool';
import type { CanvasAiRunArtifact } from './canvasAiGeneration';
import type { AiRunStreamResult } from './aiRunClient';
import type { GenerationArtifactRecord } from './generationArtifactHistoryStore';

export interface CanvasDirectRunSubmitPayload {
  provider?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
}

export interface CanvasDirectRunTaskRef {
  provider: string | null;
  sessionId: string | null;
  requestId: string | null;
}

export interface CanvasDirectRunSubmitRequest {
  request: CanvasAiGenerationRequest;
  prompt: string;
  signal: AbortSignal;
  onPrepared?: (payload: CanvasDirectRunSubmitPayload) => void | Promise<void>;
  onAccepted?: (payload: CanvasDirectRunSubmitPayload) => void | Promise<void>;
}

export type CanvasDirectRunSubmit = (
  request: CanvasDirectRunSubmitRequest,
) => Promise<AiRunStreamResult | CanvasAiGenerationResult | boolean | void>;

export interface CanvasDirectRunLifecycleEvent {
  type: 'started' | 'prepared' | 'accepted' | 'completed' | 'aborted';
  runKey: string;
  request: CanvasAiGenerationRequest;
  taskRef: CanvasDirectRunTaskRef;
  artifacts?: GenerationArtifactRecord[];
}

export interface CanvasDirectRunErrorEvent {
  type: 'error';
  runKey: string;
  request: CanvasAiGenerationRequest;
  taskRef: CanvasDirectRunTaskRef;
  error: unknown;
}

export interface CanvasDirectRunSettledEvent {
  type: 'settled';
  runKey: string;
  activeRunCount: number;
}

export type CanvasDirectRunEvent =
  | CanvasDirectRunLifecycleEvent
  | CanvasDirectRunErrorEvent
  | CanvasDirectRunSettledEvent;

export interface CanvasDirectRunResult {
  ok: boolean;
  aborted?: boolean;
  artifacts?: GenerationArtifactRecord[];
  error?: unknown;
  runId?: string;
  threadId?: string;
  message?: string;
}

type CanvasDirectRunTerminalEvent =
  | (Omit<CanvasDirectRunLifecycleEvent, 'type'> & { type: 'completed' | 'aborted' })
  | CanvasDirectRunErrorEvent;

interface ActiveCanvasDirectRun {
  runKey: string;
  controller: AbortController;
  request: CanvasAiGenerationRequest;
  taskRef: CanvasDirectRunTaskRef;
  terminalEmitted: boolean;
}

export type CanvasDirectRunStartResult =
  | {
      started: true;
      runKey: string;
      controller: AbortController;
      promise: Promise<CanvasDirectRunResult>;
      abort: () => Promise<boolean>;
    }
  | {
      started: false;
      reason: 'concurrency' | 'empty-prompt';
      activeRunCount: number;
    };

export interface CanvasDirectRunController {
  start(request: CanvasAiGenerationRequest): CanvasDirectRunStartResult;
  abortAll(): Promise<number>;
  getActiveRunCount(): number;
}

function createCanvasDirectRunId(): string {
  return `canvas-direct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePath(value: unknown): string {
  return normalizeString(value).replace(/\\/g, '/').replace(/^\/+/u, '');
}

function isAbortError(error: unknown): boolean {
  const name = typeof (error as { name?: unknown } | null)?.name === 'string'
    ? String((error as { name?: string }).name)
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return name === 'AbortError' || message.includes('aborted');
}

function normalizeTaskRef(
  payload: CanvasDirectRunSubmitPayload | null | undefined,
  fallback: CanvasDirectRunTaskRef,
): CanvasDirectRunTaskRef {
  return {
    provider: normalizeString(payload?.provider || fallback.provider || 'api') || null,
    sessionId: normalizeString(payload?.threadId || payload?.conversationId || fallback.sessionId) || null,
    requestId: normalizeString(payload?.runId || fallback.requestId) || null,
  };
}

function getArtifactTargetPath(artifact: Record<string, unknown>): string {
  const target = artifact.target && typeof artifact.target === 'object' && !Array.isArray(artifact.target)
    ? artifact.target as Record<string, unknown>
    : {};
  return normalizePath(target.path || target.targetPath || artifact.path || artifact.title);
}

function isCurrentCanvasArtifact(artifact: Record<string, unknown>, canvasFilePath: string): boolean {
  const targetPath = getArtifactTargetPath(artifact);
  return Boolean(canvasFilePath && targetPath && targetPath === canvasFilePath);
}

function normalizeCanvasDirectArtifact(
  artifact: Record<string, unknown>,
  options: {
    fallbackStatus?: GenerationArtifactRecord['status'];
    index: number;
    runId?: string;
    taskId?: string;
    threadId?: string;
  },
): GenerationArtifactRecord | null {
  const targetPath = getArtifactTargetPath(artifact);
  const kind = normalizeString(artifact.kind) as GenerationArtifactRecord['kind'];
  if (!targetPath || !['image', 'prototype', 'document', 'drawio', 'file', 'link'].includes(kind)) {
    return mapAcpOutputArtifactsToGenerationArtifacts([artifact as any], {
      fallbackStatus: options.fallbackStatus,
      runId: options.runId,
      taskId: options.taskId,
      threadId: options.threadId,
    })[0] ?? null;
  }
  const now = Date.now() + options.index;
  const id = normalizeString(artifact.id) || `${kind}:${targetPath}:${options.index}`;
  const target = artifact.target && typeof artifact.target === 'object' && !Array.isArray(artifact.target)
    ? artifact.target as Record<string, unknown>
    : { path: targetPath };
  const metadata = artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
    ? artifact.metadata as Record<string, unknown>
    : {};
  return {
    id,
    artifactId: id,
    ...(options.taskId ? { taskId: options.taskId } : {}),
    kind,
    operation: artifact.operation === 'updated' ? 'updated' : 'created',
    title: normalizeString(artifact.title || metadata.title) || targetPath,
    source: artifact.source && typeof artifact.source === 'object' && !Array.isArray(artifact.source)
      ? artifact.source as Record<string, unknown>
      : { type: 'ai-run-artifact' },
    target,
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.threadId ? { threadId: options.threadId } : {}),
    createdAt: now,
    updatedAt: now,
    status: options.fallbackStatus || 'done',
    metadata,
    ...('dataUrl' in artifact ? { dataUrl: artifact.dataUrl } : {}),
    ...('rawUrl' in artifact ? { rawUrl: artifact.rawUrl } : {}),
  } as GenerationArtifactRecord & CanvasAiRunArtifact;
}

export function mapCanvasDirectRunArtifacts(
  artifacts: readonly Record<string, unknown>[],
  options: {
    canvasFilePath?: string | null;
    fallbackStatus?: GenerationArtifactRecord['status'];
    runId?: string;
    taskId?: string;
    threadId?: string;
  },
): GenerationArtifactRecord[] {
  const canvasFilePath = normalizePath(options.canvasFilePath);
  return artifacts.flatMap((artifact, index) => {
    if (isCurrentCanvasArtifact(artifact, canvasFilePath)) return [];
    const normalized = normalizeCanvasDirectArtifact(artifact, {
      fallbackStatus: options.fallbackStatus,
      index,
      runId: options.runId,
      taskId: options.taskId,
      threadId: options.threadId,
    });
    return normalized ? [normalized] : [];
  });
}

export function createCanvasDirectRunController(options: {
  maxActiveRuns: number;
  submit: CanvasDirectRunSubmit;
  createRunKey?: () => string;
  onEvent?: (event: CanvasDirectRunEvent) => void | Promise<void>;
}): CanvasDirectRunController {
  const activeRuns = new Map<string, ActiveCanvasDirectRun>();
  const createRunKey = options.createRunKey || createCanvasDirectRunId;

  function getActiveRunCount(): number {
    return Array.from(activeRuns.values())
      .filter((activeRun) => !activeRun.controller.signal.aborted)
      .length;
  }

  async function emit(_activeRun: ActiveCanvasDirectRun, event: CanvasDirectRunEvent): Promise<void> {
    await options.onEvent?.(event);
  }

  async function emitTerminalOnce(
    activeRun: ActiveCanvasDirectRun,
    event: CanvasDirectRunTerminalEvent,
  ): Promise<boolean> {
    if (activeRun.terminalEmitted) return false;
    activeRun.terminalEmitted = true;
    await emit(activeRun, event);
    return true;
  }

  function start(request: CanvasAiGenerationRequest): CanvasDirectRunStartResult {
    const prompt = normalizeString(request.prompt);
    if (!prompt) {
      return {
        started: false,
        reason: 'empty-prompt',
        activeRunCount: getActiveRunCount(),
      };
    }
    const activeRunCount = getActiveRunCount();
    const maxActiveRuns = Math.max(1, Math.floor(Number(options.maxActiveRuns) || 1));
    if (activeRunCount >= maxActiveRuns) {
      return {
        started: false,
        reason: 'concurrency',
        activeRunCount,
      };
    }

    const controller = new AbortController();
    const runKey = createRunKey();
    const activeRun: ActiveCanvasDirectRun = {
      runKey,
      controller,
      request,
      taskRef: {
        provider: normalizeString(request.provider) || 'api',
        sessionId: null,
        requestId: runKey,
      },
      terminalEmitted: false,
    };
    activeRuns.set(runKey, activeRun);

    const promise = (async (): Promise<CanvasDirectRunResult> => {
      try {
        await emit(activeRun, { type: 'started', runKey, request, taskRef: activeRun.taskRef });
        const submitted = await options.submit({
          request,
          prompt,
          signal: controller.signal,
          onPrepared: async (payload) => {
            activeRun.taskRef = normalizeTaskRef(payload, activeRun.taskRef);
            await request.onPrepared?.(payload);
            await emit(activeRun, { type: 'prepared', runKey, request, taskRef: activeRun.taskRef });
          },
          onAccepted: async (payload) => {
            activeRun.taskRef = normalizeTaskRef(payload, activeRun.taskRef);
            await request.onAccepted?.(payload);
            await emit(activeRun, { type: 'accepted', runKey, request, taskRef: activeRun.taskRef });
          },
        });
        if (controller.signal.aborted) {
          await emitTerminalOnce(activeRun, { type: 'aborted', runKey, request, taskRef: activeRun.taskRef });
          return { ok: false, aborted: true };
        }
        if (submitted === false) {
          throw new Error('AI execution failed');
        }
        const submittedResult = submitted && typeof submitted === 'object'
          ? submitted as Partial<AiRunStreamResult & CanvasAiGenerationResult>
          : null;
        if (submittedResult && 'ok' in submittedResult) {
          if (submittedResult.ok === false) {
            throw new Error('AI execution failed');
          }
          const artifacts = Array.isArray(submittedResult.artifacts)
            ? submittedResult.artifacts
            : [];
          await emitTerminalOnce(activeRun, {
            type: 'completed',
            runKey,
            request,
            taskRef: activeRun.taskRef,
            artifacts,
          });
          return {
            ok: true,
            artifacts,
            ...(submittedResult.runId ? { runId: submittedResult.runId } : {}),
            ...(submittedResult.threadId ? { threadId: submittedResult.threadId } : {}),
            ...(normalizeString(submittedResult.message) ? { message: normalizeString(submittedResult.message) } : {}),
          };
        }
        const streamResult = submittedResult as AiRunStreamResult | null;
        const artifacts = streamResult
          ? mapCanvasDirectRunArtifacts((streamResult.artifacts || []) as Record<string, unknown>[], {
              canvasFilePath: request.canvasFilePath,
              runId: streamResult.runId,
              taskId: streamResult.runId,
              threadId: streamResult.threadId,
            })
          : [];
        await emitTerminalOnce(activeRun, {
          type: 'completed',
          runKey,
          request,
          taskRef: activeRun.taskRef,
          artifacts,
        });
        return {
          ok: true,
          artifacts,
          ...(streamResult?.runId ? { runId: streamResult.runId } : {}),
          ...(streamResult?.threadId ? { threadId: streamResult.threadId } : {}),
          ...(normalizeString(streamResult?.output) ? { message: normalizeString(streamResult?.output) } : {}),
        };
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          await emitTerminalOnce(activeRun, { type: 'aborted', runKey, request, taskRef: activeRun.taskRef });
          return { ok: false, aborted: true };
        }
        await emitTerminalOnce(activeRun, { type: 'error', runKey, request, taskRef: activeRun.taskRef, error });
        return { ok: false, error };
      } finally {
        activeRuns.delete(runKey);
        await emit(activeRun, { type: 'settled', runKey, activeRunCount: getActiveRunCount() });
      }
    })();

    return {
      started: true,
      runKey,
      controller,
      promise,
      abort: async () => {
        if (controller.signal.aborted) return false;
        controller.abort();
        await emitTerminalOnce(activeRun, { type: 'aborted', runKey, request, taskRef: activeRun.taskRef });
        return true;
      },
    };
  }

  async function abortAll(): Promise<number> {
    const activeRunList = Array.from(activeRuns.values())
      .filter((activeRun) => !activeRun.controller.signal.aborted);
    await Promise.all(activeRunList.map(async (activeRun) => {
      activeRun.controller.abort();
      await emitTerminalOnce(activeRun, {
        type: 'aborted',
        runKey: activeRun.runKey,
        request: activeRun.request,
        taskRef: activeRun.taskRef,
      });
    }));
    return activeRunList.length;
  }

  return {
    start,
    abortAll,
    getActiveRunCount,
  };
}
