import { describe, expect, it, vi } from 'vitest';

import {
  MakeVoiceCommentPersistenceError,
  createMakeVoiceCommentOperations,
  type MakeVoiceCommentPersistenceScope,
} from './makeVoiceCommentPersistence';

const pageTarget = {
  targetRef: 'page.nonce.4.9',
  label: '保存按钮',
  textExcerpt: '保存修改',
  tagName: 'button',
  role: 'button',
  path: 'body > main > button',
  childCount: 0,
};

const persistedLocator = {
  fingerprint: 'button#save',
  path: [0, 1],
  selectors: ['#save'],
};

function createHarness(options: {
  document?: any;
  pageScope?: string;
  taskGet?: unknown;
  taskStart?: unknown;
  taskCancel?: unknown;
  targetValid?: boolean;
} = {}) {
  let document = options.document ?? {
    schemaVersion: 3,
    kind: 'prototype-edit-comments',
    resource: {
      id: 'home',
      targetPath: 'prototypes/home',
      filePath: 'src/prototypes/home/index.tsx',
    },
    comments: [],
    images: [{ id: 'image-1', commentId: 'other-comment' }],
  };
  const write = vi.fn(async (_scope, nextDocument) => {
    document = nextDocument;
  });
  const scope: MakeVoiceCommentPersistenceScope = {
    scope: {
      targetPath: 'prototypes/home',
      storageScope: 'prototypes/home',
      prototypeId: 'home',
      pageScope: options.pageScope ?? 'landing',
      filePath: 'src/prototypes/home/index.tsx',
      resource: { id: 'home', path: 'prototypes/home' },
    },
    adapter: {
      read: async () => document,
      write,
    },
  };
  const tasks = {
    sync: vi.fn(async () => undefined),
    resolve: vi.fn(async ({ commentId }: { commentId: string }) => (
      options.targetValid === false
        ? null
        : {
            commentId,
            elementKey: 'heading.home.title',
            promptText: '完整批注提示词',
            targetRef: { locator: persistedLocator, label: '页面标题' },
          }
    )),
    submit: vi.fn(async () => options.taskStart ?? {
      accepted: true,
      runId: 'run-created',
      status: 'running',
    }),
    get: vi.fn(async () => options.taskGet ?? null),
    findByOperationId: vi.fn(async ({ operationId }: { operationId: string }) => ({
      operationId,
      executionId: 'run-created',
      phase: 'running',
    })),
    cancel: vi.fn(async () => options.taskCancel ?? { cancelled: true, status: 'aborted' }),
  };
  const createOperations = () => createMakeVoiceCommentOperations({
    resolveScope: () => scope,
    tasks,
    now: () => 100,
  });
  const operations = createOperations();
  return {
    operations,
    scope,
    tasks,
    createOperations,
    write,
    readDocument: () => document,
    replaceDocument: (nextDocument: any) => {
      document = nextDocument;
    },
  };
}

function liveComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-1',
    state: 'idle',
    updatedAt: 10,
    comment: '提高保存按钮的对比度',
    label: '保存按钮',
    locator: persistedLocator,
    pageScope: 'landing',
    voiceTargetRef: pageTarget.targetRef,
    voiceTarget: pageTarget,
    anchorPlacement: 'target',
    ...overrides,
  };
}

const executionContext = {
  operationId: 'operation-1',
  callId: 'call-1',
  signal: new AbortController().signal,
};

