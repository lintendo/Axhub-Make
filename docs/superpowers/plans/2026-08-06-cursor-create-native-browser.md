# Cursor Create Native Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cursor Agents `Axhub Make` entry create Cursor's native Browser on demand, then open the fixed Make `surface=codex` URL with one click.

**Architecture:** Move all native Browser creation and navigation into the trusted loopback companion. The renderer sends one fixed `open-make` request and only renders entry state; the companion starts Make, uses CDP to create Browser when absent, waits for the native WebView, writes the fixed URL, and focuses the Browser tab.

**Tech Stack:** Node.js 22 ESM, Chrome DevTools Protocol, TypeScript 5, Vitest, pnpm.

## Global Constraints

- Support macOS and Windows without requiring pnpm, Git, administrator rights, MCP, a Cursor extension, or an external browser in the published user flow.
- Accept only the fixed `open-make` host action; do not accept renderer-provided commands, shortcuts, ports, or URLs.
- Keep the fixed CDP endpoint at `127.0.0.1:9230` and Make URL at `http://127.0.0.1:53817/?surface=codex`.
- Preserve unrelated dirty-worktree changes.
- Use pnpm for repository development and verification.

---

### Task 1: Fixed protocol and CDP Browser opener

**Files:**
- Modify: `bin/cursor-integration/host-protocol.mjs`
- Modify: `bin/cursor-integration/cdp-session.mjs`
- Modify: `src/server/__tests__/cursorIntegration-runtime.test.ts`

**Interfaces:**
- Consumes: `CdpSession.command(method, params)` and the existing `ensureMake(): Promise<{ origin: string; reused: boolean }>` callback.
- Produces: `parseHostRequest(raw) -> { id: string, action: 'open-make' }`, `browserShortcutForPlatform(platform)`, and `openMakeInCursorBrowser(session, options)`.

- [ ] **Step 1: Write failing protocol and shortcut tests**

Update the protocol test to require `open-make`, reject `ensure-make`, and add platform mapping assertions:

```ts
expect(parseHostRequest(JSON.stringify({ id: 'one', action: 'open-make' }))).toEqual({
  id: 'one',
  action: 'open-make',
});
expect(() => parseHostRequest(JSON.stringify({ id: 'old', action: 'ensure-make' }))).toThrow(/unsupported action/);
expect(browserShortcutForPlatform('darwin')).toEqual({ modifiers: 12, nativeVirtualKeyCode: 11 });
expect(browserShortcutForPlatform('win32')).toEqual({ modifiers: 10, nativeVirtualKeyCode: 66 });
expect(() => browserShortcutForPlatform('linux')).toThrow(/macOS and Windows/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-runtime.test.ts
```

Expected: FAIL because `open-make` is unsupported and `browserShortcutForPlatform` is not exported.

- [ ] **Step 3: Implement the fixed protocol parser**

Change `parseHostRequest` to accept only:

```js
if (value.action !== 'open-make') throw new Error('unsupported action');
return { id: value.id, action: value.action };
```

- [ ] **Step 4: Write failing CDP behavior tests**

Add tests with a fake `session.command` covering:

```ts
await openMakeInCursorBrowser(session, { platform: 'darwin', pollIntervalMs: 0 });
expect(command).toHaveBeenCalledWith('Input.dispatchKeyEvent', expect.objectContaining({
  type: 'rawKeyDown', modifiers: 12, key: 'B', code: 'KeyB', windowsVirtualKeyCode: 66,
}));
expect(command).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
  expression: expect.stringContaining('http://127.0.0.1:53817/?surface=codex'),
}));
```

Provide one response sequence where Browser is already present and assert no `Input.dispatchKeyEvent`; provide another where it appears after the shortcut; provide a timeout sequence and expect `/Unable to create Cursor built-in Browser/`.

- [ ] **Step 5: Run the focused test and verify RED**

Run the same focused Vitest command. Expected: FAIL because `openMakeInCursorBrowser` does not exist.

- [ ] **Step 6: Implement Browser inspection, creation, waiting, navigation, and focus**

Add these fixed behaviors to `cdp-session.mjs`:

