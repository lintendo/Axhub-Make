import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  setActiveProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

function writePrototypeProject(projectRoot: string): void {
  writeProjectMetadata(projectRoot, {
    resources: {
      prototypes: [{
        id: 'home',
        name: 'home',
        title: 'Home',
        clientUrl: 'http://localhost:3000/home',
        filePath: 'src/prototypes/home/index.tsx',
      }],
      themes: [],
    },
    navigation: { prototypes: ['home'] },
    orders: { themes: [] },
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
      templates: { type: 'project-relative-path', path: 'src/resources/templates' },
    },
  });
  const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
  fs.mkdirSync(prototypeDir, { recursive: true });
  fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
}

function writeSpecOnlyPrototypeProject(projectRoot: string): void {
  writeProjectMetadata(projectRoot, {
    resources: {
      prototypes: [{
        id: 'home',
        name: 'home',
        title: 'Home',
        clientUrl: '/prototypes/home',
        previewDisabled: true,
        specFilePath: 'src/prototypes/home/.spec/spec.html',
      }],
      themes: [],
    },
    navigation: { prototypes: ['home'] },
    orders: { themes: [] },
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
      templates: { type: 'project-relative-path', path: 'src/resources/templates' },
    },
  });
  const specDir = path.join(projectRoot, 'src/prototypes/home/.spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.html'), '<!doctype html><html><body><h1>Spec only</h1></body></html>', 'utf8');
}

async function startActivatedProjectServer(projectRoot: string): Promise<Awaited<ReturnType<typeof startTestServer>>> {
  const server = await startTestServer(projectRoot);
  const projectId = path.basename(projectRoot);
  await registerProject(server.origin, projectRoot, projectId, projectId);
  await setActiveProject(server.origin, projectId);
  return server;
}

function specUrl(origin: string, projectRoot: string, suffix = ''): string {
  const projectId = encodeURIComponent(path.basename(projectRoot));
  return `${origin}/api/projects/${projectId}/prototypes/home/spec${suffix}`;
}

afterEach(() => {
  cleanupProjectApiTestRoots();
});

