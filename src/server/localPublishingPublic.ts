import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  createProjectRegistry,
  type RegisteredProject,
} from './projectCore/index.ts';
import { getRequestUrl, sendFile, sendJson } from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import { getMakeClientDevStatus } from './makeClientProject.ts';
import { isRuntimeOnlyRoute } from './runtimeProxy.ts';
import { buildPublishedReviewShellHtml } from './publishedReviewShell.ts';
import {
  readHtmlManifest,
  readRealtimeManifest,
  resolvePublishedFilePath,
  type LanHtmlManifest,
  type LanRealtimeManifest,
} from './lanPublishingStorage.ts';

interface PublishedProjectMatch<T> {
  project: RegisteredProject | { id: string; root: string };
  manifest: T;
}

const PUBLISHED_SHARED_SOURCE_PREFIXES = [
  'src/app/',
  'src/components/',
  'src/common/',
  'src/features/',
  'src/hooks/',
  'src/lib/',
  'src/pages/',
  'src/services/',
  'src/shared/',
  'src/styles/',
  'src/types/',
  'src/utils/',
] as const;

const PUBLISHED_SHARED_RUNTIME_PREFIXES = PUBLISHED_SHARED_SOURCE_PREFIXES
  .map((prefix) => `/${prefix.replace(/^src\//u, '')}`);

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function resolveRequestOrigin(req: IncomingMessage, fallback: string): string {
  const protocolHeader = getHeaderValue(req.headers['x-forwarded-proto']);
  const protocol = ['http', 'https'].includes(protocolHeader.split(',')[0]?.trim().toLowerCase())
    ? protocolHeader.split(',')[0].trim().toLowerCase()
    : (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
  const host = getHeaderValue(req.headers.host).trim();
  return host ? `${protocol}://${host}` : String(fallback || '').replace(/\/+$/u, '');
}

async function resolvePublishedRuntimeOrigin(
  projectId: string,
  projectRoot: string,
  req: IncomingMessage,
  fallbackOrigin: string,
): Promise<string> {
  const requestOrigin = resolveRequestOrigin(req, fallbackOrigin);
  const status = await getMakeClientDevStatus(projectId, projectRoot, { healthTimeoutMs: 800 });
  const runtime = status.running ? status.runtime : undefined;
  if (!runtime) {
    return '';
  }
  try {
    const runtimeUrl = new URL(runtime.origin);
    const requestUrl = new URL(requestOrigin);
    if (/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/u.test(runtimeUrl.hostname)) {
      runtimeUrl.hostname = requestUrl.hostname;
    }
    return runtimeUrl.toString().replace(/\/+$/u, '');
  } catch {
    return '';
  }
}

export function resolveRequestIp(req: IncomingMessage): string {
  const forwarded = getHeaderValue(req.headers['x-forwarded-for']).split(',')[0]?.trim();
  const socketAddress = String(req.socket?.remoteAddress || '').trim();
  return forwarded || socketAddress.replace(/^::ffff:/u, '') || 'unknown';
}

function getProjectRoots(options: ManagementApiOptions): Array<{ id: string; root: string }> {
  const roots = new Map<string, { id: string; root: string }>();
  const registry = createProjectRegistry(
    options.registryPath ? { registryPath: options.registryPath } : undefined,
  );
  for (const project of registry.listProjects()) {
    roots.set(path.resolve(project.root), { id: project.id, root: path.resolve(project.root) });
  }
  const fallbackRoot = path.resolve(options.projectRoot);
  if (!roots.has(fallbackRoot)) {
    roots.set(fallbackRoot, { id: '', root: fallbackRoot });
  }
  return Array.from(roots.values());
}

function findHtmlProject(options: ManagementApiOptions, publishId: string): PublishedProjectMatch<LanHtmlManifest> | null {
  for (const project of getProjectRoots(options)) {
    try {
      const manifest = readHtmlManifest(project.root, publishId);
      if (manifest) {
        return { project, manifest };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function findRealtimeProject(options: ManagementApiOptions, shareId: string): PublishedProjectMatch<LanRealtimeManifest> | null {
  for (const project of getProjectRoots(options)) {
    try {
      const manifest = readRealtimeManifest(project.root, shareId);
      if (manifest) {
        return { project, manifest };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function getPublishedContextUrl(req: IncomingMessage): URL | null {
  const read = (value: string): URL | null => {
    try {
      const url = new URL(value || '/', 'http://localhost');
      return url.searchParams.has('publishedShareId') ? url : null;
    } catch {
      return null;
    }
  };
  return read(req.url || '/') || read(getHeaderValue(req.headers.referer || req.headers.referrer));
}

function normalizePublishedSourceRoot(resourcePath: string): string {
  const normalized = String(resourcePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/gu, '')
    .replace(/\/index\.(?:t|j)sx?$/iu, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 3 || segments.some((segment) => segment === '.' || segment === '..')) {
    return '';
  }
  return segments.join('/');
}

function isPathWithin(relativePath: string, rootPath: string): boolean {
  return relativePath === rootPath || relativePath.startsWith(`${rootPath}/`);
}

function getProjectRelativeFsPath(pathname: string, projectRoot: string): string | null {
  if (!pathname.startsWith('/@fs/')) return null;
  const absolutePath = path.resolve(`/${pathname.slice('/@fs/'.length)}`);
  const relativePath = path.relative(path.resolve(projectRoot), absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return relativePath === '' ? '' : null;
  }
  return relativePath.replace(/\\/g, '/');
}

function isAllowedPublishedSourceRequest(
  pathname: string,
  projectRoot: string,
  resourcePath: string,
): boolean {
  const decodedPathname = decodeSegment(pathname).replace(/\\/g, '/');
  const expectedSourceRoot = normalizePublishedSourceRoot(resourcePath);
  if (!expectedSourceRoot) return false;
  if (decodedPathname.split('/').some((segment) => segment === '.' || segment === '..')) {
    return false;
  }
  const expectedRuntimeRoot = expectedSourceRoot.replace(/^src\//u, '');

  if (decodedPathname.startsWith('/src/')) {
    const requestedPath = decodedPathname.slice(1);
    if (isPathWithin(requestedPath, expectedSourceRoot)) return true;
    if (/^src\/(?:prototypes|themes|docs)\//u.test(requestedPath)) return false;
    return PUBLISHED_SHARED_SOURCE_PREFIXES.some((prefix) => requestedPath.startsWith(prefix));
  }

  if (decodedPathname.startsWith('/@fs/')) {
    const projectRelativePath = getProjectRelativeFsPath(decodedPathname, projectRoot);
    if (projectRelativePath === null) return false;
    return isPathWithin(projectRelativePath, expectedSourceRoot)
      || projectRelativePath.startsWith('node_modules/.vite/deps/');
  }

  if (decodedPathname.startsWith('/@id/')) {
    const modulePath = decodedPathname
      .slice('/@id/'.length)
      .replace(/^__x00__\//u, '')
      .replace(/^\/+|\/+$/gu, '');
    if (isPathWithin(modulePath, expectedRuntimeRoot) || isPathWithin(modulePath, expectedSourceRoot)) {
      return true;
    }
    if (modulePath.startsWith('src/')) {
      if (/^src\/(?:prototypes|themes|docs)\//u.test(modulePath)) return false;
      return PUBLISHED_SHARED_SOURCE_PREFIXES.some((prefix) => modulePath.startsWith(prefix));
    }
    return false;
  }


  const requestedSourcePath = decodedPathname.replace(/^\/+|\/+$/gu, '');
  if (/^(?:prototypes|themes|docs)\//u.test(requestedSourcePath)) {
    return isPathWithin(requestedSourcePath, expectedRuntimeRoot);
  }
  if (PUBLISHED_SHARED_RUNTIME_PREFIXES.some((prefix) => decodedPathname.startsWith(prefix))) {
    return true;
  }

  return true;
}

function isPublishedRuntimeRoute(pathname: string): boolean {
  const decodedPathname = decodeSegment(pathname).replace(/\\/g, '/');
  return isRuntimeOnlyRoute(decodedPathname)
    || PUBLISHED_SHARED_RUNTIME_PREFIXES.some((prefix) => decodedPathname.startsWith(prefix));
}

export function isPublicPublishedRequest(
  req: IncomingMessage,
  options: ManagementApiOptions,
): boolean {
  const url = getRequestUrl(req);
  if (url.pathname.startsWith('/published/html/')) {
    const match = url.pathname.match(/^\/published\/html\/([^/]+)/u);
    return Boolean(match && findHtmlProject(options, decodeSegment(match[1] || '')));
  }
  if (url.pathname.startsWith('/published/prototype/')) {
    const match = url.pathname.match(/^\/published\/prototype\/([^/]+)/u);
    return Boolean(match && findRealtimeProject(options, decodeSegment(match[1] || '')));
  }
  if (url.pathname === '/api/local-publishing/realtime-context') {
    return Boolean(findRealtimeProject(options, String(url.searchParams.get('shareId') || '').trim()));
  }
  if (url.pathname === '/api/prototype-comments' || url.pathname === '/api/prototype-comments/asset') {
    const shareId = String(url.searchParams.get('publishedShareId') || '').trim();
    return Boolean(shareId && findRealtimeProject(options, shareId));
  }
  if (url.pathname.startsWith('/api/')) {
    return false;
  }
  if (!isPublishedRuntimeRoute(url.pathname)) {
    return false;
  }
  const contextUrl = getPublishedContextUrl(req);
  const shareId = String(contextUrl?.searchParams.get('publishedShareId') || '').trim();
  if (!shareId) return false;
  const projectMatch = findRealtimeProject(options, shareId);
  if (!projectMatch) return false;
  const expectedRuntimePath = toRuntimeResourcePath(projectMatch.manifest.resourcePath);
  if (!expectedRuntimePath) return false;
  if (!isAllowedPublishedSourceRequest(
    url.pathname,
    projectMatch.project.root,
    projectMatch.manifest.resourcePath,
  )) {
    return false;
  }
  const runtimeDocumentPath = /^\/(?:prototypes|themes|docs)\//u.test(url.pathname);
  if (runtimeDocumentPath
    && url.pathname !== expectedRuntimePath
    && !url.pathname.startsWith(`${expectedRuntimePath}/`)) {
    return false;
  }
  const requestedProjectId = String(url.searchParams.get('projectId') || contextUrl.searchParams.get('projectId') || '').trim();
  return !requestedProjectId || requestedProjectId === projectMatch.manifest.projectId;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function toRuntimeResourcePath(resourcePath: string): string {
  const normalized = String(resourcePath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/gu, '');
  const withoutSource = normalized.replace(/^src\//u, '').replace(/\/index\.(t|j)sx?$/iu, '');
  const segments = withoutSource.split('/').filter(Boolean);
  if (segments.length < 2 || segments.some((segment) => segment === '.' || segment === '..')) {
    return '';
  }
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function sendNotFound(res: ServerResponse): void {
  sendJson(res, { error: 'Published resource not found' }, { status: 404 });
}

function handleHtmlRoute(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
): boolean {
  const match = pathname.match(/^\/published\/html\/([^/]+)(?:\/(.*))?$/u);
  if (!match) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }
  const publishId = decodeSegment(match[1] || '');
  const projectMatch = findHtmlProject(options, publishId);
  if (!projectMatch) {
    sendNotFound(res);
    return true;
  }
  const relativePath = decodeSegment(match[2] || 'index.html') || 'index.html';
  if (!projectMatch.manifest.files.includes(relativePath)) {
    sendNotFound(res);
    return true;
  }
  let filePath: string;
  try {
    filePath = resolvePublishedFilePath(projectMatch.project.root, publishId, relativePath);
  } catch {
    sendNotFound(res);
    return true;
  }
  if (!fs.existsSync(filePath) || !sendFile(res, filePath, {
    cacheControl: 'public, max-age=31536000, immutable',
  })) {
    sendNotFound(res);
  }
  return true;
}

async function handleRealtimeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
): Promise<boolean> {
  const match = pathname.match(/^\/published\/prototype\/([^/]+)$/u);
  if (!match) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }
  const shareId = decodeSegment(match[1] || '');
  const projectMatch = findRealtimeProject(options, shareId);
  if (!projectMatch) {
    sendNotFound(res);
    return true;
  }
  const runtimePath = toRuntimeResourcePath(projectMatch.manifest.resourcePath);
  if (!runtimePath) {
    sendNotFound(res);
    return true;
  }
  const requestOrigin = resolveRequestOrigin(req, options.origin);
  const runtimeOrigin = await resolvePublishedRuntimeOrigin(
    projectMatch.project.id,
    projectMatch.project.root,
    req,
    options.origin,
  );
  const html = buildPublishedReviewShellHtml({
    shareId: projectMatch.manifest.shareId,
    projectId: projectMatch.manifest.projectId,
    runtimePath,
    runtimeOrigin,
    ...(runtimeOrigin ? { makeServerOrigin: requestOrigin } : {}),
    previewPath: projectMatch.manifest.previewPath,
    commentable: projectMatch.manifest.commentable,
  });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    res.end();
  } else {
    res.end(html);
  }
  return true;
}

function handleRealtimeContext(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  url: URL,
): boolean {
  if (url.pathname !== '/api/local-publishing/realtime-context') return false;
  if (req.method !== 'GET') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }
  const shareId = String(url.searchParams.get('shareId') || '').trim();
  const projectMatch = findRealtimeProject(options, shareId);
  if (!projectMatch) {
    sendNotFound(res);
    return true;
  }
  const defaultAuthorIp = resolveRequestIp(req);
  sendJson(res, {
    shareId: projectMatch.manifest.shareId,
    commentable: projectMatch.manifest.commentable,
    defaultAuthorIp,
  });
  return true;
}

export async function handleLocalPublishingPublicRoute(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
): Promise<boolean> {
  const url = getRequestUrl(req);
  if (handleRealtimeContext(req, res, options, url)) return true;
  if (handleHtmlRoute(req, res, options, url.pathname)) return true;
  if (await handleRealtimeRoute(req, res, options, url.pathname)) return true;
  return false;
}
