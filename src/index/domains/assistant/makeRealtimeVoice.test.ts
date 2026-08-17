import { describe, expect, it, vi } from 'vitest';
import { MakeVoiceCommentPersistenceError } from './makeVoiceCommentPersistence';
import {
  checkMakeVoiceConfiguration,
  checkMakeVoiceConfigurationAfterRuntimeReady,
  toAcpVoiceHostTools,
} from './makeRealtimeVoice';

describe('Make 实时语音宿主适配器', () => {
  it('向 ACP 传递中文标题、输入协议和确认要求', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const [tool] = toAcpVoiceHostTools([{
      name: 'axhub_make_create_comment',
      title: '新建批注',
      description: '在指定页面目标上保存一条待处理批注。',
      parameters: {
        type: 'object',
        properties: { targetRef: { type: 'string', description: '页面目标引用。' } },
      },
      risk: 'write',
      confirmation: 'required',
      execute,
    }]);

    expect(tool).toMatchObject({
      name: 'axhub_make_create_comment',
      title: '新建批注',
      description: '在指定页面目标上保存一条待处理批注。',
      inputSchema: { type: 'object' },
      requiresConfirmation: true,
    });
    const controller = new AbortController();
    await expect(tool.execute({ targetRef: 'page.1.a' }, {
      requestId: 'request-1',
      sessionId: 'session-1',
      signal: controller.signal,
      reportProgress: vi.fn(),
    })).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith({ targetRef: 'page.1.a' }, {
      callId: 'request-1',
      operationId: 'request-1',
      signal: controller.signal,
    });
  });

  it('只检查脱敏后的 Make 语音配置接口', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      settings: { doubao: { appId: 'app-1', hasAccessKey: true } },
    }), { status: 200 }));

    await expect(checkMakeVoiceConfiguration('project-1', fetchImpl)).resolves.toEqual({
      appId: 'app-1', hasAccessKey: true, ready: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/config/voice-assistant?projectId=project-1',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('access-secret');
  });

  it('启动并等待 ACP UI 就绪后才读取语音配置', async () => {
    const events: string[] = [];
    const connectRuntime = vi.fn(async () => {
      events.push('runtime-ready');
      return {
        webBaseUrl: 'http://localhost:32124',
        apiBaseUrl: 'http://localhost:32124/api',
        projectPath: '/workspace/demo',
        projectId: 'project-1',
        source: 'default',
        health: {
          status: 'ready',
          message: 'ACP UI 已就绪',
          checkedAt: '2026-08-15T00:00:00.000Z',
          commandSource: 'acp-ui',
          hints: {},
        },
      };
    });
    const fetchImpl = vi.fn(async () => {
      events.push('voice-settings');
      return new Response(JSON.stringify({
        settings: { doubao: { appId: 'app-1', hasAccessKey: true } },
      }), { status: 200 });
    });

    await expect(checkMakeVoiceConfigurationAfterRuntimeReady(
      'project-1',
      connectRuntime,
      fetchImpl,
    )).resolves.toEqual({ appId: 'app-1', hasAccessKey: true, ready: true });
    expect(events).toEqual(['runtime-ready', 'voice-settings']);
  });

  it('ACP UI 未就绪时不继续请求语音配置', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(checkMakeVoiceConfigurationAfterRuntimeReady(
      'project-1',
      async () => ({
        health: {
          status: 'runtime_unreachable',
          message: 'ACP UI 启动超时',
        },
      }),
      fetchImpl,
    )).rejects.toThrow('ACP UI 启动超时');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('把工具异常转换成可恢复的结构化结果，不把内部错误直接抛给语音层', async () => {
    const execute = vi.fn(async () => {
      throw new MakeVoiceCommentPersistenceError(
        'COMMENT_EXECUTION_NOT_FOUND',
        '未找到这条执行记录，请刷新后重试',
      );
    });
    const [tool] = toAcpVoiceHostTools([{
      name: 'axhub_make_get_comment_execution',
      title: '查看执行状态',
      description: '查看批注执行状态。',
      parameters: { type: 'object', properties: {} },
      risk: 'read',
      confirmation: 'none',
      execute,
    }]);

    await expect(tool.execute({}, {
      requestId: 'request-1',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      reportProgress: vi.fn(),
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'COMMENT_EXECUTION_NOT_FOUND',
        message: '未找到这条执行记录，请刷新后重试',
        recoverable: true,
      },
    });
  });

  it('不信任外部错误对象携带的错误码和内部路径', async () => {
    const execute = vi.fn(async () => {
      throw Object.assign(new Error('/private/secret/path'), { code: 'ENOENT' });
    });
    const [tool] = toAcpVoiceHostTools([{
      name: 'axhub_make_capture_page',
      title: '获取页面截图',
      description: '获取页面截图。',
      parameters: { type: 'object', properties: {} },
      risk: 'capture',
      confirmation: 'none',
      execute,
    }]);

    const result = await tool.execute({}, {
      requestId: 'request-1',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      reportProgress: vi.fn(),
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: '工具暂时无法完成，请根据当前页面状态重试',
        recoverable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain('/private/secret/path');
    expect(JSON.stringify(result)).not.toContain('ENOENT');
  });
});
