import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ai-generation/aiRunClient', () => ({
  runAiStream: vi.fn(async (params: any, onEvent?: (event: any) => void | Promise<void>) => {
    await onEvent?.({
      event: 'run.accepted',
      data: {
        runId: params.runId,
        threadId: params.threadId,
        conversationId: params.conversationId,
      },
    });
    return {
      output: 'ok',
      reasoning: '',
      artifacts: [],
      runId: params.runId,
      threadId: params.threadId,
    };
  }),
}));

import {
  prepareAnnotationDirectRunThread,
  resolveAnnotationDirectRunTarget,
  submitAnnotationPromptViaApi,
} from './annotationDirectRun';
import { runAiStream } from '../ai-generation/aiRunClient';

describe('annotation direct API run threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves prototype-scoped ACP conversation storage from assistant context', () => {
    const target = resolveAnnotationDirectRunTarget({
      context: {
        currentFile: {
          path: 'src/prototypes/checkout/pages/cart.tsx',
          displayName: 'cart.tsx',
        },
        selectedElements: [],
        extensions: {},
      },
      projectPath: '/workspace/make-client',
      projectScope: 'project-a',
    });

    expect(target).toMatchObject({
      projectScope: 'project-a',
      currentFilePath: 'src/prototypes/checkout/pages/cart.tsx',
      prototypePath: 'src/prototypes/checkout',
      conversationStorePath: '/workspace/make-client/src/prototypes/checkout/.spec/acp/conversations.json',
    });
  });

  it('creates a new thread for each direct send', () => {
    const target = {
      projectScope: 'project-a',
      currentFilePath: 'src/prototypes/home/index.tsx',
      prototypePath: 'src/prototypes/home',
      conversationStorePath: '/workspace/project/src/prototypes/home/.spec/acp/conversations.json',
    };

    const prepared = prepareAnnotationDirectRunThread({
      target,
      createRunId: () => 'annotation-run-1',
    });

    expect(prepared).toMatchObject({
      runId: 'annotation-run-1',
      threadId: 'annotation-run-1',
      conversationId: 'annotation-run-1',
    });
  });

  it('does not reuse previous direct-send threads', () => {
    const target = {
      projectScope: 'project-a',
      currentFilePath: 'src/prototypes/home/index.tsx',
      prototypePath: 'src/prototypes/home',
      conversationStorePath: '/workspace/project/src/prototypes/home/.spec/acp/conversations.json',
    };

    const first = prepareAnnotationDirectRunThread({
      target,
      createRunId: () => 'direct-thread-a',
    });
    const second = prepareAnnotationDirectRunThread({
      target,
      createRunId: () => 'direct-thread-b',
    });

    expect(first).toMatchObject({
      runId: 'direct-thread-a',
      threadId: 'direct-thread-a',
      conversationId: 'direct-thread-a',
    });
    expect(second).toMatchObject({
      runId: 'direct-thread-b',
      threadId: 'direct-thread-b',
      conversationId: 'direct-thread-b',
    });
  });

  it('keeps a unique run id while reusing an explicitly supplied canvas session', () => {
    const target = {
      projectScope: 'project-a',
      currentFilePath: 'src/resources/flows/home.excalidraw',
      prototypePath: '',
      conversationStorePath: '/workspace/project/.spec/acp/conversations.json',
    };

    const prepared = prepareAnnotationDirectRunThread({
      target,
      threadId: 'canvas-thread-1',
      conversationId: 'canvas-conversation-1',
      createRunId: () => 'canvas-run-2',
    });

    expect(prepared).toEqual({
      runId: 'canvas-run-2',
      threadId: 'canvas-thread-1',
      conversationId: 'canvas-conversation-1',
      target,
    });
  });

  it('submits three separate prompts into three independent conversations', async () => {
    const context = {
      currentFile: {
        path: 'src/prototypes/home/index.tsx',
        displayName: 'Home',
      },
      selectedElements: [],
      extensions: {},
    };
    const runIds = ['annotation-run-a', 'annotation-run-b', 'annotation-run-c'];
    let runIndex = 0;

    for (const prompt of ['改卡片 A', '改卡片 B', '改卡片 C']) {
      await submitAnnotationPromptViaApi({
        context: context as any,
        prompt,
        projectPath: '/workspace/project',
        projectScope: 'project-a',
      projectId: 'project-a',
        provider: 'codex',
        preferredPromptClient: 'acp:codex',
        createRunId: () => runIds[runIndex++] || 'unexpected-run',
      });
    }

    const threadIds = vi.mocked(runAiStream).mock.calls.map((call) => (call[0] as any).threadId);
    const conversationIds = vi.mocked(runAiStream).mock.calls.map((call) => (call[0] as any).conversationId);
    expect(threadIds.slice(-3)).toEqual(runIds);
    expect(conversationIds.slice(-3)).toEqual(runIds);
    expect(new Set(threadIds.slice(-3)).size).toBe(3);
  });

  it('submits an ACP context bundle instead of raw assistant context', async () => {
    const context = {
      currentFile: {
        path: 'src/prototypes/home/index.tsx',
        displayName: 'Home',
      },
      selectedElements: [{
        selector: '[data-hero]',
        label: 'Hero title',
        tag: 'h1',
      }],
      extensions: {
        source: 'annotation-host',
      },
    };

    await submitAnnotationPromptViaApi({
      context: context as any,
      prompt: '把标题改得更清楚',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      createRunId: () => 'run-context',
    });

    const params = vi.mocked(runAiStream).mock.calls[0]?.[0] as any;
    expect(params.conversationStorePath).toBe('/workspace/project/src/prototypes/home/.spec/acp/conversations.json');
    expect(params.contextBundle).toMatchObject({
      version: '2',
      items: [
        expect.objectContaining({
          kind: 'file',
          path: 'src/prototypes/home/index.tsx',
        }),
        expect.objectContaining({
          kind: 'annotation',
          body: 'Hero title',
          target: expect.objectContaining({
            type: 'web-element',
            selector: '[data-hero]',
          }),
        }),
      ],
    });
    expect(params.contextBundle.items).toEqual(expect.any(Array));
    expect(params.contextBundle).not.toHaveProperty('selectedElements');
  });

  it('forwards the viewport screenshot and explicit session ids to the direct AI run', async () => {
    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/resources/flows/home.excalidraw',
          displayName: 'Home Canvas',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '根据当前画布继续。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      threadId: 'canvas-thread-1',
      conversationId: 'canvas-conversation-1',
      referenceImages: ['data:image/png;base64,viewport'],
      permissionMode: 'bypassPermissions',
      createRunId: () => 'canvas-run-1',
    });

    expect(vi.mocked(runAiStream).mock.calls[0]?.[0]).toMatchObject({
      runId: 'canvas-run-1',
      threadId: 'canvas-thread-1',
      conversationId: 'canvas-conversation-1',
      referenceImages: ['data:image/png;base64,viewport'],
      permissionMode: 'bypassPermissions',
    });
  });

  it('submits image generation settings for direct runs without preview or canvas MCP servers', async () => {
    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/prototypes/home/index.tsx',
          displayName: 'Home',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '生成一张配图。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      builtinToolSettings: {
        imageGeneration: {
          baseUrl: 'https://current.example.com/v1',
          apiKey: 'sk-current',
          model: 'current-image-model',
        },
      },
      createRunId: () => 'run-image-config',
    });

    const params = vi.mocked(runAiStream).mock.calls[0]?.[0] as any;
    expect(params.builtinToolSettings).toEqual({
      imageGeneration: {
        baseUrl: 'https://current.example.com/v1',
        apiKey: 'sk-current',
        model: 'current-image-model',
      },
    });
    expect(params.mcpServers).toBeUndefined();
  });

  it('passes canvas MCP servers through direct runs when provided by the caller', async () => {
    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/resources/flows/home.excalidraw',
          displayName: 'Home Canvas',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '在当前画布新增一组流程节点。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      mcpServers: [{
        name: 'axhub-canvas',
        type: 'http',
        url: 'http://localhost:5174/api/mcp/axhub-canvas',
        headers: [{
          name: 'x-axhub-canvas-mcp-token',
          value: 'canvas-secret',
        }],
      }],
      createRunId: () => 'run-canvas-mcp',
    });

    const params = vi.mocked(runAiStream).mock.calls[0]?.[0] as any;
    expect(params.mcpServers).toEqual([{
      name: 'axhub-canvas',
      type: 'http',
      url: 'http://localhost:5174/api/mcp/axhub-canvas',
      headers: [{
        name: 'x-axhub-canvas-mcp-token',
        value: 'canvas-secret',
      }],
    }]);
  });

  it('passes annotation direct-run concurrency to the AI stream request', async () => {
    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/prototypes/home/index.tsx',
          displayName: 'Home',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '批量调整。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      agentRunConcurrency: 4,
      createRunId: () => 'run-concurrency',
    });

    const params = vi.mocked(runAiStream).mock.calls[0]?.[0] as any;
    expect(params.agentRunConcurrency).toBe(4);
  });

  it('allows review direct runs to override scene and target path while keeping prototype conversation storage', async () => {
    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/prototypes/home/.spec/ui-review.md',
          displayName: 'ui-review.md',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '执行评审。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      scene: 'prototype-review-direct',
      targetPath: 'src/prototypes/home/.spec/ui-review.md',
      createRunId: () => 'run-review',
    });

    const params = vi.mocked(runAiStream).mock.calls[0]?.[0] as any;
    expect(params.scene).toBe('prototype-review-direct');
    expect(params.targetPath).toBe('src/prototypes/home/.spec/ui-review.md');
    expect(params.conversationStorePath).toBe('/workspace/project/src/prototypes/home/.spec/acp/conversations.json');
  });

  it('uses a friendly connecting message before starting direct runs', async () => {
    const onRunStarting = vi.fn();

    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/prototypes/home/index.tsx',
          displayName: 'Home',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '调整按钮文案。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      createRunId: () => 'run-friendly-start',
      onRunStarting,
    });

    expect(onRunStarting).toHaveBeenCalledWith('正在连接 AI，请稍等。');
  });

  it('passes the abort signal through to the AI stream request', async () => {
    const controller = new AbortController();

    await submitAnnotationPromptViaApi({
      context: {
        currentFile: {
          path: 'src/prototypes/home/index.tsx',
          displayName: 'Home',
        },
        selectedElements: [],
        extensions: {},
      } as any,
      prompt: '把卡片标题调短。',
      projectPath: '/workspace/project',
      projectScope: 'project-a',
      projectId: 'project-a',
      provider: 'codex',
      preferredPromptClient: 'acp:codex',
      signal: controller.signal,
      createRunId: () => 'run-abortable',
    });

    const params = vi.mocked(runAiStream).mock.calls[0]?.[0] as any;
    expect(params.signal).toBe(controller.signal);
  });

});
