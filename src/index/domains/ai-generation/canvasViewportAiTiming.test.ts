import { describe, expect, it } from 'vitest';

import { createCanvasViewportAiTiming } from './canvasViewportAiTiming';

interface TimingEntry {
  message: string;
  metadata: Record<string, unknown>;
}

function createHarness(initialNow = 100) {
  const entries: TimingEntry[] = [];
  let currentNow = initialNow;
  const timing = createCanvasViewportAiTiming({
    provider: 'codex',
    canvasFilePath: 'src/resources/board.excalidraw',
    now: () => currentNow,
    log: (message, metadata) => entries.push({ message, metadata }),
  });
  return {
    entries,
    timing,
    setNow(value: number) {
      currentNow = value;
    },
  };
}

describe('canvas viewport AI timing', () => {
  it('records click-to-first-response and click-to-completion once', () => {
    const harness = createHarness();

    harness.setNow(125.4);
    harness.timing.accepted({ runId: 'run-1', threadId: 'thread-1' });
    harness.setNow(180.6);
    harness.timing.handleStreamEvent({
      event: 'run.reasoning.delta',
      data: { delta: 'thinking' },
    });
    harness.setNow(220);
    harness.timing.handleStreamEvent({
      event: 'run.text.delta',
      data: { delta: 'answer' },
    });
    harness.setNow(260.2);
    harness.timing.completed();

    expect(harness.entries.map((entry) => entry.message)).toEqual([
      '[canvas-viewport-ai:timing] started',
      '[canvas-viewport-ai:timing] accepted',
      '[canvas-viewport-ai:timing] first-response',
      '[canvas-viewport-ai:timing] completed',
    ]);
    expect(harness.entries[2].metadata).toMatchObject({
      elapsedMs: 81,
      responseEvent: 'run.reasoning.delta',
      runId: 'run-1',
      threadId: 'thread-1',
    });
    expect(harness.entries[3].metadata).toMatchObject({
      elapsedMs: 160,
      runId: 'run-1',
      threadId: 'thread-1',
    });
  });

  it('ignores unrelated and whitespace-only stream events', () => {
    const harness = createHarness();

    harness.setNow(120);
    harness.timing.handleStreamEvent({ event: 'run.accepted', data: {} });
    harness.timing.handleStreamEvent({ event: 'run.text.delta', data: { delta: '   ' } });
    harness.setNow(140);
    harness.timing.handleStreamEvent({ event: 'run.text.delta', data: { delta: 'hello' } });

    expect(harness.entries.map((entry) => entry.message)).toEqual([
      '[canvas-viewport-ai:timing] started',
      '[canvas-viewport-ai:timing] first-response',
    ]);
    expect(harness.entries[1].metadata.elapsedMs).toBe(40);
  });

  it('rounds elapsed time and clamps backwards clock movement to zero', () => {
    const harness = createHarness();

    harness.setNow(90);
    harness.timing.accepted({ runId: 'run-1' });

    expect(harness.entries[1].metadata.elapsedMs).toBe(0);
  });

  it('emits only the first terminal event', () => {
    const harness = createHarness();

    harness.setNow(150);
    harness.timing.aborted();
    harness.timing.completed();
    harness.timing.failed(new Error('late failure'));

    expect(harness.entries.map((entry) => entry.message)).toEqual([
      '[canvas-viewport-ai:timing] started',
      '[canvas-viewport-ai:timing] aborted',
    ]);
    expect(harness.entries[1].metadata.elapsedMs).toBe(50);
  });

  it('normalizes failure details without exposing logger failures', () => {
    expect(() => {
      const timing = createCanvasViewportAiTiming({
        provider: 'codex',
        canvasFilePath: 'src/resources/board.excalidraw',
        now: () => 100,
        log: () => {
          throw new Error('console unavailable');
        },
      });
      timing.failed(new Error('request failed'));
    }).not.toThrow();

    const harness = createHarness();
    harness.timing.failed(new Error('request failed'));
    expect(harness.entries[1]).toMatchObject({
      message: '[canvas-viewport-ai:timing] error',
      metadata: { error: 'request failed' },
    });
  });
});
