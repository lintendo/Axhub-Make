import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildBackgroundServeArgs,
  inspectMakeService,
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
};

function createDependencies(overrides: Partial<MakeServiceDependencies> = {}): MakeServiceDependencies & {
  fetchHealth: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  spawnSync: ReturnType<typeof vi.fn>;
  unlinkSync: ReturnType<typeof vi.fn>;
} {
  return {
    readServerInfo: vi.fn(() => matchingInfo),
    getGlobalMakeStateDir: vi.fn(() => projectRoot),
    getGlobalAdminServerInfoPath: vi.fn(() => infoPath),
    fetchHealth: vi.fn(async () => ({ ok: true, role: 'admin', server: matchingInfo })),
    normalizeHealthServerInfo: vi.fn((value: unknown) => (value as { server?: typeof matchingInfo }).server || null),
    isProcessAlive: vi.fn(() => true),
    unlinkSync: vi.fn(),
    kill: vi.fn(),
    spawnSync: vi.fn(() => ({ status: 0 })),
    ...overrides,
  } as MakeServiceDependencies & {
    fetchHealth: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    spawnSync: ReturnType<typeof vi.fn>;
    unlinkSync: ReturnType<typeof vi.fn>;
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
    expect(dependencies.unlinkSync).toHaveBeenCalledWith(infoPath);
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
});
