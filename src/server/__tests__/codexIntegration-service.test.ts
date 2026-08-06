import { describe, expect, it, vi } from 'vitest';

import {
  createLaunchAgentPlist,
  createWindowsTaskXml,
  registerBackgroundService,
  unregisterBackgroundService,
} from '../codexIntegration/service.ts';
import {
  CODEX_INTEGRATION_LAUNCH_AGENT_LABEL,
  CODEX_INTEGRATION_WINDOWS_TASK_NAME,
  resolveCodexIntegrationPaths,
} from '../codexIntegration/paths.ts';

describe('Codex++ background service definitions', () => {
  it('creates a shell-free LaunchAgent and escapes every serialized value', () => {
    const plist = createLaunchAgentPlist({
      nodePath: '/usr/local/bin/node',
      companionPath: '/tmp/Axhub & Demo/companion.mjs',
      configPath: '/tmp/Axhub <Demo>/config.json',
      stdoutLog: '/tmp/Axhub & Demo/out.log',
      stderrLog: '/tmp/Axhub & Demo/error.log',
    });

    expect(plist).toMatch(/<key>Label<\/key>\s*<string>im\.axhub\.codexplus\.make-companion<\/string>/);
    expect(plist).toMatch(/<key>ProgramArguments<\/key>\s*<array>/);
    expect(plist).toMatch(/<string>\/usr\/local\/bin\/node<\/string>/);
    expect(plist).toMatch(/Axhub &amp; Demo\/companion\.mjs/);
    expect(plist).toMatch(/--config/);
    expect(plist).toMatch(/Axhub &lt;Demo&gt;\/config\.json/);
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).not.toMatch(/<key>Program<\/key>|<string>(?:sh|bash|-c)<\/string>/);
  });

  it('creates a hidden least-privilege Windows task for the current user SID', () => {
    const xml = createWindowsTaskXml({
      userSid: 'S-1-5-21-1000-2000-3000-1001',
      nodePath: String.raw`C:\Program Files\nodejs\node.exe`,
      companionPath: String.raw`C:\Accounts\Demo User\AppData\Local\Axhub Make\codex-integration\companion.mjs`,
      configPath: String.raw`C:\Accounts\Demo User\AppData\Local\Axhub Make\codex-integration\config.json`,
      workingDirectory: String.raw`C:\Accounts\Demo User\AppData\Local\Axhub Make\codex-integration`,
    });

    expect(xml).toMatch(/<UserId>S-1-5-21-1000-2000-3000-1001<\/UserId>/);
    expect(xml).toMatch(/<LogonType>InteractiveToken<\/LogonType>/);
    expect(xml).toMatch(/<RunLevel>LeastPrivilege<\/RunLevel>/);
    expect(xml).toMatch(/<Hidden>true<\/Hidden>/);
    expect(xml).toMatch(/<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
    expect(xml).toContain('<Command>C:\\Program Files\\nodejs\\node.exe</Command>');
    expect(xml).toContain('&quot;C:\\Accounts\\Demo User\\AppData\\Local\\Axhub Make\\codex-integration\\companion.mjs&quot; --config &quot;C:\\Accounts\\Demo User\\AppData\\Local\\Axhub Make\\codex-integration\\config.json&quot;');
    expect(xml).toContain('<WorkingDirectory>C:\\Accounts\\Demo User\\AppData\\Local\\Axhub Make\\codex-integration</WorkingDirectory>');
    expect(xml).not.toMatch(/HighestAvailable|cmd\.exe|powershell/i);
  });
});

describe('Codex++ background service registration', () => {
  it('replaces and starts a macOS LaunchAgent using argument arrays', async () => {
    const paths = resolveCodexIntegrationPaths({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      env: {},
    });
    const calls: Array<[string, string[]]> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      return { stdout: '', stderr: '' };
    });

    await registerBackgroundService({ paths, uid: 501, run });

    const target = `gui/501/${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}`;
    expect(calls).toEqual([
      ['launchctl', ['print', target]],
      ['launchctl', ['bootout', target]],
      ['launchctl', ['bootstrap', 'gui/501', paths.serviceFile]],
      ['launchctl', ['kickstart', '-k', target]],
    ]);
  });

  it('replaces and starts a Windows scheduled task without a shell', async () => {
    const paths = resolveCodexIntegrationPaths({
      platform: 'win32',
      homeDir: String.raw`C:\Accounts\demo`,
      env: {},
    });
    const calls: Array<[string, string[]]> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      if (args[0] === '/End') throw new Error('task is not running');
      return { stdout: '', stderr: '' };
    });

    await registerBackgroundService({ paths, run });

    expect(calls).toEqual([
      ['schtasks.exe', ['/End', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME]],
      ['schtasks.exe', ['/Delete', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/F']],
      ['schtasks.exe', ['/Create', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/XML', paths.taskXmlFile, '/F']],
      ['schtasks.exe', ['/Run', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME]],
    ]);
  });

  it('unregisters only the owned service name and tolerates missing registrations', async () => {
    const macPaths = resolveCodexIntegrationPaths({ platform: 'darwin', homeDir: '/tmp/demo', env: {} });
    const windowsPaths = resolveCodexIntegrationPaths({ platform: 'win32', homeDir: String.raw`C:\Accounts\demo`, env: {} });
    const macRun = vi.fn(async () => { throw new Error('not loaded'); });
    const windowsRun = vi.fn(async () => { throw new Error('not found'); });

    await expect(unregisterBackgroundService({ paths: macPaths, uid: 501, run: macRun })).resolves.toBeUndefined();
    await expect(unregisterBackgroundService({ paths: windowsPaths, run: windowsRun })).resolves.toBeUndefined();

    expect(macRun).toHaveBeenCalledWith('launchctl', [
      'bootout',
      `gui/501/${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}`,
    ]);
    expect(windowsRun).toHaveBeenNthCalledWith(1, 'schtasks.exe', [
      '/End', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME,
    ]);
    expect(windowsRun).toHaveBeenNthCalledWith(2, 'schtasks.exe', [
      '/Delete', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/F',
    ]);
  });
});
