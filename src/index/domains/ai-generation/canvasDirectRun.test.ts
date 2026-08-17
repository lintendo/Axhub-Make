import { describe, expect, it, vi } from 'vitest';

import {
  createCanvasDirectRunController,
  type CanvasDirectRunEvent,
} from './canvasDirectRun';
import type { CanvasAiGenerationRequest } from './CanvasAiGenerationTool';

function createRequest(prompt = '生成产品看板'): CanvasAiGenerationRequest {
  return {
    scene: 'page',
    source: 'canvas-start',
    prompt,
    canvasFilePath: 'src/resources/product.excalidraw',
    provider: 'codex',
    model: 'gpt-5.5',
    mode: null,
    thought: null,
    contextBundle: null,
    attachments: [],
    referenceImages: [],
  };
}

describe('canvas direct run controller', () => {
  it('limits concurrent canvas API runs and forwards abort signals', async () => {
    const events: CanvasDirectRunEvent[] = [];
    let releaseFirstRun: (() => void) | null = null;
    const firstRunReady = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });
    const submit = vi.fn(async ({ signal, onPrepared, onAccepted }) => {
      await onPrepared?.({ provider: 'codex', threadId: 'thread-one', runId: 'run-one' });
      await onAccepted?.({ provider: 'codex', threadId: 'thread-one', runId: 'run-one' });
      await firstRunReady;
      expect(signal).toBeInstanceOf(AbortSignal);
      return {
        output: 'done',
        reasoning: '',
        runId: 'run-one',
        threadId: 'thread-one',
        artifacts: [],
      };
    });
    const controller = createCanvasDirectRunController({
      maxActiveRuns: 1,
      submit,
      onEvent: (event) => events.push(event),
    });

    const first = controller.start(createRequest('第一轮'));
    const second = controller.start(createRequest('第二轮'));

    expect(first.started).toBe(true);
    expect(second).toEqual({
      started: false,
      reason: 'concurrency',
      activeRunCount: 1,
    });
    expect(controller.getActiveRunCount()).toBe(1);

    if (first.started) {
      await first.abort();
      releaseFirstRun?.();
      await expect(first.promise).resolves.toMatchObject({ ok: false, aborted: true });
    }
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      prompt: '第一轮',
      signal: expect.any(AbortSignal),
      onPrepared: expect.any(Function),
      onAccepted: expect.any(Function),
    });
    expect(events.map((event) => event.type)).toContain('aborted');
    expect(controller.getActiveRunCount()).toBe(0);
  });

  it('forwards lifecycle acceptance to callbacks supplied on the canvas request', async () => {
    const onAccepted = vi.fn();
    const controller = createCanvasDirectRunController({
      maxActiveRuns: 1,
      submit: async ({ onAccepted: accept }) => {
        await accept?.({ provider: 'codex', threadId: 'canvas-thread', runId: 'canvas-run' });
        return { ok: true, artifacts: [] };
      },
    });

    const started = controller.start({
      ...createRequest('继续当前画布'),
      onAccepted,
    });

    expect(started.started).toBe(true);
    if (!started.started) return;
    await expect(started.promise).resolves.toMatchObject({ ok: true });
    expect(onAccepted).toHaveBeenCalledWith({
      provider: 'codex',
      threadId: 'canvas-thread',
      runId: 'canvas-run',
    });
  });

  it('maps streamed API artifacts into canvas generation artifacts and ignores the current canvas file', async () => {
    const submit = vi.fn(async () => ({
      output: 'done',
      reasoning: '',
      runId: 'run-artifacts',
      threadId: 'thread-artifacts',
      artifacts: [
        {
          id: 'canvas-self',
          kind: 'document',
          operation: 'updated',
          target: { path: 'src/resources/product.excalidraw' },
        },
        {
          id: 'prototype-home',
          kind: 'prototype',
          operation: 'created',
          target: { path: 'src/prototypes/product-home/index.tsx' },
          metadata: { title: '产品首页' },
        },
      ],
    }));
    const controller = createCanvasDirectRunController({
      maxActiveRuns: 2,
      submit,
    });

    const started = controller.start(createRequest());

    expect(started.started).toBe(true);
    if (!started.started) return;
    await expect(started.promise).resolves.toMatchObject({
      ok: true,
      artifacts: [
        expect.objectContaining({
          artifactId: expect.stringContaining('prototype-home'),
          kind: 'prototype',
          title: '产品首页',
        }),
      ],
    });
  });
});
