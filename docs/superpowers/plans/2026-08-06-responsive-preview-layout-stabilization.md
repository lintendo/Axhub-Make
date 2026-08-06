# Responsive Preview Layout Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep automatic desktop preview responsive to real workspace resizing while ignoring only annotation-sidebar and review-panel layout changes.

**Architecture:** Replace `lockedAdaptiveDesktop` with a pure responsive-basis reducer. ContentArea reports actual preview width, IndexPageDesktop reports stable external workspace width, and named stabilization reasons anchor only automatic device selection; actual iframe layout and manual device intent remain independent.

**Tech Stack:** React 18.2, TypeScript 5.x, Vitest 4, ResizeObserver, pnpm.

## Global Constraints

- Keep thresholds exactly `1280px` and `1440x900`.
- Preserve `device` URL behavior and all manual device modes.
- Use `annotation-sidebar` and `review-panel`, never a shared lock boolean.
- Final iframe layout uses actual preview width and height.
- Preserve unrelated worktree changes. Implementation files already contain prerequisite user edits, so leave them unstaged unless an isolated commit would remain coherent.

---

### Task 1: Pure Responsive-Basis Reducer

**Files:**
- Create: `src/index/domains/device/preview-responsive-basis.ts`
- Create: `src/index/domains/device/preview-responsive-basis.test.ts`

**Interfaces:**
- Produces `PreviewLayoutStabilizationReason`, `PreviewResponsiveBasisState`, `PreviewResponsiveBasisEvent`, `createPreviewResponsiveBasisState()`, `reducePreviewResponsiveBasisState()`, and `resolvePreviewResponsiveBasisWidth()`.

- [ ] **Step 1: Write failing behavior tests**

```ts
const anchored = apply(createPreviewResponsiveBasisState(),
  { type: 'preview-width-changed', width: 1279 },
  { type: 'external-workspace-width-changed', width: 1519 },
  { type: 'stabilization-started', reason: 'annotation-sidebar' },
  { type: 'preview-width-changed', width: 1519 });
expect(resolvePreviewResponsiveBasisWidth(anchored)).toBe(1279);

const resized = apply(anchored,
  { type: 'external-workspace-width-changed', width: 1760 },
  { type: 'preview-width-changed', width: 1760 });
expect(resolvePreviewResponsiveBasisWidth(resized)).toBe(1520);
```

Also test overlapping reasons, last-reason release, delayed measurements, idempotent begin/end, and rejection of zero, negative, and `NaN` widths.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/domains/device/preview-responsive-basis.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the reducer**

```ts
export type PreviewLayoutStabilizationReason = 'annotation-sidebar' | 'review-panel';
export interface PreviewResponsiveBasisState {
  previewContainerWidth: number;
  externalWorkspaceWidth: number;
  activeReasons: PreviewLayoutStabilizationReason[];
  anchor: { previewWidth: number; externalWorkspaceWidth: number } | null;
}
export type PreviewResponsiveBasisEvent =
  | { type: 'preview-width-changed'; width: number }
  | { type: 'external-workspace-width-changed'; width: number }
  | { type: 'stabilization-started'; reason: PreviewLayoutStabilizationReason }
  | { type: 'stabilization-ended'; reason: PreviewLayoutStabilizationReason };

export function createPreviewResponsiveBasisState(): PreviewResponsiveBasisState {
  return { previewContainerWidth: 0, externalWorkspaceWidth: 0, activeReasons: [], anchor: null };
}
function validWidth(width: number) {
  return Number.isFinite(width) && width > 0 ? Math.floor(width) : null;
}
function capture(state: PreviewResponsiveBasisState): PreviewResponsiveBasisState {
  if (state.anchor || state.activeReasons.length === 0
    || state.previewContainerWidth <= 0 || state.externalWorkspaceWidth <= 0) return state;
  return { ...state, anchor: {
    previewWidth: state.previewContainerWidth,
    externalWorkspaceWidth: state.externalWorkspaceWidth,
  } };
}
export function reducePreviewResponsiveBasisState(
  state: PreviewResponsiveBasisState,
  event: PreviewResponsiveBasisEvent,
): PreviewResponsiveBasisState {
  if (event.type === 'preview-width-changed') {
    const width = validWidth(event.width);
    return width === null ? state : capture({ ...state, previewContainerWidth: width });
  }
  if (event.type === 'external-workspace-width-changed') {
    const width = validWidth(event.width);
    return width === null ? state : capture({ ...state, externalWorkspaceWidth: width });
  }
  if (event.type === 'stabilization-started') {
    if (state.activeReasons.includes(event.reason)) return state;
    return capture({ ...state, activeReasons: [...state.activeReasons, event.reason] });
  }
  const activeReasons = state.activeReasons.filter((reason) => reason !== event.reason);
  if (activeReasons.length === state.activeReasons.length) return state;
  return { ...state, activeReasons, anchor: activeReasons.length ? state.anchor : null };
}
export function resolvePreviewResponsiveBasisWidth(state: PreviewResponsiveBasisState) {
  if (!state.anchor || state.externalWorkspaceWidth <= 0) return state.previewContainerWidth;
  return Math.max(1, state.anchor.previewWidth
    + state.externalWorkspaceWidth - state.anchor.externalWorkspaceWidth);
}
```

