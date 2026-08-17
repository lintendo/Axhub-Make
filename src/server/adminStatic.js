import fs from 'node:fs';
import path from 'node:path';
import { createProjectMetadataStore, isPathInside } from './projectCore/index.ts';
import { getRequestUrl, sendFile, sendText } from './http.ts';
import { AXHUB_CANVAS_MCP_PATH } from './axhubCanvasMcp.ts';
import { AXHUB_PREVIEW_MCP_PATH } from './axhubPreviewMcp.ts';
import { PREVIEW_BRIDGE_WS_PATH } from './previewBridge.ts';
import { AXHUB_HUG_SCRIPT, AXHUB_HUG_SCRIPT_PATH, OPENCODE_BASE_PATH } from './opencodeHug.ts';
import { stripViteDevOnlyModuleImports } from './staticTemplateHtml.ts';
const ENABLE_OPENCODE_WEBUI_STATIC = false;
export function escapeScriptString(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
function escapeHtmlAttribute(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function getCanvasTitle(canvasName) {
    const lastSegment = canvasName.split('/').filter(Boolean).at(-1) || canvasName;
    const displayName = lastSegment.replace(/\.excalidraw$/iu, '').trim();
    return displayName ? `${displayName} - Canvas` : 'Canvas';
}
function readProjectServerShareHosts(projectRoot) {
    if (!projectRoot) {
        return { localHost: 'localhost', lanHost: '' };
    }
    try {
        const configPath = path.join(projectRoot, '.axhub', 'make', 'axhub.config.json');
        const config = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : {};
        const server = config?.server && typeof config.server === 'object' ? config.server : {};
        const localHost = typeof server.host === 'string' && server.host.trim()
            ? server.host.trim()
            : 'localhost';
        const lanHost = typeof server.lanHost === 'string' && server.lanHost.trim()
            ? server.lanHost.trim()
            : '';
        return { localHost, lanHost };
    }
    catch {
        return { localHost: 'localhost', lanHost: '' };
    }
}
export function buildInjectScript(options) {
    const shareHosts = readProjectServerShareHosts(options.activeProjectRoot || options.projectRoot);
    const lanHost = shareHosts.lanHost || options.lanHost || options.host;
    return `
  <script>
    window.__PROJECT_PREFIX__ = '';
    window.__IS_MIXED_PROJECT__ = false;
    window.__LOCAL_IP__ = '${escapeScriptString(lanHost)}';
    window.__LOCAL_PORT__ = ${options.port};
    window.__AXHUB_SHARE_HOSTS__ = {
      localHost: '${escapeScriptString(shareHosts.localHost)}',
      lanHost: '${escapeScriptString(lanHost)}'
    };
    window.__AXHUB_MAKE_API_ORIGIN__ = window.location.origin;
    window.__RUNTIME_ORIGIN__ = '${escapeScriptString(options.runtimeOrigin || '')}';
    window.__AXHUB_CANVAS_MCP_URL__ = '${AXHUB_CANVAS_MCP_PATH}';
    window.__AXHUB_CANVAS_MCP_TOKEN__ = '${escapeScriptString(options.axhubCanvasMcpToken || '')}';
    window.__AXHUB_PREVIEW_MCP_URL__ = '${AXHUB_PREVIEW_MCP_PATH}';
    window.__AXHUB_PREVIEW_MCP_TOKEN__ = '${escapeScriptString(options.axhubPreviewMcpToken || '')}';
    window.__AXHUB_PREVIEW_BRIDGE_WS_URL__ = '${PREVIEW_BRIDGE_WS_PATH}';
  </script>`;
}
function buildOpenCodeInjectScript(serverOrigin) {
    const encodeScriptValue = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
    return [
        '<script id="axhub-opencode-make-server-config">',
        `  window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = ${encodeScriptValue(serverOrigin)};`,
        `  window.__AXHUB_OPENCODE_BASE_PATH__ = ${encodeScriptValue(OPENCODE_BASE_PATH)};`,
        '</script>',
    ].join('\n');
}
function buildAxhubHugScriptTag() {
    return `<script id="axhub-hug-script" src="${AXHUB_HUG_SCRIPT_PATH}" defer></script>`;
}
function injectAxhubHugScript(html) {
    if (html.includes('id="axhub-hug-script"') || html.includes("id='axhub-hug-script'")) {
        return html;
    }
    const scriptTag = buildAxhubHugScriptTag();
    if (html.includes('</head>')) {
        return html.replace('</head>', `${scriptTag}\n</head>`);
    }
    return `${scriptTag}\n${html}`;
}
function sendAdminHtml(req, res, filePath, options) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }
    const requestUrl = getRequestUrl(req);
    const html = stripViteDevOnlyModuleImports(fs.readFileSync(filePath, 'utf8'))
        .replace(/\{\{TITLE\}\}/g, resolveAdminHtmlTitle(path.basename(filePath), requestUrl))
        .replace('</head>', `${buildInjectScript(options)}\n</head>`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
    return true;
}
function isAdminIndexPathname(pathname) {
    return pathname === '/' || pathname === '/index.html';
}
function decodeURIComponentSafe(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function isUntitledPrototypeName(value) {
    return /^untitled(?:-[a-z0-9-]+)?$/u.test(value.trim());
}
function getPrototypeName(prototype) {
    return String(prototype.name || prototype.id || '').trim();
}
function resolvePrototypeDirectory(projectRoot, prototype) {
    const explicitPath = String(prototype.absoluteFilePath || prototype.filePath || '').trim();
    if (explicitPath) {
        const resolvedPath = path.resolve(path.isAbsolute(explicitPath) ? explicitPath : path.join(projectRoot, explicitPath));
        if (isPathInside(projectRoot, resolvedPath)) {
            try {
                const stats = fs.statSync(resolvedPath);
                return stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath);
            }
            catch {
                return path.extname(resolvedPath) ? path.dirname(resolvedPath) : resolvedPath;
            }
        }
    }
    const prototypeName = getPrototypeName(prototype);
    if (!prototypeName) {
        return '';
    }
    const resolvedPath = path.resolve(projectRoot, 'src/prototypes', prototypeName);
    return isPathInside(projectRoot, resolvedPath) ? resolvedPath : '';
}
function readPrototypeDirectoryMtime(projectRoot, prototype) {
    const prototypeDir = resolvePrototypeDirectory(projectRoot, prototype);
    if (!prototypeDir) {
        return Number.NEGATIVE_INFINITY;
    }
    try {
        const stats = fs.statSync(prototypeDir);
        return stats.isDirectory() ? stats.mtimeMs : Number.NEGATIVE_INFINITY;
    }
    catch {
        return Number.NEGATIVE_INFINITY;
    }
}
function readPrototypeUpdatedAt(prototype) {
    const timestamp = Date.parse(String(prototype.updatedAt || '').trim());
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
function prototypeMatchesName(prototype, name) {
    const normalizedName = name.trim();
    return Boolean(normalizedName) && (String(prototype.id || '').trim() === normalizedName
        || String(prototype.name || '').trim() === normalizedName);
}
function hasPrototypeResource(projectRoot, prototypes, name) {
    const normalizedName = name.trim();
    if (!normalizedName) {
        return false;
    }
    if (prototypes.some((prototype) => prototypeMatchesName(prototype, normalizedName))) {
        return true;
    }
    const prototypeDir = path.resolve(projectRoot, 'src/prototypes', normalizedName);
    if (!isPathInside(projectRoot, prototypeDir)) {
        return false;
    }
    try {
        return fs.statSync(prototypeDir).isDirectory();
    }
    catch {
        return false;
    }
}
function resolveLatestPrototypeName(projectRoot, prototypes) {
    let best = null;
    prototypes.forEach((prototype, index) => {
        const name = getPrototypeName(prototype);
        if (!name) {
            return;
        }
        const candidate = {
            index,
            name,
            updatedAt: readPrototypeUpdatedAt(prototype),
            directoryMtime: readPrototypeDirectoryMtime(projectRoot, prototype),
        };
        if (!best
            || candidate.updatedAt > best.updatedAt
            || (candidate.updatedAt === best.updatedAt && candidate.directoryMtime > best.directoryMtime)
            || (candidate.updatedAt === best.updatedAt
                && candidate.directoryMtime === best.directoryMtime
                && candidate.index > best.index)) {
            best = candidate;
        }
    });
    return best?.name || '';
}
function sendPrototypeShortLinkRedirect(res, url, latestPrototypeName, fromPrototypeName) {
    url.searchParams.set('p', latestPrototypeName);
    url.searchParams.set('fromP', fromPrototypeName);
    res.statusCode = 302;
    res.setHeader('Location', `${url.pathname}${url.search}`);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
}
export function redirectMissingPlaceholderPrototypeShortLink(req, res, options) {
    const url = getRequestUrl(req);
    const pathname = decodeURIComponentSafe(url.pathname);
    if (!isAdminIndexPathname(pathname)) {
        return false;
    }
    const requestedPrototypeName = String(url.searchParams.get('p') || '').trim();
    if (!requestedPrototypeName || !isUntitledPrototypeName(requestedPrototypeName)) {
        return false;
    }
    const projectRoot = path.resolve(options.activeProjectRoot || options.projectRoot || '');
    if (!projectRoot) {
        return false;
    }
    let prototypes;
    try {
        prototypes = createProjectMetadataStore(projectRoot).getMetadata().resources.prototypes;
    }
    catch {
        return false;
    }
    if (!prototypes.length || hasPrototypeResource(projectRoot, prototypes, requestedPrototypeName)) {
        return false;
    }
    const latestPrototypeName = resolveLatestPrototypeName(projectRoot, prototypes);
    if (!latestPrototypeName || latestPrototypeName === requestedPrototypeName) {
        return false;
    }
    sendPrototypeShortLinkRedirect(res, url, latestPrototypeName, requestedPrototypeName);
    return true;
}
function getMarkdownPreviewTitleFromUrl(url) {
    const displayName = String(url.searchParams.get('axhubDisplayName') || '').trim();
    if (displayName) {
        return displayName;
    }
    const sourceUrl = String(url.searchParams.get('url') || '').trim();
    if (!sourceUrl) {
        return 'Spec';
    }
    try {
        const parsedSourceUrl = new URL(sourceUrl, url.origin);
        const pathParam = parsedSourceUrl.searchParams.get('path');
        const titlePath = pathParam || parsedSourceUrl.pathname;
        const lastSegment = decodeURIComponentSafe(titlePath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || '');
        return lastSegment.replace(/\.md$/iu, '').trim() || 'Spec';
    }
    catch {
        const lastSegment = decodeURIComponentSafe(sourceUrl.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || '');
        return lastSegment.replace(/\.md(?:\?.*)?$/iu, '').trim() || 'Spec';
    }
}
export function resolveAdminHtmlTitle(fileName, url) {
    if (fileName === 'spec-template.html') {
        return getMarkdownPreviewTitleFromUrl(url);
    }
    return 'Axhub Make';
}
function sendCanvasTemplateHtml(res, adminRoot, canvasName) {
    const templatePath = path.join(adminRoot, 'canvas-template.html');
    if (!fs.existsSync(templatePath) || !fs.statSync(templatePath).isFile()) {
        return false;
    }
    const html = stripViteDevOnlyModuleImports(fs.readFileSync(templatePath, 'utf8'))
        .replace(/{{CANVAS_NAME}}/g, escapeHtmlAttribute(canvasName))
        .replace(/{{CANVAS_TITLE}}/g, escapeHtmlAttribute(getCanvasTitle(canvasName)));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
    return true;
}
function sendOpenCodeHtml(res, filePath, serverOrigin) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }
    let html = fs.readFileSync(filePath, 'utf8');
    const runtimeConfigPattern = /<script\b[^>]*id=["']axhub-opencode-runtime-config["'][^>]*>[\s\S]*?<\/script>/u;
    const injectScript = buildOpenCodeInjectScript(serverOrigin);
    if (runtimeConfigPattern.test(html)) {
        html = html.replace(runtimeConfigPattern, injectScript);
    }
    else if (html.includes('</head>')) {
        html = html.replace('</head>', `${injectScript}\n</head>`);
    }
    else {
        html = `${injectScript}\n${html}`;
    }
    html = injectAxhubHugScript(html);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
    return true;
}
function resolveOpenCodeRequestPath(pathname) {
    const relativePath = pathname.replace(/^\/opencode\/?/u, '');
    return relativePath || 'index.html';
}
function resolveOpenCodeStaticRequestPath(pathname) {
    const relativePath = resolveOpenCodeRequestPath(pathname);
    if (isOpenCodeStaticRequestPath(relativePath)) {
        return relativePath;
    }
    const deepRouteStaticMatch = relativePath.match(/(?:^|\/)((?:assets\/.+|favicon[^/]*|apple-touch-icon[^/]*|site\.webmanifest|social-share[^/]*|web-app-manifest-[^/]+|oc-theme-preload\.js))$/u);
    return deepRouteStaticMatch?.[1] || relativePath;
}
function isOpenCodeReferer(req) {
    const rawReferer = req.headers.referer || req.headers.referrer;
    const referer = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;
    if (!referer) {
        return false;
    }
    try {
        return new URL(referer, 'http://localhost').pathname.startsWith('/opencode');
    }
    catch {
        return false;
    }
}
function resolveOpenCodeRootStaticRequestPath(pathname) {
    const match = pathname.match(/^\/(assets\/.+|favicon[^/]*|apple-touch-icon[^/]*|site\.webmanifest|social-share[^/]*|web-app-manifest-[^/]+|oc-theme-preload\.js)$/u);
    return match?.[1] || '';
}
function isOpenCodeStaticRequestPath(requestPath) {
    return /^(assets\/.+|favicon[^/]*|apple-touch-icon[^/]*|site\.webmanifest|social-share[^/]*|web-app-manifest-[^/]+|oc-theme-preload\.js)$/u.test(requestPath);
}
function resolveOpenCodeRoot(options) {
    const configuredRoot = options.opencodeWebUiRoot ? path.resolve(options.opencodeWebUiRoot) : '';
    if (configuredRoot && fs.existsSync(path.join(configuredRoot, 'index.html'))) {
        return configuredRoot;
    }
    const adjacentRoot = path.resolve(options.adminRoot, '../opencode-webui');
    const nestedRoot = path.resolve(options.adminRoot, 'opencode-webui');
    return fs.existsSync(path.join(adjacentRoot, 'index.html')) ? adjacentRoot : nestedRoot;
}
function sendOpenCodeStaticFile(res, opencodeRoot, requestPath) {
    const filePath = path.resolve(opencodeRoot, requestPath);
    if (!isPathInside(opencodeRoot, filePath)) {
        return false;
    }
    return sendFile(res, filePath);
}
function getAdminAssetCacheControl(url, pathname) {
    if (pathname === '/auto-debug-client.js') {
        return 'no-store';
    }
    return url.searchParams.has('v')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
}
function sendAxhubHugScript(res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(AXHUB_HUG_SCRIPT);
    return true;
}
function handleOpenCodeStatic(req, res, options) {
    if (!ENABLE_OPENCODE_WEBUI_STATIC) {
        return false;
    }
    const url = getRequestUrl(req);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname !== '/opencode' && pathname !== '/opencode/' && !pathname.startsWith('/opencode/')) {
        return false;
    }
    const opencodeRoot = resolveOpenCodeRoot(options);
    const indexPath = path.join(opencodeRoot, 'index.html');
    if (pathname === AXHUB_HUG_SCRIPT_PATH) {
        return sendAxhubHugScript(res);
    }
    if (pathname === '/opencode' || pathname === '/opencode/' || pathname === '/opencode/index.html') {
        return sendOpenCodeHtml(res, indexPath, options.opencodeServerOrigin || '');
    }
    const requestPath = resolveOpenCodeStaticRequestPath(pathname);
    if (sendOpenCodeStaticFile(res, opencodeRoot, requestPath)) {
        return true;
    }
    if (isOpenCodeStaticRequestPath(requestPath)) {
        sendText(res, 'OpenCode asset not found', 'text/plain; charset=utf-8', 404);
        return true;
    }
    return sendOpenCodeHtml(res, indexPath, options.opencodeServerOrigin || '');
}
function handleOpenCodeRootStatic(req, res, pathname, options) {
    if (!ENABLE_OPENCODE_WEBUI_STATIC) {
        return false;
    }
    if (!isOpenCodeReferer(req)) {
        return false;
    }
    const requestPath = resolveOpenCodeRootStaticRequestPath(pathname);
    if (!requestPath) {
        return false;
    }
    const opencodeRoot = resolveOpenCodeRoot(options);
    if (sendOpenCodeStaticFile(res, opencodeRoot, requestPath)) {
        return true;
    }
    sendText(res, 'OpenCode asset not found', 'text/plain; charset=utf-8', 404);
    return true;
}
export function handleAdminStatic(req, res, options) {
    const url = getRequestUrl(req);
    const pathname = decodeURIComponent(url.pathname);
    const adminRoot = path.resolve(options.adminRoot);
    if (handleOpenCodeStatic(req, res, options)) {
        return true;
    }
    if (handleOpenCodeRootStatic(req, res, pathname, options)) {
        return true;
    }
    if (redirectMissingPlaceholderPrototypeShortLink(req, res, options)) {
        return true;
    }
    if (isAdminIndexPathname(pathname)) {
        return sendAdminHtml(req, res, path.join(adminRoot, 'index.html'), options);
    }
    if (pathname.startsWith('/admin/') && pathname.endsWith('.html')) {
        const htmlPath = path.resolve(adminRoot, pathname.replace(/^\/admin\//u, ''));
        if (!isPathInside(adminRoot, htmlPath)) {
            return false;
        }
        return sendAdminHtml(req, res, htmlPath, options);
    }
    if (pathname.match(/^\/[^/]+\.html$/u)) {
        const htmlPath = path.resolve(adminRoot, pathname.slice(1));
        if (!isPathInside(adminRoot, htmlPath)) {
            return false;
        }
        return sendAdminHtml(req, res, htmlPath, options);
    }
    const canvasMatch = pathname.match(/^\/canvas\/(resources\/.+?\.excalidraw)\/?$/u);
    if (canvasMatch?.[1]) {
        return sendCanvasTemplateHtml(res, adminRoot, canvasMatch[1]);
    }
    if (pathname.startsWith('/assets/') || pathname.startsWith('/images/') || pathname === '/auto-debug-client.js') {
        const filePath = path.resolve(adminRoot, pathname.slice(1));
        if (!isPathInside(adminRoot, filePath)) {
            return false;
        }
        return sendFile(res, filePath, {
            cacheControl: getAdminAssetCacheControl(url, pathname),
        });
    }
    return false;
}
