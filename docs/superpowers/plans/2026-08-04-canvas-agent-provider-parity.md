# Canvas Agent Provider Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas AI provider menu use the same complete ACP provider definition as AI Settings.

**Architecture:** `acpModelConfig.ts` remains the single provider registry. `CanvasGenerationComposer.tsx` derives both its provider keys and menu labels from `ACP_PROVIDER_OPTIONS`; runtime capability data may select a provider but cannot filter the menu.

**Tech Stack:** React 18.2, TypeScript 5, Vitest 4, pnpm.

## Global Constraints

- Use `pnpm`; do not add dependencies.
- Preserve all unrelated uncommitted changes in `apps/axhub-make`.
- Show every provider defined by `ACP_PROVIDER_OPTIONS`, without filtering by local installation or availability.
- Ignore partial runtime `providerOptions` when constructing the supplier menu.
- Do not change default-provider selection, server APIs, or AI Settings UI.

---

### Task 1: Establish the complete-provider contract

**Files:**
- Modify: `src/index/domains/shared/CanvasGenerationComposer.test.ts:378-456`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.source.test.ts:731-756`

**Interfaces:**
- Consumes: `ACP_PROVIDER_OPTIONS`, whose current provider order is `claude`, `codex`, `opencode`, `cursor`, `qoder`, `codebuddy`, `reasonix`, `grok-build`.
- Produces: tests requiring `resolveCanvasAcpSelectorDefaults` and `resolveCanvasAcpRuntimeProviderOptions` to return the complete registry whenever runtime options are absent.

- [ ] **Step 1: Write the failing behavior test**

Replace the fixed-three-provider expectations with the complete shared order:

```ts
expect(resolveCanvasAcpSelectorDefaults('acp:codex')).toEqual({
  defaultProvider: 'codex',
  providerOptions: ['claude', 'codex', 'opencode', 'cursor', 'qoder', 'codebuddy', 'reasonix', 'grok-build'],
});
expect(resolveCanvasAcpRuntimeProviderOptions(undefined, 'codex')).toEqual([
  'claude', 'codex', 'opencode', 'cursor', 'qoder', 'codebuddy', 'reasonix', 'grok-build',
]);
```

Also change the source-contract test to require `ACP_PROVIDER_OPTIONS` and provider option derivation, and to reject `FIXED_CANVAS_ACP_PROVIDER_OPTIONS` plus the duplicated label/order constants.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
pnpm exec vitest run src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: the updated selector assertions fail because the implementation still returns only three fallback providers.

- [ ] **Step 3: Implement the minimal shared-registry derivation**

In `CanvasGenerationComposer.tsx`, import `ACP_PROVIDER_OPTIONS` from `../../../common/acpModelConfig`. Replace the fixed fallback list with:

```ts
const CANVAS_ACP_PROVIDER_KEYS = ACP_PROVIDER_OPTIONS.map((option) => option.provider);
```

Use `CANVAS_ACP_PROVIDER_KEYS` as the no-runtime fallback. Replace duplicated canvas label/order maps with:

```ts
const CANVAS_ACP_PROVIDER_OPTIONS = ACP_PROVIDER_OPTIONS.map((option) => ({
  value: option.provider,
  label: option.label,
}));
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: exit code 0 with both test files passing.

- [ ] **Step 5: Run TypeScript validation for the changed application**

Run:

```bash
pnpm server:build
```

Expected: exit code 0; the shared provider registry remains type-compatible with the canvas selector.

- [ ] **Step 6: Commit the scoped change when the worktree is otherwise ready**

Run:

```bash
git add src/index/domains/shared/CanvasGenerationComposer.tsx src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
git commit -m "fix: align canvas agent providers with settings"
```

Expected: the commit contains only this change and does not stage existing user work.

### Task 2: Prevent runtime option filtering

**Files:**
- Modify: `src/index/domains/shared/CanvasGenerationComposer.test.ts:451-456`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.tsx:130-140`

**Interfaces:**
- Consumes: a runtime `providerOptions` array that may be a strict subset of `AcpProviderKey` values.
- Produces: `resolveCanvasAcpRuntimeProviderOptions` always returns every key derived from `ACP_PROVIDER_OPTIONS`.

- [ ] **Step 1: Write the failing partial-runtime regression test**

Add this assertion to the runtime provider-options test:

```ts
expect(resolveCanvasAcpRuntimeProviderOptions(['codex'], 'codex')).toEqual([
  'claude', 'codex', 'opencode', 'cursor', 'qoder', 'codebuddy', 'reasonix', 'grok-build',
]);
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
pnpm exec vitest run src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: the new assertion fails because the implementation currently returns only `codex` for a partial runtime list.

- [ ] **Step 3: Ignore runtime provider arrays for menu construction**

Change `resolveCanvasAcpRuntimeProviderOptions` so its returned base list is always:

```ts
const resolvedOptions = [...CANVAS_ACP_PROVIDER_KEYS];
```

Keep the selected-provider preservation check for compatibility. Do not use `providerOptions` to remove canonical entries.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts
```

Expected: exit code 0 with all targeted tests passing.

- [ ] **Step 5: Run TypeScript validation**

Run:

```bash
pnpm server:build
```

Expected: exit code 0.
