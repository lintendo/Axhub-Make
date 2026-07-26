import { describe, expect, it, vi } from 'vitest';
import { createNotificationCoordinator } from './notificationCoordinator';

describe('notification coordinator', () => {
  it('maps a completed intent to the completion sound', async () => {
    const play = vi.fn().mockResolvedValue(true);
    const coordinator = createNotificationCoordinator({
      getSettings: () => ({ completionEnabled: true, reminderEnabled: true }),
      player: { play },
    });

    await coordinator.notify({
      source: 'assistant-thread',
      scopeKey: 'thread-1',
      outcome: 'completed',
      eventId: 'run-1',
    });

    expect(play).toHaveBeenCalledWith('completion');
  });

  it('skips disabled sounds and aborted intents', async () => {
    const play = vi.fn().mockResolvedValue(true);
    const coordinator = createNotificationCoordinator({
      getSettings: () => ({ completionEnabled: false, reminderEnabled: true }),
      player: { play },
    });

    await coordinator.notify({
      source: 'assistant-thread',
      scopeKey: 'thread-1',
      outcome: 'completed',
      eventId: 'run-1',
    });
    await coordinator.notify({
      source: 'assistant-thread',
      scopeKey: 'thread-1',
      outcome: 'aborted',
      eventId: 'run-2',
    });

    expect(play).not.toHaveBeenCalled();
  });

  it('deduplicates only repeated event ids and keeps a second commentary cycle audible', async () => {
    const play = vi.fn().mockResolvedValue(true);
    const coordinator = createNotificationCoordinator({
      getSettings: () => ({ completionEnabled: true, reminderEnabled: true }),
      player: { play },
    });

    await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'run-1' });
    await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'run-1' });
    await coordinator.notify({ source: 'commentary-page', scopeKey: 'prototype:home', outcome: 'completed' });
    await coordinator.notify({ source: 'commentary-page', scopeKey: 'prototype:home', outcome: 'completed' });

    expect(play).toHaveBeenCalledTimes(3);
  });

  it('does not reject callers when playback fails', async () => {
    const coordinator = createNotificationCoordinator({
      getSettings: () => ({ completionEnabled: true, reminderEnabled: true }),
      player: { play: vi.fn().mockRejectedValue(new Error('autoplay blocked')) },
    });

    await expect(coordinator.notify({
      source: 'assistant-thread',
      scopeKey: 'thread-1',
      outcome: 'completed',
      eventId: 'run-1',
    })).resolves.toBe(false);
  });
});
