import fs from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

import {
  fetchHealth,
  hasAdminCapability,
  normalizeHealthServerInfo,
  readServerInfo,
} from '../scripts/utils/serverInfo.mjs';

import {
  appendSearchParamsToModuleSpecifier,
  appendSearchParamsToModuleSpecifiersInCode,
  rewriteModuleSpecifiersInCode,
  type ModuleSpecifierSearchParam,
} from './utils/moduleSpecifierQuery';
import { buildPreviewTitle, readEntryDisplayName } from './utils/previewTitle';

type ResourceType = 'prototypes' | 'themes';

interface AxhubServerInfo {
  pid: number;
  port: number;
  host: string;
  origin: string;
  projectRoot: string;
  startedAt: string;
}

const PREVIEW_TYPES = new Set<ResourceType>(['prototypes', 'themes']);
const PREVIEW_LOADER_FILE = '__axhub-preview-loader.js';
const PREVIEW_LOADER_MARKER = 'data-axhub-preview-loader';
const DEFAULT_ADMIN_ORIGIN = 'http://localhost:53817';
const REACT_REFRESH_PREAMBLE_MARKER = 'data-axhub-react-refresh-preamble';
const MANAGEMENT_RUNTIME_MARKER = 'data-axhub-management-runtime';
const LAN_ACCESS_COOKIE = 'axhub_lan_auth';
const LAN_ACCESS_TOKEN_PARAM = 'axhubAccessToken';
const LAN_ACCESS_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const REACT_REFRESH_PREAMBLE_SCRIPT = `<script type="module" ${REACT_REFRESH_PREAMBLE_MARKER}>
import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
</script>`;

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodeRoutePath(pathname: string): string {
  const hasLeadingSlash = pathname.startsWith('/');
  const encoded = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/');
  return hasLeadingSlash ? `/${encoded}` : encoded;
}

function createRouteBaseHref(type: ResourceType, name: string): string {
  return `${encodeRoutePath(`/${type}/${name}`)}/`;
}

function createPreviewTransformUrl(type: ResourceType, name: string): string {
  return createRouteBaseHref(type, name);
}

function createRoutePath(type: ResourceType, name: string): string {
  return encodeRoutePath(`/${type}/${name}`);
}

function createRawRoutePath(type: ResourceType, name: string): string {
  return `/${type}/${name}`;
}

function createPreviewLoaderPath(type: ResourceType, name: string): string {
  return `${createRoutePath(type, name)}/${PREVIEW_LOADER_FILE}`;
}

function getSearchParamFromRequestUrl(requestUrl: string, key: string): string {
  try {
    return new URL(requestUrl || '/', 'http://localhost').searchParams.get(key)?.trim() || '';
  } catch {
    return '';
  }
}

export function shouldInjectManagementRuntime(requestUrl: string | undefined): boolean {
  try {
    return new URL(requestUrl || '/', 'http://localhost').searchParams.get('agentToolbar') === 'host';
  } catch {
    return false;
  }
}

function getSearchParamFromRequestReferer(
  req: { headers?: Record<string, string | string[] | undefined> },
  key: string,
): string {
  const referer = getHeaderValue(req.headers?.referer || req.headers?.referrer).trim();
  return referer ? getSearchParamFromRequestUrl(referer, key) : '';
}

function appendPreviewLoaderSearchParams(loaderPath: string, requestUrl: string): string {
  const searchParams = new URLSearchParams();
  for (const key of ['projectId', 'gitVersion', 'gitPath']) {
    const value = getSearchParamFromRequestUrl(requestUrl, key);
    if (value) {
      searchParams.set(key, value);
    }
  }
  const search = searchParams.toString();
  return search ? `${loaderPath}?${search}` : loaderPath;
}

function getPreviewContextSearchParams(requestUrl: string): ModuleSpecifierSearchParam[] {
  return ['projectId', 'gitVersion', 'gitPath']
    .map((key) => ({
      key,
      value: getSearchParamFromRequestUrl(requestUrl, key),
    }))
    .filter((param) => param.value);
}

function handleHtmlProxyModuleRequestWithProjectContext(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  contextParams: ModuleSpecifierSearchParam[],
): void {
  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  const restore = () => {
    res.write = originalWrite as ServerResponse['write'];
    res.end = originalEnd as ServerResponse['end'];
  };

  res.write = function writeCapturedHtmlProxyChunk(
    chunk: any,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8'));
    }
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    done?.();
    return true;
  } as ServerResponse['write'];

  res.end = function endCapturedHtmlProxyResponse(
    chunk?: any,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void,
  ) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8'));
    }
    restore();

    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    const contentType = String(res.getHeader('content-type') || res.getHeader('Content-Type') || '').toLowerCase();
    const body = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
    if (res.statusCode >= 400 || !contentType.includes('javascript')) {
      return originalEnd(body.length > 0 ? body : undefined, done);
    }

    const rewritten = Buffer.from(appendSearchParamsToModuleSpecifiersInCode(body.toString('utf8'), contextParams), 'utf8');
    res.setHeader('Content-Length', String(rewritten.length));
    return originalEnd(rewritten, done);
  } as ServerResponse['end'];

  next();
}

