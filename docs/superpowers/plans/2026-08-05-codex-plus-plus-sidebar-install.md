# Codex++ Sidebar Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-platform `codex install/doctor/uninstall` lifecycle to `@axhub/make` so a Codex++ sidebar click starts Make and opens it in Codex's built-in browser.

**Architecture:** The existing CLI routes `codex` subcommands to an installer module. The installer copies a bundled zero-dependency CDP companion and Codex++ user script into per-user locations, then registers a LaunchAgent on macOS or a least-privilege scheduled task on Windows. The renderer bridge exposes only `ensure-make` and launches the exact installed npm package version on fixed loopback ports.

**Tech Stack:** TypeScript 5, Node.js 22 ESM, Vitest, macOS `launchctl`, Windows `schtasks.exe`, Codex++ CDP/user scripts.

## Global Constraints

- User command: `npx -y @axhub/make@latest codex install`.
- Supported integration platforms: `darwin` and `win32` only.
- No MCP, AI task, iframe, external-browser fallback, shell command bridge, or administrator requirement.
- Fixed endpoints: CDP `127.0.0.1:9229`, Make `http://127.0.0.1:53817`.
- Preserve the current no-subcommand Make server behavior.
- Use argument arrays for local commands and remove only exact Axhub-owned paths.

---

### Task 1: CLI Routing And Platform Model

**Files:**
- Modify: `src/server/cli.ts`
- Create: `src/server/codexIntegration/paths.ts`
- Create: `src/server/codexIntegration/cli.ts`
- Test: `src/server/__tests__/codexIntegration-cli.test.ts`
- Test: `src/server/__tests__/codexIntegration-paths.test.ts`

**Interfaces:**
- Produce: `isCodexIntegrationCommand(args: string[]): boolean`.
- Produce: `runCodexIntegrationCli(args: string[], context?: CodexIntegrationContext): Promise<void>`.
- Produce: `resolveCodexIntegrationPaths(options): CodexIntegrationPaths` for `darwin` and `win32`.

- [ ] Write failing tests proving `runCli(['codex', 'install'])` routes without starting the Make server, unknown subcommands fail, and existing empty args still start Make.
- [ ] Write failing path tests for `~/.config/Codex++/user_scripts` on macOS and `%APPDATA%\Codex++\user_scripts` on Windows.
- [ ] Run `pnpm exec vitest run src/server/__tests__/codexIntegration-cli.test.ts src/server/__tests__/codexIntegration-paths.test.ts` and confirm the missing exports fail.
- [ ] Add the smallest CLI route and pure path resolver needed by the tests.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Platform Service Definitions

**Files:**
- Create: `src/server/codexIntegration/service.ts`
- Test: `src/server/__tests__/codexIntegration-service.test.ts`

**Interfaces:**
- Produce: `createLaunchAgentPlist(input): string`.
- Produce: `createWindowsTaskXml(input): string`.
- Produce: `registerBackgroundService(input, runner): Promise<void>`.
- Produce: `unregisterBackgroundService(input, runner): Promise<void>`.

- [ ] Write failing tests for XML escaping, fixed `ProgramArguments`, `RunAtLoad`, and `KeepAlive` in the plist.
- [ ] Write failing tests for a Windows task with the current SID, `InteractiveToken`, `LeastPrivilege`, hidden state, no execution time limit, and a quoted `node companion.mjs --config config.json` action.
- [ ] Write failing runner tests that assert `launchctl` and `schtasks.exe` receive argument arrays and that absent prior registrations are tolerated.
- [ ] Run `pnpm exec vitest run src/server/__tests__/codexIntegration-service.test.ts` and confirm failure.
- [ ] Implement XML generation and platform registration/unregistration.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Installer, Doctor, And Uninstaller

**Files:**
- Create: `src/server/codexIntegration/install.ts`
- Modify: `src/server/codexIntegration/cli.ts`
- Test: `src/server/__tests__/codexIntegration-install.test.ts`

