# Annotation Locator Generation Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent newly generated annotation locators from persisting selector candidates that match multiple elements or a different element than the one the user selected.

**Architecture:** Keep the existing `selectors: string[]`, fingerprint, path, API payload, and reader behavior unchanged. Validate every selector candidate against the selected live `Element` while generating the locator, retain only candidates that uniquely resolve to that exact element, and always retain the already-generated structural selector after applying the same validation.

**Tech Stack:** TypeScript, DOM `querySelectorAll`, Vitest.

## Global Constraints

- Do not classify selectors by keywords, naming conventions, or perceived stability.
- Do not add legacy annotation-data migration or reader-side fuzzy matching.
- Do not change `AnnotationSourceDocument` or locator wire formats.
- Preserve existing unique ID, data attribute, class, panel-node, and structural selectors.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Validate annotation selector candidates at generation time

**Files:**
- Modify: `src/dev-template/webEditorV2Integration.ts:263`
- Test: `src/dev-template/webEditorV2Integration.test.ts:2960`

**Interfaces:**
- Consumes: the selected live `Element` passed to `createElementAnnotationLocator(element)`.
- Produces: the existing `{ selectors: string[]; fingerprint: string; path: Array<{ tag: string; index: number }> }` shape.

- [x] **Step 1: Write the failing regression test**

Create two sibling elements with the same class, select the second, invoke `host.onAnnotationMarkdownChange`, and assert that the request locator excludes the shared raw class while retaining the unique `section:nth-of-type(2)` structural selector.

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @axhub/make exec vitest run src/dev-template/webEditorV2Integration.test.ts -t "persists only selector candidates that uniquely resolve to the selected annotation element"
```

Expected before implementation: FAIL because `.annotation-guide-manuscript` is present in the request locator.

- [x] **Step 3: Implement exact-target selector validation**

Add a local helper used only by `createElementAnnotationLocator`:

```ts
function selectorUniquelyTargetsElement(element: Element, selector: string): boolean {
  const root = element.getRootNode?.();
  const queryRoot = root && 'querySelectorAll' in root ? root as ParentNode : document;
  try {
    const matches = queryRoot.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}
```

Route all selector candidates through one `pushSelector` helper that trims, deduplicates, and retains a candidate only when the helper returns `true`. Keep fingerprint and path generation unchanged.

- [x] **Step 4: Run the focused test and verify it passes**

Run the Step 2 command. Expected: PASS.

- [x] **Step 5: Verify preserved unique-selector behavior**

Add or retain assertions proving a unique class selector and stable attribute selector are still emitted unchanged, then run:

```bash
pnpm --filter @axhub/make exec vitest run src/dev-template/webEditorV2Integration.test.ts
```

Expected: all tests in the file pass.

- [x] **Step 6: Run broader validation and inspect the diff**

Run:

```bash
pnpm --filter @axhub/make exec tsc --noEmit -p tsconfig.json
git -C apps/axhub-make diff --check -- src/dev-template/webEditorV2Integration.ts src/dev-template/webEditorV2Integration.test.ts
```

Result: the target Vitest file, Vite production build, and `git diff --check` pass. The repository-wide TypeScript command remains blocked by existing project-reference output errors and unrelated type errors; the final diff contains no reader, persistence API, or wire-format changes.
