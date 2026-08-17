import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getConfigPath,
  getGlobalServerConfigPath,
  getMakeClientMarkerPath,
  getProjectMetadataPath,
  getProjectRegistryPath,
} from '../projectCore/index.ts';

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn((_file: string, _args: string[], optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (typeof callback === 'function') {
      callback(null, '', '');
    }
  }),
  spawn: vi.fn(() => {
    const child = {
      stderr: {
        on: vi.fn(),
        unref: vi.fn(),
      },
      once: vi.fn((event: string, callback: (...args: any[]) => void) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
        return child;
      }),
      unref: vi.fn(),
    };
    return child;
  }),
  spawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => childProcessMock);

vi.mock('../localCommand.ts', async (importActual) => {
  const actual = await importActual<typeof import('../localCommand.ts')>();
  return {
    ...actual,
    commandExists: vi.fn(async () => true),
    runLocalCommand: vi.fn(async (command: string, args: string[]) => ({
      stdout: '',
      stderr: '',
      command,
      escapedCommand: [command, ...args].join(' '),
    })),
  };
});

const { commandExists, runLocalCommand } = await import('../localCommand.ts');
const {
  resolveAssistantEndpointProbeTimeoutMs,
  resolveAssistantMakeCorsOrigins,
  resolveAssistantRuntime,
  runAssistantBootstrap,
} = await import('../assistantRuntime.ts');
const { startMakeServer } = await import('../index');
const { handleAssistantPromptIde } = await import('../managementApi.assistantIde.ts');

const commandExistsMock = vi.mocked(commandExists);
const runLocalCommandMock = vi.mocked(runLocalCommand);
type SpawnMockCall = [string, string[], any];

const tempRoots: string[] = [];
const healthServers: Server[] = [];
const originalAcpUiProjectRoot = process.env.AXHUB_ACP_UI_PROJECT_ROOT;
const originalCwd = process.cwd();

function createTempRoot(prefix = 'axhub-make-assistant-runtime-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeProjectConfig(projectRoot: string, value: unknown): void {
  writeJson(getConfigPath(projectRoot), value);
}

async function startAcpUiServer(options: {
  failFirstProbe?: boolean;
  cors?: boolean | string;
  runtime?: boolean;
} = {}) {
  let failedFirstProbe = false;
  let runtimeRequestCount = 0;
  const server = createServer((req, res) => {
    const origin = String(req.headers.origin || '');
    const corsOrigin = options.cors === true ? (origin || '*') : typeof options.cors === 'string' ? options.cors : '';
    const corsHeaders = corsOrigin ? {
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    } : {};
    if (req.url === '/') {
      if (options.failFirstProbe && !failedFirstProbe) {
        failedFirstProbe = true;
        res.writeHead(503, { 'content-type': 'text/plain', ...corsHeaders });
        res.end('starting');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html', ...corsHeaders });
      res.end('<!doctype html><title>ACP UI</title>');
      return;
    }
    if (req.url?.startsWith('/api/acp/runtime') && options.runtime) {
      runtimeRequestCount += 1;
      if (req.method === 'OPTIONS') {
        res.writeHead(options.cors ? 204 : 404, corsHeaders);
        res.end();
        return;
      }
      const address = server.address();
      const port = address && typeof address !== 'string' ? address.port : 0;
      const webBaseUrl = `http://127.0.0.1:${port}`;
      res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({
        service: { id: '@axhub/acp', name: 'Axhub ACP UI' },
        status: 'ready',
        port,
        hostname: '127.0.0.1',
        webBaseUrl,
        apiBaseUrl: `${webBaseUrl}/api`,
        corsOrigins: options.cors ? [corsOrigin || '*'] : [],
        startedAt: new Date().toISOString(),
      }));
      return;
    }
    if (req.url?.startsWith('/api/chat')) {
      if (options.failFirstProbe && !failedFirstProbe) {
        failedFirstProbe = true;
        res.writeHead(503, { 'content-type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'starting' }));
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(options.cors ? 204 : 404, corsHeaders);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ sessions: [] }));
      return;
    }
    res.writeHead(404).end();
  });
  healthServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start ACP UI test server');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    getRuntimeRequestCount: () => runtimeRequestCount,
  };
}

async function startRedirectingAssistantServer(redirectLocation: string) {
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(302, { location: redirectLocation });
      res.end();
      return;
    }
    res.writeHead(404).end();
  });
  healthServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start redirecting assistant test server');
  }
  return { origin: `http://127.0.0.1:${address.port}` };
}

