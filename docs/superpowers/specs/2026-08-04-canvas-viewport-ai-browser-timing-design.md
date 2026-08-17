# Canvas Viewport AI Browser Timing Design

## Goal

Record browser-console timing for the one-click canvas viewport AI flow so developers can see the delay from the user's click to the first streamed response and to terminal completion.

## Scope

- Instrument only requests whose source is `canvas-viewport`.
- Start timing immediately after the click handler accepts the action, before saving and screenshot capture.
- Keep the existing direct-file write, session expiry, and single-run behavior unchanged.
- Do not log prompts, screenshots, canvas content, or generated content.

## Log Contract

All entries use `console.info` with the prefix `[canvas-viewport-ai:timing]` and a structured metadata object.

| Event | Meaning | Required fields |
| --- | --- | --- |
| `started` | The click was accepted and end-to-end timing began. | `provider`, `canvasFilePath` |
| `accepted` | The server accepted the AI run. | `elapsedMs`, `runId`, `threadId` |
| `first-response` | The first non-empty `run.text.delta` or `run.reasoning.delta` arrived. | `elapsedMs`, `responseEvent`, `runId`, `threadId` |
| `completed` | The run completed successfully. | `elapsedMs`, `runId`, `threadId` |
| `error` | The run failed before completion. | `elapsedMs`, normalized error message |
| `aborted` | The user or component cancelled the run. | `elapsedMs` |

`elapsedMs` is rounded to a whole non-negative millisecond and measured with the browser's monotonic `performance.now()` clock. The first-response entry is emitted at most once per run.

## Data Flow

1. `CanvasAiGenerationTool` creates one timing state when the viewport AI click begins.
2. The existing `onAccepted` callback records acceptance and keeps the session identity behavior intact.
3. `CanvasAiGenerationRequest` and `IndexPage` forward the viewport handler into the existing optional `submitAnnotationPromptViaApi.onEvent` SSE callback.
4. The viewport tool treats the first non-empty text or reasoning delta as the first response.
5. The existing run promise records `completed`, `error`, or `aborted` exactly once.

Other canvas AI sources do not install this callback and do not emit the timing prefix.

## Error Handling

- Capture or save failures emit `error` from the click handler.
- Stream failures emit `error` from the terminal run result.
- Cancellation emits `aborted`, not `error`.
- Logging failures must never affect the AI request; the implementation uses ordinary browser logging without persistence or network reporting.

## Testing

- Add a focused timing helper test using an injected clock and logger.
- Verify elapsed values are rounded and never negative.
- Verify the first-response event is emitted only once across multiple deltas.
- Extend source-contract tests to verify the event callback is forwarded through the direct-run path.
- Run the focused AI generation and direct-run tests, followed by the relevant production builds.

## Non-Goals

- Global timing for every AI feature.
- Server-side tracing or persistence.
- UI display, analytics upload, or telemetry aggregation.
- Logging any sensitive request or canvas payload.
