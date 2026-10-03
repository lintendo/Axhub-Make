import { randomUUID } from 'node:crypto';

import { runAcpChatCommand, type AcpChatRunResult } from './acpChatRunner.ts';
import { createAssistantWorkDispatcher, type AssistantWorkAcpAdapter, type AssistantWorkAcpRuntimeStatus, type AssistantWorkDispatcher } from './assistantWorkDispatcher.ts';
import { createCanvasWorkStore, type CanvasWorkStore } from './assistantWorkStore.ts';

interface RuntimeEntry {
  store: CanvasWorkStore;
  dispatcher: AssistantWorkDispatcher;
  ready: Promise<void>;
}

const runtimes = new Map<string, RuntimeEntry>();

function text(value: unknown, maximum = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function resultRevisionFromToolOutputs(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.match(/"resultRevision"\s*:\s*"([^"]+)"/u)?.[1]?.slice(0, 256) || '';
}

function createRuntimeAdapter(options: {
  projectRoot: string;
  acpApiBaseUrl: string;
  projectId: string;
  mcpUrl: string;
  mcpToken?: string;
  provider?: string;
  model?: string | null;
}): AssistantWorkAcpAdapter {
  const statuses = new Map<string, AssistantWorkAcpRuntimeStatus>();
  const controllers = new Map<string, AbortController>();
  const listeners = new Map<string, Set<(status: AssistantWorkAcpRuntimeStatus) => void | Promise<void>>>();

  function publish(threadId: string, status: AssistantWorkAcpRuntimeStatus): void {
    statuses.set(threadId, status);
    for (const listener of listeners.get(threadId) || []) void listener(status);
  }

  async function queryDurableRuntime(threadId: string): Promise<AssistantWorkAcpRuntimeStatus | null> {
    try {
      const endpoint = new URL(`${options.acpApiBaseUrl.replace(/\/chat$/u, '')}/conversations/${encodeURIComponent(threadId)}/runtime`);
      endpoint.searchParams.set('workspacePath', options.projectRoot);
      endpoint.searchParams.set('conversationStorePath', `${options.projectRoot}/.axhub/make/runtime/assistant-work/conversations/${threadId}.json`);
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      const source = body && typeof body.runtime === 'object' && body.runtime ? body.runtime as Record<string, unknown> : body || {};
      const runState = typeof source.runState === 'string' ? source.runState : typeof source.status === 'string' ? source.status : undefined;
      if (!runState) return null;
      return {
        runState,
        ...(typeof source.runId === 'string' ? { runId: source.runId } : {}),
        ...(typeof source.error === 'string' ? { error: source.error } : {}),
        ...(typeof source.errorCode === 'string' ? { errorCode: source.errorCode } : {}),
      };
    } catch {
      return null;
    }
  }

  return {
    async createThread() {
      return { threadId: `canvas-work-thread-${randomUUID()}` };
    },
    async createRun({ threadId, objective, operationId, work }) {
      const runId = `canvas-work-run-${randomUUID()}`;
      const controller = new AbortController();
      controllers.set(runId, controller);
      publish(threadId, { runId, runState: 'running' });
      const mcpUrl = new URL(options.mcpUrl);
      mcpUrl.searchParams.set('projectId', options.projectId);
      mcpUrl.searchParams.set('workId', work.workId);
      mcpUrl.searchParams.set('resourcePath', work.resourcePath);
      void runAcpChatCommand({
        acpApiBaseUrl: options.acpApiBaseUrl,
        id: runId,
        threadId,
        provider: options.provider || 'codex',
        model: options.model || undefined,
        workspacePath: options.projectRoot,
        conversationStorePath: `${options.projectRoot}/.axhub/make/runtime/assistant-work/conversations/${threadId}.json`,
        prompt: objective,
        scene: 'canvas-assistant-work',
        system: 'Perform the requested canvas task through the server-provided axhub-canvas MCP only. Read the current canvas and revision before every mutation. Never write files directly.',
        mcpServers: [{
          name: 'axhub-canvas',
          type: 'http',
          url: mcpUrl.toString(),
          ...(options.mcpToken ? {
            headers: [{ name: 'x-axhub-canvas-mcp-token', value: options.mcpToken }],
          } : {}),
        }],
        context: { projectId: options.projectId, resourcePath: work.resourcePath, workId: work.workId, operationId },
      }, { signal: controller.signal }).then((result: AcpChatRunResult) => {
        const conflict = result.errors.some((entry) => entry.message.includes('CANVAS_REVISION_CONFLICT'))
          || JSON.stringify(result.toolOutputs).includes('CANVAS_REVISION_CONFLICT');
        publish(threadId, {
          runId,
          runState: conflict ? 'error' : 'completed',
          ...(resultRevisionFromToolOutputs(result.toolOutputs) ? { resultRevision: resultRevisionFromToolOutputs(result.toolOutputs) } : {}),
          ...(conflict ? { errorCode: 'CANVAS_REVISION_CONFLICT', error: 'Canvas revision conflict.' } : {}),
          ...(!conflict && text(result.output, 2_000) ? { summary: text(result.output, 2_000) } : {}),
        });
      }).catch((error) => {
        const aborted = controller.signal.aborted;
        publish(threadId, { runId, runState: aborted ? 'aborted' : 'error', error: error instanceof Error ? error.message : 'ACP run failed' });
      }).finally(() => {
        controllers.delete(runId);
      });
      return { runId };
    },
    async queryRuntime({ threadId }) {
      return statuses.get(threadId) || await queryDurableRuntime(threadId);
    },
    subscribeRuntime({ threadId, runId }, listener) {
      let set = listeners.get(threadId);
      if (!set) { set = new Set(); listeners.set(threadId, set); }
      set.add(listener);
      const current = statuses.get(threadId);
      if (current && (!runId || current.runId === runId)) void listener(current);
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let resolveDone!: () => void;
      const done = new Promise<void>((resolve) => { resolveDone = resolve; });
      const abort = () => {
        if (pollTimer) clearInterval(pollTimer);
        set?.delete(listener);
        if (set?.size === 0) listeners.delete(threadId);
        resolveDone();
      };
      const wrapped = async (status: AssistantWorkAcpRuntimeStatus) => {
        if (runId && status.runId && status.runId !== runId) return;
        await listener(status);
        if (status.runState === 'completed' || status.runState === 'aborted' || status.runState === 'error') {
          if (pollTimer) clearInterval(pollTimer);
          set?.delete(listener);
          resolveDone();
        }
      };
      set.delete(listener);
      set.add(wrapped);
      pollTimer = setInterval(() => {
        void queryDurableRuntime(threadId).then((status) => {
          if (status) publish(threadId, status);
        });
      }, 1_000);
      pollTimer.unref?.();
      return { abort, done };
    },
    async abortRun({ runId }) {
      if (runId) controllers.get(runId)?.abort();
    },
  };
}

export function getAssistantWorkRuntime(options: {
  projectRoot: string;
  projectId: string;
  acpApiBaseUrl: string;
  mcpUrl: string;
  mcpToken?: string;
  provider?: string;
  model?: string | null;
  concurrency?: number;
}): RuntimeEntry {
  const key = `${options.projectId}\u0000${options.projectRoot}`;
  const existing = runtimes.get(key);
  if (existing) return existing;
  const store = createCanvasWorkStore({ projectRoot: options.projectRoot, projectId: options.projectId });
  const dispatcher = createAssistantWorkDispatcher({
    store,
    acp: createRuntimeAdapter(options),
    concurrency: options.concurrency,
  });
  const ready = store.listResourcePaths()
    .then((resources) => dispatcher.recoverAll(resources))
    .catch(() => undefined);
  const entry = { store, dispatcher, ready };
  runtimes.set(key, entry);
  return entry;
}

export async function stopAssistantWorkRuntimes(): Promise<void> {
  await Promise.all([...runtimes.values()].map((runtime) => runtime.dispatcher.stop()));
  runtimes.clear();
}
