# Host AI Audio Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver host-owned completion and reminder sounds for commentary page settlement and terminal sidebar ACP assistant runs without changing task execution, persistence, or ACP business behavior.

**Architecture:** The IndexPage owns one explicit `NotificationCoordinator`, which is passed to the existing commentary host-action and assistant iframe message boundaries. The coordinator maps small normalized intents to a player decision; the player owns the byte-identical WAV assets and swallows playback failures. Commentary and ACP parsing remain adapter concerns, so future sources can call the same coordinator without modifying current business state machines.

**Tech Stack:** React 18.2, TypeScript 5, Vite 5 asset URLs, Vitest 4, browser `Audio`, `localStorage`, pnpm.

## Global Constraints

- Use `pnpm` only; do not add dependencies or server APIs.
- Do not modify ACP execution, commentary persistence, page-cycle state, or task return values.
- Do not add old ACP heuristic compatibility. Accept the compatible explicit terminal event contract only.
- Notification failures, storage failures, and browser autoplay rejection must be caught and must not reject to business callers.
- Persist notification preferences only under browser-local storage; never write project config, ACP config, or commentary documents.
- Copy exact WAV bytes from the extension and verify their SHA-256 values in tests.
- The Make worktree contains unrelated staged and unstaged changes. Stage/commit only the paths named in each task, using `git commit --only` with the explicit paths shown in that task.

---

### Task 1: Browser-local notification settings

**Files:**

- Create: `src/index/domains/notifications/notificationSettings.ts`
- Create: `src/index/domains/notifications/notificationSettings.test.ts`

**Interfaces:**

- Produces `NotificationSound`, `NotificationSettings`, `readNotificationSettings()`, and `writeNotificationSettings(patch)`.
- Consumed by the coordinator and AI settings UI.

- [ ] **Step 1: Write the failing settings tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  readNotificationSettings,
  writeNotificationSettings,
} from './notificationSettings';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
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
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `pnpm exec vitest run src/index/domains/notifications/notificationSettings.test.ts`

Expected: FAIL with an import-resolution error for `notificationSettings`.

- [ ] **Step 3: Implement normalized local settings**

```ts
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
    const parsed = JSON.parse(getStorage()?.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY) || '{}') as Partial<NotificationSettings>;
    return {
      completionEnabled: parsed.completionEnabled !== false,
      reminderEnabled: parsed.reminderEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function writeNotificationSettings(patch: Partial<NotificationSettings>): NotificationSettings {
  const next = { ...readNotificationSettings(), ...patch };
  try {
    getStorage()?.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser-local preferences are optional and must not affect callers.
  }
  return next;
}
```

- [ ] **Step 4: Run the settings tests and verify they pass**

Run: `pnpm exec vitest run src/index/domains/notifications/notificationSettings.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the isolated settings change**

```bash
git add src/index/domains/notifications/notificationSettings.ts src/index/domains/notifications/notificationSettings.test.ts
git commit --only src/index/domains/notifications/notificationSettings.ts src/index/domains/notifications/notificationSettings.test.ts -m "feat: add local notification settings"
```

### Task 2: Playback-isolated player and exact audio assets

**Files:**

- Create: `src/index/assets/sounds/acp/completion.wav`
- Create: `src/index/assets/sounds/acp/reminder.wav`
- Create: `src/index/domains/notifications/notificationPlayer.ts`
- Create: `src/index/domains/notifications/notificationPlayer.test.ts`
- Create: `src/index/domains/notifications/notificationAssets.test.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**

- Consumes `NotificationSound` from `notificationSettings.ts`.
- Produces `NotificationPlayer` and `createNotificationPlayer(createAudio)`.
- The coordinator receives only the `NotificationPlayer` interface and never touches `Audio` directly.

- [ ] **Step 1: Write failing player and asset identity tests**