function decodePathParts(pathname: string): string[] {
  return pathname.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

function isSafePathPart(part: string): boolean {
  return Boolean(part) && !part.includes('/') && !part.includes('\\') && !part.includes('\0');
}

function hasKnowledgeThemeEntry(resourceDir: string): boolean {
  return [
    'DESIGN.md',
    'theme.json',
    'assets/tokens.json',
    'preview.html',
  ].every(relativePath => fs.existsSync(path.join(resourceDir, ...relativePath.split('/'))));
}

function hasPreviewEntry(projectRoot: string, type: ResourceType, nameParts: string[]): boolean {
  if (!PREVIEW_TYPES.has(type) || nameParts.length === 0 || nameParts.some((part) => !isSafePathPart(part) || part === '..')) {
    return false;
  }
  const resourceDir = path.resolve(projectRoot, 'src', type, ...nameParts);
  if (type === 'themes') return hasKnowledgeThemeEntry(resourceDir);
  return fs.existsSync(path.join(resourceDir, 'index.tsx'))
    || fs.existsSync(path.join(resourceDir, 'index.ts'));
}

function stripPreviewEntryHtmlSuffix(pathname: string, suffixPattern: RegExp, projectRoot: string): string {
  if (!suffixPattern.test(pathname)) {
    return pathname;
  }
  const previewPathname = pathname.replace(suffixPattern, '');
  const previewParts = decodePathParts(previewPathname);
  const previewType = previewParts[0] as ResourceType;
  const previewNameParts = previewParts.slice(1);
  return hasPreviewEntry(projectRoot, previewType, previewNameParts) ? previewPathname : pathname;
}

function normalizeRoute(
  url: string,
  projectRoot = process.cwd(),
): { type: ResourceType; name: string; action: 'preview' | 'spec'; assetPath?: string } | null {
  const rawPathname = url.split('?')[0] || '';
  let pathname = stripPreviewEntryHtmlSuffix(rawPathname, /\/index\.html$/iu, projectRoot);
  pathname = stripPreviewEntryHtmlSuffix(pathname, /\.html$/iu, projectRoot);
  const parts = decodePathParts(pathname);
  if (parts.some((part) => !isSafePathPart(part))) {
    return null;
  }
  const type = parts[0] as ResourceType;
  if (!PREVIEW_TYPES.has(type) || parts.length < 2) {
    return null;
  }
  if (type === 'prototypes' && parts.includes('canvas-assets')) {
    return null;
  }
  const lastPart = parts[parts.length - 1] || '';
  const isAssetRequest = /\.(css|html?|png|jpe?g|webp|svg|gif|avif|ico|json|txt|woff2?|ttf|otf|eot)$/iu.test(lastPart);
  const action = parts[parts.length - 1] === 'spec' ? 'spec' : 'preview';
  let nameParts = action === 'spec' || isAssetRequest ? parts.slice(1, -1) : parts.slice(1);
  let assetParts = isAssetRequest ? [lastPart] : [];
  if (isAssetRequest) {
    const resourceRoot = path.resolve(projectRoot, 'src', type);
    let resolvedNameParts = nameParts;
    let resolvedAssetParts = assetParts;
    for (let splitIndex = 2; splitIndex < parts.length; splitIndex += 1) {
      const candidateNameParts = parts.slice(1, splitIndex);
      const candidateResourceDir = path.resolve(resourceRoot, ...candidateNameParts);
      if (hasPreviewEntry(projectRoot, type, candidateNameParts)) {
        resolvedNameParts = candidateNameParts;
        resolvedAssetParts = parts.slice(splitIndex);
        break;
      }
    }
    nameParts = resolvedNameParts;
    assetParts = resolvedAssetParts;
  }
  const name = nameParts.join('/');
  if (!name || nameParts.some((part) => part === '..')) {
    return null;
  }
  const assetPath = assetParts.join('/');
  if (assetPath && assetPath.split('/').some((part) => !part || part === '..')) {
    return null;
  }
  return { type, name, action, ...(assetPath ? { assetPath } : {}) };
}

function normalizePreviewLoaderRoute(url: string): { type: ResourceType; name: string } | null {
  const pathname = url.split('?')[0] || '';
  const parts = pathname.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const type = parts[0] as ResourceType;
  if (!PREVIEW_TYPES.has(type) || parts.length < 3 || parts[parts.length - 1] !== PREVIEW_LOADER_FILE) {
    return null;
  }
  const nameParts = parts.slice(1, -1);
  const name = nameParts.join('/');
  if (!name || nameParts.some((part) => !part || part === '..')) {
    return null;
  }
  return { type, name };
}

function isHtmlProxyModuleRequest(url: string): boolean {
  return /[?&]html-proxy\b/u.test(url);
}

function readTemplate(projectRoot: string, name: string) {
  const templatePath = path.resolve(projectRoot, 'src/preview-templates', name);
  return fs.readFileSync(templatePath, 'utf8');
}

function toViteFsPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `/@fs${normalized}` : `/@fs/${normalized}`;
}

function stripViteQuery(value: string): string {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const indexes = [queryIndex, hashIndex].filter((index) => index >= 0).sort((left, right) => left - right);
  return indexes.length > 0 ? value.slice(0, indexes[0]) : value;
}

