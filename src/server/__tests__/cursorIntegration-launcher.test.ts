import { describe, expect, it, vi } from 'vitest';

import {
  CURSOR_DEBUG_PORT,
  CURSOR_REMOTE_ALLOW_ORIGINS,
  closeCursorIntegrationGracefully,
  inspectCursorIntegration,
  openCursorIntegration,
} from '../cursorIntegration/launcher.ts';
import { resolveCursorIntegrationPaths } from '../cursorIntegration/paths.ts';

const cursorTarget = {
  id: 'cursor-agents',
  title: 'Cursor Agents',
  type: 'page',
  url: 'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html',
  webSocketDebuggerUrl: 'ws://127.0.0.1:9230/devtools/page/cursor-agents',
};

function fileSystemWith(...existing: string[]) {
  const paths = new Set(existing);
  return {
    access: vi.fn(async (filePath: string) => {
      if (!paths.has(filePath)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }),
  };
}

function fileSystemWithInstalledIntegration(
  paths: ReturnType<typeof resolveCursorIntegrationPaths>,
  appPath: string,
) {
  return fileSystemWith(
    appPath,
    paths.configFile,
    paths.companionFile,
    paths.launcherSourceFile,
  );
}

describe('Cursor CDP launcher', () => {
  it('uses a distinct fixed loopback CDP port', () => {
    expect(CURSOR_DEBUG_PORT).toBe(9230);
    expect(CURSOR_REMOTE_ALLOW_ORIGINS).toBe('http://127.0.0.1:9230');
  });

  it('reuses Cursor when an eligible workbench target is already available', async () => {
    const launch = vi.fn();
    const paths = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    const result = await openCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWithInstalledIntegration(paths, paths.cursorAppCandidates[0]),
      probeTargets: vi.fn(async () => [cursorTarget]),
      isCursorRunning: vi.fn(async () => true),
      launch,
    });

    expect(result).toEqual({
      launched: false,
      reused: true,
      appPath: paths.cursorAppCandidates[0],
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it('launches macOS Cursor with loopback-only CDP arguments and waits for the target', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    const appPath = paths.cursorAppCandidates[0];
    const launch = vi.fn(async () => {});
    const probeTargets = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cursorTarget]);

    const result = await openCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWithInstalledIntegration(paths, appPath),
      probeTargets,
      isCursorRunning: vi.fn(async () => false),
      launch,
      wait: vi.fn(async () => {}),
      maxAttempts: 3,
      retryDelayMs: 0,
    });

    expect(result).toEqual({ launched: true, reused: false, appPath });
    expect(launch).toHaveBeenCalledWith('open', [
      '-n', appPath, '--args',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=9230',
      '--remote-allow-origins=http://127.0.0.1:9230',
    ]);
  });

  it('launches Windows Cursor.exe without a shell string', async () => {
    const appPath = String.raw`C:\Accounts\demo\AppData\Local\Programs\cursor\Cursor.exe`;
    const paths = resolveCursorIntegrationPaths({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: { LOCALAPPDATA: String.raw`C:\Accounts\demo\AppData\Local` },
    });
    const launch = vi.fn(async () => {});
    const probeTargets = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cursorTarget]);

    await openCursorIntegration({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: { LOCALAPPDATA: String.raw`C:\Accounts\demo\AppData\Local` },
      fileSystem: fileSystemWithInstalledIntegration(paths, appPath),
      probeTargets,
      isCursorRunning: vi.fn(async () => false),
      launch,
      wait: vi.fn(async () => {}),
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    expect(launch).toHaveBeenCalledWith(appPath, [
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=9230',
      '--remote-allow-origins=http://127.0.0.1:9230',
    ]);
  });

  it('refuses a competing ordinary Cursor instance', async () => {
    await expect(openCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      probeTargets: vi.fn(async () => []),
      isCursorRunning: vi.fn(async () => true),
    })).rejects.toThrow(/already running without Axhub CDP.*Quit Cursor completely/);
  });

  it('rejects non-workbench targets while waiting', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    await expect(openCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWithInstalledIntegration(paths, paths.cursorAppCandidates[0]),
      probeTargets: vi.fn(async () => [{
        ...cursorTarget,
        url: 'https://example.com',
      }]),
      isCursorRunning: vi.fn(async () => false),
      launch: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      maxAttempts: 1,
      retryDelayMs: 0,
    })).rejects.toThrow(/did not expose an Axhub CDP target/);
  });

  it('rejects a normal Cursor workbench that is not Cursor Agents', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    await expect(openCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWithInstalledIntegration(paths, paths.cursorAppCandidates[0]),
      probeTargets: vi.fn(async () => [{ ...cursorTarget, title: 'make-template' }]),
      isCursorRunning: vi.fn(async () => false),
      launch: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      maxAttempts: 1,
      retryDelayMs: 0,
    })).rejects.toThrow(/did not expose an Axhub CDP target/);
  });

  it('inspects ready, running, client installation, and owned integration files independently', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });

    await expect(inspectCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWith(
        paths.cursorAppCandidates[0],
        paths.configFile,
        paths.companionFile,
      ),
      probeTargets: vi.fn(async () => [cursorTarget]),
      isCursorRunning: vi.fn(async () => false),
    })).resolves.toEqual({
      platform: 'darwin',
      ready: true,
      running: false,
      installed: true,
      integrationInstalled: false,
      appPath: paths.cursorAppCandidates[0],
    });

    await expect(inspectCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWith(
        paths.configFile,
        paths.companionFile,
        paths.launcherSourceFile,
      ),
      probeTargets: vi.fn(async () => []),
      isCursorRunning: vi.fn(async () => true),
    })).resolves.toEqual({
      platform: 'darwin',
      ready: false,
      running: true,
      installed: false,
      integrationInstalled: true,
      appPath: '',
    });
  });

  it('requires the Axhub-owned Cursor integration before launching', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    const launch = vi.fn(async () => {});

    await expect(openCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      fileSystem: fileSystemWith(
        paths.cursorAppCandidates[0],
        paths.configFile,
        paths.companionFile,
      ),
      probeTargets: vi.fn(async () => []),
      isCursorRunning: vi.fn(async () => false),
      launch,
    })).rejects.toThrow('cursor install');
    expect(launch).not.toHaveBeenCalled();
  });

  it('asks for a manual quit if graceful Cursor close never observes exit', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await expect(closeCursorIntegrationGracefully({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
      run,
      isCursorRunning: vi.fn(async () => true),
      wait: vi.fn(async () => {}),
      maxAttempts: 2,
      retryDelayMs: 0,
    })).rejects.toThrow('请手动退出后重试');
    expect(run).toHaveBeenCalledWith('osascript', [
      '-e', 'tell application "Cursor" to quit',
    ]);
  });
});