```ts
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

it('keeps the extension audio bytes unchanged', () => {
  expect(createHash('sha256').update(readFileSync(completionPath)).digest('hex'))
    .toBe('c3467b6b1182b37fb10adc97f8840c06da728819cbe7bd912213eb176b38141a');
  expect(createHash('sha256').update(readFileSync(reminderPath)).digest('hex'))
    .toBe('64ea0e8df38dc2b781cb155a40e9f2bf337508d59bf95042daeeb7b6230de9bc');
});
```

- [ ] **Step 2: Run the tests and verify they fail because the player/assets are absent**

Run: `pnpm exec vitest run src/index/domains/notifications/notificationPlayer.test.ts src/index/domains/notifications/notificationAssets.test.ts`

Expected: FAIL with missing-module and missing-file errors.

- [ ] **Step 3: Copy the approved WAV bytes and implement the player**

Run:

```bash
mkdir -p src/index/assets/sounds/acp
cp /Users/jianzhoulin/rd/Axhub-AI-Extension/app/chrome-extension/public/sounds/acp/completion.wav src/index/assets/sounds/acp/completion.wav
cp /Users/jianzhoulin/rd/Axhub-AI-Extension/app/chrome-extension/public/sounds/acp/reminder.wav src/index/assets/sounds/acp/reminder.wav
```

Implement a player with this behavior:

```ts
export interface NotificationPlayer {
  play(sound: NotificationSound): Promise<boolean>;
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
```

`createBundledAudio` maps `completion` and `reminder` to Vite `?url` imports, creates `new Audio(url)`, and sets `preload = 'auto'`. Add `declare module '*.wav'` to `vite-env.d.ts`.

- [ ] **Step 4: Run the focused playback tests and verify they pass**

Run: `pnpm exec vitest run src/index/domains/notifications/notificationPlayer.test.ts src/index/domains/notifications/notificationAssets.test.ts`

Expected: PASS, including exact SHA-256 checks.

- [ ] **Step 5: Commit the assets and player**

```bash
git add src/index/assets/sounds/acp/completion.wav src/index/assets/sounds/acp/reminder.wav src/index/domains/notifications/notificationPlayer.ts src/index/domains/notifications/notificationPlayer.test.ts src/index/domains/notifications/notificationAssets.test.ts src/vite-env.d.ts
git commit --only src/index/assets/sounds/acp/completion.wav src/index/assets/sounds/acp/reminder.wav src/index/domains/notifications/notificationPlayer.ts src/index/domains/notifications/notificationPlayer.test.ts src/index/domains/notifications/notificationAssets.test.ts src/vite-env.d.ts -m "feat: add bundled notification audio"
```

### Task 3: Source-independent notification coordinator

**Files:**

- Create: `src/index/domains/notifications/notificationCoordinator.ts`
- Create: `src/index/domains/notifications/notificationCoordinator.test.ts`

**Interfaces:**

- Consumes `NotificationSettings` and `NotificationPlayer`.
- Produces `NotificationIntent`, `NotificationCoordinator`, and `createNotificationCoordinator(options)`.
- Callers invoke `void coordinator.notify(intent)`; it never rejects.

- [ ] **Step 1: Write failing coordinator behavior tests**

