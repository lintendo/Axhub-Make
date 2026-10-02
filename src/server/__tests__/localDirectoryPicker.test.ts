import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildLocalDirectoryPickerCommand,
  selectLocalDirectory,
} from '../localDirectoryPicker.ts';
import type { LocalCommandExecutor } from '../localCommand.ts';

describe('localDirectoryPicker', () => {
  it('uses AppleScript on macOS', async () => {
    const command = buildLocalDirectoryPickerCommand({
      platform: 'darwin',
      prompt: '选择 "Axhub" 项目目录',
    });

    expect(command?.command).toBe('osascript');
    expect(command?.args).toEqual([
      '-e',
      'try\nPOSIX path of (choose folder with prompt "选择 \\"Axhub\\" 项目目录")\non error number -128\nreturn ""\nend try',
    ]);
  });

  it('uses a PowerShell folder browser on Windows', async () => {
    const command = buildLocalDirectoryPickerCommand({
      platform: 'win32',
      prompt: '选择新建 Make 项目的所在位置',
    });

    expect(command?.command).toBe('powershell.exe');
    expect(command?.args.slice(0, 4)).toEqual(['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass']);
    expect(command?.args).toContain('-Command');
    expect(command?.args.at(-1)).toContain('System.Windows.Forms.FolderBrowserDialog');
    expect(command?.args.at(-1)).toContain('Write-Output $dialog.SelectedPath');
  });

  it('uses zenity on Linux when available', async () => {
    const executor: LocalCommandExecutor = vi.fn(async (command: string, args: string[]) => {
      if (command === 'which' && args[0] === 'zenity') {
        return { stdout: '/usr/bin/zenity\n', stderr: '' };
      }
      if (command === 'zenity') {
        return { stdout: '/home/demo/Axhub Runtime\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    await expect(selectLocalDirectory({
      prompt: '选择 Axhub Make 客户端项目目录',
      platform: 'linux',
      executor,
    })).resolves.toBe(path.resolve('/home/demo/Axhub Runtime'));
    expect(executor).toHaveBeenCalledWith('which', ['zenity'], expect.any(Object));
    expect(executor).toHaveBeenCalledWith('zenity', [
      '--file-selection',
      '--directory',
      '--title',
      '选择 Axhub Make 客户端项目目录',
    ], expect.objectContaining({ shell: false }));
  });

  it('uses kdialog on Linux when zenity is unavailable', async () => {
    const executor: LocalCommandExecutor = vi.fn(async (command: string, args: string[]) => {
      if (command === 'which' && args[0] === 'zenity') {
        throw new Error('zenity missing');
      }
      if (command === 'which' && args[0] === 'kdialog') {
        return { stdout: '/usr/bin/kdialog\n', stderr: '' };
      }
      if (command === 'kdialog') {
        return { stdout: '/home/demo/Make Project\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    await expect(selectLocalDirectory({
      prompt: '选择 Axhub Make 客户端项目目录',
      platform: 'linux',
      env: { HOME: '/home/demo' },
      executor,
    })).resolves.toBe(path.resolve('/home/demo/Make Project'));
    expect(executor).toHaveBeenCalledWith('kdialog', [
      '--getexistingdirectory',
      '/home/demo',
      '--title',
      '选择 Axhub Make 客户端项目目录',
    ], expect.objectContaining({ shell: false }));
  });

  it('preserves Windows drive paths from the PowerShell picker', async () => {
    const executor: LocalCommandExecutor = vi.fn(async () => ({
      stdout: 'C:\\Projects\\Axhub Runtime\r\n',
      stderr: '',
    }));

    await expect(selectLocalDirectory({
      prompt: '选择目录',
      platform: 'win32',
      executor,
    })).resolves.toBe('C:\\Projects\\Axhub Runtime');
    expect(executor).toHaveBeenCalledWith('powershell.exe', expect.any(Array), expect.objectContaining({
      shell: false,
      windowsHide: false,
    }));
  });

  it('reports a platform-specific setup hint when no Linux dialog command is available', async () => {
    const executor: LocalCommandExecutor = vi.fn(async () => {
      throw new Error('missing');
    });

    await expect(selectLocalDirectory({
      prompt: '选择目录',
      platform: 'linux',
      executor,
    })).rejects.toThrow('Linux directory picker requires zenity or kdialog');
  });

  it('returns null when the picker is cancelled', async () => {
    const executor: LocalCommandExecutor = vi.fn(async () => ({ stdout: '\n', stderr: '' }));

    await expect(selectLocalDirectory({
      prompt: '选择目录',
      platform: 'win32',
      executor,
    })).resolves.toBeNull();
  });
});
