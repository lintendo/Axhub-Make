import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LocalCommandError, buildLocalCommandEnv, commandExists, resolveLocalCommandPath, runLocalCommand, } from '../localCommand.ts';
describe('localCommand', () => {
    it('captures stdout and stderr from a successful command', async () => {
        const result = await runLocalCommand(process.execPath, [
            '-e',
            "process.stdout.write('hello'); process.stderr.write('warn')",
        ]);
        expect(result.stdout).toBe('hello');
        expect(result.stderr).toBe('warn');
        expect(result.command).toBe(process.execPath);
        expect(result.escapedCommand).toContain(process.execPath);
    });
    it('wraps missing commands in a local command error with output details', async () => {
        const executor = vi.fn(async () => {
            const error = new Error('spawn missing-bin ENOENT');
            error.code = 'ENOENT';
            error.shortMessage = 'Command not found: missing-bin';
            throw error;
        });
        await expect(runLocalCommand('missing-bin', [], { executor }))
            .rejects
            .toMatchObject({
            name: 'LocalCommandError',
            code: 'ENOENT',
            command: 'missing-bin',
            stdout: '',
            stderr: '',
        });
    });
    it('wraps timed out commands in a local command error', async () => {
        const executor = vi.fn(async () => {
            const error = new Error('Command timed out');
            error.timedOut = true;
            error.stdout = 'partial';
            error.stderr = 'late';
            throw error;
        });
        await expect(runLocalCommand('slow-bin', ['--wait'], { executor, timeoutMs: 25 }))
            .rejects
            .toMatchObject({
            name: 'LocalCommandError',
            code: 'ETIMEDOUT',
            command: 'slow-bin',
            stdout: 'partial',
            stderr: 'late',
        });
    });
    it('forcefully kills commands soon after their timeout elapses', async () => {
        const executor = vi.fn(async () => ({ stdout: 'ok', stderr: '' }));
        await runLocalCommand('slow-bin', ['--wait'], { executor, timeoutMs: 25 });
        expect(executor).toHaveBeenCalledWith('slow-bin', ['--wait'], expect.objectContaining({
            timeout: 25,
            forceKillAfterDelay: 5_000,
        }));
    });
    it('passes preferLocal and localDirectory through to execa', async () => {
        const executor = vi.fn(async () => ({ stdout: 'ok', stderr: '' }));
        const cwd = path.join('/tmp', 'project');
        await runLocalCommand('tool', ['--flag'], { cwd, preferLocal: true, executor });
        expect(executor).toHaveBeenCalledWith('tool', ['--flag'], expect.objectContaining({
            cwd,
            preferLocal: true,
            localDir: cwd,
            shell: false,
        }));
    });
    it('allows GUI commands to show Windows child process windows', async () => {
        const executor = vi.fn(async () => ({ stdout: 'ok', stderr: '' }));
        await runLocalCommand('powershell.exe', ['-Command', 'Write-Output ok'], {
            platform: 'win32',
            windowsHide: false,
            executor,
        });
        expect(executor).toHaveBeenCalledWith('powershell.exe', ['-Command', 'Write-Output ok'], expect.objectContaining({
            shell: false,
            windowsHide: false,
        }));
    });
    it('builds a GUI-friendly PATH and Windows PATHEXT', () => {
        const darwinEnv = buildLocalCommandEnv({
            platform: 'darwin',
            execPath: '/Applications/Node.app/Contents/MacOS/node',
            env: { PATH: '/usr/bin' },
        });
        expect(darwinEnv.PATH?.split(':')).toEqual(expect.arrayContaining([
            '/Applications/Node.app/Contents/MacOS',
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
        ]));
        const windowsEnv = buildLocalCommandEnv({
            platform: 'win32',
            execPath: 'C:\\Program Files\\nodejs\\node.exe',
            env: { Path: 'C:\\Windows\\System32', APPDATA: 'C:\\Profiles\\demo\\AppData\\Roaming', PATHEXT: '.EXE' },
        });
        expect(windowsEnv.Path?.split(';')).toEqual(expect.arrayContaining([
            'C:\\Program Files\\nodejs',
            'C:\\Profiles\\demo\\AppData\\Roaming\\npm',
            'C:\\Windows\\System32',
        ]));
        expect(windowsEnv.PATHEXT?.split(';')).toEqual(expect.arrayContaining(['.EXE', '.CMD']));
        expect(windowsEnv.PATH).toBeUndefined();
    });
    it('adds the standard user-local bin directory to POSIX command environments', () => {
        for (const platform of ['darwin', 'linux']) {
            const env = buildLocalCommandEnv({
                platform,
                execPath: '/Applications/Node.app/Contents/MacOS/node',
                env: { HOME: '/tmp/axhub-home', PATH: '/usr/bin' },
            });
            const pathSegments = env.PATH?.split(':') || [];
            expect(pathSegments).toContain('/tmp/axhub-home/.local/bin');
            expect(pathSegments.indexOf('/tmp/axhub-home/.local/bin')).toBeGreaterThan(pathSegments.indexOf('/usr/bin'));
        }
    });
    it('checks and resolves commands using platform-specific lookup commands', async () => {
        const executor = vi.fn(async (command) => {
            if (command === 'which')
                return { stdout: '/usr/local/bin/codex\n', stderr: '' };
            return { stdout: '', stderr: '' };
        });
        await expect(commandExists('codex', { executor, platform: 'darwin' })).resolves.toBe(true);
        await expect(resolveLocalCommandPath('codex', { executor, platform: 'darwin' }))
            .resolves
            .toBe('/usr/local/bin/codex');
        expect(executor).toHaveBeenCalledWith('which', ['codex'], expect.objectContaining({
            timeout: expect.any(Number),
            shell: false,
        }));
    });
    it('returns false/null when command lookup fails', async () => {
        const executor = vi.fn(async () => {
            throw new LocalCommandError('not found', {
                command: 'which',
                args: ['missing'],
                code: 'ENOENT',
            });
        });
        await expect(commandExists('missing', { executor, platform: 'linux' })).resolves.toBe(false);
        await expect(resolveLocalCommandPath('missing', { executor, platform: 'linux' })).resolves.toBeNull();
    });
});
