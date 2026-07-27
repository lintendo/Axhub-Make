import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getProjectMetadataPath } from '../projectCore/index.ts';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  setActiveProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

const TEMPLATE_REPO = 'lintendo/Make-Template';
const DEFAULT_DESIGN_SYSTEM_INDEX = {
  schemaVersion: 1,
  designSystems: [
    {
      id: 'trae-design',
      title: 'TRAE Design',
      slug: 'trae-design',
      sourcePath: 'design-systems/trae-design',
      entryPath: 'design-systems/trae-design/index.tsx',
      tokenPath: 'design-systems/trae-design/designToken.json',
      stylePath: 'design-systems/trae-design/globals.css',
      coverPath: 'design-systems/trae-design/assets/official-homepage.webp',
      description: 'TRAE design system',
    },
  ],
};
const MIGRATED_GETDESIGN_TEMPLATE_SYSTEMS = [
  'hp',
  'bmw-m',
  'vodafone',
  'starbucks',
  'mastercard',
  'bugatti',
  'the-verge',
  'wired',
  'playstation',
  'meta',
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanupProjectApiTestRoots();
});

function writeThemeImportEnabledProject(projectRoot: string, id = 'theme-library-client'): void {
  writeProjectMetadata(projectRoot, {
    project: { id, name: id },
    resources: {
      prototypes: [],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: [], docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: true,
      multiDevicePreview: true,
      resourceWrites: {
        themeImport: true,
      },
    },
    resourceWriteTargets: {
      themes: { path: 'content/themes' },
    },
  });
}

function readMetadata(projectRoot: string): any {
  return JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
}

async function startThemeLibraryTestServer(projectRoot: string, projectId = String(readMetadata(projectRoot).project.id)) {
  const server = await startTestServer(projectRoot);
  await registerProject(server.origin, projectRoot, projectId);
  await setActiveProject(server.origin, projectId);
  return server;
}

function createTemplateTarball(files: Record<string, string>): string {
  const archiveRoot = createTempRoot('axhub-make-theme-library-tar-root-');
  const repoRoot = path.join(archiveRoot, 'lintendo-Make-Template-main');
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  const tarPath = path.join(createTempRoot('axhub-make-theme-library-tar-file-'), 'make-template.tar.gz');
  execFileSync('tar', ['-czf', tarPath, '-C', archiveRoot, path.basename(repoRoot)]);
  return tarPath;
}

