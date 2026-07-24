# Empty Project Bootstrap Crash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the forced first-run project-creation dialog available when no project exists instead of crashing during preference bootstrap.

**Architecture:** `useIndexPagePreferences` remains the owner of project preference loading, but it waits until both workspace loading is complete and an explicit project ID exists. `ContentPanel` remains the sole owner of forced project setup behavior, including non-dismissible dialog state.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, react-test-renderer 18.2.0, pnpm

## Global Constraints

- Do not weaken `requireProjectScope` or reintroduce active-project request fallback.
- Do not change `ContentPanel` project setup ownership or dismissal behavior.
- Preserve all unrelated staged and unstaged worktree changes.
- Do not add dependencies.

---

### Task 1: Guard Preference Bootstrap Until a Project Exists

**Files:**
- Modify: `src/index/app/hooks/useIndexPagePreferences.test.ts`
- Modify: `src/index/app/hooks/useIndexPagePreferences.ts:70-120`

**Interfaces:**
- Consumes: `activeProjectId?: string | null` and `enabled?: boolean`.
- Produces: no preference request while the project ID is empty; normal `ProjectScope` requests after an ID appears.

- [ ] **Step 1: Write the failing first-run Hook test**

Mock `apiService.getBootstrapConfig`, render a Harness with `activeProjectId={null}`, and assert that rendering does not throw and no request is sent. Rerender with `activeProjectId="project-a"` and assert:

```ts
expect(getBootstrapConfig).toHaveBeenCalledOnce();
expect(getBootstrapConfig).toHaveBeenCalledWith({ projectId: 'project-a' });
```

- [ ] **Step 2: Run the test and verify the current regression**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/useIndexPagePreferences.test.ts
```

Expected: FAIL because the null-project render synchronously throws `请先选择项目`.

- [ ] **Step 3: Add the minimal empty-project guards**

Change the initial effect and settings refresh callback to return before calling `requireProjectScope`:

```ts
if (!enabled || !activeProjectId?.trim()) {
    setInitialPreferencesLoaded(false);
    return undefined;
}
```

For `handleSettingsSaved`, use the same readiness condition without a state update:

```ts
if (!enabled || !activeProjectId?.trim()) {
    return;
}
```

- [ ] **Step 4: Run the focused Hook test**

Run the Step 2 command.

Expected: all tests in `useIndexPagePreferences.test.ts` pass.

### Task 2: Verify Forced Setup and Production Bundle

**Files:**
- Verify: `src/index/components/sidebar/ContentPanel.source.test.ts`
- Verify: `src/index/components/sidebar/ContentPanel.tsx`
- Verify: `dist/admin/assets/index.js`

**Interfaces:**
- Consumes: `projectSetupRequired === true` from workspace state.
- Produces: `ProjectSetupDialog` forced open with `dismissDisabled={projectSetupRequired}`.

- [ ] **Step 1: Run the preference and forced-dialog regression tests together**

```bash
pnpm exec vitest run src/index/app/hooks/useIndexPagePreferences.test.ts src/index/components/sidebar/ContentPanel.source.test.ts
```

Expected: both suites pass, including the existing non-dismissible setup dialog assertions.

- [ ] **Step 2: Build the Admin production bundle**

```bash
pnpm admin:build
```

Expected: exit code 0. Existing chunk-size warnings may remain, but there must be no build error.

- [ ] **Step 3: Inspect the final diff and bundle behavior**

```bash
git diff --check -- src/index/app/hooks/useIndexPagePreferences.ts src/index/app/hooks/useIndexPagePreferences.test.ts
git diff -- src/index/app/hooks/useIndexPagePreferences.ts src/index/app/hooks/useIndexPagePreferences.test.ts
```

Confirm the only production behavior change is the empty-project readiness guard and that strict scoping remains for non-empty project IDs.

- [ ] **Step 4: Commit the focused bug fix**

```bash
git add src/index/app/hooks/useIndexPagePreferences.ts src/index/app/hooks/useIndexPagePreferences.test.ts
git commit -m "fix: keep first-run project setup available"
```
