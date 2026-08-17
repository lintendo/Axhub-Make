import {
  MakeVoiceCommentPersistenceError,
  type MakeVoiceCommentOperations,
  type MakeVoiceExecutionPhase,
  type MakeVoiceCommentStatus,
  type MakeVoiceCommentSummary,
  type MakeVoicePageElementSummary,
} from './makeVoiceCommentPersistence';

/** The execution context supplied by the ACP UI voice surface. */
export interface MakeVoiceToolExecutionContext {
  callId: string;
  operationId: string;
  signal: AbortSignal;
}

export type MakeVoiceToolRisk = 'read' | 'capture' | 'write' | 'destructive';

export interface MakeVoiceToolDefinition {
  name: string;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  risk: MakeVoiceToolRisk;
  confirmation: 'none' | 'required';
}

export interface MakeVoiceToolRegistration extends MakeVoiceToolDefinition {
  execute: (input: unknown, context: MakeVoiceToolExecutionContext) => Promise<unknown>;
}

export interface MakeVoiceCommentaryApi {
  getVoiceTargets: () => unknown | Promise<unknown>;
  findVoiceElements: (query: Record<string, unknown>) => unknown | Promise<unknown>;
  getVoiceElementStructure: (query: Record<string, unknown>) => unknown | Promise<unknown>;
  activateVoiceElement: (targetRef: string) => unknown | Promise<unknown>;
  createVoiceComment: (
    targetRef: string,
    content: string,
    options: { anchorPlacement: 'target'; operationId: string },
  ) => unknown | Promise<unknown>;
  /** Refresh host-persisted comments and their markers after a write. */
  refreshPersistedComments?: (deletedCommentIds?: readonly string[]) => void | Promise<void>;
}

export interface MakeVoicePageCaptureInput extends MakeVoiceToolExecutionContext {
  page: { url: string; title: string };
  scope: 'viewport' | 'full-page';
}

export interface MakeVoicePageContext {
  url: string | (() => string);
  title: string | (() => string);
  capture: (input: MakeVoicePageCaptureInput) => unknown | Promise<unknown>;
}

export interface MakeVoiceToolDependencies {
  commentary: MakeVoiceCommentaryApi;
  page: MakeVoicePageContext;
  comments: MakeVoiceCommentOperations;
  /** Host resource metadata stays optional and never exposes page DOM data. */
  resource?: () => {
    kind: string;
    id?: string;
    path?: string;
    url?: string;
    meta?: Record<string, unknown>;
  } | null;
}

export class MakeVoiceToolError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'MakeVoiceToolError';
    this.code = code;
    this.details = details;
  }
}

const MAX_TEXT_LENGTH = 512;
const MAX_URL_LENGTH = 2048;
const COMMENT_STATUSES: readonly MakeVoiceCommentStatus[] = [
  '待处理', '执行中', '已完成', '执行失败', '已取消',
];

function boundedText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function recoverableToolFailure(error: unknown): {
  code: string;
  message: string;
  recoverable: boolean;
} {
  const trusted = error instanceof MakeVoiceToolError
    || error instanceof MakeVoiceCommentPersistenceError;
  const code = trusted ? error.code : 'TOOL_EXECUTION_FAILED';
  return {
    code,
    message: trusted
      ? boundedText(error.message)
      : '工具暂时无法完成，请根据当前页面状态重试',
    recoverable: error instanceof MakeVoiceCommentPersistenceError
      ? error.recoverable
      : true,
  };
}

function inputRecord(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function requiredString(
  input: Record<string, unknown>,
  field: string,
  code: string,
  message: string,
): string {
  const value = typeof input[field] === 'string' ? boundedText(input[field]) : '';
  if (!value) throw new MakeVoiceToolError(code, message);
  return value;
}

function optionalString(input: Record<string, unknown>, field: string): string | undefined {
  if (typeof input[field] !== 'string') return undefined;
  return boundedText(input[field]) || undefined;
}

function optionalInteger(
  input: Record<string, unknown>,
  field: string,
  fallback: number,
  maximum: number,
): number {
  const value = Number(input[field]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(value)));
}

