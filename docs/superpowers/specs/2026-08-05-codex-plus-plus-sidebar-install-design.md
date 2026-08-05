# Codex Sidebar Install Design

## Goal

Ship the Codex sidebar integration through the existing `@axhub/make` npm package. A user who already has Node.js and either Codex++ or official Codex runs one command:

```bash
npx -y @axhub/make@latest codex install
```

After installation, a Codex++ user reopens Codex through Codex++; an official Codex user runs `npx -y @axhub/make@latest codex open`. Both then click `Axhub Make` in the Codex sidebar. The click starts or reuses the local Make server and opens `http://127.0.0.1:53817/?surface=codex` in Codex's built-in browser. It does not send an AI task and does not use MCP.

## Supported Platforms

- macOS: current-user LaunchAgent, no administrator permission.
- Windows: current-user Task Scheduler task with `LeastPrivilege`, no administrator permission.
- Linux: the Make server remains supported, but this Codex++ desktop integration is rejected because Codex desktop and the referenced Codex++ distribution do not provide a supported Linux contract.
- Node.js 22 or newer is required because the companion uses the built-in WebSocket client.

## User Contract

Install is idempotent and also acts as update. The complete user flow is:

1. Run `npx -y @axhub/make@latest codex install` once.
2. If using Codex++, open it normally through Codex++. If using official Codex, fully quit the normal app instance (including the Windows tray process) and run `npx -y @axhub/make@latest codex open`.
3. Click `Axhub Make` in the left sidebar.

The user does not separately start Make, install an app, configure MCP, or ask AI to open the page. `codex doctor` diagnoses the integration and `codex uninstall` removes only Axhub-owned files and startup registration.

## Architecture

The integration has three pieces distributed inside the npm tarball:

1. The TypeScript installer under `src/server/codexIntegration/` resolves platform paths, copies assets, writes configuration, cleans up Axhub's legacy Codex++ user-script file when present, and registers the current-user background service.
2. A zero-dependency Node.js companion under `bin/codex-integration/` watches Codex++'s fixed CDP endpoint at `127.0.0.1:9229`. It exposes one renderer binding, `__axhubMakeHostV1`, accepts only the `ensure-make` action, and injects the sidebar source into eligible Codex renderers.
3. A sidebar source asset is registered through CDP `Page.addScriptToEvaluateOnNewDocument` for later navigations and evaluated through CDP `Runtime.evaluate` for the current renderer. It calls the companion, validates the fixed loopback origin, and invokes Codex's existing `open-in-browser` renderer bridge with `openTarget: "in-app-browser"`.

Codex++ remains the user-facing launcher for Codex++ users. For official Codex users, `codex open` is a thin cross-platform launcher that starts the discovered Codex app with `--remote-debugging-port=9229`; it first refuses if a normal existing Codex process would prevent the port from being applied. In both cases Axhub does not modify client files, depend on Codex++'s user-script loader, launch a second instance after CDP is already ready, inject an iframe, bypass CSP, expose a general command bridge, use MCP, fall back to an external browser, or modify Codex/Codex++ application files.

## Installed Files

macOS:

```text
~/Library/Application Support/Axhub Make/codex-integration/
~/Library/LaunchAgents/im.axhub.codexplus.make-companion.plist
~/Library/Logs/Axhub Make Codex++/
```

Windows:

```text
%LOCALAPPDATA%\Axhub Make\codex-integration\
Task Scheduler: Axhub Make Codex Companion
```

For migration only, `codex install` removes the exact owned legacy script file at `%APPDATA%/Codex++/user_scripts/axhub-make.user.js` on Windows or `~/.config/Codex++/user_scripts/axhub-make.user.js` on macOS. It does not remove the containing user-script directory or any third-party script.

## Make Startup

The installer records these fixed values in `config.json`:

- the absolute Node executable path;
- the absolute npm `npx-cli.js` path derived from the active `npx` invocation;
- the exact installed package version, such as `@axhub/make@0.6.10`;
- CDP port `9229`;
- Make origin `http://127.0.0.1:53817`.

