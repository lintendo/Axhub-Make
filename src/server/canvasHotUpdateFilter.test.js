import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canvasHotUpdateFilterPlugin, isCanvasHotUpdateFile, shouldDropCanvasFullReloadPayload, } from './canvasHotUpdateFilter';
async function runConfigureServer(plugin, server) {
    const hook = plugin.configureServer;
    if (typeof hook === 'function') {
        await hook(server);
    }
    else {
        await hook?.handler(server);
    }
}
describe('make-server canvas hot-update filter', () => {
    it('identifies canvas data files', () => {
        expect(isCanvasHotUpdateFile('/project/src/resources/flows/home.excalidraw')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/src/resources/flows/home.assets/screenshot.png')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/src/resources/.assets/flows/home.excalidraw/screenshot.png')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/src/prototypes/home/canvas.excalidraw')).toBe(false);
        expect(isCanvasHotUpdateFile('/project/src/prototypes/home/canvas-assets/screenshot.png')).toBe(false);
        expect(isCanvasHotUpdateFile('/project/src/prototypes/home/annotation-source.json')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/src/prototypes/home/annotation-source.json?import&t=123')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/src/prototypes/home/.spec/generation-artifacts.json')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/src/prototypes/home/.spec/generation-assets/images/image-1.png')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/apps/axhub-make/client/src/resources/flows/home.excalidraw')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/apps/axhub-make/client/src/resources/flows/home.assets/embed.png')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/apps/axhub-make/client/src/prototypes/home/.spec/generation-artifacts.json')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/.axhub/sessions/conversations.json')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/.axhub/make/artifacts/axure/home/manifest.json')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/.spec/generation-artifacts.json')).toBe(true);
        expect(isCanvasHotUpdateFile('/project/client/src/prototypes/home/index.tsx')).toBe(false);
        expect(isCanvasHotUpdateFile('/project/client/src/themes/brand/index.tsx')).toBe(false);
        expect(isCanvasHotUpdateFile('/project/src/index/index.tsx')).toBe(false);
    });
    it('filters canvas data changes from Vite hot-update handling', async () => {
        const plugin = canvasHotUpdateFilterPlugin();
        const handleHotUpdate = plugin.handleHotUpdate;
        expect(await handleHotUpdate({
            file: '/project/src/resources/flows/home.excalidraw',
            modules: [{ id: 'canvas' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/src/prototypes/home/annotation-source.json',
            modules: [{ id: 'annotation-source' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/src/resources/flows/home.assets/screenshot.png',
            modules: [{ id: 'screenshot' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/src/resources/.assets/flows/home.excalidraw/screenshot.png',
            modules: [{ id: 'central-screenshot' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/src/prototypes/home/.spec/generation-artifacts.json',
            modules: [{ id: 'history' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/apps/axhub-make/client/src/resources/flows/home.excalidraw',
            modules: [{ id: 'client-canvas' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/.axhub/sessions/conversations.json',
            modules: [{ id: 'assistant-conversations' }],
        })).toEqual([]);
        expect(await handleHotUpdate({
            file: '/project/client/src/prototypes/home/index.tsx',
            modules: [{ id: 'generated-prototype' }],
        })).toBeUndefined();
        expect(await handleHotUpdate({
            file: '/project/src/index/index.tsx',
            modules: [{ id: 'admin' }],
        })).toBeUndefined();
    });
    it('invalidates annotation source modules while suppressing browser reloads', async () => {
        const plugin = canvasHotUpdateFilterPlugin();
        const handleHotUpdate = plugin.handleHotUpdate;
        const annotationModule = { id: 'annotation-source' };
        const otherModule = { id: 'canvas' };
        const invalidateModule = vi.fn();
        expect(await handleHotUpdate({
            file: '/project/src/prototypes/home/annotation-source.json',
            modules: [annotationModule, otherModule],
            server: {
                moduleGraph: { invalidateModule },
            },
            timestamp: 123,
        })).toEqual([]);
        expect(invalidateModule).toHaveBeenCalledWith(annotationModule, undefined, 123, true);
        expect(invalidateModule).toHaveBeenCalledWith(otherModule, undefined, 123, true);
    });
    it('drops full reload payloads triggered by canvas data files', async () => {
        const hotSend = vi.fn();
        const server = {
            hot: { send: hotSend },
            ws: { send: vi.fn() },
        };
        const plugin = canvasHotUpdateFilterPlugin();
        await runConfigureServer(plugin, server);
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/src/resources/flows/home.excalidraw',
        });
        expect(hotSend).not.toHaveBeenCalled();
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/src/prototypes/home/annotation-source.json',
        });
        expect(hotSend).not.toHaveBeenCalled();
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/src/prototypes/home/.spec/generation-artifacts.json',
        });
        expect(hotSend).not.toHaveBeenCalled();
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/.axhub/sessions/conversations.json',
        });
        expect(hotSend).not.toHaveBeenCalled();
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/apps/axhub-make/client/src/resources/flows/home.excalidraw',
        });
        expect(hotSend).not.toHaveBeenCalled();
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/client/src/prototypes/home/index.tsx',
        });
        expect(hotSend).toHaveBeenCalledTimes(1);
        server.hot.send({
            type: 'full-reload',
            triggeredBy: '/project/src/index/index.tsx',
        });
        expect(hotSend).toHaveBeenCalledTimes(2);
    });
    it('drops Vite update payloads triggered only by annotation source modules', async () => {
        const hotSend = vi.fn();
        const server = {
            hot: { send: hotSend },
            ws: { send: vi.fn() },
        };
        const plugin = canvasHotUpdateFilterPlugin();
        await runConfigureServer(plugin, server);
        server.hot.send({
            type: 'update',
            updates: [{
                    type: 'js-update',
                    timestamp: 1,
                    path: '/src/prototypes/home/annotation-source.json?import&t=123',
                    acceptedPath: '/src/prototypes/home/annotation-source.json?import&t=123',
                }],
        });
        expect(hotSend).not.toHaveBeenCalled();
    });
    it('keeps ordinary Vite updates batched with annotation source modules', async () => {
        const hotSend = vi.fn();
        const server = {
            hot: { send: hotSend },
            ws: { send: vi.fn() },
        };
        const plugin = canvasHotUpdateFilterPlugin();
        await runConfigureServer(plugin, server);
        server.hot.send({
            type: 'update',
            updates: [
                {
                    type: 'js-update',
                    timestamp: 1,
                    path: '/src/prototypes/home/annotation-source.json?import&t=123',
                    acceptedPath: '/src/prototypes/home/annotation-source.json?import&t=123',
                },
                {
                    type: 'js-update',
                    timestamp: 1,
                    path: '/src/index/index.tsx',
                    acceptedPath: '/src/index/index.tsx',
                },
            ],
        });
        expect(hotSend).toHaveBeenCalledTimes(1);
        expect(hotSend.mock.calls[0]?.[0]).toEqual({
            type: 'update',
            updates: [{
                    type: 'js-update',
                    timestamp: 1,
                    path: '/src/index/index.tsx',
                    acceptedPath: '/src/index/index.tsx',
                }],
        });
    });
    it('does not drop non-reload payloads even when they mention canvas files', () => {
        expect(shouldDropCanvasFullReloadPayload({
            type: 'update',
            triggeredBy: '/project/src/resources/flows/home.excalidraw',
        })).toBe(false);
    });
    it('installs the filter in the standalone admin Vite config', () => {
        const viteConfigSource = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
        expect(viteConfigSource).toContain("import { canvasHotUpdateFilterPlugin } from './src/server/canvasHotUpdateFilter'");
        expect(viteConfigSource).toContain('canvasHotUpdateFilterPlugin()');
        expect(viteConfigSource).toContain("'**/automation-reports/**'");
        expect(viteConfigSource).not.toContain("'**/annotation-source.json'");
        expect(viteConfigSource).toContain("'**/client/**'");
        expect(viteConfigSource).toContain("'**/midscene/**'");
        expect(viteConfigSource).toContain("'**/.axhub/**'");
        expect(viteConfigSource).toContain("'**/.spec/**'");
        expect(viteConfigSource).toContain("'**/*.excalidraw'");
        expect(viteConfigSource).toContain("'**/*.assets/**'");
        expect(viteConfigSource).not.toContain("'**/canvas-assets/**'");
        expect(viteConfigSource).toContain("'**/dist/**'");
        expect(viteConfigSource).toContain("'**/src/server/**'");
    });
    it('keeps the standalone admin dev server on its configured port', () => {
        const viteConfigSource = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
        expect(viteConfigSource).toContain('strictPort: true');
        expect(viteConfigSource).not.toContain('strictPort: false');
    });
    it('releases the standalone admin dev port before Vite starts listening', () => {
        const viteConfigSource = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
        expect(viteConfigSource).toContain("import { releaseListeningProcessesOnPort } from './src/server/portOccupancy'");
        expect(viteConfigSource).toContain('portReleaseBeforeListenPlugin()');
        expect(viteConfigSource).toContain('!config.server.middlewareMode');
        expect(viteConfigSource).toContain('releaseListeningProcessesOnPort(config.server.port ?? DEFAULT_MAKE_SERVER_PORT)');
    });
    it('serves the admin entry when the standalone Vite dev root is opened', () => {
        const viteConfigSource = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
        expect(viteConfigSource).toContain('adminRootDevEntryRedirectPlugin()');
        expect(viteConfigSource).toContain("res.statusCode = 302");
        expect(viteConfigSource).toContain("res.setHeader('Location', `/src/index/index.html${query}`)");
    });
});
