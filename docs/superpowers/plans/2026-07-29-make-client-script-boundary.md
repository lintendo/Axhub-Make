# Make Client Script Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep generated Make clients limited to runtime/build scripts plus basic theme capture, while moving Axhub-owned production tools and tests to the standalone Make repository and upgrading `@axhub/annotation` to `^1.0.17`.

**Architecture:** `client/template-manifest.json` becomes the release boundary: root client scripts are individually allowlisted, while the reusable `utils/` and `templates/` directories remain included. Repository-only tooling lives in `scripts/client-template-production/`; preview route smoke coverage lives in `scripts/regression/`. Existing tool modules stay together so their internal imports remain local, and only their default client-root resolution changes.

**Tech Stack:** Node.js ESM, pnpm workspace, Vitest/Node test runner, `fflate`, `sharp`, `subset-font`, TypeScript 5.x.

## Global Constraints

- Use pnpm only for dependency and verification commands.
- Keep React at 18.2.0.
- Keep `capture-theme-homepage.mjs` and `capture-theme-source.mjs` in the client template.
- Do not add compatibility wrappers at old client script paths.
- Do not change themes, prototypes, screenshot assets, or screenshot regression states.
- Do not publish packages or template releases.
- Preserve unrelated dirty-worktree edits; implementation commits are omitted because several target package and lock files already contain unrelated user changes.

---

### Task 1: Lock the client-template script release boundary

**Files:**
- Modify: `scripts/release-make.test.mjs`
- Modify: `client/template-manifest.json`

**Interfaces:**
- Consumes: manifest `runtime.files`, `runtime.directories`, and existing `createMakeClientTemplateZip()` behavior.
- Produces: an explicit root-script allowlist and ZIP assertions for included and excluded scripts.

- [ ] **Step 1: Write the failing source-boundary test**

Add a Node test that reads the real `client/template-manifest.json`, asserts that `runtime.directories` does not contain `scripts`, and asserts that `runtime.files` includes exactly these root scripts:

```js
const expectedClientRootScripts = [
  'scripts/build-all.js',
  'scripts/canvas-fig-sync.mjs',
  'scripts/capture-theme-homepage.mjs',
  'scripts/capture-theme-source.mjs',
  'scripts/check-app-ready.mjs',
  'scripts/chrome-export-converter.mjs',
  'scripts/scan-entries.js',
  'scripts/sync-project-metadata.d.ts',
  'scripts/sync-project-metadata.mjs',
  'scripts/sync-project-metadata.mjs.d.ts',
  'scripts/sync-vendor-if-present.mjs',
];
assert(!manifest.runtime.directories.includes('scripts'));
assert.deepEqual(
  manifest.runtime.files.filter((entry) => entry.startsWith('scripts/')).sort(),
  expectedClientRootScripts,
);
assert(manifest.runtime.directories.includes('scripts/templates'));
assert(manifest.runtime.directories.includes('scripts/utils'));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run scripts/release-make.test.mjs -t "allowlists generated-client scripts"`

Expected: FAIL because the current manifest includes the broad `scripts` directory and does not individually list root scripts.

- [ ] **Step 3: Replace the broad manifest entry with the allowlist**

Append the eleven `scripts/...` paths above to `runtime.files`, replace `"scripts"` in `runtime.directories` with `"scripts/templates"` and `"scripts/utils"`, and remove the now-obsolete font-tool `fileRules` exclusion.

- [ ] **Step 4: Strengthen the template ZIP fixture**

In the existing ZIP test, create fake allowed files for both capture tools and representative runtime scripts, plus fake repository-only/test scripts. Assert:

```js
assert(entries.includes('scripts/capture-theme-homepage.mjs'));
assert(entries.includes('scripts/capture-theme-source.mjs'));
assert(entries.includes('scripts/build-all.js'));
assert(entries.includes('scripts/utils/runtime.mjs'));
assert(!entries.includes('scripts/collect-mobile-theme-screenshots.mjs'));
assert(!entries.includes('scripts/subset-beginner-guide-fonts.mjs'));
assert(!entries.includes('scripts/capture-theme-homepage.test.mjs'));
assert(!entries.includes('scripts/smoke-preview-routes.mjs'));
```

