import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL,
  CURSOR_INTEGRATION_WINDOWS_TASK_NAME,
  resolveCursorIntegrationPaths,
} from '../cursorIntegration/paths.ts';

describe('Cursor integration paths', () => {
  it('keeps macOS assets in a Cursor-owned Axhub root', () => {
    const homeDir = '/tmp/demo';
    const result = resolveCursorIntegrationPaths({
      platform: 'darwin',
      homeDir,
      env: {},
    });

    expect(CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL).toBe('im.axhub.cursor.make-companion');
    expect(result).toMatchObject({
      platform: 'darwin',
      installRoot: '/tmp/demo/Library/Application Support/Axhub Make/cursor-integration',
      configFile: '/tmp/demo/Library/Application Support/Axhub Make/cursor-integration/config.json',
      companionFile: '/tmp/demo/Library/Application Support/Axhub Make/cursor-integration/companion.mjs',
      launcherSourceFile: '/tmp/demo/Library/Application Support/Axhub Make/cursor-integration/axhub-make.cursor-launcher.js',
      serviceFile: `/tmp/demo/Library/LaunchAgents/${CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL}.plist`,
    });
    expect(result.cursorAppCandidates).toEqual([
      '/Applications/Cursor.app',
      '/tmp/demo/Applications/Cursor.app',
    ]);
    for (const filePath of [
      result.configFile,
      result.companionFile,
      result.launcherSourceFile,
      result.stdoutLog,
      result.stderrLog,
    ]) {
      expect(path.posix.relative(result.installRoot, filePath)).not.toMatch(/^\.\.(?:\/|$)/u);
    }
  });

  it('uses current-user and system Cursor locations on Windows', () => {
    const result = resolveCursorIntegrationPaths({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: {
        LOCALAPPDATA: String.raw`C:\Accounts\demo\AppData\Local`,
        PROGRAMFILES: String.raw`C:\Program Files`,
        'PROGRAMFILES(X86)': String.raw`C:\Program Files (x86)`,
      },
    });

    expect(CURSOR_INTEGRATION_WINDOWS_TASK_NAME).toBe('Axhub Make Cursor Companion');
    expect(result).toMatchObject({
      platform: 'win32',
      installRoot: String.raw`C:\Accounts\demo\AppData\Local\Axhub Make\cursor-integration`,
      configFile: String.raw`C:\Accounts\demo\AppData\Local\Axhub Make\cursor-integration\config.json`,
      companionFile: String.raw`C:\Accounts\demo\AppData\Local\Axhub Make\cursor-integration\companion.mjs`,
      launcherSourceFile: String.raw`C:\Accounts\demo\AppData\Local\Axhub Make\cursor-integration\axhub-make.cursor-launcher.js`,
      taskXmlFile: String.raw`C:\Accounts\demo\AppData\Local\Axhub Make\cursor-integration\scheduled-task.xml`,
    });
    expect(result.cursorAppCandidates).toEqual([
      String.raw`C:\Accounts\demo\AppData\Local\Programs\cursor\Cursor.exe`,
      String.raw`C:\Program Files\Cursor\Cursor.exe`,
      String.raw`C:\Program Files (x86)\Cursor\Cursor.exe`,
    ]);
  });

  it('rejects unsupported platforms', () => {
    expect(() => resolveCursorIntegrationPaths({
      platform: 'linux',
      homeDir: '/home/demo',
      env: {},
    })).toThrow(/supports macOS and Windows only/);
  });
});