```ts
it('maps a completed intent to the completion sound', async () => {
  const play = vi.fn().mockResolvedValue(true);
  const coordinator = createNotificationCoordinator({
    getSettings: () => ({ completionEnabled: true, reminderEnabled: true }),
    player: { play },
  });

  await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'run-1' });
  expect(play).toHaveBeenCalledWith('completion');
});

it('skips disabled sounds and aborted intents', async () => {
  const play = vi.fn().mockResolvedValue(true);
  const coordinator = createNotificationCoordinator({
    getSettings: () => ({ completionEnabled: false, reminderEnabled: true }),
    player: { play },
  });

  await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'run-1' });
  await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'aborted', eventId: 'run-2' });
  expect(play).not.toHaveBeenCalled();
});

it('deduplicates only repeated event ids and keeps a second commentary cycle audible', async () => {
  const play = vi.fn().mockResolvedValue(true);
  const coordinator = createNotificationCoordinator({ getSettings: () => ({ completionEnabled: true, reminderEnabled: true }), player: { play } });

  await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'run-1' });
  await coordinator.notify({ source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'run-1' });
  await coordinator.notify({ source: 'commentary-page', scopeKey: 'prototype:home', outcome: 'completed' });
  await coordinator.notify({ source: 'commentary-page', scopeKey: 'prototype:home', outcome: 'completed' });

  expect(play).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Run the test and verify it fails because the coordinator is missing**

Run: `pnpm exec vitest run src/index/domains/notifications/notificationCoordinator.test.ts`

Expected: FAIL with missing-module error.

- [ ] **Step 3: Implement the minimal pure coordinator**

```ts
export type NotificationIntent = {
  source: 'commentary-page' | 'assistant-thread';
  scopeKey: string;
  outcome: 'completed' | 'error' | 'aborted';
  eventId?: string;
};

export function createNotificationCoordinator(options: {
  getSettings: () => NotificationSettings;
  player: NotificationPlayer;
}): NotificationCoordinator {
  const handledEventIds = new Set<string>();
  return {
    async notify(intent) {
      if (intent.outcome === 'aborted') return false;
      if (intent.eventId && handledEventIds.has(intent.eventId)) return false;
      const sound: NotificationSound = intent.outcome === 'error' ? 'reminder' : 'completion';
      const settings = options.getSettings();
      if ((sound === 'completion' && !settings.completionEnabled) || (sound === 'reminder' && !settings.reminderEnabled)) return false;
      if (intent.eventId) handledEventIds.add(intent.eventId);
      return options.player.play(sound);
    },
  };
}
```

- [ ] **Step 4: Run the coordinator tests and verify they pass**

Run: `pnpm exec vitest run src/index/domains/notifications/notificationCoordinator.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the coordinator**

```bash
git add src/index/domains/notifications/notificationCoordinator.ts src/index/domains/notifications/notificationCoordinator.test.ts
git commit --only src/index/domains/notifications/notificationCoordinator.ts src/index/domains/notifications/notificationCoordinator.test.ts -m "feat: add notification coordinator"
```

### Task 4: ACP event-to-intent adapter

**Files:**

- Create: `src/index/domains/notifications/assistantNotificationEvents.ts`
- Create: `src/index/domains/notifications/assistantNotificationEvents.test.ts`

**Interfaces:**

- Produces `createAssistantNotificationTracker()` with `consume(data): NotificationIntent | null`.
- Consumes compatible `acp.event` values and remains independent of React, iframes, and audio.
- `useAssistantPanelController.tsx` will call it after existing source/origin validation.

- [ ] **Step 1: Write failing tracker tests for start, terminal, duplicate, abort, and nonterminal data**

```ts
const running = { type: 'acp.event', payload: { kind: 'thread.runtime.changed', threadId: 'thread-1', runtime: { runState: 'running', isRunning: true } } };
const completed = { type: 'acp.event', payload: { kind: 'thread.runtime.changed', threadId: 'thread-1', runtime: { runState: 'completed', isRunning: false } } };

it('reports one completed notification after an armed compatible terminal run', () => {
  const tracker = createAssistantNotificationTracker();
  expect(tracker.consume(running)).toBeNull();
  expect(tracker.consume(completed)).toEqual({
    source: 'assistant-thread', scopeKey: 'thread-1', outcome: 'completed', eventId: 'assistant:thread-1:1',
  });
  expect(tracker.consume(completed)).toBeNull();
});

it('does not notify for initial history, streaming messages, or aborted runs', () => {
  const tracker = createAssistantNotificationTracker();
  expect(tracker.consume(completed)).toBeNull();
  expect(tracker.consume({ type: 'acp.event', payload: { kind: 'thread.messages.changed', threadId: 'thread-1' } })).toBeNull();
  expect(tracker.consume(running)).toBeNull();
  expect(tracker.consume({ type: 'acp.event', payload: { kind: 'thread.runtime.changed', threadId: 'thread-1', runtime: { runState: 'aborted' } } })).toBeNull();
});
```

