import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createCanvasWorkStore } from './assistantWorkStore.ts';
import { createAssistantWorkDispatcher } from './assistantWorkDispatcher.ts';

async function createHarness() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'assistant-work-dispatcher-test-'));
  const store = createCanvasWorkStore({ projectRoot, projectId: 'project-1' });
  const runs: Array<{ threadId: string; objective: string; baseRevision: string }> = [];
  let threadCounter = 0;
  let runCounter = 0;
  const acp = {
    createThread: vi.fn(async () => ({ threadId: `thread-${++threadCounter}` })),
    createRun: vi.fn(async ({ threadId, objective, work }: { threadId: string; objective: string; work: { baseRevision: string } }) => {
      runs.push({ threadId, objective, baseRevision: work.baseRevision });
      return { runId: `run-${++runCounter}` };
    }),
    queryRuntime: vi.fn(async () => ({ runState: 'running' })),
    subscribeRuntime: vi.fn(() => ({ abort: vi.fn(), done: Promise.resolve(undefined) })),
    abortRun: vi.fn(async () => undefined),
  };
  const dispatcher = createAssistantWorkDispatcher({ store, acp, concurrency: 1 });
  return { store, acp, dispatcher, runs };
}

describe('assistant work dispatcher', () => {
  it('allocates independent threads and respects the concurrency slot', async () => {
    const { store, acp, dispatcher, runs } = await createHarness();
    const first = await store.create({ resourcePath: 'flows/a.excalidraw', operationId: 'one', objective: 'one', baseRevision: 'r1' });
    const second = await store.create({ resourcePath: 'flows/a.excalidraw', operationId: 'two', objective: 'two', baseRevision: 'r1' });
    await dispatcher.start(first);
    await dispatcher.start(second);
    expect(acp.createRun).toHaveBeenCalledTimes(1);
    expect(runs[0]).toMatchObject({ threadId: 'thread-1', objective: 'one' });
    await dispatcher.stop();
  });

  it('queues a single running follow-up and rejects a second queued follow-up', async () => {
    const { store, dispatcher } = await createHarness();
    const work = await store.create({ resourcePath: 'flows/a.excalidraw', operationId: 'one', objective: 'one', baseRevision: 'r1' });
    await dispatcher.start(work);
    await expect(dispatcher.followUp('flows/a.excalidraw', work.workId, { operationId: 'follow-1', content: '继续', baseRevision: 'r1' })).resolves.toMatchObject({ status: 'waiting' });
    await expect(dispatcher.followUp('flows/a.excalidraw', work.workId, { operationId: 'follow-2', content: '再继续', baseRevision: 'r1' })).rejects.toMatchObject({ code: 'WORK_FOLLOW_UP_ALREADY_QUEUED' });
    await dispatcher.stop();
  });

  it('starts a follow-up from the latest completed revision', async () => {
    const { store, dispatcher, acp, runs } = await createHarness();
    const work = await store.create({ resourcePath: 'flows/a.excalidraw', operationId: 'one', objective: 'one', baseRevision: 'r1' });
    await store.update('flows/a.excalidraw', work.workId, (value) => ({ ...value, status: 'running', threadId: 'thread-1', runId: 'run-1' }));
    await store.update('flows/a.excalidraw', work.workId, (value) => ({
      ...value,
      status: 'completed',
      resultRevision: 'r2',
      summary: 'done',
      pendingFollowUp: { operationId: 'follow-1', content: '继续', queuedAt: new Date().toISOString() },
      completedAt: new Date().toISOString(),
    }));
    acp.queryRuntime.mockResolvedValueOnce({ runState: 'completed', resultRevision: 'r2' } as any);
    await dispatcher.recoverAll(['flows/a.excalidraw']);
    expect(acp.createRun).toHaveBeenCalledTimes(1);
    expect(runs[0]).toMatchObject({ objective: '继续', baseRevision: 'r2' });
    await dispatcher.stop();
  });
});
