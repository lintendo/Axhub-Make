import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildBackgroundServeArgs,
  inspectMakeService,
  startMakeServiceInBackground,
  stopMakeService,
  type MakeServiceDependencies,
} from './makeServiceLifecycle.ts';

const homeDir = path.join(path.sep, 'tmp', 'make-home');
const projectRoot = path.join(homeDir, '.axhub', 'make');
const infoPath = path.join(projectRoot, '.admin-server-info.json');
const matchingInfo = {
  pid: 421,
  port: 53817,
  host: '127.0.0.1',
  origin: 'http://127.0.0.1:53817',
  projectRoot,
  startedAt: '2026-08-14T00:00:00.000Z',
  timestamp: '2026-08-14T00:00:00.000Z',
};

function createDependencies(overrides: Partial<MakeServiceDependencies> = {}): MakeServiceDependencies & {
  fetchHealth: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  spawnSync: ReturnType<typeof vi.fn>;
  unlinkSync: ReturnType<typeof vi.fn>;
  removeOwnedServerInfoFile: ReturnType<typeof vi.fn>;
} {
  return {
    readServerInfo: vi.fn(() => matchingInfo),
    getGlobalMakeStateDir: vi.fn(() => projectRoot),
    getGlobalAdminServerInfoPath: vi.fn(() => infoPath),
    fetchHealth: vi.fn(async () => ({ ok: true, role: 'admin', server: matchingInfo })),
    normalizeHealthServerInfo: vi.fn((value: unknown) => (value as { server?: typeof matchingInfo }).server || null),
    isProcessAlive: vi.fn(() => true),
    unlinkSync: vi.fn(),
    removeOwnedServerInfoFile: vi.fn(() => true),
    kill: vi.fn(),
    spawnSync: vi.fn(() => ({ status: 0 })),
    ...overrides,
  } as MakeServiceDependencies & {
    fetchHealth: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    spawnSync: ReturnType<typeof vi.fn>;
    unlinkSync: ReturnType<typeof vi.fn>;
    removeOwnedServerInfoFile: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Make Admin service inspection', () => {
  it('reports running only for a live matching Admin health identity', async () => {
    const dependencies = createDependencies();

    await expect(inspectMakeService({ homeDir }, dependencies)).resolves.toMatchObject({
      status: 'running',
      info: matchingInfo,
    });
  });

  it('reports stopped when no global Admin record exists', async () => {
    const dependencies = createDependencies({ readServerInfo: vi.fn(() => null) });

    await expect(inspectMakeService({ homeDir }, dependencies)).resolves.toMatchObject({
      status: 'stopped',
    });
    expect(dependencies.fetchHealth).not.toHaveBeenCalled();
  });

  it.each([
    ['dead PID', { isProcessAlive: vi.fn(() => false) }],
    ['wrong health role', { fetchHealth: vi.fn(async () => ({ ok: true, role: 'runtime', server: matchingInfo })) }],
    ['mismatched health origin', {
      fetchHealth: vi.fn(async () => ({
        ok: true,
        role: 'admin',
        server: { ...matchingInfo, origin: 'http://127.0.0.1:53818' },
      })),
    }],
    ['mismatched health host', {
      fetchHealth: vi.fn(async () => ({
        ok: true,
        role: 'admin',
        server: { ...matchingInfo, host: 'localhost' },
      })),
    }],
    ['mismatched health start time', {
      fetchHealth: vi.fn(async () => ({
        ok: true,
        role: 'admin',
        server: { ...matchingInfo, startedAt: '2026-08-14T00:01:00.000Z' },
      })),
    }],
    ['mismatched health timestamp', {
      fetchHealth: vi.fn(async () => ({
        ok: true,
        role: 'admin',
        server: { ...matchingInfo, timestamp: '2026-08-14T00:01:00.000Z' },
      })),
    }],
  ])('reports stale for a %s identity', async (_name, overrides) => {
    const dependencies = createDependencies(overrides);

    await expect(inspectMakeService({ homeDir }, dependencies)).resolves.toMatchObject({
      status: 'stale',
    });
  });
});

