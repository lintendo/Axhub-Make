import { describe, expect, it, vi } from 'vitest';

import {
  createLaunchAgentPlist,
  createWindowsTaskXml,
  registerBackgroundService,
  unregisterBackgroundService,
} from '../cursorIntegration/service.ts';
import {
  CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL,
  CURSOR_INTEGRATION_WINDOWS_TASK_NAME,
  resolveCursorIntegrationPaths,
} from '../cursorIntegration/paths.ts';

describe('Cursor background service definitions', () => {
  it('creates a shell-free current-user LaunchAgent', () => {
    const plist = createLaunchAgentPlist({
      nodePath: '/usr/local/bin/node',
      companionPath: '/tmp/Axhub & Demo/companion.mjs',
      configPath: '/tmp/Axhub <Demo>/config.json',
      stdoutLog: '/tmp/Axhub & Demo/out.log',
      stderrLog: '/tmp/Axhub & Demo/error.log',
    });

    expect(plist).toMatch(/im\.axhub\.cursor\.make-companion/);
    expect(plist).toMatch(/<key>ProgramArguments<\/key>\s*<array>/);
    expect(plist).toMatch(/Axhub &amp; Demo\/companion\.mjs/);
    expect(plist).toMatch(/Axhub &lt;Demo&gt;\/config\.json/);
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).not.toMatch(/<key>Program<\/key>|<string>(?:sh|bash|-c)<\/string>/);
  });

  it('creates a hidden least-privilege Windows task', () => {
    const xml = createWindowsTaskXml({
      userSid: 'S-1-5-21-1000-2000-3000-1001',
      nodePath: String.raw`C:\Program Files\nodejs\node.exe`,
      companionPath: String.raw`C:\Accounts\Demo User\AppData\Local\Axhub Make\cursor-integration\companion.mjs`,
      configPath: String.raw`C:\Accounts\Demo User\AppData\Local\Axhub Make\cursor-integration\config.json`,
      workingDirectory: String.raw`C:\Accounts\Demo User\AppData\Local\Axhub Make\cursor-integration`,
    });

    expect(xml).toMatch(/<LogonType>InteractiveToken<\/LogonType>/);
    expect(xml).toMatch(/<RunLevel>LeastPrivilege<\/RunLevel>/);
    expect(xml).toMatch(/<Hidden>true<\/Hidden>/);
    expect(xml).toContain('&quot;C:\\Accounts\\Demo User\\AppData\\Local\\Axhub Make\\cursor-integration\\companion.mjs&quot;');
    expect(xml).not.toMatch(/HighestAvailable|cmd\.exe|powershell/i);
  });
});

describe('Cursor background service registration', () => {
  it('replaces and starts only the Cursor LaunchAgent', async () => {
    const paths = resolveCursorIntegrationPaths({ platform: 'darwin', homeDir: '/tmp/demo', env: {} });
    const calls: Array<[string, string[]]> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      return { stdout: '', stderr: '' };
    });

    await registerBackgroundService({ paths, uid: 501, run });

    const target = `gui/501/${CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL}`;
    expect(calls).toEqual([
      ['launchctl', ['print', target]],
      ['launchctl', ['bootout', target]],
      ['launchctl', ['bootstrap', 'gui/501', paths.serviceFile]],
      ['launchctl', ['kickstart', '-k', target]],
    ]);
  });

  it('replaces, starts, and unregisters only the Cursor Windows task', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: {},
    });
    const calls: Array<[string, string[]]> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      return { stdout: '', stderr: '' };
    });

    await registerBackgroundService({ paths, run });
    await unregisterBackgroundService({ paths, run });

    expect(calls).toContainEqual([
      'schtasks.exe',
      ['/Create', '/TN', CURSOR_INTEGRATION_WINDOWS_TASK_NAME, '/XML', paths.taskXmlFile, '/F'],
    ]);
    expect(calls).toContainEqual([
      'schtasks.exe',
      ['/Delete', '/TN', CURSOR_INTEGRATION_WINDOWS_TASK_NAME, '/F'],
    ]);
    expect(calls.flat(2)).not.toContain('Axhub Make Codex Companion');
  });

  it('does not suppress macOS service removal failures other than not-found', async () => {
    const paths = resolveCursorIntegrationPaths({ platform: 'darwin', homeDir: '/tmp/demo', env: {} });
    const run = vi.fn(async () => {
      throw Object.assign(new Error('Operation not permitted'), { code: 1 });
    });

    await expect(unregisterBackgroundService({ paths, uid: 501, run })).rejects.toThrow(/Operation not permitted/);
  });

  it('does not suppress Windows task removal failures other than not-found', async () => {
    const paths = resolveCursorIntegrationPaths({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: {},
    });
    const run = vi.fn(async () => {
      throw Object.assign(new Error('Access is denied'), { code: 5 });
    });

    await expect(unregisterBackgroundService({ paths, run })).rejects.toThrow(/Access is denied/);
  });

  it('keeps uninstall idempotent when the owned service is already absent', async () => {
    const macPaths = resolveCursorIntegrationPaths({ platform: 'darwin', homeDir: '/tmp/demo', env: {} });
    await expect(unregisterBackgroundService({
      paths: macPaths,
      uid: 501,
      run: vi.fn(async () => {
        throw Object.assign(new Error('Could not find service'), { code: 113 });
      }),
    })).resolves.toBeUndefined();

    const windowsPaths = resolveCursorIntegrationPaths({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: {},
    });
    await expect(unregisterBackgroundService({
      paths: windowsPaths,
      run: vi.fn(async () => {
        throw Object.assign(new Error('ERROR: The system cannot find the file specified.'), { code: 1 });
      }),
    })).resolves.toBeUndefined();
  });
});
