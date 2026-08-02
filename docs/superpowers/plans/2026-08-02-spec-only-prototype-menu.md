# Spec-only Prototype Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide preview links for spec-only prototypes while enabling every valid local-directory management action, including delete.

**Architecture:** Add one pure path resolver that derives a prototype directory from an executable entry path or `.spec` path. Resource action handlers and the sidebar menu consume that resolver independently: handlers receive a concrete target path, while the menu derives separate preview and local-management capabilities.

**Tech Stack:** TypeScript 5.x, React 18.2.0, Vitest 4, pnpm workspace.

## Global Constraints

- Use pnpm for development and verification commands.
- Preserve React at 18.2.0 and TypeScript 5.x.
- Do not assume `src/prototypes`; custom project-relative prototype roots must work.
- Normalize Windows separators without constructing shell commands or guessing filesystem locations from `item.name`.
- Preserve unrelated user changes already present in the worktree and target files.
- Do not change project metadata formats, scanning behavior, or server file-operation APIs.

---

### Task 1: Resolve Prototype Local Directories

**Files:**
- Modify: `src/index/utils/localPath.ts:1-25`
- Create: `src/index/utils/localPath.test.ts`

**Interfaces:**
- Consumes: `getExplicitLocalPath(item: unknown): string` and `stripIndexFilePath(value: string): string`.
- Produces: `getPrototypeLocalBasePath(item: unknown): string` for menu and resource-action consumers.

- [ ] **Step 1: Write the failing resolver tests**

```ts
import { describe, expect, it } from 'vitest';

import { getPrototypeLocalBasePath } from './localPath';

describe('prototype local base paths', () => {
  it('prefers executable entry paths and strips cross-platform index filenames', () => {
    expect(getPrototypeLocalBasePath({ filePath: 'src/prototypes/home/index.tsx' }))
      .toBe('src/prototypes/home');
    expect(getPrototypeLocalBasePath({ absoluteFilePath: 'C:\\workspace\\src\\prototypes\\home\\index.jsx' }))
      .toBe('C:/workspace/src/prototypes/home');
  });

  it('derives spec-only prototype directories without assuming a resource root', () => {
    expect(getPrototypeLocalBasePath({ specFilePath: 'src/prototypes/home/.spec/spec.html' }))
      .toBe('src/prototypes/home');
    expect(getPrototypeLocalBasePath({ specFilePath: 'content\\prototypes\\home\\.spec\\spec.md' }))
      .toBe('content/prototypes/home');
  });

  it('rejects spec paths that do not identify a prototype directory', () => {
    expect(getPrototypeLocalBasePath({ specFilePath: 'docs/home.md' })).toBe('');
    expect(getPrototypeLocalBasePath({})).toBe('');
  });
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `pnpm exec vitest run src/index/utils/localPath.test.ts`

Expected: FAIL because `getPrototypeLocalBasePath` is not exported.

- [ ] **Step 3: Implement the minimal pure resolver**

```ts
export function getPrototypeLocalBasePath(item: unknown): string {
    const explicitPath = getExplicitLocalPath(item).replace(/\\/g, '/').trim();
    if (explicitPath) {
        return stripIndexFilePath(explicitPath).replace(/\/+$/u, '');
    }
    if (!item || typeof item !== 'object') {
        return '';
    }
    const specFilePath = String((item as { specFilePath?: unknown }).specFilePath || '')
        .replace(/\\/g, '/')
        .trim();
    const specDirectoryMarker = '/.spec/';
    const markerIndex = specFilePath.lastIndexOf(specDirectoryMarker);
    return markerIndex > 0 ? specFilePath.slice(0, markerIndex).replace(/\/+$/u, '') : '';
}
```

- [ ] **Step 4: Run the resolver test and verify GREEN**

Run: `pnpm exec vitest run src/index/utils/localPath.test.ts`

Expected: PASS with 3 tests.

---

### Task 2: Route Prototype Management Actions Through the Resolver

**Files:**
- Modify: `src/index/app/index-page/resourceActions.helpers.ts:9-23`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.tsx:1064-1210,1629-1647`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.test.ts:12-50`

**Interfaces:**
- Consumes: `getPrototypeLocalBasePath(item: unknown): string` from Task 1.
- Produces: `getPrototypeBasePathForItem(item: unknown): string`; all prototype download, rename, duplicate, delete, version, and copy-path handlers use this exact path.

- [ ] **Step 1: Add failing source-contract assertions**

Add assertions that the combined resource-actions source imports `getPrototypeLocalBasePath`, exports `getPrototypeBasePathForItem`, uses `getPrototypeBasePathForItem(item)` in each prototype handler, and passes `{ ...item, filePath: localBasePath }` to `setCurrentVersionItem`.

```ts
expect(source).toContain("import { getExplicitLocalPath, getPrototypeLocalBasePath, stripIndexFilePath } from '../../utils/localPath';");
expect(source).toContain('export function getPrototypeBasePathForItem(item: unknown): string');
expect(source.match(/getPrototypeBasePathForItem\(item\)/gu)?.length).toBeGreaterThanOrEqual(6);
expect(source).toContain('setCurrentVersionItem({ ...item, filePath: localBasePath });');
```

- [ ] **Step 2: Run the resource action tests and verify RED**

Run: `pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/index-page/resourceActions.helpers.test.ts`

Expected: FAIL because prototype handlers still use `getLocalBasePathForItem` and version management passes the unmodified item.

- [ ] **Step 3: Add the prototype-specific helper**

```ts
import { getExplicitLocalPath, getPrototypeLocalBasePath, stripIndexFilePath } from '../../utils/localPath';

