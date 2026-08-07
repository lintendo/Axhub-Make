# Remove Standalone Admin Dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone `admin:dev` command and migrate browser-verification instructions to the integrated Make development server.

**Architecture:** Treat `server:dev` as the only supported management UI development entry point. Lock the command surface with a focused manifest contract test, update developer-facing instructions, and terminate only the currently verified standalone process tree.

**Tech Stack:** pnpm workspace, Node.js, TypeScript 5.x, Vitest 4, Vite 5.

## Global Constraints

- Keep `admin:build` unchanged.
- Do not retain an `admin:dev` compatibility alias.
- Use pnpm, not npm or yarn.
- Preserve all unrelated tracked and untracked worktree changes.
- Do not modify Make client preview commands, runtime port selection, port-occupancy logic, or the Vite development redirect plugin.
- Do not start a replacement long-running server automatically.
- Leave overlapping implementation files unstaged so existing user changes are not committed accidentally.

---

### Task 1: Remove the Standalone Package Script

**Files:**
- Create: `src/server/__tests__/development-entrypoints.test.ts`
- Modify: `package.json:44`

**Interfaces:**
- Consumes: the real `apps/axhub-make/package.json` manifest.
- Produces: a package-script contract where `scripts['server:dev']` exists, `scripts['admin:dev']` is absent, and `scripts['admin:build']` remains available.

- [ ] **Step 1: Write the failing package-script contract test**

Create `src/server/__tests__/development-entrypoints.test.ts` with:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Make development entry points', () => {
  it('exposes only the integrated management development server', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));

    expect(packageJson.scripts?.['server:dev']).toContain('src/server/cli.ts -- --dev');
    expect(packageJson.scripts).not.toHaveProperty('admin:dev');
    expect(packageJson.scripts?.['admin:build']).toContain('vite build');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/development-entrypoints.test.ts
```

Expected: FAIL on `expect(packageJson.scripts).not.toHaveProperty('admin:dev')` because the real manifest still contains the standalone script.

- [ ] **Step 3: Remove only the standalone script**

Delete this one property from `package.json`:

```json
"admin:dev": "pnpm vendor:sync && vite",
```

Do not reorder or rewrite any other manifest fields.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/development-entrypoints.test.ts
```

Expected: one test file passes with one passing test and zero failures.

---