function writeProjectMetadata(projectRoot: string, id = 'assistant-client') {
  writeMakeClientMarker(projectRoot, id);
  writeMakeClientPackage(projectRoot);
  writeJson(getProjectMetadataPath(projectRoot), {
    schemaVersion: 1,
    project: { id, name: 'Assistant Client' },
    resources: {
      prototypes: [],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: [], docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: { quickEdit: true, figmaExport: false, axureExport: false, multiDevicePreview: true },
  });
}

function writeMakeClientMarker(projectRoot: string, id: string, name = 'Assistant Client') {
  writeJson(getMakeClientMarkerPath(projectRoot), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
    project: { id, name },
  });
}

function writeMakeClientPackage(projectRoot: string) {
  writeJson(path.join(projectRoot, 'package.json'), {
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
}

function writeAcpUiCheckout(root: string) {
  writeJson(path.join(root, 'package.json'), {
    name: '@axhub/acp',
    scripts: {
      dev: 'next dev',
    },
  });
}

function useLocalAcpUiCheckout() {
  const root = createTempRoot('axhub-make-acp-ui-checkout-');
  writeAcpUiCheckout(root);
  process.env.AXHUB_ACP_UI_PROJECT_ROOT = root;
  return root;
}

const ACP_UI_DEFAULT_CORS_ORIGINS = [
  'http://localhost:53817',
  'http://127.0.0.1:53817',
  'chrome-extension://cndglokmgjecikflojjieeeajbljgfae',
  'chrome-extension://inmihdeflblgkefcngaljagdmhdkghka',
];

function expectAcpUiCorsArg(args: string[], makeOrigin: string) {
  const corsIndex = args.indexOf('--cors-origin');
  expect(corsIndex).toBeGreaterThanOrEqual(0);
  const origins = String(args[corsIndex + 1] || '').split(',').filter(Boolean);
  expect(origins).toEqual(Array.from(new Set([
    ...ACP_UI_DEFAULT_CORS_ORIGINS,
    new URL(makeOrigin).origin,
  ])));
}

function normalizeTestPath(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function expectAcpUiSpawn(params: {
  command: 'npm' | 'npx';
  port: string;
  cwd: string;
  makeOrigin: string;
}) {
  expect(childProcessMock.spawn).toHaveBeenCalled();
  const call = childProcessMock.spawn.mock.calls.at(-1) as unknown as SpawnMockCall | undefined;
  expect(call).toBeTruthy();
  const [command, args, options] = call!;
  expect(command).toBe(params.command);
  expect(args).toEqual(params.command === 'npm'
    ? expect.arrayContaining(['run', 'dev', '--', '--port', params.port, '--cors-origin'])
    : expect.arrayContaining(['-y', '@axhub/acp@latest', '--port', params.port, '--cors-origin']));
  expectAcpUiCorsArg(args, params.makeOrigin);
  expect(options.detached).toBe(true);
  expect(options.stdio).toBe('ignore');
  expect(normalizeTestPath(options.cwd)).toBe(normalizeTestPath(params.cwd));
}

async function startTestServer(projectRoot: string) {
  const registryHome = createTempRoot('axhub-make-assistant-runtime-registry-');
  const now = new Date().toISOString();
  writeJson(getProjectRegistryPath(registryHome), {
    schemaVersion: 1,
    activeProjectId: 'assistant-client',
    projects: [{
      id: 'assistant-client',
      name: 'Assistant Client',
      root: projectRoot,
      metadataPath: getProjectMetadataPath(projectRoot),
      createdAt: now,
      updatedAt: now,
    }],
  });
  const server = await startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: getProjectRegistryPath(registryHome),
  });
  return Object.assign(server, { registryHome });
}

function scopeAssistantApiUrl(origin: string, requestPath: string): string {
  const url = new URL(requestPath, origin);
  if (!url.searchParams.has('projectId')) {
    url.searchParams.set('projectId', 'assistant-client');
  }
  return url.toString();
}

function createLocalCommandResult(command: string, args: string[], stdout = '', stderr = '') {
  return {
    stdout,
    stderr,
    command,
    escapedCommand: [command, ...args].join(' '),
  };
}

beforeEach(() => {
  process.chdir(createTempRoot('axhub-make-assistant-runtime-cwd-'));
  delete process.env.AXHUB_ACP_UI_PROJECT_ROOT;
  commandExistsMock.mockReset();
  commandExistsMock.mockResolvedValue(true);
  runLocalCommandMock.mockReset();
  runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => (
    createLocalCommandResult(command, args)
  ));
});

