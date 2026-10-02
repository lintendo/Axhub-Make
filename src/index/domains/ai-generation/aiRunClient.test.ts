import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAiRunsApiUrl, runAiStream } from './aiRunClient';

const originalFetch = globalThis.fetch;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('AI run client', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('streams artifact events to the caller before the completed snapshot', async () => {
    const seenEvents: string[] = [];
    const seenArtifacts: unknown[] = [];
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'run-one',
        threadId: 'thread-one',
        scene: 'document',
      }),
      sseEvent('artifact.created', {
        runId: 'run-one',
        artifact: {
          id: 'artifact-one',
          kind: 'document',
          operation: 'created',
          target: { uri: '/?doc=one.md' },
        },
      }),
      sseEvent('run.text.delta', {
        runId: 'run-one',
        delta: 'done',
      }),
      sseEvent('run.completed', {
        status: 'done',
        runId: 'run-one',
        threadId: 'thread-one',
        output: 'done',
        artifacts: [{
          id: 'artifact-one',
          kind: 'document',
          operation: 'created',
        }],
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    const result = await runAiStream({
      projectId: 'project-b',
      scene: 'document',
      prompt: '写文档',
      runId: 'run-one',
      threadId: 'thread-one',
      taskId: 'task-one',
      conversationId: 'conversation-one',
      generatorElementId: 'generator-1',
      canvasName: 'resources/flows/home.excalidraw',
    }, ({ event, data }) => {
      seenEvents.push(event);
      if (event === 'artifact.created') {
        seenArtifacts.push(data.artifact);
      }
    });

    expect(seenEvents).toEqual([
      'run.accepted',
      'artifact.created',
      'run.text.delta',
      'run.completed',
    ]);
    expect(seenArtifacts).toEqual([
      expect.objectContaining({
        id: 'artifact-one',
        kind: 'document',
      }),
    ]);
    expect(result).toMatchObject({
      output: 'done',
      runId: 'run-one',
      threadId: 'thread-one',
      artifacts: [
        expect.objectContaining({ id: 'artifact-one' }),
      ],
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai/runs', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    }));
    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      projectId: 'project-b',
      scene: 'document',
      prompt: '写文档',
      runId: 'run-one',
      threadId: 'thread-one',
      taskId: 'task-one',
      conversationId: 'conversation-one',
      generatorElementId: 'generator-1',
      canvasName: 'resources/flows/home.excalidraw',
    });
  });

  it('posts runs to the injected Make API origin when the current page is served elsewhere', async () => {
    vi.stubGlobal('window', {
      __AXHUB_MAKE_API_ORIGIN__: 'http://localhost:53817/',
      location: {
        origin: 'http://localhost:51720',
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(
      sseEvent('run.completed', {
        status: 'done',
        output: 'ok',
        artifacts: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )) as any;

    await runAiStream({
      projectId: 'project-b',
      scene: 'direct',
      prompt: '优化提示词',
    });

    expect(resolveAiRunsApiUrl()).toBe('http://localhost:53817/api/ai/runs');
    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:53817/api/ai/runs', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('can pass per-run image generation settings to the AI runs API', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      sseEvent('run.completed', {
        status: 'done',
        output: 'ok',
        artifacts: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )) as any;

    await runAiStream({
      projectId: 'project-b',
      scene: 'image',
      prompt: '测试图片配置',
      builtinToolSettings: {
        imageGeneration: {
          baseUrl: 'https://images.example.com/v1',
          apiKey: 'sk-current',
          model: 'gpt-image-2',
        },
      },
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      scene: 'image',
      prompt: '测试图片配置',
      builtinToolSettings: {
        imageGeneration: {
          baseUrl: 'https://images.example.com/v1',
          apiKey: 'sk-current',
          model: 'gpt-image-2',
        },
      },
    });
  });

  it('can pass per-run MCP servers to the AI runs API', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      sseEvent('run.completed', {
        status: 'done',
        output: 'ok',
        artifacts: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )) as any;

    await runAiStream({
      projectId: 'project-b',
      scene: 'direct',
      prompt: '更新画布',
      mcpServers: [{
        name: 'axhub-canvas',
        type: 'http',
        url: 'http://localhost:5174/api/mcp/axhub-canvas',
        headers: [{
          name: 'x-axhub-canvas-mcp-token',
          value: 'canvas-secret',
        }],
      }],
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      scene: 'direct',
      prompt: '更新画布',
      mcpServers: [{
        name: 'axhub-canvas',
        type: 'http',
        url: 'http://localhost:5174/api/mcp/axhub-canvas',
      }],
    });
  });

  it('passes an explicit permission mode without adding MCP servers', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      sseEvent('run.completed', {
        status: 'done',
        output: 'ok',
        artifacts: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )) as any;

    await runAiStream({
      projectId: 'project-b',
      scene: 'direct',
      prompt: '直接更新画布文件',
      permissionMode: 'bypassPermissions',
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody.permissionMode).toBe('bypassPermissions');
    expect(requestBody.mcpServers).toBeUndefined();
  });

  it('passes the configured agent run concurrency to the AI runs API', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      sseEvent('run.completed', {
        status: 'done',
        output: 'ok',
        artifacts: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )) as any;

    await runAiStream({
      projectId: 'project-b',
      scene: 'direct',
      prompt: '批量批注',
      agentRunConcurrency: 4,
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      scene: 'direct',
      prompt: '批量批注',
      agentRunConcurrency: 4,
    });
  });

  it('preserves structured run error fields for ACP runtime recovery actions', async () => {
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'run-runtime',
        threadId: 'thread-runtime',
      }),
      sseEvent('run.error', {
        status: 'error',
        error: '本地 ACP 服务未链接',
        code: 'ACP_RUNTIME_UNAVAILABLE',
        action: 'open-ai-settings',
        runtime: {
          webBaseUrl: 'http://localhost:32124',
          apiBaseUrl: 'http://localhost:32124/api',
          projectPath: '/tmp/project',
          health: {
            status: 'runtime_unreachable',
            message: 'connect ECONNREFUSED',
            checkedAt: '2026-06-07T00:00:00.000Z',
            commandSource: 'default',
            hints: {
              installGlobal: 'npx -y @axhub/acp --help',
              start: 'npx -y @axhub/acp --port 32124',
              status: 'curl http://localhost:32124/api/chat',
            },
          },
        },
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    await expect(runAiStream({
      projectId: 'project-b',
      scene: 'prototype',
      prompt: '生成页面',
    })).rejects.toMatchObject({
      message: '本地 ACP 服务未链接',
      code: 'ACP_RUNTIME_UNAVAILABLE',
      action: 'open-ai-settings',
      runtime: expect.objectContaining({
        health: expect.objectContaining({
          status: 'runtime_unreachable',
          hints: expect.objectContaining({
            start: 'npx -y @axhub/acp --port 32124',
          }),
        }),
      }),
    });
  });

  it('maps ACP active-run conflict error codes to user-facing messages while preserving diagnostics', async () => {
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'run-cancel-failed',
        threadId: 'thread-home',
      }),
      sseEvent('run.error', {
        status: 'error',
        error: 'Failed to cancel the active ACP run before sending the new prompt.',
        code: 'ACP_CHAT_CANCEL_FAILED',
        threadId: 'thread-home',
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    await expect(runAiStream({
      projectId: 'project-b',
      scene: 'direct',
      prompt: '继续修改',
      threadId: 'thread-home',
    })).rejects.toMatchObject({
      message: '当前 AI 任务仍在处理中，停止失败，本次新请求未发送。请稍后重试。',
      code: 'ACP_CHAT_CANCEL_FAILED',
      data: expect.objectContaining({
        error: 'Failed to cancel the active ACP run before sending the new prompt.',
        threadId: 'thread-home',
      }),
    });
  });

  it('rejects a project-scoped AI run before fetch when projectId is missing', async () => {
    globalThis.fetch = vi.fn() as any;

    await expect(runAiStream({
      scene: 'direct',
      prompt: '不应发送',
    } as any)).rejects.toThrow('请先选择项目');

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
