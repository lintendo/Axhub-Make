const PROTOTYPE_PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSafePrototypeResourceName(value: string): boolean {
  return Boolean(
    value
      && !value.startsWith('.')
      && !value.includes('..')
      && !/[\\/]/u.test(value)
      && !value.includes('\0'),
  );
}

export function buildInternalPrototypeCommentPageScope(
  resourceIdOrPath: unknown,
  pageId: unknown,
): string {
  const normalizedPageId = normalizeString(pageId);
  if (!PROTOTYPE_PAGE_ID_RE.test(normalizedPageId)) return '';

  const rawResourceId = normalizeString(resourceIdOrPath);
  const resourcePath = rawResourceId.startsWith('prototypes/')
    ? rawResourceId
    : isSafePrototypeResourceName(rawResourceId)
      ? `prototypes/${rawResourceId}`
      : '';
  if (!resourcePath || resourcePath.includes('..') || /[\\\0]/u.test(resourcePath)) return '';
  return `${resourcePath}::page::${normalizedPageId}`;
}

export function buildSafeVoicePrototypeResourcePath(selectedItem: unknown): string {
  const record = selectedItem && typeof selectedItem === 'object'
    ? selectedItem as Record<string, unknown>
    : {};
  const rawId = normalizeString(record.resourceId) || normalizeString(record.name);
  const prototypeId = rawId.replace(/^prototypes\//u, '');
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(prototypeId)) return '';
  return `prototypes/${prototypeId}`;
}
