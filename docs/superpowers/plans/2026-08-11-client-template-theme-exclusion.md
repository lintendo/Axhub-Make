# Client Template Theme Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back up all currently present client themes outside the client directory and make the template resource manifest exclude every theme from future client template ZIP files.

**Architecture:** Keep the existing schema-1 manifest and publishing implementation. Add a catch-all `exclude` rule under `themes.idRules`, retain an empty `client/src/themes/` root for the current assembler contract, and verify both the rule and a real assembled ZIP. Move the current directory byte-for-byte into the ignored `apps/axhub-make/.local/` backup rather than deleting it.

**Tech Stack:** Node.js 20+, ESM, `node:test`, `fflate`, pnpm, JSON template manifest, Git.

## Global Constraints

- Use pnpm; do not use npm or yarn.
- Preserve all unrelated dirty-worktree changes.
- Preserve the existing unrelated changes in `client/template-manifest.json` and `scripts/release-make.test.mjs`.
- Do not restore themes that were already deleted before this task.
- Do not change `client/dist/` or live `.axhub/make/` metadata.
- Do not publish, push, or create a PR.
- The backup target is exactly `apps/axhub-make/.local/client-themes-backup-20260811/src-themes/` and must not already exist before the move.

---

## File Structure

- Create: `scripts/client-template-theme-exclusion.test.mjs` — isolated contract test for the repository template manifest.
- Modify: `client/template-manifest.json` — add one catch-all theme exclusion rule without rewriting other manifest entries.
- Move: `client/src/themes/` → `.local/client-themes-backup-20260811/src-themes/` — preserve the current theme bytes outside the client.
- Create: `client/src/themes/.gitkeep` — retain the empty root required by the existing template assembler.
- Create during verification only: `.local/client-template-theme-exclusion-verification/axhub-make-client-template.zip` — ignored disposable assembled ZIP.

### Task 1: Lock the manifest exclusion contract

**Files:**
- Create: `scripts/client-template-theme-exclusion.test.mjs`
- Read: `client/template-manifest.json`

**Interfaces:**
- Consumes: schema-1 `themes.idRules`, whose entries contain `action`, `pattern`, and `description`.
- Produces: a regression contract requiring every representative valid theme id to match an `exclude` rule.

- [x] **Step 1: Write the failing test**

```js
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import assert from 'node:assert/strict';

it('excludes every local theme from the published client template', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve('client/template-manifest.json'), 'utf8'),
  );
  const exclusions = manifest.themes.idRules
    .filter(({ action }) => action === 'exclude')
    .map(({ pattern }) => new RegExp(pattern, 'u'));

  for (const themeId of ['example', 'chatgpt-mobile', 'future-theme-2026']) {
    assert(
      exclusions.some((pattern) => pattern.test(themeId)),
      `${themeId} must be excluded from the published client template`,
    );
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec node --test scripts/client-template-theme-exclusion.test.mjs
```

Expected: FAIL because the existing `^(?:trae|whop)$` exclusion does not match `example`.

- [x] **Step 3: Checkpoint the failing test without staging unrelated changes**

Run:

```bash
git diff --check -- scripts/client-template-theme-exclusion.test.mjs
git status --short -- scripts/client-template-theme-exclusion.test.mjs client/template-manifest.json
```

Expected: the new test is untracked and the pre-existing manifest modification remains visible. Do not stage or commit implementation files in this dirty worktree unless the user requests it.

### Task 2: Exclude themes and move their source to the ignored backup

**Files:**
- Modify: `client/template-manifest.json`
- Move: `client/src/themes/`
- Create: `client/src/themes/.gitkeep`

**Interfaces:**
- Consumes: `themes.idRules` through `compileTemplateManifestRules()` in `scripts/release-make.mjs`.
- Produces: an exclusion rule matching every non-empty theme directory name and an empty source root.

- [x] **Step 1: Add the minimal catch-all exclusion rule**

Append this object to `client/template-manifest.json` under `themes.idRules`, preserving all existing content and formatting:

```json
{
  "action": "exclude",
  "pattern": "^.+$",
  "description": "客户端模板不再内置本地主题，主题由在线设计系统按主源、备用源顺序提供。"
}
```

- [x] **Step 2: Run the focused test to verify the manifest rule passes**

Run:

```bash
pnpm exec node --test scripts/client-template-theme-exclusion.test.mjs
```

Expected: PASS, one test and zero failures.

- [x] **Step 3: Validate the exact move targets and record the source inventory**

Run from `apps/axhub-make`:

```bash
test -d '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/client/src/themes'
test ! -e '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/.local/client-themes-backup-20260811/src-themes'
find '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/client/src/themes' -type f | wc -l
du -sk '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/client/src/themes'
```