### Task 2: Migrate Developer and Browser-Verification Instructions

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-01-start-guide-ai-setup-and-card-copy.md`
- Modify: `docs/superpowers/plans/2026-08-02-responsive-sidebar-device-preview-url.md`
- Modify: `docs/superpowers/plans/2026-08-04-ai-purpose-settings.md`
- Modify: `docs/superpowers/plans/2026-08-04-publish-menu-disabled-reason-layout.md`
- Modify: `docs/superpowers/plans/2026-08-04-start-guide-responsive-layout.md`
- Modify: `docs/superpowers/plans/2026-08-07-annotation-sidebar-manual-override.md`

**Interfaces:**
- Consumes: the integrated `server:dev` package script from Task 1.
- Produces: repository instructions that start `pnpm server:dev -- --host 127.0.0.1 --no-open` for management UI browser verification and contain no `admin:dev` command.

- [ ] **Step 1: Add app-level development guidance**

After the `直接启动` section in `README.md`, add:

````markdown
## 本地开发

管理端页面、服务端 API 和运行时注入必须通过完整开发服务器一起启动：

```bash
pnpm server:dev -- --host 127.0.0.1 --no-open
```

不要直接启动 Vite，也不要为浏览器验证创建独立的管理端前端服务；独立前端缺少 Make 服务端 API 和运行时注入，并会占用管理端口。
````

- [ ] **Step 2: Replace every obsolete plan command**

In each listed plan, replace `pnpm admin:dev`, `pnpm admin:dev --host 127.0.0.1`, or `pnpm run admin:dev` with:

```bash
pnpm server:dev -- --host 127.0.0.1 --no-open
```

Where the command is inline prose, keep it inline with backticks. Remove wording that instructs the agent to select a free port; the integrated Make server owns its configured management port.

- [ ] **Step 3: Verify no obsolete instruction remains**

Run:

```bash
rg -n 'pnpm (run )?admin:dev|pnpm exec vite|pnpm vite' README.md package.json docs/superpowers/plans/2026-08-01-start-guide-ai-setup-and-card-copy.md docs/superpowers/plans/2026-08-02-responsive-sidebar-device-preview-url.md docs/superpowers/plans/2026-08-04-ai-purpose-settings.md docs/superpowers/plans/2026-08-04-publish-menu-disabled-reason-layout.md docs/superpowers/plans/2026-08-04-start-guide-responsive-layout.md docs/superpowers/plans/2026-08-07-annotation-sidebar-manual-override.md
```

Expected: no matches.

---

### Task 3: Stop the Verified Standalone Process and Run Final Checks

**Files:**
- Verify: `package.json`
- Verify: `README.md`
- Verify: `src/server/__tests__/development-entrypoints.test.ts`
- Verify: the six migrated plan documents from Task 2.

**Interfaces:**
- Consumes: the live process identities for the existing `admin:dev` process tree.
- Produces: no Vite listener from that removed command on `127.0.0.1:53817`.

- [ ] **Step 1: Revalidate the exact live process tree**

Run:

```bash
lsof -nP -iTCP:53817 -sTCP:LISTEN
ps -o pid=,ppid=,user=,lstart=,tty=,command= -p 60766,60781,61016
lsof -a -p 61016 -d cwd
```

Proceed only if PID `60766` is still `pnpm admin:dev --host 127.0.0.1`, PID `60781` is its shell child, PID `61016` is the Vite child listening on `127.0.0.1:53817`, and the Vite working directory is `apps/axhub-make`. If any identity differs, do not send a signal to that PID.

- [ ] **Step 2: Terminate only the validated process tree**

Run:

```bash
kill -TERM 61016 60781 60766
```

Wait for command completion through the owning terminal state; do not use a fixed sleep.

- [ ] **Step 3: Verify process cleanup**

Run:

```bash
lsof -nP -iTCP:53817 -sTCP:LISTEN || true
ps -o pid=,ppid=,command= -p 60766,60781,61016
```

Expected: none of the three process identities remain and no standalone Vite listener from this tree owns port `53817`.

- [ ] **Step 4: Run fresh final verification**

Run:

```bash
pnpm exec vitest run src/server/__tests__/development-entrypoints.test.ts
node -e 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8"))'
git diff --check -- package.json README.md src/server/__tests__/development-entrypoints.test.ts docs/superpowers/plans/2026-08-01-start-guide-ai-setup-and-card-copy.md docs/superpowers/plans/2026-08-02-responsive-sidebar-device-preview-url.md docs/superpowers/plans/2026-08-04-ai-purpose-settings.md docs/superpowers/plans/2026-08-04-publish-menu-disabled-reason-layout.md docs/superpowers/plans/2026-08-04-start-guide-responsive-layout.md docs/superpowers/plans/2026-08-07-annotation-sidebar-manual-override.md
```

Expected: the focused test passes, the manifest parses, and the diff check reports no whitespace errors.

- [ ] **Step 5: Inspect only the task-specific result**

Run:

```bash
git diff -- package.json README.md src/server/__tests__/development-entrypoints.test.ts docs/superpowers/plans/2026-08-01-start-guide-ai-setup-and-card-copy.md docs/superpowers/plans/2026-08-02-responsive-sidebar-device-preview-url.md docs/superpowers/plans/2026-08-04-ai-purpose-settings.md docs/superpowers/plans/2026-08-04-publish-menu-disabled-reason-layout.md docs/superpowers/plans/2026-08-04-start-guide-responsive-layout.md docs/superpowers/plans/2026-08-07-annotation-sidebar-manual-override.md
```

Confirm the only task-owned package change removes `admin:dev`, documentation consistently names the integrated command, the new test protects the command contract, and all unrelated pre-existing edits remain intact and unstaged.
