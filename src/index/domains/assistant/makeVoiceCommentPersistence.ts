export type MakeVoicePageElementSummary = {
  targetRef: string;
  label: string;
  textExcerpt: string;
  tagName: string;
  role: string | null;
  path: string;
  childCount: number;
};

export type MakeVoiceCommentStatus = '待处理' | '执行中' | '已完成' | '执行失败' | '已取消';
export type MakeVoiceExecutionPhase = 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled';

export type MakeVoiceCommentSummary = {
  commentId: string;
  content: string;
  status: MakeVoiceCommentStatus;
  target: MakeVoicePageElementSummary;
  source: '普通批注' | '关联标注';
  linkedAnnotationId?: string;
  latestExecution?: {
    executionId: string;
    status: MakeVoiceCommentStatus;
    phase: MakeVoiceExecutionPhase;
  };
};

type PersistedCommentsAdapter = {
  read(scope: unknown): Promise<any> | any;
  write(
    scope: unknown,
    document: any,
    reason: 'changes' | 'clear' | 'state',
    context?: unknown,
  ): Promise<void> | void;
};

export type MakeVoiceCommentPersistenceScope = {
  scope: {
    targetPath?: string;
    storageScope?: string;
    prototypeId?: string;
    filePath?: string;
    /** Commentary's current page route, needed when a prototype has multiple pages. */
    pageScope?: string;
    resource?: { id?: string; path?: string } | null;
    documentKind?: 'document' | 'prototype';
  };
  adapter: PersistedCommentsAdapter;
};

export interface MakeVoiceCommentExecutionDependencies {
  sync(input: { signal: AbortSignal }): void | Promise<void>;
  resolve(input: {
    commentId: string;
    signal: AbortSignal;
  }): Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  submit(input: {
    commentId: string;
    operationId: string;
    scope: MakeVoiceCommentPersistenceScope['scope'];
    executionContext: Record<string, unknown>;
    signal: AbortSignal;
  }): unknown | Promise<unknown>;
  get(input: { taskId: string; signal: AbortSignal }): unknown | Promise<unknown>;
  findByOperationId(input: {
    operationId: string;
    signal: AbortSignal;
  }): unknown | Promise<unknown>;
  cancel(input: {
    taskId: string;
    operationId: string;
    callId: string;
    signal: AbortSignal;
  }): unknown | Promise<unknown>;
}

