import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPrototypeGenerationPrompt,
  runAcpPrototypeAgent,
} from './acpPrototypeAgentClient';

const originalFetch = globalThis.fetch;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('ACP prototype agent client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('builds a concise prompt that asks the ACP agent to update pages in the current prototype', () => {
    const prompt = buildPrototypeGenerationPrompt({
      prompt: '做一个 CRM 工作台',
      canvasFilePath: 'src/resources/flows/dashboard.excalidraw',
      canvasName: 'resources/flows/dashboard.excalidraw',
      generatorElementId: 'generator-1',
      currentPrototype: {
        name: 'dashboard',
        displayName: '管理工作台',
        pages: [
          { id: 'overview', title: '总览' },
        ],
        defaultPageId: 'overview',
      },
      knownPrototypes: [
        {
          name: 'dashboard',
          displayName: '管理工作台',
          pages: [
            { id: 'overview', title: '总览' },
          ],
          defaultPageId: 'overview',
        },
        { name: 'settings', displayName: '设置' },
      ],
      settings: {
        count: 3,
        theme: { name: 'linear', displayName: 'Linear' },
      },
    });

    expect(prompt.split('\n')).toHaveLength(20);
    expect(prompt).toContain('做一个 CRM 工作台');
    expect(prompt).toContain('只在当前 prototype 中新增/更新页面');
    expect(prompt).toContain('src/prototypes/dashboard/');
    expect(prompt).toContain('数量：3（当前 prototype 下页面/方案数）');
    expect(prompt).not.toContain('距离目标文件最近的 README/rules');
    expect(prompt).not.toContain('读取 `.axhub/make/project.json`');
    expect(prompt).not.toContain('读取 `.axhub/make/axhub.config.json`');
    expect(prompt).not.toContain('按项目 metadata 和写入能力修改文件');
    expect(prompt).not.toContain('按 Axhub Make Engine 的项目写入约束修改文件');
    expect(prompt).not.toContain('当前目标 prototype');
    expect(prompt).not.toContain('不要创建新的 prototype 目录');
    expect(prompt).not.toContain('无目标原型：创建一个新的 prototype 资源');
    expect(prompt).not.toContain('在当前项目内生成，不创建独立项目');
    expect(prompt).not.toContain('必须在当前 prototype 目录下创建或更新页面');
    expect(prompt).not.toContain('生成数量表示当前 prototype 下的页面/方案数量');
    expect(prompt).not.toContain('新生成的 prototype embeddable 节点应设置');
    expect(prompt).toContain('这是一次非交互式任务');
    expect(prompt).toContain('不要追问用户');
    expect(prompt).toContain('跳过浏览器验证');
    expect(prompt).toContain('不要运行 `check-app-ready.mjs`');
    expect(prompt).not.toContain('src/resources/flows/dashboard.excalidraw');
    expect(prompt).not.toContain('canvasFilePath');
    expect(prompt).not.toContain('canvasName: resources/flows/dashboard.excalidraw');
    expect(prompt).not.toContain('generator-1');
    expect(prompt).toContain('当前 prototype');
    expect(prompt).toContain('dashboard');
    expect(prompt).toContain('overview');
    expect(prompt).not.toContain('生成数量：3');
    expect(prompt).toContain('设计系统：linear (Linear)');
    expect(prompt).not.toContain('更新 `canvas.excalidraw`');
    expect(prompt).not.toContain('generatorElementId');
    expect(prompt).not.toContain('embeddable');
    expect(prompt).not.toContain('customData.embedViewMode 设置为 `preview`');
    expect(prompt).not.toContain('Make 管理端首页 deep link');
    expect(prompt).not.toContain('embedContentScale');
    expect(prompt).not.toContain('720x450');
    expect(prompt).not.toContain('1440x900');
    expect(prompt).not.toContain('captureScreenshotOnMount');
    expect(prompt).not.toContain('保留画布既有元素、files、appState');
    expect(prompt).not.toContain('完成后的刷新');
    expect(prompt).not.toContain('暂时不要在结尾再执行刷新');
    expect(prompt).not.toContain('不在结尾执行刷新');
    expect(prompt).not.toContain('宿主应用会负责后续刷新');
    expect(prompt).not.toContain('最后再执行刷新');
    expect(prompt).toContain('最终消息：已完成');
    expect(prompt).not.toContain('/api/prompt/execute');
  });

  it('omits unspecified prototype count and design system from the agent prompt', () => {
    const prompt = buildPrototypeGenerationPrompt({
      prompt: '做一个默认原型',
      canvasFilePath: 'src/resources/flows/untitled.excalidraw',
      generatorElementId: 'generator-1',
      settings: {},
    });

    expect(prompt).toContain('做一个默认原型');
    expect(prompt).toContain('原型生成范围：');
    expect(prompt).not.toContain('数量：1');
    expect(prompt).not.toContain('设计系统：未指定');
  });

  it('runs the prototype prompt through the unified AI runs API instead of a websocket agent', async () => {
    const events: string[] = [];
    const artifacts: any[] = [];
    const websocketCtor = vi.fn();
    vi.stubGlobal('WebSocket', websocketCtor);
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'prototype-task-one',
        threadId: 'axhub-project-home',
        scene: 'prototype',
      }),
      sseEvent('artifact.created', {
        runId: 'prototype-task-one',
        artifact: {
          id: 'prototype-artifact-one',
          kind: 'prototype',
          operation: 'created',
          target: { path: 'src/prototypes/home/index.tsx' },
        },
      }),
      sseEvent('run.completed', {
        status: 'done',
        runId: 'prototype-task-one',
        threadId: 'axhub-project-home',
        output: 'created prototype',
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    const result = await runAcpPrototypeAgent({
      projectId: 'project-b',
      provider: 'codex',
      prompt: '生成 CRM 原型',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      generatorElementId: 'generator-1',
      currentPrototype: {
        name: 'home',
        displayName: 'Home',
      },
      onEvent: (event) => {
        events.push(event.stage);
        if (event.artifact) artifacts.push(event.artifact);
      },
    });

    expect(result).toEqual({
      status: 'done',
      sessionId: 'axhub-project-home',
      runId: 'prototype-task-one',
    });
    expect(events).toEqual(['accepted', 'running', 'activity', 'running', 'completed']);
    expect(artifacts).toEqual([
      expect.objectContaining({
        kind: 'prototype',
        operation: 'created',
        target: { path: 'src/prototypes/home/index.tsx' },
      }),
    ]);
    expect(websocketCtor).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai/runs?projectId=project-b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      projectId: 'project-b',
      scene: 'prototype',
      targetPath: 'prototypes/home',
      generatorElementId: 'generator-1',
      preferredPromptClient: 'codex',
    });
    expect(requestBody.prompt).toContain('生成 CRM 原型');
    expect(requestBody.prompt).toContain('只在当前 prototype 中新增/更新页面');
    expect(requestBody.prompt).not.toContain('不要创建新的 prototype 目录');
    expect(requestBody.prompt).not.toContain('canvasName: resources/flows/home.excalidraw');
    expect(requestBody.prompt).not.toContain('canvasFilePath');
    expect(requestBody.prompt).not.toContain('src/resources/flows/home.excalidraw');
    expect(requestBody.prompt).not.toContain('更新 `canvas.excalidraw`');
    expect(requestBody.prompt).toContain('最终消息：已完成');
    expect(requestBody.settings).toBeUndefined();
  });

  it('sends prototype reference images to the unified AI runs API separately from the text prompt', async () => {
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'prototype-task-reference',
        threadId: 'axhub-project-home',
        scene: 'prototype',
      }),
      sseEvent('run.completed', {
        status: 'done',
        runId: 'prototype-task-reference',
        threadId: 'axhub-project-home',
        output: 'created prototype',
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    await runAcpPrototypeAgent({
      projectId: 'project-b',
      provider: 'codex',
      prompt: '按参考图生成原型',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      generatorElementId: 'generator-1',
      referenceImages: ['data:image/png;base64,cmVm'],
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody.referenceImages).toEqual(['data:image/png;base64,cmVm']);
    expect(requestBody.prompt).toContain('按参考图生成原型');
    expect(requestBody.prompt).not.toContain('data:image/png;base64,cmVm');
  });

  it('passes ACP model, mode, thought, and context bundle through to the unified AI runs API', async () => {
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'prototype-task-context',
        threadId: 'axhub-project-home',
        scene: 'prototype',
      }),
      sseEvent('run.completed', {
        status: 'done',
        runId: 'prototype-task-context',
        threadId: 'axhub-project-home',
        output: 'created prototype',
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    const contextBundle = {
      version: 2,
      items: [{
        kind: 'file',
        id: 'context-one',
        path: 'src/prototypes/home/index.tsx',
      }],
    };

    await runAcpPrototypeAgent({
      projectId: 'project-b',
      provider: 'codex',
      prompt: '按上下文生成原型',
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      generatorElementId: 'generator-1',
      model: 'gpt-5.1-codex',
      mode: 'agent',
      thought: 'high',
      contextBundle,
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'gpt-5.1-codex',
      modeId: 'agent',
      thoughtLevel: 'high',
      contextBundle,
    });
    expect(requestBody.mode).toBeUndefined();
    expect(requestBody.thought).toBeUndefined();
  });

  it('derives the AI run targetPath from the current prototype', async () => {
    globalThis.fetch = vi.fn(async () => new Response([
      sseEvent('run.accepted', {
        runId: 'prototype-task-untitled',
        threadId: 'axhub-project-untitled-4',
        scene: 'prototype',
      }),
      sseEvent('run.completed', {
        status: 'done',
        runId: 'prototype-task-untitled',
        threadId: 'axhub-project-untitled-4',
      }),
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as any;

    await runAcpPrototypeAgent({
      projectId: 'project-b',
      provider: 'codex',
      prompt: '生成官网首页',
      canvasFilePath: 'src/resources/flows/untitled-4.excalidraw',
      generatorElementId: 'generator-1',
      currentPrototype: {
        name: 'untitled-4',
        displayName: '未命名',
      },
    });

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      targetPath: 'prototypes/untitled-4',
      generatorElementId: 'generator-1',
    });
  });

  it('returns an error result when ACP prompt execution fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: 'ACP chat failed',
      code: 'PROMPT_EXECUTION_FAILED',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })) as any;

    const result = await runAcpPrototypeAgent({
      projectId: 'project-b',
      provider: 'codex',
      prompt: '生成失败案例',
      generatorElementId: 'generator-1',
    });

    expect(result).toMatchObject({
      status: 'error',
      error: 'ACP chat failed (PROMPT_EXECUTION_FAILED)',
    });
  });
});
