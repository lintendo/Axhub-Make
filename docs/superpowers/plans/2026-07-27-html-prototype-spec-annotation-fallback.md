# HTML Prototype Spec Annotation Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return users to the selected prototype whenever an HTML prototype spec cannot start annotation, while preserving the existing warning or error message.

**Architecture:** Propagate a `Promise<boolean>` result from the existing document annotation entry point to the prototype-spec caller. The caller owns navigation: it closes the spec only when the failed result still belongs to the latest load attempt for the same `ItemData` instance, so stale iframe results cannot close a newer spec.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest, pnpm workspace

## Global Constraints

- Use pnpm for repository development and verification commands.
- Keep React at 18.2.0 and TypeScript at 5.x; add no dependencies.
- Preserve the existing missing-editor warning and existing HTML editor error messages.
- Do not change ordinary HTML/Markdown document navigation, Markdown prototype-spec activation, editor bridge protocols, or client prototype source.
- Do not add legacy compatibility branches.
- The worktree contains unrelated user changes. Never revert them, and never stage or commit a target file until its cached diff is confirmed to contain only the hunks from this plan.

---

### Task 1: Return HTML annotation startup status

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts:1712-1737`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx:2821-2849`

**Interfaces:**
- Consumes: `enterHtmlDocumentEditor(options): Promise<boolean>` and existing Markdown `postToPreview` behavior.
- Produces: `handleEnableDocEdit(mode?, options?): Promise<boolean>`; HTML resolves with actual editor startup status, Markdown resolves `true` after the enable message is accepted, and rejected inputs resolve `false`.

- [ ] **Step 1: Write the failing return-contract test**

Update the HTML annotation source test to inspect the `handleEnableDocEdit` segment and require the result to be returned:

```ts
const handleEnableDocEditSource = getSourceSegment(
  source,
  'const handleEnableDocEdit = useCallback',
  'const handleSaveDocEdit = useCallback',
);

expect(handleEnableDocEditSource).toContain('const handleEnableDocEdit = useCallback(async (');
expect(handleEnableDocEditSource).toContain('): Promise<boolean> => {');
expect(handleEnableDocEditSource).toContain('return enterHtmlDocumentEditor(options);');
expect(handleEnableDocEditSource).toContain('return false;');
expect(handleEnableDocEditSource).toContain('return true;');
```

Replace the obsolete expectation for `void enterHtmlDocumentEditor(options);` with the returned-call expectation.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: FAIL because `handleEnableDocEdit` is not async and discards the `enterHtmlDocumentEditor` result.

- [ ] **Step 3: Implement the minimal boolean contract**

Change the handler to the following control flow without changing its messages or state updates:

