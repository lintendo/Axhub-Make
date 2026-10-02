import { randomUUID } from 'node:crypto';

import {
  isTerminalAssistantWorkStatus,
  mapAcpRunStateToWorkStatus,
  type AssistantWorkSnapshot,
  type AssistantWorkStatus,
  type CanvasWorkRecordV1,
} from './assistantWorkProtocol.ts';
import {
  CanvasWorkStoreError,
  type CanvasWorkStore,
} from './assistantWorkStore.ts';

export interface AssistantWorkAcpRuntimeStatus {
  runState?: string;
  runId?: string;
  error?: string;
  errorCode?: string;
  summary?: string;
  resultRevision?: string;
}

export interface AssistantWorkAcpAdapter {
  createThread(input: { work: CanvasWorkRecordV1 }): Promise<{ threadId: string }>;
  createRun(input: { work: CanvasWorkRecordV1; threadId: string; objective: string; operationId: string }): Promise<{ runId: string }>;
  queryRuntime(input: { threadId: string }): Promise<AssistantWorkAcpRuntimeStatus | null>;
  subscribeRuntime(
    input: { threadId: string; runId?: string },
    listener: (status: AssistantWorkAcpRuntimeStatus) => void | Promise<void>,
  ): { abort(): void; done: Promise<void> };
  abortRun(input: { threadId: string; runId?: string }): Promise<void>;
}

export class AssistantWorkDispatcherError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AssistantWorkDispatcherError';
    this.code = code;
  }
}

interface ActiveRun {
  workId: string;
  resourcePath: string;
  threadId: string;
  runId: string;
  subscription: { abort(): void; done: Promise<void> } | null;
}

export interface AssistantWorkDispatcher {
  start(work: CanvasWorkRecordV1): Promise<AssistantWorkSnapshot>;
  followUp(resourcePath: string, workId: string, input: { operationId: string; content: string; baseRevision: string }): Promise<AssistantWorkSnapshot>;
  cancel(resourcePath: string, workId: string, operationId: string): Promise<AssistantWorkSnapshot>;
  recoverAll(resources?: readonly string[]): Promise<void>;
  stop(): Promise<void>;
}

