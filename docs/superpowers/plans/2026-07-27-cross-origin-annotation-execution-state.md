# Cross-Origin Annotation Execution State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make host-toolbar AI execution immediately update every actionable annotation marker when the prototype iframe is cross-origin.

**Architecture:** Extend the existing prototype editor postMessage response so prompt collection returns `promptText` and `modifiedElements` atomically. Normalize those elements through one pure host helper, then feed the resulting pane-scoped targets into the existing direct-run registry and node-state bridge without changing ACP or Commentary task semantics.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, browser postMessage bridge, pnpm.

## Global Constraints

- Use pnpm for repository development, tests, and builds.
- Preserve all unrelated and pre-existing worktree changes.
- Do not add legacy protocol compatibility, a second task store, or a WebSocket bridge.
- Do not modify ACP APIs, Commentary persistence, prototype source, or annotation copy.
- Do not commit implementation files because all target files already contain user-owned uncommitted changes; only the isolated plan document may be committed.

---

### Task 1: Return annotation targets with cross-origin prompt responses

**Files:**
- Modify: `src/dev-template/editor-bridge-options.test.ts`
- Modify: `src/dev-template/index.tsx`
- Modify: `src/index/app/index-page/previewActions.helpers.ts`
- Modify: `src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts`

**Interfaces:**
- Consumes: `editorModeManager.api.getEditedSnapshot(): CommentaryEditedSnapshot | null`.
- Produces: `PrototypeEditorBridgeStateMessage.modifiedElements?: CommentaryModifiedElementSummary[]`.

- [ ] **Step 1: Write failing bridge contract tests**

Add source contract assertions proving prompt responses read and return the editor snapshot:

```ts
it('returns modified annotation elements with prompt bridge responses', () => {
  const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

  expect(source).toContain('modifiedElements?: CommentaryModifiedElementSummary[];');
  expect(source).toContain('editorModeManager?.api.getEditedSnapshot?.()?.modifiedElements ?? []');
  expect(source).toContain('modifiedElements,');
});
```

Add the parent-side response contract assertion:

```ts
it('accepts modified annotation elements from cross-origin prompt responses', () => {
  const source = readSource();
  expect(source).toContain('modifiedElements?: CommentaryModifiedElementSummary[];');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm exec vitest run src/dev-template/editor-bridge-options.test.ts src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts
```

Expected: FAIL because `PrototypeEditorBridgeStateMessage` and `postPrototypeEditorState` do not expose `modifiedElements`.

- [ ] **Step 3: Extend the existing response contract**

Import `CommentaryModifiedElementSummary` as a type in both bridge modules. Extend `postPrototypeEditorState` and the parent response type:

```ts
type PrototypeEditorStatePayload = {
  requestId?: unknown;
  success: boolean;
  handled?: boolean;
  error?: string;
  promptText?: string;
  modifiedElements?: CommentaryModifiedElementSummary[];
};
```

When handling `copy-prompt` or element `send-to-agent`, capture the snapshot beside the prompt and include it in the same response:

```ts
const modifiedElements = editorModeManager?.api.getEditedSnapshot?.()?.modifiedElements ?? [];
postPrototypeEditorState({
  requestId: event.data.requestId,
  success: true,
  handled: true,
  promptText: promptText || undefined,
  modifiedElements,
});
```

Serialize the field without changing other bridge responses:

```ts
...(payload.modifiedElements ? { modifiedElements: payload.modifiedElements } : {}),
```

- [ ] **Step 4: Run the bridge tests and verify GREEN**

Run the Step 2 command again.

Expected: both files pass with zero failed tests.

---

### Task 2: Resolve cross-origin bridge elements into direct-run targets

**Files:**
- Modify: `src/index/app/index-page/previewActions.helpers.test.ts`
- Modify: `src/index/app/index-page/previewActions.helpers.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`

**Interfaces:**
- Consumes: `CommentaryHostToolbarAction` and `readonly CommentaryModifiedElementSummary[]`.
- Produces: `resolveAnnotationActionEditingTargets(action, modifiedElements)` returning `{ elementKey, targetRef }[]`.

- [ ] **Step 1: Write failing target-resolution tests**

Add behavior tests to `previewActions.helpers.test.ts`:

