const FRONTMATTER_OPEN_RE = /^\uFEFF?---[ \t]*\r?\n/u;
const FRONTMATTER_CLOSE_RE = /^(---|\.\.\.)[ \t]*$/u;
const FRONTMATTER_FIELD_RE = /(?:^|\r?\n)[A-Za-z0-9_-]+\s*:/u;

export function stripMarkdownPreviewFrontmatter(content: string): string {
  const source = String(content || '');
  const openMatch = source.match(FRONTMATTER_OPEN_RE);
  if (!openMatch) return source;

  const bodyStart = openMatch[0].length;
  const lines = source.slice(bodyStart).split(/(\r?\n)/u);
  let frontmatter = '';
  let cursor = bodyStart;

  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index] || '';
    const newline = lines[index + 1] || '';
    if (FRONTMATTER_CLOSE_RE.test(line)) {
      return FRONTMATTER_FIELD_RE.test(frontmatter)
        ? source.slice(cursor + line.length + newline.length)
        : source;
    }
    frontmatter += line + newline;
    cursor += line.length + newline.length;
  }

  return source;
}

const PROTOTYPE_SPEC_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/prototypes\/[^/]+\/spec\/content$/u;
const PROJECT_RESOURCE_DOC_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/docs\/(.+)\/content$/u;
const PROJECT_DOCUMENT_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/document-content$/u;

export {
  resolvePrototypeSpecAssetUrl,
  resolvePrototypeSpecResourceUrl,
} from '../common/markdown/markdownImage';

export type MarkdownDocumentLinkTarget = {
  kind: 'prototype-spec' | 'doc' | 'project-doc';
  resourceId: string;
};

function resolveRelativeDocumentPath(currentPath: string, rawHref: string): string | null {
  const rawHrefPath = rawHref.split('#', 1)[0].split('?', 1)[0].replace(/\\/gu, '/');
  let hrefPath = '';
  try {
    hrefPath = decodeURIComponent(rawHrefPath);
  } catch {
    return null;
  }
  if (!hrefPath) return null;

  const baseSegments = currentPath.replace(/\\/gu, '/').split('/').filter(Boolean).slice(0, -1);
  for (const segment of hrefPath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (baseSegments.length === 0) return null;
      baseSegments.pop();
      continue;
    }
    baseSegments.push(segment);
  }
  return baseSegments.length > 0 ? baseSegments.join('/') : null;
}

export function resolveMarkdownDocumentLinkTarget(
  href: string,
  documentUrl: string,
): MarkdownDocumentLinkTarget | null {
  const rawHref = String(href || '').trim();
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(rawHref)) {
    return null;
  }
  let currentUrl: URL;
  try {
    currentUrl = new URL(documentUrl, 'http://axhub.local');
  } catch {
    return null;
  }

  const projectDocumentPath = String(currentUrl.searchParams.get('path') || '').trim().replace(/\\/gu, '/');
  if (PROTOTYPE_SPEC_CONTENT_PATH_RE.test(currentUrl.pathname)) {
    const resourceId = resolveRelativeDocumentPath(projectDocumentPath, rawHref);
    return resourceId && /\.(?:html?|md)$/iu.test(resourceId)
      ? { kind: 'prototype-spec', resourceId }
      : null;
  }

  const resourceMatch = currentUrl.pathname.match(PROJECT_RESOURCE_DOC_CONTENT_PATH_RE);
  if (resourceMatch) {
    let currentResourceId = '';
    try {
      currentResourceId = decodeURIComponent(resourceMatch[1] || '');
    } catch {
      return null;
    }
    const resourceId = resolveRelativeDocumentPath(currentResourceId, rawHref);
    return resourceId ? { kind: 'doc', resourceId } : null;
  }

  if (PROJECT_DOCUMENT_CONTENT_PATH_RE.test(currentUrl.pathname)) {
    const resourceId = resolveRelativeDocumentPath(projectDocumentPath, rawHref);
    return resourceId && /\.mdx?$/iu.test(resourceId)
      ? { kind: 'project-doc', resourceId }
      : null;
  }

  return null;
}

export function resolvePrototypeSpecDocumentLink(href: string, documentUrl: string): string | null {
  const target = resolveMarkdownDocumentLinkTarget(href, documentUrl);
  return target?.kind === 'prototype-spec' ? target.resourceId : null;
}
