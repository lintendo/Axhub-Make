import completionSoundUrl from '../../assets/sounds/acp/completion.wav?url';
import reminderSoundUrl from '../../assets/sounds/acp/reminder.wav?url';
import { notificationDiagnostics, type NotificationDiagnostics } from './notificationDiagnostics';
import type { NotificationSound } from './notificationSettings';

export interface NotificationPlayer {
  play(sound: NotificationSound): Promise<boolean>;
  prime?(): void;
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
  diagnostics: NotificationDiagnostics = notificationDiagnostics,
): NotificationPlayer {
  const cache = new Map<NotificationSound, HTMLAudioElement>();
  const primedSounds = new Set<NotificationSound>();
  const primingSounds = new Set<NotificationSound>();

  const getAudio = (sound: NotificationSound): HTMLAudioElement => {
    const cached = cache.get(sound);
    if (cached) return cached;
    const audio = createAudio(sound);
    cache.set(sound, audio);
    return audio;
  };

  return {
    prime() {
      for (const sound of ['completion', 'reminder'] as const) {
        if (primedSounds.has(sound) || primingSounds.has(sound)) continue;
        const audio = getAudio(sound);
        const muted = audio.muted;
        primingSounds.add(sound);
        audio.muted = true;
        diagnostics.record('audio.prime.started', { sound });
        try {
          void audio.play().then(
            () => {
              try {
                audio.pause();
                audio.currentTime = 0;
                primedSounds.add(sound);
                diagnostics.record('audio.prime.succeeded', { sound });
              } catch (error) {
                diagnostics.record('audio.prime.failed', { sound }, error);
              } finally {
                audio.muted = muted;
                primingSounds.delete(sound);
              }
            },
            (error) => {
              diagnostics.record('audio.prime.failed', { sound }, error);
              audio.muted = muted;
              primingSounds.delete(sound);
            },
          );
        } catch (error) {
          diagnostics.record('audio.prime.failed', { sound }, error);
          audio.muted = muted;
          primingSounds.delete(sound);
        }
      }
    },
    async play(sound) {
      const audio = getAudio(sound);
      diagnostics.record('audio.play.started', { sound });
      try {
        audio.currentTime = 0;
        await audio.play();
        diagnostics.record('audio.play.succeeded', { sound });
        return true;
      } catch (error) {
        diagnostics.record('audio.play.failed', { sound }, error);
        return false;
      }
    },
  };
}
