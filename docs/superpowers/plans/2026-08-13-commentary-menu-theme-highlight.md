# Commentary Menu Theme Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top Commentary “更多” menu use one theme-colored selected state and remove the target-screenshot switch control.

**Architecture:** Keep the existing host-toolbar actions and checkbox semantics unchanged. Define one selected-menu-item class in `PresentationToolbar`, reuse it for target screenshots and the voice assistant, and represent the target-screenshot state with the same leading icon swap already used by voice.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Tailwind theme tokens, Vitest source-contract tests.

## Global Constraints

- Use the current `primary` theme token; do not add hard-coded colors.
- Keep `role="menuitemcheckbox"`, `aria-checked`, action payloads, persistence, and menu-closing behavior unchanged.
- Change only the top “更多” menu and its focused test.
- Do not modify Commentary’s internal settings switches.

---

### Task 1: Unify selected menu presentation

**Files:**
- Modify: `src/index/components/content/PresentationToolbar.test.ts:310`
- Modify: `src/index/components/content/PresentationToolbar.tsx:1-45,760-840`

**Interfaces:**
- Consumes: `hostToolbarState.captureTargetScreenshot`, `commentaryVoiceVisible`, and the existing `toggle-target-screenshot`/voice click handlers.
- Produces: a shared `hostMenuSelectedItemClass` presentation string used by both checkbox menu rows.

- [ ] **Step 1: Write the failing source-contract test**

Replace the existing target-screenshot checkbox test with assertions that the host menu:

```ts
expect(source).not.toContain("import { Switch } from '@/components/ui/switch';");
expect(hostMoreMenuSource).not.toContain('<Switch');
expect(hostMoreMenuSource).toContain(
  'hostToolbarState.captureTargetScreenshot\n                                        ? <Check className={hostMenuIconClass} />\n                                        : <ImageIcon className={hostMenuIconClass} />',
);
expect(source).toContain(
  'const hostMenuSelectedItemClass = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";',
);
expect(hostMoreMenuSource.match(/&& hostMenuSelectedItemClass/g)).toHaveLength(2);
expect(hostMoreMenuSource).not.toContain('&& "bg-accent text-accent-foreground"');
```

Retain the assertions for `role="menuitemcheckbox"`, `aria-checked`, the target-screenshot action payload, and the visible label.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.test.ts
```

Expected: the rewritten test fails because `Switch` and the gray `bg-accent` selected state are still present.

- [ ] **Step 3: Implement the minimum menu change**

In `PresentationToolbar.tsx`:

```ts
const hostMenuSelectedItemClass = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";
```

- Remove the now-unused `Switch` import.
- Use `hostMenuSelectedItemClass` for both selected checkbox rows.
- Replace the target-screenshot image-plus-switch layout with:

```tsx
{hostToolbarState.captureTargetScreenshot
  ? <Check className={hostMenuIconClass} />
  : <ImageIcon className={hostMenuIconClass} />}
附带目标截图
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.test.ts
```

Expected: the test file passes with zero failures.

- [ ] **Step 5: Inspect the scoped diff**

Run:

```bash
git diff --check -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.test.ts
git diff -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.test.ts
```

Expected: no whitespace errors; the diff preserves the existing action and accessibility contracts and contains no unrelated edits from this task.

- [ ] **Step 6: Preserve the dirty-worktree boundary**

The two implementation files already contain unrelated unstaged work. Do not stage whole files. Commit the implementation only if its exact hunks can be isolated without staging pre-existing edits; otherwise leave the verified implementation unstaged and report that boundary explicitly.