afterEach(() => {
  vi.clearAllMocks();
  process.chdir(originalCwd);
  if (originalAcpUiProjectRoot === undefined) {
    delete process.env.AXHUB_ACP_UI_PROJECT_ROOT;
  } else {
    process.env.AXHUB_ACP_UI_PROJECT_ROOT = originalAcpUiProjectRoot;
  }
  for (const server of healthServers.splice(0)) {
    server.close();
  }
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveAssistantEndpointProbeTimeoutMs', () => {
  it('uses 15 seconds when Axhub Make is started with --dev', () => {
    expect(resolveAssistantEndpointProbeTimeoutMs({
      argv: ['node', 'src/server/cli.ts', '--', '--dev'],
    })).toBe(15_000);
  });

  it('uses 3 seconds outside Axhub Make development mode', () => {
    expect(resolveAssistantEndpointProbeTimeoutMs({
      argv: ['node', 'src/server/cli.ts'],
    })).toBe(3_000);
  });
});

describe('resolveAssistantMakeCorsOrigins', () => {
  it.each([
    'http://localhost:53817',
    'http://127.0.0.1:53817',
  ])('uses ACP defaults without an override for the default Make origin %s', (makeOrigin) => {
    expect(resolveAssistantMakeCorsOrigins(makeOrigin, { env: {} })).toBe('');
  });

  it('carries ACP defaults forward before adding a non-default Make origin', () => {
    expect(resolveAssistantMakeCorsOrigins('http://192.168.10.82:53817', { env: {} }))
      .toBe(`${ACP_UI_DEFAULT_CORS_ORIGINS.join(',')},http://192.168.10.82:53817`);
  });

  it('carries ACP defaults forward before explicit origins', () => {
    expect(resolveAssistantMakeCorsOrigins('http://localhost:53817', {
      env: {
        AXHUB_ACP_UI_CORS_ORIGIN: 'https://configured.example.com',
        ACP_UI_CORS_ORIGINS: 'https://second.example.com',
      },
    })).toBe(`${ACP_UI_DEFAULT_CORS_ORIGINS.join(',')},https://configured.example.com,https://second.example.com`);
  });
});

describe('assistant runtime process preservation', () => {
  it('keeps a responsive ACP UI running when auto-start detects missing CORS', async () => {
    const projectRoot = createTempRoot();
    const assistant = await startAcpUiServer();
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);

    try {
      const runtime = await resolveAssistantRuntime({
        projectPath: projectRoot,
        assistantConfig: {
          webBaseUrl: assistant.origin,
          apiBaseUrl: `${assistant.origin}/api`,
        },
        autoStart: true,
        makeOrigin: 'http://localhost:53817',
      });

      expect(runtime.health.status).toBe('runtime_unreachable');
      expect(runtime.health.message).toContain('为保留共享服务配置，Make 未自动重启');
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });

  it('reuses a responsive ACP UI when restart bootstrap is called repeatedly', async () => {
    const projectRoot = createTempRoot();
    const assistant = await startAcpUiServer({ cors: true });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);

    try {
      const runtime = await runAssistantBootstrap({
        mode: 'restart_existing',
        projectPath: projectRoot,
        assistantConfig: {
          webBaseUrl: assistant.origin,
          apiBaseUrl: `${assistant.origin}/api`,
        },
        makeOrigin: 'http://localhost:53817',
      });

      expect(runtime.health.status).toBe('ready');
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });
});

