import { describe, expect, it, vi } from 'vitest';
import { createNotificationDiagnostics } from './notificationDiagnostics';
import { createNotificationPlayer } from './notificationPlayer';

describe('notification player', () => {
  it('resets and plays the requested sound without leaking playback rejection', async () => {
    const audio = { currentTime: 4, play: vi.fn().mockResolvedValue(undefined) };
    const player = createNotificationPlayer(() => audio as unknown as HTMLAudioElement);

    await expect(player.play('completion')).resolves.toBe(true);
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('reports false when browser playback is rejected', async () => {
    const diagnostics = createNotificationDiagnostics({ enabled: true });
    const player = createNotificationPlayer(() => ({
      currentTime: 0,
      play: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
    }) as unknown as HTMLAudioElement, diagnostics);

    await expect(player.play('reminder')).resolves.toBe(false);
    expect(diagnostics.snapshot()).toMatchObject([
      { stage: 'audio.play.started', details: { sound: 'reminder' } },
      {
        stage: 'audio.play.failed',
        details: { sound: 'reminder' },
        error: { name: 'NotAllowedError', message: 'blocked' },
      },
    ]);
  });

  it('primes cached sounds silently so a later terminal notification reuses the activated audio', async () => {
    const diagnostics = createNotificationDiagnostics({ enabled: true });
    const completion = {
      currentTime: 4,
      muted: false,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    };
    const reminder = {
      currentTime: 5,
      muted: false,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    };
    const createAudio = vi.fn((sound: 'completion' | 'reminder') => (
      sound === 'completion' ? completion : reminder
    ) as unknown as HTMLAudioElement);
    const player = createNotificationPlayer(createAudio, diagnostics);

    player.prime();
    player.prime();
    await Promise.resolve();

    expect(createAudio).toHaveBeenCalledTimes(2);
    expect(completion.play).toHaveBeenCalledOnce();
    expect(completion.pause).toHaveBeenCalledOnce();
    expect(completion.currentTime).toBe(0);
    expect(completion.muted).toBe(false);
    expect(reminder.play).toHaveBeenCalledOnce();
    expect(reminder.pause).toHaveBeenCalledOnce();
    expect(reminder.currentTime).toBe(0);
    expect(reminder.muted).toBe(false);
    expect(diagnostics.snapshot().map((entry) => entry.stage)).toEqual([
      'audio.prime.started',
      'audio.prime.started',
      'audio.prime.succeeded',
      'audio.prime.succeeded',
    ]);

    await expect(player.play('completion')).resolves.toBe(true);
    expect(completion.play).toHaveBeenCalledTimes(2);
  });
});
