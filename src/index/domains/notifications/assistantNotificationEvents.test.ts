import { describe, expect, it } from 'vitest';
import { createAssistantNotificationTracker } from './assistantNotificationEvents';

const running = {
  type: 'acp.event',
  payload: {
    kind: 'thread.runtime.changed',
    threadId: 'thread-1',
    runtime: { runState: 'running', isRunning: true },
  },
};
const completed = {
  type: 'acp.event',
  payload: {
    kind: 'thread.runtime.changed',
    threadId: 'thread-1',
    runtime: { runState: 'completed', isRunning: false },
  },
};

describe('assistant notification events', () => {
  it('reports one completed notification after an armed compatible terminal run', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-1',
      outcome: 'completed',
      eventId: 'assistant:thread-1:1',
    });
    expect(tracker.consume(completed)).toBeNull();
  });

  it('does not notify for initial history, streaming messages, or aborted runs', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume(completed)).toBeNull();
    expect(tracker.consume({
      type: 'acp.event',
      payload: { kind: 'thread.messages.changed', threadId: 'thread-1' },
    })).toBeNull();
    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.runtime.changed',
        threadId: 'thread-1',
        runtime: { runState: 'aborted' },
      },
    })).toBeNull();
  });

  it('settles an armed run from finalized assistant acpRun metadata', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.runtime.changed',
        threadId: 'thread-2',
        runtime: { runState: 'running', isRunning: true },
      },
    })).toBeNull();
    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-2',
        messages: [{
          id: 'message-1',
          content: {
            role: 'assistant',
            metadata: { custom: { acpRun: { status: 'error' } } },
          },
        }],
      },
    })).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-2',
      outcome: 'error',
      eventId: 'assistant:thread-2:1',
    });
  });
});
