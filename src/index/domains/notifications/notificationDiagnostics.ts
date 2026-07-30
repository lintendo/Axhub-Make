import type { NotificationPlayer } from './notificationPlayer';
import type { NotificationSound } from './notificationSettings';

export type NotificationDiagnosticStage =
  | 'assistant.event.received'
  | 'assistant.intent.created'
  | 'notification.intent.received'
  | 'notification.intent.skipped'
  | 'audio.prime.started'
  | 'audio.prime.succeeded'
  | 'audio.prime.failed'
  | 'audio.play.started'
  | 'audio.play.succeeded'
  | 'audio.play.failed'
  | 'debug.sound-test.started'
  | 'debug.sound-test.finished'
  | 'debug.sound-test.failed';

type NotificationDiagnosticDetail = string | number | boolean | null;
export type NotificationDiagnosticDetails = Record<string, NotificationDiagnosticDetail>;

export type NotificationDiagnosticError = {
  name: string;
  message: string;
};

export type NotificationDiagnosticEntry = {
  id: number;
  at: string;
  stage: NotificationDiagnosticStage;
  details?: NotificationDiagnosticDetails;
  error?: NotificationDiagnosticError;
};

export interface NotificationDiagnostics {
  readonly enabled: boolean;
  record(
    stage: NotificationDiagnosticStage,
    details?: NotificationDiagnosticDetails,
    error?: unknown,
  ): void;
  snapshot(): NotificationDiagnosticEntry[];
  clear(): void;
  enableConsole(enabled?: boolean): void;
}

export interface NotificationDebugApi {
  snapshot(): NotificationDiagnosticEntry[];
  clear(): void;
  enableConsole(enabled?: boolean): void;
  testSound(sound?: NotificationSound): Promise<boolean>;
}

export interface NotificationDebugHost {
  __AXHUB_NOTIFICATION_DEBUG__?: NotificationDebugApi;
}

function sanitizeError(error: unknown): NotificationDiagnosticError {
  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; message?: unknown };
    return {
      name: typeof value.name === 'string' && value.name ? value.name : 'Error',
      message: typeof value.message === 'string' ? value.message : String(error),
    };
  }
  return {
    name: 'Error',
    message: String(error),
  };
}

export function createNotificationDiagnostics(options: {
  enabled: boolean;
  capacity?: number;
  now?: () => string;
  consoleInfo?: (label: string, entry: NotificationDiagnosticEntry) => void;
}): NotificationDiagnostics {
  const capacity = Math.max(1, Math.floor(options.capacity ?? 200));
  const now = options.now ?? (() => new Date().toISOString());
  const consoleInfo = options.consoleInfo ?? ((label, entry) => console.info(label, entry));
  const entries: NotificationDiagnosticEntry[] = [];
  let nextId = 0;
  let consoleEnabled = false;

  return {
    enabled: options.enabled,
    record(stage, details, error) {
      if (!options.enabled) return;
      nextId += 1;
      const entry: NotificationDiagnosticEntry = {
        id: nextId,
        at: now(),
        stage,
        ...(details && Object.keys(details).length > 0 ? { details: { ...details } } : {}),
        ...(error === undefined ? {} : { error: sanitizeError(error) }),
      };
      entries.push(entry);
      if (entries.length > capacity) entries.splice(0, entries.length - capacity);
      if (consoleEnabled) consoleInfo('[axhub-notification-debug]', entry);
    },
    snapshot() {
      return entries.map((entry) => ({
        ...entry,
        ...(entry.details ? { details: { ...entry.details } } : {}),
        ...(entry.error ? { error: { ...entry.error } } : {}),
      }));
    },
    clear() {
      entries.length = 0;
    },
    enableConsole(enabled = true) {
      consoleEnabled = enabled;
    },
  };
}

export const notificationDiagnostics = createNotificationDiagnostics({
  enabled: import.meta.env.DEV,
});

export function installNotificationDebugApi(options: {
  diagnostics: NotificationDiagnostics;
  player: Pick<NotificationPlayer, 'play'>;
  host?: NotificationDebugHost;
}): () => void {
  const host = options.host ?? (typeof window === 'undefined' ? undefined : window);
  if (!host || !options.diagnostics.enabled) return () => undefined;

  const api: NotificationDebugApi = {
    snapshot: () => options.diagnostics.snapshot(),
    clear: () => options.diagnostics.clear(),
    enableConsole: (enabled = true) => options.diagnostics.enableConsole(enabled),
    async testSound(sound = 'completion') {
      if (sound !== 'completion' && sound !== 'reminder') {
        throw new TypeError(`Unknown notification sound: ${String(sound)}`);
      }
      options.diagnostics.record('debug.sound-test.started', { sound });
      try {
        const played = await options.player.play(sound);
        options.diagnostics.record('debug.sound-test.finished', { sound, played });
        return played;
      } catch (error) {
        options.diagnostics.record('debug.sound-test.failed', { sound }, error);
        return false;
      }
    },
  };

  host.__AXHUB_NOTIFICATION_DEBUG__ = api;
  return () => {
    if (host.__AXHUB_NOTIFICATION_DEBUG__ === api) {
      delete host.__AXHUB_NOTIFICATION_DEBUG__;
    }
  };
}
