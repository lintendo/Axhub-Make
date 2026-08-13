# Unified App Open CLI Design

**Date:** 2026-08-14

## Goal

Give `@axhub/make` one public CLI flow that ensures Axhub Make is available, launches a supported desktop Agent application, injects an `Axhub Make` entry, and activates the Make home page.

The CLI must not require a project directory or project ID. It also adds an optional background server mode with safe status and stop commands.

## User-facing contract

The package continues to expose the equivalent executable names `make`, `axhub-make`, and `make-server`. The examples below use `axhub-make` for clarity.

```text
Usage:
  axhub-make [options]
  axhub-make open <app> [options]
  axhub-make status [--json]
  axhub-make stop [--json]

Apps:
  codex
  cursor
  workbuddy
  traework
  qoderwork
```

Examples:

```bash
# Start Make in the foreground and open it in the system browser.
npx -y @axhub/make@latest

# Start or reuse Make in the background and open it in the system browser.
npx -y @axhub/make@latest --background

# Start or reuse Make, launch Cursor, inject Axhub Make, and activate it.
npx -y @axhub/make@latest open cursor

# Complete the same flow with Make running in the background.
npx -y @axhub/make@latest open cursor --background

# Inspect or stop the current user's Make Admin server.
npx -y @axhub/make@latest status
npx -y @axhub/make@latest stop
```

The existing server options remain available where meaningful:

- `--port <port>`
- `--host <host>`
- `--runtime-origin <origin>`
- `--admin-root <path>`
- `--axhub-online-base-url <url>`
- `--dev`
- `--no-open`
- `--log-file [path]`
- `--background`
- `--json`

`open` additionally accepts:

- `--app-path <path>` to override desktop application discovery for this invocation;
- `--restart` to authorize a graceful restart without an interactive prompt.

`--background` is a common Make startup option rather than an `open`-only option. Without it, a Make server created by the current invocation stays attached to the terminal. With it, the command starts a detached Make child, waits for readiness, completes any requested App operation, and exits.

`--no-open` controls the system browser only. It does not suppress activation of the injected Make surface requested by `open <app>`.

## Removed public interface

Remove the complete legacy command group:

```text
axhub-make codex install
axhub-make codex open
axhub-make codex doctor
axhub-make codex uninstall
```

Do not retain aliases or compatibility routing. A call beginning with `axhub-make codex` is an unknown command and should direct the user to `axhub-make open codex` when appropriate.

Remove the old Codex++ persistent integration implementation and its packaged `bin/codex-integration` assets. The new `open codex` flow is one-shot and uses Agent Surface directly. It does not install a LaunchAgent, Task Scheduler task, companion, user script, or persistent Codex++ integration.

The release does not detect, migrate, or remove artifacts installed by an older `codex install`. Historical design and plan documents remain unchanged as historical records.

## Supported applications

The initial public `open` application IDs are:

| CLI App ID | Agent Surface host | Behavior |
| --- | --- | --- |
| `codex` | `codex` | Launch or reuse the supported Codex/ChatGPT desktop host, then inject and activate Make. |
| `cursor` | `cursor` | Launch or reuse Cursor Agents, then inject and activate Make. |
| `workbuddy` | `workbuddy` | Launch or reuse WorkBuddy, then inject and activate Make. |
| `traework` | `traework` | Launch or reuse TRAEWORK, then inject and activate Make. |
| `qoderwork` | `qoderwork` | Launch or reuse QoderWork, then inject and activate Make. |

OpenCode is excluded because it does not support Agent Surface injection. The experimental `trae` adapter is not part of the public Make CLI until it independently satisfies the supported-host qualification checks.

The command does not pass a project directory, open a project deep link, select a workspace, or resolve a Make project. It leaves the target application's current workspace unchanged.

## Make entry

The injected entry has the stable ID `axhub-make` and opens the Make home page at the reused or newly started Make origin:

```text
http://<make-origin>/?surface=codex
```

It does not add `projectId`. The Make UI remains responsible for project selection and recent-project behavior.

The entry keeps the existing Axhub Make icon, `/api/health` health URL, refresh action, and copy-URL action. The CLI requests `activate: true`, so a successful `open <app>` immediately displays Make. Existing opens initiated inside the Make management UI retain their current `activate: false` behavior and do not forcibly replace the user's native Agent page.

## Architecture

The implementation has three focused units.

### CLI router

The CLI router parses the default serve flow and the `open`, `status`, and `stop` commands. It validates option applicability, selects human or JSON output, and maps result classes to exit codes. It does not construct CDP commands, application launch commands, or process termination commands.

The parser uses one explicit command model rather than continuing to special-case the first argument. Server options are shared by the default serve flow and `open`; lifecycle-only options are rejected by commands where they do not apply.

### Make service controller

The Make service controller owns:

- reading the current user's global Admin server-info file;
- validating the recorded PID, origin, project root, and `/api/health` response;
- reusing a healthy Make Admin server;
- starting a foreground server in the current process;
- spawning the package CLI as a detached background process with argument arrays and `shell: false`;
- waiting for a background server to become healthy;
- reporting `running`, `stopped`, or `stale` state;
- stopping a positively identified Make process and cleaning stale server-info.

