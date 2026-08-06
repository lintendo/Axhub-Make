# Local Quick Edit Save Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore local text, forced-style, and forced-style-clear persistence for official Make prototype and theme previews.

**Architecture:** A focused client Vite middleware owns the existing `/api/text-replace/*` and `/api/hack-css/*` routes and confines writes to the selected resource directory. `clientPreviewPlugin` wires that middleware and loads persisted `hack.css`; the existing DevTemplate controller remains the UI bridge but fails closed when counting is unavailable and reloads after style persistence.

**Tech Stack:** TypeScript 5.x, React 18.2.0, Vite 5 middleware, Node.js filesystem APIs, Vitest 4, pnpm.

## Global Constraints

- Use pnpm only.
- Preserve all unrelated changes in the dirty root and nested `apps/axhub-make` worktrees.
- Do not add compatibility for removed `pages/`, `elements/`, or `components/` resource paths.
- Limit writes to `src/prototypes/` and `src/themes/`; reject traversal and do not follow symlinks.
- Scan only `.js`, `.jsx`, `.ts`, and `.tsx`; exclude `.spec`, `.local`, hidden directories, `node_modules`, `dist`, and `*.assets`.
- Allow at most 200 replacements, 10,000 Unicode characters per search/replacement value, 2 MB JSON bodies, and 256 KB CSS.
- Do not change HTML resource `/api/html-review/*` behavior.
- Files with pre-existing user edits may be changed only in owned hunks and must not be committed if those hunks cannot be isolated safely.

---

### Task 1: Add bounded local editing API

**Files:**
- Create: `client/vite-plugins/localEditingApi.ts`
- Create: `client/tests/local-editing-api.test.ts`

**Interfaces:**
- Consumes: Node `IncomingMessage`, `ServerResponse`, and the client project root.
- Produces: `handleLocalEditingApi(req, res, projectRoot): boolean`.

- [ ] **Step 1: Write failing API tests**

Create a temporary project with `src/prototypes/demo/index.tsx`, a helper TS file, excluded `.spec` content, and a sibling resource. Invoke the middleware through an HTTP server and assert:

```ts
expect(await post('/api/text-replace/count', {
  path: 'prototypes/demo',
  replacements: [{ searchText: 'Old copy' }],
})).toMatchObject({ status: 200, body: { totalCount: 2 } });

expect(await post('/api/text-replace/replace', {
  path: 'prototypes/demo',
  replacements: [{ searchText: 'Old copy', replaceText: 'New copy' }],
})).toMatchObject({ status: 200, body: { success: true, changedFiles: 2 } });
```

Add separate cases for non-cascading batch replacement, exclusions, theme paths, traversal, symlinks, conflicting duplicate search strings, body limits, CSS save/overwrite, clear, and idempotent clear.

- [ ] **Step 2: Run the API test and verify RED**

Run from `apps/axhub-make/client`:

```bash
pnpm exec vitest run tests/local-editing-api.test.ts
```

Expected: FAIL because `../vite-plugins/localEditingApi` does not exist.

- [ ] **Step 3: Implement request parsing and path containment**

Create the public handler and internal bounded parser:

```ts
export function handleLocalEditingApi(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): boolean;
```

Recognize only the four declared paths. Normalize resource paths to safe segments under either `src/prototypes` or `src/themes`, reject symlinks during recursive traversal, and return JSON without absolute paths.

- [ ] **Step 4: Implement count and non-cascading replacement**

Normalize batch items to:

```ts
type TextReplacement = { searchText: string; replaceText?: string };
```

Reject conflicting duplicates. Build one escaped alternation RegExp sorted by descending search-text length and replace against the original source in a single pass:

```ts
content.replace(pattern, (matched) => replacementMap.get(matched) ?? matched);
```

Prepare every output before writing. Write changed files through same-directory temporary files and rename them after all temporary writes succeed.

- [ ] **Step 5: Implement `hack.css` save and clear**

Write the provided content atomically to `<resource>/hack.css`, enforce the 256 KB limit, and remove only that file on clear. Return `{ success: true, changed }` for both existing and absent clear targets.

- [ ] **Step 6: Run Task 1 tests and verify GREEN**

```bash
pnpm exec vitest run tests/local-editing-api.test.ts
```

Expected: all local editing API tests pass with no warnings.

### Task 2: Wire APIs and persisted style into preview

**Files:**
- Modify: `client/vite-plugins/clientPreviewPlugin.ts`
- Modify: `client/tests/client-preview-routes.test.ts`

**Interfaces:**
- Consumes: `handleLocalEditingApi()` from Task 1 and resource-local `hack.css`.
- Produces: live Vite middleware routes and preview HTML with stable style ordering.

- [ ] **Step 1: Write failing plugin tests**

Add a middleware test that posts to `/api/text-replace/count` through `clientPreviewPlugin.configureServer()` and expects a handled JSON response instead of `next()`. Add HTML assertions:

```ts
expect(html.indexOf('/prototypes/demo/style.css'))
  .toBeLessThan(html.indexOf('/prototypes/demo/hack.css'));
```

Delete `hack.css`, request the page again, and assert the hack link is absent.

- [ ] **Step 2: Run the route test and verify RED**

```bash
pnpm exec vitest run tests/client-preview-routes.test.ts
```

Expected: API request falls through and preview HTML lacks `hack.css`.

- [ ] **Step 3: Wire the API before GET-only preview routing**

At the start of the middleware callback:

```ts
if (handleLocalEditingApi(req, res, projectRoot)) return;
if (!req.url || req.method !== 'GET') {
  next();
  return;
}
```

