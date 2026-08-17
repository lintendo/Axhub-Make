# Optional rembg Background Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, audited `rembg` cutout route to the screenshot reconstruction skill and install a high-quality local `rembg` environment whose large files live on `/Volumes/WORK`.

**Architecture:** A small Node wrapper invokes `rembg` through argument arrays and returns structured `passed`, `failed`, or `skipped` JSON without installing anything. The skill selects key-colour removal for known flat backgrounds and `rembg` for complex backgrounds, then falls back to image generation when no local candidate passes audit.

**Tech Stack:** Node.js ESM, Vitest, pnpm workspace, Python 3.12, `rembg[cpu,cli]`, ONNX Runtime CPU, BiRefNet General.

## Global Constraints

- Keep `.agents/skills/screenshot-to-prototype` and `.claude/skills/screenshot-to-prototype` byte-for-byte mirrored.
- Do not add Python, ONNX, or `rembg` to the pnpm workspace or application runtime.
- The skill detects and invokes `rembg`; it never installs or configures the CLI or its models.
- Use `birefnet-general` as the default model for complex-background cutouts.
- Missing or failed `rembg` execution must not block the existing image-generation fallback.
- Preserve existing user changes in all touched files.

---

### Task 1: Optional rembg CLI wrapper

**Files:**
- Create: `client/.agents/skills/screenshot-to-prototype/scripts/remove-background-rembg.mjs`
- Create: `client/.claude/skills/screenshot-to-prototype/scripts/remove-background-rembg.mjs`
- Modify: `client/tests/screenshot-reconstruction-image-scripts.test.ts`
- Modify: `client/tests/screenshot-to-prototype-skill.test.ts`

**Interfaces:**
- Consumes: `--input <path>`, `--output <path>`, optional `--model <name>`.
- Produces: one JSON object with `status: 'passed' | 'failed' | 'skipped'`, `model`, input/output paths, and a stable `reason` for non-passed results.

- [ ] **Step 1: Write failing wrapper contract tests**

Add tests that run the missing command with an intentionally empty `PATH`, run a cross-platform fake `rembg` command that writes the output, and run a fake command that exits non-zero. Assert that the wrapper uses `i -m birefnet-general`, skips an unavailable CLI without creating output, and reports execution failure without attempting installation.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @axhub/make-client exec vitest run tests/screenshot-reconstruction-image-scripts.test.ts tests/screenshot-to-prototype-skill.test.ts
```

Expected: FAIL because `remove-background-rembg.mjs` is missing and the mirrored skill contract does not list it.

- [ ] **Step 3: Implement the minimal wrapper**

Use `spawnSync('rembg', ['i', '-m', model, input, output], { shell: false })`. Return `skipped/rembg-unavailable` for `ENOENT`, `failed/rembg-exit` for a non-zero exit, `failed/rembg-output-missing` when no file is produced, and `passed` otherwise. Do not call package managers, shell installers, or environment configuration commands.

- [ ] **Step 4: Mirror the script and run GREEN**

Copy the completed script content through `apply_patch` to both skill roots, then rerun the focused tests. Expected: all wrapper and mirror tests pass.

### Task 2: Scene-aware skill routing and manifest support

**Files:**
- Modify: `client/.agents/skills/screenshot-to-prototype/SKILL.md`
- Modify: `client/.claude/skills/screenshot-to-prototype/SKILL.md`
- Modify: `client/.agents/skills/screenshot-to-prototype/references/prompts.md`
- Modify: `client/.claude/skills/screenshot-to-prototype/references/prompts.md`
- Modify: `client/.agents/skills/screenshot-to-prototype/scripts/validate-reconstruction-manifest.mjs`
- Modify: `client/.claude/skills/screenshot-to-prototype/scripts/validate-reconstruction-manifest.mjs`
- Modify: `client/tests/screenshot-to-prototype-skill.test.ts`
- Modify: `client/tests/screenshot-reconstruction-workflow.test.ts`

**Interfaces:**
- Consumes: background classification `preserve`, `existing-alpha`, `known-key`, or `complex-remove`.
- Produces: audited `rembg-cutout` candidates in `reconstruction-manifest.json`.

- [ ] **Step 1: Write failing routing and validator tests**

Assert that the skill documents the four background outcomes, invokes `remove-background-rembg.mjs` only for complex removal, keeps key-colour scripts for known keys, and falls back to `ui-image-generation` after skipped/failed/audit-failed local removal. Add a canonical manifest candidate with `route: 'rembg-cutout'` and assert validation passes.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @axhub/make-client exec vitest run tests/screenshot-to-prototype-skill.test.ts tests/screenshot-reconstruction-workflow.test.ts
```

