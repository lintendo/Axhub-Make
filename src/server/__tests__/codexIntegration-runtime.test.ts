import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachCodexTarget,
  listCodexTargets,
} from '../../../bin/codex-integration/cdp-session.mjs';
import {
  HOST_BINDING,
  parseHostRequest,
  responseExpression,
} from '../../../bin/codex-integration/host-protocol.mjs';
import {
  createMakeEnsurer,
  probeMake,
  spawnMake,
} from '../../../bin/codex-integration/make-runtime.mjs';
import {
  createCompanion,
  parseOptions,
  validateConfig,
} from '../../../bin/codex-integration/companion.mjs';

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

const validConfig = {
  schemaVersion: 1,
  packageSpec: '@axhub/make@0.6.10',
  nodePath: '/usr/local/bin/node',
  npxCliPath: '/usr/local/lib/node_modules/npm/bin/npx-cli.js',
  debugPort: 9229,
  origin: 'http://127.0.0.1:53817',
  installedAt: '2026-08-05T00:00:00.000Z',
};

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
});

describe('Codex++ host protocol', () => {
  it('accepts only ensure-make with an id and serializes responses as data', () => {
    expect(parseHostRequest(JSON.stringify({ id: 'request-1', action: 'ensure-make' }))).toEqual({
      id: 'request-1',
      action: 'ensure-make',
    });
    expect(() => parseHostRequest(JSON.stringify({
      id: 'request-2',
      action: 'run',
      command: 'whoami',
    }))).toThrow(/unsupported action/);
    expect(() => parseHostRequest('{"action":"ensure-make"}')).toThrow(/request id/);

    const expression = responseExpression({
      id: 'request-1',
      ok: true,
      origin: 'http://127.0.0.1:53817',
    });
    expect(expression).toMatch(/axhub-make:host-response/);
    expect(expression).not.toMatch(/eval\(/);
  });
});

describe('Codex CDP attachment', () => {
  it('lists only app page targets with debugger sockets', async () => {
    const targets = await listCodexTargets(9229, vi.fn(async () => new Response(JSON.stringify([
      { id: 'codex', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1/codex' },
      { id: 'browser', type: 'page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1/browser' },
      { id: 'worker', type: 'worker', url: 'app://-/worker.js', webSocketDebuggerUrl: 'ws://127.0.0.1/worker' },
      { id: 'missing', type: 'page', url: 'app://-/index.html' },
    ]), { status: 200 })));

    expect(targets.map((target: { id: string }) => target.id)).toEqual(['codex']);
  });

  it('injects the sidebar into current and future renderers before replying through the fixed binding', async () => {
    const sidebarSource = 'window.__axhubMakeSidebarSource = true;';
    const session = await attachCodexTarget({
      id: 'codex',
      type: 'page',
      url: 'app://-/index.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1/codex',
    }, {
      WebSocketImpl: FakeWebSocket,
      ensureMake: vi.fn(async () => ({ origin: validConfig.origin, reused: true })),
      sidebarSource,
    });
    const socket = FakeWebSocket.instances[0];

    expect(socket.sent.slice(0, 5).map(({ method, params }) => ({ method, params }))).toEqual([
      { method: 'Page.enable', params: {} },
      { method: 'Runtime.enable', params: {} },
      { method: 'Runtime.addBinding', params: { name: HOST_BINDING } },
      { method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: sidebarSource } },
      { method: 'Runtime.evaluate', params: { expression: sidebarSource } },
    ]);
    expect(socket.sent.some((message) => message.method === 'Page.setBypassCSP')).toBe(false);

    socket.emit({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BINDING,
        payload: JSON.stringify({ id: 'request-1', action: 'ensure-make' }),
        executionContextId: 42,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const response = socket.sent.find((message) => (
      message.method === 'Runtime.evaluate' && message.params?.contextId === 42
    ));
    expect(response?.params?.contextId).toBe(42);
    expect(response?.params?.expression).toMatch(/127\.0\.0\.1:53817/);
    session.close();
  });
});

describe('Axhub Make runtime startup', () => {
  it('accepts only the Axhub Make admin health response', async () => {
    const healthyFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, role: 'admin' }), { status: 200 }));
    const wrongFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, role: 'runtime' }), { status: 200 }));

    await expect(probeMake(validConfig.origin, healthyFetch)).resolves.toBe(true);
    await expect(probeMake(validConfig.origin, wrongFetch)).resolves.toBe(false);
  });

  it('spawns the exact package through Node and npx-cli without a shell', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });

    await spawnMake(validConfig, { spawnImpl });

    expect(spawnImpl).toHaveBeenCalledWith('/usr/local/bin/node', [
      '/usr/local/lib/node_modules/npm/bin/npx-cli.js',
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
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('shares one in-flight start across concurrent sidebar clicks', async () => {
    let healthy = false;
    const spawnServer = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      healthy = true;
    });
    const ensureMake = createMakeEnsurer({
      origin: validConfig.origin,
      probe: vi.fn(async () => healthy),
      spawnServer,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    const [first, second] = await Promise.all([ensureMake(), ensureMake()]);

    expect(first).toEqual({ origin: validConfig.origin, reused: false });
    expect(second).toEqual(first);
    expect(spawnServer).toHaveBeenCalledOnce();
  });
});

describe('companion configuration', () => {
  it('accepts one absolute config path and rejects mutable runtime surfaces', () => {
    expect(parseOptions(['--config', '/tmp/Axhub Make/config.json'])).toEqual({
      configPath: '/tmp/Axhub Make/config.json',
    });
    expect(() => parseOptions(['--config', '/tmp/config.json', '--command', 'whoami'])).toThrow(/unknown option/);
    expect(validateConfig(validConfig)).toEqual(validConfig);
    expect(() => validateConfig({ ...validConfig, packageSpec: '@axhub/make@latest' })).toThrow(/package spec/);
    expect(() => validateConfig({ ...validConfig, origin: 'https://example.com' })).toThrow(/loopback origin/);
  });

  it('treats CDP timeouts and closed loopback sockets as an idle Codex state', async () => {
    const errors: unknown[] = [];
    const ensureMake = vi.fn();
    const makeEnsurer = vi.fn(() => ensureMake);
    for (const error of [
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
      new TypeError('fetch failed', { cause: Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' }) }),
    ]) {
      const companion = createCompanion(validConfig, {
        listTargets: vi.fn(async () => { throw error; }),
        makeEnsurer,
        sidebarSource: 'window.__axhubMakeSidebarSource = true;',
        onError: (value: unknown) => errors.push(value),
      });
      await expect(companion.poll()).resolves.toBeUndefined();
    }
    expect(errors).toEqual([]);
  });

  it('passes one installed sidebar source to every newly attached target', async () => {
    const sidebarSource = 'window.__axhubMakeSidebarSource = true;';
    const close = vi.fn();
    const attachTarget = vi.fn(async (_target: unknown, _options: { sidebarSource: string }) => ({ close }));
    const companion = createCompanion(validConfig, {
      listTargets: vi.fn(async () => [{
        id: 'codex',
        type: 'page',
        url: 'app://-/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1/codex',
      }]),
      attachTarget,
      makeEnsurer: vi.fn(() => vi.fn()),
      sidebarSource,
    });

    await companion.poll();
    await companion.poll();

    expect(attachTarget).toHaveBeenCalledOnce();
    expect(attachTarget.mock.calls[0]?.[1]).toMatchObject({ sidebarSource });
  });
});
