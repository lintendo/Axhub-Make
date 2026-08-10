# Quick Edit Single-Confirm Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each host-toolbar quick-edit save produce one confirmation and at most one write while merging active split-preview changes.

**Architecture:** Refactor the Dev and HTML save adapters into `prepare`, `preflight`, and `commit` operations. A pure host coordinator merges drafts from active panes, performs one preflight through a selected iframe, owns the single Make dialog, and sends one idempotent commit request.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest, browser `postMessage`, existing Make local-editing and HTML-review APIs.

## Global Constraints

- Use pnpm for repository development, tests, and builds.
- Preserve all unrelated and pre-existing uncommitted changes; do not stage or commit implementation files containing user work.
- Do not add compatibility branches for removed bootstrap or resource protocols.
- Keep React at 18.2.0 and TypeScript at 5.x.
- Mutating save messages must execute at most once per request id.
- A user cancel is a handled outcome, not a missing-capability error.

---

### Task 1: Shared Save Draft Contracts and Merge Rules

**Files:**
- Create: `src/common/quickEditSave.ts`
- Create: `src/common/quickEditSave.test.ts`

**Interfaces:**
- Produces: `QuickEditSaveAction`, `QuickEditSaveDraft`, `QuickEditSavePreflight`, `QuickEditSaveCommitResult`, `mergeQuickEditSaveDrafts(drafts)` and `buildQuickEditSaveConfirmation(preflight)`.
- Consumes: no runtime or React dependencies.

- [ ] **Step 1: Write failing merge tests**

Add tests that express these exact behaviors:

```ts
expect(mergeQuickEditSaveDrafts([
  sourceTextDraft('prototypes/demo', [{ before: '旧标题', after: '新标题' }]),
  sourceTextDraft('prototypes/demo', [{ before: '旧标题', after: '新标题' }]),
])).toMatchObject({
  ok: true,
  draft: { kind: 'source-text', replacements: [{ before: '旧标题', after: '新标题' }] },
});

expect(mergeQuickEditSaveDrafts([
  sourceTextDraft('prototypes/demo', [{ before: '旧标题', after: '甲' }]),
  sourceTextDraft('prototypes/demo', [{ before: '旧标题', after: '乙' }]),
])).toMatchObject({ ok: false, code: 'TEXT_REPLACEMENT_CONFLICT' });
```

Cover HTML edit deduplication and key conflicts, HTML revision mismatch, stable primary/secondary CSS concatenation with exact-block deduplication, clear-style coalescing, and resource mismatch.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run src/common/quickEditSave.test.ts
```

Expected: FAIL because `src/common/quickEditSave.ts` does not exist.

- [ ] **Step 3: Implement the shared contracts and pure merge function**

Use this discriminated union shape:

```ts
export type QuickEditSaveAction = 'save-text' | 'save-style' | 'clear-style';

export type QuickEditSaveResource = {
  engine: 'source' | 'html';
  projectId: string;
  path: string;
  revision?: string;
};

export type QuickEditSaveDraft =
  | { kind: 'source-text'; action: 'save-text'; resource: QuickEditSaveResource; replacements: Array<{ before: string; after: string }> }
  | { kind: 'html-text'; action: 'save-text'; resource: QuickEditSaveResource; edits: Array<{ key: string; before: string; after: string }> }
  | { kind: 'style'; action: 'save-style'; resource: QuickEditSaveResource; cssText: string }
  | { kind: 'clear-style'; action: 'clear-style'; resource: QuickEditSaveResource };

export type QuickEditSavePreflight = {
  action: QuickEditSaveAction;
  changeCount: number;
  affectedCount: number;
};

export type QuickEditSaveCommitResult = {
  changed: boolean;
  changedCount: number;
  changedFiles?: number;
  message: string;
};

export type QuickEditSaveDialogInput = {
  title: '确认操作';
  description: string;
  confirmText: '确定';
  cancelText: '取消';
  tone: 'brand';
  dismissible: false;
};