```js
const MAKE_URL = 'http://127.0.0.1:53817/?surface=codex';

export function browserShortcutForPlatform(platform) {
  if (platform === 'darwin') return { modifiers: 12, nativeVirtualKeyCode: 11 };
  if (platform === 'win32') return { modifiers: 10, nativeVirtualKeyCode: 66 };
  throw new Error('Cursor Browser integration supports macOS and Windows only');
}
```

`openMakeInCursorBrowser` must:

1. call `Page.bringToFront`;
2. inspect `webview[partition="persist:cursor-browser"]` and both legacy and dynamic Browser tab selectors;
3. when either is missing, send `rawKeyDown` and `keyUp` for `KeyB` using the platform modifier mapping;
4. poll until both elements exist or timeout;
5. run one fixed `Runtime.evaluate` expression that assigns `MAKE_URL` to the partitioned WebView and dispatches pointerdown, pointerup, and click on the Browser tab;
6. reject when the final expression does not return `true`.

- [ ] **Step 7: Route binding requests through the complete open flow**

Inside `attachCursorTarget`, replace the binding handler's startup-only behavior with:

```js
const result = await ensureMake();
await openMakeInCursorBrowser(session, { platform });
payload = { id, ok: true, reused: result.reused };
```

Add `platform = process.platform` to `attachCursorTarget` options so tests can exercise macOS and Windows without changing global state.

- [ ] **Step 8: Run tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-runtime.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add bin/cursor-integration/host-protocol.mjs bin/cursor-integration/cdp-session.mjs src/server/__tests__/cursorIntegration-runtime.test.ts
git commit -m "fix: create Cursor browser before opening Make"
```

### Task 2: Renderer-only entry state and visible failures

**Files:**
- Modify: `bin/cursor-integration/axhub-make.cursor-launcher.js`
- Modify: `src/server/__tests__/cursorIntegration-user-script.test.ts`
- Modify: `src/server/__tests__/cursorIntegration-user-script-behavior.test.ts`

**Interfaces:**
- Consumes: the fixed host binding `window.__axhubMakeHostV1` and `axhub-make:host-response` event.
- Produces: one `open-make` request per accepted click and visible `idle`, `starting`, or `error` entry state.

- [ ] **Step 1: Write failing launcher contract tests**

Require the source to contain `action: "open-make"`, and require all WebView navigation logic to be absent from the renderer:

```ts
expect(source).toContain('action: "open-make"');
expect(source).not.toContain('webview[partition="persist:cursor-browser"]');
expect(source).not.toMatch(/webview\.src|new PointerEvent/);
expect(source).toContain('Open failed');
```

- [ ] **Step 2: Write failing behavioral tests**

Change the harness response to return only `{ id, ok: true, reused: true }`. Assert:

```ts
harness.entry()?.click();
await settle();
expect(harness.hostCalls).toEqual([{ id: expect.any(String), action: 'open-make' }]);
expect(harness.entry()?.textContent).toContain('Axhub Make');
```

For an error response, assert `dataset.axhubState === 'error'`, `title` contains the host error, and the visible label contains `Open failed` until the reset timer runs.

- [ ] **Step 3: Run launcher tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-user-script.test.ts src/server/__tests__/cursorIntegration-user-script-behavior.test.ts
```

Expected: FAIL because the current renderer still sends `ensure-make`, manipulates WebView DOM, and exposes errors only through `title`.

- [ ] **Step 4: Simplify the renderer to a fixed host request**

Remove `MAKE_ORIGIN`, `MAKE_URL`, and `openInCursorBrowser`. Rename `ensureMake` to `requestOpenMake` and send:

```js
binding(JSON.stringify({ id, action: 'open-make' }));
```

`openMake` should await only `requestOpenMake()`; successful native navigation is now the companion's responsibility.

- [ ] **Step 5: Preserve state across MutationObserver refreshes**

Store the current state separately from the DOM:

```js
let entryState = { state: 'idle', message: '' };
```

Render labels as `Axhub Make`, `Opening…`, and `Open failed`. `ensureEntry()` must call a pure `renderEntryState()` so a DOM mutation cannot immediately erase the error. Reset the error to idle after three seconds.

- [ ] **Step 6: Run launcher tests and verify GREEN**

