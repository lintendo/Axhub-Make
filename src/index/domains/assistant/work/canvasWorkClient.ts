import type {
  AssistantWorkSnapshot,
  CanvasWorkFileV1,
} from './types';

export interface CanvasContextSnapshot {
  projectId: string;
  resourcePath: string;
  sceneRevision: string | null;
  dirty: boolean;
  connected: boolean;
  [key: string]: unknown;
}

export interface CanvasWorkClient {
  getContext(): Promise<CanvasContextSnapshot>;
  capture(input?: Record<string, unknown>): Promise<unknown>;
  focus(input: Record<string, unknown>): Promise<unknown>;
  submit(input: { operationId: string; objective: string; baseRevision: string }): Promise<AssistantWorkSnapshot>;
  list(input?: { cursor?: string; limit?: number }): Promise<{ works: AssistantWorkSnapshot[]; total: number; nextCursor: string | null }>;
  get(workId: string): Promise<AssistantWorkSnapshot>;
  followUp(workId: string, input: { operationId: string; content: string; baseRevision: string }): Promise<AssistantWorkSnapshot>;
  cancel(workId: string, operationId: string): Promise<AssistantWorkSnapshot>;
  subscribe(listener: (snapshot: AssistantWorkSnapshot) => void): () => void;
  dispose(): void;
}

function text(value: unknown, maximum = 8_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function normalizeSnapshot(value: unknown): AssistantWorkSnapshot {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = ['queued', 'running', 'waiting', 'completed', 'failed', 'cancelled', 'conflict'].includes(text(source.status, 32))
    ? text(source.status, 32) as AssistantWorkSnapshot['status']
    : 'queued';
  return {
    workId: text(source.workId, 256),
    kind: 'canvas',
    resourcePath: text(source.resourcePath, 512),
    status,
    objective: text(source.objective),
    ...(text(source.summary, 2_000) ? { summary: text(source.summary, 2_000) } : {}),
    ...(text(source.errorCode, 64) ? { errorCode: text(source.errorCode, 64) as AssistantWorkSnapshot['errorCode'] } : {}),
    ...(text(source.threadId, 256) ? { threadId: text(source.threadId, 256) } : {}),
    ...(text(source.runId, 256) ? { runId: text(source.runId, 256) } : {}),
    ...(text(source.baseRevision, 256) ? { baseRevision: text(source.baseRevision, 256) } : {}),
    ...(text(source.resultRevision, 256) ? { resultRevision: text(source.resultRevision, 256) } : {}),
    createdAt: text(source.createdAt, 64),
    updatedAt: text(source.updatedAt, 64),
    ...(text(source.startedAt, 64) ? { startedAt: text(source.startedAt, 64) } : {}),
    ...(text(source.completedAt, 64) ? { completedAt: text(source.completedAt, 64) } : {}),
  };
}

function apiError(value: unknown): Error & { code?: string } {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const error = new Error(text(source.error) || 'Assistant Work request failed.');
  if (text(source.code, 128)) error.code = text(source.code, 128);
  return error;
}

export function createCanvasWorkClient(options: {
  projectId: string;
  resourcePath: string;
  fetchImpl?: typeof fetch;
  canvasCommand?: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
  eventsFactory?: (url: string) => { addEventListener(type: string, listener: (event: MessageEvent) => void): void; close(): void };
}): CanvasWorkClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseQuery = new URLSearchParams({ projectId: options.projectId, resourcePath: options.resourcePath });
  const listeners = new Set<(snapshot: AssistantWorkSnapshot) => void>();
  let events: { close(): void } | null = null;
  let disposed = false;

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(url, init);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw apiError(body);
    return body as T;
  }

  function emit(value: unknown): void {
    const snapshot = normalizeSnapshot(value);
    if (!snapshot.workId) return;
    for (const listener of listeners) listener(snapshot);
  }

  return {
    async getContext() {
      const result = await options.canvasCommand?.('canvas_get_state', { includeElements: false });
      const source = result && typeof result === 'object' ? result as Record<string, unknown> : {};
      return {
        ...source,
        projectId: options.projectId,
        resourcePath: options.resourcePath,
        sceneRevision: text(source.sceneRevision, 256) || null,
        dirty: source.dirty === true,
        connected: source.connected !== false,
      };
    },
    capture(input = {}) {
      return options.canvasCommand?.('canvas_capture', input) ?? Promise.reject(new Error('Canvas command is unavailable.'));
    },
    focus(input) {
      return options.canvasCommand?.('canvas_focus', input) ?? Promise.reject(new Error('Canvas command is unavailable.'));
    },
    async submit(input) {
      const query = new URLSearchParams(baseQuery);
      return normalizeSnapshot(await request(`/api/assistant-work?${query.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'canvas', ...input, resourcePath: options.resourcePath }),
      }));
    },
    async list(input = {}) {
      const query = new URLSearchParams(baseQuery);
      if (input.cursor) query.set('cursor', input.cursor);
      if (input.limit) query.set('limit', String(input.limit));
      const result = await request<{ works?: unknown[]; total?: number; nextCursor?: string | null }>(`/api/assistant-work?${query.toString()}`);
      return {
        works: Array.isArray(result.works) ? result.works.map(normalizeSnapshot) : [],
        total: Number(result.total) || 0,
        nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null,
      };
    },
    async get(workId) {
      const query = new URLSearchParams(baseQuery);
      const result = await request(`/api/assistant-work/${encodeURIComponent(workId)}?${query.toString()}`);
      return normalizeSnapshot(result);
    },
    async followUp(workId, input) {
      const query = new URLSearchParams(baseQuery);
      return normalizeSnapshot(await request(`/api/assistant-work/${encodeURIComponent(workId)}/follow-ups?${query.toString()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }));
    },
    async cancel(workId, operationId) {
      const query = new URLSearchParams(baseQuery);
      return normalizeSnapshot(await request(`/api/assistant-work/${encodeURIComponent(workId)}/cancel?${query.toString()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId }),
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!events && options.eventsFactory) {
        events = options.eventsFactory(`/api/assistant-work/events?${baseQuery.toString()}`);
        events.addEventListener('snapshot', (event) => {
          if (disposed) return;
          try {
            const body = JSON.parse(String(event.data)) as { snapshots?: unknown[] };
            for (const snapshot of body.snapshots || []) emit(snapshot);
          } catch {
            // A reconnect starts with a fresh list; malformed event data is not terminal.
          }
        });
      }
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      events?.close();
      events = null;
      listeners.clear();
    },
  };
}

export type { CanvasWorkFileV1 };
