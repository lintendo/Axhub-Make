# Cursor Agents Native Browser Launcher Design

## Goal

Add an `Axhub Make` entry to Cursor Agents. Clicking it starts or reuses the local Make server, then opens Make in Cursor's own native `Browser` WebView. Repeated clicks reuse the same WebView.

This is an additional delivery path. The existing Codex and Codex++ integration remains supported and is not replaced.

## User Contract

Install or update once:

```bash
npx -y @axhub/make@latest cursor install
```

Because Cursor must expose its loopback CDP endpoint at process start, users then fully quit Cursor and launch the integrated session with:

```bash
npx -y @axhub/make@latest cursor open
```

In Cursor Agents, clicking `Axhub Make` starts Make when necessary and opens `http://127.0.0.1:53817/?surface=codex` internally. Users do not start Make separately, send a request to AI, configure MCP, install a Cursor extension, or open a system browser.

`cursor install` is idempotent and is also the update command. `cursor doctor` diagnoses the installation. `cursor uninstall` removes only Axhub-owned Cursor integration files and its current-user service.

## Scope And Non-Goals

The implementation targets Cursor Agents only. It does not add an Activity Bar container, IDE editor view, contributed webview, or command palette item.

It must not:

- open a standalone Axhub shell, overlay, iframe, or external browser;
- create an AI action, chat prompt, MCP server, or tool call;
- replace or disable Codex++;
- patch Cursor's application bundle or install a Cursor extension;
- expose an arbitrary command, URL, filesystem, or process bridge.

## Proven Architecture

The integration has two Axhub-owned pieces:

1. A Cursor-specific loopback companion attaches to eligible Cursor Agents renderers through CDP port `9230`, registers the fixed `ensure-make` host action, and injects one idempotent `Axhub Make` entry.
2. The injected entry reuses the native Cursor Agents WebView identified by the fixed selector `webview[partition="persist:cursor-browser"]`. After Make becomes healthy, it assigns the fixed Make URL to that WebView and activates the existing `Browser` tab.

This architecture was selected after testing Cursor 3.14.7. Its Agents renderer always supplied the native browser WebView and reused the same child target when navigated. A URI-handler extension was also tested, but Cursor routed the custom URI to marketplace extension installation instead of invoking the extension handler, so it is not part of the product.

The WebView selector and Browser tab discovery are private Cursor UI integration points. They remain isolated in `axhub-make.cursor-launcher.js` so a future Cursor compatibility change stays local.

## Click Flow

1. The injected entry sends the fixed `ensure-make` action to the companion.
2. The companion probes `http://127.0.0.1:53817/api/health` and starts the exact installed `@axhub/make` version through the bundled `npx-cli.js` only when necessary.
3. The injected code validates the returned origin against the fixed Make origin.
4. It finds Cursor's existing native browser WebView and sets its `src` to `http://127.0.0.1:53817/?surface=codex`.
5. It activates the existing Cursor Agents `Browser` tab.
6. A later click navigates and focuses that same WebView; it does not create a second browser surface.

The renderer never starts `npx` itself. Process startup remains in the companion, where macOS and Windows behavior is controlled and testable without shell-string construction.

## Installation And Packaging

The npm tarball contains the injected launcher and the self-contained Cursor companion runtime. Installation validates Node.js 22+, the packaged assets, and a supported Cursor application, then installs the assets and registers a current-user background service.

On macOS the service is a LaunchAgent. On Windows it is a current-user Task Scheduler task. Process calls use executable and argument arrays. No administrator permission is needed for a standard current-user installation, and Cursor's application bundle is never modified.

The installer prints one next step: fully quit Cursor, run `cursor open`, then click `Axhub Make` in Cursor Agents.

## Sidebar Injection

The launcher is registered for future Agents documents and evaluated in the current eligible renderer. It adds exactly one entry and repairs or reuses it after renderer navigation.

The click handler has three states without changing the layout dimensions:

- idle: normal `Axhub Make` entry;
- starting: temporarily disabled with Cursor's existing spinner treatment;
- error: returns to idle and shows a concise fixed error state.

The injection does not render Make. It only ensures Make is healthy, navigates Cursor's native browser WebView, and activates the Browser tab.

## Security

- CDP, companion communication, health checks, and Make use IPv4 loopback only.
- The renderer binding accepts only `{ id, action: "ensure-make" }`.
- The destination is a fixed configured loopback Make origin with forced `surface=codex`.
- The WebView partition selector and native Browser tab identifier are fixed constants.
- No renderer input becomes a process name, command argument, filesystem path, or unrestricted URL.
- No token or secret is stored.

## Failure Behavior

- Make startup failure: keep Agents visible and show a fixed error state; do not navigate a browser.
- Native browser WebView or Browser tab unavailable: report Cursor-version incompatibility; do not fall back to an iframe, editor view, or external browser.
- Agents DOM changed: `cursor doctor` reports injection unavailable; Make remains usable through its normal URL.
- CDP unavailable: `cursor doctor` explains how to fully quit Cursor and relaunch through `cursor open`.
- Ordinary Cursor already running: `cursor open` refuses to start a competing instance and prints the exact quit-and-retry instruction.

## Compatibility

The existing Codex/Codex++ commands and behavior remain unchanged:

```bash
npx -y @axhub/make@latest codex install
```

Cursor uses its own files, service identity, launch behavior, diagnostics, uninstall boundary, and CDP port `9230`. Codex++, official Codex, and Cursor may coexist and reuse the same healthy Make server.

## Verification

Automated coverage includes:

- macOS and Windows paths, argument-array launch behavior, service definitions, and lifecycle;
- idempotent install, update, doctor, and narrow uninstall behavior;
- fixed loopback origin, fixed `ensure-make` action, and shell-free startup;
- eligible Agents target filtering and CDP session cleanup;
- idempotent launcher injection, fixed native WebView selection, and click-state recovery;
- native-browser diagnostic detection through the Agents parent target;
- coexistence with Codex/Codex++ assets and services;
- release tarball inclusion of every Cursor runtime asset.

A release candidate also receives a real smoke test:

1. Install from the packed npm tarball.
2. Start Cursor through `cursor open` and verify loopback CDP port `9230`.
3. Click `Axhub Make` in Cursor Agents.
4. Verify the native Cursor browser target opens at `?surface=codex`.
5. Click again and verify the same native browser target is reused.
6. Verify the conversation heading and input are absent and no external browser, iframe, editor view, AI task, or MCP action appears.
