import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startMakeServer } from '../index.ts';
import { AXHUB_HUG_SCRIPT } from '../opencodeHug.ts';
const tempRoots = [];
function createTempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-opencode-bridge-'));
    tempRoots.push(root);
    return root;
}
function encodeClientFrame(opcode, payloadData) {
    const payload = Buffer.isBuffer(payloadData) ? payloadData : Buffer.from(payloadData, 'utf8');
    const mask = Buffer.from([1, 2, 3, 4]);
    let header;
    if (payload.length < 126) {
        header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    }
    else if (payload.length < 65536) {
        header = Buffer.from([0x80 | opcode, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
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
function encodeClientTextFrame(text) {
    return encodeClientFrame(0x01, text);
}
function encodeClientPingFrame(text = 'ping') {
    return encodeClientFrame(0x09, text);
}
function encodeClientCloseFrame() {
    return encodeClientFrame(0x08, Buffer.alloc(0));
}
function parseServerTextFrames(buffer) {
    const messages = [];
    let offset = 0;
    while (offset + 2 <= buffer.length) {
        const opcode = buffer[offset] & 0x0f;
        let payloadLength = buffer[offset + 1] & 0x7f;
        let headerLength = 2;
        if (payloadLength === 126) {
            if (offset + 4 > buffer.length)
                break;
            payloadLength = buffer.readUInt16BE(offset + 2);
            headerLength = 4;
        }
        else if (payloadLength === 127) {
            if (offset + 10 > buffer.length)
                break;
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
    return { messages, rest: buffer.subarray(offset) };
}
function waitForMessage(pendingMessages, waiters, predicate, timeoutMs = 2000) {
    const existingIndex = pendingMessages.findIndex(predicate);
    if (existingIndex >= 0) {
        const [message] = pendingMessages.splice(existingIndex, 1);
        return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === wrappedResolve);
            if (waiterIndex >= 0) {
                waiters.splice(waiterIndex, 1);
            }
            reject(new Error('Timed out waiting for bridge message'));
        }, timeoutMs);
        const wrappedResolve = (message) => {
            clearTimeout(timer);
            resolve(message);
        };
        waiters.push({ predicate, resolve: wrappedResolve });
    });
}
function openBridgeSocket(origin, role) {
    const parsed = new URL(origin);
    const port = Number(parsed.port);
    const host = parsed.hostname;
    const socket = net.connect(port, host);
    const pendingMessages = [];
    const waiters = [];
    let frameBuffer = Buffer.alloc(0);
    let handshakeDone = false;
    const pushMessage = (message) => {
        const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
        if (waiterIndex >= 0) {
            const [waiter] = waiters.splice(waiterIndex, 1);
            waiter.resolve(message);
            return;
        }
        pendingMessages.push(message);
    };
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out opening ${role} bridge socket`)), 2000);
        socket.on('connect', () => {
            socket.write([
                `GET /api/opencode-bridge/ws?role=${role} HTTP/1.1`,
                `Host: ${host}:${port}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version: 13',
                '',
                '',
            ].join('\r\n'));
        });
        socket.on('data', (chunk) => {
            if (!handshakeDone) {
                const headerEnd = chunk.indexOf('\r\n\r\n');
                if (headerEnd < 0)
                    return;
                const header = chunk.subarray(0, headerEnd).toString('utf8');
                if (!header.startsWith('HTTP/1.1 101')) {
                    clearTimeout(timer);
                    reject(new Error(`Bridge handshake failed for ${role}: ${header}`));
                    return;
                }
                handshakeDone = true;
                clearTimeout(timer);
                frameBuffer = Buffer.concat([frameBuffer, chunk.subarray(headerEnd + 4)]);
                resolve({
                    close: () => socket.end(),
                    send: (message) => socket.write(encodeClientTextFrame(JSON.stringify(message))),
                    sendRaw: (frame) => socket.write(frame),
                    waitForMessage: (predicate, timeoutMs) => waitForMessage(pendingMessages, waiters, predicate, timeoutMs),
                });
            }
            else {
                frameBuffer = Buffer.concat([frameBuffer, chunk]);
            }
            const parsedFrames = parseServerTextFrames(frameBuffer);
            frameBuffer = parsedFrames.rest;
            for (const rawMessage of parsedFrames.messages) {
                pushMessage(JSON.parse(rawMessage));
            }
        });
        socket.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('OpenCode WebUI bridge regression contract', () => {
    it('keeps the bridge indicator and only dispatches native context sync events', () => {
        expect(AXHUB_HUG_SCRIPT).toContain('function bootBridge()');
        expect(AXHUB_HUG_SCRIPT).toContain('bridge.enabled = true;');
        expect(AXHUB_HUG_SCRIPT).toContain('connectBridge();');
        expect(AXHUB_HUG_SCRIPT).toContain("document.getElementById('opencode-titlebar-right')");
        expect(AXHUB_HUG_SCRIPT).toContain("el.title = 'Axhub Bridge: ' + status + ctx;");
        expect(AXHUB_HUG_SCRIPT).toContain("window.dispatchEvent(new CustomEvent('axhub-bridge-context-changed'");
        expect(AXHUB_HUG_SCRIPT).toContain('detail: { contexts: Object.values(bridge.contexts) }');
        expect(AXHUB_HUG_SCRIPT).not.toContain('const PROMPT_URL_RE = /\\/session\\/[^/]+\\/(message|prompt_async|command)(\\?|$)/;');
        expect(AXHUB_HUG_SCRIPT).not.toContain('body.parts = [...contextParts, ...body.parts];');
        expect(AXHUB_HUG_SCRIPT).not.toContain('const CONTEXT_PILL_CONTAINER_ID = ');
    });
    it('relays Admin context updates to OpenCode clients and syncs existing context on reconnect', async () => {
        const projectRoot = createTempRoot();
        const server = await startMakeServer({
            projectRoot,
            host: 'localhost',
            port: 0,
            adminRoot: path.join(projectRoot, 'missing-admin'),
        });
        const sockets = [];
        try {
            const admin = await openBridgeSocket(server.origin, 'admin');
            const opencode = await openBridgeSocket(server.origin, 'opencode');
            sockets.push(admin, opencode);
            const contextItem = {
                id: 'axhub:current-file',
                type: 'file',
                path: 'src/pages/Login/index.tsx',
                preview: 'Login',
            };
            admin.send({ type: 'context:add', payload: contextItem });
            await expect(opencode.waitForMessage((message) => (message.type === 'context:add'
                && message.payload?.id === 'axhub:current-file'
                && message.payload?.path === 'src/pages/Login/index.tsx'))).resolves.toMatchObject({
                type: 'context:add',
                payload: contextItem,
            });
            admin.send({ type: 'ping' });
            await expect(admin.waitForMessage((message) => message.type === 'pong')).resolves.toMatchObject({
                type: 'pong',
            });
            admin.send({ type: 'status' });
            await expect(admin.waitForMessage((message) => (message.type === 'status'
                && message.payload?.clients?.admin >= 1
                && message.payload?.clients?.opencode >= 1))).resolves.toMatchObject({
                type: 'status',
                payload: {
                    clients: {
                        admin: expect.any(Number),
                        opencode: expect.any(Number),
                    },
                },
            });
            admin.sendRaw(encodeClientPingFrame());
            const updatedContextItem = {
                ...contextItem,
                preview: 'Updated Login',
            };
            admin.send({ type: 'context:update', payload: updatedContextItem });
            await expect(opencode.waitForMessage((message) => (message.type === 'context:update'
                && message.payload?.preview === 'Updated Login'))).resolves.toMatchObject({
                type: 'context:update',
                payload: updatedContextItem,
            });
            admin.send({ type: 'context:sync' });
            await expect(admin.waitForMessage((message) => (message.type === 'context:sync'
                && Array.isArray(message.payload)
                && message.payload.some((item) => item.preview === 'Updated Login')))).resolves.toMatchObject({
                type: 'context:sync',
                payload: [updatedContextItem],
            });
            const reconnectedOpenCode = await openBridgeSocket(server.origin, 'opencode');
            sockets.push(reconnectedOpenCode);
            await expect(reconnectedOpenCode.waitForMessage((message) => (message.type === 'context:sync'
                && Array.isArray(message.payload)
                && message.payload.some((item) => item.id === 'axhub:current-file')))).resolves.toMatchObject({
                type: 'context:sync',
                payload: [updatedContextItem],
            });
            admin.send({ type: 'context:remove', payload: { id: 'axhub:current-file' } });
            await expect(opencode.waitForMessage((message) => (message.type === 'context:remove'
                && message.payload?.id === 'axhub:current-file'))).resolves.toMatchObject({
                type: 'context:remove',
                payload: { id: 'axhub:current-file' },
            });
            admin.send({ type: 'context:add', payload: contextItem });
            await expect(opencode.waitForMessage((message) => (message.type === 'context:add'
                && message.payload?.id === 'axhub:current-file'))).resolves.toMatchObject({
                type: 'context:add',
                payload: contextItem,
            });
            admin.send({ type: 'context:clear' });
            await expect(opencode.waitForMessage((message) => message.type === 'context:clear')).resolves.toMatchObject({
                type: 'context:clear',
            });
            admin.sendRaw(encodeClientTextFrame('not-json'));
            admin.sendRaw(encodeClientCloseFrame());
        }
        finally {
            for (const socket of sockets) {
                socket.close();
            }
            await server.close();
        }
    });
    it('rejects invalid bridge websocket upgrades before registering clients', async () => {
        const projectRoot = createTempRoot();
        const server = await startMakeServer({
            projectRoot,
            host: 'localhost',
            port: 0,
            adminRoot: path.join(projectRoot, 'missing-admin'),
        });
        async function readUpgradeResponse(requestLines) {
            const parsed = new URL(server.origin);
            const socket = net.connect(Number(parsed.port), parsed.hostname);
            return new Promise((resolve, reject) => {
                let response = '';
                socket.on('connect', () => {
                    socket.write([...requestLines, '', ''].join('\r\n'));
                });
                socket.on('data', (chunk) => {
                    response += chunk.toString('utf8');
                });
                socket.on('end', () => resolve(response));
                socket.on('close', () => resolve(response));
                socket.on('error', reject);
            });
        }
        try {
            await expect(readUpgradeResponse([
                'GET /api/opencode-bridge/ws?role=viewer HTTP/1.1',
                `Host: localhost:${server.port}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version: 13',
            ])).resolves.toContain('HTTP/1.1 400 Bad Request');
            await expect(readUpgradeResponse([
                'GET /api/opencode-bridge/ws?role=admin HTTP/1.1',
                `Host: localhost:${server.port}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Version: 13',
            ])).resolves.toContain('HTTP/1.1 400 Bad Request');
        }
        finally {
            await server.close();
        }
    });
});
