import { afterEach, describe, expect, it, vi } from 'vitest';

const installMock = vi.hoisted(() => vi.fn());
const doctorMock = vi.hoisted(() => vi.fn());
const uninstallMock = vi.hoisted(() => vi.fn());
const openCodexMock = vi.hoisted(() => vi.fn());

vi.mock('../codexIntegration/install.ts', () => ({
  installCodexIntegration: installMock,
  doctorCodexIntegration: doctorMock,
  uninstallCodexIntegration: uninstallMock,
}));

vi.mock('../codexIntegration/launcher.ts', () => ({
  openCodexIntegration: openCodexMock,
}));

import { runCodexIntegrationCli } from '../codexIntegration/cli.ts';

afterEach(() => {
  installMock.mockReset();
  doctorMock.mockReset();
  uninstallMock.mockReset();
  openCodexMock.mockReset();
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe('Codex++ integration commands', () => {
  it('installs and prints the only remaining user action', async () => {
    installMock.mockResolvedValue({
      paths: { userScriptFile: '/tmp/axhub-make.user.js' },
      warnings: ['Codex++ uses a custom location.'],
      nextAction: 'Fully quit Codex, then reopen it through Codex++ and click Axhub Make.',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runCodexIntegrationCli(['install']);

    expect(installMock).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('[warn] Codex++ uses a custom location.');
    expect(log.mock.calls.flat().join('\n')).toMatch(/Installed Axhub Make for Codex/);
  });

  it('prints doctor checks and returns a failure exit code when required checks fail', async () => {
    doctorMock.mockResolvedValue({
      ok: false,
      checks: [
        { id: 'assets', status: 'fail', message: 'Missing companion.' },
        { id: 'make', status: 'warn', message: 'Make is not running.' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodexIntegrationCli(['doctor']);

    expect(log).toHaveBeenCalledWith('[fail] assets: Missing companion.');
    expect(log).toHaveBeenCalledWith('[warn] make: Make is not running.');
    expect(process.exitCode).toBe(1);
  });

  it('uninstalls owned integration files and rejects unknown commands', async () => {
    uninstallMock.mockResolvedValue({ uninstalled: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodexIntegrationCli(['uninstall']);
    expect(uninstallMock).toHaveBeenCalledOnce();
    await expect(runCodexIntegrationCli(['update'])).rejects.toThrow(/Unknown codex command: update/);
  });

  it('opens official Codex with CDP and rejects extra launch arguments', async () => {
    openCodexMock.mockResolvedValue({ launched: true, reused: false, appPath: '/Applications/Codex.app' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodexIntegrationCli(['open']);

    expect(openCodexMock).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join('\n')).toMatch(/Official Codex started with Axhub CDP/);
    await expect(runCodexIntegrationCli(['open', '--other'])).rejects.toThrow(/Unexpected codex argument/);
  });
});
