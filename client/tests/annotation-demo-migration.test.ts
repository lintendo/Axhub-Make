import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { buildMakeProjectMetadata } = await import('../scripts/sync-project-metadata.mjs');

const appRoot = path.resolve(__dirname, '..');
const makeRoot = path.resolve(appRoot, '..');
const workspaceRoot = path.resolve(makeRoot, '../..');
const demoRoot = path.join(appRoot, 'src/prototypes/annotation-demo');

afterEach(() => vi.unstubAllGlobals());

describe('annotation demo migration', () => {
  it('requires the validation capable annotation runtime in major version 1', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');
    const tsconfig = JSON.parse(fs.readFileSync(path.join(appRoot, 'tsconfig.base.json'), 'utf8'));

    expect(packageJson.dependencies?.['@axhub/annotation']).toBe('^1.0.20');
    expect(packageJson.dependencies).not.toHaveProperty('@axhub/play-client');
    expect(viteConfig).not.toContain("exclude: ['@axhub/annotation']");
    expect(viteConfig).not.toContain("include: [\n        '@ant-design/icons',\n        'antd',\n        'axhub-annotation',");
    expect(viteConfig).not.toContain("'axhub-annotation'");
    expect(viteConfig).toContain('annotationRuntimeOptimizeDepsPlugin');
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@axhub/annotation');
  });

  it('loads runtime validators from the published annotation package', async () => {
    if (typeof document === 'undefined') {
      vi.stubGlobal('document', {
        createElement: () => ({ innerHTML: '', textContent: '' }),
        querySelector: () => null,
      });
    }
    if (typeof window === 'undefined') {
      vi.stubGlobal('window', { addEventListener: () => undefined });
    }
    const installedPackageRoot = fs.realpathSync(
      path.join(appRoot, 'node_modules/@axhub/annotation'),
    );
    const installedPackageJson = JSON.parse(
      fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'),
    );
    const annotationRuntime = await import(
      pathToFileURL(path.join(installedPackageRoot, 'dist/index.mjs')).href
    );

    expect(installedPackageJson.version).toBe('1.0.20');
    expect(annotationRuntime.validateAnnotationRuntime).toBeTypeOf('function');
    expect(annotationRuntime.validateAnnotationSource).toBeTypeOf('function');

    const emptySource = {
      data: {
        version: 2,
        prototypeName: 'validation-smoke-test',
        pageId: 'home',
        nodes: [],
        updatedAt: 0,
      },
    };

    expect(annotationRuntime.validateAnnotationSource(emptySource)).toMatchObject({
      ok: true,
      checked: 0,
      errors: [],
    });
    await expect(annotationRuntime.validateAnnotationRuntime(emptySource)).resolves.toMatchObject({
      ok: true,
      checked: 0,
      errors: [],
    });
    expect(annotationRuntime.validateAnnotationSource(null)).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'invalid-source' })],
    });
  });

  it('deduplicates React while using the published annotation runtime', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');
    const dedupeMatch = viteConfig.match(/dedupe:\s*\[([\s\S]*?)\]/);

    expect(dedupeMatch?.[1]).toBeTruthy();
    for (const reactDependency of [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ]) {
      expect(dedupeMatch?.[1]).toContain(`'${reactDependency}'`);
    }
  });

  it('locks the annotation runtime to the marker bridge capable published package in workspace lockfiles', () => {
    const lockfiles = [
      fs.readFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'utf8'),
      fs.readFileSync(path.join(makeRoot, 'pnpm-lock.yaml'), 'utf8'),
    ];

    for (const lockfile of lockfiles) {
      expect(lockfile).toContain("'@axhub/annotation':");
      expect(lockfile).toContain('specifier: ^1.0.20');
      expect(lockfile).toContain("'@axhub/annotation@1.0.20':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.18':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.16':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.15':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.14':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.10':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.9':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.8':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.7':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.6':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.5':");
      expect(lockfile).not.toContain('file:../../../packages/axhub-annotation');
      expect(lockfile).not.toContain('link:../../../packages/axhub-annotation');
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.4':");
      expect(lockfile).not.toContain("'@axhub/annotation@1.0.2':");
    }
  });

  it('keeps the migrated annotation demo self-contained in prototypes', () => {
    const indexSource = fs.readFileSync(path.join(demoRoot, 'index.tsx'), 'utf8');
    const annotationSource = JSON.parse(
      fs.readFileSync(path.join(demoRoot, 'annotation-source.json'), 'utf8'),
    );

    expect(indexSource).toContain('@name PRD 演示');
    expect(indexSource).toContain("from '@axhub/annotation';");
    expect(indexSource).toContain("import annotationSourceDocument from './annotation-source.json';");
    expect(indexSource).not.toContain("new URL('./annotation-source.json', import.meta.url)");
    expect(indexSource).not.toContain('readJsonIfOk');
    expect(indexSource).not.toContain('/api/annotations');
    expect(indexSource).not.toContain('viewer.json');
    expect(indexSource).toContain('<AnnotationViewer');
    expect(indexSource).not.toContain('showSourceCapability');
    expect(indexSource).toContain('DocumentModeView');
    expect(indexSource).toContain("id: 'document-mode'");
    expect(indexSource).toContain('onTargetRoute');
    expect(indexSource).not.toContain('annotation-guide-directory-anchor-demo');
    expect(indexSource).not.toContain('document-mode-guide');
    expect(fs.existsSync(path.join(demoRoot, 'docs/prd-06-document-mode.md'))).toBe(false);
    expect(annotationSource.format).toBe('axhub-annotation-source');
    expect(annotationSource.markdownMap).toHaveProperty('prototype-as-prd-purpose');
    expect(annotationSource.markdownMap['prototype-as-prd-purpose']).toContain('完整需求文档放进可运行原型');
    expect(annotationSource.markdownMap['prototype-as-prd-purpose']).toContain('通过锚点直达相关页面或元素');
    expect(annotationSource.markdownMap['prototype-as-prd-purpose']).toContain('局部的边界和例外则用标注补充');
    expect(annotationSource.markdownMap).not.toHaveProperty('prototype-as-prd');
  });

  it('keeps independent documents as prototype-local markdownPath files', () => {
    const annotationSource = JSON.parse(
      fs.readFileSync(path.join(demoRoot, 'annotation-source.json'), 'utf8'),
    );
    expect(annotationSource.directory.nodes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'markdown' })]),
    );
    const documentsFolder = annotationSource.documents.nodes.find((node: any) => node.id === 'documents-prd');
    const markdownNodes = documentsFolder.children.filter((node: any) => node.type === 'markdown');

    expect(markdownNodes).toHaveLength(6);
    for (const node of markdownNodes) {
      expect(node).toHaveProperty('markdownPath');
      expect(node).not.toHaveProperty('markdown');
      expect(node.readerMode).toBe('split');
      expect(node.markdownPath).toMatch(/^docs\/prd-\d{2}-[a-z-]+\.md$/);
      const markdownFilePath = path.join(demoRoot, node.markdownPath);
      expect(fs.existsSync(markdownFilePath)).toBe(true);
      expect(fs.readFileSync(markdownFilePath, 'utf8').trim()).toMatch(/^# /);
    }

    const flowMarkdown = fs.readFileSync(path.join(demoRoot, 'docs/prd-02-flow.md'), 'utf8');
    expect(flowMarkdown).toContain('```mermaid');
    expect(flowMarkdown).toContain('flowchart TD');
    expect(flowMarkdown).toContain('D[编辑 Markdown]');
  });

  it('includes an HTML PRD article linked with the Markdown example and the prototype', () => {
    const annotationSource = JSON.parse(
      fs.readFileSync(path.join(demoRoot, 'annotation-source.json'), 'utf8'),
    );
    const documentsFolder = annotationSource.documents.nodes.find((node: any) => node.id === 'documents-prd');
    const htmlNode = documentsFolder.children.find((node: any) => node.id === 'prd-metrics-html');
    expect(htmlNode).toMatchObject({ type: 'html', readerMode: 'split' });
    expect(htmlNode).not.toHaveProperty('html');
    const html = fs.readFileSync(path.join(demoRoot, htmlNode.htmlPath), 'utf8');
    const overview = fs.readFileSync(path.join(demoRoot, 'docs/prd-00-overview.md'), 'utf8');
    expect(html).toContain('id="metric-rules"');
    expect(html).toContain('href="#metric-rules"');
    expect(html).toContain('href="#axhub-target:state-metric-card"');
    expect(html).toContain('href="./prd-03-states.md"');
    expect(overview).toContain('(./prd-06-metrics.html)');
    expect(overview).toContain('](#prd-overview-anchor)');
    expect(annotationSource.data.nodes.some((node: any) => node.id === 'state-metric-card')).toBe(true);
  });

  it('does not expose the retired annotation display-mode controls in demos', () => {
    const roots = [
      demoRoot,
      path.resolve(appRoot, '../../axhub-make/src/prototypes/ref-antd-copy-2'),
      path.resolve(appRoot, '../../axhub-make/src/prototypes/ref-antd-copy-2-copy'),
    ];
    const retiredTerms = [
      'showDisplayModeSwitch',
      'defaultDisplayMode',
      'onDisplayModeChange',
      'DisplayMode',
      'displayMode',
      '展示方式',
    ];

    for (const root of roots) {
      for (const filename of ['index.tsx', 'annotation-source.json']) {
        const filePath = path.join(root, filename);
        if (!fs.existsSync(filePath)) continue;
        const source = fs.readFileSync(filePath, 'utf8');

        for (const term of retiredTerms) {
          expect(source, `${filePath} should not contain ${term}`).not.toContain(term);
        }
      }
    }
  });

  it('declares hash-routed pages with client-standard page ids', () => {
    const metadata = buildMakeProjectMetadata(appRoot, {
      clientOrigin: 'http://localhost:51720',
    });
    const prototype = metadata.resources.prototypes.find((item: any) => item.id === 'annotation-demo');

    expect(prototype).toMatchObject({
      defaultPageId: 'prototype-as-prd',
      pages: [
        { id: 'prototype-as-prd', title: '原型即 PRD' },
        { id: 'document-mode', title: '文档模式' },
        { id: 'content-annotation', title: '内容标注' },
        { id: 'state-annotation', title: '状态标注' },
        { id: 'prototype-directory', title: '页面目录' },
        { id: 'generate-annotation', title: '开启 PRD 和标注' },
        { id: 'edit-comments', title: '编辑 PRD 和标注' },
        { id: 'agent-read', title: 'Agent 读取' },
      ],
    });
  });
});
