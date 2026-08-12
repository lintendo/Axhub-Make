# Annotation Enable Runtime Page Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual annotation enabling use the same latest structured page list already rendered by the Make prototype sidebar.

**Architecture:** Keep a prototype-scoped page snapshot in `useIndexPagePreviewActions`, update it from both `selectedItem.pages` and accepted `AXHUB_PROTOTYPE_ROUTE_INFO` messages, and resolve the enable request pages from that snapshot. Leave annotation directory generation and route click behavior on the existing server path.

**Tech Stack:** React 18.2, TypeScript 5, Vitest 4, pnpm workspace.

## Global Constraints

- Do not modify prototype copy behavior.
- Do not parse `defineHashPageRoute` from prototype source code.
- Do not modify `@axhub/annotation` directory interaction contracts.
- Do not overwrite an existing `annotation-source.directory`.
- Preserve unrelated and pre-existing worktree changes.

---

### Task 1: Resolve the Current Prototype's Latest Page Snapshot

**Files:**
- Modify: `src/index/app/index-page/previewActions.helpers.ts`
- Test: `src/index/app/index-page/previewActions.helpers.test.ts`

**Interfaces:**
- Consumes: a selected prototype resource and an optional `{ prototypeId, pages }` runtime snapshot.
- Produces: `resolvePrototypeAnnotationEnablePages(selectedItem, snapshot): PrototypeRoutePage[]`.

- [ ] **Step 1: Write the failing test**

Add a test that retrieves `resolvePrototypeAnnotationEnablePages` from the helpers namespace, asserts that it exists, then verifies:

```ts
expect(resolvePages?.({
  name: 'guide-copy',
  pages: [{ id: 'stale', title: '旧页面' }],
}, {
  prototypeId: 'guide-copy',
  pages: [{ id: 'overview', title: '总览' }, { id: 'install-agent', title: '安装 Agent' }],
})).toEqual([
  { id: 'overview', title: '总览' },
  { id: 'install-agent', title: '安装 Agent' },
]);
```

Also assert that a snapshot for another prototype falls back to the selected item's normalized pages.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts
```

Expected: FAIL because `resolvePrototypeAnnotationEnablePages` is not defined.

- [ ] **Step 3: Implement the minimal resolver**

Export the page and snapshot types plus a resolver that normalizes ids/titles, uses a non-empty snapshot only when its `prototypeId` matches the selected resource identity, and otherwise normalizes `selectedItem.pages`.

- [ ] **Step 4: Re-run the focused test to verify GREEN**

Run the Step 2 command. Expected: all tests in the file pass.

### Task 2: Keep the Runtime Page Snapshot Synchronized

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Test: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`

**Interfaces:**
- Consumes: `normalizePrototypeRouteInfo(event.data)` and `selectedItem.pages`.
- Produces: `prototypeRoutePagesRef`, scoped by `resolveSelectedPrototypeIdentity(selectedItem)`.

- [ ] **Step 1: Write the failing source contract assertions**

Extend the annotation enabling source test to require:

```ts
expect(enableAnnotationSource).toContain('resolvePrototypeAnnotationEnablePages(');
expect(enableAnnotationSource).toContain('prototypeRoutePagesRef.current');
```

Add assertions around the route-info handler requiring it to assign `nextRouteInfo.pages` to the snapshot before calling `onPrototypeRouteInfo`.

- [ ] **Step 2: Run the focused source test to verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: FAIL because the runtime snapshot does not exist.

- [ ] **Step 3: Implement the snapshot and enable request wiring**

Import the Task 1 resolver/types. Add a prototype-scoped ref, synchronize it from valid `selectedItem.pages`, update it immediately when an accepted route-info message arrives, and build the enable request with:

```ts
pages: resolvePrototypeAnnotationEnablePages(selectedItem, prototypeRoutePagesRef.current),
```

Reset the snapshot identity when the selected prototype changes so pages never leak between prototypes.

- [ ] **Step 4: Run both focused suites to verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: both files pass.

### Task 3: Refill and Verify the Current Example

**Files:**
- Runtime update only: `client/src/prototypes/beginner-guide-copy/annotation-source.json`

**Interfaces:**
- Consumes: the existing `/api/prototype-annotation/enable` endpoint and the eight pages currently reported by `beginner-guide-copy`.
- Produces: a standard `directory` with eight route nodes in the current example.

- [ ] **Step 1: Refill through the product API**

POST `targetPath: "prototypes/beginner-guide-copy"` and the eight current structured pages to `/api/prototype-annotation/enable?projectId=make-project`.

- [ ] **Step 2: Verify the persisted directory**

Read the API response and `annotation-source.json`; assert one `页面` folder and eight route children in the existing order.

- [ ] **Step 3: Verify browser behavior**

Reload the supplied localhost page, open the annotation directory, click `安装 Agent`, and verify the page URL/current content changes to `install-agent`.

### Task 4: Regression and Build Verification

**Files:**
- Test: `src/server/__tests__/prototype-annotation-api.test.ts`
- Test: `src/index/app/index-page/previewActions.helpers.test.ts`
- Test: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`

- [ ] **Step 1: Run related regression suites**

```bash
pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts src/server/__tests__/prototype-annotation-api.test.ts
```

Expected: all files and tests pass.

- [ ] **Step 2: Run the server build**

```bash
pnpm server:build
```

Expected: vendor sync and `tsc --noEmit -p tsconfig.node.json` exit successfully.

- [ ] **Step 3: Check whitespace and scope**

Run `git diff --check` on the four implementation/test files and inspect their diff. Do not stage or commit implementation files because they overlap pre-existing user changes.
