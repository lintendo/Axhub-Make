import http from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeUnavailableHtml, getRuntimeProxyTargetPath, isRuntimeDocumentRequest, isRuntimeDevModuleRequest, isRuntimeHtmlProxyRequest, isRuntimeOnlyRoute, proxyToRuntime, } from '../runtimeProxy.ts';
const servers = [];
function listen(server) {
    servers.push(server);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Expected TCP server address'));
                return;
            }
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}
function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error)
                reject(error);
            else
                resolve();
        });
    });
}
afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
});
describe('runtime proxy route ownership', () => {
    it('keeps management API routes owned by make-server', () => {
        expect(isRuntimeOnlyRoute('/api/entries.json')).toBe(false);
        expect(isRuntimeOnlyRoute('/api/docs')).toBe(false);
        expect(isRuntimeOnlyRoute('/api/themes')).toBe(false);
        expect(isRuntimeOnlyRoute('/api/data/tables')).toBe(false);
        expect(isRuntimeOnlyRoute('/api/source?path=components/button')).toBe(false);
        expect(isRuntimeOnlyRoute('/api/config')).toBe(false);
    });
    it('proxies runtime-only routes to the runtime server', () => {
        expect(isRuntimeOnlyRoute('/ws')).toBe(true);
        expect(isRuntimeOnlyRoute('/ws?client=1')).toBe(true);
        expect(isRuntimeOnlyRoute('/@react-refresh?projectId=make-project')).toBe(true);
        expect(isRuntimeOnlyRoute('/@vite/client?projectId=make-project')).toBe(true);
        expect(isRuntimeOnlyRoute('/api/ws/clients')).toBe(true);
        expect(isRuntimeOnlyRoute('/api/text-replace/count')).toBe(true);
        expect(isRuntimeOnlyRoute('/api/hack-css/save')).toBe(true);
        expect(isRuntimeOnlyRoute('/@vite/client')).toBe(true);
        expect(isRuntimeOnlyRoute('/@react-refresh')).toBe(true);
        expect(isRuntimeOnlyRoute('/@fs/workspace/demo/project/src/App.tsx')).toBe(true);
        expect(isRuntimeOnlyRoute('/@id/react')).toBe(true);
        expect(isRuntimeOnlyRoute('/@vite/deps/react.js')).toBe(true);
        expect(isRuntimeOnlyRoute('/src/prototypes/ref-app-home/index.tsx')).toBe(true);
        expect(isRuntimeOnlyRoute('/node_modules/.vite/deps/react.js?v=123')).toBe(true);
        expect(isRuntimeOnlyRoute('/build/components/ref-button.js')).toBe(true);
        expect(isRuntimeOnlyRoute('/docs/project-overview')).toBe(true);
        expect(isRuntimeOnlyRoute('/docs/project-overview/spec.html')).toBe(true);
        expect(isRuntimeOnlyRoute('/canvas/prototypes/ref-app-home/canvas.excalidraw')).toBe(false);
        expect(isRuntimeOnlyRoute('/canvas/resources/flows/app.excalidraw')).toBe(false);
        expect(isRuntimeOnlyRoute('/prototypes/ref-app-home')).toBe(true);
        expect(isRuntimeOnlyRoute('/prototypes/ref-app-home/')).toBe(true);
        expect(isRuntimeOnlyRoute('/prototypes/ref-app-home?editor=1')).toBe(true);
        expect(isRuntimeOnlyRoute('/prototypes/ref-app-home/canvas-assets/screenshot.png?v=123')).toBe(false);
        expect(isRuntimeOnlyRoute('/assets/index.css')).toBe(true);
    });
    it('treats runtime HTML proxy modules as runtime-owned before admin Vite handles them', () => {
        expect(isRuntimeHtmlProxyRequest('/prototypes/%E6%9C%AA%E5%91%BD%E5%90%8D/index.html?html-proxy&index=0.js')).toBe(true);
        expect(isRuntimeHtmlProxyRequest('/@id/__x00__/prototypes/%E6%9C%AA%E5%91%BD%E5%90%8D/index.html?html-proxy&index=0.js')).toBe(true);
        expect(isRuntimeHtmlProxyRequest('/themes/brand/index.html?html-proxy&inline-css&index=1.css')).toBe(true);
        expect(isRuntimeHtmlProxyRequest('/src/index/index.html?html-proxy&index=0.js')).toBe(false);
        expect(isRuntimeHtmlProxyRequest('/@id/__x00__/src/index/index.html?html-proxy&index=0.js')).toBe(false);
        expect(isRuntimeHtmlProxyRequest('/prototypes/home/index.html')).toBe(false);
    });
    it('uses prototype referers to route dev module graph requests to the runtime server', () => {
        const headers = { referer: 'http://localhost:53817/prototypes/annotation-demo?agentToolbar=host' };
        expect(isRuntimeDevModuleRequest('/@fs/workspace/make14/node_modules/.vite/deps/@axhub_annotation.js?v=a8419558', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/@vite/client', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/common/useHashPage.ts', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/hooks/use-mobile.ts', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/lib/utils.ts', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/styles/globals.css', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/types/index.ts', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/app/dashboard/page.tsx', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/pages/home.tsx', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/public/card.glb?url', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/services/api.ts', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/prototypes/annotation-demo/assets/make-annotation.png?import', headers)).toBe(true);
        expect(isRuntimeDevModuleRequest('/assets/dev-template-bootstrap.js', headers)).toBe(false);
        expect(isRuntimeDevModuleRequest('/@fs/workspace/make14/node_modules/.vite/deps/@axhub_annotation.js?v=a8419558', {
            referer: 'http://localhost:53817/?projectId=make-project',
        })).toBe(false);
    });
    it('keeps nested template-style runtime source imports in the runtime module graph', () => {
        expect(isRuntimeDevModuleRequest('/lib/utils.ts', {
            referer: 'http://localhost:53817/hooks/use-mobile.ts?projectId=make-project',
        })).toBe(true);
        expect(isRuntimeDevModuleRequest('/components/ui/button.tsx', {
            referer: 'http://localhost:53817/lib/utils.ts?projectId=make-project',
        })).toBe(true);
        expect(isRuntimeDevModuleRequest('/public/card.glb?url', {
            referer: 'http://localhost:53817/app/lanyard/page.tsx?projectId=make-project',
        })).toBe(true);
        expect(isRuntimeDevModuleRequest('/lib/utils.ts', {
            referer: 'http://localhost:53817/@vite/client',
        })).toBe(false);
        expect(isRuntimeDevModuleRequest('/@fs/workspace/make14/node_modules/.vite/deps/react.js?v=a8419558', {
            referer: 'http://localhost:53817/lib/utils.ts?projectId=make-project',
        }, {
            runtimeProjectRoot: '/workspace/make14',
        })).toBe(true);
    });
    it('routes project-scoped runtime module graph files without hard-coding template directories', () => {
        expect(isRuntimeDevModuleRequest('/features/onboarding/wizard.tsx', {
            referer: 'http://localhost:53817/prototypes/annotation-demo?agentToolbar=host',
        })).toBe(true);
        expect(isRuntimeDevModuleRequest('/new-template-space/assets/model.glb?url', {
            referer: 'http://localhost:53817/features/onboarding/wizard.tsx?projectId=make-project',
        })).toBe(true);
        expect(isRuntimeDevModuleRequest('/api/source?path=features/onboarding/wizard.tsx', {
            referer: 'http://localhost:53817/features/onboarding/wizard.tsx?projectId=make-project',
        })).toBe(false);
        expect(isRuntimeDevModuleRequest('/features/onboarding/wizard', {
            referer: 'http://localhost:53817/prototypes/annotation-demo?agentToolbar=host',
        })).toBe(false);
    });
    it('routes historical project-scoped Vite client entry requests to runtime', () => {
        expect(isRuntimeDevModuleRequest('/@vite/client?projectId=make-project', {})).toBe(true);
    });
    it('keeps nested active-project @fs imports in the runtime module graph', () => {
        const options = { runtimeProjectRoot: '/workspace/make14' };
        expect(isRuntimeDevModuleRequest('/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs', { referer: 'http://localhost:53817/@vite/client' }, options)).toBe(true);
        expect(isRuntimeDevModuleRequest('/@fs/workspace/make14/node_modules/.vite/deps/chunk-KQSTW7SD.js?v=a8419558', { referer: 'http://localhost:53817/@fs/workspace/make14/node_modules/.vite/deps/react.js?v=a8419558' }, options)).toBe(true);
        expect(isRuntimeDevModuleRequest('/@fs/workspace/axhub-runtime/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs', { referer: 'http://localhost:53817/@vite/client' }, options)).toBe(false);
        expect(isRuntimeDevModuleRequest('/@fs/workspace/make14/node_modules/.vite/deps/chunk-KQSTW7SD.js?v=a8419558', { referer: 'http://localhost:53817/@vite/client' })).toBe(false);
    });
    it('routes non-admin Vite client env imports in the runtime graph to runtime', () => {
        const adminViteClientEnvPath = '/workspace/axhub-runtime/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs';
        expect(isRuntimeDevModuleRequest('/@fs/workspace/axhub-make/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs', { referer: 'http://localhost:53817/@vite/client' }, { runtimeProjectRoot: '/workspace/axhub-make/client', adminViteClientEnvPath })).toBe(true);
        expect(isRuntimeDevModuleRequest('/@fs/workspace/axhub-runtime/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs', { referer: 'http://localhost:53817/@vite/client' }, { runtimeProjectRoot: '/workspace/axhub-make/client', adminViteClientEnvPath })).toBe(false);
    });
    it('appends projectId to Vite client env imports in proxied runtime modules', async () => {
        const upstream = http.createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end([
                'import "/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs";',
                'import React from "/@fs/workspace/make14/node_modules/.vite/deps/react.js";',
                'const lazy = () => import("/@fs/workspace/make14/src/prototypes/home/Lazy.tsx");',
            ].join('\n'));
        });
        const runtimeOrigin = await listen(upstream);
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, runtimeOrigin));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/prototypes/home/index.tsx?projectId=make-project`, {
            headers: {
                referer: `${proxyOrigin}/@id/__x00__/prototypes/home/index.html?html-proxy&index=0.js`,
            },
        });
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(body).toContain('import "/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs?projectId=make-project";');
        expect(body).not.toContain('import "/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs";');
        expect(body).toContain('import React from "/@fs/workspace/make14/node_modules/.vite/deps/react.js?projectId=make-project";');
        expect(body).toContain('const lazy = () => import("/@fs/workspace/make14/src/prototypes/home/Lazy.tsx?projectId=make-project");');
    });
    it('keeps git-version preview context on proxied runtime module imports', async () => {
        const upstream = http.createServer((_req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end([
                'import Badge from "/src/shared/Badge.tsx";',
                'import "/@fs/workspace/make14/src/prototypes/home/style.css";',
            ].join('\n'));
        });
        const runtimeOrigin = await listen(upstream);
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, runtimeOrigin));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/@fs/workspace/make14/.git-versions/abc12345/src/prototypes/home/index.tsx?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome`, {
            headers: {
                referer: `${proxyOrigin}/prototypes/home?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome`,
            },
        });
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(body).toContain('import Badge from "/src/shared/Badge.tsx?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome";');
        expect(body).toContain('import "/@fs/workspace/make14/src/prototypes/home/style.css?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome";');
    });
    it('does not append project context to the Vite client entry import', async () => {
        const upstream = http.createServer((_req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end([
                'import { createHotContext } from "/@vite/client";',
                'import * as RefreshRuntime from "/@react-refresh";',
                'import "/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs";',
            ].join('\n'));
        });
        const runtimeOrigin = await listen(upstream);
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, runtimeOrigin));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/prototypes/home/index.tsx?projectId=make-project`, {
            headers: {
                referer: `${proxyOrigin}/@id/__x00__/prototypes/home/index.html?html-proxy&index=0.js`,
            },
        });
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(body).toContain('import { createHotContext } from "/@vite/client";');
        expect(body).not.toContain('/@vite/client?projectId=');
        expect(body).toContain('import * as RefreshRuntime from "/@react-refresh";');
        expect(body).toContain('import "/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs?projectId=make-project";');
    });
    it('uses projectId on Vite client env requests only for routing and strips it before proxying upstream', async () => {
        const upstream = http.createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ url: req.url }));
        });
        const runtimeOrigin = await listen(upstream);
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, runtimeOrigin));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs?projectId=make-project`, {
            headers: {
                referer: `${proxyOrigin}/@vite/client?projectId=make-project`,
            },
        });
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body).toEqual({
            url: '/@fs/workspace/make14/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/client/env.mjs',
        });
    });
    it('does not proxy legacy component preview paths as a fallback renderer', () => {
        expect(isRuntimeOnlyRoute('/components/ref-button/index.tsx')).toBe(false);
        expect(isRuntimeOnlyRoute('/components/ref-button/hack.css')).toBe(false);
        expect(isRuntimeOnlyRoute('/build/components/ref-button.css')).toBe(false);
        expect(isRuntimeOnlyRoute('/docs')).toBe(false);
        expect(isRuntimeOnlyRoute('/canvas')).toBe(false);
        expect(isRuntimeOnlyRoute('/favicon.ico')).toBe(false);
    });
    it('preserves query strings when building runtime proxy targets', () => {
        expect(getRuntimeProxyTargetPath('/build/components/ref-button.js?v=1')).toBe('/build/components/ref-button.js?v=1');
        expect(getRuntimeProxyTargetPath('/@vite/client?projectId=make-project')).toBe('/@vite/client');
        expect(getRuntimeProxyTargetPath('')).toBe('/');
    });
    it('identifies prototype and theme document requests without treating modules and assets as documents', () => {
        expect(isRuntimeDocumentRequest('/prototypes/home')).toBe(true);
        expect(isRuntimeDocumentRequest('/prototypes/home/')).toBe(true);
        expect(isRuntimeDocumentRequest('/prototypes/home?editor=1')).toBe(true);
        expect(isRuntimeDocumentRequest('/themes/brand')).toBe(true);
        expect(isRuntimeDocumentRequest('/themes/brand/')).toBe(true);
        expect(isRuntimeDocumentRequest('/prototypes/home/index.tsx')).toBe(false);
        expect(isRuntimeDocumentRequest('/prototypes/home/style.css')).toBe(false);
        expect(isRuntimeDocumentRequest('/prototypes/home/canvas-assets/screenshot.png')).toBe(false);
        expect(isRuntimeDocumentRequest('/prototypes/home/canvas.excalidraw')).toBe(false);
        expect(isRuntimeDocumentRequest('/@vite/client')).toBe(false);
    });
    it('builds an HTML runtime unavailable page for direct prototype and theme navigation', () => {
        const html = createRuntimeUnavailableHtml('/prototypes/home', 'connect ECONNREFUSED');
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('Make 客户端未启动');
        expect(html).toContain('/prototypes/home');
        expect(html).toContain('axhub:runtime-unavailable');
        expect(html).toContain('postMessage');
        expect(html).toContain('回到管理页');
        expect(html).not.toContain('Axhub Make client runtime unavailable');
        expect(html).not.toContain('connect ECONNREFUSED');
        expect(html).not.toContain('复制诊断给 AI');
    });
    it('proxies requests to the runtime origin while preserving method, path, query, body, and host', async () => {
        const upstream = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            req.on('end', () => {
                res.statusCode = 207;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('x-runtime-seen', 'yes');
                res.end(JSON.stringify({
                    method: req.method,
                    url: req.url,
                    host: req.headers.host,
                    forwardedHost: req.headers['x-forwarded-host'],
                    forwardedProto: req.headers['x-forwarded-proto'],
                    custom: req.headers['x-custom-header'],
                    body: Buffer.concat(chunks).toString('utf8'),
                }));
            });
        });
        const runtimeOrigin = await listen(upstream);
        const runtimeHost = new URL(runtimeOrigin).host;
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, runtimeOrigin));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/api/ws/echo?room=canvas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'x-custom-header': 'from-test',
            },
            body: 'hello runtime',
        });
        const body = await response.json();
        expect(response.status).toBe(207);
        expect(response.headers.get('x-runtime-seen')).toBe('yes');
        expect(body).toEqual({
            method: 'POST',
            url: '/api/ws/echo?room=canvas',
            host: runtimeHost,
            forwardedHost: new URL(proxyOrigin).host,
            forwardedProto: 'http',
            custom: 'from-test',
            body: 'hello runtime',
        });
    });
    it('returns a JSON 502 when the runtime transport cannot connect before headers are sent', async () => {
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, 'http://127.0.0.1:1'));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/@vite/client`);
        const body = await response.json();
        expect(response.status).toBe(502);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(body).toMatchObject({
            error: 'Runtime unavailable',
        });
    });
    it('returns an HTML 502 for direct prototype documents when the runtime transport cannot connect', async () => {
        const proxy = http.createServer((req, res) => proxyToRuntime(req, res, 'http://127.0.0.1:1'));
        const proxyOrigin = await listen(proxy);
        const response = await fetch(`${proxyOrigin}/prototypes/home`, {
            headers: { accept: 'text/html' },
        });
        const body = await response.text();
        expect(response.status).toBe(502);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(body).toContain('Make 客户端未启动');
        expect(body).toContain('/prototypes/home');
        expect(body).toContain('axhub:runtime-unavailable');
        expect(body).not.toContain('runtime origin is empty or unreachable');
    });
    it('destroys the response when the runtime transport errors after headers are sent', () => {
        const proxyRequest = new PassThrough();
        vi.spyOn(http, 'request').mockImplementation((() => proxyRequest));
        const req = new PassThrough();
        req.url = '/@vite/client';
        req.method = 'GET';
        req.headers = {};
        const res = {
            headersSent: true,
            destroy: vi.fn(),
            setHeader: vi.fn(),
            end: vi.fn(),
        };
        proxyToRuntime(req, res, 'http://127.0.0.1:1');
        const error = new Error('headers already sent');
        proxyRequest.emit('error', error);
        expect(res.destroy).toHaveBeenCalledWith(error);
        expect(res.end).not.toHaveBeenCalled();
    });
});