describe('createMakeVoiceCommentOperations', () => {
  it('persists a runtime-created comment with a safe target summary and preserves schema 3 fields', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          voiceTargetRef: undefined,
          voiceTarget: undefined,
          anchorPlacement: undefined,
        })],
        images: [{ id: 'image-1', commentId: 'comment-1', source: 'user' }],
        customDocumentField: 'preserve-me',
      },
    });

    await expect(harness.operations.create({
      runtimeComment: { commentId: 'comment-1', targetRef: pageTarget.targetRef },
      content: '提高保存按钮的对比度',
      target: pageTarget,
      scope: harness.scope,
      ...executionContext,
    })).resolves.toEqual({
      commentId: 'comment-1',
      content: '提高保存按钮的对比度',
      status: '待处理',
      target: pageTarget,
      source: '普通批注',
    });

    expect(harness.write).toHaveBeenCalledWith(
      harness.scope.scope,
      expect.objectContaining({
        schemaVersion: 3,
        customDocumentField: 'preserve-me',
        images: [{ id: 'image-1', commentId: 'comment-1', source: 'user' }],
        comments: [expect.objectContaining({
          id: 'comment-1',
          state: 'idle',
          locator: persistedLocator,
          pageScope: 'landing',
          voiceTargetRef: pageTarget.targetRef,
          voiceTarget: pageTarget,
          anchorPlacement: 'target',
        })],
      }),
      'changes',
    );
    expect(JSON.stringify(harness.readDocument())).not.toContain('password');
  });

  it('lists only live current-page comments with filters, pagination, and latest execution projection', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
      comments: [
        liveComment({
          id: 'comment-1',
          linkedAnnotationId: 'spec-login',
          updatedAt: 10,
          voiceStatus: '执行中',
          requestId: 'execution-new',
          latestExecution: {
            executionId: 'execution-new',
            status: '执行中',
            phase: 'running',
            updatedAt: 40,
          },
        }),
        liveComment({ id: 'comment-2', comment: '调整标题间距', linkedAnnotationId: 'spec-login', updatedAt: 20 }),
          liveComment({ id: 'comment-other-page', pageScope: 'settings' }),
          liveComment({ id: 'comment-deleted', deletedAt: 99 }),
        ],
        images: [],
      },
    });

    await expect(harness.operations.list({
      scope: harness.scope,
      linkedAnnotationId: 'spec-login',
      keyword: '按钮',
      status: '执行中',
      limit: 1,
      signal: executionContext.signal,
    })).resolves.toEqual({
      comments: [{
        commentId: 'comment-1',
        content: '提高保存按钮的对比度',
        status: '执行中',
        target: pageTarget,
        source: '关联标注',
        linkedAnnotationId: 'spec-login',
        latestExecution: { executionId: 'execution-new', status: '执行中', phase: 'running' },
      }],
      total: 1,
      nextCursor: null,
    });

    await expect(harness.operations.list({
      scope: harness.scope,
      linkedAnnotationId: 'spec-login',
      limit: 1,
      signal: executionContext.signal,
    })).resolves.toEqual(expect.objectContaining({
      comments: [expect.objectContaining({ commentId: 'comment-2' })],
      nextCursor: 'comments:1',
    }));
    await expect(harness.operations.list({
      scope: harness.scope,
      linkedAnnotationId: 'spec-login',
      limit: 1,
      cursor: 'comments:1',
      signal: executionContext.signal,
    })).resolves.toEqual(expect.objectContaining({
      comments: [expect.objectContaining({ commentId: 'comment-1' })],
      nextCursor: null,
    }));
  });

  it('lists a persisted non-voice comment using its stable element key', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [{
          id: 'manual-comment',
          state: 'idle',
          updatedAt: 10,
          comment: '调整标题间距',
          label: '页面标题',
          elementKey: 'heading.home.title',
          locator: persistedLocator,
          pageScope: 'landing',
        }],
        images: [],
      },
    });

    await expect(harness.operations.list({
      scope: harness.scope,
      signal: executionContext.signal,
    })).resolves.toEqual({
      comments: [{
        commentId: 'manual-comment',
        content: '调整标题间距',
        status: '待处理',
        target: {
          targetRef: 'heading.home.title',
          label: '页面标题',
          textExcerpt: '',
          tagName: '',
          role: null,
          path: '',
          childCount: 0,
        },
        source: '普通批注',
      }],
      total: 1,
      nextCursor: null,
    });
  });

  it('lists every live comment in the resource even when legacy page scopes differ', async () => {
    const harness = createHarness({
      pageScope: 'prototypes/home::page::landing',
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [
          liveComment({ id: 'legacy-comment', pageScope: '/prototypes/home', updatedAt: 10 }),
          liveComment({ id: 'current-comment', pageScope: 'prototypes/home::page::settings', updatedAt: 20 }),
          liveComment({ id: 'deleted-comment', pageScope: 'prototypes/home::page::landing', deletedAt: 30 }),
        ],
        images: [],
      },
    });

    const result = await harness.operations.list({
      scope: harness.scope,
      limit: 50,
      signal: executionContext.signal,
    });

    expect(result.comments.map((comment) => comment.commentId)).toEqual([
      'current-comment',
      'legacy-comment',
    ]);
    expect(result.total).toBe(2);
  });

  it('executes a normally persisted manual comment by resolving its live target from commentId', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [{
          id: 'manual-comment',
          state: 'idle',
          updatedAt: 10,
          comment: '调整标题间距',
          label: '页面标题',
          locator: persistedLocator,
          pageScope: 'landing',
        }],
        images: [],
      },
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'manual-comment',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).resolves.toMatchObject({ commentId: 'manual-comment', status: '执行中' });

    expect(harness.tasks.resolve).toHaveBeenCalledWith({
      commentId: 'manual-comment',
      signal: executionContext.signal,
    });
    expect(harness.tasks.submit).toHaveBeenCalledWith({
      commentId: 'manual-comment',
      operationId: executionContext.operationId,
      scope: harness.scope.scope,
      executionContext: expect.objectContaining({ elementKey: 'heading.home.title' }),
      signal: executionContext.signal,
    });
  });

  it('maps persisted and direct-run states to the five Chinese comment states', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [
          liveComment({ id: 'pending', state: 'idle', updatedAt: 1 }),
          liveComment({ id: 'running', state: 'editing', updatedAt: 2 }),
          liveComment({ id: 'done', state: 'completed', updatedAt: 3 }),
          liveComment({ id: 'failed', state: 'error', updatedAt: 4 }),
          liveComment({ id: 'cancelled', state: 'cancelled', updatedAt: 5 }),
        ],
        images: [],
      },
    });

    const result = await harness.operations.list({
      scope: harness.scope,
      signal: executionContext.signal,
    });

    expect(result.comments.map((comment) => [comment.commentId, comment.status])).toEqual([
      ['cancelled', '已取消'],
      ['failed', '执行失败'],
      ['done', '已完成'],
      ['running', '执行中'],
      ['pending', '待处理'],
    ]);
  });

  it('projects persisted completed and error states after running tasks disappear from the list', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [
          liveComment({
            id: 'completed-comment',
            state: 'completed',
            voiceStatus: '执行中',
            requestId: 'completed-execution',
            latestExecution: {
              executionId: 'completed-execution',
              status: '执行中',
              updatedAt: 80,
            },
          }),
          liveComment({
            id: 'failed-comment',
            state: 'error',
            voiceStatus: '执行中',
            requestId: 'failed-execution',
            latestExecution: {
              executionId: 'failed-execution',
              status: '执行中',
              updatedAt: 70,
            },
          }),
          liveComment({
            id: 'cancelled-comment',
            state: 'completed',
            voiceStatus: '已取消',
            requestId: 'cancelled-execution',
            latestExecution: {
              executionId: 'cancelled-execution',
              status: '已取消',
              updatedAt: 60,
            },
          }),
        ],
        images: [],
      },
    });

    const result = await harness.operations.list({
      scope: harness.scope,
      signal: executionContext.signal,
    });

    expect(result.comments.map((comment) => ({
      commentId: comment.commentId,
      status: comment.status,
      executionStatus: comment.latestExecution?.status,
    }))).toEqual([
      { commentId: 'completed-comment', status: '已完成', executionStatus: '已完成' },
      { commentId: 'failed-comment', status: '执行失败', executionStatus: '执行失败' },
      { commentId: 'cancelled-comment', status: '已取消', executionStatus: '已取消' },
    ]);
  });

  it('executes by commentId using stored content and target even when the task list is empty', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).resolves.toEqual({
      executionId: 'run-created',
      commentId: 'comment-1',
      status: '执行中',
      phase: 'running',
    });

    expect(harness.tasks.resolve).toHaveBeenCalledWith({
      commentId: 'comment-1',
      signal: executionContext.signal,
    });
    expect(harness.tasks.submit).toHaveBeenCalledWith({
      commentId: 'comment-1',
      operationId: 'operation-1',
      scope: harness.scope.scope,
      executionContext: expect.objectContaining({
        commentId: 'comment-1',
        elementKey: 'heading.home.title',
        promptText: '完整批注提示词',
      }),
      signal: executionContext.signal,
    });
    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({
      state: 'editing',
      requestId: 'run-created',
    }));
    expect(harness.tasks.sync).toHaveBeenCalledTimes(2);
    expect(harness.write.mock.invocationCallOrder[0]).toBeLessThan(
      harness.tasks.sync.mock.invocationCallOrder[0],
    );
  });

  it('recovers a runtime-created comment by operation id before host enrichment retries', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          voiceCreateOperationId: 'operation-create-1',
          voiceTargetRef: pageTarget.targetRef,
          voiceTarget: pageTarget,
        })],
        images: [],
      },
    });

    await expect(harness.operations.getCreatedByOperationId({
      operationId: 'operation-create-1',
      scope: harness.scope,
      signal: executionContext.signal,
    })).resolves.toMatchObject({
      commentId: 'comment-1',
      content: '提高保存按钮的对比度',
      target: pageTarget,
      status: '待处理',
    });
  });

  it('rejects a stale persisted locator before starting an AI execution', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
      targetValid: false,
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).rejects.toMatchObject({
      code: 'COMMENT_TARGET_STALE',
      message: '页面已变化，请重新查找并新建批注',
    });
    expect(harness.tasks.submit).not.toHaveBeenCalled();
    expect(harness.write).not.toHaveBeenCalled();
  });

  it('keeps execute idempotent for the same operationId', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
    });

    const input = {
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    };
    const first = await harness.operations.submitCommentExecution(input);
    const second = await harness.operations.submitCommentExecution(input);

    expect(second).toEqual(first);
    expect(harness.tasks.submit).toHaveBeenCalledTimes(1);
  });

  it('returns the running execution for a second operation on the same comment', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          state: 'editing',
          voiceStatus: '执行中',
          requestId: 'run-existing',
          voiceExecuteOperationId: 'operation-existing',
          latestExecution: {
            executionId: 'run-existing',
            status: '执行中',
            phase: 'running',
            updatedAt: 80,
          },
        })],
        images: [],
      },
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: 'operation-new',
      signal: executionContext.signal,
    })).resolves.toEqual({
      executionId: 'run-existing',
      commentId: 'comment-1',
      status: '执行中',
      phase: 'running',
    });
    expect(harness.tasks.resolve).not.toHaveBeenCalled();
    expect(harness.tasks.submit).not.toHaveBeenCalled();
  });

  it('serializes concurrent operations for the same comment', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
    });
    let releaseStart!: (value: unknown) => void;
    harness.tasks.submit.mockImplementationOnce(() => new Promise((resolve) => {
      releaseStart = resolve;
    }));

    const firstPromise = harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: 'operation-concurrent-a',
      signal: executionContext.signal,
    });
    const secondPromise = harness.createOperations().submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: 'operation-concurrent-b',
      signal: executionContext.signal,
    });
    await vi.waitFor(() => expect(harness.tasks.submit).toHaveBeenCalled());
    releaseStart({ accepted: true, runId: 'run-concurrent', status: 'running' });

    await expect(Promise.all([firstPromise, secondPromise])).resolves.toEqual([
      { executionId: 'run-concurrent', commentId: 'comment-1', status: '执行中', phase: 'running' },
      { executionId: 'run-concurrent', commentId: 'comment-1', status: '执行中', phase: 'running' },
    ]);
    expect(harness.tasks.submit).toHaveBeenCalledOnce();
  });

  it('replaces an older request id when re-executing a settled comment', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          state: 'completed',
          requestId: 'run-old',
          provider: 'codex',
          sessionId: 'session-old',
          message: 'old failure',
          code: 'OLD_ERROR',
          voiceStatus: '已完成',
          voiceExecuteOperationId: 'operation-old',
          latestExecution: {
            executionId: 'run-old',
            status: '已完成',
            phase: 'completed',
            updatedAt: 80,
          },
        })],
        images: [],
      },
    });

    await harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: 'operation-new',
      signal: executionContext.signal,
    });

    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({
      requestId: 'run-created',
      voiceExecuteOperationId: 'operation-new',
    }));
    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({
      provider: undefined,
      sessionId: undefined,
      message: undefined,
      code: undefined,
    }));
  });

  it('rejects a started execution when the host does not return a real executionId', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
      taskStart: true,
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).rejects.toMatchObject({
      code: 'COMMENT_EXECUTION_ID_MISSING',
      recoverable: true,
    });
  });

  it('does not overwrite a terminal state persisted while the existing start callback was running', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
      taskStart: true,
    });
    harness.tasks.submit.mockImplementationOnce(async () => {
      harness.replaceDocument({
        ...harness.readDocument(),
        comments: [liveComment({
          state: 'completed',
          requestId: 'operation-1',
          updatedAt: 90,
        })],
      });
      return { accepted: true, runId: 'run-created', status: 'completed' };
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).resolves.toEqual({
      executionId: 'run-created',
      commentId: 'comment-1',
      status: '已完成',
      phase: 'completed',
    });
    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({
      state: 'completed',
      voiceStatus: '已完成',
    }));
  });

  it('does not start the same execution twice when persistence fails after the side effect', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
    });
    harness.write.mockImplementation(async (_scope, nextDocument) => {
      if (nextDocument.comments[0]?.latestExecution?.executionId) {
        throw new Error('temporary write failure');
      }
      harness.replaceDocument(nextDocument);
    });
    const input = {
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    };

    await expect(harness.operations.submitCommentExecution(input)).rejects.toThrow('temporary write failure');
    harness.write.mockImplementation(async (_scope, nextDocument) => {
      harness.replaceDocument(nextDocument);
    });
    harness.tasks.resolve.mockResolvedValue(null);
    await expect(harness.createOperations().submitCommentExecution(input)).resolves.toMatchObject({
      executionId: 'run-created',
      phase: 'running',
    });
    expect(harness.tasks.submit).toHaveBeenCalledTimes(1);
    expect(harness.tasks.resolve).toHaveBeenCalledTimes(1);
    expect(harness.tasks.findByOperationId).toHaveBeenCalledWith({
      operationId: 'operation-1',
      signal: executionContext.signal,
    });
  });

  it('safely starts an intrinsically idempotent operation when only its durable preparation marker exists', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          voiceExecuteOperationId: 'operation-1',
          voiceExecutionPreparedAt: 50,
        })],
        images: [],
      },
    });
    harness.tasks.findByOperationId.mockResolvedValueOnce(null);

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).resolves.toMatchObject({ executionId: 'run-created', phase: 'running' });
    expect(harness.tasks.submit).toHaveBeenCalledOnce();
    expect(harness.tasks.resolve).toHaveBeenCalledOnce();
  });

  it('recovers another caller\'s durable preparation marker instead of replacing it', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          voiceExecuteOperationId: 'operation-existing',
          voiceExecutionPreparedAt: 50,
        })],
        images: [],
      },
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: 'operation-new',
      signal: executionContext.signal,
    })).resolves.toMatchObject({ executionId: 'run-created', phase: 'running' });
    expect(harness.tasks.findByOperationId).toHaveBeenCalledWith({
      operationId: 'operation-existing',
      signal: executionContext.signal,
    });
    expect(harness.tasks.submit).not.toHaveBeenCalled();
  });

  it('clears a durable preparation marker after a definitive execution rejection', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
      taskStart: { accepted: false },
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).rejects.toMatchObject({ code: 'COMMENT_EXECUTION_REJECTED' });
    expect(harness.readDocument().comments[0].voiceExecuteOperationId).toBeUndefined();
  });

  it('rejects missing comments and comments outside the current page before starting', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({ pageScope: 'settings' })],
        images: [],
      },
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'missing',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).rejects.toMatchObject({
      code: 'COMMENT_NOT_FOUND',
      message: '未找到这条批注，请刷新后重试',
    });
    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).rejects.toMatchObject({
      code: 'COMMENT_PAGE_MISMATCH',
      message: '这条批注不属于当前页面，请切换到对应页面后重试',
    });
    expect(harness.tasks.submit).not.toHaveBeenCalled();
  });

  it('returns a recoverable Chinese error when the stored page target is stale', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
    });
    harness.tasks.submit.mockRejectedValueOnce(new Error('stale target'));

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: executionContext.operationId,
      signal: executionContext.signal,
    })).rejects.toEqual(expect.objectContaining({
      code: 'COMMENT_TARGET_STALE',
      message: '页面已变化，请重新查找并新建批注',
      recoverable: true,
    }));
    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({ state: 'error' }));
  });

  it('cancels a started direct run when the caller aborts during submission', async () => {
    const controller = new AbortController();
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [],
      },
    });
    harness.tasks.submit.mockImplementationOnce(async () => {
      controller.abort();
      return { accepted: true, executionId: 'execution-aborted', phase: 'running' };
    });

    await expect(harness.operations.submitCommentExecution({
      commentId: 'comment-1',
      scope: harness.scope,
      operationId: 'operation-aborted',
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.tasks.cancel).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'execution-aborted',
      operationId: 'operation-aborted',
      callId: 'operation-aborted',
      signal: expect.not.objectContaining({ aborted: true }),
    }));
  });

  it('gets and cancels an execution by executionId and projects its owning comment status', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({ state: 'editing', requestId: 'execution-1' })],
        images: [],
      },
      taskGet: { operationId: 'operation-1', executionId: 'execution-1', phase: 'running' },
    });

    await expect(harness.operations.getExecution({
      executionId: 'execution-1',
      scope: harness.scope,
      signal: executionContext.signal,
    })).resolves.toEqual({
      executionId: 'execution-1',
      commentId: 'comment-1',
      status: '执行中',
      commentStatus: '执行中',
      phase: 'running',
    });
    await expect(harness.operations.cancelExecution({
      executionId: 'execution-1',
      scope: harness.scope,
      ...executionContext,
    })).resolves.toEqual({
      executionId: 'execution-1',
      commentId: 'comment-1',
      status: '已取消',
      phase: 'cancelled',
    });

    expect(harness.tasks.get).toHaveBeenCalledWith({
      taskId: 'execution-1',
      signal: executionContext.signal,
    });
    expect(harness.tasks.cancel).toHaveBeenCalledWith({
      taskId: 'execution-1',
      operationId: 'operation-1',
      callId: 'call-1',
      signal: executionContext.signal,
    });
    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({
      state: 'idle',
      voiceStatus: '已取消',
    }));
  });

  it('persists a terminal status reconciled while reading an execution', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          state: 'editing',
          voiceStatus: '执行中',
          requestId: 'execution-1',
          latestExecution: {
            executionId: 'execution-1',
            status: '执行中',
            phase: 'running',
            updatedAt: 80,
          },
        })],
        images: [],
      },
      taskGet: { operationId: 'operation-1', executionId: 'execution-1', phase: 'completed' },
    });

    await harness.operations.getExecution({
      executionId: 'execution-1',
      scope: harness.scope,
      signal: executionContext.signal,
    });

    expect(harness.readDocument().comments[0]).toEqual(expect.objectContaining({
      state: 'completed',
      voiceStatus: '已完成',
      latestExecution: expect.objectContaining({
        executionId: 'execution-1',
        status: '已完成',
        phase: 'completed',
      }),
    }));
  });

  it('reconciles a prepared cancellation across operation recreation without treating an idempotent retry as missing', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          state: 'editing',
          requestId: 'execution-1',
          latestExecution: { executionId: 'execution-1', status: '执行中', updatedAt: 50 },
        })],
        images: [],
      },
    });
    harness.write.mockImplementation(async (_scope, nextDocument) => {
      if (nextDocument.comments[0]?.voiceCancelOperationId) {
        throw new Error('temporary write failure');
      }
      harness.replaceDocument(nextDocument);
    });
    const input = { executionId: 'execution-1', scope: harness.scope, ...executionContext };

    await expect(harness.operations.cancelExecution(input)).rejects.toThrow('temporary write failure');
    harness.write.mockImplementation(async (_scope, nextDocument) => {
      harness.replaceDocument(nextDocument);
    });
    harness.tasks.cancel.mockResolvedValueOnce({ cancelled: false, status: 'aborted' });
    harness.tasks.get.mockResolvedValueOnce({ taskId: 'execution-1', status: 'aborted' });
    await expect(harness.createOperations().cancelExecution(input)).resolves.toMatchObject({
      executionId: 'execution-1',
      phase: 'cancelled',
    });
    expect(harness.tasks.cancel).toHaveBeenCalledTimes(2);
  });

  it('does not report cancellation when the execution already completed', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({ state: 'editing', requestId: 'execution-1' })],
        images: [],
      },
      taskCancel: { cancelled: false },
      taskGet: { taskId: 'execution-1', status: 'completed' },
    });

    await expect(harness.operations.cancelExecution({
      executionId: 'execution-1',
      scope: harness.scope,
      ...executionContext,
    })).rejects.toMatchObject({
      code: 'COMMENT_EXECUTION_ALREADY_SETTLED',
      message: '这条批注已经结束，无法再取消',
    });
    expect(harness.readDocument().comments[0].voiceStatus).not.toBe('已取消');
  });

  it('gets a persisted terminal execution after the active task record disappears', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({
          state: 'error',
          voiceStatus: '执行中',
          requestId: 'execution-failed',
          latestExecution: {
            executionId: 'execution-failed',
            status: '执行中',
            updatedAt: 80,
          },
        })],
        images: [],
      },
      taskGet: null,
    });

    await expect(harness.operations.getExecution({
      executionId: 'execution-failed',
      scope: harness.scope,
      signal: executionContext.signal,
    })).resolves.toEqual({
      executionId: 'execution-failed',
      commentId: 'comment-1',
      status: '执行失败',
      commentStatus: '执行失败',
      phase: 'failed',
    });
  });

  it('tombstones a deleted comment without removing other document fields', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment()],
        images: [{ id: 'image-1', commentId: 'comment-1' }],
        customDocumentField: 'preserve-me',
      },
    });

    await expect(harness.operations.delete({
      commentId: 'comment-1',
      scope: harness.scope,
      ...executionContext,
    })).resolves.toEqual({ commentId: 'comment-1', deleted: true });

    expect(harness.write).toHaveBeenCalledWith(
      harness.scope.scope,
      expect.objectContaining({
        schemaVersion: 3,
        customDocumentField: 'preserve-me',
        comments: [expect.objectContaining({ id: 'comment-1', deletedAt: 100, updatedAt: 100 })],
        images: [{ id: 'image-1', commentId: 'comment-1' }],
      }),
      'clear',
      { observedTombstones: [{ kind: 'comment', commentId: 'comment-1', deletedAt: 100 }] },
    );
  });

  it('rejects deleting a comment that belongs to another page', async () => {
    const harness = createHarness({
      document: {
        schemaVersion: 3,
        kind: 'prototype-edit-comments',
        resource: { id: 'home', targetPath: 'prototypes/home', filePath: 'src/prototypes/home/index.tsx' },
        comments: [liveComment({ pageScope: 'settings' })],
        images: [],
      },
    });

    await expect(harness.operations.delete({
      commentId: 'comment-1',
      scope: harness.scope,
      ...executionContext,
    })).rejects.toMatchObject({
      code: 'COMMENT_PAGE_MISMATCH',
      message: '这条批注不属于当前页面，请切换到对应页面后重试',
    });
    expect(harness.write).not.toHaveBeenCalled();
  });

  it('uses a stable Chinese recoverable error when persistence is unavailable', async () => {
    const operations = createMakeVoiceCommentOperations({ resolveScope: () => null });

    await expect(operations.read({
      scope: null,
      signal: executionContext.signal,
    })).rejects.toEqual(expect.objectContaining({
      code: 'COMMENT_CONTEXT_UNAVAILABLE',
      message: '当前页面暂时无法读取批注，请刷新后重试',
      recoverable: true,
    }));
    expect(MakeVoiceCommentPersistenceError).toBeTypeOf('function');
  });
});
