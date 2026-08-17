import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  setActiveProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

function writePrototypeProject(projectRoot: string, indexSource = 'export default function Home() { return <main id="hero" />; }\n'): void {
  writeProjectMetadata(projectRoot, {
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
    },
  });
  const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
  fs.mkdirSync(prototypeDir, { recursive: true });
  fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), indexSource, 'utf8');
}

async function startActivatedProjectServer(projectRoot: string): Promise<Awaited<ReturnType<typeof startTestServer>>> {
  const server = await startTestServer(projectRoot);
  const projectId = path.basename(projectRoot);
  await registerProject(server.origin, projectRoot, projectId, projectId);
  await setActiveProject(server.origin, projectId);
  return server;
}

afterEach(() => {
  cleanupProjectApiTestRoots();
});

describe('prototype annotation API', () => {
  it('reports annotation injection status for official template prototypes', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes/home`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        enabled: false,
        exists: false,
        source: null,
        path: 'src/prototypes/home/annotation-source.json',
      });
    } finally {
      await server.close();
    }
  });

  it('allows preview pages to read annotation status across origins', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes/home`), {
        headers: {
          Origin: 'http://localhost:51720',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      await server.close();
    }
  });

  it('allows preview pages to preflight annotation node writes', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:51720',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('PUT');
      expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
    } finally {
      await server.close();
    }
  });

  it('reports source files without AnnotationViewer integration as not enabled', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes/home`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        enabled: false,
        exists: true,
        path: 'src/prototypes/home/annotation-source.json',
        source: {
          format: 'axhub-annotation-source',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('enables annotation by creating source and wiring the prototype entry', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const indexPath = path.join(projectRoot, 'src/prototypes/home/index.tsx');
      const originalIndexSource = fs.readFileSync(indexPath, 'utf8');
      const first = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: 'prototypes/home' }),
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({
        ok: true,
        enabled: true,
        changedIndex: true,
        path: 'src/prototypes/home/annotation-source.json',
        source: {
          documentVersion: 1,
          format: 'axhub-annotation-source',
          data: {
            version: 2,
            prototypeName: 'home',
            nodes: [],
          },
        },
      });

      const sourcePath = path.join(projectRoot, 'src/prototypes/home/annotation-source.json');
      expect(fs.existsSync(sourcePath)).toBe(true);
      const nextIndexSource = fs.readFileSync(indexPath, 'utf8');
      expect(nextIndexSource).not.toBe(originalIndexSource);
      expect(nextIndexSource).toContain("import { AnnotationViewer, type AnnotationSourceDocument } from '@axhub/annotation';");
      expect(nextIndexSource).toContain("import annotationSourceDocument from './annotation-source.json';");
      expect(nextIndexSource).toContain('<AnnotationViewer');
      expect(nextIndexSource).toContain('source={annotationSourceDocument as unknown as AnnotationSourceDocument}');
      expect(nextIndexSource).toContain("new URLSearchParams(window.location.hash.replace(/^#/, '')).get('page')");
      expect(nextIndexSource).toContain("new URLSearchParams(window.location.search.replace(/^\\?/, '')).get('page')");
      expect(nextIndexSource).toContain("typeof pageId === 'string' && /^[a-z0-9-]+$/u.test(pageId)");
      expect(nextIndexSource).toContain('onDirectoryRoute: (node) => {');
      expect(nextIndexSource).toContain("typeof node.route === 'string' && /^[a-z0-9-]+$/u.test(node.route)");
      expect(nextIndexSource).toContain('window.location.hash = `page=${node.route}`;');

      const second = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: 'prototypes/home' }),
      });
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({
        ok: true,
        enabled: true,
        changedIndex: false,
      });
      expect(fs.readFileSync(indexPath, 'utf8')).toBe(nextIndexSource);
    } finally {
      await server.close();
    }
  });

  it('creates a standard page directory from valid multi-page metadata', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          pages: [
            { id: 'home', title: ' 首页 ' },
            { id: 'INVALID', title: '无效页面' },
            { id: 'orders', title: '订单列表', group: '业务' },
            { id: 'home', title: '重复首页' },
            { id: 'empty-title', title: '   ' },
          ],
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.source.directory).toEqual({
        nodes: [{
          type: 'folder',
          id: 'directory-pages',
          title: '页面',
          defaultExpanded: true,
          children: [
            { type: 'route', id: 'route-home', title: '首页', route: 'home' },
            { type: 'route', id: 'route-orders', title: '订单列表', route: 'orders' },
          ],
        }],
      });
      expect(JSON.parse(fs.readFileSync(
        path.join(projectRoot, 'src/prototypes/home/annotation-source.json'),
        'utf8',
      )).directory).toEqual(body.source.directory);
    } finally {
      await server.close();
    }
  });

  it.each([
    { label: 'missing page metadata', pages: undefined },
    { label: 'a single valid page', pages: [{ id: 'home', title: '首页' }] },
  ])('does not create a directory with $label', async ({ pages }) => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          ...(pages ? { pages } : {}),
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.source).not.toHaveProperty('directory');
    } finally {
      await server.close();
    }
  });

  it('preserves an existing annotation directory when enabling repeatedly', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const sourcePath = path.join(projectRoot, 'src/prototypes/home/annotation-source.json');
    const existingDirectory = {
      nodes: [{ type: 'markdown', id: 'doc-overview', title: '说明', markdown: '# 说明' }],
    };
    fs.writeFileSync(sourcePath, `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
      directory: existingDirectory,
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const request = () => fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          pages: [
            { id: 'home', title: '首页' },
            { id: 'orders', title: '订单' },
          ],
        }),
      });
      await request();
      const response = await request();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.source.directory).toEqual(existingDirectory);
    } finally {
      await server.close();
    }
  });

  it('adds AnnotationViewer even when the prototype already imports other annotation helpers', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot, [
      "import { useProtoDevState } from '@axhub/annotation';",
      '',
      'const Home = () => {',
      '  useProtoDevState();',
      '  return <main id="hero" />;',
      '};',
      '',
      'export default Home;',
      '',
    ].join('\n'));
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: 'prototypes/home' }),
      });
      const body = await response.json();
      const indexPath = path.join(projectRoot, 'src/prototypes/home/index.tsx');
      const nextIndexSource = fs.readFileSync(indexPath, 'utf8');

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        enabled: true,
        changedIndex: true,
      });
      expect(nextIndexSource).toContain("import { AnnotationViewer, type AnnotationSourceDocument } from '@axhub/annotation';");
      expect(nextIndexSource).toContain("import { useProtoDevState } from '@axhub/annotation';");
      expect(nextIndexSource).toContain("import annotationSourceDocument from './annotation-source.json';");
      expect(nextIndexSource).toContain('<AnnotationViewer');
    } finally {
      await server.close();
    }
  });

  it('writes markdown for an existing annotation node without changing controls', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        updatedAt: 1,
        nodes: [
          {
            id: 'hero',
            index: 1,
            locator: { selectors: ['#hero'], path: [] },
            aiPrompt: '',
            annotationText: '',
            hasMarkdown: true,
            color: '#1677FF',
            images: [],
            controls: [{ type: 'segmented', attributeId: 'state', displayName: '状态', options: [] }],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      markdownMap: { hero: '旧内容' },
      assetMap: {},
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          nodeId: 'hero',
          markdown: '# 新需求',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        source: {
          markdownMap: {
            hero: '# 新需求',
          },
        },
      });
      expect(body.source.data.nodes[0].controls).toEqual([
        { type: 'segmented', attributeId: 'state', displayName: '状态', options: [] },
      ]);
      expect(JSON.parse(fs.readFileSync(path.join(prototypeDir, 'annotation-source.json'), 'utf8')).markdownMap.hero).toBe('# 新需求');
    } finally {
      await server.close();
    }
  });

  it('deletes an existing annotation node when writing empty markdown', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        updatedAt: 1,
        nodes: [
          {
            id: 'hero',
            index: 1,
            locator: { selectors: ['#hero'], path: [] },
            aiPrompt: '',
            annotationText: '',
            hasMarkdown: true,
            color: '#1677FF',
            images: [],
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'footer',
            index: 2,
            locator: { selectors: ['#footer'], path: [] },
            aiPrompt: '',
            annotationText: '',
            hasMarkdown: true,
            color: '#1677FF',
            images: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      markdownMap: { hero: '旧内容', footer: '页脚需求' },
      assetMap: {},
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          nodeId: 'hero',
          markdown: '',
        }),
      });
      const body = await response.json();
      const persisted = JSON.parse(fs.readFileSync(path.join(prototypeDir, 'annotation-source.json'), 'utf8'));

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        nodeId: 'hero',
      });
      expect(body.source.data.nodes.map((node: { id: string }) => node.id)).toEqual(['footer']);
      expect(body.source.markdownMap).toEqual({ footer: '页脚需求' });
      expect(persisted.data.nodes.map((node: { id: string }) => node.id)).toEqual(['footer']);
      expect(persisted.markdownMap).toEqual({ footer: '页脚需求' });
    } finally {
      await server.close();
    }
  });

  it('drops markdown entries that no longer have annotation nodes', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        updatedAt: 1,
        nodes: [
          {
            id: 'hero',
            index: 1,
            locator: { selectors: ['#hero'], path: [] },
            aiPrompt: '',
            annotationText: '',
            hasMarkdown: true,
            color: '#1677FF',
            images: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      markdownMap: {
        hero: '旧内容',
        orphan: '不应继续保留',
      },
      assetMap: {},
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const statusResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes%2Fhome`));
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody.source.markdownMap).toEqual({ hero: '旧内容' });

      const writeResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          nodeId: 'hero',
          markdown: '# 新需求',
        }),
      });
      const writeBody = await writeResponse.json();
      const persisted = JSON.parse(fs.readFileSync(path.join(prototypeDir, 'annotation-source.json'), 'utf8'));

      expect(writeResponse.status).toBe(200);
      expect(writeBody.source.markdownMap).toEqual({ hero: '# 新需求' });
      expect(persisted.markdownMap).toEqual({ hero: '# 新需求' });
    } finally {
      await server.close();
    }
  });

  it('updates an existing annotation node when the selected element locator shares a selector', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        updatedAt: 1,
        nodes: [
          {
            id: 'hero',
            index: 1,
            locator: { selectors: ['#hero'] },
            aiPrompt: '',
            annotationText: '',
            hasMarkdown: true,
            color: '#1677FF',
            images: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      markdownMap: { hero: '旧内容' },
      assetMap: {},
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          locator: {
            selectors: ['#hero'],
            fingerprint: 'main|id=hero',
            path: [{ tag: 'main', index: 0 }],
          },
          markdown: '# 更新后的需求',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.nodeId).toBe('hero');
      expect(body.source.data.nodes).toHaveLength(1);
      expect(body.source.markdownMap.hero).toBe('# 更新后的需求');
    } finally {
      await server.close();
    }
  });

  it('creates a markdown annotation node for a selected element when none exists', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: 'prototypes/home' }),
      });
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          pageId: 'checkout',
          locator: { selectors: ['#hero'], path: [] },
          markdown: '新增需求',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.nodeId).toMatch(/^annotation-/u);
      expect(body.source.data.nodes[0]).toMatchObject({
        id: body.nodeId,
        hasMarkdown: true,
        annotationText: '',
        color: '#1677FF',
        pageId: 'checkout',
        locator: { selectors: ['#hero'], path: [] },
      });
      expect(body.source.data.nodes[0]).not.toHaveProperty('title');
      expect(body.source.markdownMap[body.nodeId]).toBe('新增需求');
    } finally {
      await server.close();
    }
  });

  it('creates a separate annotation node when the locator matches a different page', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        updatedAt: 1,
        nodes: [
          {
            id: 'home-hero',
            index: 1,
            pageId: 'home',
            locator: { selectors: ['#hero'] },
            aiPrompt: '',
            annotationText: '',
            hasMarkdown: true,
            color: '#1677FF',
            images: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      markdownMap: { 'home-hero': '首页需求' },
      assetMap: {},
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/node`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: 'prototypes/home',
          pageId: 'checkout',
          locator: { selectors: ['#hero'] },
          markdown: '结算页需求',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.nodeId).toMatch(/^annotation-/u);
      expect(body.nodeId).not.toBe('home-hero');
      expect(body.source.data.nodes).toHaveLength(2);
      expect(body.source.data.nodes[0]).toMatchObject({
        id: 'home-hero',
        pageId: 'home',
      });
      expect(body.source.data.nodes[1]).toMatchObject({
        id: body.nodeId,
        pageId: 'checkout',
        locator: { selectors: ['#hero'] },
      });
      expect(body.source.markdownMap['home-hero']).toBe('首页需求');
      expect(body.source.markdownMap[body.nodeId]).toBe('结算页需求');
    } finally {
      await server.close();
    }
  });

  it('returns preprocessed directory markdownPath documents for preview refresh', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writePrototypeProject(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.mkdirSync(path.join(prototypeDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'docs/prd.md'), '# Home PRD\n\n目录正文', 'utf8');
    fs.writeFileSync(path.join(prototypeDir, 'annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        updatedAt: 1,
        nodes: [],
      },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'markdown',
            id: 'prd',
            title: 'PRD',
            markdownPath: 'docs/prd.md',
          },
        ],
      },
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes/home`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.source.directory.nodes[0]).toMatchObject({
        type: 'markdown',
        markdownPath: 'docs/prd.md',
        markdown: '# Home PRD\n\n目录正文',
      });
      expect(body.source.directory.nodes[0]).not.toHaveProperty('markdownEditUrl');
    } finally {
      await server.close();
    }
  });

  it('rejects unsafe and non-official prototype annotation targets', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
    writeProjectMetadata(projectRoot, {
      resourceWriteTargets: {
        prototypes: { type: 'project-relative-path', path: 'screens' },
      },
    });
    fs.mkdirSync(path.join(projectRoot, 'screens/home'), { recursive: true });
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const escaped = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes/../home`));
      expect(escaped.status).toBe(403);

      const nonOfficial = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation?targetPath=prototypes/home`));
      expect(nonOfficial.status).toBe(403);
      expect(await nonOfficial.json()).toMatchObject({
        error: 'Prototype annotation is limited to official src/prototypes templates',
      });
    } finally {
      await server.close();
    }
  });
});
