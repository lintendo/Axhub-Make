import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  setActiveProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function prototypeCommentHash(targetPath = 'prototypes/home'): string {
  return crypto.createHash('sha256')
    .update(`prototype-comments:v1\0${targetPath}`)
    .digest('hex');
}

function prototypeCommentStorage(projectRoot: string): {
  filePath: string;
  relativeFilePath: string;
  assetDir: string;
  relativeAssetRoot: string;
} {
  const hash = prototypeCommentHash();
  const relativeFilePath = `.axhub/make/comments/${hash}.json`;
  const relativeAssetRoot = `.axhub/make/comment-assets/${hash}`;
  return {
    filePath: path.join(projectRoot, relativeFilePath),
    relativeFilePath,
    assetDir: path.join(projectRoot, relativeAssetRoot),
    relativeAssetRoot,
  };
}

function prototypeCommentAssetPath(fileName: string): string {
  return `.axhub/make/comment-assets/${prototypeCommentHash()}/${fileName}`;
}

function writePrototypeProject(projectRoot: string): void {
  writeProjectMetadata(projectRoot, {
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
    },
  });
  const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
  fs.mkdirSync(prototypeDir, { recursive: true });
  fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
}

async function startActivatedProjectServer(projectRoot: string): Promise<Awaited<ReturnType<typeof startTestServer>>> {
  const server = await startTestServer(projectRoot);
  const projectId = path.basename(projectRoot);
  await registerProject(server.origin, projectRoot, projectId, projectId);
  await setActiveProject(server.origin, projectId);
  return server;
}

afterEach(() => {
  cleanupProjectApiTestRoots();
});

