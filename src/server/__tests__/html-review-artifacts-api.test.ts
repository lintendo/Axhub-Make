import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  extractHtmlReviewDiagrams,
  resolveHtmlReviewDocument,
} from '../htmlReviewArtifacts.ts';
import { scanResourceFiles } from '../resourceFiles.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  setActiveProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers.ts';

afterEach(() => {
  cleanupProjectApiTestRoots();
});

const REVIEW_HTML = `<!doctype html>
<html><body>
  <h2>支付流程</h2>
  <div class="mermaid">flowchart LR
    A[下单] --&gt; B[支付]
  </div>
  <h2>支付流程</h2>
  <pre id="retry-flow" class="mermaid">sequenceDiagram
    User-&gt;&gt;API: retry
  </pre>
  <svg id="inline-architecture" data-drawio="true" xmlns="http://www.w3.org/2000/svg">
    <metadata id="drawio-source">&lt;mxGraphModel&gt;&lt;root/&gt;&lt;/mxGraphModel&gt;</metadata>
  </svg>
  <img id="linked-architecture" src="existing/architecture.drawio.svg" alt="架构图" />
</body></html>`;

describe('HTML review diagram extraction', () => {
  it('extracts stable Mermaid and Draw.io descriptors with decoded source and hashes', () => {
    const first = extractHtmlReviewDiagrams(REVIEW_HTML, 'src/resources/review/demo.html');
    const second = extractHtmlReviewDiagrams(REVIEW_HTML, 'src/resources/review/demo.html');

    expect(first).toHaveLength(4);
    expect(first.map((item) => item.key)).toEqual([
      'mermaid-1',
      'mermaid-retry-flow',
      'drawio-inline-architecture',
      'drawio-linked-architecture',
    ]);
    expect(first[0]).toMatchObject({
      kind: 'mermaid',
      documentIndex: 0,
      source: expect.stringContaining('A[下单] --> B[支付]'),
      sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
      previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
    });
    expect(first[2]).toMatchObject({
      kind: 'drawio',
      source: expect.stringContaining('&lt;mxGraphModel&gt;'),
      sourcePath: 'src/resources/.assets/review/demo.html/diagrams/drawio-inline-architecture.drawio.svg',
    });
    expect(first[3]).toMatchObject({
      kind: 'drawio',
      sourceUrl: 'existing/architecture.drawio.svg',
      sourcePath: 'src/resources/review/existing/architecture.drawio.svg',
      previewPath: 'src/resources/review/existing/architecture.drawio.svg',
    });
    expect(first.map((item) => item.sourceHash)).toEqual(second.map((item) => item.sourceHash));
  });

  it('accepts safe project HTML paths and rejects traversal, absolute paths, and unsupported documents', () => {
    const projectRoot = createTempRoot();
    expect(resolveHtmlReviewDocument(projectRoot, '../demo.html')).toBeNull();
    expect(resolveHtmlReviewDocument(projectRoot, '/tmp/demo.html')).toBeNull();
    expect(resolveHtmlReviewDocument(projectRoot, 'src/prototypes/demo/.spec/spec.html')).toMatchObject({
      documentPath: 'src/prototypes/demo/.spec/spec.html',
      resourcesDir: projectRoot,
      assetsPath: '.assets/src/prototypes/demo/.spec/spec.html',
    });
    expect(resolveHtmlReviewDocument(projectRoot, 'src/resources/demo.md')).toBeNull();
  });
});