export function getPrototypeBasePathForItem(item: unknown): string {
    return getPrototypeLocalBasePath(item);
}
```

- [ ] **Step 4: Update prototype handlers only**

Replace `getLocalBasePathForItem(item)` with `getPrototypeBasePathForItem(item)` in `handleDownloadItemSource`, `handleRenameItem`, `handleDuplicateItem`, `handleDeleteItem`, and `handleCopyItemPath`. Keep design ZIP handling on `getLocalBasePathForItem`.

Update version management to carry a usable path into `VersionManager`:

```ts
const handleVersionManagement = useCallback((item: ItemData) => {
    const localBasePath = getPrototypeBasePathForItem(item);
    if (!localBasePath) {
        messageApi.warning('当前资源未声明本地文件路径，无法查看版本');
        return;
    }
    setCurrentVersionItem({ ...item, filePath: localBasePath });
    setVersionDialogVisible(true);
}, [messageApi]);
```

- [ ] **Step 5: Run the resource action tests and verify GREEN**

Run: `pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/index-page/resourceActions.helpers.test.ts src/index/utils/localPath.test.ts`

Expected: PASS.

---

### Task 3: Separate Sidebar Preview and Local-Management Capabilities

**Files:**
- Modify: `src/index/components/sidebar/ContentPanel.tsx:79-85,2460-2695`
- Modify: `src/index/components/sidebar/ContentPanel.source.test.ts:1140-1195`

**Interfaces:**
- Consumes: `getPrototypeLocalBasePath(item: unknown): string` from Task 1.
- Produces: `showPrototypeAccessLinks` and `showLocalPathActions` capability booleans used by the existing menu JSX.

- [ ] **Step 1: Write the failing sidebar menu contract test**

Add a focused test that slices `renderItemActions` and asserts the separate capabilities and guarded JSX.

```ts
expect(itemActionsSource).toContain('const prototypeLocalBasePath = isPrototypeItem ? getPrototypeLocalBasePath(item) : \'\';');
expect(itemActionsSource).toContain('const showLocalPathActions = isPrototypeItem ? Boolean(prototypeLocalBasePath) : hasExplicitLocalPath(item);');
expect(itemActionsSource).toContain('const showPrototypeAccessLinks = isPrototypeItem && item.previewDisabled !== true && hasShareUrl;');
expect(itemActionsSource).toContain('{showPrototypeAccessLinks ? (');
expect(itemActionsSource).not.toContain('{isPrototypeItem ? (\n                    <DropdownMenuSub>');
expect(itemActionsSource).toContain('{canDeleteItem ? (\n                    <>\n                        <DropdownMenuSeparator />');
```

- [ ] **Step 2: Run the sidebar source test and verify RED**

Run: `pnpm exec vitest run src/index/components/sidebar/ContentPanel.source.test.ts`

Expected: FAIL because access links are unconditional for prototypes and local operations require an explicit entry path.

- [ ] **Step 3: Implement capability-based menu rendering**

Import `getPrototypeLocalBasePath` and calculate:

```ts
const prototypeLocalBasePath = isPrototypeItem ? getPrototypeLocalBasePath(item) : '';
const showLocalPathActions = isPrototypeItem ? Boolean(prototypeLocalBasePath) : hasExplicitLocalPath(item);
const showPrototypeAccessLinks = isPrototypeItem && item.previewDisabled !== true && hasShareUrl;
```

Guard the full access-link submenu with `showPrototypeAccessLinks`. Keep LAN link generation inside that submenu. Wrap the final separator together with the delete item so no trailing separator renders when deletion is unavailable.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm exec vitest run src/index/components/sidebar/ContentPanel.source.test.ts src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/index-page/resourceActions.helpers.test.ts src/index/utils/localPath.test.ts`

Expected: PASS.

- [ ] **Step 5: Run final verification**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`

Expected: exit code 0.

Run: `pnpm admin:build`

Expected: Vite Admin build completes successfully.

Run: `git diff --check -- src/index/utils/localPath.ts src/index/utils/localPath.test.ts src/index/app/index-page/resourceActions.helpers.ts src/index/app/index-page/useIndexPageResourceActions.tsx src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/components/sidebar/ContentPanel.tsx src/index/components/sidebar/ContentPanel.source.test.ts`

Expected: no whitespace errors.

Because several target files contain pre-existing user changes, do not stage or commit implementation files unless their unrelated hunks can be excluded exactly.
