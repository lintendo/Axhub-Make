import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const childProcessMock = vi.hoisted(() => ({
    execFile: vi.fn((_file, _args, optionsOrCallback, maybeCallback) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        if (typeof callback === 'function') {
            callback(null, '', '');
        }
    }),
}));
const localCommandMock = vi.hoisted(() => ({
    runLocalCommand: vi.fn(async (command, args) => ({
        stdout: '',
        stderr: '',
        command,
        escapedCommand: [command, ...args].join(' '),
    })),
}));
vi.mock('node:child_process', async (importActual) => {
    const actual = await importActual();
    return {
        ...actual,
        execFile: childProcessMock.execFile,
    };
});
vi.mock('../localCommand.ts', async (importActual) => {
    const actual = await importActual();
    return {
        ...actual,
        runLocalCommand: localCommandMock.runLocalCommand,
    };
});
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, scopeProjectApiUrl, startTestServer, writeJson, writeProjectMetadata as writeBaseProjectMetadata, } from './projects-api.helpers';
import { getMakeClientMarkerPath } from '../projectCore/index.ts';
import { buildSystemOpenCommand } from '../managementApi.workspace.ts';
import { runLocalCommand } from '../localCommand.ts';
const runLocalCommandMock = vi.mocked(runLocalCommand);
afterEach(() => {
    childProcessMock.execFile.mockClear();
    runLocalCommandMock.mockClear();
    cleanupProjectApiTestRoots();
});
function writeMakeClientMarkerForProject(projectRoot, id, name) {
    writeJson(getMakeClientMarkerPath(projectRoot), {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: { id, name },
    });
}
function writeProjectMetadata(projectRoot, overrides = {}) {
    const result = writeBaseProjectMetadata(projectRoot, overrides);
    fs.rmSync(path.join(projectRoot, 'src/resources/spec.md'), { force: true });
    return result;
}
function writeResourceProject(projectRoot) {
    writeMakeClientMarkerForProject(projectRoot, 'resource-tree-client', 'Resource Tree Client');
    writeProjectMetadata(projectRoot, {
        project: { id: 'resource-tree-client', name: 'Resource Tree Client' },
        resources: {
            prototypes: [],
            docs: [],
            themes: [],
            data: [],
            templates: [],
        },
        navigation: { prototypes: [], docs: [] },
        orders: { themes: [], data: [], templates: [] },
        capabilities: {
            quickEdit: true,
            quickEditMode: 'clientRuntime',
            figmaExport: true,
            axureExport: true,
            resourceWrites: {
                docCreate: true,
            },
        },
        resourceWriteTargets: {
            docs: { type: 'project-relative-path', path: 'src/resources' },
        },
    });
}
function findNode(nodes, predicate) {
    for (const node of nodes) {
        if (predicate(node)) {
            return node;
        }
        const child = Array.isArray(node.children) ? findNode(node.children, predicate) : null;
        if (child) {
            return child;
        }
    }
    return null;
}
describe('make-server resource sidebar filesystem tree API', () => {
    it('exposes src/resources files with extension-derived open modes', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'resource-open-mode-client', 'Resource Open Mode Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'resource-open-mode-client', name: 'Resource Open Mode Client' },
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
        fs.mkdirSync(path.join(resourcesDir, 'flows'), { recursive: true });
        fs.mkdirSync(path.join(resourcesDir, 'assets'), { recursive: true });
        fs.mkdirSync(path.join(resourcesDir, 'new-folder'), { recursive: true });
        fs.writeFileSync(path.join(resourcesDir, 'brief.md'), '# Brief\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'new-folder/fabu.md'), 'Nested markdown body.\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'flows/app.excalidraw'), '{"type":"excalidraw"}\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'flows/chart.drawio'), '<mxfile />\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'assets/logo.png'), 'png', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'data.csv'), 'id,name\n1,Ada\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'schema.json'), '{"ok":true}\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects/resource-open-mode-client/resources`));
            const body = await response.json();
            const docs = body.resources.docs;
            expect(response.status).toBe(200);
            expect(body.resources).not.toHaveProperty('canvas');
            expect(body.resources).not.toHaveProperty('data');
            expect(body.resources).not.toHaveProperty('templates');
            expect(docs).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    path: 'brief.md',
                    name: 'brief',
                    title: 'Brief',
                    ext: '.md',
                    openMode: 'document',
                    absoluteFilePath: path.join(resourcesDir, 'brief.md'),
                }),
                expect.objectContaining({
                    path: 'new-folder/fabu.md',
                    name: 'new-folder/fabu',
                    title: 'fabu',
                    ext: '.md',
                    openMode: 'document',
                    absoluteFilePath: path.join(resourcesDir, 'new-folder/fabu.md'),
                }),
                expect.objectContaining({
                    path: 'flows/app.excalidraw',
                    name: 'flows/app.excalidraw',
                    ext: '.excalidraw',
                    openMode: 'canvas',
                    absoluteFilePath: path.join(resourcesDir, 'flows/app.excalidraw'),
                }),
                expect.objectContaining({
                    path: 'flows/chart.drawio',
                    name: 'flows/chart.drawio',
                    ext: '.drawio',
                    openMode: 'drawio',
                }),
                expect.objectContaining({
                    path: 'assets/logo.png',
                    name: 'assets/logo.png',
                    ext: '.png',
                    openMode: 'image',
                }),
                expect.objectContaining({
                    path: 'data.csv',
                    name: 'data.csv',
                    ext: '.csv',
                    openMode: 'file',
                }),
                expect.objectContaining({
                    path: 'schema.json',
                    name: 'schema.json',
                    ext: '.json',
                    openMode: 'file',
                }),
            ]));
            expect(docs.find((item) => item.path === 'flows/app.excalidraw')).toEqual(expect.objectContaining({
                size: expect.any(Number),
                updatedAt: expect.any(String),
            }));
        }
        finally {
            await server.close();
        }
    });
    it('scans the default src/resources tree when no docs resource root is declared', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'default-resource-tree-client', 'Default Resource Tree Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-resource-tree-client', name: 'Default Resource Tree Client' },
            resources: {
                prototypes: [],
                docs: [
                    { id: 'stale', name: 'stale.md', title: 'Stale' },
                ],
                themes: [],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: ['stale'] },
            orders: { themes: [], data: [], templates: [] },
            resourceWriteTargets: {},
        });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/assets/icons'), { recursive: true });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/templates/nested'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/README.md'), '# Resources\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/assets/icons/logo.png'), 'png', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/prd-template.md'), '# PRD\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/nested/visual.html'), '<h1>Visual</h1>\n', 'utf8');
        writeJson(path.join(projectRoot, '.axhub/make/sidebar-tree.json'), {
            version: 1,
            updatedAt: '2026-05-19T00:00:00.000Z',
            prototypes: [],
            docs: [
                { id: 'item-docs-prd-template', kind: 'item', title: 'PRD 模板', itemKey: 'docs/prd-template.md' },
            ],
            themesTree: [],
            themes: [],
            data: [],
            templates: [],
        });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.tree).toEqual([
                expect.objectContaining({
                    id: 'folder-docs-assets',
                    kind: 'folder',
                    title: 'assets',
                    path: 'assets',
                    folderPath: 'assets',
                    children: [
                        expect.objectContaining({
                            id: 'folder-docs-assets-icons',
                            kind: 'folder',
                            title: 'icons',
                            path: 'assets/icons',
                            folderPath: 'assets/icons',
                            children: [
                                expect.objectContaining({
                                    kind: 'item',
                                    title: 'logo',
                                    itemKey: 'docs/assets/icons/logo.png',
                                    path: 'assets/icons/logo.png',
                                }),
                            ],
                        }),
                    ],
                }),
                expect.objectContaining({
                    id: 'folder-docs-templates',
                    kind: 'folder',
                    title: 'templates',
                    path: 'templates',
                    folderPath: 'templates',
                    children: [
                        expect.objectContaining({
                            id: 'folder-docs-templates-nested',
                            kind: 'folder',
                            title: 'nested',
                            path: 'templates/nested',
                            folderPath: 'templates/nested',
                            children: [
                                expect.objectContaining({
                                    kind: 'item',
                                    title: 'visual',
                                    itemKey: 'docs/templates/nested/visual.html',
                                    path: 'templates/nested/visual.html',
                                }),
                            ],
                        }),
                        expect.objectContaining({
                            kind: 'item',
                            title: 'prd-template',
                            itemKey: 'docs/templates/prd-template.md',
                            path: 'templates/prd-template.md',
                        }),
                    ],
                }),
            ]);
            expect(findNode(body.tree, (node) => node.title === 'PRD 模板')).toBeNull();
            expect(JSON.stringify(body.tree)).not.toContain('README.md');
        }
        finally {
            await server.close();
        }
    });
    it('serves an empty default src/resources tree instead of stale persisted docs', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'empty-default-resource-tree-client', 'Empty Default Resource Tree Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'empty-default-resource-tree-client', name: 'Empty Default Resource Tree Client' },
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
        fs.mkdirSync(path.join(projectRoot, 'src/resources'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/README.md'), '# Resources\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/.gitkeep'), '', 'utf8');
        writeJson(path.join(projectRoot, '.axhub/make/sidebar-tree.json'), {
            version: 1,
            updatedAt: '2026-05-19T00:00:00.000Z',
            prototypes: [],
            docs: [
                { id: 'item-docs-stale', kind: 'item', title: 'Stale', itemKey: 'docs/stale.md' },
            ],
            themesTree: [],
            themes: [],
            data: [],
            templates: [],
        });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.tree).toEqual([]);
        }
        finally {
            await server.close();
        }
    });
    it('moves files in the default src/resources tree when the resource tree is persisted', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'default-resource-move-client', 'Default Resource Move Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-resource-move-client', name: 'Default Resource Move Client' },
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
        fs.mkdirSync(path.join(projectRoot, 'src/resources/templates'), { recursive: true });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/archive'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/prd-template.md'), '# PRD\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const archive = findNode(current.tree, (node) => node.folderPath === 'archive');
            const templates = findNode(current.tree, (node) => node.folderPath === 'templates');
            const template = findNode(current.tree, (node) => node.itemKey === 'docs/templates/prd-template.md');
            expect(archive).toBeTruthy();
            expect(templates).toBeTruthy();
            expect(template).toBeTruthy();
            const update = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            ...archive,
                            children: [template],
                        },
                        {
                            ...templates,
                            children: [],
                        },
                    ],
                }),
            });
            const body = await update.json();
            expect(update.status).toBe(200);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/templates/prd-template.md'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/prd-template.md'), 'utf8')).toBe('# PRD\n');
            expect(findNode(body.tree, (node) => node.itemKey === 'docs/archive/prd-template.md')).toBeTruthy();
        }
        finally {
            await server.close();
        }
    });
    it('reports a name conflict when moving a resource file into a folder with the same file name', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'default-resource-conflict-client', 'Default Resource Conflict Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-resource-conflict-client', name: 'Default Resource Conflict Client' },
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
        fs.mkdirSync(path.join(projectRoot, 'src/resources/archive'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/notes.md'), '# Root notes\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/archive/notes.md'), '# Archived notes\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const archive = findNode(current.tree, (node) => node.folderPath === 'archive');
            const rootNotes = findNode(current.tree, (node) => node.itemKey === 'docs/notes.md');
            expect(archive).toBeTruthy();
            expect(rootNotes).toBeTruthy();
            const update = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            ...archive,
                            children: [
                                ...(archive.children || []),
                                rootNotes,
                            ],
                        },
                    ],
                }),
            });
            const body = await update.json();
            expect(update.status).toBe(409);
            expect(body).toEqual({
                error: '目标文件夹中已存在同名资源：archive/notes.md',
                code: 'RESOURCE_NAME_CONFLICT',
                path: 'archive/notes.md',
            });
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/notes.md'), 'utf8')).toBe('# Root notes\n');
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/notes.md'), 'utf8')).toBe('# Archived notes\n');
        }
        finally {
            await server.close();
        }
    });
    it('opens files from the default src/resources tree through the local filesystem opener', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'default-resource-open-client', 'Default Resource Open Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-resource-open-client', name: 'Default Resource Open Client' },
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
        fs.mkdirSync(path.join(projectRoot, 'src/resources/assets'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/assets/logo.png'), 'png', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'assets/logo.png' }),
            });
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                success: true,
                type: 'docs',
                path: 'assets/logo.png',
                kind: 'file',
            });
            const openCommand = buildSystemOpenCommand(path.join(projectRoot, 'src/resources/assets'));
            expect(runLocalCommandMock).toHaveBeenCalledWith(openCommand.command, openCommand.args, expect.objectContaining({ timeoutMs: 10000 }));
        }
        finally {
            await server.close();
        }
    });
    it('keeps create, upload, rename, copy, delete, and move operations in sync with the default src/resources tree', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'default-resource-ops-client', 'Default Resource Ops Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-resource-ops-client', name: 'Default Resource Ops Client' },
            resources: {
                prototypes: [],
                docs: [],
                themes: [],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: [], data: [], templates: [] },
            capabilities: {
                quickEdit: true,
                quickEditMode: 'clientRuntime',
                figmaExport: true,
                axureExport: true,
                resourceWrites: {
                    docCreate: true,
                },
            },
            resourceWriteTargets: {},
        });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/archive'), { recursive: true });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/templates'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/base.md'), '# Base\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const createdFolder = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation/folders?tab=docs`), {
                method: 'POST',
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(createdFolder.status).toBe(201);
            expect(createdFolder.body.createdFolderId).toBe('folder-docs-new-folder');
            expect(fs.statSync(path.join(projectRoot, 'src/resources/new-folder')).isDirectory()).toBe(true);
            const uploadBody = new FormData();
            uploadBody.set('projectId', 'default-resource-ops-client');
            uploadBody.set('targetFolder', 'new-folder');
            uploadBody.set('file', new Blob(['# Uploaded\n'], { type: 'text/markdown' }), 'uploaded.md');
            const uploaded = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/upload`), {
                method: 'POST',
                body: uploadBody,
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(uploaded.status).toBe(201);
            expect(uploaded.body.files[0]).toMatchObject({
                name: 'uploaded.md',
                displayName: 'Uploaded',
                path: 'new-folder/uploaded.md',
            });
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/new-folder/uploaded.md'), 'utf8')).toBe('# Uploaded\n');
            const renamed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('new-folder/uploaded.md')}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'default-resource-ops-client', newBaseName: 'renamed-note' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(renamed.status).toBe(200);
            expect(renamed.body.name).toBe('renamed-note.md');
            expect(renamed.body.path).toBe('new-folder/renamed-note.md');
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/new-folder/uploaded.md'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/new-folder/renamed-note.md'), 'utf8')).toBe('# Uploaded\n');
            const copied = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('new-folder/renamed-note.md')}/copy`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'default-resource-ops-client', displayName: 'Copied Note' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(copied.status).toBe(201);
            expect(copied.body.name).toBe('copied-note.md');
            expect(copied.body.path).toBe('new-folder/copied-note.md');
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/new-folder/copied-note.md'), 'utf8')).toBe('# Uploaded\n');
            const deleted = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('new-folder/copied-note.md')}`), {
                method: 'DELETE',
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(deleted.status).toBe(200);
            expect(deleted.body.success).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/new-folder/copied-note.md'))).toBe(false);
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const archive = findNode(current.tree, (node) => node.folderPath === 'archive');
            const newFolder = findNode(current.tree, (node) => node.folderPath === 'new-folder');
            const movedDoc = findNode(current.tree, (node) => node.itemKey === 'docs/new-folder/renamed-note.md');
            const templates = findNode(current.tree, (node) => node.folderPath === 'templates');
            expect(archive).toBeTruthy();
            expect(newFolder).toBeTruthy();
            expect(movedDoc).toBeTruthy();
            expect(templates).toBeTruthy();
            const moved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            ...archive,
                            children: [movedDoc],
                        },
                        {
                            ...newFolder,
                            children: [],
                        },
                        templates,
                    ],
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(moved.status).toBe(200);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/new-folder/renamed-note.md'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/renamed-note.md'), 'utf8')).toBe('# Uploaded\n');
            expect(findNode(moved.body.tree, (node) => node.itemKey === 'docs/archive/renamed-note.md')).toBeTruthy();
            const imageUploadBody = new FormData();
            imageUploadBody.set('projectId', 'default-resource-ops-client');
            imageUploadBody.set('targetFolder', 'new-folder');
            imageUploadBody.set('file', new Blob(['PNGDATA'], { type: 'image/png' }), 'icon.png');
            const uploadedImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/upload`), {
                method: 'POST',
                body: imageUploadBody,
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(uploadedImage.status).toBe(201);
            expect(uploadedImage.body.files[0]).toMatchObject({
                name: 'icon.png',
                path: 'new-folder/icon.png',
            });
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/new-folder/icon.png'), 'utf8')).toBe('PNGDATA');
            const renamedImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('new-folder/icon.png')}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'default-resource-ops-client', newBaseName: 'brand-icon' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(renamedImage.status).toBe(200);
            expect(renamedImage.body.name).toBe('brand-icon.png');
            expect(renamedImage.body.path).toBe('new-folder/brand-icon.png');
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/new-folder/icon.png'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/new-folder/brand-icon.png'), 'utf8')).toBe('PNGDATA');
            const copiedImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('new-folder/brand-icon.png')}/copy`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'default-resource-ops-client', displayName: 'Brand Icon Copy' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(copiedImage.status).toBe(201);
            expect(copiedImage.body.name).toBe('brand-icon-copy.png');
            expect(copiedImage.body.path).toBe('new-folder/brand-icon-copy.png');
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/new-folder/brand-icon-copy.png'), 'utf8')).toBe('PNGDATA');
            const deletedImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('new-folder/brand-icon-copy.png')}`), {
                method: 'DELETE',
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(deletedImage.status).toBe(200);
            expect(deletedImage.body.success).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/new-folder/brand-icon-copy.png'))).toBe(false);
            const currentAfterImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const archiveAfterImage = findNode(currentAfterImage.tree, (node) => node.folderPath === 'archive');
            const newFolderAfterImage = findNode(currentAfterImage.tree, (node) => node.folderPath === 'new-folder');
            const imageToMove = findNode(currentAfterImage.tree, (node) => node.itemKey === 'docs/new-folder/brand-icon.png');
            const templatesAfterImage = findNode(currentAfterImage.tree, (node) => node.folderPath === 'templates');
            expect(archiveAfterImage).toBeTruthy();
            expect(newFolderAfterImage).toBeTruthy();
            expect(imageToMove).toBeTruthy();
            expect(templatesAfterImage).toBeTruthy();
            const movedImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            ...archiveAfterImage,
                            children: [
                                ...(archiveAfterImage.children ?? []),
                                imageToMove,
                            ],
                        },
                        {
                            ...newFolderAfterImage,
                            children: [],
                        },
                        templatesAfterImage,
                    ],
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(movedImage.status).toBe(200);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/new-folder/brand-icon.png'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/brand-icon.png'), 'utf8')).toBe('PNGDATA');
            expect(findNode(movedImage.body.tree, (node) => node.itemKey === 'docs/archive/brand-icon.png')).toBeTruthy();
        }
        finally {
            await server.close();
        }
    });
    it('scans real resource folders for the resource tab', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/research'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/README.md'), '# Resource Guide\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/overview.md'), '# Overview\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/research/notes.md'), '# Notes\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.tree).toEqual([
                expect.objectContaining({
                    id: 'folder-docs-research',
                    kind: 'folder',
                    title: 'research',
                    path: 'research',
                    folderPath: 'research',
                    children: [
                        expect.objectContaining({
                            kind: 'item',
                            title: 'notes',
                            itemKey: 'docs/research/notes.md',
                            path: 'research/notes.md',
                        }),
                    ],
                }),
                expect.objectContaining({
                    kind: 'item',
                    title: 'overview',
                    itemKey: 'docs/overview.md',
                    path: 'overview.md',
                }),
            ]);
            expect(JSON.stringify(body.tree)).not.toContain('README.md');
        }
        finally {
            await server.close();
        }
    });
    it('generates stable unique ids for non-ASCII resource paths', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/原型.md'), '# Prototype\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/资源.md'), '# Resources\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/设计.md'), '# Design\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`));
            const body = await response.json();
            const ids = body.tree.map((node) => node.id);
            expect(response.status).toBe(200);
            expect(ids).toHaveLength(3);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids.every((id) => /^[a-zA-Z0-9_-]+$/u.test(id))).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('creates a real resource folder from the resource tab', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation/folders?tab=docs`), {
                method: 'POST',
            });
            const body = await response.json();
            expect(response.status).toBe(201);
            expect(body.createdFolderId).toBe('folder-docs-new-folder');
            expect(fs.statSync(path.join(projectRoot, 'src/resources/new-folder')).isDirectory()).toBe(true);
            expect(body.tree).toEqual([
                expect.objectContaining({
                    id: 'folder-docs-new-folder',
                    kind: 'folder',
                    title: 'new-folder',
                    path: 'new-folder',
                    folderPath: 'new-folder',
                }),
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('ensures and reuses a named real resource folder for image AI storage', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        const server = await startTestServer(projectRoot);
        try {
            const requestUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation/folders?tab=docs`);
            const ensureFolder = () => fetch(requestUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath: 'images' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            const first = await ensureFolder();
            const second = await ensureFolder();
            expect(first.status).toBe(201);
            expect(first.body.created).toBe(true);
            expect(first.body.folder).toMatchObject({
                id: 'folder-docs-images',
                kind: 'folder',
                title: 'images',
                path: 'images',
                folderPath: 'images',
            });
            expect(first.body.absolutePath).toBe(path.join(projectRoot, 'src/resources/images'));
            expect(second.status).toBe(200);
            expect(second.body.created).toBe(false);
            expect(second.body.absolutePath).toBe(first.body.absolutePath);
            expect(fs.readdirSync(path.join(projectRoot, 'src/resources')).filter((name) => name === 'images')).toHaveLength(1);
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe named resource folders and non-directory collisions', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        const server = await startTestServer(projectRoot);
        try {
            const requestUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation/folders?tab=docs`);
            const ensureFolder = (folderPath) => fetch(requestUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath }),
            });
            for (const unsafePath of ['../outside', '/absolute', 'C:\\absolute', 'nested//empty', 'nested/./relative']) {
                const response = await ensureFolder(unsafePath);
                expect(response.status).toBe(400);
            }
            fs.writeFileSync(path.join(projectRoot, 'src/resources/images'), 'not a directory', 'utf8');
            const collisionResponse = await ensureFolder('images');
            expect(collisionResponse.status).toBe(409);
            await expect(collisionResponse.json()).resolves.toMatchObject({
                error: 'Resource folder path is not a directory',
            });
        }
        finally {
            await server.close();
        }
    });
    it('opens resource files and folders through the local filesystem opener', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/research'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/research/notes.md'), '# Notes\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const fileResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'research/notes.md' }),
            });
            const fileBody = await fileResponse.json();
            expect(fileResponse.status).toBe(200);
            expect(fileBody).toMatchObject({
                success: true,
                path: 'research/notes.md',
                kind: 'file',
            });
            const fileOpenCommand = buildSystemOpenCommand(path.join(projectRoot, 'src/resources/research'));
            expect(runLocalCommandMock).toHaveBeenCalledWith(fileOpenCommand.command, fileOpenCommand.args, expect.objectContaining({ timeoutMs: 10000 }));
            expect(childProcessMock.execFile).not.toHaveBeenCalled();
            const folderResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'research', kind: 'folder' }),
            });
            const folderBody = await folderResponse.json();
            expect(folderResponse.status).toBe(200);
            expect(folderBody).toMatchObject({
                success: true,
                path: 'research',
                kind: 'directory',
            });
            const folderOpenCommand = buildSystemOpenCommand(path.join(projectRoot, 'src/resources/research'));
            expect(runLocalCommandMock).toHaveBeenCalledWith(folderOpenCommand.command, folderOpenCommand.args, expect.objectContaining({ timeoutMs: 10000 }));
            expect(childProcessMock.execFile).not.toHaveBeenCalled();
        }
        finally {
            await server.close();
        }
    });
    it('opens design folders through the local filesystem opener', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'content/themes/brand'), { recursive: true });
        writeProjectMetadata(projectRoot, {
            project: { id: 'resource-tree-client', name: 'Resource Tree Client' },
            resources: {
                prototypes: [],
                docs: [],
                themes: [{ id: 'brand', name: 'brand', title: 'Brand', path: 'content/themes/brand' }],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: ['brand'], data: [], templates: [] },
            resourceWriteTargets: {
                docs: { type: 'project-relative-path', path: 'src/resources' },
                themes: { type: 'project-relative-path', path: 'content/themes' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'themes', path: 'brand', kind: 'folder' }),
            });
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                success: true,
                type: 'themes',
                path: 'brand',
                kind: 'directory',
            });
            const openCommand = buildSystemOpenCommand(path.join(projectRoot, 'content/themes/brand'));
            expect(runLocalCommandMock).toHaveBeenCalledWith(openCommand.command, openCommand.args, expect.objectContaining({ timeoutMs: 10000 }));
            expect(childProcessMock.execFile).not.toHaveBeenCalled();
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe resource filesystem open paths', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/.hidden'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/.hidden/secret.md'), '# Secret\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const escapeResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '../secret.md' }),
            });
            const hiddenResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '.hidden/secret.md' }),
            });
            expect(escapeResponse.status).toBe(403);
            expect(hiddenResponse.status).toBe(403);
            expect(childProcessMock.execFile).not.toHaveBeenCalled();
        }
        finally {
            await server.close();
        }
    });
    it('builds parameterized local filesystem open commands for each platform', () => {
        const targetPath = '/workspace/demo/Project Files/notes.md';
        const windowsTargetPath = 'E:\\make11\\src\\resources\\新文件夹';
        expect(buildSystemOpenCommand(targetPath, 'darwin')).toEqual({
            command: 'open',
            args: [targetPath],
        });
        expect(buildSystemOpenCommand(windowsTargetPath, 'win32')).toEqual({
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                'Invoke-Item -LiteralPath $args[0] -ErrorAction Stop',
                windowsTargetPath,
            ],
        });
        expect(buildSystemOpenCommand(targetPath, 'linux')).toEqual({
            command: 'xdg-open',
            args: [targetPath],
        });
    });
    it('moves resource files and folders when the resource tree is persisted', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/research'), { recursive: true });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/archive'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/overview.md'), '# Overview\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/research/notes.md'), '# Notes\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const research = findNode(current.tree, (node) => node.folderPath === 'research');
            const archive = findNode(current.tree, (node) => node.folderPath === 'archive');
            const overview = findNode(current.tree, (node) => node.itemKey === 'docs/overview.md');
            expect(research).toBeTruthy();
            expect(archive).toBeTruthy();
            expect(overview).toBeTruthy();
            const nextTree = [
                {
                    ...archive,
                    children: [
                        overview,
                        research,
                    ],
                },
            ];
            const update = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: nextTree }),
            });
            const body = await update.json();
            expect(update.status).toBe(200);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/overview.md'))).toBe(false);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/research'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/overview.md'), 'utf8')).toBe('# Overview\n');
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/research/notes.md'), 'utf8')).toBe('# Notes\n');
            expect(findNode(body.tree, (node) => node.itemKey === 'docs/archive/overview.md')).toBeTruthy();
            expect(findNode(body.tree, (node) => node.folderPath === 'archive/research')).toBeTruthy();
        }
        finally {
            await server.close();
        }
    });
    it('moves resource files into folder nodes that only carry a folder title', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/archive'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/overview.md'), '# Overview\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const archive = findNode(current.tree, (node) => node.folderPath === 'archive');
            const overview = findNode(current.tree, (node) => node.itemKey === 'docs/overview.md');
            expect(archive).toBeTruthy();
            expect(overview).toBeTruthy();
            const update = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            id: archive.id,
                            kind: 'folder',
                            title: archive.title,
                            children: [overview],
                        },
                    ],
                }),
            });
            const body = await update.json();
            expect(update.status).toBe(200);
            expect(body.success).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/overview.md'))).toBe(false);
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/archive/overview.md'), 'utf8')).toBe('# Overview\n');
            expect(findNode(body.tree, (node) => node.itemKey === 'docs/archive/overview.md')).toBeTruthy();
        }
        finally {
            await server.close();
        }
    });
    it('deletes empty resource folders but rejects non-empty folder removal', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/empty'), { recursive: true });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/filled'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/filled/notes.md'), '# Notes\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const filled = findNode(current.tree, (node) => node.folderPath === 'filled');
            const removeFilled = current.tree.filter((node) => node.folderPath !== 'filled');
            const rejected = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: removeFilled }),
            });
            const rejectedBody = await rejected.json();
            expect(filled).toBeTruthy();
            expect(rejected.status).toBe(409);
            expect(rejectedBody).toMatchObject({
                code: 'DIRECTORY_NOT_EMPTY',
                folderPath: 'filled',
            });
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/filled/notes.md'))).toBe(true);
            const removeEmpty = current.tree.filter((node) => node.folderPath !== 'empty');
            const accepted = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: removeEmpty }),
            });
            expect(accepted.status).toBe(200);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/empty'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('deletes resource folders that only contain hidden files', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources/assets/icons'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/assets/icons/.DS_Store'), 'finder', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const current = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`)).then((response) => response.json());
            const removeAssets = current.tree.filter((node) => node.folderPath !== 'assets');
            const accepted = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: removeAssets }),
            });
            const body = await accepted.json();
            expect(accepted.status).toBe(200);
            expect(body.success).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/assets'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe resource tree paths', async () => {
        const projectRoot = createTempRoot();
        writeResourceProject(projectRoot);
        fs.mkdirSync(path.join(projectRoot, 'src/resources'), { recursive: true });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            id: 'folder-escape',
                            kind: 'folder',
                            title: 'escape',
                            path: '../escape',
                            folderPath: '../escape',
                            children: [],
                        },
                    ],
                }),
            });
            const body = await response.json();
            expect(response.status).toBe(403);
            expect(body).toEqual({ error: 'Forbidden' });
            expect(fs.existsSync(path.join(projectRoot, 'escape'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('updates workspace project titles, allows empty titles, and validates invalid title payloads', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'workspace-title-client', 'Workspace Title Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'workspace-title-client', name: 'Workspace Title Client' },
        });
        const server = await startTestServer(projectRoot);
        try {
            const initial = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/project`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(initial).toEqual({
                status: 200,
                body: { title: 'Workspace Title Client' },
            });
            const blank = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/project`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: '   ' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(blank).toEqual({
                status: 200,
                body: { success: true, title: '' },
            });
            const blankReloaded = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/project`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(blankReloaded).toEqual({
                status: 200,
                body: { title: '' },
            });
            const blankConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(blankConfig.projectInfo.name).toBe('');
            const blankProjects = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects`)).then((response) => response.json());
            expect(blankProjects.projects).toEqual([
                expect.objectContaining({
                    id: 'workspace-title-client',
                    name: '',
                }),
            ]);
            const control = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/project`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Bad\u0000Title' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(control).toEqual({
                status: 400,
                body: { error: 'title contains invalid control characters' },
            });
            const updated = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/project`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Renamed Workspace' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(updated).toEqual({
                status: 200,
                body: { success: true, title: 'Renamed Workspace' },
            });
            const updatedConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(updatedConfig.projectInfo.name).toBe('Renamed Workspace');
            const updatedProjects = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects`)).then((response) => response.json());
            expect(updatedProjects.projects).toEqual([
                expect.objectContaining({
                    id: 'workspace-title-client',
                    name: 'Renamed Workspace',
                }),
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('uses resource excalidraw files for canvas navigation payload validation', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'workspace-canvas-tree-client', 'Workspace Canvas Tree Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'workspace-canvas-tree-client', name: 'Workspace Canvas Tree Client' },
        });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/flows'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/flows/board.excalidraw'), '{}\n', 'utf8');
        fs.mkdirSync(path.join(projectRoot, 'src/canvas'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/canvas/legacy.excalidraw'), '{}\n', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const invalidTab = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=unknown`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(invalidTab).toMatchObject({
                status: 400,
                body: { error: 'Invalid tab, expected prototypes|components|docs|canvas|themes' },
            });
            const createdFirst = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation/folders?tab=canvas`), {
                method: 'POST',
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(createdFirst.status).toBe(201);
            expect(createdFirst.body.tree[0]).toMatchObject({
                kind: 'folder',
                title: '新建文件夹',
                children: [],
            });
            const createdSecond = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation/folders?tab=canvas`), {
                method: 'POST',
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(createdSecond.status).toBe(201);
            expect(createdSecond.body.tree[0]).toMatchObject({
                kind: 'folder',
                title: '新建文件夹-2',
            });
            const invalidTree = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=canvas`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: [{ id: 'bad', kind: 'item', title: 'Bad', itemKey: 'docs/bad.md' }] }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(invalidTree).toEqual({ status: 400, body: { error: 'Invalid tree payload' } });
            const legacyTree = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=canvas`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: [{ id: 'legacy', kind: 'item', title: 'Legacy', itemKey: 'canvas/legacy.excalidraw' }] }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(legacyTree).toEqual({ status: 400, body: { error: 'Invalid tree payload' } });
            const validTree = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=canvas`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            id: 'folder-review',
                            kind: 'folder',
                            title: 'Review',
                            children: [
                                { id: 'item-board', kind: 'item', title: 'Board', itemKey: 'canvas/flows/board.excalidraw' },
                                { id: 'duplicate-board', kind: 'item', title: 'Duplicate Board', itemKey: 'canvas/flows/board.excalidraw' },
                            ],
                        },
                    ],
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(validTree.status).toBe(200);
            expect(findNode(validTree.body.tree, (node) => node.itemKey === 'canvas/flows/board.excalidraw')?.title).toBe('Board');
            expect(JSON.stringify(validTree.body.tree)).not.toContain('Duplicate Board');
        }
        finally {
            await server.close();
        }
    });
    it('persists dynamic design folders on the registered Make client project', async () => {
        const serverRoot = createTempRoot();
        const clientRoot = createTempRoot();
        writeProjectMetadata(clientRoot, {
            project: { id: 'design-folder-client', name: 'Design Folder Client' },
            resources: {
                prototypes: [],
                docs: [],
                themes: [
                    { id: 'brand', name: 'brand', title: 'Brand' },
                    { id: 'system', name: 'system', title: 'System' },
                ],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: ['brand', 'system'], data: [], templates: [] },
        });
        fs.mkdirSync(path.join(clientRoot, 'src/themes/brand'), { recursive: true });
        fs.mkdirSync(path.join(clientRoot, 'src/themes/system'), { recursive: true });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        let server = await startTestServer(serverRoot, registryHome);
        try {
            await registerProject(server.origin, clientRoot, 'design-folder-client', 'Design Folder Client');
            const saveTree = await fetch(scopeProjectApiUrl(clientRoot, `${server.origin}/api/workspace/navigation?tab=themes&projectId=design-folder-client`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: [
                        {
                            id: 'folder-themes-cn',
                            kind: 'folder',
                            title: '品牌',
                            children: [
                                { id: 'item-themes-brand', kind: 'item', title: 'Brand', itemKey: 'themes/brand' },
                            ],
                        },
                        { id: 'item-themes-system', kind: 'item', title: 'System', itemKey: 'themes/system' },
                    ],
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saveTree.status).toBe(200);
            expect(saveTree.body.success).toBe(true);
            const stored = JSON.parse(fs.readFileSync(path.join(clientRoot, '.axhub/make/sidebar-tree.json'), 'utf8'));
            expect(stored.themesTree).toEqual(saveTree.body.tree);
            expect(fs.existsSync(path.join(serverRoot, '.axhub/make/sidebar-tree.json'))).toBe(false);
        }
        finally {
            await server.close();
        }
        server = await startTestServer(serverRoot, registryHome);
        try {
            const navigation = await fetch(scopeProjectApiUrl(clientRoot, `${server.origin}/api/workspace/navigation?tab=themes&projectId=design-folder-client`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(navigation.status).toBe(200);
            expect(navigation.body.tree[0]).toMatchObject({
                id: 'folder-themes-cn',
                kind: 'folder',
                title: '品牌',
            });
            expect(findNode(navigation.body.tree, (node) => node.itemKey === 'themes/brand')?.title).toBe('Brand');
            expect(findNode(navigation.body.tree, (node) => node.itemKey === 'themes/system')?.title).toBe('System');
        }
        finally {
            await server.close();
        }
    });
    it('reconciles cached prototype navigation with the filesystem scan', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'prototype-tree-client', 'Prototype Tree Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'prototype-tree-client', name: 'Prototype Tree Client' },
            resources: {
                prototypes: [],
                docs: [],
                themes: [],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: [], data: [], templates: [] },
            resourceWriteTargets: {
                prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
            },
        });
        fs.mkdirSync(path.join(projectRoot, 'src/prototypes/live'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/prototypes/live/index.tsx'), 'export default null;\n', 'utf8');
        fs.mkdirSync(path.join(projectRoot, 'src/prototypes/fresh'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/prototypes/fresh/index.tsx'), 'export default null;\n', 'utf8');
        writeJson(path.join(projectRoot, '.axhub/make/sidebar-tree.json'), {
            version: 1,
            updatedAt: '2026-05-19T00:00:00.000Z',
            prototypes: [
                {
                    id: 'folder-existing',
                    kind: 'folder',
                    title: 'Existing Folder',
                    children: [
                        { id: 'item-prototypes-live', kind: 'item', title: 'Live Prototype', itemKey: 'prototypes/live' },
                        { id: 'item-prototypes-stale', kind: 'item', title: 'Stale Prototype', itemKey: 'prototypes/stale' },
                    ],
                },
            ],
            docs: [],
            themesTree: [],
            themes: [],
            data: [],
            templates: [],
        });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=prototypes`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.tree[0]).toMatchObject({
                kind: 'item',
                itemKey: 'prototypes/fresh',
            });
            expect(findNode(body.tree, (node) => node.itemKey === 'prototypes/live')?.title).toBe('Live Prototype');
            expect(findNode(body.tree, (node) => node.id === 'folder-existing')).toMatchObject({
                kind: 'folder',
                title: 'Existing Folder',
            });
            expect(JSON.stringify(body.tree)).not.toContain('prototypes/stale');
            const stored = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub/make/sidebar-tree.json'), 'utf8'));
            expect(findNode(stored.prototypes, (node) => node.itemKey === 'prototypes/fresh')).toBeTruthy();
            expect(JSON.stringify(stored.prototypes)).not.toContain('prototypes/stale');
        }
        finally {
            await server.close();
        }
    });
    it('reconciles stale root README docs from cached navigation', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'docs-readme-tree-client', 'Docs README Tree Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'docs-readme-tree-client', name: 'Docs README Tree Client' },
            resources: {
                prototypes: [],
                docs: [],
                themes: [],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: [], data: [], templates: [] },
        });
        fs.mkdirSync(path.join(projectRoot, 'src/resources'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/README.md'), '# Resources\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/overview.md'), '# Overview\n', 'utf8');
        writeJson(path.join(projectRoot, '.axhub/make/sidebar-tree.json'), {
            version: 1,
            updatedAt: '2026-05-19T00:00:00.000Z',
            prototypes: [],
            docs: [
                { id: 'item-docs-README-md', kind: 'item', title: 'README.md', itemKey: 'docs/README.md' },
            ],
            themesTree: [],
            themes: [],
            data: [],
            templates: [],
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'docs-readme-tree-client', 'Docs README Tree Client');
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs&projectId=docs-readme-tree-client`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(findNode(body.tree, (node) => node.itemKey === 'docs/overview.md')).toBeTruthy();
            expect(JSON.stringify(body.tree)).not.toContain('README.md');
        }
        finally {
            await server.close();
        }
    });
    it('keeps metadata-only prototype navigation when no local prototype root is declared or present', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'metadata-only-tree-client', 'Metadata Only Tree Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'metadata-only-tree-client', name: 'Metadata Only Tree Client' },
            resources: {
                prototypes: [
                    {
                        id: 'remote-home',
                        name: 'remote-home',
                        title: 'Remote Home',
                        clientUrl: 'https://preview.example.test/remote-home',
                    },
                ],
                docs: [],
                themes: [],
                data: [],
                templates: [],
            },
            navigation: { prototypes: ['remote-home'], docs: [] },
            orders: { themes: [], data: [], templates: [] },
            resourceWriteTargets: {},
        });
        writeJson(path.join(projectRoot, '.axhub/make/sidebar-tree.json'), {
            version: 1,
            updatedAt: '2026-05-19T00:00:00.000Z',
            prototypes: [
                { id: 'item-prototypes-remote-home', kind: 'item', title: 'Remote Home', itemKey: 'prototypes/remote-home' },
            ],
            docs: [],
            themesTree: [],
            themes: [],
            data: [],
            templates: [],
        });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=prototypes`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.tree).toEqual([
                expect.objectContaining({
                    kind: 'item',
                    title: 'Remote Home',
                    itemKey: 'prototypes/remote-home',
                }),
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('reconciles workspace resource order for data, templates, and themes', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientMarkerForProject(projectRoot, 'workspace-order-client', 'Workspace Order Client');
        writeProjectMetadata(projectRoot, {
            project: { id: 'workspace-order-client', name: 'Workspace Order Client' },
            resources: {
                prototypes: [],
                docs: [],
                themes: [{ id: 'brand', name: 'brand', title: 'Brand' }],
                data: [],
                templates: [],
            },
            navigation: { prototypes: [], docs: [] },
            orders: { themes: ['brand'], data: [], templates: [] },
        });
        fs.mkdirSync(path.join(projectRoot, 'src/resources/data'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/data/orders.json'), '{"records":[]}\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/data/customers.json'), '{"records":[]}\n', 'utf8');
        fs.mkdirSync(path.join(projectRoot, 'src/resources/templates/nested'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/base.md'), '# Base\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/nested/prd.md'), '# PRD\n', 'utf8');
        fs.mkdirSync(path.join(projectRoot, 'src/themes/brand'), { recursive: true });
        const server = await startTestServer(projectRoot);
        try {
            const invalidType = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=unknown`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(invalidType).toEqual({
                status: 400,
                body: { error: 'Invalid type, expected themes|data|templates' },
            });
            const dataOrder = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=data`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(dataOrder).toEqual({
                status: 200,
                body: { type: 'data', version: 1, order: ['customers', 'orders'] },
            });
            const invalidOrderShape = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=data`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: 'orders' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(invalidOrderShape).toEqual({
                status: 400,
                body: { error: 'order must be an array' },
            });
            const invalidKey = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=data`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: ['orders', 'missing'] }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(invalidKey).toEqual({
                status: 400,
                body: { error: 'Invalid resource key: missing' },
            });
            const updatedData = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=data`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: ['orders', 'orders'] }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(updatedData).toEqual({
                status: 200,
                body: { success: true, type: 'data', version: 1, order: ['customers', 'orders'] },
            });
            const templateOrder = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=templates`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(templateOrder).toEqual({
                status: 200,
                body: { type: 'templates', version: 1, order: ['base.md', 'nested/prd.md'] },
            });
            const themeOrder = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/resources/order?type=themes`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(themeOrder).toEqual({
                status: 200,
                body: { type: 'themes', version: 1, order: ['brand'] },
            });
        }
        finally {
            await server.close();
        }
    });
});