export interface MakeVoiceCommentOperationsOptions {
  /** Returns the existing Make persistence adapter for the currently visible resource. */
  resolveScope: () => MakeVoiceCommentPersistenceScope | null;
  /** Existing direct-run callbacks. This is a dependency, not a second execution registry. */
  tasks?: MakeVoiceCommentExecutionDependencies;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

export class MakeVoiceCommentPersistenceError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(code: string, message: string, recoverable = true) {
    super(message);
    this.name = 'MakeVoiceCommentPersistenceError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

type OperationContext = {
  operationId: string;
  callId: string;
  signal: AbortSignal;
};

type ListCommentsInput = {
  scope: unknown;
  status?: MakeVoiceCommentStatus;
  keyword?: string;
  linkedAnnotationId?: string;
  limit?: number;
  cursor?: string;
  signal: AbortSignal;
};

export interface MakeVoiceCommentOperations {
  getScope(): MakeVoiceCommentPersistenceScope | null;
  read(input: { scope: unknown; signal: AbortSignal }): Promise<unknown>;
  getCreatedByOperationId(input: {
    operationId: string;
    scope: unknown;
    signal: AbortSignal;
  }): Promise<MakeVoiceCommentSummary | null>;
  create(input: OperationContext & {
    runtimeComment: { commentId: string; targetRef: string };
    content: string;
    target: MakeVoicePageElementSummary;
    linkedAnnotationId?: string;
    scope: unknown;
  }): Promise<MakeVoiceCommentSummary>;
  list(input: ListCommentsInput): Promise<{
    comments: MakeVoiceCommentSummary[];
    total: number;
    nextCursor: string | null;
  }>;
  submitCommentExecution(input: {
    commentId: string;
    scope: unknown;
    operationId: string;
    signal: AbortSignal;
  }): Promise<{
    executionId: string;
    commentId: string;
    status: MakeVoiceCommentStatus;
    phase: MakeVoiceExecutionPhase;
  }>;
  getExecution(input: {
    executionId: string;
    scope: unknown;
    signal: AbortSignal;
  }): Promise<{
    executionId: string;
    commentId: string;
    status: MakeVoiceCommentStatus;
    commentStatus: MakeVoiceCommentStatus;
    phase: MakeVoiceExecutionPhase;
  }>;
  cancelExecution(input: OperationContext & {
    executionId: string;
    scope: unknown;
  }): Promise<{
    executionId: string;
    commentId: string;
    status: MakeVoiceCommentStatus;
    phase: 'cancelled';
  }>;
  delete(input: OperationContext & {
    commentId: string;
    scope: unknown;
  }): Promise<{ commentId: string; deleted: boolean }>;
}

const COMMENT_CONTEXT_ERROR = '当前页面暂时无法读取批注，请刷新后重试';
const COMMENT_NOT_FOUND_ERROR = '未找到这条批注，请刷新后重试';
const EXECUTION_NOT_FOUND_ERROR = '未找到这条执行记录，请刷新后重试';
const TARGET_STALE_ERROR = '页面已变化，请重新查找并新建批注';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const submissionTailsByComment = new Map<string, Promise<void>>();

function error(code: string, message: string): MakeVoiceCommentPersistenceError {
  return new MakeVoiceCommentPersistenceError(code, message);
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('操作已取消', 'AbortError');
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scopeRecord(value: unknown): MakeVoiceCommentPersistenceScope | null {
  if (!isRecord(value)) return null;
  const record = value as Partial<MakeVoiceCommentPersistenceScope>;
  return record.scope && record.adapter ? record as MakeVoiceCommentPersistenceScope : null;
}

function requireScope(value: unknown): MakeVoiceCommentPersistenceScope {
  const resolved = scopeRecord(value);
  if (!resolved) throw error('COMMENT_CONTEXT_UNAVAILABLE', COMMENT_CONTEXT_ERROR);
  return resolved;
}

function fallbackDocument(scope: MakeVoiceCommentPersistenceScope): any {
  const targetPath = stringValue(scope.scope.targetPath || scope.scope.filePath);
  const resourceId = stringValue(
    scope.scope.resource?.id || scope.scope.prototypeId || targetPath || 'voice-commentary',
  );
  return {
    schemaVersion: 3,
    kind: scope.scope.documentKind === 'document'
      ? 'document-edit-comments'
      : 'prototype-edit-comments',
    resource: {
      id: resourceId,
      targetPath,
      filePath: stringValue(scope.scope.filePath || targetPath),
    },
    comments: [],
    images: [],
  };
}

function normalizeDocument(value: unknown, scope: MakeVoiceCommentPersistenceScope): any {
  const fallback = fallbackDocument(scope);
  if (!isRecord(value)) return fallback;
  return {
    ...fallback,
    ...value,
    schemaVersion: 3,
    resource: isRecord(value.resource)
      ? { ...fallback.resource, ...value.resource }
      : fallback.resource,
    comments: Array.isArray(value.comments) ? [...value.comments] : [],
    images: Array.isArray(value.images) ? [...value.images] : [],
  };
}

function safeTarget(value: unknown): MakeVoicePageElementSummary | null {
  if (!isRecord(value)) return null;
  const targetRef = stringValue(value.targetRef);
  if (!targetRef) return null;
  return {
    targetRef,
    label: stringValue(value.label),
    textExcerpt: stringValue(value.textExcerpt).slice(0, 120),
    tagName: stringValue(value.tagName).toLowerCase(),
    role: stringValue(value.role) || null,
    path: stringValue(value.path),
    childCount: Math.max(0, Math.floor(finiteNumber(value.childCount))),
  };
}

function commentTarget(comment: Record<string, any>): MakeVoicePageElementSummary | null {
  const directTarget = safeTarget(comment.voiceTarget ?? comment.target);
  if (directTarget) return directTarget;

  // Manual comments predate voiceTarget and only retain the stable element key.
  const metadata = isRecord(comment.target) ? comment.target : comment;
  const targetRef = stringValue(
    comment.voiceTargetRef
      || comment.voiceElementKey
      || comment.elementKey
      || metadata.elementKey
      || (comment.id ? `comment:${comment.id}` : ''),
  );
  if (!targetRef) return null;
  return {
    targetRef,
    label: stringValue(metadata.label) || '页面元素',
    textExcerpt: stringValue(metadata.textExcerpt).slice(0, 120),
    tagName: stringValue(metadata.tagName).toLowerCase(),
    role: stringValue(metadata.role) || null,
    path: stringValue(metadata.path),
    childCount: Math.max(0, Math.floor(finiteNumber(metadata.childCount))),
  };
}

function statusOf(value: unknown): MakeVoiceCommentStatus {
  const status = stringValue(value).toLowerCase();
  if (
    status === '执行中'
    || status === 'editing'
    || status === 'running'
    || status === 'in_progress'
    || status === 'started'
    || status === 'accepted'
  ) return '执行中';
  if (
    status === '已完成'
    || status === 'completed'
    || status === 'complete'
    || status === 'success'
    || status === 'succeeded'
    || status === 'done'
  ) return '已完成';
  if (
    status === '执行失败'
    || status === 'error'
    || status === 'failed'
    || status === 'failure'
  ) return '执行失败';
  if (
    status === '已取消'
    || status === 'cancelled'
    || status === 'canceled'
    || status === 'aborted'
  ) return '已取消';
  return '待处理';
}

function executionPhaseOf(value: unknown): MakeVoiceExecutionPhase | null {
  const status = stringValue(value).toLowerCase();
  if (status === 'accepted') return 'accepted';
  if (['running', 'editing', 'in_progress', 'started', '执行中'].includes(status)) return 'running';
  if (['completed', 'complete', 'success', 'succeeded', 'done', '已完成'].includes(status)) return 'completed';
  if (['error', 'failed', 'failure', '执行失败'].includes(status)) return 'failed';
  if (['cancelled', 'canceled', 'aborted', '已取消'].includes(status)) return 'cancelled';
  return null;
}

function phaseForCommentStatus(status: MakeVoiceCommentStatus): MakeVoiceExecutionPhase {
  if (status === '已完成') return 'completed';
  if (status === '执行失败') return 'failed';
  if (status === '已取消') return 'cancelled';
  return 'running';
}

function statusState(status: MakeVoiceCommentStatus): 'idle' | 'editing' | 'completed' | 'error' {
  if (status === '执行中') return 'editing';
  if (status === '已完成') return 'completed';
  if (status === '执行失败') return 'error';
  return 'idle';
}

function executionIdOf(value: unknown): string {
  if (!isRecord(value)) return '';
  return stringValue(
    value.executionId
    || value.runId
    || value.requestId
    || value.taskId
    || value.sessionId,
  );
}

function persistedExecutionStatus(comment: Record<string, any>): MakeVoiceCommentStatus {
  const voiceStatus = statusOf(comment.voiceStatus);
  if (voiceStatus === '已取消') return voiceStatus;
  const documentStatus = statusOf(comment.state);
  if (documentStatus === '已完成' || documentStatus === '执行失败') return documentStatus;
  return statusOf(comment.latestExecution?.status ?? comment.voiceStatus ?? comment.state);
}

function latestExecutionForComment(
  comment: Record<string, any>,
): {
  executionId: string;
  status: MakeVoiceCommentStatus;
  phase: MakeVoiceExecutionPhase;
  updatedAt: number;
} | null {
  const persisted = isRecord(comment.latestExecution)
    ? (() => {
        const status = persistedExecutionStatus(comment);
        return {
          executionId: executionIdOf(comment.latestExecution),
          status,
          phase: status === '已完成' || status === '执行失败' || status === '已取消'
            ? phaseForCommentStatus(status)
            : executionPhaseOf(comment.latestExecution.phase ?? comment.latestExecution.status)
              ?? phaseForCommentStatus(status),
          updatedAt: finiteNumber(comment.latestExecution.updatedAt, finiteNumber(comment.updatedAt)),
        };
      })()
    : null;
  return persisted;
}

function summarizeComment(comment: Record<string, any>): MakeVoiceCommentSummary | null {
  const commentId = stringValue(comment.id);
  const target = commentTarget(comment);
  if (!commentId || !target || finiteNumber(comment.deletedAt) > 0) return null;
  const latest = latestExecutionForComment(comment);
  const linkedAnnotationId = stringValue(comment.linkedAnnotationId);
  const status = latest?.status ?? persistedExecutionStatus(comment);
  return {
    commentId,
    content: stringValue(comment.comment ?? comment.message),
    status,
    target,
    source: linkedAnnotationId ? '关联标注' : '普通批注',
    ...(linkedAnnotationId ? { linkedAnnotationId } : {}),
    ...(latest ? {
      latestExecution: {
        executionId: latest.executionId,
        status: latest.status,
        phase: latest.phase,
      },
    } : {}),
  };
}

function currentPageComment(
  document: Record<string, any>,
  commentId: string,
  scope: MakeVoiceCommentPersistenceScope,
): Record<string, any> {
  const comment = document.comments.find((entry: unknown) => (
    isRecord(entry)
    && stringValue(entry.id) === commentId
    && finiteNumber(entry.deletedAt) <= 0
  ));
  if (!comment) throw error('COMMENT_NOT_FOUND', COMMENT_NOT_FOUND_ERROR);
  const currentPageScope = stringValue(scope.scope.pageScope);
  const commentPageScope = stringValue(comment.pageScope);
  if (currentPageScope && commentPageScope && currentPageScope !== commentPageScope) {
    throw error(
      'COMMENT_PAGE_MISMATCH',
      '这条批注不属于当前页面，请切换到对应页面后重试',
    );
  }
  return comment;
}

function replaceComment(document: Record<string, any>, nextComment: Record<string, any>): void {
  const id = stringValue(nextComment.id);
  document.comments = document.comments.map((entry: unknown) => (
    isRecord(entry) && stringValue(entry.id) === id ? nextComment : entry
  ));
}

function startFailure(errorValue: unknown): MakeVoiceCommentPersistenceError {
  const message = errorValue instanceof Error ? errorValue.message.toLowerCase() : '';
  if (/(?:stale|target|locator|element|page|页面|目标)/u.test(message)) {
    return error('COMMENT_TARGET_STALE', TARGET_STALE_ERROR);
  }
  return error('COMMENT_EXECUTION_FAILED', '暂时无法执行这条批注，请稍后重试');
}

function readCursor(value: unknown): number {
  const match = stringValue(value).match(/^comments:(\d+)$/u);
  return match ? Math.max(0, Number(match[1])) : 0;
}

/**
 * Writes through Make's current Commentary persistence adapter and projects
 * existing direct-run state. It does not own another comment or task registry.
 */
export function createMakeVoiceCommentOperations(
  options: MakeVoiceCommentOperationsOptions,
): MakeVoiceCommentOperations {
  const now = options.now ?? (() => Date.now());
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const startsByOperation = new Map<string, Promise<unknown>>();
  const cancellationsByOperation = new Map<string, Promise<unknown>>();

  async function readDocument(
    scopeValue: unknown,
    signal: AbortSignal,
  ): Promise<{ resolved: MakeVoiceCommentPersistenceScope; document: Record<string, any> }> {
    abortIfNeeded(signal);
    const resolved = requireScope(scopeValue);
    const value = await resolved.adapter.read(resolved.scope);
    abortIfNeeded(signal);
    return { resolved, document: normalizeDocument(value, resolved) };
  }

  async function readRuntimeComment(
    scopeValue: unknown,
    commentId: string,
    signal: AbortSignal,
  ): Promise<{ resolved: MakeVoiceCommentPersistenceScope; document: Record<string, any>; comment: Record<string, any> }> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const loaded = await readDocument(scopeValue, signal);
      const comment = loaded.document.comments.find((entry: unknown) => (
        isRecord(entry) && stringValue(entry.id) === commentId
      ));
      if (comment) return { ...loaded, comment };
      if (attempt < 3) await wait(50);
    }
    throw error('COMMENT_PERSISTENCE_PENDING', '批注正在保存，请稍后重试');
  }

