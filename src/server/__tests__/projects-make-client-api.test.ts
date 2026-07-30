import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAdminServerInfoPath,
  getMakeClientMarkerPath,
  getProjectMetadataPath,
  getRuntimeServerInfoPath,
  readServerInfo,
  writeServerInfo,
} from '../projectCore/index.ts';

import {
  cleanupProjectApiTestRoots,
  createZipFromDirectory,
  createTempRoot,
  getTestProjectRegistryPath,
  registerProject,
  scopeProjectApiUrl,
  startTestServer,
  writeJson,
  writeProjectMetadata,
} from './projects-api.helpers';
import { handleMakeClientProjectApi } from '../managementApi.makeClient.ts';
import {
  getMakeClientDevStatus,
  slugifyMakeClientFolderName,
  suggestMakeClientFolderName,
} from '../makeClientProject.ts';
import { DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION } from '../../common/makeClientTemplate.ts';

const TEMPLATE_SOURCE_URL = 'https://github.com/lintendo/Axhub-Make/tree/main/client';

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn((_file: string, _args: string[], optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (typeof callback === 'function') {
      callback(null, '', '');
    }
  }),
  spawn: vi.fn((_file?: string, _args?: string[], _options?: { cwd?: string }) => {
    const child = {
      once: vi.fn((event: string, callback: (...args: any[]) => void) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
        return child;
      }),
      unref: vi.fn(),
    };
    return child;
  }),
}));

vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>();
  return {
    ...actual,
    ...childProcessMock,
  };
});

vi.mock('../localCommand.ts', async (importActual) => {
  const actual = await importActual<typeof import('../localCommand.ts')>();
  return {
    ...actual,
    runLocalCommand: vi.fn(async (command: string, args: string[]) => ({
      stdout: '',
      stderr: '',
      command,
      escapedCommand: [command, ...args].join(' '),
    })),
  };
});

import { runLocalCommand } from '../localCommand.ts';

const runLocalCommandMock = vi.mocked(runLocalCommand);

const DEFAULT_TEMPLATE_VERSION = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION;
const ONLINE_TEMPLATE_VERSION = '0.9.0';
const TEMPLATE_MANIFEST_URL = 'https://github.com/lintendo/Axhub-Make/releases/latest/download/axhub-make-client-template.latest.json';
const TEMPLATE_MANIFEST_MIRROR_URL = 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-latest/axhub-make-client-template.latest.json';
const TEMPLATE_ZIP_URL = `https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v${DEFAULT_TEMPLATE_VERSION}/axhub-make-client-template.zip`;
const TEMPLATE_MIRROR_ZIP_URL = `https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v${DEFAULT_TEMPLATE_VERSION}/axhub-make-client-template.zip`;
const ONLINE_TEMPLATE_ZIP_URL = `https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v${ONLINE_TEMPLATE_VERSION}/axhub-make-client-template.zip`;
const ONLINE_TEMPLATE_MIRROR_ZIP_URL = `https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v${ONLINE_TEMPLATE_VERSION}/axhub-make-client-template.zip`;
const TEMPLATE_MIRROR_SOURCE_URL = 'https://gitee.com/axhub/Axhub-Make/tree/main/client';
const TEMPLATE_CACHE_ROOT = path.join(os.tmpdir(), 'axhub-make', 'make-client-template-cache');

function templateCachePath(url: string) {
  const key = crypto.createHash('sha256').update(url).digest('hex');
  return path.join(TEMPLATE_CACHE_ROOT, `${key}.zip`);
}

function templateCacheManifestPath(url: string) {
  return `${templateCachePath(url)}.json`;
}

function localCommandResult(command: string, args: string[]) {
  return {
    stdout: '',
    stderr: '',
    command,
    escapedCommand: [command, ...args].join(' '),
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(TEMPLATE_CACHE_ROOT, { recursive: true, force: true });
  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TEMPLATE_MANIFEST_URL || url === TEMPLATE_MANIFEST_MIRROR_URL) {
      return new Response('Template manifest unavailable in default tests', { status: 503 });
    }
    return originalFetch(input, init);
  });
  runLocalCommandMock.mockReset();
  runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
    if ((command === 'pnpm' || command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
      writeInstalledMakeClientDependencies(String(commandOptions?.cwd || ''));
    }
    return localCommandResult(command, args);
  });
  childProcessMock.execFile.mockReset();
  childProcessMock.execFile.mockImplementation((_file: string, _args: string[], optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (typeof callback === 'function') {
      callback(null, '', '');
    }
  });
  childProcessMock.spawn.mockReset();
  childProcessMock.spawn.mockImplementation((_file?: string, _args?: string[], _options?: { cwd?: string }) => {
    const child = {
      once: vi.fn((event: string, callback: (...args: any[]) => void) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
        return child;
      }),
      unref: vi.fn(),
    };
    return child;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(TEMPLATE_CACHE_ROOT, { recursive: true, force: true });
  cleanupProjectApiTestRoots();
});

function writeMakeClientMarker(projectRoot: string, id = 'make-client-a', name = 'Make Client A', templateVersion?: string) {
  writeJson(getMakeClientMarkerPath(projectRoot), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: TEMPLATE_SOURCE_URL,
    ...(templateVersion ? { templateVersion } : {}),
    project: { id, name },
  });
}

function writeMakeClientPackage(projectRoot: string, version?: string) {
  writeJson(path.join(projectRoot, 'package.json'), {
    ...(version ? { version } : {}),
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
}

function writeInstalledMakeClientDependencies(projectRoot: string) {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, process.platform === 'win32' ? 'vite.cmd' : 'vite'), '', 'utf8');
  const viteRoot = path.join(projectRoot, 'node_modules', 'vite');
  fs.mkdirSync(path.join(viteRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(viteRoot, 'package.json'), JSON.stringify({ bin: { vite: 'bin/vite.js' } }), 'utf8');
  fs.writeFileSync(path.join(viteRoot, 'bin', 'vite.js'), '#!/usr/bin/env node\n', 'utf8');
}

function writeInvalidMakeClientDependencies(projectRoot: string) {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, process.platform === 'win32' ? 'vite.cmd' : 'vite'), '', 'utf8');
  const viteRoot = path.join(projectRoot, 'node_modules', 'vite');
  fs.mkdirSync(viteRoot, { recursive: true });
  fs.writeFileSync(path.join(viteRoot, 'package.json'), JSON.stringify({ bin: { vite: 'bin/missing.js' } }), 'utf8');
}

function writeMakeClientMetadata(projectRoot: string, id = 'make-client-a', name = 'Make Client A') {
  writeProjectMetadata(projectRoot, {
    project: { id, name },
    resources: {
      prototypes: [],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: [], docs: [] },
    orders: { themes: [], data: [], templates: [] },
  }, { makeClientMarker: false });
}

function writeMakeClientTemplate(
  templateRoot: string,
  options: { packageContent?: string } = {},
) {
  if (options.packageContent !== undefined) {
    fs.mkdirSync(templateRoot, { recursive: true });
    fs.writeFileSync(path.join(templateRoot, 'package.json'), options.packageContent, 'utf8');
  } else {
    writeJson(path.join(templateRoot, 'package.json'), {
      name: '@axhub/make-client',
      version: DEFAULT_TEMPLATE_VERSION,
      scripts: {
        dev: 'vite',
        'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        build: 'vite build',
      },
      dependencies: {
        shared: '2.0.0',
        moved: '2.0.0',
        'official-runtime': '1.0.0',
      },
      devDependencies: {
        'official-tool': '1.0.0',
      },
    });
  }
  fs.mkdirSync(path.join(templateRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'scripts', 'sync-project-metadata.mjs'), 'export {};\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'src', 'prototypes', 'template-home'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'src', 'prototypes', 'template-home', 'index.tsx'), 'export default function TemplateHome() { return null; }\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'src', 'prototypes', 'beginner-guide'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'export default function BeginnerGuide() { return "updated"; }\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'src', 'prototypes', 'annotation-demo'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'src', 'prototypes', 'annotation-demo', 'index.tsx'), 'export default function AnnotationDemo() { return "updated"; }\n', 'utf8');
  writeJson(getMakeClientMarkerPath(templateRoot), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make-Client.git',
    project: { id: 'template-client', name: 'Template Client' },
  });
  fs.mkdirSync(path.join(templateRoot, '.git'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.git', 'config'), '[core]\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.agents', 'skills', 'local'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.agents', 'skills', 'local', 'SKILL.md'), 'npm run typecheck\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.claude', 'skills', 'local'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.claude', 'skills', 'local', 'SKILL.md'), 'npm run typecheck\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'node_modules', 'left-pad'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'node_modules', 'left-pad', 'index.js'), 'module.exports = null;\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'dist', 'template-home.js'), 'console.log("built");\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'tests', 'template.test.mjs'), 'export {};\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.trae'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.trae', 'local.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, 'temp'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'temp', 'scratch.txt'), 'scratch\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.axhub', 'make'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'client.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'README.md'), '# Make client metadata\n', 'utf8');
  writeJson(path.join(templateRoot, '.axhub', 'make', 'sidebar-tree.json'), {
    version: 1,
    updatedAt: '2026-05-29T00:00:00.000Z',
    prototypes: [],
    docs: [],
    themesTree: [
      {
        id: 'folder-themes-test',
        kind: 'folder',
        title: '行业',
        children: [
          { id: 'item-themes-test', kind: 'item', title: 'Test Theme', itemKey: 'themes/test-theme' },
        ],
      },
    ],
    themes: [],
    data: [],
    templates: [],
  });
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'project.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', '.dev-server-info.json'), JSON.stringify({
    origin: 'http://template-stale-runtime.invalid',
  }), 'utf8');
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'axhub.config.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.axhub', 'make', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'sessions', 'stale.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.axhub', 'make', 'exports'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'exports', 'stale.html'), '<!doctype html>\n', 'utf8');
  fs.mkdirSync(path.join(templateRoot, '.axhub', 'make', 'edit-history'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.axhub', 'make', 'edit-history', 'stale.json'), '{}\n', 'utf8');
}

function writeStaleMakeClientRuntimePlugins(projectRoot: string) {
  fs.mkdirSync(path.join(projectRoot, 'vite-plugins'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'vite-plugins', 'utils'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'vite-plugins', 'clientPreviewPlugin.ts'), [
    'const ANNOTATION_SOURCE_FILE_NAME = "annotation-source.json";',
    'function createPreviewLoaderVersionSearchParam() {',
    '  return "123";',
    '}',
    'function createPreviewLoaderScriptTag() {',
    '  return `<script type="module" src="/prototypes/home/__axhub-preview-loader.js?annotationVersion=${createPreviewLoaderVersionSearchParam()}"></script>`;',
    '}',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'vite-plugins', 'canvasHotUpdateFilter.ts'), [
    'const STALE_FILTER_SEGMENT = "/stale/";',
    'export function isCanvasHotUpdateFile(filePath: string): boolean {',
    '  return filePath.includes(STALE_FILTER_SEGMENT);',
    '}',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'vite-plugins', 'utils', 'moduleSpecifierQuery.ts'), 'export const stale = true;\n', 'utf8');
}

function createMakeClientTemplateZip(options: { unsafeEntry?: string; packageContent?: string } = {}) {
  const sourceRoot = createTempRoot('axhub-make-template-zip-source-');
  const zipRoot = createTempRoot('axhub-make-template-zip-file-');
  if (options.unsafeEntry) {
    fs.mkdirSync(path.join(sourceRoot, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'evil.txt'), 'unsafe\n', 'utf8');
    const zipPath = path.join(zipRoot, 'unsafe.zip');
    execFileSync('zip', ['-q', zipPath, options.unsafeEntry], { cwd: path.join(sourceRoot, 'nested') });
    return fs.readFileSync(zipPath);
  }
  writeMakeClientTemplate(
    path.join(sourceRoot, 'axhub-make-client-template'),
    { ...(options.packageContent !== undefined ? { packageContent: options.packageContent } : {}) },
  );
  const zipPath = path.join(zipRoot, 'axhub-make-client-template.zip');
  createZipFromDirectory(sourceRoot, zipPath);
  return fs.readFileSync(zipPath);
}

function createOnlineTemplateManifest(version = ONLINE_TEMPLATE_VERSION) {
  return {
    schemaVersion: 1,
    version,
    releaseNotes: `# Axhub Make Client ${version}\n\n- 来自线上 manifest 的更新说明。`,
    publishedAt: '2026-07-09T00:00:00.000Z',
    sources: [
      {
        id: 'github',
        url: `https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v${version}/axhub-make-client-template.zip`,
        markerRepository: TEMPLATE_SOURCE_URL,
        templateVersion: version,
      },
      {
        id: 'gitee',
        url: `https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v${version}/axhub-make-client-template.zip`,
        markerRepository: TEMPLATE_MIRROR_SOURCE_URL,
        templateVersion: version,
      },
    ],
  };
}

function installRemoteTemplateFetchMock(options: {
  failPrimary?: boolean;
  failMirror?: boolean;
  manifest?: Record<string, unknown>;
  failManifest?: boolean;
  unsafePrimaryZipEntry?: string;
  customTemplateUrl?: string;
  packageContent?: string;
} = {}) {
  const primaryZip = createMakeClientTemplateZip({
    ...(options.unsafePrimaryZipEntry ? { unsafeEntry: options.unsafePrimaryZipEntry } : {}),
    ...(options.packageContent !== undefined ? { packageContent: options.packageContent } : {}),
  });
  const mirrorZip = createMakeClientTemplateZip();
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TEMPLATE_MANIFEST_URL || url === TEMPLATE_MANIFEST_MIRROR_URL) {
      if (options.failManifest || !options.manifest) {
        return new Response('Template manifest unavailable', { status: 503 });
      }
      return new Response(JSON.stringify(options.manifest), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (options.customTemplateUrl && url === options.customTemplateUrl) {
      return new Response(primaryZip, { headers: { 'Content-Type': 'application/zip' } });
    }
    if (url === TEMPLATE_ZIP_URL || url === ONLINE_TEMPLATE_ZIP_URL) {
      if (options.failPrimary) {
        return new Response('Primary template zip unavailable', { status: 503 });
      }
      return new Response(primaryZip, { headers: { 'Content-Type': 'application/zip' } });
    }
    if (url === TEMPLATE_MIRROR_ZIP_URL || url === ONLINE_TEMPLATE_MIRROR_ZIP_URL) {
      if (options.failMirror) {
        return new Response('Mirror template zip unavailable', { status: 503 });
      }
      return new Response(mirrorZip, { headers: { 'Content-Type': 'application/zip' } });
    }
    return originalFetch(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function installRemoteTemplateCommandMock(options: {
  failPrimary?: boolean;
  failMirror?: boolean;
  unsafePrimaryZipEntry?: string;
  customTemplateUrl?: string;
  metadataId?: string;
  metadataName?: string;
} = {}) {
  runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
    if ((command === 'pnpm' || command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
      writeInstalledMakeClientDependencies(String(commandOptions?.cwd || ''));
    }
    if (command === 'pnpm' && args[0] === 'metadata:sync') {
      writeMakeClientMetadata(
        String(commandOptions?.cwd || ''),
        options.metadataId || path.basename(String(commandOptions?.cwd || '')),
        options.metadataName || options.metadataId || path.basename(String(commandOptions?.cwd || '')),
      );
    }
    return localCommandResult(command, args);
  });
  installRemoteTemplateFetchMock(options);
}

function runGit(projectRoot: string, args: string[]): string {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function initCleanGitRepo(projectRoot: string): string {
  runGit(projectRoot, ['init']);
  runGit(projectRoot, ['config', 'user.email', 'test@example.com']);
  runGit(projectRoot, ['config', 'user.name', 'Test User']);
  runGit(projectRoot, ['add', '.']);
  runGit(projectRoot, ['commit', '-m', 'initial']);
  return runGit(projectRoot, ['rev-parse', 'HEAD']);
}

function commitGitChangesIfNeeded(projectRoot: string, message: string): string {
  const status = runGit(projectRoot, ['status', '--porcelain']);
  if (status) {
    runGit(projectRoot, ['add', '.']);
    runGit(projectRoot, ['commit', '-m', message]);
  }
  return runGit(projectRoot, ['rev-parse', 'HEAD']);
}

function installMakeClientUpdateCommandMock(options: {
  failMetadataSync?: boolean;
  metadataId?: string;
  metadataName?: string;
} = {}) {
  runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
    const cwd = String(commandOptions?.cwd || '');
    if (command === 'git') {
      return {
        ...localCommandResult(command, args),
        stdout: runGit(cwd, args),
      };
    }
    if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
      writeInstalledMakeClientDependencies(cwd);
      return localCommandResult(command, args);
    }
    if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'run' && args[1] === 'metadata:sync') {
      if (options.failMetadataSync) {
        const error = new Error('metadata sync exploded') as Error & { stderr?: string };
        error.stderr = 'metadata sync exploded';
        throw error;
      }
      writeMakeClientMetadata(
        cwd,
        options.metadataId || path.basename(cwd),
        options.metadataName || options.metadataId || path.basename(cwd),
      );
      return localCommandResult(command, args);
    }
    return localCommandResult(command, args);
  });
}

