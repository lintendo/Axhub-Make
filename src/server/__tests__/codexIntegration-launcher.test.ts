import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  closeCodexIntegrationGracefully,
  inspectCodexIntegration,
  openCodexIntegration,
} from '../codexIntegration/launcher.ts';
import { resolveCodexIntegrationPaths } from '../codexIntegration/paths.ts';

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

function fileSystemWith(...existing: string[]) {
  const paths = new Set(existing);
  return {
    access: vi.fn(async (filePath: string) => {
      if (!paths.has(filePath)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }),
  };
}

describe('official Codex launcher', () => {
  it('reuses a ready CDP target without launching another Codex process', async () => {
    const context = createMacContext({ probeTargets: vi.fn(async () => [codexTarget]) });

    await expect(openCodexIntegration(context)).resolves.toEqual({
      launched: false,
      reused: true,
      appPath: '/Applications/ChatGPT.app',
    });
    expect(context.launch).not.toHaveBeenCalled();
  });

  it('refuses to disturb a ChatGPT instance that was started without CDP', async () => {
    const context = createMacContext({ isCodexRunning: vi.fn(async () => true) });

    await expect(openCodexIntegration(context)).rejects.toThrow('ChatGPT is already running without Axhub CDP.');
    expect(context.launch).not.toHaveBeenCalled();
  });

  it('launches macOS ChatGPT with fixed CDP arguments and waits for an app target', async () => {
    const probeTargets = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([codexTarget]);
    const context = createMacContext({ probeTargets });
    const appPath = '/Applications/ChatGPT.app';

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

  it('launches the discovered Windows ChatGPT executable with the same fixed CDP arguments', async () => {
    const localAppData = String.raw`C:\Accounts\demo\AppData\Local`;
    const appPath = path.win32.join(localAppData, 'Programs', 'ChatGPT', 'ChatGPT.exe');
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

  it('inspects ready, running, client installation, and owned integration files independently', async () => {
    const paths = resolveCodexIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });

    await expect(inspectCodexIntegration(createMacContext({
      fileSystem: fileSystemWith(
        paths.chatgptCandidates[0],
        paths.configFile,
        paths.companionFile,
      ),
      probeTargets: vi.fn(async () => [codexTarget]),
      isCodexRunning: vi.fn(async () => false),
    }))).resolves.toEqual({
      platform: 'darwin',
      ready: true,
      running: false,
      installed: true,
      integrationInstalled: false,
      appPath: paths.chatgptCandidates[0],
    });

    await expect(inspectCodexIntegration(createMacContext({
      fileSystem: fileSystemWith(
        paths.configFile,
        paths.companionFile,
        paths.sidebarSourceFile,
      ),
      probeTargets: vi.fn(async () => []),
      isCodexRunning: vi.fn(async () => true),
    }))).resolves.toEqual({
      platform: 'darwin',
      ready: false,
      running: true,
      installed: false,
      integrationInstalled: true,
      appPath: '',
    });
  });

  it('requires the Axhub-owned Codex integration before launching', async () => {
    const paths = resolveCodexIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    const launch = vi.fn(async () => {});

    await expect(openCodexIntegration(createMacContext({
      fileSystem: fileSystemWith(
        paths.chatgptCandidates[0],
        paths.configFile,
        paths.companionFile,
      ),
      launch,
    }))).rejects.toThrow('codex install');
    expect(launch).not.toHaveBeenCalled();
  });

  it('asks for a manual quit if graceful ChatGPT close never observes exit', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await expect(closeCodexIntegrationGracefully(createMacContext({
      run,
      isCodexRunning: vi.fn(async () => true),
      maxAttempts: 2,
      retryDelayMs: 0,
    }))).rejects.toThrow('请手动退出后重试');
    expect(run).toHaveBeenCalledWith('osascript', [
      '-e', 'tell application id "com.openai.codex" to quit',
    ]);
  });
});