On click, the companion first requests `/api/health` and accepts only `{ ok: true, role: "admin" }`. If Make is not healthy, it launches the exact recorded package version using Node plus `npx-cli.js`, with argument arrays equivalent to:

```text
npx --yes --package @axhub/make@<version> axhub-make --host 127.0.0.1 --port 53817 --no-open
```

The child is detached, hidden on Windows, and has ignored stdio. The companion waits up to 20 seconds for a valid health response. Concurrent clicks share one in-flight start promise so they cannot spawn duplicate servers.

## Installation And Lifecycle

`codex install` performs these operations in order:

1. Validate the platform, Node version, package metadata, npm CLI path, and packaged assets.
2. Discover Codex++ and official Codex default locations. Warn only when neither is found, while preserving support for custom locations because the fixed loopback CDP contract does not depend on an application-path lookup.
3. Atomically copy the companion files and sidebar injection source, remove only the exact owned legacy user-script file when present, and atomically write `config.json`.
4. Register and immediately start the background service. When Codex++ is running, the companion attaches to CDP, injects the sidebar source into the current `app://` renderer, and registers it for later document creation.
5. Print both exact next actions: open Codex++ normally, or for official Codex first quit a normal running instance and then run `codex open`.

On macOS, the LaunchAgent uses `ProgramArguments`, `RunAtLoad`, and `KeepAlive`; it never invokes a shell. On Windows, the installer writes Task Scheduler XML with the current user SID, `InteractiveToken`, and `LeastPrivilege`, imports it with `schtasks.exe`, then starts it. XML values are escaped and executable arguments use Windows command-line quoting.

`codex open` checks the CDP endpoint first. If it already contains an eligible `app://` target it returns success without launching another process. If it is absent and a normal official Codex process is already running, it prints the exact quit-and-retry instruction. Otherwise it launches the first discovered official Codex path using argument arrays, waits up to 20 seconds for an eligible target, and relies on the registered companion to inject the entry.

`codex doctor` checks platform support, Node/npm paths, Codex++ and official Codex default installation candidates, installed assets/config, startup registration, Make health, and the CDP endpoint. Missing either client at a default path is a warning because custom locations are valid; unavailable CDP reports both valid launch paths; missing Axhub-owned assets or startup registration is a failure.

`codex uninstall` stops and unregisters only the named Axhub service, removes the exact Axhub legacy user-script file when present, removes the exact Axhub integration root, and removes the exact LaunchAgent file on macOS. It does not remove Codex, Codex++, Node.js, npm caches, Make project data, or parent directories.

## Security And Compatibility

- Both network endpoints are fixed IPv4 loopback addresses.
- The renderer binding accepts only `{ id, action: "ensure-make" }`; arbitrary commands, paths, URLs, and arguments are rejected.
- The injected sidebar source accepts only the exact origin `http://127.0.0.1:53817` and opens only `/?surface=codex`.
- CDP attaches only to `page` targets whose URL starts with `app://`, registers only the Axhub sidebar source, and adds only the fixed binding.
- The installer uses child-process argument arrays. Task Scheduler XML is the only platform API that requires a serialized argument field.
- Codex++ uses private renderer/CDP integration, so a Codex or Codex++ DOM/bridge change can require an `@axhub/make` update. `codex install` is the update path.

## Verification

Vitest coverage must include:

- macOS and Windows path resolution;
- CLI routing without regressing the existing Make server CLI;
- npm CLI discovery and exact package-spec validation;
- LaunchAgent and Windows Task Scheduler XML generation, escaping, and least-privilege settings;
- idempotent install/uninstall with mocked platform commands and temporary homes;
- strict companion protocol, CDP target filtering, one-binding behavior, health validation, and deduplicated Make startup;
- macOS and Windows official-Codex candidate paths and launch arguments; CDP readiness, normal-instance refusal, and startup timeout through stubbed process/fetch dependencies;
- CDP injection source contract for one sidebar entry, document-start registration, current-renderer evaluation, and Codex built-in-browser bridge use.

The macOS host also receives a real local smoke install and click test. Windows behavior is verified on macOS through pure path/XML/runner contract tests; a Windows machine remains required for the final release smoke test of Task Scheduler registration and hidden startup.
