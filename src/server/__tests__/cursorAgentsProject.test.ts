import { describe, expect, it, vi } from 'vitest';

import {
  CURSOR_DEBUG_PORT,
  isCursorWorkbenchTarget,
  openCursorAgentsProject,
} from '../cursorAgentsProject.ts';

const cursorTarget = {
  id: 'cursor-agents',
  title: 'Cursor Agents',
  type: 'page',
  url: 'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html',
  webSocketDebuggerUrl: `ws://127.0.0.1:${CURSOR_DEBUG_PORT}/devtools/page/cursor-agents`,
};

const cursorIdeTarget = {
  ...cursorTarget,
  id: 'cursor-ide',
  title: 'demo-project',
};

function fileSystemWith(...existing: string[]) {
  const paths = new Set(existing);
  return {
    access: vi.fn(async (filePath: string) => {
      if (!paths.has(filePath)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }),
  };
}

describe('Cursor Agents project opener', () => {
  it('recognizes only the Cursor Agents workbench target', () => {
    expect(isCursorWorkbenchTarget(cursorTarget)).toBe(true);
    expect(isCursorWorkbenchTarget(cursorIdeTarget)).toBe(false);
    expect(isCursorWorkbenchTarget({ ...cursorTarget, url: 'https://example.com' })).toBe(false);
  });

  it('opens a macOS project through the bundled Cursor desktop CLI', async () => {
    const appPath = '/Applications/Cursor.app';
    const cliPath = `${appPath}/Contents/Resources/app/bin/cursor`;
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await expect(openCursorAgentsProject('/workspace/demo', {
      platform: 'darwin',
      fileSystem: fileSystemWith(appPath, cliPath),
      probeTargets: vi.fn(async () => [cursorTarget]),
      run,
      wait: vi.fn(async () => {}),
      maxAttempts: 1,
      retryDelayMs: 0,
    })).resolves.toEqual({ appPath, targetPath: '/workspace/demo' });

    expect(run).toHaveBeenNthCalledWith(1, cliPath, ['--chat']);
    expect(run).toHaveBeenNthCalledWith(2, cliPath, ['/workspace/demo']);
  });

  it('opens a Windows project through Cursor.exe argument arrays', async () => {
    const appPath = String.raw`C:\Accounts\demo\AppData\Local\Programs\cursor\Cursor.exe`;
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await expect(openCursorAgentsProject(String.raw`C:\workspace\demo`, {
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: { LOCALAPPDATA: String.raw`C:\Accounts\demo\AppData\Local` },
      fileSystem: fileSystemWith(appPath),
      probeTargets: vi.fn(async () => [cursorTarget]),
      run,
      wait: vi.fn(async () => {}),
      maxAttempts: 1,
      retryDelayMs: 0,
    })).resolves.toEqual({ appPath, targetPath: String.raw`C:\workspace\demo` });

    expect(run).toHaveBeenNthCalledWith(1, appPath, ['--chat']);
    expect(run).toHaveBeenNthCalledWith(2, appPath, [String.raw`C:\workspace\demo`]);
  });

  it('reports a Cursor-version incompatibility when handoff creates an IDE workbench', async () => {
    const appPath = '/Applications/Cursor.app';
    const cliPath = `${appPath}/Contents/Resources/app/bin/cursor`;
    const probeTargets = vi.fn()
      .mockResolvedValueOnce([cursorTarget])
      .mockResolvedValueOnce([cursorTarget])
      .mockResolvedValueOnce([cursorTarget])
      .mockResolvedValueOnce([cursorTarget, cursorIdeTarget]);

    await expect(openCursorAgentsProject('/workspace/demo', {
      platform: 'darwin',
      fileSystem: fileSystemWith(appPath, cliPath),
      probeTargets,
      run: vi.fn(async () => ({ stdout: '', stderr: '' })),
      wait: vi.fn(async () => {}),
      maxAttempts: 1,
      retryDelayMs: 0,
    })).rejects.toThrow('Cursor-version incompatibility');
  });

  it('does not fall back to a legacy installer when Cursor is missing', async () => {
    await expect(openCursorAgentsProject('/workspace/demo', {
      platform: 'darwin',
      fileSystem: fileSystemWith(),
      probeTargets: vi.fn(async () => [cursorTarget]),
    })).rejects.toThrow('Cursor was not found');
  });
});
