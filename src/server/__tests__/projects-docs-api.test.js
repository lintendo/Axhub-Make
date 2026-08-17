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
import { getProjectMetadataPath, } from '../projectCore/index.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, scopeProjectApiUrl, setActiveProject, startTestServer, writeProjectMetadata, } from './projects-api.helpers';
import { handleProjectDocsApi } from '../managementApi.docs.ts';
import { buildSystemOpenCommand } from '../managementApi.workspace.ts';
import { runLocalCommand } from '../localCommand.ts';
const runLocalCommandMock = vi.mocked(runLocalCommand);
afterEach(() => {
    childProcessMock.execFile.mockClear();
    runLocalCommandMock.mockClear();
    cleanupProjectApiTestRoots();
});
function writeMultipartBody(boundary, files) {
    return [
        ...files.flatMap((file) => [
            `--${boundary}`,
            `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"`,
            'Content-Type: text/markdown',
            '',
            file.content,
        ]),
        `--${boundary}--`,
        '',
    ].join('\r\n');
}
describe('make-server project docs APIs', () => {
    it('exposes docs handling from its domain module', () => {
        expect(handleProjectDocsApi).toBeTypeOf('function');
    });
    it('lists, uploads, copies, renames, and deletes docs inside the fixed resources directory', async () => {
        const projectRoot = createTempRoot();
        const docsDir = path.join(projectRoot, 'src', 'resources');
        fs.mkdirSync(path.join(docsDir, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide\n\nTop-level guide.\n', 'utf8');
        fs.writeFileSync(path.join(docsDir, 'nested', 'guide.md'), '# Guide Title\n\nUseful notes.\n', 'utf8');
        fs.writeFileSync(path.join(docsDir, 'README.md'), '# Ignored\n', 'utf8');
        fs.writeFileSync(path.join(docsDir, '.scratch.md'), '# Hidden\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'docs-client', name: 'Docs Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            capabilities: {
                quickEdit: true,
                figmaExport: false,
                axureExport: false,
                multiDevicePreview: true,
                resourceWrites: {
                    docCreate: true,
                    docImport: true,
                    templateCreate: false,
                    templateDuplicate: false,
                    dataCreate: false,
                    themeCreate: false,
                },
            },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'docs-client', 'Docs Client');
            await setActiveProject(server.origin, 'docs-client');
            const docs = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs`)).then((response) => response.json());
            expect(docs).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    name: 'nested/guide.md',
                    displayName: 'Guide Title',
                    description: 'Useful notes.',
                    absoluteFilePath: path.join(docsDir, 'nested', 'guide.md'),
                }),
            ]));
            expect(docs).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'README.md' }),
                expect.objectContaining({ name: '.scratch.md' }),
            ]));
            const uploadBoundary = '----axhub-docs-boundary';
            const upload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/upload`), {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${uploadBoundary}` },
                body: writeMultipartBody(uploadBoundary, [
                    { fieldName: 'file', fileName: 'Plan Draft.md', content: '# Uploaded Plan\n\nBody\n' },
                ]),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(upload).toMatchObject({
                status: 201,
                body: {
                    success: true,
                    files: [
                        expect.objectContaining({
                            id: 'Plan-Draft',
                            displayName: 'Uploaded Plan',
                            name: 'Plan-Draft.md',
                        }),
                    ],
                },
            });
            expect(fs.existsSync(path.join(docsDir, 'Plan-Draft.md'))).toBe(true);
            const protectedCheck = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/check-references`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docName: 'project-overview.md', action: 'delete' }),
            }).then((response) => response.json());
            expect(protectedCheck).toMatchObject({
                docName: 'project-overview.md',
                protected: true,
                code: 'PROTECTED_DOC',
            });
            const encodedGuide = encodeURIComponent('guide.md');
            const copied = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodedGuide}/copy`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Guide Copy' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(copied).toMatchObject({
                status: 201,
                body: {
                    success: true,
                    projectId: 'docs-client',
                    name: 'guide-copy.md',
                    id: 'guide-copy',
                    displayName: 'Guide Copy',
                },
            });
            const renamed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodedGuide}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newBaseName: 'Renamed Guide' }),
            }).then((response) => response.json());
            expect(renamed).toMatchObject({
                success: true,
                name: 'Renamed-Guide.md',
                absoluteFilePath: path.join(docsDir, 'Renamed-Guide.md'),
            });
            expect(fs.existsSync(path.join(docsDir, 'Renamed-Guide.md'))).toBe(true);
            const savedDoc = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/Renamed-Guide.md`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: '# Saved Guide\n\nEdited online.\n' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedDoc).toMatchObject({
                status: 200,
                body: {
                    success: true,
                    path: path.join(docsDir, 'Renamed-Guide.md'),
                },
            });
            expect(fs.readFileSync(path.join(docsDir, 'Renamed-Guide.md'), 'utf8')).toBe('# Saved Guide\n\nEdited online.\n');
            const deleted = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/Plan-Draft.md`), { method: 'DELETE' })
                .then((response) => response.json());
            expect(deleted).toEqual({ success: true });
            expect(fs.existsSync(path.join(docsDir, 'Plan-Draft.md'))).toBe(false);
            const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
            expect(metadata.resources).not.toHaveProperty('docs');
            expect(metadata.navigation).not.toHaveProperty('docs');
        }
        finally {
            await server.close();
        }
    });
    it('saves markdown template content without treating the request as a rename', async () => {
        const projectRoot = createTempRoot();
        const templatesDir = path.join(projectRoot, 'src', 'resources', 'templates');
        fs.mkdirSync(templatesDir, { recursive: true });
        fs.writeFileSync(path.join(templatesDir, 'write-prd.md'), '# Write PRD 模板\n\nOriginal body.\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'template-save-client', name: 'Template Save Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            resourceWriteTargets: {
                templates: { path: 'content/templates' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'template-save-client', 'Template Save Client');
            await setActiveProject(server.origin, 'template-save-client');
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/write-prd.md`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: '# Updated PRD 模板\n\nSaved from editor.\n' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({
                status: 200,
                body: {
                    success: true,
                    path: path.join(templatesDir, 'write-prd.md'),
                },
            });
            expect(fs.readFileSync(path.join(templatesDir, 'write-prd.md'), 'utf8')).toBe('# Updated PRD 模板\n\nSaved from editor.\n');
            expect(fs.existsSync(path.join(templatesDir, 'Updated-PRD-模板.md'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('renames nested templates inside their current directory', async () => {
        const projectRoot = createTempRoot();
        const templatesDir = path.join(projectRoot, 'src', 'resources', 'templates');
        fs.mkdirSync(path.join(templatesDir, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(templatesDir, 'nested', 'prd-template.md'), '# Nested PRD\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'nested-template-rename-client', name: 'Nested Template Rename Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            orders: { themes: [] },
            resourceWriteTargets: {
                templates: { path: 'content/templates' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'nested-template-rename-client', 'Nested Template Rename Client');
            await setActiveProject(server.origin, 'nested-template-rename-client');
            const renamed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/${encodeURIComponent('nested/prd-template.md')}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newBaseName: 'prd-template-v2' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(renamed).toMatchObject({
                status: 200,
                body: {
                    success: true,
                    name: 'nested/prd-template-v2.md',
                    absoluteFilePath: path.join(templatesDir, 'nested', 'prd-template-v2.md'),
                },
            });
            expect(fs.existsSync(path.join(templatesDir, 'nested', 'prd-template-v2.md'))).toBe(true);
            expect(fs.existsSync(path.join(templatesDir, 'nested', 'nested', 'prd-template-v2.md'))).toBe(false);
            expect(fs.existsSync(path.join(templatesDir, 'prd-template-v2.md'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('returns 404 when deleting a document path that does not exist', async () => {
        const projectRoot = createTempRoot();
        const docsDir = path.join(projectRoot, 'src', 'resources');
        fs.mkdirSync(docsDir, { recursive: true });
        fs.writeFileSync(path.join(docsDir, 'keep.md'), '# Keep\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'docs-delete-missing-client', name: 'Docs Delete Missing Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'docs-delete-missing-client', 'Docs Delete Missing Client');
            await setActiveProject(server.origin, 'docs-delete-missing-client');
            const metadataBefore = fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8');
            const deleted = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/missing.png`), { method: 'DELETE' })
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(deleted).toEqual({
                status: 404,
                body: { error: 'Document not found' },
            });
            expect(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8')).toBe(metadataBefore);
            expect(fs.existsSync(path.join(docsDir, 'keep.md'))).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('shows the unsupported-file preview shell for browser navigation to drawio resources', async () => {
        const projectRoot = createTempRoot();
        const docsDir = path.join(projectRoot, 'src', 'resources');
        fs.mkdirSync(docsDir, { recursive: true });
        fs.writeFileSync(path.join(docsDir, 'order-status-flow.drawio'), '<mxfile />\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'docs-drawio-preview-client', name: 'Docs Drawio Preview Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'docs-drawio-preview-client', 'Docs Drawio Preview Client');
            await setActiveProject(server.origin, 'docs-drawio-preview-client');
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/order-status-flow.drawio`), {
                headers: {
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            const html = await response.text();
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/html');
            expect(response.headers.get('x-axhub-preview-fallback')).toBe('unsupported-file');
            expect(html).toContain('order-status-flow');
            expect(html).toContain('.DRAWIO');
            expect(html).toContain('用系统应用打开');
            expect(html).toContain('width: 80px;');
            expect(html).toContain('height: 80px;');
            expect(html).toContain('font-size: 14px;');
            expect(html).not.toContain('width: 96px;');
            expect(html).not.toContain('font-size: 18px;');
            expect(html).not.toContain('<mxfile');
            const downloadResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/order-status-flow.drawio?download=1`), {
                headers: {
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            expect(downloadResponse.status).toBe(200);
            expect(downloadResponse.headers.get('content-type')).toBe('application/octet-stream');
            expect(downloadResponse.headers.get('x-axhub-preview-fallback')).toBeNull();
            expect(await downloadResponse.text()).toBe('<mxfile />\n');
        }
        finally {
            await server.close();
        }
    });
    it('injects the shared HTML annotation bootstrap into browser previews for HTML docs', async () => {
        const projectRoot = createTempRoot();
        const docsDir = path.join(projectRoot, 'src', 'resources');
        const reviewDir = path.join(docsDir, 'reviews');
        const diagramPath = path.join(reviewDir, 'visual-prd.assets', 'diagram.drawio.svg');
        fs.mkdirSync(path.dirname(diagramPath), { recursive: true });
        fs.writeFileSync(path.join(reviewDir, 'visual-prd.html'), '<!doctype html><html><body><main>Visual PRD</main><img src="visual-prd.assets/diagram.drawio.svg" /></body></html>', 'utf8');
        fs.writeFileSync(diagramPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'docs-html-preview-client', name: 'Docs HTML Preview Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'docs-html-preview-client', 'Docs HTML Preview Client');
            await setActiveProject(server.origin, 'docs-html-preview-client');
            const response = await fetch(`${server.origin}/api/docs/${encodeURIComponent('reviews/visual-prd.html')}?projectId=docs-html-preview-client`, {
                headers: {
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            const html = await response.text();
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/html');
            expect(html).toContain('Visual PRD');
            expect(html).toContain('<script type="module" src="/assets/html-template-bootstrap.js"></script>');
            expect(html).toContain(`/api/docs/${encodeURIComponent('reviews/visual-prd.assets/diagram.drawio.svg')}?projectId=docs-html-preview-client`);
        }
        finally {
            await server.close();
        }
    });
    it('opens unsupported template resources from the templates directory', async () => {
        const projectRoot = createTempRoot();
        const docsDir = path.join(projectRoot, 'src', 'resources');
        const templatesDir = path.join(projectRoot, 'src', 'resources', 'templates');
        fs.mkdirSync(docsDir, { recursive: true });
        fs.mkdirSync(templatesDir, { recursive: true });
        fs.writeFileSync(path.join(templatesDir, 'flow.drawio'), '<mxfile />\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'template-drawio-preview-client', name: 'Template Drawio Preview Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
                templates: { path: 'content/templates' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'template-drawio-preview-client', 'Template Drawio Preview Client');
            await setActiveProject(server.origin, 'template-drawio-preview-client');
            const previewResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/flow.drawio`), {
                headers: {
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            const html = await previewResponse.text();
            expect(previewResponse.status).toBe(200);
            expect(previewResponse.headers.get('x-axhub-preview-fallback')).toBe('unsupported-file');
            expect(html).toContain('"resourceType":"templates"');
            const openResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docName: 'flow.drawio', type: 'templates' }),
            });
            const openBody = await openResponse.json();
            const templatePath = path.join(templatesDir, 'flow.drawio');
            const openCommand = buildSystemOpenCommand(templatePath);
            expect(openResponse.status).toBe(200);
            expect(openBody).toEqual({ success: true, path: templatePath });
            expect(runLocalCommandMock).toHaveBeenCalledWith(openCommand.command, openCommand.args, expect.objectContaining({ timeoutMs: 10000 }));
        }
        finally {
            await server.close();
        }
    });
    it('opens docs through the shared filesystem opener without shell command strings', async () => {
        const projectRoot = createTempRoot();
        const docsDir = path.join(projectRoot, 'src', 'resources');
        fs.mkdirSync(docsDir, { recursive: true });
        fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide\n', 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'docs-open-client', name: 'Docs Open Client' },
            resources: {
                prototypes: [],
                themes: [],
            },
            navigation: { prototypes: [] },
            capabilities: {
                quickEdit: true,
                quickEditMode: 'clientRuntime',
                figmaExport: false,
                axureExport: false,
                multiDevicePreview: true,
                resourceWrites: {
                    docCreate: true,
                    docImport: true,
                },
            },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'docs-open-client', 'Docs Open Client');
            await setActiveProject(server.origin, 'docs-open-client');
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/open-system`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docName: 'guide.md' }),
            });
            const body = await response.json();
            const docPath = path.join(docsDir, 'guide.md');
            const openCommand = buildSystemOpenCommand(docPath);
            expect(response.status).toBe(200);
            expect(body).toEqual({ success: true, path: docPath });
            expect(runLocalCommandMock).toHaveBeenCalledWith(openCommand.command, openCommand.args, expect.objectContaining({ timeoutMs: 10000 }));
        }
        finally {
            await server.close();
        }
    });
});
