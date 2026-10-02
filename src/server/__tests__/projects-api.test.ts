import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getConfigPath,
  getMakeClientMarkerPath,
  getProjectEditHistoryDir,
  getProjectExportsDir,
  getProjectMetadataPath,
  getProjectRegistryPath,
  getProjectSessionsDir,
} from '../projectCore/index.ts';

import { startMakeServer } from '../index';

const tempRoots: string[] = [];

function createTempRoot(prefix = 'axhub-make-projects-api-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeMakeClientMarkerForProject(projectRoot: string, id: string, name: string) {
  writeJson(getMakeClientMarkerPath(projectRoot), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
    project: { id, name },
  });
}

function writeMakeClientPackageForProject(projectRoot: string) {
  writeJson(path.join(projectRoot, 'package.json'), {
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
}

function writeGeneratedPlaceholderPrototype(
  prototypesDir: string,
  name: string,
) {
  const targetDir = path.join(prototypesDir, name);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'index.tsx'), `/**
 * @name 未命名
 */
import React from 'react';
import './style.css';

const displayName = "未命名";

export default function Placeholder() {
    return (
        <main className="placeholder-empty-page" aria-label={displayName}>
            <p>{displayName}，打开左侧默认引导页继续创建。</p>
        </main>
    );
}
`, 'utf8');
}

function writeProjectMetadata(projectRoot: string, overrides: Record<string, unknown> = {}) {
  const docPath = path.join(projectRoot, 'src', 'resources', 'spec.md');
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, '# Spec\n', 'utf8');
  writeJson(getProjectMetadataPath(projectRoot), {
    schemaVersion: 1,
    project: { id: path.basename(projectRoot), name: path.basename(projectRoot) },
    resources: {
      prototypes: [
        {
          id: 'home',
          name: 'home',
          title: 'Home',
          clientUrl: 'http://localhost:3000/home',
        },
      ],
      themes: [{ id: 'theme-a', name: 'theme-a' }],
    },
    navigation: { prototypes: ['home'] },
    orders: { themes: ['theme-a'] },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: false,
      multiDevicePreview: true,
    },
    ...overrides,
  });
  return { docPath };
}

async function startTestServer(projectRoot: string, registryHome = createTempRoot('axhub-make-projects-api-home-')) {
  return startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: getProjectRegistryPath(registryHome),
  });
}

