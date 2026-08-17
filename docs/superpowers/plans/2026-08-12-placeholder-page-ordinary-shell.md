# Placeholder Page Ordinary Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing placeholder prototypes use the ordinary prototype page shell and remove the unused frontend waiting-generation path.

**Architecture:** Preserve `placeholder: true` only as a content-rendering signal for `StartGuide` and as resource-selection metadata. Remove it from page-shell visibility and Assistant lifecycle decisions. Delete the unreachable client callback chain that previously transitioned placeholders to a waiting state, while retaining server compatibility APIs.

**Tech Stack:** React 18.2, TypeScript 5.x, Vitest, pnpm workspace.

## Global Constraints

- Use pnpm for development and verification.
- Preserve unrelated uncommitted changes in the current working tree.
- Do not add legacy compatibility logic; retain existing server compatibility without expanding it.
- Keep the no-resource prototype draft behavior unchanged.

---

### Task 1: Lock ordinary page-shell behavior with failing tests

**Files:**
- Modify: `src/index/app/IndexPage.test.ts`
- Modify: `src/index/components/content/PresentationArea.source.test.ts`
- Modify: `src/index/app/responsiveSidebarStateIntegration.source.test.ts`

**Interfaces:**
- Consumes: `placeholder: true` resource metadata and existing draft flags.
- Produces: regression assertions that placeholder metadata is not used by the page shell.

- [x] **Step 1: Rewrite placeholder shell assertions**

Assert that `IndexPage.tsx` has no placeholder auto-close/waiting auto-open state, that `reviewPanelVisible` does not depend on placeholder metadata, and that `prototypeStartPageActive` equals only `prototypeStartDraftActive`. Assert that `PresentationArea.tsx` does not define or consult `isPrototypeStartPlaceholder`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/components/content/PresentationArea.source.test.ts src/index/app/responsiveSidebarStateIntegration.source.test.ts
```

Expected: failures identifying the existing placeholder shell restrictions.

- [x] **Step 3: Remove placeholder shell restrictions**

Delete placeholder auto-close and waiting auto-open refs/effects from `IndexPage.tsx`, remove placeholder guards from ordinary Assistant auto-open/restore, calculate `prototypeStartPageActive` from the draft flag only, and remove `isPrototypeStartPlaceholder` from `PresentationArea.tsx` visibility calculations.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected test files pass.

### Task 2: Remove the dead frontend waiting-generation path

**Files:**
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/services/api.test.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/PresentationArea.tsx`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- Modify: `src/index/types/index-page.types.ts`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/services/api.ts`

**Interfaces:**
- Consumes: `StartGuide.onExecutePrompt`, which already opens the Assistant with `autoSend: false`.
- Produces: a StartGuide with no generation-job callback, no client waiting-state transition, and no pre-submit resource refresh.

- [x] **Step 1: Rewrite dead-path assertions**

Assert that `ContentAreaView.tsx` contains no `handleSubmitPrototypeStartRequest`, `onSubmitPrototypeStartRequest`, `onCreatePrototypeForDraftStart`, or `startPlaceholderPrototypeGeneration`, while the prototype cards still call `onExecutePrompt` with `autoSend: false`. Assert that the index API client no longer exposes `startPlaceholderPrototypeGeneration`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts src/index/services/api.test.ts
```

Expected: failures identifying the obsolete callback and API method.

- [x] **Step 3: Remove the callback chain**

Delete the dead submit handler, its prop declarations and forwarding, the draft-only creation callback used only by that handler, and the API client method. Keep `StartGuide` prompt-card execution unchanged.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected test files pass.

### Task 3: Verify the integrated Make frontend

**Files:**
- Inspect: all files modified in Tasks 1 and 2.

**Interfaces:**
- Consumes: completed ordinary-shell and dead-path cleanup changes.
- Produces: fresh test, type-check/build, and diff evidence.

- [x] **Step 1: Run the complete focused regression set**

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/components/content/PresentationArea.source.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/app/hooks/useIndexPageSidebarPropsBuilder.test.ts src/index/app/responsiveSidebarStateIntegration.source.test.ts src/index/services/api.test.ts
```

Expected: all selected tests pass.

- [x] **Step 2: Run the Make TypeScript build check**

```bash
pnpm server:build
```

Expected: exit code 0.

- [x] **Step 3: Inspect the focused diff and whitespace**

```bash
git diff --check
git diff -- src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts src/index/components/content/PresentationArea.tsx src/index/components/content/PresentationArea.source.test.ts src/index/components/content/ContentAreaView.tsx src/index/components/content/ContentAreaView.source.test.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts src/index/types/index-page.types.ts src/index/services/api.ts src/index/services/api.test.ts src/index/app/responsiveSidebarStateIntegration.source.test.ts
```

Expected: no whitespace errors and only the scoped behavior changes mixed into the user's existing file diffs.
