# Cursor Agents Project Open Design

## Goal

When the user chooses the integrated Cursor open action in Axhub Make, open or focus Cursor's desktop `Agents` window, attach the current Make project directory to that window, and keep Make in Cursor's built-in Browser. Do not create or retain a Cursor IDE window.

The explicit `Open normally` action remains unchanged and may open the project in Cursor IDE. This design changes only the integrated Cursor path; ChatGPT/Codex behavior and Codex++ compatibility remain unchanged.

## Confirmed Cursor Behavior

Cursor 3.14.27 was tested on macOS with CDP port `9230`:

1. Start or focus the standalone Agents window.
2. Invoke Cursor's desktop CLI with exactly one existing directory as a positional argument.
3. Do not pass IDE-forcing flags such as `--new-window`, `--reuse-window`, or `--classic`.

Cursor routes that directory to the active Agents window, creates or selects the corresponding Agents workspace/composer, and leaves `Cursor Agents` as the only top-level CDP page. The Agents DOM then exposes the selected `axhub-make` workspace and its file tree.

The earlier experiment that opened an IDE window used `--new-window`. Cursor explicitly excludes that flag from its Agents directory-routing path, so it is not representative of the desired launch flow.

## Chosen Approach

Use Cursor's native two-phase desktop routing:

1. Start or focus Agents with `--chat` and the existing Axhub CDP arguments.
2. After the `Cursor Agents` CDP target is ready, send the validated project directory as one bare positional argument through Cursor's desktop CLI.

CDP continues to power the existing Axhub entry and Cursor built-in Browser integration. It is not used to mutate Cursor's private workspace DOM or invoke an undocumented renderer command for directory handoff.

This approach is preferred over two alternatives:

- Passing the directory during a `--new-window` launch opens Cursor IDE and violates the user contract.
- Registering a workspace by evaluating private Cursor renderer APIs through CDP would be more version-sensitive and would duplicate behavior Cursor already implements natively.

## Open Flow

The desktop-integration coordinator distinguishes normal and integrated project opening.

For integrated Cursor opening:

1. Validate the requested path against the current Make project root using the existing project-scoped API boundary.
2. Inspect Cursor process and CDP state.
3. If Cursor is running without Axhub CDP, preserve the existing restart-or-open-normally dialog.
4. On direct launch or approved restart, launch Cursor Agents with `--chat` plus the fixed loopback CDP arguments.
5. On reuse, focus the existing Agents window before handing off the directory.
6. Wait for the expected `Cursor Agents` target.
7. Invoke the Cursor desktop router with only the absolute project directory as the positional argument.
8. Return success without calling `openIDEPath()`.

For `Open normally`, continue to call the existing Cursor IDE path opener. A failure in integrated mode never silently falls back to normal IDE opening.

## Server API Boundary

The coordinator's project-open adapter must receive the selected mode or expose separate integrated and normal project-open methods. This prevents the current shared `openProject()` callback from always calling `openIDEPath()` after a successful integrated launch.

The Cursor launcher gains one narrow operation for opening an Agents project directory. It accepts only the already validated absolute directory and injected test dependencies. Renderer input cannot supply an executable, CDP port, launch flag, URL, or arbitrary command.

ChatGPT continues to use its existing project-open implementation for both coordinator modes.

## Platform Commands

All process execution uses executable-plus-argument arrays with `shell: false`.

### macOS

- Cold Agents launch: `open -n <Cursor.app> --args --chat <fixed CDP arguments>`.
- Directory handoff: invoke `<Cursor.app>/Contents/Resources/app/bin/cursor` with `[targetPath]`.

The bundled Cursor CLI is resolved from the same discovered `.app` bundle, so the user does not need a global `cursor` shell command.

### Windows

- Cold Agents launch: invoke the discovered `Cursor.exe` with `--chat` and the fixed CDP arguments.
- Directory handoff: invoke the same discovered `Cursor.exe` with `[targetPath]` after Agents is ready.

Windows behavior receives argument-array unit coverage and requires a native Windows release smoke test before publication.

## Compatibility And Failure Behavior

- Integrated opening never passes `--new-window`, `--reuse-window`, `--classic`, `--add`, or another IDE-routing flag.
- If Cursor is running without Axhub CDP, Make asks whether to restart and inject or open normally, as it does today.
- If Agents does not expose the expected CDP target, return the existing compatibility/startup error.
- If the desktop directory handoff process fails, report a Cursor Agents project-open error and leave Agents running.
- Do not call `openIDEPath()` as a fallback from integrated mode.
- A post-handoff diagnostic compares top-level CDP targets before and after the handoff. If a new non-Agents workbench target appears, report Cursor-version incompatibility rather than treating the operation as successful.
- The normal Cursor action remains the explicit escape hatch for users who want the IDE window.

## Testing

Write failing tests before implementation for:

- macOS cold launch includes `--chat` and preserves the fixed CDP argument array;
- Windows cold launch includes `--chat` without a shell string;
- macOS resolves the bundled Cursor CLI from the discovered app and hands off exactly `[targetPath]`;
- Windows hands off exactly `[targetPath]` to the discovered `Cursor.exe`;
- integrated Cursor opening never calls `openIDEPath()`;
- normal Cursor opening still calls `openIDEPath()`;
- ready, direct-launch, restart, missing-installation, and handoff-failure coordinator states;
- rejection of paths outside the selected Make project;
- detection of a newly created non-Agents workbench target;
- ChatGPT and Codex++ behavior remains unchanged.

Focused verification includes the launcher and desktop-integration server tests, the relevant Make server build/typecheck, and a macOS desktop smoke confirming that the selected directory appears in Agents while no IDE top-level page is created.

## Acceptance Criteria

- Integrated Cursor opening shows or focuses the desktop Agents window only.
- The selected Make project directory appears as the active Agents workspace with its files available.
- Axhub Make still opens in Cursor's built-in Browser through the existing integration.
- No Cursor IDE window is created by the integrated flow.
- `Open normally` still opens Cursor IDE when explicitly selected.
- macOS and Windows use fixed argument arrays and require no globally installed Cursor CLI.
- Integrated failures are visible and never silently degrade into IDE opening.
