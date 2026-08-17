import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupProjectApiTestRoots, createTempRoot, scopeProjectApiUrl, startTestServer, writeProjectMetadata, } from './projects-api.helpers';
afterEach(() => {
    cleanupProjectApiTestRoots();
});
function writeFilesystemDocsProject(projectRoot, id) {
    writeProjectMetadata(projectRoot, {
        project: { id, name: id },
        resources: {
            prototypes: [],
            docs: [],
            themes: [],
            data: [],
            templates: [],
        },
        navigation: { prototypes: [], docs: [] },
        orders: { themes: [], data: [], templates: [] },
        resourceWriteTargets: {},
    });
    const resourcesDir = path.join(projectRoot, 'src/resources');
    fs.rmSync(path.join(resourcesDir, 'spec.md'), { force: true });
    return resourcesDir;
}
describe('workspace resource move atomicity', () => {
    it('preserves an unchanged existing folder basename exactly', async () => {
        const projectRoot = createTempRoot();
        const resourcesDir = writeFilesystemDocsProject(projectRoot, 'stable-folder-name-client');
        const canonicalSidecar = path.join(resourcesDir, '规格文档 HTML 模板.assets');
        const normalizedSidecar = path.join(resourcesDir, '规格文档-HTML-模板.assets');
        fs.mkdirSync(path.join(canonicalSidecar, 'diagrams'), { recursive: true });
        fs.writeFileSync(path.join(canonicalSidecar, 'diagram-manifest.json'), '{}\n', 'utf8');
        fs.writeFileSync(path.join(canonicalSidecar, 'diagrams/flow.excalidraw'), '{"type":"excalidraw"}\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const navigationUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`);
            const current = await fetch(navigationUrl).then((response) => response.json());
            const update = await fetch(navigationUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: current.tree }),
            });
            expect(update.status).toBe(200);
            expect(fs.existsSync(path.join(canonicalSidecar, 'diagrams/flow.excalidraw'))).toBe(true);
            expect(fs.existsSync(normalizedSidecar)).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('lets a parent folder rename carry unchanged descendants', async () => {
        const projectRoot = createTempRoot();
        const resourcesDir = writeFilesystemDocsProject(projectRoot, 'parent-folder-rename-client');
        fs.mkdirSync(path.join(resourcesDir, '父目录/子目录'), { recursive: true });
        fs.writeFileSync(path.join(resourcesDir, '父目录/子目录/note.md'), '# Note\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const navigationUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`);
            const current = await fetch(navigationUrl).then((response) => response.json());
            const nextTree = current.tree.map((node) => (node.folderPath === '父目录' ? { ...node, title: 'renamed parent' } : node));
            const update = await fetch(navigationUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: nextTree }),
            });
            expect(update.status).toBe(200);
            expect(fs.readFileSync(path.join(resourcesDir, 'renamed-parent/子目录/note.md'), 'utf8')).toBe('# Note\n');
            expect(fs.existsSync(path.join(resourcesDir, '父目录'))).toBe(false);
            expect(fs.existsSync(path.join(resourcesDir, 'renamed-parent/子目录/子目录'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('leaves every resource in place when a later move conflicts', async () => {
        const projectRoot = createTempRoot();
        const resourcesDir = writeFilesystemDocsProject(projectRoot, 'resource-move-conflict-client');
        fs.mkdirSync(path.join(resourcesDir, 'archive'), { recursive: true });
        fs.writeFileSync(path.join(resourcesDir, 'a.md'), '# Root A\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'b.md'), '# Root B\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'archive/b.md'), '# Archived B\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const navigationUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`);
            const current = await fetch(navigationUrl).then((response) => response.json());
            const archive = current.tree.find((node) => node.folderPath === 'archive');
            const rootA = current.tree.find((node) => node.itemKey === 'docs/a.md');
            const rootB = current.tree.find((node) => node.itemKey === 'docs/b.md');
            expect(archive).toBeTruthy();
            expect(rootA).toBeTruthy();
            expect(rootB).toBeTruthy();
            const update = await fetch(navigationUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [{ ...archive, children: [rootA, rootB] }],
                }),
            });
            expect(update.status).toBe(409);
            expect(fs.readFileSync(path.join(resourcesDir, 'a.md'), 'utf8')).toBe('# Root A\n');
            expect(fs.existsSync(path.join(resourcesDir, 'archive/a.md'))).toBe(false);
            expect(fs.readFileSync(path.join(resourcesDir, 'b.md'), 'utf8')).toBe('# Root B\n');
            expect(fs.readFileSync(path.join(resourcesDir, 'archive/b.md'), 'utf8')).toBe('# Archived B\n');
        }
        finally {
            await server.close();
        }
    });
    it('renames a parent before moving another folder beneath it', async () => {
        const projectRoot = createTempRoot();
        const resourcesDir = writeFilesystemDocsProject(projectRoot, 'parent-reparent-client');
        fs.mkdirSync(path.join(resourcesDir, 'alpha'), { recursive: true });
        fs.mkdirSync(path.join(resourcesDir, 'beta'), { recursive: true });
        fs.writeFileSync(path.join(resourcesDir, 'alpha/alpha.md'), '# Alpha\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'beta/beta.md'), '# Beta\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const navigationUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`);
            const current = await fetch(navigationUrl).then((response) => response.json());
            const alpha = current.tree.find((node) => node.folderPath === 'alpha');
            const beta = current.tree.find((node) => node.folderPath === 'beta');
            expect(alpha).toBeTruthy();
            expect(beta).toBeTruthy();
            const update = await fetch(navigationUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [{ ...alpha, title: 'renamed alpha', children: [...alpha.children, beta] }],
                }),
            });
            expect(update.status).toBe(200);
            expect(fs.readFileSync(path.join(resourcesDir, 'renamed-alpha/alpha.md'), 'utf8')).toBe('# Alpha\n');
            expect(fs.readFileSync(path.join(resourcesDir, 'renamed-alpha/beta/beta.md'), 'utf8')).toBe('# Beta\n');
            expect(fs.existsSync(path.join(resourcesDir, 'alpha'))).toBe(false);
            expect(fs.existsSync(path.join(resourcesDir, 'beta'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
