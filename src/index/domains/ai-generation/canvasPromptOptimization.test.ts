import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aiRunClient', () => ({
  runAiText: vi.fn(async () => ({
    output: '优化后的提示词',
    runId: 'prompt-optimization-test',
    threadId: 'prompt-optimization-test',
  })),
}));

import { runAiText } from './aiRunClient';
import {
  buildCanvasPromptOptimizationPrompt,
  optimizeCanvasPrompt,
} from './canvasPromptOptimization';

describe('canvas prompt optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a non-interactive prompt that includes scene settings and selected context', () => {
    const prompt = buildCanvasPromptOptimizationPrompt({
      prompt: '做一个会员增长看板',
      scene: 'page',
      sceneSettings: {
        count: 2,
        themeName: 'linear',
        needsRequirementsAnalysis: true,
      },
      canvasFilePath: 'src/resources/flows/growth.excalidraw',
      contextBundle: {
        version: '2',
        items: [
          {
            kind: 'file',
            id: 'resource:prd',
            path: 'src/resources/prd.md',
            name: 'PRD',
          },
        ],
      } as any,
      attachments: [
        { type: 'file', data: 'data:application/pdf;base64,cGRm', mimeType: 'application/pdf', filename: 'brief.pdf' },
      ],
      provider: 'codex',
      model: 'gpt-5.5',
      mode: 'fast',
      thought: 'medium',
    });

    expect(prompt).toContain('这是一次性的非交互式提示词优化任务');
    expect(prompt).toContain('不要追问用户');
    expect(prompt).toContain('只返回优化后的提示词正文');
    expect(prompt).toContain('- 生成类型：生成页面原型');
    expect(prompt).toContain('"count": 2');
    expect(prompt).toContain('src/resources/flows/growth.excalidraw');
    expect(prompt).toContain('可能尚未创建');
    expect(prompt).toContain('src/resources/prd.md');
    expect(prompt).toContain('brief.pdf');
    expect(prompt).not.toContain('当前执行选择');
    expect(prompt).not.toContain('provider');
    expect(prompt).not.toContain('model');
    expect(prompt).not.toContain('mode');
    expect(prompt).not.toContain('thought');
    expect(prompt).not.toContain('画布');
  });

  it('uses user-facing generation type labels instead of internal scene ids', () => {
    expect(buildCanvasPromptOptimizationPrompt({
      prompt: '做一个审批首页',
      scene: 'page',
      sceneSettings: {},
      contextBundle: null,
      attachments: [],
      provider: null,
      model: null,
      mode: null,
      thought: null,
    })).toContain('- 生成类型：生成页面原型');
    expect(buildCanvasPromptOptimizationPrompt({
      prompt: '生成一张登录页设计图',
      scene: 'design',
      sceneSettings: {},
      contextBundle: null,
      attachments: [],
      provider: null,
      model: null,
      mode: null,
      thought: null,
    })).toContain('- 生成类型：生成设计图或设计素材');
    expect(buildCanvasPromptOptimizationPrompt({
      prompt: '整理一份需求文档',
      scene: 'document',
      sceneSettings: {},
      contextBundle: null,
      attachments: [],
      provider: null,
      model: null,
      mode: null,
      thought: null,
    })).toContain('- 生成类型：生成文档、流程图或关系图');
  });

  it('instructs the optimizer not to duplicate structured context that will be sent with the final prompt', () => {
    const prompt = buildCanvasPromptOptimizationPrompt({
      prompt: '生成一张登录页设计图',
      scene: 'design',
      sceneSettings: {
        size: '1024x576',
        quality: 'high',
      },
      contextBundle: {
        version: '2',
        items: [
          {
            kind: 'file',
            id: 'theme:file',
            path: 'src/themes/linear/DESIGN.md',
            name: 'Linear Design',
          },
        ],
      } as any,
      attachments: [],
      provider: 'claude',
      model: null,
      mode: null,
      thought: null,
    });

    expect(prompt).toContain('这些生成类型、场景配置、上下文文件和附件会由系统在后续生成请求中一并发送');
    expect(prompt).toContain('不要在优化后的提示词里重复罗列文件路径、配置项或附件清单');
    expect(prompt).toContain('避免让后续执行 AI 读到重复上下文');
    expect(prompt).not.toContain('模型配置');
    expect(prompt).not.toContain('画布');
  });

  it('submits one direct AI run without conversation reuse and returns trimmed text', async () => {
    vi.mocked(runAiText).mockResolvedValueOnce({
      output: '\n\n优化后的提示词\n\n',
      runId: 'prompt-optimization-run',
      threadId: 'prompt-optimization-run',
    });

    const result = await optimizeCanvasPrompt({
      projectId: 'project-b',
      prompt: '做一个 CRM 首页',
      scene: 'page',
      sceneSettings: {},
      contextBundle: null,
      attachments: [],
      provider: 'codex',
      model: 'gpt-5.5',
      mode: null,
      thought: null,
      workspacePath: '/workspace/project',
      canvasFilePath: 'src/resources/flows/crm.excalidraw',
    });

    expect(result).toBe('优化后的提示词');
    expect(runAiText).toHaveBeenCalledWith(expect.objectContaining({
      scene: 'direct',
      provider: 'codex',
      model: 'gpt-5.5',
      mode: null,
      thought: null,
      conversationStorePath: undefined,
      contextBundle: null,
      context: undefined,
      targetPath: 'src/resources/flows/crm.excalidraw',
    }));
    expect(vi.mocked(runAiText).mock.calls[0]?.[0]).not.toHaveProperty('projectId', 'prompt-optimization');
    expect(vi.mocked(runAiText).mock.calls[0]?.[0]).not.toHaveProperty('builtinToolSettings');
  });

  it('rejects empty optimization output', async () => {
    vi.mocked(runAiText).mockResolvedValueOnce({
      output: '   ',
      runId: 'prompt-optimization-run',
      threadId: 'prompt-optimization-run',
    });

    await expect(optimizeCanvasPrompt({
      projectId: 'project-b',
      prompt: '做一个 CRM 首页',
      scene: 'page',
      sceneSettings: {},
      contextBundle: null,
      attachments: [],
      provider: 'codex',
      model: null,
      mode: null,
      thought: null,
    })).rejects.toThrow('提示词优化结果为空');
  });
});
