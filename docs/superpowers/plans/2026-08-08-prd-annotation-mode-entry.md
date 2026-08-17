# PRD Annotation Mode Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the new annotation editor visible only after entering through the PRD annotation entry, while ordinary quick comments continue to hide it.

**Architecture:** The Make host passes an explicit interaction profile for every prototype-editor launch. The controller uses the resolved profile to derive the annotation-editor visibility flag passed to `@axhub/commentary`, so the profile and the UI affordance cannot diverge.

**Tech Stack:** React 18.2, TypeScript 5.x, Vitest, pnpm.

## Global Constraints

- Use pnpm for repository commands.
- Preserve unrelated uncommitted work in the existing Make worktree.
- Do not change the public `@axhub/commentary` UI; repair the Make host integration only.
- Ordinary quick edit uses the `design` interaction profile and hides annotation editing.
- PRD annotation uses the `annotation` interaction profile and retains the existing “编辑 / 生成” UI.

---

### Task 1: Cover profile-specific annotation-editor visibility

**Files:**

- Modify: `src/dev-template/webEditorV2Integration.test.ts`
- Modify: `src/dev-template/webEditorV2Integration.ts`
- Modify: `src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts`
- Modify: `src/index/app/index-page/usePrototypeEditorBridgeActions.ts`

**Interfaces:**

- Consumes: `WebEditorV2EnableOptions.interactionProfile`.
- Produces: `createCommentary({ interactionProfile, host: { showAnnotationMarkdownEditor } })` with matching profile-specific visibility.

- [x] **Step 1: Write the failing test**

Add a controller test that starts a normal `design` session, stops it, then starts an `annotation` session. Assert that the first `createCommentary` call receives `showAnnotationMarkdownEditor: false`, the second receives `showAnnotationMarkdownEditor: true`, and the second call receives `interactionProfile: 'annotation'`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/axhub-make exec vitest run src/dev-template/webEditorV2Integration.test.ts`

Expected: the new assertion fails because the controller currently passes `showAnnotationMarkdownEditor: false` for the annotation profile.

- [x] **Step 3: Write the minimal implementation**

In `createWebEditorV2Controller`, set `host.showAnnotationMarkdownEditor` from `resolvedInteractionProfile === 'annotation'`. In the prototype bridge, explicitly pass `interactionProfile: 'design'` for normal sessions and `'annotation'` for PRD annotation sessions.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/axhub-make exec vitest run src/dev-template/webEditorV2Integration.test.ts src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts`

Expected: all targeted tests pass.

- [x] **Step 5: Verify the working tree scope**

Run: `git -C apps/axhub-make diff --check` and inspect the diff limited to the two source files and the controller test.