**Interfaces:**
- Produce: `installCodexIntegration(context?): Promise<InstallResult>`.
- Produce: `doctorCodexIntegration(context?): Promise<DoctorResult>`.
- Produce: `uninstallCodexIntegration(context?): Promise<UninstallResult>`.
- Consume: platform paths and service registration from Tasks 1-2.

- [ ] Write failing tests using temporary macOS and Windows homes plus a fake command runner.
- [ ] Cover Node 22 validation, `npx-cli.js` discovery beside `npm-cli.js`, exact package version config, atomic asset copy, idempotent install, doctor failures, and exact-target uninstall.
- [ ] Run `pnpm exec vitest run src/server/__tests__/codexIntegration-install.test.ts` and confirm failure.
- [ ] Implement the lifecycle and human-readable CLI output.
- [ ] Re-run the focused test and confirm it passes.

### Task 4: Bundled Companion Runtime

**Files:**
- Create: `bin/codex-integration/host-protocol.mjs`
- Create: `bin/codex-integration/cdp-session.mjs`
- Create: `bin/codex-integration/make-runtime.mjs`
- Create: `bin/codex-integration/companion.mjs`
- Test: `src/server/__tests__/codexIntegration-runtime.test.ts`

**Interfaces:**
- Produce: `parseHostRequest(raw)` accepting only `ensure-make`.
- Produce: `listCodexTargets(debugPort)` returning injectable `app://` page targets.
- Produce: `attachCodexTarget(target, { ensureMake })` adding only `__axhubMakeHostV1`.
- Produce: `ensureMake(options)` with a shared in-flight start.
- Produce: `spawnMake(config)` using Node plus `npx-cli.js` and fixed Make flags.

- [ ] Write failing tests for strict request parsing, data-only renderer responses, CDP filtering, one fixed binding, health body validation, exact spawn arguments, and concurrent-start deduplication.
- [ ] Run `pnpm exec vitest run src/server/__tests__/codexIntegration-runtime.test.ts` and confirm failure.
- [ ] Implement the four zero-dependency ESM files without importing workspace packages.
- [ ] Re-run the focused test and confirm it passes.

### Task 5: Codex++ User Script

**Files:**
- Create: `bin/codex-integration/axhub-make.user.js`
- Test: `src/server/__tests__/codexIntegration-user-script.test.ts`

**Interfaces:**
- Consume: renderer binding `__axhubMakeHostV1` and response event `axhub-make:host-response`.
- Produce: one `#axhub-make-sidebar-entry` after the Plugins entry and one `open-in-browser` message per successful click.

- [ ] Write a failing source-contract test for idempotent installation, sidebar-only Plugins lookup with an `aside` fallback, fixed binding/action/origin, no iframe, no CSP bypass, and `openTarget: "in-app-browser"`.
- [ ] Run `pnpm exec vitest run src/server/__tests__/codexIntegration-user-script.test.ts` and confirm failure.
- [ ] Implement the user script with busy and retry states, a MutationObserver, fixed-origin validation, and Codex built-in-browser dispatch.
- [ ] Re-run the focused test and confirm it passes.

### Task 6: Package And End-To-End Verification

**Files:**
- Modify: `README.md`
- Verify: `package.json` tarball contents (the existing `files: ["bin", ...]` includes the new assets).

- [ ] Add the one-command Codex++ install, daily-use, doctor, uninstall, macOS, and Windows notes to the Make README.
- [ ] Run all new focused tests plus `src/server/__tests__/cli.test.ts`.
- [ ] Run `pnpm server:build`.
- [ ] Run `pnpm pack --dry-run` or the repository's release dry-run and assert every `bin/codex-integration/*` file and every non-test `src/server/codexIntegration/*.ts` file is included.
- [ ] Run a macOS smoke install against a temporary home with platform commands mocked, then run the real local installer and click the sidebar entry through Codex++.
- [ ] Record that Windows Task Scheduler needs a final native Windows release smoke despite contract coverage on macOS.
