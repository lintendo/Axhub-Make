# New Canvas Node Project Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure resource-picker nodes created in a canvas store a Make deep link containing the active project ID.

**Architecture:** Pass `projectId` into `buildCanvasResourcePayloadFromPickerSelection`, then provide it to each `buildResourceDeepLinkUrl` call. The existing drop creation code persists the supplied `openUrl`; it and all old nodes remain unchanged.

**Tech Stack:** React 18, TypeScript, Vitest, pnpm.

## Global Constraints

- Only newly created resource-picker nodes are in scope.
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
