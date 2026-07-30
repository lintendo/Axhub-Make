# Device Preview Mobile Annotation Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the existing mobile annotation interaction in phone-sized preview iframes and guarantee that Prompt Cards cannot be positioned outside their iframe viewport.

**Architecture:** Add a pure Make-side resolver that derives Commentary `mobileMode` from the active preview configuration instead of iframe pane identity alone. Keep Commentary's existing mobile UI, and add a final viewport invariant to the desktop Prompt Card positioning helper.

**Tech Stack:** React 18.2, TypeScript 5.x, Vitest, pnpm workspace

## Global Constraints

- Use pnpm for repository development and verification.
- Preserve unrelated uncommitted workspace changes.
- Do not change iframe ownership or introduce cross-window overlay coordinate bridging.
- Phone preset and custom widths up to 768px use mobile annotation UI; 820px tablet remains compact desktop UI with viewport clamping.
- Do not add legacy compatibility branches.

---

### Task 1: Resolve annotation interaction mode from preview configuration

**Files:**
- Modify: `src/index/app/index-page/previewActions.helpers.ts`
- Modify: `src/index/app/index-page/previewActions.helpers.test.ts`
- Modify: `src/index/app/index-page/usePrototypeEditorBridgeActions.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`

**Interfaces:**
- Consumes: `PreviewConfig`, `PreviewPane`, and resource type.
- Produces: `resolvePrototypeEditorMobileMode(resourceType, pane, previewConfig): boolean`.

- [ ] **Step 1: Write the failing resolver tests**

```ts
expect(resolvePrototypeEditorMobileMode('prototype', 'primary', {
  ...createDefaultPreviewConfig(),
  singlePreset: 'mobile',
})).toBe(true);
expect(resolvePrototypeEditorMobileMode('prototype', 'primary', {
  ...createDefaultPreviewConfig(),
  singlePreset: 'tablet',
})).toBe(false);
expect(resolvePrototypeEditorMobileMode('prototype', 'primary', {
  ...createDefaultPreviewConfig(),
  singlePreset: 'custom',
  customWidth: 640,
})).toBe(true);
expect(resolvePrototypeEditorMobileMode('prototype', 'primary', {
  ...createDefaultPreviewConfig(),
  singlePreset: 'custom',
  customWidth: 1024,
})).toBe(false);
expect(resolvePrototypeEditorMobileMode('prototype', 'secondary', createDefaultPreviewConfig())).toBe(true);
expect(resolvePrototypeEditorMobileMode('theme', 'secondary', createDefaultPreviewConfig())).toBe(false);
```

- [ ] **Step 2: Run the resolver tests and confirm failure**

Run: `pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts`

Expected: FAIL because `resolvePrototypeEditorMobileMode` is not exported.

- [ ] **Step 3: Implement the resolver and pass previewConfig into the bridge hook**

```ts
export function resolvePrototypeEditorMobileMode(
  resourceType: 'prototype' | 'theme',
  pane: PreviewPane,
  previewConfig: PreviewConfig,
): boolean {
  if (resourceType !== 'prototype') return false;
  if (pane === 'secondary') return true;
  if (previewConfig.previewMode !== 'single') return false;
  if (previewConfig.singlePreset === 'mobile') return true;
  return previewConfig.singlePreset === 'custom'
    && Number.isFinite(previewConfig.customWidth)
    && (previewConfig.customWidth as number) <= 768;
}
```

Add `previewConfig: PreviewConfig` to `UsePrototypeEditorBridgeActionsParams`, pass it from `useIndexPagePreviewActions.tsx`, and replace the pane-only expression in `buildPrototypeEditorContext` with the resolver call.

- [ ] **Step 4: Run Make-side focused tests**

Run: `pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts`

Expected: PASS.

### Task 2: Enforce the Prompt Card viewport invariant

**Files:**
- Modify: `../../packages/axhub-commentary/src/ui/prompt-card-position.test.ts`
- Modify: `../../packages/axhub-commentary/src/ui/prompt-card-position.ts`

**Interfaces:**
- Consumes: existing `ComputePromptCardPositionOptions`.
- Produces: existing `computePromptCardPosition()` with coordinates that never reserve more property-panel space than the viewport can provide.

- [ ] **Step 1: Write the failing narrow viewport regression test**

```ts
expect(computePromptCardPosition({
  anchorRect: { left: 180, top: 200, width: 1, height: 1 },
  cardWidth: 360,
  cardHeight: 128,
  viewportWidth: 393,
  viewportHeight: 852,
  propertyPanelEnabled: true,
})).toEqual({ left: 12, top: 137 });
```

- [ ] **Step 2: Run the positioning test and confirm failure**

Run: `pnpm exec vitest run packages/axhub-commentary/src/ui/prompt-card-position.test.ts`

Expected: FAIL because the current result has a negative `left`.

- [ ] **Step 3: Clamp the desktop placement range to the viewport**

Compute a `viewportMaxLeft`, use the property-panel limit only when it is at least `safePaddingPx`, and clamp the final coordinate between `safePaddingPx` and `viewportMaxLeft`. Preserve the existing right-side and left-side preference order.

- [ ] **Step 4: Run Commentary positioning and mobile-detection tests**

Run: `pnpm exec vitest run packages/axhub-commentary/src/ui/prompt-card-position.test.ts packages/axhub-commentary/src/utils/mobile-detect.test.ts`

Expected: PASS.

### Task 3: Integrated verification

**Files:**
- Verify only; no additional production files.

**Interfaces:**
- Consumes: Task 1 mode resolver and Task 2 positioning invariant.
- Produces: evidence that Make and Commentary compile and their focused regressions pass together.

- [ ] **Step 1: Run all focused regression tests together**

Run: `pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts packages/axhub-commentary/src/ui/prompt-card-position.test.ts packages/axhub-commentary/src/utils/mobile-detect.test.ts`

Expected: PASS.

- [ ] **Step 2: Build the Make Admin UI**

Run: `pnpm --filter @axhub/make admin:build`

Expected: exit code 0.

- [ ] **Step 3: Review the exact diff**

Run: `git diff -- apps/axhub-make/src/index/app/index-page/previewActions.helpers.ts apps/axhub-make/src/index/app/index-page/previewActions.helpers.test.ts apps/axhub-make/src/index/app/index-page/usePrototypeEditorBridgeActions.ts apps/axhub-make/src/index/app/index-page/useIndexPagePreviewActions.tsx apps/axhub-make/src/index/app/index-page/useIndexPagePreviewActions.test.ts packages/axhub-commentary/src/ui/prompt-card-position.ts packages/axhub-commentary/src/ui/prompt-card-position.test.ts`

Expected: only the mobile-mode resolver wiring, viewport clamp, and their tests are present beyond pre-existing user changes.

