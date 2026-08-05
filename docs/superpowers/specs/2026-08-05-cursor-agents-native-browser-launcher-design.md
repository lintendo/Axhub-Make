# Cursor Agents Native Browser Launcher Design

## Goal

Add an `Axhub Make` entry to the Cursor Agents window. Clicking it starts or reuses the local Make server, then opens Make in Cursor's native internal browser tab. Repeated clicks focus and reuse the same tab.

This is an additional delivery path. The existing Codex and Codex++ integration remains supported and is not replaced.

## User Contract

The Cursor-specific install command is:

```bash
npx -y @axhub/make@latest cursor install
```

Because CDP must be enabled when Cursor starts, the exact first-run flow is:

1. Run `cursor install` once.
2. Fully quit an already running Cursor process.
3. Run `npx -y @axhub/make@latest cursor open` to launch Cursor with the fixed loopback CDP parameter.
4. Click `Axhub Make` in the Agents sidebar.

Later Cursor sessions must also be launched through `cursor open` while this private sidebar injection is required. The installer does not replace the user's normal Cursor shortcut or modify the application bundle. The user does not need to start Make separately, send a request to AI, configure MCP, or open a system browser.

The `cursor install` command is idempotent and doubles as the update command. `cursor doctor` diagnoses the installation and `cursor uninstall` removes only Axhub-owned files and the Axhub bridge extension.

## Scope And Non-Goals

The implementation targets the Cursor Agents window only. It does not add an Activity Bar container, editor view, webview, or other Cursor IDE UI.

It must not:

- open a standalone Axhub page, custom shell, overlay, or iframe;
- open Safari, Chrome, Edge, or another external browser;
- create an AI action, chat prompt, MCP server, or tool call;
- replace or disable Codex++;
- patch files inside the Cursor application bundle;
- expose a general-purpose command or arbitrary URL bridge.

## Architecture

The integration has three Axhub-owned pieces:

1. A Cursor-specific loopback companion ensures Make is healthy and injects one idempotent `Axhub Make` item into eligible Cursor Agents renderers over CDP port `9230`.
2. A tiny, invisible Cursor extension registers the URI handler `cursor://axhub.axhub-make/open`. It contributes no command palette item, Activity Bar icon, editor, webview, settings page, or visible UI.
3. The URI handler calls Cursor's native `workbench.action.openBrowserEditor` command with the validated Make URL and a stable browser id, `axhub-make`.

The native command is intentionally used instead of rendering Axhub's own browser surface. In Cursor 3.13.25, the command delegates to the Agents window's native `glass.openBrowserTab` implementation when that window is active.

The native workbench command and its `browserId` argument are Cursor-private integration points. They are isolated inside the bridge extension so a future Cursor change requires updating only that small adapter and its compatibility test.

## Click Flow

The full click sequence is:

1. The injected sidebar item calls the Cursor companion's fixed `ensure-make` action.
2. The companion accepts only that action, probes `http://127.0.0.1:53817/api/health`, and starts the pinned `@axhub/make` package when needed.
3. After health succeeds, the injected item navigates to `cursor://axhub.axhub-make/open?url=<encoded-url>`.
4. The bridge extension validates the URI path and URL. The only accepted destination is loopback Make with `surface=codex`.
5. The extension executes:

```ts
vscode.commands.executeCommand('workbench.action.openBrowserEditor', {
  url: makeUrl,
  browserId: 'axhub-make',
  reveal: true,
  preserveFocus: false,
});
```

6. Cursor opens the URL as its own internal browser tab. A later click uses the same `browserId`, updates the URL if needed, and focuses that tab rather than creating duplicates.

The bridge never starts `npx` itself. Process startup stays in the companion, where macOS and Windows behavior is already controlled and testable without shell-string construction.

## Installation And Packaging

The npm tarball contains the sidebar injection source, companion runtime, and a prebuilt Axhub bridge VSIX. The installer uses argument arrays and the discovered Cursor CLI to install the VSIX for the current user.

