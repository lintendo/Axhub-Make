# Remove Triple Ampersand Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the test-only `triple-ampersand-operator` skill from client template source and keep it out of future release archives.

**Architecture:** The two mirrored skill directories are removed at source. The existing `client/template-manifest.json` runtime exclusion mechanism provides a defense-in-depth packaging rule, while `scripts/release-make.test.mjs` verifies both the source cleanup and the production manifest rule.

**Tech Stack:** Node.js, ECMAScript modules, `node:test`, pnpm

## Global Constraints

- Preserve every unrelated staged and unstaged worktree change.
- Do not modify any other client skill.
- Do not publish a client template release.
- Do not add dependencies.

---

### Task 1: Remove And Exclude The Test Skill

**Files:**
- Modify: `scripts/release-make.test.mjs`
- Modify: `client/template-manifest.json`
- Delete: `client/.agents/skills/triple-ampersand-operator/SKILL.md`
- Delete: `client/.agents/skills/triple-ampersand-operator/agents/openai.yaml`
- Delete: `client/.claude/skills/triple-ampersand-operator/SKILL.md`
- Delete: `client/.claude/skills/triple-ampersand-operator/agents/openai.yaml`

**Interfaces:**
- Consumes: `client/template-manifest.json` runtime `fileRules` exclusion patterns.
- Produces: a client template source and release policy with no `triple-ampersand-operator` skill.

- [ ] **Step 1: Add the failing source and manifest regression test**

Add a focused `node:test` case that loads the production template manifest, verifies an exclusion rule matches both mirrored skill paths, and verifies neither source directory exists.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test --test-name-pattern='does not publish the triple ampersand test skill' scripts/release-make.test.mjs
```

Expected: FAIL because the production manifest has no matching exclusion and both source directories still exist.

- [ ] **Step 3: Apply the minimal source and manifest cleanup**

Add this runtime exclusion after the existing `prototype-comments` exclusion:

```json
{
  "action": "exclude",
  "pattern": "^\\.(?:agents|claude)/skills/triple-ampersand-operator(?:/|$)",
  "description": "测试用 triple-ampersand-operator 不进入发布模板。"
}
```

Delete the four files listed above, leaving both mirrored skill directories absent.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command.

Expected: the focused test passes.

- [ ] **Step 5: Run release and diff verification**

```bash
node --test scripts/release-make.test.mjs
git diff --check -- client/template-manifest.json scripts/release-make.test.mjs client/.agents/skills/triple-ampersand-operator client/.claude/skills/triple-ampersand-operator
git status --short -- client/template-manifest.json scripts/release-make.test.mjs client/.agents/skills/triple-ampersand-operator client/.claude/skills/triple-ampersand-operator
```

Expected: all release-helper tests pass, `git diff --check` exits 0, the manifest and test are modified, and the four skill files are deleted.
