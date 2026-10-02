import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readHtmlManifest, readRealtimeManifest, writeHtmlSnapshot, writeRealtimeManifest } from '../lanPublishingStorage.ts';
import { isPublicPublishedRequest } from '../localPublishingPublic.ts';
import { createProjectRegistry, writeServerInfo } from '../projectCore/index.ts';
import { startMakeServer } from '../index.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers.ts';

afterEach(() => {
  cleanupProjectApiTestRoots();
});

async function createServerWithPublishedResources() {
  const projectRoot = createTempRoot('axhub-local-publishing-public-');
  fs.mkdirSync(path.join(projectRoot, 'src/prototypes/home'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
  writeProjectMetadata(projectRoot, {
    project: { id: 'public-publishing', name: 'Public Publishing' },
    resources: {
      prototypes: [{ id: 'home', name: 'home', title: 'Home' }],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
  });
  const server = await startTestServer(projectRoot);
  const html = await writeHtmlSnapshot(projectRoot, [
    { path: 'index.html', contentType: 'text/html; charset=utf-8', body: Buffer.from('<h1>fixed</h1>') },
  ], { projectId: 'public-publishing', resourcePath: 'src/prototypes/home' });
  writeRealtimeManifest(projectRoot, {
    schemaVersion: 1,
    shareId: 'share-public',
    projectId: 'public-publishing',
    resourcePath: 'src/prototypes/home',
    previewPath: '/prototypes/home?agentToolbar=host#page=overview',
    commentable: true,
    updatedAt: new Date().toISOString(),
  });
  expect(readHtmlManifest(projectRoot, html.publishId)).not.toBeNull();
  expect(readRealtimeManifest(projectRoot, 'share-public')).not.toBeNull();
  return { projectRoot, server, html };
}

describe('local publishing public routes', () => {
  it('serves immutable HTML files with a long-lived cache policy', async () => {
    const { server, html } = await createServerWithPublishedResources();
    try {
      const response = await fetch(`${server.origin}/published/html/${html.publishId}/index.html`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('immutable');
      expect(await response.text()).toBe('<h1>fixed</h1>');
    } finally {
      await server.close();
    }
  });

  it('lets a published HTML link bypass the LAN password gate', async () => {
    const { projectRoot, server, html } = await createServerWithPublishedResources();
    const nonLocalHeaders = { 'x-forwarded-for': '192.168.1.55' };
    try {
      const passwordResponse = await fetch(`${server.origin}/api/access/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'published-link-secret' }),
      });
      expect(passwordResponse.status).toBe(200);

      const response = await fetch(`${server.origin}/published/html/${html.publishId}/index.html`, {
        headers: nonLocalHeaders,
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<h1>fixed</h1>');

      const protectedApi = await fetch(`${server.origin}/api/version?publishedShareId=share-public`, {
        headers: { ...nonLocalHeaders, referer: `${server.origin}/published/prototype/share-public` },
      });
      expect(protectedApi.status).toBe(401);

      const protectedOtherRuntime = await fetch(
        `${server.origin}/prototypes/other?projectId=public-publishing&publishedShareId=share-public`,
        { headers: nonLocalHeaders },
      );
      expect(protectedOtherRuntime.status).toBe(401);
      const spoofedOtherRuntime = await fetch(`${server.origin}/prototypes/other`, {
        headers: { ...nonLocalHeaders, referer: `${server.origin}/prototypes/home?projectId=public-publishing&publishedShareId=share-public` },
      });
      expect(spoofedOtherRuntime.status).toBe(401);
      const publishedRuntimeReferer = `${server.origin}/prototypes/home?projectId=public-publishing&publishedShareId=share-public`;
      const spoofedOtherSource = await fetch(`${server.origin}/src/prototypes/other/index.tsx`, {
        headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer },
      });
      expect(spoofedOtherSource.status).toBe(401);
      const spoofedOtherHtmlProxy = await fetch(
        `${server.origin}/@id/__x00__/prototypes/other/index.html?html-proxy&index=0.js`,
        { headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer } },
      );
      expect(spoofedOtherHtmlProxy.status).toBe(401);
      const encodedProjectRoot = projectRoot.split('/').map(encodeURIComponent).join('/');
      const spoofedProjectFile = await fetch(`${server.origin}/@fs${encodedProjectRoot}/package.json`, {
        headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer },
      });
      expect(spoofedProjectFile.status).toBe(401);
      const spoofedOutsideFile = await fetch(`${server.origin}/@fs/etc/passwd`, {
        headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer },
      });
      expect(spoofedOutsideFile.status).toBe(401);
      const spoofedResourceFile = await fetch(`${server.origin}/src/resources/private.md?publishedShareId=share-public`, {
        headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer },
      });
      expect(spoofedResourceFile.status).toBe(401);
      const spoofedResourceModule = await fetch(`${server.origin}/@id/src/resources/private.md?publishedShareId=share-public`, {
        headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer },
      });
      expect(spoofedResourceModule.status).toBe(401);

      const publishedRuntime = await fetch(
        `${server.origin}/prototypes/home?projectId=public-publishing&publishedShareId=share-public`,
        { headers: nonLocalHeaders },
      );
      expect(publishedRuntime.status).not.toBe(401);
      const publishedSource = await fetch(
        `${server.origin}/src/prototypes/home/index.tsx?projectId=public-publishing&publishedShareId=share-public`,
        { headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer } },
      );
      expect(publishedSource.status).not.toBe(401);
      const publishedSharedSource = await fetch(`${server.origin}/common/useHashPage.ts?projectId=public-publishing&publishedShareId=share-public`, {
        headers: { ...nonLocalHeaders, referer: publishedRuntimeReferer },
      });
      expect(publishedSharedSource.status).not.toBe(401);

      const protectedComments = await fetch(`${server.origin}/api/prototype-comments?targetPath=prototypes/home`, {
        headers: { ...nonLocalHeaders, referer: `${server.origin}/published/prototype/share-public` },
      });
      expect(protectedComments.status).toBe(401);

      const publishedComments = await fetch(
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home&projectId=public-publishing&publishedShareId=share-public`,
        { headers: nonLocalHeaders },
      );
      expect(publishedComments.status).toBe(424);

      const publishedCommentAsset = await fetch(
        `${server.origin}/api/prototype-comments/asset?targetPath=prototypes/home&asset=missing.png&projectId=public-publishing&publishedShareId=share-public`,
        { headers: nonLocalHeaders },
      );
      expect(publishedCommentAsset.status).toBe(424);
    } finally {
      await server.close();
    }
  });

  it('uses the default project registry when registryPath is omitted', async () => {
    const projectRoot = createTempRoot('axhub-local-publishing-default-registry-');
    const registryHome = createTempRoot('axhub-local-publishing-default-home-');
    fs.mkdirSync(path.join(projectRoot, 'src/prototypes/home'), { recursive: true });
    writeProjectMetadata(projectRoot, {
      project: { id: 'default-registry-project', name: 'Default Registry Project' },
      resources: { prototypes: [{ id: 'home', name: 'home', title: 'Home' }], docs: [], themes: [], data: [], templates: [] },
    });
    const registry = createProjectRegistry({ homeDir: registryHome });
    registry.addProject({ id: 'default-registry-project', name: 'Default Registry Project', root: projectRoot });
    const previousHome = process.env.AXHUB_MAKE_HOME_DIR;
    process.env.AXHUB_MAKE_HOME_DIR = registryHome;
    const html = await writeHtmlSnapshot(projectRoot, [
      { path: 'index.html', contentType: 'text/html; charset=utf-8', body: Buffer.from('<h1>default registry</h1>') },
    ], { projectId: 'default-registry-project', resourcePath: 'src/prototypes/home' });
    let server: Awaited<ReturnType<typeof startMakeServer>> | null = null;
    try {
      server = await startMakeServer({
        projectRoot: createTempRoot('axhub-local-publishing-fallback-root-'),
        host: 'localhost',
        port: 0,
        adminRoot: path.join(projectRoot, 'missing-admin'),
      });
      const response = await fetch(`${server.origin}/published/html/${html.publishId}/index.html`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<h1>default registry</h1>');
    } finally {
      if (server) await server.close();
      if (previousHome === undefined) delete process.env.AXHUB_MAKE_HOME_DIR;
      else process.env.AXHUB_MAKE_HOME_DIR = previousHome;
    }
  });

  it('serves a review shell that preserves the current page and reuses the inline annotation toolbar', async () => {
    const { server } = await createServerWithPublishedResources();
    try {
      const response = await fetch(`${server.origin}/published/prototype/share-public`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const html = await response.text();
      expect(html).toContain(
        'src="/prototypes/home?projectId=public-publishing&amp;annotationSession=1&amp;publishedShareId=share-public#page=overview"',
      );
      expect(html).not.toContain('agentToolbar=host');
      expect(html).not.toContain('published-review-toolbar');
      expect(response.headers.get('location')).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('points the published iframe at the registered client runtime when it is available', async () => {
    const { projectRoot, server } = await createServerWithPublishedResources();
    let runtimeOrigin = '';
    let runtimePort = 0;
    const runtime = http.createServer((req, res) => {
      if (req.url === '/api/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          role: 'runtime',
          server: {
            pid: process.pid,
            port: runtimePort,
            host: 'localhost',
            origin: runtimeOrigin,
            projectRoot,
            startedAt: new Date().toISOString(),
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => runtime.listen(0, '127.0.0.1', resolve));
    const runtimeAddress = runtime.address();
    runtimePort = typeof runtimeAddress === 'object' && runtimeAddress ? runtimeAddress.port : 0;
    runtimeOrigin = `http://localhost:${runtimePort}`;
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: runtimePort,
      host: 'localhost',
      origin: runtimeOrigin,
      projectRoot,
      startedAt: new Date().toISOString(),
    });
    try {
      const response = await fetch(`${server.origin}/published/prototype/share-public`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(
        `src="${runtimeOrigin}/prototypes/home?projectId=public-publishing&amp;makeServerOrigin=http%3A%2F%2Flocalhost%3A`,
      );
    } finally {
      await new Promise<void>((resolve) => runtime.close(() => resolve()));
      await server.close();
    }
  });

  it('returns realtime context with the request IP for visitor identity defaults', async () => {
    const { server } = await createServerWithPublishedResources();
    try {
      const response = await fetch(`${server.origin}/api/local-publishing/realtime-context?shareId=share-public`);
      expect(response.status).toBe(200);
      const body = await response.json() as { defaultAuthorIp: string; commentable: boolean };
      expect(body).toMatchObject({ commentable: true, defaultAuthorIp: expect.any(String) });
      expect(body).not.toHaveProperty('commenterName');
      expect(body.defaultAuthorIp).toMatch(/\S/u);
    } finally {
      await server.close();
    }
  });

  it('returns 404 for unknown published ids', async () => {
    const { server } = await createServerWithPublishedResources();
    try {
      expect((await fetch(`${server.origin}/published/prototype/missing-share`)).status).toBe(404);
      expect((await fetch(`${server.origin}/published/html/missing-html/index.html`)).status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('rejects project-external Vite fs paths at the public-route boundary', async () => {
    const { projectRoot, server } = await createServerWithPublishedResources();
    try {
      const referer = `${server.origin}/prototypes/home?projectId=public-publishing&publishedShareId=share-public`;
      const request = {
        url: '/@fs/etc/passwd',
        headers: { referer },
        socket: { remoteAddress: '192.168.1.55' },
      } as any;
      expect(isPublicPublishedRequest(request, {
        projectRoot,
        origin: server.origin,
      })).toBe(false);
    } finally {
      await server.close();
    }
  });
});