describe('Make Admin service stop', () => {
  it('is idempotent when the service is stopped', async () => {
    const dependencies = createDependencies({ readServerInfo: vi.fn(() => null) });

    await expect(stopMakeService({ homeDir }, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'make-stopped',
    });
    expect(dependencies.kill).not.toHaveBeenCalled();
  });

  it('refuses to signal an identity-mismatched service', async () => {
    const dependencies = createDependencies({
      fetchHealth: vi.fn(async () => ({ ok: true, role: 'runtime', server: matchingInfo })),
    });

    await expect(stopMakeService({ homeDir }, dependencies)).resolves.toMatchObject({
      ok: false,
      code: 'server-identity-mismatch',
    });
    expect(dependencies.kill).not.toHaveBeenCalled();
  });

  it('does not remove a replacement record while cleaning up a dead service', async () => {
    const replacementInfo = {
      ...matchingInfo,
      pid: matchingInfo.pid + 1,
      startedAt: '2026-08-14T00:01:00.000Z',
    };
    const dependencies = createDependencies({
      readServerInfo: vi.fn()
        .mockReturnValueOnce(matchingInfo)
        .mockReturnValueOnce(matchingInfo)
        .mockReturnValueOnce(replacementInfo),
      isProcessAlive: vi.fn(() => false),
    });

    await expect(stopMakeService({ homeDir }, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'make-stopped',
    });
    expect(dependencies.removeOwnedServerInfoFile).toHaveBeenCalledWith(infoPath, matchingInfo);
    expect(dependencies.unlinkSync).not.toHaveBeenCalled();
  });

  it('gracefully signals a re-verified matching POSIX service', async () => {
    const alive = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const dependencies = createDependencies({ isProcessAlive: alive });

    await expect(stopMakeService({ homeDir, platform: 'darwin', pollIntervalMs: 0 }, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'make-stopped',
    });
    expect(dependencies.kill).toHaveBeenCalledWith(matchingInfo.pid, 'SIGTERM');
    expect(dependencies.removeOwnedServerInfoFile).toHaveBeenCalledWith(infoPath, matchingInfo);
    expect(dependencies.unlinkSync).not.toHaveBeenCalled();
  });

  it('uses non-forced taskkill arguments on Windows', async () => {
    const alive = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const dependencies = createDependencies({ isProcessAlive: alive });

    await expect(stopMakeService({ homeDir, platform: 'win32', pollIntervalMs: 0 }, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'make-stopped',
    });
    expect(dependencies.spawnSync).toHaveBeenCalledWith('taskkill.exe', ['/PID', String(matchingInfo.pid)], expect.objectContaining({
      shell: false,
    }));
    expect(dependencies.spawnSync.mock.calls[0]?.[1]).not.toContain('/F');
  });
});

