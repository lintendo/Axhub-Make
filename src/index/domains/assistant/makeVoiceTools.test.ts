import { describe, expect, it, vi } from 'vitest';

import {
  MakeVoiceToolError,
  createMakeVoiceToolRegistry,
  type MakeVoiceToolDependencies,
  type MakeVoiceToolExecutionContext,
} from './makeVoiceTools';
import { toAcpVoiceHostTools } from './makeRealtimeVoice';

const target = {
  targetRef: 'page.4.a1',
  label: '提交按钮',
  textExcerpt: '提交申请',
  tagName: 'button',
  role: 'button',
  path: 'main > form > button',
  childCount: 1,
};

const scope = {
  scope: {
    targetPath: 'prototypes/home',
    prototypeId: 'home',
    pageScope: 'page-1',
  },
  adapter: { read: vi.fn(), write: vi.fn() },
};

function createDependencies(overrides: Partial<MakeVoiceToolDependencies> = {}) {
  const dependencies: MakeVoiceToolDependencies = {
    commentary: {
      getVoiceTargets: vi.fn(async () => ({
        selected: { ...target, locator: { selectors: ['#secret'] } },
        hovered: { ...target, targetRef: 'page.4.b2', label: '悬停按钮' },
        preferred: { ...target, targetRef: 'page.4.b2', label: '桥接误报的优先项' },
      })),
      findVoiceElements: vi.fn(async () => ({
        elements: [{ ...target, elementKey: 'internal-key' }],
        nextCursor: 'elements:20',
      })),
      getVoiceElementStructure: vi.fn(async () => ({
        elements: [{ ...target, selector: '#secret' }],
        nextCursor: 'structure:30',
      })),
      activateVoiceElement: vi.fn(async (targetRef: string) => ({ activated: true, targetRef })),
      createVoiceComment: vi.fn(async (targetRef: string) => ({
        applied: true as const,
        targetRef,
        commentId: 'comment-created',
        target: { ...target, targetRef, locator: { fingerprint: 'private' } },
      })),
      refreshPersistedComments: vi.fn(async () => undefined),
    },
    page: {
      url: 'https://make.local/prototypes/home',
      title: '首页',
      capture: vi.fn(async ({ scope: captureScope }) => ({
        screenshotUrl: `https://make.local/captures/${captureScope}.png`,
        path: '/private/project/capture.png',
        absoluteFilePath: '/private/capture.png',
        dataUrl: 'data:image/png;base64,private',
        width: 1280,
        height: 800,
        mimeType: 'image/png',
      })),
    },
    comments: {
      getScope: vi.fn(() => scope),
      read: vi.fn(async () => ({ comments: [] })),
      getCreatedByOperationId: vi.fn(async () => null),
      create: vi.fn(async ({ content, linkedAnnotationId }) => ({
        commentId: 'comment-created',
        content,
        status: '待处理' as const,
        target,
        source: linkedAnnotationId ? '关联标注' as const : '普通批注' as const,
        ...(linkedAnnotationId ? { linkedAnnotationId } : {}),
      })),
      list: vi.fn(async () => ({
        comments: [{
          commentId: 'comment-1',
          content: '调整按钮颜色',
          status: '执行中' as const,
          target: { ...target, locator: { selectors: ['#secret'] } },
          source: '关联标注' as const,
          linkedAnnotationId: 'annotation-1',
          latestExecution: {
            executionId: 'execution-1', status: '执行中' as const, phase: 'running' as const,
          },
        }],
        total: 1,
        nextCursor: 'comments:20',
      })),
      submitCommentExecution: vi.fn(async ({ commentId }) => ({
        executionId: 'execution-1',
        commentId,
        status: '执行中' as const,
        phase: 'running' as const,
      })),
      getExecution: vi.fn(async ({ executionId }) => ({
        executionId,
        commentId: 'comment-1',
        status: '已完成' as const,
        commentStatus: '已完成' as const,
        phase: 'completed' as const,
      })),
      cancelExecution: vi.fn(async ({ executionId }) => ({
        executionId,
        commentId: 'comment-1',
        status: '已取消' as const,
        phase: 'cancelled' as const,
      })),
      delete: vi.fn(async ({ commentId }) => ({ commentId, deleted: true })),
    },
    ...overrides,
  };
  return dependencies;
}

