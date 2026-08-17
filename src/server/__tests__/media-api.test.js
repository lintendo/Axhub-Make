import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMakeClientMarkerPath, getProjectMetadataPath, getProjectRegistryPath } from '../projectCore/index.ts';
import { startMakeServer } from '../index.ts';
const tempRoots = [];
function createTempRoot(prefix = 'axhub-media-api-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}
function writeMakeClientMarker(projectRoot, id = 'media-client', name = 'Media Client') {
    writeJson(getMakeClientMarkerPath(projectRoot), {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: { id, name },
    });
    writeJson(path.join(projectRoot, 'package.json'), {
        scripts: {
            dev: 'vite',
            'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        },
    });
}
async function startMediaServer(projectRoot) {
    const registryHome = createTempRoot('axhub-media-api-registry-');
    return startMakeServer({
        projectRoot,
        host: 'localhost',
        port: 0,
        adminRoot: path.join(projectRoot, 'missing-admin'),
        registryPath: getProjectRegistryPath(registryHome),
    });
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('make-server media API', () => {
    it('creates folders, serves files, and deletes assets inside the media root', async () => {
        const projectRoot = createTempRoot();
        const mediaDir = path.join(projectRoot, 'assets/media');
        fs.mkdirSync(path.join(mediaDir, 'icons'), { recursive: true });
        fs.writeFileSync(path.join(mediaDir, 'icons/logo.svg'), '<svg />', 'utf8');
        writeMakeClientMarker(projectRoot);
        writeJson(getProjectMetadataPath(projectRoot), {
            schemaVersion: 1,
            project: { id: 'media-client', name: 'Media Client' },
            resources: { prototypes: [], docs: [], themes: [], data: [], templates: [] },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: [], data: [], templates: [] },
        });
        const server = await startMediaServer(projectRoot);
        try {
            const create = await fetch(`${server.origin}/api/media/folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'photos', parentPath: 'icons' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(create).toMatchObject({
                status: 200,
                body: { path: 'icons/photos' },
            });
            expect(fs.existsSync(path.join(mediaDir, 'icons/photos'))).toBe(true);
            const file = await fetch(`${server.origin}/api/media/file/icons/logo.svg`);
            expect(file.status).toBe(200);
            expect(file.headers.get('content-type')).toContain('image/svg+xml');
            expect(await file.text()).toBe('<svg />');
            const list = await fetch(`${server.origin}/api/media?path=${encodeURIComponent('icons')}`).then((response) => response.json());
            expect(list).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'logo.svg', path: 'icons/logo.svg', type: 'image' }),
                expect.objectContaining({ name: 'photos', path: 'icons/photos', type: 'folder' }),
            ]));
            const deleted = await fetch(`${server.origin}/api/media/icons/photos`, { method: 'DELETE' });
            expect(deleted.status).toBe(200);
            expect(fs.existsSync(path.join(mediaDir, 'icons/photos'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('rejects traversal, backslash escape, and root delete requests', async () => {
        const projectRoot = createTempRoot();
        const mediaDir = path.join(projectRoot, 'assets/media');
        fs.mkdirSync(mediaDir, { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'outside.svg'), '<svg />', 'utf8');
        writeMakeClientMarker(projectRoot);
        writeJson(getProjectMetadataPath(projectRoot), {
            schemaVersion: 1,
            project: { id: 'media-client', name: 'Media Client' },
            resources: { prototypes: [], docs: [], themes: [], data: [], templates: [] },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: [], data: [], templates: [] },
        });
        const server = await startMediaServer(projectRoot);
        try {
            const unsafeFolder = await fetch(`${server.origin}/api/media/folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: '../escape', parentPath: '' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(unsafeFolder).toMatchObject({ status: 400, body: { error: 'Invalid folder name' } });
            const unsafeParent = await fetch(`${server.origin}/api/media/folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'escape', parentPath: '../outside' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(unsafeParent).toMatchObject({ status: 403, body: { error: 'Invalid parent path' } });
            const unsafeBackslash = await fetch(`${server.origin}/api/media/file/${encodeURIComponent('..\\\\outside.svg')}`);
            expect(unsafeBackslash.status).toBe(403);
            const rootDelete = await fetch(`${server.origin}/api/media/`, { method: 'DELETE' });
            expect(rootDelete.status).toBe(403);
            expect(fs.existsSync(mediaDir)).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'outside.svg'))).toBe(true);
        }
        finally {
            await server.close();
        }
    });
});