describe('make-server make client project APIs', () => {
  it('suggests ASCII-only make client folder names with date and sequence fallbacks', () => {
    const parentRoot = createTempRoot('axhub-make-parent-');
    fs.mkdirSync(path.join(parentRoot, 'make-project-20260529'), { recursive: true });

    expect(slugifyMakeClientFolderName('CRM Demo 2026')).toBe('crm-demo-2026');
    expect(slugifyMakeClientFolderName('客户旅程分析平台')).toBe('');
    expect(suggestMakeClientFolderName({
      parentRoot,
      projectName: '客户旅程分析平台',
      now: new Date('2026-05-29T08:00:00Z'),
    })).toBe('make-project-20260529-2');
  });

  it('returns an available ASCII folder name suggestion for Chinese project names', async () => {
    const defaultRoot = createTempRoot('axhub-make-default-');
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    fs.mkdirSync(path.join(parentRoot, 'make-project-20260529'), { recursive: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T08:00:00Z'));
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/folder-name-suggestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          projectName: '客户旅程分析平台',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ folderName: 'make-project-20260529-2' });
    } finally {
      await server.close();
      vi.useRealTimers();
    }
  });

  it('exposes Make client project routes from their domain module', () => {
    expect(handleMakeClientProjectApi).toBeTypeOf('function');
  });

  it('reports make client dev status without starting the project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-status-');
    writeMakeClientMarker(projectRoot, 'status-client', 'Status Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'status-client', 'Status Client');
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/status-client/dev/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        projectId: 'status-client',
        makeClient: true,
        running: false,
        reason: 'not-running',
      });
      expect(childProcessMock.execFile).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('reports a running make client when runtime health matches the project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-running-');
    writeMakeClientMarker(projectRoot, 'running-client', 'Running Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'running-client', 'Running Client');
    const server = await startTestServer(defaultRoot);
    const runtimeServer = await startTestServer(projectRoot);

    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: process.pid,
        port: runtimeServer.port,
        host: 'localhost',
        origin: runtimeServer.origin,
        projectRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });

      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/running-client/dev/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        projectId: 'running-client',
        makeClient: true,
        running: true,
        runtime: {
          origin: runtimeServer.origin,
        },
      });
      expect(statusBody.reason).toBeUndefined();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await runtimeServer.close();
      await server.close();
    }
  });

  it('treats local runtime info as running even when the recorded origin serves another project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-local-runtime-');
    const otherRoot = createTempRoot('axhub-make-client-port-owner-');
    writeMakeClientMarker(projectRoot, 'local-runtime-client', 'Local Runtime Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'local-runtime-client', 'Local Runtime Client');
    const server = await startTestServer(defaultRoot);
    const portOwnerServer = await startTestServer(otherRoot);

    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: process.pid,
        port: portOwnerServer.port,
        host: 'localhost',
        origin: portOwnerServer.origin,
        projectRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });

      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/local-runtime-client/dev/status`);
      const statusBody = await statusResponse.json();
      const ensureResponse = await fetch(`${server.origin}/api/projects/local-runtime-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        projectId: 'local-runtime-client',
        makeClient: true,
        running: true,
        runtime: {
          origin: portOwnerServer.origin,
          projectRoot,
        },
      });
      expect(statusBody.reason).toBeUndefined();
      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'local-runtime-client',
        reused: true,
        runtime: {
          origin: portOwnerServer.origin,
          projectRoot,
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await portOwnerServer.close();
      await server.close();
    }
  });

  it('reuses a discovered make client runtime when ensuring dev and the runtime file is missing', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-discovered-ensure-');
    writeMakeClientMarker(projectRoot, 'discovered-ensure-client', 'Discovered Ensure Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'discovered-ensure-client', 'Discovered Ensure Client');
    const server = await startTestServer(defaultRoot);
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://localhost:51724/api/health') {
        return new Response(JSON.stringify({
          ok: true,
          role: 'runtime',
          projectRoot,
          server: {
            pid: process.pid,
            port: 51724,
            host: 'localhost',
            origin: 'http://localhost:51724',
            projectRoot,
            startedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    });

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/discovered-ensure-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'discovered-ensure-client',
        reused: true,
        runtime: {
          origin: 'http://localhost:51724',
          projectRoot,
        },
      });
      expect(readServerInfo(projectRoot, 'runtime')).toMatchObject({
        origin: 'http://localhost:51724',
        projectRoot,
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('returns the discovered runtime when ensuring dev from stale runtime info', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-discovered-stale-ensure-');
    writeMakeClientMarker(projectRoot, 'discovered-stale-client', 'Discovered Stale Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'discovered-stale-client', 'Discovered Stale Client');
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: 9,
      host: 'localhost',
      origin: 'http://127.0.0.1:9',
      projectRoot,
      startedAt: new Date().toISOString(),
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    });
    const server = await startTestServer(defaultRoot);
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://localhost:51724/api/health') {
        return new Response(JSON.stringify({
          ok: true,
          role: 'runtime',
          projectRoot,
          server: {
            pid: process.pid,
            port: 51724,
            host: 'localhost',
            origin: 'http://localhost:51724',
            projectRoot,
            startedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    });

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/discovered-stale-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'discovered-stale-client',
        reused: true,
        runtime: {
          origin: 'http://localhost:51724',
          projectRoot,
        },
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('includes local make client runtime status in the project list', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-list-running-');
    const portOwnerRoot = createTempRoot('axhub-make-client-list-port-owner-');
    writeMakeClientMarker(projectRoot, 'list-running-client', 'List Running Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'list-running-client', 'List Running Client');
    const server = await startTestServer(defaultRoot);
    const portOwnerServer = await startTestServer(portOwnerRoot);

    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: process.pid,
        port: portOwnerServer.port,
        host: 'localhost',
        origin: portOwnerServer.origin,
        projectRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });

      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const listResponse = await fetch(`${server.origin}/api/projects`);
      const listBody = await listResponse.json();
      const project = listBody.projects.find((item: any) => item.id === 'list-running-client');

      expect(listResponse.status).toBe(200);
      expect(project).toMatchObject({
        id: 'list-running-client',
        runtimeStatus: {
          projectId: 'list-running-client',
          makeClient: true,
          running: true,
          runtime: {
            origin: portOwnerServer.origin,
            projectRoot,
          },
        },
      });
      expect(project.runtimeStatus.reason).toBeUndefined();
    } finally {
      await portOwnerServer.close();
      await server.close();
    }
  });

  it('stops a running make client by the local runtime pid and clears the runtime file', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-stop-running-');
    writeMakeClientMarker(projectRoot, 'stop-running-client', 'Stop Running Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'stop-running-client', 'Stop Running Client');
    const server = await startTestServer(defaultRoot);
    const runtimePid = 987654;
    const runtimeOrigin = 'http://localhost:51781';
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${runtimeOrigin}/api/health`) {
        return new Response('', { status: 404 });
      }
      return originalFetch(input, init);
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: NodeJS.Signals | 0) => {
      if (pid === runtimePid && (signal === 0 || signal === 'SIGTERM')) {
        return true;
      }
      const error: NodeJS.ErrnoException = new Error('process not found');
      error.code = 'ESRCH';
      throw error;
    }) as typeof process.kill);

    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: runtimePid,
        port: 51781,
        host: 'localhost',
        origin: runtimeOrigin,
        projectRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });

      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const stopResponse = await fetch(`${server.origin}/api/projects/stop-running-client/dev/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const stopBody = await stopResponse.json();

      expect(stopResponse.status).toBe(200);
      expect(stopBody).toMatchObject({
        success: true,
        projectId: 'stop-running-client',
        stopped: true,
        status: {
          makeClient: true,
          running: false,
          reason: 'not-running',
        },
      });
      expect(killSpy).toHaveBeenCalledWith(runtimePid, 'SIGTERM');
      expect(fs.existsSync(getRuntimeServerInfoPath(projectRoot))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('does not stop the admin server when stale runtime info points at admin health', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-stop-admin-guard-');
    writeMakeClientMarker(projectRoot, 'stop-admin-guard-client', 'Stop Admin Guard Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'stop-admin-guard-client', 'Stop Admin Guard Client');
    const server = await startTestServer(defaultRoot);
    const runtimePid = 987655;
    const runtimeOrigin = 'http://localhost:53817';
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${runtimeOrigin}/api/health`) {
        return new Response(JSON.stringify({
          ok: true,
          role: 'admin',
          projectRoot: defaultRoot,
          server: {
            pid: runtimePid,
            port: 53817,
            host: 'localhost',
            origin: runtimeOrigin,
            projectRoot: defaultRoot,
            startedAt: new Date().toISOString(),
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: NodeJS.Signals | 0) => {
      if (pid === runtimePid && signal === 0) {
        return true;
      }
      if (pid === runtimePid && signal === 'SIGTERM') {
        throw new Error('admin process should not be stopped');
      }
      const error: NodeJS.ErrnoException = new Error('process not found');
      error.code = 'ESRCH';
      throw error;
    }) as typeof process.kill);

    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: runtimePid,
        port: 53817,
        host: 'localhost',
        origin: runtimeOrigin,
        projectRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });

      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const stopResponse = await fetch(`${server.origin}/api/projects/stop-admin-guard-client/dev/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const stopBody = await stopResponse.json();

      expect(stopResponse.status).toBe(200);
      expect(stopBody).toMatchObject({
        success: true,
        projectId: 'stop-admin-guard-client',
        stopped: false,
        status: {
          makeClient: true,
          running: false,
          reason: 'stale-runtime',
        },
      });
      expect(killSpy).not.toHaveBeenCalledWith(runtimePid, 'SIGTERM');
      expect(fs.existsSync(getRuntimeServerInfoPath(projectRoot))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('serves make client resource URLs from the live runtime origin instead of stale metadata', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-live-links-');
    writeMakeClientMarker(projectRoot, 'live-links-client', 'Live Links Client');
    writeMakeClientPackage(projectRoot);
    writeProjectMetadata(projectRoot, {
      project: { id: 'live-links-client', name: 'Live Links Client' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: 'Home',
            clientUrl: 'http://localhost:51721/prototypes/home',
          },
        ],
        docs: [],
        themes: [
          {
            id: 'brand',
            name: 'brand',
            title: 'Brand',
            clientUrl: 'http://localhost:51721/themes/brand',
            previewUrl: 'http://localhost:51721/themes/brand',
          },
        ],
        data: [],
        templates: [],
      },
      navigation: { prototypes: ['home'], docs: [] },
      orders: { themes: ['brand'], data: [], templates: [] },
    });
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: 51721,
      host: 'localhost',
      origin: 'http://localhost:51721',
      projectRoot,
      startedAt: new Date().toISOString(),
    });
    const server = await startTestServer(defaultRoot, undefined, {
      runtimeOrigin: 'http://localhost:51720',
    });

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const activeResponse = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'live-links-client' }),
      });
      expect(activeResponse.status).toBe(200);

      const resourcesResponse = await fetch(`${server.origin}/api/projects/live-links-client/resources`);
      const resourcesBody = await resourcesResponse.json();
      const entriesResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/entries.json`));
      const entriesBody = await entriesResponse.json();

      expect(resourcesResponse.status).toBe(200);
      expect(resourcesBody.resources.prototypes[0]).toMatchObject({
        clientUrl: 'http://localhost:51721/prototypes/home',
      });
      expect(resourcesBody.resources.themes[0]).toMatchObject({
        clientUrl: 'http://localhost:51721/themes/brand',
        previewUrl: 'http://localhost:51721/themes/brand',
      });
      expect(entriesResponse.status).toBe(200);
      expect(entriesBody.prototypes[0]).toMatchObject({
        clientUrl: 'http://localhost:51721/prototypes/home',
      });
      expect(JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8')).resources.prototypes[0].clientUrl)
        .toBe('http://localhost:51721/prototypes/home');
    } finally {
      await server.close();
    }
  });

  it('marks stale make client runtime info as not running', async () => {
    const projectRoot = createTempRoot('axhub-make-client-stale-');
    writeMakeClientMarker(projectRoot, 'stale-client', 'Stale Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'stale-client', 'Stale Client');
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: 9,
      host: 'localhost',
      origin: 'http://127.0.0.1:9',
      projectRoot,
      startedAt: new Date().toISOString(),
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    });

    const status = await getMakeClientDevStatus('stale-client', projectRoot);

    expect(status).toMatchObject({
      projectId: 'stale-client',
      makeClient: true,
      running: false,
      reason: 'stale-runtime',
    });
    expect(childProcessMock.spawn).not.toHaveBeenCalled();
  });

  it('does not reuse stale make client runtime info when ensuring dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-stale-ensure-');
    writeMakeClientMarker(projectRoot, 'stale-ensure-client', 'Stale Ensure Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'stale-ensure-client', 'Stale Ensure Client');
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: 9,
      host: 'localhost',
      origin: 'http://127.0.0.1:9',
      projectRoot,
      startedAt: new Date().toISOString(),
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51726,
        host: 'localhost',
        origin: 'http://localhost:51726',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/stale-ensure-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'stale-ensure-client',
        reused: false,
        runtime: {
          origin: 'http://localhost:51726',
        },
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({
          cwd: projectRoot,
          env: expect.objectContaining({
            AXHUB_MAKE_SKIP_AUTO_START_SERVER: '1',
            PATH: expect.any(String),
          }),
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('starts dev directly from the project root when client dependencies are already installed', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-local-command-');
    writeMakeClientMarker(projectRoot, 'local-command-client', 'Local Command Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'local-command-client', 'Local Command Client');
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51728,
        host: 'localhost',
        origin: 'http://localhost:51728',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/local-command-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'local-command-client',
        runtime: {
          origin: 'http://localhost:51728',
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['metadata:sync'],
        expect.anything(),
      );
      expect(childProcessMock.execFile).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'pnpm',
        ['dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({
          cwd: projectRoot,
          env: expect.objectContaining({
            AXHUB_MAKE_SKIP_AUTO_START_SERVER: '1',
            PATH: expect.any(String),
          }),
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('patches stale make client runtime preview plugins before ensuring dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-runtime-patch-');
    writeMakeClientMarker(projectRoot, 'runtime-patch-client', 'Runtime Patch Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'runtime-patch-client', 'Runtime Patch Client');
    writeStaleMakeClientRuntimePlugins(projectRoot);
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51729,
        host: 'localhost',
        origin: 'http://localhost:51729',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/runtime-patch-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();
      const previewPluginSource = fs.readFileSync(path.join(projectRoot, 'vite-plugins', 'clientPreviewPlugin.ts'), 'utf8');
      const hotUpdateFilterSource = fs.readFileSync(path.join(projectRoot, 'vite-plugins', 'canvasHotUpdateFilter.ts'), 'utf8');
      const moduleSpecifierSource = fs.readFileSync(path.join(projectRoot, 'vite-plugins', 'utils', 'moduleSpecifierQuery.ts'), 'utf8');

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'runtime-patch-client',
        runtime: {
          origin: 'http://localhost:51729',
        },
      });
      expect(previewPluginSource).toContain('appendPreviewLoaderSearchParams');
      expect(previewPluginSource).not.toContain('annotationVersion');
      expect(previewPluginSource).not.toContain('createPreviewLoaderVersionSearchParam');
      expect(hotUpdateFilterSource).toContain('ANNOTATION_SOURCE_FILE_NAME');
      expect(hotUpdateFilterSource).toContain('filterCanvasUpdatePayload');
      expect(hotUpdateFilterSource).toContain('invalidateHotUpdateModules');
      expect(moduleSpecifierSource).toContain('appendProjectIdToModuleSpecifiersInCode');
      expect(moduleSpecifierSource).not.toContain('stale = true');
    } finally {
      await server.close();
    }
  });

  it('keeps make client dev ensure available when admin server info cannot be overwritten', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-admin-info-locked-');
    writeMakeClientMarker(projectRoot, 'admin-info-locked-client', 'Admin Info Locked Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'admin-info-locked-client', 'Admin Info Locked Client');
    const registryHome = createTempRoot('axhub-make-client-admin-info-locked-home-');
    const adminInfoPath = getAdminServerInfoPath(undefined, { homeDir: registryHome });
    fs.mkdirSync(path.dirname(adminInfoPath), { recursive: true });
    fs.writeFileSync(adminInfoPath, '{"kind":"admin"}\n', 'utf8');
    const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    const originalWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((filePath: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: any) => {
      if (path.resolve(String(filePath)) === adminInfoPath) {
        throw permissionError;
      }
      return originalWriteFileSync(filePath, data as any, options);
    }) as typeof fs.writeFileSync);
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51727,
        host: 'localhost',
        origin: 'http://localhost:51727',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot, registryHome);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/admin-info-locked-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'admin-info-locked-client',
        reused: false,
        runtime: {
          origin: 'http://localhost:51727',
        },
      });
      const healthResponse = await fetch(`${server.origin}/api/make-state/health`);
      const healthBody = await healthResponse.json();
      expect(healthBody).toMatchObject({
        ok: false,
        stage: 'state-file-overwrite',
        targetPath: adminInfoPath,
        fileName: '.admin-server-info.json',
      });
    } finally {
      await server.close();
    }
  });

  it('falls back to pnpm install when npm install fails', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-pnpm-fallback-');
    writeMakeClientMarker(projectRoot, 'pnpm-fallback-client', 'PNPM Fallback Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'pnpm-fallback-client', 'PNPM Fallback Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        throw Object.assign(new Error('npm registry unavailable'), {
          stderr: 'npm registry unavailable',
        });
      }
      if (command === 'pnpm' && args[0] === 'install') {
        writeInstalledMakeClientDependencies(projectRoot);
      }
      return {
        stdout: '',
        stderr: '',
        command,
        escapedCommand: [command, ...args].join(' '),
      };
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51729,
        host: 'localhost',
        origin: 'http://localhost:51729',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/pnpm-fallback-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'pnpm-fallback-client',
        runtime: {
          origin: 'http://localhost:51729',
        },
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--prod=false'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({
          cwd: projectRoot,
          env: expect.objectContaining({
            AXHUB_MAKE_SKIP_AUTO_START_SERVER: '1',
            PATH: expect.any(String),
          }),
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('does not require pnpm when npm install succeeds', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-no-pnpm-npm-fallback-');
    writeMakeClientMarker(projectRoot, 'no-pnpm-npm-fallback-client', 'No PNPM NPM Fallback Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'no-pnpm-npm-fallback-client', 'No PNPM NPM Fallback Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'pnpm' && args[0] === 'install') {
        throw Object.assign(new Error('spawn pnpm ENOENT'), {
          code: 'ENOENT',
        });
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        writeInstalledMakeClientDependencies(projectRoot);
      }
      return localCommandResult(command, args);
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51733,
        host: 'localhost',
        origin: 'http://localhost:51733',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/no-pnpm-npm-fallback-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'no-pnpm-npm-fallback-client',
        runtime: {
          origin: 'http://localhost:51733',
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('pnpm', expect.any(Array), expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'pnpm',
        ['dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('retries npm install with legacy peer deps when npm arborist crashes', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-npm-arborist-retry-');
    writeMakeClientMarker(projectRoot, 'npm-arborist-retry-client', 'NPM Arborist Retry Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'npm-arborist-retry-client', 'NPM Arborist Retry Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install' && !args.includes('--legacy-peer-deps')) {
        throw Object.assign(new Error("Cannot read properties of null (reading 'edgesOut')"), {
          stderr: "Cannot read properties of null (reading 'edgesOut')",
        });
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install' && args.includes('--legacy-peer-deps')) {
        writeInstalledMakeClientDependencies(projectRoot);
      }
      if (command === 'pnpm' && args[0] === 'install') {
        throw Object.assign(new Error('pnpm should not be used after npm legacy retry succeeds'), {
          stderr: 'pnpm should not be used after npm legacy retry succeeds',
        });
      }
      return localCommandResult(command, args);
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51734,
        host: 'localhost',
        origin: 'http://localhost:51734',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/npm-arborist-retry-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'npm-arborist-retry-client',
        runtime: {
          origin: 'http://localhost:51734',
        },
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev', '--legacy-peer-deps'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('pnpm', expect.any(Array), expect.any(Object));
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('uses a long timeout for make client dependency installation', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-install-timeout-');
    writeMakeClientMarker(projectRoot, 'install-timeout-client', 'Install Timeout Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'install-timeout-client', 'Install Timeout Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        throw Object.assign(new Error('npm registry unavailable'), {
          stderr: 'npm registry unavailable',
        });
      }
      if (command === 'pnpm' && args[0] === 'install') {
        writeInstalledMakeClientDependencies(projectRoot);
      }
      return localCommandResult(command, args);
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51731,
        host: 'localhost',
        origin: 'http://localhost:51731',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/install-timeout-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      expect(ensureResponse.status).toBe(200);

      const installTimeouts = runLocalCommandMock.mock.calls
        .filter(([, args]) => args[0] === 'install')
        .map(([, , options]) => Number((options as any)?.timeoutMs));
      expect(installTimeouts).toHaveLength(2);
      expect(installTimeouts).toEqual([600_000, 600_000]);
    } finally {
      await server.close();
    }
  });

  it('starts with local vite when dependencies are installed but pnpm is unavailable', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-installed-no-pnpm-');
    writeMakeClientMarker(projectRoot, 'installed-no-pnpm-client', 'Installed No PNPM Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'installed-no-pnpm-client', 'Installed No PNPM Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'pnpm' && args[0] === '--version') {
        throw Object.assign(new Error('pnpm command not found'), {
          code: 'ENOENT',
        });
      }
      return localCommandResult(command, args);
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51730,
        host: 'localhost',
        origin: 'http://localhost:51730',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/installed-no-pnpm-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'installed-no-pnpm-client',
        runtime: {
          origin: 'http://localhost:51730',
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'pnpm',
        ['dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({
          cwd: projectRoot,
          env: expect.objectContaining({
            AXHUB_MAKE_SKIP_AUTO_START_SERVER: '1',
            PATH: expect.any(String),
          }),
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('starts with local vite after pnpm fallback install so pnpm dev is not required at runtime', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-spawn-enoent-');
    writeMakeClientMarker(projectRoot, 'pnpm-install-local-vite-client', 'PNPM Install Local Vite Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'pnpm-install-local-vite-client', 'PNPM Install Local Vite Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        throw Object.assign(new Error('npm registry unavailable'), {
          stderr: 'npm registry unavailable',
        });
      }
      if (command === 'pnpm' && args[0] === 'install') {
        writeInstalledMakeClientDependencies(projectRoot);
      }
      return localCommandResult(command, args);
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51732,
        host: 'localhost',
        origin: 'http://localhost:51732',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/pnpm-install-local-vite-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'pnpm-install-local-vite-client',
        runtime: {
          origin: 'http://localhost:51732',
        },
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--prod=false'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'pnpm',
        ['dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('returns an install error instead of falling back to pnpm dev when Vite is missing after install', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-missing-vite-');
    writeMakeClientMarker(projectRoot, 'missing-vite-client', 'Missing Vite Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'missing-vite-client', 'Missing Vite Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => localCommandResult(command, args));
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/missing-vite-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(500);
      expect(ensureBody).toMatchObject({
        code: 'MAKE_CLIENT_INSTALL_FAILED',
        phase: 'install',
      });
      expect(String(ensureBody.error)).toContain('Make client vite dependency is missing after install');
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('pnpm', expect.any(Array), expect.any(Object));
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'pnpm',
        ['dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('returns a dev startup error instead of crashing when the dev spawn command is missing', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-spawn-enoent-');
    writeMakeClientMarker(projectRoot, 'spawn-enoent-client', 'Spawn ENOENT Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'spawn-enoent-client', 'Spawn ENOENT Client');
    childProcessMock.spawn.mockImplementation(() => {
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(Object.assign(new Error('spawn node ENOENT'), {
              code: 'ENOENT',
              syscall: 'spawn node',
            })), 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/spawn-enoent-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(500);
      expect(ensureBody).toMatchObject({
        code: 'MAKE_CLIENT_DEV_FAILED',
        phase: 'dev',
      });
      expect(String(ensureBody.error)).toContain('spawn node ENOENT');
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('waits for fresh runtime info instead of returning an old stale file after spawning dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-fresh-ensure-');
    writeMakeClientMarker(projectRoot, 'fresh-ensure-client', 'Fresh Ensure Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'fresh-ensure-client', 'Fresh Ensure Client');
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: 9,
      host: 'localhost',
      origin: 'http://127.0.0.1:9',
      projectRoot,
      startedAt: '2026-05-01T00:00:00.000Z',
      timestamp: '2026-05-01T00:00:00.000Z',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      setTimeout(() => {
        writeServerInfo(targetRoot, 'runtime', {
          pid: process.pid,
          port: 51727,
          host: 'localhost',
          origin: 'http://localhost:51727',
          projectRoot: targetRoot,
          startedAt: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        });
      }, 20);
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const ensureResponse = await fetch(`${server.origin}/api/projects/fresh-ensure-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 250, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'fresh-ensure-client',
        reused: false,
        runtime: {
          origin: 'http://localhost:51727',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects non-make projects before they enter the project registry', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-non-make-client-');
    writeMakeClientMetadata(projectRoot, 'plain-client', 'Plain Client');
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      const registerBody = await registerResponse.json();
      expect(registerResponse.status).toBe(400);
      expect(registerBody).toMatchObject({ code: 'NOT_MAKE_CLIENT_PROJECT' });

      const statusResponse = await fetch(`${server.origin}/api/projects/plain-client/dev/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(404);
      expect(statusBody).toMatchObject({
        code: 'project-not-found',
        projectId: 'plain-client',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('rejects metadata-only folders when registering an existing make client project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const metadataOnlyRoot = createTempRoot('axhub-make-metadata-only-');
    writeMakeClientMetadata(metadataOnlyRoot, 'metadata-only', 'Metadata Only');
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: metadataOnlyRoot }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'NOT_MAKE_CLIENT_PROJECT',
        root: metadataOnlyRoot,
      });
    } finally {
      await server.close();
    }
  });

  it('rejects dot-segment make client project ids', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-dot-id-');
    writeMakeClientMarker(projectRoot, '.', 'Dot Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, '.', 'Dot Client');
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({ code: 'NOT_MAKE_CLIENT_PROJECT' });
    } finally {
      await server.close();
    }
  });

  it('registers a marker-backed make client project and ensures dev before activating it', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-existing-');
    writeMakeClientMarker(projectRoot, 'existing-client', 'Existing Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'existing-client', 'Existing Client');
    const server = await startTestServer(defaultRoot);
    const runtimeServer = await startTestServer(projectRoot);

    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: process.pid,
        port: runtimeServer.port,
        host: 'localhost',
        origin: runtimeServer.origin,
        projectRoot,
        startedAt: new Date().toISOString(),
      });

      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      const registerBody = await registerResponse.json();

      expect(registerResponse.status).toBe(201);
      expect(registerBody.project).toMatchObject({
        id: 'existing-client',
        name: 'Existing Client',
        root: projectRoot,
      });

      const ensureResponse = await fetch(`${server.origin}/api/projects/existing-client/dev/ensure`, {
        method: 'POST',
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(200);
      expect(ensureBody).toMatchObject({
        success: true,
        projectId: 'existing-client',
        reused: true,
        runtime: {
          origin: runtimeServer.origin,
        },
      });
      expect(fs.existsSync(getAdminServerInfoPath(projectRoot))).toBe(true);

      const activeResponse = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'existing-client' }),
      });
      expect(activeResponse.status).toBe(200);
    } finally {
      await runtimeServer.close();
      await server.close();
    }
  });

  it('does not reuse metadata-only runtime files for project switching', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-metadata-only-client-');
    writeMakeClientMetadata(projectRoot, 'metadata-only-client', 'Metadata Only Client');
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: 51725,
      host: 'localhost',
      origin: 'http://localhost:51725',
      projectRoot,
      startedAt: new Date().toISOString(),
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(400);

      const ensureResponse = await fetch(`${server.origin}/api/projects/metadata-only-client/dev/ensure`, {
        method: 'POST',
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(404);
      expect(ensureBody).toMatchObject({
        code: 'project-not-found',
        projectId: 'metadata-only-client',
      });
      expect(childProcessMock.execFile).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('starts dev while registering an existing make client project when requested', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-register-dev-');
    writeMakeClientMarker(projectRoot, 'register-dev-client', 'Register Dev Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'register-dev-client', 'Register Dev Client');
    childProcessMock.spawn.mockImplementation((_file?: string, _args?: string[], options?: { cwd?: string }) => {
      const targetRoot = String(options?.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51722,
        host: 'localhost',
        origin: 'http://localhost:51722',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot, ensureDev: true, timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        project: {
          id: 'register-dev-client',
        },
        runtime: {
          origin: 'http://localhost:51722',
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalledWith(
        'pnpm',
        ['dev'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({
          cwd: projectRoot,
          env: expect.objectContaining({
            AXHUB_MAKE_SKIP_AUTO_START_SERVER: '1',
            PATH: expect.any(String),
          }),
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('does not register an existing make client project when dev startup fails during registration', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const projectRoot = createTempRoot('axhub-make-client-register-fails-');
    writeMakeClientMarker(projectRoot, 'register-fails-client', 'Register Fails Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'register-fails-client', 'Register Fails Client');
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot, ensureDev: true, timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const body = await response.json();
      const projectsBody = await fetch(`${server.origin}/api/projects`).then((projectsResponse) => projectsResponse.json());

      expect(response.status).toBe(504);
      expect(body).toMatchObject({ code: 'MAKE_CLIENT_DEV_TIMEOUT' });
      expect(projectsBody.projects.some((project: any) => project.id === 'register-fails-client')).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('creates a blank make client project from the primary remote template and starts dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startTestServer(defaultRoot, registryHome);

    installRemoteTemplateCommandMock({
      metadataId: 'sales-demo',
      metadataName: 'Sales Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeMakeClientMetadata(targetRoot, 'sales-demo', 'Sales Demo');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51721,
        host: 'localhost',
        origin: 'http://localhost:51721',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Sales Demo',
          projectName: 'Sales Demo',
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'Sales Demo');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        phase: 'ready',
        project: {
          id: 'Sales Demo',
          name: 'Sales Demo',
          root: targetRoot,
        },
        runtime: {
          origin: 'http://localhost:51721',
        },
      });
      expect(fs.existsSync(path.join(targetRoot, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, 'scripts', 'sync-project-metadata.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, 'src', 'prototypes', 'template-home', 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, '.git'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.agents', 'skills', 'local', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, '.claude', 'skills', 'local', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, 'node_modules', 'left-pad'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'node_modules', 'vite'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, 'dist'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'tests'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.trae'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'temp'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(targetRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'))).toEqual({});
      expect(JSON.parse(fs.readFileSync(path.join(targetRoot, '.axhub', 'make', 'sidebar-tree.json'), 'utf8'))).toMatchObject({
        themesTree: [
          expect.objectContaining({
            id: 'folder-themes-test',
            title: '行业',
          }),
        ],
      });
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', 'client.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', 'sessions'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', 'exports'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', 'edit-history'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(getRuntimeServerInfoPath(targetRoot), 'utf8'))).toMatchObject({
        origin: 'http://localhost:51721',
      });
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8'))).toMatchObject({
        repository: TEMPLATE_SOURCE_URL,
        templateUrl: TEMPLATE_ZIP_URL,
        templateVersion: DEFAULT_TEMPLATE_VERSION,
        project: {
          id: 'Sales Demo',
          name: 'Sales Demo',
        },
      });
      expect(childProcessMock.execFile).not.toHaveBeenCalledWith(
        'git',
        expect.any(Array),
        expect.any(Object),
        expect.any(Function),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'git',
        expect.any(Array),
        expect.any(Object),
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        TEMPLATE_ZIP_URL,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        TEMPLATE_MIRROR_ZIP_URL,
        expect.any(Object),
      );
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: targetRoot }),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['metadata:sync'],
        expect.anything(),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(targetRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({
          cwd: targetRoot,
          detached: true,
          env: expect.objectContaining({ PATH: expect.any(String) }),
        }),
      );
      expect(fs.existsSync(getRuntimeServerInfoPath(targetRoot))).toBe(true);
      expect(fs.existsSync(getProjectMetadataPath(targetRoot))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('copies a make client project, rewrites identity, reuses copied node_modules, and starts dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const sourceRoot = createTempRoot('axhub-make-client-copy-source-');
    const parentRoot = createTempRoot('axhub-make-copy-parent-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    writeMakeClientMarker(sourceRoot, 'source-client', 'Source Client');
    writeMakeClientPackage(sourceRoot);
    writeInstalledMakeClientDependencies(sourceRoot);
    writeProjectMetadata(sourceRoot, {
      project: { id: 'source-client', name: 'Source Client' },
      resources: {
        prototypes: [],
        docs: [
          {
            id: 'spec',
            name: 'spec',
            title: 'Spec',
            path: path.join(sourceRoot, 'docs', 'spec.md'),
          },
        ],
        themes: [],
        data: [],
        templates: [],
      },
    }, { makeClientMarker: false });
    fs.mkdirSync(path.join(sourceRoot, 'src', 'prototypes', 'source'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'src', 'prototypes', 'source', 'index.tsx'), 'export default function Source() { return null; }\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, '.git'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '.git', 'config'), '[core]\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, '.git-versions', 'abc12345'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '.git-versions', 'abc12345', 'index.tsx'), 'export default function Snapshot() { return null; }\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'dist', 'bundle.js'), 'console.log("dist");\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, '.vite'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '.vite', 'cache.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '.cache', 'cache.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, '.local'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '.local', 'note.txt'), 'local\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'coverage', 'coverage.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'tmp', 'scratch.txt'), 'scratch\n', 'utf8');
    fs.mkdirSync(path.join(sourceRoot, 'temp'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'temp', 'scratch.txt'), 'scratch\n', 'utf8');
    writeServerInfo(sourceRoot, 'runtime', {
      pid: process.pid,
      port: 51720,
      host: 'localhost',
      origin: 'http://localhost:51720',
      projectRoot: sourceRoot,
      startedAt: new Date().toISOString(),
    });
    fs.writeFileSync(path.join(sourceRoot, '.axhub', 'make', '.admin-server-info.json'), '{}\n', 'utf8');
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51741,
        host: 'localhost',
        origin: 'http://localhost:51741',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot, registryHome);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: sourceRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const response = await fetch(`${server.origin}/api/projects/source-client/make-client/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'copied-client',
          projectName: 'Copied Client',
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'copied-client');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        phase: 'ready',
        copiedDependencies: true,
        installMethod: 'skipped',
        project: {
          id: 'copied-client',
          name: 'Copied Client',
          root: targetRoot,
        },
        runtime: {
          origin: 'http://localhost:51741',
        },
      });
      expect(fs.existsSync(path.join(targetRoot, 'src', 'prototypes', 'source', 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, 'node_modules', 'vite', 'bin', 'vite.js'))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, '.git'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.git-versions'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'dist'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.vite'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.cache'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.local'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'coverage'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'tmp'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'temp'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', '.dev-server-info.json'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8'))).toMatchObject({
        repository: TEMPLATE_SOURCE_URL,
        project: {
          id: 'copied-client',
          name: 'Copied Client',
        },
      });
      expect(JSON.parse(fs.readFileSync(getProjectMetadataPath(targetRoot), 'utf8'))).toMatchObject({
        project: {
          id: 'copied-client',
          name: 'Copied Client',
        },
        resources: {
          docs: [
            expect.objectContaining({
              path: path.join(targetRoot, 'docs', 'spec.md'),
            }),
          ],
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: targetRoot }),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'pnpm',
        ['install', '--prod=false'],
        expect.objectContaining({ cwd: targetRoot }),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(targetRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({ cwd: targetRoot }),
      );
      const projectsBody = await fetch(`${server.origin}/api/projects`).then((projectsResponse) => projectsResponse.json());
      expect(projectsBody.activeProjectId).toBe('copied-client');
    } finally {
      await server.close();
    }
  });

  it('clones a make client project from a Git URL, registers it, and starts dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-clone-parent-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const gitUrl = 'https://github.com/example/full-client.git';
    let cloneCommandOptions: any = null;
    runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
      if (command === 'git' && args[0] === 'clone') {
        const targetRoot = String(args[2] || '');
        cloneCommandOptions = commandOptions;
        expect(args).toEqual(['clone', gitUrl, path.join(parentRoot, 'cloned-client')]);
        expect(commandOptions?.cwd).toBe(parentRoot);
        fs.mkdirSync(targetRoot, { recursive: true });
        writeMakeClientMarker(targetRoot, 'source-clone-id', 'Source Clone Name');
        writeMakeClientPackage(targetRoot);
        writeProjectMetadata(targetRoot, {
          project: { id: 'source-clone-id', name: 'Source Clone Name' },
        }, { makeClientMarker: false });
        return localCommandResult(command, args);
      }
      if ((command === 'pnpm' || command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        writeInstalledMakeClientDependencies(String(commandOptions?.cwd || ''));
      }
      return localCommandResult(command, args);
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51742,
        host: 'localhost',
        origin: 'http://localhost:51742',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot, registryHome);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'cloned-client',
          projectName: 'Cloned Client',
          gitUrl,
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'cloned-client');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        phase: 'ready',
        project: {
          id: 'cloned-client',
          name: 'Cloned Client',
          root: targetRoot,
        },
        marker: {
          repository: gitUrl,
          project: {
            id: 'cloned-client',
            name: 'Cloned Client',
          },
        },
        runtime: {
          origin: 'http://localhost:51742',
        },
      });
      expect(fs.existsSync(path.join(targetRoot, '.axhub', 'make', 'client.json'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(getProjectMetadataPath(targetRoot), 'utf8'))).toMatchObject({
        project: {
          id: 'cloned-client',
          name: 'Cloned Client',
        },
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        'git',
        ['clone', gitUrl, targetRoot],
        expect.objectContaining({
          cwd: parentRoot,
          timeoutMs: 60_000,
          env: expect.objectContaining({
            GIT_TERMINAL_PROMPT: '0',
            GCM_INTERACTIVE: 'never',
          }),
        }),
      );
      expect(cloneCommandOptions?.timeoutMs).toBe(60_000);
      expect(cloneCommandOptions?.env).toMatchObject({
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['--depth']),
        expect.any(Object),
      );
      const projectsBody = await fetch(`${server.origin}/api/projects`).then((projectsResponse) => projectsResponse.json());
      expect(projectsBody.activeProjectId).toBe('cloned-client');
    } finally {
      await server.close();
    }
  });

  it('returns an AI handoff prompt when cloning a make client project fails', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-clone-failed-parent-');
    const gitUrl = 'git@github.com:example/private-client.git';
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'clone') {
        const error = new Error('Permission denied (publickey)') as Error & { stderr?: string; code?: string };
        error.stderr = 'Permission denied (publickey)';
        error.code = 'AUTH_FAILED';
        throw error;
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'private-client',
          projectName: 'Private Client',
          gitUrl,
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toMatchObject({
        code: 'MAKE_CLIENT_GIT_CLONE_FAILED',
        phase: 'clone',
        promptScene: 'git-clone',
        gitUrl,
        projectRoot: path.join(parentRoot, 'private-client'),
      });
      expect(body.prompt).toContain('请帮我克隆并接入 Axhub Make 客户端项目');
      expect(body.prompt).toContain(`Git 地址：${gitUrl}`);
      expect(body.prompt).toContain('Permission denied (publickey)');
      expect(fs.existsSync(path.join(parentRoot, 'private-client'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('returns an AI handoff prompt when a cloned repository is not a make client project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-clone-invalid-parent-');
    const gitUrl = 'https://github.com/example/not-make-client.git';
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'git' && args[0] === 'clone') {
        const targetRoot = String(args[2] || '');
        fs.mkdirSync(targetRoot, { recursive: true });
        fs.writeFileSync(path.join(targetRoot, 'README.md'), '# Not Make Client\n', 'utf8');
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const response = await fetch(`${server.origin}/api/projects/make/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'invalid-client',
          projectName: 'Invalid Client',
          gitUrl,
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'invalid-client');

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'NOT_MAKE_CLIENT_PROJECT',
        phase: 'clone',
        promptScene: 'git-clone',
        gitUrl,
        projectRoot: targetRoot,
      });
      expect(body.prompt).toContain('请帮我克隆并接入 Axhub Make 客户端项目');
      expect(body.prompt).toContain(`Git 地址：${gitUrl}`);
      expect(body.prompt).toContain(`目标目录：${targetRoot}`);
      expect(body.prompt).toContain('仓库不是 Axhub Make 客户端项目');
      expect(body.prompt).toContain('.axhub/make/client.json');
      expect(fs.existsSync(targetRoot)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('deletes invalid copied node_modules and falls back to installing dependencies', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const sourceRoot = createTempRoot('axhub-make-client-copy-invalid-deps-source-');
    const parentRoot = createTempRoot('axhub-make-copy-invalid-deps-parent-');
    writeMakeClientMarker(sourceRoot, 'invalid-deps-source', 'Invalid Deps Source');
    writeMakeClientPackage(sourceRoot);
    writeInvalidMakeClientDependencies(sourceRoot);
    writeMakeClientMetadata(sourceRoot, 'invalid-deps-source', 'Invalid Deps Source');
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51742,
        host: 'localhost',
        origin: 'http://localhost:51742',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: sourceRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const response = await fetch(`${server.origin}/api/projects/invalid-deps-source/make-client/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'copy-installed-deps',
          projectName: 'Copy Installed Deps',
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'copy-installed-deps');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        phase: 'ready',
        copiedDependencies: false,
        installMethod: 'npm',
        project: {
          id: 'copy-installed-deps',
          name: 'Copy Installed Deps',
          root: targetRoot,
        },
      });
      expect(fs.existsSync(path.join(targetRoot, 'node_modules', 'vite', 'bin', 'missing.js'))).toBe(false);
      expect(fs.existsSync(path.join(targetRoot, 'node_modules', 'vite', 'bin', 'vite.js'))).toBe(true);
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: targetRoot }),
      );
      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        process.execPath,
        [path.join(targetRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
        expect.objectContaining({ cwd: targetRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('logs progress timings while creating a blank make client project', async () => {
    vi.stubEnv('AXHUB_MAKE_PROGRESS_LOG', '1');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startTestServer(defaultRoot, registryHome);

    installRemoteTemplateCommandMock({
      metadataId: 'progress-demo',
      metadataName: 'Progress Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeMakeClientMetadata(targetRoot, 'progress-demo', 'Progress Demo');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51722,
        host: 'localhost',
        origin: 'http://localhost:51722',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Progress Demo',
          projectName: 'Progress Demo',
        }),
      });
      const body = await response.json();
      const output = infoSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n');

      expect(response.status).toBe(201);
      expect(body.progress).toMatchObject({
        status: 'success',
        totalMs: expect.any(Number),
        steps: expect.arrayContaining([
          expect.objectContaining({ id: 'download-template', label: '下载模板', durationMs: expect.any(Number), status: 'done' }),
          expect.objectContaining({ id: 'write-project', label: '写入项目', durationMs: expect.any(Number), status: 'done' }),
          expect.objectContaining({ id: 'install', label: '安装依赖', durationMs: expect.any(Number), status: 'done' }),
          expect.objectContaining({ id: 'dev', label: '启动客户端', durationMs: expect.any(Number), status: 'done' }),
        ]),
      });
      expect(output).toContain('[make-client:create]');
      expect(output).toContain('step=start id=download-template label=下载模板');
      expect(output).toContain('step=done id=download-template label=下载模板 durationMs=');
      expect(output).toContain('step=start id=write-project label=写入项目');
      expect(output).toContain('step=done id=write-project label=写入项目 durationMs=');
      expect(output).toContain('step=start id=install label=安装依赖');
      expect(output).toContain('step=done id=install label=安装依赖 durationMs=');
      expect(output).toContain('step=start id=dev label=启动客户端');
      expect(output).toContain('step=done id=dev label=启动客户端 durationMs=');
      expect(output).toMatch(/summary status=success totalMs=\d+/u);
      expect(output).toContain('download-template=');
      expect(output).toContain('write-project=');
      expect(output).toContain('install=');
      expect(output).toContain('dev=');
    } finally {
      await server.close();
    }
  });

  it('writes project metadata before returning a successful blank make client creation', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startTestServer(defaultRoot, registryHome);

    installRemoteTemplateCommandMock();
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51729,
        host: 'localhost',
        origin: 'http://localhost:51729',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'make07',
          projectName: 'make07',
        }),
      });
      const targetRoot = path.join(parentRoot, 'make07');
      const metadataPath = getProjectMetadataPath(targetRoot);

      expect(response.status).toBe(201);
      expect(fs.existsSync(metadataPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(metadataPath, 'utf8'))).toMatchObject({
        project: {
          id: 'make07',
          name: 'make07',
        },
      });

      const resourcesResponse = await fetch(`${server.origin}/api/projects/make07/resources`);
      const resourcesBody = await resourcesResponse.json();

      expect(resourcesResponse.status).toBe(200);
      expect(resourcesBody.project).toMatchObject({
        id: 'make07',
        name: 'make07',
      });
    } finally {
      await server.close();
    }
  });

  it('falls back to the Gitee mirror when the primary remote template download fails', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);

    installRemoteTemplateCommandMock({
      failPrimary: true,
      metadataId: 'mirror-demo',
      metadataName: 'Mirror Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51724,
        host: 'localhost',
        origin: 'http://localhost:51724',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Mirror Demo',
          projectName: 'Mirror Demo',
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'Mirror Demo');

      expect(response.status).toBe(201);
      expect(body.project).toMatchObject({
        id: 'Mirror Demo',
        name: 'Mirror Demo',
        root: targetRoot,
      });
      expect(fs.existsSync(path.join(targetRoot, 'package.json'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8'))).toMatchObject({
        repository: TEMPLATE_MIRROR_SOURCE_URL,
        templateUrl: TEMPLATE_MIRROR_ZIP_URL,
        templateVersion: DEFAULT_TEMPLATE_VERSION,
        project: {
          id: 'Mirror Demo',
          name: 'Mirror Demo',
        },
      });
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('git', expect.any(Array), expect.any(Object));
      expect(globalThis.fetch).toHaveBeenCalledWith(TEMPLATE_ZIP_URL, expect.any(Object));
      expect(globalThis.fetch).toHaveBeenCalledWith(TEMPLATE_MIRROR_ZIP_URL, expect.any(Object));
    } finally {
      await server.close();
    }
  });

  it('uses AXHUB_MAKE_CLIENT_TEMPLATE_URL as the only template source', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const customTemplateUrl = 'https://download.example.test/custom-template.zip';
    vi.stubEnv('AXHUB_MAKE_CLIENT_TEMPLATE_URL', customTemplateUrl);
    const server = await startTestServer(defaultRoot);

    installRemoteTemplateCommandMock({
      customTemplateUrl,
      metadataId: 'custom-template-demo',
      metadataName: 'Custom Template Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51725,
        host: 'localhost',
        origin: 'http://localhost:51725',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Custom Template Demo',
          projectName: 'Custom Template Demo',
        }),
      });
      const targetRoot = path.join(parentRoot, 'Custom Template Demo');

      expect(response.status).toBe(201);
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8'))).toMatchObject({
        repository: customTemplateUrl,
        templateUrl: customTemplateUrl,
      });
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8')).templateVersion).toBeUndefined();
      expect((globalThis.fetch as any).mock.calls.filter(([url]: [string]) => String(url).includes('template.zip'))).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(customTemplateUrl, expect.any(Object));
      expect(globalThis.fetch).not.toHaveBeenCalledWith(TEMPLATE_ZIP_URL, expect.any(Object));
      expect(globalThis.fetch).not.toHaveBeenCalledWith(TEMPLATE_MIRROR_ZIP_URL, expect.any(Object));
    } finally {
      await server.close();
    }
  });

  it('reuses a cached template zip for the same URL when no template version is configured', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const customTemplateUrl = 'https://download.example.test/cached-template.zip';
    vi.stubEnv('AXHUB_MAKE_CLIENT_TEMPLATE_URL', customTemplateUrl);
    const server = await startTestServer(defaultRoot);

    installRemoteTemplateCommandMock({
      customTemplateUrl,
      metadataId: 'cached-template-demo',
      metadataName: 'Cached Template Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51726,
        host: 'localhost',
        origin: 'http://localhost:51726',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      return {
        once: vi.fn(),
        unref: vi.fn(),
      } as any;
    });

    try {
      const first = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Cached Template One',
          projectName: 'Cached Template One',
        }),
      });
      const second = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Cached Template Two',
          projectName: 'Cached Template Two',
        }),
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect((globalThis.fetch as any).mock.calls.filter(([url]: [string]) => url === customTemplateUrl)).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('reuses a cached template zip when the template version is unchanged even if the file is older than 24 hours', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);

    installRemoteTemplateCommandMock({
      metadataId: 'expired-template-demo',
      metadataName: 'Expired Template Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51727,
        host: 'localhost',
        origin: 'http://localhost:51727',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      return {
        once: vi.fn(),
        unref: vi.fn(),
      } as any;
    });

    try {
      const first = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Expired Template One',
          projectName: 'Expired Template One',
        }),
      });
      const originalStatSync = fs.statSync;
      const expiredMtime = new Date(Date.now() - (25 * 60 * 60 * 1000));
      vi.spyOn(fs, 'statSync').mockImplementation(((filePath: fs.PathLike, options?: any) => {
        const stats = originalStatSync(filePath, options);
        if (String(filePath).includes('make-client-template-cache')) {
          Object.defineProperty(stats, 'mtimeMs', { value: expiredMtime.getTime() });
        }
        return stats;
      }) as typeof fs.statSync);
      const second = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Expired Template Two',
          projectName: 'Expired Template Two',
        }),
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect((globalThis.fetch as any).mock.calls.filter(([url]: [string]) => url === TEMPLATE_ZIP_URL)).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('downloads the template zip again when the cached version does not match the configured version', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);
    const cachePath = templateCachePath(TEMPLATE_ZIP_URL);

    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, createMakeClientTemplateZip());
    writeJson(templateCacheManifestPath(TEMPLATE_ZIP_URL), {
      schemaVersion: 1,
      templateVersion: '0.1.1',
      url: TEMPLATE_ZIP_URL,
      cachedAt: new Date().toISOString(),
    });

    installRemoteTemplateCommandMock({
      metadataId: 'version-mismatch-template-demo',
      metadataName: 'Version Mismatch Template Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51728,
        host: 'localhost',
        origin: 'http://localhost:51728',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      return {
        once: vi.fn(),
        unref: vi.fn(),
      } as any;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Version Mismatch Template',
          projectName: 'Version Mismatch Template',
        }),
      });

      expect(response.status).toBe(201);
      expect((globalThis.fetch as any).mock.calls.filter(([url]: [string]) => url === TEMPLATE_ZIP_URL)).toHaveLength(1);
      expect(JSON.parse(fs.readFileSync(templateCacheManifestPath(TEMPLATE_ZIP_URL), 'utf8'))).toMatchObject({
        templateVersion: DEFAULT_TEMPLATE_VERSION,
        url: TEMPLATE_ZIP_URL,
      });
    } finally {
      await server.close();
    }
  });

  it('uses a long timeout for remote template zip downloads', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);

    installRemoteTemplateCommandMock({
      failPrimary: true,
      metadataId: 'template-timeout-demo',
      metadataName: 'Template Timeout Demo',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51732,
        host: 'localhost',
        origin: 'http://localhost:51732',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Template Timeout Demo',
          projectName: 'Template Timeout Demo',
        }),
      });

      expect(response.status).toBe(201);
      const signals = (globalThis.fetch as any).mock.calls
        .filter(([url]: [string]) => [TEMPLATE_ZIP_URL, TEMPLATE_MIRROR_ZIP_URL].includes(String(url)))
        .map(([, options]: [string, RequestInit]) => options?.signal);
      expect(signals).toEqual([expect.any(AbortSignal), expect.any(AbortSignal)]);
    } finally {
      await server.close();
    }
  });

  it('ignores request-supplied templateRoot because the template is server-owned', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const missingTemplateRoot = path.join(createTempRoot('axhub-make-missing-template-parent-'), 'missing-template');
    const server = await startTestServer(defaultRoot);

    installRemoteTemplateCommandMock({
      metadataId: 'owned-template',
      metadataName: 'Owned Template',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51723,
        host: 'localhost',
        origin: 'http://localhost:51723',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Owned Template',
          projectName: 'Owned Template',
          templateRoot: missingTemplateRoot,
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'Owned Template');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        phase: 'ready',
        project: {
          id: 'Owned Template',
          root: targetRoot,
        },
      });
      expect(fs.existsSync(path.join(targetRoot, 'package.json'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8'))).toMatchObject({
        repository: TEMPLATE_SOURCE_URL,
        project: {
          id: 'Owned Template',
          name: 'Owned Template',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('preserves an explicitly blank project name when creating a blank make client project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startTestServer(defaultRoot, registryHome);

    installRemoteTemplateCommandMock({
      metadataId: 'untitled-client',
      metadataName: '',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeMakeClientMetadata(targetRoot, 'untitled-client', '');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51724,
        host: 'localhost',
        origin: 'http://localhost:51724',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Untitled Client',
          projectName: '',
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, 'Untitled Client');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        project: {
          id: 'Untitled Client',
          name: '',
          root: targetRoot,
        },
        marker: {
          project: {
            id: 'Untitled Client',
            name: '',
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('creates a blank make client project in a real Chinese folder without ASCII slugging', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-中文-');
    const registryHome = createTempRoot('axhub-make-projects-api-home-');
    const server = await startTestServer(defaultRoot, registryHome);

    installRemoteTemplateCommandMock({
      metadataId: '中文项目',
      metadataName: '中文项目',
    });
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeMakeClientMetadata(targetRoot, '中文项目', '中文项目');
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51725,
        host: 'localhost',
        origin: 'http://localhost:51725',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: '中文项目',
          projectName: '中文项目',
        }),
      });
      const body = await response.json();
      const targetRoot = path.join(parentRoot, '中文项目');

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        project: {
          id: '中文项目',
          name: '中文项目',
          root: targetRoot,
        },
        marker: {
          project: {
            id: '中文项目',
            name: '中文项目',
          },
        },
      });
      expect(fs.existsSync(path.join(parentRoot, '中文项目'))).toBe(true);
      expect(fs.existsSync(path.join(parentRoot, 'make-project'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(targetRoot), 'utf8'))).toMatchObject({
        project: {
          id: '中文项目',
          name: '中文项目',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('reports a clear error when all remote make client template sources fail', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);
    installRemoteTemplateCommandMock({
      failPrimary: true,
      failMirror: true,
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Missing Template',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
        phase: 'template',
      });
      expect(body.details.sources).toEqual([
        expect.objectContaining({ url: TEMPLATE_ZIP_URL }),
        expect.objectContaining({ url: TEMPLATE_MIRROR_ZIP_URL }),
      ]);
      expect(childProcessMock.execFile).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('rejects unsafe remote make client template zip entries before writing the target project', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);
    installRemoteTemplateCommandMock({
      unsafePrimaryZipEntry: '../evil.txt',
      failMirror: true,
    });

    try {
      const response = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentRoot,
          folderName: 'Unsafe Template',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
        phase: 'template',
      });
      expect(body.details.sources[0]).toMatchObject({
        url: TEMPLATE_ZIP_URL,
      });
      expect(String(body.details.sources[0].error)).toContain('unsafe');
      expect(fs.existsSync(path.join(parentRoot, 'Unsafe Template'))).toBe(false);
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('rejects unsafe or existing blank project target folders', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot);
    const parentRoot = createTempRoot('axhub-make-parent-');
    const server = await startTestServer(defaultRoot);
    installRemoteTemplateCommandMock();
    childProcessMock.spawn.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      const targetRoot = String(options.cwd || '');
      writeMakeClientMetadata(targetRoot, path.basename(targetRoot), path.basename(targetRoot));
      writeServerInfo(targetRoot, 'runtime', {
        pid: process.pid,
        port: 51721,
        host: 'localhost',
        origin: 'http://localhost:51721',
        projectRoot: targetRoot,
        startedAt: new Date().toISOString(),
      });
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      const unsafe = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentRoot, folderName: '../escape' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(unsafe.status).toBe(400);
      expect(unsafe.body).toMatchObject({ code: 'INVALID_MAKE_PROJECT_FOLDER_NAME' });

      const emptyRoot = path.join(parentRoot, 'empty-client');
      fs.mkdirSync(emptyRoot, { recursive: true });

      const empty = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentRoot, folderName: 'empty-client' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(empty.status).toBe(409);
      expect(empty.body).toMatchObject({ code: 'MAKE_PROJECT_TARGET_NOT_EMPTY' });
      expect(fs.existsSync(getMakeClientMarkerPath(emptyRoot))).toBe(false);

      const existingRoot = path.join(parentRoot, 'existing-client');
      fs.mkdirSync(existingRoot, { recursive: true });
      fs.writeFileSync(path.join(existingRoot, 'README.md'), '# Existing\n', 'utf8');

      const existing = await fetch(`${server.origin}/api/projects/make/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentRoot, folderName: 'existing-client' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(existing.status).toBe(409);
      expect(existing.body).toMatchObject({ code: 'MAKE_PROJECT_TARGET_NOT_EMPTY' });
      expect(childProcessMock.execFile).not.toHaveBeenCalledWith(
        'git',
        expect.any(Array),
        expect.any(Object),
        expect.any(Function),
      );
    } finally {
      await server.close();
    }
  });

  it('keeps the previous active project when dev ensure fails after background registration', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-timeout-');
    writeMakeClientMarker(projectRoot, 'timeout-client', 'Timeout Client');
    writeMakeClientPackage(projectRoot);
    writeInstalledMakeClientDependencies(projectRoot);
    writeMakeClientMetadata(projectRoot, 'timeout-client', 'Timeout Client');
    const server = await startTestServer(defaultRoot);

    childProcessMock.spawn.mockImplementation(() => {
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          return child;
        }),
        unref: vi.fn(),
      };
      return child;
    });

    try {
      await registerProject(server.origin, defaultRoot, 'default-client', 'Default Client');
      await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });

      const ensureResponse = await fetch(`${server.origin}/api/projects/timeout-client/dev/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 50, pollIntervalMs: 5 }),
      });
      const ensureBody = await ensureResponse.json();

      expect(ensureResponse.status).toBe(504);
      expect(ensureBody).toMatchObject({ code: 'MAKE_CLIENT_DEV_TIMEOUT' });

      const active = await fetch(`${server.origin}/api/projects/active`).then((response) => response.json());
      expect(active.id).toBe('default-client');
    } finally {
      await server.close();
    }
  });

  it('switches the active project without implicitly starting make client dev', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-switch-');
    writeMakeClientMarker(projectRoot, 'switch-client', 'Switch Client');
    writeMakeClientPackage(projectRoot);
    writeMakeClientMetadata(projectRoot, 'switch-client', 'Switch Client');
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const activeResponse = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'switch-client' }),
      });
      const activeBody = await activeResponse.json();

      expect(activeResponse.status).toBe(200);
      expect(activeBody.activeProject).toMatchObject({ id: 'switch-client' });
      expect(childProcessMock.execFile).not.toHaveBeenCalled();
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('reports online make client update metadata from the latest manifest', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-online-update-status-');
    writeMakeClientMarker(projectRoot, 'online-update-status-client', 'Online Update Status Client');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'online-update-status-client', 'Online Update Status Client');
    installRemoteTemplateFetchMock({ manifest: createOnlineTemplateManifest() });
    installMakeClientUpdateCommandMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/online-update-status-client/make-client/update/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        projectId: 'online-update-status-client',
        currentVersion: '0.1.0',
        targetVersion: ONLINE_TEMPLATE_VERSION,
        releaseNotes: expect.stringContaining('来自线上 manifest 的更新说明'),
        metadataSource: 'online',
        updateAvailable: true,
        canApply: true,
        template: {
          version: ONLINE_TEMPLATE_VERSION,
          sources: [
            expect.objectContaining({ url: ONLINE_TEMPLATE_ZIP_URL, templateVersion: ONLINE_TEMPLATE_VERSION }),
            expect.objectContaining({ url: ONLINE_TEMPLATE_MIRROR_ZIP_URL, templateVersion: ONLINE_TEMPLATE_VERSION }),
          ],
        },
      });
      expect(statusBody).not.toHaveProperty('metadataError');
      expect(statusBody.blockedReasons).toEqual([]);
      expect(globalThis.fetch).toHaveBeenCalledWith(TEMPLATE_MANIFEST_URL, expect.any(Object));
    } finally {
      await server.close();
    }
  });

  it('does not offer an update when the project already matches the online manifest version', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-online-current-status-');
    writeMakeClientMarker(projectRoot, 'online-current-status-client', 'Online Current Status Client', ONLINE_TEMPLATE_VERSION);
    writeMakeClientPackage(projectRoot, ONLINE_TEMPLATE_VERSION);
    writeMakeClientMetadata(projectRoot, 'online-current-status-client', 'Online Current Status Client');
    installRemoteTemplateFetchMock({ manifest: createOnlineTemplateManifest() });
    installMakeClientUpdateCommandMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/online-current-status-client/make-client/update/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        currentVersion: ONLINE_TEMPLATE_VERSION,
        targetVersion: ONLINE_TEMPLATE_VERSION,
        metadataSource: 'online',
        updateAvailable: false,
        canApply: false,
      });
      expect(statusBody.blockedReasons).toEqual([
        { code: 'NO_UPDATE_AVAILABLE', message: '当前客户端模板已是最新版本' },
      ]);
    } finally {
      await server.close();
    }
  });

  it('reports bundled make client update status when the latest manifest is unavailable', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-status-');
    writeMakeClientMarker(projectRoot, 'update-status-client', 'Update Status Client');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-status-client', 'Update Status Client');
    installMakeClientUpdateCommandMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/update-status-client/make-client/update/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        projectId: 'update-status-client',
        projectRoot,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        releaseNotes: expect.stringContaining(DEFAULT_TEMPLATE_VERSION),
        metadataSource: 'bundled',
        metadataError: expect.stringContaining('HTTP 503'),
        updateAvailable: true,
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
        lastBackup: null,
        template: {
          version: DEFAULT_TEMPLATE_VERSION,
          sources: [
            expect.objectContaining({ url: TEMPLATE_ZIP_URL }),
            expect.objectContaining({ url: TEMPLATE_MIRROR_ZIP_URL }),
          ],
        },
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('applyMode');
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');
      expect(statusBody).not.toHaveProperty('conflictFiles');
    } finally {
      await server.close();
    }
  });

  it('allows make client update checks without invoking Git', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-no-git-');
    writeMakeClientMarker(projectRoot, 'update-no-git-client', 'Update No Git Client');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-no-git-client', 'Update No Git Client');
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'git') {
        const error = new Error('git command not found') as Error & { stderr?: string };
        error.stderr = 'git command not found';
        throw error;
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/update-no-git-client/make-client/update/status`);
      const statusBody = await statusResponse.json();
      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        projectId: 'update-no-git-client',
        projectRoot,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        updateAvailable: true,
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
        lastBackup: null,
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('git', expect.any(Array), expect.any(Object));
    } finally {
      await server.close();
    }
  });

  it('applies make client updates with a backup when Git is unavailable', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-no-git-apply-');
    writeMakeClientMarker(projectRoot, 'update-no-git-apply-client', 'Update No Git Apply Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-no-git-apply-client', 'Update No Git Apply Client');
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'old official\n', 'utf8');
    installRemoteTemplateFetchMock();
    runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
      const cwd = String(commandOptions?.cwd || '');
      if (command === 'git') {
        const error = new Error('git command not found') as Error & { stderr?: string };
        error.stderr = 'git command not found';
        throw error;
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        writeInstalledMakeClientDependencies(cwd);
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'run' && args[1] === 'metadata:sync') {
        writeMakeClientMetadata(cwd, 'update-no-git-apply-client', 'Update No Git Apply Client');
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/update-no-git-apply-client/make-client/update/status`);
      const statusBody = await statusResponse.json();
      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        updateAvailable: true,
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
        lastBackup: null,
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-no-git-apply-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();
      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        backupRoot: expect.stringContaining('.axhub/make/backups/client-update-'),
        backupZipPath: expect.stringContaining('client-update-backup.zip'),
        manifestPath: expect.stringContaining('manifest.json'),
        templateUrl: TEMPLATE_ZIP_URL,
        backupRecord: expect.objectContaining({
          backupRoot: expect.stringContaining('.axhub/make/backups/client-update-'),
          backupZipPath: expect.stringContaining('client-update-backup.zip'),
          manifestPath: expect.stringContaining('manifest.json'),
          currentVersion: '0.1.0',
          targetVersion: DEFAULT_TEMPLATE_VERSION,
          restoreAvailable: true,
          zipAvailable: true,
        }),
      });
      expect(applyBody.writtenFiles).toEqual(expect.arrayContaining([
        'package.json',
        'src/prototypes/beginner-guide/index.tsx',
        '.axhub/make/client.json',
      ]));
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'utf8')).toContain('BeginnerGuide');
      expect(fs.readFileSync(path.join(applyBody.backupRoot, 'original', 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'utf8')).toBe('old official\n');
      expect(fs.existsSync(applyBody.backupZipPath)).toBe(true);
      expect(fs.existsSync(applyBody.manifestPath)).toBe(true);
      const nextStatusResponse = await fetch(`${server.origin}/api/projects/update-no-git-apply-client/make-client/update/status`);
      const nextStatusBody = await nextStatusResponse.json();
      expect(nextStatusBody.lastBackup).toMatchObject({
        backupRoot: applyBody.backupRoot,
        backupZipPath: applyBody.backupZipPath,
        manifestPath: applyBody.manifestPath,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        restoreAvailable: true,
        zipAvailable: true,
      });
    } finally {
      await server.close();
    }
  });

  it('applies make client updates from the online latest manifest source', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-online-apply-');
    writeMakeClientMarker(projectRoot, 'update-online-apply-client', 'Update Online Apply Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-online-apply-client', 'Update Online Apply Client');
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'old official\n', 'utf8');
    installRemoteTemplateFetchMock({ manifest: createOnlineTemplateManifest() });
    runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
      const cwd = String(commandOptions?.cwd || '');
      if (command === 'git') {
        const error = new Error('git command not found') as Error & { stderr?: string };
        error.stderr = 'git command not found';
        throw error;
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        writeInstalledMakeClientDependencies(cwd);
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'run' && args[1] === 'metadata:sync') {
        writeMakeClientMetadata(cwd, 'update-online-apply-client', 'Update Online Apply Client');
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const applyResponse = await fetch(`${server.origin}/api/projects/update-online-apply-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        currentVersion: '0.1.0',
        targetVersion: ONLINE_TEMPLATE_VERSION,
        templateUrl: ONLINE_TEMPLATE_ZIP_URL,
        backupRecord: expect.objectContaining({
          currentVersion: '0.1.0',
          targetVersion: ONLINE_TEMPLATE_VERSION,
        }),
      });
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8'))).toMatchObject({
        templateUrl: ONLINE_TEMPLATE_ZIP_URL,
        templateVersion: ONLINE_TEMPLATE_VERSION,
      });
    } finally {
      await server.close();
    }
  });

  it('treats prerelease make client template versions as older than the matching stable target', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-prerelease-');
    writeMakeClientMarker(projectRoot, 'update-prerelease-client', 'Update Prerelease Client', `${DEFAULT_TEMPLATE_VERSION}-beta.1`);
    writeMakeClientPackage(projectRoot, `${DEFAULT_TEMPLATE_VERSION}-beta.1`);
    writeMakeClientMetadata(projectRoot, 'update-prerelease-client', 'Update Prerelease Client');
    initCleanGitRepo(projectRoot);
    installMakeClientUpdateCommandMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const statusResponse = await fetch(`${server.origin}/api/projects/update-prerelease-client/make-client/update/status`);
      const statusBody = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        currentVersion: `${DEFAULT_TEMPLATE_VERSION}-beta.1`,
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        updateAvailable: true,
        canApply: true,
      });
    } finally {
      await server.close();
    }
  });

  it('allows updates when local changes would be overwritten and backs up original files first', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-dirty-');
    writeMakeClientMarker(projectRoot, 'update-dirty-client', 'Update Dirty Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-dirty-client', 'Update Dirty Client');
    initCleanGitRepo(projectRoot);
    const dirtyPackageContent = JSON.stringify({
      version: 'dirty-local',
      scripts: {
        dev: 'vite',
        'metadata:sync': 'node scripts/sync-project-metadata.mjs',
      },
    });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), dirtyPackageContent, 'utf8');
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock({ metadataId: 'update-dirty-client', metadataName: 'Update Dirty Client' });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/update-dirty-client/make-client/update/status`);
      const statusBody = await statusResponse.json();
      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');
      expect(statusBody).not.toHaveProperty('conflictFiles');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-dirty-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();
      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        backupRoot: expect.stringContaining('.axhub/make/backups/client-update-'),
        backupZipPath: expect.stringContaining('client-update-backup.zip'),
      });
      expect(applyBody.writtenFiles).toEqual(expect.arrayContaining(['package.json']));
      expect(fs.readFileSync(path.join(applyBody.backupRoot, 'original', 'package.json'), 'utf8')).toBe(dirtyPackageContent);
    } finally {
      await server.close();
    }
  });

  it('preserves project package extensions while official package fields win conflicts', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-package-merge-');
    writeMakeClientMarker(projectRoot, 'update-package-merge-client', 'Update Package Merge Client', '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-package-merge-client', 'Update Package Merge Client');
    fs.writeFileSync(path.join(projectRoot, 'package.json'), `${JSON.stringify({
      version: '0.1.0',
      customConfig: { enabled: true },
      scripts: {
        dev: 'local-vite',
        'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        'deploy:staging': 'deploy-staging',
      },
      dependencies: {
        shared: '1.0.0',
        'project-runtime': '2.0.0',
      },
      devDependencies: {
        moved: '1.0.0',
        'project-tool': '3.0.0',
      },
      peerDependencies: { 'project-peer': '^4.0.0' },
      optionalDependencies: { 'project-optional': '^5.0.0' },
    }, null, 2)}\n`, 'utf8');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock({
      metadataId: 'update-package-merge-client',
      metadataName: 'Update Package Merge Client',
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-package-merge-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody.writtenFiles).toEqual(expect.arrayContaining(['package.json']));
      const updatedPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      expect(updatedPackage).toMatchObject({
        name: '@axhub/make-client',
        version: DEFAULT_TEMPLATE_VERSION,
        customConfig: { enabled: true },
        scripts: {
          dev: 'vite',
          'metadata:sync': 'node scripts/sync-project-metadata.mjs',
          'deploy:staging': 'deploy-staging',
          build: 'vite build',
        },
        dependencies: {
          shared: '2.0.0',
          moved: '2.0.0',
          'project-runtime': '2.0.0',
          'official-runtime': '1.0.0',
        },
        devDependencies: {
          'project-tool': '3.0.0',
          'official-tool': '1.0.0',
        },
        peerDependencies: { 'project-peer': '^4.0.0' },
        optionalDependencies: { 'project-optional': '^5.0.0' },
      });
      expect(updatedPackage.devDependencies).not.toHaveProperty('moved');
    } finally {
      await server.close();
    }
  });

  it('rejects an invalid project package before writing update files', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-invalid-package-');
    writeMakeClientMarker(projectRoot, 'update-invalid-package-client', 'Update Invalid Package Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-invalid-package-client', 'Update Invalid Package Client');
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'old official\n', 'utf8');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      const markerPath = getMakeClientMarkerPath(projectRoot);
      const originalMarkerContent = fs.readFileSync(markerPath, 'utf8');
      fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"scripts":', 'utf8');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-invalid-package-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(409);
      expect(applyBody).toMatchObject({
        code: 'MAKE_CLIENT_PACKAGE_INVALID',
        phase: 'merge-package',
        details: { source: 'project' },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'utf8'))
        .toBe('old official\n');
      expect(fs.readFileSync(markerPath, 'utf8')).toBe(originalMarkerContent);
      expect(fs.existsSync(path.join(projectRoot, '.axhub', 'make', 'backups'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('rejects an invalid template package before writing update files', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-invalid-template-package-');
    writeMakeClientMarker(projectRoot, 'update-invalid-template-package-client', 'Update Invalid Template Package Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-invalid-template-package-client', 'Update Invalid Template Package Client');
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'old official\n', 'utf8');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock({ packageContent: '{"scripts":' });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      const markerPath = getMakeClientMarkerPath(projectRoot);
      const originalMarkerContent = fs.readFileSync(markerPath, 'utf8');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-invalid-template-package-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(500);
      expect(applyBody).toMatchObject({
        code: 'MAKE_CLIENT_PACKAGE_INVALID',
        phase: 'merge-package',
        details: { source: 'template' },
      });
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'utf8'))
        .toBe('old official\n');
      expect(fs.readFileSync(markerPath, 'utf8')).toBe(originalMarkerContent);
      expect(fs.existsSync(path.join(projectRoot, '.axhub', 'make', 'backups'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('reports update availability without Git checks or template downloads', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-dirty-no-template-');
    writeMakeClientMarker(projectRoot, 'update-dirty-no-template-client', 'Update Dirty No Template Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-dirty-no-template-client', 'Update Dirty No Template Client');
    initCleanGitRepo(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      version: 'dirty-local',
      scripts: {
        dev: 'vite',
        'metadata:sync': 'node scripts/sync-project-metadata.mjs',
      },
    }), 'utf8');
    const fetchMock = installRemoteTemplateFetchMock({ failPrimary: true, failMirror: true });
    installMakeClientUpdateCommandMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/update-dirty-no-template-client/make-client/update/status`);
      const statusBody = await statusResponse.json();
      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        updateAvailable: true,
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');
      expect(fetchMock).not.toHaveBeenCalledWith(TEMPLATE_ZIP_URL, expect.any(Object));
      expect(fetchMock).not.toHaveBeenCalledWith(TEMPLATE_MIRROR_ZIP_URL, expect.any(Object));
    } finally {
      await server.close();
    }
  });

  it('keeps project-owned dirty files outside the update overwrite plan untouched', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-dirty-unrelated-');
    writeMakeClientMarker(projectRoot, 'update-dirty-unrelated-client', 'Update Dirty Unrelated Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-dirty-unrelated-client', 'Update Dirty Unrelated Client');
    fs.mkdirSync(path.join(projectRoot, 'src', 'resources'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'resources', 'notes.md'), '# Old notes\n', 'utf8');
    initCleanGitRepo(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'src', 'resources', 'notes.md'), '# Dirty user notes\n', 'utf8');
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock({ metadataId: 'update-dirty-unrelated-client', metadataName: 'Update Dirty Unrelated Client' });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const statusResponse = await fetch(`${server.origin}/api/projects/update-dirty-unrelated-client/make-client/update/status`);
      const statusBody = await statusResponse.json();
      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        updateAvailable: true,
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-dirty-unrelated-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();
      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        backupZipPath: expect.stringContaining('client-update-backup.zip'),
      });
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'resources', 'notes.md'), 'utf8')).toBe('# Dirty user notes\n');
    } finally {
      await server.close();
    }
  });

  it('reports local overwrite changes without Git, warning, or conflict fields', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-dirty-overlap-');
    writeMakeClientMarker(projectRoot, 'update-dirty-overlap-client', 'Update Dirty Overlap Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-dirty-overlap-client', 'Update Dirty Overlap Client');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock();
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
        version: 'dirty-local',
        scripts: {
          dev: 'vite',
          'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        },
      }), 'utf8');

      const statusResponse = await fetch(`${server.origin}/api/projects/update-dirty-overlap-client/make-client/update/status`);
      const statusBody = await statusResponse.json();
      expect(statusResponse.status).toBe(200);
      expect(statusBody).toMatchObject({
        canApply: true,
        backupPolicy: 'zip-before-overwrite',
      });
      expect(statusBody.blockedReasons).toEqual([]);
      expect(statusBody).not.toHaveProperty('git');
      expect(statusBody).not.toHaveProperty('warnings');
      expect(statusBody).not.toHaveProperty('conflictFiles');
    } finally {
      await server.close();
    }
  });

  it('updates official make client template files while preserving project-owned content', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-apply-');
    writeMakeClientMarker(projectRoot, 'update-apply-client', 'Update Apply Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-apply-client', 'Update Apply Client');
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'old official\n', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'custom-prototype'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'custom-prototype', 'index.tsx'), 'custom prototype\n', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'src', 'resources'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'resources', 'notes.md'), '# User notes\n', 'utf8');
    writeJson(path.join(projectRoot, '.axhub', 'make', 'sidebar-tree.json'), { version: 1, prototypes: [{ id: 'custom-order' }] });
    fs.mkdirSync(path.join(projectRoot, '.axhub', 'make', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.axhub', 'make', 'sessions', 'keep.json'), '{}\n', 'utf8');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock({ metadataId: 'update-apply-client', metadataName: 'Update Apply Client' });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-apply-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        projectId: 'update-apply-client',
        projectRoot,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        backupZipPath: expect.stringContaining('client-update-backup.zip'),
        manifestPath: expect.stringContaining('manifest.json'),
        backupRecord: expect.objectContaining({
          currentVersion: '0.1.0',
          targetVersion: DEFAULT_TEMPLATE_VERSION,
          plannedFilesCount: expect.any(Number),
          writtenFilesCount: expect.any(Number),
          restoreAvailable: true,
          zipAvailable: true,
        }),
        templateUrl: TEMPLATE_ZIP_URL,
        installMethod: 'npm',
        metadataSynced: true,
      });
      expect(applyBody.backupRoot).toContain('.axhub/make/backups/client-update-');
      expect(fs.existsSync(applyBody.backupZipPath)).toBe(true);
      expect(fs.existsSync(applyBody.manifestPath)).toBe(true);
      expect(applyBody.writtenFiles).toEqual(expect.arrayContaining([
        'package.json',
        'src/prototypes/beginner-guide/index.tsx',
        'src/prototypes/annotation-demo/index.tsx',
        '.axhub/make/client.json',
      ]));
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx'), 'utf8')).toContain('BeginnerGuide');
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'prototypes', 'custom-prototype', 'index.tsx'), 'utf8')).toBe('custom prototype\n');
      expect(fs.readFileSync(path.join(projectRoot, 'src', 'resources', 'notes.md'), 'utf8')).toBe('# User notes\n');
      expect(JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'sidebar-tree.json'), 'utf8'))).toEqual({
        version: 1,
        prototypes: [{ id: 'custom-order' }],
      });
      expect(fs.existsSync(path.join(projectRoot, '.axhub', 'make', 'sessions', 'keep.json'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8'))).toMatchObject({
        repository: TEMPLATE_SOURCE_URL,
        templateUrl: TEMPLATE_ZIP_URL,
        templateVersion: DEFAULT_TEMPLATE_VERSION,
        project: {
          id: 'update-apply-client',
          name: 'Update Apply Client',
        },
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'metadata:sync'],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('retries make client update npm install with legacy peer deps when npm arborist crashes', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-npm-arborist-retry-');
    writeMakeClientMarker(projectRoot, 'update-npm-arborist-retry-client', 'Update NPM Arborist Retry Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-npm-arborist-retry-client', 'Update NPM Arborist Retry Client');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
      const cwd = String(commandOptions?.cwd || '');
      if (command === 'git') {
        return {
          ...localCommandResult(command, args),
          stdout: runGit(cwd, args),
        };
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install' && !args.includes('--legacy-peer-deps')) {
        throw Object.assign(new Error("Cannot read properties of null (reading 'matches')"), {
          stderr: "Cannot read properties of null (reading 'matches')",
        });
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install' && args.includes('--legacy-peer-deps')) {
        writeInstalledMakeClientDependencies(cwd);
        return localCommandResult(command, args);
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'run' && args[1] === 'metadata:sync') {
        writeMakeClientMetadata(cwd, 'update-npm-arborist-retry-client', 'Update NPM Arborist Retry Client');
        return localCommandResult(command, args);
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-npm-arborist-retry-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        installMethod: 'npm',
        metadataSynced: true,
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev', '--legacy-peer-deps'],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('returns success with a post-update warning when dependency install fails after template files are written', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-install-warning-');
    writeMakeClientMarker(projectRoot, 'update-install-warning-client', 'Update Install Warning Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-install-warning-client', 'Update Install Warning Client');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
      const cwd = String(commandOptions?.cwd || '');
      if (command === 'git') {
        return {
          ...localCommandResult(command, args),
          stdout: runGit(cwd, args),
        };
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        throw Object.assign(new Error("Cannot read properties of null (reading 'matches')"), {
          stderr: "Cannot read properties of null (reading 'matches')",
        });
      }
      if (command === 'pnpm' && args[0] === 'install') {
        throw Object.assign(new Error('pnpm install failed after template write'), {
          stderr: 'pnpm install failed after template write',
        });
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'run' && args[1] === 'metadata:sync') {
        writeMakeClientMetadata(cwd, 'update-install-warning-client', 'Update Install Warning Client');
        return localCommandResult(command, args);
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-install-warning-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        projectId: 'update-install-warning-client',
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        installMethod: 'skipped',
        metadataSynced: false,
        postUpdateWarning: expect.objectContaining({
          code: 'MAKE_CLIENT_INSTALL_FAILED',
          phase: 'install',
        }),
        backupRecord: expect.objectContaining({
          currentVersion: '0.1.0',
          targetVersion: DEFAULT_TEMPLATE_VERSION,
          restoreAvailable: true,
          zipAvailable: true,
        }),
      });
      expect(applyBody.postUpdateWarning.error).toContain("Cannot read properties of null (reading 'matches')");
      expect(applyBody.writtenFiles).toEqual(expect.arrayContaining([
        'package.json',
        '.axhub/make/client.json',
      ]));
      expect(JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))).toMatchObject({
        version: DEFAULT_TEMPLATE_VERSION,
      });
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8'))).toMatchObject({
        templateVersion: DEFAULT_TEMPLATE_VERSION,
      });
      expect(fs.existsSync(applyBody.backupZipPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(applyBody.manifestPath, 'utf8'));
      expect(manifest).toMatchObject({
        installMethod: 'skipped',
        metadataSynced: false,
        postUpdateWarning: expect.objectContaining({
          code: 'MAKE_CLIENT_INSTALL_FAILED',
          phase: 'install',
        }),
      });
      expect(manifest.completedAt).toEqual(expect.any(String));
    } finally {
      await server.close();
    }
  });

  it('uses pnpm first for make client updates when a pnpm lockfile is present', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-pnpm-lock-');
    writeMakeClientMarker(projectRoot, 'update-pnpm-lock-client', 'Update PNPM Lock Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    fs.writeFileSync(path.join(projectRoot, 'pnpm-lock.yaml'), 'lockfileVersion: "10.0"\n', 'utf8');
    writeMakeClientMetadata(projectRoot, 'update-pnpm-lock-client', 'Update PNPM Lock Client');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    runLocalCommandMock.mockImplementation(async (command: string, args: string[], commandOptions: any) => {
      const cwd = String(commandOptions?.cwd || '');
      if (command === 'git') {
        return {
          ...localCommandResult(command, args),
          stdout: runGit(cwd, args),
        };
      }
      if (command === 'pnpm' && args[0] === 'install') {
        writeInstalledMakeClientDependencies(cwd);
        return localCommandResult(command, args);
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'install') {
        throw Object.assign(new Error('npm install should not run before pnpm for pnpm-lock projects'), {
          stderr: 'npm install should not run before pnpm for pnpm-lock projects',
        });
      }
      if ((command === 'npm' || command === 'npm.cmd') && args[0] === 'run' && args[1] === 'metadata:sync') {
        writeMakeClientMetadata(cwd, 'update-pnpm-lock-client', 'Update PNPM Lock Client');
        return localCommandResult(command, args);
      }
      return localCommandResult(command, args);
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-pnpm-lock-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        installMethod: 'pnpm',
        metadataSynced: true,
      });
      expect(runLocalCommandMock).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--prod=false'],
        expect.objectContaining({ cwd: projectRoot }),
      );
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--include=dev'],
        expect.objectContaining({ cwd: projectRoot }),
      );
    } finally {
      await server.close();
    }
  });

  it('keeps the old template version and allows retry after a mid-copy failure', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-retry-');
    writeMakeClientMarker(projectRoot, 'update-retry-client', 'Update Retry Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-retry-client', 'Update Retry Client');
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock({
      metadataId: 'update-retry-client',
      metadataName: 'Update Retry Client',
    });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);

      const copyFileSync = fs.copyFileSync.bind(fs);
      const failedTarget = path.join(projectRoot, 'src', 'prototypes', 'beginner-guide', 'index.tsx');
      const copySpy = vi.spyOn(fs, 'copyFileSync').mockImplementation((...args) => {
        if (path.resolve(String(args[1])) === failedTarget) {
          const error = new Error('simulated mid-copy failure') as NodeJS.ErrnoException;
          error.code = 'EACCES';
          throw error;
        }
        return copyFileSync(...args);
      });

      const failedResponse = await fetch(`${server.origin}/api/projects/update-retry-client/make-client/update/apply`, {
        method: 'POST',
      });
      const failedBody = await failedResponse.json();

      expect(failedResponse.status).toBe(500);
      expect(failedBody).toMatchObject({
        projectId: 'update-retry-client',
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        writtenFiles: expect.arrayContaining(['package.json']),
      });
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8'))).toMatchObject({
        templateVersion: '0.1.0',
      });

      copySpy.mockRestore();

      const retryStatus = await fetch(`${server.origin}/api/projects/update-retry-client/make-client/update/status`)
        .then((response) => response.json());
      expect(retryStatus).toMatchObject({
        canApply: true,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
      });

      const retryResponse = await fetch(`${server.origin}/api/projects/update-retry-client/make-client/update/apply`, {
        method: 'POST',
      });
      const retryBody = await retryResponse.json();
      expect(retryResponse.status).toBe(200);
      expect(retryBody).toMatchObject({
        success: true,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
      });
      expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8'))).toMatchObject({
        templateVersion: DEFAULT_TEMPLATE_VERSION,
      });
    } finally {
      await server.close();
    }
  });

  it('returns success with a post-update warning when metadata sync fails after template files are written', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-update-fail-');
    writeMakeClientMarker(projectRoot, 'update-fail-client', 'Update Fail Client', '0.1.0');
    writeMakeClientPackage(projectRoot, '0.1.0');
    writeMakeClientMetadata(projectRoot, 'update-fail-client', 'Update Fail Client');
    initCleanGitRepo(projectRoot);
    installRemoteTemplateFetchMock();
    installMakeClientUpdateCommandMock({ failMetadataSync: true });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      expect(registerResponse.status).toBe(201);
      commitGitChangesIfNeeded(projectRoot, 'registered');

      const applyResponse = await fetch(`${server.origin}/api/projects/update-fail-client/make-client/update/apply`, {
        method: 'POST',
      });
      const applyBody = await applyResponse.json();

      expect(applyResponse.status).toBe(200);
      expect(applyBody).toMatchObject({
        success: true,
        projectRoot,
        currentVersion: '0.1.0',
        targetVersion: DEFAULT_TEMPLATE_VERSION,
        backupRoot: expect.stringContaining('.axhub/make/backups/client-update-'),
        backupZipPath: expect.stringContaining('client-update-backup.zip'),
        manifestPath: expect.stringContaining('manifest.json'),
        templateUrl: TEMPLATE_ZIP_URL,
        installMethod: 'npm',
        metadataSynced: false,
        postUpdateWarning: expect.objectContaining({
          code: 'MAKE_CLIENT_METADATA_SYNC_FAILED',
          phase: 'metadata',
        }),
      });
      expect(applyBody.postUpdateWarning.error).toContain('metadata sync exploded');
      expect(applyBody.writtenFiles).toEqual(expect.arrayContaining(['package.json', '.axhub/make/client.json']));
      expect(applyBody.plannedFiles).toEqual(expect.arrayContaining(['package.json', '.axhub/make/client.json']));
      expect(fs.existsSync(applyBody.backupZipPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(applyBody.manifestPath, 'utf8'));
      expect(manifest).toMatchObject({
        metadataSynced: false,
        postUpdateWarning: expect.objectContaining({
          code: 'MAKE_CLIENT_METADATA_SYNC_FAILED',
          phase: 'metadata',
        }),
      });
    } finally {
      await server.close();
    }
  });

  it('registers an extracted make client project without installed dependencies', async () => {
    const defaultRoot = createTempRoot();
    writeProjectMetadata(defaultRoot, {
      project: { id: 'default-client', name: 'Default Client' },
    });
    const projectRoot = createTempRoot('axhub-make-client-extracted-');
    writeMakeClientMarker(projectRoot, 'extracted-client', 'Extracted Client');
    writeMakeClientPackage(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'from-zip'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'src', 'prototypes', 'from-zip', 'index.tsx'),
      '/** @name From Zip */\nexport default function FromZip() { return null; }\n',
      'utf8',
    );
    fs.rmSync(path.join(projectRoot, 'node_modules'), { recursive: true, force: true });
    fs.rmSync(getProjectMetadataPath(projectRoot), { force: true });
    const server = await startTestServer(defaultRoot);

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
      });
      const registerBody = await registerResponse.json();

      expect(registerResponse.status).toBe(201);
      expect(registerBody.project).toMatchObject({
        id: 'extracted-client',
        name: 'Extracted Client',
        root: projectRoot,
      });
      expect(fs.existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);

      const activeResponse = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'extracted-client' }),
      });
      expect(activeResponse.status).toBe(200);

      const resourcesResponse = await fetch(`${server.origin}/api/projects/extracted-client/resources`);
      const resourcesBody = await resourcesResponse.json();

      expect(resourcesResponse.status).toBe(200);
      expect(resourcesBody.project).toEqual({ id: 'extracted-client', name: 'Extracted Client' });
      expect(resourcesBody.resources.prototypes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'from-zip',
          title: 'From Zip',
          clientUrl: '/prototypes/from-zip',
        }),
      ]));
      expect(fs.existsSync(getProjectMetadataPath(projectRoot))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        expect.stringMatching(/^(?:npm|npm\.cmd|pnpm)$/u),
        expect.arrayContaining([expect.stringMatching(/^install$/u)]),
        expect.any(Object),
      );
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
