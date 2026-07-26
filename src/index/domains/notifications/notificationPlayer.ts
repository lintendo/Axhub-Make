import completionSoundUrl from '../../assets/sounds/acp/completion.wav?url';
import reminderSoundUrl from '../../assets/sounds/acp/reminder.wav?url';
import type { NotificationSound } from './notificationSettings';

export interface NotificationPlayer {
  play(sound: NotificationSound): Promise<boolean>;
}

const soundUrls: Record<NotificationSound, string> = {
  completion: completionSoundUrl,
  reminder: reminderSoundUrl,
};

function createBundledAudio(sound: NotificationSound): HTMLAudioElement {
  const audio = new Audio(soundUrls[sound]);
  audio.preload = 'auto';
  return audio;
}

export function createNotificationPlayer(
  createAudio: (sound: NotificationSound) => HTMLAudioElement = createBundledAudio,
): NotificationPlayer {
  const cache = new Map<NotificationSound, HTMLAudioElement>();

  return {
    async play(sound) {
      const audio = cache.get(sound) || createAudio(sound);
      cache.set(sound, audio);
      try {
        audio.currentTime = 0;
        await audio.play();
        return true;
      } catch {
        return false;
      }
    },
  };
}
