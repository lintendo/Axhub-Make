import { describe, expect, it, vi } from 'vitest';

import {
  LEGACY_CURSOR_COMPANION_LABEL,
  LEGACY_CURSOR_WINDOWS_TASK_NAME,
  removeLegacyCursorIntegration,
} from '../cursorLegacyCleanup.ts';

function fileSystemWith(...existing: string[]) {
  const paths = new Set(existing);
  return {
    access: vi.fn(async (filePath: string) => {
      if (!paths.has(filePath)) throw new Error('missing');
    }),
    remove: vi.fn(async () => {}),
  };
}

describe('legacy Cursor cleanup', () => {
  it('removes the owned macOS companion and unloads its LaunchAgent', async () => {
    const homeDir = '/tmp/demo';
    const root = `${homeDir}/Library/Application Support/Axhub Make/cursor-integration`;
    const service = `${homeDir}/Library/LaunchAgents/${LEGACY_CURSOR_COMPANION_LABEL}.plist`;
    const fileSystem = fileSystemWith(root, service);
    const run = vi.fn(async () => {});

    await expect(removeLegacyCursorIntegration({
      platform: 'darwin',
      homeDir,
      userId: '501',
      fileSystem,
      run,
    })).resolves.toEqual({ removed: true });

    expect(run).toHaveBeenCalledWith('launchctl', ['bootout', `gui/501/${LEGACY_CURSOR_COMPANION_LABEL}`]);
    expect(fileSystem.remove).toHaveBeenCalledWith(root, { recursive: true, force: true });
    expect(fileSystem.remove).toHaveBeenCalledWith(service, { force: true });
  });

  it('removes the owned Windows task and files without a shell command', async () => {
    const homeDir = String.raw`C:\Accounts\demo`;
    const root = String.raw`C:\Accounts\demo\AppData\Local\Axhub Make\cursor-integration`;
    const fileSystem = fileSystemWith(root);
    const run = vi.fn(async () => {});

    await expect(removeLegacyCursorIntegration({
      platform: 'win32',
      homeDir,
      env: { LOCALAPPDATA: String.raw`C:\Accounts\demo\AppData\Local` },
      fileSystem,
      run,
    })).resolves.toEqual({ removed: true });

    expect(run).toHaveBeenCalledWith('schtasks.exe', ['/Delete', '/TN', LEGACY_CURSOR_WINDOWS_TASK_NAME, '/F']);
    expect(fileSystem.remove).toHaveBeenCalledWith(root, { recursive: true, force: true });
  });

  it('does not run cleanup commands when no legacy files exist', async () => {
    const fileSystem = fileSystemWith();
    const run = vi.fn(async () => {});

    await expect(removeLegacyCursorIntegration({
      platform: 'darwin',
      homeDir: '/tmp/demo',
      fileSystem,
      run,
    })).resolves.toEqual({ removed: false });
    expect(run).not.toHaveBeenCalled();
    expect(fileSystem.remove).not.toHaveBeenCalled();
  });
});
