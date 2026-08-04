# Publish Menu Disabled-Reason Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a disabled Figma Make export reason from overlapping later publish-menu sections while keeping the reason visible and readable.

**Architecture:** Keep export availability and menu behavior unchanged. Restructure only the Figma Make menu item's presentation so its primary label and optional secondary reason occupy separate lines in an auto-height row, and give this specific menu a viewport-bounded 288px width.

**Tech Stack:** React 18.2, TypeScript 5.x, Radix Dropdown Menu, Tailwind CSS, Vitest source regression tests.

## Global Constraints

- Use `pnpm` for repository development and verification commands.
- Preserve the current disabled behavior and action handlers.
- Do not change shared dropdown primitives, export-availability rules, backend export behavior, other menu entries, or section ordering.
- Preserve unrelated uncommitted changes in `PresentationToolbar.tsx` and its source test.

---

### Task 1: Make the Figma Make Disabled State Self-Sizing

**Files:**
- Modify: `src/index/components/content/PresentationToolbar.source.test.ts`
- Modify: `src/index/components/content/PresentationToolbar.tsx:1362-1384`

**Interfaces:**
- Consumes: the existing `makeExportDisabledReason: string` and `handleExportMake: () => void` values.
- Produces: the same Radix menu action semantics with a separate visible disabled-reason element.

- [ ] **Step 1: Write the failing source regression test**

Add a focused test that extracts the export menu and requires the new width, separate label, separate reason, viewport bound, and auto-height item:

```ts
it('keeps long Figma Make disabled reasons inside an auto-height menu item', () => {
  const source = readSource();
  const exportMenuSegment = getSourceSegment(
    source,
    '<DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)] text-sm">',
    '<DropdownMenuSeparator />',
  );

  expect(exportMenuSegment).toContain('<span className="block whitespace-nowrap leading-5">导出 Figma Make</span>');
  expect(exportMenuSegment).toContain('{makeExportDisabledReason ? (');
  expect(exportMenuSegment).toContain('{makeExportDisabledReason}');
  expect(exportMenuSegment).toContain('whitespace-normal text-[11px] leading-4');
  expect(exportMenuSegment).toContain('shrink-0');
  expect(exportMenuSegment).not.toContain('h-7');
  expect(exportMenuSegment).not.toContain('`导出 Figma Make（${makeExportDisabledReason}）`');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: FAIL because the current menu still uses `w-56`, a fixed `h-7`, and an interpolated label.

- [ ] **Step 3: Implement the minimal layout change**

Change the publish-menu content width and only the Figma Make item markup:

```tsx
<DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)] text-sm">
```

```tsx
<DropdownMenuItem
    onClick={handleExportMake}
    disabled={Boolean(makeExportDisabledReason)}
    title={makeExportDisabledReason}
    className={cn(
        "items-start gap-2 py-1.5 text-sm",
        makeExportDisabledReason && "data-[disabled]:opacity-100 text-muted-foreground",
    )}
>
    <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap leading-5">导出 Figma Make</span>
        {makeExportDisabledReason ? (
            <span className="mt-0.5 block whitespace-normal text-[11px] leading-4 text-muted-foreground">
                {makeExportDisabledReason}
            </span>
        ) : null}
    </span>
</DropdownMenuItem>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: the focused test file passes.

- [ ] **Step 5: Run type/build verification**

Run:

```bash
pnpm admin:build
```

Expected: both Vite admin builds complete successfully.

- [ ] **Step 6: Verify the menu visually**

Start the admin dev server with `pnpm admin:dev`, open the existing project state that produces a missing Figma Make metadata reason, and inspect the publish menu at a desktop viewport and a narrow viewport. Confirm the action name stays on one line, the reason wraps within its own row, the Axure heading starts below it, and the menu remains inside the viewport.

- [ ] **Step 7: Review the final diff**

Run:

```bash
git diff --check -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.source.test.ts
git diff -- src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.source.test.ts
```

Expected: no whitespace errors and no changes outside the approved menu layout and focused regression coverage.