```ts
const handleEnableDocEdit = useCallback(async (
    mode: SpecQuickEditMode = 'comment',
    options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean },
): Promise<boolean> => {
    if (!currentMarkdownItem) {
        messageApi.warning(`请先选择${currentMarkdownLabel}`);
        return false;
    }
    if (!isDocumentCommentableResource(currentMarkdownItem)) {
        messageApi.warning(`仅支持 Markdown 或 HTML ${currentMarkdownLabel}批注`);
        return false;
    }
    if (isHtmlCommentableResource(currentMarkdownItem)) {
        return enterHtmlDocumentEditor(options);
    }
    if (!postToPreview({ type: 'SPEC_EDIT_ENABLE', mode })) {
        return false;
    }
    markdownPromptCacheRef.current = null;
    setDocEditState((previous) => ({ ...previous, enabled: true, quickEditMode: mode }));
    void enterDocumentEditor(mode, options);
    return true;
}, [
    currentMarkdownItem,
    currentMarkdownLabel,
    enterDocumentEditor,
    enterHtmlDocumentEditor,
    messageApi,
    postToPreview,
]);
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: PASS with no new warnings or errors.

- [ ] **Step 5: Review and commit only isolated Task 1 hunks**

Run:

```bash
git diff --check -- src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx
git diff -- src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx
```

Stage only the Task 1 hunks. Before committing, require `git diff --cached` to show no pre-existing user edits. If a Task 1 hunk cannot be isolated from existing edits, leave it unstaged and record that the commit was intentionally skipped. Otherwise commit:

```bash
git commit -m "fix: return document annotation startup status"
```

### Task 2: Close only the current failed HTML spec

**Files:**
- Modify: `src/index/app/hooks/usePrototypeSpecController.test.ts:1-48`
- Modify: `src/index/app/hooks/usePrototypeSpecController.ts:1-37`
- Modify: `src/index/app/prototypeSpecIntegration.source.test.ts:25-45`
- Modify: `src/index/app/IndexPage.tsx:28,1126-1129`

**Interfaces:**
- Consumes: `handleEnableDocEdit(...): Promise<boolean>` from Task 1 and `prototypeSpec.close()` from the existing controller.
- Produces: `shouldClosePrototypeSpecAfterAnnotationAttempt(params): boolean`, a pure latest-attempt/current-item decision used by `handlePrototypeSpecPreviewReady`.

- [ ] **Step 1: Write failing decision and integration tests**

Add a behavior test to `usePrototypeSpecController.test.ts`:

```ts
it('closes only a failed latest annotation attempt for the current spec item', async () => {
  const controllerModule = await import('./usePrototypeSpecController');
  const shouldClose = (controllerModule as Record<string, unknown>)
    .shouldClosePrototypeSpecAfterAnnotationAttempt as (params: {
      enabled: boolean;
      attemptedItem: object | null;
      currentItem: object | null;
      attemptId: number;
      latestAttemptId: number;
    }) => boolean;
  const currentItem = { name: 'spec.html' };

  expect(typeof shouldClose).toBe('function');
  expect(shouldClose({ enabled: false, attemptedItem: currentItem, currentItem, attemptId: 2, latestAttemptId: 2 })).toBe(true);
  expect(shouldClose({ enabled: true, attemptedItem: currentItem, currentItem, attemptId: 2, latestAttemptId: 2 })).toBe(false);
  expect(shouldClose({ enabled: false, attemptedItem: currentItem, currentItem: { name: 'other.html' }, attemptId: 2, latestAttemptId: 2 })).toBe(false);
  expect(shouldClose({ enabled: false, attemptedItem: currentItem, currentItem, attemptId: 1, latestAttemptId: 2 })).toBe(false);
});
```

Add source integration expectations to `prototypeSpecIntegration.source.test.ts`:

```ts
expect(indexSource).toContain('const prototypeSpecAnnotationAttemptIdRef = useRef(0);');
expect(indexSource).toContain('currentPrototypeSpecItemRef.current = prototypeSpec.currentItem;');
expect(previewReadyHandler).toContain('const annotationEnabled = await preview.handleEnableDocEdit');
expect(previewReadyHandler).toContain('shouldClosePrototypeSpecAfterAnnotationAttempt({');
expect(previewReadyHandler).toContain('prototypeSpec.close();');
```

Keep the existing `.md` early-return assertion to protect Markdown behavior.

- [ ] **Step 2: Run both tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/usePrototypeSpecController.test.ts src/index/app/prototypeSpecIntegration.source.test.ts
```

Expected: FAIL because the pure decision function and HTML failure-close wiring do not exist.

- [ ] **Step 3: Implement the pure close decision**

Add this exported helper next to the existing controller gates:

```ts
export function shouldClosePrototypeSpecAfterAnnotationAttempt(params: {
    enabled: boolean;
    attemptedItem: ItemData | null;
    currentItem: ItemData | null;
    attemptId: number;
    latestAttemptId: number;
}): boolean {
    return !params.enabled
        && params.attemptedItem !== null
        && params.attemptedItem === params.currentItem
        && params.attemptId === params.latestAttemptId;
}
```

