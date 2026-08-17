# Cursor Agents Native Browser Launcher Implementation Plan

> **Execution mode:** Execute continuously with test-driven development. Preserve existing uncommitted Codex/Codex++ work and add only Cursor-owned behavior and release wiring.

**Goal:** Ship `cursor install/open/doctor/uninstall` in `@axhub/make` so a CDP-injected entry in Cursor Agents starts or reuses Make and opens it in Cursor's native internal browser WebView.

**Architecture:** A Cursor-only companion uses loopback CDP port `9230` to inject one idempotent launcher. The launcher calls the fixed `ensure-make` action, navigates Cursor Agents' existing `persist:cursor-browser` WebView to the fixed `surface=codex` URL, and activates its existing Browser tab. No Cursor extension, arbitrary URI bridge, external browser, iframe, AI action, or MCP is involved.

**Tech stack:** TypeScript 5, Node.js 22 runtime modules, Vitest 4, CDP, macOS LaunchAgent, Windows Task Scheduler.

**Design reference:** `docs/superpowers/specs/2026-08-05-cursor-agents-native-browser-launcher-design.md`

## Task 1: Paths and Cursor CDP launcher

**Files:** `src/server/cursorIntegration/paths.ts`, `launcher.ts`, and their tests.

- Cover macOS and Windows Axhub-owned paths, service identities, Cursor application candidates, fixed port `9230`, loopback arguments, app launch argument arrays, eligible Agents target reuse, and refusal when ordinary Cursor is already running.
- Implement `resolveCursorIntegrationPaths` and `openCursorIntegration` without modifying Cursor or Codex-owned files.
- Verify the focused path and launcher tests pass.

## Task 2: Companion runtime and injected native-browser launcher

**Files:** `bin/cursor-integration/{host-protocol,make-runtime,cdp-session,companion}.mjs`, `axhub-make.cursor-launcher.js`, and runtime/launcher tests.

- Cover exact package version, fixed origin/port, fixed `ensure-make`, Agents target filtering, CDP attach order, no CSP bypass, shell-free `npx-cli.js` startup, startup deduplication, session cleanup, one injected entry, and click-state recovery.
- After health succeeds, select only `webview[partition="persist:cursor-browser"]`, assign the fixed Make URL, and activate the existing Browser tab.
- Reject unsupported native-browser DOM instead of falling back to an editor view, iframe, external browser, AI request, MCP, or arbitrary URL.

## Task 3: Service, install lifecycle, CLI, and diagnostics

**Files:** `src/server/cursorIntegration/{service,install,cli}.ts`, their tests, and `src/server/cli.ts`.

- Generate a current-user macOS LaunchAgent and least-privilege Windows task with Cursor-only identities.
- Install the self-contained companion and launcher assets, config, and service idempotently; require Node.js 22+ and a supported Cursor application.
- Add separate doctor checks for client, assets, service, Make, CDP, injection, and the native browser WebView.
- Uninstall only Axhub-owned Cursor files and its service, preserving Codex/Codex++.
- Route `cursor install/open/doctor/uninstall` before general CLI option parsing and print exact next actions.

## Task 4: Release packaging and delivery documentation

**Files:** `scripts/release-make.mjs`, `scripts/release-make.test.mjs`, `README.md`, `package.json`.

- Require all four companion runtime modules and `axhub-make.cursor-launcher.js` in npm staging and dry-run output.
- Keep Codex integration assets unchanged.
- Document install/update, full Cursor quit, `cursor open`, click-to-auto-start, native internal browser, conversation-free surface, doctor/uninstall, macOS/Windows support, and Codex++ coexistence.
- State explicitly that no Cursor extension or administrator permission is required.

## Task 5: Regression and real macOS smoke

- Run all Cursor tests and the relevant Codex integration tests.
- Run release tests, server build, and `release:make:prepare`.
- Install the exact packed local tarball, start Cursor 3.14.7 through `cursor open`, and verify one injected entry.
- Click once and verify the native child WebView target opens the fixed Make surface.
- Click again and verify the same target id remains and no duplicate WebView appears.
- Inspect the loaded Make DOM for absence of the conversation heading and prompt input.
- Save ad hoc evidence under ignored `.local/` paths only.

## Task 6: Scope and final review

- Run `git diff --check` and inspect the scoped diff.
- Confirm macOS and Windows process calls use argument arrays and uninstall targets remain narrow.
- Confirm private Cursor assumptions are isolated in the injected launcher and diagnostics.
- Report exact user commands, automated evidence, Cursor smoke results, the remaining Windows real-machine caveat, and make no commit or push unless explicitly requested.