```ts
it('maps cross-origin modified elements to top-level AI execution targets', () => {
  expect(resolveAnnotationActionEditingTargets(
    { type: 'send-to-agent' },
    [
      { elementKey: 'card-a', locator: locatorA, label: 'Card A', note: 'A', imageCount: 0, changeKinds: [] },
      { elementKey: 'card-b', locator: locatorB, label: 'Card B', note: 'B', imageCount: 0, changeKinds: [] },
    ],
  )).toEqual([
    { elementKey: 'card-a', targetRef: { locator: locatorA, label: 'Card A' } },
    { elementKey: 'card-b', targetRef: { locator: locatorB, label: 'Card B' } },
  ]);
});

it('keeps an explicit element action scoped to that element', () => {
  expect(resolveAnnotationActionEditingTargets({
    type: 'send-to-agent',
    elementKey: 'card-a',
    locator: locatorA,
    label: 'Card A',
  }, [{ elementKey: 'card-b', locator: locatorB, label: 'Card B', note: 'B', imageCount: 0, changeKinds: [] }]))
    .toEqual([{ elementKey: 'card-a', targetRef: { locator: locatorA, label: 'Card A' } }]);
});
```

Also assert that empty/whitespace keys are ignored and duplicates keep the first target.

Update the preview-action source test to require the cross-origin branch to consume `bridgeResult?.modifiedElements` through `collectPrototypePrompt('primary', nextAction)`.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: FAIL because the pure resolver is not exported and the bridge targets are discarded.

- [ ] **Step 3: Implement the pure resolver**

Add this focused helper in `previewActions.helpers.ts`:

```ts
export function resolveAnnotationActionEditingTargets(
  action: CommentaryHostToolbarAction | null | undefined,
  modifiedElements: readonly CommentaryModifiedElementSummary[] = [],
): Array<{
  elementKey: string;
  targetRef: { locator: ElementLocator | null; label: string };
}> {
  if (action?.type === 'send-to-agent') {
    const elementKey = String(action.elementKey || '').trim();
    if (elementKey) {
      return [{
        elementKey,
        targetRef: {
          locator: action.locator ?? null,
          label: String(action.label || '').trim() || elementKey,
        },
      }];
    }
  }

  const targets = new Map<string, {
    elementKey: string;
    targetRef: { locator: ElementLocator | null; label: string };
  }>();
  for (const item of modifiedElements) {
    const elementKey = String(item?.elementKey || '').trim();
    if (!elementKey || targets.has(elementKey)) continue;
    targets.set(elementKey, {
      elementKey,
      targetRef: {
        locator: item?.locator ?? null,
        label: String(item?.label || '').trim() || elementKey,
      },
    });
  }
  return Array.from(targets.values());
}
```

- [ ] **Step 4: Use one prompt collection path for same-origin and cross-origin execution**

In `collectPrototypePrompt`, resolve same-origin targets from `editors?.getEditedSnapshot?.()?.modifiedElements`. After a postMessage response, resolve targets again from `bridgeResult?.modifiedElements`:

```ts
const bridgeResult = await postPrototypeEditorHostToolbarAction(iframe, bridgeAction);
return {
  promptText: bridgeResult?.promptText ?? '',
  editingTargets: buildAnnotationDirectRunEditingTargets(
    pane,
    iframe,
    resolveAnnotationActionEditingTargets(action, bridgeResult?.modifiedElements ?? []),
  ),
};
```

Replace the duplicated primary-pane send fallback with the shared collector:

```ts
return runAnnotationAcpChatPrompt(
  await collectPrototypePrompt('primary', nextAction),
);
```

Keep the existing explicit-pane and split-preview branches unchanged.

- [ ] **Step 5: Run the target and preview tests and verify GREEN**

Run the Step 2 command again.

Expected: both files pass with zero failed tests.

---

### Task 3: Regression and real-page verification

**Files:**
- Verify only; do not modify unrelated files.

**Interfaces:**
- Consumes: the bridge contract and target resolver from Tasks 1-2.
- Produces: fresh test, typecheck, build, and browser evidence for the reported workflow.

- [ ] **Step 1: Run the focused regression suite**

```bash
pnpm exec vitest run \
  src/dev-template/editor-bridge-options.test.ts \
  src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts \
  src/index/app/index-page/previewActions.helpers.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts \
  src/index/domains/assistant/annotationDirectRunManager.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 2: Run type and build verification**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
pnpm admin:build
```

Expected: both commands exit 0. `pnpm admin:build` may refresh the committed vendor artifact; inspect and preserve only task-related changes.

- [ ] **Step 3: Verify the cross-origin UI without completing a real AI run**

Use the running `localhost:53817` management page with the `localhost:51720` prototype iframe. Intercept or abort the direct run immediately after the `started` state, then verify all visible current-page markers expose `data-task-state="editing"` before any ACP terminal result. Clear only the temporary task state created by this verification.

- [ ] **Step 4: Review the final diff**

```bash
git diff --check
git diff -- \
  src/dev-template/editor-bridge-options.test.ts \
  src/dev-template/index.tsx \
  src/index/app/index-page/previewActions.helpers.test.ts \
  src/index/app/index-page/previewActions.helpers.ts \
  src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.tsx
```

Expected: no whitespace errors; task hunks are limited to bridge target transport, target normalization, prompt collection, and regression tests.
