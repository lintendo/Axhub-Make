import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';

process.env.AXHUB_MAKE_RELEASE_SKIP_MAIN = '1';

const releaseMake = await import('./release-make.mjs');

const tempRoots = [];

function createTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeMinimalTemplateAssembly(clientRoot, runtimeFiles = ['package.json']) {
  writeFile(path.join(clientRoot, 'template-manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    runtime: { files: runtimeFiles, directories: [] },
    makeMetadata: {
      seedDirectory: 'template-seed/.axhub/make',
      outputDirectory: '.axhub/make',
      files: [
        { path: 'README.md', strategy: 'copy', description: 'Copy seed README.' },
        { path: 'axhub.config.json', strategy: 'sanitize', description: 'Sanitize seed config.' },
        { path: 'client.json', strategy: 'copy', description: 'Copy seed marker.' },
        { path: 'sidebar-tree.json', strategy: 'filter', description: 'Filter seed sidebar.' },
      ],
    },
    prototypes: [{ id: 'example' }],
    themes: { idRules: [] },
    resources: { files: [] },
  }, null, 2)}\n`);
  writeFile(path.join(clientRoot, 'src/prototypes/example/index.tsx'), 'export {};\n');
  writeFile(path.join(clientRoot, 'src/themes/example/index.tsx'), 'export {};\n');
  writeFile(path.join(clientRoot, 'template-seed/.axhub/make/README.md'), '# Seed\n');
  writeFile(path.join(clientRoot, 'template-seed/.axhub/make/axhub.config.json'), '{}\n');
  writeFile(path.join(clientRoot, 'template-seed/.axhub/make/client.json'), '{}\n');
  writeFile(path.join(clientRoot, 'template-seed/.axhub/make/sidebar-tree.json'), JSON.stringify({
    prototypes: [{ kind: 'item', itemKey: 'prototypes/example' }],
    themesTree: [{ kind: 'item', itemKey: 'themes/example' }],
    themes: ['example'],
  }));
}

function stripTypeImportQueries(source) {
  return source
    .replace(/^\s*import\s+type\s+[^;]+;\s*$/gmu, '')
    .replace(/typeof\s+import\(['"][^'"]+['"]\)/gu, 'type-import-query');
}

function listSourceFiles(rootDir) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === '__tests__') {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/u.test(entry.name) && !/\.test\./u.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  visit(rootDir);
  return files.sort((left, right) => left.localeCompare(right));
}

function findAncestorFile(relativePath) {
  let currentDir = path.resolve('.');
  while (true) {
    const candidate = path.join(currentDir, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function readTrackedFiles() {
  const result = spawnSync('git', ['ls-files'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldScanTrackedFile(relativePath) {
  if (/^(?:automation-reports|\.local|\.release|coverage|dist|node_modules)\//u.test(relativePath)) {
    return false;
  }
  return /^(?:package\.json|pnpm-lock\.yaml|bin\/|scripts\/|src\/|client\/(?:package\.json|src\/|\.axhub\/make\/|\.agents\/|\.claude\/|rules\/|vite-plugins\/))/u
    .test(relativePath);
}

function containsLocalMachinePath(source) {
  return /(?:file:\/(?:Users|Volumes)|\/(?:Users|Volumes)\/[^/'"`\s]+)\/[^'"`\s]*/u.test(source)
    || /[A-Za-z]:\\Users\\/u.test(source)
    || /%2F(?:Users|Volumes)%2F[^%/\s]+%2F/iu.test(source);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('release make artifact helpers', () => {
  it('validates demand annotation copy in the built admin bundle', () => {
    const root = createTempRoot('axhub-release-admin-copy-');
    const bundlePath = path.join(root, 'assets', 'admin.js');

    writeFile(bundlePath, 'const placeholder = "输入需求标注，支持 Markdown 格式";\n');
    assert.doesNotThrow(() => releaseMake.assertAdminBundleCopy(root));

    writeFile(bundlePath, 'const placeholder = "输入需求";\n');
    assert.throws(
      () => releaseMake.assertAdminBundleCopy(root),
      /Admin build is missing required demand annotation copy/u,
    );

    writeFile(bundlePath, 'const placeholder = "输入需求标注，支持 Markdown 格式"; const legacy = "标注 Markdown";\n');
    assert.throws(
      () => releaseMake.assertAdminBundleCopy(root),
      /Admin build includes legacy demand annotation copy/u,
    );
  });

  it('allowlists generated-client scripts instead of publishing the whole scripts directory', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve('client/template-manifest.json'), 'utf8'),
    );
    const expectedClientRootScripts = [
      'scripts/build-all.js',
      'scripts/canvas-fig-sync.mjs',
      'scripts/capture-theme-homepage.mjs',
      'scripts/capture-theme-source.mjs',
      'scripts/check-app-ready.mjs',
      'scripts/chrome-export-converter.mjs',
      'scripts/scan-entries.js',
      'scripts/sync-project-metadata.d.ts',
      'scripts/sync-project-metadata.mjs',
      'scripts/sync-project-metadata.mjs.d.ts',
      'scripts/sync-vendor-if-present.mjs',
    ];

    assert(!manifest.runtime.directories.includes('scripts'));
    assert.deepEqual(
      manifest.runtime.files
        .filter((entry) => entry.startsWith('scripts/'))
        .sort((left, right) => left.localeCompare(right)),
      expectedClientRootScripts,
    );
    assert(manifest.runtime.directories.includes('scripts/templates'));
    assert(manifest.runtime.directories.includes('scripts/utils'));
  });

  it('keeps tracked source files free of local machine paths', () => {
    assert.equal(containsLocalMachinePath(`/${'Users'}/example/project`), true);
    assert.equal(containsLocalMachinePath(`/${'Volumes'}/ExampleDisk/project`), true);
    assert.equal(containsLocalMachinePath(['%2F', 'Users', '%2F', 'example', '%2F', 'project'].join('')), true);

    const offenders = [];
    for (const relativePath of readTrackedFiles()) {
      if (!shouldScanTrackedFile(relativePath)) {
        continue;
      }
      const absolutePath = path.resolve(relativePath);
      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
        continue;
      }
      const source = fs.readFileSync(absolutePath, 'utf8');
      if (containsLocalMachinePath(source)) {
        offenders.push(relativePath);
      }
    }

    assert.deepEqual(offenders, []);
  });

  it('builds independent make client template zip metadata', () => {
    const metadata = releaseMake.createTemplateZipMetadata({
      templateVersion: '0.2.0-beta.1',
      githubRepo: 'lintendo/Axhub-Make',
    });
    const prefixedMetadata = releaseMake.createTemplateZipMetadata({
      templateVersion: 'v0.2.0-beta.1',
      githubRepo: 'lintendo/Axhub-Make',
    });

    assert.deepEqual(metadata, {
      templateVersion: '0.2.0-beta.1',
      tagName: 'make-client-template-v0.2.0-beta.1',
      githubReleaseAssetName: 'axhub-make-client-template.zip',
      primaryUrl: 'https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v0.2.0-beta.1/axhub-make-client-template.zip',
      mirrorUrl: 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v0.2.0-beta.1/axhub-make-client-template.zip',
    });
    assert.deepEqual(prefixedMetadata, metadata);
  });

  it('syncs the default make client template version from the template package version', () => {
    const root = createTempRoot('axhub-release-template-version-sync-');
    const sourceFile = path.join(root, 'makeClientTemplate.ts');
    writeFile(sourceFile, "export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.1';\n");

    const firstResult = releaseMake.syncDefaultMakeClientTemplateVersion({
      sourceFile,
      templateVersion: '0.1.2',
    });
    const secondResult = releaseMake.syncDefaultMakeClientTemplateVersion({
      sourceFile,
      templateVersion: '0.1.2',
    });

    assert.equal(firstResult.changed, true);
    assert.equal(secondResult.changed, false);
    assert.equal(
      fs.readFileSync(sourceFile, 'utf8'),
      "export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.2';\n",
    );
  });

  it('requires make client template release notes to mention the matching template version', () => {
    const root = createTempRoot('axhub-release-template-notes-');
    const clientRoot = path.join(root, 'client');
    const releaseNotesPath = path.join(clientRoot, 'RELEASE_NOTES.md');
    const releaseNotes = [
      '# Axhub Make Client 0.2.0',
      '',
      '- 更新官方模板文件。',
      '',
    ].join('\n');
    writeFile(path.join(clientRoot, 'package.json'), '{"name":"@axhub/make-client","version":"0.2.0"}\n');
    writeFile(releaseNotesPath, releaseNotes);

    assert.equal(
      releaseMake.readMakeClientTemplateReleaseNotes({
        sourceClientDir: clientRoot,
        templateVersion: '0.2.0',
      }),
      releaseNotes.trim(),
    );

    writeFile(releaseNotesPath, '# Axhub Make Client 0.1.9\n\n- 旧版本说明。\n');
    assert.throws(
      () => releaseMake.readMakeClientTemplateReleaseNotes({
        sourceClientDir: clientRoot,
        templateVersion: '0.2.0',
      }),
      /must mention template version 0\.2\.0/,
    );

    writeFile(releaseNotesPath, '# Axhub Make Client 0.1.9\n\n- 准备升级到 0.2.0。\n');
    assert.throws(
      () => releaseMake.readMakeClientTemplateReleaseNotes({
        sourceClientDir: clientRoot,
        templateVersion: '0.2.0',
      }),
      /must mention template version 0\.2\.0/,
    );

    fs.rmSync(releaseNotesPath);
    assert.throws(
      () => releaseMake.readMakeClientTemplateReleaseNotes({
        sourceClientDir: clientRoot,
        templateVersion: '0.2.0',
      }),
      /release notes file is required/,
    );
  });

  it('syncs the default make client template release notes into the runtime constants', () => {
    const root = createTempRoot('axhub-release-template-notes-sync-');
    const sourceFile = path.join(root, 'makeClientTemplate.ts');
    const releaseNotes = '# Axhub Make Client 0.2.0\n\n- 更新官方模板文件。';
    writeFile(sourceFile, [
      "export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.1';",
      'export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = "";',
      '',
    ].join('\n'));

    const result = releaseMake.syncDefaultMakeClientTemplateReleaseNotes({
      sourceFile,
      templateVersion: '0.2.0',
      releaseNotes,
    });

    assert.equal(result.changed, true);
    assert.equal(result.templateVersion, '0.2.0');
    assert.match(
      fs.readFileSync(sourceFile, 'utf8'),
      /export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = "# Axhub Make Client 0\.2\.0\\n\\n- 更新官方模板文件。";/u,
    );
  });

  it('creates the online make client template latest manifest from release notes and zip metadata', () => {
    const releaseNotes = '# Axhub Make Client 0.2.0\n\n- 更新官方模板文件。';
    const manifest = releaseMake.createMakeClientTemplateLatestManifest({
      templateVersion: '0.2.0',
      releaseNotes,
      zipMetadata: releaseMake.createTemplateZipMetadata({ templateVersion: '0.2.0' }),
      publishedAt: '2026-07-09T00:00:00.000Z',
    });

    assert.deepEqual(manifest, {
      schemaVersion: 1,
      version: '0.2.0',
      releaseNotes,
      publishedAt: '2026-07-09T00:00:00.000Z',
      sources: [
        {
          id: 'github',
          url: 'https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v0.2.0/axhub-make-client-template.zip',
          markerRepository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
          templateVersion: '0.2.0',
        },
        {
          id: 'gitee',
          url: 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v0.2.0/axhub-make-client-template.zip',
          markerRepository: 'https://gitee.com/axhub/Axhub-Make/tree/main/client',
          templateVersion: '0.2.0',
        },
      ],
    });
  });

  it('keeps make client Vitest companion packages on exact matching versions', () => {
    const clientPackageJson = JSON.parse(fs.readFileSync(path.resolve('client/package.json'), 'utf8'));
    const devDependencies = clientPackageJson.devDependencies || {};
    const vitestVersion = devDependencies.vitest;

    assert.match(
      vitestVersion,
      /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u,
      'client devDependencies.vitest must be an exact version to avoid npm peer dependency solver drift',
    );
    assert.equal(devDependencies['@vitest/ui'], vitestVersion);
    assert.equal(devDependencies['@vitest/coverage-v8'], vitestVersion);
  });

  it('declares the client template payload without mutable development defaults', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('client/template-manifest.json'), 'utf8'));

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.prototypeDefaults, undefined);
    assert.equal(manifest.themes.defaultAction, undefined);
    assert(manifest.runtime.files.includes('THIRD_PARTY_NOTICES.md'));
    const thirdPartyNotices = fs.readFileSync(path.resolve('client/THIRD_PARTY_NOTICES.md'), 'utf8');
    assert.match(thirdPartyNotices, /Copyright \(c\) 2026 Muhammed Eliwat/u);
    assert.match(thirdPartyNotices, /Permission is hereby granted, free of charge/u);
    assert.match(thirdPartyNotices, /5d3aeca239caef3ea4080034eb22ab87cc77fa24/u);
    assert.deepEqual(manifest.prototypes.map(({ id }) => id), [
      'annotation-demo',
      'beginner-guide',
      'touch-and-talk-annotation-demo',
    ]);
    assert.equal(
      manifest.prototypes.find(({ id }) => id === 'annotation-demo')?.fileRules,
      undefined,
    );
    assert.equal(manifest.makeMetadata.seedDirectory, 'template-seed/.axhub/make');
    assert.equal(manifest.makeMetadata.outputDirectory, '.axhub/make');
    assert.deepEqual(
      manifest.makeMetadata.files.map(({ path: filePath, strategy }) => ({ path: filePath, strategy })),
      [
        { path: 'README.md', strategy: 'copy' },
        { path: 'axhub.config.json', strategy: 'sanitize' },
        { path: 'client.json', strategy: 'copy' },
        { path: 'sidebar-tree.json', strategy: 'filter' },
      ],
    );

    const rules = [
      ...(manifest.runtime.fileRules || []),
      ...manifest.prototypes.flatMap(({ fileRules = [] }) => fileRules),
      ...manifest.themes.idRules,
      ...manifest.makeMetadata.files,
    ];
    assert(rules.every(({ description }) => typeof description === 'string' && description.trim()));
  });

  it('keeps mobile theme source notices consistent with tracked provenance files', () => {
    const themesRoot = path.resolve('client/src/themes');
    const staleNotices = fs.readdirSync(themesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('-mobile'))
      .map((entry) => path.join(themesRoot, entry.name, 'SOURCE.md'))
      .filter((sourcePath) => fs.existsSync(sourcePath))
      .filter((sourcePath) => fs.readFileSync(sourcePath, 'utf8').includes('normalization.json'));

    assert.deepEqual(staleNotices, []);
  });

  it('does not publish the triple ampersand test skill', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('client/template-manifest.json'), 'utf8'));
    const excludedPaths = (manifest.runtime.fileRules || [])
      .filter(({ action }) => action === 'exclude')
      .map(({ pattern }) => new RegExp(pattern, 'u'));
    const skillRoots = ['.agents', '.claude'];

    for (const skillRoot of skillRoots) {
      const relativeSkillPath = `${skillRoot}/skills/triple-ampersand-operator`;
      assert(
        excludedPaths.some((pattern) => pattern.test(`${relativeSkillPath}/SKILL.md`)),
        `${relativeSkillPath} must be excluded by the client template manifest`,
      );
      assert.equal(
        fs.existsSync(path.resolve('client', relativeSkillPath)),
        false,
        `${relativeSkillPath} must not exist in client template source`,
      );
    }
  });

  it('derives allowed Make metadata entries from the template manifest', () => {
    assert.deepEqual(
      releaseMake.listAllowedMakeClientTemplateMetadataEntries({
        sourceClientDir: path.resolve('client'),
      }),
      [
        '.axhub/make/README.md',
        '.axhub/make/axhub.config.json',
        '.axhub/make/client.json',
        '.axhub/make/sidebar-tree.json',
      ],
    );
  });

  it('rejects a sidebar seed whose flat theme list omits a selected theme', () => {
    const sourceRoot = createTempRoot('axhub-release-template-sidebar-source-');
    const outputRoot = createTempRoot('axhub-release-template-sidebar-output-');
    const clientRoot = path.join(sourceRoot, 'client');
    writeFile(path.join(clientRoot, 'package.json'), '{"name":"@axhub/make-client"}\n');
    writeMinimalTemplateAssembly(clientRoot);
    writeFile(path.join(clientRoot, 'template-seed/.axhub/make/sidebar-tree.json'), JSON.stringify({
      prototypes: [{ kind: 'item', itemKey: 'prototypes/example' }],
      themesTree: [{ kind: 'item', itemKey: 'themes/example' }],
      themes: [],
    }));

    assert.throws(
      () => releaseMake.createMakeClientTemplateZip({
        sourceClientDir: clientRoot,
        outputDir: outputRoot,
      }),
      /Template sidebar seed themes list is missing themes: example/u,
    );
  });

  it('keeps the approved annotation range while pinning exact client dependencies and pnpm', () => {
    const clientPackageJson = JSON.parse(fs.readFileSync(path.resolve('client/package.json'), 'utf8'));

    assert.equal(clientPackageJson.version, '0.1.16');
    assert.equal(clientPackageJson.packageManager, 'pnpm@10.20.0');
    assert.equal(clientPackageJson.dependencies['@axhub/annotation'], '^1.0.17');
    assert.equal(clientPackageJson.dependencies['lucide-react'], '0.562.0');
    assert.equal(clientPackageJson.devDependencies['@types/react'], '^18.2.0');
    assert.equal(clientPackageJson.devDependencies['@types/react-dom'], '^18.2.0');
  });

  it('keeps live comments ignored in the publishing checkout', () => {
    const sourceGitignore = fs.readFileSync(path.resolve('client/.gitignore'), 'utf8');

    assert.match(sourceGitignore, /^\.axhub\/make\/\*$/mu);
    assert.doesNotMatch(sourceGitignore, /^!\.axhub\/make\/(?:comments|comment-assets)(?:\/|\/\*\*)$/mu);
  });

  it('creates a lean pnpm-only package manifest for released client templates', () => {
    const packageJson = releaseMake.createMakeClientTemplatePackageJson({
      name: '@axhub/make-client',
      version: '0.1.13',
      scripts: {
        dev: 'vite',
        test: 'pnpm test:run',
        'test:run': 'vitest --run',
        'test:coverage': 'vitest --run --coverage',
        'test:watch': 'vitest',
        'test:ui': 'vitest --ui',
        coverage: 'pnpm test:coverage',
        'font:subset:beginner-guide': 'node scripts/subset-beginner-guide-fonts.mjs',
      },
      dependencies: {
        '@axhub/annotation': '^1.0.17',
        'lucide-react': '0.562.0',
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@vitest/coverage-v8': '4.0.16',
        '@vitest/ui': '4.0.16',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        'subset-font': '^2.5.0',
        vitest: '4.0.16',
        vite: '5.4.21',
      },
    });

    assert.equal(packageJson.packageManager, 'pnpm@10.20.0');
    assert.deepEqual(packageJson.scripts, { dev: 'vite' });
    assert.deepEqual(packageJson.dependencies, {
      '@axhub/annotation': '^1.0.17',
      'lucide-react': '0.562.0',
    });
    assert.deepEqual(packageJson.devDependencies, {
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      react: '18.2.0',
      'react-dom': '18.2.0',
      vite: '5.4.21',
    });
  });

  it('keeps ordinary make release commands free of the client template zip', () => {
    const commands = releaseMake.publishCommands({
      tagName: 'make-v1.2.3',
      templateZip: {
        path: '/tmp/axhub-make-client-template.zip',
      },
      releaseAssets: [
        { zipPath: '/tmp/axhub-make-1.2.3-macos-arm64.zip' },
      ],
    }, {
      githubRepo: 'lintendo/Axhub-Make',
      npmTag: 'latest',
    });

    assert(commands.releaseArgs.includes('/tmp/axhub-make-1.2.3-macos-arm64.zip'));
    assert(!commands.releaseArgs.includes('/tmp/axhub-make-client-template.zip'));
  });

  it('builds template-only release commands with the client template zip and latest manifest', () => {
    const commands = releaseMake.publishTemplateCommands({
      tagName: 'make-client-template-v0.2.0-beta.1',
      templateVersion: '0.2.0-beta.1',
      templateZip: {
        path: '/tmp/axhub-make-client-template.zip',
      },
      latestManifest: {
        path: '/tmp/axhub-make-client-template.latest.json',
      },
    }, {
      githubRepo: 'lintendo/Axhub-Make',
    });

    assert.deepEqual(commands.releaseArgs, [
      'release',
      'create',
      'make-client-template-v0.2.0-beta.1',
      '/tmp/axhub-make-client-template.zip',
      '/tmp/axhub-make-client-template.latest.json',
      '--repo',
      'lintendo/Axhub-Make',
      '--title',
      'Axhub Make Client Template 0.2.0-beta.1',
      '--generate-notes',
    ]);
  });

  it('requires explicit human confirmation before external publishing', () => {
    assert.throws(
      () => releaseMake.assertExternalPublishConfirmed({ confirmPublish: false }),
      /--confirm-publish/u,
    );
    assert.doesNotThrow(
      () => releaseMake.assertExternalPublishConfirmed({ confirmPublish: true }),
    );
  });

  it('packages the make client template zip without local runtime artifacts', async () => {
    const sourceRoot = createTempRoot('axhub-release-template-source-');
    const outputRoot = createTempRoot('axhub-release-template-output-');
    const clientRoot = path.join(sourceRoot, 'client');
    writeFile(path.join(clientRoot, 'package.json'), `${JSON.stringify({
      name: '@axhub/make-client',
      private: true,
      scripts: {
        dev: 'vite',
        test: 'pnpm test:run',
        'test:run': 'vitest --run',
        'font:subset:beginner-guide': 'node scripts/subset-beginner-guide-fonts.mjs',
      },
      devDependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        'subset-font': '^2.5.0',
        vitest: '4.0.16',
      },
    }, null, 2)}\n`);
    writeFile(path.join(clientRoot, 'template-manifest.json'), `${JSON.stringify({
      schemaVersion: 1,
      runtime: {
        files: [
          '.gitignore',
          'package.json',
          'THIRD_PARTY_NOTICES.md',
          'scripts/build-all.js',
          'scripts/capture-theme-homepage.mjs',
          'scripts/capture-theme-source.mjs',
        ],
        directories: ['.agents/skills', '.claude/skills', 'scripts/utils'],
        fileRules: [{
          action: 'exclude',
          pattern: '^\\.(?:agents|claude)/skills/prototype-comments(?:/|$)',
          description: 'Do not publish the replaced prototype comments skill.',
        }],
      },
      makeMetadata: {
        seedDirectory: 'template-seed/.axhub/make',
        outputDirectory: '.axhub/make',
        files: [
          { path: 'README.md', strategy: 'copy', description: 'Copy seed README.' },
          { path: 'axhub.config.json', strategy: 'sanitize', description: 'Sanitize seed config.' },
          { path: 'client.json', strategy: 'copy', description: 'Copy seed marker.' },
          { path: 'sidebar-tree.json', strategy: 'filter', description: 'Filter seed sidebar.' },
        ],
      },
      prototypes: [
        { id: 'annotation-demo' },
        {
          id: 'beginner-guide',
          fileRules: [{
            action: 'exclude',
            pattern: '^annotation-source\\.json$',
            description: 'Do not publish beginner annotations.',
          }, {
            action: 'exclude',
            pattern: '\\.(?:otf|ttf)$',
            description: 'Do not publish source fonts.',
          }],
        },
        {
          id: 'touch-and-talk-annotation-demo',
          fileRules: [{
            action: 'exclude',
            pattern: '^annotation-source\\.json$',
            description: 'Do not publish commentary demo annotations.',
          }],
        },
      ],
      themes: {
        idRules: [{
          action: 'exclude',
          pattern: '^(?:trae|whop)$',
          description: 'Do not publish local themes.',
        }],
      },
      resources: {
        files: ['src/resources/README.md'],
      },
    }, null, 2)}\n`);
    writeFile(path.join(clientRoot, '.gitignore'), [
      '.axhub/make/*',
      '!.axhub/make/client.json',
      '!.axhub/make/axhub.config.json',
      '!.axhub/make/README.md',
      '!.axhub/make/sidebar-tree.json',
      '',
    ].join('\n'));
    writeFile(path.join(clientRoot, 'THIRD_PARTY_NOTICES.md'), [
      '# Third-Party Notices',
      '',
      'Permission is hereby granted, free of charge.',
      '',
    ].join('\n'));
    writeFile(path.join(clientRoot, 'src/prototypes/annotation-demo/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, 'src/prototypes/annotation-demo/annotation-source.json'), '{}\n');
    writeFile(path.join(clientRoot, 'src/prototypes/annotation-demo/.spec/spec.md'), '# Annotation spec\n');
    writeFile(path.join(clientRoot, 'src/prototypes/annotation-demo/.spec/implementation.md'), '# Local plan\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/annotation-source.json'), '{}\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/.spec/spec.html'), '<h1>Beginner spec</h1>\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/.spec/spec.md'), '# Beginner spec\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/canvas.excalidraw'), '{"type":"excalidraw"}\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/canvas-assets/screenshot.png'), 'screenshot\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/.spec/acp/conversations.json'), `{"cwd":"/${'Users'}/builder/project"}\n`);
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/.spec/prototype-comments.json'), '{}\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/.spec/prototype-review.md'), '# Local review\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/TsangerJinKai02-W04.ttf'), 'source font\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/TsangerJinKai02-W04.subset.woff2'), 'subset font\n');
    writeFile(path.join(clientRoot, 'src/prototypes/touch-and-talk-annotation-demo/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, 'src/prototypes/touch-and-talk-annotation-demo/annotation-source.json'), '{}\n');
    writeFile(path.join(clientRoot, 'src/prototypes/touch-and-talk-annotation-demo/.spec/spec.md'), '# Commentary spec\n');
    writeFile(path.join(clientRoot, 'src/prototypes/dev-only/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, 'tests/template.test.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/build-all.js'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/capture-theme-homepage.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/capture-theme-source.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/utils/runtime.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/collect-mobile-theme-screenshots.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/capture-theme-homepage.test.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/subset-beginner-guide-fonts.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, 'scripts/smoke-preview-routes.mjs'), 'export {};\n');
    writeFile(path.join(clientRoot, '.git/config'), '[core]\n');
    writeFile(path.join(clientRoot, '.DS_Store'), 'finder\n');
    writeFile(path.join(clientRoot, 'src/resources/.DS_Store'), 'finder\n');
    writeFile(path.join(clientRoot, 'src/resources/README.md'), '# Resources\n');
    writeFile(path.join(clientRoot, 'src/resources/untitled.assets/scratch.png'), 'scratch\n');
    writeFile(path.join(clientRoot, 'src/themes/trae/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, 'src/themes/whop/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, 'src/themes/claude/index.tsx'), 'export {};\n');
    writeFile(path.join(clientRoot, '.drawio-tmp/order-flow/order-flow.spec.yaml'), 'id: order-flow\n');
    writeFile(path.join(clientRoot, 'node_modules/left-pad/index.js'), 'module.exports = null;\n');
    writeFile(path.join(clientRoot, 'dist/build.js'), 'console.log("built");\n');
    writeFile(path.join(clientRoot, '.agents/skills/local/SKILL.md'), 'npm run typecheck\n');
    writeFile(path.join(clientRoot, '.claude/skills/local/SKILL.md'), 'npm run typecheck\n');
    writeFile(path.join(clientRoot, '.agents/skills/handle-comments/SKILL.md'), '# Handle comments\n');
    writeFile(path.join(clientRoot, '.claude/skills/handle-comments/SKILL.md'), '# Handle comments\n');
    writeFile(path.join(clientRoot, '.agents/skills/prototype-comments/SKILL.md'), '# Stale skill\n');
    writeFile(path.join(clientRoot, '.claude/skills/prototype-comments/SKILL.md'), '# Stale skill\n');
    writeFile(path.join(clientRoot, '.trae/local.json'), '{}\n');
    writeFile(path.join(clientRoot, '.codex/session.json'), '{}\n');
    writeFile(path.join(clientRoot, '.workbuddy/state.json'), '{}\n');
    writeFile(path.join(clientRoot, '.logs/make-server.pid'), '12345\n');
    writeFile(path.join(clientRoot, 'logs/make-server.log'), 'server log\n');
    writeFile(path.join(clientRoot, 'tmp-midscene/cli-runtime/package.json'), '{"name":"tmp-midscene-runtime"}\n');
    writeFile(path.join(clientRoot, 'temp/scratch.txt'), 'scratch\n');
    writeFile(path.join(clientRoot, '.axhub/make/client.json'), '{"kind":"live-client"}\n');
    writeFile(path.join(clientRoot, '.axhub/make/README.md'), '# Live Make client\n');
    writeFile(path.join(clientRoot, '.axhub/make/sidebar-tree.json'), JSON.stringify({
      version: 1,
      prototypes: [{ kind: 'item', itemKey: 'prototypes/dev-only' }],
      themesTree: [{ kind: 'item', itemKey: 'themes/trae' }],
    }));
    writeFile(path.join(clientRoot, '.axhub/make/project.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/make/entries.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/make/.dev-server-info.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/make/axhub.config.json'), '{"server":{"host":"live-host"}}\n');
    writeFile(path.join(clientRoot, '.axhub/make/comments/local.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/make/comment-assets/local/image.png'), 'image\n');
    writeFile(path.join(clientRoot, '.axhub/make/sessions/stale.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/make/exports/stale.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/make/edit-history/stale.json'), '{}\n');
    writeFile(path.join(clientRoot, '.axhub/sessions/conversations.json'), '{}\n');
    writeFile(path.join(clientRoot, 'src/resources/prd/PROJECT.md'), '# Local project\n');
    writeFile(path.join(clientRoot, 'src/prototypes/beginner-guide/.spec/reviews/config.json'), '{"reviewer":"local"}\n');
    writeFile(path.join(clientRoot, 'template-seed/.axhub/make/README.md'), '# Seed Make client\n');
    writeFile(path.join(clientRoot, 'template-seed/.axhub/make/client.json'), '{"kind":"seed-client"}\n');
    writeFile(path.join(clientRoot, 'template-seed/.axhub/make/axhub.config.json'), JSON.stringify({
      server: { host: 'localhost', lanHost: '192.168.1.5', enableCommandAPI: false },
      cloudPublishing: { s3: { secretAccessKey: 'remove-me' } },
    }));
    writeFile(path.join(clientRoot, 'template-seed/.axhub/make/sidebar-tree.json'), JSON.stringify({
      version: 1,
      prototypes: [
        { kind: 'item', title: 'Annotation', itemKey: 'prototypes/annotation-demo' },
        { kind: 'item', title: 'Beginner', itemKey: 'prototypes/beginner-guide' },
        { kind: 'item', title: 'Commentary', itemKey: 'prototypes/touch-and-talk-annotation-demo' },
        { kind: 'item', title: 'Seed extra', itemKey: 'prototypes/dev-only' },
      ],
      themesTree: [{
        kind: 'folder',
        title: 'Themes',
        children: [
          { kind: 'item', title: 'Claude', itemKey: 'themes/claude' },
          { kind: 'item', title: 'Trae', itemKey: 'themes/trae' },
          { kind: 'item', title: 'Whop', itemKey: 'themes/whop' },
        ],
      }],
      themes: ['claude', 'trae', 'whop'],
    }));

    const result = await releaseMake.createMakeClientTemplateZip({
      sourceClientDir: clientRoot,
      outputDir: outputRoot,
    });

    assert.equal(path.basename(result.path), 'axhub-make-client-template.zip');
    assert.match(result.sha256, /^[a-f0-9]{64}$/u);
    const entries = releaseMake.listZipEntries(result.path);
    const zipEntries = unzipSync(new Uint8Array(fs.readFileSync(result.path)));
    const packagedPackageJson = JSON.parse(Buffer.from(zipEntries['package.json']).toString('utf8'));
    const packagedLockfile = Buffer.from(zipEntries['pnpm-lock.yaml']).toString('utf8');
    const packagedGitignore = Buffer.from(zipEntries['.gitignore']).toString('utf8');
    assert(entries.includes('package.json'));
    assert(entries.includes('pnpm-lock.yaml'));
    assert(entries.includes('THIRD_PARTY_NOTICES.md'));
    assert.match(
      Buffer.from(zipEntries['THIRD_PARTY_NOTICES.md']).toString('utf8'),
      /Permission is hereby granted, free of charge/u,
    );
    assert.equal(packagedPackageJson.packageManager, 'pnpm@10.20.0');
    assert.equal(packagedPackageJson.scripts.test, undefined);
    assert.equal(packagedPackageJson.scripts['test:run'], undefined);
    assert.equal(packagedPackageJson.scripts['font:subset:beginner-guide'], undefined);
    assert.equal(packagedPackageJson.devDependencies.vitest, undefined);
    assert.equal(packagedPackageJson.devDependencies['subset-font'], undefined);
    assert.equal(packagedPackageJson.devDependencies.react, '18.2.0');
    assert.match(packagedLockfile, /react:\n\s+specifier: 18\.2\.0/u);
    assert.match(packagedLockfile, /react-dom:\n\s+specifier: 18\.2\.0/u);
    assert(entries.includes('src/prototypes/annotation-demo/annotation-source.json'));
    assert(entries.includes('src/prototypes/annotation-demo/.spec/spec.md'));
    assert(!entries.includes('src/prototypes/annotation-demo/.spec/implementation.md'));
    assert(entries.includes('src/prototypes/beginner-guide/index.tsx'));
    assert(!entries.includes('src/prototypes/beginner-guide/annotation-source.json'));
    assert(entries.includes('src/prototypes/beginner-guide/.spec/spec.html'));
    assert(entries.includes('src/prototypes/beginner-guide/.spec/spec.md'));
    assert(entries.includes('src/prototypes/beginner-guide/canvas.excalidraw'));
    assert(entries.some((entry) => entry.startsWith('src/prototypes/beginner-guide/canvas-assets/')));
    assert(!entries.some((entry) => entry.startsWith('src/prototypes/beginner-guide/.spec/acp/')));
    assert(!entries.includes('src/prototypes/beginner-guide/.spec/prototype-comments.json'));
    assert(!entries.includes('src/prototypes/beginner-guide/.spec/prototype-review.md'));
    assert(!entries.includes('src/prototypes/touch-and-talk-annotation-demo/annotation-source.json'));
    assert(entries.includes('src/prototypes/touch-and-talk-annotation-demo/.spec/spec.md'));
    assert(!entries.some((entry) => entry.startsWith('src/prototypes/dev-only/')));
    assert(!entries.includes('src/prototypes/beginner-guide/TsangerJinKai02-W04.ttf'));
    assert(entries.includes('src/prototypes/beginner-guide/TsangerJinKai02-W04.subset.woff2'));
    assert(!entries.some((entry) => entry.startsWith('tests/')));
    assert(!entries.some((entry) => /\.test\.[^/]+$/u.test(entry)));
    assert(entries.includes('scripts/build-all.js'));
    assert(entries.includes('scripts/capture-theme-homepage.mjs'));
    assert(entries.includes('scripts/capture-theme-source.mjs'));
    assert(entries.includes('scripts/utils/runtime.mjs'));
    assert(!entries.includes('scripts/collect-mobile-theme-screenshots.mjs'));
    assert(!entries.includes('scripts/subset-beginner-guide-fonts.mjs'));
    assert(!entries.includes('scripts/capture-theme-homepage.test.mjs'));
    assert(!entries.includes('scripts/smoke-preview-routes.mjs'));
    assert(!entries.some((entry) => entry.startsWith('.git/')));
    assert(!entries.includes('.DS_Store'));
    assert(!entries.includes('src/resources/.DS_Store'));
    assert(!entries.some((entry) => entry.startsWith('src/resources/untitled.assets/')));
    assert(!entries.some((entry) => entry.startsWith('src/themes/trae/')));
    assert(!entries.some((entry) => entry.startsWith('src/themes/whop/')));
    assert(entries.includes('src/themes/claude/index.tsx'));
    assert(!entries.some((entry) => entry.startsWith('.drawio-tmp/')));
    assert(!entries.some((entry) => entry.startsWith('node_modules/')));
    assert(!entries.some((entry) => entry.startsWith('dist/')));
    assert(entries.includes('.agents/skills/local/SKILL.md'));
    assert(entries.includes('.claude/skills/local/SKILL.md'));
    assert(entries.includes('.agents/skills/handle-comments/SKILL.md'));
    assert(entries.includes('.claude/skills/handle-comments/SKILL.md'));
    assert(!entries.some((entry) => entry.includes('/skills/prototype-comments/')));
    assert.match(packagedGitignore, /^!\.axhub\/make\/comments\/$/mu);
    assert.match(packagedGitignore, /^!\.axhub\/make\/comments\/\*\*$/mu);
    assert.match(packagedGitignore, /^!\.axhub\/make\/comment-assets\/$/mu);
    assert.match(packagedGitignore, /^!\.axhub\/make\/comment-assets\/\*\*$/mu);
    assert(!entries.some((entry) => entry.startsWith('.trae/')));
    assert(!entries.some((entry) => entry.startsWith('.codex/')));
    assert(!entries.some((entry) => entry.startsWith('.workbuddy/')));
    assert(!entries.some((entry) => entry.startsWith('.logs/')));
    assert(!entries.some((entry) => entry.startsWith('logs/')));
    assert(!entries.some((entry) => entry.startsWith('tmp-midscene/')));
    assert(!entries.some((entry) => entry.startsWith('temp/')));
    assert(entries.includes('.axhub/make/client.json'));
    assert(entries.includes('.axhub/make/axhub.config.json'));
    assert(entries.includes('.axhub/make/README.md'));
    assert(entries.includes('.axhub/make/sidebar-tree.json'));
    assert.equal(Buffer.from(zipEntries['.axhub/make/README.md']).toString('utf8'), '# Seed Make client\n');
    assert.equal(JSON.parse(Buffer.from(zipEntries['.axhub/make/client.json']).toString('utf8')).kind, 'seed-client');
    const packagedConfig = JSON.parse(Buffer.from(zipEntries['.axhub/make/axhub.config.json']).toString('utf8'));
    assert.equal(packagedConfig.server.host, 'localhost');
    assert.equal(packagedConfig.server.lanHost, undefined);
    assert.equal(packagedConfig.cloudPublishing.s3, undefined);
    const packagedSidebar = JSON.parse(Buffer.from(zipEntries['.axhub/make/sidebar-tree.json']).toString('utf8'));
    assert.deepEqual(packagedSidebar.prototypes.map(({ itemKey }) => itemKey), [
      'prototypes/annotation-demo',
      'prototypes/beginner-guide',
      'prototypes/touch-and-talk-annotation-demo',
    ]);
    assert.deepEqual(
      packagedSidebar.themesTree.flatMap(({ children = [] }) => children.map(({ itemKey }) => itemKey)),
      ['themes/claude'],
    );
    assert(!entries.some((entry) => entry.startsWith('template-seed/')));
    assert(!entries.includes('.axhub/make/project.json'));
    assert(!entries.includes('.axhub/make/entries.json'));
    assert(!entries.includes('.axhub/make/.dev-server-info.json'));
    assert(!entries.some((entry) => entry.startsWith('.axhub/make/sessions/')));
    assert(!entries.some((entry) => entry.startsWith('.axhub/make/exports/')));
    assert(!entries.some((entry) => entry.startsWith('.axhub/make/edit-history/')));
    assert(!entries.some((entry) => entry.startsWith('.axhub/make/comments/')));
    assert(!entries.some((entry) => entry.startsWith('.axhub/make/comment-assets/')));
    assert(!entries.some((entry) => entry.startsWith('.axhub/sessions/')));
    assert(!entries.some((entry) => entry.startsWith('src/resources/prd/')));
    assert(!entries.includes('src/prototypes/beginner-guide/.spec/reviews/config.json'));
  });

  it('rejects make client template zips with local machine paths', async () => {
    const sourceRoot = createTempRoot('axhub-release-template-leak-source-');
    const outputRoot = createTempRoot('axhub-release-template-leak-output-');
    const clientRoot = path.join(sourceRoot, 'client');
    writeFile(path.join(clientRoot, 'package.json'), '{"name":"@axhub/make-client"}\n');
    writeMinimalTemplateAssembly(clientRoot, ['package.json', 'leaked-path.js']);
    writeFile(
      path.join(clientRoot, 'leaked-path.js'),
      `export const leakedPath = "/${'Users'}/builder/project";\n`,
    );

    assert.throws(
      () => releaseMake.createMakeClientTemplateZip({
        sourceClientDir: clientRoot,
        outputDir: outputRoot,
      }),
      /local machine path/,
    );
  });

  it('exposes only the npm beta release script from the workspace root', () => {
    const rootPackageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

    assert.equal(rootPackageJson.scripts['release:make:npm:latest'], undefined);
    assert.equal(
      rootPackageJson.scripts['release:make:npm:prepare'],
      'node scripts/release-make.mjs --skip-github --prepare-only',
    );
    assert.equal(
      rootPackageJson.scripts['release:make:npm:beta'],
      'node scripts/release-make.mjs --skip-github --npm-tag beta',
    );
    assert.equal(
      rootPackageJson.scripts['release:make-client-template:prepare'],
      'node scripts/release-make.mjs --template-only --prepare-only',
    );
    assert.equal(
      rootPackageJson.scripts['release:make-client-template'],
      'node scripts/release-make.mjs --template-only',
    );
  });

  it('keeps the source workspace package private so npm publishing uses the staged package', () => {
    const sourcePackageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

    assert.equal(sourcePackageJson.private, true);
  });

  it('defaults publish commands to the beta npm tag', () => {
    const commands = releaseMake.publishCommands({
      packageName: '@axhub/make',
      version: '1.2.3',
      tagName: 'make-v1.2.3',
      npmPackageDir: '/tmp/axhub-make-npm-package',
      releaseAssets: [],
    }, {
      githubRepo: 'lintendo/Axhub-Make',
    });

    assert.deepEqual(commands.npmArgs, [
      'publish',
      '/tmp/axhub-make-npm-package',
      '--access',
      'public',
      '--tag',
      'beta',
    ]);
  });

  it('skips platform release artifacts for npm-only releases', () => {
    assert.equal(releaseMake.shouldBuildPlatformArtifacts({ skipGithub: true }), false);
    assert.equal(releaseMake.shouldBuildPlatformArtifacts({ skipGithub: false }), true);
    assert.equal(releaseMake.shouldBuildPlatformArtifacts({}), true);
    assert.deepEqual(
      releaseMake.releaseToolsForOptions({ skipGithub: true }),
      ['pnpm', 'npm', 'bun'],
    );
    assert.deepEqual(
      releaseMake.releaseToolsForOptions({ skipGithub: false }),
      ['pnpm', 'npm', 'bun', 'zip'],
    );
    assert.deepEqual(releaseMake.releaseToolCheckArgs('pnpm'), ['--version']);
    assert.deepEqual(releaseMake.releaseToolCheckArgs('npm'), ['--version']);
    assert.deepEqual(releaseMake.releaseToolCheckArgs('bun'), ['--version']);
    assert.deepEqual(releaseMake.releaseToolCheckArgs('zip'), ['-v']);
  });

  it('keeps make publish source independent from the project-core workspace package', () => {
    const sourcePackageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

    assert.equal(sourcePackageJson.dependencies?.['@axhub/project-core'], undefined);
    assert.equal(sourcePackageJson.devDependencies?.['@axhub/project-core'], undefined);
  });

  it('uses the vendored canvas fig sync script in the standalone workspace', () => {
    const releaseSource = fs.readFileSync(path.resolve('scripts/release-make.mjs'), 'utf8');

    assert.match(releaseSource, /vendor\/axhub-export-core\/scripts\/canvas-fig-sync\.mjs/u);
    assert.doesNotMatch(releaseSource, /packages\/axhub-export-core\/scripts\/canvas-fig-sync\.mjs/u);
  });

  it('keeps vendored source package TypeScript deprecation config compatible with the release toolchain', () => {
    const releaseTypescriptPackageJson = JSON.parse(
      fs.readFileSync(
        createRequire(import.meta.url).resolve('typescript/package.json'),
        'utf8',
      ),
    );
    const releaseTypescriptMajor = Number.parseInt(
      String(releaseTypescriptPackageJson.version).split('.')[0] || '',
      10,
    );
    assert(Number.isInteger(releaseTypescriptMajor), 'release TypeScript major version must be detectable');

    const exportCoreTsconfigPath = path.resolve('vendor/axhub-export-core/tsconfig.json');
    const sourceExportCoreTsconfigPath = findAncestorFile('packages/axhub-export-core/tsconfig.json');
    const tsconfigPath = fs.existsSync(exportCoreTsconfigPath)
      ? exportCoreTsconfigPath
      : sourceExportCoreTsconfigPath;
    if (!tsconfigPath) {
      return;
    }

    const exportCoreTsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const ignoreDeprecations = exportCoreTsconfig.compilerOptions?.ignoreDeprecations;
    if (ignoreDeprecations === undefined) {
      return;
    }

    const ignoreDeprecationsMajor = Number.parseInt(String(ignoreDeprecations).split('.')[0] || '', 10);
    assert(Number.isInteger(ignoreDeprecationsMajor), 'ignoreDeprecations must start with a major version');
    assert(
      ignoreDeprecationsMajor <= releaseTypescriptMajor,
      `ignoreDeprecations ${ignoreDeprecations} is not accepted by release TypeScript ${releaseTypescriptPackageJson.version}`,
    );
  });

  it('bundles the canvas fig sync release script with runtime dependencies', () => {
    const args = releaseMake.createCanvasFigSyncBundleArgs(
      '/tmp/canvas-fig-sync.mjs',
      '/repo/node_modules/axhub-export-core/scripts/canvas-fig-sync.mjs',
    );

    assert.deepEqual(args, [
      'build',
      '/repo/node_modules/axhub-export-core/scripts/canvas-fig-sync.mjs',
      '--target=node',
      '--format=esm',
      '--packages=bundle',
      '--outfile',
      '/tmp/canvas-fig-sync.mjs',
    ]);
  });

  it('copies only explicit admin runtime assets into the admin build', () => {
    const viteConfigSource = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');

    assert.match(viteConfigSource, /ADMIN_RUNTIME_ASSETS/u);
    assert.match(viteConfigSource, /assets\/auto-debug-client\.js/u);
    assert.doesNotMatch(viteConfigSource, /copyDirRecursive\(srcDir, adminOutDir\)/u);
  });

  it('builds only the admin app when preparing npm release artifacts', () => {
    const releaseSource = fs.readFileSync(path.resolve('scripts/release-make.mjs'), 'utf8');

    assert.match(releaseSource, /run\('pnpm', \['--filter', '@axhub\/make', 'admin:build'\]\)/u);
    assert.doesNotMatch(releaseSource, /run\('pnpm', \['--filter', '@axhub\/make', 'build'\]\)/u);
  });

  it('keeps Vite build tooling out of the static npm server bundle graph', () => {
    const onDemandBuildSource = fs.readFileSync(path.resolve('src/server/onDemandBuild.ts'), 'utf8');
    const viteDevServerSource = fs.readFileSync(path.resolve('src/server/viteDevServer.ts'), 'utf8');
    const canvasHotUpdateFilterSource = fs.readFileSync(path.resolve('src/server/canvasHotUpdateFilter.ts'), 'utf8');

    for (const source of [onDemandBuildSource, viteDevServerSource, canvasHotUpdateFilterSource].map(stripTypeImportQueries)) {
      assert.doesNotMatch(source, /from ['"]vite['"]/u);
      assert.doesNotMatch(source, /import\(['"]vite['"]\)/u);
      assert.doesNotMatch(source, /from ['"]@vitejs\/plugin-react['"]/u);
      assert.doesNotMatch(source, /from ['"]@tailwindcss\/vite['"]/u);
    }
    assert.match(onDemandBuildSource, /importPackageFromProject/u);
    assert.match(viteDevServerSource, /importRuntimePackage/u);
  });

  it('packages make client runtime patch sources used by dev ensure', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

    for (const runtimePatchFile of [
      'client/vite-plugins/clientPreviewPlugin.ts',
      'client/vite-plugins/canvasHotUpdateFilter.ts',
      'client/vite-plugins/utils/moduleSpecifierQuery.ts',
      'client/vite-plugins/utils/previewTitle.ts',
    ]) {
      assert.ok(packageJson.files.includes(runtimePatchFile), runtimePatchFile);
    }
  });

  it('packages the shared make client template defaults used by the server runtime', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

    assert.ok(
      packageJson.files.includes('src/common/makeClientTemplate.ts'),
      'src/common/makeClientTemplate.ts',
    );
  });

  it('does not resolve source-only files at runtime from the bundled npm server', () => {
    const runtimeFiles = [
      path.resolve('bin/cli.mjs'),
      ...listSourceFiles(path.resolve('src/server')),
    ];
    const sourceOnlyResolvePattern = /\.resolve\(['"][./][^'"]+\.(?:ts|tsx|mts|cts)['"]\)/u;

    for (const filePath of runtimeFiles) {
      const source = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(source, sourceOnlyResolvePattern, path.relative(process.cwd(), filePath));
    }
  });

  it('creates a public dependency-free npm package manifest with all CLI aliases', () => {
    const packageJson = releaseMake.createPublishPackageJson({
      name: '@axhub/make',
      version: '1.2.3',
      description: 'Axhub Make test package',
    });

    assert.equal(packageJson.name, '@axhub/make');
    assert.equal(packageJson.version, '1.2.3');
    assert.equal(packageJson.private, undefined);
    assert.deepEqual(Object.keys(packageJson.bin), ['make', 'axhub-make', 'make-server']);
    assert.deepEqual(packageJson.bin, {
      make: './bin/cli.mjs',
      'axhub-make': './bin/cli.mjs',
      'make-server': './bin/cli.mjs',
    });
    assert.equal(packageJson.files.includes('assets'), false);
    assert.equal(packageJson.files.includes('README.md'), false);
    assert.deepEqual(packageJson.engines, { node: '>=20' });
    assert.deepEqual(packageJson.publishConfig, { access: 'public' });
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      assert.equal(packageJson[field], undefined);
    }
  });

  it('rejects staged npm packages that are not self-contained npx artifacts', () => {
    const root = createTempRoot('axhub-release-make-guard-');
    const packageDir = path.join(root, 'npm-package');
    const validPackageJson = releaseMake.createPublishPackageJson({
      name: '@axhub/make',
      version: '1.2.3',
      description: 'Axhub Make test package',
    });
    const validPackInfo = {
      size: 34 * 1024 * 1024,
      unpackedSize: 79 * 1024 * 1024,
      entryCount: 6,
      files: [
        { path: 'package.json', size: 400, mode: 0o644 },
        { path: 'bin/cli.mjs', size: 180, mode: 0o755 },
        { path: 'dist/server/cli.mjs', size: 1000, mode: 0o644 },
        { path: 'dist/server/converters/ai-studio-converter.mjs', size: 100, mode: 0o644 },
        { path: 'dist/server/converters/axure-html-converter.mjs', size: 100, mode: 0o644 },
        { path: 'dist/server/converters/figma-make-converter.mjs', size: 100, mode: 0o644 },
        { path: 'dist/server/converters/stitch-converter.mjs', size: 100, mode: 0o644 },
        { path: 'dist/server/converters/v0-converter.mjs', size: 100, mode: 0o644 },
        { path: 'dist/admin/index.html', size: 100, mode: 0o644 },
        { path: 'dist/admin/assets/favicon.ico', size: 100, mode: 0o644 },
        { path: 'dist/admin/assets/axure-export-runtime.js', size: 100, mode: 0o644 },
        { path: 'dist/admin/auto-debug-client.js', size: 100, mode: 0o644 },
        { path: 'scripts/canvas-fig-sync.mjs', size: 100, mode: 0o755 },
      ],
    };

    writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify(validPackageJson, null, 2)}\n`);
    writeFile(path.join(packageDir, 'scripts/canvas-fig-sync.mjs'), 'console.log("bundled canvas fig sync");\n');

    assert.doesNotThrow(() => releaseMake.assertNpmPackageShape({
      dryRunInfo: [validPackInfo],
      packageDir,
    }));

    writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify({
      ...validPackageJson,
      bin: {
        'axhub-make': './bin/cli.mjs',
        make: './bin/cli.mjs',
        'make-server': './bin/cli.mjs',
      },
    }, null, 2)}\n`);
    assert.throws(
      () => releaseMake.assertNpmPackageShape({
        dryRunInfo: [validPackInfo],
        packageDir,
      }),
      /npm package bin aliases must be exactly make, axhub-make, make-server in that order/u,
    );
    writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify(validPackageJson, null, 2)}\n`);

    writeFile(
      path.join(packageDir, 'scripts/canvas-fig-sync.mjs'),
      'import { decodeBinarySchema } from "kiwi-schema/kiwi-esm.js";\nimport { inflateRaw } from "pako/dist/pako.esm.mjs";\n',
    );
    assert.throws(
      () => releaseMake.assertNpmPackageShape({ dryRunInfo: [validPackInfo], packageDir }),
      /must be bundled and must not import external canvas fig dependencies/,
    );
    writeFile(path.join(packageDir, 'scripts/canvas-fig-sync.mjs'), 'console.log("bundled canvas fig sync");\n');

    writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify({
      ...validPackageJson,
      dependencies: { '@axhub/project-core': 'workspace:*' },
    }, null, 2)}\n`);
    assert.throws(
      () => releaseMake.assertNpmPackageShape({ dryRunInfo: [validPackInfo], packageDir }),
      /must not include dependencies/,
    );

    writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify(validPackageJson, null, 2)}\n`);
    assert.throws(
      () => releaseMake.assertNpmPackageShape({
        dryRunInfo: [{ ...validPackInfo, files: validPackInfo.files.filter((file) => file.path !== 'dist/admin/index.html') }],
        packageDir,
      }),
      /missing required file: dist\/admin\/index\.html/,
    );
    assert.throws(
      () => releaseMake.assertNpmPackageShape({
        dryRunInfo: [{ ...validPackInfo, files: validPackInfo.files.filter((file) => file.path !== 'dist/server/converters/figma-make-converter.mjs') }],
        packageDir,
      }),
      /missing required file: dist\/server\/converters\/figma-make-converter\.mjs/,
    );
    assert.throws(
      () => releaseMake.assertNpmPackageShape({
        dryRunInfo: [{
          ...validPackInfo,
          files: validPackInfo.files.filter((file) => file.path !== 'dist/admin/assets/axure-export-runtime.js'),
        }],
        packageDir,
      }),
      /missing required file: dist\/admin\/assets\/axure-export-runtime\.js/u,
    );

    for (const pathName of [
      'src/server/cli.ts',
      'dist/server/__tests__/cli.test.mjs',
      'dist/server/cli.test.mjs',
      'coverage/index.html',
      'node_modules/example/index.js',
      '.next/required-server-files.json',
      'dist/server/.next/required-server-files.js',
      '.DS_Store',
      'dist/admin/.DS_Store',
      '.env',
      '.local/notes.md',
      'dist/server/tsconfig.node.tsbuildinfo',
      'dist/server/vite.config.ts.timestamp-123456.mjs',
      'README.md',
      'assets/auto-debug-client.js',
      'assets/images/make-demo-prd-annotation.png',
      'dist/admin/images/make-demo-prd-annotation.png',
    ]) {
      assert.throws(
        () => releaseMake.assertNpmPackageShape({
          dryRunInfo: [{ ...validPackInfo, files: [...validPackInfo.files, { path: pathName, size: 1, mode: 0o644 }] }],
          packageDir,
        }),
        new RegExp(`must not include ${pathName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`),
      );
    }

    assert.throws(
      () => releaseMake.assertNpmPackageShape({
        dryRunInfo: [{ ...validPackInfo, size: 36 * 1024 * 1024 }],
        packageDir,
      }),
      /packed size/,
    );

    writeFile(path.join(packageDir, 'dist/server/cli.mjs'), `const leakedPath = "/${'Users'}/builder/acp-ui";\n`);
    assert.throws(
      () => releaseMake.assertNpmPackageShape({ dryRunInfo: [validPackInfo], packageDir }),
      /local machine path/,
    );
  });

  it('sanitizes bundled local machine paths without changing file size', () => {
    const root = createTempRoot('axhub-release-bundle-sanitize-');
    const bundlePath = path.join(root, 'cli.mjs');
    const posixPath = `/${['Users', 'builder', 'repo', 'node_modules', 'typescript', 'lib'].join('/')}`;
    const windowsPath = ['C:', 'Users', 'builder', 'repo', 'node_modules', 'typescript', 'lib', 'typescript.js'].join('\\\\');
    const source = `var __dirname = "${posixPath}";\nvar __filename = "${windowsPath}";\n`;
    writeFile(bundlePath, source);

    const result = releaseMake.sanitizeLocalMachinePathsInFile(bundlePath);
    const sanitized = fs.readFileSync(bundlePath, 'utf8');

    assert.equal(result.changed, true);
    assert.equal(Buffer.byteLength(sanitized), Buffer.byteLength(source));
    assert.doesNotMatch(sanitized, /\/Volumes\//u);
    assert.doesNotMatch(sanitized, /[A-Za-z]:\\Users\\/u);
  });

  it('externalizes project-side build toolchain packages from the bundled npm server', () => {
    const args = releaseMake.createServerBundleArgs('/tmp/axhub-make-server.mjs', '/repo/src/server/cli.ts');

    for (const packageName of ['vite', '@vitejs/plugin-react', '@tailwindcss/vite']) {
      assert(args.includes('--external'), `missing --external for ${packageName}`);
      assert(args.includes(packageName), `missing external package ${packageName}`);
    }
  });

  it('externalizes project-side build toolchain packages from platform executables', () => {
    const args = releaseMake.createExecutableBundleArgs(
      { bunTarget: 'bun-darwin-arm64' },
      '/tmp/axhub-make',
      '/tmp/bun-cli-entry.mjs',
    );

    for (const packageName of ['vite', '@vitejs/plugin-react', '@tailwindcss/vite']) {
      assert(args.includes('--external'), `missing --external for ${packageName}`);
      assert(args.includes(packageName), `missing external package ${packageName}`);
    }
  });

  it('re-signs macOS Bun executables after sanitizing local machine paths', () => {
    const calls = [];
    const executablePath = '/tmp/axhub-make';

    const result = releaseMake.finalizeExecutableBundle(
      { bunTarget: 'bun-darwin-arm64', executableName: 'axhub-make' },
      executablePath,
      {
        sanitizeFile: (filePath) => {
          calls.push(['sanitize', [filePath]]);
          return { filePath, changed: true };
        },
        runCommand: (command, args) => {
          calls.push([command, args]);
        },
      },
    );

    assert.deepEqual(calls, [
      ['sanitize', [executablePath]],
      ['codesign', ['--force', '--sign', '-', executablePath]],
    ]);
    assert.equal(result.codesigned, true);
  });

  it('does not codesign Windows Bun executables after sanitizing local machine paths', () => {
    const calls = [];
    const executablePath = '/tmp/axhub-make.exe';

    const result = releaseMake.finalizeExecutableBundle(
      { bunTarget: 'bun-windows-x64', executableName: 'axhub-make.exe' },
      executablePath,
      {
        sanitizeFile: (filePath) => {
          calls.push(['sanitize', [filePath]]);
          return { filePath, changed: true };
        },
        runCommand: (command, args) => {
          calls.push([command, args]);
        },
      },
    );

    assert.deepEqual(calls, [
      ['sanitize', [executablePath]],
    ]);
    assert.equal(result.codesigned, false);
  });

  it('builds npm exec smoke args that select the staged tarball when its path contains spaces', () => {
    assert.deepEqual(
      releaseMake.createNpmExecSmokeArgs('/tmp/axhub release/axhub-make-1.2.3.tgz'),
      [
        'exec',
        '--yes',
        '--package=/tmp/axhub release/axhub-make-1.2.3.tgz',
        '--',
        'make',
        '--help',
      ],
    );
  });

  it('launches the released CLI smoke probe without a legacy project-root argument', () => {
    const launch = releaseMake.createServerProbeLaunchOptions({
      port: 51728,
      adminRoot: '/tmp/axhub-make-admin',
      makeHomeDir: '/tmp/axhub-make-state-home',
      canvasFigSyncPath: '/tmp/canvas-fig-sync.mjs',
      env: {
        AXHUB_MAKE_HOME_DIR: '/tmp/should-not-escape-smoke-isolation',
        CUSTOM_SMOKE_ENV: 'enabled',
      },
    });

    assert.deepEqual(launch.args, [
      '--host',
      '127.0.0.1',
      '--port',
      '51728',
      '--admin-root',
      '/tmp/axhub-make-admin',
    ]);
    assert.deepEqual(launch.env, {
      AXHUB_MAKE_CANVAS_FIG_SYNC: '/tmp/canvas-fig-sync.mjs',
      AXHUB_MAKE_HOME_DIR: '/tmp/axhub-make-state-home',
      CUSTOM_SMOKE_ENV: 'enabled',
    });
  });

  it('runs the installed package CLI through Node instead of a Windows cmd shim', () => {
    assert.deepEqual(
      releaseMake.createInstalledNpmBinCommand('/tmp/axhub make install', 'axhub-make', {
        platform: 'win32',
        nodeExecutable: 'node',
      }),
      {
        command: 'node',
        args: [path.join('/tmp/axhub make install', 'node_modules', '@axhub', 'make', 'bin/cli.mjs')],
      },
    );
  });

  it('exercises comment asset persistence from the installed npm CLI smoke', () => {
    const releaseSource = fs.readFileSync(path.resolve('scripts/release-make.mjs'), 'utf8');

    assert.match(releaseSource, /async function exerciseCommentAssetLifecycle\(/u);
    assert.match(releaseSource, /\/api\/document-comments/u);
    assert.match(releaseSource, /hydrateImages=1/u);
    assert.match(releaseSource, /reason: 'clear'/u);
    assert.match(releaseSource, /Comment asset smoke cleanup did not remove/u);
  });

  it('omits OpenCode WebUI static assets from release packaging while disabled', () => {
    const root = createTempRoot('axhub-release-make-opencode-disabled-');
    const releaseAdminDir = path.join(root, 'release-admin');
    const npmPackageDistDir = path.join(root, 'npm-package', 'dist');
    const artifactDir = path.join(root, 'artifact');

    assert.equal(releaseMake.copyOpenCodeWebUiToRelease({ releaseAdminDir }), null);
    assert.equal(releaseMake.copyOpenCodeWebUiToNpmPackage({ releaseAdminDir, npmPackageDistDir }), null);
    assert.equal(releaseMake.copyOpenCodeWebUiToPlatformArtifact({ releaseAdminDir, artifactDir }), null);
    assert.equal(fs.existsSync(path.join(root, 'opencode-webui')), false);
    assert.equal(fs.existsSync(path.join(npmPackageDistDir, 'opencode-webui')), false);
    assert.equal(fs.existsSync(path.join(artifactDir, 'opencode-webui')), false);
  });
});