- [ ] **Step 4: Run GREEN**

Run the Step 2 command again, then `git diff --check -- src/index/domains/device/preview-responsive-basis.ts src/index/domains/device/preview-responsive-basis.test.ts`.

Expected: all tests PASS and no whitespace output.

### Task 2: Device Hook Integration

**Files:**
- Modify: `src/index/app/index-page/usePreviewDeviceActions.ts`
- Modify: `src/index/app/index-page/usePreviewDeviceActions.test.ts`
- Modify: `src/index/app/index-page/usePreviewDeviceActions.source.test.ts`

**Interfaces:**
- Produces `handlePreviewExternalWorkspaceWidthChange(width)`, `startPreviewLayoutStabilization(reason)`, and `endPreviewLayoutStabilization(reason)`.

- [ ] **Step 1: Replace the old lock test with failing real-resize and overlapping-owner tests**

The hook sequence uses preview/external `1279/1519`, starts annotation, changes preview to `1519`, and still expects derived custom. It then changes both live measurements to `1760` and expects fluid desktop while annotation remains active.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/app/index-page/usePreviewDeviceActions.test.ts`.

Expected: FAIL because new APIs are absent and the old boolean freezes resize.

- [ ] **Step 3: Replace state and callbacks**

```ts
const [basisState, dispatchBasis] = useReducer(
  reducePreviewResponsiveBasisState, undefined, createPreviewResponsiveBasisState);
const responsiveBasisWidth = resolvePreviewResponsiveBasisWidth(basisState);
const previewConfig = useMemo(
  () => resolveAdaptiveDesktopPreviewConfig(previewIntentConfig, responsiveBasisWidth),
  [previewIntentConfig, responsiveBasisWidth]);
```

Dispatch Task 1 events from the three public callbacks. Remove `lockedAdaptiveDesktop`, both lock functions, their return fields, and the manual-action lock reset.

- [ ] **Step 4: Run GREEN**

Run `pnpm exec vitest run src/index/app/index-page/usePreviewDeviceActions.test.ts src/index/app/index-page/usePreviewDeviceActions.source.test.ts src/index/domains/device/preview-layout.test.ts src/index/domains/device/preview-responsive-basis.test.ts`.

Expected: all tests PASS and source tests prove old identifiers are absent.

### Task 3: Stable Workspace Measurement

**Files:**
- Modify: `src/index/components/sidebar/responsiveSidebarState.ts`
- Modify: `src/index/components/sidebar/responsiveSidebarState.test.ts`
- Modify: `src/index/components/app/IndexPageDesktop.tsx`
- Modify: `src/index/components/app/IndexPageLayout.tsx`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/responsiveSidebarStateIntegration.source.test.ts`

**Interfaces:**
- Produces `resolveResponsiveWorkspaceAvailableWidth(input)` and `workspaceMetrics.onExternalAvailableWidthChange(width)`.

