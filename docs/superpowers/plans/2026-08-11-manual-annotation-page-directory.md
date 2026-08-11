# Manual Annotation Page Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the existing annotation page-directory wire format when a user manually enables annotation for a multi-page prototype.

**Architecture:** The Make admin sends the selected prototype's existing `pages` metadata with the annotation-enable request. The prototype annotation API validates that optional metadata and, only when more than one valid page remains and the source has no `directory`, adds the standard “页面” folder containing route nodes before writing `annotation-source.json`. Annotation runtime interaction remains unchanged.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Node.js filesystem APIs, Vitest, pnpm.

## Global Constraints

- Use pnpm for repository development and tests.
- Preserve unrelated dirty-worktree changes.
- The target client and API test files already contain overlapping user changes; do not stage or commit implementation files automatically.
- Page ids use lowercase letters, numbers, and hyphens.
- Do not add old-version compatibility behavior.
- Do not modify `AnnotationViewer` directory interaction, routing, or highlighting.
- Do not write an empty directory for zero-page or single-page prototypes.
- Preserve any existing `directory` value exactly.

---

### Task 1: Pass prototype page metadata through the manual-enable request

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`

**Interfaces:**
- Consumes: `selectedItem.pages?: { id: string; title: string; group?: string }[]`.
- Produces: `POST /api/prototype-annotation/enable` JSON body `{ targetPath, pages }`.

- [ ] **Step 1: Extend the existing source regression test**

In the test named `enables prototype annotation from the host toolbar without reloading the preview`, add:

```ts
expect(enableAnnotationSource).toContain('pages: selectedItem.pages,');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts -t "enables prototype annotation from the host toolbar without reloading the preview"
```

Expected: FAIL because the request body currently contains `targetPath` but not `pages: selectedItem.pages`.

- [ ] **Step 3: Add the optional page metadata to the request body**

Change the JSON request body in `handleEnablePrototypeAnnotation` to:

```ts
body: JSON.stringify({
  targetPath,
  pages: selectedItem.pages,
}),
```

Do not derive routes, directory nodes, or interaction callbacks in the client.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused Vitest command.

Expected: PASS with one matching test and no failures.

- [ ] **Step 5: Check the client edit without staging it**

```bash
git diff --check -- src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx
```

Expected: no whitespace errors. Leave both files unstaged because they already contain unrelated user changes.

### Task 2: Generate the standard page directory in the annotation API

**Files:**
- Modify: `src/server/__tests__/prototype-annotation-api.test.ts`
- Modify: `src/server/managementApi.prototypeAnnotation.ts`

**Interfaces:**
- Consumes: optional request body field `pages: unknown`.
- Produces: `normalizePrototypeAnnotationPages(input: unknown): PrototypeAnnotationPage[]` and conditional `source.directory` data in the existing annotation wire format.

- [ ] **Step 1: Add a failing multi-page API test**

Add a test that enables annotation with valid, invalid, and duplicate page entries:

```ts
it('creates a standard page directory from valid multi-page metadata', async () => {
  const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
  writePrototypeProject(projectRoot);
  const server = await startActivatedProjectServer(projectRoot);

  try {
    const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPath: 'prototypes/home',
        pages: [
          { id: 'home', title: ' 首页 ' },
          { id: 'INVALID', title: '无效页面' },
          { id: 'orders', title: '订单列表', group: '业务' },
          { id: 'home', title: '重复首页' },
          { id: 'empty-title', title: '   ' },
        ],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source.directory).toEqual({
      nodes: [{
        type: 'folder',
        id: 'directory-pages',
        title: '页面',
        defaultExpanded: true,
        children: [
          { type: 'route', id: 'route-home', title: '首页', route: 'home' },
          { type: 'route', id: 'route-orders', title: '订单列表', route: 'orders' },
        ],
      }],
    });
    expect(JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'src/prototypes/home/annotation-source.json'),
      'utf8',
    )).directory).toEqual(body.source.directory);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run the multi-page test and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/prototype-annotation-api.test.ts -t "creates a standard page directory from valid multi-page metadata"
```

Expected: FAIL because `body.source.directory` is currently undefined.

- [ ] **Step 3: Implement page normalization and directory filling**

In `managementApi.prototypeAnnotation.ts`, define the validated page shape and helpers near the existing page-id normalization:

```ts
type PrototypeAnnotationPage = {
  id: string;
  title: string;
};

function normalizePrototypeAnnotationPages(input: unknown): PrototypeAnnotationPage[] {
  if (!Array.isArray(input)) return [];
  const pages: PrototypeAnnotationPage[] = [];
  const seenIds = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = normalizePrototypePageId(record.id);
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!id || !title || seenIds.has(id)) continue;
    seenIds.add(id);
    pages.push({ id, title });
  }
  return pages;
}

