import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDefaultDiagnosticLogFile, startDiagnosticLog } from '../diagnosticLog.ts';
const tempRoots = [];
function createTempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-diagnostic-log-'));
    tempRoots.push(root);
    return root;
}
afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('diagnostic log', () => {
    it('resolves default logs under the local ignored log directory', () => {
        const cwd = createTempRoot();
        const filePath = resolveDefaultDiagnosticLogFile(cwd, new Date('2026-06-12T01:02:03.456Z'));
        expect(filePath).toContain(`${path.sep}.local${path.sep}logs${path.sep}`);
        expect(path.basename(filePath)).toContain('axhub-make-2026-06-12T01-02-03-456Z');
    });
    it('tees console output and explicit lines to the log file', () => {
        const cwd = createTempRoot();
        const filePath = path.join(cwd, '.local', 'logs', 'make.log');
        const stdout = [];
        const stderr = [];
        const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
            stdout.push(args.join(' '));
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
            stderr.push(args.join(' '));
        });
        const log = startDiagnosticLog(filePath);
        try {
            console.log('hello', 'diagnostic');
            console.error('boom');
            log.write('[manual] line');
        }
        finally {
            log.close();
        }
        expect(stdout).toContain('hello diagnostic');
        expect(stderr).toContain('boom');
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('[diagnostic] log started');
        expect(content).toContain('[console:log] hello diagnostic');
        expect(content).toContain('[console:error] boom');
        expect(content).toContain('[manual] line');
        expect(console.log).toBe(logSpy);
        expect(console.error).toBe(errorSpy);
    });
});