function optionalDepth(input: Record<string, unknown>): number | undefined {
  if (typeof input.depth === 'undefined') return undefined;
  const value = Number(input.depth);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(10, Math.max(0, Math.floor(value)));
}

function requiredOperationId(context: MakeVoiceToolExecutionContext): string {
  const operationId = boundedText(context.operationId);
  if (!operationId) {
    throw new MakeVoiceToolError('MISSING_OPERATION_ID', '当前写操作缺少操作 ID，请重新发起');
  }
  return operationId;
}

function resolveScope(dependencies: MakeVoiceToolDependencies): unknown {
  const scope = dependencies.comments.getScope();
  if (scope === null || typeof scope === 'undefined') {
    throw new MakeVoiceToolError('COMMENT_CONTEXT_UNAVAILABLE', '当前页面暂时无法读取批注，请刷新后重试');
  }
  return scope;
}

function pageValue(value: string | (() => string)): string {
  return boundedText(typeof value === 'function' ? value() : value, MAX_URL_LENGTH);
}

function safePageElement(value: unknown): MakeVoicePageElementSummary | null {
  if (!isRecord(value)) return null;
  const targetRef = boundedText(value.targetRef);
  if (!targetRef) return null;
  return {
    targetRef,
    label: boundedText(value.label),
    textExcerpt: boundedText(value.textExcerpt, 120),
    tagName: boundedText(value.tagName, 64).toLowerCase(),
    role: typeof value.role === 'string' && boundedText(value.role, 64)
      ? boundedText(value.role, 64)
      : null,
    path: boundedText(value.path),
    childCount: Number.isFinite(Number(value.childCount))
      ? Math.max(0, Math.floor(Number(value.childCount)))
      : 0,
  };
}

function safePageElements(value: unknown): {
  elements: MakeVoicePageElementSummary[];
  nextCursor: string | null;
} {
  const record = isRecord(value) ? value : {};
  const elements = Array.isArray(record.elements)
    ? record.elements.slice(0, 100).map(safePageElement).filter((entry): entry is MakeVoicePageElementSummary => Boolean(entry))
    : [];
  return {
    elements,
    nextCursor: typeof record.nextCursor === 'string' && boundedText(record.nextCursor)
      ? boundedText(record.nextCursor)
      : null,
  };
}

function safeComment(value: unknown): MakeVoiceCommentSummary | null {
  if (!isRecord(value)) return null;
  const commentId = boundedText(value.commentId);
  const target = safePageElement(value.target);
  if (!commentId || !target) return null;
  const status = COMMENT_STATUSES.includes(value.status as MakeVoiceCommentStatus)
    ? value.status as MakeVoiceCommentStatus
    : '待处理';
  const linkedAnnotationId = boundedText(value.linkedAnnotationId);
  const latest = isRecord(value.latestExecution)
    && boundedText(value.latestExecution.executionId)
    && COMMENT_STATUSES.includes(value.latestExecution.status as MakeVoiceCommentStatus)
    && ['accepted', 'running', 'completed', 'failed', 'cancelled'].includes(
      boundedText(value.latestExecution.phase),
    )
      ? {
          executionId: boundedText(value.latestExecution.executionId),
          status: value.latestExecution.status as MakeVoiceCommentStatus,
          phase: boundedText(value.latestExecution.phase) as MakeVoiceExecutionPhase,
        }
      : undefined;
  return {
    commentId,
    content: boundedText(value.content),
    status,
    target,
    source: value.source === '关联标注' ? '关联标注' : '普通批注',
    ...(linkedAnnotationId ? { linkedAnnotationId } : {}),
    ...(latest ? { latestExecution: latest } : {}),
  };
}

