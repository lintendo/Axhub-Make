import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getProjectExportsDir, getProjectMetadataPath, writeServerInfo } from '../projectCore/index.ts';
import { startMakeServer } from '../index.ts';
import { resolvePrototypeCommentStorage } from '../documentCommentsStorage.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  writeJson,
  writeProjectMetadata,
} from './projects-api.helpers.ts';
import { readRealtimeManifest } from '../lanPublishingStorage.ts';

vi.mock('../onDemandBuild.ts', () => ({
  buildOnDemand: vi.fn(async () => ({
    jsCode: 'var UserComponent = function Home(){};',
    cssText: '.home{color:red;}',
    metadata: { usesAnnotationRuntime: false },
  })),
}));

afterEach(() => {
  cleanupProjectApiTestRoots();
});

function readExportRecords(projectRoot: string): any[] {
  const exportsDir = getProjectExportsDir(projectRoot);
  if (!fs.existsSync(exportsDir)) return [];
  return fs.readdirSync(exportsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(exportsDir, name), 'utf8')));
}

async function createProject() {
  const projectRoot = createTempRoot('axhub-local-publishing-api-');
  const sourceFile = path.join(projectRoot, 'src/prototypes/home/index.tsx');
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, 'export default function Home() { return null; }\n', 'utf8');
  writeProjectMetadata(projectRoot, {
    project: { id: 'local-publishing', name: 'Local Publishing' },
    resources: {
      prototypes: [{
        id: 'home',
        name: 'home',
        title: 'Home',
        filePath: 'src/prototypes/home/index.tsx',
      }],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
      media: { type: 'project-relative-path', path: 'src/media' },
    },
  });
  const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
  writeJson(getProjectMetadataPath(projectRoot), metadata);
  const registryHome = createTempRoot('axhub-local-publishing-home-');
  const server = await startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: path.join(registryHome, '.axhub/make/projects.json'),
  });
  await registerProject(server.origin, projectRoot, 'local-publishing', 'Local Publishing');
  return { projectRoot, server };
}