function splitModuleSpecifier(specifier: string): { pathname: string; suffix: string } {
  const queryIndex = specifier.indexOf('?');
  const hashIndex = specifier.indexOf('#');
  const indexes = [queryIndex, hashIndex].filter((index) => index >= 0).sort((left, right) => left - right);
  if (indexes.length === 0) {
    return { pathname: specifier, suffix: '' };
  }
  const suffixIndex = indexes[0];
  return {
    pathname: specifier.slice(0, suffixIndex),
    suffix: specifier.slice(suffixIndex),
  };
}

function getGitVersionIdFromModuleId(id: string): string {
  const queryValue = normalizeGitVersionId(getSearchParamFromRequestUrl(id, 'gitVersion'));
  if (queryValue) {
    return queryValue;
  }
  const cleanId = stripViteQuery(id).replace(/\\/g, '/');
  const match = cleanId.match(/\/\.git-versions\/([a-f0-9]{7,64})(?:\/|$)/iu);
  return normalizeGitVersionId(match?.[1] || '');
}

function getGitVersionSnapshotRoot(projectRoot: string, id: string): string {
  const versionId = getGitVersionIdFromModuleId(id);
  if (!versionId) {
    return '';
  }
  const versionsRoot = path.resolve(projectRoot, '.git-versions');
  const versionRoot = path.resolve(versionsRoot, versionId);
  return versionRoot.startsWith(versionsRoot + path.sep) ? versionRoot : '';
}

function rewriteGitVersionSnapshotSpecifier(projectRoot: string, importerId: string, specifier: string): string {
  const contextParams = getPreviewContextSearchParams(importerId);
  const versionRoot = getGitVersionSnapshotRoot(projectRoot, importerId);
  if (!versionRoot || !specifier.startsWith('/')) {
    return appendSearchParamsToModuleSpecifier(specifier, contextParams);
  }

  const { pathname, suffix } = splitModuleSpecifier(specifier);
  if (pathname === '/@vite/client' || pathname === '/@react-refresh') {
    return specifier;
  }
  if (pathname === '/src' || pathname.startsWith('/src/')) {
    const snapshotPath = path.resolve(versionRoot, pathname.replace(/^\/+/u, ''));
    if (snapshotPath.startsWith(versionRoot + path.sep)) {
      return appendSearchParamsToModuleSpecifier(`${toViteFsPath(snapshotPath)}${suffix}`, contextParams);
    }
  }
  return appendSearchParamsToModuleSpecifier(specifier, contextParams);
}

function rewriteGitVersionSnapshotModuleCode(projectRoot: string, code: string, id: string): string {
  if (!getGitVersionSnapshotRoot(projectRoot, id)) {
    return code;
  }
  return rewriteModuleSpecifiersInCode(
    code,
    (specifier) => rewriteGitVersionSnapshotSpecifier(projectRoot, id, specifier),
  );
}

function normalizeSafeRelativePath(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/u, '')
    .replace(/\/+$/u, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/');
}

function normalizeGitVersionId(value: string): string {
  const trimmed = String(value || '').trim();
  return /^[a-f0-9]{7,64}$/iu.test(trimmed) ? trimmed : '';
}

function hasGitVersionPreviewRequest(route: { type: ResourceType }, requestUrl: string): boolean {
  return route.type === 'prototypes'
    && Boolean(normalizeGitVersionId(getSearchParamFromRequestUrl(requestUrl, 'gitVersion')));
}

function normalizeManagementRuntimeOrigin(serverOrigin: string | null | undefined): string {
  return String(serverOrigin || '').trim().replace(/\/+$/u, '');
}

function serializeInlineScriptString(value: string): string {
  return JSON.stringify(value).replace(/</gu, '\\u003c');
}

export function createManagementRuntimeLoaderSource(serverOrigin: string | null | undefined): string {
  const origin = normalizeManagementRuntimeOrigin(serverOrigin);
  if (!origin) {
    return '';
  }

  const bootstrapUrl = serializeInlineScriptString(`${origin}/assets/dev-template-bootstrap.js`);
  const quickEditUrl = serializeInlineScriptString(`${origin}/runtime/quick-edit.js`);

  return `window.__AXHUB_MANAGEMENT_RUNTIME_BOOTSTRAP__ ||= (async () => {
  const reportError = (stage, error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[Axhub] Management runtime bootstrap failed:', stage, error);
    window.parent?.postMessage({
      type: 'axhub.quickEdit.error',
      stage,
      message: 'Management runtime bootstrap failed: ' + detail,
      error: detail,
    }, '*');
  };

  try {
    await import(${bootstrapUrl});
  } catch (error) {
    reportError('bootstrap-import', error);
    return;
  }

  const editors = window.DevTemplateBootstrap?.editors;
  if (!editors || typeof editors.enable !== 'function') {
    reportError('bootstrap-api', new Error('DevTemplateBootstrap.editors.enable is unavailable'));
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.setAttribute('data-axhub-quick-edit-runtime', '');
      script.src = ${quickEditUrl};
      script.onload = () => resolve(undefined);
      script.onerror = () => reject(new Error('Failed to load quick-edit runtime'));
      (document.head || document.documentElement).appendChild(script);
    });
  } catch (error) {
    reportError('quick-edit-load', error);
  }
})();`;
}

export function createManagementRuntimeScriptTag(serverOrigin: string | null | undefined): string {
  const source = createManagementRuntimeLoaderSource(serverOrigin);
  return source ? `<script type="module" ${MANAGEMENT_RUNTIME_MARKER}>\n${source}\n</script>` : '';
}

