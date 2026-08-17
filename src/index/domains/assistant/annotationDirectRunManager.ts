import type { ElementLocator } from '@/common/web-editor-types';

export interface AnnotationDirectRunTaskRef {
  provider: string | null;
  sessionId: string | null;
  requestId: string | null;
  error?: string | null;
  code?: string | null;
  output?: string | null;
  chunk?: unknown;
  details?: unknown;
}

export interface AnnotationDirectRunEditingTarget {
  commentId?: string;
  pane?: 'primary' | 'secondary';
  iframe?: HTMLIFrameElement | null;
  elementKey: string;
  targetRef?: {
    locator?: ElementLocator | null;
    label?: string | null;
  } | null;
}

export interface AnnotationDirectRunSubmitPayload {
  provider?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
}

export interface AnnotationDirectRunSubmitRequest<TContext> {
  context: TContext;
  prompt: string;
  editingTargets?: AnnotationDirectRunEditingTarget[];
  mcpServers?: unknown[];
  signal: AbortSignal;
  onPrepared?: (payload: AnnotationDirectRunSubmitPayload) => void | Promise<void>;
  onAccepted?: (payload: AnnotationDirectRunSubmitPayload) => void | Promise<void>;
  /** Pass-through stream callback for host-owned transcript surfaces. */
  onEvent?: (event: unknown) => void | Promise<void>;
}

export interface AnnotationDirectRunPreflightResult {
  kind: 'preflight-handled';
}

export type AnnotationDirectRunSubmitResult =
  | boolean
  | void
  | AnnotationDirectRunPreflightResult
  | {
      runId?: string | null;
      threadId?: string | null;
      conversationId?: string | null;
      provider?: string | null;
    };

export type AnnotationDirectRunEvent =
  | {
      type: 'started';
      runKey: string;
      taskRef: AnnotationDirectRunTaskRef;
      editingTargets?: AnnotationDirectRunEditingTarget[];
    }
  | {
      type: 'prepared' | 'accepted';
      runKey: string;
      taskRef: AnnotationDirectRunTaskRef;
      editingTargets?: AnnotationDirectRunEditingTarget[];
    }
  | {
      type: 'completed' | 'aborted';
      runKey: string;
      taskRef: AnnotationDirectRunTaskRef;
      editingTargets?: AnnotationDirectRunEditingTarget[];
    }
  | {
      type: 'skipped';
      runKey: string;
      taskRef: AnnotationDirectRunTaskRef;
      editingTargets?: AnnotationDirectRunEditingTarget[];
    }
  | {
      type: 'error';
      runKey: string;
      taskRef: AnnotationDirectRunTaskRef;
      error: unknown;
      editingTargets?: AnnotationDirectRunEditingTarget[];
    }
  | {
      type: 'settled';
      runKey: string;
      activeRunCount: number;
    };

type AnnotationDirectRunTerminalEvent = Extract<
  AnnotationDirectRunEvent,
  { type: 'completed' | 'aborted' | 'error' | 'skipped' }
>;

export type AnnotationDirectRunEventListener = (
  event: AnnotationDirectRunEvent,
) => void | Promise<void>;

