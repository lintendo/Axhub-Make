import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { PREVIEW_BRIDGE_WS_PATH, PreviewBridgeHub, isPreviewBridgeUpgrade, } from '../previewBridge.ts';
class FakeSocket extends EventEmitter {
    sent = [];
    ended = false;
    clientId = '';
    write(chunk) {
        this.sent.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    end(chunk) {
        if (chunk)
            this.write(chunk);
        this.ended = true;
        this.emit('close');
    }
}
function encodeClientFrame(opcode, data, options = {}) {
    const header = Buffer.alloc(data.length < 126 ? 6 : 8);
    header[0] = (options.fin === false ? 0 : 0x80) | opcode;
    if (data.length < 126) {
        header[1] = 0x80 | data.length;
        header.writeUInt32BE(0, 2);
        return Buffer.concat([header, data]);
    }
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
    header.writeUInt32BE(0, 4);
    return Buffer.concat([header, data]);
}
function encodeClientTextFrame(payload) {
    return encodeClientFrame(0x01, Buffer.from(JSON.stringify(payload), 'utf8'));
}
function decodeServerTextFrame(frame) {
    let offset = 2;
    let payloadLength = frame[1] & 0x7f;
    if (payloadLength === 126) {
        payloadLength = frame.readUInt16BE(2);
        offset = 4;
    }
    else if (payloadLength === 127) {
        payloadLength = Number(frame.readBigUInt64BE(2));
        offset = 10;
    }
    return JSON.parse(frame.subarray(offset, offset + payloadLength).toString('utf8'));
}
function findServerTextFrames(socket) {
    return socket.sent.filter((frame) => frame[0] === 0x81);
}
function createHub() {
    const hub = new PreviewBridgeHub();
    return { hub };
}
function connectPreviewClient(hub) {
    const socket = new FakeSocket();
    hub.handleUpgrade({
        url: PREVIEW_BRIDGE_WS_PATH,
        headers: {
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
    }, socket, Buffer.alloc(0));
    socket.clientId = decodeServerTextFrame(findServerTextFrames(socket)[0]).payload.clientId;
    socket.sent.length = 0;
    socket.emit('data', encodeClientTextFrame({ type: 'preview.register' }));
    return socket;
}
describe('preview bridge websocket hub', () => {
    it('sends preview command requests to the connected browser host and resolves result payloads', async () => {
        const { hub } = createHub();
        const socket = connectPreviewClient(hub);
        const resultPromise = hub.sendCommand('preview_get_current', {}, {
            requestId: 'preview-command-1',
            timeoutMs: 5000,
        });
        expect(socket.sent.map(decodeServerTextFrame)).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'preview.command.request',
                requestId: 'preview-command-1',
                command: 'preview_get_current',
                payload: {},
                timeoutMs: 5000,
            }),
        ]));
        socket.emit('data', encodeClientTextFrame({
            type: 'preview.command.result',
            requestId: 'preview-command-1',
            ok: true,
            payload: { current: { resourceType: 'prototype', resourceId: 'home' } },
        }));
        await expect(resultPromise).resolves.toEqual({
            current: { resourceType: 'prototype', resourceId: 'home' },
        });
        hub.destroy();
    });
    it('routes preview commands to the requested registered browser host id', async () => {
        const { hub } = createHub();
        const firstSocket = connectPreviewClient(hub);
        const secondSocket = connectPreviewClient(hub);
        const firstClientId = firstSocket.clientId;
        const secondClientId = secondSocket.clientId;
        firstSocket.sent.length = 0;
        secondSocket.sent.length = 0;
        const resultPromise = hub.sendCommand('preview_navigate', {
            target: {
                resourceType: 'canvas',
                resourceId: 'beginner-guide',
            },
        }, {
            requestId: 'preview-command-targeted-client',
            timeoutMs: 5000,
            clientId: secondClientId,
        });
        expect(firstClientId).not.toBe(secondClientId);
        expect(firstSocket.sent).toEqual([]);
        expect(secondSocket.sent.map(decodeServerTextFrame)).toEqual([
            expect.objectContaining({
                type: 'preview.command.request',
                requestId: 'preview-command-targeted-client',
                command: 'preview_navigate',
            }),
        ]);
        secondSocket.emit('data', encodeClientTextFrame({
            type: 'preview.command.result',
            requestId: 'preview-command-targeted-client',
            ok: true,
            payload: {
                navigated: true,
                current: {
                    resourceType: 'canvas',
                    resourceId: 'beginner-guide',
                },
            },
        }));
        await expect(resultPromise).resolves.toMatchObject({
            navigated: true,
            current: {
                resourceType: 'canvas',
                resourceId: 'beginner-guide',
            },
        });
        hub.destroy();
    });
    it('routes untargeted preview commands to the latest registered browser host', async () => {
        const { hub } = createHub();
        const firstSocket = connectPreviewClient(hub);
        const secondSocket = connectPreviewClient(hub);
        firstSocket.sent.length = 0;
        secondSocket.sent.length = 0;
        const resultPromise = hub.sendCommand('preview_get_current', {}, {
            requestId: 'preview-command-latest-client',
            timeoutMs: 5000,
        });
        expect(firstSocket.sent).toEqual([]);
        expect(secondSocket.sent.map(decodeServerTextFrame)).toEqual([
            expect.objectContaining({
                type: 'preview.command.request',
                requestId: 'preview-command-latest-client',
                command: 'preview_get_current',
            }),
        ]);
        secondSocket.emit('data', encodeClientTextFrame({
            type: 'preview.command.result',
            requestId: 'preview-command-latest-client',
            ok: true,
            payload: {
                current: {
                    resourceType: 'prototype',
                    resourceId: 'latest-page',
                },
            },
        }));
        await expect(resultPromise).resolves.toEqual({
            current: {
                resourceType: 'prototype',
                resourceId: 'latest-page',
            },
        });
        hub.destroy();
    });
    it('resolves command results split across websocket continuation frames', async () => {
        const { hub } = createHub();
        const socket = connectPreviewClient(hub);
        const resultPromise = hub.sendCommand('preview_capture', {}, {
            requestId: 'preview-command-fragmented-result',
            timeoutMs: 50,
        });
        const payload = Buffer.from(JSON.stringify({
            type: 'preview.command.result',
            requestId: 'preview-command-fragmented-result',
            ok: true,
            payload: {
                screenshots: [{
                        viewportId: 'desktop',
                        dataUrl: `data:image/png;base64,${'a'.repeat(1024)}`,
                    }],
            },
        }), 'utf8');
        const splitAt = Math.floor(payload.length / 2);
        socket.emit('data', Buffer.concat([
            encodeClientFrame(0x01, payload.subarray(0, splitAt), { fin: false }),
            encodeClientFrame(0x00, payload.subarray(splitAt)),
        ]));
        await expect(resultPromise).resolves.toMatchObject({
            screenshots: [{
                    viewportId: 'desktop',
                }],
        });
        hub.destroy();
    });
    it('rejects preview commands when no preview host is connected', async () => {
        const { hub } = createHub();
        await expect(hub.sendCommand('preview_get_current', {}, {
            requestId: 'preview-command-no-client',
            timeoutMs: 5000,
        })).rejects.toMatchObject({
            code: 'preview_not_connected',
        });
        hub.destroy();
    });
    it('matches only the preview bridge websocket path', () => {
        const hub = new PreviewBridgeHub();
        const socket = new FakeSocket();
        hub.handleUpgrade({ headers: {} }, socket, Buffer.alloc(0));
        expect(socket.ended).toBe(true);
        expect(isPreviewBridgeUpgrade({ url: '/ws/preview-bridge?client=1' })).toBe(true);
        expect(isPreviewBridgeUpgrade({ url: '/ws/canvas-bridge' })).toBe(false);
        expect(isPreviewBridgeUpgrade({ url: '' })).toBe(false);
        hub.destroy();
    });
});
