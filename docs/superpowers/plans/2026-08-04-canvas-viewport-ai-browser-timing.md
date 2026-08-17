# Canvas Viewport AI Browser Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured browser-console timing for the canvas viewport AI from click to first streamed response and terminal completion.

**Architecture:** A focused timing helper owns the monotonic clock, one-shot first-response detection, terminal deduplication, and safe console logging. The viewport request forwards an optional callback into the direct-run path's existing SSE event hook so `CanvasAiGenerationTool` can observe stream deltas without instrumenting unrelated AI requests.

**Tech Stack:** React 18.2, TypeScript 5, Vitest 4, browser Performance API, ACP SSE.

## Global Constraints

- Instrument only requests whose source is `canvas-viewport`.
- Start the timer before canvas save and screenshot capture.
- Log only structured timing metadata; never log prompts, screenshots, canvas content, or generated content.
- Use the prefix `[canvas-viewport-ai:timing]` with `console.info`.
- Preserve the direct-file write, 30-minute session TTL, eight-turn limit, and single active viewport run.
- Do not commit from the current dirty submodule; verify only scoped files.

---

### Task 1: Build the timing state helper

**Files:**
- Create: `src/index/domains/ai-generation/canvasViewportAiTiming.ts`
- Test: `src/index/domains/ai-generation/canvasViewportAiTiming.test.ts`

**Interfaces:**
- Consumes: `AiRunSseEvent` and `CanvasDirectRunSubmitPayload`-shaped run identifiers.
- Produces: `createCanvasViewportAiTiming(options)` with `accepted`, `handleStreamEvent`, `completed`, `failed`, and `aborted` methods.

- [x] **Step 1: Write the failing helper test**

Create a deterministic clock and collecting logger, then assert the exact event sequence and elapsed values:

```ts
const entries: Array<{ message: string; metadata: Record<string, unknown> }> = [];
let now = 100;
const timing = createCanvasViewportAiTiming({
  provider: 'codex',
  canvasFilePath: 'src/resources/board.excalidraw',
  now: () => now,
  log: (message, metadata) => entries.push({ message, metadata }),
});

now = 125.4;
timing.accepted({ runId: 'run-1', threadId: 'thread-1' });
now = 180.6;
timing.handleStreamEvent({ event: 'run.reasoning.delta', data: { delta: 'thinking' } });
now = 220;
timing.handleStreamEvent({ event: 'run.text.delta', data: { delta: 'answer' } });
now = 260.2;
timing.completed();

expect(entries.map((entry) => entry.message)).toEqual([
  '[canvas-viewport-ai:timing] started',
  '[canvas-viewport-ai:timing] accepted',
  '[canvas-viewport-ai:timing] first-response',
  '[canvas-viewport-ai:timing] completed',
]);
expect(entries[2].metadata.elapsedMs).toBe(81);
expect(entries[3].metadata.elapsedMs).toBe(160);
```

Add focused cases proving whitespace deltas do not count, negative clock movement clamps to zero, terminal logging occurs once, cancellation uses `aborted`, and a throwing logger does not escape.

- [x] **Step 2: Run the helper test and confirm RED**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiTiming.test.ts`

Expected: FAIL because `canvasViewportAiTiming.ts` does not exist.

- [x] **Step 3: Implement the minimal timing helper**

Implement a small stateful closure:

```ts
import type { AiRunSseEvent } from './aiRunClient';

export const CANVAS_VIEWPORT_AI_TIMING_LOG_PREFIX = '[canvas-viewport-ai:timing]';

interface CanvasViewportAiRunIdentity {
  runId?: string | null;
  threadId?: string | null;
}

interface CanvasViewportAiTimingOptions {
  provider: string;
  canvasFilePath: string;
  now?: () => number;
  log?: (message: string, metadata: Record<string, unknown>) => void;
}

export interface CanvasViewportAiTiming {
  accepted(payload?: CanvasViewportAiRunIdentity): void;
  handleStreamEvent(event: AiRunSseEvent): void;
  completed(payload?: CanvasViewportAiRunIdentity): void;
  failed(error: unknown): void;
  aborted(): void;
}

export function createCanvasViewportAiTiming(options: CanvasViewportAiTimingOptions) {
  const now = options.now || (() => performance.now());
  const log = options.log || ((message, metadata) => console.info(message, metadata));
  const startedAt = now();
  let firstResponseLogged = false;
  let terminalLogged = false;
  let runId: string | null = null;
  let threadId: string | null = null;

  const elapsedMs = () => Math.max(0, Math.round(now() - startedAt));
  const emit = (event: string, metadata: Record<string, unknown>) => {
    try {
      log(
        `${CANVAS_VIEWPORT_AI_TIMING_LOG_PREFIX} ${event}`,
        metadata,
      );
    } catch {
      // Timing diagnostics never affect the AI request.
    }
  };

  emit('started', { provider: options.provider, canvasFilePath: options.canvasFilePath });
  const rememberRun = (payload?: CanvasViewportAiRunIdentity) => {
    runId = String(payload?.runId || runId || '').trim() || null;
    threadId = String(payload?.threadId || threadId || '').trim() || null;
  };
  const emitTerminal = (
    event: 'completed' | 'error' | 'aborted',
    metadata: Record<string, unknown> = {},
  ) => {
    if (terminalLogged) return;
    terminalLogged = true;
    emit(event, { elapsedMs: elapsedMs(), runId, threadId, ...metadata });
  };

  return {
    accepted(payload?: CanvasViewportAiRunIdentity) {
      rememberRun(payload);
      emit('accepted', { elapsedMs: elapsedMs(), runId, threadId });
    },
    handleStreamEvent(event: AiRunSseEvent) {
      const isResponse = event.event === 'run.text.delta' || event.event === 'run.reasoning.delta';
      if (terminalLogged || firstResponseLogged || !isResponse || !String(event.data.delta || '').trim()) return;
      firstResponseLogged = true;
      emit('first-response', { elapsedMs: elapsedMs(), responseEvent: event.event, runId, threadId });
    },
    completed: (payload?: CanvasViewportAiRunIdentity) => {
      rememberRun(payload);
      emitTerminal('completed');
    },
    failed: (error) => emitTerminal('error', {
      error: error instanceof Error ? error.message : String(error || 'Unknown error'),
    }),
    aborted: () => emitTerminal('aborted'),
  } satisfies CanvasViewportAiTiming;
}
```

Only a non-empty trimmed `run.text.delta` or `run.reasoning.delta` may emit `first-response`. All terminal methods share one `terminalLogged` guard.

- [x] **Step 4: Run the helper test and confirm GREEN**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiTiming.test.ts`

