import path from 'node:path';
import { LocalCommandError, resolveLocalCommandPath, runLocalCommand, } from './localCommand.ts';
const DEFAULT_PICKER_TIMEOUT_MS = 120_000;
function escapeAppleScriptString(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function escapePowerShellSingleQuotedString(value) {
    return value.replace(/'/g, "''");
}
function buildPowerShellFolderBrowserScript(prompt) {
    const description = escapePowerShellSingleQuotedString(prompt);
    return [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        `$dialog.Description = '${description}'`,
        '$dialog.ShowNewFolderButton = $true',
        '$result = $dialog.ShowDialog()',
        'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
    ].join('; ');
}
export function buildLocalDirectoryPickerCommand(options) {
    const platform = options.platform || process.platform;
    const prompt = String(options.prompt || '').trim() || 'Select folder';
    if (platform === 'darwin') {
        return {
            command: 'osascript',
            args: [
                '-e',
                `try\nPOSIX path of (choose folder with prompt "${escapeAppleScriptString(prompt)}")\non error number -128\nreturn ""\nend try`,
            ],
        };
    }
    if (platform === 'win32') {
        return {
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-STA',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                buildPowerShellFolderBrowserScript(prompt),
            ],
        };
    }
    if (platform === 'linux' && options.linuxDialogCommand === 'zenity') {
        return {
            command: 'zenity',
            args: ['--file-selection', '--directory', '--title', prompt],
        };
    }
    if (platform === 'linux' && options.linuxDialogCommand === 'kdialog') {
        return {
            command: 'kdialog',
            args: ['--getexistingdirectory', options.initialDirectory || '/', '--title', prompt],
        };
    }
    return null;
}
async function resolveLinuxDialogCommand(options) {
    if (await resolveLocalCommandPath('zenity', options)) {
        return 'zenity';
    }
    if (await resolveLocalCommandPath('kdialog', options)) {
        return 'kdialog';
    }
    return null;
}
function resolveSelectedDirectory(selectedPath, platform) {
    if (platform === 'win32') {
        return path.win32.resolve(selectedPath);
    }
    return path.resolve(selectedPath);
}
function isPickerCancellation(error, platform) {
    return platform === 'linux'
        && error instanceof LocalCommandError
        && error.exitCode === 1
        && !error.stdout.trim();
}
export async function selectLocalDirectory(options) {
    const platform = options.platform || process.platform;
    const linuxDialogCommand = platform === 'linux' ? await resolveLinuxDialogCommand(options) : undefined;
    if (platform === 'linux' && !linuxDialogCommand) {
        throw new Error('Linux directory picker requires zenity or kdialog');
    }
    const pickerCommand = buildLocalDirectoryPickerCommand({
        prompt: options.prompt,
        platform,
        linuxDialogCommand,
        initialDirectory: options.env?.HOME || process.env.HOME || '/',
    });
    if (!pickerCommand) {
        throw new Error(`Local directory picker is not available on ${platform}`);
    }
    try {
        const result = await runLocalCommand(pickerCommand.command, pickerCommand.args, {
            executor: options.executor,
            env: options.env,
            platform,
            timeoutMs: options.timeoutMs ?? DEFAULT_PICKER_TIMEOUT_MS,
            windowsHide: platform === 'win32' ? false : undefined,
        });
        const selectedPath = result.stdout.trim();
        return selectedPath ? resolveSelectedDirectory(selectedPath, platform) : null;
    }
    catch (error) {
        if (isPickerCancellation(error, platform)) {
            return null;
        }
        throw error;
    }
}
