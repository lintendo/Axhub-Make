import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getProjectRegistryPath } from '../projectCore/index.ts';
import { cleanupProjectApiTestRoots, createTempRoot, startTestServer, writeProjectMetadata, } from './projects-api.helpers';
afterEach(() => {
    cleanupProjectApiTestRoots();
});
describe('make-server project folder browser APIs', () => {
    it('lists direct child folders including Chinese names and ignores files', async () => {
        const defaultRoot = createTempRoot('axhub-make-default-');
        writeProjectMetadata(defaultRoot);
        const browserRoot = createTempRoot('axhub-make-browser-中文-');
        const childRoot = path.join(browserRoot, '客户项目');
        fs.mkdirSync(childRoot, { recursive: true });
        fs.mkdirSync(path.join(browserRoot, 'alpha'), { recursive: true });
        fs.writeFileSync(path.join(browserRoot, 'readme.md'), '# File\n', 'utf8');
        const server = await startTestServer(defaultRoot);
        try {
            const response = await fetch(`${server.origin}/api/projects/browse-folders?path=${encodeURIComponent(browserRoot)}`);
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                path: path.resolve(browserRoot),
                home: expect.any(String),
                parent: path.dirname(path.resolve(browserRoot)),
            });
            expect(body.folders).toEqual([
                { name: 'alpha', path: path.join(browserRoot, 'alpha') },
                { name: '客户项目', path: childRoot },
            ]);
            expect(JSON.stringify(body.folders)).not.toContain('readme.md');
        }
        finally {
            await server.close();
        }
    });
    it('creates a Chinese child folder under a Chinese parent path', async () => {
        const defaultRoot = createTempRoot('axhub-make-default-');
        writeProjectMetadata(defaultRoot);
        const parentRoot = path.join(createTempRoot('axhub-make-parent-'), '父目录');
        fs.mkdirSync(parentRoot, { recursive: true });
        const server = await startTestServer(defaultRoot);
        try {
            const response = await fetch(`${server.origin}/api/projects/folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentPath: parentRoot,
                    folderName: '中文项目',
                }),
            });
            const body = await response.json();
            const expectedPath = path.join(parentRoot, '中文项目');
            expect(response.status).toBe(201);
            expect(body).toEqual({ path: expectedPath });
            expect(fs.statSync(expectedPath).isDirectory()).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('rejects folder creation without an explicit parent path', async () => {
        const defaultRoot = createTempRoot('axhub-make-default-');
        writeProjectMetadata(defaultRoot);
        const server = await startTestServer(defaultRoot);
        try {
            const response = await fetch(`${server.origin}/api/projects/folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderName: '中文项目' }),
            });
            const body = await response.json();
            expect(response.status).toBe(400);
            expect(body).toMatchObject({ code: 'MISSING_PARENT_PATH' });
        }
        finally {
            await server.close();
        }
    });
    it('returns NOT_DIRECTORY when browsing a file path', async () => {
        const defaultRoot = createTempRoot('axhub-make-default-');
        writeProjectMetadata(defaultRoot);
        const browserRoot = createTempRoot('axhub-make-browser-');
        const filePath = path.join(browserRoot, 'file.txt');
        fs.writeFileSync(filePath, 'not a directory\n', 'utf8');
        const server = await startTestServer(defaultRoot);
        try {
            const response = await fetch(`${server.origin}/api/projects/browse-folders?path=${encodeURIComponent(filePath)}`);
            const body = await response.json();
            expect(response.status).toBe(400);
            expect(body).toMatchObject({ code: 'NOT_DIRECTORY' });
        }
        finally {
            await server.close();
        }
    });
    it('rejects invalid Windows folder names and traversal segments', async () => {
        const defaultRoot = createTempRoot('axhub-make-default-');
        writeProjectMetadata(defaultRoot);
        const parentRoot = createTempRoot('axhub-make-parent-');
        const server = await startTestServer(defaultRoot);
        try {
            for (const folderName of ['CON', '项目:', '..', 'child/name', 'trail.']) {
                const response = await fetch(`${server.origin}/api/projects/folders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parentPath: parentRoot, folderName }),
                });
                const body = await response.json();
                expect(response.status).toBe(400);
                expect(body).toMatchObject({ code: 'INVALID_FOLDER_NAME' });
            }
        }
        finally {
            await server.close();
        }
    });
    it('handles setup folder APIs before default project metadata validation', async () => {
        const defaultRoot = path.join(createTempRoot('axhub-make-missing-default-parent-'), 'missing-default');
        const registryHome = createTempRoot('axhub-make-registry-home-');
        const browserRoot = createTempRoot('axhub-make-browser-');
        const server = await startTestServer(defaultRoot, registryHome);
        try {
            const response = await fetch(`${server.origin}/api/projects/browse-folders?path=${encodeURIComponent(browserRoot)}`);
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body).toMatchObject({ path: browserRoot });
            expect(fs.existsSync(getProjectRegistryPath(registryHome))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
