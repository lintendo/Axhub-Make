# New Annotation Page Directory Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make page-directory route nodes clickable for prototypes whose `AnnotationViewer` is newly injected by Make.

**Architecture:** Extend only the Viewer JSX emitted by `managementApi.prototypeAnnotation.ts`. The generated options read a validated `page` id from the current hash/search on render and handle directory route clicks by writing Make's standard `#page=<id>` hash. Existing Viewer integrations and the generic annotation package remain unchanged.

**Tech Stack:** TypeScript 5.x, TSX source generation, Node.js, Vitest, pnpm.

## Global Constraints

- Use pnpm.
- Preserve unrelated dirty-worktree changes.
- Keep implementation files unstaged because they contain overlapping user changes.
- Do not modify `packages/axhub-annotation`.
- Do not upgrade historical prototypes that already contain `AnnotationViewer`.
- Route ids must match `/^[a-z0-9-]+$/u` before they are used.
- Do not change page-directory data generation or single-page behavior.

---

### Task 1: Lock the generated Viewer routing contract

**Files:**
- Modify: `src/server/__tests__/prototype-annotation-api.test.ts`
- Modify: `src/server/managementApi.prototypeAnnotation.ts`

**Interfaces:**
- Consumes: `createAnnotationViewerJsx(pageId: string, indent: string): string` and existing page directory route ids.
- Produces: newly injected `AnnotationViewer` options with dynamic `currentPageId` and `onDirectoryRoute` hash routing.

- [ ] **Step 1: Extend the existing enable API test with failing assertions**

In `enables annotation by creating source and wiring the prototype entry`, assert that `nextIndexSource` contains the complete routing primitives:

```ts
expect(nextIndexSource).toContain("new URLSearchParams(window.location.hash.replace(/^#/, '')).get('page')");
expect(nextIndexSource).toContain("new URLSearchParams(window.location.search.replace(/^\\?/, '')).get('page')");
expect(nextIndexSource).toContain("typeof pageId === 'string' && /^[a-z0-9-]+$/u.test(pageId)");
expect(nextIndexSource).toContain('onDirectoryRoute: (node) => {');
expect(nextIndexSource).toContain("typeof node.route === 'string' && /^[a-z0-9-]+$/u.test(node.route)");
expect(nextIndexSource).toContain('window.location.hash = `page=${node.route}`;');
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec vitest run src/server/__tests__/prototype-annotation-api.test.ts -t "enables annotation by creating source and wiring the prototype entry"
```

Expected: FAIL because the generated Viewer currently has a fixed `currentPageId` and no directory route callback.

- [ ] **Step 3: Generate dynamic page context and standard route handling**

Replace the fixed `currentPageId` line in `createAnnotationViewerJsx()` with these emitted TSX lines:

```ts
`${indent}    currentPageId: (() => {`,
`${indent}      const hashPageId = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('page');`,
`${indent}      const searchPageId = new URLSearchParams(window.location.search.replace(/^\\?/, '')).get('page');`,
`${indent}      const pageId = hashPageId || searchPageId;`,
`${indent}      return typeof pageId === 'string' && /^[a-z0-9-]+$/u.test(pageId)`,
`${indent}        ? pageId`,
`${indent}        : ${pageIdLiteral};`,
`${indent}    })(),`,
`${indent}    onDirectoryRoute: (node) => {`,
`${indent}      if (typeof node.route === 'string' && /^[a-z0-9-]+$/u.test(node.route)) {`,
`${indent}        window.location.hash = \`page=\${node.route}\`;`,
`${indent}      }`,
`${indent}    },`,
```

Keep the remaining Viewer options unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused Vitest command.

Expected: one matching test passes with no failures.

- [ ] **Step 5: Strengthen the idempotency assertion**

In the same test, after the second enable request, keep `expect(fs.readFileSync(indexPath, 'utf8')).toBe(nextIndexSource);`. This proves an existing Viewer is not rewritten and therefore historical prototypes remain out of scope.

- [ ] **Step 6: Run the complete annotation API suite**

```bash
pnpm exec vitest run src/server/__tests__/prototype-annotation-api.test.ts
```

Expected: all annotation API tests pass, including directory generation, single-page omission, existing-directory preservation, and repeated enablement.

- [ ] **Step 7: Check the unstaged implementation diff**

```bash
git diff --check -- src/server/__tests__/prototype-annotation-api.test.ts src/server/managementApi.prototypeAnnotation.ts
rg -n "currentPageId: \(\(\) =>|onDirectoryRoute: \(node\)|window.location.hash" src/server/managementApi.prototypeAnnotation.ts src/server/__tests__/prototype-annotation-api.test.ts
```

Expected: no whitespace errors and all routing assertions/generator lines are present. Do not stage these files.

### Task 2: Verify integration without broadening scope

**Files:**
- Verify: `src/server/__tests__/prototype-annotation-api.test.ts`
- Verify: `src/server/managementApi.prototypeAnnotation.ts`
- Verify: `packages/axhub-annotation` remains untouched.

**Interfaces:**
- Consumes: the generated TSX routing contract from Task 1.
- Produces: fresh regression, type/build, and scope evidence.

- [ ] **Step 1: Run the targeted regression with the existing client request suite**

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts src/server/__tests__/prototype-annotation-api.test.ts
```

Expected: both files pass with zero failing tests.

- [ ] **Step 2: Run the Make server build**

```bash
pnpm server:build
```

Expected: exit code 0. If the previously observed unrelated `getGlobalVoiceAssistantSettingsPath` error remains, report it as an external build blocker without modifying that module.

- [ ] **Step 3: Review the final scoped diff**

Confirm directly from the new hunks that:

- only newly generated Viewer JSX gains routing;
- invalid route ids are ignored;
- the generated current page id is validated and falls back to the existing annotation page id;
- `hasExplicitAnnotationViewerIntegration()` still skips historical Viewer integrations;
- no file under `packages/axhub-annotation` changed for this fix.

