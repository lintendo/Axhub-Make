export const CANVAS_VIEWPORT_AI_SESSION_TTL_MS = 30 * 60 * 1000;
export const CANVAS_VIEWPORT_AI_SESSION_MAX_TURNS = 8;

const CANVAS_VIEWPORT_AI_SESSION_STORAGE_PREFIX = 'axhub:canvas-viewport-ai-session:v1';

export interface CanvasViewportAiSessionIdentity {
  projectId: string;
  canvasFilePath: string;
  provider: string;
}

export interface CanvasViewportAiSession {
  version: 1;
  threadId: string | null;
  conversationId: string | null;
  provider: string;
  createdAt: string;
  turnsUsed: number;
  isNew: boolean;
}

export type CanvasViewportAiSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | Map<string, string>;

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getStorageValue(storage: CanvasViewportAiSessionStorage, key: string): string | null {
  return storage instanceof Map ? storage.get(key) || null : storage.getItem(key);
}

function setStorageValue(storage: CanvasViewportAiSessionStorage, key: string, value: string): void {
  if (storage instanceof Map) {
    storage.set(key, value);
    return;
  }
  storage.setItem(key, value);
}

function removeStorageValue(storage: CanvasViewportAiSessionStorage, key: string): void {
  if (storage instanceof Map) {
    storage.delete(key);
    return;
  }
  storage.removeItem(key);
}

export function getCanvasViewportAiSessionStorageKey(identity: Pick<CanvasViewportAiSessionIdentity, 'projectId' | 'canvasFilePath'>): string {
  return [
    CANVAS_VIEWPORT_AI_SESSION_STORAGE_PREFIX,
    encodeURIComponent(normalize(identity.projectId)),
    encodeURIComponent(normalize(identity.canvasFilePath).replace(/\\/gu, '/')),
  ].join(':');
}

function isStoredSession(value: unknown): value is Omit<CanvasViewportAiSession, 'isNew'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && typeof candidate.createdAt === 'string'
    && typeof candidate.provider === 'string'
    && (typeof candidate.threadId === 'string' || candidate.threadId === null)
    && (typeof candidate.conversationId === 'string' || candidate.conversationId === null)
    && typeof candidate.turnsUsed === 'number';
}

function parseStoredSession(value: string | null): Omit<CanvasViewportAiSession, 'isNew'> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!isStoredSession(parsed)) return null;
    const createdAt = new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return null;
    return {
      version: 1,
      threadId: normalize(parsed.threadId) || null,
      conversationId: normalize(parsed.conversationId) || null,
      provider: normalize(parsed.provider),
      createdAt: new Date(createdAt).toISOString(),
      turnsUsed: Math.max(0, Math.floor(parsed.turnsUsed)),
    };
  } catch {
    return null;
  }
}

function createNewSession(identity: CanvasViewportAiSessionIdentity, now: Date): CanvasViewportAiSession {
  return {
    version: 1,
    threadId: null,
    conversationId: null,
    provider: normalize(identity.provider),
    createdAt: now.toISOString(),
    turnsUsed: 0,
    isNew: true,
  };
}

export function createCanvasViewportAiSessionStore(storage: CanvasViewportAiSessionStorage) {
  function resolve(identity: CanvasViewportAiSessionIdentity, now: Date = new Date()): CanvasViewportAiSession {
    const key = getCanvasViewportAiSessionStorageKey(identity);
    const stored = parseStoredSession(getStorageValue(storage, key));
    const nowMs = now.getTime();
    const createdAtMs = stored ? new Date(stored.createdAt).getTime() : Number.NaN;
    if (
      !stored
      || stored.provider !== normalize(identity.provider)
      || nowMs >= createdAtMs + CANVAS_VIEWPORT_AI_SESSION_TTL_MS
      || stored.turnsUsed >= CANVAS_VIEWPORT_AI_SESSION_MAX_TURNS
    ) {
      if (stored) removeStorageValue(storage, key);
      return createNewSession(identity, now);
    }
    return { ...stored, isNew: false };
  }

  function recordAccepted(input: {
    identity: CanvasViewportAiSessionIdentity;
    session: CanvasViewportAiSession;
    threadId?: string | null;
    conversationId?: string | null;
  }): CanvasViewportAiSession {
    const key = getCanvasViewportAiSessionStorageKey(input.identity);
    const threadId = normalize(input.threadId) || input.session.threadId;
    const conversationId = normalize(input.conversationId) || input.session.conversationId || threadId;
    const session: CanvasViewportAiSession = {
      version: 1,
      threadId,
      conversationId,
      provider: normalize(input.identity.provider),
      createdAt: input.session.createdAt,
      turnsUsed: Math.min(CANVAS_VIEWPORT_AI_SESSION_MAX_TURNS, input.session.turnsUsed + 1),
      isNew: false,
    };
    setStorageValue(storage, key, JSON.stringify({
      version: session.version,
      threadId: session.threadId,
      conversationId: session.conversationId,
      provider: session.provider,
      createdAt: session.createdAt,
      turnsUsed: session.turnsUsed,
    }));
    return session;
  }

  return { resolve, recordAccepted };
}
