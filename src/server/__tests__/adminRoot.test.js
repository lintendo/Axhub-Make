import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDefaultAdminRoot } from '../index.ts';
describe('default admin root resolution', () => {
    it('uses AXHUB_MAKE_ADMIN_ROOT when provided', () => {
        expect(resolveDefaultAdminRoot({
            env: { AXHUB_MAKE_ADMIN_ROOT: './admin-ui' },
            cwd: '/workspace/project',
            exists: () => false,
            serverDir: '/package/dist/server',
            execPath: '/usr/bin/node',
            argvPath: '/package/bin/cli.mjs',
        })).toBe(path.resolve('/workspace/project/admin-ui'));
    });
    it('prefers admin assets next to a packaged executable', () => {
        expect(resolveDefaultAdminRoot({
            env: {},
            cwd: '/workspace/project',
            exists: (candidate) => candidate === '/release/axhub-make/admin',
            serverDir: '/snapshot/dist/server',
            execPath: '/release/axhub-make/axhub-make',
            argvPath: '/snapshot/bin/cli.mjs',
        })).toBe('/release/axhub-make/admin');
    });
    it('finds package admin assets next to a bundled server directory', () => {
        expect(resolveDefaultAdminRoot({
            env: {},
            cwd: '/workspace/project',
            exists: (candidate) => candidate === '/package/dist/admin',
            serverDir: '/package/dist/server',
            execPath: '/usr/bin/node',
            argvPath: '/package/bin/cli.mjs',
        })).toBe('/package/dist/admin');
    });
});
