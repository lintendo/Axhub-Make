import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { appendSearchParamsToModuleSpecifiersInCode, } from '../../client/vite-plugins/utils/moduleSpecifierQuery.ts';
import { isPathInside, resolveComparableProjectRoot, resolveProjectRoot } from './projectCore/index.ts';
const RUNTIME_API_PREFIXES = [
    '/api/ws/',
    '/api/text-replace/',
    '/api/hack-css/',
];
const RUNTIME_EXACT_PATHS = new Set([
    '/ws',
    '/@react-refresh',
    '/@vite/client',
]);
const RUNTIME_FILE_PATTERNS = [
    /^\/@fs\//u,
    /^\/@id\//u,
    /^\/@vite\//u,
    /^\/node_modules\/\.vite\//u,
    /^\/src\//u,
    /^\/build\/.+\.js$/u,
    /^\/prototypes\/.+/u,
    /^\/themes\/.+/u,
    /^\/docs\/.+(?:\/spec\.html)?$/u,
    /^\/assets\//u,
];
const RUNTIME_DOCUMENT_PREFIXES = new Set(['prototypes', 'themes']);
const ADMIN_RUNTIME_ASSET_PATHS = new Set([
    '/assets/dev-template-bootstrap.js',
    '/assets/runtime-export-core.js',
    '/assets/spec-template-bootstrap.js',
    '/assets/spec-template-styles.js',
    '/assets/canvas-template-bootstrap.js',
    '/assets/html-template-bootstrap.js',
]);
const RUNTIME_SOURCE_FILE_EXTENSIONS = new Set([
    '.avif',
    '.css',
    '.gif',
    '.glb',
    '.gltf',
    '.jpeg',
    '.jpg',
    '.js',
    '.json',
    '.jsx',
    '.mjs',
    '.mp3',
    '.mp4',
    '.png',
    '.sass',
    '.scss',
    '.svg',
    '.ts',
    '.tsx',
    '.txt',
    '.wasm',
    '.webm',
    '.webp',
]);
const RUNTIME_GRAPH_REFERER_PATTERNS = [
    /^\/@fs\//u,
    /^\/@id\//u,
    /^\/@vite\//u,
    /^\/@react-refresh$/u,
    /^\/@vite\/client$/u,
    /^\/node_modules\/\.vite\//u,
    /^\/prototypes\//u,
    /^\/src\//u,
    /^\/themes\//u,
];
const RUNTIME_CONTEXT_QUERY_KEYS = ['projectId', 'gitVersion', 'gitPath'];
function getPathname(requestUrl) {
    try {
        return new URL(requestUrl || '/', 'http://localhost').pathname;
    }
    catch {
        return (requestUrl || '/').split('?')[0] || '/';
    }
}
function getHeaderValue(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
function getRequestReferer(headers) {
    return getHeaderValue(headers.referer || headers.referrer).trim();
}
function getSearchParamFromUrl(value, key) {
    try {
        return new URL(value || '/', 'http://localhost').searchParams.get(key)?.trim() || '';
    }
    catch {
        return '';
    }
}
function getSearchParamFromRequestOrReferer(req, key) {
    const directValue = getSearchParamFromUrl(req.url || '/', key);
    if (directValue) {
        return directValue;
    }
    const referer = getRequestReferer(req.headers);
    return referer ? getSearchParamFromUrl(referer, key) : '';
}
function getRuntimeContextSearchParams(req) {
    return RUNTIME_CONTEXT_QUERY_KEYS
        .map((key) => ({
        key,
        value: getSearchParamFromRequestOrReferer(req, key),
    }))
        .filter((param) => param.value);
}
function shouldRewriteRuntimeModuleResponse(proxyRes) {
    const contentType = getHeaderValue(proxyRes.headers['content-type']).toLowerCase();
    return contentType.includes('javascript') || contentType.includes('ecmascript');
}
function decodePathname(pathname) {
    try {
        return decodeURIComponent(pathname);
    }
    catch {
        return pathname;
    }
}
function getFsPathFromRuntimePathname(pathname) {
    const decodedPathname = decodePathname(pathname);
    if (!decodedPathname.startsWith('/@fs/')) {
        return '';
    }
    return path.resolve(`/${decodedPathname.slice('/@fs/'.length)}`);
}
function isRuntimeGraphReferer(referer) {
    if (!referer) {
        return false;
    }
    try {
        const parsed = new URL(referer, 'http://localhost');
        const pathname = decodePathname(parsed.pathname);
        return RUNTIME_GRAPH_REFERER_PATTERNS.some((pattern) => pattern.test(pathname))
            || (Boolean(parsed.searchParams.get('projectId')) && isRuntimeSourcePathname(pathname))
            || isRuntimeHtmlProxyRequest(`${parsed.pathname}${parsed.search}`);
    }
    catch {
        const pathname = decodePathname(referer.split('?')[0] || referer);
        return RUNTIME_GRAPH_REFERER_PATTERNS.some((pattern) => pattern.test(pathname))
            || isRuntimeHtmlProxyRequest(referer);
    }
}
function isRuntimeSourcePathname(pathname) {
    const decodedPathname = decodePathname(pathname);
    if (decodedPathname === '/' || decodedPathname === '/index.html') {
        return false;
    }
    if (decodedPathname.startsWith('/api/')
        || decodedPathname.startsWith('/opencode')
        || ADMIN_RUNTIME_ASSET_PATHS.has(decodedPathname)) {
        return false;
    }
    return RUNTIME_SOURCE_FILE_EXTENSIONS.has(path.extname(decodedPathname).toLowerCase());
}
function isProjectScopedRuntimeSourceReferer(referer) {
    if (!referer) {
        return false;
    }
    try {
        const parsed = new URL(referer, 'http://localhost');
        return Boolean(parsed.searchParams.get('projectId')) && isRuntimeSourcePathname(parsed.pathname);
    }
    catch {
        return false;
    }
}
function isActiveProjectFsRequest(requestUrl, runtimeProjectRoot) {
    if (!runtimeProjectRoot) {
        return false;
    }
    const fsPath = getFsPathFromRuntimePathname(getPathname(requestUrl));
    if (!fsPath) {
        return false;
    }
    return isPathInside(resolveProjectRoot(runtimeProjectRoot), resolveProjectRoot(fsPath))
        || isPathInside(resolveComparableProjectRoot(runtimeProjectRoot), resolveComparableProjectRoot(fsPath));
}
function isSamePath(left, right) {
    return resolveProjectRoot(left) === resolveProjectRoot(right)
        || resolveComparableProjectRoot(left) === resolveComparableProjectRoot(right);
}
function isViteClientEnvRequest(requestUrl, adminViteClientEnvPath) {
    if (!adminViteClientEnvPath) {
        return false;
    }
    const fsPath = getFsPathFromRuntimePathname(getPathname(requestUrl));
    if (!fsPath || !/\/vite\/dist\/client\/env\.mjs$/u.test(fsPath)) {
        return false;
    }
    return !isSamePath(fsPath, adminViteClientEnvPath);
}
function isRuntimePreviewPathname(pathname) {
    const decodedPathname = decodePathname(pathname);
    return /(?:^|\/)(?:prototypes|themes)\//u.test(decodedPathname);
}
function isRuntimePreviewReferer(referer) {
    if (!referer) {
        return false;
    }
    try {
        const parsed = new URL(referer, 'http://localhost');
        return isRuntimePreviewPathname(parsed.pathname)
            || isRuntimeHtmlProxyRequest(`${parsed.pathname}${parsed.search}`);
    }
    catch {
        return isRuntimePreviewPathname(referer)
            || isRuntimeHtmlProxyRequest(referer);
    }
}
export function isRuntimeDevModuleRequest(requestUrl, headers, options = {}) {
    if (isRuntimeHtmlProxyRequest(requestUrl)) {
        return true;
    }
    if (getPathname(requestUrl) === '/@vite/client' && getSearchParamFromUrl(requestUrl, 'projectId')) {
        return true;
    }
    const referer = getRequestReferer(headers);
    if (isActiveProjectFsRequest(requestUrl, options.runtimeProjectRoot)) {
        return isRuntimePreviewReferer(referer) || isRuntimeGraphReferer(referer);
    }
    if (isViteClientEnvRequest(requestUrl, options.adminViteClientEnvPath)) {
        return isRuntimeGraphReferer(referer);
    }
    const pathname = getPathname(requestUrl);
    const decodedPathname = decodePathname(pathname);
    if (decodedPathname === '/'
        || decodedPathname === '/index.html'
        || decodedPathname.startsWith('/api/')
        || decodedPathname.startsWith('/opencode')
        || ADMIN_RUNTIME_ASSET_PATHS.has(decodedPathname)) {
        return false;
    }
    const hasRuntimeGraphContext = isRuntimePreviewReferer(referer)
        || isProjectScopedRuntimeSourceReferer(referer);
    if (!hasRuntimeGraphContext) {
        return false;
    }
    return isRuntimeOnlyRoute(decodedPathname)
        || isRuntimeSourcePathname(decodedPathname);
}
export function isRuntimeHtmlProxyRequest(requestUrl) {
    const rawUrl = requestUrl || '/';
    if (!/[?&]html-proxy\b/u.test(rawUrl)) {
        return false;
    }
    const pathname = rawUrl.split('?')[0] || '/';
    return isRuntimePreviewPathname(pathname);
}
export function isRuntimeOnlyRoute(pathname) {
    const pathOnly = pathname.split('?')[0] || '/';
    const decodedPathOnly = decodePathname(pathOnly);
    if (/^\/canvas\/(?:resources|prototypes)\//u.test(decodedPathOnly)
        || /^\/prototypes\/[^/]+\/canvas-assets\//u.test(decodedPathOnly)) {
        return false;
    }
    if (RUNTIME_EXACT_PATHS.has(pathOnly)) {
        return true;
    }
    if (RUNTIME_API_PREFIXES.some((prefix) => pathOnly.startsWith(prefix))) {
        return true;
    }
    return RUNTIME_FILE_PATTERNS.some((pattern) => pattern.test(pathOnly));
}
export function getRuntimeProxyTargetPath(requestUrl) {
    const rawUrl = requestUrl || '/';
    try {
        const parsed = new URL(rawUrl, 'http://localhost');
        if (parsed.pathname === '/@vite/client'
            || /\/vite\/dist\/client\/env\.mjs$/u.test(decodePathname(parsed.pathname))) {
            for (const key of RUNTIME_CONTEXT_QUERY_KEYS) {
                parsed.searchParams.delete(key);
            }
            return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
        }
    }
    catch {
        // Fall through to the original URL.
    }
    return rawUrl;
}
export function isRuntimeDocumentRequest(requestUrl) {
    const rawUrl = requestUrl || '/';
    if (/[?&]html-proxy\b/u.test(rawUrl)) {
        return false;
    }
    const pathname = getPathname(rawUrl);
    let decodedPathname = pathname;
    try {
        decodedPathname = decodeURIComponent(pathname);
    }
    catch {
        // Keep the raw pathname when decoding fails.
    }
    const parts = decodedPathname.split('/').filter(Boolean);
    if (parts.length < 2 || !RUNTIME_DOCUMENT_PREFIXES.has(parts[0])) {
        return false;
    }
    if (parts.includes('canvas-assets')) {
        return false;
    }
    const lastPart = parts.at(-1) || '';
    const extensionMatch = lastPart.match(/(\.[a-z0-9]+)$/iu);
    if (!extensionMatch) {
        return true;
    }
    return lastPart === 'index.html' && parts.length >= 3;
}
export function createRuntimeUnavailableHtml(requestUrl, _detail = '') {
    const requestPath = getPathname(requestUrl);
    const payloadJson = JSON.stringify({
        type: 'axhub:runtime-unavailable',
        requestPath,
    }).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Make 客户端未启动</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #111827; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    main { width: min(420px, 100%); background: #fff; border: 1px solid #d7dce3; border-radius: 8px; box-shadow: 0 18px 50px rgba(17, 24, 39, 0.10); padding: 28px; box-sizing: border-box; text-align: center; }
    h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.3; letter-spacing: 0; }
    p { margin: 0 0 18px; color: #4b5563; line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    a, button { border: 1px solid #cfd6e0; border-radius: 6px; background: #fff; color: #111827; min-height: 36px; padding: 0 14px; font: inherit; cursor: pointer; display: inline-flex; align-items: center; text-decoration: none; }
    a.primary { background: #111827; border-color: #111827; color: #fff; }
  </style>
</head>
<body>
  <main>
    <h1>Make 客户端未启动</h1>
    <p>正在回到管理页，请在管理页启动客户端后继续预览。</p>
    <div class="actions">
      <a class="primary" href="/" data-admin-link>回到管理页</a>
      <button type="button" data-reload>重新加载</button>
    </div>
  </main>
  <script>
    const payload = ${payloadJson};
    const buildAdminUrl = () => {
      const target = new URL('/', window.location.href);
      const parts = String(payload.requestPath || '').split('/').filter(Boolean);
      if (parts[0] === 'prototypes' && parts[1]) {
        target.searchParams.set('p', parts[1]);
      } else if (parts[0] === 'themes' && parts[1]) {
        target.searchParams.set('theme', parts[1]);
      }
      return target.toString();
    };
    const adminUrl = buildAdminUrl();
    const adminLink = document.querySelector('[data-admin-link]');
    if (adminLink) {
      adminLink.href = adminUrl;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, window.location.origin);
    } else {
      window.location.replace(adminUrl);
    }
    document.querySelector('[data-reload]')?.addEventListener('click', () => {
      window.location.reload();
    });
  </script>
</body>
</html>`;
}
function sendRuntimeUnavailableHtml(res, requestUrl, status, detail = '') {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(createRuntimeUnavailableHtml(requestUrl, detail));
}
export function sendRuntimeUnavailableResponse(res, requestUrl, status, detail = '') {
    if (isRuntimeDocumentRequest(requestUrl)) {
        sendRuntimeUnavailableHtml(res, requestUrl, status, detail);
        return;
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
        error: 'Runtime unavailable',
        runtime: { available: false },
        ...(detail ? { message: detail } : {}),
    }));
}
function getFirstHeaderValue(value) {
    return getHeaderValue(value).split(',')[0]?.trim() || '';
}
function getForwardedHostForRuntime(req) {
    return getFirstHeaderValue(req.headers['x-forwarded-host'])
        || getFirstHeaderValue(req.headers.host);
}
function getForwardedProtoForRuntime(req) {
    const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']).toLowerCase();
    if (forwardedProto === 'https' || forwardedProto === 'http') {
        return forwardedProto;
    }
    return req.socket?.encrypted ? 'https' : 'http';
}
export function proxyToRuntime(req, res, runtimeOrigin) {
    const target = new URL(getRuntimeProxyTargetPath(req.url || '/'), runtimeOrigin);
    const transport = target.protocol === 'https:' ? https : http;
    const contextParams = getRuntimeContextSearchParams(req);
    const forwardedHost = getForwardedHostForRuntime(req);
    const forwardedProto = getForwardedProtoForRuntime(req);
    const proxyReq = transport.request(target, {
        method: req.method,
        headers: {
            ...req.headers,
            host: target.host,
            ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
            'x-forwarded-proto': forwardedProto,
        },
    }, (proxyRes) => {
        if (contextParams.length === 0 || !shouldRewriteRuntimeModuleResponse(proxyRes)) {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
            return;
        }
        const chunks = [];
        proxyRes.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        proxyRes.on('end', () => {
            const headers = { ...proxyRes.headers };
            const body = Buffer.concat(chunks).toString('utf8');
            const rewritten = Buffer.from(appendSearchParamsToModuleSpecifiersInCode(body, contextParams), 'utf8');
            delete headers['content-length'];
            delete headers['content-encoding'];
            res.writeHead(proxyRes.statusCode || 502, {
                ...headers,
                'content-length': String(rewritten.length),
            });
            res.end(rewritten);
        });
    });
    proxyReq.on('error', (error) => {
        if (!res.headersSent) {
            sendRuntimeUnavailableResponse(res, req.url || '/', 502, error.message);
            return;
        }
        res.destroy(error);
    });
    req.pipe(proxyReq);
}
export function proxyRuntimeWebSocketUpgrade(req, socket, head, runtimeOrigin) {
    let target;
    try {
        target = new URL(getRuntimeProxyTargetPath(req.url || '/'), runtimeOrigin);
    }
    catch {
        socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        return;
    }
    const isSecure = target.protocol === 'https:' || target.protocol === 'wss:';
    const targetPort = Number(target.port) || (isSecure ? 443 : 80);
    const targetSocket = isSecure
        ? tls.connect(targetPort, target.hostname)
        : net.connect(targetPort, target.hostname);
    let settled = false;
    const closeWithBadGateway = () => {
        if (!settled) {
            settled = true;
            socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        }
        else {
            socket.destroy();
        }
        targetSocket.destroy();
    };
    targetSocket.once('connect', () => {
        settled = true;
        const requestPath = `${target.pathname}${target.search}`;
        const headers = [
            `${req.method || 'GET'} ${requestPath || '/'} HTTP/${req.httpVersion || '1.1'}`,
            ...Object.entries(req.headers)
                .filter(([name]) => name.toLowerCase() !== 'host')
                .flatMap(([name, value]) => {
                if (Array.isArray(value)) {
                    return value.map((entry) => `${name}: ${entry}`);
                }
                return value === undefined ? [] : [`${name}: ${value}`];
            }),
            `host: ${target.host}`,
            '',
            '',
        ].join('\r\n');
        targetSocket.write(headers);
        if (head.length > 0) {
            targetSocket.write(head);
        }
        targetSocket.pipe(socket);
        socket.pipe(targetSocket);
    });
    targetSocket.once('error', closeWithBadGateway);
    socket.once('error', () => targetSocket.destroy());
    socket.once('close', () => targetSocket.destroy());
}