- [ ] **Step 4: Wire HTML spec failure back to the prototype**

Import the helper with `usePrototypeSpecController`, then add current-item and latest-attempt refs after the controller is created:

```ts
const prototypeSpecAnnotationAttemptIdRef = useRef(0);
const currentPrototypeSpecItemRef = useRef(prototypeSpec.currentItem);
currentPrototypeSpecItemRef.current = prototypeSpec.currentItem;
```

Replace the preview-ready handler with:

```ts
const handlePrototypeSpecPreviewReady = useCallback(() => {
    const attemptedItem = prototypeSpec.currentItem;
    if (!attemptedItem || String(attemptedItem.name || '').toLowerCase().endsWith('.md')) return;
    const attemptId = prototypeSpecAnnotationAttemptIdRef.current + 1;
    prototypeSpecAnnotationAttemptIdRef.current = attemptId;
    void (async () => {
        const annotationEnabled = await preview.handleEnableDocEdit('comment', {
            disableSelectionMode: true,
            preserveSidebar: true,
        });
        if (!shouldClosePrototypeSpecAfterAnnotationAttempt({
            enabled: annotationEnabled,
            attemptedItem,
            currentItem: currentPrototypeSpecItemRef.current,
            attemptId,
            latestAttemptId: prototypeSpecAnnotationAttemptIdRef.current,
        })) {
            return;
        }
        prototypeSpec.close();
    })();
}, [preview.handleEnableDocEdit, prototypeSpec.close, prototypeSpec.currentItem]);
```

- [ ] **Step 5: Run both tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/usePrototypeSpecController.test.ts src/index/app/prototypeSpecIntegration.source.test.ts
```

Expected: PASS with the decision matrix and integration wiring covered.

- [ ] **Step 6: Run focused regression and type verification**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/usePrototypeSpecController.test.ts src/index/app/prototypeSpecIntegration.source.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/IndexPage.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: all listed Vitest files PASS and TypeScript exits with code 0. If TypeScript reports unrelated pre-existing errors, rerun the focused Vitest command, preserve its passing output, and report the exact unrelated TypeScript diagnostics without changing out-of-scope files.

- [ ] **Step 7: Review and commit only isolated Task 2 hunks**

Run:

```bash
git diff --check -- src/index/app/hooks/usePrototypeSpecController.test.ts src/index/app/hooks/usePrototypeSpecController.ts src/index/app/prototypeSpecIntegration.source.test.ts src/index/app/IndexPage.tsx
git diff -- src/index/app/hooks/usePrototypeSpecController.test.ts src/index/app/hooks/usePrototypeSpecController.ts src/index/app/prototypeSpecIntegration.source.test.ts src/index/app/IndexPage.tsx
```

Stage only the Task 2 hunks. Before committing, require `git diff --cached` to show no pre-existing user edits. If a Task 2 hunk cannot be isolated from existing edits, leave it unstaged and record that the commit was intentionally skipped. Otherwise commit:

```bash
git commit -m "fix: return from unavailable HTML spec annotation"
```

### Task 3: Final verification and handoff

**Files:**
- Verify only: all files modified by Tasks 1 and 2

**Interfaces:**
- Consumes: completed Task 1 and Task 2 behavior.
- Produces: verification evidence and a scoped handoff that identifies any intentionally uncommitted hunks.

- [ ] **Step 1: Run final whitespace and status checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Existing unrelated dirty files remain untouched; only the planned files contain new task hunks.

- [ ] **Step 2: Inspect the final scoped diff**

Run:

```bash
git diff -- src/index/app/hooks/usePrototypeSpecController.test.ts src/index/app/hooks/usePrototypeSpecController.ts src/index/app/prototypeSpecIntegration.source.test.ts src/index/app/IndexPage.tsx src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx
```

Expected: the new hunks implement only boolean result propagation, stale-attempt protection, and HTML spec fallback navigation; existing user hunks may also be visible but must be unchanged from the pre-task snapshot.