The existing global server-info record already contains PID, port, host, origin, project root, and start time. The controller treats that record as a discovery hint, not sufficient proof of process identity. A reusable or stoppable server must also answer `/api/health` as the Make Admin role, and the health payload's server identity must match the record.

Background startup is a detached one-shot child, not a daemon installation. No LaunchAgent, Windows Task Scheduler entry, service registration, update manager, or crash supervisor is added.

The parent constructs a serve-only child argument vector. It forwards applicable server configuration, forces `--no-open`, and removes `open`, the App ID, `--background`, `--json`, `--app-path`, and `--restart`. The child therefore starts exactly one Make server and cannot recursively spawn another background process or repeat the App operation.

The default background log lives under the current user's global Make state directory. `--log-file` overrides it. Background startup redirects stdout and stderr to that file so startup failures remain diagnosable after the parent exits.

### App open controller

The App open controller owns:

- mapping public App IDs to Agent Surface hosts;
- resolving or accepting an explicit desktop application path;
- inspecting installation, running-process, CDP, and compatible renderer state;
- starting an App that is not running;
- coordinating a confirmed graceful restart when an App is running without the required CDP endpoint;
- building the Make home-page Agent Surface entry;
- injecting the entry and activating it;
- serializing concurrent opens for the same App across CLI processes.

It reuses the existing Agent Surface integration and desktop client lifecycle primitives. It does not duplicate provider launch protocols in the CLI layer.

Cross-process serialization uses one short-lived lock record per App under the current user's global Make state directory. Lock acquisition is atomic, records the owner PID and acquisition time, and has bounded waiting. A lock whose owner process no longer exists can be removed as stale. The lock is released in `finally` after success or failure. It protects only inspection, optional restart, launch, and injection; it is not a resident coordinator.

`--app-path` affects only the current invocation. It is not silently persisted into Make's tool-open settings.

## Command flows

### Default serve

1. Parse server and lifecycle options.
2. Check for an existing positively identified Make Admin server.
3. If one exists, reuse it, open the system browser unless `--no-open` is present, print the origin, and exit.
4. Without `--background`, start Make in the current process, open the browser unless disabled, and keep the process attached.
5. With `--background`, spawn a detached Make child with browser opening disabled in the child, wait for health readiness, open the browser from the parent unless disabled, print the origin and log path, then exit.

### `open <app>`

1. Parse the App ID, shared server options, `--app-path`, `--restart`, and lifecycle options.
2. Reuse or start a positively identified Make Admin server. A new server is foreground or background according to `--background`.
3. Inspect the target App.
4. If the App is not running, start it with the host's CDP launch configuration and wait for a compatible renderer.
5. If the App is already CDP-ready, reuse it.
6. If the App is running without the required CDP endpoint:
   - with `--restart`, gracefully close it and restart it;
   - in an interactive TTY, explain the interruption and request confirmation before closing it;
   - in a non-interactive environment without `--restart`, return `restart-required` without closing anything.
7. Inject or update the `axhub-make` entry and activate it.
8. Print the App and Make origin. A background invocation exits. A foreground invocation that created Make keeps serving; an invocation that reused an existing Make server exits.

Declining the interactive restart returns `restart-declined` without changing the App. Graceful close has a bounded wait and returns `app-exit-timeout` rather than escalating to an unrequested force kill.

### `status`

1. Read global Admin server-info.
2. Validate the record, PID, and health identity.
3. Report:
   - `running` when identity checks pass;
   - `stopped` when no usable record or process exists;
   - `stale` when a record exists but cannot be safely matched to a healthy Make process.
4. Return exit code 0 only for `running`; return exit code 1 for `stopped` or `stale`.

### `stop`

1. Perform the same identity checks as `status` immediately before signaling.
2. If Make is already stopped, remove a provably stale server-info file if present and return success. Repeated `stop` is idempotent.
3. If identity is ambiguous or mismatched, return `server-identity-mismatch` and do not signal any process.
4. Send a graceful termination signal to the identified Make process. Use platform-specific argument arrays and `shell: false` where Windows requires a system process command.
5. Wait for process exit with a bounded timeout, then remove the matching server-info record.
6. Do not kill a process merely because it owns the configured port.

## Concurrency and ownership

Concurrent attempts to start Make must converge on one healthy global Admin server. If one process wins the listen race, another invocation re-probes identity before reporting a port conflict. A port occupied by a non-Make service remains `make-port-occupied` and is never terminated.

Concurrent `open` operations are serialized per App through the current-user lock records. Injection remains idempotent: a repeated open updates the existing entry and activates the existing or refreshed surface. Opens for different Apps do not block one another after Make is healthy.

The service controller manages the current user's global Make Admin regardless of whether it was originally started in the foreground or background. It does not manage project runtime servers or unrelated Node processes.

## Output and exit codes

Human-readable output is the default. `--json` emits one stable result object and suppresses conversational prompts unless the operation cannot continue without confirmation.

