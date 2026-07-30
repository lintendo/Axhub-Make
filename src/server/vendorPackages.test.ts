import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildVendorImportMap,
  createVendorAliases,
  loadVendorPackagesConfig,
  syncVendorPackages,
  withVendorSyncLock,
} from '../../scripts/utils/vendor-packages.mjs';

const appRoot = path.resolve(__dirname, '..', '..');

describe('make-server vendor packages', () => {
  it('uses vendored packages from make-server config instead of workspace paths', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');
    const tsconfig = JSON.parse(fs.readFileSync(path.join(appRoot, 'tsconfig.json'), 'utf8'));

    expect(packageJson.dependencies).toMatchObject({
      '@axhub/excalidraw': 'file:vendor/axhub-excalidraw',
      'axhub-export-core': 'file:vendor/axhub-export-core',
      '@axhub/commentary': 'file:vendor/axhub-commentary',
      'tiptap-editor': 'file:vendor/tiptap-editor',
    });
    expect(packageJson.dependencies).not.toHaveProperty('@axhub/project-core');
    expect(packageJson.dependencies).not.toHaveProperty('@axhub/annotation');
    expect(packageJson.scripts?.['vendor:sync']).toBe('node scripts/sync-vendor-package.mjs');
    expect(packageJson.scripts?.dev).toBe('pnpm --filter @axhub/make-client dev');
    expect(packageJson.scripts?.['server:dev']).toContain('pnpm vendor:sync &&');
    expect(packageJson.scripts?.['server:dev']).toContain('AXHUB_ONLINE_BASE_URL=${AXHUB_ONLINE_BASE_URL:-https://axhub.im}');
    expect(packageJson.scripts?.['server:dev']).not.toContain('AXHUB_ONLINE_BASE_URL=${AXHUB_ONLINE_BASE_URL:-http://127.0.0.1:3001}');
    expect(packageJson.scripts?.['server:dev']).toContain("--ignore './vendor/**'");
    expect(packageJson.scripts?.['server:dev']).toContain('src/server/cli.ts -- --dev');
    expect(packageJson.scripts?.['server:dev']).not.toContain('./client');
    expect(packageJson.scripts?.['make-server:dev']).toBe('pnpm server:dev');
    expect(packageJson.scripts?.['server:dev:local-axhub']).toBe('pnpm server:dev -- --axhub-online-base-url http://127.0.0.1:3001');
    expect(packageJson.scripts?.['server:dev:online-axhub']).toBe('pnpm server:dev -- --axhub-online-base-url https://axhub.im');
    expect(packageJson.scripts?.['make-server:dev:local-axhub']).toBe('pnpm server:dev:local-axhub');
    expect(packageJson.scripts?.['make-server:dev:online-axhub']).toBe('pnpm server:dev:online-axhub');
    expect(packageJson.scripts?.build).toContain('pnpm vendor:sync &&');
    expect(packageJson.scripts?.['server:build']).toContain('pnpm vendor:sync &&');
    expect(packageJson.scripts?.test).toContain('pnpm vendor:sync &&');

    expect(viteConfig).not.toContain('../../packages/');
    expect(viteConfig).not.toContain('path.resolve(__dirname, pkg.runtimeEntryRelative)');
    expect(viteConfig).not.toContain("replacement: path.resolve(__dirname, 'node_modules', pkg.packageName)");
    expect(viteConfig).toContain("FRESH_VENDOR_ALIAS_PACKAGES = new Set(['@axhub/commentary'])");
    expect(viteConfig).toContain('FRESH_VENDOR_ALIAS_PACKAGES.has(pkg.packageName)');
    expect(viteConfig).toContain('pkg.outputDirRelative');
    expect(viteConfig).toContain('vendor-aliases.generated.json');
    expect(viteConfig).toContain("'**/vendor/**'");
    expect(JSON.stringify(tsconfig.compilerOptions.paths)).not.toContain('../../packages/');
    expect(tsconfig.compilerOptions.paths).toMatchObject({
      '@axhub/excalidraw': ['./vendor/axhub-excalidraw/dist/types/excalidraw/index.d.ts'],
      'axhub-export-core': ['./vendor/axhub-export-core/dist/index.d.ts'],
      '@axhub/commentary': ['./vendor/axhub-commentary/src/index.ts'],
      'tiptap-editor': ['./vendor/tiptap-editor/dist/index.d.ts'],
    });
  });

  it('loads server-owned vendor packages without client-only annotation runtime', () => {
    const config = loadVendorPackagesConfig(appRoot);

    expect(config.packages.map((pkg) => pkg.packageName)).toEqual([
      '@axhub/excalidraw',
      'axhub-export-core',
      '@axhub/commentary',
      'tiptap-editor',
    ]);
    expect(config.packages.map((pkg) => pkg.packageName)).not.toContain('@axhub/annotation');

    const aliases = createVendorAliases(appRoot, config);
    expect(aliases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        packageName: '@axhub/excalidraw',
        runtimeEntryRelative: 'vendor/axhub-excalidraw/dist/prod/index.js',
        typesEntryRelative: 'vendor/axhub-excalidraw/dist/types/excalidraw/index.d.ts',
      }),
      expect.objectContaining({
        packageName: 'axhub-export-core',
        runtimeEntryRelative: 'vendor/axhub-export-core/dist/index.mjs',
        typesEntryRelative: 'vendor/axhub-export-core/dist/index.d.ts',
      }),
      expect.objectContaining({
        packageName: '@axhub/commentary',
        runtimeEntryRelative: 'vendor/axhub-commentary/dist/index.mjs',
        typesEntryRelative: 'vendor/axhub-commentary/src/index.ts',
      }),
      expect.objectContaining({
        packageName: 'tiptap-editor',
        runtimeEntryRelative: 'vendor/tiptap-editor/dist/index.js',
        typesEntryRelative: 'vendor/tiptap-editor/dist/index.d.ts',
      }),
    ]));

    const importMap = buildVendorImportMap(appRoot, config);
    expect(importMap.paths).not.toHaveProperty('@axhub/annotation');
    expect(importMap.paths['tiptap-editor']).toEqual(['./vendor/tiptap-editor/dist/index.d.ts']);
  });

  it('keeps vendored commentary from showing the AI note composer while annotation editing is open', () => {
    const sourcePath = path.join(appRoot, 'vendor/axhub-commentary/src/ui/runtime/prompt-card-view.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("return '输入给 AI 的需求，/ 选择技能';");
    expect(source).not.toContain("return '输入需求，输入 / 选择技能';");
    expect(source).toContain('const showNoteComposer = !annotationEditorOpen && !bubbleStyleEditorOpen;');
    expect(source).toContain('{showNoteComposer ? (');
    expect(source).toContain('const showAnnotationMarkdownEditor = Boolean(');
    expect(source).toContain('annotationEditorOpen\n      && showAnnotationMarkdownEditorButton\n      && !bubbleStyleEditorOpen');
    expect(source).toContain(': ANNOTATION_MARKDOWN_PLACEHOLDER');
    expect(source).toContain('输入需求标注，支持 Markdown 格式。输入后即可创建标注节点。建议由 AI 创建标注，定位会更准确。');
  });

  it('keeps the vendored commentary annotation editor aligned with the runtime source', () => {
    const sourcePath = path.join(appRoot, 'vendor/axhub-commentary/src/ui/runtime/prompt-card-view.tsx');
    const esmBundlePath = path.join(appRoot, 'vendor/axhub-commentary/dist/index.mjs');
    const cjsBundlePath = path.join(appRoot, 'vendor/axhub-commentary/dist/index.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const esmBundle = fs.readFileSync(esmBundlePath, 'utf8');
    const cjsBundle = fs.readFileSync(cjsBundlePath, 'utf8');
    const annotationEditorStart = source.indexOf('title="删除标注"');
    const annotationEditorEnd = source.indexOf('<Input.TextArea', annotationEditorStart);
    const annotationEditorSource = source.slice(annotationEditorStart, annotationEditorEnd);

    expect(source).toContain('需求标注');
    expect(source).toContain('title="删除标注"');
    expect(source).not.toContain('title="清空标注内容"');
    expect(source).toContain(': ANNOTATION_MARKDOWN_PLACEHOLDER');
    expect(source).toContain('输入需求标注，支持 Markdown 格式。输入后即可创建标注节点。建议由 AI 创建标注，定位会更准确。');
    expect(source).toContain('const showNoteComposer = !annotationEditorOpen && !bubbleStyleEditorOpen;');
    expect(source).toContain('{showNoteComposer ? (');
    expect(source).toContain('const showAnnotationMarkdownEditor = Boolean(');
    expect(source).toContain('annotationEditorOpen\n      && showAnnotationMarkdownEditorButton\n      && !bubbleStyleEditorOpen');
    expect(source).toContain('无法准确定位标注位置，该标注需要由 AI 生成');
    expect(source).toContain('getAnnotationManualEditLocatorState(\n            currentTarget,');
    expect(source).toContain('disabled={annotationLoading || annotationManualEditDisabled}');
    expect(source).toContain('disabled={!currentTarget}');
    expect(source).not.toContain('disabled={!currentTarget || currentTaskRunning}');
    expect(source).not.toContain('当前标注节点定位可能不稳定');
    expect(annotationEditorStart).toBeGreaterThanOrEqual(0);
    expect(annotationEditorEnd).toBeGreaterThan(annotationEditorStart);
    expect(annotationEditorSource).toContain('onDeleteCurrentAnnotationNode?.();');
    expect(annotationEditorSource).not.toContain('onConfirmAnnotationMarkdown');
    expect(source).not.toContain('onClearAnnotationMarkdown();');
    expect(source).not.toContain('title="清空标注"');
    expect(source).not.toContain("void onConfirmAnnotationMarkdown('');");
    expect(source).toContain('.we-runtime-prompt-card__textarea,');
    expect(source).toContain('.we-runtime-prompt-card__textarea::-webkit-scrollbar');

    const noteTextareaStart = source.indexOf('placeholder={notePlaceholder}');
    const noteTextareaElementStart = source.lastIndexOf('<Input.TextArea', noteTextareaStart);
    const noteTextareaEnd = source.indexOf('onChange={(event) => {', noteTextareaStart);
    const noteTextareaSource = source.slice(noteTextareaElementStart, noteTextareaEnd);
    const annotationTextareaElementStart = annotationEditorEnd;
    const annotationTextareaSaveStart = source.indexOf('onChange={(event) => {', annotationEditorEnd);
    const annotationTextareaSource = source.slice(annotationTextareaElementStart, annotationTextareaSaveStart);

    expect(noteTextareaSource).toContain('allowClear');
    expect(noteTextareaSource).toContain("padding: '6px 10px'");
    expect(noteTextareaSource).not.toContain('padding: 0');
    expect(annotationTextareaSource).not.toContain('allowClear');
    expect(annotationTextareaSource).toContain("padding: '6px 0'");
    expect(annotationTextareaSource).not.toContain('padding: 0');

    for (const bundle of [esmBundle, cjsBundle]) {
      const bundleEditorStart = bundle.indexOf('title: "\\u5220\\u9664\\u6807\\u6CE8"');
      const bundleEditorEnd = bundle.indexOf('className: "we-runtime-prompt-card__textarea"', bundleEditorStart);
      const bundleEditorSource = bundle.slice(bundleEditorStart, bundleEditorEnd);
      const bundleNotePlaceholderStart = bundle.indexOf('placeholder: notePlaceholder');
      const bundleNoteTextareaStart = bundle.lastIndexOf('className: "we-runtime-prompt-card__textarea"', bundleNotePlaceholderStart);
      const bundleNoteTextareaEnd = bundle.indexOf('onChange: (event) => {', bundleNotePlaceholderStart);
      const bundleNoteTextareaSource = bundle.slice(bundleNoteTextareaStart, bundleNoteTextareaEnd);
      const bundleAnnotationTextareaEnd = bundle.indexOf('onChange: (event) => {', bundleEditorEnd);
      const bundleAnnotationTextareaSource = bundle.slice(bundleEditorEnd, bundleAnnotationTextareaEnd);

      expect(bundleEditorStart).toBeGreaterThanOrEqual(0);
      expect(bundleEditorEnd).toBeGreaterThan(bundleEditorStart);
      expect(bundleEditorSource).toContain('onDeleteCurrentAnnotationNode?.();');
      expect(bundleEditorSource).not.toContain('onConfirmAnnotationMarkdown');
      expect(bundle).toContain('return "\\u8F93\\u5165\\u7ED9 AI \\u7684\\u9700\\u6C42\\uFF0C/ \\u9009\\u62E9\\u6280\\u80FD";');
      expect(bundle).not.toContain('return "\\u8F93\\u5165\\u9700\\u6C42\\uFF0C\\u8F93\\u5165 / \\u9009\\u62E9\\u6280\\u80FD";');
      expect(bundle).toContain('const showNoteComposer = !annotationEditorOpen && !bubbleStyleEditorOpen;');
      expect(bundle).toContain('showNoteComposer ?');
      expect(bundle).toContain('const showAnnotationMarkdownEditor = Boolean');
      expect(bundle).toContain('annotationEditorOpen && showAnnotationMarkdownEditorButton && !bubbleStyleEditorOpen');
      expect(bundle).toContain('\\u8F93\\u5165\\u540E\\u5373\\u53EF\\u521B\\u5EFA\\u6807\\u6CE8\\u8282\\u70B9');
      expect(bundle).toContain('\\u5EFA\\u8BAE\\u7531 AI \\u521B\\u5EFA\\u6807\\u6CE8');
      expect(bundle).toContain('\\u65E0\\u6CD5\\u51C6\\u786E\\u5B9A\\u4F4D\\u6807\\u6CE8\\u4F4D\\u7F6E');
      expect(bundle).toContain('function getAnnotationManualEditLocatorState');
      expect(bundle).toContain('const annotationManualEditDisabled = annotationManualEditLocatorState.disabled;');
      expect(bundle).toContain('disabled: annotationLoading || annotationManualEditDisabled');
      expect(bundle).toContain('disabled: !currentTarget');
      expect(bundle).not.toContain('disabled: !currentTarget || currentTaskRunning');
      expect(bundle).toContain('onDispatched?.();');
      expect(bundle).toContain('onDispatched: () => {');
      expect(bundle).toContain('setSendingCurrentElementPrompt(false);');
      expect(bundle).not.toContain('\\u5F53\\u524D\\u6807\\u6CE8\\u8282\\u70B9\\u5B9A\\u4F4D\\u53EF\\u80FD\\u4E0D\\u7A33\\u5B9A');
      expect(bundle).not.toContain('void onConfirmAnnotationMarkdown("")');
      expect(bundle).not.toContain('title: "\\u6E05\\u7A7A\\u6807\\u6CE8\\u5185\\u5BB9"');
      expect(bundle).not.toContain('title: "清空标注"');
      expect(bundleEditorSource).not.toContain('allowClear: true');
      expect(bundle).toContain('.we-runtime-prompt-card__textarea,');
      expect(bundle).toContain('.we-runtime-prompt-card__textarea::-webkit-scrollbar');
      expect(bundleNoteTextareaSource).toContain('allowClear: true');
      expect(bundleNoteTextareaSource).toContain('padding: "6px 10px"');
      expect(bundleNoteTextareaSource).not.toContain('padding: 0');
      expect(bundleAnnotationTextareaSource).not.toContain('allowClear: true');
      expect(bundleAnnotationTextareaSource).toContain('padding: "6px 0"');
      expect(bundleAnnotationTextareaSource).not.toContain('padding: 0');
    }
  });

  it('keeps the installed commentary file dependency aligned with the vendored runtime bundle', () => {
    const installedBundlePath = path.join(appRoot, 'node_modules/@axhub/commentary/dist/index.mjs');
    if (!fs.existsSync(installedBundlePath)) {
      return;
    }
    const installedBundle = fs.readFileSync(installedBundlePath, 'utf8');

    expect(installedBundle).toContain('const showNoteComposer = !annotationEditorOpen && !bubbleStyleEditorOpen;');
    expect(installedBundle).toContain('annotationEditorOpen && showAnnotationMarkdownEditorButton && !bubbleStyleEditorOpen');
    expect(installedBundle).toContain('\\u5EFA\\u8BAE\\u7531 AI \\u521B\\u5EFA\\u6807\\u6CE8');
    expect(installedBundle).toContain('disabled: !currentTarget');
    expect(installedBundle).not.toContain('disabled: !currentTarget || currentTaskRunning');
    expect(installedBundle).not.toContain('\\u5F53\\u524D\\u6807\\u6CE8\\u8282\\u70B9\\u5B9A\\u4F4D\\u53EF\\u80FD\\u4E0D\\u7A33\\u5B9A');
  });

  it('keeps the vendored commentary durable-id tombstone contract in source and runtime bundles', () => {
    const typesSource = fs.readFileSync(
      path.join(appRoot, 'vendor/axhub-commentary/src/web-editor-types.ts'),
      'utf8',
    );
    const persistenceSource = fs.readFileSync(
      path.join(appRoot, 'vendor/axhub-commentary/src/core/editor/persistence.ts'),
      'utf8',
    );
    const lifecycleSource = fs.readFileSync(
      path.join(appRoot, 'vendor/axhub-commentary/src/core/editor/lifecycle.ts'),
      'utf8',
    );
    const esmBundle = fs.readFileSync(
      path.join(appRoot, 'vendor/axhub-commentary/dist/index.mjs'),
      'utf8',
    );
    const cjsBundle = fs.readFileSync(
      path.join(appRoot, 'vendor/axhub-commentary/dist/index.js'),
      'utf8',
    );

    expect(typesSource.match(/deletedAt\?: number \| null;/gu)).toHaveLength(2);
    expect(typesSource).not.toContain('PrototypeEditCommentTaskTombstone');
    expect(typesSource).toContain('schemaVersion: 3;');
    expect(typesSource).toContain('commentId: string;');
    expect(typesSource).toContain('export type PrototypeEditCommentTombstone =');
    expect(typesSource).toContain('observedTombstones?: PrototypeEditCommentTombstone[];');
    expect(persistenceSource).toContain('function normalizeCommentId(');
    expect(persistenceSource).not.toContain('function buildScopedElementIdentity(');
    expect(persistenceSource).toContain('observedTombstones: adapterResult.observedTombstones');
    expect(persistenceSource).toContain('const refreshedResult = await readAdapterDocument();');
    expect(lifecycleSource.match(/discardDeletedElementStates\?\.\(deletedElementKeys\)/gu)).toHaveLength(2);
    for (const bundle of [esmBundle, cjsBundle]) {
      expect(bundle).toContain('observedTombstones');
      expect(bundle).toContain('commentId');
      expect(bundle).toContain('Failed to compact restored prototype comments');
    }
  });

  it('syncs prebuilt package artifacts and writes generated metadata', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'make-server-vendor-test-'));
    const appTempRoot = path.join(tempRoot, 'apps', 'make-server');
    const sourceRoot = path.join(tempRoot, 'packages', 'demo-package');
    const sourceDistRoot = path.join(sourceRoot, 'dist');

    fs.mkdirSync(sourceDistRoot, { recursive: true });
    fs.mkdirSync(appTempRoot, { recursive: true });
    fs.writeFileSync(path.join(appTempRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['src/*'],
        },
      },
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(sourceDistRoot, 'index.mjs'), 'export const demo = true;\n', 'utf8');
    fs.writeFileSync(path.join(sourceDistRoot, 'index.d.ts'), 'export declare const demo: true;\n', 'utf8');
    fs.writeFileSync(path.join(sourceDistRoot, '.DS_Store'), 'local metadata should not be vendored\n', 'utf8');
    fs.writeFileSync(
      path.join(sourceRoot, 'package.json'),
      JSON.stringify({ name: 'demo-package', type: 'module' }, null, 2),
      'utf8',
    );

    const config = {
      packages: [
        {
          packageName: 'demo-package',
          aliases: ['demo-alias'],
          sourceDir: '../../packages/demo-package',
          outputDir: 'vendor/demo-package',
          runtimeEntry: 'dist/index.mjs',
          typesEntry: 'dist/index.d.ts',
          copy: ['dist', 'package.json'],
          buildCommand: [],
        },
      ],
    };

    try {
      const result = syncVendorPackages(appTempRoot, config, {
        shouldBuild: false,
        onBuildPackage: () => {
          throw new Error('build hook should not run when shouldBuild=false');
        },
      });

      expect(result.packages).toHaveLength(2);
      expect(fs.existsSync(path.join(appTempRoot, 'vendor/demo-package/dist/index.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(appTempRoot, 'vendor/demo-package/package.json'))).toBe(true);
      expect(fs.existsSync(path.join(appTempRoot, 'vendor/demo-package/dist/.DS_Store'))).toBe(false);

      const generatedAliases = JSON.parse(
        fs.readFileSync(path.join(appTempRoot, 'vendor/vendor-aliases.generated.json'), 'utf8'),
      );
      expect(generatedAliases.packages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: 'demo-package',
          runtimeEntryRelative: 'vendor/demo-package/dist/index.mjs',
          typesEntryRelative: 'vendor/demo-package/dist/index.d.ts',
        }),
        expect.objectContaining({
          packageName: 'demo-alias',
          runtimeEntryRelative: 'vendor/demo-package/dist/index.mjs',
          typesEntryRelative: 'vendor/demo-package/dist/index.d.ts',
        }),
      ]));

      const generatedTsconfig = JSON.parse(
        fs.readFileSync(path.join(appTempRoot, 'vendor/vendor-tsconfig.generated.json'), 'utf8'),
      );
      expect(generatedTsconfig.compilerOptions.paths).toMatchObject({
        '@/*': ['src/*'],
        'demo-package': ['./vendor/demo-package/dist/index.d.ts'],
        'demo-alias': ['./vendor/demo-package/dist/index.d.ts'],
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rewrites workspace dependencies between vendored packages to relative file specs', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'make-server-vendor-deps-test-'));
    const appTempRoot = path.join(tempRoot, 'apps', 'make-server');
    const sourceRoot = path.join(tempRoot, 'packages', 'consumer-package');
    const dependencyRoot = path.join(tempRoot, 'packages', 'dependency-package');

    for (const root of [sourceRoot, dependencyRoot]) {
      fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(root, 'dist/index.mjs'), 'export const demo = true;\n', 'utf8');
      fs.writeFileSync(path.join(root, 'dist/index.d.ts'), 'export declare const demo: true;\n', 'utf8');
    }
    fs.mkdirSync(appTempRoot, { recursive: true });
    fs.writeFileSync(path.join(appTempRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: {} } }), 'utf8');
    fs.writeFileSync(
      path.join(sourceRoot, 'package.json'),
      JSON.stringify({
        name: 'consumer-package',
        type: 'module',
        dependencies: {
          'dependency-package': 'workspace:*',
          'external-package': '^1.0.0',
        },
      }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(dependencyRoot, 'package.json'),
      JSON.stringify({ name: 'dependency-package', type: 'module' }, null, 2),
      'utf8',
    );

    const config = {
      packages: [
        {
          packageName: 'consumer-package',
          aliases: [],
          sourceDir: '../../packages/consumer-package',
          outputDir: 'vendor/consumer-package',
          runtimeEntry: 'dist/index.mjs',
          typesEntry: 'dist/index.d.ts',
          copy: ['dist', 'package.json'],
          buildCommand: [],
        },
        {
          packageName: 'dependency-package',
          aliases: [],
          sourceDir: '../../packages/dependency-package',
          outputDir: 'vendor/dependency-package',
          runtimeEntry: 'dist/index.mjs',
          typesEntry: 'dist/index.d.ts',
          copy: ['dist', 'package.json'],
          buildCommand: [],
        },
      ],
    };

    try {
      syncVendorPackages(appTempRoot, config, { shouldBuild: false });

      const vendoredPackageJson = JSON.parse(
        fs.readFileSync(path.join(appTempRoot, 'vendor/consumer-package/package.json'), 'utf8'),
      );
      expect(vendoredPackageJson.dependencies).toMatchObject({
        'dependency-package': 'file:../dependency-package',
        'external-package': '^1.0.0',
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('serializes vendor sync operations with a lock directory', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'make-server-vendor-lock-test-'));
    const appTempRoot = path.join(tempRoot, 'apps', 'make-server');
    const syncLog: string[] = [];

    fs.mkdirSync(appTempRoot, { recursive: true });

    try {
      const firstResult = withVendorSyncLock(appTempRoot, () => {
        syncLog.push('first');
        return 'locked';
      }, {
        retryDelayMs: 1,
        timeoutMs: 20,
      });

      expect(firstResult).toBe('locked');
      expect(syncLog).toEqual(['first']);
      expect(fs.existsSync(path.join(appTempRoot, 'vendor/.sync.lock'))).toBe(false);

      fs.mkdirSync(path.join(appTempRoot, 'vendor/.sync.lock'), { recursive: true });

      expect(() => withVendorSyncLock(appTempRoot, () => {
        syncLog.push('blocked');
      }, {
        retryDelayMs: 1,
        timeoutMs: 3,
      })).toThrow(/Timed out waiting for vendor sync lock/);
      expect(syncLog).toEqual(['first']);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
