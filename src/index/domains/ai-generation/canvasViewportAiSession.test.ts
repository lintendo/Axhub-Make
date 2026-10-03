import { describe, expect, it } from 'vitest';

import {
  CANVAS_VIEWPORT_AI_SESSION_MAX_TURNS,
  CANVAS_VIEWPORT_AI_SESSION_TTL_MS,
  createCanvasViewportAiSessionStore,
} from './canvasViewportAiSession';

describe('canvas viewport AI session store', () => {
  const identity = {
    projectId: 'project-a',
    canvasFilePath: 'src/resources/flows/home.excalidraw',
    provider: 'codex',
  };

  it('reuses one canvas session while its absolute TTL and accepted-turn budget remain valid', () => {
    const storage = new Map<string, string>();
    const store = createCanvasViewportAiSessionStore(storage);
    const first = store.resolve(identity, new Date('2026-08-04T10:00:00.000Z'));
    const accepted = store.recordAccepted({
      identity,
      session: first,
      threadId: 'thread-1',
      conversationId: 'conversation-1',
    });
    const reused = store.resolve(identity, new Date('2026-08-04T10:15:00.000Z'));

    expect(first.isNew).toBe(true);
    expect(accepted.turnsUsed).toBe(1);
    expect(reused).toMatchObject({
      isNew: false,
      threadId: 'thread-1',
      conversationId: 'conversation-1',
      createdAt: '2026-08-04T10:00:00.000Z',
      turnsUsed: 1,
    });
  });

  it('starts a new session after the fixed absolute TTL even with recent activity', () => {
    const store = createCanvasViewportAiSessionStore(new Map<string, string>());
    const first = store.resolve(identity, new Date('2026-08-04T10:00:00.000Z'));
    store.recordAccepted({
      identity,
      session: first,
      threadId: 'thread-1',
      conversationId: 'thread-1',
    });

    const next = store.resolve(identity, new Date(`2026-08-04T${String(10 + Math.floor(CANVAS_VIEWPORT_AI_SESSION_TTL_MS / 3_600_000)).padStart(2, '0')}:30:01.000Z`));

    expect(next.isNew).toBe(true);
    expect(next.threadId).not.toBe('thread-1');
    expect(next.turnsUsed).toBe(0);
  });

  it('starts a new session after the accepted-turn limit and does not consume failed attempts', () => {
    const store = createCanvasViewportAiSessionStore(new Map<string, string>());
    let session = store.resolve(identity, new Date('2026-08-04T10:00:00.000Z'));

    expect(store.resolve(identity, new Date('2026-08-04T10:01:00.000Z')).turnsUsed).toBe(0);
    for (let index = 0; index < CANVAS_VIEWPORT_AI_SESSION_MAX_TURNS; index += 1) {
      session = store.recordAccepted({
        identity,
        session,
        threadId: session.threadId,
        conversationId: session.conversationId,
      });
    }

    const next = store.resolve(identity, new Date('2026-08-04T10:20:00.000Z'));
    expect(session.turnsUsed).toBe(CANVAS_VIEWPORT_AI_SESSION_MAX_TURNS);
    expect(next.isNew).toBe(true);
    expect(next.turnsUsed).toBe(0);
  });

  it('does not reuse a session when the selected provider changes', () => {
    const store = createCanvasViewportAiSessionStore(new Map<string, string>());
    const first = store.resolve(identity, new Date('2026-08-04T10:00:00.000Z'));
    store.recordAccepted({
      identity,
      session: first,
      threadId: 'thread-1',
      conversationId: 'thread-1',
    });

    const providerChanged = store.resolve({ ...identity, provider: 'claude' }, new Date('2026-08-04T10:05:00.000Z'));

    expect(providerChanged.isNew).toBe(true);
    expect(providerChanged.provider).toBe('claude');
    expect(providerChanged.threadId).not.toBe('thread-1');
  });
});
