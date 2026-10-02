import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyHtmlTextEdits,
  clearHtmlTemporaryStyleHack,
  indexHtmlEditableText,
  injectHtmlEditingMetadata,
  readBoundedJson,
  upsertHtmlTemporaryStyleHack,
} from '../htmlResourceEditing.ts';
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

describe('HTML resource editable text indexing', () => {
  it('assigns distinct source keys to supported static leaf text', () => {
    const html = '<!doctype html><html><head><title>Demo</title></head><body><main><p>重复</p><p>重复</p><button>保存</button></main></body></html>';

    const indexed = indexHtmlEditableText(html);

    expect(indexed.targets.map((target) => target.text)).toEqual(['重复', '重复', '保存']);
    expect(new Set(indexed.targets.map((target) => target.key)).size).toBe(3);
    expect(indexed.targets.every((target) => target.startOffset < target.endOffset)).toBe(true);
    expect(indexed.revision).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('excludes forms, rich text, scripts, styles, templates, SVG, and Mermaid', () => {
    const html = `<!doctype html><html><body>
      <input value="表单值">
      <textarea>文本域</textarea>
      <select><option>选项</option></select>
      <p>普通文本</p>
      <p contenteditable>页面自带编辑文本</p>
      <p>富文本 <strong>强调</strong></p>
      <script>console.log('脚本')</script>
      <style>.demo { color: red; }</style>
      <template><p>模板文本</p></template>
      <svg><text>SVG 文本</text></svg>
      <pre class="mermaid">flowchart LR A--&gt;B</pre>
    </body></html>`;

    expect(indexHtmlEditableText(html).targets.map((target) => target.text)).toEqual(['普通文本']);
  });

  it('injects preview-only text keys and revision metadata once', () => {
    const html = '<!doctype html><html><head></head><body><h1>标题</h1><p>正文</p></body></html>';

    const injected = injectHtmlEditingMetadata(html);

    expect(injected).toContain('<meta name="axhub-html-revision" content="');
    expect(injected.match(/data-axhub-text-key=/gu)).toHaveLength(2);
    expect(injected).toContain('html[0]/body[0]/h1[0]/#text[0]');
    expect(injected).toContain('html[0]/body[0]/p[0]/#text[0]');
    expect(injectHtmlEditingMetadata(injected).match(/name="axhub-html-revision"/gu)).toHaveLength(1);
  });

  it('keeps the doctype first when injecting metadata into a document without head', () => {
    const html = '<!doctype html><html><body><p>正文</p></body></html>';

    const injected = injectHtmlEditingMetadata(html);

    expect(injected.startsWith('<!doctype html>')).toBe(true);
    expect(injected.indexOf('axhub-html-revision')).toBeLessThan(injected.indexOf('<body'));
  });

  it('injects revision metadata at the real head boundary when a script contains a closing-head string', () => {
    const html = '<!doctype html><html><head><script>const marker = "</head>";</script></head><body><p>正文</p></body></html>';

    const injected = injectHtmlEditingMetadata(html);

    expect(injected).toContain('<script>const marker = "</head>";</script>');
    expect(injected.indexOf('axhub-html-revision')).toBeGreaterThan(injected.indexOf('</script>'));
  });

  it('serves editing metadata without changing the source document', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-edit-preview', name: 'HTML Edit Preview' } });
    const filePath = path.join(projectRoot, 'src/resources/demo.html');
    const source = '<!doctype html><html><head></head><body><h1>标题</h1><img src="demo.assets/chart.svg"></body></html>';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-edit-preview', 'HTML Edit Preview');
      await setActiveProject(server.origin, 'html-edit-preview');
      const response = await fetch(`${server.origin}/api/docs/demo.html?projectId=html-edit-preview`, {
        headers: { Accept: 'text/html' },
      });
      const preview = await response.text();

      expect(response.status).toBe(200);
      expect(preview).toContain('name="axhub-html-revision"');
      expect(preview).toContain('data-axhub-text-key=');
      expect(preview).toContain('/assets/html-template-bootstrap.js');
      expect(preview.match(/name="axhub-html-revision" content="([a-f0-9]{64})"/u)?.[1])
        .toBe(indexHtmlEditableText(source).revision);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(source);
    } finally {
      await server.close();
    }
  });
});

