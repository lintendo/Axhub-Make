# Document Editor Sticky Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the built-in Markdown editor's formatting toolbar visible at the top of the document viewport while the page scrolls.

**Architecture:** Preserve page-level vertical scrolling and fix the sticky containing block in the Make host only. A source regression test will lock the host wrapper to `overflow: visible` and retain the toolbar's existing sticky positioning without changing the reusable `tiptap-editor` package.

**Tech Stack:** React 18.2.0, TypeScript 5.x, CSS embedded in `MarkdownViewer.tsx`, Vitest 4.x

## Global Constraints

- Use pnpm for repository commands.
- Preserve whole-page scrolling and do not introduce a nested vertical scrollbar.
- Limit production behavior changes to Make's built-in Markdown document editor.
- Preserve the current toolbar layout, mobile layout, editing behavior, and other `SimpleEditor` consumers.
- Preserve all unrelated uncommitted changes already present in the worktree.

---

### Task 1: Release the toolbar from the non-scrolling editor wrapper

**Files:**
- Modify: `src/spec-template/legacy-editing-boundary.test.ts`
- Modify: `src/spec-template/MarkdownViewer.tsx`

**Interfaces:**
- Consumes: the existing `.spec-editor-shell`, `.simple-editor-wrapper`, and `.tiptap-toolbar` selectors inside `markdownStyles`
- Produces: a host-only `overflow: visible` rule that makes the toolbar's existing `position: sticky; top: 0` resolve against the page viewport

- [ ] **Step 1: Write the failing source regression test**

Add this case to `src/spec-template/legacy-editing-boundary.test.ts`:

```ts
it('keeps the document formatting toolbar sticky to the page viewport', () => {
  const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

  expect(viewerSource).toMatch(
    /\.spec-editor-shell \.simple-editor-wrapper\s*\{[\s\S]*?overflow:\s*visible;/,
  );
  expect(viewerSource).toMatch(
    /\.spec-editor-shell \.tiptap-toolbar\s*\{[\s\S]*?top:\s*0;[\s\S]*?position:\s*sticky;/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/spec-template/legacy-editing-boundary.test.ts
```

Expected: the new case fails because the `.spec-editor-shell .simple-editor-wrapper` rule does not contain `overflow: visible`; the pre-existing cases remain green.

- [ ] **Step 3: Add the minimal host-scoped overflow rule**

Update the existing wrapper rule in `src/spec-template/MarkdownViewer.tsx`:

```css
.spec-editor-shell .simple-editor-wrapper {
  width: 100%;
  min-height: calc(100vh - 230px);
  height: auto;
  overflow: visible;
}
```

Do not change the reusable editor package or replace sticky positioning with fixed positioning.

- [ ] **Step 4: Run focused and spec-template tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/spec-template/legacy-editing-boundary.test.ts
pnpm exec vitest run src/spec-template/indexHtml.test.ts src/spec-template/legacy-editing-boundary.test.ts src/spec-template/previewMarkdownContent.test.ts src/spec-template/quickEdit.test.ts
```

Expected: all tests pass with no new warnings or errors.

- [ ] **Step 5: Build the Make admin bundle**

Run:

```bash
pnpm admin:build
```

Expected: both Vite admin build targets finish successfully.

- [ ] **Step 6: Verify long-document scrolling in the browser**

Start the relevant Make admin page, open a long Markdown document in edit mode, and verify at desktop and narrow viewport widths:

- the page remains the vertical scroll owner;
- after scrolling beyond the first viewport, the toolbar remains visible at `top: 0`;
- toolbar controls remain clickable;
- no inner vertical scrollbar appears in the editor;
- horizontal toolbar and table overflow behavior still works.

- [ ] **Step 7: Review and commit only task-owned hunks**

Review:

```bash
git diff --check -- src/spec-template/MarkdownViewer.tsx src/spec-template/legacy-editing-boundary.test.ts
git diff -- src/spec-template/MarkdownViewer.tsx src/spec-template/legacy-editing-boundary.test.ts
```

Because both files already contain unrelated uncommitted changes, stage only the new test case and the single `overflow: visible` declaration. Confirm the staged diff contains no other work, then commit:

```bash
git diff --cached --check
git diff --cached -- src/spec-template/MarkdownViewer.tsx src/spec-template/legacy-editing-boundary.test.ts
git commit -m "fix: keep document editor toolbar visible while scrolling"
```
