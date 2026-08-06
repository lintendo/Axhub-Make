import { afterEach, describe, expect, it, vi } from 'vitest';

const installMock = vi.hoisted(() => vi.fn());
const doctorMock = vi.hoisted(() => vi.fn());
const uninstallMock = vi.hoisted(() => vi.fn());
const openCursorMock = vi.hoisted(() => vi.fn());

vi.mock('../cursorIntegration/install.ts', () => ({
  installCursorIntegration: installMock,
  doctorCursorIntegration: doctorMock,
  uninstallCursorIntegration: uninstallMock,
}));

vi.mock('../cursorIntegration/launcher.ts', () => ({
  openCursorIntegration: openCursorMock,
}));

import { runCursorIntegrationCli } from '../cursorIntegration/cli.ts';

afterEach(() => {
  installMock.mockReset();
  doctorMock.mockReset();
  uninstallMock.mockReset();
  openCursorMock.mockReset();
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe('Cursor integration commands', () => {
  it('installs and prints the exact remaining actions', async () => {
    installMock.mockResolvedValue({
      paths: { launcherSourceFile: '/tmp/axhub-make.cursor-launcher.js' },
      warnings: [],
      nextAction: 'Fully quit Cursor, run npx -y @axhub/make@latest cursor open, then click Axhub Make.',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCursorIntegrationCli(['install']);

    expect(installMock).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join('\n')).toMatch(/Installed Axhub Make for Cursor.*npx -y @axhub\/make@latest cursor open.*click Axhub Make/is);
  });

  it('opens Cursor with CDP and explains automatic Make startup', async () => {
    openCursorMock.mockResolvedValue({ launched: true, reused: false, appPath: '/Applications/Cursor.app' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCursorIntegrationCli(['open']);

    expect(openCursorMock).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join('\n')).toMatch(/Cursor started with Axhub CDP.*click Axhub Make.*starts automatically/is);
  });

  it('prints doctor failures and uninstalls owned files', async () => {
    doctorMock.mockResolvedValue({
      ok: false,
      checks: [{ id: 'native-browser', status: 'fail', message: 'Native browser missing.' }],
    });
    uninstallMock.mockResolvedValue({ uninstalled: true, warnings: [] });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCursorIntegrationCli(['doctor']);
    expect(log).toHaveBeenCalledWith('[fail] native-browser: Native browser missing.');
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await runCursorIntegrationCli(['uninstall']);
    expect(uninstallMock).toHaveBeenCalledOnce();
    await expect(runCursorIntegrationCli(['update'])).rejects.toThrow(/Unknown cursor command/);
  });
});
