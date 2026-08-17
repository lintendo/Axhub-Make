import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePath } from 'vite';
function createRequest(url) {
    return {
        method: 'GET',
        url,
        headers: {},
        pipe: vi.fn(),
    };
}
function createResponse() {
    const chunks = [];
    const headers = new Map();
    const response = {
        statusCode: 200,
        statusMessage: '',
        headersSent: false,
        writableEnded: false,
        setHeader: vi.fn((name, value) => {
            headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
            return response;
        }),
        getHeader: vi.fn((name) => headers.get(name.toLowerCase())),
        hasHeader: vi.fn((name) => headers.has(name.toLowerCase())),
        removeHeader: vi.fn((name) => {
            headers.delete(name.toLowerCase());
        }),
        writeHead: vi.fn((statusCode, statusMessageOrHeaders) => {
            response.statusCode = statusCode;
            response.headersSent = true;
            if (typeof statusMessageOrHeaders === 'string') {
                response.statusMessage = statusMessageOrHeaders;
            }
            return response;
        }),
        write: vi.fn((chunk) => {
            if (chunk) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return true;
        }),
        end: vi.fn((chunk) => {
            if (chunk) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            response.writableEnded = true;
            return response;
        }),
    };
    return {
        response,
        body: () => Buffer.concat(chunks).toString('utf8'),
        header: (name) => headers.get(name.toLowerCase()) || '',
    };
}
afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('vite');
});
describe('make-server Vite dev middleware', () => {
    it('removes stale embedded Vite cache directories before starting a new session', async () => {
        const makeServerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-vite-dev-cache-'));
        const viteCacheRoot = path.join(makeServerRoot, 'node_modules', '.vite');
        const staleCacheDir = path.join(viteCacheRoot, 'axhub-make-dev-999999-stale');
        const livePidCacheDir = path.join(viteCacheRoot, `axhub-make-dev-${process.pid}-live`);
        fs.mkdirSync(staleCacheDir, { recursive: true });
        fs.mkdirSync(livePidCacheDir, { recursive: true });
        const close = vi.fn();
        const createServer = vi.fn(async (_config) => ({
            middlewares: vi.fn(),
            transformIndexHtml: vi.fn(async (_url, html) => html),
            close,
        }));
        vi.doMock('vite', () => ({ createServer, normalizePath }));
        try {
            const { createViteDevMiddleware } = await import('../viteDevServer.ts');
            const middleware = await createViteDevMiddleware(http.createServer(), makeServerRoot);
            const config = createServer.mock.calls[0]?.[0];
            expect(fs.existsSync(staleCacheDir)).toBe(false);
            expect(fs.existsSync(livePidCacheDir)).toBe(true);
            expect(config.cacheDir).toContain(`axhub-make-dev-${process.pid}-`);
            await middleware.close();
            expect(close).toHaveBeenCalledTimes(1);
        }
        finally {
            fs.rmSync(makeServerRoot, { recursive: true, force: true });
        }
    });
    it('disables persistent browser caching without changing the optimizer config per start', async () => {
        const createServer = vi.fn(async (_config) => ({
            middlewares: vi.fn(),
            transformIndexHtml: vi.fn(async (_url, html) => html),
            close: vi.fn(),
        }));
        vi.doMock('vite', () => ({ createServer, normalizePath }));
        const { createViteDevMiddleware } = await import('../viteDevServer.ts');
        const makeServerRoot = path.resolve(__dirname, '../..');
        const firstMiddleware = await createViteDevMiddleware(http.createServer(), makeServerRoot);
        const secondMiddleware = await createViteDevMiddleware(http.createServer(), makeServerRoot);
        try {
            const firstConfig = createServer.mock.calls[0]?.[0];
            const secondConfig = createServer.mock.calls[1]?.[0];
            const expectedCachePrefix = path.join(makeServerRoot, 'node_modules', '.vite', `axhub-make-dev-${process.pid}-`);
            expect(firstConfig.server?.headers?.['Cache-Control']).toBe('no-store');
            expect(secondConfig.server?.headers?.['Cache-Control']).toBe('no-store');
            expect(firstConfig.server?.watch?.ignored).toEqual(expect.arrayContaining([
                '**/.axhub/**',
                '**/.spec/**',
                '**/client/**',
                '**/dist/**',
                '**/src/server/**',
                '**/*.excalidraw',
                '**/*.assets/**',
            ]));
            expect(firstConfig.plugins?.some((plugin) => (plugin.name === 'axhub-canvas-hot-update-filter'
                && typeof plugin.handleHotUpdate === 'function'))).toBe(true);
            const hotUpdateFilter = firstConfig.plugins?.find((plugin) => (plugin.name === 'axhub-canvas-hot-update-filter'));
            await expect(Promise.resolve(hotUpdateFilter?.handleHotUpdate?.({
                file: path.join(makeServerRoot, 'client/src/prototypes/home/annotation-source.json'),
                modules: [{ id: 'annotation-source' }],
            }))).resolves.toEqual([]);
            expect(firstConfig.cacheDir?.startsWith(expectedCachePrefix)).toBe(true);
            expect(secondConfig.cacheDir?.startsWith(expectedCachePrefix)).toBe(true);
            expect(secondConfig.cacheDir).not.toBe(firstConfig.cacheDir);
            expect(firstConfig.plugins?.some((plugin) => plugin.name.startsWith('axhub-make-dev-session-'))).not.toBe(true);
            expect(secondConfig.plugins?.some((plugin) => plugin.name.startsWith('axhub-make-dev-session-'))).not.toBe(true);
        }
        finally {
            await firstMiddleware.close();
            await secondMiddleware.close();
        }
    });
    it('aliases the embedded commentary runtime to the vendored dist entry', async () => {
        const makeServerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-vite-dev-commentary-'));
        fs.mkdirSync(path.join(makeServerRoot, 'vendor/axhub-commentary/dist'), { recursive: true });
        fs.writeFileSync(path.join(makeServerRoot, 'vendor/axhub-commentary/dist/index.mjs'), 'export const commentaryRuntime = true;\n', 'utf8');
        const createServer = vi.fn(async (_config) => ({
            middlewares: vi.fn(),
            transformIndexHtml: vi.fn(async (_url, html) => html),
            close: vi.fn(),
        }));
        vi.doMock('vite', () => ({ createServer, normalizePath }));
        try {
            const { createViteDevMiddleware } = await import('../viteDevServer.ts');
            const middleware = await createViteDevMiddleware(http.createServer(), makeServerRoot);
            const config = createServer.mock.calls[0]?.[0];
            const commentaryAlias = config.resolve?.alias?.find((alias) => String(alias.find) === '/^@axhub\\/commentary$/');
            expect(commentaryAlias?.replacement).toBe(path.join(makeServerRoot, 'vendor/axhub-commentary/dist/index.mjs'));
            await middleware.close();
        }
        finally {
            fs.rmSync(makeServerRoot, { recursive: true, force: true });
        }
    });
    it('recreates Vite middleware once when an optimized dep request is stale', async () => {
        let createdServers = 0;
        const firstClose = vi.fn();
        const secondClose = vi.fn();
        const createServer = vi.fn(async (_config) => {
            createdServers += 1;
            const serverNumber = createdServers;
            return {
                middlewares: vi.fn((req, res) => {
                    if (serverNumber === 1) {
                        res.statusCode = 504;
                        res.statusMessage = 'Outdated Optimize Dep';
                        res.end();
                        return;
                    }
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/javascript');
                    res.end(`export const recovered = ${JSON.stringify(req.url)};`);
                }),
                transformIndexHtml: vi.fn(async (_url, html) => html),
                close: serverNumber === 1 ? firstClose : secondClose,
            };
        });
        vi.doMock('vite', () => ({ createServer, normalizePath }));
        const { createViteDevMiddleware } = await import('../viteDevServer.ts');
        const makeServerRoot = path.resolve(__dirname, '../..');
        const middleware = await createViteDevMiddleware(http.createServer(), makeServerRoot);
        const firstConfig = createServer.mock.calls[0]?.[0];
        const cacheDirName = path.basename(firstConfig.cacheDir || '');
        const { response, body } = createResponse();
        await middleware.handle(createRequest(`/node_modules/.vite/${cacheDirName}/deps/react.js?v=abc`), response);
        expect(createServer).toHaveBeenCalledTimes(2);
        expect(firstClose).toHaveBeenCalledTimes(1);
        expect(response.statusCode).toBe(200);
        expect(body()).toContain('recovered');
        await middleware.close();
        expect(secondClose).toHaveBeenCalledTimes(1);
    });
    it.each([
        ['/assets/dev-template-bootstrap.js', '/src/dev-template/index.tsx'],
        ['/assets/spec-template-styles.js', '/src/spec-template/styles.ts'],
        ['/assets/spec-template-bootstrap.js', '/src/spec-template/index.tsx'],
        ['/assets/canvas-template-bootstrap.js', '/src/canvas-template/index.tsx'],
        ['/assets/html-template-bootstrap.js', '/src/html-template/index.tsx'],
        ['/assets/runtime-export-core.js', '/src/runtime-export-core.ts'],
        ['/assets/runtime-export-core.js?v=0.3.0', '/src/runtime-export-core.ts'],
        ['/assets/axure-export-runtime.js', '/src/axure-export-runtime.ts'],
    ])('serves production entry asset %s from source in dev mode', async (assetUrl, sourceUrl) => {
        let handledUrl = '';
        const close = vi.fn();
        const createServer = vi.fn(async (_config) => ({
            middlewares: vi.fn((req, res) => {
                handledUrl = req.url;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/javascript');
                res.end(`export const runtimeEntry = ${JSON.stringify(req.url)};`);
            }),
            transformIndexHtml: vi.fn(async (_url, html) => html),
            close,
        }));
        vi.doMock('vite', () => ({ createServer, normalizePath }));
        const { createViteDevMiddleware } = await import('../viteDevServer.ts');
        const makeServerRoot = path.resolve(__dirname, '../..');
        const middleware = await createViteDevMiddleware(http.createServer(), makeServerRoot);
        const { response, body, header } = createResponse();
        await middleware.handle(createRequest(assetUrl), response);
        expect(handledUrl).toBe(sourceUrl);
        expect(response.statusCode).toBe(200);
        expect(header('content-type')).toContain('application/javascript');
        expect(body()).toContain(sourceUrl);
        await middleware.close();
        expect(close).toHaveBeenCalledTimes(1);
    });
});
