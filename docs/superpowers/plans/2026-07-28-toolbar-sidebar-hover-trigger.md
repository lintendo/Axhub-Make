# Toolbar Sidebar Hover Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the compact sidebar's duplicate 40px button and make the existing presentation-toolbar sidebar icon the hover/focus trigger without allowing compact-mode clicks to toggle state.

**Architecture:** A desktop-layout provider owns the compact sidebar interaction state and media-query mode. The sidebar shell and presentation toolbar consume the same controller, so the trigger and floating panel coordinate pointer, focus, delayed close, and Escape behavior without prop drilling or duplicate controls.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, react-test-renderer, CSS media queries.

## Global Constraints

- Compact desktop is exactly `(max-width: 1024px) and (hover: hover) and (pointer: fine)`.
- Compact desktop hover/focus opens a temporary floating sidebar; pointer clicks do not toggle or pin it.
- Full desktop preserves the existing click-to-expand/collapse action.
- Mobile behavior is unchanged.
- Do not modify unrelated dirty-worktree changes.

---

### Task 1: Shared Responsive Sidebar Controller

**Files:**
- Create: `src/index/components/sidebar/ResponsiveSidebarController.tsx`
- Create: `src/index/components/sidebar/ResponsiveSidebarController.test.tsx`
- Modify: `src/index/components/app/IndexPageDesktop.tsx`

**Interfaces:**
- Consumes: `createCompactSidebarInteraction(setOpen)` and `closeCompactSidebarAndRestoreFocus(interaction, trigger)` from `responsiveSidebarInteraction.ts`.
- Produces: `COMPACT_DESKTOP_SIDEBAR_MEDIA_QUERY`, `ResponsiveSidebarProvider`, `useResponsiveSidebarController`, and `handleResponsiveSidebarToggleClick(compactDesktop, toggle)`.

- [ ] **Step 1: Write failing controller tests**

Test a provider probe with a stubbed `window.matchMedia` and verify that it exposes compact mode, opens through `interaction.pointerEnter()`, and returns to non-compact mode when the media listener changes. Test `handleResponsiveSidebarToggleClick` separately to prove it suppresses compact-mode toggles and calls full-desktop toggles.

```tsx
expect(controller?.compactDesktop).toBe(true);
act(() => controller?.interaction.pointerEnter());
expect(controller?.compactOpen).toBe(true);
expect(handleResponsiveSidebarToggleClick(true, toggle)).toBe(false);
expect(toggle).not.toHaveBeenCalled();
expect(handleResponsiveSidebarToggleClick(false, toggle)).toBe(true);
expect(toggle).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/ResponsiveSidebarController.test.tsx
```

Expected: FAIL because `ResponsiveSidebarController.tsx` does not exist.

- [ ] **Step 3: Implement the provider and click policy**

Create a context provider that subscribes to the exact compact media query, owns `compactOpen`, `contentId`, and `triggerRef`, and disposes the interaction controller. Close the temporary sidebar when the media query leaves compact mode. Wrap the desktop workspace contents with `ResponsiveSidebarProvider` in `IndexPageDesktop.tsx`.

```tsx
export function handleResponsiveSidebarToggleClick(
    compactDesktop: boolean,
    toggle: () => void,
) {
    if (compactDesktop) return false;
    toggle();
    return true;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 command and expect all controller tests to pass.

### Task 2: Reuse the Toolbar Icon and Remove the Duplicate Button

**Files:**
- Modify: `src/index/components/sidebar/ResponsiveSidebarShell.test.ts`
- Modify: `src/index/components/sidebar/ResponsiveSidebarShell.tsx`
- Modify: `src/index/components/content/PresentationToolbar.source.test.ts`
- Modify: `src/index/components/content/PresentationToolbar.tsx`

**Interfaces:**
- Consumes: `useResponsiveSidebarController()` and `handleResponsiveSidebarToggleClick()` from Task 1.
- Produces: one toolbar-owned trigger controlling the existing `ax-sidebar-content` element.

- [ ] **Step 1: Write failing shell and toolbar wiring tests**

Update source assertions so the shell must not import `PanelLeftOpen`, render `ax-sidebar-compact-trigger`, or contain a button. Require the toolbar sidebar button to use the shared `triggerRef`, pointer/focus handlers, `aria-controls`, `aria-expanded`, compact pointer-down focus suppression, Escape close, and the responsive click helper.

```ts
expect(shellSource).not.toContain('ax-sidebar-compact-trigger');
expect(shellSource).not.toContain('<button');
expect(toolbarSource).toContain('ref={responsiveSidebar?.triggerRef}');
expect(toolbarSource).toContain('handleResponsiveSidebarToggleClick(');
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/ResponsiveSidebarShell.test.ts src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: FAIL because the shell still renders the duplicate button and the toolbar is not connected to the controller.

- [ ] **Step 3: Implement minimal shared-trigger wiring**

Remove the shell button. Read controller state in the shell, attach pointer/focus retention to the shell only in compact mode, keep Escape focus restoration, and assign the controller `contentId` to sidebar content. In the toolbar, attach the controller ref and compact-only pointer/focus handlers to the existing button. Prevent pointer-down focus in compact mode, ignore compact-mode click toggles, and preserve wide-desktop `setCollapsed(!collapsed)`.

```tsx
onClick={() => handleResponsiveSidebarToggleClick(
    responsiveSidebar?.compactDesktop === true,
    () => setCollapsed(!collapsed),
)}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 2 command and expect both suites to pass.

### Task 3: Remove the 40px Rail and Verify the Responsive Contract

**Files:**
- Modify: `src/index/app/ResponsiveWorkspace.source.test.ts`
- Modify: `src/index/app/styles/index-page.css`

**Interfaces:**
- Consumes: `ax-sidebar-shell`, `is-compact-open`, and `ax-sidebar-content` classes.
- Produces: a zero-width compact shell with a 240px floating overlay and no duplicate chrome.

- [ ] **Step 1: Write the failing CSS contract test**

Require compact mode to contain `flex-basis: 0 !important` and `width: 0 !important`, and reject `.ax-sidebar-compact-trigger` plus the former 40px width.

```ts
expect(styles).toContain('flex-basis: 0 !important;');
expect(styles).toContain('width: 0 !important;');
expect(styles).not.toContain('.ax-sidebar-compact-trigger');
expect(styles).not.toContain('width: 40px !important;');
```

- [ ] **Step 2: Run the responsive test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/ResponsiveWorkspace.source.test.ts
```

Expected: FAIL because compact mode still reserves the 40px rail.

- [ ] **Step 3: Implement zero-width compact CSS**

Delete all `.ax-sidebar-compact-trigger` rules. In compact desktop mode set both normal and collapsed shells to zero flex basis and width, keep `overflow: visible` for the overlay, and remove the rail border/background.

- [ ] **Step 4: Run focused regression tests**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/ResponsiveSidebarController.test.tsx src/index/components/sidebar/ResponsiveSidebarShell.test.ts src/index/components/content/PresentationToolbar.source.test.ts src/index/app/ResponsiveWorkspace.source.test.ts src/index/components/sidebar/NewSidebar.source.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run type/build validation**

Run:

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: exit code 0. If the repository uses Vite-only frontend typing and this config includes unrelated known failures, run `pnpm admin:build` and report the exact distinction instead of changing unrelated files.

- [ ] **Step 6: Inspect the final diff**

Run `git diff --check` and a path-scoped `git diff` over the files above. Confirm there is no 40px trigger rail, no duplicate shell button, and no unrelated change.