describe('background Make service arguments', () => {
  it('constructs one serve-only invocation and forwards only server options', () => {
    expect(buildBackgroundServeArgs({
      args: [
        'open', 'cursor', '--background', '--json', '--app-path', '/Applications/Cursor.app', '--restart',
        '--port', '6123', '--host', '127.0.0.1', '--runtime-origin', 'http://127.0.0.1:5173',
        '--admin-root', '/tmp/admin', '--axhub-online-base-url', 'https://axhub.im', '--no-open',
      ],
    })).toEqual([
      'serve', '--port', '6123', '--host', '127.0.0.1', '--runtime-origin', 'http://127.0.0.1:5173',
      '--admin-root', '/tmp/admin', '--axhub-online-base-url', 'https://axhub.im', '--no-open',
    ]);
  });

  it('re-executes a self-contained Bun binary without its virtual entry path', async () => {
    let inheritedClaimWasLive = false;
    const spawn = vi.fn((_command: string, _args: string[], spawnOptions: any) => {
      const claimPath = spawnOptions.env?.AXHUB_MAKE_START_GATE_CLAIM;
      inheritedClaimWasLive = typeof claimPath === 'string' && fs.existsSync(claimPath);
      return { unref: vi.fn() };
    });
    const isPortAvailable = vi.fn(async () => true);
    const dependencies = createDependencies({
      readServerInfo: vi.fn()
        .mockReturnValueOnce(null)
        .mockReturnValue(matchingInfo),
      getGlobalMakeServiceLogPath: vi.fn(() => path.join(projectRoot, 'make.log')),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 17),
      closeSync: vi.fn(),
      spawn: spawn as any,
      isPortAvailable,
    } as any);

    await expect(startMakeServiceInBackground({
      homeDir,
      args: ['--background', '--port', '6123'],
      entryPath: '/$bunfs/root/axhub-make',
      selfContainedExecutable: true,
      port: 6123,
    } as any, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'make-started',
    });

    expect(spawn).toHaveBeenCalledWith(process.execPath, [
      'serve', '--port', '6123', '--no-open',
    ], expect.objectContaining({ detached: true, shell: false }));
    expect(isPortAvailable).toHaveBeenCalledWith('0.0.0.0', 6123);
    expect(inheritedClaimWasLive).toBe(true);
  });

  it('reports an occupied non-Make port before spawning a background child', async () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }));
    const dependencies = createDependencies({
      readServerInfo: vi.fn(() => null),
      getGlobalMakeServiceLogPath: vi.fn(() => path.join(projectRoot, 'make.log')),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 17),
      closeSync: vi.fn(),
      spawn: spawn as any,
      isPortAvailable: vi.fn(async () => false),
      now: vi.fn(() => 0),
    } as any);

    await expect(startMakeServiceInBackground({
      homeDir,
      args: ['--background', '--host', '127.0.0.1', '--port', '6123'],
      entryPath: '/tmp/cli.mjs',
      host: '127.0.0.1',
      port: 6123,
      startTimeoutMs: 0,
    } as any, dependencies)).resolves.toMatchObject({
      ok: false,
      code: 'make-port-occupied',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports a port race when the detached child exits before readiness', async () => {
    const spawn = vi.fn(() => ({
      unref: vi.fn(),
      once: vi.fn((event: string, listener: (code: number) => void) => {
        if (event === 'exit') listener(1);
      }),
    }));
    const isPortAvailable = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const dependencies = createDependencies({
      readServerInfo: vi.fn(() => null),
      getGlobalMakeServiceLogPath: vi.fn(() => path.join(projectRoot, 'make.log')),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 17),
      closeSync: vi.fn(),
      spawn: spawn as any,
      isPortAvailable,
      sleep: vi.fn(async () => {}),
    } as any);

    await expect(startMakeServiceInBackground({
      homeDir,
      entryPath: '/tmp/cli.mjs',
      host: '127.0.0.1',
      port: 6123,
      startTimeoutMs: 100,
    }, dependencies)).resolves.toMatchObject({
      ok: false,
      code: 'make-port-occupied',
    });
    expect(isPortAvailable).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent background starts and reuses the winning service', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-start-gate-'));
    const stateDirectory = path.join(root, '.axhub', 'make');
    let currentInfo: typeof matchingInfo | null = null;
    const spawn = vi.fn(() => {
      currentInfo = { ...matchingInfo, projectRoot: stateDirectory };
      return { unref: vi.fn() };
    });
    const dependencies = createDependencies({
      readServerInfo: vi.fn(() => currentInfo),
      getGlobalMakeStateDir: vi.fn(() => stateDirectory),
      getGlobalAdminServerInfoPath: vi.fn(() => path.join(stateDirectory, '.admin-server-info.json')),
      getGlobalMakeServiceLogPath: vi.fn(() => path.join(stateDirectory, 'make.log')),
      fetchHealth: vi.fn(async () => ({ ok: true, role: 'admin', server: currentInfo })),
      normalizeHealthServerInfo: vi.fn((value: unknown) => (value as { server?: typeof matchingInfo }).server || null),
      mkdirSync: vi.fn(),
      openSync: vi.fn(() => 17),
      closeSync: vi.fn(),
      spawn: spawn as any,
      isPortAvailable: vi.fn(async () => true),
      sleep: vi.fn(async () => {}),
    } as any);

    try {
      const options = {
        homeDir: root,
        entryPath: '/tmp/cli.mjs',
        port: 53817,
        pollIntervalMs: 1,
        startTimeoutMs: 20,
      } as any;
      await expect(Promise.all([
        startMakeServiceInBackground(options, dependencies),
        startMakeServiceInBackground(options, dependencies),
      ])).resolves.toEqual([
        expect.objectContaining({ ok: true }),
        expect.objectContaining({ ok: true }),
      ]);
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