function text(value: unknown, maximum = 8_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function toSnapshot(work: CanvasWorkRecordV1): AssistantWorkSnapshot {
  return {
    workId: work.workId,
    kind: 'canvas',
    resourcePath: work.resourcePath,
    status: work.status,
    objective: work.objective,
    ...(work.summary ? { summary: work.summary } : {}),
    ...(work.errorCode ? { errorCode: work.errorCode } : {}),
    ...(work.threadId ? { threadId: work.threadId } : {}),
    ...(work.runId ? { runId: work.runId } : {}),
    baseRevision: work.baseRevision,
    ...(work.resultRevision ? { resultRevision: work.resultRevision } : {}),
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    ...(work.startedAt ? { startedAt: work.startedAt } : {}),
    ...(work.completedAt ? { completedAt: work.completedAt } : {}),
  };
}

function errorCodeForRun(status: AssistantWorkAcpRuntimeStatus): 'ACP_RUN_ABORTED' | 'ACP_RUN_FAILED' {
  return status.runState === 'aborted' ? 'ACP_RUN_ABORTED' : 'ACP_RUN_FAILED';
}

export function createAssistantWorkDispatcher(options: {
  store: CanvasWorkStore;
  acp: AssistantWorkAcpAdapter;
  concurrency?: number;
  logger?: Pick<Console, 'warn'>;
}): AssistantWorkDispatcher {
  const concurrency = Math.max(1, Math.min(10, Math.floor(options.concurrency ?? 5)));
  const logger = options.logger ?? console;
  const active = new Map<string, ActiveRun>();
  const pending = new Map<string, CanvasWorkRecordV1>();
  let stopped = false;
  let pumping = false;

  async function snapshot(resourcePath: string, workId: string): Promise<AssistantWorkSnapshot> {
    const work = await options.store.findByWorkId(resourcePath, workId);
    if (!work) throw new AssistantWorkDispatcherError('WORK_NOT_FOUND', 'Canvas work was not found.');
    return toSnapshot(work);
  }

  async function handleRuntime(activeRun: ActiveRun, status: AssistantWorkAcpRuntimeStatus): Promise<void> {
    if (stopped || active.get(activeRun.workId) !== activeRun) return;
    const work = await options.store.findByWorkId(activeRun.resourcePath, activeRun.workId);
    if (!work) return;
    const mapped = mapAcpRunStateToWorkStatus(status.runState, {
      hasPendingFollowUp: Boolean(work.pendingFollowUp),
      cancelRequested: work.status === 'cancelled',
    });
    const effectiveMapped = status.errorCode === 'CANVAS_REVISION_CONFLICT' ? 'conflict' : mapped;
    if (!effectiveMapped || effectiveMapped === 'queued' || effectiveMapped === 'waiting' || effectiveMapped === 'running') return;

    activeRun.subscription?.abort();
    activeRun.subscription = null;
    active.delete(activeRun.workId);
    const hasFollowUp = Boolean(work.pendingFollowUp);
    if (effectiveMapped === 'completed' && hasFollowUp) {
      const followUp = work.pendingFollowUp!;
      const nextBaseRevision = text(status.resultRevision, 256) || work.resultRevision || work.baseRevision;
      const next = await options.store.update(activeRun.resourcePath, work.workId, (value) => ({
        ...value,
        objective: followUp.content,
        baseRevision: nextBaseRevision,
        resultRevision: nextBaseRevision,
        runId: undefined,
        pendingFollowUp: undefined,
        status: 'queued',
        summary: undefined,
        errorCode: undefined,
        startedAt: undefined,
        completedAt: undefined,
      }));
      pending.set(next.workId, next);
      await pump();
      return;
    }

    const terminalStatus: AssistantWorkStatus = effectiveMapped;
    await options.store.update(activeRun.resourcePath, work.workId, (value) => ({
      ...value,
      status: terminalStatus,
      runId: undefined,
      ...(status.resultRevision ? { resultRevision: text(status.resultRevision, 256) } : {}),
      ...(terminalStatus === 'completed' ? { summary: text(status.summary) || 'Canvas Work completed.' } : {}),
      ...(terminalStatus === 'conflict' ? { errorCode: 'CANVAS_REVISION_CONFLICT' as const } : terminalStatus !== 'completed' ? { errorCode: errorCodeForRun(status) } : {}),
      attempts: value.attempts.map((attempt) => attempt.runId === activeRun.runId ? {
        ...attempt,
        status: terminalStatus,
        ...(terminalStatus === 'completed' && status.resultRevision ? { resultRevision: text(status.resultRevision, 256) } : {}),
        ...(terminalStatus !== 'completed' ? { errorCode: terminalStatus === 'conflict' ? 'CANVAS_REVISION_CONFLICT' as const : errorCodeForRun(status) } : {}),
        completedAt: new Date().toISOString(),
      } : attempt),
      completedAt: new Date().toISOString(),
    }));
    await pump();
  }

  async function launch(work: CanvasWorkRecordV1): Promise<void> {
    if (stopped || active.size >= concurrency) {
      pending.set(work.workId, work);
      return;
    }
    let current = await options.store.findByWorkId(work.resourcePath, work.workId);
    if (!current || isTerminalAssistantWorkStatus(current.status)) return;
    const threadId = current.threadId || (await options.acp.createThread({ work: current })).threadId;
    const operationId = current.pendingFollowUp?.operationId || current.createOperationId;
    current = await options.store.update(current.resourcePath, current.workId, (value) => ({
      ...value,
      threadId,
      status: 'running',
      startedAt: value.startedAt || new Date().toISOString(),
    }));
    const objective = current.pendingFollowUp?.content || current.objective;
    let run: { runId: string };
    try {
      run = await options.acp.createRun({ work: current, threadId, objective, operationId });
    } catch (error) {
      await options.store.update(current.resourcePath, current.workId, (value) => ({
        ...value,
        status: 'failed',
        errorCode: 'ACP_RUN_REJECTED',
        completedAt: new Date().toISOString(),
      })).catch(() => undefined);
      logger.warn('[assistant-work] ACP run rejected', { code: 'ACP_RUN_REJECTED' });
      return;
    }
    current = await options.store.update(current.resourcePath, current.workId, (value) => ({
      ...value,
      threadId,
      runId: run.runId,
      attempts: [...value.attempts, {
        runId: run.runId,
        operationId,
        objective,
        status: 'running',
        baseRevision: value.baseRevision,
        startedAt: new Date().toISOString(),
      }],
    }));
    const activeRun: ActiveRun = { workId: current.workId, resourcePath: current.resourcePath, threadId, runId: run.runId, subscription: null };
    active.set(current.workId, activeRun);
    const subscription = options.acp.subscribeRuntime({ threadId, runId: run.runId }, (status) => handleRuntime(activeRun, status));
    activeRun.subscription = subscription;
    void subscription.done.catch((error) => {
      if (active.get(activeRun.workId) !== activeRun || stopped) return;
      logger.warn('[assistant-work] ACP runtime subscription closed', { code: 'ACP_RUNTIME_DISCONNECTED' });
      void options.acp.queryRuntime({ threadId }).then((status) => {
        if (status) void handleRuntime(activeRun, status);
      }).catch(() => undefined);
      void error;
    });
  }

  async function pump(): Promise<void> {
    if (pumping || stopped) return;
    pumping = true;
    try {
      while (active.size < concurrency && pending.size > 0) {
        const next = pending.values().next().value as CanvasWorkRecordV1 | undefined;
        if (!next) break;
        pending.delete(next.workId);
        await launch(next);
      }
    } finally {
      pumping = false;
    }
  }

  return {
    async start(work) {
      pending.set(work.workId, work);
      await pump();
      return snapshot(work.resourcePath, work.workId);
    },
    async followUp(resourcePath, workId, input) {
      const current = await options.store.findByWorkId(resourcePath, workId);
      if (!current) throw new AssistantWorkDispatcherError('WORK_NOT_FOUND', 'Canvas work was not found.');
      if (current.pendingFollowUp) {
        if (current.pendingFollowUp.operationId === text(input.operationId, 256)) return toSnapshot(current);
        throw new AssistantWorkDispatcherError('WORK_FOLLOW_UP_ALREADY_QUEUED', 'A follow-up is already queued for this work.');
      }
      if (current.attempts.some((attempt) => attempt.operationId === text(input.operationId, 256))) return toSnapshot(current);
      const isActive = active.has(workId) || current.status === 'running' || current.status === 'waiting';
      if (isActive) {
        const updated = await options.store.update(resourcePath, workId, (value) => ({
          ...value,
          status: 'waiting',
          pendingFollowUp: { operationId: text(input.operationId, 256), content: text(input.content, 4_000), queuedAt: new Date().toISOString() },
        }));
        return toSnapshot(updated);
      }
      const queued = await options.store.update(resourcePath, workId, (value) => ({
        ...value,
        status: 'queued',
        objective: text(input.content, 4_000),
        baseRevision: text(input.baseRevision, 256),
        resultRevision: undefined,
        summary: undefined,
        errorCode: undefined,
        startedAt: undefined,
        completedAt: undefined,
      }));
      pending.set(queued.workId, queued);
      await pump();
      return snapshot(resourcePath, workId);
    },
    async cancel(resourcePath, workId, _operationId) {
      const current = await options.store.findByWorkId(resourcePath, workId);
      if (!current) throw new AssistantWorkDispatcherError('WORK_NOT_FOUND', 'Canvas work was not found.');
      if (isTerminalAssistantWorkStatus(current.status)) return toSnapshot(current);
      const running = active.get(workId);
      if (running) {
        await options.acp.abortRun({ threadId: running.threadId, runId: running.runId });
        running.subscription?.abort();
        active.delete(workId);
      }
      pending.delete(workId);
      const cancelled = await options.store.update(resourcePath, workId, (value) => ({
        ...value,
        status: 'cancelled',
        pendingFollowUp: undefined,
        errorCode: 'WORK_CANCELLED',
        completedAt: new Date().toISOString(),
      }));
      await pump();
      return toSnapshot(cancelled);
    },
    async recoverAll(resources = []) {
      const resourcePaths = resources.length > 0 ? [...resources] : await options.store.listResourcePaths();
      for (const resourcePath of resourcePaths) {
        const listed = await options.store.list(resourcePath, { limit: 50 });
        for (const work of listed.works) {
          if (isTerminalAssistantWorkStatus(work.status) && !work.pendingFollowUp) continue;
          if (isTerminalAssistantWorkStatus(work.status) && work.pendingFollowUp) {
            const queued = await options.store.update(resourcePath, work.workId, (value) => ({
              ...value,
              status: 'queued',
              baseRevision: value.resultRevision || value.baseRevision,
              summary: undefined,
              errorCode: undefined,
              completedAt: undefined,
            }));
            pending.set(queued.workId, queued);
            continue;
          }
          if (work.threadId) {
            const runtime = await options.acp.queryRuntime({ threadId: work.threadId });
            if (runtime) {
              const mapped = mapAcpRunStateToWorkStatus(runtime.runState, { hasPendingFollowUp: Boolean(work.pendingFollowUp) });
              const recoveredRun: ActiveRun = { workId: work.workId, resourcePath, threadId: work.threadId, runId: work.runId || runtime.runId || '', subscription: null };
              if (mapped === 'running' || mapped === 'waiting') {
                active.set(work.workId, recoveredRun);
                recoveredRun.subscription = options.acp.subscribeRuntime({ threadId: work.threadId, runId: recoveredRun.runId }, (status) => handleRuntime(recoveredRun, status));
                continue;
              }
              if (mapped && mapped !== 'queued') {
                active.set(work.workId, recoveredRun);
                await handleRuntime(recoveredRun, runtime);
                continue;
              }
              if (work.runId || runtime.runId) {
                active.set(work.workId, recoveredRun);
                recoveredRun.subscription = options.acp.subscribeRuntime({ threadId: work.threadId, runId: recoveredRun.runId }, (status) => handleRuntime(recoveredRun, status));
                continue;
              }
            } else if (work.runId) {
              const recoveredRun: ActiveRun = { workId: work.workId, resourcePath, threadId: work.threadId, runId: work.runId, subscription: null };
              active.set(work.workId, recoveredRun);
              recoveredRun.subscription = options.acp.subscribeRuntime({ threadId: work.threadId, runId: work.runId }, (status) => handleRuntime(recoveredRun, status));
              continue;
            }
          }
          pending.set(work.workId, work);
        }
      }
      await pump();
    },
    async stop() {
      stopped = true;
      for (const run of active.values()) {
        run.subscription?.abort();
      }
      active.clear();
      pending.clear();
    },
  };
}

export { toSnapshot as assistantWorkSnapshotFromRecord };