On macOS, discovery checks the standard Cursor application locations and the bundled CLI beneath `Cursor.app/Contents/Resources/app/bin/cursor`. On Windows, discovery checks the current-user and system Cursor installation locations and their bundled `cursor.cmd` or executable. An already available `cursor` command is accepted on both platforms after its identity is verified.

Installation performs these operations in order:

1. Validate macOS or Windows, Node.js, packaged assets, and the Cursor installation.
2. Install or update the invisible Axhub bridge extension with Cursor's CLI.
3. Install or update the Cursor companion and sidebar source.
4. Register and start the current-user companion service.
5. Print one next step: fully quit Cursor, run `cursor open`, then click `Axhub Make` in the Agents sidebar.

No administrator permission is required for the standard current-user Cursor installation. If Cursor's CLI is unavailable, installation fails with the exact discovered paths and a corrective instruction; it does not fall back to modifying Cursor's extension directory directly.

## Sidebar Injection

The sidebar source is registered for future documents and evaluated in the current eligible Agents renderer. It adds exactly one item and repairs or reuses that item after renderer navigation.

The injected click handler has three states without changing layout dimensions:

- idle: normal `Axhub Make` item;
- starting: temporarily disabled with the existing spinner treatment;
- error: returns to idle and shows a concise fixed error state on the sidebar item.

The injection does not render the Make UI. It only starts Make and dispatches the fixed URI after health succeeds.

## Security

- CDP, companion communication, Make health checks, and the Make server use IPv4 loopback only.
- The renderer binding accepts only `{ id, action: "ensure-make" }`.
- The URI handler accepts only the `/open` path and the configured `http://127.0.0.1:53817/` Make origin.
- The handler forces `surface=codex`; it rejects credentials, fragments, non-loopback hosts, and unrelated paths.
- No renderer input becomes a process name, command argument, filesystem path, or unrestricted URL.
- The extension requests no network service and stores no token or secret.

## Failure Behavior

- Make startup failure: keep the current Agents window visible and show a concise fixed error state on the sidebar item; do not open a browser.
- Bridge extension missing or disabled: `cursor doctor` reports the exact repair command. The click cannot depend on a missing extension to display a native notification.
- Native browser command unavailable: show an incompatible Cursor-version error; do not fall back to an editor webview or external browser.
- Cursor renderer DOM changed: companion diagnostics report that sidebar injection is unavailable; Make itself remains usable through its normal URL.
- CDP unavailable: `cursor doctor` explains how to fully quit Cursor and relaunch it with `cursor open`.
- Ordinary Cursor instance already running: `cursor open` refuses to start a competing instance and prints the exact quit-and-retry instruction.

## Compatibility

The existing Codex/Codex++ commands and behavior remain unchanged:

```bash
npx -y @axhub/make@latest codex install
```

Cursor users use the separate `cursor install` and `cursor open` path. Cursor CDP uses port `9230`, while the existing Codex integration retains its own port and service. A machine may have Cursor, Codex++, and official Codex installed at the same time. Each integration owns distinct files, diagnostics, launch behavior, and uninstall boundaries, while all of them reuse the same healthy Make server at the configured loopback origin.

## Verification

Automated coverage must include:

- macOS and Windows Cursor CLI discovery, argument-array installation, and `cursor open` launch behavior;
- idempotent install, update, doctor, and uninstall behavior;
- VSIX package contents and invisible contribution contract;
- strict URI path and loopback URL validation;
- exact native command arguments, including stable `browserId: "axhub-make"`;
- companion health/start deduplication and no shell-string execution;
- idempotent Agents sidebar injection and click-state recovery;
- coexistence with existing Codex/Codex++ install assets and services;
- release tarball inclusion of the bridge VSIX and sidebar source.

A release candidate also receives real smoke tests on macOS and Windows:

1. Install from the packed npm tarball.
2. Start Cursor through `cursor open` and verify it uses loopback CDP port `9230`.
3. Click `Axhub Make` in the Agents sidebar.
4. Verify a Cursor-native internal browser tab opens at `?surface=codex`.
5. Click again and verify the same native browser tab is focused and reused.
6. Verify no custom Axhub shell, iframe, editor page, external browser, or AI task appears.
