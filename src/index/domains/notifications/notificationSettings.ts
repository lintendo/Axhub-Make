export type NotificationSound = 'completion' | 'reminder';

export interface NotificationSettings {
  completionEnabled: boolean;
  reminderEnabled: boolean;
}

export const NOTIFICATION_SETTINGS_STORAGE_KEY = 'axhub:notification-settings:v1';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  completionEnabled: true,
  reminderEnabled: true,
};

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readNotificationSettings(): NotificationSettings {
  try {
    const parsed = JSON.parse(
      getStorage()?.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY) || '{}',
    ) as Partial<NotificationSettings>;
    return {
      completionEnabled: parsed.completionEnabled !== false,
      reminderEnabled: parsed.reminderEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function writeNotificationSettings(
  patch: Partial<NotificationSettings>,
): NotificationSettings {
  const next = { ...readNotificationSettings(), ...patch };
  try {
    getStorage()?.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser-local preferences are optional and must not affect callers.
  }
  return next;
}
