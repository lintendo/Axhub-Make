# Unified App Open CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `axhub-make open <app>`, reusable/background Make service lifecycle commands, and remove the legacy `axhub-make codex` persistent integration.

**Architecture:** A CLI router delegates Make process ownership to a service lifecycle controller and App launch/injection to an App open controller. The App controller reuses `agentSurfaceIntegration` and desktop lifecycle primitives; the service controller treats server-info as a hint and requires matching PID plus Admin health identity before reuse or termination.

**Tech Stack:** Node.js 22+, TypeScript 5, Vitest 4, pnpm, `@axhub/agent-surface`, shell-free child-process argument arrays.

**Spec:** `docs/superpowers/specs/2026-08-14-unified-app-open-cli-design.md`

## Global Constraints

- Public App IDs are exactly `codex`, `cursor`, `workbuddy`, `traework`, and `qoderwork`.
- `open <app>` accepts no project directory and no project ID; the injected URL is the Make home page with `surface=codex`.
- CLI opens activate Make immediately; existing management UI opens remain non-activating.
- App restart requires a TTY confirmation or explicit `--restart`; never force-kill an App.
- `--background` installs no daemon or OS service and launches children with executable-plus-argument arrays and `shell: false`.
- `status` and `stop` act only on a PID whose server-info and `/api/health` Admin identity match.
- Remove `axhub-make codex <install|open|doctor|uninstall>` without compatibility routing or legacy-artifact migration.
- Do not add HTML validation, temporary HTML reports, or repository-local runtime state.
- Preserve unrelated dirty-worktree changes and stage files by exact path only.

---

### Task 1: Make Admin service lifecycle

**Files:**
- Create: `src/server/makeServiceLifecycle.ts`
- Create: `src/server/makeServiceLifecycle.test.ts`
- Modify: `src/server/projectCore/paths.ts`

**Interfaces:**
- Consumes: `readServerInfo()`, `getGlobalMakeStateDir()`, `getGlobalAdminServerInfoPath()`, `fetchHealth()`, `normalizeHealthServerInfo()`, and `isProcessAlive()` from `projectCore`.
- Produces: `inspectMakeService(options): Promise<MakeServiceInspection>`, `buildBackgroundServeArgs(options): string[]`, `startMakeServiceInBackground(options, dependencies): Promise<MakeServiceResult>`, and `stopMakeService(options, dependencies): Promise<MakeServiceResult>`.
- `MakeServiceInspection.status` is exactly `running | stopped | stale`; results expose `{ ok, code, message, origin?, pid?, logFile?, reusedServer? }`.

- [ ] **Step 1: Write failing lifecycle tests**

Add Vitest cases proving that matching PID plus `{ ok: true, role: "admin", server: matchingInfo }` is `running`; missing info is `stopped`; dead PID, wrong role, or mismatched origin is `stale`; stop is idempotent for stopped state and refuses stale identity; a matching service receives `SIGTERM` on POSIX or `taskkill.exe /PID <pid>` without `/F` on Windows; background argument construction strips `open`, App ID, `--background`, `--json`, `--app-path`, and `--restart`, forwards server options, and forces `--no-open`.

- [ ] **Step 2: Run the lifecycle test to verify RED**

Run: `pnpm exec vitest run src/server/makeServiceLifecycle.test.ts`

Expected: FAIL because `makeServiceLifecycle.ts` and its exports do not exist.

- [ ] **Step 3: Implement identity inspection and safe stop**

Implement exact identity matching across recorded PID, current-user global project root, Admin role, origin, port, and health server PID. Re-read identity immediately before signaling. Remove only the exact global Admin server-info file after confirmed process exit or a provably dead stopped record; never infer ownership from a port.

- [ ] **Step 4: Implement detached background startup**

Use `process.execPath`, `process.execArgv`, the current CLI entry path, serve-only arguments, `detached: true`, `shell: false`, and stdout/stderr file descriptors opened on the chosen global-state log. Wait with bounded polling until inspection is `running`; return `make-start-timeout` if readiness never arrives.

- [ ] **Step 5: Run lifecycle tests and typecheck**

Run: `pnpm exec vitest run src/server/makeServiceLifecycle.test.ts`

Run: `pnpm exec tsc --noEmit -p tsconfig.node.json`

Expected: PASS.

---

### Task 2: Projectless App open and injection controller

**Files:**
- Modify: `src/server/agentSurfaceIntegration.ts`
- Modify: `src/server/agentSurfaceIntegration.test.ts`
- Create: `src/server/cliAppOpen.ts`
- Create: `src/server/cliAppOpen.test.ts`