export type QuickEditSaveMergeResult =
  | { ok: true; draft: QuickEditSaveDraft }
  | { ok: false; code: 'RESOURCE_MISMATCH' | 'REVISION_MISMATCH' | 'TEXT_REPLACEMENT_CONFLICT' | 'HTML_TEXT_EDIT_CONFLICT'; message: string };
```

Return structured merge failures with `code` and `message`; normalize only surrounding whitespace used for validation, while preserving actual before/after/CSS payload text.

- [ ] **Step 4: Run the merge tests and verify GREEN**

Run the Task 1 command. Expected: all Task 1 tests pass.

---

### Task 2: Refactor DevTemplate Save into Prepare, Preflight, and Commit

**Files:**
- Modify: `src/dev-template/webEditorV2Integration.ts`
- Modify: `src/dev-template/webEditorV2Integration.test.ts`
- Modify: `src/dev-template/editorModeManager.ts`
- Modify: `src/dev-template/editorModeManager.test.ts`

**Interfaces:**
- Consumes: shared types from Task 1.
- Produces on `WebEditorV2Controller` and `DevEditorsApi`:

```ts
prepareQuickEditSave(action: QuickEditSaveAction): Promise<QuickEditSaveDraft | null>;
preflightQuickEditSave(draft: QuickEditSaveDraft): Promise<QuickEditSavePreflight>;
commitQuickEditSave(draft: QuickEditSaveDraft): Promise<QuickEditSaveCommitResult>;
```

- [ ] **Step 1: Write failing Dev save phase tests**

Test that prepare reads text/style state without `fetch`, dialog, acknowledgement, or reload; preflight text calls `/api/text-replace/count` once; commit text calls `/api/text-replace/replace` once; style and clear commits use their existing endpoints; and commit acknowledges changes only after a successful response.

Also keep one wrapper test proving `saveTextChanges()` performs prepare → preflight → confirm → commit for direct iframe use.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec vitest run src/dev-template/webEditorV2Integration.test.ts src/dev-template/editorModeManager.test.ts
```

Expected: FAIL because the phase APIs are absent.

- [ ] **Step 3: Implement the minimal phase APIs**

Move existing text grouping, count, replace, style save, and clear behavior behind the new methods. `prepareQuickEditSave()` returns `null` for no changes. `preflightQuickEditSave()` validates engine/path and returns counts plus confirmation metadata. `commitQuickEditSave()` never opens a dialog and returns the success message/counts after acknowledgement.

Keep the old public save methods as thin wrappers:

