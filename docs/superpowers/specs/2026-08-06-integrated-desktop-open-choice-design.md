# ChatGPT And Cursor Integrated Open Choice Design

## Goal

Upgrade the existing `Open AI` menu entries for ChatGPT and Cursor so Make can launch them with the Axhub CDP integration. When an ordinary instance is already running and prevents CDP injection, Make asks the user whether to restart into the integrated mode or continue with the existing non-injected open behavior.

This change applies only to ChatGPT and Cursor. Other local applications and IDE entries keep their current behavior.

## User Experience

Clicking ChatGPT or Cursor first asks the Make server to inspect the selected desktop client:

- `ready`: the client is already running with the expected Axhub CDP target; reuse and focus it.
- `launchable`: the client is not running; start it directly with the existing Axhub CDP launcher, then open the current project.
- `restart-required`: the client is running without the required CDP target; show the restart choice dialog.
- `unavailable`: the supported client is not installed or cannot be discovered; show the existing open failure message.

The restart choice dialog contains exactly two action buttons:

- `Restart and inject`: request a graceful client exit, wait for the process to stop, relaunch with the fixed Axhub CDP arguments, then open the current project.
- `Open normally`: use the existing non-injected ChatGPT or Cursor project-open path.

Cancel is represented by the dialog close button, clicking the backdrop, or pressing Escape. Dismissing the dialog performs no launch action and does not change the stored default open preference.

The dialog warns that the client needs to restart and that the user should save in-progress work first. Make never force-kills the client. If graceful exit does not finish within the timeout, Make leaves the process running and tells the user to quit it manually before retrying.

## Architecture

Add a desktop-integration open API for the two supported providers. The API uses provider-specific adapters backed by the existing Codex and Cursor integration launchers instead of duplicating CDP ports, application discovery, or readiness polling.

The API supports three explicit operations:

1. `prepare`: inspect CDP and process state, reuse or launch when safe, and otherwise return `restart-required` without changing the running application.
2. `restart`: request graceful shutdown, wait for exit, launch with the provider's existing CDP configuration, and open the requested project.
3. `normal`: delegate to the existing non-injected local-app or IDE open flow.

The frontend keeps one pending provider request while the dialog is open. Closing the dialog clears it. Choosing either action disables the dialog actions until the request finishes and reports success or a provider-specific error through the existing toast system.

## Provider Mapping

| Menu entry | Integrated launcher | Non-injected fallback | Project open behavior |
| --- | --- | --- | --- |
| ChatGPT | Existing Codex CDP launcher on port `9229` | Existing ChatGPT/Codex local-app open path | Open the current Make project directory in ChatGPT/Codex |
| Cursor | Existing Cursor CDP launcher on port `9230` | Existing Cursor IDE open path | Open the current Make project directory in Cursor |

Codex++ remains compatible with the installed Codex integration, but it is not exposed as a separate menu provider in this change. The ChatGPT entry targets the official ChatGPT/Codex desktop client already represented by the current local-app option.

## Platform Behavior

macOS and Windows use argument-array process execution and the existing client discovery rules. Graceful shutdown is provider- and platform-specific, but it must target only the selected application's resolved processes. Linux keeps the current non-injected behavior because the desktop integrations support macOS and Windows only.

The restart operation validates the project path through the existing project-scoped API boundary. Renderer input cannot supply executable paths, CDP ports, arbitrary commands, or additional launch arguments.

## Error Handling

- CDP is ready but the client cannot be focused: report the focus failure without launching a competing process.
- The client is not installed: use the existing provider-specific not-installed/open failure message.
- Graceful shutdown times out: keep the existing process intact and ask the user to quit manually.
- CDP readiness times out after launch: report the existing launcher error and do not fall back automatically.
- Normal open fails: use the existing ChatGPT or Cursor failure message.
- A duplicate click while an operation is pending is ignored.

## Testing

Focused tests cover:

- pure state resolution for ready, launchable, restart-required, and unavailable clients;
- macOS and Windows graceful-shutdown command construction without force flags;
- exact reuse of Codex `9229` and Cursor `9230` launchers;
- project-scope validation and rejection of arbitrary provider or operation values;
- the two-button dialog, close/backdrop/Escape cancellation, pending state, and preference preservation;
- ChatGPT and Cursor menu routing while all other entries remain unchanged;
- existing non-injected open behavior for both providers;
- server build and a macOS desktop smoke test for both the direct-launch and restart-required paths.

Windows receives unit and integration coverage in this workspace and still requires a native Windows release smoke before publishing.

## Acceptance Criteria

- ChatGPT and Cursor can be started from `Open AI` with Axhub CDP injection when they are not already running.
- An already integrated instance is reused without prompting.
- An ordinary running instance opens the approved two-button restart dialog.
- Dialog dismissal performs no action; `Open normally` preserves the existing behavior; `Restart and inject` never force-kills a client.
- Other providers, Codex++ compatibility, the standard Make surface, and the conversation-free Codex surface keep their existing behavior.