- [ ] **Step 5: Run the release test and verify GREEN**

Run: `pnpm exec vitest run scripts/release-make.test.mjs`

Expected: PASS with all release helper tests green.

### Task 2: Move repository-owned production tools out of the client

**Files:**
- Move: `client/scripts/collect-mobile-theme-screenshots.mjs` to `scripts/client-template-production/collect-mobile-theme-screenshots.mjs`
- Move: `client/scripts/report-mobile-theme-screenshot-status.mjs` to `scripts/client-template-production/report-mobile-theme-screenshot-status.mjs`
- Move: `client/scripts/sync-mobile-theme-screenshot-wiring.mjs` to `scripts/client-template-production/sync-mobile-theme-screenshot-wiring.mjs`
- Move: `client/scripts/subset-beginner-guide-fonts.mjs` to `scripts/client-template-production/subset-beginner-guide-fonts.mjs`
- Move: `client/scripts/mobile-theme-screenshots/` to `scripts/client-template-production/mobile-theme-screenshots/`
- Move: the corresponding five `*.test.mjs` files to `scripts/client-template-production/` (including `mobile-theme-screenshots/model.test.mjs` in its module directory)
- Move: `client/scripts/capture-theme-homepage.test.mjs` and `client/scripts/capture-theme-source.test.mjs` to `scripts/client-template-production/`
- Move: `client/scripts/smoke-preview-routes.mjs` to `scripts/regression/client-preview-routes.mjs`
- Modify: `scripts/client-template-production/collect-mobile-theme-screenshots.mjs`
- Modify: `scripts/client-template-production/report-mobile-theme-screenshot-status.mjs`
- Modify: `scripts/client-template-production/sync-mobile-theme-screenshot-wiring.mjs`
- Modify: `scripts/client-template-production/subset-beginner-guide-fonts.mjs`
- Modify: both moved capture-theme tests
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `client/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `../../pnpm-lock.yaml` (the outer workspace lockfile)

**Interfaces:**
- Consumes: the unchanged client roots `client/src/themes` and `client/src/prototypes/beginner-guide`.
- Produces: repository commands `client-template:font:subset:beginner-guide`, `client-template:screenshots:collect`, `client-template:screenshots:status`, and `client-template:screenshots:wire`.

- [ ] **Step 1: Move files without compatibility wrappers**

Use patch moves so Git records the existing implementations at their new locations. Keep the `mobile-theme-screenshots/` module names and local imports unchanged.

- [ ] **Step 2: Change default client-root resolution**

In the collector, reporter, wiring tool, and font subsetter, resolve the generated-client root from the new directory with:

```js
const DEFAULT_CLIENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client',
);
```

Use `DEFAULT_CLIENT_ROOT` for `runCli()`/`DEFAULT_APP_ROOT`, and derive theme paths as `path.join(DEFAULT_CLIENT_ROOT, 'src/themes')`.

- [ ] **Step 3: Point moved capture tests at retained client scripts**

Replace their local imports with:

```js
from '../../client/scripts/capture-theme-homepage.mjs';
from '../../client/scripts/capture-theme-source.mjs';
```

- [ ] **Step 4: Move production commands and dependencies to Make**

Remove `font:subset:beginner-guide` and every `screenshots:*` command from `client/package.json`. Remove `sharp` and `subset-font` from client dev dependencies. Add the four `client-template:*` commands above to Make `package.json`, and add `sharp@^0.34.5` plus `subset-font@^2.5.0` to Make dev dependencies. Do not recreate the missing `screenshots:regress` implementation.

- [ ] **Step 5: Refresh lockfiles with pnpm**

Run from Make: `pnpm install --lockfile-only --ignore-scripts`

Run from the outer workspace: `pnpm install --lockfile-only --ignore-scripts`

Expected: `sharp`/`subset-font` resolve for Make tooling and no longer belong to the client importer.

- [ ] **Step 6: Run all migrated focused tests**

Add `scripts/client-template-production/**/*.test.mjs` to the Make root `vitest.config.ts` test include list so the migrated suites remain part of the repository's normal test discovery.

Run:

```bash
pnpm exec vitest run \
  scripts/client-template-production/collect-mobile-theme-screenshots.test.mjs \
  scripts/client-template-production/mobile-theme-screenshots/model.test.mjs \
  scripts/client-template-production/report-mobile-theme-screenshot-status.test.mjs \
  scripts/client-template-production/sync-mobile-theme-screenshot-wiring.test.mjs \
  scripts/client-template-production/subset-beginner-guide-fonts.test.mjs \
  scripts/client-template-production/capture-theme-homepage.test.mjs \
  scripts/client-template-production/capture-theme-source.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Verify live screenshot inventory without writing**

