import fs from 'node:fs';
import http from 'node:http';
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

type CommentTarget = {
  name: string;
  kind: 'prototype-edit-comments' | 'document-edit-comments';
  targetPath: string;
  endpoint: string;
};

type PreparedWrite = {
  finish: () => Promise<{ status: number; body: Record<string, any> }>;
};

const targets: CommentTarget[] = [
  {
    name: 'prototype comments',
    kind: 'prototype-edit-comments',
    targetPath: 'prototypes/home',
    endpoint: '/api/prototype-comments?targetPath=prototypes/home',
  },
  {
    name: 'document comments',
    kind: 'document-edit-comments',
    targetPath: 'src/resources/prd/order.md',
    endpoint: '/api/document-comments?path=src%2Fresources%2Fprd%2Forder.md',
  },
];

function writeCommentProject(projectRoot: string): void {
  writeProjectMetadata(projectRoot, {
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
    },
  });
  const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
  fs.mkdirSync(prototypeDir, { recursive: true });
  fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
  const documentPath = path.join(projectRoot, 'src/resources/prd/order.md');
  fs.mkdirSync(path.dirname(documentPath), { recursive: true });
  fs.writeFileSync(documentPath, '# Order\n', 'utf8');
}

async function startActivatedProjectServer(projectRoot: string): Promise<Awaited<ReturnType<typeof startTestServer>>> {
  const server = await startTestServer(projectRoot);
  const projectId = path.basename(projectRoot);
  await registerProject(server.origin, projectRoot, projectId, projectId);
  await setActiveProject(server.origin, projectId);
  return server;
}

function scopedCommentUrl(projectRoot: string, origin: string, target: CommentTarget): string {
  return scopeProjectApiUrl(projectRoot, `${origin}${target.endpoint}`);
}

function pageScopeFor(index: number): string {
  if (index === 0) return 'page-a';
  if (index === 1) return 'page-b';
  return `page-${index % 3}`;
}

function buildSnapshot(
  target: CommentTarget,
  count: number,
  label: string,
  commentState = 'editing',
): Record<string, any> {
  const comments = Array.from({ length: count }, (_, index) => {
    return {
      id: `comment-${index}`,
      pageScope: pageScopeFor(index),
      locator: { selectors: [`[data-comment-index="${index}"]`] },
      comment: `${label}-comment-${index}`,
      state: commentState,
      message: `${label}-state-${index}`,
    };
  });
  const images = comments.map((comment, index) => ({
    id: `image-${index}`,
    pageScope: comment.pageScope,
    commentId: comment.id,
    name: `${label}-image-${index}.png`,
    mimeType: 'image/png',
    data: PNG_DATA_URL,
  }));

  return {
    schemaVersion: 3,
    kind: target.kind,
    documentPath: target.kind === 'document-edit-comments' ? target.targetPath : undefined,
    resource: { id: 'comments', targetPath: target.targetPath, filePath: '' },
    comments,
    images,
  };
}

function prepareJsonWrite(urlValue: string, payload: unknown): PreparedWrite {
  const url = new URL(urlValue);
  const serialized = JSON.stringify(payload);
  let finished = false;
  let request: http.ClientRequest;
  const response = new Promise<{ status: number; body: Record<string, any> }>((resolve, reject) => {
    request = http.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      incoming.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: incoming.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : {},
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.flushHeaders();
  });

  return {
    finish: async () => {
      if (!finished) {
        finished = true;
        request.end(serialized);
      }
      return response;
    },
  };
}

async function readPersistedDocument(
  projectRoot: string,
  url: string,
): Promise<{ responseDocument: Record<string, any>; fileDocument: Record<string, any> }> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  const body = await response.json() as Record<string, any>;
  const filePath = path.join(projectRoot, String(body.path));
  return {
    responseDocument: body.document,
    fileDocument: JSON.parse(fs.readFileSync(filePath, 'utf8')),
  };
}

afterEach(() => {
  cleanupProjectApiTestRoots();
});

