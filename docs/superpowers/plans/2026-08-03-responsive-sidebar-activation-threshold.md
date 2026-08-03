# Responsive Sidebar Activation Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adaptive preview scaling activate before the desktop sidebar defaults to collapsed by changing the sidebar's effective workspace threshold to the shared `1280px` adaptive desktop activation width.

**Architecture:** Keep preview scaling and sidebar collapse as independent measurements. The preview domain continues to evaluate preview-container width, while the sidebar state resolver imports the preview domain's activation-width constant and compares it directly against effective workspace width without adding sidebar width or horizontal allowance.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, Chrome headless visual verification.

## Global Constraints

- Use `pnpm` for repository tests and build validation.
- Sidebar responsive default is collapsed below `1280px` and expanded at or above `1280px`.
- Preview scaling remains based on preview-container width and therefore activates before sidebar collapse as the workspace narrows.
- Visible in-app assistant width is subtracted before resolving the sidebar default.
- Explicit pinned sidebar choices continue to override the responsive default.
- Floating sidebar vertical `top: 48px` behavior is unchanged.
- Existing unrelated dirty-worktree changes remain untouched.

---

### Task 1: Align Sidebar Collapse With Adaptive Preview Activation

**Files:**
- Modify: `src/index/components/sidebar/responsiveSidebarState.test.ts`
- Modify: `src/index/components/sidebar/responsiveSidebarState.ts`

**Interfaces:**
- Consumes: `ADAPTIVE_DESKTOP_ACTIVATION_WIDTH: number` from `src/index/domains/device/preview-layout.ts`.
- Produces: `RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX: number` equal to the shared activation width and the unchanged `resolveResponsiveSidebarDefaultCollapsed(input): boolean` behavior around that threshold.

- [ ] **Step 1: Write the failing threshold test**

Update the focused test to import the shared activation width and require the new boundary:

```ts
import { ADAPTIVE_DESKTOP_ACTIVATION_WIDTH } from '../../domains/device/preview-layout';

it('collapses below the adaptive desktop activation width and expands at the threshold', () => {
  expect(RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX).toBe(ADAPTIVE_DESKTOP_ACTIVATION_WIDTH);
  expect(resolveResponsiveSidebarDefaultCollapsed({
    workspaceWidth: 1279,
    assistantVisible: false,
    assistantWidth: 0,
  })).toBe(true);
  expect(resolveResponsiveSidebarDefaultCollapsed({
    workspaceWidth: 1280,
    assistantVisible: false,
    assistantWidth: 0,
  })).toBe(false);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/responsiveSidebarState.test.ts
```

Expected: FAIL because the current threshold is `1728`, so a `1280px` workspace still resolves to collapsed.

- [ ] **Step 3: Implement the minimal shared threshold**

Replace the sidebar-specific preview-width and allowance constants with the shared activation width:

```ts
import { ADAPTIVE_DESKTOP_ACTIVATION_WIDTH } from '../../domains/device/preview-layout';

export const SIDEBAR_WIDTH_PX = 240;
export const RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX = ADAPTIVE_DESKTOP_ACTIVATION_WIDTH;
```

Keep `resolveResponsiveSidebarDefaultCollapsed` and `resolveEffectiveSidebarCollapsed` otherwise unchanged.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/responsiveSidebarState.test.ts src/index/app/responsiveSidebarStateIntegration.source.test.ts src/index/domains/device/preview-layout.test.ts
```

Expected: all focused state, integration, and adaptive-preview tests pass.

- [ ] **Step 5: Run Make validation**

Run:

```bash
pnpm admin:build
```

Expected: exit code `0` with no new bundling error caused by the threshold change.

- [ ] **Step 6: Verify the browser boundary**

Render `http://localhost:53817/?projectId=make-project&p=xunda-express` at `1279px` and `1280px` viewport widths. Expected: the sidebar is collapsed at `1279px`, expanded at `1280px`, and the `1280px` case displays the adaptive scaled preview because the expanded sidebar leaves the preview container below `1280px`.

- [ ] **Step 7: Inspect the final diff**

Run:

```bash
git diff --check -- src/index/components/sidebar/responsiveSidebarState.ts src/index/components/sidebar/responsiveSidebarState.test.ts
git diff -- src/index/components/sidebar/responsiveSidebarState.ts src/index/components/sidebar/responsiveSidebarState.test.ts
```

Expected: no whitespace errors and only the requested threshold/test edits in the implementation files.
