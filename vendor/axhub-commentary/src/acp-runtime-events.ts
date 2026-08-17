export type AcpRunState = 'queued' | 'running' | 'completed' | 'aborted' | 'error';
export type AcpTerminalRunState = 'completed' | 'aborted' | 'error';

export interface AcpRuntimeEventStatus {
  threadId?: string;
  provider?: string;
  workspacePath?: string;
  conversationStorePath?: string | null;
  runState?: AcpRunState | string;
  updatedAt?: number;
  error?: string;
}

export type AcpRuntimeStatusListener = (
  status: AcpRuntimeEventStatus,
) => void | Promise<void>;

export interface AcpRuntimeStatusSubscription {
  done: Promise<AcpRuntimeEventStatus | null>;
  subscribe(listener: AcpRuntimeStatusListener): () => void;
  unsubscribe(): void;
  abort(): void;
}

export interface AcpRuntimeStatusSubscriptionParams {
  apiBaseUrl?: string;
  eventsUrl?: string;
  runtimeUrl?: string;
  threadId: string;
  provider: string;
  workspacePath?: string;
  conversationStorePath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_TERMINAL_STATUS_TIMEOUT_MS = 310_000;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value: unknown): string {
  const trimmed = normalizeText(value).replace(/\/+$/u, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/u, '');
  } catch {
    return '';
  }
}

function normalizeAcpApiBaseUrl(value: unknown): string {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/u, '');
  url.pathname = !path || path === '/' ? '/api' : path;
  return url.toString().replace(/\/+$/u, '');
}

function normalizeProvider(value: unknown): string {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'openai' ? 'codex' : normalized;
}

export function isTerminalAcpRunState(value: unknown): value is AcpTerminalRunState {
  return value === 'completed' || value === 'aborted' || value === 'error';
}

export function buildAcpRuntimeEventsUrl(
  apiBaseUrl: string,
  scope: { workspacePath?: string; conversationStorePath?: string } = {},
): string {
  const normalized = normalizeAcpApiBaseUrl(apiBaseUrl).replace(/\/chat$/u, '');
  if (!normalized) {
    throw new Error('ACP API base URL is required');
  }
  const url = new URL(`${normalized}/conversations/runtime/events`);
  if (scope.workspacePath) url.searchParams.set('workspacePath', scope.workspacePath);
  if (scope.conversationStorePath) {
    url.searchParams.set('conversationStorePath', scope.conversationStorePath);
  }
  return url.toString();
}

export function buildAcpConversationRuntimeUrl(
  apiBaseUrl: string,
  input: {
    threadId: string;
    workspacePath?: string;
    conversationStorePath?: string;
  },
): string {
  const normalized = normalizeAcpApiBaseUrl(apiBaseUrl).replace(/\/chat$/u, '');
  if (!normalized) throw new Error('ACP API base URL is required');
  const threadId = normalizeText(input.threadId);
  if (!threadId) throw new Error('ACP thread ID is required');
  const url = new URL(`${normalized}/conversations/${encodeURIComponent(threadId)}/runtime`);
  if (input.workspacePath) url.searchParams.set('workspacePath', input.workspacePath);
  if (input.conversationStorePath) {
    url.searchParams.set('conversationStorePath', input.conversationStorePath);
  }
  return url.toString();
}

function readDurableAcpRuntimeStatus(
  value: unknown,
  params: AcpRuntimeStatusSubscriptionParams,
): AcpRuntimeEventStatus | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? (record.metadata as Record<string, unknown>)
    : null;
  const runState = normalizeText(metadata?.runState);
  const threadId = normalizeText(record.threadId);
  const provider = normalizeText(record.provider);
  if (!threadId || !provider || !runState) return null;
  return {
    threadId,
    provider,
    workspacePath: normalizeText(record.workspacePath) || params.workspacePath,
    conversationStorePath:
      normalizeText(record.conversationStorePath) || params.conversationStorePath || null,
    runState,
    ...(typeof record.lastUsedAt === 'number' ? { updatedAt: record.lastUsedAt } : {}),
  };
}

export function isAcpRuntimeEventStatus(value: unknown): value is AcpRuntimeEventStatus {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.threadId === 'string' && typeof record.runState === 'string';
}

export function readAcpRuntimeStatusesFromSseChunk(chunk: string): AcpRuntimeEventStatus[] {
  let eventName = '';
  const dataLines: string[] = [];
  for (const line of chunk.split(/\r?\n/u)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }
  if (dataLines.length === 0) return [];

  try {
    const payload = JSON.parse(dataLines.join('\n')) as unknown;
    if (eventName === 'snapshot' && payload && typeof payload === 'object') {
      const statuses = (payload as { statuses?: unknown }).statuses;
      return Array.isArray(statuses) ? statuses.filter(isAcpRuntimeEventStatus) : [];
    }
    return isAcpRuntimeEventStatus(payload) ? [payload] : [];
  } catch {
    return [];
  }
}

