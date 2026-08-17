import fs from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentAvailabilityDetector } from './agentAvailability.ts';

const DARWIN_APP_CASES = [
  {
    agent: 'traework',
    main: '/Applications/TRAE SOLO.app/Contents/MacOS/Electron',
    cn: '/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron',
  },
  {
    agent: 'qoderwork',
    main: '/Applications/QoderWork.app/Contents/MacOS/QoderWork',
    cn: '/Applications/QoderWork CN.app/Contents/MacOS/QoderWork CN',
  },
  {
    agent: 'trae',
    main: '/Applications/Trae.app/Contents/MacOS/Electron',
    cn: '/Applications/Trae CN.app/Contents/MacOS/Electron',
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('local app availability candidate order', () => {
  it('detects the current Codex.app executable before falling back to the Codex CLI', () => {
    const applicationPath = '/Applications/Codex.app/Contents/MacOS/ChatGPT';
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => String(candidate) === applicationPath);
    const spawnSync = vi.fn(() => ({ status: 1, stdout: '' }));
    const detector = createAgentAvailabilityDetector({
      platform: 'darwin',
      spawnSync,
      checkedAt: () => '2026-08-15T00:00:00.000Z',
    });

    expect(detector.detectLocalAppAgentAvailability('codex')).toMatchObject({
      status: 'installed',
      source: 'local-app-agent-application',
      path: applicationPath,
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.each(DARWIN_APP_CASES)('prefers the main $agent app when main and CN are installed', ({ agent, main, cn }) => {
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => {
      const path = String(candidate);
      return path === main || path === cn;
    });
    const spawnSync = vi.fn(() => ({ status: 1, stdout: '' }));
    const detector = createAgentAvailabilityDetector({
      platform: 'darwin',
      spawnSync,
      checkedAt: () => '2026-08-09T00:00:00.000Z',
    });

    const result = detector.detectLocalAppAgentAvailability(agent as any);

    expect(result).toMatchObject({
      status: 'installed',
      source: 'local-app-agent-application',
      path: main,
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.each(DARWIN_APP_CASES)('falls back to the CN $agent app when the main app is absent', ({ agent, cn }) => {
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => String(candidate) === cn);
    const detector = createAgentAvailabilityDetector({
      platform: 'darwin',
      spawnSync: vi.fn(() => ({ status: 1, stdout: '' })),
      checkedAt: () => '2026-08-09T00:00:00.000Z',
    });

    expect(detector.detectLocalAppAgentAvailability(agent as any)).toMatchObject({
      status: 'installed',
      path: cn,
    });
  });

  it.each([
    {
      agent: 'traework',
      main: 'C:/Users/demo/AppData/Local/Programs/TRAE SOLO/TRAE SOLO.exe',
      cn: 'C:/Users/demo/AppData/Local/Programs/TRAE SOLO CN/TRAE SOLO CN.exe',
    },
    {
      agent: 'qoderwork',
      main: 'C:/Users/demo/AppData/Local/Programs/QoderWork/QoderWork.exe',
      cn: 'C:/Users/demo/AppData/Local/Programs/QoderWork CN/QoderWork CN.exe',
    },
    {
      agent: 'trae',
      main: 'C:/Users/demo/AppData/Local/Programs/Trae/Trae.exe',
      cn: 'C:/Users/demo/AppData/Local/Programs/Trae CN/Trae CN.exe',
    },
  ] as const)('prefers the main Windows $agent executable before its CN fallback', ({ agent, main, cn }) => {
    vi.stubEnv('LOCALAPPDATA', 'C:/Users/demo/AppData/Local');
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => {
      const path = String(candidate);
      return path === main || path === cn;
    });
    const detector = createAgentAvailabilityDetector({
      platform: 'win32',
      spawnSync: vi.fn(() => ({ status: 1, stdout: '' })),
      checkedAt: () => '2026-08-09T00:00:00.000Z',
    });

    expect(detector.detectLocalAppAgentAvailability(agent as any)).toMatchObject({
      status: 'installed',
      path: main,
    });
  });
});
