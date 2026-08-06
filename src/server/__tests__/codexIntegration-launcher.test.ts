import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { openCodexIntegration } from '../codexIntegration/launcher.ts';

const codexTarget = {
  id: 'codex',
  type: 'page',
  url: 'app://-/index.html',
  webSocketDebuggerUrl: 'ws://127.0.0.1/codex',
};

function createMacContext(overrides: Record<string, unknown> = {}) {
  const homeDir = '/tmp/demo';
  return {
    platform: 'darwin' as const,
    homeDir,
    env: {},
    fileSystem: { access: vi.fn(async () => {}) },
    run: vi.fn(async () => ({ stdout: '', stderr: '' })),
    launch: vi.fn(async () => {}),
    probeTargets: vi.fn(async () => []),
    isCodexRunning: vi.fn(async () => false),
    wait: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('official Codex launcher', () => {
  it('reuses a ready CDP target without launching another Codex process', async () => {
    const context = createMacContext({ probeTargets: vi.fn(async () => [codexTarget]) });

    await expect(openCodexIntegration(context)).resolves.toEqual({
      launched: false,
      reused: true,
      appPath: '',
    });
    expect(context.launch).not.toHaveBeenCalled();
  });

  it('refuses to disturb an official Codex instance that was started without CDP', async () => {
    const context = createMacContext({ isCodexRunning: vi.fn(async () => true) });

    await expect(openCodexIntegration(context)).rejects.toThrow(/quit Codex.*codex open/i);
    expect(context.launch).not.toHaveBeenCalled();
  });

  it('launches macOS Codex with fixed CDP arguments and waits for an app target', async () => {
    const probeTargets = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([codexTarget]);
    const context = createMacContext({ probeTargets });
    const appPath = '/Applications/Codex.app';

    await expect(openCodexIntegration(context)).resolves.toEqual({
      launched: true,
      reused: false,
      appPath,
    });
    expect(context.launch).toHaveBeenCalledWith('open', [
      '-n', appPath, '--args',
      '--remote-debugging-port=9229',
      '--remote-allow-origins=http://127.0.0.1:9229',
    ]);
  });

  it('launches the discovered Windows executable with the same fixed CDP arguments', async () => {
    const localAppData = String.raw`C:\Accounts\demo\AppData\Local`;
    const appPath = path.win32.join(localAppData, 'Programs', 'Codex', 'Codex.exe');
    const launch = vi.fn(async () => {});
    const probeTargets = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([codexTarget]);

    await expect(openCodexIntegration({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: { LOCALAPPDATA: localAppData },
      fileSystem: { access: vi.fn(async () => {}) },
      run: vi.fn(async () => ({ stdout: '', stderr: '' })),
      launch,
      probeTargets,
      isCodexRunning: vi.fn(async () => false),
      wait: vi.fn(async () => {}),
    })).resolves.toEqual({ launched: true, reused: false, appPath });

    expect(launch).toHaveBeenCalledWith(appPath, [
      '--remote-debugging-port=9229',
      '--remote-allow-origins=http://127.0.0.1:9229',
    ]);
  });

  it('reports a CDP readiness timeout after launching instead of opening a second app', async () => {
    const context = createMacContext({ maxAttempts: 2, retryDelayMs: 0 });

    await expect(openCodexIntegration(context)).rejects.toThrow(/did not expose.*CDP/i);
    expect(context.launch).toHaveBeenCalledOnce();
    expect(context.wait).toHaveBeenCalledOnce();
  });
});
