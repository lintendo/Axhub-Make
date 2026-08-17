import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { __onDemandBuildTestUtils, buildOnDemand } from '../onDemandBuild.ts';

const tempRoots: string[] = [];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function createTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-on-demand-build-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'entry.tsx'),
    [
      'import React from "react";',
      'export default function Entry() {',
      '  return React.createElement("div", { className: "entry" }, "Hello");',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  return root;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeFakePackage(projectRoot: string, packageName: string, packageJson: Record<string, unknown>, content: string) {
  const packageRoot = path.join(projectRoot, 'node_modules', ...packageName.split('/'));
  writeJson(path.join(packageRoot, 'package.json'), {
    name: packageName,
    version: '0.0.0-test',
    ...packageJson,
  });
  writeFile(path.join(packageRoot, String(packageJson.main || 'index.js')), content);
}

function writeFakeBuildToolchain(projectRoot: string) {
  writeFakePackage(
    projectRoot,
    'vite',
    { main: 'index.cjs' },
    [
      'module.exports.defineConfig = (config) => config;',
      'Object.assign(module.exports, { mergeConfig: (config) => config });',
      'const asyncFunctions = ["build"];',
      'asyncFunctions.forEach((name) => {',
      '  module.exports[name] = async () => ({',
      '    output: [{ type: "chunk", fileName: "entry.js", code: "var UserComponent = function Entry(){ return \\"Hello\\"; };" }],',
      '  });',
      '});',
      '',
    ].join('\n'),
  );
  writeFakePackage(
    projectRoot,
    '@vitejs/plugin-react',
    { type: 'module', main: 'index.js' },
    'export default function react() { return { name: "fake-react" }; }\n',
  );
  writeFakePackage(
    projectRoot,
    '@tailwindcss/vite',
    { type: 'module', main: 'index.js' },
    'export default function tailwindcss() { return { name: "fake-tailwind" }; }\n',
  );
}

function writeFakeAnnotationRuntimePackage(projectRoot: string) {
  writeFakePackage(
    projectRoot,
    '@axhub/annotation',
    { type: 'module', main: 'index.js' },
    [
      'import React from "react";',
      'export function AnnotationViewer() {',
      '  return React.createElement("div", null, "Annotation Runtime");',
      '}',
      '',
    ].join('\n'),
  );
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('buildOnDemand', () => {
  it('replaces embedded images with dimension-preserving gray SVG placeholders', () => {
    const pngHeader = Buffer.alloc(24);
    pngHeader.writeUInt32BE(640, 16);
    pngHeader.writeUInt32BE(360, 20);
    const originalDataUrl = `data:image/png;base64,${pngHeader.toString('base64')}`;

    const result = __onDemandBuildTestUtils.replaceEmbeddedImageAssets(`const image = "${originalDataUrl}";`);
    const placeholderDataUrl = result.match(/data:image\/svg\+xml;base64,[A-Za-z\d+/=]+/u)?.[0];
    const placeholderSvg = placeholderDataUrl
      ? Buffer.from(placeholderDataUrl.split(',')[1], 'base64').toString('utf8')
      : '';

    expect(result).not.toContain(originalDataUrl);
    expect(placeholderSvg).toContain('width="640" height="360"');
    expect(placeholderSvg).toContain('fill="#f2f4f7"');
  });

  it('replaces URI-encoded SVG images while preserving their viewBox ratio', () => {
    const originalDataUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"></svg>')}`;

    const result = __onDemandBuildTestUtils.replaceEmbeddedImageAssets(`const image = "${originalDataUrl}";`);
    const placeholderDataUrl = result.match(/data:image\/svg\+xml;base64,[A-Za-z\d+/=]+/u)?.[0];
    const placeholderSvg = placeholderDataUrl
      ? Buffer.from(placeholderDataUrl.split(',')[1], 'base64').toString('utf8')
      : '';

    expect(result).not.toContain(originalDataUrl);
    expect(placeholderSvg).toContain('width="300" height="120"');
  });

  it('normalizes named exports from CJS module default objects', () => {
    const build = () => ({ output: [] });

    expect(__onDemandBuildTestUtils.getPackageExport({ default: { build } }, 'build', 'vite')).toBe(build);
    expect(__onDemandBuildTestUtils.getPackageExport({ build }, 'build', 'vite')).toBe(build);
  });

  it('builds a simple entry with the workspace Vite toolchain', async () => {
    const root = createTempProject();

    const result = await buildOnDemand(root, path.join(root, 'src', 'entry.tsx'));

    expect(result.jsCode).toContain('UserComponent');
    expect(result.jsCode).toContain('Hello');
    expect(result.metadata.usesAnnotationRuntime).toBe(false);
  });

  it('includes same-directory style.css even when the entry does not import it', async () => {
    const root = createTempProject();
    writeFile(
      path.join(root, 'src', 'style.css'),
      [
        '.entry {',
        '  color: rgb(12 34 56);',
        '}',
        '',
      ].join('\n'),
    );

    const result = await buildOnDemand(root, path.join(root, 'src', 'entry.tsx'));

    expect(result.cssText).toContain('.entry');
    expect(result.cssText).toContain('rgb(12 34 56)');
  });

  it('reports when an entry bundles the annotation runtime', async () => {
    const root = createTempProject();
    writeFakeAnnotationRuntimePackage(root);
    writeFile(
      path.join(root, 'src', 'entry.tsx'),
      [
        'import React from "react";',
        'import { AnnotationViewer } from "@axhub/annotation";',
        'export default function Entry() {',
        '  return React.createElement(AnnotationViewer, { source: { format: "axhub-annotation-source", data: { version: 1, nodes: [] } } });',
        '}',
        '',
      ].join('\n'),
    );

    const result = await buildOnDemand(root, path.join(root, 'src', 'entry.tsx'));

    expect(result.metadata.usesAnnotationRuntime).toBe(true);
  });

  it('loads Vite build when package resolution points at a CJS entry with dynamic exports', async () => {
    const root = createTempProject();
    writeFakeBuildToolchain(root);

    const result = await buildOnDemand(root, path.join(root, 'src', 'entry.tsx'));

    expect(result.jsCode).toContain('UserComponent');
    expect(result.jsCode).toContain('Hello');
  });

  it('uses the annotation-source markdown inlining plugin for export builds', async () => {
    const root = createTempProject();
    writeFakePackage(
      root,
      'vite',
      { main: 'index.cjs' },
      [
        'module.exports.defineConfig = (config) => config;',
        'Object.assign(module.exports, { mergeConfig: (config) => config });',
        'module.exports.build = async (config) => {',
        '  const pluginNames = (config.plugins || []).map((plugin) => plugin && plugin.name);',
        '  if (!pluginNames.includes("axhub-annotation-source-markdown")) {',
        '    throw new Error(`missing annotation source markdown plugin: ${pluginNames.join(",")}`);',
        '  }',
        '  return {',
        '    output: [{ type: "chunk", fileName: "entry.js", code: "var UserComponent = function Entry(){ return \\"Hello\\"; };" }],',
        '  };',
        '};',
        '',
      ].join('\n'),
    );
    writeFakePackage(
      root,
      '@vitejs/plugin-react',
      { type: 'module', main: 'index.js' },
      'export default function react() { return { name: "fake-react" }; }\n',
    );
    writeFakePackage(
      root,
      '@tailwindcss/vite',
      { type: 'module', main: 'index.js' },
      'export default function tailwindcss() { return { name: "fake-tailwind" }; }\n',
    );

    const result = await buildOnDemand(root, path.join(root, 'src', 'entry.tsx'));

    expect(result.jsCode).toContain('UserComponent');
  });

  it('works from a plain tsx process where Vite resolves to its CJS entry', () => {
    const root = createTempProject();
    const scriptPath = path.join(root, 'run-on-demand-build.ts');
    writeFile(scriptPath, [
      `import { buildOnDemand } from ${JSON.stringify(pathToFileImport(path.resolve(repoRoot, 'src/server/onDemandBuild.ts')))};`,
      'void (async () => {',
      `  const result = await buildOnDemand(${JSON.stringify(root)}, ${JSON.stringify(path.join(root, 'src', 'entry.tsx'))});`,
      '  if (!result.jsCode.includes("Hello")) throw new Error("missing built component text");',
      '})();',
      '',
    ].join('\n'));

    const result = spawnSync('pnpm', ['--filter', '@axhub/make', 'exec', 'tsx', scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 20_000);
});

function pathToFileImport(filePath: string) {
  return `file://${filePath}`;
}
