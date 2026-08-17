import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const { buildMakeProjectMetadata } = await import('../scripts/sync-project-metadata.mjs');

const appRoot = path.resolve(__dirname, '..');
const makeRoot = path.resolve(appRoot, '..');
const demoRoot = path.join(appRoot, 'src/prototypes/annotation-demo');

describe('annotation demo migration', () => {
  it('requires the marker bridge capable annotation runtime in major version 1', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');
    const tsconfig = JSON.parse(fs.readFileSync(path.join(appRoot, 'tsconfig.base.json'), 'utf8'));

    expect(packageJson.dependencies?.['@axhub/annotation']).toBe('^1.0.18');
    expect(packageJson.dependencies).not.toHaveProperty('@axhub/play-client');
    expect(viteConfig).not.toContain("exclude: ['@axhub/annotation']");
    expect(viteConfig).not.toContain("include: [\n        '@ant-design/icons',\n        'antd',\n        'axhub-annotation',");
    expect(viteConfig).not.toContain("'axhub-annotation'");
    expect(viteConfig).toContain('annotationRuntimeOptimizeDepsPlugin');
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@axhub/annotation');
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

  it('locks the annotation runtime to the marker bridge capable published package', () => {
    const lockfiles = [
      fs.readFileSync(path.join(makeRoot, 'pnpm-lock.yaml'), 'utf8'),
    ];

    for (const lockfile of lockfiles) {
      expect(lockfile).toContain("'@axhub/annotation':");
      expect(lockfile).toContain('specifier: ^1.0.18');
      expect(lockfile).toContain("'@axhub/annotation@1.0.18':");
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

    expect(indexSource).toContain('@name 标注演示');
    expect(indexSource).toContain("from '@axhub/annotation';");
    expect(indexSource).toContain("import annotationSourceDocument from './annotation-source.json';");
    expect(indexSource).not.toContain("new URL('./annotation-source.json', import.meta.url)");
    expect(indexSource).not.toContain('readJsonIfOk');
    expect(indexSource).not.toContain('/api/annotations');
    expect(indexSource).not.toContain('viewer.json');
    expect(indexSource).toContain('<AnnotationViewer');
    expect(indexSource).not.toContain('showSourceCapability');
    expect(annotationSource.format).toBe('axhub-annotation-source');
    expect(annotationSource.markdownMap).toHaveProperty('prototype-as-prd-purpose');
    expect(annotationSource.markdownMap['prototype-as-prd-purpose']).toContain('原型是主需求载体');
    expect(annotationSource.markdownMap).not.toHaveProperty('prototype-as-prd');
  });

  it('keeps directory documents as prototype-local markdownPath files', () => {
    const annotationSource = JSON.parse(
      fs.readFileSync(path.join(demoRoot, 'annotation-source.json'), 'utf8'),
    );
    const documentsFolder = annotationSource.directory.nodes.find((node: any) => node.id === 'directory-documents');
    const markdownNodes = documentsFolder.children.filter((node: any) => node.type === 'markdown');

    expect(markdownNodes).toHaveLength(6);
    for (const node of markdownNodes) {
      expect(node).toHaveProperty('markdownPath');
      expect(node).not.toHaveProperty('markdown');
      expect(node.markdownPath).toMatch(/^docs\/prd-\d{2}-[a-z-]+\.md$/);
      const markdownFilePath = path.join(demoRoot, node.markdownPath);
      expect(fs.existsSync(markdownFilePath)).toBe(true);
      expect(fs.readFileSync(markdownFilePath, 'utf8').trim()).toMatch(/^# /);
    }
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
        { id: 'content-annotation', title: '内容标注' },
        { id: 'state-annotation', title: '状态标注' },
        { id: 'prototype-directory', title: '原型目录' },
        { id: 'generate-annotation', title: '开启标注' },
        { id: 'edit-comments', title: '编辑标注' },
        { id: 'agent-read', title: 'Agent 读取' },
      ],
    });
  });
});