function safeExecution(value: unknown, includeCommentStatus = false): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  const executionId = boundedText(record.executionId);
  const commentId = boundedText(record.commentId);
  const status = COMMENT_STATUSES.includes(record.status as MakeVoiceCommentStatus)
    ? record.status as MakeVoiceCommentStatus
    : null;
  const phases: readonly MakeVoiceExecutionPhase[] = [
    'accepted', 'running', 'completed', 'failed', 'cancelled',
  ];
  const phase = phases.includes(record.phase as MakeVoiceExecutionPhase)
    ? record.phase as MakeVoiceExecutionPhase
    : null;
  if (!executionId || !commentId || !status || !phase) {
    throw new MakeVoiceToolError(
      'INVALID_EXECUTION_RESULT',
      '执行系统返回了不完整的记录，请重新查询批注状态',
    );
  }
  const result: Record<string, unknown> = {
    executionId,
    commentId,
    status,
    phase,
  };
  if (includeCommentStatus) {
    result.commentStatus = COMMENT_STATUSES.includes(record.commentStatus as MakeVoiceCommentStatus)
      ? record.commentStatus
      : result.status;
  }
  return result;
}

async function refreshPersistedCommentsBestEffort(
  refresh: MakeVoiceCommentaryApi['refreshPersistedComments'],
  deletedCommentIds?: readonly string[],
): Promise<void> {
  try {
    await refresh?.(deletedCommentIds);
  } catch {
    // Persistence is authoritative; a marker refresh must not turn a committed write into a failure.
  }
}

function normalizeCaptureResult(value: unknown): unknown {
  if (!isRecord(value)) return null;
  const result: Record<string, unknown> = {};
  if ('width' in value && Number.isFinite(Number(value.width))) result.width = Number(value.width);
  if ('height' in value && Number.isFinite(Number(value.height))) result.height = Number(value.height);
  if ('mimeType' in value) result.mimeType = boundedText(value.mimeType, 128);
  return result;
}

function createTool(
  definition: Omit<MakeVoiceToolDefinition, 'confirmation'> & {
    confirmation?: MakeVoiceToolDefinition['confirmation'];
  },
  execute: MakeVoiceToolRegistration['execute'],
): MakeVoiceToolRegistration {
  return { ...definition, confirmation: definition.confirmation ?? 'none', execute };
}

const emptyParameters = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

