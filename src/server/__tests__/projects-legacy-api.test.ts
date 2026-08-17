import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';

import {
  getProjectMetadataPath,
} from '../projectCore/index.ts';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  setActiveProject,
  startTestServer,
  writeJson,
  writeProjectMetadata,
} from './projects-api.helpers';
import { handleFileOperationsApi } from '../managementApi.fileOperations.ts';
import { handleLegacyDocsApi } from '../managementApi.legacyDocs.ts';
import { handleProjectSourceAndZipApi } from '../managementApi.sourceZip.ts';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupProjectApiTestRoots();
});

const makePackageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json');

describe('make-server project legacy compatibility APIs', () => {
  it('exposes source and zip compatibility handling from its domain module', () => {
    expect(handleProjectSourceAndZipApi).toBeTypeOf('function');
  });

  it('exposes legacy file operation handling from its domain module', () => {
    expect(handleFileOperationsApi).toBeTypeOf('function');
  });

  it('exposes legacy docs handling from its domain module', () => {
    expect(handleLegacyDocsApi).toBeTypeOf('function');
  });

  it('rejects project-scoped query, JSON, multipart, legacy, and early-domain requests without projectId', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'explicit-project', name: 'Explicit Project' },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'explicit-project', 'Explicit Project');
      const formData = new FormData();
      formData.append('file', new Blob(['# Missing Scope\n'], { type: 'text/markdown' }), 'missing-scope.md');
      const responses = await Promise.all([
        fetch(`${server.origin}/api/config`),
        fetch(`${server.origin}/api/workspace/project`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Wrong Project' }),
        }),
        fetch(`${server.origin}/api/docs/upload`, {
          method: 'POST',
          body: formData,
        }),
        fetch(`${server.origin}/api/entries.json`),
        fetch(`${server.origin}/api/git/status`),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          ok: false,
          code: 'PROJECT_ID_REQUIRED',
          error: 'Project-scoped API requires projectId',
        });
      }
    } finally {
      await server.close();
    }
  });

  it('routes legacy compatibility APIs through the explicit project context', async () => {
    const firstRoot = createTempRoot();
    const secondRoot = createTempRoot();
    writeProjectMetadata(firstRoot, {
      project: { id: 'first-client', name: 'First Client' },
    });
    writeProjectMetadata(secondRoot, {
      project: { id: 'second-client', name: 'Second Client' },
    });
    fs.mkdirSync(path.join(firstRoot, 'src', 'resources'), { recursive: true });
    fs.mkdirSync(path.join(secondRoot, 'src', 'resources'), { recursive: true });
    fs.mkdirSync(path.join(firstRoot, 'src', 'prototypes', 'first-only'), { recursive: true });
    fs.mkdirSync(path.join(secondRoot, 'src', 'prototypes', 'second-only'), { recursive: true });
    fs.writeFileSync(path.join(firstRoot, 'src', 'resources', 'first.md'), '# First\n', 'utf8');
    fs.writeFileSync(path.join(secondRoot, 'src', 'resources', 'second.md'), '# Second\n', 'utf8');
    fs.writeFileSync(path.join(firstRoot, 'src', 'prototypes', 'first-only', 'index.tsx'), 'export default function FirstOnly() { return null; }\n', 'utf8');
    fs.writeFileSync(path.join(secondRoot, 'src', 'prototypes', 'second-only', 'index.tsx'), 'export default function SecondOnly() { return null; }\n', 'utf8');
    writeJson(path.join(firstRoot, '.axhub', 'make', 'axhub.config.json'), {
      server: { host: 'localhost', allowLAN: true },
      projectInfo: { name: 'First Config' },
    });
    writeJson(path.join(secondRoot, '.axhub', 'make', 'axhub.config.json'), {
      server: { host: 'localhost', allowLAN: true },
      projectInfo: { name: 'Second Config' },
    });

    const server = await startTestServer(firstRoot);

    try {
      await registerProject(server.origin, firstRoot, 'first-client', 'First Client');
      await registerProject(server.origin, secondRoot, 'second-client', 'Second Client');
      await setActiveProject(server.origin, 'second-client');

      const config = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/config`)).then((response) => response.json());
      expect(config.projectPath).toBe(secondRoot);
      expect(config.projectInfo.name).toBe('Second Client');

      const docs = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/docs`)).then((response) => response.json());
      expect(docs.map((doc: any) => doc.name)).toEqual(['second.md', 'spec.md']);

      const markdown = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/markdown-file?path=${encodeURIComponent('src/resources/second.md')}`))
        .then((response) => response.text());
      expect(markdown).toBe('# Second\n');

      const markdownMeta = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/markdown-file-meta?path=${encodeURIComponent('src/resources/second.md')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(markdownMeta).toMatchObject({
        status: 200,
        body: {
          exists: true,
          path: path.join(secondRoot, 'src', 'resources', 'second.md'),
          updatedAt: expect.any(String),
        },
      });

      const saveMarkdown = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/markdown-file?path=${encodeURIComponent('src/resources/second.md')}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated Second\n' }),
      });
      expect(saveMarkdown.status).toBe(200);
      expect(fs.readFileSync(path.join(secondRoot, 'src', 'resources', 'second.md'), 'utf8')).toBe('# Updated Second\n');

      const forbidden = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/markdown-file?path=${encodeURIComponent(path.join(firstRoot, 'src/resources/first.md'))}`));
      expect(forbidden.status).toBe(403);

      const forbiddenMeta = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/markdown-file-meta?path=${encodeURIComponent(path.join(firstRoot, 'src/resources/first.md'))}`));
      expect(forbiddenMeta.status).toBe(403);

      const navigation = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/workspace/navigation?tab=prototypes`))
        .then((response) => response.json());
      const itemKeys = JSON.stringify(navigation.tree);
      expect(itemKeys).toContain('prototypes/second-only');
      expect(itemKeys).not.toContain('prototypes/first-only');
    } finally {
      await server.close();
    }
  });

  it('routes legacy file operations through the requested project instead of the active project', async () => {
    const startupRoot = createTempRoot();
    const firstRoot = createTempRoot();
    const secondRoot = createTempRoot();
    writeProjectMetadata(startupRoot, {
      project: { id: 'startup-client', name: 'Startup Client' },
    });
    writeProjectMetadata(firstRoot, {
      project: { id: 'first-client', name: 'First Client' },
      resources: {
        prototypes: [
          {
            id: 'first-only',
            name: 'first-only',
            title: 'First Only',
            clientUrl: '/prototypes/first-only',
            filePath: 'src/prototypes/first-only/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
      navigation: { prototypes: ['first-only'], docs: [] },
    });
    writeProjectMetadata(secondRoot, {
      project: { id: 'second-client', name: 'Second Client' },
      resources: {
        prototypes: [
          {
            id: 'second-only',
            name: 'second-only',
            title: 'Second Only',
            clientUrl: '/prototypes/second-only',
            filePath: 'src/prototypes/second-only/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
      navigation: { prototypes: ['second-only'], docs: [] },
    });
    fs.mkdirSync(path.join(firstRoot, 'src', 'prototypes', 'first-only'), { recursive: true });
    fs.mkdirSync(path.join(secondRoot, 'src', 'prototypes', 'second-only'), { recursive: true });
    fs.writeFileSync(path.join(firstRoot, 'src', 'prototypes', 'first-only', 'index.tsx'), 'export default function FirstOnly() { return null; }\n', 'utf8');
    fs.writeFileSync(path.join(secondRoot, 'src', 'prototypes', 'second-only', 'index.tsx'), 'export default function SecondOnly() { return null; }\n', 'utf8');

    const server = await startTestServer(startupRoot);

    try {
      await registerProject(server.origin, firstRoot, 'first-client', 'First Client');
      await registerProject(server.origin, secondRoot, 'second-client', 'Second Client');
      await setActiveProject(server.origin, 'second-client');
      const projects = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(projects.projects.map((project: any) => project.id)).toEqual(expect.arrayContaining(['first-client', 'second-client']));

      const deleted = await fetch(`${server.origin}/api/delete?projectId=first-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/first-only' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(deleted).toMatchObject({
        status: 200,
        body: { success: true },
      });
      expect(fs.existsSync(path.join(firstRoot, 'src', 'prototypes', 'first-only'))).toBe(false);
      expect(fs.existsSync(path.join(secondRoot, 'src', 'prototypes', 'second-only'))).toBe(true);

      const firstMetadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(firstRoot), 'utf8'));
      const secondMetadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(secondRoot), 'utf8'));
      expect(firstMetadata.resources.prototypes).toEqual([]);
      expect(firstMetadata.navigation.prototypes).toEqual([]);
      expect(secondMetadata.resources.prototypes.map((prototype: any) => prototype.id)).toEqual(['second-only']);
      expect(secondMetadata.navigation.prototypes).toEqual(['second-only']);
    } finally {
      await server.close();
    }
  });

  it('hides resource README and dot-prefixed files from the legacy docs list', async () => {
    const projectRoot = createTempRoot();
    const resourcesDir = path.join(projectRoot, 'src', 'resources');
    fs.mkdirSync(path.join(resourcesDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(resourcesDir, 'README.md'), '# Resources\n', 'utf8');
    fs.writeFileSync(path.join(resourcesDir, '.draft.md'), '# Draft\n', 'utf8');
    fs.writeFileSync(path.join(resourcesDir, '.cache', 'secret.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(resourcesDir, 'visible.json'), '{}\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'legacy-docs-list', name: 'Legacy Docs List' },
      resourceWriteTargets: {
        docs: { type: 'project-relative-path', path: 'src/resources' },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'legacy-docs-list', 'Legacy Docs List');

      const docs = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/docs`)).then((response) => response.json());
      expect(docs.map((doc: any) => doc.name)).toEqual(['spec.md', 'visible.json']);
    } finally {
      await server.close();
    }
  });

  it('shows the unsupported-file preview shell for legacy markdown-file browser navigation to drawio resources', async () => {
    const projectRoot = createTempRoot();
    const resourcesDir = path.join(projectRoot, 'src', 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(resourcesDir, 'order-status-flow.drawio'), '<mxfile />\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'legacy-drawio-preview', name: 'Legacy Drawio Preview' },
      resourceWriteTargets: {
        docs: { type: 'project-relative-path', path: 'src/resources' },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'legacy-drawio-preview', 'Legacy Drawio Preview');

      const response = await fetch(
        scopeProjectApiUrl(projectRoot, `${server.origin}/api/markdown-file?path=${encodeURIComponent('src/resources/order-status-flow.drawio')}`),
        {
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
      );
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('x-axhub-preview-fallback')).toBe('unsupported-file');
      expect(html).toContain('order-status-flow');
      expect(html).toContain('.DRAWIO');
      expect(html).toContain('用系统应用打开');
      expect(html).not.toContain('<mxfile');

      const rawResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/markdown-file?path=${encodeURIComponent('src/resources/order-status-flow.drawio')}&download=1`), {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      expect(rawResponse.status).toBe(200);
      expect(rawResponse.headers.get('content-type')).toBe('application/octet-stream');
      expect(rawResponse.headers.get('x-axhub-preview-fallback')).toBeNull();
      expect(await rawResponse.text()).toBe('<mxfile />\n');
    } finally {
      await server.close();
    }
  });

  it('injects the shared HTML annotation bootstrap into legacy markdown-file HTML previews', async () => {
    const projectRoot = createTempRoot();
    const resourcesDir = path.join(projectRoot, 'src', 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(resourcesDir, 'visual-prd.html'), '<!doctype html><html><body><main>Legacy Visual PRD</main></body></html>', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'legacy-html-preview', name: 'Legacy HTML Preview' },
      resourceWriteTargets: {
        docs: { type: 'project-relative-path', path: 'src/resources' },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'legacy-html-preview', 'Legacy HTML Preview');

      const response = await fetch(
        scopeProjectApiUrl(projectRoot, `${server.origin}/api/markdown-file?path=${encodeURIComponent('src/resources/visual-prd.html')}`),
        {
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
      );
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('Legacy Visual PRD');
      expect(html).toContain('<script type="module" src="/assets/html-template-bootstrap.js"></script>');
    } finally {
      await server.close();
    }
  });

  it('supports legacy spec-doc protocol for standalone Markdown docs through the active project context', async () => {
    const projectRoot = createTempRoot();
    const docsDir = path.join(projectRoot, 'src', 'resources');
    fs.mkdirSync(path.join(docsDir, 'images'), { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide\n![Logo](images/logo.svg)\n', 'utf8');
    fs.writeFileSync(path.join(docsDir, 'images', 'logo.svg'), '<svg />', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'legacy-spec-doc', name: 'Legacy Spec Doc' },
      resourceWriteTargets: {
        docs: { type: 'project-relative-path', path: 'src/resources' },
      },
    });

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'legacy-spec-doc', 'Legacy Spec Doc');

      const saveDoc = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/spec-doc/save`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docUrl: '/docs/guide.md',
          content: '# Updated Guide\n',
        }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(saveDoc).toMatchObject({
        status: 200,
        body: {
          success: true,
          path: path.join(projectRoot, 'src', 'resources', 'guide.md'),
        },
      });
      expect(fs.readFileSync(path.join(docsDir, 'guide.md'), 'utf8')).toBe('# Updated Guide\n');

      const formData = new FormData();
      formData.append('docUrl', '/docs/guide.md');
      formData.append('file', new File(['png'], 'hero.png', { type: 'image/png' }));
      const uploadImage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/spec-doc/upload-image`), {
        method: 'POST',
        body: formData,
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(uploadImage).toMatchObject({
        status: 201,
        body: {
          success: true,
          path: 'src/resources/assets/hero.png',
          url: 'assets/hero.png',
        },
      });
      expect(fs.readFileSync(path.join(docsDir, 'assets', 'hero.png'), 'utf8')).toBe('png');

      const prototypeSpecSave = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/spec-doc/save`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docUrl: '/prototypes/home/spec.md',
          content: '# Should Not Be Created\n',
        }),
      });
      expect(prototypeSpecSave.status).toBe(400);
      expect(fs.existsSync(path.join(projectRoot, 'src', 'prototypes', 'home', 'spec.md'))).toBe(false);

      const asset = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/markdown-file-asset?path=${encodeURIComponent('src/resources/guide.md')}&asset=${encodeURIComponent('images/logo.svg')}`));
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toBe('image/svg+xml');
      await expect(asset.text()).resolves.toBe('<svg />');

      const forbiddenAsset = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/markdown-file-asset?path=${encodeURIComponent('src/resources/guide.md')}&asset=${encodeURIComponent('../secret.svg')}`));
      expect(forbiddenAsset.status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it('rejects legacy delete requests that target the active project root', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'delete-root-client', name: 'Delete Root Client' },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'delete-root-client', 'Delete Root Client');

      const deleted = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/delete`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '.' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(deleted).toMatchObject({
        status: 403,
        body: {
          code: 'PROJECT_ROOT_OPERATION_FORBIDDEN',
        },
      });
      expect(fs.existsSync(projectRoot)).toBe(true);
      expect(fs.existsSync(getProjectMetadataPath(projectRoot))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('routes legacy source and zip fallbacks through explicit projectId', async () => {
    const firstRoot = createTempRoot();
    const secondRoot = createTempRoot();
    writeProjectMetadata(firstRoot, {
      project: { id: 'first-client', name: 'First Client' },
    });
    writeProjectMetadata(secondRoot, {
      project: { id: 'second-client', name: 'Second Client' },
    });
    const secondPrototypeDir = path.join(secondRoot, 'src', 'prototypes', 'dashboard');
    fs.mkdirSync(secondPrototypeDir, { recursive: true });
    fs.writeFileSync(path.join(secondPrototypeDir, 'index.tsx'), 'export default function Dashboard() { return "second"; }\n', 'utf8');

    const server = await startTestServer(firstRoot);

    try {
      await registerProject(server.origin, secondRoot, 'second-client', 'Second Client');

      const source = await fetch(`${server.origin}/api/source?projectId=second-client&path=${encodeURIComponent('prototypes/dashboard')}`);
      expect(source.status).toBe(200);
      expect(await source.text()).toContain('Dashboard');

      const zipProbe = await fetch(`${server.origin}/api/zip?projectId=second-client&path=${encodeURIComponent('prototypes/dashboard')}&probe=1`)
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(zipProbe).toMatchObject({
        status: 200,
        body: {
          ok: true,
          fileName: 'dashboard.zip',
          path: 'prototypes/dashboard',
          projectId: 'second-client',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('accepts src-prefixed prototype paths in legacy zip fallback probes', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'src-prefixed-zip', name: 'Src Prefixed Zip' },
    });
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'bi-marketing-dashboard');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Dashboard() { return null; }\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'src-prefixed-zip', 'Src Prefixed Zip');

      const zipProbe = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/zip?path=${encodeURIComponent('src/prototypes/bi-marketing-dashboard')}&probe=1`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(zipProbe).toMatchObject({
        status: 200,
        body: {
          ok: true,
          fileName: 'bi-marketing-dashboard.zip',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('streams legacy zip fallback downloads as readable zip archives', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'legacy-zip-download', name: 'Legacy Zip Download' },
    });
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'zip-preview');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function ZipPreview() { return null; }\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'legacy-zip-download', 'Legacy Zip Download');

      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/zip?path=${encodeURIComponent('src/prototypes/zip-preview')}&download=1`));
      const body = new Uint8Array(await response.arrayBuffer());
      const entries = unzipSync(body);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
      expect(Object.keys(entries)).toContain('index.tsx');
    } finally {
      await server.close();
    }
  });

  it('exports metadata-backed design directories as ZIP archives', async () => {
    const projectRoot = createTempRoot();
    const themeDir = path.join(projectRoot, 'src', 'themes', 'brand-design');
    fs.mkdirSync(themeDir, { recursive: true });
    fs.writeFileSync(path.join(themeDir, 'designToken.json'), '{"name":"Brand Design"}\n', 'utf8');
    fs.writeFileSync(path.join(themeDir, 'style.css'), '.brand { color: red; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'theme-directory-export', name: 'Theme Directory Export' },
      resources: {
        themes: [
          {
            id: 'brand-design',
            name: 'brand-design',
            title: 'Brand Design',
            path: 'src/themes/brand-design',
            sourcePath: 'src/themes/brand-design',
          },
        ],
      },
    });

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'theme-directory-export', 'Theme Directory Export');

      const zipProbe = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/zip?path=${encodeURIComponent('src/themes/brand-design')}&probe=1`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(zipProbe).toMatchObject({
        status: 200,
        body: {
          ok: true,
          fileName: 'brand-design.zip',
          path: 'src/themes/brand-design',
          projectId: 'theme-directory-export',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns stable disabled responses for source APIs and validates prompt execute on metadata-only projects', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'metadata-only', name: 'Metadata Only' },
      resources: {
        prototypes: [
          {
            id: 'preview',
            name: 'preview',
            title: 'Preview',
            clientUrl: 'http://localhost:3000/preview',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'metadata-only', 'Metadata Only');

      const source = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/source?path=${encodeURIComponent('prototypes/preview')}`));
      const sourceBody = await source.json();
      expect(source.status).toBe(424);
      expect(sourceBody).toMatchObject({
        code: 'SOURCE_METADATA_REQUIRED',
        projectId: 'metadata-only',
      });

      const exportBundle = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/export-index-bundle?path=${encodeURIComponent('prototypes/preview')}`));
      const exportBundleBody = await exportBundle.json();
      expect(exportBundle.status).toBe(424);
      expect(exportBundleBody).toMatchObject({
        code: 'SOURCE_METADATA_REQUIRED',
        adapterRequired: true,
      });

      const exportHtml = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/export-html?path=${encodeURIComponent('prototypes/preview')}`));
      const exportHtmlBody = await exportHtml.json();
      expect(exportHtml.status).toBe(424);
      expect(exportHtmlBody).toMatchObject({
        code: 'ADAPTER_REQUIRED',
        adapterRequired: true,
      });

      const promptExecute = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prompt/execute`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'hello' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(promptExecute).toMatchObject({
        status: 404,
        body: {
          error: 'Not found',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('honors explicit projectId on legacy routes and validates IDE targets against the selected project', async () => {
    const firstRoot = createTempRoot();
    const secondRoot = createTempRoot();
    writeProjectMetadata(firstRoot, {
      project: { id: 'first-client', name: 'First Client' },
    });
    writeProjectMetadata(secondRoot, {
      project: { id: 'second-client', name: 'Second Client' },
    });
    writeJson(path.join(secondRoot, '.axhub', 'make', 'axhub.config.json'), {
      server: { host: 'localhost', allowLAN: true },
      projectInfo: { name: 'Second Config' },
    });

    const server = await startTestServer(firstRoot);

    try {
      await registerProject(server.origin, secondRoot, 'second-client', 'Second Client');

      const config = await fetch(`${server.origin}/api/config?projectId=second-client`).then((response) => response.json());
      expect(config).toMatchObject({
        projectId: 'second-client',
        projectPath: secondRoot,
        projectInfo: { name: 'Second Client' },
      });

      const ide = await fetch(`${server.origin}/api/ide/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'second-client', targetPath: '../outside' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(ide).toMatchObject({
        status: 403,
        body: {
          code: 'PATH_OUTSIDE_PROJECT',
          projectId: 'second-client',
        },
      });

      await setActiveProject(server.origin, 'second-client');
      writeJson(path.join(secondRoot, 'package.json'), {
        version: '0.1.0',
        scripts: { dev: 'vite' },
      });
      const version = await fetch(`${server.origin}/api/version`).then((response) => response.json());
      expect(version.projectId).toBe('second-client');
      expect(version.version).toBe(JSON.parse(fs.readFileSync(makePackageJsonPath, 'utf8')).version);
      expect(version.version).not.toBe('0.1.0');

      fs.mkdirSync(path.join(firstRoot, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(firstRoot, 'dist', 'first.txt'), 'first\n', 'utf8');
      const dist = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/download-dist`));
      const distBody = await dist.json().catch(() => ({}));
      expect(dist.status).toBe(404);
      expect(distBody.error).toBe('Dist directory not found');

      fs.mkdirSync(path.join(firstRoot, 'src', 'prototypes', 'home'), { recursive: true });
      fs.writeFileSync(path.join(firstRoot, 'src', 'prototypes', 'home', 'index.tsx'), 'first\n', 'utf8');
      const source = await fetch(scopeProjectApiUrl(secondRoot, `${server.origin}/api/source?path=${encodeURIComponent('prototypes/home')}`));
      const sourceBody = await source.json();
      expect(source.status).toBe(424);
      expect(sourceBody.projectId).toBe('second-client');
    } finally {
      await server.close();
    }
  });
});