export function injectManagementRuntimeScript(html: string, serverOrigin: string | null | undefined): string {
  if (
    !serverOrigin
    || html.includes(MANAGEMENT_RUNTIME_MARKER)
    || !html.includes(PREVIEW_LOADER_MARKER)
  ) {
    return html;
  }
  const tag = createManagementRuntimeScriptTag(serverOrigin);
  if (!tag) {
    return html;
  }
  const finalPreviewLoaderScriptPattern = /(\s*)(<script\b[^>]*\bdata-axhub-preview-loader\b[^>]*>)/u;
  return html.replace(
    finalPreviewLoaderScriptPattern,
    (_match, leadingWhitespace: string, scriptStart: string) => `${leadingWhitespace}${tag}${leadingWhitespace}${scriptStart}`,
  );
}

export function injectReactRefreshPreambleScript(html: string): string {
  if (
    html.includes(REACT_REFRESH_PREAMBLE_MARKER)
    || (
      html.includes('injectIntoGlobalHook(window)')
      && html.includes('window.$RefreshReg$')
      && html.includes('/@react-refresh')
    )
  ) {
    return html;
  }
  return html.includes('</head>')
    ? html.replace('</head>', `  ${REACT_REFRESH_PREAMBLE_SCRIPT}\n</head>`)
    : `${REACT_REFRESH_PREAMBLE_SCRIPT}\n${html}`;
}

export function injectPreviewScrollbarStyle(html: string): string {
  if (html.includes('data-axhub-preview-scrollbar-style')) {
    return html;
  }
  const tag = `<style data-axhub-preview-scrollbar-style>
    html,
    body {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    body {
      overflow-x: hidden;
    }
  </style>`;
  return html.includes('</head>')
    ? html.replace('</head>', `  ${tag}\n</head>`)
    : `${tag}\n${html}`;
}

interface PreviewSource {
  resourceDir: string;
  entryPath: string;
  importPath: string;
  stylePath: string;
  styleHref: string;
}

function createDefaultPreviewSource(projectRoot: string, route: { type: ResourceType; name: string }): PreviewSource {
  const resourceDir = path.resolve(projectRoot, 'src', route.type, route.name);
  const routePath = createRawRoutePath(route.type, route.name);
  if (route.type === 'themes') {
    const theme = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(resourceDir, 'theme.json'), 'utf8'));
      } catch {
        return null;
      }
    })();
    const declaredStyle = String(theme?.implementations?.react?.stylePath || '').replace(/\\/gu, '/');
    const styleRelativePath = /^implementations\/react\/[^/]+\.css$/u.test(declaredStyle)
      ? declaredStyle
      : 'implementations/react/style.css';
    return {
      resourceDir,
      entryPath: path.join(resourceDir, 'implementations', 'react', 'index.tsx'),
      importPath: `${routePath}/implementations/react/index.tsx`,
      stylePath: path.join(resourceDir, ...styleRelativePath.split('/')),
      styleHref: `${routePath}/${styleRelativePath}`,
    };
  }
  return {
    resourceDir,
    entryPath: path.join(resourceDir, 'index.tsx'),
    importPath: `${routePath}/index.tsx`,
    stylePath: path.join(resourceDir, 'style.css'),
    styleHref: `${routePath}/style.css`,
  };
}

function resolveGitVersionPreviewSource(
  projectRoot: string,
  route: { type: ResourceType; name: string },
  requestUrl: string,
): PreviewSource | null {
  if (route.type !== 'prototypes') {
    return null;
  }
  const versionId = normalizeGitVersionId(getSearchParamFromRequestUrl(requestUrl, 'gitVersion'));
  if (!versionId) {
    return null;
  }
  const explicitGitPath = normalizeSafeRelativePath(getSearchParamFromRequestUrl(requestUrl, 'gitPath'));
  const fallbackPath = normalizeSafeRelativePath(`${route.type}/${route.name}`);
  const relativeCandidates = Array.from(new Set([
    explicitGitPath,
    explicitGitPath ? `src/${explicitGitPath}` : '',
    fallbackPath,
    fallbackPath ? `src/${fallbackPath}` : '',
  ].filter(Boolean)));
  const versionsRoot = path.resolve(projectRoot, '.git-versions');
  const versionRoot = path.resolve(versionsRoot, versionId);
  if (!versionRoot.startsWith(versionsRoot + path.sep)) {
    return null;
  }

  const routePath = createRoutePath(route.type, route.name);
  const styleSearchParams = new URLSearchParams({ gitVersion: versionId });
  if (explicitGitPath) {
    styleSearchParams.set('gitPath', explicitGitPath);
  }

  for (const relativePath of relativeCandidates) {
    const resourceDir = path.resolve(versionRoot, ...relativePath.split('/'));
    if (!resourceDir.startsWith(versionRoot + path.sep)) {
      continue;
    }
    const entryPath = path.join(resourceDir, 'index.tsx');
    if (!fs.existsSync(entryPath)) {
      continue;
    }
    const stylePath = path.join(resourceDir, 'style.css');
    return {
      resourceDir,
      entryPath,
      importPath: toViteFsPath(entryPath),
      stylePath,
      styleHref: `${routePath}/style.css?${styleSearchParams.toString()}`,
    };
  }

  return null;
}

