# Host AI Audio Notifications Design

## Goal

Add reliable audio notifications for commentary page settlement and the continuous sidebar ACP assistant while keeping notification behavior outside task execution, persistence, and conversation business logic.

## Scope

The first release covers exactly two sources:

- Commentary execution, with single and batch execution sharing the same page-level settlement rule.
- The sidebar ACP assistant, with one notification for each locally observed terminal run.

Evaluator messages, image generation, prototype generation, system notifications, service-worker delivery, and server-side SSE notification sources are out of scope.

## Architecture

Axhub Make owns a single notification coordinator. Business modules only expose results through their existing host boundaries. They never import audio assets, read notification settings, or wait for playback.

The notification domain lives under `src/index/domains/notifications/` and contains:

- `notificationCoordinator.ts`: maps normalized notification intents to a sound decision and deduplicates duplicate terminal signals.
- `notificationPlayer.ts`: owns the two audio assets and all browser playback behavior.
- `notificationSettings.ts`: owns browser-local settings for completion and reminder sounds.
- Focused tests beside each module.

The application creates one coordinator and passes an explicit `notify()` dependency to the commentary host-action handler and assistant iframe event handler. There is no global event bus, notification state in business models, server persistence, or new runtime protocol.

## Notification Intent

The coordinator accepts only normalized terminal intent:

```ts
type NotificationIntent = {
  source: 'commentary-page' | 'assistant-thread';
  scopeKey: string;
  outcome: 'completed' | 'error' | 'aborted';
  eventId?: string;
};
```

`completed` maps to the completion sound, `error` maps to the reminder sound, and `aborted` remains silent. The source adapters own protocol parsing; the coordinator does not import commentary or ACP types.

## Commentary Behavior

The existing conversation-task monitor remains authoritative for page settlement:

- Seeing any `created`, `pending`, or running task opens a page cycle.
- Playback is deferred while any task remains non-terminal.
- The cycle settles only after all terminal states have been persisted.
- If any task in the cycle failed, the cycle reports `error`; otherwise it reports `completed`.
- A single commentary task is the one-node case of the same page cycle.

The commentary runtime continues to send its existing `play-notification-sound` host action only after page settlement. The Make host consumes that action immediately and converts it into a notification intent. Playback never happens inside the preview iframe, and notification failure never changes the host-action result or commentary state.

## Sidebar Assistant Behavior

The assistant adapter reuses the existing `acp.subscribe` handshake, acknowledgement retry, source-window lookup, and origin validation in `useAssistantPanelController.tsx`.

It observes `thread.runtime.changed`, `thread.messages.changed`, and `thread.idle`:

- A running signal arms the thread for the current run.
- An explicit compatible terminal run state or finalized assistant run metadata settles the armed run.
- `thread.idle` is a duplicate-safe confirmation or fallback for the same run.
- A terminal signal without an observed local running cycle establishes a baseline and does not play.
- Streaming message changes, historical hydration, refresh, reconnect, and aborted runs remain silent.

No old ACP heuristic compatibility layer is added. The compatible ACP event contract is the source of truth.

## Deduplication

Commentary events deduplicate by page cycle. Assistant events deduplicate by thread and observed run sequence, so two different turns in one thread can each notify while repeated terminal signals for one turn notify once.

Cross-source thread ownership is not added speculatively. If integration testing proves that the same commentary ACP thread also reaches the sidebar listener, the notification adapter may add a small in-memory suppression map without changing commentary or ACP business state.

## Audio Assets and Playback

Axhub Make packages byte-identical copies of the extension assets:

- `completion.wav`, SHA-256 `c3467b6b1182b37fb10adc97f8840c06da728819cbe7bd912213eb176b38141a`
- `reminder.wav`, SHA-256 `64ea0e8df38dc2b781cb155a40e9f2bf337508d59bf95042daeeb7b6230de9bc`

Vite imports the files as built Admin assets. Runtime playback never depends on the extension checkout, a CDN, or a symlink.

The player preloads one audio element per sound, resets playback safely, and catches rejected `play()` promises. Preview playback bypasses automatic-event deduplication but uses the same files. Playback errors are recorded for diagnostics and never reject into callers.

## Settings

The AI settings tab exposes:

- Completion sound checkbox, enabled by default, with a preview button.
- Reminder sound checkbox, enabled by default, with a preview button.

Settings use a versioned local-storage value owned by `notificationSettings.ts`. They are user/browser preferences and are not written to project configuration, ACP configuration, or commentary documents.

## Failure Isolation

Notification calls are fire-and-forget. Parsing errors, storage errors, missing assets, autoplay rejection, and duplicate events cannot block or alter:

- ACP execution or submission.
- Commentary task persistence or page settlement.
- Host-toolbar action responses.
- Assistant iframe pool state.
- Existing UI success or error feedback.

## Future Extension

New sources such as evaluator messages, image generation, prototype generation, or server SSE add a thin adapter that emits `NotificationIntent`. New delivery channels such as toast or browser notifications attach after the coordinator decision. Neither expansion requires changes to existing business state machines.

## Verification

Automated tests must cover:

- Coordinator outcome mapping, settings gating, aborted silence, and per-run deduplication.
- Browser playback success and rejected-play isolation.
- Local-storage defaults, normalization, persistence, and change subscription.
- Byte identity of both WAV assets.
- Commentary host-action routing without forwarding the action back into the editor.
- Assistant running-to-terminal behavior, repeated terminal deduplication, and silence for history, streaming, reconnect, and abort.
- Settings UI controls and preview actions.

Production verification must include the focused Vitest suites, TypeScript/build checks required by the Make package, a successful Admin production build, and inspection that both WAV files are present in the built assets.