describe('HTML resource text writes', () => {
  it('updates only the targeted duplicate and escapes replacement text', () => {
    const html = '<html><body><p>重复</p><p>重复</p></body></html>';
    const indexed = indexHtmlEditableText(html);

    const result = applyHtmlTextEdits(html, indexed.revision, [{
      key: indexed.targets[1].key,
      before: '重复',
      after: '<新内容> & 更多',
    }]);

    expect(result.html).toBe('<html><body><p>重复</p><p>&lt;新内容&gt; &amp; 更多</p></body></html>');
    expect(result.changedCount).toBe(1);
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.revision).not.toBe(indexed.revision);
  });

  it('preserves source padding and allows empty replacements', () => {
    const html = '<html><body><p>\n  待清空  \n</p></body></html>';
    const indexed = indexHtmlEditableText(html);

    const result = applyHtmlTextEdits(html, indexed.revision, [{
      key: indexed.targets[0].key,
      before: '待清空',
      after: '',
    }]);

    expect(result.html).toBe('<html><body><p>\n    \n</p></body></html>');
  });

  it('rejects stale revisions and invalid text targets without partial output', () => {
    const html = '<html><body><p>第一处</p><p>第二处</p></body></html>';
    const indexed = indexHtmlEditableText(html);

    expect(() => applyHtmlTextEdits(html, 'stale', [{
      key: indexed.targets[0].key,
      before: '第一处',
      after: '已修改',
    }])).toThrowError(expect.objectContaining({ code: 'HTML_DOCUMENT_CHANGED', status: 409 }));

    expect(() => applyHtmlTextEdits(html, indexed.revision, [
      { key: indexed.targets[0].key, before: '第一处', after: '已修改' },
      { key: 'missing', before: '第二处', after: '不应写入' },
    ])).toThrowError(expect.objectContaining({ code: 'HTML_TEXT_TARGET_MISSING', status: 422 }));

    expect(() => applyHtmlTextEdits(html, indexed.revision, [{
      key: indexed.targets[0].key,
      before: '已被外部修改',
      after: '新值',
    }])).toThrowError(expect.objectContaining({ code: 'HTML_TEXT_CHANGED', status: 409 }));
  });

  it('rejects escaped text output that would grow the HTML beyond 2 MB', () => {
    const html = `<html><body><!--${'x'.repeat(1_980_000)}--><p>${'a'.repeat(10_000)}</p></body></html>`;
    const indexed = indexHtmlEditableText(html);

    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(2_000_000);
    expect(() => applyHtmlTextEdits(html, indexed.revision, [{
      key: indexed.targets[0].key,
      before: 'a'.repeat(10_000),
      after: '&'.repeat(10_000),
    }])).toThrowError(expect.objectContaining({ code: 'HTML_DOCUMENT_TOO_LARGE', status: 413 }));
  });
});

