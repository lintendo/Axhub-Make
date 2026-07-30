import { describe, expect, it } from 'vitest';
import { createNotificationDiagnostics } from './notificationDiagnostics';
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
    const diagnostics = createNotificationDiagnostics({ enabled: true });
    const tracker = createAssistantNotificationTracker(diagnostics);

    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-1',
      outcome: 'completed',
      eventId: 'assistant:thread-1:1',
    });
    expect(tracker.consume(completed)).toBeNull();
    expect(diagnostics.snapshot()).toMatchObject([{
      stage: 'assistant.intent.created',
      details: {
        threadId: 'thread-1',
        outcome: 'completed',
        eventId: 'assistant:thread-1:1',
      },
    }]);
  });

  it('uses a new event id for each terminal run in the same thread', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)?.eventId).toBe('assistant:thread-1:1');
    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)?.eventId).toBe('assistant:thread-1:2');
  });

  it('does not notify for initial history, malformed updates, or aborted runs', () => {
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

  it('settles an armed ACP 0.1.11 run from its post-run messages event', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.runtime.changed',
        threadId: 'thread-legacy',
        runtime: { runState: 'running', isRunning: true },
      },
    })).toBeNull();
    expect(tracker.consume({
      type: 'acp.event',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-legacy',
        messageCount: 2,
        changedAt: '2026-07-27T01:00:00.000Z',
      },
    })).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-legacy',
      outcome: 'completed',
      eventId: 'assistant:thread-legacy:1',
    });
  });

  it('uses explicit finalized assistant notification metadata without requiring a running event', () => {
    const tracker = createAssistantNotificationTracker();
    const terminalMessage = {
      type: 'acp.event',
      eventId: 'message-completed',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-explicit',
        notification: {
          kind: 'run-terminal',
          actor: 'assistant',
          messageId: 'assistant-message-1',
          runState: 'completed',
          finalized: true,
        },
      },
    };

    expect(tracker.consume(terminalMessage)).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-explicit',
      outcome: 'completed',
      eventId: 'assistant:thread-explicit:message:assistant-message-1:completed',
    });
    expect(tracker.consume({
      ...terminalMessage,
      eventId: 'message-completed-retry',
    })).toBeNull();
  });

  it('uses explicit finalized assistant error metadata without requiring a running event', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume({
      type: 'acp.event',
      eventId: 'message-error',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-explicit-error',
        notification: {
          kind: 'run-terminal',
          actor: 'assistant',
          messageId: 'assistant-message-error',
          runState: 'error',
          finalized: true,
        },
      },
    })).toEqual({
      source: 'assistant-thread',
      scopeKey: 'thread-explicit-error',
      outcome: 'error',
      eventId: 'assistant:thread-explicit-error:message:assistant-message-error:error',
    });
  });

  it('deduplicates explicit terminal metadata after the same armed run already settled', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume(running)).toBeNull();
    expect(tracker.consume(completed)).toMatchObject({
      outcome: 'completed',
      eventId: 'assistant:thread-1:1',
    });
    expect(tracker.consume({
      type: 'acp.event',
      eventId: 'messages-after-runtime-terminal',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-1',
        notification: {
          kind: 'run-terminal',
          actor: 'assistant',
          messageId: 'assistant-message-after-runtime-terminal',
          runState: 'completed',
          finalized: true,
        },
      },
    })).toBeNull();
  });

  it('keeps generic message changes silent when no running event was observed', () => {
    const tracker = createAssistantNotificationTracker();

    expect(tracker.consume({
      type: 'acp.event',
      eventId: 'history-changed',
      payload: {
        kind: 'thread.messages.changed',
        threadId: 'thread-history',
        messageCount: 5,
        changedAt: '2026-07-27T02:10:39.603Z',
      },
    })).toBeNull();
  });

  it('ignores historical terminal metadata until a current run has started', () => {
    const tracker = createAssistantNotificationTracker();

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