describe('HTML review artifact API', () => {
  it('restores diagram draft sessions for HTML documents at arbitrary project paths', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-review-project-path', name: 'HTML Review Project Path' } });
    const documentPath = path.join(projectRoot, 'src/prototypes/demo/.spec/spec.html');
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, '<html><body><div class="mermaid">flowchart LR\nA-->B</div></body></html>', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-review-project-path', 'HTML Review Project Path');
      await setActiveProject(server.origin, 'html-review-project-path');
      const createResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review-project-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/demo/.spec/spec.html',
          diagramKey: 'mermaid-1',
          excalidraw: { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} },
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as any;

      const restoreResponse = await fetch(
        `${server.origin}/api/html-review/diagram-drafts/${created.sessionId}?projectId=html-review-project-path`,
      );
      expect(restoreResponse.status).toBe(200);
      await expect(restoreResponse.json()).resolves.toMatchObject({ sessionId: created.sessionId });
    } finally {
      await server.close();
    }
  });

  it('rejects HTML review document and sidecar paths that escape through symlinks', async () => {
    const projectRoot = createTempRoot();
    const externalRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-review-symlink', name: 'HTML Review Symlink' } });
    const safeDocumentPath = path.join(projectRoot, 'src/prototypes/demo/.spec/spec.html');
    fs.mkdirSync(path.dirname(safeDocumentPath), { recursive: true });
    fs.writeFileSync(safeDocumentPath, '<html><body><div class="mermaid">flowchart LR\nA-->B</div></body></html>', 'utf8');
    fs.writeFileSync(path.join(externalRoot, 'outside.html'), '<html><body><div class="mermaid">flowchart LR\nX-->Y</div></body></html>', 'utf8');
    fs.symlinkSync(externalRoot, path.join(projectRoot, 'linked'), 'dir');
    fs.symlinkSync(externalRoot, path.join(projectRoot, '.assets'), 'dir');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-review-symlink', 'HTML Review Symlink');
      await setActiveProject(server.origin, 'html-review-symlink');
      const documentResponse = await fetch(
        `${server.origin}/api/html-review/diagrams?projectId=html-review-symlink&path=${encodeURIComponent('linked/outside.html')}`,
      );
      const sidecarResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review-symlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/demo/.spec/spec.html',
          diagramKey: 'mermaid-1',
          excalidraw: { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} },
        }),
      });

      expect(documentResponse.status).toBe(400);
      expect(sidecarResponse.status).toBe(400);
      expect(fs.readdirSync(externalRoot).sort()).toEqual(['outside.html']);
    } finally {
      await server.close();
    }
  });

  it('lists diagrams, creates server-derived drafts, updates bounded metadata, and recovers sessions', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-review', name: 'HTML Review' } });
    const documentPath = path.join(projectRoot, 'src/resources/review/demo.html');
    const linkedPath = path.join(projectRoot, 'src/resources/review/existing/architecture.drawio.svg');
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.mkdirSync(path.dirname(linkedPath), { recursive: true });
    fs.writeFileSync(documentPath, REVIEW_HTML, 'utf8');
    fs.writeFileSync(linkedPath, '<svg xmlns="http://www.w3.org/2000/svg"><metadata id="drawio-source">&lt;mxGraphModel/&gt;</metadata></svg>', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-review', 'HTML Review');
      await setActiveProject(server.origin, 'html-review');

      const listResponse = await fetch(`${server.origin}/api/html-review/diagrams?projectId=html-review&path=${encodeURIComponent('src/resources/review/demo.html')}`);
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as any;
      expect(list.documentPath).toBe('src/resources/review/demo.html');
      expect(list.diagrams).toHaveLength(4);

      const drawioCreateResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/review/demo.html',
          diagramKey: 'drawio-linked-architecture',
        }),
      });
      expect(drawioCreateResponse.status).toBe(201);
      await expect(drawioCreateResponse.json()).resolves.toMatchObject({
        kind: 'drawio',
        sourcePath: 'src/resources/review/existing/architecture.drawio.svg',
        previewPath: 'src/resources/review/existing/architecture.drawio.svg',
      });

      const createResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/review/demo.html',
          diagramKey: 'mermaid-1',
          excalidraw: { type: 'excalidraw', version: 2, source: 'https://axhub.im', elements: [], appState: {}, files: {} },
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as any;
      expect(created).toMatchObject({
        kind: 'mermaid',
        sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
        previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
      });
      expect(created.sessionId).toMatch(/^[a-z0-9-]+$/u);
      expect(JSON.parse(fs.readFileSync(path.join(projectRoot, created.sourcePath), 'utf8'))).toMatchObject({ type: 'excalidraw' });

      fs.writeFileSync(path.join(projectRoot, created.sourcePath), JSON.stringify({
        type: 'excalidraw', version: 2, source: 'https://axhub.im', elements: [{ id: 'edited-shape' }], appState: {}, files: {},
      }), 'utf8');
      const future = new Date(Date.now() + 5_000);
      fs.utimesSync(path.join(projectRoot, created.sourcePath), future, future);
      fs.writeFileSync(documentPath, REVIEW_HTML.replace('A[下单] --&gt; B[支付]', 'A[下单] --&gt; C[支付确认]'), 'utf8');

      const autoRecoveredResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts/${created.sessionId}?projectId=html-review`);
      expect(autoRecoveredResponse.status).toBe(200);
      await expect(autoRecoveredResponse.json()).resolves.toMatchObject({
        summary: ['图表源文件已更新'],
        stale: true,
      });

      const updateResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts/${created.sessionId}?projectId=html-review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: created.sourcePath,
          previewPath: created.previewPath,
          sourceHash: created.sourceHash,
          summary: ['调整支付节点方向', '补充失败重试'],
        }),
      });
      expect(updateResponse.status).toBe(200);
      const updated = await updateResponse.json() as any;
      expect(updated.summary).toEqual(['调整支付节点方向', '补充失败重试']);

      const recoveredResponse = await fetch(`${server.origin}/api/html-review/diagram-drafts/${created.sessionId}?projectId=html-review`);
      expect(recoveredResponse.status).toBe(200);
      await expect(recoveredResponse.json()).resolves.toMatchObject({
        sessionId: created.sessionId,
        sourcePath: created.sourcePath,
        summary: ['调整支付节点方向', '补充失败重试'],
      });

      const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/resources/.assets/review/demo.html/diagram-manifest.json'), 'utf8'));
      expect(manifest).toMatchObject({ version: 1, documentPath: 'src/resources/review/demo.html' });
      expect(manifest.diagrams[0]).not.toHaveProperty('source');
    } finally {
      await server.close();
    }
  });

  it('rejects invalid paths, output overrides, missing diagrams, unsupported methods, and oversized bodies', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-review-invalid', name: 'HTML Review Invalid' } });
    const documentPath = path.join(projectRoot, 'src/resources/demo.html');
    fs.writeFileSync(documentPath, '<div class="mermaid">flowchart LR\nA-->B</div>', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-review-invalid', 'HTML Review Invalid');
      await setActiveProject(server.origin, 'html-review-invalid');

      for (const invalidPath of ['../demo.html', '/tmp/demo.html', 'src/resources/demo.md']) {
        const response = await fetch(`${server.origin}/api/html-review/diagrams?projectId=html-review-invalid&path=${encodeURIComponent(invalidPath)}`);
        expect(response.status).toBe(400);
      }

      const override = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review-invalid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/resources/demo.html', diagramKey: 'mermaid-1', sourcePath: '/tmp/owned.excalidraw' }),
      });
      expect(override.status).toBe(400);

      const missing = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review-invalid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/resources/demo.html', diagramKey: 'missing' }),
      });
      expect(missing.status).toBe(404);

      const oversized = await fetch(`${server.origin}/api/html-review/diagram-drafts?projectId=html-review-invalid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/resources/demo.html', diagramKey: 'mermaid-1', excalidraw: { payload: 'x'.repeat(2_100_000) } }),
      });
      expect(oversized.status).toBe(413);
    } finally {
      await server.close();
    }
  });

  it('hides all asset sidecar folders from the resource list', () => {
    const projectRoot = createTempRoot();
    const resources = path.join(projectRoot, 'src/resources');
    fs.mkdirSync(path.join(resources, 'demo.assets/diagrams'), { recursive: true });
    fs.mkdirSync(path.join(resources, 'ordinary.assets'), { recursive: true });
    fs.writeFileSync(path.join(resources, 'demo.html'), '<h1>Demo</h1>', 'utf8');
    fs.writeFileSync(path.join(resources, 'demo.assets/diagrams/flow.excalidraw'), '{}', 'utf8');
    fs.writeFileSync(path.join(resources, 'ordinary.assets/notes.md'), '# Hidden asset', 'utf8');

    const paths = scanResourceFiles(projectRoot).map((item) => item.path);
    expect(paths).toContain('demo.html');
    expect(paths).not.toContain('demo.assets/diagrams/flow.excalidraw');
    expect(paths).not.toContain('ordinary.assets/notes.md');
  });
});
