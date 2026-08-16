# Client Template 0.1.19 Release Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one clean, reproducible Axhub Make Client Template `0.1.19` candidate containing the complete Design Knowledge search skill, the immutable 223-theme snapshot, safe theme installation, and release-package validation.

**Architecture:** Build from Make `origin/main` in `codex/release-client-0.1.19`; import only client-release content with explicit source evidence. The candidate consumes the verified `2026-08-14.2` schema-v1 publication because it is the currently available faithful 223-package source; the incompatible `2026-08-13.3` schema-v2 branch is recorded as deferred. Local theme implementations may remain development sources, but the template manifest excludes all `src/themes/**` payloads and includes only the bundled search snapshot plus online package installation.

**Tech Stack:** pnpm 10.20.0, Node.js ESM, TypeScript 5.x, Vitest 4, tar-stream 3.1.7, ZIP release helpers.

**Spec:** `docs/superpowers/specs/2026-08-13-axhub-make-0.6.20-beta-release-design.md`

## Global Constraints

- Client Template version is exactly `0.1.19`; Make itself is not published by this plan.
- React and React DOM remain on the existing 18.2.0 contract.
- The bundled snapshot is immutable `2026-08-14.2`, with 123 desktop and 100 mobile records.
- Search is local-first and must not fetch during ranking; package installation uses immutable primary then pinned Gitee fallback URLs.
- Archive paths, file types, counts, and SHA-256 values are validated before install; failure leaves no partial theme directory.
- The template ZIP contains no `src/themes/**`, package archives, `.local`, test files, local absolute paths, or runtime metadata.
- Existing branches, worktrees, indexes, and untracked files remain untouched.
- Codex prepares and verifies artifacts but does not publish GitHub/Gitee releases or push protected branches.

---

### Task 1: Freeze client-release scope and source evidence

**Files:**
- Create (ignored evidence): `.local/release/0.6.20/client-template-0.1.19/scope-ledger.json`
- Create (ignored evidence): `.local/release/0.6.20/client-template-0.1.19/source-hashes.json`
- Modify: `docs/superpowers/plans/2026-08-16-client-template-0.1.19-release-integration.md`

**Interfaces:**
- Consumes: Make `origin/main@bc10e311`, current dirty checkout client-search files, `codex/design-knowledge-public-index-contract-make@a620caca`, and root theme publication branch `codex/publish-223-theme-packages@1167ef93`.
- Produces: one disposition per discovered client-affecting work item and SHA-256 evidence for every imported untracked file.

- [x] **Step 1: Record release dispositions**

Write JSON entries with exact `source`, `paths`, and `disposition` values. Mark the `2026-08-14.2` schema-v1 skill/snapshot, template boundary, release validation, and version bump as `included`; mark the older schema-v2 snapshot/reader as `deferred-incompatible-contract`; mark build outputs and generated `.js/.d.ts` files as `generated`; mark unrelated prototypes, admin/server work, and other dirty-worktree differences as `deferred`.

- [x] **Step 2: Hash imported source files**

Run a deterministic Node script over the sorted relative paths for both search-skill mirrors, `client/design-knowledge/**`, and the three focused tests. Write `{ path, sha256 }` records to `source-hashes.json` without storing absolute paths.

- [x] **Step 3: Verify evidence is ignored**

Run: `git check-ignore -v .local/release/0.6.20/client-template-0.1.19/scope-ledger.json`

Expected: the file is ignored and `git status --short` shows only this tracked plan.

- [x] **Step 4: Commit the reviewed plan**

Run:

```bash
git add docs/superpowers/plans/2026-08-16-client-template-0.1.19-release-integration.md
git commit -m "docs: plan client template 0.1.19 release"
```

### Task 2: Import the immutable snapshot and mirrored search skill with focused tests

**Files:**
- Create: `client/.agents/skills/search-design-system/**`
- Create: `client/.claude/skills/search-design-system/**`
- Create: `client/design-knowledge/manifest.json`
- Create: `client/design-knowledge/indexes/{desktop,mobile}.json`
- Create: `client/design-knowledge/design-md/*.md`
- Create: `client/tests/design-knowledge-snapshot.test.ts`
- Create: `client/tests/search-design-system-install.test.ts`
- Modify: `client/tests/client-skill-mirroring.test.ts`