function resolvePreviewSource(
  projectRoot: string,
  route: { type: ResourceType; name: string },
  requestUrl: string,
): PreviewSource {
  return resolveGitVersionPreviewSource(projectRoot, route, requestUrl)
    || createDefaultPreviewSource(projectRoot, route);
}

function createPreviewLoader(
  type: ResourceType,
  name: string,
  projectRoot: string,
  previewSource: PreviewSource,
  requestUrl: string,
) {
  const contextParams = getPreviewContextSearchParams(requestUrl);
  const importPath = appendSearchParamsToModuleSpecifier(previewSource.importPath, contextParams);
  const previewPath = createRawRoutePath(type, name);
  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewComponent from ${JSON.stringify(importPath)};

class AxhubPreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    window.axhub?.prototypeRuntime?.reportError?.(error, {
      type: 'react-render',
      sourceFile: ${JSON.stringify(importPath)},
      componentStack: errorInfo?.componentStack,
      resourceType: ${JSON.stringify(type === 'prototypes' ? 'prototype' : 'theme')},
      resourceId: ${JSON.stringify(name)},
    });
  }

  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: {
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          boxSizing: 'border-box',
          color: '#111827',
          background: '#f6f7f9',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }, React.createElement('div', {
        style: {
          width: 'min(520px, 100%)',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          background: '#ffffff',
          padding: 20,
          boxShadow: '0 18px 50px rgba(17, 24, 39, 0.10)',
        },
      }, [
        React.createElement('strong', { key: 'title' }, '原型运行错误'),
        React.createElement('p', {
          key: 'message',
          style: { margin: '10px 0 0', color: '#4b5563', overflowWrap: 'anywhere' },
        }, this.state.error?.message || '页面渲染失败'),
      ]));
    }
    return this.props.children;
  }
}

function notifyAxhubPreviewUpdated(reason) {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({
    type: 'AXHUB_PREVIEW_UPDATED',
    reason,
    path: ${JSON.stringify(previewPath)},
    updatedAt: Date.now(),
  }, '*');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[Axhub Make Project] Missing #root container');
}

const root = createRoot(rootElement);
function renderPreview(Component) {
  root.render(React.createElement(AxhubPreviewErrorBoundary, null, React.createElement(Component, {
    container: rootElement,
    config: {
      projectPath: ${JSON.stringify(projectRoot)},
    },
    data: {},
    events: {},
  })));
}

renderPreview(PreviewComponent);

if (import.meta.hot) {
  import.meta.hot.accept(${JSON.stringify(importPath)}, (nextModule) => {
    const NextComponent = nextModule?.default || PreviewComponent;
    renderPreview(NextComponent);
    notifyAxhubPreviewUpdated('hmr');
  });
}
`;
}

function createPreviewLoaderScriptTag(
  type: ResourceType,
  name: string,
  requestUrl: string,
): string {
  const src = appendPreviewLoaderSearchParams(createPreviewLoaderPath(type, name), requestUrl);
  return `<script type="module" ${PREVIEW_LOADER_MARKER} src="${src}"></script>`;
}

function replacePreviewLoaderPlaceholder(
  html: string,
  type: ResourceType,
  name: string,
  requestUrl: string,
): string {
  const scriptTag = createPreviewLoaderScriptTag(type, name, requestUrl);
  const inlineModulePattern = /(\s*)<script\b[^>]*type=["']module["'][^>]*>\s*\{\{PREVIEW_LOADER\}\}\s*<\/script>/u;
  if (inlineModulePattern.test(html)) {
    return html.replace(inlineModulePattern, (_match, leadingWhitespace: string) => `${leadingWhitespace}${scriptTag}`);
  }
  return html.replace(/\{\{PREVIEW_LOADER\}\}/g, scriptTag);
}

function sendPreviewFile(res: {
  statusCode?: number;
  setHeader(name: string, value: string): void;
  end(data?: string | Buffer): void;
}, filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(filePath));
  return true;
}

function createGitVersionPreviewUnavailableHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>历史版本无法预览</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #111827; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    main { width: min(420px, 100%); background: #fff; border: 1px solid #d7dce3; border-radius: 8px; box-shadow: 0 18px 50px rgba(17, 24, 39, 0.10); padding: 28px; box-sizing: border-box; text-align: center; }
    h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.3; letter-spacing: 0; }
    p { margin: 0; color: #4b5563; line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <h1>这个历史版本无法预览</h1>
    <p>这个版本里缺少当前原型的入口文件，请选择包含该原型入口的历史版本。</p>
  </main>
</body>
</html>`;
}

function createGitVersionPreviewUnavailableLoader(): string {
  return `
const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f6f7f9;color:#111827;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><section style="width:min(420px,100%);background:#fff;border:1px solid #d7dce3;border-radius:8px;box-shadow:0 18px 50px rgba(17,24,39,.10);padding:28px;box-sizing:border-box;text-align:center"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;letter-spacing:0">这个历史版本无法预览</h1><p style="margin:0;color:#4b5563;line-height:1.7">这个版本里缺少当前原型的入口文件，请选择包含该原型入口的历史版本。</p></section></main>';
}
`;
}