describe('prototype comments API', () => {
  it('returns exists:false when the prototype comments file is missing', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        exists: false,
        document: null,
        path: prototypeCommentStorage(projectRoot).relativeFilePath,
      });
    } finally {
      await server.close();
    }
  });

  it('allows preview pages to read prototype comments across origins', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        headers: {
          Origin: 'http://localhost:51720',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      await server.close();
    }
  });

  it('allows preview pages to preflight prototype comment writes', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:51720',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('PUT');
      expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
    } finally {
      await server.close();
    }
  });

  it('writes and reads prototype comments under the shared .axhub storage', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const put = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: {
              id: 'home',
              targetPath: 'prototypes/home',
              filePath: '',
            },
            comments: [
              {
                elementKey: 'hero',
                label: 'Hero',
                locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
                comment: '调整首屏文案',
                state: 'idle',
              },
            ],
            images: [],
          },
        }),
      });

      expect(put.status).toBe(200);
      const written = await put.json();
      expect(written).toMatchObject({
        ok: true,
        exists: true,
        path: prototypeCommentStorage(projectRoot).relativeFilePath,
        document: {
          schemaVersion: 3,
          kind: 'prototype-edit-comments',
          resource: {
            id: 'home',
            targetPath: 'prototypes/home',
            filePath: prototypeCommentStorage(projectRoot).relativeFilePath,
          },
        },
      });

      const filePath = prototypeCommentStorage(projectRoot).filePath;
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/home/.spec/prototype-comments.json'))).toBe(false);
      const persistedDocument = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(persistedDocument.kind).toBe('prototype-edit-comments');
      expect(persistedDocument.comments[0].comment).toBe('调整首屏文案');

      const get = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ));
      expect(get.status).toBe(200);
      expect(await get.json()).toMatchObject({
        exists: true,
        document: {
          kind: 'prototype-edit-comments',
          comments: [
            expect.objectContaining({
              elementKey: 'hero',
              comment: '调整首屏文案',
            }),
          ],
        },
      });
    } finally {
      await server.close();
    }
  });

  it('merges schema 3 comments by durable id instead of DOM lifecycle identity', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const url = scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      );
      const write = async (comments: Array<Record<string, unknown>>) => {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'changes',
            document: {
              schemaVersion: 3,
              kind: 'prototype-edit-comments',
              resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
              comments,
              images: [],
            },
          }),
        });
        expect(response.status).toBe(200);
        return (await response.json()).document;
      };
      const locator = {
        selectors: ['#hero'],
        fingerprint: 'hero',
        path: [],
        shadowHostChain: [],
      };

      await write([{ id: 'comment-1', locator, state: 'idle', comment: 'first' }]);
      const updated = await write([
        { id: 'comment-1', locator, state: 'editing', comment: 'updated' },
      ]);
      expect(updated.schemaVersion).toBe(3);
      expect(updated.comments).toEqual([
        expect.objectContaining({ id: 'comment-1', comment: 'updated' }),
      ]);

      const distinct = await write([
        { id: 'comment-2', locator, state: 'idle', comment: 'second entity' },
      ]);
      expect(distinct.comments.map((comment: Record<string, unknown>) => comment.id).sort())
        .toEqual(['comment-1', 'comment-2']);
    } finally {
      await server.close();
    }
  });

  it('rejects schema 2 comment writes instead of migrating them implicitly', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            schemaVersion: 2,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
            comments: [],
            images: [],
          },
        }),
      });

      expect(response.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('preserves stored tombstones across stale non-authoritative writes', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const { filePath } = prototypeCommentStorage(projectRoot);
    const deletedAt = 1784624000000;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: prototypeCommentStorage(projectRoot).relativeFilePath,
      },
      comments: [{
        id: 'comment-hero',
        label: 'Hero',
        locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
        comment: 'delete me',
        state: 'completed',
        deletedAt,
      }],
      images: [{
        id: 'hero-image',
        commentId: 'comment-hero',
        assetPath: prototypeCommentAssetPath('hero-image.png'),
        deletedAt,
      }],
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      for (const reason of [undefined, 'changes', 'state']) {
        const response = await fetch(scopeProjectApiUrl(
          projectRoot,
          `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
        ), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(reason ? { reason } : {}),
            document: {
              schemaVersion: 3,
              kind: 'prototype-edit-comments',
              resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
              comments: [{
                id: 'comment-hero',
                label: 'Hero',
                locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
                comment: 'stale active comment',
                state: 'editing',
              }],
              images: [{
                id: 'hero-image',
                commentId: 'comment-hero',
                assetPath: prototypeCommentAssetPath('hero-image.png'),
              }],
            },
          }),
        });

        expect(response.status).toBe(200);
        const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(persisted.comments).toEqual([
          expect.objectContaining({ id: 'comment-hero', deletedAt }),
        ]);
        expect(persisted.images).toEqual([
          expect.objectContaining({ id: 'hero-image', deletedAt }),
        ]);
      }
    } finally {
      await server.close();
    }
  });

  it('preserves unrelated active records added before a non-authoritative write', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const { filePath } = prototypeCommentStorage(projectRoot);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: prototypeCommentStorage(projectRoot).relativeFilePath,
      },
      comments: [{
        id: 'comment-late',
        pageScope: 'page-b',
        locator: { selectors: ['#late'], fingerprint: 'late', path: [], shadowHostChain: [] },
        comment: 'added after browser read',
        state: 'idle',
      }],
      images: [{
        id: 'late-image',
        commentId: 'comment-late',
        pageScope: 'page-b',
        assetPath: prototypeCommentAssetPath('late.png'),
      }],
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'changes',
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
            comments: [{
              id: 'comment-live',
              pageScope: 'page-a',
              locator: { selectors: ['#live'], fingerprint: 'live', path: [], shadowHostChain: [] },
              comment: 'browser update',
              state: 'editing',
            }],
            images: [{
              id: 'live-image',
              commentId: 'comment-live',
              pageScope: 'page-a',
              assetPath: prototypeCommentAssetPath('live.png'),
            }],
          },
        }),
      });

      expect(response.status).toBe(200);
      const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(persisted.comments.map((comment: any) => comment.id)).toEqual([
        'comment-live',
        'comment-late',
      ]);
      expect(persisted.comments).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'comment-live', state: 'editing' }),
        expect.objectContaining({ id: 'comment-late', state: 'idle' }),
      ]));
      expect(persisted.images.map((image: any) => image.id)).toEqual([
        'live-image',
        'late-image',
      ]);
    } finally {
      await server.close();
    }
  });

  it('uses page-scoped comment tombstones as barriers for stale comments and new image ids', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const { filePath } = prototypeCommentStorage(projectRoot);
    const deletedAt = 1784624000000;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: prototypeCommentStorage(projectRoot).relativeFilePath,
      },
      comments: [{
        id: 'comment-page-a',
        pageScope: 'page-a',
        locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
        comment: 'delete page a',
        state: 'completed',
        deletedAt,
      }],
      images: [{
        id: 'old-page-a-image',
        commentId: 'comment-page-a',
        pageScope: 'page-a',
        assetPath: prototypeCommentAssetPath('old-page-a.png'),
        deletedAt,
      }],
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'changes',
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
            comments: [
              {
                id: 'comment-page-a',
                pageScope: 'page-a',
                locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
                comment: 'stale page a',
                state: 'editing',
              },
              {
                id: 'comment-page-b',
                pageScope: 'page-b',
                locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
                comment: 'keep page b',
                state: 'editing',
              },
            ],
            images: [
              {
                id: 'new-page-a-image',
                commentId: 'comment-page-a',
                pageScope: 'page-a',
                assetPath: prototypeCommentAssetPath('new-page-a.png'),
              },
              {
                id: 'page-b-image',
                commentId: 'comment-page-b',
                pageScope: 'page-b',
                assetPath: prototypeCommentAssetPath('page-b.png'),
              },
            ],
          },
        }),
      });

      expect(response.status).toBe(200);
      const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(persisted.comments).toEqual([
        expect.objectContaining({ pageScope: 'page-b', comment: 'keep page b' }),
        expect.objectContaining({ pageScope: 'page-a', deletedAt }),
      ]);
      expect(persisted.images).toEqual([
        expect.objectContaining({ id: 'page-b-image', pageScope: 'page-b' }),
        expect.objectContaining({ id: 'old-page-a-image', pageScope: 'page-a', deletedAt }),
      ]);
    } finally {
      await server.close();
    }
  });

  it('removes only newly unreferenced image assets after an authoritative restore', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const { assetDir, filePath } = prototypeCommentStorage(projectRoot);
    const heroOnlyPath = path.join(assetDir, 'hero-only.png');
    const sharedPath = path.join(assetDir, 'shared.png');
    const liveOnlyPath = path.join(assetDir, 'live-only.png');
    const lateOnlyPath = path.join(assetDir, 'late-only.png');
    const revivedHeroPath = path.join(assetDir, 'revived-hero.png');
    const deletedAt = 1784624000000;
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(heroOnlyPath, 'hero-only', 'utf8');
    fs.writeFileSync(sharedPath, 'shared', 'utf8');
    fs.writeFileSync(liveOnlyPath, 'live-only', 'utf8');
    fs.writeFileSync(lateOnlyPath, 'late-only', 'utf8');
    fs.writeFileSync(revivedHeroPath, 'revived-hero', 'utf8');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: prototypeCommentStorage(projectRoot).relativeFilePath,
      },
      comments: [
        {
          id: 'comment-hero',
          label: 'Hero',
          locator: { selectors: ['#hero'], fingerprint: 'hero', path: [], shadowHostChain: [] },
          comment: 'delete me',
          state: 'completed',
          deletedAt,
        },
        {
          id: 'comment-live',
          label: 'Live Card',
          locator: { selectors: ['#live'], fingerprint: 'live', path: [], shadowHostChain: [] },
          comment: 'keep me',
          state: 'editing',
        },
        {
          id: 'comment-late',
          label: 'Late Card',
          locator: { selectors: ['#late'], fingerprint: 'late', path: [], shadowHostChain: [] },
          comment: 'added after browser read',
          state: 'idle',
        },
      ],
      images: [
        { id: 'hero-only', commentId: 'comment-hero', assetPath: prototypeCommentAssetPath('hero-only.png'), deletedAt },
        { id: 'hero-shared', commentId: 'comment-hero', assetPath: prototypeCommentAssetPath('shared.png'), deletedAt },
        { id: 'live-shared', commentId: 'comment-live', assetPath: prototypeCommentAssetPath('shared.png') },
        { id: 'live-only', commentId: 'comment-live', assetPath: prototypeCommentAssetPath('live-only.png') },
        { id: 'late-only', commentId: 'comment-late', assetPath: prototypeCommentAssetPath('late-only.png') },
        { id: 'revived-hero', commentId: 'comment-hero', assetPath: prototypeCommentAssetPath('revived-hero.png') },
      ],
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'restore',
          observedTombstones: [
            { kind: 'comment', commentId: 'comment-hero', deletedAt },
            { kind: 'image', id: 'hero-only', commentId: 'comment-hero', deletedAt },
            { kind: 'image', id: 'hero-shared', commentId: 'comment-hero', deletedAt },
          ],
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
            comments: [{
              id: 'comment-live',
              label: 'Live Card',
              locator: { selectors: ['#live'], fingerprint: 'live', path: [], shadowHostChain: [] },
              comment: 'keep me',
              state: 'editing',
            }],
            images: [
              { id: 'live-shared', commentId: 'comment-live', assetPath: prototypeCommentAssetPath('shared.png') },
              { id: 'live-only', commentId: 'comment-live', assetPath: prototypeCommentAssetPath('live-only.png') },
            ],
          },
        }),
      });

      expect(response.status, await response.clone().text()).toBe(200);
      const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(persisted.comments.map((comment: any) => comment.id)).toEqual(['comment-live', 'comment-late']);
      expect(persisted.images.map((image: any) => image.id)).toEqual([
        'live-shared',
        'live-only',
        'late-only',
      ]);
      expect(fs.existsSync(heroOnlyPath)).toBe(false);
      expect(fs.existsSync(sharedPath)).toBe(true);
      expect(fs.existsSync(liveOnlyPath)).toBe(true);
      expect(fs.existsSync(lateOnlyPath)).toBe(true);
      expect(fs.existsSync(revivedHeroPath)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('does not follow an asset-directory symlink while removing compacted images', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const { assetDir, filePath } = prototypeCommentStorage(projectRoot);
    const outsideDir = path.join(projectRoot, 'outside-assets');
    const outsideFile = path.join(outsideDir, 'escape.png');
    const deletedAt = 1784624000000;
    fs.mkdirSync(assetDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(outsideFile, 'outside', 'utf8');
    fs.symlinkSync(outsideDir, path.join(assetDir, 'linked'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: prototypeCommentStorage(projectRoot).relativeFilePath,
      },
      comments: [],
      images: [{
        id: 'escaped-image',
        commentId: 'comment-hero',
        assetPath: prototypeCommentAssetPath('linked/escape.png'),
        deletedAt,
      }],
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const escapedAssetResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments/asset?targetPath=prototypes/home&asset=${encodeURIComponent(prototypeCommentAssetPath('linked/escape.png'))}`,
      ));
      expect(escapedAssetResponse.status).toBe(403);

      const hydratedResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home&hydrateImages=1`,
      ));
      expect(hydratedResponse.status).toBe(200);
      expect((await hydratedResponse.json()).document.images[0]).not.toHaveProperty('data');

      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'restore',
          observedTombstones: [{
            kind: 'image',
            id: 'escaped-image',
            commentId: 'comment-hero',
            deletedAt,
          }],
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
            comments: [],
            images: [],
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(fs.existsSync(outsideFile)).toBe(true);
      const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(persisted.images).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('rejects a prototype directory symlink that escapes the project root', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writeProjectMetadata(projectRoot, {
      resourceWriteTargets: {
        prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
      },
    });
    const prototypesDir = path.join(projectRoot, 'src/prototypes');
    const outsidePrototypeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-comments-outside-prototype-'));
    fs.mkdirSync(prototypesDir, { recursive: true });
    fs.writeFileSync(path.join(outsidePrototypeDir, 'index.tsx'), 'export default null;\n', 'utf8');
    fs.symlinkSync(outsidePrototypeDir, path.join(prototypesDir, 'home'), 'dir');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
            comments: [],
            images: [],
          },
        }),
      });

      expect(response.status).toBe(403);
      expect(fs.existsSync(prototypeCommentStorage(projectRoot).filePath)).toBe(false);
      expect(fs.existsSync(path.join(outsidePrototypeDir, '.spec/prototype-comments.json'))).toBe(false);
    } finally {
      await server.close();
      fs.rmSync(outsidePrototypeDir, { recursive: true, force: true });
    }
  });

  it('does not read legacy .spec comments before a confirmed migration', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const legacyFilePath = path.join(projectRoot, 'src/prototypes/home/.spec/prototype-comments.json');
    fs.mkdirSync(path.dirname(legacyFilePath), { recursive: true });
    fs.writeFileSync(legacyFilePath, `${JSON.stringify({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: 'src/prototypes/home/.spec/prototype-comments.json',
      },
      comments: [{ elementKey: 'legacy', comment: 'requires confirmed migration' }],
      images: [],
    }, null, 2)}\n`, 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        exists: false,
        document: null,
        path: prototypeCommentStorage(projectRoot).relativeFilePath,
      });
      expect(fs.readFileSync(legacyFilePath, 'utf8')).toContain('requires confirmed migration');
    } finally {
      await server.close();
    }
  });

  it('rejects non-prototype and escaped target paths', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const nonPrototype = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=components/home`,
      ));
      expect(nonPrototype.status).toBe(400);

      const escaped = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/../home`,
      ));
      expect(escaped.status).toBe(403);

      const hidden = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/.hidden`,
      ));
      expect(hidden.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('extracts image payloads into shared .axhub assets and keeps base64 out of JSON', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            schemaVersion: 3,
            kind: 'prototype-edit-comments',
            resource: {
              id: 'home',
              targetPath: 'prototypes/home',
              filePath: '',
            },
            comments: [],
            images: [
              {
                id: 'hero-image',
                elementKey: 'hero',
                source: 'target-screenshot',
                name: 'Hero Image.PNG',
                mimeType: 'image/png',
                size: 128,
                createdAt: 10,
                data: PNG_DATA_URL,
              },
              {
                id: 'hero-detail',
                elementKey: 'hero',
                name: 'Hero Detail.PNG',
                mimeType: 'image/png',
                size: 256,
                createdAt: 11,
                data: PNG_DATA_URL,
              },
            ],
          },
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.document.kind).toBe('prototype-edit-comments');
      expect(body.document.images).toEqual([
        expect.objectContaining({
          id: 'hero-image',
          source: 'target-screenshot',
          assetPath: prototypeCommentAssetPath('hero-image.png'),
        }),
        expect.objectContaining({
          id: 'hero-detail',
          assetPath: prototypeCommentAssetPath('hero-detail.png'),
        }),
      ]);
      expect(JSON.stringify(body.document)).not.toContain('base64');

      const jsonPath = prototypeCommentStorage(projectRoot).filePath;
      const rawJson = fs.readFileSync(jsonPath, 'utf8');
      expect(rawJson).not.toContain('base64');

      const assetResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments/asset?targetPath=prototypes/home&asset=${encodeURIComponent(prototypeCommentAssetPath('hero-image.png'))}`,
      ));
      expect(assetResponse.status, await assetResponse.clone().text()).toBe(200);
      expect(assetResponse.headers.get('content-type')).toContain('image/png');
      expect(Buffer.from(await assetResponse.arrayBuffer()).length).toBeGreaterThan(0);

      const hydratedResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home&hydrateImages=1`,
      ));
      const hydratedBody = await hydratedResponse.json();
      expect(hydratedResponse.status).toBe(200);
      expect(hydratedBody.document.images[0]).toMatchObject({
        id: 'hero-image',
        source: 'target-screenshot',
        assetPath: prototypeCommentAssetPath('hero-image.png'),
        data: expect.stringMatching(/^data:image\/png;base64,/u),
      });
      expect(hydratedBody.document.images[1]).toMatchObject({
        id: 'hero-detail',
        assetPath: prototypeCommentAssetPath('hero-detail.png'),
        data: expect.stringMatching(/^data:image\/png;base64,/u),
      });
    } finally {
      await server.close();
    }
  });

  it('requires a declared prototype write target so third-party projects can degrade to localStorage', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writeProjectMetadata(projectRoot);
    const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ));
      expect(response.status).toBe(424);
      expect(await response.json()).toMatchObject({
        error: 'Prototype comment persistence requires declared prototype write target',
      });
    } finally {
      await server.close();
    }
  });

  it('rejects prototype comment targets outside the fixed src/prototypes directory', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writeProjectMetadata(projectRoot, {
      resourceWriteTargets: {
        prototypes: { type: 'project-relative-path', path: 'screens' },
      },
    });
    fs.mkdirSync(path.join(projectRoot, 'screens/home'), { recursive: true });
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const response = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments?targetPath=prototypes/home`,
      ));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: 'Prototype comment persistence is limited to src/prototypes',
      });
    } finally {
      await server.close();
    }
  });

  it('rejects unsafe asset paths', async () => {
    const projectRoot = createTempRoot('axhub-make-prototype-comments-');
    writePrototypeProject(projectRoot);
    const server = await startActivatedProjectServer(projectRoot);

    try {
      const escaped = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments/asset?targetPath=prototypes/home&asset=${encodeURIComponent('../secret.png')}`,
      ));
      expect(escaped.status).toBe(403);

      const hidden = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/prototype-comments/asset?targetPath=prototypes/home&asset=${encodeURIComponent('.secret/image.png')}`,
      ));
      expect(hidden.status).toBe(400);
    } finally {
      await server.close();
    }
  });
});