Run the two focused launcher tests. Expected: all tests PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add bin/cursor-integration/axhub-make.cursor-launcher.js src/server/__tests__/cursorIntegration-user-script.test.ts src/server/__tests__/cursorIntegration-user-script-behavior.test.ts
git commit -m "fix: show Cursor launcher open state"
```

### Task 3: Doctor semantics and user documentation

**Files:**
- Modify: `src/server/cursorIntegration/install.ts`
- Modify: `src/server/__tests__/cursorIntegration-install.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `CursorAgentsDomState` with `nativeBrowser` and `browserTab` booleans.
- Produces: a healthy on-demand Browser doctor result when both elements are absent, and a warning only when one element exists without the other.

- [ ] **Step 1: Write failing doctor tests**

Change the missing-Browser case to expect:

```ts
expect(result.checks).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'native-browser', status: 'ok' }),
]));
```

Add a mismatched DOM test with `nativeBrowser: true, browserTab: false` and expect `native-browser: warn`.

- [ ] **Step 2: Run the doctor test and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-install.test.ts
```

Expected: FAIL because both missing elements currently produce a warning.

- [ ] **Step 3: Update Browser tab inspection selectors**

Keep the legacy selector and add dynamic selectors for current Cursor versions:

```js
document.querySelector('[role="tab"][id^="tab-editor-panel-group-browser-"]')
|| document.querySelector('[role="tab"][aria-controls^="tabpanel-editor-panel-group-browser-"]')
```

- [ ] **Step 4: Treat a fully absent Browser as an on-demand idle state**

Use these states:

```ts
const nativeBrowserConsistent = domState != null
  && domState.nativeBrowser === domState.browserTab;
```

Both present: `ok`, available. Both absent: `ok`, will be created on first click. Only one present: `warn`, DOM incompatible or incomplete.

- [ ] **Step 5: Update README user behavior**

Replace “只通过本地 CDP 复用 Cursor Agents 已有的原生 Browser WebView” with wording that says the integration creates the native Browser on the first click when needed and reuses it later.

- [ ] **Step 6: Run doctor tests and verify GREEN**

Run the focused install test. Expected: all tests PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/server/cursorIntegration/install.ts src/server/__tests__/cursorIntegration-install.test.ts README.md
git commit -m "docs: describe on-demand Cursor browser"
```

### Task 4: Full verification and local installed smoke

**Files:**
- Verify only: all Cursor integration files and release package contents.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: test, build, package, and live Cursor evidence for the one-click flow.

- [ ] **Step 1: Run all Cursor integration tests**

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-*.test.ts
```

Expected: all Cursor integration tests PASS.

- [ ] **Step 2: Run server type/build verification**

```bash
pnpm server:build
```

Expected: exit code 0.

- [ ] **Step 3: Build and test the release package**

```bash
pnpm release:make:prepare
pnpm release:make:test-local
```

Expected: release preparation and local package tests PASS, with all five Cursor integration assets included.

- [ ] **Step 4: Reinstall the exact local tarball**

Run the generated tarball through the published user path:

```bash
npx -y .release/make/axhub-make-0.6.10.tgz cursor install
```

Expected: the user LaunchAgent or Scheduled Task is updated without administrator privileges.

- [ ] **Step 5: Start a fresh CDP-enabled Cursor session**

Fully quit Cursor, then run:

```bash
npx -y .release/make/axhub-make-0.6.10.tgz cursor open
```

Expected: Cursor Agents contains one `Axhub Make` entry.

- [ ] **Step 6: Verify first-click creation and second-click reuse**

Before the first click, verify no `persist:cursor-browser` WebView exists. Click `Axhub Make` and verify exactly one native Browser tab is created, its partitioned WebView loads `http://127.0.0.1:53817/?surface=codex`, and the Make health endpoint is ready. Click again and verify the same Browser tab id is reused.

- [ ] **Step 7: Run doctor and whitespace checks**

```bash
npx -y .release/make/axhub-make-0.6.10.tgz cursor doctor
git diff --check
```

Expected: no failed doctor checks and no whitespace errors.

- [ ] **Step 8: Commit verification-only adjustments if required**

If verification requires a code or test correction, repeat the relevant RED/GREEN cycle and commit only those scoped files. If no correction is required, do not create an empty commit.