Expected: the source exists, the backup target does not, and the inventory reports the current file count and size.

- [x] **Step 4: Move the current directory into the ignored backup**

Run with explicit validated paths:

```bash
mkdir -p '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/.local/client-themes-backup-20260811'
mv '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/client/src/themes' '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/.local/client-themes-backup-20260811/src-themes'
mkdir -p '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/client/src/themes'
```

Expected: the backup contains the former complete `themes` directory and the client theme root is empty.

- [x] **Step 5: Add the root placeholder**

Create the empty file `client/src/themes/.gitkeep` with `apply_patch`. Do not copy any theme directory back into the client.

- [x] **Step 6: Verify the move is complete and recoverable**

Run:

```bash
find '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/.local/client-themes-backup-20260811/src-themes' -type f | wc -l
du -sk '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/.local/client-themes-backup-20260811/src-themes'
find '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/client/src/themes' -mindepth 1 -maxdepth 1 -print
git check-ignore -v '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/.local/client-themes-backup-20260811/src-themes'
```

Expected: backup count and size match Step 3; the client root prints only `.gitkeep`; Git reports the backup as ignored.

### Task 3: Verify a real template ZIP has no local themes

**Files:**
- Test: `scripts/client-template-theme-exclusion.test.mjs`
- Read: `client/template-manifest.json`
- Read: `client/template-seed/.axhub/make/sidebar-tree.json`
- Generate ignored artifact: `.local/client-template-theme-exclusion-verification/axhub-make-client-template.zip`

**Interfaces:**
- Consumes: `createMakeClientTemplateZip({ sourceClientDir, outputDir })` and `listZipEntries(zipPath)` from `scripts/release-make.mjs`.
- Produces: verification evidence that the actual repository client template has no theme payload or theme navigation entries.

- [x] **Step 1: Run the existing release suite and the new contract test**

Run:

```bash
pnpm exec node --test scripts/release-make.test.mjs scripts/client-template-theme-exclusion.test.mjs
```

Expected: all tests pass with zero failures.

Observed in the dirty worktree: the theme contract and package-assembly tests passed. The full file reported one unrelated pre-existing failure because `src/server/__tests__/agent-open-api.test.ts` contains a `C:\\Users\\demo\\...` fixture caught by the repository-wide local-path scanner; this task does not modify that file.

- [x] **Step 2: Assemble the real client template into the ignored verification directory**

Run:

```bash
AXHUB_MAKE_RELEASE_SKIP_MAIN=1 pnpm exec node --input-type=module -e "import path from 'node:path'; import { createMakeClientTemplateZip, listZipEntries } from './scripts/release-make.mjs'; const outputDir = path.resolve('.local/client-template-theme-exclusion-verification'); const result = createMakeClientTemplateZip({ sourceClientDir: path.resolve('client'), outputDir }); const themeEntries = listZipEntries(result.path).filter((entry) => entry.startsWith('src/themes/')); if (themeEntries.length > 0) throw new Error('Unexpected packaged themes: ' + themeEntries.join(', ')); console.log(JSON.stringify({ zipPath: result.path, themeEntries: themeEntries.length }));"
```

Expected: JSON reports `"themeEntries":0`.

- [x] **Step 3: Inspect the packaged sidebar theme collections**

Run:

```bash
pnpm exec node --input-type=module -e "import fs from 'node:fs'; import path from 'node:path'; import { unzipSync } from 'fflate'; const zipPath = path.resolve('.local/client-template-theme-exclusion-verification/axhub-make-client-template.zip'); const files = unzipSync(new Uint8Array(fs.readFileSync(zipPath))); const sidebar = JSON.parse(Buffer.from(files['.axhub/make/sidebar-tree.json']).toString('utf8')); if ((sidebar.themes || []).length || (sidebar.themesTree || []).length) throw new Error('Packaged sidebar still contains themes'); console.log(JSON.stringify({ themes: (sidebar.themes || []).length, themesTree: (sidebar.themesTree || []).length }));"
```

Expected: JSON reports both values as `0`.

- [x] **Step 4: Review only task-scoped diffs and whitespace**

Run:

```bash
git diff --check -- client/template-manifest.json scripts/client-template-theme-exclusion.test.mjs client/src/themes
git status --short -- client/template-manifest.json scripts/client-template-theme-exclusion.test.mjs client/src/themes
```

Expected: no whitespace errors; the manifest, new test, `.gitkeep`, and theme removals are visible. Leave implementation changes uncommitted so existing user changes in overlapping paths are not captured without explicit authorization.