Expected: all helper tests pass.

### Task 2: Forward raw SSE events through the direct-run boundary

**Files:**
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`
- Test: `src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`
- Modify: `src/index/app/IndexPage.tsx`
- Test: `src/index/app/IndexPage.test.ts`

**Interfaces:**
- Consumes: `AiRunSseEvent` from `runAiStream`.
- Produces: optional `onEvent?: (event: AiRunSseEvent) => void | Promise<void>` on `CanvasAiGenerationRequest`.
- Reuses: the existing `SubmitAnnotationPromptViaApiOptions.onEvent` callback.

- [x] **Step 1: Write failing callback-routing tests**

In `CanvasAiGenerationTool.source.test.ts`, assert the viewport request type includes:

```ts
expect(source).toContain('onEvent?: (event: AiRunSseEvent) => void | Promise<void>;');
```

In `IndexPage.test.ts`, assert the direct API submission includes:

```ts
expect(submitSource).toContain('onEvent: request.onEvent,');
```

- [x] **Step 2: Run routing tests and confirm RED**

Run: `pnpm exec vitest run src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts src/index/app/IndexPage.test.ts`

Expected: FAIL because `CanvasAiGenerationRequest` does not expose the callback and `IndexPage` does not forward it.

- [x] **Step 3: Add the optional callback and forward it**

Add the callback type to `CanvasAiGenerationRequest`:

```ts
onEvent?: (event: AiRunSseEvent) => void | Promise<void>;
```

Import `AiRunSseEvent` as a type in `CanvasAiGenerationTool.tsx`. In `IndexPage`, pass `onEvent: request.onEvent` to `submitAnnotationPromptViaApi`; the existing direct-run helper invokes it from `runAiStream` and does not serialize the function into `/api/ai/runs`.

- [x] **Step 4: Run routing tests and confirm GREEN**

Run: `pnpm exec vitest run src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts src/index/app/IndexPage.test.ts`

Expected: both files pass.

### Task 3: Connect timing to the viewport AI lifecycle

**Files:**
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`
- Test: `src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

**Interfaces:**
- Consumes: `createCanvasViewportAiTiming` from Task 1 and the `onEvent` callback from Task 2.
- Produces: browser timing logs for one viewport run.

- [x] **Step 1: Write the failing source-contract test**

Assert the viewport click handler creates timing before capture and wires every lifecycle:

```ts
expect(submitSource.indexOf('const timing = createCanvasViewportAiTiming({'))
  .toBeLessThan(submitSource.indexOf('const capture = await captureViewport();'));
expect(submitSource).toContain('onEvent: timing.handleStreamEvent,');
expect(submitSource).toContain('timing.accepted(payload);');
expect(submitSource).toContain('timing.aborted();');
expect(submitSource).toContain('timing.failed(result.error);');
expect(submitSource).toContain('timing.completed();');
expect(submitSource).toContain('timing.failed(error);');
```

- [x] **Step 2: Run the source test and confirm RED**

Run: `pnpm exec vitest run src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

Expected: FAIL because the helper is not imported or connected.

- [x] **Step 3: Wire the timing helper into the viewport click handler**

After provider validation and before `captureViewport`, create the timing object with provider and canvas path. Pass `timing.handleStreamEvent` on the viewport request. In the existing accepted callback, call `timing.accepted(payload)` before any early return for unavailable session storage. In the run promise, map the result to exactly one terminal timing method. In the outer catch, call `timing.failed(error)` for save, capture, or startup failures.

Keep toast behavior and session recording unchanged.

- [x] **Step 4: Run the source and helper tests and confirm GREEN**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiTiming.test.ts src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

Expected: both files pass.

### Task 4: Verify the scoped feature

**Files:**
- Review all files from Tasks 1-3.

- [x] **Step 1: Run focused regression tests**

Run:

```bash
pnpm exec vitest run \
  src/index/domains/ai-generation/canvasViewportAiTiming.test.ts \
  src/index/domains/ai-generation/canvasViewportAiSession.test.ts \
  src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts \
  src/index/domains/ai-generation/canvasDirectRun.test.ts \
  src/index/domains/assistant/annotationDirectRun.test.ts \
  src/index/domains/ai-generation/aiRunClient.test.ts \
  src/index/app/IndexPage.test.ts
```

Expected: all selected files pass with no failures.

- [x] **Step 2: Run production builds**

Run: `pnpm server:build`

Run: `pnpm admin:build`

Expected: both commands exit 0; the existing Vite chunk-size warning is non-blocking.

- [x] **Step 3: Inspect the scoped diff**

Run `git diff --check` for the Task 1-3 files. Confirm the timing prefix appears only in the viewport timing helper/tests, no payload content is logged, and unrelated AI entry points do not install `onEvent`.
