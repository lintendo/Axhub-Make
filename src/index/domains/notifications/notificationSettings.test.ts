import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  readNotificationSettings,
  writeNotificationSettings,
} from './notificationSettings';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('notification settings', () => {
  it('defaults both notification sounds to enabled', () => {
    expect(readNotificationSettings()).toEqual({ completionEnabled: true, reminderEnabled: true });
  });

  it('normalizes malformed storage and persists an individual sound toggle', () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
    storage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, '{bad json');
    expect(readNotificationSettings()).toEqual({ completionEnabled: true, reminderEnabled: true });

    expect(writeNotificationSettings({ completionEnabled: false }))
      .toEqual({ completionEnabled: false, reminderEnabled: true });
    expect(readNotificationSettings()).toEqual({ completionEnabled: false, reminderEnabled: true });
  });
});