export function createMakeVoiceToolRegistry(
  dependencies: MakeVoiceToolDependencies,
): MakeVoiceToolRegistration[] {
  const runtimeCommentCreations = new Map<string, Promise<{
    commentId: string;
    targetRef: string;
    target: MakeVoicePageElementSummary;
  }>>();
  const capturePage = createTool({
    name: 'axhub_make_capture_page',
    title: '获取页面截图',
    description: '截取当前视图或完整页面；默认只截取当前视图。返回结果只包含安全元数据，不包含图像内容，不能据此推断页面视觉细节。',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['viewport', 'full-page'],
          default: 'viewport',
          description: '截图范围：当前视图或完整页面，默认当前视图。',
        },
      },
      additionalProperties: false,
    },
    risk: 'capture',
  }, async (input, context) => {
    const value = inputRecord(input).scope;
    if (typeof value !== 'undefined' && value !== 'viewport' && value !== 'full-page') {
      throw new MakeVoiceToolError('INVALID_CAPTURE_SCOPE', '截图范围只能是当前视图或完整页面');
    }
    const scope = value === 'full-page' ? 'full-page' : 'viewport';
    const page = {
      url: pageValue(dependencies.page.url),
      title: boundedText(typeof dependencies.page.title === 'function'
        ? dependencies.page.title()
        : dependencies.page.title),
    };
    const screenshot = await dependencies.page.capture({ ...context, page, scope });
    return { page, scope, screenshot: normalizeCaptureResult(screenshot) };
  });

  const getPageTarget = createTool({
    name: 'axhub_make_get_page_target',
    title: '查看当前页面目标',
    description: '同时读取当前选中和悬停的页面目标；优先目标为选中项，其次为悬停项。',
    parameters: emptyParameters,
    risk: 'read',
  }, async () => {
    const value = await dependencies.commentary.getVoiceTargets();
    const record = isRecord(value) ? value : {};
    const selected = safePageElement(record.selected);
    const hovered = safePageElement(record.hovered);
    return {
      selected,
      hovered,
      preferred: selected ?? hovered,
    };
  });

  const findPageElements = createTool({
    name: 'axhub_make_find_page_elements',
    title: '查找页面元素',
    description: '按可见文案、语义角色、标签或父级目标引用查找页面元素，结果支持分页。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要匹配的可见文案。' },
        role: { type: 'string', description: '要匹配的语义角色。' },
        tagName: { type: 'string', description: '要匹配的元素标签名。' },
        parentTargetRef: { type: 'string', description: '限定查找范围的父级目标引用。' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: '本页最多返回的元素数量，默认 20。' },
        cursor: { type: 'string', description: '上一次结果返回的分页游标。' },
      },
      additionalProperties: false,
    },
    risk: 'read',
  }, async (input) => {
    const values = inputRecord(input);
    return safePageElements(await dependencies.commentary.findVoiceElements({
      ...(optionalString(values, 'text') ? { text: optionalString(values, 'text') } : {}),
      ...(optionalString(values, 'role') ? { role: optionalString(values, 'role') } : {}),
      ...(optionalString(values, 'tagName') ? { tagName: optionalString(values, 'tagName') } : {}),
      ...(optionalString(values, 'parentTargetRef') ? { parentTargetRef: optionalString(values, 'parentTargetRef') } : {}),
      ...(optionalString(values, 'cursor') ? { cursor: optionalString(values, 'cursor') } : {}),
      limit: optionalInteger(values, 'limit', 20, 100),
    }));
  });

  const getPageStructure = createTool({
    name: 'axhub_make_get_page_structure',
    title: '查看页面结构',
    description: '读取页面或指定目标下的精简结构；用于在查找不足时逐层定位。',
    parameters: {
      type: 'object',
      properties: {
        targetRef: { type: 'string', description: '可选的结构根节点目标引用。' },
        depth: { type: 'integer', minimum: 0, maximum: 10, default: 1, description: '向下读取的结构深度，默认 1。' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 30, description: '本页最多返回的节点数量，默认 30。' },
        cursor: { type: 'string', description: '上一次结果返回的分页游标。' },
      },
      additionalProperties: false,
    },
    risk: 'read',
  }, async (input) => {
    const values = inputRecord(input);
    const depth = optionalDepth(values);
    return safePageElements(await dependencies.commentary.getVoiceElementStructure({
      ...(optionalString(values, 'targetRef') ? { targetRef: optionalString(values, 'targetRef') } : {}),
      ...(typeof depth === 'number' ? { depth } : {}),
      ...(optionalString(values, 'cursor') ? { cursor: optionalString(values, 'cursor') } : {}),
      limit: optionalInteger(values, 'limit', 30, 100),
    }));
  });

  const activatePageElement = createTool({
    name: 'axhub_make_activate_page_element',
    title: '激活页面元素',
    description: '滚动到指定页面目标并选中高亮；不会打开输入框或新建批注。',
    parameters: {
      type: 'object',
      properties: { targetRef: { type: 'string', description: '要激活的页面目标引用。' } },
      required: ['targetRef'],
      additionalProperties: false,
    },
    risk: 'write',
  }, async (input) => {
    const targetRef = requiredString(inputRecord(input), 'targetRef', 'MISSING_TARGET_REF', '请提供要激活的页面目标引用');
    const value = await dependencies.commentary.activateVoiceElement(targetRef);
    const record = isRecord(value) ? value : {};
    return record.activated === true
      ? { activated: true, targetRef: boundedText(record.targetRef) || targetRef }
      : {
          ok: false,
          activated: false,
          targetRef,
          error: {
            code: 'PAGE_TARGET_STALE',
            message: '页面已变化，请重新查找',
            recoverable: true,
          },
        };
  });

  const createComment = createTool({
    name: 'axhub_make_create_comment',
    title: '新建批注',
    description: '仅在批注管理模式下保存一条待处理批注；不会执行页面修改。用户只要求增加批注时使用。',
    parameters: {
      type: 'object',
      properties: {
        targetRef: { type: 'string', description: '要挂载批注的页面目标引用。' },
        content: { type: 'string', description: '要保存的批注内容。' },
        linkedAnnotationId: { type: 'string', description: '可选的关联标注 ID。' },
      },
      required: ['targetRef', 'content'],
      additionalProperties: false,
    },
    risk: 'write',
  }, async (input, context) => {
    const values = inputRecord(input);
    const targetRef = requiredString(values, 'targetRef', 'MISSING_TARGET_REF', '请提供要新建批注的页面目标引用');
    const content = requiredString(values, 'content', 'MISSING_COMMENT_CONTENT', '批注内容不能为空');
    const operationId = requiredOperationId(context);
    const resolvedScope = resolveScope(dependencies);
    const linkedAnnotationId = optionalString(values, 'linkedAnnotationId');
    const persisted = safeComment(await dependencies.comments.getCreatedByOperationId({
      operationId,
      scope: resolvedScope,
      signal: context.signal,
    }));
    if (persisted) {
      if (linkedAnnotationId && persisted.linkedAnnotationId !== linkedAnnotationId) {
        const enriched = safeComment(await dependencies.comments.create({
          runtimeComment: {
            commentId: persisted.commentId,
            targetRef: persisted.target.targetRef,
          },
          content,
          target: persisted.target,
          linkedAnnotationId,
          scope: resolvedScope,
          operationId,
          callId: boundedText(context.callId),
          signal: context.signal,
        }));
        if (!enriched) {
          throw new MakeVoiceToolError('COMMENT_PERSISTENCE_FAILED', '批注保存失败，请稍后重试');
        }
        await refreshPersistedCommentsBestEffort(dependencies.commentary.refreshPersistedComments);
        return {
          comment: enriched,
          nextAction: '批注已保存；只有用户明确要求页面修改时才执行这条批注',
        };
      }
      return {
        comment: persisted,
        nextAction: '批注已保存；只有用户明确要求页面修改时才执行这条批注',
      };
    }
    let runtimeCreation = runtimeCommentCreations.get(operationId);
    if (!runtimeCreation) {
      runtimeCreation = Promise.resolve(dependencies.commentary.createVoiceComment(
        targetRef,
        content,
        { anchorPlacement: 'target', operationId },
      )).then((runtimeValue) => {
        const runtime = isRecord(runtimeValue) ? runtimeValue : {};
        const runtimeTarget = safePageElement(runtime.target);
        const commentId = boundedText(runtime.commentId);
        if (runtime.applied !== true || !commentId || !runtimeTarget || runtimeTarget.targetRef !== targetRef) {
          throw new MakeVoiceToolError(
            'COMMENT_CREATE_FAILED',
            '批注保存失败，页面可能已变化，请重新查找',
          );
        }
        return { commentId, targetRef, target: runtimeTarget };
      });
      runtimeCommentCreations.set(operationId, runtimeCreation);
      void runtimeCreation.catch(() => runtimeCommentCreations.delete(operationId));
    }
    const { commentId, target: runtimeTarget } = await runtimeCreation;
    const comment = safeComment(await dependencies.comments.create({
      runtimeComment: { commentId, targetRef },
      content,
      target: runtimeTarget,
      ...(linkedAnnotationId ? { linkedAnnotationId } : {}),
      scope: resolvedScope,
      operationId,
      callId: boundedText(context.callId),
      signal: context.signal,
    }));
    if (!comment) {
      throw new MakeVoiceToolError('COMMENT_PERSISTENCE_FAILED', '批注保存失败，请稍后重试');
    }
    runtimeCommentCreations.delete(operationId);
    await refreshPersistedCommentsBestEffort(dependencies.commentary.refreshPersistedComments);
    return {
      comment,
      nextAction: '批注已保存；只有用户明确要求页面修改时才执行这条批注',
    };
  });

  const listComments = createTool({
    name: 'axhub_make_list_comments',
    title: '查询批注',
    description: '查询当前资源全部匹配批注（包含普通页面批注和语音批注）及最新执行状态。工具会在内部取完所有分页，一次返回完整 comments 和总数 total。',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: COMMENT_STATUSES, description: '按批注状态筛选。' },
        keyword: { type: 'string', description: '按批注内容或目标摘要关键词筛选。' },
        linkedAnnotationId: { type: 'string', description: '按关联标注 ID 筛选。' },
      },
      additionalProperties: false,
    },
    risk: 'read',
  }, async (input, context) => {
    const values = inputRecord(input);
    const status = COMMENT_STATUSES.includes(values.status as MakeVoiceCommentStatus)
      ? values.status as MakeVoiceCommentStatus
      : undefined;
    const scope = resolveScope(dependencies);
    const keyword = optionalString(values, 'keyword');
    const linkedAnnotationId = optionalString(values, 'linkedAnnotationId');
    const commentsById = new Map<string, MakeVoiceCommentSummary>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let total = 0;
    do {
      const result = await dependencies.comments.list({
        scope,
        ...(status ? { status } : {}),
        ...(keyword ? { keyword } : {}),
        ...(linkedAnnotationId ? { linkedAnnotationId } : {}),
        limit: 50,
        ...(cursor ? { cursor } : {}),
        signal: context.signal,
      });
      for (const candidate of result.comments) {
        const comment = safeComment(candidate);
        if (comment) commentsById.set(comment.commentId, comment);
      }
      total = Math.max(
        total,
        Number.isFinite(Number(result.total))
          ? Math.max(0, Math.floor(Number(result.total)))
          : commentsById.size,
      );
      const nextCursor = typeof result.nextCursor === 'string'
        ? boundedText(result.nextCursor)
        : '';
      if (!nextCursor) break;
      if (seenCursors.has(nextCursor)) {
        throw new MakeVoiceToolError('COMMENT_PAGINATION_INVALID', '批注查询分页异常，请稍后重试');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (true);
    const comments = [...commentsById.values()];
    return {
      comments,
      total: Math.max(total, comments.length),
    };
  });

  const executeComment = createTool({
    name: 'axhub_make_execute_comment',
    title: '执行批注',
    description: '执行一条已有批注。只有用户明确要求执行时调用；不需要二次确认。只能使用查询或创建工具返回的真实 commentId，不得编造 ID。根据返回的 phase 区分已接受、执行中和已完成。',
    parameters: {
      type: 'object',
      properties: { commentId: { type: 'string', description: '要执行的批注 ID。' } },
      required: ['commentId'],
      additionalProperties: false,
    },
    risk: 'write',
  }, async (input, context) => {
    const commentId = requiredString(inputRecord(input), 'commentId', 'MISSING_COMMENT_ID', '请提供要执行的批注 ID');
    return safeExecution(await dependencies.comments.submitCommentExecution({
      commentId,
      scope: resolveScope(dependencies),
      operationId: requiredOperationId(context),
      signal: context.signal,
    }));
  });

  const applyPageChange = createTool({
    name: 'axhub_make_apply_page_change',
    title: '直接修改页面',
    description: '用于用户要求修改、调整或修复页面时的一步操作：创建批注并立即执行，不询问确认。不要用于只增加批注。工具会返回真实 commentId 和 executionId。',
    parameters: {
      type: 'object',
      properties: {
        targetRef: { type: 'string', description: '要修改的页面目标引用。' },
        content: { type: 'string', description: '要执行的页面修改要求。' },
        linkedAnnotationId: { type: 'string', description: '可选的关联标注 ID。' },
      },
      required: ['targetRef', 'content'],
      additionalProperties: false,
    },
    risk: 'write',
  }, async (input, context) => {
    const created = await createComment.execute(input, context);
    const createdRecord = isRecord(created) ? created : {};
    const comment = safeComment(createdRecord.comment);
    const commentId = comment?.commentId || '';
    if (!comment || !commentId) {
      throw new MakeVoiceToolError('COMMENT_CREATE_FAILED', '批注已创建但无法取得真实 ID，请查询当前页面批注后重试');
    }
    try {
      const execution = await executeComment.execute({ commentId }, context);
      return {
        action: 'create_and_execute',
        comment,
        execution: safeExecution(execution),
      };
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError')
        || Boolean(error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError')
      ) throw error;
      return {
        ok: false,
        action: 'create_and_execute',
        stage: 'execute',
        comment,
        error: recoverableToolFailure(error),
      };
    }
  });

  const getCommentExecution = createTool({
    name: 'axhub_make_get_comment_execution',
    title: '查看执行状态',
    description: '查看一条批注执行记录及其所属批注的当前状态；根据 phase 判断真实执行阶段。',
    parameters: {
      type: 'object',
      properties: { executionId: { type: 'string', description: '要查看的执行记录 ID。' } },
      required: ['executionId'],
      additionalProperties: false,
    },
    risk: 'read',
  }, async (input, context) => {
    const executionId = requiredString(inputRecord(input), 'executionId', 'MISSING_EXECUTION_ID', '请提供要查看的执行记录 ID');
    return safeExecution(await dependencies.comments.getExecution({
      executionId,
      scope: resolveScope(dependencies),
      signal: context.signal,
    }), true);
  });

  const cancelCommentExecution = createTool({
    name: 'axhub_make_cancel_comment_execution',
    title: '取消执行',
    description: '取消一条正在执行的批注。只有用户明确要求取消时调用；不需要二次确认。只能使用真实 executionId。',
    parameters: {
      type: 'object',
      properties: { executionId: { type: 'string', description: '要取消的执行记录 ID。' } },
      required: ['executionId'],
      additionalProperties: false,
    },
    risk: 'destructive',
  }, async (input, context) => {
    const executionId = requiredString(inputRecord(input), 'executionId', 'MISSING_EXECUTION_ID', '请提供要取消的执行记录 ID');
    return safeExecution(await dependencies.comments.cancelExecution({
      executionId,
      scope: resolveScope(dependencies),
      operationId: requiredOperationId(context),
      callId: boundedText(context.callId),
      signal: context.signal,
    }));
  });

  const deleteComment = createTool({
    name: 'axhub_make_delete_comment',
    title: '删除批注',
    description: '删除一条已有批注及其关联状态。只有用户明确要求删除时调用；不需要二次确认。只能使用真实 commentId。',
    parameters: {
      type: 'object',
      properties: { commentId: { type: 'string', description: '要删除的批注 ID。' } },
      required: ['commentId'],
      additionalProperties: false,
    },
    risk: 'destructive',
  }, async (input, context) => {
    const commentId = requiredString(inputRecord(input), 'commentId', 'MISSING_COMMENT_ID', '请提供要删除的批注 ID');
    const result = await dependencies.comments.delete({
      commentId,
      scope: resolveScope(dependencies),
      operationId: requiredOperationId(context),
      callId: boundedText(context.callId),
      signal: context.signal,
    });
    if (result.deleted) {
      await refreshPersistedCommentsBestEffort(
        dependencies.commentary.refreshPersistedComments,
        [commentId],
      );
    }
    return { commentId: boundedText(result.commentId) || commentId, deleted: result.deleted === true };
  });

  return [
    capturePage,
    getPageTarget,
    findPageElements,
    getPageStructure,
    activatePageElement,
    createComment,
    applyPageChange,
    listComments,
    executeComment,
    getCommentExecution,
    cancelCommentExecution,
    deleteComment,
  ];
}