Common result shape:

```json
{
  "ok": true,
  "code": "surface-opened",
  "message": "Axhub Make opened in Cursor.",
  "origin": "http://localhost:53817",
  "app": "cursor",
  "background": true,
  "reusedServer": false
}
```

Exit codes:

- `0`: operation succeeded;
- `1`: a valid operation could not complete, or `status` reports non-running state;
- `2`: invalid command, option, App ID, or option combination.

Stable failure codes include:

- `unsupported-app`
- `app-not-installed`
- `app-path-required`
- `restart-required`
- `restart-declined`
- `app-exit-timeout`
- `make-start-timeout`
- `make-port-occupied`
- `server-identity-mismatch`
- `surface-injection-failed`

Lower-level Agent Surface diagnostics may be included as structured detail, but the Make CLI owns the stable top-level code and message.

## Safety boundaries

- Restarting a desktop App always requires interactive confirmation or explicit `--restart` authorization.
- The restart flow attempts graceful application exit and never silently force-kills an App.
- `stop` sends no signal unless server-info, live PID, health role, origin, and server identity agree.
- All child processes use executable-plus-argument arrays. No API or CLI path builds shell command strings.
- Windows requires a resolved or explicit App executable path when reliable discovery is unavailable.
- Background state, logs, and temporary lifecycle files stay under the ignored current-user Make state directory, never in the repository.
- The feature does not install persistent operating-system services.

## Code and packaging scope

Expected implementation areas are:

- `src/server/cli.ts` and its focused parser/router helpers;
- a Make service lifecycle controller under `src/server/`;
- a CLI App open controller under `src/server/`;
- `src/server/agentSurfaceIntegration.ts` for a projectless Make home entry and configurable activation;
- existing desktop lifecycle and Agent Surface integration only where shared primitives need extension;
- `README.md` and CLI help;
- release staging and package-content assertions;
- deletion of the public legacy `src/server/codexIntegration/` command/install implementation and `bin/codex-integration/` assets once no remaining runtime consumer depends on them.

Historical specifications and plans are not rewritten. Unrelated management UI flows remain in scope only for regression verification, not redesign.

## Verification

### CLI unit tests

Cover:

- default serve, `open`, `status`, and `stop` parsing;
- shared and command-specific option validation;
- all five public App IDs and rejection of OpenCode, Trae, and unknown IDs;
- help text, human output, JSON output, and exit-code mapping;
- rejection of the removed `codex` command group with an `open codex` hint;
- foreground and background routing.

### Service controller tests

Cover:

- reuse of a healthy matching Admin server;
- missing, malformed, dead-PID, stale, and identity-mismatched server-info;
- detached spawn arguments, `shell: false`, log redirection, unref, and readiness wait;
- startup timeout and non-Make port occupancy;
- `running`, `stopped`, and `stale` status;
- idempotent stop;
- refusal to signal on any identity mismatch;
- graceful termination and server-info cleanup on macOS and Windows command construction.

### App controller tests

Cover:

- mapping all five public App IDs;
- App path discovery and explicit per-call override;
- launch when stopped and reuse when CDP-ready;
- interactive restart acceptance and rejection;
- non-interactive `restart-required`;
- explicit `--restart`;
- bounded graceful-exit timeout;
- home-page entry construction without a project ID;
- injection with `activate: true` for CLI and retained `activate: false` for management UI flows;
- per-App serialization and repeated idempotent injection;
- cross-process lock acquisition, bounded wait, release after failure, and dead-owner recovery;
- Windows App path requirements.

### Integration and release verification

- Run a real Make Admin server and exercise service discovery, status, background startup, and stop with isolated user state.
- Exercise CLI open orchestration against mocked Agent Surface boundaries.
- Keep focused management API regressions for the existing in-app desktop open flow.
- Assert the npm package includes the new runtime files and excludes the removed legacy `bin/codex-integration` assets.
- Update README command examples and remove the Codex++ install workflow.
- Run source-level diff and package-content hygiene checks.

### Desktop smoke verification

On macOS, verify cold launch, CDP-ready reuse, confirmed restart, entry injection, and immediate Make activation for Codex/ChatGPT, Cursor, WorkBuddy, TRAEWORK, and QoderWork.

On Windows, unit and packaging coverage for paths and process arguments is mandatory. A release that claims verified Windows desktop behavior additionally requires smoke coverage on a Windows machine for installation discovery, restart, injection, activation, background Make startup, status, and stop.

No temporary HTML validation or HTML report is introduced.

## Non-goals

- Opening or selecting a project directory in the target App.
- Resolving or accepting a Make project ID.
- Injecting an arbitrary URL or arbitrary Agent Surface configuration.
- Supporting OpenCode injection.
- Publicly exposing the experimental Trae host.
- Preserving the old `axhub-make codex` command group.
- Migrating or uninstalling artifacts created by older Codex++ integration releases.
- Installing a daemon, companion, LaunchAgent, Task Scheduler task, or crash supervisor.
- Force-killing desktop Apps or terminating unknown port owners.