describe('HTML temporary style hacks', () => {
  it('inserts one commented block and replaces it on the next save', () => {
    const html = '<html><head><title>Demo</title></head><body><p>正文</p></body></html>';
    const revision = indexHtmlEditableText(html).revision;

    const first = upsertHtmlTemporaryStyleHack(html, revision, 'p { color: red; }');
    expect(first.html).toContain('AXHUB TEMPORARY STYLE HACK');
    expect(first.html).toContain('data-axhub-temporary-style-hack');
    expect(first.html.indexOf('temporary-style-hack:start')).toBeLessThan(first.html.indexOf('</head>'));

    const second = upsertHtmlTemporaryStyleHack(first.html, first.revision, 'p { color: blue; }');
    expect(second.html.match(/temporary-style-hack:start/gu)).toHaveLength(1);
    expect(second.html).toContain('p { color: blue; }');
    expect(second.html).not.toContain('p { color: red; }');
  });

  it('clears the complete block and rejects unsafe CSS or stale revisions', () => {
    const html = '<html><body><p>正文</p></body></html>';
    const revision = indexHtmlEditableText(html).revision;
    const saved = upsertHtmlTemporaryStyleHack(html, revision, 'p { color: red; }');

    const cleared = clearHtmlTemporaryStyleHack(saved.html, saved.revision);
    expect(cleared.changed).toBe(true);
    expect(cleared.html).toBe(html);

    const noOp = clearHtmlTemporaryStyleHack(html, revision);
    expect(noOp).toMatchObject({ html, revision, changed: false });

    expect(() => upsertHtmlTemporaryStyleHack(html, 'stale', 'p {}'))
      .toThrowError(expect.objectContaining({ code: 'HTML_DOCUMENT_CHANGED', status: 409 }));
    expect(() => upsertHtmlTemporaryStyleHack(html, revision, 'p {} </style><script>alert(1)</script>'))
      .toThrowError(expect.objectContaining({ code: 'HTML_STYLE_HACK_INVALID', status: 400 }));
    expect(() => upsertHtmlTemporaryStyleHack(
      html,
      revision,
      '/* <!-- axhub:temporary-style-hack:start --> */ p {}',
    )).toThrowError(expect.objectContaining({ code: 'HTML_STYLE_HACK_INVALID', status: 400 }));
    expect(() => upsertHtmlTemporaryStyleHack(
      html,
      revision,
      '/* <!-- axhub:temporary-style-hack:end --> */ p {}',
    )).toThrowError(expect.objectContaining({ code: 'HTML_STYLE_HACK_INVALID', status: 400 }));
  });

  it('inserts at real document boundaries instead of closing-tag text in scripts or comments', () => {
    const scriptHtml = '<html><head><script>const marker = "</head>";</script></head><body><p>正文</p></body></html>';
    const scriptResult = upsertHtmlTemporaryStyleHack(
      scriptHtml,
      indexHtmlEditableText(scriptHtml).revision,
      'p { color: red; }',
    );
    expect(scriptResult.html).toContain('</script>\n<!-- axhub:temporary-style-hack:start -->');
    expect(scriptResult.html.indexOf('temporary-style-hack:start')).toBeGreaterThan(scriptResult.html.indexOf('</script>'));

    const commentHtml = '<html><body><p>正文</p><!-- pretend </body> marker --></body></html>';
    const commentResult = upsertHtmlTemporaryStyleHack(
      commentHtml,
      indexHtmlEditableText(commentHtml).revision,
      'p { color: blue; }',
    );
    expect(commentResult.html).toContain('<!-- pretend </body> marker -->\n<!-- axhub:temporary-style-hack:start -->');
    expect(commentResult.html.indexOf('temporary-style-hack:start')).toBeGreaterThan(commentResult.html.indexOf('pretend </body>'));
  });

  it('rejects a style block that would grow the HTML beyond 2 MB', () => {
    const html = `<html><body><!--${'x'.repeat(1_990_000)}--></body></html>`;

    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(2_000_000);
    expect(() => upsertHtmlTemporaryStyleHack(
      html,
      indexHtmlEditableText(html).revision,
      `p::before { content: '${'a'.repeat(20_000)}'; }`,
    )).toThrowError(expect.objectContaining({ code: 'HTML_DOCUMENT_TOO_LARGE', status: 413 }));
  });
});