describe('prototype spec API', () => {
  it('serves a main HTML spec when the prototype has no runtime entry yet', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writeSpecOnlyPrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const resourcesResponse = await fetch(`${server.origin}/api/projects/${encodeURIComponent(path.basename(projectRoot))}/resources`);
      expect(resourcesResponse.status).toBe(200);
      expect((await resourcesResponse.json()).resources.prototypes).toEqual([
        expect.objectContaining({
          id: 'home',
          specFilePath: 'src/prototypes/home/.spec/spec.html',
          previewDisabled: true,
        }),
      ]);

      const descriptorResponse = await fetch(specUrl(server.origin, projectRoot));
      expect(descriptorResponse.status).toBe(200);
      expect(await descriptorResponse.json()).toMatchObject({
        exists: true,
        format: 'html',
        activePath: 'spec.html',
      });

      const contentResponse = await fetch(specUrl(server.origin, projectRoot, '/content'));
      expect(contentResponse.status).toBe(200);
      expect(await contentResponse.text()).toContain('<h1>Spec only</h1>');
    } finally {
      await server.close();
    }
  });

  it('enables runtime preview metadata after index.tsx is added to a spec-only prototype', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writeSpecOnlyPrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
      fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');

      const resourcesResponse = await fetch(`${server.origin}/api/projects/${encodeURIComponent(path.basename(projectRoot))}/resources`);
      expect(resourcesResponse.status).toBe(200);
      const prototype = (await resourcesResponse.json()).resources.prototypes[0];
      expect(prototype).toMatchObject({
        id: 'home',
        filePath: 'src/prototypes/home/index.tsx',
        absoluteFilePath: path.join(prototypeDir, 'index.tsx'),
        specFilePath: 'src/prototypes/home/.spec/spec.html',
      });
      expect(prototype).not.toHaveProperty('previewDisabled');
    } finally {
      await server.close();
    }
  });

  it('keeps the spec review available after a runtime entry is removed', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    const specDir = path.join(prototypeDir, '.spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'spec.html'), '<h1>Spec after runtime</h1>', 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      fs.rmSync(path.join(prototypeDir, 'index.tsx'));

      const resourcesResponse = await fetch(`${server.origin}/api/projects/${encodeURIComponent(path.basename(projectRoot))}/resources`);
      expect(resourcesResponse.status).toBe(200);
      const prototype = (await resourcesResponse.json()).resources.prototypes[0];
      expect(prototype).toMatchObject({
        id: 'home',
        previewDisabled: true,
        specFilePath: 'src/prototypes/home/.spec/spec.html',
      });
      expect(prototype).not.toHaveProperty('filePath');
      expect(prototype).not.toHaveProperty('absoluteFilePath');

      const descriptorResponse = await fetch(specUrl(server.origin, projectRoot));
      expect(descriptorResponse.status).toBe(200);
      expect(await descriptorResponse.json()).toMatchObject({
        exists: true,
        activePath: 'spec.html',
      });
    } finally {
      await server.close();
    }
  });

  it('reports a missing main spec without exposing an absolute path', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        exists: false,
        format: null,
        activePath: null,
        hasHtml: false,
        hasMarkdown: false,
        previewUrl: null,
        editable: false,
      });
    } finally {
      await server.close();
    }
  });

  it('prefers spec.html and serves injected HTML with relative spec URLs', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const specDir = path.join(projectRoot, 'src/prototypes/home/.spec');
    fs.mkdirSync(path.join(specDir, 'documents'), { recursive: true });
    fs.mkdirSync(path.join(specDir, 'styles'), { recursive: true });
    fs.mkdirSync(path.join(specDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(specDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(specDir, 'spec.md'), '# Markdown fallback\n', 'utf8');
    const sourceHtml = '<!doctype html><html><head><link rel="stylesheet" href="styles/site.css"></head><body><a href="documents/flow.md">Flow</a><a href="documents/section-a.html">Section A</a><img src="assets/hero.png"><script type="module" src="scripts/app.js"></script></body></html>';
    expect(sourceHtml).not.toContain('data-axhub-prototype-spec-document-link');
    expect(sourceHtml).not.toContain('axhub-prototype-spec:navigate');
    fs.writeFileSync(path.join(specDir, 'spec.html'), sourceHtml, 'utf8');
    fs.writeFileSync(path.join(specDir, 'styles/site.css'), 'body{background:url("../assets/hero.png")}\n', 'utf8');
    fs.writeFileSync(path.join(specDir, 'scripts/app.js'), 'import "./feature.js";\n', 'utf8');
    fs.writeFileSync(path.join(specDir, 'scripts/feature.js'), 'export const ready = true;\n', 'utf8');
    fs.writeFileSync(path.join(specDir, 'assets/hero.png'), 'png', 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const descriptorResponse = await fetch(specUrl(server.origin, projectRoot));
      expect(await descriptorResponse.json()).toEqual({
        exists: true,
        format: 'html',
        activePath: 'spec.html',
        hasHtml: true,
        hasMarkdown: true,
        previewUrl: `/api/projects/${encodeURIComponent(path.basename(projectRoot))}/prototypes/home/spec/content`,
        editable: false,
      });

      const contentResponse = await fetch(specUrl(server.origin, projectRoot, '/content'), {
        headers: { Accept: 'text/html' },
      });
      expect(contentResponse.status).toBe(200);
      expect(contentResponse.headers.get('content-type')).toContain('text/html');
      const html = await contentResponse.text();
      expect(html).toContain('/assets/html-template-bootstrap.js');
      expect(html).toContain('prototype-spec-document-link');
      expect(html).toContain('data-axhub-prototype-spec-document-link="documents/section-a.html"');
      expect(html).toContain('axhub-prototype-spec:navigate');
      expect(html).toContain(encodeURIComponent('documents/flow.md'));
      const apiBase = `/api/projects/${encodeURIComponent(path.basename(projectRoot))}/prototypes/home/spec/content/files`;
      expect(html).toContain(`${apiBase}/assets/hero.png`);
      expect(html).toContain(`${apiBase}/styles/site.css`);
      expect(html).toContain(`${apiBase}/scripts/app.js`);

      const cssResponse = await fetch(`${server.origin}${apiBase}/styles/site.css`);
      expect(cssResponse.status).toBe(200);
      expect(await cssResponse.text()).toContain('../assets/hero.png');
      const cssAssetUrl = new URL('../assets/hero.png', cssResponse.url);
      expect(cssAssetUrl.pathname).toBe(`${apiBase}/assets/hero.png`);
      expect((await fetch(cssAssetUrl)).status).toBe(200);

      const scriptResponse = await fetch(`${server.origin}${apiBase}/scripts/app.js`);
      expect(scriptResponse.status).toBe(200);
      expect(await scriptResponse.text()).toContain('./feature.js');
      expect((await fetch(new URL('./feature.js', scriptResponse.url))).status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('falls back to spec.md and allows Markdown saves', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const specDir = path.join(projectRoot, 'src/prototypes/home/.spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'spec.md'), '# Original\n', 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const descriptorResponse = await fetch(specUrl(server.origin, projectRoot));
      expect(await descriptorResponse.json()).toMatchObject({
        exists: true,
        format: 'markdown',
        activePath: 'spec.md',
        editable: true,
      });

      const putResponse = await fetch(specUrl(server.origin, projectRoot, '/content?path=spec.md'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated\n' }),
      });
      expect(putResponse.status).toBe(200);
      expect(fs.readFileSync(path.join(specDir, 'spec.md'), 'utf8')).toBe('# Updated\n');
    } finally {
      await server.close();
    }
  });

  it('does not expose a manual spec creation endpoint', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: path.basename(projectRoot), format: 'html' }),
      });
      expect(response.status).toBe(404);
      expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/home/.spec/spec.html'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/home/.spec/spec.md'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('resolves prototype specs by exact id before any matching resource name', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writeProjectMetadata(projectRoot, {
      resources: {
        prototypes: [
          {
            id: 'alias',
            name: 'home',
            title: 'Alias',
            clientUrl: 'http://localhost:3000/alias',
            filePath: 'src/prototypes/alias/index.tsx',
          },
          {
            id: 'home',
            name: 'home-real',
            title: 'Home',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
        ],
        themes: [],
      },
    });
    for (const [prototypeId, content] of [['alias', '# Alias\n'], ['home', '# Home\n']] as const) {
      const prototypeDir = path.join(projectRoot, 'src/prototypes', prototypeId);
      fs.mkdirSync(path.join(prototypeDir, '.spec'), { recursive: true });
      fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Prototype() { return null; }\n', 'utf8');
      fs.writeFileSync(path.join(prototypeDir, '.spec/spec.md'), content, 'utf8');
    }
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot, '/content?path=spec.md'));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('# Home\n');
    } finally {
      await server.close();
    }
  });

  it('rejects HTML writes, traversal, runtime files, and missing source paths', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const specDir = path.join(projectRoot, 'src/prototypes/home/.spec');
    fs.mkdirSync(path.join(specDir, 'acp'), { recursive: true });
    fs.writeFileSync(path.join(specDir, 'acp/conversations.json'), '{}', 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      fs.writeFileSync(path.join(specDir, 'spec.html'), '<h1>Spec</h1>', 'utf8');

      const htmlWrite = await fetch(specUrl(server.origin, projectRoot, '/content?path=spec.html'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '<h1>Changed</h1>' }),
      });
      expect(htmlWrite.status).toBe(405);

      for (const candidate of ['../secret.md', 'acp/conversations.json', '/etc/passwd']) {
        const response = await fetch(specUrl(server.origin, projectRoot, `/content?path=${encodeURIComponent(candidate)}`));
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'INVALID_SPEC_PATH' });
      }
    } finally {
      await server.close();
    }

    const unavailableRoot = createTempRoot('axhub-make-prototype-spec-');
    writeProjectMetadata(unavailableRoot, {
      resources: {
        prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
        themes: [],
      },
    });
    const unavailableServer = await startActivatedProjectServer(unavailableRoot);
    try {
      const unavailable = await fetch(specUrl(unavailableServer.origin, unavailableRoot));
      expect(unavailable.status).toBe(424);
      expect(await unavailable.json()).toMatchObject({ code: 'PROTOTYPE_SPEC_UNAVAILABLE' });
    } finally {
      await unavailableServer.close();
    }
  });

  it('rejects a .spec symlink that escapes the selected prototype directory', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    const otherSpecDir = path.join(projectRoot, 'src/prototypes/other/.spec');
    fs.mkdirSync(otherSpecDir, { recursive: true });
    fs.writeFileSync(path.join(otherSpecDir, 'spec.md'), '# Other prototype\n', 'utf8');
    fs.symlinkSync(otherSpecDir, path.join(prototypeDir, '.spec'), 'dir');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot));
      expect(response.status).toBe(424);
      expect(await response.json()).toMatchObject({ code: 'PROTOTYPE_SPEC_UNAVAILABLE' });
    } finally {
      await server.close();
    }
  });

  it('rejects a main spec file symlink that escapes the .spec directory', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const specDir = path.join(projectRoot, 'src/prototypes/home/.spec');
    const outsideSpec = path.join(projectRoot, 'src/prototypes/other/spec.md');
    fs.mkdirSync(specDir, { recursive: true });
    fs.mkdirSync(path.dirname(outsideSpec), { recursive: true });
    fs.writeFileSync(outsideSpec, '# Other prototype\n', 'utf8');
    fs.symlinkSync(outsideSpec, path.join(specDir, 'spec.md'));
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot));
      expect(response.status).toBe(424);
      expect(await response.json()).toMatchObject({ code: 'PROTOTYPE_SPEC_UNAVAILABLE' });
    } finally {
      await server.close();
    }
  });

  it('rejects aliases that resolve into protected spec runtime directories', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const specDir = path.join(projectRoot, 'src/prototypes/home/.spec');
    fs.mkdirSync(path.join(specDir, 'documents'), { recursive: true });
    fs.mkdirSync(path.join(specDir, 'reviews'), { recursive: true });
    fs.writeFileSync(path.join(specDir, 'spec.md'), '# Home\n', 'utf8');
    fs.writeFileSync(path.join(specDir, 'reviews/private.md'), '# Private\n', 'utf8');
    fs.symlinkSync('../reviews/private.md', path.join(specDir, 'documents/private.md'));
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const target = specUrl(server.origin, projectRoot, '/content?path=documents%2Fprivate.md');
      const readResponse = await fetch(target);
      expect(readResponse.status).toBe(403);
      expect(await readResponse.json()).toMatchObject({ code: 'INVALID_SPEC_PATH' });

      const writeResponse = await fetch(target, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Changed\n' }),
      });
      expect(writeResponse.status).toBe(403);
      expect(fs.readFileSync(path.join(specDir, 'reviews/private.md'), 'utf8')).toBe('# Private\n');
    } finally {
      await server.close();
    }
  });

  it('rejects a prototype source directory symlink that escapes the project root', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    const outsideRoot = createTempRoot('axhub-make-prototype-spec-outside-');
    const outsidePrototypeDir = path.join(outsideRoot, 'home');
    fs.mkdirSync(path.join(outsidePrototypeDir, '.spec'), { recursive: true });
    fs.writeFileSync(path.join(outsidePrototypeDir, 'index.tsx'), 'export default function Outside() { return null; }\n', 'utf8');
    fs.writeFileSync(path.join(outsidePrototypeDir, '.spec/spec.md'), '# Outside\n', 'utf8');
    fs.rmSync(prototypeDir, { recursive: true, force: true });
    fs.symlinkSync(outsidePrototypeDir, prototypeDir, 'dir');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot));
      expect(response.status).toBe(424);
      expect(await response.json()).toMatchObject({ code: 'PROTOTYPE_SPEC_UNAVAILABLE' });
    } finally {
      await server.close();
    }
  });

  it('rejects metadata that points to a missing prototype source file', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-spec-');
    writePrototypeProject(projectRoot);
    fs.rmSync(path.join(projectRoot, 'src/prototypes/home/index.tsx'));
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(specUrl(server.origin, projectRoot));
      expect(response.status).toBe(424);
      expect(await response.json()).toMatchObject({ code: 'PROTOTYPE_SPEC_UNAVAILABLE' });
    } finally {
      await server.close();
    }
  });
});
