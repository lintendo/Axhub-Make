import { beforeEach, describe, expect, it, vi } from 'vitest';

const runnerMock = vi.hoisted(() => ({
  runAcpPrototypeAgent: vi.fn(),
}));

vi.mock('./acpPrototypeAgentClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./acpPrototypeAgentClient')>();
  return {
    ...actual,
    runAcpPrototypeAgent: runnerMock.runAcpPrototypeAgent,
  };
});

const { createPrototypeGenerationTaskStore } = await import('./prototypeTaskStore');

describe('prototype generation task store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    runnerMock.runAcpPrototypeAgent.mockReset();
  });

  it('does not load or persist the deleted ai-image history endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const store = createPrototypeGenerationTaskStore();

    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    store.deleteTask('missing-task');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs ACP prototype generation and keeps in-memory task state', async () => {
    runnerMock.runAcpPrototypeAgent.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ stage: 'accepted' });
      onEvent?.({ stage: 'running', sessionId: 'axhub-prompt-acpx-client-home' });
      onEvent?.({ stage: 'completed' });
      return { status: 'done', sessionId: 'axhub-prompt-acpx-client-home' };
    });
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2500) });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    const seenStages: string[] = [];
    store.subscribe(() => {
      const task = store.getTasks()[0];
      if (task) seenStages.push(task.stage);
    });

    const result = await store.submit({
      prompt: '生成 CRM 原型',
      preferredPromptClient: 'acp:codex',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      canvasName: 'flows/home.excalidraw',
      generatorElementId: 'generator-1',
    }, {
      onAgentDone: async () => ({
        name: 'crm-dashboard',
        displayName: 'CRM Dashboard',
        previewUrl: '/prototypes/crm-dashboard',
        clientUrl: '/prototypes/crm-dashboard',
      } as any),
    });

    expect(result).toMatchObject({
      status: 'done',
      stage: 'done',
      elapsed: 1500,
      outputPrototypeName: 'crm-dashboard',
      provider: 'codex',
      acpxSessionName: 'axhub-prompt-acpx-client-home',
      runId: expect.stringMatching(/^prototype-task-/u),
      recoverable: true,
    });
    expect(seenStages).toEqual(expect.arrayContaining(['submitting', 'running', 'refreshing', 'done']));
    expect(runnerMock.runAcpPrototypeAgent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-b',
      provider: 'codex',
      prompt: '生成 CRM 原型',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      canvasName: 'flows/home.excalidraw',
      generatorElementId: 'generator-1',
      targetPath: 'prototypes/home',
    }));
  });

  it('forwards streamed prototype artifacts before completion', async () => {
    const streamedArtifact = {
      id: 'prototype-artifact-one',
      kind: 'prototype',
      operation: 'created',
      target: { path: 'src/prototypes/home/index.tsx' },
    };
    const onArtifactMock = vi.fn();
    runnerMock.runAcpPrototypeAgent.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ stage: 'accepted' });
      onEvent?.({ stage: 'activity', artifact: streamedArtifact });
      onEvent?.({ stage: 'completed' });
      return { status: 'done', sessionId: 'axhub-session-run-client-home' };
    });
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1800) });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });

    const result = await store.submit({
      prompt: '生成当前原型',
      preferredPromptClient: 'acp:codex',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      canvasName: 'flows/home.excalidraw',
      generatorElementId: 'generator-1',
    }, {
      onArtifact: onArtifactMock,
      onAgentDone: async () => null,
    });

    expect(result.status).toBe('done');
    expect(onArtifactMock).toHaveBeenCalledWith(
      streamedArtifact,
      expect.objectContaining({
        status: 'running',
        stage: 'running',
      }),
    );
  });

  it('waits for streamed prototype artifact handlers before completing the task', async () => {
    const streamedArtifact = {
      id: 'prototype-artifact-one',
      kind: 'prototype',
      operation: 'created',
      target: { path: 'src/prototypes/home/index.tsx' },
    };
    let resolveArtifactHandler: () => void = () => {};
    const artifactHandlerDone = new Promise<void>((resolve) => {
      resolveArtifactHandler = resolve;
    });
    const order: string[] = [];
    runnerMock.runAcpPrototypeAgent.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ stage: 'activity', artifact: streamedArtifact });
      order.push('runner-done');
      return { status: 'done', sessionId: 'axhub-session-run-client-home' };
    });
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1800) });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });

    const submitPromise = store.submit({
      prompt: '生成当前原型',
      preferredPromptClient: 'acp:codex',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      canvasName: 'flows/home.excalidraw',
      generatorElementId: 'generator-1',
    }, {
      onArtifact: async () => {
        order.push('artifact-start');
        await artifactHandlerDone;
        order.push('artifact-done');
      },
      onAgentDone: async () => {
        order.push('agent-done');
        return null;
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['artifact-start', 'runner-done']);

    resolveArtifactHandler();
    const result = await submitPromise;

    expect(result.status).toBe('done');
    expect(order).toEqual(['artifact-start', 'runner-done', 'artifact-done', 'agent-done']);
  });

  it('stores ACP execution errors on the task', async () => {
    runnerMock.runAcpPrototypeAgent.mockResolvedValue({
      status: 'error',
      error: 'ACP chat failed',
    });
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200) });
    await store.configure({ projectId: 'project-b', targetPath: null });

    const result = await store.submit({
      prompt: '失败案例',
      preferredPromptClient: 'manual',
      generatorElementId: 'generator-1',
    });

    expect(result).toMatchObject({
      status: 'error',
      stage: 'error',
      error: 'ACP chat failed',
      provider: 'codex',
    });
  });

  it('does not derive a prototype target path from a resource canvas path', async () => {
    runnerMock.runAcpPrototypeAgent.mockResolvedValue({
      status: 'done',
      sessionId: 'axhub-session-run-client-home',
    });
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200) });
    await store.configure({ projectId: 'project-b', targetPath: null });

    await store.submit({
      prompt: '生成当前原型',
      preferredPromptClient: 'acp:codex',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      canvasName: 'flows/home.excalidraw',
      generatorElementId: 'generator-1',
    }, {
      onAgentDone: async () => null,
    });

    expect(runnerMock.runAcpPrototypeAgent).toHaveBeenCalledWith(expect.objectContaining({
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      targetPath: undefined,
    }));
  });

  it('uses resource canvas file paths as configured task targets', async () => {
    runnerMock.runAcpPrototypeAgent.mockResolvedValue({
      status: 'done',
      sessionId: 'axhub-session-run-client-home',
    });
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200) });

    await store.configure({ projectId: 'project-b', targetPath: 'src/resources/flows/home.excalidraw' });
    await store.submit({
      prompt: '生成当前原型',
      preferredPromptClient: 'acp:codex',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      canvasName: 'flows/home.excalidraw',
      generatorElementId: 'generator-1',
    }, {
      onAgentDone: async () => null,
    });

    expect(runnerMock.runAcpPrototypeAgent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-b',
      targetPath: 'src/resources/flows/home.excalidraw',
    }));
  });

  it('does not publish a previous project task after switching the same target path', async () => {
    let resolveProjectA: ((result: { status: 'done'; sessionId: string }) => void) | undefined;
    runnerMock.runAcpPrototypeAgent.mockImplementation(() => new Promise((resolve) => {
      resolveProjectA = resolve;
    }));
    const store = createPrototypeGenerationTaskStore({ now: vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200) });
    await store.configure({ projectId: 'project-a', targetPath: 'prototypes/home' });

    const projectATask = store.submit({
      prompt: 'Project A task',
      generatorElementId: 'generator-a',
    });
    await vi.waitFor(() => {
      expect(runnerMock.runAcpPrototypeAgent).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'project-a',
        targetPath: 'prototypes/home',
      }));
    });
    await store.configure({ projectId: 'project-b', targetPath: 'prototypes/home' });
    resolveProjectA?.({ status: 'done', sessionId: 'project-a-session' });
    await projectATask;

    expect(store.getTasks()).toEqual([]);
  });
});
