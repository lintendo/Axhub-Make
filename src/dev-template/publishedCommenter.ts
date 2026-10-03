const STORAGE_PREFIX = 'axhub:published-commenter:';
const TOKEN_STORAGE_PREFIX = 'axhub:published-commenter-token:';
const memoryNames = new Map<string, string>();
const memoryTokens = new Map<string, string>();

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getPublishedCommenterStorageKey(shareId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(normalizeString(shareId))}`;
}

export function getPublishedCommenterTokenStorageKey(shareId: string): string {
  return `${TOKEN_STORAGE_PREFIX}${encodeURIComponent(normalizeString(shareId))}`;
}

function createPublishedCommenterToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return `${cryptoApi.randomUUID()}-${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure random values are unavailable for the published commenter identity.');
}

function normalizeToken(value: unknown): string {
  const normalized = normalizeString(value);
  return /^[a-z0-9_-]{32,160}$/iu.test(normalized) ? normalized : '';
}

export function readPublishedCommenterToken(shareId: string): string {
  if (typeof window === 'undefined') return '';
  const key = getPublishedCommenterTokenStorageKey(shareId);
  const memoryValue = normalizeToken(memoryTokens.get(key));
  if (memoryValue) return memoryValue;
  try {
    const stored = normalizeToken(window.localStorage.getItem(key));
    if (stored) {
      memoryTokens.set(key, stored);
      return stored;
    }
    const created = createPublishedCommenterToken();
    memoryTokens.set(key, created);
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    const created = createPublishedCommenterToken();
    memoryTokens.set(key, created);
    return created;
  }
}

export function readPublishedCommenterName(shareId: string): string {
  if (typeof window === 'undefined') return '';
  const key = getPublishedCommenterStorageKey(shareId);
  const memoryValue = normalizeString(memoryNames.get(key));
  if (memoryValue) return memoryValue;
  try {
    return normalizeString(window.localStorage.getItem(key));
  } catch {
    return '';
  }
}

export function writePublishedCommenterName(shareId: string, name: string): void {
  if (typeof window === 'undefined') return;
  const key = getPublishedCommenterStorageKey(shareId);
  try {
    const normalized = normalizeString(name).slice(0, 120);
    if (normalized) memoryNames.set(key, normalized);
    else memoryNames.delete(key);
    if (normalized) window.localStorage.setItem(key, normalized);
    else window.localStorage.removeItem(key);
  } catch {
    // Local storage is an optional convenience; comments still fall back to the request IP.
  }
}
