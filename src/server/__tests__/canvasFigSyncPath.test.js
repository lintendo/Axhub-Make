import { describe, expect, it } from 'vitest';
import { resolveCanvasFigSyncScript } from '../exportMakeArtifacts.ts';
describe('canvas fig sync script resolution', () => {
    it('uses AXHUB_MAKE_CANVAS_FIG_SYNC when provided', () => {
        expect(resolveCanvasFigSyncScript('/project', {
            env: { AXHUB_MAKE_CANVAS_FIG_SYNC: './scripts/canvas-fig-sync.mjs' },
            cwd: '/release',
            serverDir: '/release/dist/server',
            execPath: '/usr/bin/node',
            exists: () => false,
        })).toBe('/release/scripts/canvas-fig-sync.mjs');
    });
    it('finds scripts copied into the npm package root', () => {
        expect(resolveCanvasFigSyncScript('/project', {
            env: {},
            cwd: '/workspace',
            serverDir: '/package/dist/server',
            execPath: '/usr/bin/node',
            exists: (candidate) => candidate === '/package/scripts/canvas-fig-sync.mjs',
        })).toBe('/package/scripts/canvas-fig-sync.mjs');
    });
    it('finds scripts in the make vendor directory', () => {
        expect(resolveCanvasFigSyncScript('/project', {
            env: {},
            cwd: '/workspace',
            serverDir: '/repo/src/server',
            execPath: '/usr/bin/node',
            exists: (candidate) => candidate === '/repo/vendor/axhub-export-core/scripts/canvas-fig-sync.mjs',
        })).toBe('/repo/vendor/axhub-export-core/scripts/canvas-fig-sync.mjs');
    });
    it('finds scripts next to a packaged executable', () => {
        expect(resolveCanvasFigSyncScript('/project', {
            env: {},
            cwd: '/workspace',
            serverDir: '/snapshot/dist/server',
            execPath: '/release/axhub-make/axhub-make',
            exists: (candidate) => candidate === '/release/axhub-make/scripts/canvas-fig-sync.mjs',
        })).toBe('/release/axhub-make/scripts/canvas-fig-sync.mjs');
    });
});
