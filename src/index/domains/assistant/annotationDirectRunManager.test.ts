import { describe, expect, it, vi } from 'vitest';

import {
  createAnnotationDirectRunPreflightResult,
  createAnnotationDirectRunRegistry,
  type AnnotationDirectRunEvent,
  type AnnotationDirectRunSubmitRequest,
} from './annotationDirectRunManager';

function createAbortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

describe('annotation direct run registry', () => {
  it('reuses the same run handle when the host retries an operationId', async () => {
    let release: (() => void) | null = null;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submit = vi.fn(async () => {
      await pending;
      return true;
    });
    const registry = createAnnotationDirectRunRegistry();
    const input = {
      context: {},
      prompt: 'Update the selected card',
      requestId: 'voice-operation-1',
      maxActiveRuns: 3,
      submit,
    };

    const first = registry.startRun(input);
    const retry = registry.startRun(input);

    expect(retry).toBe(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(registry.getOperation('voice-operation-1')).toEqual({
      operationId: 'voice-operation-1',
      executionId: 'voice-operation-1',
      phase: 'running',
    });
    release?.();
    if (first.started) await expect(first.promise).resolves.toBe(true);
    expect(registry.getOperation('voice-operation-1')?.phase).toBe('completed');
  });

  it('forwards source stream events through the existing run lifecycle', async () => {
    const streamEvents: unknown[] = [];
    const registry = createAnnotationDirectRunRegistry({ createRequestId: () => 'stream' });

    const result = registry.startRun({
      context: { page: 'home' },
      prompt: 'Inspect the selected element.',
      maxActiveRuns: 1,
      onStreamEvent: (event) => streamEvents.push(event),
      submit: async (request) => {
        await request.onEvent?.({ event: 'run.text.delta', data: { delta: 'Hello' } });
        return true;
      },
    });

    if (!result.started) throw new Error('Expected the direct run to start');
    await expect(result.promise).resolves.toBe(true);
    expect(streamEvents).toEqual([{ event: 'run.text.delta', data: { delta: 'Hello' } }]);
  });

  it('broadcasts a single run lifecycle without mutating UI state itself', async () => {
    const events: AnnotationDirectRunEvent[] = [];
    const submit = vi.fn(async (request: AnnotationDirectRunSubmitRequest<Record<string, unknown>>) => {
      await request.onPrepared?.({
        provider: 'codex',
        threadId: 'thread-card-a',
        runId: 'run-card-a',
      });
      await request.onAccepted?.({
        provider: 'codex',
        threadId: 'thread-card-a',
        runId: 'run-card-a',
        conversationId: 'thread-card-a',
      });
      return {
        runId: 'run-card-a',
        threadId: 'thread-card-a',
      };
    });
    const registry = createAnnotationDirectRunRegistry({
      createRequestId: () => 'draft-card-a',
    });

    const started = registry.startRun({
      context: { page: 'home' },
      prompt: 'Update only card A',
      maxActiveRuns: 3,
      editingTargets: [{
        pane: 'primary',
        elementKey: 'card-a',
        targetRef: {
          label: 'Card A',
        },
      }],
      submit,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(started.started).toBe(true);
    if (!started.started) return;

    await expect(started.promise).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      context: { page: 'home' },
      prompt: 'Update only card A',
      editingTargets: [expect.objectContaining({ elementKey: 'card-a' })],
      signal: expect.any(AbortSignal),
      onPrepared: expect.any(Function),
      onAccepted: expect.any(Function),
    }));
    expect(events.map((event) => event.type)).toEqual([
      'started',
      'prepared',
      'accepted',
      'completed',
      'settled',
    ]);
    expect(events[0]).toMatchObject({
      type: 'started',
      runKey: 'draft-card-a-1',
      taskRef: {
        provider: 'api',
        sessionId: null,
        requestId: 'draft-card-a',
      },
      editingTargets: [expect.objectContaining({
        pane: 'primary',
        elementKey: 'card-a',
      })],
    });
    expect(events[1]).toMatchObject({
      type: 'prepared',
      taskRef: {
        provider: 'codex',
        sessionId: 'thread-card-a',
        requestId: 'run-card-a',
      },
    });
    expect(events[3]).toMatchObject({
      type: 'completed',
      taskRef: {
        provider: 'codex',
        sessionId: 'thread-card-a',
        requestId: 'run-card-a',
      },
    });
    expect(registry.getActiveRunCount()).toBe(0);
  });

  it('treats a feedback-handled preflight result as skipped instead of an execution error', async () => {
    const events: AnnotationDirectRunEvent[] = [];
    const registry = createAnnotationDirectRunRegistry({
      createRequestId: () => 'ai-settings-required',
    });

    const started = registry.startRun({
      context: {},
      prompt: 'Update the selected card',
      maxActiveRuns: 1,
      submit: async () => createAnnotationDirectRunPreflightResult(),
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(started.started).toBe(true);
    if (!started.started) return;

    await expect(started.promise).resolves.toBe(true);
    expect(events.map((event) => event.type)).toEqual([
      'started',
      'skipped',
      'settled',
    ]);
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(registry.getActiveRunCount()).toBe(0);
  });

  it('allows multiple listeners for the same conversation and aborts each run exactly once', async () => {
    const events: AnnotationDirectRunEvent[] = [];
    let preparedResolve: (() => void) | null = null;
    const preparedPromise = new Promise<void>((resolve) => {
      preparedResolve = resolve;
    });
    const submit = vi.fn(async (request: AnnotationDirectRunSubmitRequest<Record<string, unknown>>) => {
      await request.onPrepared?.({
        provider: 'codex',
        threadId: 'shared-thread',
        runId: request.prompt.includes('A') ? 'run-a' : 'run-b',
      });
      await new Promise((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(createAbortError());
          return;
        }
        request.signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
      });
      return false;
    });
    const registry = createAnnotationDirectRunRegistry({
      createRequestId: () => 'draft-run',
    });

    const first = registry.startRun({
      context: {},
      prompt: 'Prompt A',
      maxActiveRuns: 3,
      editingTargets: [{ pane: 'primary', elementKey: 'card-a' }],
      submit,
      onEvent: (event) => {
        events.push(event);
        if (events.filter((item) => item.type === 'prepared').length === 2) {
          preparedResolve?.();
        }
      },
    });
    const second = registry.startRun({
      context: {},
      prompt: 'Prompt B',
      maxActiveRuns: 3,
      editingTargets: [{ pane: 'primary', elementKey: 'card-b' }],
      submit,
      onEvent: (event) => {
        events.push(event);
        if (events.filter((item) => item.type === 'prepared').length === 2) {
          preparedResolve?.();
        }
      },
    });

    expect(first.started).toBe(true);
    expect(second.started).toBe(true);
    await preparedPromise;
    expect(registry.getActiveRunCount()).toBe(2);

    const abortCount = await registry.abortAll();

    expect(abortCount).toBe(2);
    if (first.started) await expect(first.promise).resolves.toBe(false);
    if (second.started) await expect(second.promise).resolves.toBe(false);
    expect(events.filter((event) => event.type === 'prepared')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'aborted')).toEqual([
      expect.objectContaining({
        editingTargets: [expect.objectContaining({ elementKey: 'card-a' })],
        taskRef: expect.objectContaining({ requestId: 'run-a', sessionId: 'shared-thread' }),
      }),
      expect.objectContaining({
        editingTargets: [expect.objectContaining({ elementKey: 'card-b' })],
        taskRef: expect.objectContaining({ requestId: 'run-b', sessionId: 'shared-thread' }),
      }),
    ]);
    expect(events.filter((event) => event.type === 'settled')).toHaveLength(2);
    expect(registry.getActiveRunCount()).toBe(0);
  });

  it('aborts only the run matching a task session or request id', async () => {
    const registry = createAnnotationDirectRunRegistry({
      createRequestId: (() => {
        let next = 0;
        return () => `request-${++next}`;
      })(),
    });
    let preparedCount = 0;
    let resolvePrepared!: () => void;
    const prepared = new Promise<void>((resolve) => {
      resolvePrepared = resolve;
    });
    const waitForAbort = async (request: AnnotationDirectRunSubmitRequest<Record<string, unknown>>) => {
      await request.onPrepared?.({
        provider: 'codex',
        threadId: request.prompt === 'first' ? 'thread-first' : 'thread-second',
        runId: request.prompt === 'first' ? 'run-first' : 'run-second',
      });
      preparedCount += 1;
      if (preparedCount === 2) resolvePrepared();
      await new Promise<void>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
      });
      return false;
    };
    const first = registry.startRun({ context: {}, prompt: 'first', maxActiveRuns: 2, submit: waitForAbort });
    const second = registry.startRun({ context: {}, prompt: 'second', maxActiveRuns: 2, submit: waitForAbort });
    if (!first.started || !second.started) throw new Error('Expected both direct runs to start');

    await prepared;
    await expect(registry.abortRun('thread-first')).resolves.toBe(true);
    await expect(first.promise).resolves.toBe(false);
    expect(registry.getActiveRunCount()).toBe(1);
    await expect(registry.abortRun('thread-second')).resolves.toBe(true);
    await expect(second.promise).resolves.toBe(false);
    expect(registry.getActiveRunCount()).toBe(0);
  });

  it('keeps an aborted run terminal even when submit resolves after abort', async () => {
    const events: AnnotationDirectRunEvent[] = [];
    let resolveSubmit: ((value: boolean) => void) | null = null;
    let notifySubmitStarted: (() => void) | null = null;
    const submitStarted = new Promise<void>((resolve) => {
      notifySubmitStarted = resolve;
    });
    const submit = vi.fn(async (_request: AnnotationDirectRunSubmitRequest<Record<string, unknown>>) => {
      notifySubmitStarted?.();
      return new Promise<boolean>((submitResolve) => {
        resolveSubmit = submitResolve;
      });
    });
    const registry = createAnnotationDirectRunRegistry({
      createRequestId: () => 'late-abort',
    });

    const started = registry.startRun({
      context: {},
      prompt: 'Prompt late abort',
      maxActiveRuns: 3,
      editingTargets: [{ pane: 'primary', elementKey: 'card-late' }],
      submit,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(started.started).toBe(true);
    if (!started.started) return;
    await submitStarted;
    await started.abort();
    resolveSubmit?.(true);
    await expect(started.promise).resolves.toBe(false);

    expect(events.filter((event) => event.type === 'aborted')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'completed')).toHaveLength(0);
    expect(registry.getActiveRunCount()).toBe(0);
  });
});