for (const target of targets) {
  describe(`${target.name} concurrent persistence`, () => {
    it('retains every distinct record from 10, 12, and 15 item snapshots that finish newest first', async () => {
      const projectRoot = createTempRoot('axhub-comment-concurrency-');
      writeCommentProject(projectRoot);
      const server = await startActivatedProjectServer(projectRoot);

      try {
        const url = scopedCommentUrl(projectRoot, server.origin, target);
        const writes = [10, 12, 15].map((count) => prepareJsonWrite(url, {
          reason: 'changes',
          document: buildSnapshot(target, count, `snapshot-${count}`),
        }));

        for (const index of [2, 1, 0]) {
          const result = await writes[index].finish();
          expect(result.status).toBe(200);
        }

        const { responseDocument, fileDocument } = await readPersistedDocument(projectRoot, url);
        for (const document of [responseDocument, fileDocument]) {
          expect(document.comments).toHaveLength(15);
          expect(document.images).toHaveLength(15);
          expect(document.comments).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'comment-0', pageScope: 'page-a' }),
            expect.objectContaining({ id: 'comment-1', pageScope: 'page-b' }),
            expect.objectContaining({ id: 'comment-14' }),
          ]));
          expect(document.images.every((image: Record<string, unknown>) => (
            typeof image.assetPath === 'string' && !('data' in image)
          ))).toBe(true);
        }
      } finally {
        await server.close();
      }
    });

    it('uses request completion order for conflicting values of the same identities', async () => {
      const projectRoot = createTempRoot('axhub-comment-concurrency-');
      writeCommentProject(projectRoot);
      const server = await startActivatedProjectServer(projectRoot);

      try {
        const url = scopedCommentUrl(projectRoot, server.origin, target);
        const versions = [
          { label: 'oldest', commentState: 'idle' },
          { label: 'middle', commentState: 'editing' },
          { label: 'newest', commentState: 'completed' },
        ];
        const writes = versions.map(({ label, commentState }) => prepareJsonWrite(url, {
          reason: 'changes',
          document: buildSnapshot(target, 1, label, commentState),
        }));

        for (const index of [2, 1, 0]) {
          const result = await writes[index].finish();
          expect(result.status).toBe(200);
        }

        const { fileDocument } = await readPersistedDocument(projectRoot, url);
        expect.soft(fileDocument.comments[0]?.comment).toBe('oldest-comment-0');
        expect.soft(fileDocument.comments[0]).toMatchObject({
          state: 'idle',
          message: 'oldest-state-0',
        });
        expect.soft(fileDocument.images[0]?.name).toBe('oldest-image-0.png');
      } finally {
        await server.close();
      }
    });

    it('keeps a tombstone when a stale active snapshot finishes after the delete marker', async () => {
      const projectRoot = createTempRoot('axhub-comment-concurrency-');
      writeCommentProject(projectRoot);
      const server = await startActivatedProjectServer(projectRoot);

      try {
        const url = scopedCommentUrl(projectRoot, server.origin, target);
        const deletedAt = 1784655000000;
        const staleDocument = buildSnapshot(target, 1, 'stale', 'editing');
        const deletedDocument = buildSnapshot(target, 1, 'deleted', 'completed');
        deletedDocument.comments[0].deletedAt = deletedAt;
        deletedDocument.images[0].deletedAt = deletedAt;
        const staleWrite = prepareJsonWrite(url, { reason: 'changes', document: staleDocument });
        const deleteWrite = prepareJsonWrite(url, { reason: 'changes', document: deletedDocument });

        expect((await deleteWrite.finish()).status).toBe(200);
        expect((await staleWrite.finish()).status).toBe(200);

        const { fileDocument } = await readPersistedDocument(projectRoot, url);
        expect(fileDocument.comments).toEqual([
          expect.objectContaining({ id: 'comment-0', pageScope: 'page-a', deletedAt }),
        ]);
        expect(fileDocument.images).toEqual([
          expect.objectContaining({ id: 'image-0', deletedAt }),
        ]);
      } finally {
        await server.close();
      }
    });

    it('does not discard late active records when tombstone cleanup finishes after a larger save', async () => {
      const projectRoot = createTempRoot('axhub-comment-concurrency-');
      writeCommentProject(projectRoot);
      const server = await startActivatedProjectServer(projectRoot);

      try {
        const url = scopedCommentUrl(projectRoot, server.origin, target);
        const deletedAt = 1784655000001;
        const seed = buildSnapshot(target, 10, 'seed', 'idle');
        seed.comments.push({
          id: 'comment-removed',
          pageScope: 'page-z',
          locator: { selectors: ['#removed'] },
          comment: 'remove me',
          state: 'completed',
          deletedAt,
        });
        seed.images.push({
          id: 'removed-image',
          commentId: 'comment-removed',
          pageScope: 'page-z',
          deletedAt,
        });
        const seeded = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'changes', document: seed }),
        });
        expect(seeded.status).toBe(200);

        const largerSave = prepareJsonWrite(url, {
          reason: 'changes',
          document: buildSnapshot(target, 15, 'larger-save', 'editing'),
        });
        const cleanup = prepareJsonWrite(url, {
          reason: 'restore',
          document: buildSnapshot(target, 10, 'browser-restored', 'idle'),
          observedTombstones: [
            { kind: 'comment', commentId: 'comment-removed', deletedAt },
            { kind: 'image', id: 'removed-image', commentId: 'comment-removed', deletedAt },
          ],
        });

        expect((await largerSave.finish()).status).toBe(200);
        expect((await cleanup.finish()).status).toBe(200);

        const { fileDocument } = await readPersistedDocument(projectRoot, url);
        expect(fileDocument.comments).toHaveLength(15);
        expect(fileDocument.images).toHaveLength(15);
        expect(fileDocument.comments.some((comment: Record<string, unknown>) => comment.deletedAt)).toBe(false);
        expect(fileDocument.comments).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'comment-14', comment: 'larger-save-comment-14' }),
        ]));
      } finally {
        await server.close();
      }
    });
  });
}
