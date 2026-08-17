# Scaled Preview Horizontal Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the custom/adaptive scaled preview 8px of horizontal breathing room on each side without changing the edge-to-edge desktop preview or other preview modes.

**Architecture:** Keep the raw preview container measurement unchanged so adaptive desktop thresholds continue to use the real workspace width. Add an optional single-preview reserved-width input to the pure layout resolver, use it only for the `custom` branch, and pair the resulting 16px reservation with `px-2` on the custom preview wrapper.

**Tech Stack:** React 18.2, TypeScript 5, Tailwind CSS, Vitest, pnpm workspace

## Global Constraints

- Use pnpm for repository development and tests.
- Preserve all pre-existing uncommitted changes in `ContentAreaView.tsx` and the preview layout files.
- Reserve exactly 8px on the left and 8px on the right of custom/adaptive scaled previews.
- Do not alter desktop, mobile, tablet, split, or multi-page preview behavior.
- Do not add legacy compatibility branches or new dependencies.

---

### Task 1: Reserve and render the scaled-preview gap

**Files:**
- Modify: `src/index/domains/device/preview-layout.test.ts`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/domains/device/preview-layout.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`

**Interfaces:**
- Consumes: existing `resolvePreviewLayout(params): PreviewLayoutResult` and the `custom` single-preview render branch.
- Produces: optional `singleReservedWidth?: number` in `resolvePreviewLayout` params; custom preview sizing subtracts this value before calling `createViewportMetrics`.

- [x] **Step 1: Write failing layout and source tests**

Add this case to `src/index/domains/device/preview-layout.test.ts`:

```ts
it('reserves a small horizontal gap around custom scaled previews', () => {
  const layout = resolvePreviewLayout({
    config: {
      ...createDefaultPreviewConfig(),
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      scaleMode: 'fit-screen',
    },
    containerWidth: 1000,
    containerHeight: 900,
    singleReservedWidth: 16,
  });

  expect(layout.mode).toBe('single');
  expect(layout.single.viewportWidth).toBe(984);
  expect(layout.single.scale).toBeCloseTo(984 / 1440, 5);
});
```

Add this case to the `ContentAreaView review zoom source` suite in `src/index/components/content/ContentAreaView.source.test.ts`:

```ts
it('pairs the custom scaled preview width reservation with symmetric 8px padding', () => {
  const source = readContentAreaViewSource();
  const customPreviewBranch = getSourceSegment(
    source,
    ") : previewLayout.single.kind === 'custom' ? (",
    ') : (\n                        <div className="flex h-full w-full items-start justify-center pt-4">',
  );

  expect(source).toContain('const SCALED_PREVIEW_HORIZONTAL_GAP = 8;');
  expect(source).toContain('singleReservedWidth: SCALED_PREVIEW_HORIZONTAL_GAP * 2,');
  expect(customPreviewBranch).toContain('px-2');
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/domains/device/preview-layout.test.ts src/index/components/content/ContentAreaView.source.test.ts
```

Expected: FAIL because `singleReservedWidth` is not accepted or applied, and the source lacks the gap constant, resolver argument, and `px-2` class.

- [x] **Step 3: Implement the minimal layout reservation**

In `src/index/domains/device/preview-layout.ts`, add the optional parameter beside the existing reserved-size parameters:

```ts
singleReservedWidth?: number;
```

Normalize it near `splitReservedWidth`:

```ts
const singleReservedWidth = Math.max(0, Math.floor(params.singleReservedWidth ?? 0));
```

In the `custom` branch, resolve metrics against the reserved width:

```ts
const metrics = createViewportMetrics(
  measuredSize.width,
  measuredSize.height,
  Math.max(1, containerWidth - singleReservedWidth),
  containerHeight,
  config.scaleMode,
);
```

In `src/index/components/content/ContentAreaView.tsx`, define the visual gap with the other preview constants:

```ts
const SCALED_PREVIEW_HORIZONTAL_GAP = 8;
```

Pass the matching total reservation to the resolver:

```ts
singleReservedWidth: SCALED_PREVIEW_HORIZONTAL_GAP * 2,
```

Finally, change only the custom-preview wrapper to include symmetric padding:

```tsx
<div className="flex h-full w-full items-start justify-center px-2 pt-4">
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/domains/device/preview-layout.test.ts src/index/components/content/ContentAreaView.source.test.ts
```

Expected: both test files pass with zero failures.

- [x] **Step 5: Verify formatting and relevant build boundaries**

Run:

```bash
git diff --check -- src/index/components/content/ContentAreaView.tsx src/index/components/content/ContentAreaView.source.test.ts src/index/domains/device/preview-layout.ts src/index/domains/device/preview-layout.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: no whitespace errors and TypeScript exits with status 0. If the repository's pre-existing uncommitted work causes unrelated diagnostics, record the exact diagnostics and keep the focused Vitest result as the feature-level verification.

- [x] **Step 6: Review the scoped diff without staging unrelated work**

Run:

```bash
git diff -- src/index/components/content/ContentAreaView.tsx src/index/components/content/ContentAreaView.source.test.ts src/index/domains/device/preview-layout.ts src/index/domains/device/preview-layout.test.ts
```

Expected: the new edits are limited to the 8px constant, 16px custom-layout reservation, custom wrapper padding, and their focused tests. Do not create an implementation commit because these files contained user-owned changes before this task and staging them wholesale would include unrelated work.