  function requireTasks(): MakeVoiceCommentExecutionDependencies {
    if (!options.tasks) {
      throw error('COMMENT_EXECUTION_UNAVAILABLE', '当前页面暂时无法执行批注，请稍后重试');
    }
    return options.tasks;
  }

  async function resolveExecutionContext(
    tasks: MakeVoiceCommentExecutionDependencies,
    commentId: string,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const executionContext = await tasks.resolve({ commentId, signal });
      abortIfNeeded(signal);
      if (isRecord(executionContext)) return executionContext;
    } catch {
      abortIfNeeded(signal);
    }
    throw error('COMMENT_TARGET_STALE', TARGET_STALE_ERROR);
  }

  async function writeExecutionState(
    tasks: MakeVoiceCommentExecutionDependencies,
    resolved: MakeVoiceCommentPersistenceScope,
    document: Record<string, any>,
    signal: AbortSignal,
  ): Promise<void> {
    await resolved.adapter.write(resolved.scope, document, 'state');
    abortIfNeeded(signal);
    await tasks.sync({ signal });
    abortIfNeeded(signal);
  }

  function projectStartedExecution(started: unknown): {
    executionId: string;
    status: MakeVoiceCommentStatus;
    phase: MakeVoiceExecutionPhase;
  } {
    const executionId = executionIdOf(started);
    if (!executionId) {
      throw error(
        'COMMENT_EXECUTION_ID_MISSING',
        '页面修改已提交，但没有取得执行记录 ID；请查询批注状态后重试',
      );
    }
    const executionState = isRecord(started)
      ? started.status ?? started.state ?? started.phase
      : null;
    const phase = executionPhaseOf(executionState)
      ?? (isRecord(started) && started.accepted === true ? 'accepted' : null);
    if (!phase) {
      throw error('COMMENT_EXECUTION_STATUS_INVALID', '执行系统返回了未知状态，请查询批注状态后重试');
    }
    return {
      executionId,
      status: statusOf(executionState ?? 'running'),
      phase,
    };
  }

