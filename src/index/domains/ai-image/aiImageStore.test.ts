import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAiImageTaskStore,
  type AiImageGenerateRequest,
} from './aiImageStore';

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function imageRunResponse(...artifacts: Array<Record<string, unknown>>): Response {
  return new Response([
    sseEvent('run.accepted', { runId: 'run-one', threadId: 'thread-one', scene: 'image' }),
    ...artifacts.map((artifact) => sseEvent('artifact.created', { artifact })),
    sseEvent('run.completed', { status: 'done', artifacts }),
  ].join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('AI image task store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads image task details from generation task and artifact history tables', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/ai/generation-tasks')) {
        return new Response(JSON.stringify({
          tasks: [{
            id: 'task-from-history',
            taskId: 'task-from-history',
            conversationId: 'conversation-from-history',
            prompt: 'reload 后的提示词',
            params: {
              size: '1024x1024',
              quality: 'high',
              output_format: 'png',
              output_compression: null,
              moderation: 'auto',
              n: 1,
            },
            status: 'done',
            artifactIds: ['artifact-from-history'],
            createdAt: 1000,
            updatedAt: 1600,
            finishedAt: 1600,
            metadata: {},
          }],
        }), { status: 200 });
      }
      if (url.startsWith('/api/ai/artifact-history')) {
        return new Response(JSON.stringify({
          artifacts: [{
            id: 'artifact-from-history',
            artifactId: 'artifact-from-history',
            taskId: 'task-from-history',
            conversationId: 'conversation-from-history',
            kind: 'image',
            operation: 'created',
            title: 'history.png',
            source: {},
            target: {},
            assetRef: {
              url: '/api/ai/artifact-history/assets?targetPath=prototypes%2Fhome&assetPath=generation-assets%2Fimages%2Fhistory.png',
              assetPath: 'generation-assets/images/history.png',
              mimeType: 'image/png',
              sizeBytes: 13,
            },
            createdAt: 1200,
            updatedAt: 1200,
            status: 'done',
            metadata: {
              fileName: 'history.png',
              width: 512,
              height: 256,
            },
          }],
        }), { status: 200 });
      }
      return imageRunResponse();
    });
    const store = createAiImageTaskStore({ storage: null });

    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    store.deleteTask('missing-task');

    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith('/api/ai-image/history'))).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/generation-tasks?targetPath=prototypes%2Fhome&projectId=project-b');
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/artifact-history?targetPath=prototypes%2Fhome&projectId=project-b');
    expect(store.getTasks()[0]).toMatchObject({
      id: 'task-from-history',
      prompt: 'reload 后的提示词',
      conversationId: 'conversation-from-history',
      status: 'done',
      outputImages: ['artifact-from-history'],
    });
    expect(store.getImage('artifact-from-history')).toMatchObject({
      dataUrl: '/api/ai/artifact-history/assets?targetPath=prototypes%2Fhome&assetPath=generation-assets%2Fimages%2Fhistory.png',
      assetPath: 'generation-assets/images/history.png',
      fileName: 'history.png',
      width: 512,
      height: 256,
    });
  });

  it('uses resource canvas file paths when loading image task history', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      tasks: [],
      artifacts: [],
    }), { status: 200 }));
    const store = createAiImageTaskStore({ storage: null });

    await store.configure({ projectId: 'project-b', targetPath: 'src/resources/flows/home.excalidraw' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/generation-tasks?targetPath=src%2Fresources%2Fflows%2Fhome.excalidraw&projectId=project-b');
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/artifact-history?targetPath=src%2Fresources%2Fflows%2Fhome.excalidraw&projectId=project-b');
  });

  it('tracks running, incremental images, done state, and only submits through /api/ai/runs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/ai/generation-tasks')) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }
      if (url.startsWith('/api/ai/artifact-history')) {
        return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
      }
      return imageRunResponse(
        {
          id: 'artifact-one',
          kind: 'image',
          operation: 'created',
          dataUrl: 'data:image/png;base64,one',
          revisedPrompt: '第一个',
          actualParams: { size: '1024x1024' },
          rawUrl: 'https://images.example.com/one.png',
          metadata: {
            fileName: 'one.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            savedPath: 'src/prototypes/home/.spec/generation-assets/images/one.png',
            width: 1024,
            height: 768,
          },
        },
        {
          id: 'artifact-two',
          kind: 'image',
          operation: 'created',
          dataUrl: 'data:image/webp;base64,two',
          revisedPrompt: '第二个',
          actualParams: { size: '1024x1024' },
          metadata: {
            fileName: 'two.webp',
            mimeType: 'image/webp',
            sizeBytes: 3,
            savedPath: 'src/prototypes/home/.spec/generation-assets/images/two.webp',
            width: 512,
            height: 512,
          },
        },
      );
    });
    const now = vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1600);
    const store = createAiImageTaskStore({ now, storage: null });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    const seenImageCounts: number[] = [];
    store.subscribe((state) => {
      seenImageCounts.push(state.tasks[0]?.outputImages.length || 0);
    });

    const request: AiImageGenerateRequest = {
      prompt: '一张产品图',
      params: {
        size: '1024x1024',
        quality: 'high',
        output_format: 'png',
        output_compression: null,
        moderation: 'auto',
        n: 2,
      },
    };
    const task = await store.submit(request);

    expect(task.status).toBe('done');
    expect(task.elapsed).toBe(600);
    expect(task.outputImages).toHaveLength(2);
    expect(task.revisedPromptByImage).toEqual({
      [task.outputImages[0]]: '第一个',
      [task.outputImages[1]]: '第二个',
    });
    expect(task.rawImageUrls).toEqual(['https://images.example.com/one.png']);
    expect(store.getImage(task.outputImages[0])?.dataUrl).toBe('data:image/png;base64,one');
    expect(store.getImage(task.outputImages[0])).toMatchObject({
      fileName: 'one.png',
      mimeType: 'image/png',
      sizeBytes: 3,
      savedPath: 'src/prototypes/home/.spec/generation-assets/images/one.png',
      width: 1024,
      height: 768,
    });
    expect(store.getImage(task.outputImages[1])?.dataUrl).toBe('data:image/webp;base64,two');
    expect(seenImageCounts).toEqual(expect.arrayContaining([1, 2]));
    const runCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/ai/runs?projectId=project-b');
    expect(runCall).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/runs?projectId=project-b', expect.objectContaining({
      method: 'POST',
      body: expect.any(String),
    }));
    const runBody = JSON.parse(String(runCall?.[1]?.body));
    expect(runBody).toMatchObject({
      projectId: 'project-b',
      scene: 'image',
      ...request,
      taskId: task.id,
      conversationId: task.conversationId,
    });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith('/api/ai-image/history'))).toBe(false);
  });

  it('keeps no more than 30 in-memory image tasks', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/ai/generation-tasks')) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }
      if (url.startsWith('/api/ai/artifact-history')) {
        return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
      }
      return imageRunResponse({
        id: `artifact-${Math.random()}`,
        kind: 'image',
        operation: 'created',
        dataUrl: `data:image/png;base64,${Math.random().toString(36).slice(2)}`,
      });
    });
    const store = createAiImageTaskStore({ storage: null });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    const request: AiImageGenerateRequest = {
      prompt: '批量历史',
      params: {
        size: '1024x1024',
        quality: 'high',
        output_format: 'png',
        output_compression: null,
        moderation: 'auto',
        n: 1,
      },
    };

    for (let index = 0; index < 32; index += 1) {
      await store.submit({ ...request, prompt: `批量历史 ${index}` });
    }

    expect(store.getTasks()).toHaveLength(30);
    expect(store.getTasks()[0]).toMatchObject({
      prompt: '批量历史 31',
      status: 'done',
    });
  });

  it('reloads a shared target path for a new project and ignores the old project load', async () => {
    let resolveProjectATasks: ((response: Response) => void) | undefined;
    const projectATasks = new Promise<Response>((resolve) => {
      resolveProjectATasks = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('projectId=project-a') && url.startsWith('/api/ai/generation-tasks')) {
        return projectATasks;
      }
      if (url.startsWith('/api/ai/generation-tasks')) {
        return Promise.resolve(new Response(JSON.stringify({
          tasks: [{
            id: 'task-b',
            taskId: 'task-b',
            prompt: 'Project B',
            params: {},
            status: 'error',
            createdAt: 2,
            updatedAt: 2,
            metadata: {},
          }],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ artifacts: [] }), { status: 200 }));
    });
    const store = createAiImageTaskStore({ storage: null });

    const projectALoad = store.configure({ projectId: 'project-a', targetPath: 'prototypes/home' });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/ai/generation-tasks?targetPath=prototypes%2Fhome&projectId=project-a');
    });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    resolveProjectATasks?.(new Response(JSON.stringify({
      tasks: [{
        id: 'task-a',
        taskId: 'task-a',
        prompt: 'Project A',
        params: {},
        status: 'error',
        createdAt: 1,
        updatedAt: 1,
        metadata: {},
      }],
    }), { status: 200 }));
    await projectALoad;

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/generation-tasks?targetPath=prototypes%2Fhome&projectId=project-b');
    expect(store.getTasks()).toEqual([expect.objectContaining({ id: 'task-b' })]);
  });

  it('does not publish a previous project generation result after switching scope', async () => {
    let resolveProjectARun: ((response: Response) => void) | undefined;
    const projectARun = new Promise<Response>((resolve) => {
      resolveProjectARun = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url === '/api/ai/runs?projectId=project-a') return projectARun;
      if (url.startsWith('/api/ai/generation-tasks')) {
        return Promise.resolve(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ artifacts: [] }), { status: 200 }));
    });
    const store = createAiImageTaskStore({ storage: null });
    await store.configure({ projectId: 'project-a', targetPath: 'prototypes/home' });

    const projectATask = store.submit({
      prompt: 'Project A image',
      params: {
        size: '1024x1024',
        quality: 'high',
        output_format: 'png',
        output_compression: null,
        moderation: 'auto',
        n: 1,
      },
    });
    await vi.waitFor(() => {
      const runCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/ai/runs?projectId=project-a');
      expect(JSON.parse(String(runCall?.[1]?.body))).toMatchObject({
        projectId: 'project-a',
        targetPath: 'prototypes/home',
      });
    });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    resolveProjectARun?.(imageRunResponse());
    await projectATask;

    expect(store.getTasks()).toEqual([]);
  });
});