function mockGitHubResponses(params: {
  index?: unknown;
  branch?: string;
  tarballPath?: string;
  repoStatus?: number;
  rawStatus?: number;
  tarStatus?: number;
} = {}): void {
  const originalFetch = globalThis.fetch;
  const branch = params.branch || 'main';
  const index = params.index ?? DEFAULT_DESIGN_SYSTEM_INDEX;
  const rawIndexResponse = () => new Response(JSON.stringify(index), {
    status: params.rawStatus || 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const tarResponse = () => new Response(params.tarballPath ? fs.readFileSync(params.tarballPath) : 'missing tarball', {
    status: params.tarStatus || 200,
    headers: { 'Content-Type': 'application/gzip' },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (url.startsWith('http://localhost:')) {
      return originalFetch(input, init);
    }
    if (url === `https://api.github.com/repos/${TEMPLATE_REPO}`) {
      return new Response(JSON.stringify({ default_branch: branch }), {
        status: params.repoStatus || 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${branch}/design-systems.json`) {
      return rawIndexResponse();
    }
    if (url === `https://raw.githubusercontent.com/${TEMPLATE_REPO}/HEAD/design-systems.json`) {
      return rawIndexResponse();
    }
    if (url === `https://codeload.github.com/${TEMPLATE_REPO}/tar.gz/${branch}`) {
      return tarResponse();
    }
    if (url === `https://codeload.github.com/${TEMPLATE_REPO}/tar.gz/HEAD`) {
      return tarResponse();
    }
    return new Response(`Unexpected URL: ${url}`, { status: 404 });
  }));
}

function withoutLocalThemeLibrary<T>(run: () => Promise<T>): Promise<T> {
  const realExistsSync = fs.existsSync;
  const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
    if (String(target).endsWith(path.join('apps', 'make-template', 'design-systems.json'))) {
      return false;
    }
    return realExistsSync(target);
  });

  return run().finally(() => {
    existsSyncSpy.mockRestore();
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe('make-server project theme library APIs', () => {
  it('lists remote design systems from mocked GitHub responses', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot);
    mockGitHubResponses();
    const server = await startThemeLibraryTestServer(projectRoot);

    await withoutLocalThemeLibrary(async () => {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));

      expect(listed.status).toBe(200);
      expect(listed.body).toMatchObject({
        schemaVersion: 1,
        source: {
          repo: TEMPLATE_REPO,
          branch: 'main',
        },
      });
      expect(listed.body.designSystems).toHaveLength(1);
      expect(listed.body.designSystems[0]).toMatchObject({
        id: 'trae-design',
        title: 'TRAE Design',
        slug: 'trae-design',
        coverUrl: `https://raw.githubusercontent.com/${TEMPLATE_REPO}/main/design-systems/trae-design/assets/official-homepage.webp`,
        sourceUrl: `https://github.com/${TEMPLATE_REPO}/tree/main/design-systems/trae-design`,
        canDirectImport: true,
      });
      expect(listed.body.designSystems[0]).not.toHaveProperty('directImportDisabledReason');
    }).finally(async () => {
      await server.close();
    });
  });

  it('returns remote errors when no local make-template design system index exists', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot);
    mockGitHubResponses({ rawStatus: 404 });
    const server = await startThemeLibraryTestServer(projectRoot);

    await withoutLocalThemeLibrary(async () => {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));

      expect(listed.status).toBe(502);
      expect(listed.body).toMatchObject({
        code: 'THEME_LIBRARY_REMOTE_UNAVAILABLE',
      });
    }).finally(async () => {
      await server.close();
    });
  });

  it('loads local make-template design systems when available', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot);
    const server = await startThemeLibraryTestServer(projectRoot);

    try {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));

      expect(listed.status).toBe(200);
      expect(listed.body).toMatchObject({
        schemaVersion: 1,
        source: {
          repo: TEMPLATE_REPO,
          branch: 'local',
        },
      });
      expect(listed.body.designSystems).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'hp',
          title: 'HP Design System',
          slug: 'hp',
          entryPath: 'design-systems/hp/index.tsx',
          tokenPath: 'design-systems/hp/designToken.json',
          coverPath: 'design-systems/hp/assets/official-homepage.webp',
          coverUrl: `https://raw.githubusercontent.com/${TEMPLATE_REPO}/HEAD/design-systems/hp/assets/official-homepage.webp`,
          sourceUrl: `https://github.com/${TEMPLATE_REPO}/tree/HEAD/design-systems/hp`,
          canDirectImport: true,
        }),
      ]));
    } finally {
      await server.close();
    }
  });

  it('exposes migrated getdesign.md themes from local make-template design systems', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot);
    const server = await startThemeLibraryTestServer(projectRoot);

    try {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));

      expect(listed.status).toBe(200);
      expect(listed.body.source).toMatchObject({ branch: 'local' });
      for (const slug of MIGRATED_GETDESIGN_TEMPLATE_SYSTEMS) {
        expect(listed.body.designSystems).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: slug,
            slug,
            sourcePath: `design-systems/${slug}`,
            entryPath: `design-systems/${slug}/index.tsx`,
            tokenPath: `design-systems/${slug}/designToken.json`,
            stylePath: `design-systems/${slug}/globals.css`,
            coverPath: slug === 'mastercard'
              ? 'design-systems/mastercard/assets/mastercard-design-system-cover.webp'
              : `design-systems/${slug}/assets/official-homepage.webp`,
            canDirectImport: true,
          }),
        ]));
      }
    } finally {
      await server.close();
    }
  });

  it('prefers local make-template design systems without waiting for the remote index', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot);
    const server = await startThemeLibraryTestServer(projectRoot);
    const originalFetch = globalThis.fetch;
    const remoteRequests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      if (url.startsWith('http://localhost:')) {
        return originalFetch(input);
      }
      remoteRequests.push(url);
      throw new Error(`Remote theme library should not be requested when local make-template exists: ${url}`);
    }));

    try {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));

      expect(listed.status).toBe(200);
      expect(listed.body).toMatchObject({
        schemaVersion: 1,
        source: {
          repo: TEMPLATE_REPO,
          branch: 'local',
        },
      });
      expect(listed.body.designSystems).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'hp',
          title: 'HP Design System',
          slug: 'hp',
          canDirectImport: true,
        }),
      ]));
      expect(remoteRequests).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('returns a structured error for invalid design system schema and unsafe paths', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot);
    mockGitHubResponses({
      index: {
        schemaVersion: 1,
        designSystems: [
          {
            id: 'unsafe',
            title: 'Unsafe',
            slug: 'unsafe',
            sourcePath: '../outside',
            entryPath: 'design-systems/unsafe/index.tsx',
            tokenPath: 'design-systems/unsafe/designToken.json',
            stylePath: 'design-systems/unsafe/globals.css',
            coverPath: 'design-systems/unsafe/assets/official-homepage.webp',
            description: 'Unsafe path',
          },
        ],
      },
    });
    const server = await startThemeLibraryTestServer(projectRoot);

    await withoutLocalThemeLibrary(async () => {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));

      expect(listed.status).toBe(502);
      expect(listed.body).toMatchObject({
        code: 'THEME_LIBRARY_SCHEMA_INVALID',
      });
      expect(listed.body.error).toContain('sourcePath');
    }).finally(async () => {
      await server.close();
    });
  });

  it('imports a design system into the declared themes target', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot, 'theme-import-client');
    const tarballPath = createTemplateTarball({
      'design-systems/trae-design/index.tsx': 'export default function TraeDesign() { return null; }\n',
      'design-systems/trae-design/designToken.json': JSON.stringify({ name: 'TRAE Design' }, null, 2),
      'design-systems/trae-design/globals.css': ':root { --primary: #32f08c; }\n',
    });
    mockGitHubResponses({ tarballPath });
    const server = await startThemeLibraryTestServer(projectRoot);

    await withoutLocalThemeLibrary(async () => {
      const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId: 'trae-design' }),
      });

      expect(imported).toMatchObject({
        status: 200,
        body: {
          success: true,
          projectId: 'theme-import-client',
          designSystemId: 'trae-design',
          folderName: 'trae-design',
          path: 'themes/trae-design',
          filePath: 'content/themes/trae-design/index.tsx',
          absoluteFilePath: path.join(projectRoot, 'content/themes/trae-design/index.tsx'),
          clientUrl: `${server.origin}/themes/trae-design`,
        },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'content/themes/trae-design/index.tsx'), 'utf8'))
        .toContain('TraeDesign');
      expect(fs.readFileSync(path.join(projectRoot, 'content/themes/trae-design/globals.css'), 'utf8'))
        .toBe(':root { --primary: #32f08c; }\n');

      const metadata = readMetadata(projectRoot);
      expect(metadata.resources.themes).toEqual([
        expect.objectContaining({
          id: 'trae-design',
          name: 'trae-design',
          title: 'TRAE Design',
          path: 'content/themes/trae-design',
          sourcePath: 'content/themes/trae-design',
          filePath: 'content/themes/trae-design/index.tsx',
          absoluteFilePath: path.join(projectRoot, 'content/themes/trae-design/index.tsx'),
          clientUrl: `${server.origin}/themes/trae-design`,
        }),
      ]);
      expect(metadata.orders.themes).toEqual(['trae-design']);
    }).finally(async () => {
      await server.close();
    });
  });

  it('imports a migrated local make-template design system into the declared themes target', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot, 'theme-local-import-client');
    const server = await startThemeLibraryTestServer(projectRoot);

    try {
      const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId: 'hp' }),
      });

      expect(imported).toMatchObject({
        status: 200,
        body: {
          success: true,
          projectId: 'theme-local-import-client',
          designSystemId: 'hp',
          folderName: 'hp',
          path: 'themes/hp',
          filePath: 'content/themes/hp/index.tsx',
          absoluteFilePath: path.join(projectRoot, 'content/themes/hp/index.tsx'),
          clientUrl: `${server.origin}/themes/hp`,
        },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'content/themes/hp/index.tsx'), 'utf8'))
        .toContain('Self-contained design system preview');
      expect(fs.existsSync(path.join(projectRoot, 'content/themes/hp/designToken.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'content/themes/hp/globals.css'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'content/themes/hp/assets/official-homepage.webp'))).toBe(true);

      const metadata = readMetadata(projectRoot);
      expect(metadata.resources.themes).toEqual([
        expect.objectContaining({
          id: 'hp',
          name: 'hp',
          title: 'HP Design System',
          path: 'content/themes/hp',
          sourcePath: 'content/themes/hp',
          filePath: 'content/themes/hp/index.tsx',
          absoluteFilePath: path.join(projectRoot, 'content/themes/hp/index.tsx'),
          clientUrl: `${server.origin}/themes/hp`,
        }),
      ]);
      expect(metadata.orders.themes).toEqual(['hp']);
    } finally {
      await server.close();
    }
  });

  it('imports a mobile local make-template design system into the declared themes target', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot, 'theme-mobile-local-import-client');
    const server = await startThemeLibraryTestServer(projectRoot);

    try {
      const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library`));
      expect(listed.status).toBe(200);
      expect(listed.body.designSystems).toHaveLength(61);
      expect(listed.body.designSystems).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'snapchat-mobile', slug: 'snapchat-mobile', canDirectImport: true }),
      ]));

      const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId: 'snapchat-mobile' }),
      });

      expect(imported).toMatchObject({
        status: 200,
        body: {
          success: true,
          projectId: 'theme-mobile-local-import-client',
          designSystemId: 'snapchat-mobile',
          folderName: 'snapchat-mobile',
          path: 'themes/snapchat-mobile',
          filePath: 'content/themes/snapchat-mobile/index.tsx',
        },
      });
      for (const file of ['index.tsx', 'designToken.json', 'globals.css', 'DESIGN.md', 'SOURCE.md', 'assets/cover.svg']) {
        expect(fs.existsSync(path.join(projectRoot, 'content/themes/snapchat-mobile', file))).toBe(true);
      }
    } finally {
      await server.close();
    }
  });

  it('rejects direct import when the target theme folder already exists', async () => {
    const projectRoot = createTempRoot();
    writeThemeImportEnabledProject(projectRoot, 'theme-existing-target-client');
    const existingIndexPath = path.join(projectRoot, 'content/themes/trae-design/index.tsx');
    fs.mkdirSync(path.dirname(existingIndexPath), { recursive: true });
    fs.writeFileSync(existingIndexPath, 'existing\n', 'utf8');
    const tarballPath = createTemplateTarball({
      'design-systems/trae-design/index.tsx': 'export default function TraeDesign() { return null; }\n',
      'design-systems/trae-design/designToken.json': JSON.stringify({ name: 'TRAE Design' }, null, 2),
    });
    mockGitHubResponses({ tarballPath });
    const server = await startThemeLibraryTestServer(projectRoot);

    await withoutLocalThemeLibrary(async () => {
      const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId: 'trae-design' }),
      });

      expect(imported.status).toBe(409);
      expect(imported.body).toMatchObject({
        code: 'THEME_LIBRARY_TARGET_EXISTS',
        folderName: 'trae-design',
      });
      expect(fs.readFileSync(existingIndexPath, 'utf8')).toBe('existing\n');
    }).finally(async () => {
      await server.close();
    });
  });

  it('rejects direct import when theme import capability or target is missing', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'theme-no-target-client', name: 'Theme No Target Client' },
      capabilities: {
        quickEdit: true,
        quickEditMode: 'clientRuntime',
        figmaExport: true,
        axureExport: true,
        multiDevicePreview: true,
        resourceWrites: {
          themeImport: true,
        },
      },
    });
    mockGitHubResponses();
    const server = await startThemeLibraryTestServer(projectRoot);

    try {
      const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId: 'trae-design' }),
      });

      expect(imported.status).toBe(424);
      expect(imported.body).toMatchObject({
        code: 'THEME_LIBRARY_IMPORT_ADAPTER_REQUIRED',
        adapterRequired: true,
        projectId: 'theme-no-target-client',
      });
    } finally {
      await server.close();
    }
  });
});
