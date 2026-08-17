# Hide Disabled Figma Make Publish Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the 224px publish-menu width and omit `导出 Figma Make` whenever its existing disabled reason is present.

**Architecture:** Keep the existing capability calculation and export handler unchanged. Narrow only the publish-menu content and extend the existing Figma Make visibility condition so a disabled action is not rendered.

**Tech Stack:** React 18.2, TypeScript 5.x, Radix Dropdown Menu, Tailwind CSS, Vitest source regression tests.

## Global Constraints

- Use `pnpm` for development and verification commands.
- Change only the publish-menu width, Figma Make visibility condition, and focused regression assertions.
- Preserve unrelated uncommitted changes in `PresentationToolbar.tsx` and its source test.
- Do not change other disabled menu entries, export availability calculations, action handlers, section ordering, or backend behavior.

---

### Task 1: Hide the Disabled Figma Make Action

**Files:**
- Modify: `src/index/components/content/PresentationToolbar.source.test.ts:17-54`
- Modify: `src/index/components/content/PresentationToolbar.tsx:1431-1463`

**Interfaces:**
- Consumes: `showMakeExportEntry: boolean`, `makeExportDisabledReason: string`, and `handleExportMake: () => void` already defined by `PresentationToolbar`.
- Produces: a 224px publish menu that renders `导出 Figma Make` only when `showMakeExportEntry && !makeExportDisabledReason`.

- [ ] **Step 1: Write the failing source regression test**

Update the existing width marker and replace the disabled-reason layout test with:

```ts
it('hides Figma Make when export is disabled and keeps the compact menu width', () => {
  const source = readSource();
  const exportMenuSegment = getSourceSegment(
    source,
    '<DropdownMenuContent align="end" className="w-56 text-sm">',
    '{showHtmlExportEntry ? (',
  );

  expect(exportMenuSegment).toContain('{showMakeExportEntry && !makeExportDisabledReason ? (');
  expect(exportMenuSegment).toContain('onClick={handleExportMake}');
  expect(exportMenuSegment).not.toContain('{makeExportDisabledReason}');
  expect(exportMenuSegment).not.toContain('w-72');
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: FAIL because the source still contains `w-72` and `{showMakeExportEntry ? (`.

- [ ] **Step 3: Implement the minimal menu change**

Restore the menu content width:

```tsx
<DropdownMenuContent align="end" className="w-56 text-sm">
```

Change the Figma Make branch to:

```tsx
{showMakeExportEntry && !makeExportDisabledReason ? (
    <DropdownMenuItem
        onClick={handleExportMake}
        className="gap-2 h-7 text-sm"
    >
        <Download className="h-3.5 w-3.5" /> 导出 Figma Make
    </DropdownMenuItem>
) : null}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: the focused test file passes with zero failures.

- [ ] **Step 5: Run the Make admin build**

Run:

```bash
pnpm admin:build
```

Expected: both Make admin Vite builds finish successfully.

- [ ] **Step 6: Inspect only the approved behavior change**

Run:

```bash
git diff --check -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.source.test.ts
git diff -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: no whitespace errors; the relevant hunks restore `w-56`, hide disabled Figma Make, and update focused assertions while preserving unrelated working-tree changes.