Run: `pnpm client-template:screenshots:status`

Expected first line: `Mobile theme screenshot status: 0/50 ready (150 assets)`; all regression states remain pending.

### Task 3: Upgrade the generated client annotation runtime

**Files:**
- Modify: `client/tests/annotation-demo-migration.test.ts`
- Modify: `client/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: outer workspace `pnpm-lock.yaml`

**Interfaces:**
- Consumes: npm package `@axhub/annotation@1.0.17`.
- Produces: generated-client dependency range `^1.0.17` with lockfiles resolving version `1.0.17`.

- [ ] **Step 1: Update the dependency contract test first**

Change the expected package range and lockfile assertions to:

```ts
expect(packageJson.dependencies?.['@axhub/annotation']).toBe('^1.0.17');
expect(lockfile).toContain('specifier: ^1.0.17');
expect(lockfile).toContain("'@axhub/annotation@1.0.17':");
expect(lockfile).not.toContain("'@axhub/annotation@1.0.16':");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @axhub/make-client exec vitest run tests/annotation-demo-migration.test.ts -t "annotation runtime"`

Expected: FAIL because the package and lockfiles still declare 1.0.16.

- [ ] **Step 3: Apply the compatible dependency range**

Set `client/package.json` to:

```json
"@axhub/annotation": "^1.0.17"
```

Refresh both lockfiles with the pnpm commands from Task 2.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @axhub/make-client exec vitest run tests/annotation-demo-migration.test.ts`

Expected: PASS.

### Task 4: Verify the final client boundary and build

**Files:**
- Verify all task files; do not modify unrelated files.

**Interfaces:**
- Consumes: the migrated repository scripts, explicit manifest, package metadata, and lockfiles.
- Produces: evidence that the generated client is releasable without repository-only tooling; no release is performed.

- [ ] **Step 1: Audit remaining client scripts**

Run: `rg --files client/scripts | sort`

Expected: only the eleven root runtime/theme scripts plus `scripts/templates/*` and `scripts/utils/*`; no tests or repository production tools.

- [ ] **Step 2: Re-run release and migration tests**

Run: `pnpm exec vitest run scripts/release-make.test.mjs scripts/client-template-production/*.test.mjs scripts/client-template-production/mobile-theme-screenshots/*.test.mjs`

Run: `pnpm --filter @axhub/make-client exec vitest run tests/annotation-demo-migration.test.ts`

Expected: PASS.

- [ ] **Step 3: Typecheck and build the generated client**

Run: `pnpm client:typecheck`

Run: `pnpm client:build`

Expected: both commands exit 0.

- [ ] **Step 4: Inspect dependency ownership and changed files**

Run: `pnpm why sharp subset-font`

Run: `git status --short`

Run: `git diff --check`

Expected: production tooling dependencies are owned by Make, no moved tool remains under `client/scripts/`, and the diff has no whitespace errors.
