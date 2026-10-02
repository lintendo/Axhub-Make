export const DEFAULT_MAKE_SERVER_ORIGIN = 'http://localhost:53817';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeMakeServerOrigin(value: unknown): string {
  const raw = readString(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function resolveHostedMakeServerOrigin(value: unknown): string {
  return normalizeMakeServerOrigin(value) || DEFAULT_MAKE_SERVER_ORIGIN;
}

export function resolveInjectedMakeServerOrigin(host: unknown): string {
  const origin = host && typeof host === 'object'
    ? (host as Record<string, unknown>).__AXHUB_MAKE_API_ORIGIN__
    : undefined;
  return resolveHostedMakeServerOrigin(origin);
}

export function buildMakeServerApiUrl(
  origin: string,
  pathname: string,
  search?: URLSearchParams,
): string {
  const normalizedOrigin = normalizeMakeServerOrigin(origin);
  const normalizedPath = readString(pathname);
  if (!normalizedOrigin || !normalizedPath.startsWith('/')) return '';
  try {
    const url = new URL(normalizedPath, normalizedOrigin);
    if (search) url.search = search.toString();
    return url.toString();
  } catch {
    return '';
  }
}