```ts
const draft = await controller.prepareQuickEditSave('save-text');
if (!draft) return;
const preflight = await controller.preflightQuickEditSave(draft);
if (!await confirmAction(buildQuickEditSaveConfirmation(preflight))) return;
await controller.commitQuickEditSave(draft);
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Task 2 command. Expected: all focused DevTemplate tests pass.

---

### Task 3: Refactor HtmlTemplate Save into the Same Phases

**Files:**
- Modify: `src/html-template/htmlResourceSaveBridge.ts`
- Modify: `src/html-template/htmlResourceSaveBridge.test.ts`
- Modify: `src/html-template/index.tsx`

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces the same three phase methods on `HtmlResourceSaveBridge` and `HtmlTemplateBootstrap.editors`.

- [ ] **Step 1: Write failing HTML phase tests**

Test that prepare converts targeted text locators to exact text keys and captures the current revision without fetching or confirming; preflight rejects a mismatched path/revision without writing; commit sends one request to `/api/html-review/text-edits` or `/api/html-review/style-hack`; and direct wrappers still confirm once.

- [ ] **Step 2: Run the focused HTML tests and verify RED**

```bash
pnpm exec vitest run src/html-template/htmlResourceSaveBridge.test.ts src/html-template/annotation-boundary.test.ts
```

Expected: FAIL because phase methods are absent.

- [ ] **Step 3: Implement HTML phase methods**

Reuse `locateTextKey`, `readRevision`, `request`, acknowledgement, notification, and reload logic. Commit must compare the incoming draft resource with `getContext()` and `readRevision()` immediately before the request.

- [ ] **Step 4: Run the focused HTML tests and verify GREEN**

Run the Task 3 command. Expected: all focused HTML tests pass.

---

### Task 4: Add Idempotent Save Message Protocol

**Files:**
- Create: `src/common/quickEditRequestRegistry.ts`
- Create: `src/common/quickEditRequestRegistry.test.ts`
- Modify: `src/dev-template/index.tsx`
- Modify: `src/html-template/index.tsx`
- Modify: `src/dev-template/editor-bridge-options.test.ts`
- Modify: `src/html-template/annotation-boundary.test.ts`

**Interfaces:**
- Produces: `createQuickEditRequestRegistry<T>(limit = 100)` with `run(requestId, operation)`.
- Adds `AXHUB_PROTOTYPE_EDITOR_PREPARE_SAVE`, `AXHUB_PROTOTYPE_EDITOR_PREFLIGHT_SAVE`, and `AXHUB_PROTOTYPE_EDITOR_COMMIT_SAVE` handlers.

- [ ] **Step 1: Write failing request-registry and protocol tests**

Prove two concurrent `run('commit-1', operation)` calls share one Promise and invoke `operation` once. Prove a completed duplicate returns the same result without invoking again, and the bounded registry evicts the oldest completed entry.

Source-boundary tests must require all three message handlers and require commit to call the registry.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec vitest run src/common/quickEditRequestRegistry.test.ts src/dev-template/editor-bridge-options.test.ts src/html-template/annotation-boundary.test.ts
```

Expected: FAIL because the registry and protocol handlers are absent.

- [ ] **Step 3: Implement registry and handlers**

Prepare and preflight handlers may be re-run because they are read-only. Commit must execute as:

```ts
const result = await commitRegistry.run(requestId, () =>
  editorModeManager.api.commitQuickEditSave(data.draft),
);
postPrototypeEditorState({ requestId, success: true, handled: true, saveCommitResult: result });
```

Return explicit `handled: false` when the requested phase API is unavailable; return `success: false` with the normalized error when validation or persistence fails.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Task 4 command. Expected: all protocol tests pass.

---

### Task 5: Build the Host Save Coordinator

**Files:**
- Create: `src/index/app/index-page/quickEditSaveCoordinator.ts`
- Create: `src/index/app/index-page/quickEditSaveCoordinator.test.ts`
- Modify: `src/index/app/index-page/previewActions.helpers.ts`

**Interfaces:**
- Consumes: Task 1 contracts and injected iframe phase functions.
- Produces:

```ts
export type QuickEditSaveTarget = {
  id: string;
  prepare: (action: QuickEditSaveAction) => Promise<QuickEditSaveDraft | null>;
  preflight: (draft: QuickEditSaveDraft) => Promise<QuickEditSavePreflight>;
  commit: (draft: QuickEditSaveDraft) => Promise<QuickEditSaveCommitResult>;
};

runQuickEditSave(options: {
  action: QuickEditSaveAction;
  targets: QuickEditSaveTarget[];
  confirm: (input: QuickEditSaveDialogInput) => Promise<boolean>;
  notify: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}): Promise<{ handled: boolean; committed: boolean }>;
```

- [ ] **Step 1: Write failing coordinator tests**

Cover single pane, split merge, conflict before preflight, no-change, unsupported targets, more than three seconds before confirmation, cancel without commit, one commit after confirmation, commit failure, and a second call while the first is in flight.

Use deferred Promises for the slow-confirm test rather than timers that encode implementation details.

- [ ] **Step 2: Run the coordinator tests and verify RED**

```bash
pnpm exec vitest run src/index/app/index-page/quickEditSaveCoordinator.test.ts
```

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement the coordinator**

