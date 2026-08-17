import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, scopeProjectApiUrl, setActiveProject, startTestServer, writeProjectMetadata, } from './__tests__/projects-api.helpers';
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
function writeDocumentProject(projectRoot) {
    writeProjectMetadata(projectRoot, {});
    const documentPath = path.join(projectRoot, 'src/resources/prd/order.md');
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, '# Order\n', 'utf8');
}
async function startActivatedProjectServer(projectRoot) {
    const server = await startTestServer(projectRoot);
    const projectId = path.basename(projectRoot);
    await registerProject(server.origin, projectRoot, projectId, projectId);
    await setActiveProject(server.origin, projectId);
    return server;
}
afterEach(() => {
    cleanupProjectApiTestRoots();
});
describe('document comments API', () => {
    it('returns a missing shared document comment path without creating a file', async () => {
        const projectRoot = createTempRoot('axhub-document-comments-');
        writeDocumentProject(projectRoot);
        const server = await startActivatedProjectServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/document-comments?path=${encodeURIComponent('src/resources/prd/order.md')}`));
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.exists).toBe(false);
            expect(body.path).toMatch(/^\.axhub\/make\/comments\/[a-f0-9]{64}\.json$/u);
        }
        finally {
            await server.close();
        }
    });
    it('writes document comments without touching prototype .spec storage', async () => {
        const projectRoot = createTempRoot('axhub-document-comments-');
        writeDocumentProject(projectRoot);
        const server = await startActivatedProjectServer(projectRoot);
        try {
            const document = {
                schemaVersion: 3,
                kind: 'document-edit-comments',
                documentPath: 'src/resources/prd/order.md',
                comments: [{ id: 'comment-order-title', pageScope: 'document:order', locator: { selectors: ['h1'] }, comment: '更新标题', state: 'idle' }],
                images: [],
            };
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/document-comments?path=${encodeURIComponent('src/resources/prd/order.md')}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document, reason: 'changes' }),
            });
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.document).toMatchObject({ kind: 'document-edit-comments', documentPath: 'src/resources/prd/order.md' });
            expect(fs.existsSync(path.join(projectRoot, 'src/resources/prd/order.md'))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src/prototypes'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('keeps a document comment tombstone as a barrier against stale state and new image ids', async () => {
        const projectRoot = createTempRoot('axhub-document-comments-');
        writeDocumentProject(projectRoot);
        const server = await startActivatedProjectServer(projectRoot);
        try {
            const url = scopeProjectApiUrl(projectRoot, `${server.origin}/api/document-comments?path=${encodeURIComponent('src/resources/prd/order.md')}`);
            const deletedAt = 1784650000000;
            const base = {
                schemaVersion: 3,
                kind: 'document-edit-comments',
                documentPath: 'src/resources/prd/order.md',
                comments: [{ id: 'comment-order-title', pageScope: 'document:order', deletedAt, locator: { selectors: ['h1'] }, state: 'completed' }],
                images: [],
            };
            await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: base, reason: 'changes' }) });
            const stale = {
                ...base,
                comments: [],
                images: [{ id: 'new-image', commentId: 'comment-order-title', pageScope: 'document:order', data: PNG_DATA_URL }],
            };
            const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: stale, reason: 'changes' }) });
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body.document.comments).toHaveLength(1);
            expect(body.document.comments[0].deletedAt).toBe(deletedAt);
            expect(body.document.images).toEqual([]);
            expect(fs.existsSync(path.join(projectRoot, '.axhub/make/comment-assets'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('removes a document image only after clear writes an unreferenced result', async () => {
        const projectRoot = createTempRoot('axhub-document-comments-');
        writeDocumentProject(projectRoot);
        const server = await startActivatedProjectServer(projectRoot);
        try {
            const url = scopeProjectApiUrl(projectRoot, `${server.origin}/api/document-comments?path=${encodeURIComponent('src/resources/prd/order.md')}`);
            const initial = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: { schemaVersion: 3, kind: 'document-edit-comments', documentPath: 'src/resources/prd/order.md', comments: [], images: [{ id: 'hero', elementKey: 'hero', source: 'target-screenshot', data: PNG_DATA_URL }] }, reason: 'changes' }),
            });
            const initialBody = await initial.json();
            const assetPath = initialBody.document.images[0].assetPath;
            expect(initialBody.document.images[0].source).toBe('target-screenshot');
            const absoluteAssetPath = path.join(projectRoot, assetPath);
            expect(fs.existsSync(absoluteAssetPath)).toBe(true);
            const hydratedResponse = await fetch(`${url}&hydrateImages=1`);
            const hydratedBody = await hydratedResponse.json();
            expect(hydratedBody.document.images[0].data).toBe(PNG_DATA_URL);
            expect(hydratedBody.document.images[0].source).toBe('target-screenshot');
            const assetResponse = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/document-comments/asset?path=${encodeURIComponent('src/resources/prd/order.md')}&asset=${encodeURIComponent(assetPath)}`));
            expect(assetResponse.status).toBe(200);
            expect(Buffer.from(await assetResponse.arrayBuffer()).length).toBeGreaterThan(0);
            await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: { schemaVersion: 3, kind: 'document-edit-comments', documentPath: 'src/resources/prd/order.md', comments: [], images: [] }, reason: 'clear' }),
            });
            expect(fs.existsSync(absoluteAssetPath)).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
