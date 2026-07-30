import { notificationDiagnostics, type NotificationDiagnostics } from './notificationDiagnostics';
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
  diagnostics?: NotificationDiagnostics;
}): NotificationCoordinator {
  const handledEventIds = new Set<string>();
  const diagnostics = options.diagnostics ?? notificationDiagnostics;

  return {
    async notify(intent) {
      const sound: NotificationSound = intent.outcome === 'error'
        ? 'reminder'
        : 'completion';
      const settings = options.getSettings();
      const diagnosticDetails = {
        source: intent.source,
        scopeKey: intent.scopeKey,
        outcome: intent.outcome,
        eventId: intent.eventId ?? null,
        sound,
        completionEnabled: settings.completionEnabled,
        reminderEnabled: settings.reminderEnabled,
      };
      diagnostics.record('notification.intent.received', diagnosticDetails);
      if (intent.eventId && handledEventIds.has(intent.eventId)) {
        diagnostics.record('notification.intent.skipped', { ...diagnosticDetails, reason: 'duplicate' });
        return false;
      }
      if (intent.eventId) handledEventIds.add(intent.eventId);
      if (intent.outcome === 'aborted') {
        diagnostics.record('notification.intent.skipped', { ...diagnosticDetails, reason: 'aborted' });
        return false;
      }
      if (
        (sound === 'completion' && !settings.completionEnabled)
        || (sound === 'reminder' && !settings.reminderEnabled)
      ) {
        diagnostics.record('notification.intent.skipped', { ...diagnosticDetails, reason: 'sound-disabled' });
        return false;
      }

      try {
        const played = await options.player.play(sound);
        if (!played) {
          diagnostics.record('notification.intent.skipped', { ...diagnosticDetails, reason: 'playback-failed' });
        }
        return played;
      } catch (error) {
        diagnostics.record('notification.intent.skipped', { ...diagnosticDetails, reason: 'player-threw' }, error);
        return false;
      }
    },
  };
}