- [ ] **Step 2: Run the tracker test and verify it fails because the adapter is missing**

Run: `pnpm exec vitest run src/index/domains/notifications/assistantNotificationEvents.test.ts`

Expected: FAIL with missing-module error.

- [ ] **Step 3: Implement normalized compatible ACP parsing**

Implement `readAcpThreadEvent` to safely read `acp.event`, `threadId`, `kind`, runtime `runState`, and finalized assistant message `acpRun.status`. Implement the tracker as a `Map<string, number>`:

```ts
if (event.runState === 'running') {
  activeRuns.set(event.threadId, (activeRuns.get(event.threadId) || 0) + 1);
  return null;
}
if (!isTerminal(event.runState) || !activeRuns.has(event.threadId)) return null;
const sequence = activeRuns.get(event.threadId)!;
activeRuns.delete(event.threadId);
if (event.runState === 'aborted') return null;
return {
  source: 'assistant-thread',
  scopeKey: event.threadId,
  outcome: event.runState === 'error' ? 'error' : 'completed',
  eventId: `assistant:${event.threadId}:${sequence}`,
};
```

When `thread.messages.changed` supplies a finalized `acpRun.status`, normalize it through the same terminal path. `thread.idle` may only settle a run when it includes an explicit compatible terminal state; otherwise it is ignored.

- [ ] **Step 4: Run the tracker tests and verify they pass**

Run: `pnpm exec vitest run src/index/domains/notifications/assistantNotificationEvents.test.ts`

Expected: PASS, including the no-history/no-stream/no-abort cases.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/index/domains/notifications/assistantNotificationEvents.ts src/index/domains/notifications/assistantNotificationEvents.test.ts
git commit --only src/index/domains/notifications/assistantNotificationEvents.ts src/index/domains/notifications/assistantNotificationEvents.test.ts -m "feat: normalize assistant notification events"
```

### Task 5: Compose one coordinator in IndexPage and consume commentary settlement

**Files:**

- Modify: `src/index/app/IndexPage.tsx:590-650,989-1035`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx:298-350,1658-1672`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Modify: `src/index/app/IndexPage.test.ts`

**Interfaces:**

- Consumes `createNotificationCoordinator`, `createNotificationPlayer`, and `readNotificationSettings`.
- `IndexPage` provides `notifyAiNotification(intent)` to both integration hooks.
- `useIndexPagePreviewActions` consumes `onAiNotification?: (intent: NotificationIntent) => void`.

- [ ] **Step 1: Write failing source assertions for the explicit dependency and commentary short circuit**

```ts
expect(indexPageSource).toContain("createNotificationCoordinator({");
expect(indexPageSource).toContain('onAiNotification: notifyAiNotification,');
expect(previewSource).toContain('onAiNotification,');
expect(previewSource).toContain("if (nextAction.type === 'play-notification-sound') {");
expect(previewSource).toContain("source: 'commentary-page'");
expect(previewSource).toContain('return true;');
```

- [ ] **Step 2: Run the source tests and verify they fail**

Run: `pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts`

Expected: FAIL because the coordinator dependency and action branch are absent.

- [ ] **Step 3: Create the one host-owned coordinator and route the existing action**

In `IndexPage.tsx`, lazily create the coordinator with a `useRef` so it survives normal renders:

```ts
const notificationCoordinatorRef = useRef<NotificationCoordinator | null>(null);
if (!notificationCoordinatorRef.current) {
  notificationCoordinatorRef.current = createNotificationCoordinator({
    getSettings: readNotificationSettings,
    player: createNotificationPlayer(),
  });
}
const notifyAiNotification = useCallback((intent: NotificationIntent) => {
  void notificationCoordinatorRef.current?.notify(intent);
}, []);
```

