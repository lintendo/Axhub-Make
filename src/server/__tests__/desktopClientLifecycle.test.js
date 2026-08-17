import { describe, expect, it, vi } from 'vitest';
import { buildDesktopClientGracefulQuit, buildDesktopClientProcessProbe, waitForDesktopClientExit, } from '../desktopClientLifecycle.ts';
describe('desktop client lifecycle', () => {
    it('builds a fixed graceful ChatGPT quit command on macOS', () => {
        expect(buildDesktopClientGracefulQuit('chatgpt', 'darwin')).toEqual({
            command: 'osascript',
            args: ['-e', 'tell application id "com.openai.codex" to quit'],
        });
    });
    it('builds provider-specific fixed process probes', () => {
        expect(buildDesktopClientProcessProbe('chatgpt', 'darwin')).toEqual({
            command: 'pgrep',
            args: ['-x', 'ChatGPT|Codex'],
        });
        expect(buildDesktopClientProcessProbe('cursor', 'win32')).toEqual({
            command: 'tasklist.exe',
            args: ['/FI', 'IMAGENAME eq Cursor.exe', '/NH'],
        });
        expect(buildDesktopClientProcessProbe('workbuddy', 'darwin')).toEqual({
            command: 'pgrep',
            args: ['-f', '/Applications/WorkBuddy.app/Contents/MacOS/Electron'],
        });
        expect(buildDesktopClientProcessProbe('traework', 'win32')).toMatchObject({
            command: 'powershell.exe',
        });
        expect(JSON.stringify(buildDesktopClientProcessProbe('traework', 'win32'))).toContain('TRAE SOLO CN');
        expect(buildDesktopClientProcessProbe('qoderwork', 'win32')).toEqual({
            command: 'tasklist.exe',
            args: ['/FI', 'IMAGENAME eq QoderWork.exe', '/NH'],
        });
    });
    it('uses a non-force graceful Cursor quit command on Windows', () => {
        expect(buildDesktopClientGracefulQuit('cursor', 'win32')).toMatchObject({
            command: 'powershell.exe',
        });
        expect(JSON.stringify(buildDesktopClientGracefulQuit('cursor', 'win32'))).not.toMatch(/\/F|Stop-Process|kill -9/iu);
    });
    it('uses fixed non-force quit commands for the additional hosts', () => {
        expect(buildDesktopClientGracefulQuit('opencode', 'darwin')).toEqual({
            command: 'osascript',
            args: ['-e', 'tell application "OpenCode" to quit'],
        });
        expect(buildDesktopClientGracefulQuit('workbuddy', 'win32')).toMatchObject({
            command: 'powershell.exe',
        });
        expect(JSON.stringify(buildDesktopClientGracefulQuit('traework', 'win32'))).not.toMatch(/\/F|Stop-Process|kill -9/iu);
        expect(JSON.stringify(buildDesktopClientGracefulQuit('qoderwork', 'win32'))).toContain('QoderWork CN');
    });
    it('returns false when the client remains running through the bounded timeout', async () => {
        await expect(waitForDesktopClientExit({
            isRunning: vi.fn(async () => true),
            wait: vi.fn(async () => { }),
            maxAttempts: 2,
            retryDelayMs: 0,
        })).resolves.toBe(false);
    });
    it('returns true as soon as the client exits', async () => {
        const isRunning = vi.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const wait = vi.fn(async () => { });
        await expect(waitForDesktopClientExit({
            isRunning,
            wait,
            maxAttempts: 3,
            retryDelayMs: 0,
        })).resolves.toBe(true);
        expect(wait).toHaveBeenCalledOnce();
    });
});
