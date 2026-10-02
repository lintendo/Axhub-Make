import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeRealtimeManifest } from '../lanPublishingStorage.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  scopeProjectApiUrl,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers.ts';

afterEach(() => cleanupProjectApiTestRoots());

async function createCommentProject() {
  const projectRoot = createTempRoot('axhub-prototype-comment-canonical-');
  fs.mkdirSync(path.join(projectRoot, 'src/prototypes/home'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'src/prototypes/home/index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
  writeProjectMetadata(projectRoot, {
    project: { id: 'comment-canonical', name: 'Comment Canonical' },
    resources: { prototypes: [{ id: 'home', name: 'home', title: 'Home', filePath: 'src/prototypes/home/index.tsx' }], docs: [], themes: [], data: [], templates: [] },
    resourceWriteTargets: { prototypes: { type: 'project-relative-path', path: 'src/prototypes' } },
  });
  writeRealtimeManifest(projectRoot, { schemaVersion: 1, shareId: 'share-comments', projectId: 'comment-canonical', resourcePath: 'src/prototypes/home', commentable: true, updatedAt: new Date().toISOString() });
  const server = await startTestServer(projectRoot);
  return { projectRoot, server };
}

function token(label: string): string {
  return `test-commenter-${label}-00000000000000000000000000000000`;
}

async function request(projectRoot: string, origin: string, method: 'GET' | 'PUT', document?: unknown, options: { reviewer?: string; name?: string; reason?: 'changes' | 'clear' } = {}) {
  const url = new URL(scopeProjectApiUrl(projectRoot, `${origin}/api/prototype-comments`));
  url.searchParams.set('targetPath', 'prototypes/home');
  if (options.reviewer) {
    url.searchParams.set('publishedShareId', 'share-comments');
    if (options.name) url.searchParams.set('commenterName', options.name);
  }
  return fetch(url, {
    method,
    headers: { ...(options.reviewer ? { 'x-axhub-published-commenter': options.reviewer } : {}), ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'PUT' ? { body: JSON.stringify({ document, reason: options.reason ?? 'changes' }) } : {}),
  });
}

describe('canonical nested external comments', () => {
  it('shares one file, preserves local comment, and scopes reviewer reads by stable token', async () => {
    const { projectRoot, server } = await createCommentProject();
    try {
      const alice = token('alice');
      const bob = token('bob');
      const node = { id: 'node-1', comment: '作者批注', state: 'idle', locator: { selectors: ['[data-id="node-1"]'] } };
      const authorDocument = { schemaVersion: 3, kind: 'prototype-edit-comments', resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' }, comments: [node], images: [] };
      expect((await request(projectRoot, server.origin, 'PUT', authorDocument)).status).toBe(200);
      const aliceDocument = { ...authorDocument, comments: [{ ...node, comment: '', externalComments: [{ id: 'alice-note', authorId: 'spoof', authorName: 'Alice', content: '调整间距', createdAt: 1 }] }] };
      expect((await request(projectRoot, server.origin, 'PUT', aliceDocument, { reviewer: alice, name: 'Alice' })).status).toBe(200);
      const bobDocument = { ...authorDocument, comments: [{ ...node, comment: '', externalComments: [{ id: 'bob-note', authorId: 'spoof', authorName: 'Bob', content: '补充说明', createdAt: 2 }] }] };
      expect((await request(projectRoot, server.origin, 'PUT', bobDocument, { reviewer: bob, name: 'Bob' })).status).toBe(200);
      const authorUpdate = {
        ...authorDocument,
        comments: [{ ...node, comment: '作者更新后的批注' }],
      };
      expect((await request(projectRoot, server.origin, 'PUT', authorUpdate)).status).toBe(200);
      const forgedAuthorUpdate = {
        ...authorUpdate,
        comments: [{
          ...authorUpdate.comments[0],
          externalComments: [{ id: 'forged', authorId: 'forged', authorName: '冒名者', content: '不应写入', createdAt: 3 }],
        }],
      };
      expect((await request(projectRoot, server.origin, 'PUT', forgedAuthorUpdate)).status).toBe(200);
      const author = await (await request(projectRoot, server.origin, 'GET')).json() as { document: { comments: Array<Record<string, unknown>> } };
      expect(author.document.comments[0]).toEqual(expect.objectContaining({ comment: '作者更新后的批注' }));
      expect(author.document.comments[0]?.externalComments).toHaveLength(2);
      expect(author.document.comments[0]?.externalComments).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'forged' })]));
      const renamed = await (await request(projectRoot, server.origin, 'GET', undefined, { reviewer: alice, name: 'Alicia' })).json() as { document: { comments: Array<Record<string, unknown>> } };
      expect(renamed.document.comments[0]?.externalComments).toEqual([expect.objectContaining({ id: 'alice-note', authorName: 'Alice' })]);
      expect(renamed.document.comments[0]).not.toHaveProperty('comment');
    } finally {
      await server.close();
    }
  });

  it('clears only the current reviewer nested entries', async () => {
    const { projectRoot, server } = await createCommentProject();
    try {
      const alice = token('alice-clear');
      const bob = token('bob-clear');
      const base = { schemaVersion: 3, kind: 'prototype-edit-comments', resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' }, comments: [{ id: 'node-1', comment: '作者批注', state: 'idle', locator: { selectors: ['[data-id="node-1"]'] } }], images: [] };
      await request(projectRoot, server.origin, 'PUT', base);
      await request(projectRoot, server.origin, 'PUT', { ...base, comments: [{ ...base.comments[0], comment: '', externalComments: [{ id: 'alice-note', authorId: 'x', authorName: 'Alice', content: 'A', createdAt: 1 }] }] }, { reviewer: alice, name: 'Alice' });
      await request(projectRoot, server.origin, 'PUT', { ...base, comments: [{ ...base.comments[0], comment: '', externalComments: [{ id: 'bob-note', authorId: 'y', authorName: 'Bob', content: 'B', createdAt: 2 }] }] }, { reviewer: bob, name: 'Bob' });
      expect((await request(projectRoot, server.origin, 'PUT', { ...base, comments: [] }, { reviewer: alice, name: 'Alice', reason: 'clear' })).status).toBe(200);
      const author = await (await request(projectRoot, server.origin, 'GET')).json() as { document: { comments: Array<Record<string, unknown>> } };
      expect(author.document.comments[0]).toEqual(expect.objectContaining({ comment: '作者批注' }));
      expect(author.document.comments[0]?.externalComments).toEqual([expect.objectContaining({ id: 'bob-note' })]);
    } finally {
      await server.close();
    }
  });
});
