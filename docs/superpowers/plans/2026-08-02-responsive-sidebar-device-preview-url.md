# Responsive Sidebar And Device Preview URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Make prototype canvas usable beside AI conversation panels by unifying sidebar hover/click behavior, collapsing the sidebar earlier by default, deriving a fixed `1440x900` desktop preview when needed, and sharing manual single-device sizes through one URL parameter.

**Architecture:** Separate user intent from responsive defaults and derived display state. The sidebar combines a nullable pinned preference with a measured responsive default and a temporary hover/focus preview; the device preview combines a manual configuration with a measured effective configuration. Pure helpers own breakpoint and URL parsing rules, while existing React boundaries provide measurements and wire the resulting state into the toolbar, layout, and deep-link builder.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, react-test-renderer, CSS, `ResizeObserver`, browser `URL` and History APIs.

## Global Constraints

- Use `pnpm` for all repository commands.
- Main desktop design viewport is exactly `1440x900`.
- Fixed sidebar width is exactly `240px`.
- Preview horizontal allowance is exactly `48px`.
- Small desktop workspace threshold is exactly `1728px`.
- Floating sidebar top offset is exactly `48px`.
- The coarse-pointer mobile workspace is unchanged.
- Responsive sizing changes defaults and derived display only; it never overrides an explicit user choice.
- Default adaptive desktop and automatically derived `1440x900` omit the `device` query parameter.
- Manual single-device sizes use `device=<width>x<height>` with lowercase ASCII `x`.
- Split and multi-page modes are not encoded in `device`.
- Existing unrelated dirty-worktree changes must remain untouched. Stage or commit only task-specific hunks when that can be done without capturing pre-existing changes; otherwise leave implementation changes uncommitted and report the reason.

---

## File Structure

- `src/index/components/sidebar/responsiveSidebarState.ts`: pure constants and responsive/pinned sidebar state resolution.
- `src/index/components/sidebar/responsiveSidebarState.test.ts`: breakpoint, assistant reservation, and preference-priority tests.
- `src/index/components/sidebar/responsiveSidebarInteraction.ts`: temporary hover/focus preview controller.
- `src/index/components/sidebar/ResponsiveSidebarController.tsx`: stable trigger and temporary-preview bindings at every desktop width.
- `src/index/components/sidebar/ResponsiveSidebarShell.tsx`: pinned layout versus floating preview rendering state.
- `src/index/components/sidebar/ResponsiveSidebarTriggerButton.tsx`: one click/hover/focus trigger used in toolbar and fallback positions.
- `src/index/components/app/IndexPageDesktop.tsx`: desktop workspace measurement and responsive-default notification.
- `src/index/app/IndexPage.tsx`: nullable pinned sidebar preference and current deep-link device field.
- `src/index/app/styles/index-page.css`: unified expanded, collapsed, and temporary floating sidebar layout.
- `src/index/app/index-page/previewDeviceUrl.ts`: pure `device` parser and serializer.
- `src/index/app/index-page/previewDeviceUrl.test.ts`: URL contract tests.
- `src/index/app/index-page/resourceDeepLink.ts`: preserve canonical `device` values in resource links.
- `src/index/app/index-page/usePreviewDeviceActions.ts`: manual preview intent, derived effective preview, and URL-facing parameter.
- `src/index/domains/device/preview-layout.ts`: adaptive desktop marker and fixed-viewport layout behavior.
- `src/index/components/content/ContentAreaView.tsx`: report measured preview width and render the effective configuration.
- `src/index/components/content/PresentationToolbar.tsx`: display effective custom `1440x900` state without changing intent.
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`, `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`, and `src/index/types/index-page.types.ts`: pass effective preview state and measurement callbacks through existing boundaries.

---

### Task 1: Responsive Sidebar Default And Pinned Preference

**Files:**
- Create: `src/index/components/sidebar/responsiveSidebarState.ts`
- Create: `src/index/components/sidebar/responsiveSidebarState.test.ts`
- Modify: `src/index/components/app/IndexPageDesktop.tsx`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Produces: `SIDEBAR_WIDTH_PX`, `PREVIEW_HORIZONTAL_ALLOWANCE_PX`, `RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX`, `resolveResponsiveSidebarDefaultCollapsed(input)`, and `resolveEffectiveSidebarCollapsed(input)`.
- Consumes: the root desktop workspace width, visible assistant-panel width, nullable user pinned preference, and existing `setCollapsed` call sites.

- [ ] **Step 1: Write the failing pure-state tests**

Create `responsiveSidebarState.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';
import {
  RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX,
  resolveEffectiveSidebarCollapsed,
  resolveResponsiveSidebarDefaultCollapsed,
} from './responsiveSidebarState';

