import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getProjectMetadataPath,
} from '../projectCore/index.ts';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  startTestServer,
  writeJson,
  writeProjectMetadata,
} from './projects-api.helpers';
import { handleProjectDocsApi } from '../managementApi.docs.ts';
import { handleUploadAndReferenceApis } from '../managementApi.references.ts';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupProjectApiTestRoots();
});


describe('make-server project declared resource write APIs', () => {
  it('exposes docs and template handling from its domain module', () => {
    expect(handleProjectDocsApi).toBeTypeOf('function');
  });

  it('exposes upload and reference handling from its domain module', () => {
    expect(handleUploadAndReferenceApis).toBeTypeOf('function');
  });

  it('keeps manual docs unavailable while creating templates and data tables in fixed resource directories', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'write-client', name: 'Write Client' },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          docCreate: true,
          docImport: false,
          templateCreate: true,
          templateDuplicate: true,
          dataCreate: true,
          themeCreate: true,
        },
      },
      resourceWriteTargets: {
        docs: { path: 'content/docs' },
        templates: { path: 'content/templates' },
        data: { path: 'src/resources/data' },
        themes: { path: 'content/themes' },
      },
    });
    const templateDir = path.join(projectRoot, 'src', 'resources', 'templates');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'base.md'), '# Base\n', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      const docCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/manual-create`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Manual Doc' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docCreate).toMatchObject({ status: 404, body: { error: 'Not found' } });
      expect(fs.existsSync(path.join(projectRoot, 'content/docs/manual-doc.md'))).toBe(false);

      const templateCopy = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/base.md/copy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Base Copy' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(templateCopy).toMatchObject({
        status: 201,
        body: {
          success: true,
          name: 'base-copy.md',
          projectId: 'write-client',
        },
      });
      expect(fs.readFileSync(path.join(templateDir, 'base-copy.md'), 'utf8')).toBe('# Base\n');

      const tableCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/data/tables`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: 'Customers' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(tableCreate).toMatchObject({
        status: 201,
        body: {
          success: true,
          fileName: 'customers',
          tableName: 'Customers',
          projectId: 'write-client',
        },
      });
      expect(JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/resources/data/customers.json'), 'utf8'))).toEqual({
        tableName: 'Customers',
        records: [],
      });

      const themeCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/themes`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Brand Theme', displayName: 'Brand Theme', design: '# Brand\n' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(themeCreate).toMatchObject({
        status: 201,
        body: {
          success: true,
          name: 'brand-theme',
          displayName: 'Brand Theme',
          projectId: 'write-client',
        },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'content/themes/brand-theme/DESIGN.md'), 'utf8')).toBe('# Brand\n');
      expect(JSON.parse(fs.readFileSync(path.join(projectRoot, 'content/themes/brand-theme/designToken.json'), 'utf8'))).toMatchObject({
        name: 'Brand Theme',
      });

      const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
      expect(metadata.resources).not.toHaveProperty('docs');
      expect(metadata.resources).not.toHaveProperty('templates');
      expect(metadata.resources).not.toHaveProperty('data');
      expect(metadata.resources.themes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'brand-theme', name: 'brand-theme', path: 'content/themes/brand-theme' }),
        expect.objectContaining({ id: 'theme-a' }),
      ]));
      expect(metadata.navigation).not.toHaveProperty('docs');
      expect(metadata.orders).not.toHaveProperty('templates');
      expect(metadata.orders).not.toHaveProperty('data');
      expect(metadata.orders.themes[0]).toBe('brand-theme');
      expect(metadata.orders.themes).toContain('theme-a');
    } finally {
      await server.close();
    }
  });

  it('keeps declared resource writes isolated between registered projects', async () => {
    const firstRoot = createTempRoot();
    const secondRoot = createTempRoot();
    const writeCapabilities = {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: true,
      multiDevicePreview: true,
      resourceWrites: {
        docCreate: true,
        templateCreate: true,
        templateDuplicate: true,
        dataCreate: true,
        themeCreate: true,
      },
    };
    const writeTargets = {
      docs: { path: 'content/docs' },
      templates: { path: 'content/templates' },
      data: { path: 'src/resources/data' },
      themes: { path: 'content/themes' },
    };
    writeProjectMetadata(firstRoot, {
      project: { id: 'first-write-client', name: 'First Write Client' },
      capabilities: writeCapabilities,
      resourceWriteTargets: writeTargets,
    });
    writeProjectMetadata(secondRoot, {
      project: { id: 'second-write-client', name: 'Second Write Client' },
      capabilities: writeCapabilities,
      resourceWriteTargets: writeTargets,
    });
    const firstTemplatesDir = path.join(firstRoot, 'src', 'resources', 'templates');
    const secondTemplatesDir = path.join(secondRoot, 'src', 'resources', 'templates');
    fs.mkdirSync(firstTemplatesDir, { recursive: true });
    fs.writeFileSync(path.join(firstTemplatesDir, 'base.md'), '# First Template\n', 'utf8');
    fs.mkdirSync(secondTemplatesDir, { recursive: true });
    fs.writeFileSync(path.join(secondTemplatesDir, 'base.md'), '# Second Template\n', 'utf8');

    const server = await startTestServer(firstRoot);

    try {
      await registerProject(server.origin, secondRoot, 'second-write-client', 'Second Write Client');

      const docCreate = await fetch(`${server.origin}/api/docs/manual-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'second-write-client', displayName: 'Second Doc' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docCreate).toMatchObject({ status: 404, body: { error: 'Not found' } });

      const templateCopy = await fetch(`${server.origin}/api/docs/templates/base.md/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'second-write-client', displayName: 'Second Copy' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(templateCopy).toMatchObject({
        status: 201,
        body: { projectId: 'second-write-client', name: 'second-copy.md' },
      });

      const tableCreate = await fetch(`${server.origin}/api/data/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'second-write-client', tableName: 'Second Customers' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(tableCreate).toMatchObject({
        status: 201,
        body: { projectId: 'second-write-client', fileName: 'second-customers' },
      });

      const themeCreate = await fetch(`${server.origin}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'second-write-client', name: 'Second Theme', displayName: 'Second Theme' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(themeCreate).toMatchObject({
        status: 201,
        body: { projectId: 'second-write-client', name: 'second-theme' },
      });

      expect(fs.existsSync(path.join(secondRoot, 'content', 'docs', 'second-doc.md'))).toBe(false);
      expect(fs.existsSync(path.join(secondTemplatesDir, 'second-copy.md'))).toBe(true);
      expect(fs.existsSync(path.join(secondRoot, 'src/resources/data/second-customers.json'))).toBe(true);
      expect(fs.existsSync(path.join(secondRoot, 'content', 'themes', 'second-theme'))).toBe(true);
      expect(fs.existsSync(path.join(firstRoot, 'content', 'docs', 'second-doc.md'))).toBe(false);
      expect(fs.existsSync(path.join(firstTemplatesDir, 'second-copy.md'))).toBe(false);
      expect(fs.existsSync(path.join(firstRoot, 'src/resources/data/second-customers.json'))).toBe(false);
      expect(fs.existsSync(path.join(firstRoot, 'content', 'themes', 'second-theme'))).toBe(false);
      const firstMetadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(firstRoot), 'utf8'));
      const secondMetadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(secondRoot), 'utf8'));
      expect(firstMetadata.navigation).not.toHaveProperty('docs');
      expect(firstMetadata.orders).not.toHaveProperty('templates');
      expect(firstMetadata.orders).not.toHaveProperty('data');
      expect(firstMetadata.orders.themes).not.toContain('second-theme');
      expect(secondMetadata.navigation).not.toHaveProperty('docs');
      expect(secondMetadata.orders).not.toHaveProperty('templates');
      expect(secondMetadata.orders).not.toHaveProperty('data');
      expect(secondMetadata.orders.themes).toContain('second-theme');
    } finally {
      await server.close();
    }
  });

  it('keeps document create aliases unavailable while templates and media use declared resource write targets', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'write-alias-client', name: 'Write Alias Client' },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          docCreate: true,
          docImport: true,
          templateCreate: true,
        },
      },
      resourceWriteTargets: {
        docs: { path: 'content/docs' },
        templates: { path: 'content/templates' },
        media: { path: 'public/media' },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const docCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'API Doc', content: '# API Doc\nBody\n' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docCreate).toMatchObject({ status: 404, body: { error: 'Not found' } });
      expect(fs.existsSync(path.join(projectRoot, 'content/docs/api-doc.md'))).toBe(false);

      const templateCreate = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'API Template', content: '# Template\n' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(templateCreate).toMatchObject({
        status: 201,
        body: {
          success: true,
          name: 'api-template.md',
          projectId: 'write-alias-client',
        },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'src/resources/templates/api-template.md'), 'utf8')).toBe('# Template\n');

      const formData = new FormData();
      formData.append('path', 'icons');
      formData.append('file', new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }));
      const mediaUpload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/media/upload`), {
        method: 'POST',
        body: formData,
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(mediaUpload).toMatchObject({
        status: 201,
        body: {
          success: true,
          projectId: 'write-alias-client',
          path: 'icons/logo.svg',
          url: '/api/media/file/icons/logo.svg',
        },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'public/media/icons/logo.svg'), 'utf8')).toBe('<svg />');

      const docsUpload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/upload-docs`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [
            { name: 'Uploaded Guide.md', content: '# Uploaded Guide\n' },
          ],
        }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docsUpload).toMatchObject({ status: 404, body: { error: 'Not found' } });
      expect(fs.existsSync(path.join(projectRoot, 'content/docs/uploaded-guide.md'))).toBe(false);

      const mediaList = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/media?path=${encodeURIComponent('icons')}`)).then((response) => response.json());
      expect(mediaList).toEqual([
        expect.objectContaining({
          name: 'logo.svg',
          path: 'icons/logo.svg',
          type: 'image',
        }),
      ]);
      const mediaFile = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/media/file/icons/logo.svg`));
      expect(mediaFile.status).toBe(200);
      expect(await mediaFile.text()).toBe('<svg />');

      const unsafeFormData = new FormData();
      unsafeFormData.append('path', '../outside');
      unsafeFormData.append('file', new File(['x'], 'escape.svg', { type: 'image/svg+xml' }));
      const unsafeUpload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/media/upload`), {
        method: 'POST',
        body: unsafeFormData,
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(unsafeUpload.status).toBe(403);
      expect(fs.existsSync(path.join(projectRoot, 'outside/escape.svg'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('preserves UTF-8 document upload file names', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'utf8-upload-client', name: 'UTF-8 Upload Client' },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          docImport: true,
        },
      },
      resourceWriteTargets: {
        docs: { path: 'content/docs' },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const formData = new FormData();
      formData.append('file', new File(['# 中文标题\n正文\n'], '中文资源.md', { type: 'text/markdown' }));

      const upload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/upload`), {
        method: 'POST',
        body: formData,
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(upload).toMatchObject({
        status: 201,
        body: {
          success: true,
          files: [
            expect.objectContaining({
              name: '中文资源.md',
              displayName: '中文标题',
            }),
          ],
        },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'src/resources/中文资源.md'), 'utf8')).toBe('# 中文标题\n正文\n');
      expect(fs.existsSync(path.join(projectRoot, 'src/resources/ä¸­æ–‡èµ„æº.md'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('uploads document files into a validated target folder without putting the folder in the generated name', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'nested-upload-client', name: 'Nested Upload Client' },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          docImport: true,
        },
      },
      resourceWriteTargets: {
        docs: { path: 'content/docs' },
      },
    });
    const docsDir = path.join(projectRoot, 'src/resources');
    fs.mkdirSync(path.join(docsDir, 'assets/screens'), { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'assets/screens/pasted-image.png'), 'existing', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'nested-upload-client', 'Nested Upload Client');

      const formData = new FormData();
      formData.append('projectId', 'nested-upload-client');
      formData.append('targetFolder', 'assets/screens');
      formData.append('file', new File(['first'], 'pasted-image.png', { type: 'image/png' }));
      formData.append('file', new File(['second'], 'hero.webp', { type: 'image/webp' }));

      const upload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/upload`), {
        method: 'POST',
        body: formData,
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(upload).toMatchObject({
        status: 201,
        body: {
          success: true,
          files: [
            expect.objectContaining({
              name: 'pasted-image-2.png',
              id: 'pasted-image-2',
              displayName: 'pasted-image-2',
              path: 'assets/screens/pasted-image-2.png',
            }),
            expect.objectContaining({
              name: 'hero.webp',
              id: 'hero',
              displayName: 'hero',
              path: 'assets/screens/hero.webp',
            }),
          ],
        },
      });
      expect(fs.readFileSync(path.join(docsDir, 'assets/screens/pasted-image-2.png'), 'utf8')).toBe('first');
      expect(fs.readFileSync(path.join(docsDir, 'assets/screens/hero.webp'), 'utf8')).toBe('second');
      expect(fs.existsSync(path.join(docsDir, 'pasted-image-2.png'))).toBe(false);

      const docsList = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs?projectId=nested-upload-client`))
        .then((response) => response.json());
      expect(docsList).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'pasted-image-2.png',
          displayName: 'pasted-image-2',
          path: 'assets/screens/pasted-image-2.png',
        }),
        expect.objectContaining({
          name: 'hero.webp',
          displayName: 'hero',
          path: 'assets/screens/hero.webp',
        }),
      ]));

      const rename = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/${encodeURIComponent('assets/screens/hero.webp')}?projectId=nested-upload-client`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBaseName: 'renamed-hero' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(rename).toMatchObject({
        status: 200,
        body: {
          success: true,
          name: 'renamed-hero.webp',
          path: 'assets/screens/renamed-hero.webp',
        },
      });
      expect(fs.existsSync(path.join(docsDir, 'assets/screens/hero.webp'))).toBe(false);
      expect(fs.readFileSync(path.join(docsDir, 'assets/screens/renamed-hero.webp'), 'utf8')).toBe('second');

      const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
      expect(metadata.resources).not.toHaveProperty('docs');
      expect(metadata.navigation).not.toHaveProperty('docs');
    } finally {
      await server.close();
    }
  });

  it('rejects unsafe document upload target folders before writing files', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'unsafe-upload-client', name: 'Unsafe Upload Client' },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          docImport: true,
        },
      },
      resourceWriteTargets: {
        docs: { path: 'content/docs' },
      },
    });
    const docsDir = path.join(projectRoot, 'src/resources');
    const server = await startTestServer(projectRoot);

    try {
      for (const targetFolder of ['../bad', '/tmp/bad', 'assets\\..\\bad', '']) {
        const formData = new FormData();
        formData.append('targetFolder', targetFolder);
        formData.append('file', new File(['x'], 'escape.png', { type: 'image/png' }));

        const upload = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/upload`), {
          method: 'POST',
          body: formData,
        }).then(async (response) => ({ status: response.status, body: await response.json() }));

        expect(upload.status).toBe(403);
        expect(upload.body).toMatchObject({
          error: 'Invalid targetFolder',
        });
      }
      expect(fs.existsSync(path.join(docsDir, 'escape.png'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'bad/escape.png'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('keeps fixed filesystem resources out of metadata while preserving theme metadata writes', async () => {
    const projectRoot = createTempRoot();
    const docsDir = path.join(projectRoot, 'src/resources');
    const templatesDir = path.join(projectRoot, 'src/resources/templates');
    const dataDir = path.join(projectRoot, 'src/resources/data');
    const themesDir = path.join(projectRoot, 'content/themes');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'brand'), { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'base.md'), '# Base Doc\n', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'base.md'), '# Base Template\n', 'utf8');
    writeJson(path.join(dataDir, 'orders.json'), { tableName: 'Orders', records: [{ id: 1, title: 'first' }] });
    fs.writeFileSync(path.join(themesDir, 'brand', 'designToken.json'), JSON.stringify({ name: 'Brand' }, null, 2), 'utf8');
    fs.writeFileSync(path.join(themesDir, 'brand', 'DESIGN.md'), '# Brand\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'sync-client', name: 'Sync Client' },
      resources: {
        prototypes: [],
        themes: [{ id: 'brand', name: 'brand', title: 'Brand', path: 'content/themes/brand' }],
      },
      navigation: { prototypes: [] },
      orders: { themes: ['brand'] },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          docCreate: true,
          docImport: true,
          templateCreate: true,
          templateDuplicate: true,
          dataCreate: true,
          themeCreate: true,
        },
      },
      resourceWriteTargets: {
        docs: { path: 'content/docs' },
        templates: { path: 'content/templates' },
        data: { path: 'src/resources/data' },
        themes: { path: 'content/themes' },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const docCopy = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/base.md/copy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Base Copy' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docCopy).toMatchObject({
        status: 201,
        body: { success: true, name: 'base-copy.md' },
      });

      const docRename = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/base.md`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBaseName: 'Renamed Doc' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docRename.status).toBe(200);
      expect(docRename.body.name).toBe('Renamed-Doc.md');

      const templateRename = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/base.md`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBaseName: 'Template Renamed' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(templateRename.status).toBe(200);
      expect(templateRename.body.name).toBe('Template-Renamed.md');

      const dataRename = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/data/tables/orders`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'customers', tableName: 'Customers' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(dataRename).toMatchObject({
        status: 200,
        body: { success: true, fileName: 'customers', previousFileName: 'orders' },
      });

      const themeRename = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/themes/brand`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'brand-new', displayName: 'Brand New' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(themeRename).toMatchObject({
        status: 200,
        body: { success: true, name: 'brand-new', previousName: 'brand' },
      });

      const templateDelete = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/templates/Template-Renamed.md`), { method: 'DELETE' });
      expect(templateDelete.status).toBe(200);
      const dataDelete = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/data/tables/customers`), { method: 'DELETE' });
      expect(dataDelete.status).toBe(200);
      const themeDelete = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/themes/brand-new`), { method: 'DELETE' });
      expect(themeDelete.status).toBe(200);
      const docDelete = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs/Renamed-Doc.md`), { method: 'DELETE' });
      expect(docDelete.status).toBe(200);

      const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
      expect(metadata.resources).not.toHaveProperty('docs');
      expect(metadata.navigation).not.toHaveProperty('docs');
      expect(metadata.resources).not.toHaveProperty('templates');
      expect(metadata.orders).not.toHaveProperty('templates');
      expect(metadata.resources).not.toHaveProperty('data');
      expect(metadata.orders).not.toHaveProperty('data');
      expect(metadata.resources.themes).toEqual([]);
      expect(metadata.orders.themes).toEqual([]);
      expect(fs.existsSync(path.join(docsDir, 'base.md'))).toBe(false);
      expect(fs.existsSync(path.join(docsDir, 'Renamed-Doc.md'))).toBe(false);
      expect(fs.existsSync(path.join(dataDir, 'customers.json'))).toBe(false);
      expect(fs.existsSync(path.join(themesDir, 'brand-new'))).toBe(false);
    } finally {
      await server.close();
    }
  });
});