Collect drafts in target order, merge through `mergeQuickEditSaveDrafts`, select the first target that produced a compatible draft, preflight once, confirm once, and commit once. Keep an internal in-flight Promise so repeat toolbar clicks reuse the active operation rather than starting another dialog.

- [ ] **Step 4: Run coordinator tests and verify GREEN**

Run the Task 5 command. Expected: all coordinator tests pass.

---

### Task 6: Connect Direct and Cross-Origin Iframes to the Coordinator

**Files:**
- Modify: `src/index/app/index-page/iframeMessageRequest.ts`
- Modify: `src/index/app/index-page/iframeMessageRequest.test.ts`
- Modify: `src/index/app/index-page/usePrototypeEditorBridgeActions.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`

**Interfaces:**
- Consumes: phase APIs and coordinator from Tasks 2-5.
- Produces bridge functions `postPrototypeEditorPrepareSave`, `postPrototypeEditorPreflightSave`, and `postPrototypeEditorCommitSave`.

- [ ] **Step 1: Write failing bridge integration tests**

Require prepare/preflight requests to retain delivery retry, require commit to use exactly one scheduled delivery, and require stale URL/generation responses to be rejected. Replace source assertions for the old `Promise.all(getPreviewIframes().map(runAgainstIframe))` save path with assertions that the host coordinator receives all active panes and owns `appDialog.confirm`.

- [ ] **Step 2: Run focused host tests and verify RED**

```bash
pnpm exec vitest run src/index/app/index-page/iframeMessageRequest.test.ts src/index/app/index-page/quickEditSaveCoordinator.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: FAIL because commit delivery policy and coordinator wiring are absent.

- [ ] **Step 3: Add per-request retry policy**

Extend `postIframeMessageRequest` with:

```ts
retryDelaysMs?: readonly number[];
```

Default to the current retry schedule for read-only requests. Pass `[0]` for commit. Do not change dynamic-origin, source, request-id, URL, or generation checks.

- [ ] **Step 4: Wire iframe targets and toolbar save**

For same-origin frames, call the phase methods directly. For cross-origin frames, call the new bridge messages. Replace `runQuickEditSaveAction` with one coordinator invocation and map its notification callback to `messageApi`.

The missing-capability warning must be emitted only when the coordinator returns `handled: false`; cancel returns `handled: true, committed: false`.

- [ ] **Step 5: Run focused host tests and verify GREEN**

Run the Task 6 command. Expected: all focused host tests pass.

---

### Task 7: Regression Verification

**Files:**
- Modify only if a verification failure exposes an in-scope defect.

**Interfaces:**
- Consumes all previous tasks.
- Produces fresh verification evidence.

- [ ] **Step 1: Run all directly affected tests**

```bash
pnpm exec vitest run \
  src/common/quickEditSave.test.ts \
  src/common/quickEditRequestRegistry.test.ts \
  src/dev-template/webEditorV2Integration.test.ts \
  src/dev-template/editorModeManager.test.ts \
  src/dev-template/editor-bridge-options.test.ts \
  src/html-template/htmlResourceSaveBridge.test.ts \
  src/html-template/annotation-boundary.test.ts \
  src/index/app/index-page/iframeMessageRequest.test.ts \
  src/index/app/index-page/quickEditSaveCoordinator.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 2: Run TypeScript/build verification**

```bash
pnpm admin:build
pnpm --filter @axhub/make-client typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the final diff**

```bash
git diff --check
git status --short
```

Confirm the implementation touched only the files listed in this plan and preserved all unrelated user changes.

- [ ] **Step 4: Perform the regression-test reversal check**

Temporarily reverse the commit single-delivery/deduplication implementation without saving that reversal, run the duplicate-commit test and verify it fails, then restore the implementation and rerun the test to green. Use `apply_patch` for both temporary changes; do not use checkout/reset.
