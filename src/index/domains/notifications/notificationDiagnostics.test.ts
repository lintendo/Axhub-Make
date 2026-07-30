import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationDiagnostics,
  installNotificationDebugApi,
  type NotificationDebugHost,
} from './notificationDiagnostics';

describe('notification diagnostics', () => {
  it('keeps a bounded in-memory snapshot and sanitizes playback errors', () => {
    const diagnostics = createNotificationDiagnostics({
      enabled: true,
      capacity: 2,
      now: () => '2026-07-27T10:00:00.000Z',
    });

    diagnostics.record('audio.play.started', { sound: 'completion' });
    diagnostics.record('audio.play.failed', { sound: 'completion' }, new DOMException('blocked by autoplay', 'NotAllowedError'));
    diagnostics.record('notification.intent.skipped', { reason: 'playback-failed' });

    expect(diagnostics.snapshot()).toEqual([
      {
        id: 2,
        at: '2026-07-27T10:00:00.000Z',
        stage: 'audio.play.failed',
        details: { sound: 'completion' },
        error: { name: 'NotAllowedError', message: 'blocked by autoplay' },
      },
      {
        id: 3,
        at: '2026-07-27T10:00:00.000Z',
        stage: 'notification.intent.skipped',
        details: { reason: 'playback-failed' },
      },
    ]);
  });

  it('installs an opt-in console API that can test sounds and be cleaned up', async () => {
    const consoleInfo = vi.fn();
    const diagnostics = createNotificationDiagnostics({
      enabled: true,
      consoleInfo,
    });
    const host = {} as NotificationDebugHost;
    const play = vi.fn().mockResolvedValue(true);

    const cleanup = installNotificationDebugApi({
      diagnostics,
      player: { play },
      host,
    });
    const debugApi = host.__AXHUB_NOTIFICATION_DEBUG__;

    expect(debugApi).toBeDefined();
    debugApi?.enableConsole();
    diagnostics.record('notification.intent.received', { source: 'assistant-thread' });
    expect(consoleInfo).toHaveBeenCalledOnce();

    await expect(debugApi?.testSound('reminder')).resolves.toBe(true);
    expect(play).toHaveBeenCalledWith('reminder');
    expect(debugApi?.snapshot().map((entry) => entry.stage)).toEqual([
      'notification.intent.received',
      'debug.sound-test.started',
      'debug.sound-test.finished',
    ]);

    debugApi?.clear();
    expect(debugApi?.snapshot()).toEqual([]);
    cleanup();
    expect(host.__AXHUB_NOTIFICATION_DEBUG__).toBeUndefined();
  });

  it('does not expose a debug API when diagnostics are disabled', () => {
    const diagnostics = createNotificationDiagnostics({ enabled: false });
    const host = {} as NotificationDebugHost;

    const cleanup = installNotificationDebugApi({
      diagnostics,
      player: { play: vi.fn() },
      host,
    });

    expect(host.__AXHUB_NOTIFICATION_DEBUG__).toBeUndefined();
    cleanup();
  });
});