Expected: FAIL because the current skill lacks the scene-aware `rembg` route and the validator rejects `rembg-cutout`.

- [ ] **Step 3: Add the minimal skill guidance**

Update the existing workflow rather than creating a separate installation guide. Keep bbox cropping first. Route existing alpha directly to audit, preserved backgrounds to `clean-crop`, known pure keys to the current probe/key scripts, and complex backgrounds to the optional wrapper. State that unavailable or unsuccessful `rembg` is a normal fallback condition.

- [ ] **Step 4: Accept the new manifest route**

Add `rembg-cutout` to the existing `VALID_ROUTES` set. Preserve all current validation requirements, including selected-candidate audit status and asset existence.

- [ ] **Step 5: Mirror files and run GREEN**

Rerun both focused suites. Expected: all skill mirror, routing, and manifest tests pass.

### Task 3: External local rembg installation

**Files:**
- Create outside repository: `/Volumes/WORK/.tools/rembg/`
- Create outside repository: `/Volumes/WORK/.cache/rembg-models/`
- Create outside repository: `/Users/jianzhoulin/.local/bin/rembg`

**Interfaces:**
- Consumes: normal `rembg` CLI arguments.
- Produces: the installed CLI with `U2NET_HOME=/Volumes/WORK/.cache/rembg-models` unless the caller already sets it.

- [ ] **Step 1: Create a Python 3.12 environment on the external volume**

Run:

```bash
uv venv --python 3.12 /Volumes/WORK/.tools/rembg
uv pip install --python /Volumes/WORK/.tools/rembg/bin/python 'rembg[cpu,cli]==2.0.77'
```

Expected: the CLI and ONNX Runtime install under `/Volumes/WORK/.tools/rembg` without changing project dependencies.

- [ ] **Step 2: Add the lightweight launcher**

Create `/Users/jianzhoulin/.local/bin/rembg` as a POSIX launcher that defaults `U2NET_HOME` to `/Volumes/WORK/.cache/rembg-models` and executes `/Volumes/WORK/.tools/rembg/bin/rembg` with the original arguments.

- [ ] **Step 3: Verify the CLI and prefetch the full model**

Run `rembg --version`, then process a small PNG with `rembg i -m birefnet-general`. Expected: a transparent PNG is produced and the approximately 928 MiB BiRefNet model is stored under `/Volumes/WORK/.cache/rembg-models`.

### Task 4: Full verification and review

**Files:**
- Verify all files changed in Tasks 1-3.

**Interfaces:**
- Consumes: completed repository implementation and local installation.
- Produces: fresh test, diff, mirror, CLI, and model-location evidence.

- [ ] **Step 1: Run all screenshot reconstruction tests**

```bash
pnpm --filter @axhub/make-client exec vitest run tests/screenshot-to-prototype-skill.test.ts tests/screenshot-reconstruction-image-scripts.test.ts tests/screenshot-reconstruction-workflow.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run repository checks**

Run `git diff --check` and compare every mirrored skill file. Expected: no whitespace errors and byte-for-byte equality.

- [ ] **Step 3: Run a real wrapper invocation**

Invoke `remove-background-rembg.mjs` against a local PNG. Expected: JSON `status: passed`, output PNG exists, and `audit-assets.mjs` can inspect the result.

- [ ] **Step 4: Review against the design**

Confirm every requirement in `docs/superpowers/specs/2026-08-01-rembg-background-removal-design.md` is represented in code, skill guidance, tests, or local installation evidence.