describe('HTML resource editing API', () => {
  it('stops reading a request as soon as its streamed body exceeds the limit', async () => {
    const request = new EventEmitter() as IncomingMessage;
    Object.assign(request, { headers: {}, pause: vi.fn() });

    const result = readBoundedJson(request);
    request.emit('data', Buffer.alloc(2_000_001));
    request.emit('data', Buffer.from('{"ignored":true}'));
    request.emit('end');

    await expect(result).rejects.toMatchObject({ code: 'HTML_EDIT_PAYLOAD_TOO_LARGE', status: 413 });
    expect(request.pause).toHaveBeenCalledTimes(1);
  });

  it('persists targeted text and temporary styles through revision-checked routes', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-edit-api', name: 'HTML Edit API' } });
    const filePath = path.join(projectRoot, 'src/resources/review/demo.html');
    const source = '<html><head></head><body><p>重复</p><p>重复</p></body></html>';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-edit-api', 'HTML Edit API');
      await setActiveProject(server.origin, 'html-edit-api');
      const indexed = indexHtmlEditableText(source);
      const textResponse = await fetch(`${server.origin}/api/html-review/text-edits?projectId=html-edit-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/review/demo.html',
          revision: indexed.revision,
          edits: [{ key: indexed.targets[1].key, before: '重复', after: '第二处' }],
        }),
      });
      const textResult = await textResponse.json() as any;

      expect(textResponse.status).toBe(200);
      expect(textResult).toMatchObject({ success: true, changedCount: 1 });
      expect(fs.readFileSync(filePath, 'utf8')).toContain('<p>重复</p><p>第二处</p>');

      const styleResponse = await fetch(`${server.origin}/api/html-review/style-hack?projectId=html-edit-api`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/review/demo.html',
          revision: textResult.revision,
          cssText: 'p { color: blue; }',
        }),
      });
      const styleResult = await styleResponse.json() as any;
      expect(styleResponse.status).toBe(200);
      expect(styleResult).toMatchObject({ success: true, changed: true });
      expect(fs.readFileSync(filePath, 'utf8')).toContain('AXHUB TEMPORARY STYLE HACK');

      const clearResponse = await fetch(`${server.origin}/api/html-review/style-hack?projectId=html-edit-api`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/review/demo.html',
          revision: styleResult.revision,
        }),
      });
      expect(clearResponse.status).toBe(200);
      expect(fs.readFileSync(filePath, 'utf8')).not.toContain('temporary-style-hack');
    } finally {
      await server.close();
    }
  });

  it('persists text edits to the fixed HTML template path', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-template-edit', name: 'HTML Template Edit' } });
    const filePath = path.join(projectRoot, 'templates/prototype-spec.html');
    const source = '<html><body><p>模板原文</p></body></html>';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-template-edit', 'HTML Template Edit');
      await setActiveProject(server.origin, 'html-template-edit');
      const indexed = indexHtmlEditableText(source);
      const response = await fetch(`${server.origin}/api/html-review/text-edits?projectId=html-template-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'templates/prototype-spec.html',
          revision: indexed.revision,
          edits: [{ key: indexed.targets[0].key, before: '模板原文', after: '模板新文' }],
        }),
      });

      expect(response.status).toBe(200);
      expect(fs.readFileSync(filePath, 'utf8')).toContain('<p>模板新文</p>');
    } finally {
      await server.close();
    }
  });

  it('persists text edits to a safe HTML document at any project-relative path', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-project-doc-edit', name: 'HTML Project Doc Edit' } });
    const filePath = path.join(projectRoot, 'src/prototypes/demo/.spec/spec.html');
    const source = '<html><body><p>任意路径原文</p></body></html>';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-project-doc-edit', 'HTML Project Doc Edit');
      await setActiveProject(server.origin, 'html-project-doc-edit');
      const indexed = indexHtmlEditableText(source);
      const response = await fetch(`${server.origin}/api/html-review/text-edits?projectId=html-project-doc-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/demo/.spec/spec.html',
          revision: indexed.revision,
          edits: [{ key: indexed.targets[0].key, before: '任意路径原文', after: '任意路径新文' }],
        }),
      });

      expect(response.status).toBe(200);
      expect(fs.readFileSync(filePath, 'utf8')).toContain('<p>任意路径新文</p>');
    } finally {
      await server.close();
    }
  });

  it('rejects stale or invalid requests without modifying the document', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-edit-conflict', name: 'HTML Edit Conflict' } });
    const filePath = path.join(projectRoot, 'src/resources/demo.html');
    const source = '<html><body><p>原文</p></body></html>';
    fs.writeFileSync(filePath, source, 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-edit-conflict', 'HTML Edit Conflict');
      await setActiveProject(server.origin, 'html-edit-conflict');
      const response = await fetch(`${server.origin}/api/html-review/text-edits?projectId=html-edit-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/demo.html',
          revision: 'stale',
          edits: [{ key: 'missing', before: '原文', after: '新文' }],
        }),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ code: 'HTML_DOCUMENT_CHANGED' });
      expect(fs.readFileSync(filePath, 'utf8')).toBe(source);

      const traversal = await fetch(`${server.origin}/api/html-review/text-edits?projectId=html-edit-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '../demo.html', revision: 'stale', edits: [] }),
      });
      expect(traversal.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('rejects resource paths that traverse a symlink outside src/resources', async () => {
    const projectRoot = createTempRoot();
    const externalRoot = createTempRoot();
    writeProjectMetadata(projectRoot, { project: { id: 'html-edit-symlink', name: 'HTML Edit Symlink' } });
    const resourcesRoot = path.join(projectRoot, 'src/resources');
    const externalFile = path.join(externalRoot, 'outside.html');
    const source = '<html><body><p>外部原文</p></body></html>';
    fs.mkdirSync(resourcesRoot, { recursive: true });
    fs.writeFileSync(externalFile, source, 'utf8');
    fs.symlinkSync(externalRoot, path.join(resourcesRoot, 'linked'), 'dir');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'html-edit-symlink', 'HTML Edit Symlink');
      await setActiveProject(server.origin, 'html-edit-symlink');
      const indexed = indexHtmlEditableText(source);
      const response = await fetch(`${server.origin}/api/html-review/text-edits?projectId=html-edit-symlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/resources/linked/outside.html',
          revision: indexed.revision,
          edits: [{ key: indexed.targets[0].key, before: '外部原文', after: '越界修改' }],
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_HTML_RESOURCE_PATH' });
      expect(fs.readFileSync(externalFile, 'utf8')).toBe(source);
    } finally {
      await server.close();
    }
  });
});
