# New Canvas Node Project Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure all newly created project resource nodes store project-scoped Make/API links.

**Architecture:** Pass `projectId` into `buildCanvasResourcePayloadFromPickerSelection`, then provide it to each `buildResourceDeepLinkUrl` call. Also make project scope an explicit field and URL requirement in the mirrored `canvas-workspace` node references used by AI agents. Existing nodes and old-node resolution remain unchanged.

**Tech Stack:** React 18, TypeScript, Vitest, pnpm.

## Global Constraints

- Only newly created nodes are in scope.
- Do not migrate or rewrite existing `.excalidraw` content.
- Do not alter old-node open-link resolution.

---

### Task 1: Scope resource-picker deep links to the active project

**Files:**
- Modify: `src/index/components/content/ExcalidrawCanvas.tsx:1164-1226,1267-1279`
- Test: `src/index/components/content/ExcalidrawCanvas.source.test.ts`

**Interfaces:**
- Consumes: `projectId: string` already supplied to `insertCanvasResourceSelections`.
- Produces: `CanvasResourcePayload.openUrl` with `projectId` for document, theme, and prototype selections.

- [ ] **Step 1: Write the failing source-contract test**

Add this test to `src/index/components/content/ExcalidrawCanvas.source.test.ts`:

```ts
it('creates project-scoped deep links for newly inserted resource nodes', () => {
  const source = readSource();
  const payloadStart = source.indexOf('function buildCanvasResourcePayloadFromPickerSelection');
  const payloadEnd = source.indexOf('function getCanvasResourcePayloadSize', payloadStart);
  const payloadSource = source.slice(payloadStart, payloadEnd);

  expect(payloadSource).toContain('function buildCanvasResourcePayloadFromPickerSelection(selection: CanvasProjectResourceItemSelection, projectId: string)');
  expect(payloadSource.match(/projectId,/g)).toHaveLength(3);
  expect(source).toContain('.map((selection) => buildCanvasResourcePayloadFromPickerSelection(selection, projectId))');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm vitest run src/index/components/content/ExcalidrawCanvas.source.test.ts`

Expected: FAIL because the helper does not accept or pass `projectId`.

- [ ] **Step 3: Implement the minimal scope propagation**

Change the helper signature and map call:

```ts
function buildCanvasResourcePayloadFromPickerSelection(
  selection: CanvasProjectResourceItemSelection,
  projectId: string,
): CanvasResourcePayload | null {
  // existing selection logic
}

const payloads = selections
  .map((selection) => buildCanvasResourcePayloadFromPickerSelection(selection, projectId))
  .filter((payload): payload is CanvasResourcePayload => Boolean(payload));
```

For each of the three `buildResourceDeepLinkUrl` targets (document, theme, prototype), add `projectId,` alongside `resourceId`.

- [ ] **Step 4: Run focused verification**

Run: `pnpm vitest run src/index/components/content/ExcalidrawCanvas.source.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/index/components/content/ExcalidrawCanvas.tsx src/index/components/content/ExcalidrawCanvas.source.test.ts
git commit -m "fix: scope new canvas resource links"
```

### Task 2: Require project scope in AI-created canvas resource nodes

**Files:**
- Modify: `client/.agents/skills/canvas-workspace/references/axhub-nodes.md`
- Modify: `client/.claude/skills/canvas-workspace/references/axhub-nodes.md`
- Test: `src/index/utils/defaultClientSkills.source.test.ts`

**Interfaces:**
- Consumes: the active Make `projectId` available in the AI task context.
- Produces: mirrored node references that require `customData.projectId` and scoped relative Make/API URLs for new project resource nodes.

- [ ] **Step 1: Write the failing skill contract test**

Add a test that reads both `axhub-nodes.md` mirrors and asserts each contains the structural rule `新建项目内嵌入节点必须同时写入` plus the three example fragments `"projectId": "<project-id>"`, `projectId=<project-id>&p=`, and `projectId=<project-id>&doc=`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm vitest run src/index/utils/defaultClientSkills.source.test.ts`

Expected: FAIL because the current reference does not require or demonstrate project scope.

- [ ] **Step 3: Update the mirrored node references**

In both references, add a concise structural requirement: every newly created project-local embed must persist the active project ID in `customData.projectId`; every relative Make/API URL stored in `link`, `previewUrl`, or `openUrl` must contain that same `projectId`. Update the prototype and document JSON examples to show the required query and field.

- [ ] **Step 4: Run focused verification**

Run: `pnpm vitest run src/index/utils/defaultClientSkills.source.test.ts src/index/components/content/ExcalidrawCanvas.source.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit only task-specific hunks**

```bash
git add src/index/utils/defaultClientSkills.source.test.ts
git add -p client/.agents/skills/canvas-workspace/references/axhub-nodes.md client/.claude/skills/canvas-workspace/references/axhub-nodes.md
git commit -m "fix: require project scope for new canvas nodes"
```
