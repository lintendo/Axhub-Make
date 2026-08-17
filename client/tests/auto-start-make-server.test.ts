import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>();
  return {
    ...actual,
    ...childProcessMock,
  };
});

import {
  getAdminServerInfoPath,
  writeServerInfo,
} from '../scripts/utils/serverInfo.mjs';

import {
  autoStartMakeServerPlugin,
  createAdminUrl,
  getReusableAdminOrigin,
  registerOfficialProject,
  resolveMakeServerStartCommand,
  startOrReuseMakeServer,
  waitForAdminOrigin,
} from '../vite-plugins/autoStartMakeServerPlugin';

const originalFetch = globalThis.fetch;
const tempRoots: string[] = [];
const originalMakeHomeDir = process.env.AXHUB_MAKE_HOME_DIR;

function createTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'make-project-auto-server-'));
  tempRoots.push(root);
  return root;
}

function createTempMakeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'make-project-auto-server-home-'));
  tempRoots.push(root);
  process.env.AXHUB_MAKE_HOME_DIR = root;
}

function writeClientMarker(projectRoot: string, project: { id?: string; name?: string }) {
  fs.mkdirSync(path.join(projectRoot, '.axhub', 'make'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, '.axhub', 'make', 'client.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
    project: {
      id: project.id ?? 'make-project',
      name: project.name ?? '',
    },
  }, null, 2), 'utf8');
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    return handler(url, init);
  }) as typeof fetch;
  return globalThis.fetch as ReturnType<typeof vi.fn>;
}

function readBody(init?: RequestInit) {
  return JSON.parse(String(init?.body || '{}'));
}

function createSpawnChild() {
  const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
  child.unref = vi.fn();
  child.on('error', () => {});
  return child;
}