async function registerExistingMakeProject(origin: string, projectRoot: string, expectedStatus = 201) {
  const response = await fetch(`${origin}/api/projects/make/register-existing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root: projectRoot }),
  });
  expect(response.status).toBe(expectedStatus);
  return response.json();
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('make-server project APIs', () => {
  it('rejects generic project registration because projects must be official Make clients', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const newProjectRoot = createTempRoot();
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot: defaultRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(defaultRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      const response = await fetch(`${server.origin}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'new-client',
          name: 'New Client',
          root: newProjectRoot,
        }),
      });

      const body = await response.json();

      expect(response.status).toBe(410);
      expect(body).toMatchObject({
        code: 'MAKE_CLIENT_PROJECT_REQUIRED',
      });
      expect(fs.existsSync(getProjectMetadataPath(newProjectRoot))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('rejects generic selected project registration even when metadata exists', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const selectedRoot = createTempRoot();
    writeProjectMetadata(selectedRoot, {
      project: { id: 'selected-client', name: 'Selected Client' },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot: defaultRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(defaultRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      const response = await fetch(`${server.origin}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: selectedRoot }),
      });
      const body = await response.json();

      expect(response.status).toBe(410);
      expect(body).toMatchObject({
        code: 'MAKE_CLIENT_PROJECT_REQUIRED',
      });
    } finally {
      await server.close();
    }
  });

  it('does not auto-register a metadata-only startup root', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'metadata-only-default', name: 'Metadata Only Default' },
    });
    const server = await startTestServer(defaultRoot);

    try {
      const listResponse = await fetch(`${server.origin}/api/projects`);
      const list = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(list).toEqual({
        activeProjectId: null,
        projects: [],
      });
    } finally {
      await server.close();
    }
  });

  it('does not auto-register a marker-backed startup root', async () => {
    const startupRoot = createTempRoot();
    writeMakeClientMarkerForProject(startupRoot, 'startup-client', 'Startup Client');
    writeProjectMetadata(startupRoot, {
      project: { id: 'startup-client', name: 'Startup Client' },
    });
    const server = await startTestServer(startupRoot);

    try {
      const listResponse = await fetch(`${server.origin}/api/projects`);
      const list = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(list).toEqual({
        activeProjectId: null,
        projects: [],
      });
    } finally {
      await server.close();
    }
  });

  it('keeps marker-backed startup root untouched when listing projects', async () => {
    const startupRoot = createTempRoot();
    writeMakeClientMarkerForProject(startupRoot, 'make-project', 'Axhub Make');
    writeProjectMetadata(startupRoot, {
      project: { id: 'make-project', name: 'Axhub Make' },
    });
    const markerBefore = fs.readFileSync(getMakeClientMarkerPath(startupRoot), 'utf8');
    const metadataBefore = fs.readFileSync(getProjectMetadataPath(startupRoot), 'utf8');
    const server = await startTestServer(startupRoot);

    try {
      const list = await fetch(`${server.origin}/api/projects`).then((response) => response.json());

      expect(list).toEqual({
        activeProjectId: null,
        projects: [],
      });
      expect(fs.readFileSync(getMakeClientMarkerPath(startupRoot), 'utf8')).toBe(markerBefore);
      expect(fs.readFileSync(getProjectMetadataPath(startupRoot), 'utf8')).toBe(metadataBefore);
    } finally {
      await server.close();
    }
  });

  it('ignores legacy allowLAN when exposing current project LAN access capability', async () => {
    const defaultRoot = createTempRoot();
    writeMakeClientMarkerForProject(defaultRoot, 'lan-disabled', 'LAN Disabled');
    writeMakeClientPackageForProject(defaultRoot);
    writeProjectMetadata(defaultRoot, {
      project: { id: 'lan-disabled', name: 'LAN Disabled' },
    });
    writeJson(getConfigPath(defaultRoot), {
      server: { allowLAN: false },
    });
    const server = await startTestServer(defaultRoot);

    try {
      await registerExistingMakeProject(server.origin, defaultRoot);
      const response = await fetch(`${server.origin}/api/projects/lan-disabled/resources`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.capabilities.lanAccessAllowed).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('defaults current project LAN access capability to enabled when config omits allowLAN', async () => {
    const defaultRoot = createTempRoot();
    writeMakeClientMarkerForProject(defaultRoot, 'lan-default', 'LAN Default');
    writeMakeClientPackageForProject(defaultRoot);
    writeProjectMetadata(defaultRoot, {
      project: { id: 'lan-default', name: 'LAN Default' },
    });
    const server = await startTestServer(defaultRoot);

    try {
      await registerExistingMakeProject(server.origin, defaultRoot);
      const response = await fetch(`${server.origin}/api/projects/lan-default/resources`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.capabilities.lanAccessAllowed).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('serves project resources by explicit projectId and no longer exposes unused project compatibility endpoints', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const resources = await fetch(`${server.origin}/api/projects/client-a/resources`).then((response) => response.json());
      expect(resources.project).toEqual({ id: 'client-a', name: 'Client A' });
      expect(resources.navigation).toEqual({ prototypes: ['home'] });
      expect(resources.orders).toEqual({ themes: ['theme-a'] });
      expect(resources.capabilities).toMatchObject({ quickEdit: true, axureExport: false });

      for (const url of [
        `${server.origin}/api/projects/client-a/context?projectId=client-a`,
        `${server.origin}/api/projects/client-a/navigation?tab=prototypes&projectId=client-a`,
        `${server.origin}/api/projects/client-a/orders?type=themes&projectId=client-a`,
      ]) {
        const response = await fetch(url);
        expect(response.status).toBe(404);
      }
    } finally {
      await server.close();
    }
  });

  it('reconciles project resources from the filesystem when serving resources', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const prototypesDir = path.join(projectRoot, 'content', 'prototypes');
    const docsDir = path.join(projectRoot, 'src', 'resources');
    const themesDir = path.join(projectRoot, 'content', 'themes');
    writeGeneratedPlaceholderPrototype(prototypesDir, 'draft');
    fs.mkdirSync(path.join(prototypesDir, 'fresh'), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, 'fresh', 'index.tsx'), '/**\n * @name Fresh Prototype\n */\nexport default null;\n', 'utf8');
    writeGeneratedPlaceholderPrototype(prototypesDir, 'untitled-2');
    fs.mkdirSync(path.join(prototypesDir, 'edited'), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, 'edited', 'index.tsx'), '/**\n * @name Edited Prototype\n */\nexport default null;\n', 'utf8');
    fs.mkdirSync(path.join(prototypesDir, 'placeholder-started'), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, 'placeholder-started', 'index.tsx'), '/**\n * @name Placeholder Started\n */\nexport default function WaitingGeneration() { return <main className="prototype-waiting-generation-page"><span>正在等待生成</span></main>; }\n', 'utf8');
    fs.mkdirSync(path.join(prototypesDir, 'waiting'), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, 'waiting', 'index.tsx'), '/**\n * @name Waiting Prototype\n */\nexport default function WaitingGeneration() { return <main className="prototype-waiting-generation-page"><span>正在等待生成</span></main>; }\n', 'utf8');
    fs.mkdirSync(path.join(prototypesDir, 'ready'), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, 'ready', 'index.tsx'), '/**\n * @name Ready Prototype\n */\nexport default function Ready() { return <main>Ready</main>; }\n', 'utf8');
    fs.mkdirSync(path.join(prototypesDir, 'ignored-no-entry'), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, 'ignored-no-entry', 'style.css'), '.ignored {}\n', 'utf8');
    fs.mkdirSync(path.join(docsDir, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(docsDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'fresh-theme'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'pathless-theme'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'explicit-source-theme'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'explicit-path-theme'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'explicit-file-theme'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, 'explicit-absolute-theme'), { recursive: true });
    fs.mkdirSync(path.join(themesDir, '..', 'outside-theme'), { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'nested', 'guide.md'), '# Guide Title\n\nUseful notes.\n', 'utf8');
    fs.writeFileSync(path.join(docsDir, 'templates', 'prd-template.md'), '# PRD Template\n\nDefault template body.\n', 'utf8');
    fs.writeFileSync(path.join(docsDir, 'readme.md'), '# Ignored Readme\n', 'utf8');
    fs.writeFileSync(path.join(docsDir, '.draft.md'), '# Hidden\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
      resources: {
        prototypes: [
          {
            id: 'draft',
            name: 'draft',
            title: 'Draft',
            clientUrl: 'http://localhost:3000/draft',
            placeholder: true,
          },
          {
            id: 'untitled-2',
            name: 'untitled-2',
            title: '未命名',
            clientUrl: 'http://localhost:3000/untitled-2',
            filePath: 'content/prototypes/untitled-2/index.tsx',
          },
          {
            id: 'placeholder-started',
            name: 'placeholder-started',
            title: 'Placeholder Started',
            clientUrl: 'http://localhost:3000/placeholder-started',
            filePath: 'content/prototypes/placeholder-started/index.tsx',
            placeholder: true,
          },
          {
            id: 'edited',
            name: 'edited',
            title: 'Edited',
            clientUrl: 'http://localhost:3000/edited',
            filePath: 'content/prototypes/edited/index.tsx',
            placeholder: true,
          },
          {
            id: 'ghost',
            name: 'ghost',
            title: 'Ghost',
            clientUrl: 'http://localhost:3000/ghost',
            filePath: 'content/prototypes/ghost/index.tsx',
          },
          {
            id: 'waiting',
            name: 'waiting',
            title: 'Waiting Prototype',
            clientUrl: 'http://localhost:3000/waiting',
            filePath: 'content/prototypes/waiting/index.tsx',
          },
          {
            id: 'ready',
            name: 'ready',
            title: 'Ready Prototype',
            clientUrl: 'http://localhost:3000/ready',
            filePath: 'content/prototypes/ready/index.tsx',
            generationStatus: 'waiting',
          },
        ],
        themes: [
          { id: 'missing-theme', name: 'missing-theme' },
          { id: 'pathless-theme', name: 'pathless-theme', title: 'Pathless Theme' },
          { id: '../outside-theme', name: '../outside-theme', title: 'Outside Theme' },
          { id: 'explicit-source-theme', sourcePath: 'custom/themes/source' },
          { id: 'explicit-path-theme', path: 'custom/themes/path' },
          { id: 'explicit-file-theme', filePath: 'custom/themes/file/index.tsx' },
          { id: 'explicit-absolute-theme', absoluteFilePath: path.join(projectRoot, 'custom/themes/absolute') },
        ],
      },
      navigation: { prototypes: ['draft', 'ghost'] },
      orders: {
        themes: [
          'missing-theme',
          'pathless-theme',
          '../outside-theme',
          'explicit-source-theme',
          'explicit-path-theme',
          'explicit-file-theme',
          'explicit-absolute-theme',
        ],
      },
      resourceWriteTargets: {
        prototypes: { type: 'project-relative-path', path: 'content/prototypes' },
        themes: { type: 'project-relative-path', path: 'content/themes' },
      },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(`${server.origin}/api/projects/client-a/resources`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.resources.prototypes[0]).toMatchObject({
        id: 'draft',
        placeholder: true,
        placeholderGuide: expect.objectContaining({
          kind: 'prototype-empty',
        }),
      });
      expect(body.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'untitled-2',
          placeholder: true,
          placeholderGuide: expect.objectContaining({
            kind: 'prototype-empty',
          }),
        }),
      ]));
      expect(body.resources.prototypes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'edited',
          placeholder: true,
        }),
      ]));
      const placeholderStartedPrototype = body.resources.prototypes.find((prototype: any) => prototype.id === 'placeholder-started');
      expect(placeholderStartedPrototype).toMatchObject({
        id: 'placeholder-started',
        generationStatus: 'waiting',
      });
      expect(placeholderStartedPrototype).not.toHaveProperty('placeholder');
      expect(placeholderStartedPrototype).not.toHaveProperty('placeholderGuide');
      expect(body.resources.prototypes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'ghost' }),
        expect.objectContaining({ id: 'ignored-no-entry' }),
      ]));
      expect(body.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'fresh',
          name: 'fresh',
          title: 'Fresh Prototype',
          clientUrl: '/prototypes/fresh',
          filePath: 'content/prototypes/fresh/index.tsx',
          absoluteFilePath: path.join(prototypesDir, 'fresh', 'index.tsx'),
          previewMode: 'clientRuntime',
        }),
      ]));
      expect(body.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'waiting',
          generationStatus: 'waiting',
        }),
      ]));
      const readyPrototype = body.resources.prototypes.find((prototype: any) => prototype.id === 'ready');
      expect(readyPrototype).toMatchObject({
        id: 'ready',
        title: 'Ready Prototype',
      });
      expect(readyPrototype).not.toHaveProperty('generationStatus');
      expect(body.navigation.prototypes).toEqual(['draft', 'fresh']);
      expect(body.resources.docs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'nested/guide',
          title: 'Guide Title',
          path: 'nested/guide.md',
          filePath: 'src/resources/nested/guide.md',
          absoluteFilePath: path.join(docsDir, 'nested', 'guide.md'),
          openMode: 'document',
        }),
        expect.objectContaining({
          id: 'templates/prd-template',
          name: 'templates/prd-template',
          title: 'PRD Template',
          path: 'templates/prd-template.md',
          filePath: 'src/resources/templates/prd-template.md',
          absoluteFilePath: path.join(docsDir, 'templates', 'prd-template.md'),
          openMode: 'document',
        }),
      ]));
      expect(body.resources.docs).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'stale' }),
        expect.objectContaining({ id: 'readme' }),
      ]));
      expect(body.resources.themes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'pathless-theme',
          sourcePath: 'content/themes/pathless-theme',
        }),
        expect.objectContaining({
          id: 'fresh-theme',
          sourcePath: 'content/themes/fresh-theme',
        }),
      ]));
      expect(body.resources.themes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: '../outside-theme' }),
      ]));
      expect(body.resources.themes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'explicit-source-theme', sourcePath: 'custom/themes/source' }),
        expect.objectContaining({ id: 'explicit-path-theme', path: 'custom/themes/path' }),
        expect.objectContaining({ id: 'explicit-file-theme', filePath: 'custom/themes/file/index.tsx' }),
        expect.objectContaining({
          id: 'explicit-absolute-theme',
          absoluteFilePath: path.join(projectRoot, 'custom/themes/absolute'),
        }),
      ]));
      for (const id of ['explicit-path-theme', 'explicit-file-theme', 'explicit-absolute-theme']) {
        expect(body.resources.themes.find((theme: any) => theme.id === id)).not.toHaveProperty('sourcePath');
      }
      expect(body.navigation).not.toHaveProperty('docs');
      expect(body.orders.themes).toEqual([
        'pathless-theme',
        'explicit-source-theme',
        'explicit-path-theme',
        'explicit-file-theme',
        'explicit-absolute-theme',
        'fresh-theme',
      ]);

      const stored = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
      expect(stored.resources.prototypes[0].placeholderGuide).toMatchObject({ kind: 'prototype-empty' });
      expect(stored.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'untitled-2',
          placeholder: true,
          placeholderGuide: expect.objectContaining({
            kind: 'prototype-empty',
          }),
        }),
      ]));
      expect(stored.resources.prototypes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'edited',
          placeholder: true,
        }),
      ]));
      const storedPlaceholderStartedPrototype = stored.resources.prototypes.find((prototype: any) => prototype.id === 'placeholder-started');
      expect(storedPlaceholderStartedPrototype).toMatchObject({
        id: 'placeholder-started',
        generationStatus: 'waiting',
      });
      expect(storedPlaceholderStartedPrototype).not.toHaveProperty('placeholder');
      expect(storedPlaceholderStartedPrototype).not.toHaveProperty('placeholderGuide');
      expect(stored.resources.prototypes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'ghost' }),
        expect.objectContaining({ id: 'ignored-no-entry' }),
      ]));
      expect(stored.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'fresh',
          title: 'Fresh Prototype',
          filePath: 'content/prototypes/fresh/index.tsx',
        }),
      ]));
      expect(stored.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'waiting',
          generationStatus: 'waiting',
        }),
      ]));
      const storedReadyPrototype = stored.resources.prototypes.find((prototype: any) => prototype.id === 'ready');
      expect(storedReadyPrototype).toMatchObject({
        id: 'ready',
        title: 'Ready Prototype',
      });
      expect(storedReadyPrototype).not.toHaveProperty('generationStatus');
      expect(stored.resources.themes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'pathless-theme',
          sourcePath: 'content/themes/pathless-theme',
        }),
        expect.objectContaining({
          id: 'fresh-theme',
          sourcePath: 'content/themes/fresh-theme',
        }),
      ]));
      expect(stored.resources.themes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: '../outside-theme' }),
      ]));
      expect(stored.navigation.prototypes).toEqual(['draft', 'fresh']);
      expect(stored.navigation).not.toHaveProperty('docs');
      expect(stored.resources).not.toHaveProperty('docs');
    } finally {
      await server.close();
    }
  });

  it('does not reconcile themes through a theme root symlink outside the project', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'symlink-theme-root', 'Symlink Theme Root');
    writeMakeClientPackageForProject(projectRoot);
    const outsideRoot = createTempRoot('axhub-make-outside-themes-');
    const outsideThemesDir = path.join(outsideRoot, 'themes');
    fs.mkdirSync(path.join(outsideThemesDir, 'outside-theme'), { recursive: true });
    const themesDir = path.join(projectRoot, 'content', 'themes');
    fs.mkdirSync(path.dirname(themesDir), { recursive: true });
    fs.symlinkSync(outsideThemesDir, themesDir, 'dir');
    writeProjectMetadata(projectRoot, {
      project: { id: 'symlink-theme-root', name: 'Symlink Theme Root' },
      resources: {
        prototypes: [],
        themes: [{ id: 'outside-theme', name: 'outside-theme', title: 'Outside Theme' }],
      },
      navigation: { prototypes: [] },
      orders: { themes: ['outside-theme'] },
      resourceWriteTargets: {
        themes: { type: 'project-relative-path', path: 'content/themes' },
      },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(`${server.origin}/api/projects/symlink-theme-root/resources`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.resources.themes).toEqual([
        expect.objectContaining({ id: 'outside-theme' }),
      ]);
      expect(body.resources.themes[0]).not.toHaveProperty('sourcePath');

      const stored = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
      expect(stored.resources.themes[0]).not.toHaveProperty('sourcePath');
    } finally {
      await server.close();
    }
  });

  it('handles project registry mutations, active project validation, and doc content updates', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    const otherProjectRoot = createTempRoot();
    writeMakeClientMarkerForProject(otherProjectRoot, 'client-b', 'Client B');
    writeMakeClientPackageForProject(otherProjectRoot);
    writeProjectMetadata(otherProjectRoot, {
      project: { id: 'client-b', name: 'Client B' },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const list = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(list).toMatchObject({
        activeProjectId: 'client-a',
        projects: [expect.objectContaining({ id: 'client-a', root: projectRoot })],
      });

      const genericRegister = await fetch(`${server.origin}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'missing-root' }),
      });
      expect(genericRegister.status).toBe(410);

      const register = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: otherProjectRoot }),
      });
      expect(register.status).toBe(201);

      const duplicate = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: otherProjectRoot }),
      });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({ code: 'MAKE_PROJECT_PATH_CONFLICT' });

      const missingActive = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(missingActive.status).toBe(400);

      const activeUpdate = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'client-a' }),
      }).then((response) => response.json());
      expect(activeUpdate.activeProject).toMatchObject({ id: 'client-a', root: projectRoot });

      const patch = await fetch(`${server.origin}/api/projects/client-a`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed Client A' }),
      }).then((response) => response.json());
      expect(patch.project).toMatchObject({ id: 'client-a', name: 'Renamed Client A' });

      const missingProject = await fetch(`${server.origin}/api/projects/not-found/resources`);
      expect(missingProject.status).toBe(404);

      const missingDoc = await fetch(`${server.origin}/api/projects/client-a/docs/not-found/content`);
      expect(missingDoc.status).toBe(404);

      const docRead = await fetch(`${server.origin}/api/projects/client-a/docs/spec/content`).then((response) => response.json());
      expect(docRead.content).toBe('# Spec\n');

      const docWrite = await fetch(`${server.origin}/api/projects/client-a/docs/spec/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated Spec\n' }),
      }).then((response) => response.json());
      expect(docWrite).toMatchObject({ success: true });
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'resources', 'spec.md'), 'utf8')).toBe('# Updated Spec\n');

      const deleted = await fetch(`${server.origin}/api/projects/client-a`, { method: 'DELETE' }).then((response) => response.json());
      expect(deleted).toEqual({ success: true });
      const deletedProject = await fetch(`${server.origin}/api/projects/client-a/resources`);
      expect(deletedProject.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('reads template markdown content from src/resources without metadata docs or templates indexes', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'template-doc-client', 'Template Doc Client');
    writeMakeClientPackageForProject(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'src', 'resources', 'templates'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'src', 'resources', 'templates', 'prd-template.md'),
      '# PRD Template\n\nBody.\n',
      'utf8',
    );
    writeProjectMetadata(projectRoot, {
      project: { id: 'template-doc-client', name: 'Template Doc Client' },
      resources: {
        prototypes: [],
        themes: [],
      },
      navigation: { prototypes: [] },
      orders: { themes: [] },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(`${server.origin}/api/projects/template-doc-client/docs/${encodeURIComponent('templates/prd-template')}/content`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        content: '# PRD Template\n\nBody.\n',
        path: path.join(projectRoot, 'src', 'resources', 'templates', 'prd-template.md'),
      });
    } finally {
      await server.close();
    }
  });

  it('reads nested project doc content by filesystem-relative path when metadata uses a legacy basename id', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const docsDir = path.join(projectRoot, 'src', 'resources');
    const nestedDocPath = path.join(docsDir, '商品2.7', 'prd-qink追踪方案.md');
    fs.mkdirSync(path.dirname(nestedDocPath), { recursive: true });
    fs.writeFileSync(nestedDocPath, '# Qink PRD\n\nNested notes.\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
      resources: {
        prototypes: [],
        themes: [],
      },
      navigation: { prototypes: [] },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const docId = encodeURIComponent('商品2.7/prd-qink追踪方案');
      const docReadResponse = await fetch(`${server.origin}/api/projects/client-a/docs/${docId}/content`);
      const docRead = await docReadResponse.json();

      expect(docReadResponse.status).toBe(200);
      expect(docRead.content).toBe('# Qink PRD\n\nNested notes.\n');

      const docWriteResponse = await fetch(`${server.origin}/api/projects/client-a/docs/${docId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated Nested PRD\n' }),
      });
      const docWrite = await docWriteResponse.json();

      expect(docWriteResponse.status).toBe(200);
      expect(docWrite).toMatchObject({ success: true });
      expect(fs.readFileSync(nestedDocPath, 'utf8')).toBe('# Updated Nested PRD\n');
    } finally {
      await server.close();
    }
  });

  it('reads and writes project-internal markdown documents by project-relative path', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const internalDocPath = path.join(projectRoot, 'src', 'prototypes', 'annotation-demo', 'docs', 'prd-03-states.md');
    fs.mkdirSync(path.dirname(internalDocPath), { recursive: true });
    fs.writeFileSync(internalDocPath, '# States PRD\n\nInitial body.\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
      resources: {
        prototypes: [],
        themes: [],
      },
      navigation: { prototypes: [] },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const relativeDocPath = 'src/prototypes/annotation-demo/docs/prd-03-states.md';
      const readResponse = await fetch(`${server.origin}/api/projects/client-a/document-content?path=${encodeURIComponent(relativeDocPath)}`);
      const readBody = await readResponse.json();

      expect(readResponse.status).toBe(200);
      expect(readBody).toMatchObject({
        content: '# States PRD\n\nInitial body.\n',
        path: internalDocPath,
        projectRelativePath: relativeDocPath,
      });

      const writeResponse = await fetch(`${server.origin}/api/projects/client-a/document-content?path=${encodeURIComponent(relativeDocPath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated States PRD\n' }),
      });
      const writeBody = await writeResponse.json();

      expect(writeResponse.status).toBe(200);
      expect(writeBody).toMatchObject({
        success: true,
        path: internalDocPath,
        projectRelativePath: relativeDocPath,
      });
      expect(fs.readFileSync(internalDocPath, 'utf8')).toBe('# Updated States PRD\n');
    } finally {
      await server.close();
    }
  });

  it('serves project-internal HTML documents through the existing editable preview host', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const relativeDocPath = 'templates/nested/prototype-spec.html';
    const internalDocPath = path.join(projectRoot, relativeDocPath);
    const internalAssetPath = path.join(projectRoot, 'templates', 'assets', 'preview.png');
    fs.mkdirSync(path.dirname(internalDocPath), { recursive: true });
    fs.mkdirSync(path.dirname(internalAssetPath), { recursive: true });
    fs.writeFileSync(internalDocPath, '<!doctype html><html><body><p>Template</p><img src="../assets/preview.png?v=1#cover"><img src="bad%ZZ.png"></body></html>\n', 'utf8');
    fs.writeFileSync(internalAssetPath, 'preview-image', 'utf8');
    writeProjectMetadata(projectRoot, { project: { id: 'client-a', name: 'Client A' } });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(
        `${server.origin}/api/projects/client-a/document-content?path=${encodeURIComponent(relativeDocPath)}`,
        { headers: { Accept: 'text/html' } },
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<p data-axhub-text-key=');
      expect(html).toContain('/assets/html-template-bootstrap.js');
      expect(html).toContain('asset=..%2Fassets%2Fpreview.png');
      expect(html).toContain('#cover');
      expect(html).toContain('src="bad%ZZ.png"');
      const assetUrl = html.match(/src="([^"]*document-asset[^"]*)"/u)?.[1]?.replace(/&amp;/gu, '&') || '';
      const assetResponse = await fetch(new URL(assetUrl, server.origin));
      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toBe('preview-image');
    } finally {
      await server.close();
    }
  });

  it('serves project-internal HTML documents from prototype .spec paths', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const relativeDocPath = 'src/prototypes/demo/.spec/spec.html';
    const internalDocPath = path.join(projectRoot, relativeDocPath);
    fs.mkdirSync(path.dirname(internalDocPath), { recursive: true });
    fs.writeFileSync(internalDocPath, '<!doctype html><html><body><p>Prototype spec</p></body></html>\n', 'utf8');
    writeProjectMetadata(projectRoot, { project: { id: 'client-a', name: 'Client A' } });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(
        `${server.origin}/api/projects/client-a/document-content?path=${encodeURIComponent(relativeDocPath)}`,
        { headers: { Accept: 'text/html' } },
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<p data-axhub-text-key=');
    } finally {
      await server.close();
    }
  });

  it('serves relative assets for project-internal markdown documents', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const internalDocPath = path.join(projectRoot, 'src', 'prototypes', 'annotation-demo', 'docs', 'prd-05-handoff.md');
    const assetPath = path.join(projectRoot, 'src', 'prototypes', 'annotation-demo', 'docs', 'assets', 'handoff.png');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(internalDocPath, '# Handoff PRD\n\n![handoff](assets/handoff.png)\n', 'utf8');
    fs.writeFileSync(assetPath, 'png-bytes\n');
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(
        `${server.origin}/api/projects/client-a/document-asset?path=${encodeURIComponent('src/prototypes/annotation-demo/docs/prd-05-handoff.md')}&asset=${encodeURIComponent('assets/handoff.png')}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(await response.text()).toBe('png-bytes\n');
    } finally {
      await server.close();
    }
  });

  it('serves annotation demo markdown image placeholders from prototype assets', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    const internalDocPath = path.join(projectRoot, 'src', 'prototypes', 'annotation-demo', 'docs', 'prd-05-handoff.md');
    const assetPath = path.join(projectRoot, 'src', 'prototypes', 'annotation-demo', 'assets', 'document-edit.png');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.mkdirSync(path.dirname(internalDocPath), { recursive: true });
    fs.writeFileSync(internalDocPath, '# Handoff PRD\n\n![文档编辑](__ANNOTATION_IMAGE_DOCUMENT_EDIT__)\n', 'utf8');
    fs.writeFileSync(assetPath, 'document-edit-png\n');
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(
        `${server.origin}/api/projects/client-a/document-asset?path=${encodeURIComponent('src/prototypes/annotation-demo/docs/prd-05-handoff.md')}&asset=${encodeURIComponent('__ANNOTATION_IMAGE_DOCUMENT_EDIT__')}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(await response.text()).toBe('document-edit-png\n');
    } finally {
      await server.close();
    }
  });

  it('rejects project document content paths outside the project root', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const response = await fetch(`${server.origin}/api/projects/client-a/document-content?path=${encodeURIComponent('../outside.md')}`);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toMatchObject({
        code: 'DOCUMENT_PATH_FORBIDDEN',
        projectId: 'client-a',
      });
    } finally {
      await server.close();
    }
  });

  it('rejects project HTML document and asset paths that escape through symlinks', async () => {
    const projectRoot = createTempRoot();
    const externalRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    fs.mkdirSync(path.join(projectRoot, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'templates', 'safe.html'), '<html><body><img src="linked/outside.png"></body></html>', 'utf8');
    fs.writeFileSync(path.join(externalRoot, 'outside.html'), '<html><body>outside</body></html>', 'utf8');
    fs.writeFileSync(path.join(externalRoot, 'outside.png'), 'outside-image', 'utf8');
    fs.symlinkSync(externalRoot, path.join(projectRoot, 'templates', 'linked'), 'dir');
    const server = await startTestServer(projectRoot);

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      const documentResponse = await fetch(
        `${server.origin}/api/projects/client-a/document-content?path=${encodeURIComponent('templates/linked/outside.html')}`,
        { headers: { Accept: 'text/html' } },
      );
      const assetResponse = await fetch(
        `${server.origin}/api/projects/client-a/document-asset?path=${encodeURIComponent('templates/safe.html')}&asset=${encodeURIComponent('linked/outside.png')}`,
      );

      expect(documentResponse.status).toBe(403);
      expect(assetResponse.status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it('does not repoint an existing make client registry entry from a marker-backed startup root', async () => {
    const previousRoot = createTempRoot('axhub-make-old-client-');
    writeMakeClientMarkerForProject(previousRoot, 'make-project', 'Old Make Client');
    writeMakeClientPackageForProject(previousRoot);
    writeProjectMetadata(previousRoot, {
      project: { id: 'make-project', name: 'Old Make Client' },
    });
    const currentRoot = createTempRoot('axhub-make-current-client-');
    writeMakeClientMarkerForProject(currentRoot, 'make-project', 'Current Make Client');
    writeMakeClientPackageForProject(currentRoot);
    writeProjectMetadata(currentRoot, {
      project: { id: 'make-project', name: 'Current Make Client' },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const registryPath = getProjectRegistryPath(registryHome);
    const previousServer = await startMakeServer({
      projectRoot: previousRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(previousRoot, 'missing-admin'),
      registryPath,
    });

    try {
      const previousRegister = await fetch(`${previousServer.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: previousRoot }),
      });
      expect(previousRegister.status).toBe(201);

      const previousList = await fetch(`${previousServer.origin}/api/projects`).then((response) => response.json());
      expect(previousList.projects).toEqual([expect.objectContaining({ id: 'make-project', root: previousRoot })]);
    } finally {
      await previousServer.close();
    }

    const server = await startMakeServer({
      projectRoot: currentRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(currentRoot, 'missing-admin'),
      registryPath,
    });

    try {
      const startupList = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(startupList).toMatchObject({
        activeProjectId: 'make-project',
        projects: [expect.objectContaining({
          id: 'make-project',
          root: previousRoot,
          metadataPath: getProjectMetadataPath(previousRoot),
        })],
      });
    } finally {
      await server.close();
    }
  });

  it('treats legacy official make-project default names as unnamed during explicit registration', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'make-project', 'Axhub Make');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'make-project', name: 'Axhub Make' },
    });
    const server = await startTestServer(projectRoot);

    try {
      const register = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(register.status).toBe(201);

      const list = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(list.projects).toEqual([
        expect.objectContaining({
          id: 'make-project',
          name: '',
        }),
      ]);

      const resources = await fetch(`${server.origin}/api/projects/make-project/resources`).then((response) => response.json());
      expect(resources.project).toEqual({
        id: 'make-project',
        name: '',
      });

      const marker = JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8'));
      expect(marker.project).toEqual({
        id: 'make-project',
        name: '',
      });
      const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
      expect(metadata.project).toEqual({
        id: 'make-project',
        name: '',
      });
    } finally {
      await server.close();
    }
  });

  it('does not list make client versions in the project registry payload', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'versioned-client', 'Versioned Client');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'versioned-client', name: 'Versioned Client' },
    });
    const server = await startTestServer(projectRoot);

    try {
      const register = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(register.status).toBe(201);

      const list = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(list.projects).toEqual([
        expect.objectContaining({
          id: 'versioned-client',
        }),
      ]);
      expect(list.projects[0]).not.toHaveProperty('clientVersion');
    } finally {
      await server.close();
    }
  });

  it('rejects doc content reads that attempt to escape the fixed resources directory', async () => {
    const projectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'src', 'resources'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'outside.md'), '# Outside\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
      resources: {
        prototypes: [],
        themes: [],
      },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const registryPath = getProjectRegistryPath(registryHome);
    writeJson(registryPath, {
      schemaVersion: 1,
      activeProjectId: 'client-a',
      projects: [
        {
          id: 'client-a',
          name: 'Client A',
          root: projectRoot,
          metadataPath: getProjectMetadataPath(projectRoot),
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    });
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath,
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/client-a/docs/${encodeURIComponent('../outside')}/content`);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toMatchObject({
        error: 'Doc not found',
      });
    } finally {
      await server.close();
    }
  });

  it('repairs a registered make client project when its metadata file is missing', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    const missingMetadataRoot = createTempRoot();
    writeMakeClientMarkerForProject(missingMetadataRoot, 'stale', 'Stale Project');
    writeMakeClientPackageForProject(missingMetadataRoot);
    writeProjectMetadata(missingMetadataRoot, {
      project: { id: 'stale', name: 'Stale Project' },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: missingMetadataRoot }),
      });
      expect(registerResponse.status).toBe(201);
      fs.rmSync(getProjectMetadataPath(missingMetadataRoot), { force: true });

      const response = await fetch(`${server.origin}/api/projects/stale/resources`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.project).toMatchObject({
        id: 'stale',
        name: 'Stale Project',
      });
      expect(fs.existsSync(getProjectMetadataPath(missingMetadataRoot))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('writes project communication records and lists Axure artifacts by explicit projectId', async () => {
    const projectRoot = createTempRoot();
    const otherProjectRoot = createTempRoot();
    writeMakeClientMarkerForProject(projectRoot, 'client-a', 'Client A');
    writeMakeClientPackageForProject(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'client-a', name: 'Client A' },
    });
    writeMakeClientMarkerForProject(otherProjectRoot, 'client-b', 'Client B');
    writeMakeClientPackageForProject(otherProjectRoot);
    writeProjectMetadata(otherProjectRoot, {
      project: { id: 'client-b', name: 'Client B' },
    });
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startMakeServer({
      projectRoot,
      host: 'localhost',
      port: 0,
      adminRoot: path.join(projectRoot, 'missing-admin'),
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      await registerExistingMakeProject(server.origin, projectRoot);
      await registerExistingMakeProject(server.origin, otherProjectRoot);

      const sessionResponse = await fetch(`${server.origin}/api/projects/client-a/communication/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: 'home',
          resourceType: 'prototype',
          clientUrlOrigin: 'http://localhost:3000',
          runtimeVersion: '0.1.0',
          status: 'ready',
        }),
      });
      const exportResponse = await fetch(`${server.origin}/api/projects/client-a/communication/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: 'home',
          resourceType: 'prototype',
          operationType: 'figma.copy',
          status: 'success',
        }),
      });
      const editResponse = await fetch(`${server.origin}/api/projects/client-a/communication/edit-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: 'home',
          resourceType: 'prototype',
          operationType: 'quickEdit.save',
          status: 'success',
        }),
      });
      const diagnosticResponse = await fetch(`${server.origin}/api/projects/client-a/communication/runtime-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'axhub.quickEdit.patch',
          status: 'success',
        }),
      });

      expect(sessionResponse.status).toBe(201);
      expect(exportResponse.status).toBe(201);
      expect(editResponse.status).toBe(201);
      expect(diagnosticResponse.status).toBe(201);
      expect(fs.readdirSync(getProjectSessionsDir(projectRoot))).toHaveLength(2);
      expect(fs.readdirSync(getProjectExportsDir(projectRoot))).toHaveLength(1);
      expect(fs.readdirSync(getProjectEditHistoryDir(projectRoot))).toHaveLength(1);
      expect(fs.existsSync(path.join(projectRoot, '.axhub', 'make', 'artifacts', 'figma'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, '.axhub', 'make', 'artifacts', 'quick-edit'))).toBe(false);
      expect(fs.existsSync(getProjectSessionsDir(otherProjectRoot))).toBe(false);
      expect(fs.existsSync(getProjectExportsDir(otherProjectRoot))).toBe(false);
      expect(fs.existsSync(getProjectEditHistoryDir(otherProjectRoot))).toBe(false);

      const artifactsResponse = await fetch(`${server.origin}/api/projects/client-a/artifacts/axure?projectId=client-a`);
      expect(artifactsResponse.status).toBe(404);
    } finally {
      await server.close();
    }
  });

});
