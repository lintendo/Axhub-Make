import type { NotificationPlayer } from './notificationPlayer';
import type {
  NotificationSettings,
  NotificationSound,
} from './notificationSettings';

export type NotificationIntent = {
  source: 'commentary-page' | 'assistant-thread';
  scopeKey: string;
  outcome: 'completed' | 'error' | 'aborted';
  eventId?: string;
};

export interface NotificationCoordinator {
  notify(intent: NotificationIntent): Promise<boolean>;
}

export function createNotificationCoordinator(options: {
  getSettings: () => NotificationSettings;
  player: NotificationPlayer;
}): NotificationCoordinator {
  const handledEventIds = new Set<string>();

  return {
    async notify(intent) {
      if (intent.outcome === 'aborted') return false;
      if (intent.eventId && handledEventIds.has(intent.eventId)) return false;

      const sound: NotificationSound = intent.outcome === 'error'
        ? 'reminder'
        : 'completion';
      const settings = options.getSettings();
      if (
        (sound === 'completion' && !settings.completionEnabled)
        || (sound === 'reminder' && !settings.reminderEnabled)
      ) {
        return false;
      }

      if (intent.eventId) handledEventIds.add(intent.eventId);
      try {
        return await options.player.play(sound);
      } catch {
        return false;
      }
    },
  };
}