function sendGitVersionPreviewUnavailable(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(createGitVersionPreviewUnavailableHtml());
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function normalizeAddress(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '');
  return normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : normalized;
}

function getLocalPreviewNetworkHosts(): string[] {
  const hosts = new Set<string>();
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) {
        hosts.add(normalizeAddress(net.address));
      }
    }
  }
  return Array.from(hosts);
}

function isLocalPreviewAddress(value: string): boolean {
  const normalized = normalizeAddress(value);
  return !normalized
    || normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::'
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/u.test(normalized)
    || getLocalPreviewNetworkHosts().includes(normalized);
}

function getHostHeaderHostname(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return hostHeader.split(':')[0] || '';
  }
}

function isLocalPreviewRequest(req: IncomingMessage): boolean {
  const forwardedFor = getHeaderValue(req.headers['x-forwarded-for']).split(',')[0]?.trim();
  if (forwardedFor) {
    return isLocalPreviewAddress(forwardedFor);
  }
  const remoteAddress = req.socket?.remoteAddress || '';
  if (remoteAddress && !isLocalPreviewAddress(remoteAddress)) {
    return false;
  }
  return isLocalPreviewAddress(getHostHeaderHostname(getHeaderValue(req.headers.host)));
}

function getRequestCookie(req: IncomingMessage, name: string): string {
  const cookieHeader = getHeaderValue(req.headers.cookie);
  for (const part of cookieHeader.split(';')) {
    const [key, ...rawValue] = part.trim().split('=');
    if (key === name) {
      return rawValue.join('=').trim();
    }
  }
  return '';
}

function createClientLanAccessCookie(sessionToken: string): string {
  return `${LAN_ACCESS_COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${LAN_ACCESS_SESSION_MAX_AGE_SECONDS}`;
}

function cleanLanAccessTokenFromRequestUrl(requestUrl: string): string {
  const url = new URL(requestUrl || '/', 'http://localhost');
  url.searchParams.delete(LAN_ACCESS_TOKEN_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

function sendClientLanAccessMessage(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>局域网预览访问</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111827;background:#f8fafc">
  <main style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 12px">局域网预览访问</h1>
    <p style="margin:0;color:#4b5563;line-height:1.7">${message}</p>
  </main>
</body>
</html>`);
}

function isCssModuleRequest(
  req: { headers?: Record<string, string | string[] | undefined> },
  assetPath: string,
): boolean {
  if (path.extname(assetPath).toLowerCase() !== '.css') {
    return false;
  }
  if (getHeaderValue(req.headers?.['sec-fetch-dest']).toLowerCase() === 'script') {
    return true;
  }
  const accept = getHeaderValue(req.headers?.accept).toLowerCase();
  if (accept && !accept.includes('text/css')) {
    return true;
  }
  const referer = getHeaderValue(req.headers?.referer || req.headers?.referrer).trim();
  if (!referer) {
    return false;
  }
  try {
    const pathname = new URL(referer).pathname;
    return /\.(?:[cm]?[jt]sx?|mjs)$/iu.test(pathname);
  } catch {
    return false;
  }
}

function requiresViteCssTransform(filePath: string): boolean {
  if (path.extname(filePath).toLowerCase() !== '.css') {
    return false;
  }
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    return /@import\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"')]*)?["']/u.test(source);
  } catch {
    return false;
  }
}

function isViteAssetModuleRequest(requestUrl: string): boolean {
  try {
    const searchParams = new URL(requestUrl || '/', 'http://localhost').searchParams;
    return ['import', 'url', 'raw', 'inline', 'worker', 'sharedworker'].some((key) => searchParams.has(key));
  } catch {
    return /[?&](?:import|url|raw|inline|worker|sharedworker)(?:[=&]|$)/u.test(requestUrl || '');
  }
}

function resolvePreviewAssetPath(projectRoot: string, route: {
  type: ResourceType;
  name: string;
  assetPath: string;
  resourceDir?: string;
}): string | null {
  const resourceDir = route.resourceDir || path.resolve(projectRoot, 'src', route.type, route.name);
  const assetPath = route.assetPath.replace(/\\/gu, '/');
  const assetParts = assetPath.split('/').filter(Boolean);
  if (assetParts.length === 0 || assetParts.some((part) => part === '..')) {
    return null;
  }

  const resolvedPath = path.resolve(resourceDir, ...assetParts);
  const relative = path.relative(resourceDir, resolvedPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolvedPath;
}

function getRequestRefererOrigin(req: { headers?: Record<string, string | string[] | undefined> }): string | null {
  const referer = getHeaderValue(req.headers?.referer || req.headers?.referrer).trim();
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '');
  return !normalized
    || normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::'
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/u.test(normalized);
}

function formatUrlHost(hostname: string): string {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

function getRequestProtocol(req: { headers?: Record<string, string | string[] | undefined> }): 'http' | 'https' {
  const forwardedProto = getHeaderValue(req.headers?.['x-forwarded-proto']).split(',')[0]?.trim().toLowerCase();
  return forwardedProto === 'https' ? 'https' : 'http';
}

function createNetworkAdminOriginFromRequestHost(
  req: { headers?: Record<string, string | string[] | undefined> },
  adminInfo: AxhubServerInfo | null,
): string | null {
  const forwardedHostHeader = getHeaderValue(req.headers?.['x-forwarded-host']).split(',')[0]?.trim() || '';
  const hostHeader = forwardedHostHeader || getHeaderValue(req.headers?.host).trim();
  if (!hostHeader) {
    return null;
  }
  try {
    const requestUrl = new URL(`http://${hostHeader}`);
    const requestHost = requestUrl.hostname;
    const explicitPort = Number(requestUrl.port);
    const port = forwardedHostHeader && Number.isInteger(explicitPort) && explicitPort > 0
      ? explicitPort
      : adminInfo?.port;
    if (!port) {
      return null;
    }
    if (!forwardedHostHeader && isLocalHostname(requestHost)) {
      return null;
    }
    return `${getRequestProtocol(req)}://${formatUrlHost(requestHost)}:${port}`;
  } catch {
    return null;
  }
}

function isAdminHealthPayload(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { role?: unknown }).role === 'admin');
}

