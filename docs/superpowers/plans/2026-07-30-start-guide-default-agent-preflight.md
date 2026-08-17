# Start Guide Default Agent Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent prototype, resource, and design start pages from creating resources or submitting AI work until a default ACP Agent is configured.

**Architecture:** Add an early preflight at the start-guide request boundary while retaining the existing `IndexPage` submission guard. Compute ACP selector visibility with a small pure helper so an unconfigured project displays the AI settings fallback instead of an implicit Codex selection.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, pnpm.

## Global Constraints

- Use pnpm only for repository development and tests.
- Preserve all unrelated and pre-existing worktree changes.
- Do not add legacy compatibility branches.

---

### Task 1: Gate start-guide side effects and selector state

**Files:**
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.tsx`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.test.ts`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.source.test.ts`

**Interfaces:**
- Consumes: `preferredPromptClient`, `onOpenAISettings`, `resolveAcpPromptClientProvider`, and `normalizePromptClientPreference`.
- Produces: `resolveCanvasAcpSelectorVisibility(input): { showSelectors: boolean; showSettingsFallback: boolean }` and an early `false` result for unconfigured start-guide submissions.

- [x] **Step 1: Write failing tests**

Add a source-order regression asserting that `handleSubmitPrototypeStartRequest` checks the normalized default provider before `resource-start`, `theme-start`, `onCreatePrototypeForDraftStart`, and `startPlaceholderPrototypeGeneration`. Add pure-function cases for disabled selectors, missing defaults, ready configured defaults, and runtime fallback.

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: the new preflight and selector visibility assertions fail because the production behavior is not implemented yet.

- [x] **Step 3: Implement the minimal behavior**

At the first line of `handleSubmitPrototypeStartRequest`, return `false` after opening AI settings and warning when the normalized default provider is absent. Add `resolveCanvasAcpSelectorVisibility` and use its result in both ACP composer wrappers rather than directly keying selector visibility only from `canvasAcpRuntime.needsFallback`.

- [x] **Step 4: Run focused tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: all focused tests pass.

- [x] **Step 5: Run adjacent regression tests**

Run:

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: all selected test files pass with zero failures.
