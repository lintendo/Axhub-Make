import { createElement, type CSSProperties } from 'react';
import type { ComponentProps } from '@ant-design/x-markdown';

const PROTOTYPE_SPEC_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/prototypes\/[^/]+\/spec\/content$/u;

export interface MarkdownImageProps extends ComponentProps {
  src?: string;
  style?: CSSProperties;
  documentUrl?: string;
}

export function parseAxhubImageWidth(src: string | undefined): { cleanSrc: string; width: number | null } {
  const safeSrc = String(src || '');
  const hashIndex = safeSrc.indexOf('#');
  const beforeHash = hashIndex === -1 ? safeSrc : safeSrc.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : safeSrc.slice(hashIndex + 1);

  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex === -1) {
    return { cleanSrc: safeSrc, width: null };
  }

  const base = beforeHash.slice(0, queryIndex);
  const query = beforeHash.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  const widthText = params.get('axw');
  const widthValue = widthText ? Number.parseInt(widthText, 10) : Number.NaN;
  const width = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : null;

  params.delete('axw');
  const nextQuery = params.toString();
  const nextBeforeHash = nextQuery ? `${base}?${nextQuery}` : base;
  const cleanSrc = hash ? `${nextBeforeHash}#${hash}` : nextBeforeHash;
  return { cleanSrc, width };
}

function buildProjectDocumentAssetUrl(parsedUrl: URL, assetPath: string): string {
  const projectDocumentMatch = parsedUrl.pathname.match(/^\/api\/projects\/([^/]+)\/document-content$/iu);
  if (!projectDocumentMatch) return '';

  const projectId = decodeURIComponent(projectDocumentMatch[1] || '');
  const filePath = String(parsedUrl.searchParams.get('path') || '').trim();
  if (!projectId || !filePath) return '';

  return `/api/projects/${encodeURIComponent(projectId)}/document-asset?path=${encodeURIComponent(filePath)}&asset=${encodeURIComponent(assetPath)}`;
}

export function resolvePrototypeSpecResourceUrl(value: string, documentUrl: string): string | null {
  const rawValue = String(value || '').trim();
  if (!rawValue || rawValue.startsWith('#') || rawValue.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(rawValue)) {
    return null;
  }
  let currentUrl: URL;
  try {
    currentUrl = new URL(documentUrl, 'http://axhub.local');
  } catch {
    return null;
  }
  if (!PROTOTYPE_SPEC_CONTENT_PATH_RE.test(currentUrl.pathname)) return null;
  const currentPath = String(currentUrl.searchParams.get('path') || '').trim().replace(/\\/gu, '/');
  if (!currentPath) return null;

  const hashIndex = rawValue.indexOf('#');
  const hash = hashIndex >= 0 ? rawValue.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? rawValue.slice(0, hashIndex) : rawValue;
  const queryIndex = withoutHash.indexOf('?');
  const rawQuery = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  const resourcePath = (queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash).replace(/\\/gu, '/');
  const baseSegments = currentPath.split('/').filter(Boolean).slice(0, -1);
  for (const segment of resourcePath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (baseSegments.length === 0) return null;
      baseSegments.pop();
      continue;
    }
    baseSegments.push(segment);
  }
  if (baseSegments.length === 0) return null;
  const params = new URLSearchParams({ path: baseSegments.join('/') });
  for (const [key, queryValue] of new URLSearchParams(rawQuery)) {
    if (key !== 'path') params.append(key, queryValue);
  }
  return `${currentUrl.pathname}?${params.toString()}${hash}`;
}

export function resolvePrototypeSpecAssetUrl(src: string, documentUrl: string): string | null {
  return resolvePrototypeSpecResourceUrl(src, documentUrl);
}

export function resolveMarkdownImageSrc(src: string, documentUrl?: string): string {
  const safeSrc = String(src || '').trim();
  if (!safeSrc) return safeSrc;

  const isAbsolute = /^(?:[a-z]+:)?\/\//i.test(safeSrc)
    || safeSrc.startsWith('data:')
    || safeSrc.startsWith('blob:')
    || safeSrc.startsWith('/')
    || safeSrc.startsWith('#');
  if (isAbsolute || typeof window === 'undefined') {
    return safeSrc;
  }

  try {
    const parsedUrl = new URL(documentUrl || '', window.location.origin);
    if (parsedUrl.pathname === '/api/markdown-file') {
      const filePath = String(parsedUrl.searchParams.get('path') || '').trim();
      if (filePath) {
        return `/api/markdown-file-asset?path=${encodeURIComponent(filePath)}&asset=${encodeURIComponent(safeSrc)}`;
      }
    }
    const projectDocumentAssetUrl = buildProjectDocumentAssetUrl(parsedUrl, safeSrc);
    if (projectDocumentAssetUrl) {
      return projectDocumentAssetUrl;
    }
    const prototypeSpecAssetUrl = resolvePrototypeSpecAssetUrl(safeSrc, parsedUrl.toString());
    if (prototypeSpecAssetUrl) {
      return prototypeSpecAssetUrl;
    }
  } catch {
    // Fall through to legacy URL resolution.
  }

  const buildAssetBasePath = (rawUrl?: string) => {
    if (!rawUrl) return null;

    let pathname = '';
    try {
      pathname = new URL(rawUrl, window.location.origin).pathname;
    } catch {
      return null;
    }

    const toDocsBasePath = (docPath: string) => {
      const normalizedDocPath = decodeURIComponent(docPath).replace(/\.md$/iu, '');
      const lastSlashIndex = normalizedDocPath.lastIndexOf('/');
      const docsSubDir = lastSlashIndex >= 0 ? normalizedDocPath.slice(0, lastSlashIndex + 1) : '';
      return `/docs/${docsSubDir}`;
    };

    if (pathname.startsWith('/api/docs/')) {
      return toDocsBasePath(pathname.slice('/api/docs/'.length));
    }

    if (pathname.startsWith('/docs/')) {
      return toDocsBasePath(pathname.slice('/docs/'.length));
    }

    const typedDocMatch = pathname.match(/^\/(components|prototypes|themes)\/([^/]+)\/(spec|prd)\.md$/iu);
    if (typedDocMatch) {
      return `/${typedDocMatch[1]}/${typedDocMatch[2]}/`;
    }

    const gitTypedDocMatch = pathname.match(/^\/api\/git\/version-file\/[^/]+\/(components|prototypes|themes)\/([^/]+)\/(spec|prd)\.md$/iu);
    if (gitTypedDocMatch) {
      return `/${gitTypedDocMatch[1]}/${gitTypedDocMatch[2]}/`;
    }

    return null;
  };

  const assetBasePath = buildAssetBasePath(documentUrl) || window.location.pathname;
  try {
    return new URL(safeSrc, new URL(assetBasePath, window.location.origin)).toString();
  } catch {
    return safeSrc;
  }
}

export function MarkdownImage(props: MarkdownImageProps) {
  const {
    domNode: _domNode,
    streamStatus: _streamStatus,
    children: _children,
    class: _className,
    classname: _legacyClassName,
    src,
    style,
    documentUrl,
    ...restProps
  } = props;
  const safeSrc = typeof src === 'string' ? src : '';
  const { cleanSrc, width } = parseAxhubImageWidth(safeSrc);
  const resolvedSrc = resolveMarkdownImageSrc(cleanSrc || safeSrc, documentUrl);

  return createElement('img', {
    ...restProps,
    src: resolvedSrc,
    style: {
      ...(style || {}),
      ...(width ? { width: `${width}px` } : {}),
      maxWidth: '100%',
      height: 'auto',
    },
  });
}