function getTool(dependencies: MakeVoiceToolDependencies, name: string) {
  const tool = createMakeVoiceToolRegistry(dependencies).find((entry) => entry.name === name);
  if (!tool) throw new Error(`缺少工具：${name}`);
  return tool;
}

const context: MakeVoiceToolExecutionContext = {
  callId: 'call-1',
  operationId: 'operation-1',
  signal: new AbortController().signal,
};

function schemaProperties(tool: ReturnType<typeof getTool>): Record<string, any> {
  return (tool.parameters.properties ?? {}) as Record<string, any>;
}

describe('Make 页面批注工具注册表', () => {
  it('严格按协议暴露 12 个无需程序化确认的中文工具', () => {
    const registry = createMakeVoiceToolRegistry(createDependencies());

    expect(registry.map((tool) => tool.name)).toEqual([
      'axhub_make_capture_page',
      'axhub_make_get_page_target',
      'axhub_make_find_page_elements',
      'axhub_make_get_page_structure',
      'axhub_make_activate_page_element',
      'axhub_make_create_comment',
      'axhub_make_apply_page_change',
      'axhub_make_list_comments',
      'axhub_make_execute_comment',
      'axhub_make_get_comment_execution',
      'axhub_make_cancel_comment_execution',
      'axhub_make_delete_comment',
    ]);
    expect(registry.map((tool) => [tool.name, tool.risk, tool.confirmation])).toEqual([
      ['axhub_make_capture_page', 'capture', 'none'],
      ['axhub_make_get_page_target', 'read', 'none'],
      ['axhub_make_find_page_elements', 'read', 'none'],
      ['axhub_make_get_page_structure', 'read', 'none'],
      ['axhub_make_activate_page_element', 'write', 'none'],
      ['axhub_make_create_comment', 'write', 'none'],
      ['axhub_make_apply_page_change', 'write', 'none'],
      ['axhub_make_list_comments', 'read', 'none'],
      ['axhub_make_execute_comment', 'write', 'none'],
      ['axhub_make_get_comment_execution', 'read', 'none'],
      ['axhub_make_cancel_comment_execution', 'destructive', 'none'],
      ['axhub_make_delete_comment', 'destructive', 'none'],
    ]);
    expect(toAcpVoiceHostTools(registry).every((tool) => tool.requiresConfirmation === false)).toBe(true);

    expect(getTool(createDependencies(), 'axhub_make_apply_page_change').description)
      .toContain('创建批注并立即执行');
    expect(getTool(createDependencies(), 'axhub_make_list_comments').description)
      .toContain('当前资源全部匹配批注');
    expect(getTool(createDependencies(), 'axhub_make_capture_page').description)
      .toContain('不包含图像内容');
    expect(getTool(createDependencies(), 'axhub_make_execute_comment').description)
      .toContain('用户明确要求执行');
    expect(getTool(createDependencies(), 'axhub_make_cancel_comment_execution').description)
      .toContain('用户明确要求取消');
    expect(getTool(createDependencies(), 'axhub_make_delete_comment').description)
      .toContain('用户明确要求删除');

    for (const tool of registry) {
      expect(tool.title).toMatch(/[\u3400-\u9fff]/u);
      expect(tool.description).toMatch(/[\u3400-\u9fff]/u);
      expect(tool.title).not.toMatch(/annotation|task/iu);
      expect(tool.description).not.toMatch(/annotation|task/iu);
      for (const property of Object.values(schemaProperties(tool))) {
        expect(property.description).toMatch(/[\u3400-\u9fff]/u);
      }
    }
  });

  it('传递页面截图范围，且默认只截取当前视图', async () => {
    const dependencies = createDependencies();
    const tool = getTool(dependencies, 'axhub_make_capture_page');

    expect(schemaProperties(tool).scope).toMatchObject({
      enum: ['viewport', 'full-page'],
      default: 'viewport',
    });
    await expect(tool.execute({}, context)).resolves.toEqual({
      page: { url: 'https://make.local/prototypes/home', title: '首页' },
      scope: 'viewport',
      screenshot: {
        width: 1280,
        height: 800,
        mimeType: 'image/png',
      },
    });
    await tool.execute({ scope: 'full-page' }, context);
    expect(dependencies.page.capture).toHaveBeenNthCalledWith(1, expect.objectContaining({ scope: 'viewport' }));
    expect(dependencies.page.capture).toHaveBeenNthCalledWith(2, expect.objectContaining({ scope: 'full-page' }));
    expect(JSON.stringify(await tool.execute({}, context))).not.toMatch(/path|private/iu);
  });

  it('不把非结构化截图引用当作可供模型使用的资源返回', async () => {
    const dependencies = createDependencies({
      page: {
        url: 'https://make.local/prototypes/home',
        title: '首页',
        capture: vi.fn(async () => '/private/project/capture.png'),
      },
    });

    await expect(getTool(dependencies, 'axhub_make_capture_page').execute({}, context)).resolves.toEqual({
      page: { url: 'https://make.local/prototypes/home', title: '首页' },
      scope: 'viewport',
      screenshot: null,
    });
  });

  it('同时返回选中、悬停和优先目标，并过滤内部定位字段', async () => {
    const dependencies = createDependencies();
    const result = await getTool(dependencies, 'axhub_make_get_page_target').execute({}, context);

    expect(result).toEqual({
      selected: target,
      hovered: { ...target, targetRef: 'page.4.b2', label: '悬停按钮' },
      preferred: target,
    });
    expect(JSON.stringify(result)).not.toMatch(/locator|selector|elementKey|fingerprint/iu);
  });

  it('按文案、语义和父级查找元素，默认限制 20 项并保留分页游标', async () => {
    const dependencies = createDependencies();
    const tool = getTool(dependencies, 'axhub_make_find_page_elements');
    const result = await tool.execute({
      text: '提交',
      role: 'button',
      tagName: 'button',
      parentTargetRef: 'page.4.parent',
      cursor: 'elements:0',
    }, context);

    expect(dependencies.commentary.findVoiceElements).toHaveBeenCalledWith({
      text: '提交', role: 'button', tagName: 'button', parentTargetRef: 'page.4.parent',
      cursor: 'elements:0', limit: 20,
    });
    expect(result).toEqual({ elements: [target], nextCursor: 'elements:20' });
    expect(JSON.stringify(result)).not.toMatch(/locator|selector|elementKey/iu);
  });

  it('分页读取页面结构，默认限制 30 个节点', async () => {
    const dependencies = createDependencies();
    const result = await getTool(dependencies, 'axhub_make_get_page_structure').execute({
      targetRef: 'page.4.parent', depth: 2, cursor: 'structure:0',
    }, context);

    expect(dependencies.commentary.getVoiceElementStructure).toHaveBeenCalledWith({
      targetRef: 'page.4.parent', depth: 2, cursor: 'structure:0', limit: 30,
    });
    expect(result).toEqual({ elements: [target], nextCursor: 'structure:30' });
    expect(JSON.stringify(result)).not.toMatch(/locator|selector/iu);
  });

  it('只用目标引用激活页面元素', async () => {
    const dependencies = createDependencies();

    await expect(getTool(dependencies, 'axhub_make_activate_page_element').execute({
      targetRef: target.targetRef,
    }, context)).resolves.toEqual({ activated: true, targetRef: target.targetRef });
    expect(dependencies.commentary.activateVoiceElement).toHaveBeenCalledWith(target.targetRef);
  });

  it('不把页面运行时返回的任意错误文本提升为可信工具错误', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.commentary.activateVoiceElement).mockResolvedValueOnce({
      activated: false,
      error: '/private/secret/selector',
    });
    await expect(getTool(dependencies, 'axhub_make_activate_page_element').execute({
      targetRef: target.targetRef,
    }, context)).resolves.toEqual({
      ok: false,
      activated: false,
      targetRef: target.targetRef,
      error: {
        code: 'PAGE_TARGET_STALE',
        message: '页面已变化，请重新查找',
        recoverable: true,
      },
    });

    vi.mocked(dependencies.commentary.createVoiceComment).mockResolvedValueOnce({
      applied: false,
      error: '/private/secret/comment-runtime',
    });
    await expect(getTool(dependencies, 'axhub_make_create_comment').execute({
      targetRef: target.targetRef,
      content: '修改按钮',
    }, context)).rejects.toMatchObject({
      code: 'COMMENT_CREATE_FAILED',
      message: '批注保存失败，页面可能已变化，请重新查找',
    });
  });

  it('先由页面运行时创建批注，再用真实批注 ID 补全持久化记录', async () => {
    const dependencies = createDependencies();
    const result = await getTool(dependencies, 'axhub_make_create_comment').execute({
      targetRef: target.targetRef,
      content: '提高按钮对比度',
      linkedAnnotationId: 'annotation-1',
    }, context);

    expect(dependencies.commentary.createVoiceComment).toHaveBeenCalledWith(
      target.targetRef,
      '提高按钮对比度',
      { anchorPlacement: 'target', operationId: 'operation-1' },
    );
    expect(dependencies.comments.create).toHaveBeenCalledWith({
      runtimeComment: { commentId: 'comment-created', targetRef: target.targetRef },
      content: '提高按钮对比度',
      linkedAnnotationId: 'annotation-1',
      target,
      scope,
      operationId: 'operation-1',
      callId: 'call-1',
      signal: context.signal,
    });
    expect(result).toEqual({
      comment: {
        commentId: 'comment-created', content: '提高按钮对比度', status: '待处理', target,
        source: '关联标注', linkedAnnotationId: 'annotation-1',
      },
      nextAction: '批注已保存；只有用户明确要求页面修改时才执行这条批注',
    });
    expect(dependencies.commentary.refreshPersistedComments).toHaveBeenCalledOnce();
  });

  it('直接修改组合工具在同一操作中创建并执行，不等待确认', async () => {
    const dependencies = createDependencies();
    const result = await getTool(dependencies, 'axhub_make_apply_page_change').execute({
      targetRef: target.targetRef,
      content: '提高按钮对比度',
    }, context);

    expect(dependencies.commentary.createVoiceComment).toHaveBeenCalledWith(
      target.targetRef,
      '提高按钮对比度',
      { anchorPlacement: 'target', operationId: 'operation-1' },
    );
    expect(dependencies.comments.submitCommentExecution).toHaveBeenCalledWith({
      commentId: 'comment-created',
      scope,
      operationId: 'operation-1',
      signal: context.signal,
    });
    expect(result).toEqual({
      action: 'create_and_execute',
      comment: {
        commentId: 'comment-created', content: '提高按钮对比度', status: '待处理', target,
        source: '普通批注',
      },
      execution: {
        executionId: 'execution-1', commentId: 'comment-created', status: '执行中', phase: 'running',
      },
    });
  });

  it('组合工具执行失败时保留已创建批注的真实 ID 和恢复信息', async () => {
    const dependencies = createDependencies();
    const executeError = new MakeVoiceToolError(
      'COMMENT_TARGET_STALE',
      '页面已变化，请重新查找并新建批注',
    );
    vi.mocked(dependencies.comments.submitCommentExecution).mockRejectedValueOnce(executeError);

    await expect(getTool(dependencies, 'axhub_make_apply_page_change').execute({
      targetRef: target.targetRef,
      content: '提高按钮对比度',
    }, context)).resolves.toEqual({
      ok: false,
      action: 'create_and_execute',
      stage: 'execute',
      comment: expect.objectContaining({ commentId: 'comment-created' }),
      error: {
        code: 'COMMENT_TARGET_STALE',
        message: '页面已变化，请重新查找并新建批注',
        recoverable: true,
      },
    });
  });

  it('刷新页面标记失败时保留已提交批注并继续执行页面修改', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.commentary.refreshPersistedComments!).mockRejectedValue(
      new Error('refresh failed'),
    );

    await expect(getTool(dependencies, 'axhub_make_apply_page_change').execute({
      targetRef: target.targetRef,
      content: '提高按钮对比度',
    }, context)).resolves.toMatchObject({
      comment: { commentId: 'comment-created' },
      execution: { executionId: 'execution-1', phase: 'running' },
    });
    expect(dependencies.comments.submitCommentExecution).toHaveBeenCalledOnce();
  });

  it('uses the operation id to avoid creating a second runtime comment on retry', async () => {
    const dependencies = createDependencies();
    const tool = getTool(dependencies, 'axhub_make_create_comment');
    const input = { targetRef: target.targetRef, content: '提高按钮对比度' };

    const first = await tool.execute(input, context);
    vi.mocked(dependencies.comments.getCreatedByOperationId).mockResolvedValueOnce(
      (first as any).comment,
    );
    const second = await tool.execute(input, context);

    expect(second).toEqual(first);
    expect(dependencies.commentary.createVoiceComment).toHaveBeenCalledTimes(1);
  });

  it('reuses the runtime comment when enrichment fails and the same operation retries', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.comments.create)
      .mockRejectedValueOnce(new Error('temporary persistence failure'));
    const tool = getTool(dependencies, 'axhub_make_create_comment');
    const input = { targetRef: target.targetRef, content: '提高按钮对比度' };

    await expect(tool.execute(input, context)).rejects.toThrow('temporary persistence failure');
    await expect(tool.execute(input, context)).resolves.toMatchObject({
      comment: { commentId: 'comment-created' },
    });
    expect(dependencies.commentary.createVoiceComment).toHaveBeenCalledTimes(1);
  });

  it('查询当前资源全部匹配批注并在工具内部取完所有分页', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.comments.list)
      .mockResolvedValueOnce({
        comments: [{
          commentId: 'comment-1', content: '调整按钮颜色', status: '执行中', target,
          source: '关联标注', linkedAnnotationId: 'annotation-1',
          latestExecution: { executionId: 'execution-1', status: '执行中', phase: 'running' },
        }],
        total: 2,
        nextCursor: 'comments:1',
      })
      .mockResolvedValueOnce({
        comments: [{
          commentId: 'comment-2', content: '增加按钮间距', status: '待处理', target,
          source: '普通批注',
        }],
        total: 2,
        nextCursor: null,
      });
    const result = await getTool(dependencies, 'axhub_make_list_comments').execute({
      keyword: '按钮', linkedAnnotationId: 'annotation-1',
    }, context);

    expect(dependencies.comments.list).toHaveBeenNthCalledWith(1, {
      scope, keyword: '按钮', linkedAnnotationId: 'annotation-1', limit: 50,
      signal: context.signal,
    });
    expect(dependencies.comments.list).toHaveBeenNthCalledWith(2, {
      scope, keyword: '按钮', linkedAnnotationId: 'annotation-1', limit: 50,
      cursor: 'comments:1', signal: context.signal,
    });
    expect(result).toEqual({
      comments: [{
        commentId: 'comment-1', content: '调整按钮颜色', status: '执行中', target,
        source: '关联标注', linkedAnnotationId: 'annotation-1',
        latestExecution: { executionId: 'execution-1', status: '执行中', phase: 'running' },
      }, {
        commentId: 'comment-2', content: '增加按钮间距', status: '待处理', target,
        source: '普通批注',
      }],
      total: 2,
    });
    expect(schemaProperties(getTool(dependencies, 'axhub_make_list_comments'))).not.toHaveProperty('limit');
    expect(schemaProperties(getTool(dependencies, 'axhub_make_list_comments'))).not.toHaveProperty('cursor');
    expect(JSON.stringify(result)).not.toMatch(/locator|selector/iu);
  });

  it('执行工具只接受批注 ID，并投影执行、查询与取消状态', async () => {
    const dependencies = createDependencies();

    await expect(getTool(dependencies, 'axhub_make_execute_comment').execute({ commentId: 'comment-1' }, context))
      .resolves.toEqual({
        executionId: 'execution-1', commentId: 'comment-1', status: '执行中', phase: 'running',
      });
    expect(dependencies.comments.submitCommentExecution).toHaveBeenCalledWith({
      commentId: 'comment-1', scope, operationId: 'operation-1', signal: context.signal,
    });
    expect(schemaProperties(getTool(dependencies, 'axhub_make_execute_comment'))).toEqual({
      commentId: expect.any(Object),
    });

    await expect(getTool(dependencies, 'axhub_make_get_comment_execution').execute({ executionId: 'execution-1' }, context))
      .resolves.toEqual({
        executionId: 'execution-1', commentId: 'comment-1', status: '已完成',
        commentStatus: '已完成', phase: 'completed',
      });
    await expect(getTool(dependencies, 'axhub_make_cancel_comment_execution').execute({ executionId: 'execution-1' }, context))
      .resolves.toEqual({
        executionId: 'execution-1', commentId: 'comment-1', status: '已取消', phase: 'cancelled',
      });
    expect(dependencies.comments.cancelExecution).toHaveBeenCalledWith(expect.objectContaining({
      executionId: 'execution-1', operationId: 'operation-1', scope,
    }));
  });

  it('按批注 ID 删除并刷新页面标记', async () => {
    const dependencies = createDependencies();

    await expect(getTool(dependencies, 'axhub_make_delete_comment').execute({ commentId: 'comment-1' }, context))
      .resolves.toEqual({ commentId: 'comment-1', deleted: true });
    expect(dependencies.comments.delete).toHaveBeenCalledWith({
      commentId: 'comment-1', scope, operationId: 'operation-1', callId: 'call-1', signal: context.signal,
    });
    expect(dependencies.commentary.refreshPersistedComments).toHaveBeenCalledWith(['comment-1']);
  });

  it('用稳定错误码和中文信息拒绝缺失字段及非法范围', async () => {
    const dependencies = createDependencies();
    const cases: Array<[string, unknown, string]> = [
      ['axhub_make_capture_page', { scope: 'element' }, 'INVALID_CAPTURE_SCOPE'],
      ['axhub_make_activate_page_element', {}, 'MISSING_TARGET_REF'],
      ['axhub_make_create_comment', { content: '缺少目标' }, 'MISSING_TARGET_REF'],
      ['axhub_make_create_comment', { targetRef: target.targetRef }, 'MISSING_COMMENT_CONTENT'],
      ['axhub_make_execute_comment', {}, 'MISSING_COMMENT_ID'],
      ['axhub_make_get_comment_execution', {}, 'MISSING_EXECUTION_ID'],
      ['axhub_make_cancel_comment_execution', {}, 'MISSING_EXECUTION_ID'],
      ['axhub_make_delete_comment', {}, 'MISSING_COMMENT_ID'],
    ];

    for (const [name, input, code] of cases) {
      await expect(getTool(dependencies, name).execute(input, context)).rejects.toMatchObject({
        code,
        message: expect.stringMatching(/[\u3400-\u9fff]/u),
      });
    }
    expect(dependencies.commentary.createVoiceComment).not.toHaveBeenCalled();
    expect(dependencies.comments.submitCommentExecution).not.toHaveBeenCalled();
    expect(dependencies.comments.cancelExecution).not.toHaveBeenCalled();
    expect(dependencies.comments.delete).not.toHaveBeenCalled();
  });

  it('写操作缺少 operationId 时不调用宿主写入路径', async () => {
    const dependencies = createDependencies();
    const invalidContext = { ...context, operationId: ' ' };

    await expect(getTool(dependencies, 'axhub_make_create_comment').execute({
      targetRef: target.targetRef, content: '调整按钮',
    }, invalidContext)).rejects.toMatchObject({ code: 'MISSING_OPERATION_ID' });
    await expect(getTool(dependencies, 'axhub_make_execute_comment').execute({
      commentId: 'comment-1',
    }, invalidContext)).rejects.toMatchObject({ code: 'MISSING_OPERATION_ID' });

    expect(dependencies.commentary.createVoiceComment).not.toHaveBeenCalled();
    expect(dependencies.comments.submitCommentExecution).not.toHaveBeenCalled();
  });
});
