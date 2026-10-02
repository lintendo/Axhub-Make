import type { AcpVoiceHostTool } from '@axhub/acp/voice';

import type { CanvasWorkClient } from './canvasWorkClient';

export interface CanvasVoiceToolDependencies {
  client: CanvasWorkClient;
}

function text(value: unknown, maximum = 8_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function required(input: Record<string, unknown>, field: string, message: string, maximum = 8_000): string {
  const value = text(input[field], maximum);
  if (!value) {
    const error = new Error(message) as Error & { code?: string };
    error.code = 'INVALID_ASSISTANT_WORK_REQUEST';
    throw error;
  }
  return value;
}

function operationId(value: unknown, fallback: unknown, prefix: string): string {
  return text(value, 256) || text(fallback, 256) || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  execute: AcpVoiceHostTool['execute'],
  requiredFields: string[] = [],
): AcpVoiceHostTool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      ...(requiredFields.length ? { required: requiredFields } : {}),
      additionalProperties: false,
    } as AcpVoiceHostTool['inputSchema'],
    requiresConfirmation: false,
    execute,
  };
}

export function createCanvasVoiceTools(dependencies: CanvasVoiceToolDependencies): AcpVoiceHostTool[] {
  return [
    tool(
      'axhub_make_get_canvas_context',
      '读取当前项目、画布路径、连接状态、脏状态和持久化 sceneRevision。',
      {},
      () => dependencies.client.getContext(),
    ),
    tool(
      'axhub_make_capture_canvas',
      '获取当前画布的安全截图，用于回答当前画布问题；不会创建任务。',
      { scope: { type: 'string', enum: ['viewport', 'selection', 'elements', 'rect', 'full'] } },
      (input) => dependencies.client.capture(record(input)),
    ),
    tool(
      'axhub_make_focus_canvas',
      '聚焦画布中的元素或区域，只改变视口，不持久修改场景。',
      { target: { type: 'object' }, elementIds: { type: 'array', items: { type: 'string' } } },
      (input) => dependencies.client.focus(record(input)),
    ),
    tool(
      'axhub_make_submit_canvas_work',
      '提交一个持久 Canvas AI 任务。只有用户明确要求执行修改时才调用；预览、解释和查询不能调用。',
      {
        objective: { type: 'string', description: '用户明确要求执行的画布修改目标。' },
        baseRevision: { type: 'string', description: 'get_canvas_context 返回的 sceneRevision。' },
        operationId: { type: 'string', description: '当前提交的幂等操作 ID。' },
      },
      async (input, context) => {
        const values = record(input);
        const objective = required(values, 'objective', '请先提供明确的画布修改目标。');
        const current = await dependencies.client.getContext();
        if (current.dirty) {
          const error = new Error('当前画布有未保存修改，请先保存后再提交任务。') as Error & { code?: string };
          error.code = 'CANVAS_UNSAVED';
          throw error;
        }
        return dependencies.client.submit({
          objective,
          baseRevision: required(values, 'baseRevision', '缺少当前画布 revision。', 256) || current.sceneRevision || '',
          operationId: operationId(values.operationId, context.requestId, 'canvas-submit'),
        });
      },
    ),
    tool(
      'axhub_make_list_canvas_work',
      '分页列出当前画布的 Canvas AI 任务及其状态。',
      { cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
      (input) => {
        const values = record(input);
        const rawLimit = Number(values.limit);
        return dependencies.client.list({
          ...(text(values.cursor, 256) ? { cursor: text(values.cursor, 256) } : {}),
          ...(Number.isFinite(rawLimit) ? { limit: Math.max(1, Math.min(50, Math.floor(rawLimit))) } : {}),
        });
      },
    ),
    tool(
      'axhub_make_get_canvas_work',
      '查询当前画布的单个任务和最新用户可读摘要。',
      { workId: { type: 'string' } },
      (input) => dependencies.client.get(required(record(input), 'workId', '请提供 Work ID。', 256)),
      ['workId'],
    ),
    tool(
      'axhub_make_follow_up_canvas_work',
      '在原 Canvas Work Thread 上追加一条要求；运行中最多排队一条跟进。',
      {
        workId: { type: 'string' },
        content: { type: 'string' },
        baseRevision: { type: 'string' },
        operationId: { type: 'string' },
      },
      async (input, context) => {
        const values = record(input);
        return dependencies.client.followUp(
          required(values, 'workId', '请提供 Work ID。', 256),
          {
            content: required(values, 'content', '请提供要追加的要求。', 4_000),
            baseRevision: required(values, 'baseRevision', '缺少当前画布 revision。', 256),
            operationId: operationId(values.operationId, context.requestId, 'canvas-follow-up'),
          },
        );
      },
      ['workId', 'content', 'baseRevision'],
    ),
    tool(
      'axhub_make_cancel_canvas_work',
      '取消指定 Canvas Work 的当前运行或排队任务；已终止任务保持原结果。',
      { workId: { type: 'string' }, operationId: { type: 'string' } },
      (input, context) => {
        const values = record(input);
        return dependencies.client.cancel(
          required(values, 'workId', '请提供 Work ID。', 256),
          operationId(values.operationId, context.requestId, 'canvas-cancel'),
        );
      },
      ['workId'],
    ),
  ];
}