describe('make-server assistant runtime API', () => {
  it('exposes Assistant and IDE routes from their domain module', () => {
    expect(handleAssistantPromptIde).toBeTypeOf('function');
  });

  it('probes configured ACP UI through the page and chat endpoints without legacy health', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        projectPath: projectRoot,
        source: 'config',
        health: {
          status: 'ready',
          commandSource: 'config',
        },
        runtime: {
          available: true,
        },
      });
      expect(body.health.message).toContain('ACP UI');
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('uses ACP server runtime metadata when the configured ACP UI exposes it', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ cors: true, runtime: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        source: 'config',
        health: {
          status: 'ready',
        },
        runtime: {
          available: true,
        },
      });
      expect(assistant.getRuntimeRequestCount()).toBeGreaterThan(0);
      expect(body.health.message).toContain('server runtime');
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('probes configured ACP UI without auto-start by default', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ failFirstProbe: true, cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        projectPath: projectRoot,
        source: 'config',
        health: {
          status: 'runtime_unreachable',
          commandSource: 'config',
        },
        runtime: {
          available: false,
          code: 'assistant-runtime-unavailable',
        },
      });
      expect(body.health.message).toContain('ACP UI 未就绪');
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('auto-starts the local ACP UI checkout when explicitly requested and re-probes configured endpoints', async () => {
    const projectRoot = createTempRoot();
    const localAcpUiProjectRoot = useLocalAcpUiCheckout();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ failFirstProbe: true, cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();
      const assistantPort = new URL(assistant.origin).port;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        projectPath: projectRoot,
        source: 'config',
        health: {
          status: 'ready',
          commandSource: 'acp-ui',
        },
        runtime: {
          available: true,
        },
      });
      expectAcpUiSpawn({
        command: 'npm',
        port: assistantPort,
        cwd: localAcpUiProjectRoot,
        makeOrigin: server.origin,
      });
      const spawnCall = childProcessMock.spawn.mock.calls.at(-1) as unknown as SpawnMockCall | undefined;
      const spawnOptions = spawnCall?.[2] as any;
      expect(spawnOptions.env.ACP_UI_CORS_ORIGINS).toContain(server.origin);
      expect(spawnOptions.env.ACP_UI_CORS_ORIGINS).toContain(`http://localhost:${new URL(server.origin).port}`);
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('auto-discovers a sibling ACP UI checkout in development before falling back to npx', async () => {
    const workspaceRoot = createTempRoot('axhub-make-dev-workspace-');
    const makeRoot = path.join(workspaceRoot, 'Axhub Runtime', 'apps', 'axhub-make');
    const localAcpUiProjectRoot = path.join(workspaceRoot, 'acp-ui');
    fs.mkdirSync(makeRoot, { recursive: true });
    writeAcpUiCheckout(localAcpUiProjectRoot);
    process.chdir(makeRoot);

    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ failFirstProbe: true, cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();
      const assistantPort = new URL(assistant.origin).port;

      expect(response.status).toBe(200);
      expect(body.runtime.available).toBe(true);
      expectAcpUiSpawn({
        command: 'npm',
        port: assistantPort,
        cwd: localAcpUiProjectRoot,
        makeOrigin: server.origin,
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'npx',
        expect.any(Array),
        expect.any(Object),
      );
    } finally {
      await server.close();
    }
  });

  it('probes configured ACP UI without auto-start when requested', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        projectPath: projectRoot,
        source: 'config',
        health: {
          status: 'ready',
          commandSource: 'config',
        },
        runtime: {
          available: true,
        },
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('does not report ready when ACP UI does not allow the current Make origin through CORS', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer();
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        source: 'config',
        health: {
          status: 'runtime_unreachable',
          commandSource: 'config',
        },
        runtime: {
          available: false,
          code: 'assistant-runtime-unavailable',
        },
      });
      expect(body.health.message).toContain('跨域');
      expect(body.health.hints.start).toContain('--cors-origin');
      expect(body.health.hints.start).toContain(server.origin);
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('does not restart a responsive configured ACP endpoint when CORS is missing', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistantOrigin = 'http://localhost:32125';
    const assistantPort = Number(new URL(assistantOrigin).port);
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistantOrigin,
        apiBaseUrl: `${assistantOrigin}/api`,
      },
    });
    let portLookupCount = 0;
    childProcessMock.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'lsof' && args.includes(`-tiTCP:${assistantPort}`)) {
        portLookupCount += 1;
        return { stdout: portLookupCount === 1 ? '889\n' : '', stderr: '', status: 0 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
    const server = await startTestServer(projectRoot);
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (!requestUrl.startsWith(assistantOrigin)) {
        return realFetch(input, init);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      const headers = childProcessMock.spawn.mock.calls.length > 0
        ? {
          'access-control-allow-origin': server.origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        }
        : {};
      if (requestUrl === `${assistantOrigin}/api/acp/runtime`) {
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      if (requestUrl === `${assistantOrigin}/`) {
        return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
      }
      if (requestUrl === `${assistantOrigin}/api/chat` && method === 'OPTIONS') {
        return Promise.resolve(new Response(null, {
          status: childProcessMock.spawn.mock.calls.length > 0 ? 204 : 404,
          headers,
        }));
      }
      if (requestUrl === `${assistantOrigin}/api/chat`) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json', ...headers },
        }));
      }
      return Promise.resolve(new Response('', { status: 404, headers }));
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistantOrigin,
        apiBaseUrl: `${assistantOrigin}/api`,
        source: 'config',
        health: {
          status: 'runtime_unreachable',
          commandSource: 'config',
        },
        runtime: {
          available: false,
        },
      });
      expect(body.health.message).toContain('为保留共享服务配置，Make 未自动重启');
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      killSpy.mockRestore();
      await server.close();
    }
  });

  it('does not restart a responsive default ACP endpoint when CORS is missing', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    let portLookupCount = 0;
    childProcessMock.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'lsof' && args.includes('-tiTCP:32124')) {
        portLookupCount += 1;
        return { stdout: portLookupCount === 1 ? '890\n' : '', stderr: '', status: 0 };
      }
      if (command === 'lsof' && args.includes('-tiTCP:32125')) {
        return { stdout: '', stderr: '', status: 0 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
    const server = await startTestServer(projectRoot);
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (!requestUrl.startsWith('http://localhost:32124')) {
        return realFetch(input, init);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      const headers = childProcessMock.spawn.mock.calls.length > 0
        ? {
          'access-control-allow-origin': server.origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        }
        : {};

      if (requestUrl === 'http://localhost:32124/api/acp/runtime') {
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      if (requestUrl === 'http://localhost:32124/') {
        return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat' && method === 'OPTIONS') {
        return Promise.resolve(new Response(
          childProcessMock.spawn.mock.calls.length > 0 ? null : '',
          {
            status: childProcessMock.spawn.mock.calls.length > 0 ? 204 : 404,
            headers,
          },
        ));
      }
      if (requestUrl === 'http://localhost:32124/api/chat') {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json', ...headers },
        }));
      }
      return Promise.resolve(new Response('', { status: 404, headers }));
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
        source: 'default',
        health: {
          status: 'runtime_unreachable',
          commandSource: 'default',
        },
        runtime: {
          available: false,
        },
      });
      expect(body.health.message).toContain('为保留共享服务配置，Make 未自动重启');
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      killSpy.mockRestore();
      await server.close();
    }
  });

  it('auto-start releases and restarts the default ACP port when an unreachable process is listening', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    let portLookupCount = 0;
    childProcessMock.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'lsof' && args.includes('-tiTCP:32124')) {
        portLookupCount += 1;
        return { stdout: portLookupCount === 1 ? '891\n' : '', stderr: '', status: 0 };
      }
      if (command === 'lsof' && args.includes('-tiTCP:32125')) {
        return { stdout: '', stderr: '', status: 0 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
    const server = await startTestServer(projectRoot);
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (!requestUrl.startsWith('http://localhost:32124')) {
        return realFetch(input, init);
      }
      if (childProcessMock.spawn.mock.calls.length === 0) {
        return Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      }
      const method = String(init?.method || 'GET').toUpperCase();
      const headers = {
        'access-control-allow-origin': server.origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };

      if (requestUrl === 'http://localhost:32124/api/acp/runtime') {
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      if (requestUrl === 'http://localhost:32124/') {
        return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat' && method === 'OPTIONS') {
        return Promise.resolve(new Response(null, { status: 204, headers }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat') {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json', ...headers },
        }));
      }
      return Promise.resolve(new Response('', { status: 404, headers }));
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
        source: 'default',
        health: {
          status: 'ready',
          commandSource: 'acp-ui',
        },
        runtime: {
          available: true,
        },
      });
      expect(killSpy).toHaveBeenCalledWith(891, 'SIGTERM');
      expectAcpUiSpawn({
        command: 'npx',
        port: '32124',
        cwd: projectRoot,
        makeOrigin: server.origin,
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['32125']),
        expect.any(Object),
      );
    } finally {
      fetchSpy.mockRestore();
      killSpy.mockRestore();
      await server.close();
    }
  });

  it('falls back to the default ACP port when a persisted local fallback endpoint is unreachable', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const staleAssistantOrigin = 'http://127.0.0.1:57269';
    const server = await startTestServer(projectRoot);
    writeJson(getGlobalServerConfigPath(server.registryHome), {
      assistant: {
        webBaseUrl: staleAssistantOrigin,
        apiBaseUrl: `${staleAssistantOrigin}/api`,
      },
    });
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (requestUrl.startsWith(staleAssistantOrigin) || requestUrl.startsWith('http://localhost:32124')) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      return realFetch(input, init);
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`));
      const body = await response.json();
      const savedConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(server.registryHome), 'utf8'));

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
        source: 'default',
        health: {
          status: 'runtime_unreachable',
          commandSource: 'default',
        },
      });
      expect(body.webBaseUrl).not.toBe(staleAssistantOrigin);
      expect(body.health.message).toContain('32124');
      expect(savedConfig.assistant).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      await server.close();
    }
  });

  it('starts on the default ACP port when a persisted local fallback endpoint is stale and 32124 is free', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const staleAssistantOrigin = 'http://127.0.0.1:57269';
    childProcessMock.spawnSync.mockImplementation(() => ({ stdout: '', stderr: '', status: 0 }));
    const server = await startTestServer(projectRoot);
    writeJson(getGlobalServerConfigPath(server.registryHome), {
      assistant: {
        webBaseUrl: staleAssistantOrigin,
        apiBaseUrl: `${staleAssistantOrigin}/api`,
      },
    });
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (requestUrl.startsWith(staleAssistantOrigin)) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      if (requestUrl.startsWith('http://localhost:32124')) {
        if (childProcessMock.spawn.mock.calls.length === 0) {
          return Promise.reject(new TypeError('fetch failed'));
        }
        const method = String(init?.method || 'GET').toUpperCase();
        const headers = {
          'access-control-allow-origin': server.origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        };
        if (requestUrl === 'http://localhost:32124/api/acp/runtime') {
          return Promise.resolve(new Response('', { status: 404, headers }));
        }
        if (requestUrl === 'http://localhost:32124/') {
          return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
        }
        if (requestUrl === 'http://localhost:32124/api/chat' && method === 'OPTIONS') {
          return Promise.resolve(new Response(null, { status: 204, headers }));
        }
        if (requestUrl === 'http://localhost:32124/api/chat') {
          return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json', ...headers },
          }));
        }
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      return realFetch(input, init);
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();
      const savedConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(server.registryHome), 'utf8'));

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
        source: 'default',
        health: {
          status: 'ready',
          commandSource: 'acp-ui',
        },
        runtime: {
          available: true,
        },
      });
      expect(savedConfig.assistant).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
      });
      expectAcpUiSpawn({
        command: 'npx',
        port: '32124',
        cwd: projectRoot,
        makeOrigin: server.origin,
      });
    } finally {
      fetchSpy.mockRestore();
      await server.close();
    }
  });

  it('does not report ready when ACP UI redirects to an unreachable URL', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startRedirectingAssistantServer('http://127.0.0.1:1/');
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        source: 'config',
        health: {
          status: 'runtime_unreachable',
          commandSource: 'config',
        },
        runtime: {
          available: false,
          code: 'assistant-runtime-unavailable',
        },
      });
      expect(body.health.message).toContain('ACP UI 页面探测失败');
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('resolves assistant runtime from the explicitly selected project id', async () => {
    const activeProjectRoot = createTempRoot('axhub-make-assistant-runtime-active-');
    const selectedProjectRoot = createTempRoot('axhub-make-assistant-runtime-selected-');
    writeProjectMetadata(activeProjectRoot, 'active-assistant-client');
    writeProjectMetadata(selectedProjectRoot, 'selected-assistant-client');
    writeMakeClientMarker(selectedProjectRoot, 'selected-assistant-client', 'Selected Assistant Client');
    writeMakeClientPackage(selectedProjectRoot);
    const assistant = await startAcpUiServer({ cors: true });
    writeProjectConfig(activeProjectRoot, {
      assistant: {
        webBaseUrl: 'http://127.0.0.1:1',
        apiBaseUrl: 'http://127.0.0.1:1/api',
      },
    });
    writeProjectConfig(selectedProjectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const registryHome = createTempRoot('axhub-make-assistant-runtime-registry-');
    const server = await startMakeServer({
      projectRoot: activeProjectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(activeProjectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: selectedProjectRoot,
        }),
      });
      expect(registerResponse.status).toBe(201);

      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false&projectId=selected-assistant-client`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        projectId: 'selected-assistant-client',
        projectPath: selectedProjectRoot,
        projectRoot: selectedProjectRoot,
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        source: 'config',
        runtime: {
          available: true,
        },
      });
      expect(body.projectPath).not.toBe(activeProjectRoot);
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('auto-starts ACP UI through npx when explicitly requested and re-probes endpoints', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ failFirstProbe: true, cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();
      const assistantPort = new URL(assistant.origin).port;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
        projectPath: projectRoot,
        source: 'config',
        health: {
          status: 'ready',
          commandSource: 'acp-ui',
        },
        runtime: {
          available: true,
        },
      });
      expectAcpUiSpawn({
        command: 'npx',
        port: assistantPort,
        cwd: projectRoot,
        makeOrigin: server.origin,
      });
      expect(commandExistsMock).toHaveBeenCalledWith(
        'npx',
        expect.objectContaining({ timeoutMs: expect.any(Number) }),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('waits up to 120 seconds for slow npx cold starts before reporting ACP UI unavailable', async () => {
    vi.useFakeTimers();
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const makeOrigin = 'http://localhost:53123';
    const realFetch = globalThis.fetch.bind(globalThis);
    childProcessMock.spawnSync.mockReturnValue({ stdout: '', stderr: '', status: 0 });
    let endpointProbeCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (!requestUrl.startsWith('http://localhost:32124')) {
        return realFetch(input, init);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      const headers = {
        'access-control-allow-origin': makeOrigin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      endpointProbeCount += 1;
      const ready = endpointProbeCount >= 42;

      if (requestUrl === 'http://localhost:32124/api/acp/runtime') {
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      if (!ready) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      if (requestUrl === 'http://localhost:32124/') {
        return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat' && method === 'OPTIONS') {
        return Promise.resolve(new Response(null, { status: 204, headers }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat') {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json', ...headers },
        }));
      }
      return Promise.resolve(new Response('', { status: 404, headers }));
    });

    try {
      const runtimePromise = resolveAssistantRuntime({
        projectPath: projectRoot,
        autoStart: true,
        makeOrigin,
      });

      await vi.advanceTimersByTimeAsync(12_000);
      const runtime = await runtimePromise;

      expect(runtime.health.status).toBe('ready');
      expect(runtime.health.commandSource).toBe('acp-ui');
      expect(endpointProbeCount).toBeGreaterThanOrEqual(24);
      expectAcpUiSpawn({
        command: 'npx',
        port: '32124',
        cwd: projectRoot,
        makeOrigin,
      });
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('does not persist a fallback port when 32124 is occupied by an unreachable process', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    let portLookupCount = 0;
    childProcessMock.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'lsof' && args.includes('-tiTCP:32124')) {
        portLookupCount += 1;
        return { stdout: portLookupCount === 1 ? '777\n' : '', stderr: '', status: 0 };
      }
      if (command === 'lsof' && args.includes('-tiTCP:32125')) {
        return { stdout: '', stderr: '', status: 0 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const server = await startTestServer(projectRoot);
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (requestUrl.startsWith('http://localhost:32125')) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      if (requestUrl.startsWith('http://localhost:32124')) {
        if (childProcessMock.spawn.mock.calls.length === 0) {
          return Promise.reject(new TypeError('fetch failed'));
        }
        const method = String(init?.method || 'GET').toUpperCase();
        const headers = {
          'access-control-allow-origin': server.origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        };
        if (requestUrl === 'http://localhost:32124/api/acp/runtime') {
          return Promise.resolve(new Response('', { status: 404, headers }));
        }
        if (requestUrl === 'http://localhost:32124/') {
          return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
        }
        if (requestUrl === 'http://localhost:32124/api/chat' && method === 'OPTIONS') {
          return Promise.resolve(new Response(null, { status: 204, headers }));
        }
        if (requestUrl === 'http://localhost:32124/api/chat') {
          return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json', ...headers },
          }));
        }
      }
      return realFetch(input, init);
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=true`));
      const body = await response.json();
      const savedConfigPath = getGlobalServerConfigPath(server.registryHome);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
        source: 'default',
        health: {
          status: 'ready',
          commandSource: 'acp-ui',
        },
        runtime: {
          available: true,
        },
      });
      expect(fs.existsSync(savedConfigPath)).toBe(false);
      expectAcpUiSpawn({
        command: 'npx',
        port: '32124',
        cwd: projectRoot,
        makeOrigin: server.origin,
      });
      expect(killSpy).toHaveBeenCalledWith(777, 'SIGTERM');
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['32125']),
        expect.any(Object),
      );
      expect(childProcessMock.spawnSync).not.toHaveBeenCalledWith(
        'taskkill.exe',
        expect.any(Array),
        expect.any(Object),
      );
    } finally {
      killSpy.mockRestore();
      fetchSpy.mockRestore();
      await server.close();
    }
  });

  it('rewrites localhost assistant endpoints for LAN forwarded hosts', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin.replace('127.0.0.1', 'localhost'),
        apiBaseUrl: `${assistant.origin.replace('127.0.0.1', 'localhost')}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/runtime?autoStart=false`), {
        headers: { 'x-forwarded-host': '192.168.31.9:5174' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      const assistantPort = new URL(assistant.origin).port;
      expect(body).toMatchObject({
        webBaseUrl: `http://192.168.31.9:${assistantPort}`,
        apiBaseUrl: `http://192.168.31.9:${assistantPort}/api`,
        projectId: 'assistant-client',
        projectPath: projectRoot,
        source: 'config',
        runtime: {
          available: true,
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('reuses a healthy ACP UI for repeated assistant bootstrap calls', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistant = await startAcpUiServer({ cors: true });
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistant.origin,
        apiBaseUrl: `${assistant.origin}/api`,
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/bootstrap`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'start_existing' }),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        mode: 'start_existing',
        message: 'ACP UI 启动或复用检查已完成',
        runtime: {
          webBaseUrl: assistant.origin,
          apiBaseUrl: `${assistant.origin}/api`,
          projectPath: projectRoot,
          health: {
            status: 'ready',
          },
        },
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(runLocalCommandMock).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('does not restart a healthy ACP UI to repair a missing Make CORS origin', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
      },
    });
    let portLookupCount = 0;
    childProcessMock.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'lsof' && args.includes('-tiTCP:32124')) {
        portLookupCount += 1;
        return { stdout: portLookupCount === 1 ? '999\n' : '', stderr: '', status: 0 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
    const server = await startTestServer(projectRoot);
    const realFetch = globalThis.fetch.bind(globalThis);
    let corsProbeCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (!requestUrl.startsWith('http://localhost:32124')) {
        return realFetch(input, init);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      const readyHeaders = {
        'access-control-allow-origin': server.origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      const staleHeaders = {
        'access-control-allow-origin': 'http://127.0.0.1:53761',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      const headers = corsProbeCount >= 3 ? readyHeaders : staleHeaders;

      if (requestUrl === 'http://localhost:32124/api/acp/runtime') {
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      if (requestUrl === 'http://localhost:32124/') {
        return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat' && method === 'OPTIONS') {
        corsProbeCount += 1;
        return Promise.resolve(new Response(null, {
          status: 204,
          headers: corsProbeCount >= 3 ? readyHeaders : staleHeaders,
        }));
      }
      if (requestUrl === 'http://localhost:32124/api/chat') {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json', ...headers },
        }));
      }
      return Promise.resolve(new Response('', { status: 404, headers }));
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/bootstrap`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'restart_existing' }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        mode: 'restart_existing',
        runtime: {
          webBaseUrl: 'http://localhost:32124',
          apiBaseUrl: 'http://localhost:32124/api',
          health: {
            status: 'runtime_unreachable',
          },
          runtime: {
            available: false,
          },
        },
      });
      expect(body.runtime.health.message).toContain('为保留共享服务配置，Make 未自动重启');
      expect(corsProbeCount).toBe(1);
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      killSpy.mockRestore();
      await server.close();
    }
  });

  it('does not restart a healthy local configured ACP endpoint', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const assistantOrigin = 'http://localhost:32125';
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: assistantOrigin,
        apiBaseUrl: `${assistantOrigin}/api`,
      },
    });
    let portLookupCount = 0;
    childProcessMock.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'lsof' && args.includes('-tiTCP:32125')) {
        portLookupCount += 1;
        return { stdout: portLookupCount === 1 ? '888\n' : '', stderr: '', status: 0 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
    const server = await startTestServer(projectRoot);
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
      if (!requestUrl.startsWith(assistantOrigin)) {
        return realFetch(input, init);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      const headers = {
        'access-control-allow-origin': server.origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      if (requestUrl === `${assistantOrigin}/api/acp/runtime`) {
        return Promise.resolve(new Response('', { status: 404, headers }));
      }
      if (requestUrl === `${assistantOrigin}/`) {
        return Promise.resolve(new Response('<!doctype html><title>ACP UI</title>', { status: 200, headers }));
      }
      if (requestUrl === `${assistantOrigin}/api/chat` && method === 'OPTIONS') {
        return Promise.resolve(new Response(null, { status: 204, headers }));
      }
      if (requestUrl === `${assistantOrigin}/api/chat`) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json', ...headers },
        }));
      }
      return Promise.resolve(new Response('', { status: 404, headers }));
    });

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/bootstrap`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'restart_existing' }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        mode: 'restart_existing',
        runtime: {
          webBaseUrl: assistantOrigin,
          apiBaseUrl: `${assistantOrigin}/api`,
          health: {
            status: 'ready',
          },
          runtime: {
            available: true,
          },
        },
      });
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      killSpy.mockRestore();
      await server.close();
    }
  });

  it('rejects restart for a non-local ACP endpoint before releasing a port', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    writeProjectConfig(projectRoot, {
      assistant: {
        webBaseUrl: 'https://assistant.example.com',
        apiBaseUrl: 'https://assistant.example.com/api',
      },
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/bootstrap`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'restart_existing' }),
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'ASSISTANT_BOOTSTRAP_FAILED',
      });
      expect(body.error).toContain('本机');
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
      await server.close();
    }
  });

  it('rejects unsupported assistant bootstrap modes before spawning', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, `/api/assistant/bootstrap`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'bad-mode' }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'ASSISTANT_BOOTSTRAP_MODE_INVALID',
        projectId: 'assistant-client',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('returns 404 for the deleted prompt execute endpoint', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeAssistantApiUrl(server.origin, '/api/prompt/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'hello' }),
      });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toMatchObject({
        error: 'Not found',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
