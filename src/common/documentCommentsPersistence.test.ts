import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDocumentCommentsPersistenceAdapter,
  createDocumentCommentsPersistenceScope,
} from './documentCommentsPersistence';

const scope = createDocumentCommentsPersistenceScope({
  projectId: 'project-a',
  documentPath: 'src/resources/prd/order.md',
});

const document = {
  schemaVersion: 2 as const,
  kind: 'document-edit-comments' as const,
  resource: {
    id: 'hash',
    targetPath: 'src/resources/prd/order.md',
    filePath: '.axhub/make/comments/hash.json',
  },
  comments: [],
  images: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('document comments persistence adapter', () => {
  it('sends the explicit project and document path on reads and writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: true, document }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createDocumentCommentsPersistenceAdapter(() => ({
      projectId: 'project-a',
      documentPath: 'src/resources/prd/order.md',
      makeServerOrigin: 'http://localhost:53817',
    }));

    await expect(adapter.read(scope)).resolves.toEqual(document);
    await adapter.write(scope, document, 'state', {
      observedTombstones: [{
        kind: 'comment',
        pageScope: 'page-a',
        elementKey: 'hero',
        deletedAt: 12,
      }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1,
      'http://localhost:53817/api/document-comments?path=src%2Fresources%2Fprd%2Forder.md&projectId=project-a&hydrateImages=1',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'http://localhost:53817/api/document-comments?path=src%2Fresources%2Fprd%2Forder.md&projectId=project-a',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          document,
          reason: 'state',
          observedTombstones: [{
            kind: 'comment',
            pageScope: 'page-a',
            elementKey: 'hero',
            deletedAt: 12,
          }],
        }),
      }),
    );
  });

  it('does not turn an unavailable document context into a local fallback', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createDocumentCommentsPersistenceAdapter(() => null);

    await expect(adapter.read(scope)).resolves.toBeNull();
    await expect(adapter.write(scope, document, 'changes')).rejects.toThrow(
      'Document comment context is unavailable',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates API failures to the caller', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createDocumentCommentsPersistenceAdapter(() => ({
      projectId: 'project-a',
      documentPath: 'src/resources/prd/order.md',
      makeServerOrigin: 'http://localhost:53817',
    }));

    await expect(adapter.read(scope)).rejects.toThrow('503');
  });

  it('fails closed when a standalone preview has no Make server origin', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createDocumentCommentsPersistenceAdapter(() => ({
      projectId: 'project-a',
      documentPath: 'src/resources/prd/order.md',
    }));

    await expect(adapter.read(scope)).resolves.toBeNull();
    await expect(adapter.write(scope, document, 'changes')).rejects.toThrow(
      'Make server origin is unavailable; standalone previews do not support comments.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