**Interfaces:**
- Consumes: `inspectMakeAgentSurfaceHost()`, `closeMakeAgentSurfaceHost()`, and `openMakeAgentSurface()`.
- Produces: `MakeCliAppId`, `normalizeMakeCliAppId(value)`, `openMakeCliApp(options, dependencies): Promise<MakeCliAppOpenResult>`.
- Extends `MakeAgentSurfaceConfigOptions.projectId` to optional and adds `activate?: boolean` to the one-shot surface open options; default remains `false`.

- [ ] **Step 1: Write failing Agent Surface contract tests**

Assert `buildMakeAgentSurfaceConfig({ makeOrigin })` produces `/?surface=codex` without `projectId`; passing `projectId` retains the management UI deep link; `buildMakeAgentSurfaceOpenOptions({ ..., activate: true })` activates; omitting it remains `false`.

- [ ] **Step 2: Run the Agent Surface test to verify RED**

Run: `pnpm exec vitest run src/server/agentSurfaceIntegration.test.ts`

Expected: FAIL because `projectId` is required and activation is fixed to false.

- [ ] **Step 3: Implement projectless config and configurable activation**

Only append `projectId` when its trimmed value is non-empty. Thread `activate` through `openMakeAgentSurface()` and `buildMakeAgentSurfaceOpenOptions()` while leaving project-opening integration at `activate: false`.

- [ ] **Step 4: Write failing App controller tests**

Cover exact App ID mapping (`codex` maps to provider `chatgpt`), rejection of OpenCode/Trae/unknown values, cold launch through `openMakeAgentSurface({ activate: true })`, CDP-ready reuse, TTY restart accept/decline, non-interactive `restart-required`, explicit restart, `app-not-installed`, graceful-exit timeout mapping, per-call `appPath`, and lock release/dead-owner recovery under an isolated Make state directory.

- [ ] **Step 5: Run the App controller test to verify RED**

Run: `pnpm exec vitest run src/server/cliAppOpen.test.ts`

Expected: FAIL because `cliAppOpen.ts` does not exist.

- [ ] **Step 6: Implement the App controller and cross-process lock**

Use atomic `wx` lock files named by App under the global Make state directory. Record owner PID and acquisition time, remove only dead-owner locks, bound the wait, and release in `finally`. Inspect before launch; require confirmation before graceful close; invoke the existing one-shot surface open with `activate: true` after the host is available.

- [ ] **Step 7: Run focused App tests and typecheck**

Run: `pnpm exec vitest run src/server/agentSurfaceIntegration.test.ts src/server/cliAppOpen.test.ts src/server/__tests__/desktopClientLifecycle.test.ts`

Run: `pnpm exec tsc --noEmit -p tsconfig.node.json`

Expected: PASS.

---

### Task 3: Public CLI router and command orchestration

**Files:**
- Modify: `src/server/cli.ts`
- Modify: `src/server/__tests__/cli.test.ts`
- Modify: `bin/cli.mjs`

**Interfaces:**
- Consumes: Task 1 lifecycle results and Task 2 `openMakeCliApp()`.
- Produces: `MakeCliOptions`, `CliUsageError`, `parseCliArgs(args, cwd)`, and `runCli(args, dependencies): Promise<number>`.
- Command discriminant is exactly `serve | open | status | stop`; invalid usage returns exit code 2, operational failure returns 1, success returns 0.

- [ ] **Step 1: Write failing parser and help tests**

Assert default serve behavior, `open <app>`, `status`, `stop`, common flags, `--background`, `--json`, `--app-path`, `--restart`, option applicability, all App IDs, invalid App exit classification, and help text. Assert `codex install`, `codex doctor`, and `codex uninstall` are rejected with an `open codex` hint.

- [ ] **Step 2: Run parser tests to verify RED**

Run: `pnpm exec vitest run src/server/__tests__/cli.test.ts`

Expected: FAIL because the current parser only supports serving and routes `codex` to the legacy command group.

- [ ] **Step 3: Implement the discriminated parser and stable output**

Parse command and positional App before options, preserve existing server defaults, validate command-specific options, add human and JSON result rendering, and return numeric exit codes. `bin/cli.mjs` assigns the resolved code to `process.exitCode` and maps thrown usage errors to 2.

- [ ] **Step 4: Write failing orchestration tests**

Cover reuse of a healthy Make service, foreground startup, background startup, browser opening, `--no-open`, App injection after service readiness, cleanup of a newly created foreground server when App open fails, status exit semantics, idempotent stop, and JSON-only output.

