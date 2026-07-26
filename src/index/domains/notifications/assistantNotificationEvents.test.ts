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

  it('uses a new event id for each terminal run in the same thread', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)?.eventId).toBe('assistant:thread-1:1');
    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)?.eventId).toBe('assistant:thread-1:2');
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
        headId: 'message-1',
        messages: [{
          id: 'message-1',
          role: 'assistant',
          content: {
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

  it('ignores historical terminal metadata until the current head is finalized', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.runtime.changed',
        threadId: 'thread-3',
        runtime: { runState: 'running', isRunning: true },
      },
    })).toBeNull();
    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-3',
        headId: 'current-user-message',
        messages: [
          {
            id: 'previous-assistant-message',
            role: 'assistant',
            content: {
              metadata: { custom: { acpRun: { status: 'completed' } } },
            },
          },
          {
            id: 'current-user-message',
            role: 'user',
            content: {},
          },
        ],
      },
    })).toBeNull();
    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-3',
        headId: 'current-assistant-message',
        messages: [{
          id: 'current-assistant-message',
          role: 'assistant',
          content: {
            metadata: { custom: { acpRun: { status: 'completed' } } },
          },
        }],
      },
    })).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-3',
      outcome: 'completed',
      eventId: 'assistant:thread-3:1',
    });
  });
});