export function matchesAcpRuntimeStatus(
  status: AcpRuntimeEventStatus,
  expected: {
    threadId: string;
    provider: string;
    workspacePath?: string;
    conversationStorePath?: string;
  },
): boolean {
  if (normalizeText(status.threadId) !== normalizeText(expected.threadId)) return false;
  if (normalizeProvider(status.provider) !== normalizeProvider(expected.provider)) return false;
  if (
    expected.workspacePath
    && normalizeText(status.workspacePath) !== normalizeText(expected.workspacePath)
  ) {
    return false;
  }
  if (
    expected.conversationStorePath
    && normalizeText(status.conversationStorePath) !== normalizeText(expected.conversationStorePath)
  ) {
    return false;
  }
  return true;
}

function splitSseBuffer(buffer: string): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let rest = buffer;
  let separator = rest.match(/\r?\n\r?\n/u);
  while (separator?.index !== undefined) {
    chunks.push(rest.slice(0, separator.index));
    rest = rest.slice(separator.index + separator[0].length);
    separator = rest.match(/\r?\n\r?\n/u);
  }
  return { chunks, rest };
}

function notifyListeners(
  listeners: Set<AcpRuntimeStatusListener>,
  status: AcpRuntimeEventStatus,
): void {
  for (const listener of listeners) {
    void Promise.resolve(listener(status)).catch((error) => {
      console.warn('[Commentary] ACP runtime status listener failed:', error);
    });
  }
}

export function subscribeAcpRuntimeStatuses(
  params: AcpRuntimeStatusSubscriptionParams,
  listener?: AcpRuntimeStatusListener,
): AcpRuntimeStatusSubscription {
  const listeners = new Set<AcpRuntimeStatusListener>();
  if (listener) listeners.add(listener);

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (params.signal?.aborted) controller.abort();
  else params.signal?.addEventListener('abort', abortFromParent, { once: true });

  const timeoutId = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? DEFAULT_TERMINAL_STATUS_TIMEOUT_MS,
  );

  const done = (async (): Promise<AcpRuntimeEventStatus | null> => {
    try {
      const eventsUrl = normalizeText(params.eventsUrl) || buildAcpRuntimeEventsUrl(
        normalizeText(params.apiBaseUrl),
        {
          workspacePath: params.workspacePath,
          conversationStorePath: params.conversationStorePath,
        },
      );
      const fetchRuntime = params.fetch ?? globalThis.fetch;
      if (typeof fetchRuntime !== 'function') {
        throw new Error('Fetch is unavailable for ACP runtime events');
      }
      const runtimeUrl = normalizeText(params.runtimeUrl) || (
        !normalizeText(params.eventsUrl) && normalizeText(params.apiBaseUrl)
          ? buildAcpConversationRuntimeUrl(normalizeText(params.apiBaseUrl), {
              threadId: params.threadId,
              workspacePath: params.workspacePath,
              conversationStorePath: params.conversationStorePath,
            })
          : ''
      );
      if (runtimeUrl) {
        try {
          const runtimeResponse = await fetchRuntime(runtimeUrl, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          if (runtimeResponse.ok) {
            const status = readDurableAcpRuntimeStatus(await runtimeResponse.json(), params);
            if (status && matchesAcpRuntimeStatus(status, params)) {
              notifyListeners(listeners, status);
              if (isTerminalAcpRunState(status.runState)) return status;
            }
          }
        } catch (error) {
          if (controller.signal.aborted) throw error;
          console.warn('[Commentary] Durable ACP runtime query failed:', error);
        }
      }
      const response = await fetchRuntime(eventsUrl, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!response.ok) return null;

      const reader = response.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) return null;
          buffer += decoder.decode(result.value, { stream: true });
          const split = splitSseBuffer(buffer);
          buffer = split.rest;
          for (const chunk of split.chunks) {
            for (const status of readAcpRuntimeStatusesFromSseChunk(chunk)) {
              if (!matchesAcpRuntimeStatus(status, params)) continue;
              notifyListeners(listeners, status);
              if (isTerminalAcpRunState(status.runState)) {
                await reader.cancel().catch(() => undefined);
                return status;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.warn('[Commentary] ACP runtime status subscription failed:', error);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      params.signal?.removeEventListener('abort', abortFromParent);
    }
  })();

  return {
    done,
    subscribe(nextListener) {
      listeners.add(nextListener);
      return () => listeners.delete(nextListener);
    },
    unsubscribe() {
      if (listener) listeners.delete(listener);
    },
    abort() {
      controller.abort();
    },
  };
}

export function waitForAcpRuntimeTerminalStatus(
  params: AcpRuntimeStatusSubscriptionParams,
): Promise<AcpRuntimeEventStatus | null> {
  return subscribeAcpRuntimeStatuses(params).done;
}