- [ ] **Step 5: Run orchestration tests to verify RED**

Run: `pnpm exec vitest run src/server/__tests__/cli.test.ts`

Expected: FAIL at the new lifecycle/App dependency assertions.

- [ ] **Step 6: Implement serve/open/status/stop orchestration**

Reuse an identified existing server before starting. For foreground `open`, start Make, then invoke the App controller; for background `open`, wait for background health before injection. When serving only, reuse and open the browser unless disabled. Render one structured object under `--json` and avoid interactive prompts in JSON/non-TTY operation without `--restart`.

- [ ] **Step 7: Run CLI tests and server typecheck**

Run: `pnpm exec vitest run src/server/__tests__/cli.test.ts src/server/makeServiceLifecycle.test.ts src/server/cliAppOpen.test.ts src/server/agentSurfaceIntegration.test.ts`

Run: `pnpm exec tsc --noEmit -p tsconfig.node.json`

Expected: PASS.

---

### Task 4: Remove legacy Codex integration and update packaging/docs

**Files:**
- Delete: `src/server/codexIntegration/`
- Delete: `src/server/__tests__/codexIntegration-*.test.ts`
- Delete: `bin/codex-integration/`
- Modify: `scripts/release-make.mjs`
- Modify: `scripts/release-make.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 3 public CLI contract.
- Produces: npm staging without persistent Codex integration assets and documentation centered on `open <app>`.

- [ ] **Step 1: Write failing release/package assertions**

Replace positive Codex integration staging assertions with checks that the runtime file list and staged package exclude `bin/codex-integration`, while retaining `bin/cli.mjs`, server sources, and vendor Agent Surface artifacts.

- [ ] **Step 2: Run focused release tests to verify RED**

Run: `pnpm exec vitest run scripts/release-make.test.mjs`

Expected: FAIL while release staging still copies legacy integration assets.

- [ ] **Step 3: Remove legacy runtime, tests, and staging code**

Delete only the exact legacy source/test/asset paths. Remove release constants and copy steps that reference those paths. Do not inspect, migrate, or delete artifacts outside the repository that older releases installed.

- [ ] **Step 4: Update README and CLI examples**

Document foreground/background Make startup, `open codex|cursor|workbuddy|traework|qoderwork`, restart confirmation and `--restart`, `status`, and `stop`. Remove Codex++ installation/uninstallation instructions and explain that `open` is one-shot and installs no persistent companion.

- [ ] **Step 5: Run release, CLI, integration, and package verification**

Run: `pnpm exec vitest run scripts/release-make.test.mjs src/server/__tests__/cli.test.ts src/server/makeServiceLifecycle.test.ts src/server/cliAppOpen.test.ts src/server/agentSurfaceIntegration.test.ts src/server/__tests__/desktopClientLifecycle.test.ts src/server/__tests__/desktopIntegrationOpen.test.ts src/server/__tests__/agent-open-api.test.ts`

Run: `pnpm run server:build`

Run: `pnpm run release:make:dry-run`

Run: `git diff --check -- README.md bin/cli.mjs bin/codex-integration scripts/release-make.mjs scripts/release-make.test.mjs src/server/cli.ts src/server/makeServiceLifecycle.ts src/server/cliAppOpen.ts src/server/agentSurfaceIntegration.ts src/server/codexIntegration`

Expected: all commands pass; staged package contains no legacy integration directory.

---

### Task 5: Independent review and completion audit

**Files:**
- Review: all files changed by Tasks 1-4
- Verify: `docs/superpowers/specs/2026-08-14-unified-app-open-cli-design.md`

**Interfaces:**
- Consumes: the complete implementation diff and verification evidence.
- Produces: independent L3 review findings resolved or explicitly ruled, plus a requirement-by-requirement completion audit.

- [ ] **Step 1: Request an independent code review**

Give the reviewer the approved spec, implementation plan, exact diff package, and test evidence. Require separate verdicts for public CLI compatibility, process safety, cross-platform behavior, test coverage, and release cleanup.

- [ ] **Step 2: Fix Critical and Important findings with TDD**

For each accepted issue, add or adjust a test that fails for the reported defect, verify RED, implement the smallest fix, and rerun the focused plus package verification.

- [ ] **Step 3: Run final fresh verification**

Rerun the complete Task 4 verification set after review fixes, inspect `git diff --check`, inspect exact changed paths, and compare every spec requirement with direct source/test/package evidence.

- [ ] **Step 4: Commit only task-owned paths**

Stage explicit paths only. Confirm `git diff --cached --name-status` contains no unrelated user changes before committing.
