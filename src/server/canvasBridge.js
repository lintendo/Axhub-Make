/**
 * Canvas Bridge — WebSocket channel for browser canvas hot reload.
 *
 * Browser clients connect when a canvas is open, registering which canvas they
 * are viewing. The server can then notify matching browser tabs to reload when
 * the backing .excalidraw file changes outside the current tab.
 *
 * Protocol messages are JSON frames over a minimal RFC 6455 WebSocket
 * implementation (same approach as opencodeBridge — no external dependencies).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isPathInside } from './projectCore/index.ts';
import { normalizeResourceAssetRelativePath, normalizeResourceRelativePath, resolveResourceFilePath, } from './resourceFiles.ts';
export class CanvasBridgeError extends Error {
    code;
    payload;
    constructor(code, message, payload) {
        super(message);
        this.name = 'CanvasBridgeError';
        this.code = code;
        this.payload = payload;
    }
}
// ---------------------------------------------------------------------------
// Minimal WebSocket framing helpers (RFC 6455) — same as opencodeBridge
// ---------------------------------------------------------------------------
function computeAcceptKey(key) {
    return createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
}
function encodeFrame(data) {
    const payload = Buffer.from(data, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text opcode
        header[1] = len;
    }
    else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    }
    else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
}
function parseFrame(buffer) {
    if (buffer.length < 2)
        return null;
    const firstByte = buffer[0];
    const secondByte = buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;
    if (payloadLength === 126) {
        if (buffer.length < 4)
            return null;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
    }
    else if (payloadLength === 127) {
        if (buffer.length < 10)
            return null;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
    }
    const maskSize = masked ? 4 : 0;
    const totalLength = offset + maskSize + payloadLength;
    if (buffer.length < totalLength)
        return null;
    let payload;
    if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        payload = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
            payload[i] = buffer[offset + 4 + i] ^ mask[i % 4];
        }
    }
    else {
        payload = buffer.subarray(offset, offset + payloadLength);
    }
    return { opcode, payload, consumed: totalLength };
}
let clientIdCounter = 0;
// ---------------------------------------------------------------------------
// CanvasBridgeHub — singleton
// ---------------------------------------------------------------------------
const DEFAULT_REFRESH_QUIET_MS = 2_000;
const DEFAULT_REFRESH_MAX_WAIT_MS = 8_000;
const DEFAULT_SUPPRESS_TTL_MS = 12_000;
const DEFAULT_CANVAS_COMMAND_TIMEOUT_MS = 15_000;
function hashContent(content) {
    return createHash('sha256').update(content).digest('hex');
}
function readCanvasFileSnapshot(filePath) {
    try {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return { content, hash: hashContent(content) };
    }
    catch {
        return null;
    }
}
function isJsonParseable(content) {
    try {
        JSON.parse(content);
        return true;
    }
    catch {
        return false;
    }
}
function normalizeResourceCanvasName(canvasName) {
    const raw = String(canvasName || '')
        .trim()
        .replace(/\\/gu, '/')
        .replace(/^\/+/u, '');
    if (raw.startsWith('src/') && !raw.startsWith('src/resources/')) {
        return null;
    }
    if (/^prototypes\/[^/]+\/canvas(?:\.excalidraw)?$/iu.test(raw) || raw.startsWith('canvas/')) {
        return null;
    }
    const normalized = raw
        .replace(/^src\/resources\//u, '')
        .replace(/^resources\//u, '');
    const resourcePath = normalizeResourceRelativePath(normalized) || normalizeResourceAssetRelativePath(normalized);
    if (!resourcePath || path.extname(resourcePath).toLowerCase() !== '.excalidraw') {
        return null;
    }
    return `resources/${resourcePath}`;
}
function normalizeClientCanvasName(canvasName) {
    return normalizeResourceCanvasName(canvasName) || String(canvasName || '').trim();
}
function createRequestId() {
    return `canvas-command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function sanitizeTimeoutMs(timeoutMs) {
    if (!Number.isFinite(timeoutMs) || !timeoutMs || timeoutMs <= 0) {
        return DEFAULT_CANVAS_COMMAND_TIMEOUT_MS;
    }
    return Math.max(1, Math.min(Math.floor(timeoutMs), 120_000));
}
export class CanvasBridgeHub {
    clients = new Map();
    pendingCommands = new Map();
    heartbeatTimer = null;
    projectRoot = '';
    fileWatchers = new Map();
    clientWatcherFiles = new Map();
    suppressHashes = new Map();
    refreshQuietMs;
    refreshMaxWaitMs;
    suppressTtlMs;
    onExternalCanvasRefresh;
    constructor(options = {}) {
        this.refreshQuietMs = options.refreshQuietMs ?? DEFAULT_REFRESH_QUIET_MS;
        this.refreshMaxWaitMs = options.refreshMaxWaitMs ?? DEFAULT_REFRESH_MAX_WAIT_MS;
        this.suppressTtlMs = options.suppressTtlMs ?? DEFAULT_SUPPRESS_TTL_MS;
        this.onExternalCanvasRefresh = options.onExternalCanvasRefresh;
        if (options.projectRoot) {
            this.configureProjectRoot(options.projectRoot);
        }
        this.startHeartbeat();
    }
    // ---- Lifecycle -----------------------------------------------------------
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            for (const client of this.clients.values()) {
                if (!client.alive) {
                    this.removeClient(client.id);
                    continue;
                }
                client.alive = false;
                this.sendToClient(client, { type: 'ping' });
            }
        }, 30_000);
        this.heartbeatTimer.unref?.();
    }
    destroy() {
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        for (const pending of this.pendingCommands.values()) {
            this.rejectPendingCommand(pending, new CanvasBridgeError('canvas_bridge_destroyed', 'Canvas bridge was closed before the command completed.'));
        }
        this.pendingCommands.clear();
        for (const client of this.clients.values()) {
            try {
                client.socket.end();
            }
            catch { /* noop */ }
        }
        this.clients.clear();
        this.clientWatcherFiles.clear();
        for (const watcher of this.fileWatchers.values()) {
            this.closeFileWatcher(watcher);
        }
        this.fileWatchers.clear();
        for (const hashes of this.suppressHashes.values()) {
            for (const timer of hashes.values()) {
                clearTimeout(timer);
            }
        }
        this.suppressHashes.clear();
    }
    // ---- Client management ---------------------------------------------------
    handleUpgrade(req, socket, head) {
        const wsKey = req.headers['sec-websocket-key'];
        if (!wsKey) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            return;
        }
        const acceptKey = computeAcceptKey(wsKey);
        socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
            '\r\n');
        const clientId = `canvas-${++clientIdCounter}`;
        const client = {
            id: clientId,
            socket,
            buffer: head.length > 0 ? Buffer.from(head) : Buffer.alloc(0),
            alive: true,
            canvasName: '',
            rawCanvasName: '',
            canvasFilePath: null,
            dirty: false,
        };
        this.clients.set(clientId, client);
        this.sendToClient(client, {
            type: 'hello',
            payload: { clientId },
        });
        socket.on('data', (chunk) => {
            client.buffer = Buffer.concat([client.buffer, chunk]);
            this.processFrames(client);
        });
        socket.on('close', () => this.removeClient(clientId));
        socket.on('error', () => this.removeClient(clientId));
        socket.on('end', () => this.removeClient(clientId));
    }
    removeClient(clientId) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        this.clients.delete(clientId);
        for (const pending of [...this.pendingCommands.values()]) {
            if (pending.clientId === clientId) {
                this.rejectPendingCommand(pending, new CanvasBridgeError('canvas_disconnected', 'Canvas tab disconnected before the command completed.'));
            }
        }
        this.detachClientFromFileWatcher(client);
        try {
            client.socket.end();
        }
        catch { /* noop */ }
    }
    // ---- Frame processing ----------------------------------------------------
    processFrames(client) {
        while (true) {
            const frame = parseFrame(client.buffer);
            if (!frame)
                break;
            client.buffer = client.buffer.subarray(frame.consumed);
            switch (frame.opcode) {
                case 0x01: // text
                    this.handleTextMessage(client, frame.payload.toString('utf8'));
                    break;
                case 0x08: // close
                    this.removeClient(client.id);
                    return;
                case 0x09: // ping
                    client.alive = true;
                    this.sendRawFrame(client, 0x0a, frame.payload); // pong
                    break;
                case 0x0a: // pong
                    client.alive = true;
                    break;
            }
        }
    }
    handleTextMessage(client, text) {
        client.alive = true;
        let msg;
        try {
            msg = JSON.parse(text);
        }
        catch {
            return;
        }
        switch (msg.type) {
            case 'pong':
                client.alive = true;
                break;
            case 'ping':
                this.sendToClient(client, { type: 'pong' });
                break;
            case 'canvas.register':
                if (msg.canvas && typeof msg.canvas === 'string') {
                    this.registerClientCanvas(client, msg);
                }
                break;
            case 'canvas.status':
                this.updateClientCanvasStatus(client, msg);
                break;
            case 'canvas.command.result':
                this.resolveCommandResult(client, msg);
                break;
        }
    }
    // ---- Public API for HTTP endpoints ---------------------------------------
    configureProjectRoot(projectRoot) {
        const nextProjectRoot = path.resolve(projectRoot);
        if (this.projectRoot === nextProjectRoot) {
            return;
        }
        for (const watcher of this.fileWatchers.values()) {
            this.closeFileWatcher(watcher);
        }
        this.fileWatchers.clear();
        this.clientWatcherFiles.clear();
        this.projectRoot = nextProjectRoot;
    }
    /** Get list of currently connected canvas names. */
    getConnectedCanvases() {
        const result = [];
        for (const client of this.clients.values()) {
            if (client.canvasName) {
                result.push({
                    clientId: client.id,
                    canvas: client.canvasName,
                    canvasFilePath: client.canvasFilePath,
                    dirty: client.dirty,
                });
            }
        }
        return result;
    }
    getActiveCanvasWatchers() {
        return [...this.fileWatchers.values()]
            .map((watcher) => ({
            canvas: watcher.canvasName,
            filePath: watcher.filePath,
            refCount: watcher.clients.size,
            dirtyClientCount: watcher.dirtyClients.size,
        }))
            .sort((a, b) => a.filePath.localeCompare(b.filePath));
    }
    recordCanvasSave(filePath, content, options = {}) {
        const resolvedPath = path.resolve(filePath);
        const hash = hashContent(content);
        let hashes = this.suppressHashes.get(resolvedPath);
        if (!hashes) {
            hashes = new Map();
            this.suppressHashes.set(resolvedPath, hashes);
        }
        const existingTimer = hashes.get(hash);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            const currentHashes = this.suppressHashes.get(resolvedPath);
            currentHashes?.delete(hash);
            if (currentHashes?.size === 0) {
                this.suppressHashes.delete(resolvedPath);
            }
        }, this.suppressTtlMs);
        timer.unref?.();
        hashes.set(hash, timer);
        const watcher = this.fileWatchers.get(resolvedPath);
        if (watcher) {
            watcher.lastProcessedHash = hash;
            watcher.deferredRefreshHash = null;
            if (watcher.pending?.timer) {
                clearTimeout(watcher.pending.timer);
                watcher.pending.timer = null;
            }
            watcher.pending = null;
            this.requestRefresh(watcher.canvasName, { excludeClientId: options.sourceClientId || undefined });
        }
    }
    /** Find connected clients for a given canvas name (or any canvas if null). */
    findClients(canvasName) {
        const normalizedCanvasName = canvasName ? normalizeClientCanvasName(canvasName) : '';
        const result = [];
        for (const client of this.clients.values()) {
            if (!client.canvasName)
                continue;
            if (!normalizedCanvasName || client.canvasName === normalizedCanvasName) {
                result.push(client);
            }
        }
        return result;
    }
    /** Request the browser to reload the canvas from disk. */
    requestRefresh(canvasName, options = {}) {
        const clients = this.findClients(canvasName);
        const targetClients = options.excludeClientId
            ? clients.filter((client) => client.id !== options.excludeClientId)
            : clients;
        if (targetClients.length === 0)
            return false;
        for (const client of targetClients) {
            this.sendToClient(client, { type: 'canvas.reload' });
        }
        return true;
    }
    sendCommand(command, payload, options = {}) {
        const requestId = options.requestId || createRequestId();
        if (this.pendingCommands.has(requestId)) {
            return Promise.reject(new CanvasBridgeError('canvas_command_duplicate_request', `Canvas command request "${requestId}" is already pending.`));
        }
        const targetClient = this.findClients(options.canvasName)[0];
        if (!targetClient) {
            return Promise.reject(new CanvasBridgeError('canvas_not_connected', options.canvasName
                ? `Canvas "${normalizeClientCanvasName(options.canvasName)}" is not connected.`
                : 'No browser canvas tab is connected.'));
        }
        const timeoutMs = sanitizeTimeoutMs(options.timeoutMs);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const pending = this.pendingCommands.get(requestId);
                if (!pending)
                    return;
                this.rejectPendingCommand(pending, new CanvasBridgeError('canvas_command_timeout', `Canvas command "${command}" timed out after ${timeoutMs}ms.`));
            }, timeoutMs);
            timer.unref?.();
            const pending = {
                requestId,
                clientId: targetClient.id,
                timer,
                resolve,
                reject,
            };
            this.pendingCommands.set(requestId, pending);
            this.sendToClient(targetClient, {
                type: 'canvas.command.request',
                requestId,
                canvasName: targetClient.canvasName,
                command,
                payload,
                timeoutMs,
            });
        });
    }
    get clientCount() {
        return this.clients.size;
    }
    // ---- Canvas watcher helpers ---------------------------------------------
    resolveResourceCanvasFile(canvasName) {
        if (!this.projectRoot) {
            return null;
        }
        const normalizedCanvasName = normalizeResourceCanvasName(canvasName);
        if (!normalizedCanvasName) {
            return null;
        }
        const resourcePath = normalizedCanvasName.replace(/^resources\//u, '');
        const resolved = resolveResourceFilePath(this.projectRoot, resourcePath, { allowAssetPath: true });
        if (!resolved
            || path.extname(resolved.relativePath).toLowerCase() !== '.excalidraw'
            || !isPathInside(this.projectRoot, resolved.absolutePath)
            || !fs.existsSync(resolved.absolutePath)) {
            return null;
        }
        return { canvasName: normalizedCanvasName, filePath: resolved.absolutePath };
    }
    registerClientCanvas(client, msg) {
        const rawCanvasName = String(msg.canvas || '').trim();
        const resolved = this.resolveResourceCanvasFile(rawCanvasName);
        this.detachClientFromFileWatcher(client);
        client.rawCanvasName = rawCanvasName;
        client.canvasName = resolved?.canvasName || normalizeClientCanvasName(rawCanvasName);
        client.canvasFilePath = resolved?.filePath || null;
        client.dirty = msg.dirty === true;
        if (resolved) {
            this.attachClientToFileWatcher(client, resolved);
        }
    }
    updateClientCanvasStatus(client, msg) {
        if (typeof msg.dirty !== 'boolean') {
            return;
        }
        const nextDirty = msg.dirty === true;
        client.dirty = nextDirty;
        const filePath = this.clientWatcherFiles.get(client.id);
        if (!filePath) {
            return;
        }
        const watcher = this.fileWatchers.get(filePath);
        if (!watcher) {
            return;
        }
        if (nextDirty) {
            watcher.dirtyClients.add(client.id);
        }
        else {
            watcher.dirtyClients.delete(client.id);
            if (watcher.dirtyClients.size === 0 && watcher.deferredRefreshHash) {
                watcher.deferredRefreshHash = null;
                if (this.onExternalCanvasRefresh) {
                    this.onExternalCanvasRefresh(watcher.canvasName, watcher.filePath);
                }
                else {
                    this.requestRefresh(watcher.canvasName);
                }
            }
        }
    }
    resolveCommandResult(client, msg) {
        if (!msg.requestId) {
            return;
        }
        const pending = this.pendingCommands.get(msg.requestId);
        if (!pending || pending.clientId !== client.id) {
            return;
        }
        clearTimeout(pending.timer);
        this.pendingCommands.delete(msg.requestId);
        if (msg.ok === false) {
            const error = msg.error || {
                code: 'canvas_command_failed',
                message: 'Canvas command failed.',
            };
            pending.reject(new CanvasBridgeError(error.code, error.message, msg.payload));
            return;
        }
        pending.resolve(msg.payload);
    }
    rejectPendingCommand(pending, error) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(pending.requestId);
        pending.reject(error);
    }
    attachClientToFileWatcher(client, resolved) {
        let watcher = this.fileWatchers.get(resolved.filePath);
        if (!watcher) {
            watcher = this.createFileWatcher(resolved);
            if (!watcher) {
                return;
            }
            this.fileWatchers.set(resolved.filePath, watcher);
        }
        watcher.clients.add(client.id);
        if (client.dirty) {
            watcher.dirtyClients.add(client.id);
        }
        else {
            watcher.dirtyClients.delete(client.id);
        }
        this.clientWatcherFiles.set(client.id, resolved.filePath);
    }
    detachClientFromFileWatcher(client) {
        const filePath = this.clientWatcherFiles.get(client.id);
        if (!filePath) {
            return;
        }
        this.clientWatcherFiles.delete(client.id);
        const watcher = this.fileWatchers.get(filePath);
        if (!watcher) {
            return;
        }
        watcher.clients.delete(client.id);
        watcher.dirtyClients.delete(client.id);
        if (watcher.clients.size === 0) {
            this.closeFileWatcher(watcher);
            this.fileWatchers.delete(filePath);
        }
    }
    createFileWatcher(resolved) {
        let fsWatcher;
        try {
            fsWatcher = fs.watch(resolved.filePath, { persistent: false });
        }
        catch {
            return null;
        }
        const snapshot = readCanvasFileSnapshot(resolved.filePath);
        const watcher = {
            canvasName: resolved.canvasName,
            filePath: resolved.filePath,
            watcher: fsWatcher,
            clients: new Set(),
            dirtyClients: new Set(),
            lastProcessedHash: snapshot?.hash || null,
            deferredRefreshHash: null,
            pending: null,
        };
        fsWatcher.on('change', () => this.handleFileWatchEvent(watcher.filePath));
        fsWatcher.on('rename', () => this.handleFileWatchEvent(watcher.filePath));
        fsWatcher.on('error', () => {
            this.closeFileWatcher(watcher);
            this.fileWatchers.delete(watcher.filePath);
            for (const clientId of watcher.clients) {
                this.clientWatcherFiles.delete(clientId);
            }
        });
        return watcher;
    }
    closeFileWatcher(watcher) {
        if (watcher.pending?.timer) {
            clearTimeout(watcher.pending.timer);
            watcher.pending.timer = null;
        }
        try {
            watcher.watcher.close();
        }
        catch {
            // noop
        }
    }
    isSuppressedHash(filePath, hash) {
        return this.suppressHashes.get(filePath)?.has(hash) === true;
    }
    handleFileWatchEvent(filePath) {
        const watcher = this.fileWatchers.get(filePath);
        if (!watcher) {
            return;
        }
        const now = Date.now();
        const snapshot = readCanvasFileSnapshot(filePath);
        if (snapshot && this.isSuppressedHash(filePath, snapshot.hash)) {
            watcher.lastProcessedHash = snapshot.hash;
            return;
        }
        if (!watcher.pending) {
            watcher.pending = {
                firstEventAt: now,
                lastEventAt: now,
                lastSeenHash: snapshot?.hash || null,
                timer: null,
            };
        }
        else {
            watcher.pending.lastEventAt = now;
            watcher.pending.lastSeenHash = snapshot?.hash || watcher.pending.lastSeenHash;
        }
        this.scheduleStableRefreshCheck(watcher);
    }
    scheduleStableRefreshCheck(watcher) {
        const pending = watcher.pending;
        if (!pending) {
            return;
        }
        if (pending.timer) {
            clearTimeout(pending.timer);
            pending.timer = null;
        }
        const now = Date.now();
        const quietDueAt = pending.lastEventAt + this.refreshQuietMs;
        const maxDueAt = pending.firstEventAt + this.refreshMaxWaitMs;
        const delay = Math.max(0, Math.min(quietDueAt, maxDueAt) - now);
        pending.timer = setTimeout(() => this.checkStableRefresh(watcher.filePath), delay);
        pending.timer.unref?.();
    }
    checkStableRefresh(filePath) {
        const watcher = this.fileWatchers.get(filePath);
        const pending = watcher?.pending;
        if (!watcher || !pending) {
            return;
        }
        pending.timer = null;
        const now = Date.now();
        const snapshot = readCanvasFileSnapshot(filePath);
        if (!snapshot) {
            watcher.pending = null;
            return;
        }
        if (this.isSuppressedHash(filePath, snapshot.hash)) {
            watcher.lastProcessedHash = snapshot.hash;
            watcher.pending = null;
            return;
        }
        if (pending.lastSeenHash && snapshot.hash !== pending.lastSeenHash && now < pending.firstEventAt + this.refreshMaxWaitMs) {
            pending.lastSeenHash = snapshot.hash;
            pending.lastEventAt = now;
            this.scheduleStableRefreshCheck(watcher);
            return;
        }
        const quietElapsed = now - pending.lastEventAt >= this.refreshQuietMs;
        const maxWaitElapsed = now - pending.firstEventAt >= this.refreshMaxWaitMs;
        if (!quietElapsed && !maxWaitElapsed) {
            this.scheduleStableRefreshCheck(watcher);
            return;
        }
        if (!isJsonParseable(snapshot.content)) {
            if (!maxWaitElapsed) {
                pending.lastSeenHash = snapshot.hash;
                pending.lastEventAt = now;
                this.scheduleStableRefreshCheck(watcher);
                return;
            }
            watcher.pending = null;
            return;
        }
        if (snapshot.hash === watcher.lastProcessedHash) {
            watcher.pending = null;
            return;
        }
        watcher.lastProcessedHash = snapshot.hash;
        watcher.pending = null;
        if (watcher.dirtyClients.size > 0) {
            watcher.deferredRefreshHash = snapshot.hash;
            return;
        }
        if (this.onExternalCanvasRefresh) {
            this.onExternalCanvasRefresh(watcher.canvasName, watcher.filePath);
            return;
        }
        this.requestRefresh(watcher.canvasName);
    }
    // ---- Low-level send helpers ----------------------------------------------
    sendToClient(client, msg) {
        try {
            client.socket.write(encodeFrame(JSON.stringify(msg)));
        }
        catch {
            this.removeClient(client.id);
        }
    }
    sendRawFrame(client, opcode, payload) {
        const len = payload.length;
        let header;
        if (len < 126) {
            header = Buffer.alloc(2);
            header[0] = 0x80 | opcode;
            header[1] = len;
        }
        else if (len < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x80 | opcode;
            header[1] = 126;
            header.writeUInt16BE(len, 2);
        }
        else {
            header = Buffer.alloc(10);
            header[0] = 0x80 | opcode;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(len), 2);
        }
        try {
            client.socket.write(Buffer.concat([header, payload]));
        }
        catch {
            this.removeClient(client.id);
        }
    }
}
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let hubInstance = null;
export function getCanvasBridgeHub() {
    if (!hubInstance) {
        hubInstance = new CanvasBridgeHub();
    }
    return hubInstance;
}
// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------
export const CANVAS_BRIDGE_WS_PATH = '/ws/canvas-bridge';
export function isCanvasBridgeUpgrade(req) {
    const pathname = (req.url || '/').split('?')[0];
    return pathname === CANVAS_BRIDGE_WS_PATH;
}
