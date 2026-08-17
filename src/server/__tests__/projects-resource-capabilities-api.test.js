import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProjectMetadataPath, } from '../projectCore/index.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, scopeProjectApiUrl, startTestServer, setActiveProject, writeJson, writeMakeClientProjectMarker, writeProjectMetadata, } from './projects-api.helpers';
afterEach(() => {
    vi.restoreAllMocks();
    cleanupProjectApiTestRoots();
});
describe('make-server project resource capability APIs', () => {
    it('derives resource write capabilities from declared server-backed targets', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'capability-client', name: 'Capability Client' },
            capabilities: {
                quickEdit: true,
                quickEditMode: 'clientRuntime',
                figmaExport: true,
                axureExport: true,
                multiDevicePreview: true,
                localExports: {
                    html: true,
                    make: true,
                },
            },
            resourceWriteTargets: {
                docs: { path: 'content/docs' },
                data: { path: 'src/resources/data' },
                prototypes: { path: 'content/prototypes' },
                themes: { path: 'content/themes' },
                templates: { path: 'content/templates' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'capability-client', 'Capability Client');
            await setActiveProject(server.origin, 'capability-client');
            const resources = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects/capability-client/resources`))
                .then((response) => response.json());
            expect(resources.capabilities.resourceWrites).toEqual({
                prototypeCreate: true,
                prototypeUpload: true,
                docCreate: true,
                docImport: true,
                themeCreate: true,
                themeImport: true,
                dataCreate: true,
                dataImport: false,
                templateCreate: true,
                templateDuplicate: true,
            });
            expect(resources.capabilities.localExports).toEqual({
                html: true,
                make: false,
            });
        }
        finally {
            await server.close();
        }
    });
    it('enables document resource writes for the default src/resources tree', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-docs-capability-client', name: 'Default Docs Capability Client' },
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
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'default-docs-capability-client', 'Default Docs Capability Client');
            const resources = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects/default-docs-capability-client/resources`))
                .then((response) => response.json());
            expect(resources.capabilities.resourceWrites).toMatchObject({
                docCreate: true,
                docImport: true,
                dataCreate: true,
                templateCreate: true,
                templateDuplicate: true,
            });
        }
        finally {
            await server.close();
        }
    });
    it('keeps adapter-bound routes disabled while default resource file writes work', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'upload-client', name: 'Upload Client' },
        });
        const server = await startTestServer(projectRoot);
        try {
            const docsUpload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/upload-docs`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files: [
                        { name: 'Guide.md', content: '# Guide\n' },
                    ],
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(docsUpload).toMatchObject({ status: 404, body: { error: 'Not found' } });
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/Guide.md'))).toBe(false);
            const importStatus = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/import/markitdown-status`))
                .then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(importStatus.status).toBe(404);
            const importForm = new FormData();
            importForm.append('files', new File(['# Imported\n'], 'Imported.md', { type: 'text/markdown' }));
            const imported = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/import`), {
                method: 'POST',
                body: importForm,
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(imported).toMatchObject({ status: 404, body: { error: 'Not found' } });
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/Imported.md'))).toBe(false);
            const mediaForm = new FormData();
            mediaForm.append('path', 'icons');
            mediaForm.append('file', new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }));
            const mediaUpload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/media/upload`), {
                method: 'POST',
                body: mediaForm,
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(mediaUpload).toMatchObject({
                status: 424,
                body: {
                    code: 'RESOURCE_WRITE_ADAPTER_REQUIRED',
                    adapterRequired: true,
                    projectId: 'upload-client',
                    details: {
                        route: '/api/media/upload',
                        reason: 'resource-layout-contract-deferred',
                    },
                },
            });
            expect(fs.existsSync(path.join(projectRoot, 'assets/media/icons/logo.svg'))).toBe(false);
            const genericForm = new FormData();
            genericForm.append('uploadType', 'local_axure');
            genericForm.append('file', new File(['zip-ish'], 'sample.zip', { type: 'application/zip' }));
            const genericUpload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/upload`), {
                method: 'POST',
                body: genericForm,
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(genericUpload.status).toBe(424);
            expect(genericUpload.body).toMatchObject({
                code: 'UPLOAD_ADAPTER_REQUIRED',
                adapterRequired: true,
                projectId: 'upload-client',
            });
            const manualCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/manual-create`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Manual Doc' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(manualCreate).toMatchObject({ status: 404, body: { error: 'Not found' } });
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/Manual-Doc.md'))).toBe(false);
            const templateCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Spec Template' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(templateCreate).toMatchObject({
                status: 201,
                body: {
                    success: true,
                    name: 'spec-template.md',
                    projectId: 'upload-client',
                },
            });
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/templates/spec-template.md'), 'utf8')).toContain('Spec Template');
            fs.mkdirSync(path.join(projectRoot, 'src/resources/templates'), { recursive: true });
            fs.writeFileSync(path.join(projectRoot, 'src/resources/templates/base.md'), '# Base\n', 'utf8');
            const templateCopy = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/base.md/copy`), {
                method: 'POST',
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(templateCopy).toMatchObject({
                status: 201,
                body: {
                    success: true,
                    name: 'base-copy.md',
                    projectId: 'upload-client',
                },
            });
            expect(fs.readFileSync(path.join(projectRoot, 'src/resources/templates/base-copy.md'), 'utf8')).toBe('# Base\n');
            const createTable = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/data/tables`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tableName: 'Customers' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(createTable).toMatchObject({
                status: 201,
                body: {
                    success: true,
                    fileName: 'customers',
                    tableName: 'Customers',
                    projectId: 'upload-client',
                },
            });
            expect(JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/resources/data/customers.json'), 'utf8'))).toEqual({
                tableName: 'Customers',
                records: [],
            });
            const itemCheck = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/items/check-references`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'prototypes/home', action: 'delete' }),
            }).then((response) => response.json());
            expect(itemCheck).toMatchObject({ hasReferences: false, references: [] });
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe resource write target metadata before create routes write files', async () => {
        const projectRoot = createTempRoot();
        writeMakeClientProjectMarker(projectRoot, 'unsafe-write-client', 'Unsafe Write Client');
        writeJson(getProjectMetadataPath(projectRoot), {
            schemaVersion: 1,
            project: { id: 'unsafe-write-client', name: 'Unsafe Write Client' },
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
                multiDevicePreview: true,
                resourceWrites: {
                    dataCreate: true,
                    themeCreate: true,
                    templateCreate: true,
                    templateDuplicate: true,
                },
            },
            resourceWriteTargets: {
                data: { path: 'src/resources/data' },
                themes: { path: 'content/themes' },
                templates: { path: '../outside-templates' },
            },
        });
        const server = await startTestServer(projectRoot);
        try {
            const templateCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Escaping Template' }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(templateCreate).toMatchObject({
                status: 400,
            });
            expect(String(templateCreate.body.error || '')).toMatch(/outside project root/);
            expect(fs.existsSync(path.join(path.dirname(projectRoot), 'outside-templates'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
