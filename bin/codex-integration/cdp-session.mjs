import {
  HOST_BINDING,
  parseHostRequest,
  responseExpression,
} from './host-protocol.mjs';

const COMMAND_TIMEOUT_MS = 5000;

export async function listCodexTargets(debugPort, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`http://127.0.0.1:${debugPort}/json`, {
    signal: AbortSignal.timeout(1500),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('CDP target list must be an array');
  return targets.filter((target) => (
    typeof target?.id === 'string'
    && target.type === 'page'
    && typeof target.url === 'string'
    && target.url.startsWith('app://')
    && typeof target.webSocketDebuggerUrl === 'string'
    && target.webSocketDebuggerUrl.length > 0
  ));
}

export class CdpSession {
  #WebSocketImpl;
  #closed = false;
  #commandTimeoutMs;
  #handlers = new Map();
  #nextId = 0;
  #pending = new Map();
  #socket = null;
  #url;

  constructor(url, {
    WebSocketImpl = globalThis.WebSocket,
    commandTimeoutMs = COMMAND_TIMEOUT_MS,
  } = {}) {
    if (typeof WebSocketImpl !== 'function') {
      throw new Error('WebSocket is unavailable; Node.js 22 or newer is required');
    }
    this.#url = url;
    this.#WebSocketImpl = WebSocketImpl;
    this.#commandTimeoutMs = commandTimeoutMs;
  }

  async connect() {
    if (this.#socket) return this;
    const socket = new this.#WebSocketImpl(this.#url);
    this.#socket = socket;
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error(`Unable to connect to CDP target ${this.#url}`));
    });
    socket.onmessage = (event) => this.#receive(event.data);
    socket.onclose = () => this.#handleClose();
    return this;
  }

  on(method, handler) {
    this.#handlers.set(method, handler);
  }

  command(method, params = {}) {
    if (!this.#socket || this.#socket.readyState !== 1) {
      return Promise.reject(new Error('CDP session is not connected'));
    }
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP command ${method} timed out`));
      }, this.#commandTimeoutMs);
      this.#pending.set(id, { method, resolve, reject, timeout });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.#socket && this.#socket.readyState < 2) this.#socket.close();
    this.#handleClose();
    this.#socket = null;
  }

  #receive(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (Number.isInteger(message.id)) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(
          `CDP command ${pending.method} failed: ${message.error.message || 'unknown error'}`,
        ));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    const handler = this.#handlers.get(message.method);
    if (handler) Promise.resolve(handler(message.params || {})).catch(() => {});
  }

  #handleClose() {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`CDP session closed during ${pending.method}`));
    }
    this.#pending.clear();
    const handler = this.#handlers.get('close');
    if (handler) Promise.resolve(handler()).catch(() => {});
  }
}

export async function attachCodexTarget(target, {
  ensureMake,
  sidebarSource,
  WebSocketImpl = globalThis.WebSocket,
  onClose = () => {},
} = {}) {
  if (typeof ensureMake !== 'function') throw new Error('ensureMake callback is required');
  if (typeof sidebarSource !== 'string' || !sidebarSource.trim()) {
    throw new Error('sidebar source is required');
  }
  const session = new CdpSession(target.webSocketDebuggerUrl, { WebSocketImpl });
  await session.connect();
  session.on('close', onClose);
  session.on('Runtime.bindingCalled', async (params) => {
    if (params.name !== HOST_BINDING) return;
    let id = '';
    let payload;
    try {
      const request = parseHostRequest(params.payload);
      id = request.id;
      const result = await ensureMake();
      payload = { id, ok: true, ...result };
    } catch (error) {
      if (!id) {
        try {
          const raw = JSON.parse(params.payload);
          if (typeof raw?.id === 'string') id = raw.id;
        } catch {
          return;
        }
      }
      payload = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await session.command('Runtime.evaluate', {
      expression: responseExpression(payload),
      contextId: params.executionContextId,
    });
  });
  await session.command('Page.enable', {});
  await session.command('Runtime.enable', {});
  await session.command('Runtime.addBinding', { name: HOST_BINDING });
  await session.command('Page.addScriptToEvaluateOnNewDocument', { source: sidebarSource });
  await session.command('Runtime.evaluate', { expression: sidebarSource });
  return session;
}
