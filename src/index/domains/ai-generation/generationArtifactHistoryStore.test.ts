import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGenerationArtifactHistoryStore } from './generationArtifactHistoryStore';

describe('generation artifact history store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts and persists incrementally without submitting stale full snapshots', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({
          artifacts: [
            {
              id: 'old',
              kind: 'document',
              operation: 'created',
              title: 'Old',
              prompt: '',
              source: {},
              target: { path: 'src/resources/old.md' },
              createdAt: 1,
              updatedAt: 1,
              status: 'done',
              metadata: {},
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createGenerationArtifactHistoryStore();
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    await store.upsertArtifactAndPersist({
      id: 'new',
      kind: 'document',
      operation: 'created',
      title: 'New',
      prompt: '',
      source: {},
      target: { path: 'src/resources/new.md' },
      createdAt: 2,
      updatedAt: 2,
      status: 'done',
      metadata: {},
    }, { status: 'done' });
    await store.upsertArtifactAndPersist({
      id: 'new',
      kind: 'document',
      operation: 'updated',
      title: 'New Final',
      prompt: '',
      source: {},
      target: { path: 'src/resources/new-final.md' },
      createdAt: 3,
      updatedAt: 3,
      status: 'done',
      metadata: {},
    }, { status: 'done' });

    expect(store.getState().artifacts.map((item) => item.id).sort()).toEqual(['new', 'old']);
    expect(store.getState().artifacts.find((item) => item.id === 'new')).toMatchObject({
      title: 'New Final',
      operation: 'updated',
      createdAt: 2,
    });
    const writeCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH');
    expect(writeCalls).toHaveLength(2);
    const firstBody = JSON.parse(String(writeCalls[0][1]?.body));
    const lastBody = JSON.parse(String(writeCalls[1][1]?.body));
    expect(firstBody.artifact.id).toBe('new');
    expect(firstBody.artifacts).toBeUndefined();
    expect(lastBody.artifact).toMatchObject({
      id: 'new',
      title: 'New Final',
      operation: 'updated',
      createdAt: 2,
    });
    expect(lastBody.artifact.prompt).toBeUndefined();
    expect(writeCalls[1][0]).toBe('/api/ai/artifact-history?targetPath=prototypes%2Fhome&projectId=project-b');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('deletes artifacts through the soft-delete endpoint', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({
          artifacts: [
            {
              id: 'old',
              artifactId: 'old',
              kind: 'document',
              operation: 'created',
              title: 'Old',
              source: {},
              target: { path: 'src/resources/old.md' },
              createdAt: 1,
              updatedAt: 1,
              status: 'done',
              metadata: {},
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createGenerationArtifactHistoryStore();
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    await store.deleteArtifact('old');

    const deleteCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0]).toBe('/api/ai/artifact-history?targetPath=prototypes%2Fhome&projectId=project-b');
    expect(JSON.parse(String(deleteCalls[0][1]?.body))).toEqual({ id: 'old' });
    expect(store.getState().artifacts).toEqual([]);
  });

  it('uses resource canvas file paths for artifact history scope', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createGenerationArtifactHistoryStore();
    await store.configure({ projectId: 'project-b', targetPath: 'src/resources/flows/home.excalidraw' });
    await store.upsertArtifactAndPersist({
      id: 'resource-canvas-artifact',
      kind: 'document',
      operation: 'created',
      title: 'Resource Canvas Artifact',
      source: {},
      target: { path: 'src/resources/spec.md' },
      createdAt: 1,
      updatedAt: 1,
      status: 'done',
      metadata: {},
    }, { status: 'done' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/artifact-history?targetPath=src%2Fresources%2Fflows%2Fhome.excalidraw&projectId=project-b');
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/artifact-history?targetPath=src%2Fresources%2Fflows%2Fhome.excalidraw&projectId=project-b', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('keeps all four canvas artifact kinds visible for the generation history popover', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createGenerationArtifactHistoryStore();
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/canvas-regression' });

    for (const artifact of [
      { id: 'artifact-image', kind: 'image', title: '图片产物', target: { path: 'src/resources/image.png' } },
      { id: 'artifact-prototype', kind: 'prototype', title: '原型产物', target: { path: 'src/prototypes/home/index.tsx' } },
      { id: 'artifact-document', kind: 'document', title: '文档产物', target: { path: 'src/resources/spec.md' } },
      { id: 'artifact-drawio', kind: 'drawio', title: 'Drawio 产物', target: { path: 'src/resources/flow.drawio.svg' } },
    ]) {
      await store.upsertArtifactAndPersist({
        ...artifact,
        operation: 'created',
        source: { type: 'test' },
        createdAt: 100,
        updatedAt: 100,
        status: 'done',
        metadata: {},
      }, { status: 'done' });
    }

    const artifacts = store.getState().artifacts;
    expect(artifacts).toHaveLength(4);
    expect(['image', 'prototype', 'document', 'drawio'].map((kind) => (
      artifacts.filter((artifact) => artifact.kind === kind).map((artifact) => artifact.title)
    ))).toEqual([
      ['图片产物'],
      ['原型产物'],
      ['文档产物'],
      ['Drawio 产物'],
    ]);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(4);
  });

  it('reloads the same target path when project changes and ignores the previous project response', async () => {
    let resolveProjectA: ((response: Response) => void) | undefined;
    const projectAResponse = new Promise<Response>((resolve) => {
      resolveProjectA = resolve;
    });
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('projectId=project-a')) return projectAResponse;
      return Promise.resolve(new Response(JSON.stringify({
        artifacts: [{
          id: 'artifact-b',
          kind: 'document',
          operation: 'created',
          title: 'Project B',
          source: {},
          target: {},
          createdAt: 2,
          updatedAt: 2,
          status: 'done',
          metadata: {},
        }],
      }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createGenerationArtifactHistoryStore();
    const projectALoad = store.configure({ projectId: 'project-a', targetPath: 'prototypes/home' });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/ai/artifact-history?targetPath=prototypes%2Fhome&projectId=project-a');
    });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    resolveProjectA?.(new Response(JSON.stringify({
      artifacts: [{
        id: 'artifact-a',
        kind: 'document',
        operation: 'created',
        title: 'Project A',
        source: {},
        target: {},
        createdAt: 1,
        updatedAt: 1,
        status: 'done',
        metadata: {},
      }],
    }), { status: 200 }));
    await projectALoad;

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/artifact-history?targetPath=prototypes%2Fhome&projectId=project-b');
    expect(store.getState()).toMatchObject({
      projectId: 'project-b',
      targetPath: 'prototypes/home',
      artifacts: [expect.objectContaining({ id: 'artifact-b' })],
    });
  });

  it('ignores streamed artifacts from a different project scope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ artifacts: [] }), { status: 200 })));
    const store = createGenerationArtifactHistoryStore();
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });

    store.upsertArtifact({
      id: 'artifact-a',
      kind: 'document',
      operation: 'created',
      title: 'Project A',
      source: {},
      target: {},
      createdAt: 1,
      updatedAt: 1,
      status: 'done',
      metadata: {},
    }, {
      status: 'done',
      scope: { projectId: 'project-a', targetPath: 'prototypes/home' },
    });

    expect(store.getState().artifacts).toEqual([]);
  });
});