function fillPageDirectory(
  source: AnnotationSourceDocument,
  pages: PrototypeAnnotationPage[],
): AnnotationSourceDocument {
  if ('directory' in source || pages.length <= 1) return source;
  return {
    ...source,
    directory: {
      nodes: [{
        type: 'folder',
        id: 'directory-pages',
        title: '页面',
        defaultExpanded: true,
        children: pages.map((page) => ({
          type: 'route',
          id: `route-${page.id}`,
          title: page.title,
          route: page.id,
        })),
      }],
    },
  };
}
```

In the enable route, replace the source read with:

```ts
const pages = normalizePrototypeAnnotationPages(
  body && typeof body === 'object' ? (body as { pages?: unknown }).pages : undefined,
);
const source = fillPageDirectory(readAnnotationSource(resolved), pages);
```

Keep the existing source write and Viewer integration sequence unchanged.

- [ ] **Step 4: Run the multi-page test and verify GREEN**

Run the same focused API test command.

Expected: PASS with one matching test and no failures.

- [ ] **Step 5: Add single-page and existing-directory regression tests**

Add two tests:

```ts
it('does not create a directory for a single-page prototype', async () => {
  const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
  writePrototypeProject(projectRoot);
  const server = await startActivatedProjectServer(projectRoot);

  try {
    const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPath: 'prototypes/home',
        pages: [{ id: 'home', title: '首页' }],
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source).not.toHaveProperty('directory');
  } finally {
    await server.close();
  }
});

it('preserves an existing annotation directory when enabling repeatedly', async () => {
  const projectRoot = createTempRoot('axhub-make-prototype-annotation-');
  writePrototypeProject(projectRoot);
  const sourcePath = path.join(projectRoot, 'src/prototypes/home/annotation-source.json');
  const existingDirectory = {
    nodes: [{ type: 'markdown', id: 'doc-overview', title: '说明', markdown: '# 说明' }],
  };
  fs.writeFileSync(sourcePath, `${JSON.stringify({
    documentVersion: 1,
    format: 'axhub-annotation-source',
    data: { version: 2, prototypeName: 'home', pageId: 'home', nodes: [], updatedAt: 1 },
    markdownMap: {},
    assetMap: {},
    directory: existingDirectory,
  }, null, 2)}\n`, 'utf8');
  const server = await startActivatedProjectServer(projectRoot);

  try {
    const request = () => fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/prototype-annotation/enable`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPath: 'prototypes/home',
        pages: [{ id: 'home', title: '首页' }, { id: 'orders', title: '订单' }],
      }),
    });
    await request();
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source.directory).toEqual(existingDirectory);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 6: Run the complete prototype annotation API suite**

Run:

```bash
pnpm exec vitest run src/server/__tests__/prototype-annotation-api.test.ts
```

Expected: all tests in the file pass with no failures.

- [ ] **Step 7: Check the server edit without staging it**

```bash
git diff --check -- src/server/__tests__/prototype-annotation-api.test.ts src/server/managementApi.prototypeAnnotation.ts
```

Expected: no whitespace errors. Leave the implementation files unstaged.

### Task 3: Verify the integrated change

**Files:**
- Verify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Verify: `src/server/__tests__/prototype-annotation-api.test.ts`
- Verify: `src/server/managementApi.prototypeAnnotation.ts`
- Verify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`

**Interfaces:**
- Consumes: the client request payload and server directory generation from Tasks 1 and 2.
- Produces: fresh test, type/build, whitespace, and diff evidence for delivery.

- [ ] **Step 1: Run both focused regression suites together**

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts src/server/__tests__/prototype-annotation-api.test.ts
```

Expected: both test files pass with zero failing tests.

- [ ] **Step 2: Build the Make server**

```bash
pnpm server:build
```

Expected: vendor preparation and TypeScript compilation finish with exit code 0.

- [ ] **Step 3: Inspect whitespace and the scoped diff**

```bash
git diff --check -- src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx src/server/__tests__/prototype-annotation-api.test.ts src/server/managementApi.prototypeAnnotation.ts
rg -n "pages: selectedItem.pages|normalizePrototypeAnnotationPages|fillPageDirectory" src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/app/index-page/useIndexPagePreviewActions.tsx src/server/__tests__/prototype-annotation-api.test.ts src/server/managementApi.prototypeAnnotation.ts
```

Expected: no whitespace errors, and every feature-specific symbol or assertion is present in the intended files. Review only the new hunks because the files also contain pre-existing user changes.

- [ ] **Step 4: Review requirements against the final diff**

Confirm from the diff that:

- the client sends existing page metadata without constructing directory nodes;
- the server creates one standard “页面” folder only for more than one valid page;
- existing `directory` values remain unchanged;
- no runtime interaction or routing code changed.