async function isHealthyAdminOrigin(origin: string | null | undefined): Promise<boolean> {
  if (!origin) {
    return false;
  }
  const health = await fetchHealth(origin, 600);
  return isAdminHealthPayload(health)
    && hasAdminCapability(health, 'reviewReports')
    && Boolean(normalizeHealthServerInfo(health)?.origin);
}

async function resolveAdminServerOrigin(
  projectRoot: string,
  req: { headers?: Record<string, string | string[] | undefined> },
): Promise<string | null> {
  const embeddedAdminOrigin = getRequestRefererOrigin(req);
  if (embeddedAdminOrigin) {
    if (await isHealthyAdminOrigin(embeddedAdminOrigin)) {
      return embeddedAdminOrigin;
    }
  }

  const info = readServerInfo(projectRoot, 'admin');
  const requestHostAdminOrigin = createNetworkAdminOriginFromRequestHost(req, info);
  if (requestHostAdminOrigin) {
    if (await isHealthyAdminOrigin(requestHostAdminOrigin)) {
      return requestHostAdminOrigin;
    }
  }

  if (await isHealthyAdminOrigin(info?.origin)) {
    return info?.origin || null;
  }

  if (info?.origin !== DEFAULT_ADMIN_ORIGIN && await isHealthyAdminOrigin(DEFAULT_ADMIN_ORIGIN)) {
    return DEFAULT_ADMIN_ORIGIN;
  }

  return null;
}

function shouldSkipLanPreviewAuth(projectRoot: string): boolean {
  try {
    const config = JSON.parse(fs.readFileSync(
      path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'),
      'utf8',
    ));
    return config?.server?.skipLanPreviewAuth === true;
  } catch {
    return false;
  }
}

async function handleClientLanAccess(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): Promise<boolean> {
  if (isLocalPreviewRequest(req) || shouldSkipLanPreviewAuth(projectRoot)) {
    return false;
  }

  const adminOrigin = await resolveAdminServerOrigin(projectRoot, req);
  if (!adminOrigin) {
    sendClientLanAccessMessage(res, 503, '无法连接 Make 管理端，请回到本机确认 Make 服务正在运行。');
    return true;
  }

  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const shareToken = requestUrl.searchParams.get(LAN_ACCESS_TOKEN_PARAM)?.trim() || '';
  if (shareToken) {
    const exchangeResponse = await fetch(new URL('/api/access/exchange', adminOrigin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: shareToken }),
    });
    const body = await exchangeResponse.json().catch(() => ({}));
    if (exchangeResponse.ok && typeof body?.sessionToken === 'string' && body.sessionToken.trim()) {
      res.statusCode = 302;
      res.setHeader('Set-Cookie', createClientLanAccessCookie(body.sessionToken.trim()));
      res.setHeader('Location', cleanLanAccessTokenFromRequestUrl(req.url || '/'));
      res.end();
      return true;
    }
    sendClientLanAccessMessage(res, 401, '局域网链接已过期，请回到 Make 管理端重新复制链接或刷新二维码。');
    return true;
  }

  const sessionToken = getRequestCookie(req, LAN_ACCESS_COOKIE);
  if (sessionToken) {
    const validateResponse = await fetch(new URL('/api/access/validate', adminOrigin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });
    if (validateResponse.ok) {
      return false;
    }
  }

  const statusResponse = await fetch(new URL('/api/access/status', adminOrigin), {
    headers: { accept: 'application/json' },
  });
  const status = await statusResponse.json().catch(() => ({}));
  if (!status?.passwordSet) {
    sendClientLanAccessMessage(res, 403, '请先回到本机 Make 管理端，在左上角设置里设置局域网访问密码。');
    return true;
  }
  sendClientLanAccessMessage(res, 401, '请从 Make 管理端复制局域网链接或二维码。');
  return true;
}

