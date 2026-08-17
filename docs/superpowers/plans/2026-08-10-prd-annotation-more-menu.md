# PRD Annotation More Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the “页面” and “保存” groups from the Make toolbar’s “更多” menu only while a prototype PRD annotation session is active.

**Architecture:** Keep the behavior local to `PresentationToolbar` and use its existing `prototypeAnnotationSessionActive` prop as the render guard. Wrap each affected group together with its leading separator so hidden groups leave no visual artifacts; preserve all underlying host actions and normal quick-edit behavior.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest, pnpm workspace

## Global Constraints

- Use pnpm for repository development and tests.
- Do not modify `CommentaryHostToolbarState` or any host action contract.
- Keep ordinary annotation, quick editing, document editing, and non-PRD resource behavior unchanged.
- Preserve unrelated uncommitted work in both target files.

---

### Task 1: Conditionally hide PRD-inapplicable menu groups

**Files:**
- Modify: `src/index/components/content/PresentationToolbar.tsx:687`
- Test: `src/index/components/content/PresentationToolbar.test.ts:310`

**Interfaces:**
- Consumes: existing `prototypeAnnotationSessionActive: boolean`, `isQuickEditActive: boolean`, and `isReadOnlyHtmlPrototypeSpec: boolean` values.
- Produces: unchanged `hostMoreMenu: React.ReactNode`; no new public type or function.

- [ ] **Step 1: Write the failing regression test**

Update the obsolete assertion that requires the PRD session state to be absent from the menu, and add this source regression test inside `PresentationToolbar Agent host controls source`:

```ts
it('hides page and save menu groups only during PRD annotation', () => {
  const source = readToolbarSource();
  const hostMoreMenuSource = source.slice(
    source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
    source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
  );

  expect(hostMoreMenuSource).toMatch(
    /\{!prototypeAnnotationSessionActive \? \([\s\S]*aria-label="页面"[\s\S]*type: 'toggle-page-animations'[\s\S]*<\/>\s*\) : null\}/,
  );
  expect(hostMoreMenuSource).toContain(
    'isQuickEditActive && !isReadOnlyHtmlPrototypeSpec && !prototypeAnnotationSessionActive',
  );
  expect(hostMoreMenuSource).toContain('<div className={hostMenuGroupLabelClass}>帮助</div>');
  expect(hostMoreMenuSource).toContain("getQuickEditSaveMenuActionHandlers('save-text')");
  expect(hostMoreMenuSource).toContain("getQuickEditSaveMenuActionHandlers('save-style')");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.test.ts
```

Expected: FAIL in `hides page and save menu groups only during PRD annotation` because neither menu group is guarded by `prototypeAnnotationSessionActive` yet.

- [ ] **Step 3: Add minimal render guards**

In `PresentationToolbar.tsx`, wrap the page separator and page group together:

```tsx
{!prototypeAnnotationSessionActive ? (
  <>
    <div role="separator" className={hostMenuSeparatorClass} />
    <div role="group" aria-label="页面">
      <div className={hostMenuGroupLabelClass}>页面</div>
      {showHostPropertyPanelMenuAction ? (
        <button
          type="button"
          role="menuitem"
          {...getHostMenuActionHandlers({ type: 'toggle-property-panel' })}
          className={hostMenuItemClass}
        >
          <SlidersHorizontal className={hostMenuIconClass} />
          {hostToolbarState.propertyPanelOpen ? '关闭设计决策' : '设计决策'}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        {...getHostMenuActionHandlers({ type: 'toggle-page-animations' })}
        className={hostMenuItemClass}
      >
        <Settings2 className={hostMenuIconClass} /> {hostToolbarState.disablePageAnimations ? '开启页面动画' : '关闭页面动画'}
      </button>
    </div>
  </>
) : null}
```

Extend the existing save group condition without changing either save action:

```tsx
{isQuickEditActive && !isReadOnlyHtmlPrototypeSpec && !prototypeAnnotationSessionActive ? (
  <>
    <div role="separator" className={hostMenuSeparatorClass} />
    <div role="group" aria-label="保存">
      <div className={hostMenuGroupLabelClass}>保存</div>
      <button
        type="button"
        role="menuitem"
        {...getQuickEditSaveMenuActionHandlers('save-text')}
        className={hostMenuItemClass}
      >
        <FileText className={hostMenuIconClass} /> 保存文本
      </button>
      <button
        type="button"
        role="menuitem"
        {...getQuickEditSaveMenuActionHandlers('save-style')}
        className={hostMenuItemClass}
      >
        <PencilRuler className={hostMenuIconClass} /> 保存样式
      </button>
    </div>
  </>
) : null}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.test.ts
```

Expected: all tests in the file PASS with no new warnings or errors.

- [ ] **Step 5: Run TypeScript/build verification**

Run:

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: exit code 0. If unrelated pre-existing diagnostics prevent a clean run, record the exact diagnostics and verify that neither modified file is named.

- [ ] **Step 6: Review the scoped diff**

Run:

```bash
git diff --check -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.test.ts
git diff -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.test.ts
```

Expected: no whitespace errors; the diff preserves existing unrelated edits and only adds the regression coverage and two render guards for this task.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.test.ts docs/superpowers/plans/2026-08-10-prd-annotation-more-menu.md
git commit -m "fix: simplify PRD annotation more menu"
```

Before staging, verify the target files contain no unrelated changes owned by another task. If they do, do not commit those files wholesale; leave implementation changes unstaged and report the completed diff instead.
