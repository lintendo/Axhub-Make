# Resource Copy Project-Relative Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the resource sidebar copy `src/resources/...` paths relative to the project root.

**Architecture:** Keep resource API and item identity paths unchanged. Add a focused frontend helper that converts an item's explicit local resource path to project-relative form, then call it only from the document-resource copy handler.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest, pnpm.

## Global Constraints

- Preserve existing user changes in every touched file.
- Keep the resource API and sidebar tree paths relative to the resource root.
- Do not add compatibility branches for older resource formats.
- Normalize copied path separators to `/` for macOS and Windows consistency.

---

### Task 1: Convert copied resource paths at the clipboard boundary

**Files:**
- Modify: `src/index/app/index-page/resourceActions.helpers.ts`
- Modify: `src/index/app/index-page/resourceActions.helpers.test.ts`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.tsx`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.test.ts`

**Interfaces:**
- Consumes: `getProjectRelativeResourcePathForItem(item: unknown)` with an item containing an explicit `filePath`, `absoluteFilePath`, or `path`.
- Produces: an empty string or a slash-normalized project-relative path rooted at `src/resources/`.

- [x] **Step 1: Write failing helper and handler contract tests**

Add unit assertions for `assets/logo.png`, `src/resources/assets/logo.png`, `/workspace/project/src/resources/assets/logo.png`, and `assets\\logo.png`. Add a source assertion that `handleCopyDocPath` writes `getProjectRelativeResourcePathForItem(item)` to the clipboard.

- [x] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec vitest run src/index/app/index-page/resourceActions.helpers.test.ts src/index/app/index-page/useIndexPageResourceActions.test.ts
```

Expected: FAIL because `getProjectRelativeResourcePathForItem` does not exist and the handler still uses `getLocalPathForItem`.

- [x] **Step 3: Implement the minimal conversion helper**

Add `getProjectRelativeResourcePathForItem(item: unknown): string`. Read the existing explicit local path, normalize `\\` to `/`, preserve or extract `src/resources/`, and otherwise prefix `src/resources/`.

- [x] **Step 4: Use the helper in the resource copy handler**

Replace the `handleCopyDocPath` local path lookup with `getProjectRelativeResourcePathForItem(item)`. Keep the existing warning, success, and failure messages unchanged.

- [x] **Step 5: Run focused and adjacent tests**

```bash
pnpm exec vitest run src/index/app/index-page/resourceActions.helpers.test.ts src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/index-page.helpers.test.ts
```

Expected: all tests pass with zero failures.

- [x] **Step 6: Check the final diff**

```bash
git diff --check
git diff -- src/index/app/index-page/resourceActions.helpers.ts src/index/app/index-page/resourceActions.helpers.test.ts src/index/app/index-page/useIndexPageResourceActions.tsx src/index/app/index-page/useIndexPageResourceActions.test.ts
```

Expected: no whitespace errors, and only the project-relative resource copy behavior and its tests are changed.