**Interfaces:**
- Consumes: schema-v1 snapshot manifest fields `indexes`, `designMd`, and `packageSources`, plus per-record `artifacts` and `remoteArtifacts` package metadata.
- Produces: `searchDesignSystems(request, options)` for local ranking and `installTheme(request, options)` for verified immutable package installation.

- [ ] **Step 1: Import tests only**

Bring the current snapshot, installer, and mirroring tests into the candidate without importing implementation files.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --dir client exec vitest --run tests/design-knowledge-snapshot.test.ts tests/search-design-system-install.test.ts tests/client-skill-mirroring.test.ts
```

Expected: FAIL because the snapshot and `search-design-system` modules do not exist in the candidate.

- [ ] **Step 3: Import implementation and generated snapshot**

Copy the two mirrored skill trees and immutable `client/design-knowledge/**` tree from the hashed source set. Preserve byte identity between `.agents` and `.claude`; do not import packages, archives, cache files, or `.local` data.

- [ ] **Step 4: Verify snapshot structure independently**

Check that the manifest version is `2026-08-14.2`, counts are 123/100/223, every ID is unique, every local DESIGN.md exists and matches its hash, and every package path/hash is present.

- [ ] **Step 5: Verify GREEN**

Run the command from Step 2.

Expected: all snapshot, installation, and mirroring tests pass.

- [ ] **Step 6: Commit the feature closure**

Run:

```bash
git add client/.agents/skills/search-design-system client/.claude/skills/search-design-system client/design-knowledge client/tests/design-knowledge-snapshot.test.ts client/tests/search-design-system-install.test.ts client/tests/client-skill-mirroring.test.ts
git commit -m "feat: bundle design knowledge search in client 0.1.19"
```

### Task 3: Enforce the client-template payload boundary

**Files:**
- Modify: `client/template-manifest.json`
- Modify: `client/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/release-make.mjs`
- Modify: `scripts/release-make.test.mjs`

**Interfaces:**
- Consumes: the immutable snapshot from Task 2 and existing template manifest assembly.
- Produces: `validateDesignKnowledgeSnapshot(sourceClientDir)` and a ZIP containing the snapshot/skills but no local themes or archives.

- [ ] **Step 1: Add failing release-helper assertions**

Add assertions that the template manifest includes `design-knowledge`, excludes all `src/themes/**`, allowlists only runtime scripts, and that ZIP assembly includes the manifest, both indexes, one representative DESIGN.md, and both skill mirrors while excluding `.tgz`, `.zip`, `.local`, tests, and every local theme.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/release-make.test.mjs`

Expected: FAIL because the baseline manifest and release helper do not include or validate the snapshot.

- [ ] **Step 3: Implement minimal packaging support**

Add exact `tar-stream: 3.1.7`, update the lockfile with pnpm, add `design-knowledge` to runtime directories, exclude archive/local paths and all themes, and validate manifest/index/design counts, safe relative paths, regular files, unique IDs, and SHA-256 hashes before ZIP assembly.

- [ ] **Step 4: Verify GREEN**

Run: `node --test scripts/release-make.test.mjs`

Expected: all release-helper tests pass.

- [ ] **Step 5: Commit packaging closure**

Run:

```bash
git add client/template-manifest.json client/package.json pnpm-lock.yaml scripts/release-make.mjs scripts/release-make.test.mjs
git commit -m "fix: validate design knowledge in client template archives"
```

### Task 4: Set the 0.1.19 release identity and notes

**Files:**
- Modify: `client/package.json`
- Modify: `client/RELEASE_NOTES.md`
- Modify: `src/common/makeClientTemplate.ts`
- Modify: `scripts/release-make.test.mjs`

**Interfaces:**
- Consumes: the exact payload accepted by Tasks 2 and 3.
- Produces: consistent `0.1.19` identity in package metadata, runtime defaults, latest manifest generation, and human review notes.

- [ ] **Step 1: Change release identity assertions to 0.1.19**

Assert that `client/package.json`, `DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION`, and the release-notes heading all equal `0.1.19`, and that notes mention local Design Knowledge search, 223 bundled DESIGN.md documents, verified primary/fallback package installation, and the no-local-theme payload boundary.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/release-make.test.mjs`

Expected: FAIL with the existing `0.1.18` values.

- [ ] **Step 3: Update version and release notes**

Set all version/default fields to `0.1.19`. Keep notes limited to files and behavior in the assembled ZIP; do not claim Gitee publication before the human mirror gate succeeds.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test scripts/release-make.test.mjs`

Then run:

```bash
git add client/package.json client/RELEASE_NOTES.md src/common/makeClientTemplate.ts scripts/release-make.test.mjs
git commit -m "chore: prepare client template 0.1.19"
```

### Task 5: Reconcile baseline client regressions without importing unrelated dirty work

**Files:**
- Modify only the source/test pairs named by reproducible failures under `client/`.

**Interfaces:**
- Consumes: the seven known `origin/main` baseline failures and any failures introduced by Tasks 2-4.
- Produces: a green full client unit suite with each fix tied to one failing assertion and one candidate-only commit.

- [ ] **Step 1: Re-run the full suite and classify failures**

Run: `pnpm --dir client test:run`

Record each failure as baseline-stale assertion, required candidate content, or candidate regression. Do not import whole files from dirty worktrees when a narrow source/test reconciliation is sufficient.

- [ ] **Step 2: Resolve one root cause at a time using RED/GREEN**

For every accepted fix, first reproduce the individual failing test, state the mismatched source fact, apply the smallest source-or-expectation correction, then rerun that file before proceeding. Existing baseline facts include annotation `^1.0.18`, current guidance text, and intentionally removed HTML review fixtures; tests must describe the payload actually retained by the candidate.

- [ ] **Step 3: Run full client tests and typecheck**

Run:

```bash
pnpm --dir client test:run
pnpm --dir client typecheck
```

Expected: both commands exit 0.

- [ ] **Step 4: Commit each independently reviewable reconciliation**

Use a focused `fix:` commit per root cause; do not combine generated outputs or unrelated server/admin changes.

### Task 6: Build, package, compare, and prepare the human gate

**Files:**
- Create (ignored): `.local/release/0.6.20/client-template-0.1.19/**`
- Modify only if a verification test exposes a root cause covered by this plan.

**Interfaces:**
- Consumes: clean candidate commits from Tasks 1-5.
- Produces: ZIP, latest manifest, SHA-256, entry inventory, 0.1.18 path/content comparison, release notes, and exact GitHub/Gitee commands for human execution.

- [ ] **Step 1: Run affected integration verification**

Run:

```bash
pnpm --dir client test:run
pnpm --dir client typecheck
pnpm --dir client build
node --test scripts/release-make.test.mjs scripts/release-make-mirror-gitee.test.mjs
```

Expected: every command exits 0.

- [ ] **Step 2: Prepare template artifacts only**

Run: `pnpm release:make-client-template:prepare`

Expected: artifact creation stops before any GitHub/Gitee mutation.

- [ ] **Step 3: Inspect artifact contents and hashes**

Verify version `0.1.19`, 223 DESIGN.md files, 2 indexes, both search-skill mirrors, zero themes, zero archives, zero `.local` paths, zero tests, no secrets/local paths, and consistency between the ZIP hash and latest manifest.

- [ ] **Step 4: Verify immutable primary source and record fallback gate**

Download every primary package declared by the bundled indexes, verify all 223 hashes, and record the pinned Gitee checks. If Gitee is not yet published, mark the release `blocked-awaiting-human-mirror-publication`; do not rewrite the fallback to a moving branch.

- [ ] **Step 5: Run independent review**

Review the full candidate diff against this plan and the release design. Reject completion for missing source dispositions, untracked candidate files, red verification, version drift, or claims not represented in the ZIP.

- [ ] **Step 6: Freeze the candidate**

Require `git status --short` to be empty, record the final commit ID and artifact hashes in ignored evidence, and hand the human maintainer the exact publication commands without executing them.
