import { describe, expect, it, vi } from 'vitest';
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
    const player = createNotificationPlayer(() => ({
      currentTime: 0,
      play: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
    }) as unknown as HTMLAudioElement);

    await expect(player.play('reminder')).resolves.toBe(false);
  });
});
