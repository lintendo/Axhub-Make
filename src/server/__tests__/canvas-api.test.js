import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getCanvasBridgeHub } from '../canvasBridge.ts';
import { cleanupProjectApiTestRoots, createTempRoot, getTestProjectRegistryPath, startTestServer, writeProjectMetadata, } from './projects-api.helpers';
import { createProjectRegistry } from '../projectCore/project-registry.ts';
import { getProjectMetadataPath } from '../projectCore/index.ts';
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const GIF_DATA_URL = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`;
const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
const WEBP_DATA_URL = `data:image/webp;base64,${Buffer.from('RIFFxxxxWEBP').toString('base64')}`;
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>').toString('base64')}`;
const nativeFetch = globalThis.fetch.bind(globalThis);
const canvasProjectIdByOrigin = new Map();
async function fetch(input, init) {
    const url = new URL(String(input));
    const projectId = canvasProjectIdByOrigin.get(url.origin);
    if (projectId && url.pathname.startsWith('/api/canvas')) {
        url.searchParams.set('projectId', projectId);
    }
    return nativeFetch(url, init);
}
class FakeCanvasSocket extends EventEmitter {
    sentMessages = [];
    ended = false;
    write(chunk) {
        if (Buffer.isBuffer(chunk)) {
            for (const message of parseServerTextFrames(chunk)) {
                this.sentMessages.push(JSON.parse(message));
            }
        }
        return true;
    }
    end() {
        if (this.ended)
            return;
        this.ended = true;
        this.emit('close');
    }
}
function encodeClientTextFrame(message) {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const mask = Buffer.from([1, 2, 3, 4]);
    const header = payload.length < 126
        ? Buffer.from([0x81, 0x80 | payload.length])
        : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
    const masked = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
        masked[index] = payload[index] ^ mask[index % 4];
    }
    return Buffer.concat([header, mask, masked]);
}
function parseServerTextFrames(buffer) {
    const messages = [];
    let offset = 0;
    while (offset + 2 <= buffer.length) {
        const opcode = buffer[offset] & 0x0f;
        let payloadLength = buffer[offset + 1] & 0x7f;
        let headerLength = 2;
        if (payloadLength === 126) {
            payloadLength = buffer.readUInt16BE(offset + 2);
            headerLength = 4;
        }
        else if (payloadLength === 127) {
            payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
            headerLength = 10;
        }
        const frameEnd = offset + headerLength + payloadLength;
        if (frameEnd > buffer.length)
            break;
        if (opcode === 0x01) {
            messages.push(buffer.subarray(offset + headerLength, frameEnd).toString('utf8'));
        }
        offset = frameEnd;
    }
    return messages;
}
async function waitForSentMessage(socket, type) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const matchingMessages = socket.sentMessages.filter((item) => item.type === type);
        const message = matchingMessages[matchingMessages.length - 1];
        if (message) {
            return message;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Expected bridge message ${type}`);
}
async function waitForSentMessageAfter(socket, type, previousCount) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const messages = socket.sentMessages.filter((item) => item.type === type);
        if (messages.length > previousCount) {
            return messages[messages.length - 1];
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Expected bridge message ${type} after ${previousCount}`);
}
function writePrototypeDir(projectRoot, prototypeId) {
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', prototypeId);
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() {}', 'utf8');
    return prototypeDir;
}
function writeCanvasFile(filePath, data = {}) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: {},
        files: {},
        ...data,
    }, null, 2), 'utf8');
}
function createDefaultCanvasPayload(data = {}) {
    return {
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: {},
        files: {},
        ...data,
    };
}
function encodeResourceCanvasPath(resourcePath) {
    return resourcePath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
}
function writeScreenshotProjectMetadata(projectRoot) {
    writeProjectMetadata(projectRoot, {
        resourceWriteTargets: {
            prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
        },
    });
}
async function startActiveCanvasTestServer(projectRoot) {
    const registryHome = createTempRoot('axhub-make-canvas-api-home-');
    const registry = createProjectRegistry({ registryPath: getTestProjectRegistryPath(registryHome) });
    const projectId = path.basename(projectRoot);
    registry.addProject({
        id: projectId,
        name: projectId,
        root: projectRoot,
        metadataPath: getProjectMetadataPath(projectRoot),
    });
    registry.setActiveProject(projectId);
    const server = await startTestServer(projectRoot, registryHome);
    canvasProjectIdByOrigin.set(server.origin, projectId);
    return server;
}
describe('canvas API', () => {
    afterEach(() => {
        getCanvasBridgeHub().destroy();
        canvasProjectIdByOrigin.clear();
        cleanupProjectApiTestRoots();
    });
    it('reads and saves resource canvas files with sibling assets', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const resourcesDir = path.join(projectRoot, 'src', 'resources');
        const canvasPath = path.join(resourcesDir, 'flows', 'app.excalidraw');
        writeCanvasFile(canvasPath);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const readResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeURIComponent('flows/app.excalidraw')}`);
            expect(readResponse.status).toBe(200);
            await expect(readResponse.json()).resolves.toMatchObject({
                type: 'excalidraw',
                version: 2,
            });
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [
                    {
                        id: 'image-1',
                        type: 'image',
                        fileId: 'resource-image-file',
                    },
                ],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {
                    'resource-image-file': {
                        mimeType: 'image/png',
                        id: 'Resource Image File',
                        dataURL: PNG_DATA_URL,
                    },
                },
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeURIComponent('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: canvas }),
            });
            expect(putResponse.status).toBe(200);
            await expect(putResponse.json()).resolves.toMatchObject({
                success: true,
                changed: true,
                name: 'flows/app.excalidraw',
                path: 'src/resources/flows/app.excalidraw',
            });
            const rawSaved = fs.readFileSync(canvasPath, 'utf8');
            expect(rawSaved).not.toContain('data:image');
            const saved = JSON.parse(rawSaved);
            expect(saved.files['resource-image-file']).toMatchObject({
                mimeType: 'image/png',
                id: 'Resource Image File',
                path: '.assets/flows/app.excalidraw/images/resource-image-file.png',
            });
            const assetPath = path.join(resourcesDir, '.assets', 'flows', 'app.excalidraw', 'images', 'resource-image-file.png');
            expect(fs.existsSync(assetPath)).toBe(true);
            const hydrated = await fetch(`${server.origin}/api/canvas/resources/${encodeURIComponent('flows/app.excalidraw')}`)
                .then((response) => response.json());
            expect(hydrated.files['resource-image-file']).toMatchObject({
                path: '.assets/flows/app.excalidraw/images/resource-image-file.png',
                dataURL: PNG_DATA_URL,
            });
        }
        finally {
            await server.close();
        }
    });
    it('does not expose legacy prototype or standalone canvas file identity APIs', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        writePrototypeDir(projectRoot, 'home');
        writeCanvasFile(path.join(projectRoot, 'src', 'canvas', 'main.excalidraw'));
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const requests = [
                fetch(`${server.origin}/api/canvas/prototypes/home/ensure`, { method: 'POST' }),
                fetch(`${server.origin}/api/canvas/prototypes/home/canvas.excalidraw`),
                fetch(`${server.origin}/api/canvas/prototypes/home/canvas.excalidraw`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: createDefaultCanvasPayload() }),
                }),
                fetch(`${server.origin}/api/canvas`),
                fetch(`${server.origin}/api/canvas/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ displayName: 'Main Canvas' }),
                }),
                fetch(`${server.origin}/api/canvas/main.excalidraw`),
                fetch(`${server.origin}/api/canvas/main.excalidraw/copy`, { method: 'POST' }),
                fetch(`${server.origin}/api/canvas/main.excalidraw`, { method: 'DELETE' }),
            ];
            for (const response of await Promise.all(requests)) {
                expect(response.status).toBe(404);
                await expect(response.json()).resolves.toEqual({ error: 'Canvas not found' });
            }
            expect(fs.existsSync(path.join(projectRoot, 'src', 'prototypes', 'home', 'canvas.excalidraw'))).toBe(false);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'canvas', 'main.excalidraw'))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'canvas', 'main-canvas.excalidraw'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('does not expose removed canvas bridge HTTP commands', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const status = await fetch(`${server.origin}/api/canvas/bridge/status`)
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(status).toEqual({ status: 404, body: { error: 'Canvas not found' } });
            const refresh = await fetch(`${server.origin}/api/canvas/bridge/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canvas: 'missing' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(refresh).toEqual({
                status: 404,
                body: { error: 'Canvas not found' },
            });
            const screenshot = await fetch(`${server.origin}/api/canvas/bridge/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canvas: 'missing' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(screenshot).toEqual({
                status: 404,
                body: { error: 'Canvas not found' },
            });
        }
        finally {
            await server.close();
        }
    });
    it('keeps canvas websocket bridge scoped to hot reload without HTTP bridge commands', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        writePrototypeDir(projectRoot, 'home');
        writeCanvasFile(path.join(projectRoot, 'src', 'prototypes', 'home', 'canvas.excalidraw'), {
            elements: [
                { id: 'annotated', type: 'rectangle', customData: { annotation: 'Check spacing' } },
                { id: 'plain', type: 'rectangle' },
                { id: 'deleted', type: 'rectangle', isDeleted: true, customData: { annotation: 'ignore' } },
            ],
        });
        writeCanvasFile(path.join(projectRoot, 'src', 'canvas', 'legacy.excalidraw'), {
            elements: [
                { id: 'legacy-note', type: 'text', customData: { annotation: 'Legacy note' } },
            ],
        });
        const hub = getCanvasBridgeHub();
        hub.configureProjectRoot(projectRoot);
        const prototypeSocket = new FakeCanvasSocket();
        hub.handleUpgrade({
            headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
        }, prototypeSocket, Buffer.alloc(0));
        prototypeSocket.emit('data', encodeClientTextFrame({
            type: 'canvas.register',
            canvas: 'prototypes/home/canvas.excalidraw',
        }));
        const legacySocket = new FakeCanvasSocket();
        hub.handleUpgrade({
            headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
        }, legacySocket, Buffer.alloc(0));
        legacySocket.emit('data', encodeClientTextFrame({
            type: 'canvas.register',
            canvas: 'legacy.excalidraw',
        }));
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const status = await fetch(`${server.origin}/api/canvas/bridge/status`);
            expect(status.status).toBe(404);
            await expect(status.json()).resolves.toEqual({ error: 'Canvas not found' });
            const refresh = await fetch(`${server.origin}/api/canvas/bridge/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canvas: 'prototypes/home/canvas.excalidraw' }),
            });
            expect(refresh.status).toBe(404);
            await expect(refresh.json()).resolves.toEqual({ error: 'Canvas not found' });
            expect(prototypeSocket.sentMessages).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'canvas.reload' }),
            ]));
            expect(legacySocket.sentMessages).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'canvas.reload' }),
            ]));
            const screenshot = await fetch(`${server.origin}/api/canvas/bridge/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canvas: 'prototypes/home/canvas.excalidraw' }),
            });
            expect(screenshot.status).toBe(404);
            await expect(screenshot.json()).resolves.toEqual({ error: 'Canvas not found' });
            expect(prototypeSocket.sentMessages).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'canvas.screenshot.request' }),
            ]));
            const badRefresh = await fetch(`${server.origin}/api/canvas/bridge/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{',
            });
            expect(badRefresh.status).toBe(404);
        }
        finally {
            await server.close();
        }
    });
    it('does not rewrite an unchanged resource canvas file', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw');
            writeCanvasFile(canvasPath);
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [{ id: 'embed-1', type: 'embeddable', link: 'http://localhost:51720/prototypes/home' }],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {},
            };
            fs.mkdirSync(path.dirname(canvasPath), { recursive: true });
            fs.writeFileSync(canvasPath, JSON.stringify(canvas, null, 2), 'utf8');
            const beforeMtime = fs.statSync(canvasPath).mtimeMs;
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(200);
            expect(fs.statSync(canvasPath).mtimeMs).toBe(beforeMtime);
            expect(await putResponse.json()).toMatchObject({
                success: true,
                changed: false,
                name: 'flows/app.excalidraw',
            });
        }
        finally {
            await server.close();
        }
    });
    it('strips embedded screenshot data URLs when a persisted screenshot URL is available', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw');
            writeCanvasFile(canvasPath);
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [
                    {
                        id: 'embed-1',
                        type: 'embeddable',
                        customData: {
                            screenshotUrl: '/prototypes/home/embed-embed-1.png?v=123',
                            screenshotDataUrl: PNG_DATA_URL,
                            screenshotWidth: 320,
                            screenshotHeight: 180,
                        },
                    },
                ],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {},
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(200);
            const saved = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
            expect(saved.elements[0].customData).toMatchObject({
                screenshotUrl: '/prototypes/home/embed-embed-1.png?v=123',
                screenshotWidth: 320,
                screenshotHeight: 180,
            });
            expect(saved.elements[0].customData).not.toHaveProperty('screenshotDataUrl');
        }
        finally {
            await server.close();
        }
    });
    it('stores Excalidraw image file data as local canvas asset paths instead of inline data URLs', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw');
            writeCanvasFile(canvasPath);
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [
                    {
                        id: 'image-1',
                        type: 'image',
                        fileId: 'image-file-1',
                    },
                ],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {
                    'image-file-1': {
                        mimeType: 'image/png',
                        id: 'image-file-1',
                        dataURL: PNG_DATA_URL,
                        created: 1778751138363,
                        lastRetrieved: 1778751138363,
                    },
                },
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(200);
            const rawSaved = fs.readFileSync(canvasPath, 'utf8');
            expect(rawSaved).not.toContain('data:image');
            expect(rawSaved).not.toContain('base64');
            const saved = JSON.parse(rawSaved);
            expect(saved.files['image-file-1']).toMatchObject({
                mimeType: 'image/png',
                id: 'image-file-1',
                path: '.assets/flows/app.excalidraw/images/image-file-1.png',
                created: 1778751138363,
                lastRetrieved: 1778751138363,
            });
            expect(saved.files['image-file-1']).not.toHaveProperty('dataURL');
            const assetPath = path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'images', 'image-file-1.png');
            expect(fs.existsSync(assetPath)).toBe(true);
            expect(fs.readFileSync(assetPath).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            const getResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`);
            expect(getResponse.status).toBe(200);
            const hydrated = await getResponse.json();
            expect(hydrated.files['image-file-1']).toMatchObject({
                mimeType: 'image/png',
                id: 'image-file-1',
                path: '.assets/flows/app.excalidraw/images/image-file-1.png',
                dataURL: PNG_DATA_URL,
            });
        }
        finally {
            await server.close();
        }
    });
    it('stores supported non-PNG Excalidraw image files as local canvas asset paths', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw');
            writeCanvasFile(canvasPath);
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {
                    jpeg: { mimeType: 'image/jpeg', id: 'Hero Photo', dataURL: JPEG_DATA_URL },
                    gif: { mimeType: 'image/gif', id: 'Loop Clip', dataURL: GIF_DATA_URL },
                    webp: { mimeType: 'image/webp', id: 'Web Preview', dataURL: WEBP_DATA_URL },
                },
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(200);
            const saved = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
            expect(saved.files.jpeg).toMatchObject({
                mimeType: 'image/jpeg',
                id: 'Hero Photo',
                path: '.assets/flows/app.excalidraw/images/hero-photo.jpg',
            });
            expect(saved.files.gif).toMatchObject({
                mimeType: 'image/gif',
                id: 'Loop Clip',
                path: '.assets/flows/app.excalidraw/images/loop-clip.gif',
            });
            expect(saved.files.webp).toMatchObject({
                mimeType: 'image/webp',
                id: 'Web Preview',
                path: '.assets/flows/app.excalidraw/images/web-preview.webp',
            });
            expect(fs.existsSync(path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'images', 'hero-photo.jpg'))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'images', 'loop-clip.gif'))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'images', 'web-preview.webp'))).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('saves generated image results while preserving SVG generator placeholders inline', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw');
            writeCanvasFile(canvasPath);
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [
                    {
                        id: 'generated-image',
                        type: 'image',
                        fileId: 'generated-image-file',
                        customData: { type: 'axhub-ai-image' },
                    },
                    {
                        id: 'ai-placeholder',
                        type: 'image',
                        fileId: 'axhub-ai-image-placeholder-v2',
                        isDeleted: true,
                        customData: { type: 'axhub-ai-image-generator' },
                    },
                ],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {
                    'generated-image-file': {
                        mimeType: 'image/png',
                        id: 'generated-image-file',
                        dataURL: PNG_DATA_URL,
                        created: 1778751138363,
                        lastRetrieved: 1778751138363,
                    },
                    'axhub-ai-image-placeholder-v2': {
                        mimeType: 'image/svg+xml',
                        id: 'axhub-ai-image-placeholder-v2',
                        dataURL: SVG_DATA_URL,
                        created: 1778751138363,
                        lastRetrieved: 1778751138363,
                    },
                },
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(200);
            const saved = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
            expect(saved.files['generated-image-file']).toMatchObject({
                mimeType: 'image/png',
                id: 'generated-image-file',
                path: '.assets/flows/app.excalidraw/images/generated-image-file.png',
            });
            expect(saved.files['generated-image-file']).not.toHaveProperty('dataURL');
            expect(saved.files['axhub-ai-image-placeholder-v2']).toMatchObject({
                mimeType: 'image/svg+xml',
                id: 'axhub-ai-image-placeholder-v2',
                dataURL: SVG_DATA_URL,
            });
            expect(fs.existsSync(path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'images', 'generated-image-file.png'))).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('stores nested resource Excalidraw image file data as local canvas asset paths instead of inline data URLs', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const canvasPath = path.join(projectRoot, 'src', 'resources', 'boards', 'legacy.excalidraw');
        fs.mkdirSync(path.dirname(canvasPath), { recursive: true });
        fs.writeFileSync(canvasPath, JSON.stringify({
            type: 'excalidraw',
            version: 2,
            elements: [],
            appState: {},
            files: {},
        }), 'utf8');
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [
                    {
                        id: 'image-1',
                        type: 'image',
                        fileId: 'legacy-image-file',
                    },
                ],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {
                    'legacy-image-file': {
                        mimeType: 'image/png',
                        id: 'legacy-image-file',
                        dataURL: PNG_DATA_URL,
                        created: 1778751138363,
                        lastRetrieved: 1778751138363,
                    },
                },
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('boards/legacy.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(200);
            const rawSaved = fs.readFileSync(canvasPath, 'utf8');
            expect(rawSaved).not.toContain('data:image');
            expect(rawSaved).not.toContain('base64');
            const saved = JSON.parse(rawSaved);
            expect(saved.files['legacy-image-file']).toMatchObject({
                mimeType: 'image/png',
                id: 'legacy-image-file',
                path: '.assets/boards/legacy.excalidraw/images/legacy-image-file.png',
                created: 1778751138363,
                lastRetrieved: 1778751138363,
            });
            expect(saved.files['legacy-image-file']).not.toHaveProperty('dataURL');
            const assetPath = path.join(projectRoot, 'src', 'resources', '.assets', 'boards', 'legacy.excalidraw', 'images', 'legacy-image-file.png');
            expect(fs.existsSync(assetPath)).toBe(true);
            expect(fs.readFileSync(assetPath).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            const getResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('boards/legacy.excalidraw')}`);
            expect(getResponse.status).toBe(200);
            const hydrated = await getResponse.json();
            expect(hydrated.files['legacy-image-file']).toMatchObject({
                mimeType: 'image/png',
                id: 'legacy-image-file',
                path: '.assets/boards/legacy.excalidraw/images/legacy-image-file.png',
                dataURL: PNG_DATA_URL,
            });
        }
        finally {
            await server.close();
        }
    });
    it('rejects invalid Excalidraw image file data without writing inline data URLs', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw');
            const canvas = {
                type: 'excalidraw',
                version: 2,
                source: '@axhub/make',
                elements: [
                    {
                        id: 'image-1',
                        type: 'image',
                        fileId: 'image-file-1',
                    },
                ],
                appState: { viewBackgroundColor: '#ffffff' },
                files: {
                    'image-file-1': {
                        mimeType: 'image/png',
                        id: 'image-file-1',
                        dataURL: 'data:image/png;base64,abcd',
                        created: 1778751138363,
                        lastRetrieved: 1778751138363,
                    },
                },
            };
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.stringify(canvas, null, 2) }),
            });
            expect(putResponse.status).toBe(400);
            expect(await putResponse.json()).toMatchObject({
                error: expect.stringContaining('Unsupported or invalid canvas image data URL'),
            });
            expect(fs.existsSync(canvasPath)).toBe(false);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'images', 'image-file-1.png'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('persists resource canvas screenshots under sibling assets and serves them back', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        writeCanvasFile(path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw'));
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const encodedCanvas = encodeResourceCanvasPath('flows/app.excalidraw');
            const screenshotPath = path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'screenshot.png');
            expect(fs.existsSync(screenshotPath)).toBe(false);
            const putResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataUrl: PNG_DATA_URL,
                    width: 320,
                    height: 180,
                }),
            });
            const putBody = await putResponse.json();
            expect(putResponse.status).toBe(201);
            expect(putBody).toMatchObject({
                success: true,
                changed: true,
                resourcePath: 'flows/app.excalidraw',
                path: 'src/resources/.assets/flows/app.excalidraw/screenshot.png',
                width: 320,
                height: 180,
            });
            const screenshotUrl = new URL(putBody.screenshotUrl, server.origin);
            expect(screenshotUrl.pathname).toBe('/api/canvas/resources/flows/app.excalidraw/asset/screenshot.png');
            expect(screenshotUrl.searchParams.get('v')).toMatch(/^\d+$/u);
            expect(screenshotUrl.searchParams.get('projectId')).toBe(path.basename(projectRoot));
            expect(putBody.apiScreenshotUrl).toBe(putBody.screenshotUrl);
            expect(fs.existsSync(screenshotPath)).toBe(true);
            const written = fs.readFileSync(screenshotPath);
            expect(written.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            const getResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/asset/screenshot.png`);
            expect(getResponse.status).toBe(200);
            expect(getResponse.headers.get('content-type')).toBe('image/png');
            expect(Buffer.from(await getResponse.arrayBuffer())).toEqual(written);
            const unchangedResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
            });
            expect(unchangedResponse.status).toBe(200);
            await expect(unchangedResponse.json()).resolves.toMatchObject({
                success: true,
                changed: false,
                path: 'src/resources/.assets/flows/app.excalidraw/screenshot.png',
            });
            const missingResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/asset/missing.png`);
            expect(missingResponse.status).toBe(404);
            const wrongMethodResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/asset/screenshot.png`, {
                method: 'POST',
            });
            expect(wrongMethodResponse.status).toBe(405);
        }
        finally {
            await server.close();
        }
    });
    it('persists element and page screenshots inside the resource canvas assets folder', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        writeCanvasFile(path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw'));
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const encodedCanvas = encodeResourceCanvasPath('flows/app.excalidraw');
            const elementScreenshotPath = path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'embed-embed-1.png');
            const pageScreenshotPath = path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'page-order-detail.png');
            const latestScreenshotPath = path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'screenshot.png');
            const elementResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    elementId: 'embed-1',
                    dataUrl: PNG_DATA_URL,
                    width: 320,
                    height: 180,
                }),
            });
            expect(elementResponse.status).toBe(201);
            await expect(elementResponse.json()).resolves.toMatchObject({
                success: true,
                changed: true,
                fileName: 'embed-embed-1.png',
                path: 'src/resources/.assets/flows/app.excalidraw/embed-embed-1.png',
                latestPath: 'src/resources/.assets/flows/app.excalidraw/screenshot.png',
            });
            expect(fs.existsSync(elementScreenshotPath)).toBe(true);
            expect(fs.readFileSync(latestScreenshotPath)).toEqual(fs.readFileSync(elementScreenshotPath));
            const pageResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: 'order-detail',
                    dataUrl: PNG_DATA_URL,
                    width: 393,
                    height: 852,
                }),
            });
            expect(pageResponse.status).toBe(201);
            await expect(pageResponse.json()).resolves.toMatchObject({
                success: true,
                changed: true,
                fileName: 'page-order-detail.png',
                path: 'src/resources/.assets/flows/app.excalidraw/page-order-detail.png',
                latestPath: 'src/resources/.assets/flows/app.excalidraw/screenshot.png',
                width: 393,
                height: 852,
            });
            expect(fs.existsSync(pageScreenshotPath)).toBe(true);
            expect(fs.readFileSync(latestScreenshotPath)).toEqual(fs.readFileSync(pageScreenshotPath));
            const invalidPageResponse = await fetch(`${server.origin}/api/canvas/resources/${encodedCanvas}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: '../outside',
                    dataUrl: PNG_DATA_URL,
                }),
            });
            expect(invalidPageResponse.status).toBe(403);
            expect(await invalidPageResponse.json()).toEqual({ error: 'Invalid screenshot path' });
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe or non-png resource canvas screenshots', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        writeCanvasFile(path.join(projectRoot, 'src', 'resources', 'flows', 'app.excalidraw'));
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const escapedResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeURIComponent('../outside.excalidraw')}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
            });
            expect(escapedResponse.status).toBe(403);
            const jpegResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: 'data:image/jpeg;base64,abcd' }),
            });
            expect(jpegResponse.status).toBe(400);
            const wrongMethodResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/app.excalidraw')}/screenshot`);
            expect(wrongMethodResponse.status).toBe(405);
            const missingCanvasResponse = await fetch(`${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('flows/missing.excalidraw')}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
            });
            expect(missingCanvasResponse.status).toBe(404);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'outside.assets', 'screenshot.png'))).toBe(false);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'resources', '.assets', 'flows', 'app.excalidraw', 'outside.png'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('does not expose legacy prototype screenshot APIs', async () => {
        const projectRoot = createTempRoot('axhub-make-canvas-api-');
        writeProjectMetadata(projectRoot);
        writePrototypeDir(projectRoot, 'home');
        const server = await startActiveCanvasTestServer(projectRoot);
        try {
            const screenshotResponse = await fetch(`${server.origin}/api/canvas/prototypes/home/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
            });
            expect(screenshotResponse.status).toBe(404);
            await expect(screenshotResponse.json()).resolves.toEqual({ error: 'Canvas not found' });
            const readResponse = await fetch(`${server.origin}/api/canvas/prototypes/home/canvas-assets/screenshot.png`);
            expect(readResponse.status).toBe(404);
            await expect(readResponse.json()).resolves.toEqual({ error: 'Canvas not found' });
            const escapedResponse = await fetch(`${server.origin}/api/canvas/prototypes/${encodeURIComponent('../outside')}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
            });
            expect(escapedResponse.status).toBe(404);
            await expect(escapedResponse.json()).resolves.toEqual({ error: 'Canvas not found' });
            expect(fs.existsSync(path.join(projectRoot, 'src', 'prototypes', 'home', 'canvas-assets'))).toBe(false);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'outside', 'screenshot.png'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