export interface AnnotationDirectRunOperationState {
  operationId: string;
  executionId: string;
  phase: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export function createAnnotationDirectRunPreflightResult(): AnnotationDirectRunPreflightResult {
  return { kind: 'preflight-handled' };
}

function isAnnotationDirectRunPreflightResult(
  value: AnnotationDirectRunSubmitResult,
): value is AnnotationDirectRunPreflightResult {
  return Boolean(
    value
    && typeof value === 'object'
    && 'kind' in value
    && value.kind === 'preflight-handled',
  );
}

export interface AnnotationDirectRunStartOptions<TContext> {
  context: TContext;
  prompt: string;
  /** Optional host operation id; keeps cancellation on the existing registry targeted. */
  requestId?: string;
  maxActiveRuns: number;
  editingTargets?: AnnotationDirectRunEditingTarget[];
  /** Existing direct-run MCP configuration supplied by the caller. */
  mcpServers?: unknown[];
  submit: (
    request: AnnotationDirectRunSubmitRequest<TContext>,
  ) => Promise<AnnotationDirectRunSubmitResult>;
  onEvent?: AnnotationDirectRunEventListener;
  /** Observes source stream data without creating another task/event store. */
  onStreamEvent?: (event: unknown) => void | Promise<void>;
}

export type AnnotationDirectRunStartResult =
  | {
      started: true;
      runKey: string;
      controller: AbortController;
      promise: Promise<boolean>;
      abort: () => Promise<boolean>;
    }
  | {
      started: false;
      reason: 'concurrency';
      activeRunCount: number;
    };

interface ActiveAnnotationDirectRun {
  runKey: string;
  operationId: string;
  controller: AbortController;
  taskRef: AnnotationDirectRunTaskRef;
  editingTargets?: AnnotationDirectRunEditingTarget[];
  onEvent?: AnnotationDirectRunEventListener;
  terminalEmitted: boolean;
  operationState: AnnotationDirectRunOperationState | null;
}

export interface AnnotationDirectRunRegistry {
  startRun<TContext>(
    options: AnnotationDirectRunStartOptions<TContext>,
  ): AnnotationDirectRunStartResult;
  /** Abort exactly one existing run by its host task/session/request identifier. */
  abortRun(taskId: string): Promise<boolean>;
  abortAll(): Promise<number>;
  getActiveRunCount(): number;
  getOperation(operationId: string): AnnotationDirectRunOperationState | null;
}

function defaultCreateRequestId(): string {
  return `annotation-direct-${Date.now()}`;
}

function isAbortError(error: unknown): boolean {
  const name = typeof (error as { name?: unknown } | null)?.name === 'string'
    ? String((error as { name?: string }).name)
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return name === 'AbortError' || message.includes('aborted');
}

function normalizeTaskRef(
  payload: AnnotationDirectRunSubmitPayload | null | undefined,
  fallback: AnnotationDirectRunTaskRef,
): AnnotationDirectRunTaskRef {
  return {
    provider: String(payload?.provider || fallback.provider || 'api') || null,
    sessionId: String(payload?.threadId || payload?.conversationId || fallback.sessionId || '') || null,
    requestId: String(payload?.runId || fallback.requestId || '') || null,
  };
}

async function emitRunEvent(
  activeRun: ActiveAnnotationDirectRun,
  event: AnnotationDirectRunEvent,
): Promise<void> {
  if (activeRun.operationState) {
    if (event.type === 'started') activeRun.operationState.phase = 'running';
    if (event.type === 'prepared' || event.type === 'accepted') activeRun.operationState.phase = 'accepted';
    if (event.type === 'completed') activeRun.operationState.phase = 'completed';
    if (event.type === 'aborted') activeRun.operationState.phase = 'cancelled';
    if (event.type === 'error' || event.type === 'skipped') activeRun.operationState.phase = 'failed';
  }
  await activeRun.onEvent?.(event);
}

async function emitTerminalOnce(
  activeRun: ActiveAnnotationDirectRun,
  event: AnnotationDirectRunTerminalEvent,
): Promise<boolean> {
  if (activeRun.terminalEmitted) {
    return false;
  }
  activeRun.terminalEmitted = true;
  await emitRunEvent(activeRun, event);
  return true;
}

export function createAnnotationDirectRunRegistry(options: {
  createRequestId?: () => string;
} = {}): AnnotationDirectRunRegistry {
  const createRequestId = options.createRequestId || defaultCreateRequestId;
  const activeRuns = new Map<string, ActiveAnnotationDirectRun>();
  const resultsByRequestId = new Map<string, Extract<AnnotationDirectRunStartResult, { started: true }>>();
  const operationsByRequestId = new Map<string, AnnotationDirectRunOperationState>();
  let sequence = 0;

  function getActiveRunCount(): number {
    return Array.from(activeRuns.values())
      .filter((activeRun) => !activeRun.controller.signal.aborted)
      .length;
  }

  function getOperation(operationId: string): AnnotationDirectRunOperationState | null {
    const normalized = String(operationId || '').trim();
    const operation = normalized ? operationsByRequestId.get(normalized) : null;
    return operation ? { ...operation } : null;
  }

  function startRun<TContext>(
    startOptions: AnnotationDirectRunStartOptions<TContext>,
  ): AnnotationDirectRunStartResult {
    const requestedOperationId = String(startOptions.requestId || '').trim();
    const requestId = requestedOperationId || createRequestId();
    const existingResult = requestedOperationId
      ? resultsByRequestId.get(requestedOperationId)
      : undefined;
    if (existingResult) return existingResult;
    const activeRunCount = getActiveRunCount();
    const maxActiveRuns = Math.max(1, Math.floor(Number(startOptions.maxActiveRuns) || 1));
    if (activeRunCount >= maxActiveRuns) {
      return {
        started: false,
        reason: 'concurrency',
        activeRunCount,
      };
    }

    const controller = new AbortController();
    sequence += 1;
    const runKey = `${requestId}-${sequence}`;
    const activeRun: ActiveAnnotationDirectRun = {
      runKey,
      operationId: requestId,
      controller,
      taskRef: {
        provider: 'api',
        sessionId: null,
        requestId,
      },
      editingTargets: startOptions.editingTargets,
      onEvent: startOptions.onEvent,
      terminalEmitted: false,
      operationState: requestedOperationId
        ? {
            operationId: requestedOperationId,
            executionId: requestedOperationId,
            phase: 'running',
          }
        : null,
    };
    if (activeRun.operationState) {
      operationsByRequestId.set(requestedOperationId, activeRun.operationState);
    }
    activeRuns.set(runKey, activeRun);

    const promise = (async () => {
      try {
        await emitRunEvent(activeRun, {
          type: 'started',
          runKey,
          taskRef: activeRun.taskRef,
          editingTargets: activeRun.editingTargets,
        });
        if (controller.signal.aborted) {
          await emitTerminalOnce(activeRun, {
            type: 'aborted',
            runKey,
            taskRef: activeRun.taskRef,
            editingTargets: activeRun.editingTargets,
          });
          return false;
        }
        const submitted = await startOptions.submit({
          context: startOptions.context,
          prompt: startOptions.prompt,
          editingTargets: activeRun.editingTargets,
          mcpServers: startOptions.mcpServers,
          signal: controller.signal,
          onPrepared: async (payload) => {
            activeRun.taskRef = normalizeTaskRef(payload, activeRun.taskRef);
            await emitRunEvent(activeRun, {
              type: 'prepared',
              runKey,
              taskRef: activeRun.taskRef,
              editingTargets: activeRun.editingTargets,
            });
          },
          onAccepted: async (payload) => {
            activeRun.taskRef = normalizeTaskRef(payload, activeRun.taskRef);
            await emitRunEvent(activeRun, {
              type: 'accepted',
              runKey,
              taskRef: activeRun.taskRef,
              editingTargets: activeRun.editingTargets,
            });
          },
          onEvent: async (event) => {
            await startOptions.onStreamEvent?.(event);
          },
        });
        if (controller.signal.aborted) {
          await emitTerminalOnce(activeRun, {
            type: 'aborted',
            runKey,
            taskRef: activeRun.taskRef,
            editingTargets: activeRun.editingTargets,
          });
          return false;
        }
        if (isAnnotationDirectRunPreflightResult(submitted)) {
          await emitTerminalOnce(activeRun, {
            type: 'skipped',
            runKey,
            taskRef: activeRun.taskRef,
            editingTargets: activeRun.editingTargets,
          });
          return true;
        }
        if (submitted === false) {
          throw new Error('AI execution failed');
        }
        if (submitted && typeof submitted === 'object') {
          activeRun.taskRef = normalizeTaskRef(submitted, activeRun.taskRef);
        }
        await emitTerminalOnce(activeRun, {
          type: 'completed',
          runKey,
          taskRef: activeRun.taskRef,
          editingTargets: activeRun.editingTargets,
        });
        return true;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          await emitTerminalOnce(activeRun, {
            type: 'aborted',
            runKey,
            taskRef: activeRun.taskRef,
            editingTargets: activeRun.editingTargets,
          });
        } else {
          await emitTerminalOnce(activeRun, {
            type: 'error',
            runKey,
            taskRef: activeRun.taskRef,
            error,
            editingTargets: activeRun.editingTargets,
          });
        }
        return false;
      } finally {
        activeRuns.delete(runKey);
        await emitRunEvent(activeRun, {
          type: 'settled',
          runKey,
          activeRunCount: getActiveRunCount(),
        });
      }
    })();

    const result: Extract<AnnotationDirectRunStartResult, { started: true }> = {
      started: true,
      runKey,
      controller,
      promise,
      abort: async () => {
        if (controller.signal.aborted) {
          return false;
        }
        controller.abort();
        await emitTerminalOnce(activeRun, {
          type: 'aborted',
          runKey,
          taskRef: activeRun.taskRef,
          editingTargets: activeRun.editingTargets,
        });
        return true;
      },
    };
    if (!requestedOperationId) return result;
    resultsByRequestId.set(requestedOperationId, result);
    if (resultsByRequestId.size > 200) {
      const activeRequestIds = new Set(
        Array.from(activeRuns.values())
          .map((run) => run.operationId)
          .filter(Boolean),
      );
      for (const candidateRequestId of resultsByRequestId.keys()) {
        if (candidateRequestId === requestedOperationId || activeRequestIds.has(candidateRequestId)) continue;
        resultsByRequestId.delete(candidateRequestId);
        operationsByRequestId.delete(candidateRequestId);
        if (resultsByRequestId.size <= 200) break;
      }
    }
    return result;
  }