export function clientPreviewPlugin(): Plugin {
  const projectRoot = process.cwd();

  return {
    name: 'make-project-client-preview',
    apply: 'serve',
    config() {
      return {
        server: {
          fs: {
            allow: [
              projectRoot,
              path.resolve(projectRoot, '.git-versions'),
            ],
          },
        },
      };
    },
    resolveId(id) {
      if (normalizePreviewLoaderRoute(id)) {
        return id;
      }
      return null;
    },
    transform(code, id) {
      const rewritten = rewriteGitVersionSnapshotModuleCode(projectRoot, code, id);
      return rewritten === code ? null : { code: rewritten, map: null };
    },
    load(id) {
      const loaderRoute = normalizePreviewLoaderRoute(id);
      if (!loaderRoute) {
        return null;
      }

      const gitVersionPreview = hasGitVersionPreviewRequest(loaderRoute, id);
      const gitVersionPreviewSource = gitVersionPreview
        ? resolveGitVersionPreviewSource(projectRoot, loaderRoute, id)
        : null;
      if (gitVersionPreview && !gitVersionPreviewSource) {
        return createGitVersionPreviewUnavailableLoader();
      }
      const previewSource = gitVersionPreviewSource || resolvePreviewSource(projectRoot, loaderRoute, id);
      if (!fs.existsSync(previewSource.entryPath)) {
        return null;
      }
      return createPreviewLoader(loaderRoute.type, loaderRoute.name, projectRoot, previewSource, id);
    },
    async configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url || req.method !== 'GET') {
            next();
            return;
          }

          if (normalizePreviewLoaderRoute(req.url)) {
            next();
            return;
          }

          if (isHtmlProxyModuleRequest(req.url)) {
            const contextParams = ['projectId', 'gitVersion', 'gitPath']
              .map((key) => ({
                key,
                value: getSearchParamFromRequestUrl(req.url || '', key)
                  || getSearchParamFromRequestReferer(req, key),
              }))
              .filter((param) => param.value);
            if (contextParams.length > 0) {
              handleHtmlProxyModuleRequestWithProjectContext(req, res, next, contextParams);
              return;
            }
            next();
            return;
          }

          const route = normalizeRoute(req.url, projectRoot);
          if (!route) {
            next();
            return;
          }

          const gitVersionPreview = hasGitVersionPreviewRequest(route, req.url);
          const gitVersionPreviewSource = gitVersionPreview
            ? resolveGitVersionPreviewSource(projectRoot, route, req.url)
            : null;
          if (gitVersionPreview && !gitVersionPreviewSource) {
            sendGitVersionPreviewUnavailable(res);
            return;
          }
          const previewSource = gitVersionPreviewSource || resolvePreviewSource(projectRoot, route, req.url);
          const entryPath = previewSource.entryPath;

          if (route.assetPath) {
            if (isViteAssetModuleRequest(req.url)) {
              next();
              return;
            }
            if (isCssModuleRequest(req, route.assetPath)) {
              next();
              return;
            }
            const assetPath = resolvePreviewAssetPath(projectRoot, {
              type: route.type,
              name: route.name,
              assetPath: route.assetPath,
              resourceDir: previewSource.resourceDir,
            });
            if (assetPath && requiresViteCssTransform(assetPath)) {
              next();
              return;
            }
            if (assetPath && sendPreviewFile(res, assetPath)) {
              return;
            }
            next();
            return;
          }

          const wantsReactTheme = route.type === 'themes'
            && getSearchParamFromRequestUrl(req.url, 'implementation') === 'react';
          const knowledgePreviewPath = route.type === 'themes'
            ? path.join(previewSource.resourceDir, 'preview.html')
            : '';
          if (route.action === 'preview' && route.type === 'themes' && !wantsReactTheme && fs.existsSync(knowledgePreviewPath)) {
            if (await handleClientLanAccess(req, res, projectRoot)) return;
            res.statusCode = 302;
            res.setHeader('Location', `${createRoutePath(route.type, route.name)}/preview.html`);
            res.end();
            return;
          }

          if (!fs.existsSync(entryPath)) {
            next();
            return;
          }

          if (route.action === 'spec') {
            next();
            return;
          }

          if (await handleClientLanAccess(req, res, projectRoot)) {
            return;
          }

          const title = buildPreviewTitle({
            group: route.type,
            name: route.name,
            displayName: readEntryDisplayName(entryPath),
            mode: 'dev',
          });
          const template = readTemplate(projectRoot, 'dev-template.html');
          const serverOrigin = shouldInjectManagementRuntime(req.url)
            ? await resolveAdminServerOrigin(projectRoot, req)
            : null;
          let html = template
            .replace(/\{\{TITLE\}\}/g, title)
            .replace(
              '</head>',
              `  <base href="${createRouteBaseHref(route.type, route.name)}">\n</head>`,
            );
          html = injectPreviewScrollbarStyle(html);

          const stylePath = previewSource.stylePath;
          if (fs.existsSync(stylePath)) {
            html = html.replace(
              '</head>',
              `  <link rel="stylesheet" href="${previewSource.styleHref}">\n</head>`,
            );
          }
          html = replacePreviewLoaderPlaceholder(html, route.type, route.name, req.url);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          const transformedHtml = await server.transformIndexHtml(
            createPreviewTransformUrl(route.type, route.name),
            html,
          );
          const htmlWithManagementRuntime = injectManagementRuntimeScript(transformedHtml, serverOrigin);
          res.end(injectReactRefreshPreambleScript(htmlWithManagementRuntime));
        } catch (error) {
          next(error);
        }
      });
    },
    transformIndexHtml(html) {
      if (!html.includes('{{PREVIEW_LOADER}}')) {
        return html;
      }
      return html.replace(new RegExp(escapeRegExp('{{PREVIEW_LOADER}}'), 'g'), '');
    },
  };
}