Pass `notifyAiNotification` into the preview-actions hook. In `runResolvedHostToolbarAction`, before document-editor and quick-edit forwarding, consume `play-notification-sound` as:

```ts
if (nextAction.type === 'play-notification-sound') {
  onAiNotification?.({
    source: 'commentary-page',
    scopeKey: String(selectedItem?.resourceId || selectedItem?.name || 'current-page'),
    outcome: nextAction.sound === 'reminder' ? 'error' : 'completed',
  });
  return true;
}
```

Do not await playback and do not forward this action to an editor or iframe.

- [ ] **Step 4: Run the source tests and verify they pass**

Run: `pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts`

Expected: PASS with the new explicit injection and short-circuit assertions.

- [ ] **Step 5: Commit the commentary host wiring**

```bash
git add src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx src/index/app/index-page/useIndexPagePreviewActions.test.ts
git commit --only src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx src/index/app/index-page/useIndexPagePreviewActions.test.ts -m "feat: route commentary settlement notifications"
```

### Task 6: Route compatible sidebar ACP terminal events

**Files:**

- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.tsx:300-350,669-691`
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.test.ts`
- Modify: `src/index/app/IndexPage.tsx:623-645`
- Modify: `src/index/app/IndexPage.test.ts`

**Interfaces:**

- `UseAssistantPanelControllerParams` receives optional `onAiNotification?: (intent: NotificationIntent) => void`.
- The existing message listener remains responsible for source-window and origin checks.
- The new tracker receives only validated `event.data` and emits only terminal notification intents.

- [ ] **Step 1: Write failing source assertions for the non-business notification adapter**

```ts
expect(controllerSource).toContain("import { createAssistantNotificationTracker } from '../../notifications/assistantNotificationEvents'");
expect(controllerSource).toContain('onAiNotification?: (intent: NotificationIntent) => void;');
expect(controllerSource).toContain('const assistantNotificationTrackerRef = useRef(createAssistantNotificationTracker());');
expect(controllerSource).toContain('const notificationIntent = assistantNotificationTrackerRef.current.consume(event.data);');
expect(controllerSource).toContain('onAiNotification?.(notificationIntent);');
expect(indexPageSource).toContain('onAiNotification: notifyAiNotification,');
```

- [ ] **Step 2: Run the source tests and verify they fail**

Run: `pnpm exec vitest run src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.test.ts`

Expected: FAIL because the adapter dependency is absent.

- [ ] **Step 3: Add the optional callback at the existing validated listener**

Keep `readAssistantIframeRunEvent()` and iframe-pool mutation unchanged. After that mutation, consume the raw event with the tracker:

```ts
const notificationIntent = assistantNotificationTrackerRef.current.consume(event.data);
if (notificationIntent) {
  onAiNotification?.(notificationIntent);
}
```

Initialize the tracker once with `useRef(createAssistantNotificationTracker())`. Add `onAiNotification` to the effect dependency array. Do not call the player, update ACP state, fetch runtime status, or modify subscriptions in this hook.

- [ ] **Step 4: Run the focused assistant tests and verify they pass**

Run: `pnpm exec vitest run src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/domains/notifications/assistantNotificationEvents.test.ts src/index/app/IndexPage.test.ts`

Expected: PASS; tracker behavior remains covered by real unit tests and the hook only asserts the integration boundary.

- [ ] **Step 5: Commit the assistant host wiring**

```bash
git add src/index/domains/assistant/hooks/useAssistantPanelController.tsx src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts
git commit --only src/index/domains/assistant/hooks/useAssistantPanelController.tsx src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts -m "feat: notify on assistant terminal runs"
```

### Task 7: AI settings controls and playback previews

**Files:**

- Modify: `src/index/components/SettingsDialog.tsx:1-100,437-540,1477-1880`
- Modify: `src/index/components/SettingsDialog.source.test.ts`

**Interfaces:**