- [ ] **Step 1: Write failing resolver and wiring tests**

```ts
expect(resolveResponsiveWorkspaceAvailableWidth({
  workspaceWidth: 1920, assistantVisible: true, assistantWidth: 480,
})).toBe(1440);
```

Source tests require initial and ResizeObserver reports, and require `IndexPage` to pass `preview.handlePreviewExternalWorkspaceWidthChange` through `IndexPageLayout`, not `PresentationArea`.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/components/sidebar/responsiveSidebarState.test.ts src/index/app/responsiveSidebarStateIntegration.source.test.ts`.

Expected: FAIL because the resolver and prop do not exist.

- [ ] **Step 3: Implement resolver and top-level prop**

Extract the current normalized workspace-minus-visible-assistant calculation. Add:

```ts
workspaceMetrics: {
  onExternalAvailableWidthChange: (width: number) => void;
};
```

to `IndexPageDesktop`, pass it through `IndexPageLayout`, report on every valid root measurement, retain existing sidebar boolean deduplication, and wire the callback from `IndexPage.tsx`.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command again. Expected: all tests PASS.

### Task 4: Named Annotation and Review Ownership

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`

**Interfaces:**
- Consumes Task 2 start/end callbacks.

- [ ] **Step 1: Write failing lifecycle source tests**

Require annotation to start `annotation-sidebar` only when system code collapses an expanded sidebar; require editor `finally` to end it; require a layout effect to own `review-panel`; forbid every old lock identifier.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts`.

Expected: FAIL on new lifecycle assertions.

- [ ] **Step 3: Implement annotation ownership**

```ts
if (!collapsed) startPreviewLayoutStabilization('annotation-sidebar');
setCollapsed(true);
```

Use only on system-owned collapse paths. Always call `endPreviewLayoutStabilization('annotation-sidebar')` in editor exit `finally`; ending a missing reason is idempotent.

- [ ] **Step 4: Implement declarative review ownership**

```ts
useLayoutEffect(() => {
  if (!reviewPanelOpen) return;
  startPreviewLayoutStabilization('review-panel');
  return () => endPreviewLayoutStabilization('review-panel');
}, [endPreviewLayoutStabilization, reviewPanelOpen, startPreviewLayoutStabilization]);
```

The toggle only changes `reviewPanelOpen`.

- [ ] **Step 5: Run GREEN**

Run `pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/usePreviewDeviceActions.test.ts src/index/app/index-page/usePreviewDeviceActions.source.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/components/sidebar/responsiveSidebarState.test.ts src/index/app/responsiveSidebarStateIntegration.source.test.ts src/index/domains/device/preview-layout.test.ts src/index/domains/device/preview-responsive-basis.test.ts`.

Expected: all focused tests PASS without React act warnings.

### Task 5: Browser and Build Verification

**Files:**
- Create locally only: `.local/test-scripts/responsive-preview-layout-stabilization-check.mjs`
- Do not commit the script or artifacts.

- [ ] **Step 1: Create browser assertions for exact transitions**

```text
1250 window -> derived 1440x900
annotation opens -> sidebar change is ignored
1920 window while annotation remains -> fluid desktop expands
1250 window while annotation remains -> derived mode returns
review opens -> panel change is ignored
wide resize while review remains -> fluid desktop expands
annotation and review overlap -> close in both orders -> no stale anchor
manual modes -> unchanged
```

Assert iframe bounding rectangles in addition to device-menu state and capture wide/narrow screenshots under `.local/test-scripts/artifacts/responsive-preview-layout-stabilization/`.

- [ ] **Step 2: Run browser regression**

Run `node .local/test-scripts/responsive-preview-layout-stabilization-check.mjs http://127.0.0.1:<admin-port>`.

Expected: exit 0 with no page or console errors; wide screenshots show the iframe filling newly available width.

- [ ] **Step 3: Run final verification**

Run the Task 4 GREEN command, then `pnpm admin:build`, `git diff --check`, and `git status --short`.

Expected: tests PASS, build exits 0, no whitespace errors, and unrelated user changes remain untouched and unstaged.
