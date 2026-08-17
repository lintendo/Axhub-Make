# Annotation Sidebar Manual Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an explicit sidebar click to override annotation mode's temporary automatic collapse without restoring stale sidebar state or destabilizing the automatic preview viewport.

**Architecture:** Keep the responsive-default, pinned-choice, and system-override layers intact. Change only the explicit sidebar setter so it clears the temporary system override before storing the requested pinned value; retain the existing `annotation-sidebar` stabilization lifetime from editor entry through exit.

**Tech Stack:** React 18.2, TypeScript 5.x, Vitest 4, pnpm.

## Global Constraints

- Entering annotation mode must still automatically collapse the sidebar.
- A manual choice during annotation must apply immediately and remain pinned after annotation exits.
- Do not restore a pre-annotation sidebar snapshot.
- Do not change `annotation-sidebar` preview layout stabilization, responsive thresholds, device URL serialization, or preview viewport thresholds.
- Preserve all unrelated worktree changes. The two implementation files already contain user changes, so do not stage or commit them as whole files.

---

### Task 1: Explicit Sidebar Choice Ends Temporary System Collapse

**Files:**
- Modify: `src/index/app/responsiveSidebarStateIntegration.source.test.ts`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Consumes: `collapsedRef.current`, `setSidebarSystemCollapsed`, and `setSidebarPinnedCollapsed` from `IndexPage`.
- Produces: the existing `setCollapsed: React.Dispatch<React.SetStateAction<boolean>>`, with the added contract that an explicit change clears `sidebarSystemCollapsed` before persisting the resolved pinned value.

- [ ] **Step 1: Add the failing regression assertion**

Append this test inside the existing `describe('responsive sidebar state integration', ...)` block in `src/index/app/responsiveSidebarStateIntegration.source.test.ts`:

```ts
it('lets an explicit sidebar choice end the temporary system collapse', () => {
  const source = readSource('./IndexPage.tsx');
  const setterSource = source.slice(
    source.indexOf('const setCollapsed = useCallback'),
    source.indexOf('const setSystemCollapsed = useCallback'),
  );

  expect(setterSource).toContain('setSidebarSystemCollapsed(null);');
  expect(setterSource.indexOf('setSidebarSystemCollapsed(null);'))
    .toBeLessThan(setterSource.indexOf('setSidebarPinnedCollapsed('));
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/responsiveSidebarStateIntegration.source.test.ts -t "lets an explicit sidebar choice end the temporary system collapse"
```

Expected: FAIL because the current `setCollapsed` callback updates only `setSidebarPinnedCollapsed` and does not contain `setSidebarSystemCollapsed(null);`.

- [ ] **Step 3: Implement the minimal state handoff**

Replace the current `setCollapsed` callback in `src/index/app/IndexPage.tsx` with:

```ts
const setCollapsed = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const resolvedNext = typeof next === 'function' ? next(collapsedRef.current) : next;
    setSidebarSystemCollapsed(null);
    setSidebarPinnedCollapsed(resolvedNext);
}, []);
```

Keep `setSystemCollapsed` unchanged. Do not modify annotation entry, editor exit, or preview stabilization callbacks.

- [ ] **Step 4: Run the focused regression suite and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/index/app/responsiveSidebarStateIntegration.source.test.ts \
  src/index/components/sidebar/responsiveSidebarState.test.ts \
  src/index/components/sidebar/ResponsiveSidebarController.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: all tests PASS. The integration assertion proves explicit changes clear the system override, controller tests prove click still toggles, and preview-action tests prove `annotation-sidebar` stabilization entry and exit remain intact.

- [ ] **Step 5: Run type/build validation**

Run:

```bash
pnpm admin:build
```

Expected: both Vite admin builds complete successfully with exit code 0.

- [ ] **Step 6: Verify the interaction in the browser**

Start the admin UI:

```bash
pnpm server:dev -- --host 127.0.0.1 --no-open
```

Use a prototype that supports annotation and verify this sequence:

1. Start with the sidebar expanded.
2. Enter annotation mode and confirm the sidebar automatically collapses.
3. Click the sidebar trigger and confirm it expands immediately while annotation remains active.
4. Click again and confirm it collapses immediately.
5. Expand it, exit annotation, and confirm it remains expanded.
6. Re-enter annotation, resize the desktop workspace across the adaptive threshold, and confirm the automatic preview viewport still follows real workspace resizing without reacting to the sidebar's internal layout changes.

- [ ] **Step 7: Inspect only the task-specific diff**

Run:

```bash
git diff --check -- \
  src/index/app/IndexPage.tsx \
  src/index/app/responsiveSidebarStateIntegration.source.test.ts
git diff -- \
  src/index/app/IndexPage.tsx \
  src/index/app/responsiveSidebarStateIntegration.source.test.ts
```

Expected: no whitespace errors. Confirm the only newly introduced production behavior is clearing `sidebarSystemCollapsed` in the explicit setter and the only newly introduced test is the focused regression assertion. Leave these overlapping files unstaged so existing user changes are not accidentally committed.
