import { describe, expect, it, vi } from 'vitest';
import { findListeningPidsOnPort, releaseListeningProcessesOnPort, } from '../portOccupancy.ts';
describe('make-server port occupancy helpers', () => {
    it('reads listening PIDs with lsof on macOS and Linux', () => {
        const spawnSync = vi.fn((command, args) => {
            if (command === 'lsof' && args.includes('-tiTCP:53817')) {
                return {
                    stdout: '123\n456\n123\n',
                    stderr: '',
                    status: 0,
                };
            }
            return {
                stdout: '',
                stderr: 'invalid lsof selector',
                status: 1,
            };
        });
        expect(findListeningPidsOnPort(53817, {
            platform: 'darwin',
            spawnSync,
        })).toEqual([123, 456]);
        expect(spawnSync).toHaveBeenCalledWith('lsof', [
            '-nP',
            '-tiTCP:53817',
            '-sTCP:LISTEN',
        ], expect.objectContaining({ encoding: 'utf8' }));
    });
    it('reads listening PIDs with PowerShell on Windows', () => {
        const spawnSync = vi.fn(() => ({
            stdout: '321\r\n654\r\n',
            stderr: '',
            status: 0,
        }));
        expect(findListeningPidsOnPort(51720, {
            platform: 'win32',
            spawnSync,
        })).toEqual([321, 654]);
        expect(spawnSync).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining([
            '-NoProfile',
            '-Command',
            expect.stringContaining('Get-NetTCPConnection -LocalPort 51720'),
        ]), expect.objectContaining({ windowsHide: true }));
    });
    it('terminates other listening processes while ignoring the current process', () => {
        const spawnSync = vi.fn(() => ({
            stdout: '111\n222\n',
            stderr: '',
            status: 0,
        }));
        const killPid = vi.fn();
        expect(releaseListeningProcessesOnPort(53817, {
            platform: 'linux',
            spawnSync,
            killPid,
            currentPid: 111,
            waitMs: 0,
        })).toEqual([222]);
        expect(killPid).toHaveBeenCalledWith(222, 'SIGTERM');
    });
    it('terminates the listening process group on POSIX so dev-server parents do not keep running', () => {
        const spawnSync = vi.fn((command, args) => {
            if (command === 'lsof') {
                return {
                    stdout: args.includes('-tiTCP:32123') ? '222\n' : '',
                    stderr: '',
                    status: 0,
                };
            }
            if (command === 'ps' && args.includes('222')) {
                return {
                    stdout: '333\n',
                    stderr: '',
                    status: 0,
                };
            }
            if (command === 'ps' && args.includes('111')) {
                return {
                    stdout: '111\n',
                    stderr: '',
                    status: 0,
                };
            }
            return { stdout: '', stderr: '', status: 0 };
        });
        const killPid = vi.fn();
        expect(releaseListeningProcessesOnPort(32123, {
            platform: 'darwin',
            spawnSync,
            killPid,
            currentPid: 111,
            waitMs: 0,
        })).toEqual([222]);
        expect(killPid).toHaveBeenCalledWith(-333, 'SIGTERM');
        expect(killPid).not.toHaveBeenCalledWith(222, 'SIGTERM');
    });
    it('waits for the port again after force killing remaining POSIX listeners', () => {
        let lsofCalls = 0;
        const spawnSync = vi.fn((command, args) => {
            if (command === 'lsof') {
                lsofCalls += 1;
                return {
                    stdout: args.includes('-tiTCP:32123') && lsofCalls <= 3 ? '222\n' : '',
                    stderr: '',
                    status: 0,
                };
            }
            if (command === 'ps' && args.includes('222')) {
                return {
                    stdout: '333\n',
                    stderr: '',
                    status: 0,
                };
            }
            if (command === 'ps' && args.includes('111')) {
                return {
                    stdout: '111\n',
                    stderr: '',
                    status: 0,
                };
            }
            return { stdout: '', stderr: '', status: 0 };
        });
        const killPid = vi.fn();
        expect(releaseListeningProcessesOnPort(32123, {
            platform: 'darwin',
            spawnSync,
            killPid,
            currentPid: 111,
            waitMs: 1,
        })).toEqual([222]);
        expect(killPid).toHaveBeenCalledWith(-333, 'SIGTERM');
        expect(killPid).toHaveBeenCalledWith(-333, 'SIGKILL');
        expect(lsofCalls).toBeGreaterThanOrEqual(4);
    });
    it('does not try to release ephemeral or invalid ports', () => {
        const spawnSync = vi.fn();
        expect(findListeningPidsOnPort(0, { spawnSync })).toEqual([]);
        expect(releaseListeningProcessesOnPort(0, { spawnSync })).toEqual([]);
        expect(spawnSync).not.toHaveBeenCalled();
    });
});
