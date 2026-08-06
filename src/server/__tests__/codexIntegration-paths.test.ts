import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveCodexIntegrationPaths } from '../codexIntegration/paths.ts';

describe('Codex integration paths', () => {
  it('uses Axhub-owned source paths and preserves the legacy Codex++ script path on macOS', () => {
    const homeDir = '/tmp/demo';

    expect(resolveCodexIntegrationPaths({
      platform: 'darwin',
      homeDir,
      env: {},
    })).toEqual({
      platform: 'darwin',
      homeDir,
      installRoot: path.posix.join(homeDir, 'Library/Application Support/Axhub Make/codex-integration'),
      configFile: path.posix.join(homeDir, 'Library/Application Support/Axhub Make/codex-integration/config.json'),
      companionFile: path.posix.join(homeDir, 'Library/Application Support/Axhub Make/codex-integration/companion.mjs'),
      sidebarSourceFile: path.posix.join(homeDir, 'Library/Application Support/Axhub Make/codex-integration/axhub-make.sidebar.js'),
      legacyUserScriptFile: path.posix.join(homeDir, '.config/Codex++/user_scripts/axhub-make.user.js'),
      serviceFile: path.posix.join(homeDir, 'Library/LaunchAgents/im.axhub.codexplus.make-companion.plist'),
      stdoutLog: path.posix.join(homeDir, 'Library/Logs/Axhub Make Codex++/companion.log'),
      stderrLog: path.posix.join(homeDir, 'Library/Logs/Axhub Make Codex++/companion.error.log'),
      codexPlusCandidates: [
        '/Applications/Codex++.app',
        path.posix.join(homeDir, 'Applications/Codex++.app'),
      ],
      codexCandidates: [
        '/Applications/Codex.app',
        path.posix.join(homeDir, 'Applications/Codex.app'),
      ],
    });
  });

  it('uses APPDATA only for legacy cleanup and LOCALAPPDATA for Axhub-owned files on Windows', () => {
    const homeDir = String.raw`C:\Accounts\demo`;
    const appData = String.raw`D:\Profiles\demo\Roaming`;
    const localAppData = String.raw`D:\Profiles\demo\Local`;

    expect(resolveCodexIntegrationPaths({
      platform: 'win32',
      homeDir,
      env: { APPDATA: appData, LOCALAPPDATA: localAppData },
    })).toEqual({
      platform: 'win32',
      homeDir,
      installRoot: path.win32.join(localAppData, 'Axhub Make', 'codex-integration'),
      configFile: path.win32.join(localAppData, 'Axhub Make', 'codex-integration', 'config.json'),
      companionFile: path.win32.join(localAppData, 'Axhub Make', 'codex-integration', 'companion.mjs'),
      sidebarSourceFile: path.win32.join(localAppData, 'Axhub Make', 'codex-integration', 'axhub-make.sidebar.js'),
      legacyUserScriptFile: path.win32.join(appData, 'Codex++', 'user_scripts', 'axhub-make.user.js'),
      taskXmlFile: path.win32.join(localAppData, 'Axhub Make', 'codex-integration', 'scheduled-task.xml'),
      stdoutLog: path.win32.join(localAppData, 'Axhub Make', 'codex-integration', 'logs', 'companion.log'),
      stderrLog: path.win32.join(localAppData, 'Axhub Make', 'codex-integration', 'logs', 'companion.error.log'),
      codexPlusCandidates: [
        path.win32.join(localAppData, 'Programs', 'Codex++', 'codex-plus-plus.exe'),
      ],
      codexCandidates: [
        path.win32.join(localAppData, 'Programs', 'Codex', 'Codex.exe'),
      ],
    });
  });

  it('rejects platforms without the Codex desktop integration contract', () => {
    expect(() => resolveCodexIntegrationPaths({
      platform: 'linux',
      homeDir: '/home/demo',
      env: {},
    })).toThrow(/supports macOS and Windows only/);
  });
});