beforeEach(() => {
  createTempMakeHome();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalMakeHomeDir === undefined) {
    delete process.env.AXHUB_MAKE_HOME_DIR;
  } else {
    process.env.AXHUB_MAKE_HOME_DIR = originalMakeHomeDir;
  }
  vi.restoreAllMocks();
  childProcessMock.spawn.mockReset();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('auto make-server registration', () => {
  it('registers a new official client project through the make-client registration API', async () => {
    const projectRoot = createTempProjectRoot();
    const calls: Array<{ pathname: string; method: string; body: any }> = [];
    mockFetch((url, init) => {
      calls.push({
        pathname: url.pathname,
        method: init?.method || 'GET',
        body: init?.body ? readBody(init) : null,
      });
      if (url.pathname === '/api/projects' && !init?.method) {
        return jsonResponse({ activeProjectId: null, projects: [] });
      }
      if (url.pathname === '/api/projects' && init?.method === 'POST') {
        return jsonResponse({
          error: 'Generic project registration is no longer supported. Register an official Make client project instead.',
          code: 'MAKE_CLIENT_PROJECT_REQUIRED',
        }, { status: 410 });
      }
      if (url.pathname === '/api/projects/make/register-existing' && init?.method === 'POST') {
        return jsonResponse({ project: { id: 'make-project' } }, { status: 201 });
      }
      return jsonResponse({ error: 'unexpected request' }, { status: 500 });
    });

    await expect(registerOfficialProject(projectRoot, 'http://localhost:5174'))
      .resolves
      .toEqual({ projectId: 'make-project', projectName: '' });

    expect(calls).toEqual([
      expect.objectContaining({ pathname: '/api/projects', method: 'GET' }),
      expect.objectContaining({
        pathname: '/api/projects/make/register-existing',
        method: 'POST',
        body: {
          root: projectRoot,
        },
      }),
    ]);
  });

  it('updates an existing root registration without switching active project', async () => {
    const projectRoot = createTempProjectRoot();
    const calls: Array<{ pathname: string; method: string; body: any }> = [];
    mockFetch((url, init) => {
      calls.push({
        pathname: url.pathname,
        method: init?.method || 'GET',
        body: init?.body ? readBody(init) : null,
      });
      if (url.pathname === '/api/projects' && !init?.method) {
        return jsonResponse({
          activeProjectId: 'other',
          projects: [
            {
              id: 'official-existing',
              name: 'Old Name',
              root: projectRoot,
              metadataPath: '/old/project.json',
            },
          ],
        });
      }
      if (url.pathname === '/api/projects/official-existing' && init?.method === 'PATCH') {
        return jsonResponse({ project: { id: 'official-existing' } });
      }
      return jsonResponse({ error: 'unexpected request' }, { status: 500 });
    });

    await expect(registerOfficialProject(projectRoot, 'http://localhost:5174'))
      .resolves
      .toEqual({ projectId: 'official-existing', projectName: '' });

    expect(calls).toEqual([
      expect.objectContaining({ pathname: '/api/projects', method: 'GET' }),
      expect.objectContaining({
        pathname: '/api/projects/official-existing',
        method: 'PATCH',
        body: {
          name: '',
          root: projectRoot,
          metadataPath: path.join(projectRoot, '.axhub/make/project.json'),
        },
      }),
    ]);
  });

  it('registers the canonical project name from client.json when the user named the project', async () => {
    const projectRoot = createTempProjectRoot();
    writeClientMarker(projectRoot, { id: 'sales-demo', name: 'Sales Demo' });
    const calls: Array<{ pathname: string; method: string; body: any }> = [];
    mockFetch((url, init) => {
      calls.push({
        pathname: url.pathname,
        method: init?.method || 'GET',
        body: init?.body ? readBody(init) : null,
      });
      if (url.pathname === '/api/projects' && !init?.method) {
        return jsonResponse({ activeProjectId: null, projects: [] });
      }
      if (url.pathname === '/api/projects/make/register-existing' && init?.method === 'POST') {
        return jsonResponse({ project: { id: 'sales-demo' } }, { status: 201 });
      }
      return jsonResponse({ error: 'unexpected request' }, { status: 500 });
    });

    await expect(registerOfficialProject(projectRoot, 'http://localhost:5174'))
      .resolves
      .toEqual({ projectId: 'sales-demo', projectName: 'Sales Demo' });

    expect(calls).toEqual([
      expect.objectContaining({ pathname: '/api/projects', method: 'GET' }),
      expect.objectContaining({
        pathname: '/api/projects/make/register-existing',
        method: 'POST',
        body: {
          root: projectRoot,
        },
      }),
    ]);
  });

  it('builds a default admin URL without selecting a project', () => {
    expect(createAdminUrl('http://localhost:5174'))
      .toBe('http://localhost:5174/');
    expect(createAdminUrl('http://localhost:5174/admin/index.html?x=1'))
      .toBe('http://localhost:5174/');
  });

  it('builds an admin URL with an explicit project selection only when requested', () => {
    expect(createAdminUrl('http://localhost:5174', 'make-project'))
      .toBe('http://localhost:5174/?projectId=make-project');
    expect(createAdminUrl('http://localhost:5174/admin/index.html?x=1', 'project with spaces'))
      .toBe('http://localhost:5174/?projectId=project+with+spaces');
  });

  it('returns a URL-selected admin URL when reusing a running make-server', async () => {
    const projectRoot = createTempProjectRoot();
    mockFetch((url, init) => {
      if (url.pathname === '/api/health') {
        return jsonResponse({
          ok: true,
          role: 'admin',
          projectRoot,
          capabilities: {
            reviewReports: true,
          },
          server: {
            pid: 12345,
            port: 5174,
            host: 'localhost',
            origin: 'http://localhost:5174',
            projectRoot,
            startedAt: '2026-05-03T00:01:00.000Z',
          },
        });
      }
      if (url.pathname === '/api/projects' && !init?.method) {
        return jsonResponse({ activeProjectId: 'other', projects: [] });
      }
      if (url.pathname === '/api/projects/make/register-existing' && init?.method === 'POST') {
        return jsonResponse({ project: { id: 'make-project' } }, { status: 201 });
      }
      return jsonResponse({ error: 'unexpected request' }, { status: 500 });
    });

    await expect(startOrReuseMakeServer(projectRoot))
      .resolves
      .toMatchObject({
        ready: true,
        adminOrigin: 'http://localhost:53817',
        adminUrl: 'http://localhost:53817/?projectId=make-project',
      });
  });

  it('falls back to npx when no monorepo make-server CLI exists', () => {
    const projectRoot = createTempProjectRoot();

    expect(resolveMakeServerStartCommand(projectRoot)).toEqual({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', '@axhub/make@latest', projectRoot, '--no-open'],
      label: 'npx -y @axhub/make@latest',
    });
  });

  it('passes the live runtime origin to the npx make-server fallback', () => {
    const projectRoot = createTempProjectRoot();

    expect(resolveMakeServerStartCommand(projectRoot, {
      runtimeOrigin: 'http://localhost:51720/',
    })).toEqual({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', '@axhub/make@latest', projectRoot, '--no-open', '--runtime-origin', 'http://localhost:51720'],
      label: 'npx -y @axhub/make@latest',
    });
  });

  it('starts the local standalone make-server in dev mode for admin HMR', () => {
    const workspaceRoot = createTempProjectRoot();
    const projectRoot = path.join(workspaceRoot, 'client');
    const cliPath = path.join(workspaceRoot, 'bin', 'cli.mjs');
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf8');
    fs.writeFileSync(cliPath, '#!/usr/bin/env node\n', 'utf8');

    expect(resolveMakeServerStartCommand(projectRoot)).toEqual({
      command: process.execPath,
      args: [cliPath, projectRoot, '--dev', '--no-open'],
      label: 'local @axhub/make dev',
    });
  });

  it('passes the live runtime origin to the local standalone make-server', () => {
    const workspaceRoot = createTempProjectRoot();
    const projectRoot = path.join(workspaceRoot, 'client');
    const cliPath = path.join(workspaceRoot, 'bin', 'cli.mjs');
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf8');
    fs.writeFileSync(cliPath, '#!/usr/bin/env node\n', 'utf8');

    expect(resolveMakeServerStartCommand(projectRoot, {
      runtimeOrigin: 'http://localhost:51720',
    })).toEqual({
      command: process.execPath,
      args: [
        cliPath,
        projectRoot,
        '--dev',
        '--no-open',
        '--runtime-origin',
        'http://localhost:51720',
      ],
      label: 'local @axhub/make dev',
    });
  });

  it('still supports the legacy monorepo make-server CLI location', () => {
    const workspaceRoot = createTempProjectRoot();
    const projectRoot = path.join(workspaceRoot, 'apps', 'make-project');
    const cliPath = path.join(workspaceRoot, 'apps', 'make-server', 'bin', 'cli.mjs');
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf8');
    fs.writeFileSync(cliPath, '#!/usr/bin/env node\n', 'utf8');

    expect(resolveMakeServerStartCommand(projectRoot)).toEqual({
      command: process.execPath,
      args: [cliPath, projectRoot, '--dev', '--no-open'],
      label: 'local @axhub/make dev',
    });
  });

  it('waits for slow local make-server startup before reporting unavailable', async () => {
    vi.useFakeTimers();
    const projectRoot = createTempProjectRoot();
    let attempts = 0;
    mockFetch((url) => {
      expect(url.pathname).toBe('/api/health');
      attempts += 1;
      if (attempts < 3) {
        throw new Error('connect ECONNREFUSED');
      }
      return jsonResponse({
        ok: true,
        role: 'admin',
        projectRoot,
        devMode: true,
        runtimeOrigin: 'http://localhost:51720',
        capabilities: {
          reviewReports: true,
        },
        server: {
          pid: 12345,
          port: 53817,
          host: 'localhost',
          origin: 'http://localhost:53817',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    const waitPromise = waitForAdminOrigin(projectRoot, {
      timeoutMs: 5000,
      pollIntervalMs: 500,
      healthTimeoutMs: 1,
    });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(waitPromise).resolves.toBe('http://localhost:53817');
    expect(attempts).toBe(3);
    vi.useRealTimers();
  });

  it('reuses a healthy admin when the legacy runtime origin points at another project', async () => {
    const projectRoot = createTempProjectRoot();
    const fetchMock = mockFetch((url) => {
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'admin',
        projectRoot,
        runtimeOrigin: 'http://localhost:51721',
        devMode: false,
        capabilities: { reviewReports: true },
        server: {
          pid: 12345,
          port: 5174,
          host: 'localhost',
          origin: 'http://localhost:5174',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBe('http://localhost:53817');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the same release admin for clients on two runtime ports', async () => {
    const projectRoot = createTempProjectRoot();
    const fetchMock = mockFetch((url) => {
      expect(url.origin).toBe('http://localhost:53817');
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'admin',
        origin: 'http://localhost:53817',
        devMode: false,
        capabilities: { reviewReports: true },
        server: {
          pid: 12345,
          port: 53817,
          host: 'localhost',
          origin: 'http://localhost:53817',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBe('http://localhost:53817');
    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBe('http://localhost:53817');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a client runtime that is listening on the default admin port', async () => {
    const projectRoot = createTempProjectRoot();
    const fetchMock = mockFetch((url) => {
      expect(url.origin).toBe('http://localhost:53817');
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'runtime',
        projectRoot,
        server: {
          pid: 12345,
          port: 53817,
          host: 'localhost',
          origin: 'http://localhost:53817',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse an otherwise healthy admin that lacks review report APIs', async () => {
    const projectRoot = createTempProjectRoot();
    const fetchMock = mockFetch((url) => {
      expect(url.origin).toBe('http://localhost:53817');
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'admin',
        projectRoot,
        devMode: true,
        runtimeOrigin: 'http://localhost:51720',
        server: {
          pid: 12345,
          port: 53817,
          host: 'localhost',
          origin: 'http://localhost:53817',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses a healthy release admin even when devMode is false', async () => {
    const projectRoot = createTempProjectRoot();
    const fetchMock = mockFetch((url) => {
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'admin',
        projectRoot,
        devMode: false,
        capabilities: { reviewReports: true },
        server: {
          pid: 12345,
          port: 5174,
          host: 'localhost',
          origin: 'http://localhost:5174',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBe('http://localhost:53817');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an error payload when the make-server spawn command is unavailable', async () => {
    const projectRoot = createTempProjectRoot();
    const child = createSpawnChild();
    childProcessMock.spawn.mockReturnValue(child);
    mockFetch((url) => {
      expect(url.pathname).toBe('/api/health');
      throw new Error('connect ECONNREFUSED');
    });

    const startPromise = startOrReuseMakeServer(projectRoot, {
      adminReadyTimeoutMs: 1,
      pollIntervalMs: 1,
      healthTimeoutMs: 1,
    });
    await vi.waitFor(() => expect(childProcessMock.spawn).toHaveBeenCalled());
    child.emit('error', Object.assign(new Error('spawn npx ENOENT'), {
      code: 'ENOENT',
      syscall: 'spawn npx',
    }));

    await expect(startPromise).resolves.toMatchObject({
      ready: false,
      error: 'spawn npx ENOENT',
    });
    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['-y', '@axhub/make@latest', projectRoot, '--no-open'],
      expect.objectContaining({
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
      }),
    );
    expect(child.unref).not.toHaveBeenCalled();
  });

  it('ignores stale admin server info when the saved origin is unavailable', async () => {
    const projectRoot = createTempProjectRoot();
    writeServerInfo(projectRoot, 'admin', {
      pid: 999999,
      port: 59999,
      host: 'localhost',
      origin: 'http://localhost:59999',
      projectRoot,
      startedAt: '2026-05-03T00:00:00.000Z',
    });
    const fetchMock = mockFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default admin origin when saved admin server info is stale', async () => {
    const projectRoot = createTempProjectRoot();
    writeServerInfo(projectRoot, 'admin', {
      pid: 999999,
      port: 5175,
      host: 'localhost',
      origin: 'http://localhost:5175',
      projectRoot,
      startedAt: '2026-05-03T00:00:00.000Z',
    });
    const fetchMock = mockFetch((url) => {
      if (url.origin === 'http://localhost:5175') {
        throw new Error('connect ECONNREFUSED');
      }
      expect(url.origin).toBe('http://localhost:53817');
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'admin',
        projectRoot,
        origin: 'http://localhost:53817',
        capabilities: {
          reviewReports: true,
        },
        server: {
          pid: 12345,
          port: 53817,
          host: 'localhost',
          origin: 'http://localhost:53817',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBe('http://localhost:53817');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses a live admin origin even when health server info reports a stale file entry', async () => {
    const projectRoot = createTempProjectRoot();
    writeServerInfo(projectRoot, 'admin', {
      pid: 999999,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-03T00:00:00.000Z',
    });
    mockFetch((url) => {
      expect(url.pathname).toBe('/api/health');
      return jsonResponse({
        ok: true,
        role: 'admin',
        origin: 'http://localhost:5174',
        projectRoot,
        capabilities: {
          reviewReports: true,
        },
        server: {
          pid: 888888,
          port: 5175,
          host: 'localhost',
          origin: 'http://localhost:5175',
          projectRoot,
          startedAt: '2026-05-03T00:01:00.000Z',
        },
      });
    });

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBe('http://localhost:5174');
  });

  it('treats malformed admin server info as unavailable and probes the default admin origin', async () => {
    const projectRoot = createTempProjectRoot();
    fs.mkdirSync(path.dirname(getAdminServerInfoPath(projectRoot)), { recursive: true });
    fs.writeFileSync(getAdminServerInfoPath(projectRoot), '{ stale', 'utf8');
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));

    await expect(getReusableAdminOrigin(projectRoot)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:53817/api/health');
  });

  it('surfaces a clear registration error when make-server project APIs are unavailable', async () => {
    const projectRoot = createTempProjectRoot();
    mockFetch((url) => {
      expect(url.pathname).toBe('/api/projects');
      return jsonResponse({ error: 'server unavailable' }, { status: 503 });
    });

    await expect(registerOfficialProject(projectRoot, 'http://localhost:5174'))
      .rejects
      .toThrow('GET /api/projects failed with 503');
  });

  it('does not auto-start make-server on Vite listening when the parent server already launched the client', () => {
    const previousSkip = process.env.AXHUB_MAKE_SKIP_AUTO_START_SERVER;
    process.env.AXHUB_MAKE_SKIP_AUTO_START_SERVER = '1';
    const server = {
      middlewares: { use: vi.fn() },
      httpServer: {
        address: vi.fn(() => ({ port: 51720 })),
        once: vi.fn(),
      },
      config: { server: { port: 51720 } },
    };

    try {
      (autoStartMakeServerPlugin().configureServer as any)(server);
    } finally {
      if (previousSkip === undefined) {
        delete process.env.AXHUB_MAKE_SKIP_AUTO_START_SERVER;
      } else {
        process.env.AXHUB_MAKE_SKIP_AUTO_START_SERVER = previousSkip;
      }
    }

    expect(server.middlewares.use).toHaveBeenCalledTimes(1);
    expect(server.httpServer.once).not.toHaveBeenCalled();
  });
});
