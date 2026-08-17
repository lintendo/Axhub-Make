import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { handleFileOperationsApi } from '../managementApi.fileOperations.ts';
const tempRoots = [];
function createTempRoot(prefix = 'axhub-file-ops-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}
function createRequest(method, body) {
    const request = new EventEmitter();
    request.method = method;
    request.headers = {};
    process.nextTick(() => {
        if (body !== undefined) {
            request.emit('data', Buffer.from(JSON.stringify(body)));
        }
        request.emit('end');
    });
    return request;
}
function createResponse() {
    const chunks = [];
    const headers = new Map();
    const response = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            callback();
        },
    });
    response.statusCode = 200;
    response.setHeader = function setHeader(name, value) {
        headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
        return response;
    };
    response.getHeader = function getHeader(name) {
        return headers.get(name.toLowerCase());
    };
    response.end = function endResponse(chunk) {
        if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        Writable.prototype.end.call(response);
        return response;
    };
    const waitForFinish = () => response.writableEnded
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
            response.once('finish', resolve);
            response.once('error', reject);
        });
    return {
        response,
        waitForFinish,
        body() {
            return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        },
        get statusCode() {
            return response.statusCode;
        },
    };
}
async function callFileOperation(params) {
    const res = createResponse();
    const handled = handleFileOperationsApi(createRequest(params.method || 'POST', params.body ?? {}), res.response, params.projectRoot, params.pathname, params.metadataStore);
    if (handled) {
        await res.waitForFinish();
    }
    return {
        handled,
        status: res.statusCode,
        body: handled ? res.body() : null,
    };
}
function createMetadata() {
    return {
        schemaVersion: 1,
        project: { id: 'file-ops-client', name: 'File Ops Client' },
        resources: {
            prototypes: [
                {
                    id: 'home',
                    name: 'home',
                    title: 'Home',
                    clientUrl: '/prototypes/home',
                    previewMode: 'clientRuntime',
                    description: '',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
                {
                    id: 'settings',
                    name: 'settings',
                    title: 'Settings',
                    clientUrl: '/prototypes/settings',
                    previewMode: 'clientRuntime',
                    description: '',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
            themes: [],
        },
        navigation: { prototypes: ['home', 'settings'] },
        orders: { themes: [] },
        capabilities: {
            quickEdit: true,
            quickEditMode: 'clientRuntime',
            figmaExport: false,
            axureExport: false,
            localExports: { html: false, make: false },
            resourceWrites: {
                prototypeCreate: false,
                prototypeUpload: false,
                docCreate: false,
                docImport: false,
                themeCreate: false,
                themeImport: false,
                dataCreate: false,
                dataImport: false,
                templateCreate: false,
                templateDuplicate: false,
            },
        },
        resourceWriteTargets: {},
    };
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('legacy file operations API', () => {
    it('ignores unrelated paths and rejects unsupported methods', async () => {
        const projectRoot = createTempRoot();
        const unrelated = await callFileOperation({
            pathname: '/api/source',
            projectRoot,
        });
        expect(unrelated).toEqual({ handled: false, status: 200, body: null });
        const wrongMethod = await callFileOperation({
            pathname: '/api/delete',
            method: 'GET',
            projectRoot,
        });
        expect(wrongMethod).toMatchObject({
            handled: true,
            status: 405,
            body: { error: 'Method not allowed' },
        });
    });
    it('validates missing paths, project-root operations, traversal, and invalid destination names', async () => {
        const projectRoot = createTempRoot();
        fs.mkdirSync(path.join(projectRoot, '.axhub/make'), { recursive: true });
        await expect(callFileOperation({
            pathname: '/api/delete',
            projectRoot,
            body: {},
        })).resolves.toMatchObject({
            status: 400,
            body: { error: 'Missing path' },
        });
        await expect(callFileOperation({
            pathname: '/api/delete',
            projectRoot,
            body: { path: '.' },
        })).resolves.toMatchObject({
            status: 403,
            body: {
                code: 'PROJECT_ROOT_OPERATION_FORBIDDEN',
            },
        });
        await expect(callFileOperation({
            pathname: '/api/delete',
            projectRoot,
            body: { path: '../outside' },
        })).resolves.toMatchObject({
            status: 400,
            body: {
                error: expect.stringContaining('outside project root'),
            },
        });
        writeFile(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default null;\n');
        await expect(callFileOperation({
            pathname: '/api/rename',
            projectRoot,
            body: { path: 'src/prototypes/home', newName: '../escape' },
        })).resolves.toMatchObject({
            status: 400,
            body: { error: 'Invalid newName' },
        });
    });
    it('renames files and copies directories inside the project root', async () => {
        const projectRoot = createTempRoot();
        writeFile(path.join(projectRoot, 'src/docs/guide.md'), '# Guide\n');
        writeFile(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default null;\n');
        const rename = await callFileOperation({
            pathname: '/api/rename',
            projectRoot,
            body: { path: 'src/docs/guide.md', newName: 'guide-renamed.md' },
        });
        expect(rename).toMatchObject({
            status: 200,
            body: { success: true, path: 'src/docs/guide-renamed.md' },
        });
        expect(fs.existsSync(path.join(projectRoot, 'src/docs/guide.md'))).toBe(false);
        expect(fs.readFileSync(path.join(projectRoot, 'src/docs/guide-renamed.md'), 'utf8')).toBe('# Guide\n');
        const copy = await callFileOperation({
            pathname: '/api/copy',
            projectRoot,
            body: { sourcePath: 'src/prototypes/home', targetName: 'home-copy' },
        });
        expect(copy).toMatchObject({
            status: 200,
            body: { success: true, path: 'src/prototypes/home-copy' },
        });
        expect(fs.readFileSync(path.join(projectRoot, 'src/prototypes/home-copy/index.tsx'), 'utf8')).toBe('export default null;\n');
    });
    it('copies resources to an explicit target path from the Admin UI', async () => {
        const projectRoot = createTempRoot();
        writeFile(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default null;\n');
        const copy = await callFileOperation({
            pathname: '/api/copy',
            projectRoot,
            body: {
                sourcePath: 'src/prototypes/home',
                targetPath: 'src/prototypes/home-copy',
            },
        });
        expect(copy).toMatchObject({
            status: 200,
            body: { success: true, path: 'src/prototypes/home-copy' },
        });
        expect(fs.readFileSync(path.join(projectRoot, 'src/prototypes/home-copy/index.tsx'), 'utf8')).toBe('export default null;\n');
    });
    it('removes deleted prototype resources from metadata and navigation', async () => {
        const projectRoot = createTempRoot();
        const deletedDir = path.join(projectRoot, 'src/prototypes/home');
        writeFile(path.join(deletedDir, 'index.tsx'), 'export default null;\n');
        let metadata = createMetadata();
        const metadataStore = {
            getMetadata: () => metadata,
            saveMetadata: (nextMetadata) => {
                metadata = nextMetadata;
                return metadata;
            },
        };
        const deleted = await callFileOperation({
            pathname: '/api/delete',
            projectRoot,
            body: { path: 'src/prototypes/home' },
            metadataStore,
        });
        expect(deleted).toMatchObject({
            status: 200,
            body: { success: true },
        });
        expect(fs.existsSync(deletedDir)).toBe(false);
        expect(metadata.resources.prototypes.map((prototype) => prototype.id)).toEqual(['settings']);
        expect(metadata.navigation.prototypes).toEqual(['settings']);
    });
    it('rejects delete requests whose resolved target does not exist', async () => {
        const projectRoot = createTempRoot();
        const deleted = await callFileOperation({
            pathname: '/api/delete',
            projectRoot,
            body: { path: 'src/prototypes/missing' },
        });
        expect(deleted).toMatchObject({
            status: 404,
            body: {
                code: 'FILE_OPERATION_TARGET_NOT_FOUND',
            },
        });
    });
    it('updates prototype display names without renaming their source directory', async () => {
        const projectRoot = createTempRoot();
        const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
        writeFile(path.join(prototypeDir, 'index.tsx'), 'export default null;\n');
        let metadata = createMetadata();
        const metadataStore = {
            getMetadata: () => metadata,
            saveMetadata: (nextMetadata) => {
                metadata = nextMetadata;
                return metadata;
            },
        };
        const renamed = await callFileOperation({
            pathname: '/api/prototypes/home',
            projectRoot,
            body: { displayName: '首页演示' },
            metadataStore,
        });
        expect(renamed).toMatchObject({
            status: 200,
            body: {
                success: true,
                name: 'home',
                displayName: '首页演示',
            },
        });
        expect(fs.existsSync(prototypeDir)).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/首页演示'))).toBe(false);
        expect(metadata.resources.prototypes.find((prototype) => prototype.id === 'home')).toMatchObject({
            id: 'home',
            name: 'home',
            title: '首页演示',
        });
        expect(metadata.navigation.prototypes).toEqual(['home', 'settings']);
    });
    it('updates nested prototype sidebar item titles when display names change', async () => {
        const projectRoot = createTempRoot();
        const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
        writeFile(path.join(prototypeDir, 'index.tsx'), 'export default null;\n');
        const sidebarTreePath = path.join(projectRoot, '.axhub/make/sidebar-tree.json');
        writeFile(sidebarTreePath, JSON.stringify({
            version: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            prototypes: [
                {
                    id: 'folder:prototypes:demo',
                    kind: 'folder',
                    title: '演示目录',
                    children: [
                        {
                            id: 'item:prototypes:home',
                            kind: 'item',
                            title: 'Home',
                            itemKey: 'prototypes/home',
                        },
                    ],
                },
            ],
            docs: [],
            themesTree: [],
            themes: [],
            data: [],
            templates: [],
        }));
        let metadata = createMetadata();
        const metadataStore = {
            getMetadata: () => metadata,
            saveMetadata: (nextMetadata) => {
                metadata = nextMetadata;
                return metadata;
            },
        };
        const renamed = await callFileOperation({
            pathname: '/api/prototypes/home',
            projectRoot,
            body: { displayName: '首页演示' },
            metadataStore,
        });
        expect(renamed).toMatchObject({
            status: 200,
            body: {
                success: true,
                name: 'home',
                displayName: '首页演示',
            },
        });
        const storedTree = JSON.parse(fs.readFileSync(sidebarTreePath, 'utf8'));
        expect(storedTree.prototypes[0].children[0]).toMatchObject({
            title: '首页演示',
            itemKey: 'prototypes/home',
        });
    });
});
