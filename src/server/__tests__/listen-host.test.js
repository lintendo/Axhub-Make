import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfigPath } from '../projectCore/index.ts';
import { resolveMakeServerListenHost } from '../index.ts';
const tempRoots = [];
function createTempRoot(prefix = 'axhub-make-listen-host-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('make-server listen host resolution', () => {
    it('defaults to all interfaces regardless of legacy allowLAN project config', () => {
        const projectRoot = createTempRoot();
        writeJson(getConfigPath(projectRoot), {
            server: { allowLAN: false },
        });
        expect(resolveMakeServerListenHost({ projectRoot })).toBe('0.0.0.0');
    });
    it('lets explicit host override the project LAN setting', () => {
        const projectRoot = createTempRoot();
        writeJson(getConfigPath(projectRoot), {
            server: { allowLAN: false },
        });
        expect(resolveMakeServerListenHost({ projectRoot, explicitHost: '127.0.0.1' })).toBe('127.0.0.1');
    });
    it('treats missing or invalid project config as LAN enabled', () => {
        const projectRoot = createTempRoot();
        expect(resolveMakeServerListenHost({ projectRoot })).toBe('0.0.0.0');
    });
});