describe('local publishing management API', () => {
  it('returns the latest HTML and realtime links for a resource', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const htmlEndpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/html`);
      const realtimeEndpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`);
      const latestEndpoint = scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/local-publishing/latest?path=${encodeURIComponent('src/prototypes/home')}`,
      );

      const empty = await fetch(latestEndpoint);
      expect(empty.status).toBe(200);
      expect(await empty.json()).toMatchObject({ html: null, realtime: null });

      const html = await fetch(htmlEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home' }),
      });
      const htmlBody = await html.json() as { publishId: string; version: number; createdAt: string };
      const realtime = await fetch(realtimeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home' }),
      });
      const realtimeBody = await realtime.json() as { shareId: string; annotationUrl: string; previewUrl: string };
      expect(realtimeBody.annotationUrl).toBe(`${server.origin}/published/prototype/${realtimeBody.shareId}`);
      expect(realtimeBody.previewUrl).toBe(`${server.origin}/prototypes/home?agentToolbar=host`);

      const latest = await fetch(latestEndpoint, {
        headers: { Origin: 'http://localhost:51720' },
      });
      expect(latest.status).toBe(200);
      expect(latest.headers.get('access-control-allow-origin')).toBe('*');
      expect(await latest.json()).toMatchObject({
        resourcePath: 'src/prototypes/home',
        html: {
          publishId: htmlBody.publishId,
          version: htmlBody.version,
          createdAt: htmlBody.createdAt,
        },
        realtime: {
          shareId: realtimeBody.shareId,
          commentable: true,
          annotationUrl: realtimeBody.annotationUrl,
          previewUrl: realtimeBody.previewUrl,
        },
      });
    } finally {
      await server.close();
    }
  });

  it('creates immutable HTML snapshot records with a new id per publish', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const endpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/html`);
      const first = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home', includeSource: false }),
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json() as { publishId: string; url: string; version: number };
      expect(firstBody).toMatchObject({ version: 1 });
      expect(firstBody.publishId).toMatch(/^[a-f0-9]{24}$/u);
      expect(firstBody.url).toContain(`/published/html/${firstBody.publishId}/index.html`);

      fs.writeFileSync(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default function Home() { return 2; }\n', 'utf8');
      const second = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home', includeSource: false }),
      });
      expect(second.status).toBe(200);
      const secondBody = await second.json() as { publishId: string; version: number };
      expect(secondBody.publishId).not.toBe(firstBody.publishId);
      expect(secondBody.version).toBe(2);

      expect(readExportRecords(projectRoot).filter((record) => record.operationType === 'lan.publish.html')).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it('keeps a realtime share id stable while updating its current configuration', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const endpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`);
      const first = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/home',
          previewUrl: 'http://localhost:51720/prototypes/home?agentToolbar=host#page=overview',
          commentable: true,
          commenterName: 'Alice',
        }),
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json() as {
        shareId: string;
        url: string;
        annotationUrl: string;
        previewUrl: string;
      };
      expect(firstBody).not.toHaveProperty('commenterName');
      expect(firstBody.annotationUrl).toBe(firstBody.url);
      expect(firstBody.previewUrl).toBe(`${server.origin}/prototypes/home?agentToolbar=host#page=overview`);

      const second = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home', commentable: false, commenterName: '' }),
      });
      expect(second.status).toBe(200);
      const secondBody = await second.json() as { shareId: string; commentable: boolean };
      expect(secondBody).toMatchObject({ shareId: firstBody.shareId, commentable: false });
      expect(secondBody).not.toHaveProperty('commenterName');
      expect(readRealtimeManifest(projectRoot, firstBody.shareId)?.previewPath)
        .toBe('/prototypes/home?agentToolbar=host#page=overview');
      expect(firstBody.url).toBe(`${server.origin}/published/prototype/${firstBody.shareId}`);
      expect(readExportRecords(projectRoot).filter((record) => record.operationType === 'lan.publish.realtime')).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it('rejects a realtime preview URL that targets a different resource', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/home',
          previewUrl: 'http://localhost:51720/prototypes/private#page=overview',
          commentable: true,
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'INVALID_PREVIEW_URL' });
    } finally {
      await server.close();
    }
  });

  it('sanitizes privileged preview query values before persisting the realtime link', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/home',
          previewUrl: 'http://localhost:51720/prototypes/home?projectId=other&publishedShareId=other-share&annotationSession=1&agentToolbar=client&agentApiBaseUrl=http%3A%2F%2F127.0.0.1%3A32124%2Fapi&editorIntegrationWs=1&editorApiBaseUrl=http%3A%2F%2F127.0.0.1%3A32124%2Fapi&editorSessionId=private-session&cwd=%2Fprivate%2Fworkspace&mode=demo#page=overview',
          commentable: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { shareId: string; previewUrl: string };
      expect(body.previewUrl).toBe(`${server.origin}/prototypes/home?mode=demo&agentToolbar=host#page=overview`);
      const manifest = readRealtimeManifest(projectRoot, body.shareId);
      expect(manifest?.previewPath).toBe('/prototypes/home?mode=demo&agentToolbar=host#page=overview');
    } finally {
      await server.close();
    }
  });

  it('returns the validated request runtime origin for the ordinary preview link', async () => {
    const { projectRoot, server } = await createProject();
    const runtimeServer = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end('runtime');
    });
    try {
      await new Promise<void>((resolve) => runtimeServer.listen(0, 'localhost', resolve));
      const runtimeAddress = runtimeServer.address() as AddressInfo;
      const runtimeOrigin = `http://localhost:${runtimeAddress.port}`;
      writeServerInfo(projectRoot, 'runtime', {
        pid: process.pid,
        port: runtimeAddress.port,
        host: 'localhost',
        origin: runtimeOrigin,
        projectRoot,
        startedAt: new Date().toISOString(),
      });
      const endpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/home',
          previewUrl: `${runtimeOrigin}/prototypes/home#page=overview`,
          commentable: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { previewUrl: string };
      expect(body.previewUrl).toBe(`${runtimeOrigin}/prototypes/home?agentToolbar=host#page=overview`);
    } finally {
      await server.close();
      await new Promise<void>((resolve) => runtimeServer.close(() => resolve()));
    }
  });

  it('does not use a stale runtime-info origin for the ordinary preview link', async () => {
    const { projectRoot, server } = await createProject();
    try {
      writeServerInfo(projectRoot, 'runtime', {
        pid: 2_147_483_647,
        port: 51799,
        host: 'localhost',
        origin: 'http://localhost:51799',
        projectRoot,
        startedAt: new Date().toISOString(),
      });
      const endpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/home',
          previewUrl: 'http://localhost:51799/prototypes/home#page=overview',
          commentable: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { previewUrl: string };
      expect(body.previewUrl).toBe(`${server.origin}/prototypes/home?agentToolbar=host#page=overview`);
    } finally {
      await server.close();
    }
  });

  it('restores the realtime share id and published comments after cancelling and republishing', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const htmlEndpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/html`);
      const realtimeEndpoint = scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/realtime`);
      const html = await fetch(htmlEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home' }),
      });
      expect(html.status).toBe(200);
      const realtime = await fetch(realtimeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'src/prototypes/home',
          previewUrl: 'http://localhost:51720/prototypes/home?mode=demo#page=overview',
          commentable: true,
        }),
      });
      expect(realtime.status).toBe(200);
      const realtimeBody = await realtime.json() as { shareId: string; previewUrl: string };
      const publishedStorage = resolvePrototypeCommentStorage(projectRoot, 'prototypes/home', {
        publishedShareId: realtimeBody.shareId,
      });
      expect(publishedStorage).not.toBeNull();
      const commentEndpoint = new URL(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-comments`));
      commentEndpoint.searchParams.set('targetPath', 'prototypes/home');
      commentEndpoint.searchParams.set('publishedShareId', realtimeBody.shareId);
      const writeComment = await fetch(commentEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'changes',
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home' },
            comments: [{
              id: 'published-history',
              state: 'new',
              locator: { selectors: ['[data-id="history"]'], fingerprint: 'history', path: [] },
              message: 'keep me',
            }],
            images: [],
          },
        }),
      });
      expect(writeComment.status).toBe(200);

      for (const endpoint of [htmlEndpoint, realtimeEndpoint]) {
        const cancelled = await fetch(endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'src/prototypes/home' }),
        });
        expect(cancelled.status).toBe(200);
        expect(await cancelled.json()).toMatchObject({ success: true, removed: true });
      }

      const latest = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/local-publishing/latest?path=${encodeURIComponent('src/prototypes/home')}`,
      ));
      expect(await latest.json()).toMatchObject({ html: null, realtime: null });
      expect(fs.existsSync(publishedStorage!.commentFilePath)).toBe(true);

      const republished = await fetch(realtimeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'src/prototypes/home', commentable: true }),
      });
      expect(republished.status).toBe(200);
      const republishedBody = await republished.json() as { shareId: string; previewUrl: string };
      expect(republishedBody.shareId).toBe(realtimeBody.shareId);
      expect(republishedBody.previewUrl).toBe(realtimeBody.previewUrl);
      expect(readRealtimeManifest(projectRoot, republishedBody.shareId)?.previewPath)
        .toBe('/prototypes/home?mode=demo&agentToolbar=host#page=overview');

      const restoredComments = await fetch(commentEndpoint);
      expect(restoredComments.status).toBe(200);
      const restoredBody = await restoredComments.json() as {
        document: { comments: Array<{ id: string; message: string }> };
      };
      expect(restoredBody.document.comments).toEqual([
        expect.objectContaining({ id: 'published-history', message: 'keep me' }),
      ]);
    } finally {
      await server.close();
    }
  });

  it('rejects an invalid resource path before attempting export', async () => {
    const { projectRoot, server } = await createProject();
    try {
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/local-publishing/html`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '../outside' }),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    } finally {
      await server.close();
    }
  });
});