describe('responsive sidebar state', () => {
  it('collapses below 1728px and expands at the threshold', () => {
    expect(RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX).toBe(1728);
    expect(resolveResponsiveSidebarDefaultCollapsed({ workspaceWidth: 1727, assistantVisible: false, assistantWidth: 0 })).toBe(true);
    expect(resolveResponsiveSidebarDefaultCollapsed({ workspaceWidth: 1728, assistantVisible: false, assistantWidth: 0 })).toBe(false);
  });

  it('subtracts a visible in-app assistant panel', () => {
    expect(resolveResponsiveSidebarDefaultCollapsed({ workspaceWidth: 1920, assistantVisible: true, assistantWidth: 320 })).toBe(true);
    expect(resolveResponsiveSidebarDefaultCollapsed({ workspaceWidth: 1920, assistantVisible: false, assistantWidth: 320 })).toBe(false);
  });

  it('lets an explicit pinned choice override later responsive defaults', () => {
    expect(resolveEffectiveSidebarCollapsed({ responsiveDefaultCollapsed: true, pinnedCollapsed: false })).toBe(false);
    expect(resolveEffectiveSidebarCollapsed({ responsiveDefaultCollapsed: false, pinnedCollapsed: true })).toBe(true);
    expect(resolveEffectiveSidebarCollapsed({ responsiveDefaultCollapsed: true, pinnedCollapsed: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/responsiveSidebarState.test.ts
```

Expected: FAIL because `responsiveSidebarState.ts` does not exist.

- [ ] **Step 3: Implement the pure state resolver**

Create `responsiveSidebarState.ts`:

```ts
export const SIDEBAR_WIDTH_PX = 240;
export const PREVIEW_HORIZONTAL_ALLOWANCE_PX = 48;
export const DESKTOP_DESIGN_VIEWPORT_WIDTH_PX = 1440;
export const RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX =
  SIDEBAR_WIDTH_PX + PREVIEW_HORIZONTAL_ALLOWANCE_PX + DESKTOP_DESIGN_VIEWPORT_WIDTH_PX;

export function resolveResponsiveSidebarDefaultCollapsed(input: {
  workspaceWidth: number;
  assistantVisible: boolean;
  assistantWidth: number;
}): boolean {
  const workspaceWidth = Number.isFinite(input.workspaceWidth) ? Math.max(0, input.workspaceWidth) : 0;
  const assistantWidth = input.assistantVisible && Number.isFinite(input.assistantWidth)
    ? Math.max(0, input.assistantWidth)
    : 0;
  return workspaceWidth - assistantWidth < RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX;
}

export function resolveEffectiveSidebarCollapsed(input: {
  responsiveDefaultCollapsed: boolean;
  pinnedCollapsed: boolean | null;
}): boolean {
  return input.pinnedCollapsed ?? input.responsiveDefaultCollapsed;
}
```

- [ ] **Step 4: Measure the desktop workspace and notify the parent default state**

Extend `IndexPageDesktop` with:

```ts
responsiveSidebar: {
  defaultCollapsed: boolean;
  onDefaultCollapsedChange: (collapsed: boolean) => void;
};
```

Attach a ref to the full desktop flex root. In a `useEffect`, measure `clientWidth`, call `resolveResponsiveSidebarDefaultCollapsed()` with `assistantPanel.visible` and `assistantPanel.width`, observe the root with `ResizeObserver`, and rerun when assistant visibility or width changes. Call `onDefaultCollapsedChange` only when the result changes.

- [ ] **Step 5: Replace the single boolean owner with responsive default plus nullable pinned preference**

In `IndexPage.tsx`, initialize:

```ts
const initialResourceDeepLink = useMemo(() => parseResourceDeepLink(), []);
const [responsiveSidebarDefaultCollapsed, setResponsiveSidebarDefaultCollapsed] = useState(() => (
  typeof window === 'undefined'
    ? false
    : resolveResponsiveSidebarDefaultCollapsed({
        workspaceWidth: window.innerWidth,
        assistantVisible: false,
        assistantWidth: 0,
      })
));
const [sidebarPinnedCollapsed, setSidebarPinnedCollapsed] = useState<boolean | null>(() => (
  initialResourceDeepLink?.collapseSidebar ? true : null
));
const collapsed = resolveEffectiveSidebarCollapsed({
  responsiveDefaultCollapsed: responsiveSidebarDefaultCollapsed,
  pinnedCollapsed: sidebarPinnedCollapsed,
});
const collapsedRef = useRef(collapsed);
collapsedRef.current = collapsed;
const setCollapsed = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
  setSidebarPinnedCollapsed(typeof next === 'function' ? next(collapsedRef.current) : next);
}, []);
```

Remove the later duplicate `initialResourceDeepLink` declaration. Pass the responsive default callback and value through `IndexPageLayout` into `IndexPageDesktop` without changing the existing sidebar and presentation prop groups.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/responsiveSidebarState.test.ts src/index/app/IndexPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the isolated task if safe**

```bash
git add src/index/components/sidebar/responsiveSidebarState.ts src/index/components/sidebar/responsiveSidebarState.test.ts
git commit -m "feat: resolve responsive sidebar defaults"
```

Do not stage overlapping modified files unless task-specific hunks can be isolated from pre-existing work.

---

### Task 2: Unified Sidebar Click And Temporary Preview

**Files:**
- Modify: `src/index/components/sidebar/responsiveSidebarInteraction.ts`
- Modify: `src/index/components/sidebar/ResponsiveSidebarController.tsx`
- Modify: `src/index/components/sidebar/ResponsiveSidebarController.test.ts`
- Modify: `src/index/components/sidebar/ResponsiveSidebarShell.tsx`
- Modify: `src/index/components/sidebar/ResponsiveSidebarShell.test.ts`
- Modify: `src/index/components/sidebar/ResponsiveSidebarTriggerButton.tsx`
- Modify: `src/index/components/sidebar/ResponsiveSidebarTriggerButton.source.test.ts`
- Modify: `src/index/components/content/PresentationArea.tsx`
- Modify: `src/index/app/styles/index-page.css`
- Modify: `src/index/app/ResponsiveWorkspace.source.test.ts`

**Interfaces:**
- Consumes: `collapsed`, `setCollapsed`, and the existing delayed pointer/focus retention controller.
- Produces: stable button bindings whose click always toggles and whose temporary preview handlers exist only while collapsed.

- [ ] **Step 1: Update tests to describe the unified contract**

Require controller tests to prove:

```ts
expect(bindings?.buttonProps['aria-label']).toBe('展开侧边栏');
act(() => bindings?.buttonProps.onPointerEnter?.({} as React.PointerEvent<HTMLButtonElement>));
expect(bindings?.buttonProps['aria-expanded']).toBe(true);
act(() => bindings?.buttonProps.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
expect(toggle).toHaveBeenCalledOnce();
```

Repeat with `collapsed=false` and assert pointer/focus handlers do not open a temporary preview while click still toggles. Remove all expectations that compact desktop clicks are suppressed.

Update shell and CSS assertions to require:

```ts
expect(styles).toContain('.ax-sidebar-shell.is-collapsed.is-preview-open .ax-sidebar-content');
expect(styles).toContain('top: 48px;');
expect(styles).not.toContain('@media (max-width: 1024px) and (hover: hover) and (pointer: fine)');
```

- [ ] **Step 2: Run the sidebar tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/ResponsiveSidebarController.test.ts src/index/components/sidebar/ResponsiveSidebarShell.test.ts src/index/components/sidebar/ResponsiveSidebarTriggerButton.source.test.ts src/index/app/ResponsiveWorkspace.source.test.ts
```

Expected: FAIL because the current controller gates hover and click on compact media state and the CSS gates floating layout at 1024px.

- [ ] **Step 3: Make the controller width-independent**

Remove `COMPACT_DESKTOP_SIDEBAR_MEDIA_QUERY`, `compactDesktop`, the `matchMedia` subscription, pointer-down suppression, and `handleResponsiveSidebarToggleClick`.

Expose:

```ts
export interface SidebarPreviewInteraction {
  pointerEnter: () => void;
  pointerLeave: () => void;
  focusEnter: () => void;
  focusLeave: () => void;
  close: () => void;
  suppressUntilPointerLeave: () => void;
  dispose: () => void;
}

export interface ResponsiveSidebarControllerValue {
  previewOpen: boolean;
  contentId: string;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
  interaction: SidebarPreviewInteraction;
  closeAndRestoreFocus: () => void;
}
```

In `useResponsiveSidebarTriggerBindings(collapsed, toggle)`, attach pointer/focus/Escape handlers only when `collapsed` is true, but always attach `onClick`. The click handler must call `interaction.close()` and `interaction.suppressUntilPointerLeave()` before `toggle()` so collapse/expand clicks cannot leave stale temporary state.

- [ ] **Step 4: Keep hover closed after a collapse click until re-entry**

Extend the interaction controller with `suppressUntilPointerLeave()`. Calling it clears retained pointer/focus flags and prevents an already-hovered trigger from reopening until its next pointer leave/enter sequence. Add a fake-timer unit test that enters, force-closes, calls suppress, and verifies the state stays closed until re-entry.

- [ ] **Step 5: Render temporary preview from the collapsed shell at every desktop width**

Change shell classes to:

```tsx
className={cn(
  'ax-sidebar-shell',
  collapsed && 'is-collapsed',
  collapsed && previewOpen && 'is-preview-open',
)}
```

Attach shell pointer/focus retention only while `collapsed`. Escape closes only when the temporary preview is open.

Rename `compactOnly` on the fallback trigger to `collapsedOnly`; render it whenever `collapsed` is true. Update `PresentationArea` accordingly.

- [ ] **Step 6: Replace media-specific CSS with state-specific CSS**

Keep expanded sidebar styles in normal flow. For `.is-collapsed`, use zero flex basis and width with `overflow: visible`. Hide the sidebar content by default, then show it only under `.is-collapsed.is-preview-open` as an absolute floating panel with:

```css
top: 48px;
bottom: 8px;
left: 8px;
width: 240px;
height: auto;
```

Place the collapsed-only fallback trigger at `top: 6px; left: 8px;`. Remove the entire 1024px hover/fine-pointer media block. Preserve the coarse-pointer mobile layout media rule.

- [ ] **Step 7: Run focused sidebar regression**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/ResponsiveSidebarController.test.ts src/index/components/sidebar/ResponsiveSidebarShell.test.ts src/index/components/sidebar/ResponsiveSidebarTriggerButton.source.test.ts src/index/components/sidebar/NewSidebar.source.test.ts src/index/app/ResponsiveWorkspace.source.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit isolated new files or hunks if safe**

```bash
git commit -m "feat: unify sidebar preview and toggle behavior"
```

Before committing, inspect `git diff --cached --name-only` and do not include pre-existing unrelated content.

---

### Task 3: Manual Device URL Contract

**Files:**
- Create: `src/index/app/index-page/previewDeviceUrl.ts`
- Create: `src/index/app/index-page/previewDeviceUrl.test.ts`
- Modify: `src/index/app/index-page/resourceDeepLink.ts`
- Modify: `src/index/app/index-page/resourceDeepLink.test.ts`
- Modify: `src/index/app/index-page/usePreviewDeviceActions.ts`
- Modify: `src/index/app/index-page/usePreviewDeviceActions.source.test.ts`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Produces: `parsePreviewDeviceParam(value)`, `serializePreviewDeviceParam(config)`, and optional `ResourceDeepLinkTarget.device`.
- Consumes: existing preview width/height normalizers and `PreviewConfig` intent state.

- [ ] **Step 1: Write failing URL helper tests**

Create `previewDeviceUrl.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultPreviewConfig } from '../../domains/device/preview-layout';
import { parsePreviewDeviceParam, serializePreviewDeviceParam } from './previewDeviceUrl';

describe('preview device URL', () => {
  it('parses preset and custom dimensions', () => {
    expect(parsePreviewDeviceParam('393x852')).toEqual({ preset: 'mobile', width: 393, height: 852 });
    expect(parsePreviewDeviceParam('820x1180')).toEqual({ preset: 'tablet', width: 820, height: 1180 });
    expect(parsePreviewDeviceParam('1440x900')).toEqual({ preset: 'custom', width: 1440, height: 900 });
  });

  it('rejects malformed and invalid dimensions', () => {
    for (const value of ['', '393X852', '393×852', '0x900', '-1x900', 'abc']) {
      expect(parsePreviewDeviceParam(value)).toBeNull();
    }
  });

  it('omits default desktop and serializes manual single devices only', () => {
    expect(serializePreviewDeviceParam(createDefaultPreviewConfig())).toBeNull();
    expect(serializePreviewDeviceParam({ ...createDefaultPreviewConfig(), singlePreset: 'mobile' })).toBe('393x852');
    expect(serializePreviewDeviceParam({ ...createDefaultPreviewConfig(), singlePreset: 'custom', customWidth: 1280, customHeight: 800 })).toBe('1280x800');
    expect(serializePreviewDeviceParam({ ...createDefaultPreviewConfig(), previewMode: 'split' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/previewDeviceUrl.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement strict canonical parsing and serialization**

Use `/^(\d+)x(\d+)$/u`, the existing preview width/height normalization limits, and exact preset comparisons. Return `null` if normalization changes an invalid value into a fallback. Serialize only `previewMode === 'single'` and non-desktop intent.

- [ ] **Step 4: Preserve `device` in resource deep links**

Add `device?: string` to `ResourceDeepLinkTarget`. In `buildIndexDeepLinkUrl`, set `device` only for prototype targets and only after canonical validation. In `parseIndexDeepLink`, parse once and spread the canonical value into prototype results. Add tests proving:

```ts
expect(buildIndexDeepLinkUrl({
  resourceType: 'prototype',
  resourceId: 'home',
  projectId: 'client-a',
  device: '1280x800',
}, 'http://localhost:51720/')).toBe('http://localhost:51720/?projectId=client-a&p=home&device=1280x800');
```

and invalid `device` values are omitted.

- [ ] **Step 5: Initialize manual preview intent from the URL and expose the canonical parameter**

In `usePreviewDeviceActions`, initialize the intent config from `window.location.search`. Mobile and tablet restore named presets; every other valid dimension restores manual custom with `scaleMode: 'fit-screen'`. Expose:

```ts
previewDeviceParam: string | null;
```

derived only from the manual intent config.

In `IndexPage.tsx`, add `device: preview.previewDeviceParam || undefined` to the current prototype deep-link target and its memo dependencies. Do not add the field to documents, themes, or templates.

- [ ] **Step 6: Run URL regression**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/previewDeviceUrl.test.ts src/index/app/index-page/resourceDeepLink.test.ts src/index/app/index-page/usePreviewDeviceActions.source.test.ts src/index/app/IndexPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit isolated helper files if safe**

```bash
git add src/index/app/index-page/previewDeviceUrl.ts src/index/app/index-page/previewDeviceUrl.test.ts
git commit -m "feat: encode preview device dimensions in URLs"
```

---

### Task 4: Derived `1440x900` Adaptive Desktop Preview

**Files:**
- Modify: `src/index/domains/device/preview-layout.ts`
- Modify: `src/index/domains/device/preview-layout.test.ts`
- Modify: `src/index/app/index-page/usePreviewDeviceActions.ts`
- Modify: `src/index/app/index-page/usePreviewDeviceActions.source.test.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- Modify: `src/index/types/index-page.types.ts`
- Modify: `src/index/components/content/PresentationArea.tsx`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/components/content/PresentationToolbar.tsx`
- Modify: `src/index/components/content/PresentationToolbar.test.ts`

**Interfaces:**
- Produces: `resolveAdaptiveDesktopPreviewConfig(intentConfig, previewWidth)`, optional `PreviewConfig.adaptiveDesktop`, and `handlePreviewContainerSizeChange(width)`.
- Consumes: the manual intent config from Task 3 and the existing content-area `ResizeObserver` measurement.

- [ ] **Step 1: Write failing adaptive resolver and layout tests**

Add tests:

```ts
it('derives a fixed 1440x900 viewport below the desktop target', () => {
  const effective = resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1200);
  expect(effective).toMatchObject({
    previewMode: 'single',
    singlePreset: 'custom',
    customWidth: 1440,
    customHeight: 900,
    adaptiveDesktop: true,
  });
});

it('preserves manual and wide default configurations', () => {
  expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1440).singlePreset).toBe('desktop');
  expect(resolveAdaptiveDesktopPreviewConfig({ ...createDefaultPreviewConfig(), singlePreset: 'mobile' }, 500).singlePreset).toBe('mobile');
});
```

Add a layout test with measured document height `12000` and `adaptiveDesktop: true`; assert logical and iframe height remain `900`, proving internal scrolling rather than full-page shrinking.

- [ ] **Step 2: Run the adaptive tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/domains/device/preview-layout.test.ts
```

Expected: FAIL because the adaptive resolver and marker do not exist.

- [ ] **Step 3: Implement the pure adaptive resolver**

Extend `PreviewConfig` with optional `adaptiveDesktop?: boolean`. Add:

```ts
export const ADAPTIVE_DESKTOP_WIDTH = 1440;
export const ADAPTIVE_DESKTOP_HEIGHT = 900;

export function resolveAdaptiveDesktopPreviewConfig(
  intentConfig: PreviewConfig,
  previewWidth: number,
): PreviewConfig {
  if (
    intentConfig.previewMode !== 'single'
    || intentConfig.singlePreset !== 'desktop'
    || !Number.isFinite(previewWidth)
    || previewWidth <= 0
    || previewWidth >= ADAPTIVE_DESKTOP_WIDTH
  ) {
    return { ...intentConfig, adaptiveDesktop: false };
  }
  return {
    ...intentConfig,
    singlePreset: 'custom',
    customWidth: ADAPTIVE_DESKTOP_WIDTH,
    customHeight: ADAPTIVE_DESKTOP_HEIGHT,
    scaleMode: 'fit-screen',
    adaptiveDesktop: true,
  };
}
```

In the custom layout branch, ignore `actualSingleContentSize` when `config.adaptiveDesktop === true`, leaving logical and iframe height fixed at 900.

- [ ] **Step 4: Separate intent configuration from effective configuration in the device hook**

Rename the hook's state to `previewIntentConfig`. Track `previewContainerWidth` and compute:

```ts
const previewConfig = useMemo(
  () => resolveAdaptiveDesktopPreviewConfig(previewIntentConfig, previewContainerWidth),
  [previewContainerWidth, previewIntentConfig],
);
```

All selection and size handlers mutate `previewIntentConfig`. `previewDeviceParam` serializes `previewIntentConfig`, never `previewConfig`. `selectedDeviceId`, toolbar fields, editor width, screenshot sizing, and existing preview consumers continue using effective `previewConfig`.

When the derived custom row is clicked or focused, convert it into manual custom `1440x900`. Selecting desktop restores default adaptive intent and removes the URL parameter.

Expose:

```ts
handlePreviewContainerSizeChange: (width: number) => void;
```

that stores only finite positive integer changes.

- [ ] **Step 5: Report preview width from the existing content measurement**

Add `handlePreviewContainerSizeChange` through preview actions, the presentation props builder, shared types, `PresentationArea`, and `ContentAreaView`.

Inside `ContentAreaView`'s existing `updateSize`, resolve the stable next size once, update local state, and notify the callback with `next.width` only when the width changed. Do not add a second `ResizeObserver`.

- [ ] **Step 6: Update toolbar assertions for effective adaptive custom state**

Keep the current toolbar rendering against effective `previewConfig`. Add focused assertions that the custom fields render from effective width/height and that selecting desktop calls the existing desktop handler, which clears manual URL state through the hook.

- [ ] **Step 7: Run adaptive preview regression**

Run:

```bash
pnpm exec vitest run src/index/domains/device/preview-layout.test.ts src/index/app/index-page/usePreviewDeviceActions.source.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/components/content/PresentationToolbar.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit isolated new logic if safe**

```bash
git commit -m "feat: preserve desktop preview width in narrow workspaces"
```

Do not capture pre-existing content from overlapping modified files.

---

### Task 5: Full Verification And Visual QA

**Files:**
- Verify all files changed in Tasks 1-4.
- Temporary screenshots or scripts: `.local/` only.

**Interfaces:**
- Consumes: completed sidebar, URL, and adaptive preview behavior.
- Produces: verified desktop behavior at wide and narrow widths with no unrelated diff churn.

- [ ] **Step 1: Run the combined focused suite**

```bash
pnpm exec vitest run \
  src/index/components/sidebar/responsiveSidebarState.test.ts \
  src/index/components/sidebar/ResponsiveSidebarController.test.ts \
  src/index/components/sidebar/ResponsiveSidebarShell.test.ts \
  src/index/components/sidebar/ResponsiveSidebarTriggerButton.source.test.ts \
  src/index/app/ResponsiveWorkspace.source.test.ts \
  src/index/app/index-page/previewDeviceUrl.test.ts \
  src/index/app/index-page/resourceDeepLink.test.ts \
  src/index/domains/device/preview-layout.test.ts \
  src/index/app/index-page/usePreviewDeviceActions.source.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/components/content/PresentationToolbar.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run type and admin build validation**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
pnpm admin:build
```

Expected: both commands exit 0. If the first command exposes known unrelated repository failures, preserve the exact output and rely on the successful admin build only after confirming no changed-file errors.

- [ ] **Step 3: Start the admin dev server**

```bash
pnpm admin:dev --host 127.0.0.1
```

Use an available port and keep the server running for user verification.

- [ ] **Step 4: Verify the wide desktop state in a browser**

At a workspace width above 1728px with no assistant panel:

- Sidebar starts pinned expanded.
- Click collapses it and releases 240px.
- Hovering the collapsed trigger opens the temporary panel below the 40px toolbar.
- The trigger remains clickable while the temporary panel is open.
- Clicking expands the pinned sidebar again.

- [ ] **Step 5: Verify narrow and assistant-constrained states**

At a workspace width below 1728px, and separately at 1920px with a visible 320px assistant panel:

- Sidebar starts collapsed when no prior explicit choice exists.
- Click still pins it expanded and consumes 240px.
- A default desktop preview narrower than 1440px shows effective custom `1440x900` and remains readable through scaling.
- Long pages scroll inside the iframe rather than shrinking the entire document.

- [ ] **Step 6: Verify URL reload behavior**

Open prototype links with no `device`, `device=393x852`, `device=820x1180`, `device=1280x800`, and invalid values. Confirm named presets/custom restoration, default omission, invalid fallback, and `history.replaceState` updates without new history entries.

- [ ] **Step 7: Inspect final diff**

```bash
git diff --check
git status --short
git diff -- src/index/components/sidebar src/index/components/app/IndexPageDesktop.tsx src/index/app/IndexPage.tsx src/index/app/styles/index-page.css src/index/app/index-page/previewDeviceUrl.ts src/index/app/index-page/resourceDeepLink.ts src/index/app/index-page/usePreviewDeviceActions.ts src/index/domains/device/preview-layout.ts src/index/components/content/ContentAreaView.tsx src/index/components/content/PresentationToolbar.tsx src/index/types/index-page.types.ts
```

Expected: no whitespace errors and only task-related additions beyond the user's pre-existing changes.