- [ ] **Step 4: Add persisted hack style metadata**

Extend `PreviewSource` with `hackStylePath` and `hackStyleHref`. Populate both for live and Git-version sources, but include the `<link>` only for an existing file and after the regular style link. Historical snapshots remain read-only and use their own snapshot-local file only when present.

- [ ] **Step 5: Run Task 2 tests and verify GREEN**

```bash
pnpm exec vitest run tests/local-editing-api.test.ts tests/client-preview-routes.test.ts
```

Expected: both suites pass.

### Task 3: Make the DevTemplate controller fail closed and support themes

**Files:**
- Modify: `src/dev-template/webEditorV2Integration.test.ts`
- Modify: `src/dev-template/webEditorV2Integration.ts`

**Interfaces:**
- Consumes: the restored Runtime API responses.
- Produces: safe save behavior for prototypes and themes, plus style reload after persistence.

- [ ] **Step 1: Write failing controller tests**

Add a resource-context case:

```ts
expect(resolveHostResourceContextFromLocation(
  '/themes/brand-system',
  'http://localhost:51720/themes/brand-system',
)).toMatchObject({ kind: 'prototype-entry', path: 'themes/brand-system' });
```

Add a save test where `/api/text-replace/count` returns 404 and assert the controller rejects without calling `/api/text-replace/replace`. Add style save and clear tests that assert `window.location.reload()` runs only after successful API responses.

- [ ] **Step 2: Run focused controller tests and verify RED**

From `apps/axhub-make`:

```bash
pnpm exec vitest run src/dev-template/webEditorV2Integration.test.ts
```

Expected: theme context is null, count failure still reaches confirmation behavior, and reload expectations fail.

- [ ] **Step 3: Implement the minimal controller changes**

Extend `HostResourceRoute.group` and the route regex to `themes`. Replace the count fallback with an explicit error:

```ts
if (!countResult.ok || totalCount <= 0) {
  throw new Error(readResponseErrorMessage(
    countResult.data,
    '无法统计文本替换数量，未保存任何修改。',
  ));
}
```

After acknowledging successful style save or clear, call `window.location.reload()` when available.

- [ ] **Step 4: Run focused controller tests and verify GREEN**

```bash
pnpm exec vitest run src/dev-template/webEditorV2Integration.test.ts
```

Expected: all controller tests pass.

### Task 4: Restore the clear-style menu command

**Files:**
- Modify: `src/index/components/content/PresentationToolbar.test.ts`
- Modify: `src/index/components/content/PresentationToolbar.tsx`

**Interfaces:**
- Consumes: existing `QuickEditSaveAction` value `clear-style`.
- Produces: visible “清空强制样式” command in the quick-edit save group.

- [ ] **Step 1: Write the failing toolbar test**

Assert the save-menu source contains:

```ts
expect(hostMoreMenuSource).toContain("getQuickEditSaveMenuActionHandlers('clear-style')");
expect(hostMoreMenuSource).toContain('清空强制样式');
```

- [ ] **Step 2: Run the toolbar test and verify RED**

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.test.ts
```

Expected: both new assertions fail.

- [ ] **Step 3: Add the menu button**

Add a command after “保存样式” using the existing Lucide `Eraser` icon and menu-item classes:

```tsx
<button
  type="button"
  role="menuitem"
  {...getQuickEditSaveMenuActionHandlers('clear-style')}
  className={hostMenuItemClass}
>
  <Eraser className={hostMenuIconClass} /> 清空强制样式
</button>
```

- [ ] **Step 4: Run Task 4 tests and verify GREEN**

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.test.ts
```

Expected: toolbar tests pass.

### Task 5: Integrated verification

**Files:**
- Review: all Task 1-4 files
- Temporary browser artifacts: `.local/` only

**Interfaces:**
- Consumes: completed Runtime, preview, controller, and toolbar behavior.
- Produces: fresh automated and browser evidence for the acceptance criteria.

- [ ] **Step 1: Run focused regression suites**

```bash
pnpm --dir client exec vitest run \
  tests/local-editing-api.test.ts \
  tests/client-preview-routes.test.ts
pnpm exec vitest run \
  src/dev-template/webEditorV2Integration.test.ts \
  src/index/components/content/PresentationToolbar.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run builds**

```bash
pnpm server:build
pnpm admin:build
```

Expected: both commands exit 0.

- [ ] **Step 3: Verify the running Runtime API**

Restart the official client dev server if required, then POST a non-mutating count request to the active Runtime and assert HTTP 200 with a numeric `totalCount`.

- [ ] **Step 4: Run browser acceptance flow**

Open the Make admin at `http://localhost:53817/`, enter a disposable prototype, edit text, save text, save a style, and clear that style. Verify the source file, `hack.css`, refreshed preview, network responses, and console at each step. Restore only the disposable acceptance fixture edits created by this task.

- [ ] **Step 5: Inspect final diffs**

```bash
git diff --check
git status --short
git diff -- \
  client/vite-plugins/localEditingApi.ts \
  client/tests/local-editing-api.test.ts \
  client/vite-plugins/clientPreviewPlugin.ts \
  client/tests/client-preview-routes.test.ts \
  src/dev-template/webEditorV2Integration.ts \
  src/dev-template/webEditorV2Integration.test.ts \
  src/index/components/content/PresentationToolbar.tsx \
  src/index/components/content/PresentationToolbar.test.ts
```

Expected: no whitespace errors and no unrelated hunks introduced by this task.
