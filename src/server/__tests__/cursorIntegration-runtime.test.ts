import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  browserShortcutForPlatform,
  CdpSession,
  attachCursorTarget,
  listCursorTargets,
  openMakeInCursorBrowser,
} from '../../../bin/cursor-integration/cdp-session.mjs';
import {
  HOST_BINDING,
  parseHostRequest,
} from '../../../bin/cursor-integration/host-protocol.mjs';
import {
  createMakeEnsurer,
  probeMake,
  spawnMake,
} from '../../../bin/cursor-integration/make-runtime.mjs';
import {
  createCompanion,
  parseOptions,
  validateConfig,
} from '../../../bin/cursor-integration/companion.mjs';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: Array<{ id?: number; method?: string; params?: Record<string, unknown> }> = [];
  onopen?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(raw: string) {
    const message = JSON.parse(raw);
    this.sent.push(message);
    queueMicrotask(() => {
      this.onmessage?.({ data: JSON.stringify({ id: message.id, result: {} }) });
    });
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

class SetupFailingWebSocket extends FakeWebSocket {
  override send(raw: string) {
    const message = JSON.parse(raw);
    this.sent.push(message);
    queueMicrotask(() => {
      this.onmessage?.({ data: JSON.stringify({
        id: message.id,
        ...(message.method === 'Runtime.addBinding'
          ? { error: { message: 'binding unavailable' } }
          : { result: {} }),
      }) });
    });
  }
}

class NeverOpeningWebSocket {
  readyState = 0;
  onopen?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;

  constructor(url: string) {
    void url;
    FakeWebSocket.instances.push(this as unknown as FakeWebSocket);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const validConfig = {
  schemaVersion: 1,
  packageSpec: '@axhub/make@0.6.10',
  nodePath: '/usr/local/bin/node',
  npxCliPath: '/usr/local/lib/node_modules/npm/bin/npx-cli.js',
  debugPort: 9230,
  origin: 'http://127.0.0.1:53817',
  installedAt: '2026-08-06T00:00:00.000Z',
};

const cursorTarget = {
  id: 'cursor-agents',
  title: 'Cursor Agents',
  type: 'page',
  url: 'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html',
  webSocketDebuggerUrl: 'ws://127.0.0.1:9230/devtools/page/cursor-agents',
};

function runtimeValue(value: unknown) {
  return { result: { value } };
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
});

describe('Cursor host protocol and target attachment', () => {
  it('accepts only the fixed open-make action', () => {
    expect(parseHostRequest(JSON.stringify({ id: 'one', action: 'open-make' }))).toEqual({
      id: 'one',
      action: 'open-make',
    });
    expect(() => parseHostRequest(JSON.stringify({ id: 'old', action: 'ensure-make' }))).toThrow(/unsupported action/);
    expect(() => parseHostRequest(JSON.stringify({ id: 'two', action: 'run' }))).toThrow(/unsupported action/);
    expect(() => parseHostRequest(JSON.stringify({ action: 'open-make' }))).toThrow(/request id/);
  });

  it('maps the Cursor Browser shortcut for macOS and Windows only', () => {
    expect(browserShortcutForPlatform('darwin')).toEqual({
      modifiers: 12,
      nativeVirtualKeyCode: 11,
    });
    expect(browserShortcutForPlatform('win32')).toEqual({
      modifiers: 10,
      nativeVirtualKeyCode: 66,
    });
    expect(() => browserShortcutForPlatform('linux')).toThrow(/macOS and Windows/);
  });

  it('lists only Cursor Agents targets with loopback debugger sockets', async () => {
    const targets = await listCursorTargets(9230, vi.fn(async () => new Response(JSON.stringify([
      cursorTarget,
      { ...cursorTarget, id: 'normal-workbench', title: 'make-template' },
      { ...cursorTarget, id: 'web', url: 'https://example.com' },
      { ...cursorTarget, id: 'worker', type: 'worker' },
      { ...cursorTarget, id: 'missing', webSocketDebuggerUrl: undefined },
      { ...cursorTarget, id: 'external', webSocketDebuggerUrl: 'ws://example.com:9230/devtools/page/external' },
      { ...cursorTarget, id: 'wrong-port', webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/wrong' },
    ]), { status: 200 })));

    expect(targets.map((target: { id: string }) => target.id)).toEqual(['cursor-agents']);
  });

  it('reuses an existing Cursor Browser without sending its shortcut', async () => {
    let evaluation = 0;
    const command = vi.fn(async (method: string) => {
      if (method !== 'Runtime.evaluate') return {};
      evaluation += 1;
      return evaluation === 1
        ? runtimeValue({ nativeBrowser: true, browserTab: true })
        : runtimeValue(true);
    });

    await openMakeInCursorBrowser({ command }, { platform: 'darwin' });

    expect(command).toHaveBeenCalledWith('Page.bringToFront', {});
    expect(command).not.toHaveBeenCalledWith('Input.dispatchKeyEvent', expect.anything());
    expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      expression: expect.stringContaining('http://127.0.0.1:53817/?surface=codex'),
      returnByValue: true,
    }));
  });

  it('creates a missing Cursor Browser before navigating the fixed Make URL', async () => {
    const states = [
      { nativeBrowser: false, browserTab: false },
      { nativeBrowser: true, browserTab: true },
    ];
    let evaluation = 0;
    const command = vi.fn(async (method: string) => {
      if (method !== 'Runtime.evaluate') return {};
      const value = evaluation < states.length ? states[evaluation] : true;
      evaluation += 1;
      return runtimeValue(value);
    });

    await openMakeInCursorBrowser({ command }, {
      platform: 'darwin',
      pollIntervalMs: 0,
    });

    expect(command).toHaveBeenCalledWith('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      modifiers: 12,
      key: 'B',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      nativeVirtualKeyCode: 11,
    });
    expect(command).toHaveBeenCalledWith('Input.dispatchKeyEvent', expect.objectContaining({
      type: 'keyUp',
      modifiers: 12,
    }));
  });

  it('fails clearly when Cursor does not create its native Browser', async () => {
    const command = vi.fn(async (method: string) => method === 'Runtime.evaluate'
      ? runtimeValue({ nativeBrowser: false, browserTab: false })
      : {});

    await expect(openMakeInCursorBrowser({ command }, {
      platform: 'win32',
      timeoutMs: 0,
      pollIntervalMs: 0,
    })).rejects.toThrow(/Unable to create Cursor built-in Browser/);

    expect(command).toHaveBeenCalledWith('Input.dispatchKeyEvent', expect.objectContaining({
      type: 'rawKeyDown',
      modifiers: 10,
      nativeVirtualKeyCode: 66,
    }));
  });

  it('injects the launcher into current and future documents without bypassing CSP', async () => {
    const launcherSource = 'window.__axhubCursorLauncher = true;';
    const ensureMake = vi.fn(async () => ({ origin: validConfig.origin, reused: true }));
    const openMakeInBrowser = vi.fn(async () => {});
    const session = await attachCursorTarget(cursorTarget, {
      WebSocketImpl: FakeWebSocket,
      ensureMake,
      launcherSource,
      openMakeInBrowser,
      platform: 'darwin',
    });
    const socket = FakeWebSocket.instances[0];

    expect(socket.sent.slice(0, 5).map(({ method, params }) => ({ method, params }))).toEqual([
      { method: 'Page.enable', params: {} },
      { method: 'Runtime.enable', params: {} },
      { method: 'Runtime.addBinding', params: { name: HOST_BINDING } },
      { method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: launcherSource } },
      { method: 'Runtime.evaluate', params: { expression: launcherSource } },
    ]);
    expect(socket.sent.some((message) => message.method === 'Page.setBypassCSP')).toBe(false);

    socket.emit({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BINDING,
        payload: JSON.stringify({ id: 'one', action: 'open-make' }),
        executionContextId: 7,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const response = socket.sent.find((message) => (
      message.method === 'Runtime.evaluate' && message.params?.contextId === 7
    ));
    expect(openMakeInBrowser).toHaveBeenCalledWith(session, { platform: 'darwin' });
    expect(response?.params?.expression).toContain('\\"ok\\":true');
    expect(response?.params?.expression).toContain('\\"reused\\":true');
    session.close();
  });

  it('closes a connected socket when target setup fails', async () => {
    await expect(attachCursorTarget(cursorTarget, {
      WebSocketImpl: SetupFailingWebSocket,
      ensureMake: vi.fn(),
      launcherSource: 'window.__axhubCursorLauncher = true;',
    })).rejects.toThrow(/binding unavailable/);

    expect(FakeWebSocket.instances.at(-1)?.readyState).toBe(3);
  });

  it('times out and closes a debugger socket that never opens', async () => {
    const session = new CdpSession(cursorTarget.webSocketDebuggerUrl, {
      WebSocketImpl: NeverOpeningWebSocket,
      connectTimeoutMs: 1,
    });

    await expect(session.connect()).rejects.toThrow(/timed out/);
    expect(FakeWebSocket.instances.at(-1)?.readyState).toBe(3);
  });
});

