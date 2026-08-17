# Annotation Save Status Visual Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the centered annotation toolbar stationary while save-status copy changes, and keep `正在保存` visible for at least 600ms whenever it reaches the screen.

**Architecture:** Add a focused React Hook that converts the real `saving | saved | unsaved` value into a presentation-only smoothed value. Mount that Hook inside the status component so the 600ms window begins only after `正在保存` is actually painted. Keep persistence unchanged. Anchor the status absolutely to a relative button-group wrapper so its width is excluded from centering calculations in both prototype and document-comment toolbars.

**Tech Stack:** React 18.2, TypeScript 5, Vitest 4, react-test-renderer, Tailwind utility classes.

## Global Constraints

- `正在保存` has a minimum visible duration of exactly 600ms.
- Real persistence timing and outcomes must not be delayed or modified.
- `saved` and `unsaved` must both remain reachable after the minimum duration.
- The status must remain hidden when the current-page annotation count is zero.
- Status copy, muted secondary styling, tooltip behavior, count semantics, and visual order after Exit remain unchanged.
- Existing unrelated worktree changes must not be staged, committed, reverted, or reformatted.

---

### Task 1: Presentation-only save-status smoothing Hook

**Files:**
- Create: `src/index/components/content/useSmoothedAnnotationSaveStatus.ts`
- Create: `src/index/components/content/useSmoothedAnnotationSaveStatus.test.ts`

**Interfaces:**
- Consumes: `CommentaryAnnotationSaveStatus` from `@axhub/commentary`.
- Produces: `QUICK_EDIT_SAVING_MIN_VISIBLE_MS = 600` and `useSmoothedAnnotationSaveStatus(status: CommentaryAnnotationSaveStatus): CommentaryAnnotationSaveStatus`.

- [x] **Step 1: Write the failing Hook tests**

Create a react-test-renderer harness that records the Hook result, enables fake timers, and covers these exact transitions:

```ts
saved -> saving -> saved before 600ms: stays saving until 600ms, then saved
saved -> saving -> unsaved before 600ms: stays saving until 600ms, then unsaved
saved -> saving, advance 600ms, then saved: switches saved immediately
saved -> saving -> saved, then saving again before completion: cancels the old completion
hidden while saving, then shown again: starts a fresh 600ms window
hidden with a pending completion: cleans up the timer
```

Each test must unmount its renderer and restore real timers in `afterEach`.

- [x] **Step 2: Run the Hook test to verify RED**

Run:

```bash
node_modules/.bin/vitest run src/index/components/content/useSmoothedAnnotationSaveStatus.test.ts --reporter=dot
```

Expected: FAIL because `useSmoothedAnnotationSaveStatus.ts` does not exist.

- [x] **Step 3: Implement the minimal Hook**

The Hook must:

```ts
export const QUICK_EDIT_SAVING_MIN_VISIBLE_MS = 600;

export function useSmoothedAnnotationSaveStatus(
  status: CommentaryAnnotationSaveStatus,
): CommentaryAnnotationSaveStatus;
```

Use one visible-state value, one saving-start timestamp ref, and one completion timer ref. Clear the previous timer before responding to every real status change and during unmount. A new painted `saving` transition records a new start time in a passive effect; a final state waits only for the remaining portion of 600ms.

- [x] **Step 4: Run the Hook test to verify GREEN**

Run the Step 2 command.

Expected: 7 tests pass with no warnings.

### Task 2: Stable toolbar layout integration

**Files:**
- Modify: `src/index/components/content/PresentationToolbar.tsx`
- Modify: `src/index/components/content/PresentationToolbar.test.ts`

**Interfaces:**
- Consumes: `useSmoothedAnnotationSaveStatus` from Task 1.
- Produces: a presentation status that is visually anchored but excluded from centered button-group width.

- [x] **Step 1: Extend the toolbar source-contract test**

Require all of the following:

```ts
const visibleStatus = useSmoothedAnnotationSaveStatus(status);
```

The Hook must live in a conditionally mounted status component, and the label and tooltip maps must index `visibleStatus`. The prototype quick-edit outer group and document-comment outer group must include `relative`. The status trigger must include `absolute left-full top-1/2`, `ml-4`, `-translate-y-1/2`, and a minimum width, while no longer being nested inside the execution flex group.

- [x] **Step 2: Run the toolbar test to verify RED**

Run:

```bash
node_modules/.bin/vitest run src/index/components/content/PresentationToolbar.test.ts -t "real annotation save status" --reporter=dot
```

Expected: FAIL because the Hook and absolute-positioning classes are not integrated.

- [x] **Step 3: Integrate the smoothed state and stable anchor**

Import the Hook. Derive the visible state inside the conditionally mounted status component and use it for both label and tooltip. Change the reusable status trigger to absolute positioning with a stable minimum width. Add `relative` to the prototype button-group wrapper and wrap the document editing actions in an equivalent relative inline-flex container.

Keep the real status variable for data flow and the visible status variable for presentation only.

- [x] **Step 4: Run the toolbar and Hook tests to verify GREEN**

Run:

```bash
node_modules/.bin/vitest run src/index/components/content/useSmoothedAnnotationSaveStatus.test.ts src/index/components/content/PresentationToolbar.test.ts -t "smoothed annotation save status|real annotation save status" --reporter=dot
```

Expected: all selected tests pass.

### Task 3: Regression and live-module verification

**Files:**
- Verify only: `src/index/components/content/PresentationToolbar.tsx`
- Verify only: `src/index/components/content/useSmoothedAnnotationSaveStatus.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: verification evidence; no additional behavior.

- [x] **Step 1: Run all directly related tests**

Run:

```bash
node_modules/.bin/vitest run src/index/components/content/useSmoothedAnnotationSaveStatus.test.ts src/index/components/content/PresentationToolbar.test.ts --reporter=dot
```

Expected: Hook tests pass; the existing unrelated IDE-tooltip assertion may remain the only full toolbar-file failure.

- [x] **Step 2: Run TypeScript and whitespace checks**

Run the Commentary package typecheck already used by this feature, then `git diff --check` for the Hook, Hook test, toolbar, and toolbar test. The Make root typecheck is not used because its existing project-reference outputs currently raise TS6305 before checking these files.

- [x] **Step 3: Verify the live Vite module**

Fetch `http://127.0.0.1:53817/src/index/components/content/PresentationToolbar.tsx` and confirm it contains the Hook call and absolute-positioning classes. Confirm the Hook module exposes the 600ms constant.

- [x] **Step 4: Review the focused diff**

Confirm no persistence code, annotation count logic, status copy, or unrelated toolbar controls changed. Do not commit implementation files because `PresentationToolbar.tsx` already contains overlapping uncommitted user work; preserving ownership takes precedence over producing a mixed commit.
