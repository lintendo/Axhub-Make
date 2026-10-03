import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');

describe('make-project client-only defaults', () => {
  it('does not load server-owned management plugins from the active Vite config', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');
    const serverOwnedPluginNames = [
      'serveAdminPlugin',
      'fileSystemApiPlugin',
      'dataManagementApiPlugin',
      'mediaManagementApiPlugin',
      'docsApiPlugin',
      'docsImportApiPlugin',
      'templatesApiPlugin',
      'themesApiPlugin',
      'sourceApiPlugin',
      'gitVersionApiPlugin',
      'axureBridgeProxyPlugin',
      'exportHtmlApiPlugin',
      'exportImageProxyPlugin',
      'aiCliPlugin',
      'canvasApiPlugin',
      'annotationApiPlugin',
      'uploadDocsApiPlugin',
      'unsetReferenceApiPlugin',
    ];

    for (const pluginName of serverOwnedPluginNames) {
      expect(viteConfig).not.toContain(pluginName);
    }
    expect(viteConfig).toContain("scanProjectEntries(projectRoot, ['prototypes', 'themes'])");
    expect(viteConfig).not.toContain("'components', 'prototypes', 'themes'");
  });

  it('does not keep a src/components resource directory in the official client', () => {
    expect(fs.existsSync(path.join(appRoot, 'src/components'))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, 'src/common/side-menu/index.tsx'))).toBe(true);
  });

  it('does not expose a Vite public directory from src', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('publicDir: false');
    expect(fs.existsSync(path.join(appRoot, 'src/public'))).toBe(false);
  });

  it('does not use Vite SPA fallback for unknown resource-like paths', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("appType: 'mpa'");
  });

  it('inlines dynamic runtime modules for single-entry IIFE builds', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('inlineDynamicImports: isIifeBuild');
  });

  it('does not declare Ant Design as a client dependency or Vite prebundle', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(packageJson.dependencies ?? {}).not.toHaveProperty('antd');
    expect(packageJson.dependencies ?? {}).not.toHaveProperty('@ant-design/cssinjs');
    expect(packageJson.dependencies ?? {}).not.toHaveProperty('@ant-design/icons');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('antd');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('@ant-design/cssinjs');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('@ant-design/icons');
    expect(viteConfig).not.toContain("'antd'");
    expect(viteConfig).not.toContain("'@ant-design/cssinjs'");
    expect(viteConfig).not.toContain("'@ant-design/icons'");
  });

  it('watches annotation sources while ignoring canvas data artifacts globally', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("'**/*.assets/**'");
    expect(viteConfig).toContain("'**/*.excalidraw'");
    expect(viteConfig).not.toContain("'**/annotation-source.json'");
    expect(viteConfig).not.toContain("'**/canvas-assets/**'");
    expect(viteConfig).not.toContain("'**/prototypes/**/canvas-assets/**'");
    expect(viteConfig).not.toContain("'**/prototypes/**/canvas.excalidraw'");
    expect(viteConfig).not.toContain("'**/prototypes/**/spec.md'");
    expect(viteConfig).not.toContain("'**/prototypes/**/prd.md'");
  });

  it('ignores generated make runtime files in the Vite watcher', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("'**/.axhub/make/**'");
    expect(viteConfig).not.toContain("'**/.axhub/make/.dev-server-info.json'");
  });

  it('allows Vite to choose the next available dev port from the official default', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('port: OFFICIAL_CLIENT_DEV_PORT');
    expect(viteConfig).toContain('strictPort: false');
    expect(viteConfig).not.toContain('strictPort: true');
  });

  it('does not terminate another process before the official client starts', () => {
    const viteConfig = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).not.toContain('releaseListeningProcessesOnPort');
    expect(viteConfig).not.toContain('portReleaseBeforeListenPlugin');
  });
});
