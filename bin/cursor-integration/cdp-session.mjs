import {
  HOST_BINDING,
  parseHostRequest,
  responseExpression,
} from './host-protocol.mjs';

const COMMAND_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 5000;
const CURSOR_BROWSER_TIMEOUT_MS = 5000;
const CURSOR_BROWSER_POLL_INTERVAL_MS = 50;
const MAKE_URL = 'http://127.0.0.1:53817/?surface=codex';
const CURSOR_BROWSER_WEBVIEW_SELECTOR = 'webview[partition="persist:cursor-browser"]';
const CURSOR_BROWSER_TAB_SELECTOR = [
  '#tab-editor-panel-group-glass-flat-browser-new-tab',
  '[role="tab"][aria-controls$="glass-flat-browser-new-tab"]',
  '[role="tab"][id^="tab-editor-panel-group-browser-"]',
  '[role="tab"][aria-controls^="tabpanel-editor-panel-group-browser-"]',
].join(',');
const CURSOR_BROWSER_STATE_EXPRESSION = `(() => ({
  nativeBrowser: Boolean(document.querySelector(${JSON.stringify(CURSOR_BROWSER_WEBVIEW_SELECTOR)})),
  browserTab: Boolean(document.querySelector(${JSON.stringify(CURSOR_BROWSER_TAB_SELECTOR)})),
}))()`;
const OPEN_MAKE_EXPRESSION = `(() => {
  const webview = document.querySelector(${JSON.stringify(CURSOR_BROWSER_WEBVIEW_SELECTOR)});
  const tab = document.querySelector(${JSON.stringify(CURSOR_BROWSER_TAB_SELECTOR)});
  if (!webview || !tab) return false;
  webview.src = ${JSON.stringify(MAKE_URL)};
  ["pointerdown", "pointerup", "click"].forEach((type) => {
    tab.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: type === "pointerdown" ? 1 : 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }));
  });
  return true;
})()`;

export function browserShortcutForPlatform(platform) {
  if (platform === 'darwin') {
    return { modifiers: 12, nativeVirtualKeyCode: 11 };
  }
  if (platform === 'win32') {
    return { modifiers: 10, nativeVirtualKeyCode: 66 };
  }
  throw new Error('Cursor Browser integration supports macOS and Windows only');
}

function runtimeValue(result) {
  return result?.result?.value;
}

async function inspectCursorBrowser(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: CURSOR_BROWSER_STATE_EXPRESSION,
    returnByValue: true,
  });
  const value = runtimeValue(result);
  return {
    nativeBrowser: value?.nativeBrowser === true,
    browserTab: value?.browserTab === true,
  };
}

function browserReady(state) {
  return state.nativeBrowser && state.browserTab;
}

export async function openMakeInCursorBrowser(session, {
  platform = process.platform,
  timeoutMs = CURSOR_BROWSER_TIMEOUT_MS,
  pollIntervalMs = CURSOR_BROWSER_POLL_INTERVAL_MS,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!session || typeof session.command !== 'function') {
    throw new Error('CDP session is required');
  }
  await session.command('Page.bringToFront', {});
  let state = await inspectCursorBrowser(session);
  if (!browserReady(state)) {
    const shortcut = browserShortcutForPlatform(platform);
    const keyEvent = {
      modifiers: shortcut.modifiers,
      key: 'B',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      nativeVirtualKeyCode: shortcut.nativeVirtualKeyCode,
    };
    await session.command('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...keyEvent });
    await session.command('Input.dispatchKeyEvent', { type: 'keyUp', ...keyEvent });

    const deadline = Date.now() + timeoutMs;
    while (true) {
      state = await inspectCursorBrowser(session);
      if (browserReady(state)) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error('Unable to create Cursor built-in Browser');
      }
      await delay(Math.min(pollIntervalMs, remaining));
    }
  }

  const opened = runtimeValue(await session.command('Runtime.evaluate', {
    expression: OPEN_MAKE_EXPRESSION,
    returnByValue: true,
  }));
  if (opened !== true) {
    throw new Error('Unable to open Axhub Make in Cursor built-in Browser');
  }
}

function isExpectedDebuggerSocket(value, debugPort) {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:'
      && url.hostname === '127.0.0.1'
      && url.port === String(debugPort)
      && url.pathname.startsWith('/devtools/page/');
  } catch {
    return false;
  }
}

export async function listCursorTargets(debugPort, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`http://127.0.0.1:${debugPort}/json`, {
    signal: AbortSignal.timeout(1500),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('CDP target list must be an array');
  return targets.filter((target) => (
    typeof target?.id === 'string'
    && target.title === 'Cursor Agents'
    && target.type === 'page'
    && typeof target.url === 'string'
    && target.url.startsWith('vscode-file://vscode-app/')
    && target.url.includes('/workbench/workbench.html')
    && typeof target.webSocketDebuggerUrl === 'string'
    && isExpectedDebuggerSocket(target.webSocketDebuggerUrl, debugPort)
  ));
}

export class CdpSession {
  #WebSocketImpl;
  #closed = false;
  #connectTimeoutMs;
  #commandTimeoutMs;
  #handlers = new Map();
  #nextId = 0;
  #pending = new Map();
  #socket = null;
  #url;

  constructor(url, {
    WebSocketImpl = globalThis.WebSocket,
    commandTimeoutMs = COMMAND_TIMEOUT_MS,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
  } = {}) {
    if (typeof WebSocketImpl !== 'function') {
      throw new Error('WebSocket is unavailable; Node.js 22 or newer is required');
    }
    this.#url = url;
    this.#WebSocketImpl = WebSocketImpl;
    this.#commandTimeoutMs = commandTimeoutMs;
    this.#connectTimeoutMs = connectTimeoutMs;
  }

  async connect() {
    if (this.#socket) return this;
    const socket = new this.#WebSocketImpl(this.#url);
    this.#socket = socket;
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`CDP connection timed out for ${this.#url}`));
        }, this.#connectTimeoutMs);
        socket.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`Unable to connect to CDP target ${this.#url}`));
        };
      });
    } catch (error) {
      if (socket.readyState < 2) socket.close();
      this.#socket = null;
      throw error;
    }
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

export async function attachCursorTarget(target, {
  ensureMake,
  launcherSource,
  WebSocketImpl = globalThis.WebSocket,
  onClose = () => {},
  openMakeInBrowser = openMakeInCursorBrowser,
  platform = process.platform,
} = {}) {
  if (typeof ensureMake !== 'function') throw new Error('ensureMake callback is required');
  if (typeof launcherSource !== 'string' || !launcherSource.trim()) {
    throw new Error('launcher source is required');
  }
  const session = new CdpSession(target.webSocketDebuggerUrl, { WebSocketImpl });
  await session.connect();
  try {
    session.on('close', onClose);
    session.on('Runtime.bindingCalled', async (params) => {
      if (params.name !== HOST_BINDING) return;
      let id = '';
      let payload;
      try {
        const request = parseHostRequest(params.payload);
        id = request.id;
        const result = await ensureMake();
        await openMakeInBrowser(session, { platform });
        payload = { id, ok: true, reused: result.reused === true };
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
    await session.command('Page.addScriptToEvaluateOnNewDocument', { source: launcherSource });
    await session.command('Runtime.evaluate', { expression: launcherSource });
    return session;
  } catch (error) {
    session.close();
    throw error;
  }
}
