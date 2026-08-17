import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasBridgeHub, isCanvasBridgeUpgrade } from '../canvasBridge.ts';
class FakeSocket extends EventEmitter {
    sentMessages = [];
    rawFrames = [];
    ended = false;
    write(chunk) {
        if (Buffer.isBuffer(chunk)) {
            for (const frame of parseServerFrames(chunk)) {
                if (frame.opcode === 0x01) {
                    this.sentMessages.push(JSON.parse(frame.payload.toString('utf8')));
                }
                else {
                    this.rawFrames.push(frame);
                }
            }
        }
        return true;
    }
    end() {
        this.ended = true;
        this.emit('close');
    }
}
class FakeFsWatcher extends EventEmitter {
    closed = false;
    close() {
        this.closed = true;
    }
}
function encodeClientTextFrame(message) {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    return encodeClientFrame(0x01, payload);
}
function encodeClientFrame(opcode, payload = Buffer.alloc(0)) {
    const mask = Buffer.from([1, 2, 3, 4]);
    let header;
    if (payload.length < 126) {
        header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    }
    else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
    }
    else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
        masked[index] = payload[index] ^ mask[index % 4];
    }
    return Buffer.concat([header, mask, masked]);
}
function parseServerFrames(buffer) {
    const frames = [];
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
        frames.push({ opcode, payload: buffer.subarray(offset + headerLength, frameEnd) });
        offset = frameEnd;
    }
    return frames;
}
function registerClient(hub, canvas, dirty = false) {
    const socket = new FakeSocket();
    hub.handleUpgrade({
        headers: {
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
    }, socket, Buffer.alloc(0));
    socket.emit('data', encodeClientTextFrame({ type: 'canvas.register', canvas, dirty }));
    return socket;
}
function getSocketClientId(socket) {
    return String(socket.sentMessages.find((message) => message.type === 'hello')?.payload?.clientId || '');
}
function countReloadMessages(socket) {
    return socket.sentMessages.filter((message) => message.type === 'canvas.reload').length;
}
function writeCanvasFile(filePath, marker) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [{ id: marker, type: 'rectangle' }],
        appState: {},
        files: {},
    }, null, 2), 'utf8');
}
function createProjectRoot() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-canvas-bridge-'));
    const canvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'home.excalidraw');
    const alternateCanvasPath = path.join(projectRoot, 'src', 'resources', 'flows', 'about.excalidraw');
    writeCanvasFile(canvasPath, 'initial');
    writeCanvasFile(alternateCanvasPath, 'alternate');
    return { projectRoot, canvasPath, alternateCanvasPath };
}
describe('CanvasBridgeHub hot reload watcher lifecycle', () => {
    let projectRoots = [];
    let watchers = [];
    let watchSpy;
    beforeEach(() => {
        vi.useFakeTimers();
        projectRoots = [];
        watchers = [];
        watchSpy = vi.spyOn(fs, 'watch').mockImplementation((() => {
            const watcher = new FakeFsWatcher();
            watchers.push(watcher);
            return watcher;
        }));
    });
    afterEach(() => {
        vi.useRealTimers();
        watchSpy.mockRestore();
        for (const root of projectRoots) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    function createHub() {
        const { projectRoot, canvasPath, alternateCanvasPath } = createProjectRoot();
        projectRoots.push(projectRoot);
        const refreshes = [];
        const hub = new CanvasBridgeHub({
            projectRoot,
            refreshQuietMs: 2000,
            refreshMaxWaitMs: 8000,
            onExternalCanvasRefresh: (canvasName) => {
                refreshes.push(canvasName);
            },
        });
        return { hub, canvasPath, alternateCanvasPath, refreshes };
    }
    it('starts watching a resource canvas only after registration and closes after the last client leaves', () => {
        const { hub, canvasPath } = createHub();
        expect(watchSpy).not.toHaveBeenCalled();
        const first = registerClient(hub, 'resources/flows/home.excalidraw');
        expect(watchSpy).toHaveBeenCalledTimes(1);
        expect(watchSpy.mock.calls[0][0]).toBe(canvasPath);
        expect(hub.getActiveCanvasWatchers()).toEqual([{
                canvas: 'resources/flows/home.excalidraw',
                filePath: canvasPath,
                refCount: 1,
                dirtyClientCount: 0,
            }]);
        const second = registerClient(hub, 'src/resources/flows/home.excalidraw');
        expect(watchSpy).toHaveBeenCalledTimes(1);
        expect(hub.getActiveCanvasWatchers()[0].refCount).toBe(2);
        first.end();
        expect(watchers[0].closed).toBe(false);
        expect(hub.getActiveCanvasWatchers()[0].refCount).toBe(1);
        second.end();
        expect(watchers[0].closed).toBe(true);
        expect(hub.getActiveCanvasWatchers()).toEqual([]);
        hub.destroy();
    });
    it('moves a client watcher when the client registers a different resource canvas', () => {
        const { hub, canvasPath, alternateCanvasPath } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw');
        expect(hub.getActiveCanvasWatchers()).toEqual([{
                canvas: 'resources/flows/home.excalidraw',
                filePath: canvasPath,
                refCount: 1,
                dirtyClientCount: 0,
            }]);
        socket.emit('data', encodeClientTextFrame({
            type: 'canvas.register',
            canvas: 'flows/about.excalidraw',
            dirty: false,
        }));
        expect(watchSpy).toHaveBeenCalledTimes(2);
        expect(watchers[0].closed).toBe(true);
        expect(watchers[1].closed).toBe(false);
        expect(hub.getActiveCanvasWatchers()).toEqual([{
                canvas: 'resources/flows/about.excalidraw',
                filePath: alternateCanvasPath,
                refCount: 1,
                dirtyClientCount: 0,
            }]);
        hub.destroy();
    });
    it('closes active watchers when the active project root changes', () => {
        const { hub } = createHub();
        registerClient(hub, 'resources/flows/home.excalidraw');
        expect(hub.getActiveCanvasWatchers()).toHaveLength(1);
        const { projectRoot: nextProjectRoot } = createProjectRoot();
        projectRoots.push(nextProjectRoot);
        hub.configureProjectRoot(nextProjectRoot);
        expect(watchers[0].closed).toBe(true);
        expect(hub.getActiveCanvasWatchers()).toEqual([]);
        hub.destroy();
    });
    it('ignores missing standalone and removed prototype registrations for hot reload watching', () => {
        const { hub } = createHub();
        registerClient(hub, 'legacy.excalidraw');
        registerClient(hub, 'canvas/legacy.excalidraw');
        registerClient(hub, 'prototypes/home/canvas.excalidraw');
        registerClient(hub, 'src/prototypes/home/canvas.excalidraw');
        expect(watchSpy).not.toHaveBeenCalled();
        expect(hub.getActiveCanvasWatchers()).toEqual([]);
        hub.destroy();
    });
    it('suppresses make-server saves by hash and refreshes stable external writes once', async () => {
        const { hub, canvasPath, refreshes } = createHub();
        registerClient(hub, 'resources/flows/home.excalidraw');
        writeCanvasFile(canvasPath, 'server-save');
        hub.recordCanvasSave(canvasPath, fs.readFileSync(canvasPath, 'utf8'));
        watchers[0].emit('change', 'change');
        await vi.advanceTimersByTimeAsync(9000);
        expect(refreshes).toEqual([]);
        writeCanvasFile(canvasPath, 'external-1');
        watchers[0].emit('change', 'change');
        await vi.advanceTimersByTimeAsync(1000);
        writeCanvasFile(canvasPath, 'external-2');
        watchers[0].emit('change', 'change');
        await vi.advanceTimersByTimeAsync(1999);
        expect(refreshes).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(refreshes).toEqual(['resources/flows/home.excalidraw']);
        await vi.advanceTimersByTimeAsync(9000);
        expect(refreshes).toEqual(['resources/flows/home.excalidraw']);
        hub.destroy();
    });
    it('broadcasts make-server canvas saves to other clean clients without echoing the watcher event', async () => {
        const { hub, canvasPath } = createHub();
        const source = registerClient(hub, 'resources/flows/home.excalidraw', true);
        const other = registerClient(hub, 'resources/flows/home.excalidraw');
        const otherCanvas = registerClient(hub, 'resources/flows/about.excalidraw');
        writeCanvasFile(canvasPath, 'server-save');
        hub.recordCanvasSave(canvasPath, fs.readFileSync(canvasPath, 'utf8'), {
            sourceClientId: getSocketClientId(source),
        });
        expect(countReloadMessages(source)).toBe(0);
        expect(countReloadMessages(other)).toBe(1);
        expect(countReloadMessages(otherCanvas)).toBe(0);
        watchers[0].emit('change', 'change');
        await vi.advanceTimersByTimeAsync(9000);
        expect(countReloadMessages(other)).toBe(1);
        hub.destroy();
    });
    it('does not refresh while any same-canvas client is dirty', async () => {
        const { hub, canvasPath, refreshes } = createHub();
        registerClient(hub, 'resources/flows/home.excalidraw', true);
        writeCanvasFile(canvasPath, 'dirty-skip');
        watchers[0].emit('change', 'change');
        await vi.advanceTimersByTimeAsync(2500);
        expect(refreshes).toEqual([]);
        hub.destroy();
    });
    it('defers a stable external write while dirty and refreshes when the canvas becomes clean', async () => {
        const { hub, canvasPath, refreshes } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw', true);
        writeCanvasFile(canvasPath, 'deferred-external');
        watchers[0].emit('change', 'change');
        await vi.advanceTimersByTimeAsync(2500);
        expect(refreshes).toEqual([]);
        socket.emit('data', encodeClientTextFrame({
            type: 'canvas.status',
            canvas: 'resources/flows/home.excalidraw',
            dirty: false,
        }));
        expect(refreshes).toEqual(['resources/flows/home.excalidraw']);
        hub.destroy();
    });
    it('sends refresh requests to every matching registered canvas client', () => {
        const { hub } = createHub();
        const first = registerClient(hub, 'resources/flows/home.excalidraw');
        const second = registerClient(hub, 'src/resources/flows/home.excalidraw');
        const other = registerClient(hub, 'resources/flows/about.excalidraw');
        expect(hub.requestRefresh('flows/home.excalidraw')).toBe(true);
        expect(first.sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'canvas.reload' }),
        ]));
        expect(second.sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'canvas.reload' }),
        ]));
        expect(other.sentMessages).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'canvas.reload' }),
        ]));
        expect(hub.requestRefresh('missing')).toBe(false);
        hub.destroy();
    });
    it('sends canvas command requests to a registered canvas client and resolves result payloads', async () => {
        const { hub } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw');
        const resultPromise = hub.sendCommand('canvas_get_state', { includeElements: true }, {
            requestId: 'command-1',
            timeoutMs: 5000,
        });
        expect(socket.sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'canvas.command.request',
                requestId: 'command-1',
                canvasName: 'resources/flows/home.excalidraw',
                command: 'canvas_get_state',
                payload: { includeElements: true },
                timeoutMs: 5000,
            }),
        ]));
        socket.emit('data', encodeClientTextFrame({
            type: 'canvas.command.result',
            requestId: 'command-1',
            ok: true,
            payload: { canvasName: 'resources/flows/home.excalidraw', selectedElementIds: [] },
        }));
        await expect(resultPromise).resolves.toEqual({
            canvasName: 'resources/flows/home.excalidraw',
            selectedElementIds: [],
        });
        hub.destroy();
    });
    it('rejects canvas commands when no canvas tab is connected', async () => {
        const { hub } = createHub();
        await expect(hub.sendCommand('canvas_get_state', {}, {
            requestId: 'command-no-client',
            timeoutMs: 5000,
        })).rejects.toMatchObject({
            code: 'canvas_not_connected',
        });
        hub.destroy();
    });
    it('rejects duplicate canvas command request ids while a command is pending', async () => {
        const { hub } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw');
        const firstResultPromise = hub.sendCommand('canvas_get_state', {}, {
            requestId: 'duplicate-command',
            timeoutMs: 5000,
        });
        await expect(hub.sendCommand('canvas_capture', {}, {
            requestId: 'duplicate-command',
            timeoutMs: 5000,
        })).rejects.toMatchObject({
            code: 'canvas_command_duplicate_request',
        });
        socket.emit('data', encodeClientTextFrame({
            type: 'canvas.command.result',
            requestId: 'duplicate-command',
            ok: true,
            payload: { ok: true },
        }));
        await expect(firstResultPromise).resolves.toEqual({ ok: true });
        hub.destroy();
    });
    it('rejects canvas commands when the browser does not answer before timeout', async () => {
        const { hub } = createHub();
        registerClient(hub, 'resources/flows/home.excalidraw');
        const resultPromise = hub.sendCommand('canvas_capture', { scope: 'viewport' }, {
            requestId: 'timeout-command',
            timeoutMs: 100,
        });
        const expectation = expect(resultPromise).rejects.toMatchObject({
            code: 'canvas_command_timeout',
        });
        await vi.advanceTimersByTimeAsync(100);
        await expectation;
        hub.destroy();
    });
    it('routes canvas commands to the requested canvas name when multiple tabs are connected', async () => {
        const { hub } = createHub();
        const home = registerClient(hub, 'resources/flows/home.excalidraw');
        const about = registerClient(hub, 'src/resources/flows/about.excalidraw');
        const resultPromise = hub.sendCommand('canvas_focus', { target: 'all' }, {
            requestId: 'about-command',
            canvasName: 'src/resources/flows/about.excalidraw',
            timeoutMs: 5000,
        });
        expect(home.sentMessages).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'canvas.command.request', requestId: 'about-command' }),
        ]));
        expect(about.sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'canvas.command.request',
                requestId: 'about-command',
                canvasName: 'resources/flows/about.excalidraw',
                command: 'canvas_focus',
            }),
        ]));
        about.emit('data', encodeClientTextFrame({
            type: 'canvas.command.result',
            requestId: 'about-command',
            ok: true,
            payload: { focused: true },
        }));
        await expect(resultPromise).resolves.toEqual({ focused: true });
        hub.destroy();
    });
    it('rejects pending canvas commands when the target browser tab disconnects', async () => {
        const { hub } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw');
        const resultPromise = hub.sendCommand('canvas_get_state', {}, {
            requestId: 'disconnect-command',
            timeoutMs: 5000,
        });
        socket.end();
        await expect(resultPromise).rejects.toMatchObject({
            code: 'canvas_disconnected',
        });
        hub.destroy();
    });
    it('responds to ping frames and ignores malformed text frames without dropping the client', () => {
        const { hub } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw');
        const beforeCount = hub.clientCount;
        socket.emit('data', encodeClientTextFrame({ type: 'ping' }));
        socket.emit('data', encodeClientTextFrame('not-json'));
        expect(beforeCount).toBe(1);
        expect(hub.clientCount).toBe(1);
        expect(socket.sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'pong' }),
        ]));
        hub.destroy();
    });
    it('handles websocket control frames and extended client frames', () => {
        const { hub } = createHub();
        const socket = registerClient(hub, 'resources/flows/home.excalidraw');
        socket.emit('data', encodeClientFrame(0x09, Buffer.from('still-here')));
        expect(socket.rawFrames).toEqual(expect.arrayContaining([
            expect.objectContaining({
                opcode: 0x0a,
                payload: Buffer.from('still-here'),
            }),
        ]));
        socket.emit('data', encodeClientTextFrame({
            type: 'canvas.register',
            canvas: `manual-${'x'.repeat(140)}`,
        }));
        expect(hub.getConnectedCanvases()[0].canvas).toContain('manual-');
        socket.emit('data', encodeClientTextFrame({
            type: 'canvas.status',
            dirty: true,
            payload: 'x'.repeat(66_000),
        }));
        expect(hub.getConnectedCanvases()[0].dirty).toBe(true);
        socket.emit('data', encodeClientFrame(0x0a, Buffer.from('heartbeat')));
        socket.emit('data', encodeClientFrame(0x08));
        expect(hub.clientCount).toBe(0);
        hub.destroy();
    });
    it('rejects upgrades without a WebSocket key and matches only the canvas bridge path', () => {
        const hub = new CanvasBridgeHub();
        const socket = new FakeSocket();
        hub.handleUpgrade({ headers: {} }, socket, Buffer.alloc(0));
        expect(socket.ended).toBe(true);
        expect(isCanvasBridgeUpgrade({ url: '/ws/canvas-bridge?client=1' })).toBe(true);
        expect(isCanvasBridgeUpgrade({ url: '/ws' })).toBe(false);
        expect(isCanvasBridgeUpgrade({ url: '' })).toBe(false);
        hub.destroy();
    });
});