  return {
    getScope: () => options.resolveScope(),

    async read({ scope, signal }) {
      return (await readDocument(scope, signal)).document;
    },

    async getCreatedByOperationId(input) {
      const operationId = stringValue(input.operationId);
      if (!operationId) return null;
      const { resolved, document } = await readDocument(input.scope, input.signal);
      const currentPageScope = stringValue(resolved.scope.pageScope);
      const comment = document.comments.find((entry: unknown) => (
        isRecord(entry)
        && finiteNumber(entry.deletedAt) <= 0
        && stringValue(entry.voiceCreateOperationId) === operationId
        && (
          !currentPageScope
          || !stringValue(entry.pageScope)
          || stringValue(entry.pageScope) === currentPageScope
        )
      ));
      return comment ? summarizeComment(comment) : null;
    },

    async create(input) {
      abortIfNeeded(input.signal);
      const commentId = stringValue(input.runtimeComment?.commentId);
      const runtimeTargetRef = stringValue(input.runtimeComment?.targetRef);
      const target = safeTarget(input.target);
      if (!commentId || !runtimeTargetRef || !target || target.targetRef !== runtimeTargetRef) {
        throw error('COMMENT_TARGET_STALE', TARGET_STALE_ERROR);
      }
      const { resolved, document, comment } = await readRuntimeComment(
        input.scope,
        commentId,
        input.signal,
      );
      if (!isRecord(comment.locator)) {
        throw error('COMMENT_TARGET_STALE', TARGET_STALE_ERROR);
      }
      const linkedAnnotationId = stringValue(input.linkedAnnotationId);
      const nextComment = {
        ...comment,
        id: commentId,
        state: 'idle',
        updatedAt: now(),
        comment: stringValue(input.content),
        voiceTargetRef: runtimeTargetRef,
        voiceTarget: target,
        anchorPlacement: 'target',
        voiceCreateOperationId: stringValue(input.operationId),
        ...(linkedAnnotationId ? { linkedAnnotationId } : {}),
      };
      replaceComment(document, nextComment);
      await resolved.adapter.write(resolved.scope, document, 'changes');
      const summary = summarizeComment(nextComment);
      if (!summary) throw error('COMMENT_PERSISTENCE_FAILED', '批注保存失败，请稍后重试');
      return summary;
    },

    async list(input) {
      const { document } = await readDocument(input.scope, input.signal);
      abortIfNeeded(input.signal);
      const keyword = stringValue(input.keyword).toLocaleLowerCase();
      const linkedAnnotationId = stringValue(input.linkedAnnotationId);
      const status = input.status;
      const summaries = document.comments
        .filter(isRecord)
        .map((comment: Record<string, any>) => ({
          comment,
          summary: summarizeComment(comment),
        }))
        .filter((entry: { summary: MakeVoiceCommentSummary | null }) => Boolean(entry.summary))
        .filter((entry: { summary: MakeVoiceCommentSummary | null }) => (
          !status || entry.summary?.status === status
        ))
        .filter((entry: { summary: MakeVoiceCommentSummary | null }) => (
          !linkedAnnotationId || entry.summary?.linkedAnnotationId === linkedAnnotationId
        ))
        .filter((entry: { summary: MakeVoiceCommentSummary | null }) => {
          if (!keyword) return true;
          const summary = entry.summary as MakeVoiceCommentSummary;
          return [summary.content, summary.target.label, summary.target.textExcerpt]
            .some((value) => value.toLocaleLowerCase().includes(keyword));
        })
        .sort((left: { comment: Record<string, any> }, right: { comment: Record<string, any> }) => (
          finiteNumber(right.comment.updatedAt) - finiteNumber(left.comment.updatedAt)
        ))
        .map((entry: { summary: MakeVoiceCommentSummary | null }) => entry.summary as MakeVoiceCommentSummary);
      const offset = readCursor(input.cursor);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(finiteNumber(input.limit, DEFAULT_LIMIT))));
      const comments = summaries.slice(offset, offset + limit);
      const nextOffset = offset + comments.length;
      return {
        comments,
        total: summaries.length,
        nextCursor: nextOffset < summaries.length ? `comments:${nextOffset}` : null,
      };
    },

    async submitCommentExecution(input) {
      const commentId = stringValue(input.commentId);
      const inputScope = scopeRecord(input.scope)?.scope;
      const submissionKey = [
        stringValue(inputScope?.storageScope ?? inputScope?.targetPath),
        stringValue(inputScope?.pageScope),
        commentId,
      ].join(':');
      const previousSubmission = submissionTailsByComment.get(submissionKey) ?? Promise.resolve();
      let releaseSubmission!: () => void;
      const currentSubmission = new Promise<void>((resolve) => {
        releaseSubmission = resolve;
      });
      const submissionTail = previousSubmission
        .catch(() => undefined)
        .then(() => currentSubmission);
      submissionTailsByComment.set(submissionKey, submissionTail);
      await previousSubmission.catch(() => undefined);
      try {
      const tasks = requireTasks();
      const { resolved, document } = await readDocument(input.scope, input.signal);
      const comment = currentPageComment(document, commentId, resolved);
      const operationId = stringValue(input.operationId);
      const existing = isRecord(comment.latestExecution) ? comment.latestExecution : null;
      const preparedOperationId = stringValue(comment.voiceExecuteOperationId);
      const existingStatus = existing ? statusOf(existing.status ?? comment.voiceStatus ?? comment.state) : null;
      if (existing && existingStatus === '执行中' && executionIdOf(existing)) {
        return {
          executionId: executionIdOf(existing),
          commentId,
          status: existingStatus,
          phase: executionPhaseOf(existing.phase ?? existing.status) ?? 'running',
        };
      }
      if (stringValue(comment.voiceExecuteOperationId) === operationId && existing) {
        const repeatedStatus = statusOf(existing.status);
        return {
          executionId: executionIdOf(existing),
          commentId,
          status: repeatedStatus,
          phase: repeatedStatus === '已完成' || repeatedStatus === '执行失败' || repeatedStatus === '已取消'
            ? phaseForCommentStatus(repeatedStatus)
            : executionPhaseOf(existing.phase ?? existing.status)
              ?? phaseForCommentStatus(repeatedStatus),
        };
      }
      if (!existing && preparedOperationId) {
        let reconciled = await tasks.findByOperationId({
          operationId: preparedOperationId,
          signal: input.signal,
        });
        abortIfNeeded(input.signal);
        if (!executionIdOf(reconciled)) {
          const executionContext = await resolveExecutionContext(tasks, commentId, input.signal);
          reconciled = await tasks.submit({
            commentId,
            operationId: preparedOperationId,
            scope: resolved.scope,
            executionContext,
            signal: input.signal,
          });
          abortIfNeeded(input.signal);
        }
        if (reconciled === false || (isRecord(reconciled) && reconciled.accepted === false)) {
          const rejectedComment = {
            ...comment,
            voiceExecuteOperationId: undefined,
            voiceExecutionPreparedAt: undefined,
            updatedAt: now(),
          };
          replaceComment(document, rejectedComment);
          await writeExecutionState(tasks, resolved, document, input.signal);
          throw error('COMMENT_EXECUTION_REJECTED', '批注执行未能启动，请稍后重试');
        }
        const { executionId, status, phase } = projectStartedExecution(reconciled);
        const reconciledComment = {
          ...comment,
          state: statusState(status),
          voiceStatus: status,
          requestId: executionId,
          updatedAt: now(),
          latestExecution: {
            executionId,
            status,
            phase,
            updatedAt: now(),
          },
        };
        replaceComment(document, reconciledComment);
        await writeExecutionState(tasks, resolved, document, input.signal);
        return { executionId, commentId, status, phase };
      }
      const executionContext = await resolveExecutionContext(tasks, commentId, input.signal);
      const preparedComment = {
        ...comment,
        state: 'idle',
        voiceStatus: undefined,
        provider: undefined,
        requestId: undefined,
        sessionId: undefined,
        message: undefined,
        code: undefined,
        latestExecution: undefined,
        voiceExecuteOperationId: operationId,
        voiceExecutionPreparedAt: now(),
        updatedAt: now(),
      };
      replaceComment(document, preparedComment);
      await writeExecutionState(tasks, resolved, document, input.signal);
      const startKey = `${commentId}:${operationId}`;
      let startPromise = startsByOperation.get(startKey);
      if (!startPromise) {
        startPromise = Promise.resolve(tasks.submit({
          commentId,
          operationId,
          scope: resolved.scope,
          executionContext,
          signal: input.signal,
        }));
        startsByOperation.set(startKey, startPromise);
        void startPromise.catch(() => startsByOperation.delete(startKey));
      }
      let started: unknown;
      try {
        started = await startPromise;
        abortIfNeeded(input.signal);
      } catch (startErrorValue) {
        if (input.signal.aborted) {
          startsByOperation.delete(startKey);
          const executionId = executionIdOf(started);
          if (executionId) {
            const cleanupSignal = new AbortController().signal;
            try {
              await tasks.cancel({
                taskId: executionId,
                operationId,
                callId: operationId,
                signal: cleanupSignal,
              });
            } catch {
              // The caller's cancellation still wins if cleanup races a settled task.
            }
          }
          throw new DOMException('操作已取消', 'AbortError');
        }
        const latestLoaded = await readDocument(input.scope, input.signal);
        const latestComment = currentPageComment(
          latestLoaded.document,
          commentId,
          latestLoaded.resolved,
        );
        const nextComment = {
          ...latestComment,
          state: 'error',
          updatedAt: now(),
          message: 'AI 修改失败',
          code: 'COMMENT_EXECUTION_FAILED',
        };
        replaceComment(latestLoaded.document, nextComment);
        await writeExecutionState(
          tasks,
          latestLoaded.resolved,
          latestLoaded.document,
          input.signal,
        );
        throw startFailure(startErrorValue);
      }
      if (started === false || (isRecord(started) && started.accepted === false)) {
        startsByOperation.delete(startKey);
        const latestLoaded = await readDocument(input.scope, input.signal);
        const latestComment = currentPageComment(
          latestLoaded.document,
          commentId,
          latestLoaded.resolved,
        );
        replaceComment(latestLoaded.document, {
          ...latestComment,
          voiceExecuteOperationId: undefined,
          voiceExecutionPreparedAt: undefined,
          updatedAt: now(),
        });
        await writeExecutionState(
          tasks,
          latestLoaded.resolved,
          latestLoaded.document,
          input.signal,
        );
        throw error('COMMENT_EXECUTION_REJECTED', '批注执行未能启动，请稍后重试');
      }
      const {
        executionId,
        status: startedStatus,
        phase: startedPhase,
      } = projectStartedExecution(started);
      const latestLoaded = await readDocument(input.scope, input.signal);
      const latestComment = currentPageComment(latestLoaded.document, commentId, latestLoaded.resolved);
      const persistedStatus = statusOf(latestComment.voiceStatus ?? latestComment.state);
      const executionStatus = persistedStatus === '已完成' || persistedStatus === '执行失败'
        ? persistedStatus
        : startedStatus;
      const executionPhase = executionStatus === '已完成' || executionStatus === '执行失败'
        ? phaseForCommentStatus(executionStatus)
        : startedPhase;
      const nextComment = {
        ...latestComment,
        state: statusState(executionStatus),
        voiceStatus: executionStatus,
        requestId: executionId,
        updatedAt: now(),
        voiceExecuteOperationId: operationId,
        latestExecution: {
          executionId,
          status: executionStatus,
          phase: executionPhase,
          updatedAt: now(),
        },
      };
      replaceComment(latestLoaded.document, nextComment);
      await writeExecutionState(
        tasks,
        latestLoaded.resolved,
        latestLoaded.document,
        input.signal,
      );
      startsByOperation.delete(startKey);
      return { executionId, commentId, status: executionStatus, phase: executionPhase };
      } finally {
        releaseSubmission();
        if (submissionTailsByComment.get(submissionKey) === submissionTail) {
          submissionTailsByComment.delete(submissionKey);
        }
      }
    },

    async getExecution(input) {
      const tasks = requireTasks();
      const { resolved, document } = await readDocument(input.scope, input.signal);
      const executionId = stringValue(input.executionId);
      const comment = document.comments.find((entry: unknown) => {
        if (!isRecord(entry) || finiteNumber(entry.deletedAt) > 0) return false;
        const pageScope = stringValue(entry.pageScope);
        const currentPageScope = stringValue(resolved.scope.pageScope);
        if (pageScope && currentPageScope && pageScope !== currentPageScope) return false;
        return executionIdOf(entry.latestExecution) === executionId
          || stringValue(entry.requestId) === executionId
          || stringValue(entry.sessionId) === executionId;
      });
      if (!comment) throw error('COMMENT_EXECUTION_NOT_FOUND', EXECUTION_NOT_FOUND_ERROR);
      const task = await tasks.get({ taskId: executionId, signal: input.signal });
      abortIfNeeded(input.signal);
      const latestStatus = isRecord(task)
        ? statusOf(task.status ?? task.state ?? task.phase)
        : persistedExecutionStatus(comment);
      const phase = latestStatus === '已完成' || latestStatus === '执行失败' || latestStatus === '已取消'
        ? phaseForCommentStatus(latestStatus)
        : isRecord(task)
          ? executionPhaseOf(task.status ?? task.state ?? task.phase)
          : executionPhaseOf(comment.latestExecution?.phase ?? comment.latestExecution?.status)
            ?? phaseForCommentStatus(latestStatus);
      if (!phase) {
        throw error('COMMENT_EXECUTION_STATUS_INVALID', '执行系统返回了未知状态，请稍后重试');
      }
      const persistedPhase = executionPhaseOf(
        comment.latestExecution?.phase ?? comment.latestExecution?.status,
      );
      if (
        isRecord(task)
        && (persistedExecutionStatus(comment) !== latestStatus || persistedPhase !== phase)
      ) {
        const nextComment = {
          ...comment,
          state: statusState(latestStatus),
          voiceStatus: latestStatus,
          requestId: executionId,
          updatedAt: now(),
          latestExecution: {
            executionId,
            status: latestStatus,
            phase,
            updatedAt: now(),
          },
        };
        replaceComment(document, nextComment);
        await writeExecutionState(tasks, resolved, document, input.signal);
      }
      return {
        executionId,
        commentId: stringValue(comment.id),
        status: latestStatus,
        commentStatus: latestStatus,
        phase,
      };
    },

    async cancelExecution(input) {
      const tasks = requireTasks();
      const { resolved, document } = await readDocument(input.scope, input.signal);
      const executionId = stringValue(input.executionId);
      const comment = document.comments.find((entry: unknown) => (
        isRecord(entry)
        && finiteNumber(entry.deletedAt) <= 0
        && (
          executionIdOf(entry.latestExecution) === executionId
          || stringValue(entry.requestId) === executionId
          || stringValue(entry.sessionId) === executionId
        )
      ));
      if (!comment) throw error('COMMENT_EXECUTION_NOT_FOUND', EXECUTION_NOT_FOUND_ERROR);
      const currentPageScope = stringValue(resolved.scope.pageScope);
      const commentPageScope = stringValue(comment.pageScope);
      if (currentPageScope && commentPageScope && currentPageScope !== commentPageScope) {
        throw error('COMMENT_PAGE_MISMATCH', '这条批注不属于当前页面，请切换到对应页面后重试');
      }
      const operationId = stringValue(input.operationId);
      const replayingPreparedCancellation = stringValue(comment.voiceCancelPreparedOperationId) === operationId;
      let cancellationComment = comment;
      if (!replayingPreparedCancellation && stringValue(comment.voiceCancelOperationId) !== operationId) {
        cancellationComment = {
          ...comment,
          voiceCancelPreparedOperationId: operationId,
          updatedAt: now(),
        };
        replaceComment(document, cancellationComment);
        await writeExecutionState(tasks, resolved, document, input.signal);
      }
      if (
        stringValue(comment.voiceCancelOperationId) !== stringValue(input.operationId)
        || statusOf(comment.voiceStatus) !== '已取消'
      ) {
        const cancelKey = `${executionId}:${stringValue(input.operationId)}`;
        let cancelPromise = cancellationsByOperation.get(cancelKey);
        if (!cancelPromise) {
          cancelPromise = Promise.resolve(tasks.cancel({
            taskId: executionId,
            operationId: stringValue(input.operationId),
            callId: stringValue(input.callId),
            signal: input.signal,
          }));
          cancellationsByOperation.set(cancelKey, cancelPromise);
          void cancelPromise.catch(() => cancellationsByOperation.delete(cancelKey));
        }
        const cancelled = await cancelPromise;
        abortIfNeeded(input.signal);
        if (cancelled === false || (isRecord(cancelled) && cancelled.cancelled === false)) {
          const latestTask = await tasks.get({ taskId: executionId, signal: input.signal });
          abortIfNeeded(input.signal);
          const latestPhase = executionPhaseOf(
            isRecord(latestTask) ? latestTask.phase ?? latestTask.status ?? latestTask.state : null,
          );
          if (latestPhase !== 'cancelled') {
            cancellationsByOperation.delete(cancelKey);
            if (latestPhase === 'completed' || latestPhase === 'failed') {
              throw error('COMMENT_EXECUTION_ALREADY_SETTLED', '这条批注已经结束，无法再取消');
            }
            throw error('COMMENT_EXECUTION_NOT_FOUND', EXECUTION_NOT_FOUND_ERROR);
          }
        }
        const latestLoaded = await readDocument(input.scope, input.signal);
        const latestComment = currentPageComment(
          latestLoaded.document,
          stringValue(comment.id),
          latestLoaded.resolved,
        );
        const nextComment = {
          ...latestComment,
          state: 'idle',
          voiceStatus: '已取消',
          updatedAt: now(),
          voiceCancelOperationId: stringValue(input.operationId),
          voiceCancelPreparedOperationId: undefined,
          latestExecution: {
            executionId,
            status: '已取消',
            phase: 'cancelled',
            updatedAt: now(),
          },
        };
        replaceComment(latestLoaded.document, nextComment);
        await writeExecutionState(
          tasks,
          latestLoaded.resolved,
          latestLoaded.document,
          input.signal,
        );
        cancellationsByOperation.delete(cancelKey);
      }
      return {
        executionId,
        commentId: stringValue(comment.id),
        status: '已取消',
        phase: 'cancelled',
      };
    },

    async delete(input) {
      const { resolved, document } = await readDocument(input.scope, input.signal);
      const commentId = stringValue(input.commentId);
      const deletedAt = now();
      const found = document.comments.some((entry: unknown) => (
        isRecord(entry)
        && stringValue(entry.id) === commentId
        && finiteNumber(entry.deletedAt) <= 0
      ));
      if (!found) return { commentId, deleted: false };
      currentPageComment(document, commentId, resolved);
      document.comments = document.comments.map((entry: unknown) => (
        isRecord(entry) && stringValue(entry.id) === commentId
          ? { ...entry, deletedAt, updatedAt: deletedAt }
          : entry
      ));
      await resolved.adapter.write(resolved.scope, document, 'clear', {
        observedTombstones: [{ kind: 'comment', commentId, deletedAt }],
      });
      return { commentId, deleted: true };
    },
  };
}