describe('Cursor Make runtime', () => {
  it('accepts only the Axhub Make admin health response', async () => {
    await expect(probeMake(validConfig.origin, vi.fn(async () => new Response(
      JSON.stringify({ ok: true, role: 'admin' }),
      { status: 200 },
    )))).resolves.toBe(true);
    await expect(probeMake(validConfig.origin, vi.fn(async () => new Response(
      JSON.stringify({ ok: true, role: 'runtime' }),
      { status: 200 },
    )))).resolves.toBe(false);
  });

  it('spawns the exact package through Node and npx-cli without a shell', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });

    await spawnMake(validConfig, { spawnImpl });

    expect(spawnImpl).toHaveBeenCalledWith(validConfig.nodePath, [
      validConfig.npxCliPath,
      '--yes',
      '--package', '@axhub/make@0.6.10',
      'axhub-make',
      '--host', '127.0.0.1',
      '--port', '53817',
      '--no-open',
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  });

  it('shares one in-flight startup across clicks', async () => {
    let healthy = false;
    const spawnServer = vi.fn(async () => { healthy = true; });
    const ensureMake = createMakeEnsurer({
      origin: validConfig.origin,
      probe: vi.fn(async () => healthy),
      spawnServer,
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    expect(await Promise.all([ensureMake(), ensureMake()])).toEqual([
      { origin: validConfig.origin, reused: false },
      { origin: validConfig.origin, reused: false },
    ]);
    expect(spawnServer).toHaveBeenCalledOnce();
  });
});

describe('Cursor companion', () => {
  it('validates one absolute config path and fixed runtime values', () => {
    expect(parseOptions(['--config', '/tmp/Axhub Make/config.json'])).toEqual({
      configPath: '/tmp/Axhub Make/config.json',
    });
    expect(validateConfig(validConfig)).toEqual(validConfig);
    expect(() => validateConfig({ ...validConfig, debugPort: 9229 })).toThrow(/9230/);
    expect(() => validateConfig({ ...validConfig, packageSpec: '@axhub/make@latest' })).toThrow(/package spec/);
    expect(() => validateConfig({ ...validConfig, origin: 'https://example.com' })).toThrow(/loopback origin/);
  });

  it('attaches each live target once and closes stale sessions', async () => {
    let targets = [cursorTarget];
    const close = vi.fn();
    const attachTarget = vi.fn(async () => ({ close }));
    const companion = createCompanion(validConfig, {
      listTargets: vi.fn(async () => targets),
      attachTarget,
      makeEnsurer: vi.fn(() => vi.fn()),
      launcherSource: 'window.__axhubCursorLauncher = true;',
    });

    await companion.poll();
    await companion.poll();
    expect(attachTarget).toHaveBeenCalledOnce();
    targets = [];
    await companion.poll();
    expect(close).toHaveBeenCalledOnce();
  });
});