- Consumes `readNotificationSettings`, `writeNotificationSettings`, and `createNotificationPlayer`.
- The UI changes only browser-local notification settings and calls player preview; it never calls config APIs.

- [ ] **Step 1: Write failing AI-settings source assertions**

```ts
expect(aiTabSource).toContain('声音通知');
expect(aiTabSource).toContain('完成音');
expect(aiTabSource).toContain('提醒音');
expect(aiTabSource).toContain('readNotificationSettings');
expect(aiTabSource).toContain('writeNotificationSettings');
expect(aiTabSource).toContain("notificationPlayer.play('completion')");
expect(aiTabSource).toContain("notificationPlayer.play('reminder')");
expect(handleSaveSource).not.toContain('notificationSettings');
```

- [ ] **Step 2: Run the settings source test and verify it fails**

Run: `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`

Expected: FAIL because the sound controls and local persistence imports are absent.

- [ ] **Step 3: Implement compact local settings controls in the AI tab**

Add local component state initialized when the dialog opens:

```ts
const [notificationSettings, setNotificationSettings] = useState(readNotificationSettings);
const notificationPlayerRef = useRef<NotificationPlayer | null>(null);
if (!notificationPlayerRef.current) notificationPlayerRef.current = createNotificationPlayer();

const updateNotificationSetting = (patch: Partial<NotificationSettings>) => {
  setNotificationSettings(writeNotificationSettings(patch));
};
```

Add a `声音通知` section after the existing `批注执行 AI` section. Render one compact row for `完成音` and one for `提醒音`; each row uses a `Switch` bound to the relevant local setting and a small `Play` button that calls `void notificationPlayerRef.current?.play(sound)`. The preview button remains enabled even when automatic playback for that sound is disabled. Do not add settings to `SettingsFormState`, `normalizeFormState`, `handleSave`, or any API request.

- [ ] **Step 4: Run the settings source test and verify it passes**

Run: `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`

Expected: PASS with only browser-local notification behavior added.

- [ ] **Step 5: Commit the settings UI**

```bash
git add src/index/components/SettingsDialog.tsx src/index/components/SettingsDialog.source.test.ts
git commit --only src/index/components/SettingsDialog.tsx src/index/components/SettingsDialog.source.test.ts -m "feat: add notification sound settings"
```

### Task 8: Regression verification and build-asset inspection

**Files:**

- Modify only if a test exposes a defect in the files from Tasks 1-7.

**Interfaces:**

- Verifies all earlier public APIs and the built Vite asset output.

- [ ] **Step 1: Run all notification and integration tests**

Run:

```bash
pnpm exec vitest run \
  src/index/domains/notifications/notificationSettings.test.ts \
  src/index/domains/notifications/notificationPlayer.test.ts \
  src/index/domains/notifications/notificationAssets.test.ts \
  src/index/domains/notifications/notificationCoordinator.test.ts \
  src/index/domains/notifications/assistantNotificationEvents.test.ts \
  src/index/domains/assistant/hooks/useAssistantPanelController.test.ts \
  src/index/app/IndexPage.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts \
  src/index/components/SettingsDialog.source.test.ts
```

Expected: PASS with no failures.

- [ ] **Step 2: Run Make static/build checks**

Run:

```bash
pnpm exec tsc --noEmit
pnpm admin:build
```

Expected: TypeScript succeeds and `dist/admin/assets/` contains both generated WAV assets.

- [ ] **Step 3: Inspect production assets and working-tree scope**

Run:

```bash
find dist/admin/assets -type f -name '*.wav' -print
git diff --check
git status --short
```

Expected: two WAV files are present; no whitespace errors; only planned files plus pre-existing user changes are listed.

- [ ] **Step 4: Keep the verification task commit-free when all checks pass**

No new production change belongs to this task. If a check fails, return to the task that owns the failing file, add its regression test first, and make that task's explicit path-only commit. This prevents verification from accidentally staging unrelated user changes.
