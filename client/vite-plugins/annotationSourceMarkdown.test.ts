import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAnnotationSourceMarkdownPlugin,
  preprocessAnnotationSourceMarkdown,
  resolveAnnotationMarkdownPath,
} from './annotationSourceMarkdown';

const tempRoots: string[] = [];

function createProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'annotation-source-markdown-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'src/prototypes/order-review/docs/nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/prototypes/order-review/index.tsx'), 'export default function Demo() { return null; }\n', 'utf8');
  return root;
}

function writeSource(projectRoot: string, source: unknown): string {
  const sourcePath = path.join(projectRoot, 'src/prototypes/order-review/annotation-source.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
  return sourcePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('annotation source markdown preprocessing', () => {
  it('inlines directory markdownPath content without creating Make-specific edit URLs', () => {
    const projectRoot = createProjectRoot();
    const mdPath = path.join(projectRoot, 'src/prototypes/order-review/docs/prd-03-status.md');
    fs.writeFileSync(mdPath, '# PRD 03\n\n状态说明', 'utf8');
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'markdown',
            id: 'prd-03-status',
            title: 'PRD 03 | 状态',
            markdownPath: 'docs/prd-03-status.md',
          },
        ],
      },
    });

    const result = preprocessAnnotationSourceMarkdown({
      projectRoot,
      sourceFilePath: sourcePath,
      source: JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
      mode: 'serve',
    });

    const node = result.source.directory.nodes[0];
    expect(node).toMatchObject({
      type: 'markdown',
      markdown: '# PRD 03\n\n状态说明',
      markdownPath: 'docs/prd-03-status.md',
    });
    expect(node).not.toHaveProperty('markdownEditUrl');
    expect(result.watchFiles).toEqual([mdPath]);
  });

  it('inlines independent documents markdownPath content', () => {
    const projectRoot = createProjectRoot();
    const mdPath = path.join(projectRoot, 'src/prototypes/order-review/docs/prd-independent.md');
    fs.writeFileSync(mdPath, '# 独立文档\n\n跨页面说明', 'utf8');
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: { nodes: [] },
      documents: {
        nodes: [
          {
            type: 'folder',
            id: 'documents',
            title: '文档',
            children: [
              { type: 'markdown', id: 'independent', title: '独立文档', markdownPath: 'docs/prd-independent.md' },
            ],
          },
        ],
      },
    });

    const result = preprocessAnnotationSourceMarkdown({
      projectRoot,
      sourceFilePath: sourcePath,
      source: JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
      mode: 'serve',
    });

    const node = result.source.documents.nodes[0].children[0];
    expect(node).toMatchObject({
      type: 'markdown',
      markdown: '# 独立文档\n\n跨页面说明',
      markdownPath: 'docs/prd-independent.md',
    });
    expect(node).not.toHaveProperty('markdownEditUrl');
    expect(result.watchFiles).toEqual([mdPath]);
  });

  it('resolves annotation image placeholders in inlined directory markdown to prototype asset URLs', () => {
    const projectRoot = createProjectRoot();
    const mdPath = path.join(projectRoot, 'src/prototypes/order-review/docs/prd-05-handoff.md');
    const assetPath = path.join(projectRoot, 'src/prototypes/order-review/assets/document-edit.png');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(mdPath, '# 交付\n\n![文档编辑](__ANNOTATION_IMAGE_DOCUMENT_EDIT__)', 'utf8');
    fs.writeFileSync(assetPath, 'png-bytes\n', 'utf8');
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'markdown',
            id: 'prd-handoff',
            title: 'PRD 05 | 交付',
            markdownPath: 'docs/prd-05-handoff.md',
          },
        ],
      },
    });

    const result = preprocessAnnotationSourceMarkdown({
      projectRoot,
      sourceFilePath: sourcePath,
      source: JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
      mode: 'serve',
    });

    const node = result.source.directory.nodes[0];
    expect(node.markdown).toContain(
      '![文档编辑](/prototypes/order-review/assets/document-edit.png)',
    );
    expect(node.markdown).not.toContain('__ANNOTATION_IMAGE_DOCUMENT_EDIT__');
    expect(result.watchFiles).toEqual([mdPath, assetPath]);
  });

  it('does not expose edit URLs when preprocessing for export builds', () => {
    const projectRoot = createProjectRoot();
    fs.writeFileSync(path.join(projectRoot, 'src/prototypes/order-review/docs/prd.md'), '# Exported PRD', 'utf8');
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [{ type: 'markdown', id: 'prd', title: 'PRD', markdownPath: 'docs/prd.md' }],
      },
    });

    const result = preprocessAnnotationSourceMarkdown({
      projectRoot,
      sourceFilePath: sourcePath,
      source: JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
      mode: 'build',
    });

    expect(result.source.directory.nodes[0]).toMatchObject({
      markdown: '# Exported PRD',
      markdownPath: 'docs/prd.md',
    });
    expect(result.source.directory.nodes[0]).not.toHaveProperty('markdownEditUrl');
  });

  it('recursively inlines markdownPath documents nested in directory folders', () => {
    const projectRoot = createProjectRoot();
    fs.writeFileSync(path.join(projectRoot, 'src/prototypes/order-review/docs/nested/prd.md'), '# Nested PRD', 'utf8');
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'folder',
            id: 'docs',
            title: '文档',
            children: [
              { type: 'markdown', id: 'nested-prd', title: 'Nested PRD', markdownPath: 'docs/nested/prd.md' },
            ],
          },
        ],
      },
    });

    const result = preprocessAnnotationSourceMarkdown({
      projectRoot,
      sourceFilePath: sourcePath,
      source: JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
      mode: 'serve',
    });

    expect(result.source.directory.nodes[0].children[0]).toMatchObject({
      type: 'markdown',
      markdownPath: 'docs/nested/prd.md',
      markdown: '# Nested PRD',
    });
    expect(result.source.directory.nodes[0].children[0]).not.toHaveProperty('markdownEditUrl');
  });

  it.each([
    ['docs/prd.md', 'src/prototypes/order-review/docs/prd.md'],
    ['docs/nested/prd.md', 'src/prototypes/order-review/docs/nested/prd.md'],
  ])('allows safe prototype-relative markdownPath %s', (markdownPath, expectedProjectRelativePath) => {
    const projectRoot = createProjectRoot();
    const sourcePath = path.join(projectRoot, 'src/prototypes/order-review/annotation-source.json');

    const resolved = resolveAnnotationMarkdownPath(projectRoot, sourcePath, markdownPath);

    expect(resolved).toMatchObject({
      ok: true,
      projectRelativePath: expectedProjectRelativePath,
    });
  });

  it.each([
    '/abs.md',
    '../secret.md',
    'docs/../../secret.md',
    'docs//prd.md',
    'docs/%2e%2e/secret.md',
  ])('rejects unsafe markdownPath %s', (markdownPath) => {
    const projectRoot = createProjectRoot();
    const sourcePath = path.join(projectRoot, 'src/prototypes/order-review/annotation-source.json');

    const resolved = resolveAnnotationMarkdownPath(projectRoot, sourcePath, markdownPath);

    expect(resolved.ok).toBe(false);
  });

  it('falls back to existing inline markdown when the referenced file is missing and warns in dev', () => {
    const projectRoot = createProjectRoot();
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [{ type: 'markdown', id: 'prd', title: 'PRD', markdownPath: 'docs/missing.md', markdown: '旧内容' }],
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = preprocessAnnotationSourceMarkdown({
      projectRoot,
      sourceFilePath: sourcePath,
      source: JSON.parse(fs.readFileSync(sourcePath, 'utf8')),
      mode: 'serve',
    });

    expect(result.source.directory.nodes[0]).toMatchObject({
      markdown: '旧内容',
      markdownPath: 'docs/missing.md',
    });
    expect(result.source.directory.nodes[0]).not.toHaveProperty('markdownEditUrl');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('docs/missing.md'));
  });

  it('loads annotation-source.json as an inlined JavaScript module in Vite', async () => {
    const projectRoot = createProjectRoot();
    fs.writeFileSync(path.join(projectRoot, 'src/prototypes/order-review/docs/prd.md'), '# Vite PRD', 'utf8');
    const sourcePath = writeSource(projectRoot, {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: { version: 2, prototypeName: 'order-review', pageId: 'order-review', nodes: [], updatedAt: 1 },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [{ type: 'markdown', id: 'prd', title: 'PRD', markdownPath: 'docs/prd.md' }],
      },
    });
    const watched: string[] = [];
    const plugin = createAnnotationSourceMarkdownPlugin(projectRoot, { mode: 'serve' });

    const transform = plugin.transform as (
      this: { addWatchFile: (file: string) => void },
      code: string,
      id: string,
    ) => string | Promise<string> | null;
    const code = await transform.call(
      { addWatchFile: (file: string) => watched.push(file) },
      fs.readFileSync(sourcePath, 'utf8'),
      sourcePath,
    );

    expect(() => JSON.parse(String(code))).not.toThrow();
    expect(code).not.toContain('export default');
    expect(code).toContain('# Vite PRD');
    expect(code).not.toContain('markdownEditUrl');
    expect(watched).toEqual([path.join(projectRoot, 'src/prototypes/order-review/docs/prd.md')]);
  });
});
