/**
 * Vite dev server integration for middleware mode.
 *
 * In development, Vite runs as middleware inside the existing Node HTTP server,
 * providing HMR for frontend code while sharing the same port as the API server.
 * In production this module is never imported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canvasHotUpdateFilterPlugin } from './canvasHotUpdateFilter.ts';
function importRuntimePackage(packageName) {
    return import(packageName);
}
const DEV_ENTRY_ASSET_SOURCE_MAP = new Map([
    ['/assets/dev-template-bootstrap.js', '/src/dev-template/index.tsx'],
    ['/assets/spec-template-styles.js', '/src/spec-template/styles.ts'],
    ['/assets/spec-template-bootstrap.js', '/src/spec-template/index.tsx'],
    ['/assets/canvas-template-bootstrap.js', '/src/canvas-template/index.tsx'],
    ['/assets/html-template-bootstrap.js', '/src/html-template/index.tsx'],
    ['/assets/runtime-export-core.js', '/src/runtime-export-core.ts'],
    ['/assets/axure-export-runtime.js', '/src/axure-export-runtime.ts'],
]);
const EMBEDDED_VITE_CACHE_DIR_PREFIX = 'axhub-make-dev-';
const EMBEDDED_VITE_WATCH_IGNORED = [
    '**/.axhub/**',
    '**/.spec/**',
    '**/automation-reports/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/src/server/**',
    '**/client/**',
    '**/midscene/**',
    '**/vendor/**',
    '**/*.excalidraw',
    '**/*.assets/**',
];
function resolveEmbeddedCommentaryRuntimeAlias(makeServerRoot) {
    const runtimeEntry = path.resolve(makeServerRoot, 'vendor/axhub-commentary/dist/index.mjs');
    return fs.existsSync(runtimeEntry) ? runtimeEntry : null;
}
function normalizeHeaderName(name) {
    return String(name).toLowerCase();
}
function isOutdatedOptimizedDepResponse(result) {
    return result.kind === 'response'
        && result.statusCode === 504
        && result.statusMessage === 'Outdated Optimize Dep';
}
function isEmbeddedOptimizedDepRequest(requestUrl, cacheDir) {
    const pathname = requestUrl.split('?')[0] || '';
    let decodedPathname = pathname;
    try {
        decodedPathname = decodeURIComponent(pathname);
    }
    catch {
        // Keep raw pathname when decoding fails.
    }
    const normalizedPathname = decodedPathname.replace(/\\/gu, '/');
    const cacheDirName = path.basename(cacheDir);
    if (normalizedPathname.includes(`/node_modules/.vite/${cacheDirName}/deps/`)) {
        return true;
    }
    const normalizedCacheDir = path.resolve(cacheDir).replace(/\\/gu, '/');
    return normalizedPathname.startsWith(`/@fs/${normalizedCacheDir}/deps/`);
}
function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return String(error?.code || '') === 'EPERM';
    }
}
function extractEmbeddedViteCachePid(name) {
    const match = name.match(/^axhub-make-dev-(\d+)-/u);
    if (!match?.[1]) {
        return null;
    }
    const pid = Number(match[1]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
}
function pruneStaleEmbeddedViteCacheDirs(viteCacheRoot) {
    if (!fs.existsSync(viteCacheRoot)) {
        return;
    }
    for (const entry of fs.readdirSync(viteCacheRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith(EMBEDDED_VITE_CACHE_DIR_PREFIX)) {
            continue;
        }
        const pid = extractEmbeddedViteCachePid(entry.name);
        if (pid && isProcessAlive(pid)) {
            continue;
        }
        fs.rmSync(path.join(viteCacheRoot, entry.name), { recursive: true, force: true });
    }
}
export function getEmbeddedViteWatchIgnored() {
    return [...EMBEDDED_VITE_WATCH_IGNORED];
}
function rewriteDevEntryAssetRequestUrl(requestUrl) {
    if (!requestUrl) {
        return requestUrl;
    }
    const suffixIndex = requestUrl.search(/[?#]/u);
    const pathname = suffixIndex >= 0 ? requestUrl.slice(0, suffixIndex) : requestUrl;
    let decodedPathname = pathname;
    try {
        decodedPathname = decodeURIComponent(pathname);
    }
    catch {
        // Keep raw pathname when decoding fails.
    }
    const sourcePath = DEV_ENTRY_ASSET_SOURCE_MAP.get(decodedPathname);
    return sourcePath || requestUrl;
}
function handleViteRequest(vite, req, res, next) {
    const originalUrl = req.url;
    const rewrittenUrl = rewriteDevEntryAssetRequestUrl(originalUrl);
    if (rewrittenUrl === originalUrl) {
        vite.middlewares(req, res, next);
        return;
    }
    let restored = false;
    const originalEnd = res.end.bind(res);
    const restoreUrl = () => {
        if (!restored) {
            req.url = originalUrl;
            restored = true;
        }
    };
    req.url = rewrittenUrl;
    res.end = function endAndRestoreUrl(chunk, encodingOrCallback, callback) {
        restoreUrl();
        return originalEnd(chunk, encodingOrCallback, callback);
    };
    try {
        vite.middlewares(req, res, () => {
            restoreUrl();
            next();
        });
    }
    catch (error) {
        restoreUrl();
        throw error;
    }
}
function flushCapturedResponse(res, result) {
    res.statusCode = result.statusCode;
    if (result.statusMessage) {
        res.statusMessage = result.statusMessage;
    }
    for (const [name, value] of result.headers) {
        res.setHeader(name, value);
    }
    res.end(result.chunks.length > 0 ? Buffer.concat(result.chunks) : undefined);
}
function captureViteResponse(vite, req, res, next) {
    const originalStatusCode = res.statusCode;
    const originalStatusMessage = res.statusMessage;
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalWriteHead = res.writeHead.bind(res);
    const originalSetHeader = res.setHeader.bind(res);
    const originalGetHeader = res.getHeader.bind(res);
    const originalHasHeader = res.hasHeader.bind(res);
    const originalRemoveHeader = res.removeHeader.bind(res);
    const headers = new Map();
    const chunks = [];
    let resolved = false;
    let capturedStatusCode = originalStatusCode;
    let capturedStatusMessage = originalStatusMessage || '';
    function restoreResponse() {
        res.write = originalWrite;
        res.end = originalEnd;
        res.writeHead = originalWriteHead;
        res.setHeader = originalSetHeader;
        res.getHeader = originalGetHeader;
        res.hasHeader = originalHasHeader;
        res.removeHeader = originalRemoveHeader;
        res.statusCode = originalStatusCode;
        res.statusMessage = originalStatusMessage;
    }
    return new Promise((resolve, reject) => {
        function setCapturedHeaderValue(name, value) {
            let capturedValue;
            if (typeof value === 'number' || typeof value === 'string') {
                capturedValue = value;
            }
            else {
                capturedValue = value.map((item) => String(item));
            }
            headers.set(normalizeHeaderName(name), {
                name,
                value: capturedValue,
            });
        }
        function finish(result) {
            if (resolved) {
                return;
            }
            resolved = true;
            restoreResponse();
            resolve(result);
        }
        res.setHeader = function setCapturedHeader(name, value) {
            setCapturedHeaderValue(String(name), value);
            return res;
        };
        res.getHeader = function getCapturedHeader(name) {
            return headers.get(normalizeHeaderName(name))?.value;
        };
        res.hasHeader = function hasCapturedHeader(name) {
            return headers.has(normalizeHeaderName(name));
        };
        res.removeHeader = function removeCapturedHeader(name) {
            headers.delete(normalizeHeaderName(name));
        };
        res.writeHead = function writeCapturedHead(statusCode, statusMessageOrHeaders, headersArg) {
            capturedStatusCode = statusCode;
            res.statusCode = statusCode;
            if (typeof statusMessageOrHeaders === 'string') {
                capturedStatusMessage = statusMessageOrHeaders;
                res.statusMessage = statusMessageOrHeaders;
            }
            const headerSource = typeof statusMessageOrHeaders === 'object'
                ? statusMessageOrHeaders
                : headersArg;
            if (headerSource) {
                for (const [name, value] of Object.entries(headerSource)) {
                    if (value !== undefined) {
                        setCapturedHeaderValue(name, value);
                    }
                }
            }
            return res;
        };
        res.write = function writeCapturedChunk(chunk, encodingOrCallback, callback) {
            if (chunk) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            done?.();
            return true;
        };
        res.end = function endCapturedResponse(chunk, encodingOrCallback, callback) {
            if (chunk) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            capturedStatusCode = res.statusCode;
            capturedStatusMessage = res.statusMessage || capturedStatusMessage;
            done?.();
            finish({
                kind: 'response',
                statusCode: capturedStatusCode,
                statusMessage: capturedStatusMessage,
                headers: Array.from(headers.values()).map(({ name, value }) => [name, value]),
                chunks,
            });
            return res;
        };
        try {
            vite.middlewares(req, res, () => {
                finish({ kind: 'next' });
                next?.();
            });
        }
        catch (error) {
            restoreResponse();
            reject(error);
        }
    });
}
/**
 * Create a Vite dev server in middleware mode and attach its HMR WebSocket
 * to the provided HTTP server so everything runs on a single port.
 */
export async function createViteDevMiddleware(httpServer, projectRoot) {
    // Dynamic import – vite is a devDependency, only loaded in dev mode.
    const { createServer } = await importRuntimePackage('vite');
    const makeServerRoot = path.resolve(projectRoot);
    const configFile = path.resolve(makeServerRoot, 'vite.config.ts');
    const viteCacheRoot = path.join(makeServerRoot, 'node_modules', '.vite');
    fs.mkdirSync(viteCacheRoot, { recursive: true });
    pruneStaleEmbeddedViteCacheDirs(viteCacheRoot);
    // Keep optimizer output private to this embedded server. A second Vite
    // instance re-optimizing the shared cache can otherwise delete deps still
    // referenced by this server's in-memory metadata.
    const cacheDir = fs.mkdtempSync(path.join(viteCacheRoot, `axhub-make-dev-${process.pid}-`));
    const commentaryRuntimeAlias = resolveEmbeddedCommentaryRuntimeAlias(makeServerRoot);
    async function createEmbeddedViteServer() {
        return createServer({
            configFile: fs.existsSync(configFile) ? configFile : undefined,
            root: makeServerRoot,
            cacheDir,
            plugins: [
                canvasHotUpdateFilterPlugin(),
            ],
            resolve: commentaryRuntimeAlias
                ? {
                    alias: [
                        {
                            find: /^@axhub\/commentary$/,
                            replacement: commentaryRuntimeAlias,
                        },
                    ],
                }
                : undefined,
            server: {
                middlewareMode: true,
                hmr: { server: httpServer },
                headers: {
                    'Cache-Control': 'no-store',
                },
                watch: {
                    // Don't watch build outputs, server code, node_modules, client runtime, or canvas data.
                    // Canvas files have their own bridge; letting Vite see them causes
                    // full-page HMR reloads instead of scene-only updates.
                    // Client runtime files have their own dev server; watching them here
                    // makes the admin shell reload while the client is already applying
                    // its local HMR update.
                    // Vendor files are synced by dev/start/build scripts. Watching that
                    // delete-and-copy output can flood HMR with reloads during startup.
                    ignored: getEmbeddedViteWatchIgnored(),
                },
            },
            appType: 'custom',
            // Disable the normal file-system watcher opening a browser tab.
            clearScreen: false,
        });
    }
    let vite = await createEmbeddedViteServer();
    let recreatePromise = null;
    async function recreateViteServer() {
        if (recreatePromise) {
            return recreatePromise;
        }
        recreatePromise = (async () => {
            const previousVite = vite;
            await previousVite.close();
            fs.rmSync(cacheDir, { recursive: true, force: true });
            fs.mkdirSync(cacheDir, { recursive: true });
            vite = await createEmbeddedViteServer();
        })().finally(() => {
            recreatePromise = null;
        });
        return recreatePromise;
    }
    return {
        async handle(req, res, next) {
            if (isEmbeddedOptimizedDepRequest(req.url || '/', cacheDir)) {
                const result = await captureViteResponse(vite, req, res, next);
                if (isOutdatedOptimizedDepResponse(result)) {
                    await recreateViteServer();
                    const retryResult = await captureViteResponse(vite, req, res, next);
                    if (retryResult.kind === 'response') {
                        flushCapturedResponse(res, retryResult);
                    }
                    return;
                }
                if (result.kind === 'response') {
                    flushCapturedResponse(res, result);
                }
                return;
            }
            handleViteRequest(vite, req, res, next ?? (() => {
                // Default next: send 404 if Vite didn't handle the request.
                res.statusCode = 404;
                res.end();
            }));
        },
        async transformHtml(url, htmlPath, extraHeadHtml) {
            let html = fs.readFileSync(htmlPath, 'utf-8');
            // Let Vite inject /@vite/client, React refresh preamble, etc.
            html = await vite.transformIndexHtml(url, html);
            // Rewrite relative paths to absolute paths based on the HTML file's
            // directory within the Vite root. When serving src/index/index.html
            // at URL /, the browser would resolve ./index.tsx to /index.tsx
            // instead of the correct /src/index/index.tsx.
            const htmlDir = path.posix.dirname(url);
            if (htmlDir !== '/' && htmlDir !== '.') {
                // Rewrite src="./..." in script tags
                html = html.replace(/(<script\b[^>]*\bsrc=")\.\/([^"]*")/gu, `$1${htmlDir}/$2`);
                // Rewrite href="../../..." and other relative paths in link tags
                html = html.replace(/(<link\b[^>]*\bhref=")(\.\.?\/[^"]*")/gu, (_match, prefix, relPath) => {
                    const resolved = path.posix.resolve(htmlDir, relPath.slice(0, -1));
                    return `${prefix}${resolved}"`;
                });
            }
            // Inject extra content (server-side runtime variables) before </head>.
            if (extraHeadHtml) {
                html = html.replace('</head>', `${extraHeadHtml}\n</head>`);
            }
            return html;
        },
        async close() {
            try {
                await vite.close();
            }
            finally {
                fs.rmSync(cacheDir, { recursive: true, force: true });
            }
        },
    };
}
