import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vendorMocks = vi.hoisted(() => ({
  discoverWindowsApplicationPaths: vi.fn(() => []),
  getHostAdapter: vi.fn(),
  resolveApplicationPath: vi.fn(),
}));

vi.mock('../../vendor/agent-surface/dist/index.js', () => ({
  discoverWindowsApplicationPaths: vendorMocks.discoverWindowsApplicationPaths,
  getHostAdapter: vendorMocks.getHostAdapter,
}));

import { createAgentAvailabilityDetector } from './agentAvailability.ts';

const AGENT_SURFACE_APP_CASES = [
  { agent: 'codex', host: 'codex' },
  { agent: 'workbuddy', host: 'workbuddy' },
  { agent: 'traework', host: 'traework' },
  { agent: 'trae', host: 'trae' },
] as const;

beforeEach(() => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  vendorMocks.getHostAdapter.mockImplementation((host: string) => ({
    resolveApplicationPath: (platform: NodeJS.Platform, config: unknown) => (
      vendorMocks.resolveApplicationPath(host, platform, config)
    ),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('local app availability', () => {
  it.each(AGENT_SURFACE_APP_CASES)(
    'uses the agent-surface $host adapter to detect $agent on macOS',
    ({ agent, host }) => {
      const applicationPath = `/Applications/${host}.app/Contents/MacOS/App`;
      vendorMocks.resolveApplicationPath.mockReturnValue(applicationPath);
      const detector = createAgentAvailabilityDetector({
        platform: 'darwin',
        checkedAt: () => '2026-08-18T00:00:00.000Z',
      });

      expect(detector.detectLocalAppAgentAvailability(agent)).toMatchObject({
        status: 'installed',
        source: 'local-app-agent-application',
        path: applicationPath,
      });
      expect(vendorMocks.getHostAdapter).toHaveBeenCalledWith(host);
      expect(vendorMocks.resolveApplicationPath).toHaveBeenCalledWith(host, 'darwin', undefined);
    },
  );

  it.each(AGENT_SURFACE_APP_CASES)(
    'uses the same agent-surface $host adapter to detect $agent on Windows',
    ({ agent, host }) => {
      const applicationPath = `C:\\Apps\\${host}\\${host}.exe`;
      vendorMocks.resolveApplicationPath.mockReturnValue(applicationPath);
      const detector = createAgentAvailabilityDetector({
        platform: 'win32',
        checkedAt: () => '2026-08-18T00:00:00.000Z',
      });

      expect(detector.detectLocalAppAgentAvailability(agent)).toMatchObject({
        status: 'installed',
        path: applicationPath,
      });
      expect(vendorMocks.getHostAdapter).toHaveBeenCalledWith(host);
      expect(vendorMocks.resolveApplicationPath).toHaveBeenCalledWith(host, 'win32', undefined);
    },
  );

  it('reports a missing app when the shared adapter cannot resolve a path', () => {
    vendorMocks.resolveApplicationPath.mockReturnValue(undefined);
    const detector = createAgentAvailabilityDetector({
      platform: 'win32',
      checkedAt: () => '2026-08-18T00:00:00.000Z',
    });

    expect(detector.detectLocalAppAgentAvailability('traework')).toMatchObject({
      status: 'missing',
      source: 'local-app-agent-application',
    });
  });

  it('keeps OpenCode on Make-local detection because agent-surface has no adapter for it', () => {
    const applicationPath = '/Applications/OpenCode.app/Contents/MacOS/OpenCode';
    vi.mocked(fs.existsSync).mockImplementation((candidate) => String(candidate) === applicationPath);
    const detector = createAgentAvailabilityDetector({
      platform: 'darwin',
      checkedAt: () => '2026-08-18T00:00:00.000Z',
    });

    expect(detector.detectLocalAppAgentAvailability('opencode')).toMatchObject({
      status: 'installed',
      path: applicationPath,
    });
    expect(vendorMocks.getHostAdapter).not.toHaveBeenCalled();
  });
});