  async function abortRun(taskId: string): Promise<boolean> {
    const normalizedTaskId = String(taskId || '').trim();
    if (!normalizedTaskId) return false;
    const activeRun = Array.from(activeRuns.values()).find((candidate) => (
      !candidate.controller.signal.aborted
      && (
        candidate.runKey === normalizedTaskId
        || candidate.runKey.startsWith(`${normalizedTaskId}-`)
        || candidate.taskRef.sessionId === normalizedTaskId
        || candidate.taskRef.requestId === normalizedTaskId
      )
    ));
    if (!activeRun) return false;
    activeRun.controller.abort();
    await emitTerminalOnce(activeRun, {
      type: 'aborted',
      runKey: activeRun.runKey,
      taskRef: activeRun.taskRef,
      editingTargets: activeRun.editingTargets,
    });
    return true;
  }

  async function abortAll(): Promise<number> {
    const activeRunList = Array.from(activeRuns.values())
      .filter((activeRun) => !activeRun.controller.signal.aborted);
    await Promise.all(activeRunList.map(async (activeRun) => {
      activeRun.controller.abort();
      await emitTerminalOnce(activeRun, {
        type: 'aborted',
        runKey: activeRun.runKey,
        taskRef: activeRun.taskRef,
        editingTargets: activeRun.editingTargets,
      });
    }));
    return activeRunList.length;
  }

  return {
    startRun,
    abortRun,
    abortAll,
    getActiveRunCount,
    getOperation,
  };
}
