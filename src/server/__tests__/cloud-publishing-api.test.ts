import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getConfigPath,
  getGlobalServerConfigPath,
  getMakeClientMarkerPath,
  getProjectExportsDir,
  getProjectMetadataPath,
  getProjectRegistryPath,
} from '../projectCore/index.ts';

import { buildExportHtmlStaticFiles } from '../exportHtmlArchive.ts';
import { startMakeServer } from '../index.ts';
import { __cloudPublishingTestUtils } from '../managementApi.cloudPublishing.ts';
import { buildOnDemand } from '../onDemandBuild.ts';
import { scopeProjectApiUrl } from './projects-api.helpers.ts';

vi.mock('../onDemandBuild.ts', () => ({
  buildOnDemand: vi.fn(async () => ({
    jsCode: 'var UserComponent = function Home(){};',
    cssText: '.home{color:red;}',
    metadata: { usesAnnotationRuntime: false },
  })),
}));

const tempRoots: string[] = [];

function createTempRoot(prefix = 'axhub-cloud-publishing-api-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, content: string | Buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath: string, value: unknown): void {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeProject(projectRoot: string) {
  writeJson(getMakeClientMarkerPath(projectRoot), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
    project: { id: 'cloud-client', name: 'Cloud Client' },
  });
  writeJson(path.join(projectRoot, 'package.json'), {
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
  writeFile(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default function Home() { return null; }\n');
  writeFile(path.join(projectRoot, 'src/themes/brand/index.tsx'), 'export default function BrandTheme() { return null; }\n');
  writeFile(path.join(projectRoot, 'src/media/logo.txt'), 'LOGO');
  writeJson(getProjectMetadataPath(projectRoot), {
    schemaVersion: 1,
    project: { id: 'cloud-client', name: 'Cloud Client' },
    resources: {
      prototypes: [
        {
          id: 'home',
          name: 'home',
          title: 'Home',
          clientUrl: 'http://localhost:3000/home',
          filePath: 'src/prototypes/home/index.tsx',
        },
      ],
      docs: [],
      themes: [
        {
          id: 'brand',
          name: 'brand',
          title: 'Brand',
          path: 'src/themes/brand',
          sourcePath: 'src/themes/brand',
        },
      ],
      data: [],
      templates: [],
    },
    navigation: { prototypes: ['home'], docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: true,
      localExports: { html: true, make: false },
    },
    resourceWriteTargets: {
      prototypes: {
        type: 'project-relative-path',
        path: 'src/prototypes',
      },
      media: {
        type: 'project-relative-path',
        path: 'src/media',
      },
    },
  });
}

function getTestMakeHome(projectRoot: string): string {
  return path.join(projectRoot, '.test-make-home');
}

function getTestServerConfigPath(projectRoot: string): string {
  return getGlobalServerConfigPath(getTestMakeHome(projectRoot));
}

function writeCloudConfig(projectRoot: string, cloudPublishing: unknown) {
  writeJson(getTestServerConfigPath(projectRoot), {
    cloudPublishing,
  });
}

async function startTestServer(projectRoot: string, extraOptions: Record<string, unknown> = {}) {
  const server = await startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: getProjectRegistryPath(getTestMakeHome(projectRoot)),
    ...extraOptions,
  });
  try {
    const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects/make/register-existing`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: projectRoot }),
    });
    expect(response.status).toBe(201);
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}

async function readJsonResponse(response: Response) {
  return response.json() as Promise<any>;
}

function mockExternalFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>) {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (
      url.includes('api.vercel.com')
      || url.includes('api.cloudflare.com')
      || url.includes('api.github.com')
      || url.includes('webpp.s3.oss-cn-hangzhou.aliyuncs.com')
      || url.includes('s3.us-east-1.amazonaws.com')
    ) {
      return Promise.resolve(handler(input, init));
    }
    return realFetch(input, init);
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cloudflarePagesAssetHash(body: Buffer | string, extension: string) {
  const base64 = Buffer.isBuffer(body) ? body.toString('base64') : Buffer.from(body, 'utf8').toString('base64');
  return bytesToHex(blake3(`${base64}${extension}`)).slice(0, 32);
}

function mockCommandExecutor(handler: (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>) {
  return vi.fn(handler);
}

function mockGitHubPagesRest(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = String(init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe('Bearer gh-test-token');
  expect(headers.get('accept')).toContain('application/vnd.github+json');

  if (method === 'GET' && url.endsWith('/repos/lintendo/axhub-pages-demo')) {
    return jsonResponse({
      default_branch: 'main',
      html_url: 'https://github.com/lintendo/axhub-pages-demo',
    });
  }
  if (method === 'GET' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/ref/heads/gh-pages')) {
    return jsonResponse({ message: 'Not Found' }, 404);
  }
  if (method === 'GET' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/ref/heads/main')) {
    return jsonResponse({ object: { sha: 'main-sha' } });
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/refs')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({ ref: 'refs/heads/gh-pages', sha: 'main-sha' });
    return jsonResponse({ ref: payload.ref, object: { sha: payload.sha } }, 201);
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/blobs')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({ encoding: 'base64' });
    return jsonResponse({ sha: `blob-${String(payload.content).slice(0, 8)}` }, 201);
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/trees')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload.base_tree).toBe('main-sha');
    expect(payload.tree.map((entry: any) => entry.path)).toEqual(expect.arrayContaining([
      'index.html',
      'index.js',
    ]));
    return jsonResponse({ sha: 'tree-sha' }, 201);
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/commits')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      tree: 'tree-sha',
      parents: ['main-sha'],
    });
    return jsonResponse({ sha: 'commit-sha' }, 201);
  }
  if (method === 'PATCH' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/refs/heads/gh-pages')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({ sha: 'commit-sha', force: true });
    return jsonResponse({ ref: 'refs/heads/gh-pages', object: { sha: 'commit-sha' } });
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/pages')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({ source: { branch: 'gh-pages', path: '/' } });
    return jsonResponse({ html_url: 'https://lintendo.github.io/axhub-pages-demo/' }, 201);
  }
  if (method === 'PUT' && url.endsWith('/repos/lintendo/axhub-pages-demo/pages')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({ source: { branch: 'gh-pages', path: '/' } });
    return jsonResponse({ html_url: 'https://lintendo.github.io/axhub-pages-demo/' });
  }
  return jsonResponse({ message: `Unexpected GitHub request ${method} ${url}` }, 500);
}

function mockGitHubPagesRestWithResourcePrefix(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = String(init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe('Bearer gh-test-token');

  if (method === 'GET' && url.endsWith('/repos/lintendo/axhub-pages-demo')) {
    return jsonResponse({
      default_branch: 'main',
      html_url: 'https://github.com/lintendo/axhub-pages-demo',
    });
  }
  if (method === 'GET' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/ref/heads/gh-pages')) {
    return jsonResponse({ message: 'Not Found' }, 404);
  }
  if (method === 'GET' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/ref/heads/main')) {
    return jsonResponse({ object: { sha: 'main-sha' } });
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/refs')) {
    return jsonResponse({ ref: 'refs/heads/gh-pages', object: { sha: 'main-sha' } }, 201);
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/blobs')) {
    return jsonResponse({ sha: 'blob-sha' }, 201);
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/trees')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload.base_tree).toBe('main-sha');
    expect(payload.tree.map((entry: any) => entry.path)).toEqual(expect.arrayContaining([
      'home/index.html',
      'home/index.js',
    ]));
    expect(payload.tree.map((entry: any) => entry.path)).not.toEqual(expect.arrayContaining([
      'index.html',
      'index.js',
    ]));
    return jsonResponse({ sha: 'tree-sha' }, 201);
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/commits')) {
    return jsonResponse({ sha: 'commit-sha' }, 201);
  }
  if (method === 'PATCH' && url.endsWith('/repos/lintendo/axhub-pages-demo/git/refs/heads/gh-pages')) {
    return jsonResponse({ ref: 'refs/heads/gh-pages', object: { sha: 'commit-sha' } });
  }
  if (method === 'POST' && url.endsWith('/repos/lintendo/axhub-pages-demo/pages')) {
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({ source: { branch: 'gh-pages', path: '/' } });
    return jsonResponse({ html_url: 'https://lintendo.github.io/axhub-pages-demo/' }, 201);
  }
  if (method === 'PUT' && url.endsWith('/repos/lintendo/axhub-pages-demo/pages')) {
    return jsonResponse({ html_url: 'https://lintendo.github.io/axhub-pages-demo/' });
  }
  return jsonResponse({ message: `Unexpected GitHub request ${method} ${url}` }, 500);
}

function writeCloudPublishRecord(projectRoot: string, input: {
  target: 'vercel' | 'cloudflare-pages' | 's3' | 'github-pages' | 'axhub';
  status: 'success' | 'failed';
  url?: string;
  createdAt: string;
  resourceId?: string;
  path?: string;
  axhubProjectId?: number;
  axhubProjectPath?: string;
}) {
  const safeCreatedAt = input.createdAt.replace(/[:.]/g, '-');
  writeJson(path.join(getProjectExportsDir(projectRoot), `cloud.publish.${input.target}-${safeCreatedAt}.json`), {
    schemaVersion: 1,
    id: `cloud.publish.${input.target}-${safeCreatedAt}`,
    projectId: 'cloud-client',
    resourceId: input.resourceId || 'home',
    resourceType: 'prototype',
    status: input.status,
    errorMessage: input.status === 'failed' ? 'failed' : '',
    createdAt: input.createdAt,
    operationType: `cloud.publish.${input.target}`,
    metadata: {
      path: input.path || 'prototypes/home',
      ...(input.url ? { url: input.url } : {}),
      ...(input.axhubProjectId ? { axhubProjectId: input.axhubProjectId } : {}),
      ...(input.axhubProjectPath ? { axhubProjectPath: input.axhubProjectPath } : {}),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('cloud publishing API', () => {
  it('builds reusable static HTML files for cloud providers and zip downloads', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);

    const files = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
    });

    expect(files.map((file) => file.path).sort()).toEqual(expect.arrayContaining([
      'assets/export-html-bootstrap.js',
      'assets/react-dom.production.min.js',
      'assets/react.production.min.js',
      'index.html',
      'index.js',
      'media/logo.txt',
    ]));
    expect(files.find((file) => file.path === 'index.html')).toMatchObject({
      contentType: 'text/html; charset=utf-8',
    });
    expect(files.find((file) => file.path === 'index.js')).toMatchObject({
      contentType: 'application/javascript; charset=utf-8',
    });
  });

  it('includes media files from the declared project media write target', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeFile(path.join(projectRoot, 'src/resources/assets/banner/city.jpg'), 'CITY-BANNER');
    vi.mocked(buildOnDemand).mockResolvedValueOnce({
      jsCode: 'var UserComponent = function Home(){return "/api/media/file/banner/city.jpg";};',
      cssText: '.hero{background-image:url("/api/media/file/banner/city.jpg")}',
      metadata: { usesAnnotationRuntime: false },
    });

    const files = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
      mediaRoot: path.join(projectRoot, 'src/resources/assets'),
    });

    const banner = files.find((file) => file.path === 'media/banner/city.jpg');
    const indexJs = files.find((file) => file.path === 'index.js')?.body.toString('utf8') || '';
    const indexHtml = files.find((file) => file.path === 'index.html')?.body.toString('utf8') || '';
    expect(banner).toMatchObject({
      contentType: 'image/jpeg',
    });
    expect(banner?.body.toString('utf8')).toBe('CITY-BANNER');
    expect(indexJs).toContain('./media/banner/city.jpg');
    expect(indexHtml).toContain('url("./media/banner/city.jpg")');
    expect(files.map((file) => file.path)).not.toContain('media/logo.txt');
  });

  it('uses the declared media write target when streaming HTML export ZIPs', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    const metadataPath = getProjectMetadataPath(projectRoot);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    metadata.resourceWriteTargets.media = {
      type: 'project-relative-path',
      path: 'src/resources/assets',
    };
    writeJson(metadataPath, metadata);
    writeFile(path.join(projectRoot, 'src/resources/assets/banner/city.jpg'), 'CITY-BANNER');
    vi.mocked(buildOnDemand).mockResolvedValueOnce({
      jsCode: 'var UserComponent = function Home(){return "/api/media/file/banner/city.jpg";};',
      cssText: '.hero{background-image:url("/api/media/file/banner/city.jpg")}',
      metadata: { usesAnnotationRuntime: false },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/export-html?path=${encodeURIComponent('prototypes/home')}`));
      const body = new Uint8Array(await response.arrayBuffer());
      const entries = unzipSync(body);
      const paths = Object.keys(entries).sort();

      expect(response.status).toBe(200);
      expect(paths).toEqual(expect.arrayContaining([
        'index.html',
        'index.js',
        'media/banner/city.jpg',
      ]));
      expect(paths).not.toContain('media/logo.txt');
      expect(Buffer.from(entries['media/banner/city.jpg']).toString('utf8')).toBe('CITY-BANNER');
      expect(Buffer.from(entries['index.js']).toString('utf8')).toContain('./media/banner/city.jpg');
      expect(Buffer.from(entries['index.html']).toString('utf8')).toContain('url("./media/banner/city.jpg")');
    } finally {
      await server.close();
    }
  });

  it('injects review submit globals when streaming HTML export ZIPs for enabled prototypes', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeJson(path.join(projectRoot, 'src/prototypes/home/.spec/reviews/config.json'), {
      schemaVersion: 1,
      lanSubmitEnabled: true,
    });
    writeJson(getConfigPath(projectRoot), {
      server: { host: 'localhost', allowLAN: true, lanHost: '10.0.8.42' },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/export-html?path=${encodeURIComponent('prototypes/home')}`));
      const body = new Uint8Array(await response.arrayBuffer());
      const entries = unzipSync(body);
      const html = Buffer.from(entries['index.html']).toString('utf8');
      const port = new URL(server.origin).port;

      expect(response.status).toBe(200);
      expect(html).toContain('window.__AXHUB_REVIEW_SUBMIT__');
      expect(html).toContain(`http://10.0.8.42:${port}/api/review-reports/submit?projectId=cloud-client&prototypeId=home`);
      expect(html).toContain(`http://10.0.8.42:${port}/api/review-reports/exists?projectId=cloud-client&prototypeId=home`);
    } finally {
      await server.close();
    }
  });

  it('rejects media export roots outside the project root', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);

    await expect(buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
      mediaRoot: path.join(projectRoot, '..', 'outside-media'),
    })).rejects.toThrow('媒体资源目录不在项目根目录内');
  });

  it('can include source files while excluding spec resources', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeFile(path.join(projectRoot, 'src/prototypes/home/components/Card.tsx'), 'export function Card() { return null; }\n');
    writeFile(path.join(projectRoot, 'src/prototypes/home/Home.spec.tsx'), 'test("home", () => {});\n');
    writeFile(path.join(projectRoot, 'src/prototypes/home/.spec/generation-artifacts.json'), '{}\n');
    vi.mocked(buildOnDemand).mockResolvedValueOnce({
      jsCode: 'var UserComponent = function Home(){};',
      cssText: '.home{color:red;}',
      metadata: { usesAnnotationRuntime: true },
    });

    const files = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
      includeSource: true,
    });

    const paths = files.map((file) => file.path).sort();

    expect(paths).toEqual(expect.arrayContaining([
      'source/manifest.json',
      'source/components/Card.tsx',
      'source/index.tsx',
    ]));
    const manifest = JSON.parse(String(files.find((file) => file.path === 'source/manifest.json')?.body ?? 'null'));
    expect(manifest).toMatchObject({
      version: 1,
      format: 'axhub-published-source',
      sourceRoot: 'source',
      entry: 'index.tsx',
    });
    expect(manifest.files).toEqual(expect.arrayContaining([
      { path: 'index.tsx', kind: 'entry' },
      { path: 'components/Card.tsx', kind: 'source' },
    ]));
    const html = String(files.find((file) => file.path === 'index.html')?.body ?? '');
    const sourceReferenceAssignment = 'window.__AXHUB_ANNOTATION_SOURCE_REFERENCE__={root:"source",manifest:"source/manifest.json"};';
    expect(html).toContain(sourceReferenceAssignment);
    expect(html).toContain(`await loadEntryScript('./index.js');\n        ${sourceReferenceAssignment}`);
    expect(paths).not.toEqual(expect.arrayContaining([
      'source/Home.spec.tsx',
      'source/.spec/generation-artifacts.json',
    ]));
  });

  it('does not inject annotation source references for non-annotation pages', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    vi.mocked(buildOnDemand).mockResolvedValueOnce({
      jsCode: 'var UserComponent = function Home(){};',
      cssText: '.home{color:red;}',
      metadata: { usesAnnotationRuntime: false },
    });

    const files = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
      includeSource: true,
    });

    const paths = files.map((file) => file.path).sort();
    const html = String(files.find((file) => file.path === 'index.html')?.body ?? '');

    expect(paths).toEqual(expect.arrayContaining([
      'source/manifest.json',
      'source/index.tsx',
    ]));
    expect(html).not.toContain('__AXHUB_ANNOTATION_SOURCE_REFERENCE__');
  });

  it('injects review submit globals only when export options provide review submit context', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);

    const files = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
      reviewSubmit: {
        url: 'http://10.0.8.42:53817/api/review-reports/submit?projectId=cloud-client&prototypeId=home',
        existsUrl: 'http://10.0.8.42:53817/api/review-reports/exists?projectId=cloud-client&prototypeId=home',
        projectId: 'cloud-client',
        prototypeId: 'home',
      },
    });
    const html = String(files.find((file) => file.path === 'index.html')?.body ?? '');

    expect(html).toContain('window.__AXHUB_REVIEW_SUBMIT__');
    expect(html).toContain('"url":"http://10.0.8.42:53817/api/review-reports/submit?projectId=cloud-client&prototypeId=home"');
    expect(html).toContain('"existsUrl":"http://10.0.8.42:53817/api/review-reports/exists?projectId=cloud-client&prototypeId=home"');
    expect(html).toContain('"projectId":"cloud-client"');
    expect(html).toContain('"prototypeId":"home"');

    const filesWithoutReviewSubmit = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
    });
    const htmlWithoutReviewSubmit = String(filesWithoutReviewSubmit.find((file) => file.path === 'index.html')?.body ?? '');
    expect(htmlWithoutReviewSubmit).not.toContain('__AXHUB_REVIEW_SUBMIT__');
  });

  it('extracts large CSS data URIs into static asset files for cloud publishing limits', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    const fontBody = Buffer.alloc(2 * 1024 * 1024, 1);
    vi.mocked(buildOnDemand).mockResolvedValueOnce({
      jsCode: 'var UserComponent = function Home(){};',
      cssText: `@font-face{font-family:Demo;src:url("data:font/ttf;base64,${fontBody.toString('base64')}")} .home{font-family:Demo}`,
      metadata: { usesAnnotationRuntime: false },
    });

    const files = await buildExportHtmlStaticFiles({
      projectRoot,
      sourceFile: path.join(projectRoot, 'src/prototypes/home/index.tsx'),
      entryName: 'home',
      displayName: 'Home',
      group: 'prototypes',
    });

    const cssFile = files.find((file) => file.path === 'index.css') || files.find((file) => file.path === 'index.html');
    const extractedFont = files.find((file) => file.path.startsWith('assets/data-uri-') && file.path.endsWith('.ttf'));

    expect(cssFile?.body.toString('utf8')).toContain('./assets/data-uri-');
    expect(cssFile?.body.toString('utf8')).not.toContain('data:font/ttf;base64');
    expect(extractedFont).toMatchObject({
      contentType: 'font/ttf',
    });
    expect(extractedFont?.body.equals(fontBody)).toBe(true);
  });

  it('saves and reads server-owned cloud publishing configuration without exposing secrets', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeJson(getConfigPath(projectRoot), {
      server: { host: 'localhost', allowLAN: true },
    });
    const server = await startTestServer(projectRoot);

    try {
      const saveResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vercel: { token: 'vercel-token', projectName: 'axhub-home', teamId: 'team_123' },
          cloudflarePages: { apiToken: 'cf-token', accountId: 'account-1', projectName: 'axhub-home', productionBranch: 'main' },
          s3: {
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: 'secret',
            region: 'us-east-1',
            bucket: 'axhub-sites',
            prefix: 'home',
            baseUrl: 'https://cdn.example.com/home/',
          },
          publishSettings: {
            includeSource: false,
            visibleTargets: ['axhub', 's3', 'vercel'],
          },
        }),
      });
      expect(saveResponse.status).toBe(200);

      const configResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`));
      const config = await readJsonResponse(configResponse);

      expect(configResponse.status).toBe(200);
      const projectConfig = JSON.parse(fs.readFileSync(getConfigPath(projectRoot), 'utf8'));
      expect(projectConfig.cloudPublishing).toBeUndefined();
      const serverConfig = JSON.parse(fs.readFileSync(getTestServerConfigPath(projectRoot), 'utf8'));
      expect(serverConfig.cloudPublishing).toMatchObject({
        vercel: { token: 'vercel-token', projectName: 'axhub-home', teamId: 'team_123' },
        cloudflarePages: { apiToken: 'cf-token', accountId: 'account-1', projectName: 'axhub-home', productionBranch: 'main' },
        s3: {
          accessKeyId: 'AKIA_TEST',
          secretAccessKey: 'secret',
          region: 'us-east-1',
          bucket: 'axhub-sites',
          prefix: 'home',
          baseUrl: 'https://cdn.example.com/home/',
        },
        publishSettings: {
          includeSource: false,
          visibleTargets: ['axhub', 's3', 'vercel'],
        },
      });
      expect(config.targets.vercel).toMatchObject({
        configured: true,
        tokenConfigured: true,
        projectName: 'axhub-home',
        teamId: 'team_123',
      });
      expect(config.targets.vercel.token).toBeUndefined();
      expect(config.targets.cloudflarePages).toMatchObject({
        configured: true,
        apiTokenConfigured: true,
        accountId: 'account-1',
        projectName: 'axhub-home',
        productionBranch: 'main',
      });
      expect(config.targets.cloudflarePages.apiToken).toBeUndefined();
      expect(config.targets.s3).toMatchObject({
        configured: true,
        accessKeyId: 'AKIA...TEST',
        accessKeyIdConfigured: true,
        secretAccessKeyConfigured: true,
        region: 'us-east-1',
        bucket: 'axhub-sites',
        prefix: 'home',
        baseUrl: 'https://cdn.example.com/home/',
      });
      expect(config.targets.s3.secretAccessKey).toBeUndefined();
      expect(config.targets.publishSettings).toMatchObject({
        includeSource: false,
        visibleTargets: ['axhub', 's3', 'vercel'],
      });
    } finally {
      await server.close();
    }
  });

  it('defaults visible cloud publishing platforms to Axhub only', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-home' },
      publishSettings: { includeSource: true },
    });
    const server = await startTestServer(projectRoot);

    try {
      const configResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`));
      const config = await readJsonResponse(configResponse);

      expect(configResponse.status).toBe(200);
      expect(config.targets.publishSettings).toMatchObject({
        includeSource: true,
        visibleTargets: ['axhub'],
      });
    } finally {
      await server.close();
    }
  });

  it('ignores legacy project cloud publishing config when no server config exists', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeJson(getConfigPath(projectRoot), {
      server: { host: 'localhost', allowLAN: true },
      cloudPublishing: {
        vercel: { token: 'legacy-token', projectName: 'legacy-project' },
        publishSettings: { includeSource: true, visibleTargets: ['vercel'] },
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const configResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`));
      const config = await readJsonResponse(configResponse);

      expect(configResponse.status).toBe(200);
      expect(config.targets.vercel).toMatchObject({
        configured: false,
        tokenConfigured: false,
        projectName: '',
        missingFields: ['token', 'projectName'],
      });
      expect(config.targets.publishSettings).toMatchObject({
        includeSource: false,
        visibleTargets: ['axhub'],
      });
    } finally {
      await server.close();
    }
  });

  it('preserves existing server secrets when saving blank secret fields', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      vercel: { token: 'old-vercel-token', projectName: 'axhub-home' },
      cloudflarePages: { apiToken: 'old-cf-token', accountId: 'account-1', productionBranch: 'main' },
      s3: {
        accessKeyId: 'OLD_AKIA_TEST',
        secretAccessKey: 'old-s3-secret',
        region: 'us-east-1',
        bucket: 'axhub-sites',
        baseUrl: 'https://cdn.example.com/',
      },
    });
    const server = await startTestServer(projectRoot);

    try {
      const saveResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vercel: { token: '', projectName: 'axhub-updated' },
          cloudflarePages: { apiToken: '', accountId: 'account-2', productionBranch: 'main' },
          s3: {
            accessKeyId: 'NEW_AKIA_TEST',
            secretAccessKey: '',
            region: 'us-west-2',
            bucket: 'axhub-updated',
            baseUrl: 'https://cdn.example.com/updated/',
          },
        }),
      });
      expect(saveResponse.status).toBe(200);

      const serverConfig = JSON.parse(fs.readFileSync(getTestServerConfigPath(projectRoot), 'utf8'));
      expect(serverConfig.cloudPublishing).toMatchObject({
        vercel: { token: 'old-vercel-token', projectName: 'axhub-updated' },
        cloudflarePages: { apiToken: 'old-cf-token', accountId: 'account-2' },
        s3: {
          accessKeyId: 'NEW_AKIA_TEST',
          secretAccessKey: 'old-s3-secret',
          region: 'us-west-2',
          bucket: 'axhub-updated',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('defaults cloud publishing to exclude source files from published static assets', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeFile(path.join(projectRoot, 'src/prototypes/home/components/Card.tsx'), 'export function Card() { return null; }\n');
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-home' },
    });
    const fetchMock = mockExternalFetch(() => jsonResponse({
      url: 'axhub-home.vercel.app',
    }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: 'prototypes/home' }),
      });

      expect(response.status).toBe(200);
      const [, requestInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('api.vercel.com')) || [];
      const payload = JSON.parse(String(requestInit?.body));
      expect(payload.files.map((file: any) => file.file)).not.toEqual(expect.arrayContaining([
        'source/index.tsx',
        'source/components/Card.tsx',
      ]));
    } finally {
      await server.close();
    }
  });

  it('can enable source files for cloud publishing', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeFile(path.join(projectRoot, 'src/prototypes/home/components/Card.tsx'), 'export function Card() { return null; }\n');
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-home' },
      publishSettings: { includeSource: true },
    });
    const fetchMock = mockExternalFetch(() => jsonResponse({
      url: 'axhub-home.vercel.app',
    }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: 'prototypes/home' }),
      });

      expect(response.status).toBe(200);
      const [, requestInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('api.vercel.com')) || [];
      const payload = JSON.parse(String(requestInit?.body));
      expect(payload.files.map((file: any) => file.file)).toEqual(expect.arrayContaining([
        'source/index.tsx',
        'source/components/Card.tsx',
      ]));
    } finally {
      await server.close();
    }
  });

  it('injects review submit globals into cloud publishing files when the prototype config enables it', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeJson(path.join(projectRoot, 'src/prototypes/home/.spec/reviews/config.json'), {
      schemaVersion: 1,
      lanSubmitEnabled: true,
    });
    writeJson(getConfigPath(projectRoot), {
      server: { host: 'localhost', allowLAN: true, lanHost: '10.0.8.42' },
    });
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-home' },
    });
    const fetchMock = mockExternalFetch(() => jsonResponse({
      url: 'axhub-home.vercel.app',
    }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: 'prototypes/home' }),
      });

      expect(response.status).toBe(200);
      const [, requestInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('api.vercel.com')) || [];
      const payload = JSON.parse(String(requestInit?.body));
      const htmlFile = payload.files.find((file: any) => file.file === 'index.html');
      const html = Buffer.from(String(htmlFile?.data || ''), 'base64').toString('utf8');
      const port = new URL(server.origin).port;
      expect(html).toContain('window.__AXHUB_REVIEW_SUBMIT__');
      expect(html).toContain(`http://10.0.8.42:${port}/api/review-reports/submit?projectId=cloud-client&prototypeId=home`);
    } finally {
      await server.close();
    }
  });

  it('saves GitHub Pages config with defaults and infers repository from git remotes', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeFile(path.join(projectRoot, '.git/config'), [
      '[remote "origin"]',
      '  url = git@github.com:lintendo/axhub-pages-demo.git',
      '',
    ].join('\n'));
    const server = await startTestServer(projectRoot);

    try {
      const saveResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubPages: {
            branch: '',
            sourceDirectory: '',
          },
        }),
      });
      expect(saveResponse.status).toBe(200);

      const configResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`));
      const config = await readJsonResponse(configResponse);

      expect(configResponse.status).toBe(200);
      expect(config.targets.githubPages).toMatchObject({
        configured: true,
        repository: 'lintendo/axhub-pages-demo',
        branch: 'gh-pages',
        sourceDirectory: '/',
        missingFields: [],
      });
    } finally {
      await server.close();
    }
  });

  it('returns CONFIG_REQUIRED before publishing when target config is incomplete', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'CONFIG_REQUIRED',
        target: 'vercel',
      });
      expect(body.missingFields).toEqual(expect.arrayContaining(['token', 'projectName']));
    } finally {
      await server.close();
    }
  });

  it('rejects publishing paths that cannot be resolved from project metadata', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-home' },
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: '../outside' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(424);
      expect(body).toMatchObject({
        code: 'SOURCE_METADATA_REQUIRED',
      });
    } finally {
      await server.close();
    }
  });

  it('returns GitHub CLI authentication guidance before publishing when gh is unavailable', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      githubPages: {
        repository: 'lintendo/axhub-pages-demo',
        branch: 'gh-pages',
        sourceDirectory: '/',
      },
    });
    const commandMock = mockCommandExecutor(async () => {
      throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    });
    const server = await startTestServer(projectRoot, { cloudPublishingCommandExecutor: commandMock });

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'github-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'GITHUB_CLI_REQUIRED',
        target: 'github-pages',
      });
      expect(commandMock).toHaveBeenCalledWith('gh', ['auth', 'status'], { cwd: projectRoot });
    } finally {
      await server.close();
    }
  });

  it('returns GitHub auth guidance when gh is installed but not authenticated', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      githubPages: {
        repository: 'lintendo/axhub-pages-demo',
        branch: 'gh-pages',
        sourceDirectory: '/',
      },
    });
    const commandMock = mockCommandExecutor(async () => {
      throw Object.assign(new Error('not logged in'), { code: 1 });
    });
    const server = await startTestServer(projectRoot, { cloudPublishingCommandExecutor: commandMock });

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'github-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'GITHUB_AUTH_REQUIRED',
        target: 'github-pages',
      });
    } finally {
      await server.close();
    }
  });

  it('publishes to Vercel with production target and records the export', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-home', teamId: 'team_123' },
    });
    const fetchMock = mockExternalFetch(() => jsonResponse({
      url: 'axhub-home.vercel.app',
    }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'vercel',
        url: 'https://axhub-home.vercel.app',
      });
      const [requestUrl, requestInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('api.vercel.com')) || [];
      expect(String(requestUrl)).toContain('/v13/deployments');
      expect(String(requestUrl)).toContain('teamId=team_123');
      expect(requestInit?.headers).toMatchObject({
        Authorization: 'Bearer vercel-token',
        'Content-Type': 'application/json',
      });
      const payload = JSON.parse(String(requestInit?.body));
      expect(payload).toMatchObject({
        name: 'axhub-home',
        target: 'production',
        projectSettings: { framework: null },
      });
      expect(payload.files.map((file: any) => file.file)).toEqual(expect.arrayContaining(['index.html', 'index.js']));

      const exportRecords = fs.readdirSync(getProjectExportsDir(projectRoot));
      expect(exportRecords.length).toBeGreaterThan(0);
      const latestRecord = JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), exportRecords[0]), 'utf8'));
      expect(latestRecord).toMatchObject({
        projectId: 'cloud-client',
        resourceId: 'home',
        operationType: 'cloud.publish.vercel',
        status: 'success',
      });
    } finally {
      await server.close();
    }
  });

  it('publishes to GitHub Pages through REST APIs using the local gh token', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      githubPages: {
        repository: 'lintendo/axhub-pages-demo',
        branch: 'gh-pages',
        sourceDirectory: '/',
      },
    });
    const commandMock = mockCommandExecutor(async (command, args) => {
      if (command === 'gh' && args.join(' ') === 'auth status') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'gh' && args.join(' ') === 'auth token') {
        return { stdout: 'gh-test-token\n', stderr: '' };
      }
      throw new Error(`unexpected command ${command} ${args.join(' ')}`);
    });
    const fetchMock = mockExternalFetch((input, init) => mockGitHubPagesRestWithResourcePrefix(input, init));
    const server = await startTestServer(projectRoot, { cloudPublishingCommandExecutor: commandMock });

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'github-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'github-pages',
        url: 'https://lintendo.github.io/axhub-pages-demo/home/',
      });
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/git/blobs'))).toBe(true);
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/git/trees'))).toBe(true);
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/pages'))).toBe(true);
      expect(commandMock).toHaveBeenCalledWith('gh', ['auth', 'token'], { cwd: projectRoot });

      const exportRecords = fs.readdirSync(getProjectExportsDir(projectRoot));
      const latestRecord = JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), exportRecords[0]), 'utf8'));
      expect(latestRecord).toMatchObject({
        operationType: 'cloud.publish.github-pages',
        status: 'success',
        metadata: {
          repository: 'lintendo/axhub-pages-demo',
          branch: 'gh-pages',
          sourceDirectory: '/',
          pathPrefix: 'home',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('auto-generates a GitHub Pages path prefix from the resource path when no path prefix is configured', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      githubPages: {
        repository: 'lintendo/axhub-pages-demo',
        branch: 'gh-pages',
        sourceDirectory: '/',
        pathPrefix: '',
      },
    });
    const commandMock = mockCommandExecutor(async (command, args) => {
      if (command === 'gh' && args.join(' ') === 'auth status') {
        return { stdout: '', stderr: '' };
      }
      if (command === 'gh' && args.join(' ') === 'auth token') {
        return { stdout: 'gh-test-token\n', stderr: '' };
      }
      throw new Error(`unexpected command ${command} ${args.join(' ')}`);
    });
    const fetchMock = mockExternalFetch((input, init) => mockGitHubPagesRestWithResourcePrefix(input, init));
    const server = await startTestServer(projectRoot, { cloudPublishingCommandExecutor: commandMock });

    try {
      const configResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`));
      const config = await readJsonResponse(configResponse);
      expect(config.targets.githubPages).toMatchObject({
        configured: true,
        pathPrefix: '',
        missingFields: [],
      });

      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'github-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'github-pages',
        url: 'https://lintendo.github.io/axhub-pages-demo/home/',
      });
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/git/trees'))).toBe(true);

      const exportRecords = fs.readdirSync(getProjectExportsDir(projectRoot));
      const latestRecord = JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), exportRecords[0]), 'utf8'));
      expect(latestRecord).toMatchObject({
        operationType: 'cloud.publish.github-pages',
        status: 'success',
        metadata: {
          repository: 'lintendo/axhub-pages-demo',
          branch: 'gh-pages',
          sourceDirectory: '/',
          pathPrefix: 'home',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('publishes to Cloudflare Pages create deployment API and reports missing project errors clearly', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      cloudflarePages: {
        apiToken: 'cf-token',
        accountId: 'account-1',
        projectName: 'axhub-home',
        productionBranch: 'main',
      },
    });
    const fetchMock = mockExternalFetch((input, init) => {
      const url = String(input);
      if (url.endsWith('/upload-token')) {
        return jsonResponse({ success: true, result: { jwt: 'cf-upload-jwt' } });
      }
      if (url.endsWith('/assets/check-missing')) {
        const payload = JSON.parse(String(init?.body));
        return jsonResponse({ success: true, result: payload.hashes });
      }
      if (url.endsWith('/assets/upload') || url.endsWith('/assets/upsert-hashes')) {
        return jsonResponse({ success: true, result: {} });
      }
      return jsonResponse({
        success: true,
        result: {
          id: 'deployment-1',
          url: 'https://deployment-1.axhub-home.pages.dev',
        },
      });
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'cloudflare-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'cloudflare-pages',
        url: 'https://axhub-home.pages.dev',
      });
      const [tokenUrl, tokenInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).endsWith('/upload-token')) || [];
      expect(String(tokenUrl)).toContain('/accounts/account-1/pages/projects/axhub-home/upload-token');
      expect(tokenInit?.headers).toMatchObject({ Authorization: 'Bearer cf-token' });

      const [assetsUploadUrl, assetsUploadInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).endsWith('/assets/upload')) || [];
      expect(String(assetsUploadUrl)).toBe('https://api.cloudflare.com/client/v4/pages/assets/upload');
      expect(assetsUploadInit?.headers).toMatchObject({
        Authorization: 'Bearer cf-upload-jwt',
        'Content-Type': 'application/json',
      });
      const uploadedAssets = JSON.parse(String(assetsUploadInit?.body));
      expect(uploadedAssets[0]).toMatchObject({
        key: expect.stringMatching(/^[a-f0-9]{32}$/u),
        base64: true,
      });

      const [requestUrl, requestInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('api.cloudflare.com')) || [];
      const [deploymentUrl, deploymentInit] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('/deployments')) || [];
      expect(String(requestUrl)).toContain('/upload-token');
      expect(String(deploymentUrl)).toContain('/accounts/account-1/pages/projects/axhub-home/deployments');
      expect(requestInit?.headers).toMatchObject({
        Authorization: 'Bearer cf-token',
      });
      expect(deploymentInit?.body).toBeInstanceOf(FormData);
      const manifest = JSON.parse(String((deploymentInit?.body as FormData).get('manifest')));
      expect(manifest['/index.html']).toMatch(/^[a-f0-9]{32}$/u);
      expect(manifest['/index.js']).toBe(cloudflarePagesAssetHash('var UserComponent = function Home(){};', 'js'));
      const records = fs.readdirSync(getProjectExportsDir(projectRoot))
        .map((fileName) => JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), fileName), 'utf8')));
      expect(records[0].metadata).toMatchObject({
        url: 'https://axhub-home.pages.dev',
        deploymentUrl: 'https://deployment-1.axhub-home.pages.dev',
        deploymentId: 'deployment-1',
      });
    } finally {
      await server.close();
    }
  });

  it('returns the Cloudflare Pages production subdomain from the project API when it differs from the configured project name', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      cloudflarePages: {
        apiToken: 'cf-token',
        accountId: 'account-1',
        projectName: 'axhub',
        productionBranch: 'main',
      },
    });
    mockExternalFetch((input, init) => {
      const url = String(input);
      if (url.endsWith('/upload-token')) {
        return jsonResponse({ success: true, result: { jwt: 'cf-upload-jwt' } });
      }
      if (url.endsWith('/assets/check-missing')) {
        const payload = JSON.parse(String(init?.body));
        return jsonResponse({ success: true, result: payload.hashes });
      }
      if (url.endsWith('/assets/upload') || url.endsWith('/assets/upsert-hashes')) {
        return jsonResponse({ success: true, result: {} });
      }
      if (url.endsWith('/pages/projects/axhub')) {
        return jsonResponse({
          success: true,
          result: {
            name: 'axhub',
            subdomain: 'axhub-4sd.pages.dev',
            domains: ['custom.example.com'],
          },
        });
      }
      return jsonResponse({
        success: true,
        result: {
          id: 'deployment-1',
          url: 'https://6450f361.axhub-4sd.pages.dev',
        },
      });
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'cloudflare-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'cloudflare-pages',
        url: 'https://axhub-4sd.pages.dev',
      });
      const records = fs.readdirSync(getProjectExportsDir(projectRoot))
        .map((fileName) => JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), fileName), 'utf8')));
      expect(records[0].metadata).toMatchObject({
        url: 'https://axhub-4sd.pages.dev',
        deploymentUrl: 'https://6450f361.axhub-4sd.pages.dev',
        cloudflarePagesProjectName: 'axhub',
      });
    } finally {
      await server.close();
    }
  });

  it('auto-generates a Cloudflare Pages project name from the resource path when no project name is configured', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      cloudflarePages: {
        apiToken: 'cf-token',
        accountId: 'account-1',
        projectName: '',
        productionBranch: 'main',
      },
    });
    const fetchMock = mockExternalFetch((input, init) => {
      const url = String(input);
      if (url.endsWith('/upload-token')) {
        return jsonResponse({ success: true, result: { jwt: 'cf-upload-jwt' } });
      }
      if (url.endsWith('/assets/check-missing')) {
        const payload = JSON.parse(String(init?.body));
        return jsonResponse({ success: true, result: payload.hashes });
      }
      if (url.endsWith('/assets/upload') || url.endsWith('/assets/upsert-hashes')) {
        return jsonResponse({ success: true, result: {} });
      }
      if (url.endsWith('/pages/projects/home')) {
        return jsonResponse({
          success: true,
          result: {
            name: 'home',
            subdomain: 'home.pages.dev',
          },
        });
      }
      return jsonResponse({
        success: true,
        result: {
          id: 'deployment-1',
          url: 'https://6450f361.home.pages.dev',
        },
      });
    });
    const server = await startTestServer(projectRoot);

    try {
      const configResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/config`));
      const config = await readJsonResponse(configResponse);
      expect(config.targets.cloudflarePages).toMatchObject({
        configured: true,
        projectName: '',
        missingFields: [],
      });

      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'cloudflare-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'cloudflare-pages',
        url: 'https://home.pages.dev',
      });
      const [deploymentUrl] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('/deployments')) || [];
      expect(String(deploymentUrl)).toContain('/accounts/account-1/pages/projects/home/deployments');
      const records = fs.readdirSync(getProjectExportsDir(projectRoot))
        .map((fileName) => JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), fileName), 'utf8')));
      expect(records[0].metadata).toMatchObject({
        cloudflarePagesProjectName: 'home',
      });
    } finally {
      await server.close();
    }
  });

  it('splits oversized Cloudflare Pages upload batches and rejects single files over the Pages asset limit', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      cloudflarePages: {
        apiToken: 'cf-token',
        accountId: 'account-1',
        projectName: 'axhub-home',
        productionBranch: 'main',
      },
    });
    for (let index = 0; index < 45; index += 1) {
      writeFile(path.join(projectRoot, 'src/media', `asset-${index}.txt`), `asset-${index}`);
    }
    const uploadedBatchSizes: number[] = [];
    const fetchMock = mockExternalFetch((input, init) => {
      const url = String(input);
      if (url.endsWith('/upload-token')) {
        return jsonResponse({ success: true, result: { jwt: 'cf-upload-jwt' } });
      }
      if (url.endsWith('/assets/check-missing')) {
        const payload = JSON.parse(String(init?.body));
        return jsonResponse({ success: true, result: payload.hashes });
      }
      if (url.endsWith('/assets/upload')) {
        const payload = JSON.parse(String(init?.body));
        uploadedBatchSizes.push(Buffer.byteLength(String(init?.body), 'utf8'));
        expect(payload.length).toBeLessThanOrEqual(40);
        return jsonResponse({ success: true, result: {} });
      }
      if (url.endsWith('/assets/upsert-hashes')) {
        return jsonResponse({ success: true, result: {} });
      }
      return jsonResponse({ success: true, result: { url: 'https://axhub-home.pages.dev' } });
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'cloudflare-pages', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body.url).toBe('https://axhub-home.pages.dev');
      expect(fetchMock.mock.calls.filter(([requestUrl]) => String(requestUrl).endsWith('/assets/upload')).length).toBeGreaterThan(1);
      expect(uploadedBatchSizes.every((size) => size < 40 * 1024 * 1024)).toBe(true);

      vi.mocked(buildOnDemand).mockResolvedValueOnce({
        jsCode: 'var UserComponent = function Home(){};',
        cssText: 'x'.repeat(26 * 1024 * 1024),
        metadata: { usesAnnotationRuntime: false },
      });
      const tooLargeResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'cloudflare-pages', path: 'prototypes/home' }),
      });
      const tooLargeBody = await readJsonResponse(tooLargeResponse);

      expect(tooLargeResponse.status).toBe(500);
      expect(tooLargeBody.error).toContain('Cloudflare Pages 单个静态资源不能超过 25 MiB');
      expect(tooLargeBody.error).toContain('index.css');
    } finally {
      await server.close();
    }
  });

  it('returns the latest successful cloud publish URLs per target', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudPublishRecord(projectRoot, {
      target: 'vercel',
      status: 'success',
      url: 'https://old.vercel.app',
      createdAt: '2026-05-18T10:00:00.000Z',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 'vercel',
      status: 'success',
      url: 'https://latest.vercel.app',
      createdAt: '2026-05-18T11:00:00.000Z',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 'cloudflare-pages',
      status: 'failed',
      url: 'https://failed.pages.dev',
      createdAt: '2026-05-18T12:00:00.000Z',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 's3',
      status: 'success',
      url: 'https://cdn.example.com/index.html',
      createdAt: '2026-05-18T09:00:00.000Z',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 'github-pages',
      status: 'success',
      url: 'https://lintendo.github.io/axhub-pages-demo/',
      createdAt: '2026-05-18T13:00:00.000Z',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 'axhub',
      status: 'success',
      url: 'https://axhub.im/html/hosted-home/',
      createdAt: '2026-05-18T14:00:00.000Z',
      axhubProjectId: 123,
      axhubProjectPath: 'hosted-home',
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/latest`));
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body.targets).toMatchObject({
        vercel: {
          url: 'https://latest.vercel.app',
          deployedAt: '2026-05-18T11:00:00.000Z',
        },
        s3: {
          url: 'https://cdn.example.com/index.html',
          deployedAt: '2026-05-18T09:00:00.000Z',
        },
        githubPages: {
          url: 'https://lintendo.github.io/axhub-pages-demo/',
          deployedAt: '2026-05-18T13:00:00.000Z',
        },
        axhub: {
          url: 'https://axhub.im/html/hosted-home/',
          deployedAt: '2026-05-18T14:00:00.000Z',
          axhubProjectId: 123,
          axhubProjectPath: 'hosted-home',
        },
      });
      expect(body.targets.cloudflarePages).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('filters latest successful cloud publish URLs by prototype resource path', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudPublishRecord(projectRoot, {
      target: 'vercel',
      status: 'success',
      url: 'https://home.vercel.app',
      createdAt: '2026-05-18T10:00:00.000Z',
      path: 'src/prototypes/home',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 'vercel',
      status: 'success',
      url: 'https://other.vercel.app',
      createdAt: '2026-05-18T11:00:00.000Z',
      path: 'src/prototypes/other',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 's3',
      status: 'success',
      url: 'https://cdn.example.com/home/index.html',
      createdAt: '2026-05-18T12:00:00.000Z',
      path: 'prototypes/home/index.tsx',
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/latest?path=${encodeURIComponent('src/prototypes/home')}`));
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body.targets.vercel).toMatchObject({
        url: 'https://home.vercel.app',
        path: 'src/prototypes/home',
      });
      expect(body.targets.s3).toMatchObject({
        url: 'https://cdn.example.com/home/index.html',
        path: 'src/prototypes/home',
      });
    } finally {
      await server.close();
    }
  });

  it('filters latest successful cloud publish URLs by theme resource path and equivalent forms', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudPublishRecord(projectRoot, {
      target: 'vercel',
      status: 'success',
      url: 'https://brand-theme.vercel.app',
      createdAt: '2026-05-18T10:00:00.000Z',
      resourceId: 'brand',
      path: 'src/themes/brand/index.tsx',
    });
    writeCloudPublishRecord(projectRoot, {
      target: 'vercel',
      status: 'success',
      url: 'https://home.vercel.app',
      createdAt: '2026-05-18T11:00:00.000Z',
      path: 'src/prototypes/home',
    });
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/latest?path=${encodeURIComponent('themes/brand')}`));
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body.targets.vercel).toMatchObject({
        url: 'https://brand-theme.vercel.app',
        path: 'src/themes/brand',
      });
      expect(body.targets.s3).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('publishes a theme directory by resolving its index entry and recording the normalized resource path', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      vercel: { token: 'vercel-token', projectName: 'axhub-theme-brand' },
    });
    const fetchMock = mockExternalFetch(() => jsonResponse({
      url: 'axhub-theme-brand.vercel.app',
    }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'vercel', path: 'themes/brand' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 'vercel',
        url: 'https://axhub-theme-brand.vercel.app',
      });
      expect(vi.mocked(buildOnDemand)).toHaveBeenCalledWith(projectRoot, path.join(projectRoot, 'src/themes/brand/index.tsx'));
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('api.vercel.com'))).toBe(true);
      const records = fs.readdirSync(getProjectExportsDir(projectRoot))
        .map((fileName) => JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), fileName), 'utf8')));
      expect(records[0]).toMatchObject({
        resourceId: 'brand',
        resourceType: 'theme',
        metadata: {
          path: 'src/themes/brand',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('uploads S3 files with SigV4 authorization and returns the configured base URL', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      s3: {
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'axhub-sites',
        prefix: 'home',
        baseUrl: 'https://cdn.example.com/home/',
      },
    });
    const fetchMock = mockExternalFetch(() => new Response('', { status: 200 }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 's3', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 's3',
        url: 'https://cdn.example.com/home/home/index.html',
      });
      const s3Calls = fetchMock.mock.calls.filter(([requestUrl]) => String(requestUrl).includes('s3.us-east-1.amazonaws.com'));
      expect(s3Calls.length).toBeGreaterThan(1);
      const [requestUrl, requestInit] = s3Calls[0];
      expect(String(requestUrl)).toContain('https://axhub-sites.s3.us-east-1.amazonaws.com/home/');
      expect(requestInit?.method).toBe('PUT');
      expect((requestInit?.headers as Record<string, string>).Authorization).toContain('AWS4-HMAC-SHA256 Credential=AKIA_TEST/');
    } finally {
      await server.close();
    }
  });

  it('auto-generates an S3 prefix from the resource path when no prefix is configured', async () => {
    const projectRoot = createTempRoot();
    writeProject(projectRoot);
    writeCloudConfig(projectRoot, {
      s3: {
        accessKeyId: 'OSS_TEST',
        secretAccessKey: 'secret',
        region: 'cn-hangzhou',
        bucket: 'webpp',
        prefix: '',
        baseUrl: 'https://webpp.oss-cn-hangzhou.aliyuncs.com',
      },
    });
    const fetchMock = mockExternalFetch(() => new Response('', { status: 200 }));
    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/cloud-publishing/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 's3', path: 'prototypes/home' }),
      });
      const body = await readJsonResponse(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        target: 's3',
        url: 'https://webpp.oss-cn-hangzhou.aliyuncs.com/home/index.html',
      });
      const s3Calls = fetchMock.mock.calls.filter(([requestUrl]) => String(requestUrl).includes('webpp.s3.oss-cn-hangzhou.aliyuncs.com'));
      expect(s3Calls.length).toBeGreaterThan(1);
      const [requestUrl, requestInit] = s3Calls[0];
      expect(String(requestUrl)).toContain('https://webpp.s3.oss-cn-hangzhou.aliyuncs.com/home/');
      expect((requestInit?.headers as Record<string, string>).Authorization).toContain('Credential=OSS_TEST/');
    } finally {
      await server.close();
    }
  });

  it('normalizes native Aliyun OSS endpoints to virtual-hosted S3-compatible upload URLs', () => {
    const signed = __cloudPublishingTestUtils.signS3PutObject({
      config: {
        accessKeyId: 'OSS_TEST',
        secretAccessKey: 'secret',
        region: 'cn-hangzhou',
        bucket: 'webpp',
        prefix: 'home',
        baseUrl: 'https://webpp.oss-cn-hangzhou.aliyuncs.com',
        endpoint: 'https://oss-cn-hangzhou.aliyuncs.com/',
      },
      key: 'home/index.html',
      body: Buffer.from('<html></html>'),
      contentType: 'text/html',
      now: new Date('2026-01-02T03:04:05Z'),
    });

    expect(signed.url).toBe('https://webpp.s3.oss-cn-hangzhou.aliyuncs.com/home/index.html');
    expect(signed.headers.Authorization).toContain('Credential=OSS_TEST/20260102/cn-hangzhou/s3/aws4_request');
  });

  it('does not apply the Aliyun OSS endpoint rewrite to other S3-compatible providers', () => {
    const signed = __cloudPublishingTestUtils.signS3PutObject({
      config: {
        accessKeyId: 'COS_TEST',
        secretAccessKey: 'secret',
        region: 'ap-guangzhou',
        bucket: 'gtest-1251531633',
        prefix: 'home',
        baseUrl: 'https://gtest-1251531633.cos.ap-guangzhou.myqcloud.com',
        endpoint: 'https://gtest-1251531633.cos.ap-guangzhou.myqcloud.com',
      },
      key: 'home/index.html',
      body: Buffer.from('<html></html>'),
      contentType: 'text/html',
      now: new Date('2026-01-02T03:04:05Z'),
    });

    expect(signed.url).toBe('https://gtest-1251531633.cos.ap-guangzhou.myqcloud.com/home/index.html');
    expect(signed.headers.Authorization).toContain('Credential=COS_TEST/20260102/ap-guangzhou/s3/aws4_request');
  });
});
