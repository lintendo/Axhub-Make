import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeMakeCliAppId,
  openMakeCliApp,
  type MakeCliAppOpenDependencies,
} from './cliAppOpen.ts';

const temporaryDirectories: string[] = [];

function createStateDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-cli-app-'));
  temporaryDirectories.push(directory);
  return directory;
}

function readyInspection(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'darwin' as const,
    ready: true,
    running: true,
    installed: true,
    integrationInstalled: true,
    appPath: '/Applications/Cursor.app/Contents/MacOS/Cursor',
    ...overrides,
  };
}

function createDependencies(
  stateDirectory: string,
  overrides: MakeCliAppOpenDependencies = {},
): Required<Pick<MakeCliAppOpenDependencies,
  'inspectMakeAgentSurfaceHost' | 'closeMakeAgentSurfaceHost' | 'openMakeAgentSurface' | 'getGlobalMakeStateDir'>>
  & MakeCliAppOpenDependencies {
  return {
    inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection()),
    closeMakeAgentSurfaceHost: vi.fn(async () => {}),
    openMakeAgentSurface: vi.fn(async () => ({
      ok: true,
      code: 'surface-activated',
      message: 'opened',
      host: 'cursor' as const,
      entryId: 'axhub-make',
      reusedHost: true,
      startedCommand: false,
    })),
    getGlobalMakeStateDir: vi.fn(() => stateDirectory),
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CLI App open controller', () => {
  it('normalizes only qualified public App IDs', () => {
    expect(normalizeMakeCliAppId(' codex ')).toBe('codex');
    expect(normalizeMakeCliAppId('CURSOR')).toBe('cursor');
    expect(normalizeMakeCliAppId('workbuddy')).toBe('workbuddy');
    expect(normalizeMakeCliAppId('traework')).toBe('traework');
    expect(normalizeMakeCliAppId('qoderwork')).toBe('qoderwork');
    expect(normalizeMakeCliAppId('opencode')).toBeNull();
    expect(normalizeMakeCliAppId('trae')).toBeNull();
    expect(normalizeMakeCliAppId('unknown')).toBeNull();
    expect(normalizeMakeCliAppId(null)).toBeNull();
  });

  it('returns unsupported-app without inspecting an excluded App ID', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory);

    await expect(openMakeCliApp({
      app: 'opencode',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toEqual({
      ok: false,
      code: 'unsupported-app',
      message: 'opencode is not a supported Axhub Make App ID.',
    });
    expect(dependencies.inspectMakeAgentSurfaceHost).not.toHaveBeenCalled();
  });

  it('maps codex to ChatGPT and cold-launches through the activating one-shot surface open', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({
        ready: false,
        running: false,
        appPath: '/Applications/Codex.app/Contents/MacOS/Codex',
      })),
      openMakeAgentSurface: vi.fn(async () => ({
        ok: true,
        code: 'surface-activated',
        message: 'opened',
        host: 'codex' as const,
        entryId: 'axhub-make',
        reusedHost: false,
        startedCommand: true,
      })),
    });

    await expect(openMakeCliApp({
      app: 'codex',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'surface-opened',
      app: 'codex',
      provider: 'chatgpt',
      launched: true,
      reused: false,
    });
    expect(dependencies.openMakeAgentSurface).toHaveBeenCalledWith({
      provider: 'chatgpt',
      makeOrigin: 'http://127.0.0.1:53817',
      activate: true,
    });
  });

  it('reuses a CDP-ready App without closing it', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory);

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      code: 'surface-opened',
      launched: false,
      reused: true,
    });
    expect(dependencies.closeMakeAgentSurfaceHost).not.toHaveBeenCalled();
  });

  it('confirms an interactive restart before gracefully closing and reopening', async () => {
    const stateDirectory = createStateDirectory();
    const confirmRestart = vi.fn(async () => true);
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({ ready: false })),
      isInteractive: vi.fn(() => true),
      confirmRestart,
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({ ok: true, code: 'surface-opened' });
    expect(confirmRestart).toHaveBeenCalledWith({ app: 'cursor', provider: 'cursor' });
    expect(dependencies.closeMakeAgentSurfaceHost).toHaveBeenCalledOnce();
  });

  it('does not change the App when an interactive restart is declined', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({ ready: false })),
      isInteractive: vi.fn(() => true),
      confirmRestart: vi.fn(async () => false),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'restart-declined' });
    expect(dependencies.closeMakeAgentSurfaceHost).not.toHaveBeenCalled();
    expect(dependencies.openMakeAgentSurface).not.toHaveBeenCalled();
  });

  it('requires restart authorization in a non-interactive invocation', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({ ready: false })),
      isInteractive: vi.fn(() => false),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'restart-required' });
    expect(dependencies.closeMakeAgentSurfaceHost).not.toHaveBeenCalled();
  });

  it('honors explicit restart authorization without prompting', async () => {
    const stateDirectory = createStateDirectory();
    const confirmRestart = vi.fn(async () => false);
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({ ready: false })),
      isInteractive: vi.fn(() => false),
      confirmRestart,
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      restart: true,
    }, dependencies)).resolves.toMatchObject({ ok: true, code: 'surface-opened' });
    expect(confirmRestart).not.toHaveBeenCalled();
    expect(dependencies.closeMakeAgentSurfaceHost).toHaveBeenCalledOnce();
  });

  it('returns app-not-installed before attempting injection', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({
        ready: false,
        running: false,
        installed: false,
        appPath: '',
      })),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'app-not-installed' });
    expect(dependencies.openMakeAgentSurface).not.toHaveBeenCalled();
  });

  it('maps graceful-exit failure to app-exit-timeout', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({ ready: false })),
      closeMakeAgentSurfaceHost: vi.fn(async () => {
        throw new Error('应用未能自动退出，请手动退出后重试。');
      }),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      restart: true,
    }, dependencies)).resolves.toMatchObject({
      ok: false,
      code: 'app-exit-timeout',
      detail: '应用未能自动退出，请手动退出后重试。',
    });
  });

  it('passes appPath only through the current inspection, close, and open call', async () => {
    const stateDirectory = createStateDirectory();
    const appPath = '/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron';
    const dependencies = createDependencies(stateDirectory, {
      inspectMakeAgentSurfaceHost: vi.fn(async () => readyInspection({
        ready: false,
        appPath,
      })),
    });

    await openMakeCliApp({
      app: 'traework',
      makeOrigin: 'http://127.0.0.1:53817',
      appPath,
      restart: true,
    }, dependencies);

    expect(dependencies.inspectMakeAgentSurfaceHost).toHaveBeenCalledWith('traework', { appPath });
    expect(dependencies.closeMakeAgentSurfaceHost).toHaveBeenCalledWith('traework', { appPath });
    expect(dependencies.openMakeAgentSurface).toHaveBeenCalledWith({
      provider: 'traework',
      makeOrigin: 'http://127.0.0.1:53817',
      appPath,
      activate: true,
    });
  });

  it('maps a lower-level OpenResult failure to surface-injection-failed', async () => {
    const stateDirectory = createStateDirectory();
    const dependencies = createDependencies(stateDirectory, {
      openMakeAgentSurface: vi.fn(async () => ({
        ok: false,
        code: 'injection-failed',
        message: 'renderer rejected injection',
        host: 'cursor' as const,
        entryId: 'axhub-make',
      })),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }, dependencies)).resolves.toMatchObject({
      ok: false,
      code: 'surface-injection-failed',
      detail: 'renderer rejected injection',
      surfaceCode: 'injection-failed',
    });
  });

  it('releases its lock after failure so a later call can proceed', async () => {
    const stateDirectory = createStateDirectory();
    const openMakeAgentSurface = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: 'injection-failed',
        message: 'failed',
        host: 'cursor' as const,
      })
      .mockResolvedValueOnce({
        ok: true,
        code: 'surface-activated',
        message: 'opened',
        host: 'cursor' as const,
        reusedHost: true,
        startedCommand: false,
      });
    const dependencies = createDependencies(stateDirectory, { openMakeAgentSurface });

    await openMakeCliApp({ app: 'cursor', makeOrigin: 'http://127.0.0.1:53817' }, dependencies);
    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      lockTimeoutMs: 20,
      lockPollIntervalMs: 1,
    }, dependencies)).resolves.toMatchObject({ ok: true, code: 'surface-opened' });
    expect(fs.readdirSync(stateDirectory)).toEqual([]);
  });

  it('recovers an atomic lock whose owner process is dead', async () => {
    const stateDirectory = createStateDirectory();
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(path.join(stateDirectory, 'app-open-cursor.lock'), JSON.stringify({
      pid: 81234,
      acquiredAt: 100,
    }));
    const dependencies = createDependencies(stateDirectory, {
      isProcessAlive: vi.fn(() => false),
      now: vi.fn(() => 200),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      lockTimeoutMs: 20,
      lockPollIntervalMs: 1,
    }, dependencies)).resolves.toMatchObject({ ok: true, code: 'surface-opened' });
    expect(dependencies.isProcessAlive).toHaveBeenCalledWith(81234);
    expect(fs.readdirSync(stateDirectory)).toEqual([]);
  });

  it('recovers a dead contender claim before canonical acquisition', async () => {
    const stateDirectory = createStateDirectory();
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(stateDirectory, 'app-open-cursor.claim.1.81234.stale-owner.lock'),
      JSON.stringify({ pid: 81234, acquiredAt: 100, token: 'stale-owner', ticket: 1 }),
    );
    const dependencies = createDependencies(stateDirectory, {
      isProcessAlive: vi.fn((pid) => pid === process.pid),
      pid: process.pid,
      now: vi.fn(() => 200),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      lockTimeoutMs: 20,
      lockPollIntervalMs: 1,
    }, dependencies)).resolves.toMatchObject({ ok: true, code: 'surface-opened' });
    expect(dependencies.isProcessAlive).toHaveBeenCalledWith(81234);
    expect(fs.readdirSync(stateDirectory)).toEqual([]);
  });

  it('bounds waiting for a lock whose owner is still alive', async () => {
    const stateDirectory = createStateDirectory();
    fs.mkdirSync(stateDirectory, { recursive: true });
    const lockPath = path.join(stateDirectory, 'app-open-cursor.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 81235,
      acquiredAt: 100,
      token: 'live-owner',
    }));
    const sleep = vi.fn(async () => {});
    const dependencies = createDependencies(stateDirectory, {
      isProcessAlive: vi.fn(() => true),
      sleep,
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      lockTimeoutMs: 2,
      lockPollIntervalMs: 1,
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'app-open-lock-timeout' });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('does not bypass a live owner stranded in a quarantine lock', async () => {
    const stateDirectory = createStateDirectory();
    fs.mkdirSync(stateDirectory, { recursive: true });
    const quarantinePath = path.join(
      stateDirectory,
      'app-open-cursor.lock.dead-owner.quarantine',
    );
    fs.writeFileSync(quarantinePath, JSON.stringify({
      pid: 81236,
      acquiredAt: 200,
      token: 'live-owner',
    }));
    const dependencies = createDependencies(stateDirectory, {
      isProcessAlive: vi.fn(() => true),
      sleep: vi.fn(async () => {}),
    });

    await expect(openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      lockTimeoutMs: 2,
      lockPollIntervalMs: 1,
    }, dependencies)).resolves.toMatchObject({ ok: false, code: 'app-open-lock-timeout' });
    expect(dependencies.openMakeAgentSurface).not.toHaveBeenCalled();
    expect(fs.existsSync(quarantinePath)).toBe(true);
  });

  it('does not let a losing stale-owner recovery unlink a contender lock', async () => {
    const stateDirectory = createStateDirectory();
    const lockPath = path.join(stateDirectory, 'app-open-cursor.lock');
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 81236,
      acquiredAt: 100,
      token: 'dead-owner',
    }));
    const originalRenameSync = fs.renameSync;
    const originalUnlinkSync = fs.unlinkSync;
    let second: Promise<Awaited<ReturnType<typeof openMakeCliApp>>> | undefined;
    let activeOpens = 0;
    let maxActiveOpens = 0;
    const dependencies = createDependencies(stateDirectory, {
      isProcessAlive: vi.fn((pid) => pid === process.pid),
      pid: process.pid,
      now: vi.fn(() => 200),
      openMakeAgentSurface: vi.fn(async () => {
        activeOpens += 1;
        maxActiveOpens = Math.max(maxActiveOpens, activeOpens);
        await Promise.resolve();
        activeOpens -= 1;
        return {
          ok: true,
          code: 'surface-activated',
          message: 'opened',
          host: 'cursor' as const,
          entryId: 'axhub-make',
          reusedHost: true,
          startedCommand: false,
        };
      }),
    });
    const startSecond = () => {
      if (second) return;
      second = openMakeCliApp({
        app: 'cursor',
        makeOrigin: 'http://127.0.0.1:53817',
        lockTimeoutMs: 20,
        lockPollIntervalMs: 1,
      }, dependencies);
    };
    const renameSync = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      const result = originalRenameSync(source, destination);
      if (String(source) === lockPath) startSecond();
      return result;
    });
    const unlinkSync = vi.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
      if (String(target) === lockPath) startSecond();
      return originalUnlinkSync(target);
    });

    try {
      const first = openMakeCliApp({
        app: 'cursor',
        makeOrigin: 'http://127.0.0.1:53817',
        lockTimeoutMs: 20,
        lockPollIntervalMs: 1,
      }, dependencies);
      await vi.waitFor(() => expect(second).toBeDefined());
      await expect(Promise.all([first, second!])).resolves.toEqual([
        expect.objectContaining({ ok: true, code: 'surface-opened' }),
        expect.objectContaining({ ok: true, code: 'surface-opened' }),
      ]);
      expect(maxActiveOpens).toBe(1);
      expect(fs.readdirSync(stateDirectory)).toEqual([]);
    } finally {
      renameSync.mockRestore();
      unlinkSync.mockRestore();
    }
  });

  it('does not let a delayed stale claimant bypass a newer canonical lock', async () => {
    const stateDirectory = createStateDirectory();
    const lockPath = path.join(stateDirectory, 'app-open-cursor.lock');
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 81237,
      acquiredAt: 100,
      token: 'dead-owner',
    }));
    const originalReadFileSync = fs.readFileSync;
    const originalRenameSync = fs.renameSync;
    const originalUnlinkSync = fs.unlinkSync;
    let canonicalReads = 0;
    let staleQuarantines = 0;
    let second: Promise<Awaited<ReturnType<typeof openMakeCliApp>>> | undefined;
    let third: Promise<Awaited<ReturnType<typeof openMakeCliApp>>> | undefined;
    let activeOpens = 0;
    let maxActiveOpens = 0;
    let releaseOpens!: () => void;
    const opensMayFinish = new Promise<void>((resolve) => {
      releaseOpens = resolve;
    });
    const dependencies = createDependencies(stateDirectory, {
      isProcessAlive: vi.fn((pid) => pid === process.pid),
      pid: process.pid,
      now: vi.fn(() => 200),
      openMakeAgentSurface: vi.fn(async () => {
        activeOpens += 1;
        maxActiveOpens = Math.max(maxActiveOpens, activeOpens);
        await opensMayFinish;
        activeOpens -= 1;
        return {
          ok: true,
          code: 'surface-activated',
          message: 'opened',
          host: 'cursor' as const,
          entryId: 'axhub-make',
          reusedHost: true,
          startedCommand: false,
        };
      }),
    });
    const open = () => openMakeCliApp({
      app: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      lockTimeoutMs: 50,
      lockPollIntervalMs: 1,
    }, dependencies);
    const readFileSync = vi.spyOn(fs, 'readFileSync').mockImplementation((target, options) => {
      const result = originalReadFileSync(target, options as never);
      if (String(target) === lockPath && canonicalReads++ === 0) second = open();
      return result;
    });
    const renameSync = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      const result = originalRenameSync(source, destination);
      if (String(source) === lockPath && String(destination).endsWith('.dead-owner.quarantine')) {
        staleQuarantines += 1;
        if (staleQuarantines === 2) third = open();
      }
      return result;
    });
    const unlinkSync = vi.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
      const result = originalUnlinkSync(target);
      if (String(target) === lockPath && !third) third = open();
      return result;
    });

    try {
      const first = open();
      await vi.waitFor(() => expect(second).toBeDefined());
      await vi.waitFor(() => expect(third).toBeDefined());
      await vi.waitFor(() => expect(activeOpens).toBeGreaterThanOrEqual(1));
      await Promise.resolve();
      releaseOpens();
      await expect(Promise.all([first, second!, third!])).resolves.toEqual([
        expect.objectContaining({ ok: true, code: 'surface-opened' }),
        expect.objectContaining({ ok: true, code: 'surface-opened' }),
        expect.objectContaining({ ok: true, code: 'surface-opened' }),
      ]);
      expect(maxActiveOpens).toBe(1);
      expect(fs.readdirSync(stateDirectory)).toEqual([]);
    } finally {
      releaseOpens();
      readFileSync.mockRestore();
      renameSync.mockRestore();
      unlinkSync.mockRestore();
    }
  });
});
