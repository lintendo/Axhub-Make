# Codex CDP Integration And Conversation-Free Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one `@axhub/make` install serve both Codex++ and official Codex with a CDP-injected sidebar entry that opens a conversation-free Make page while retaining direct AI tools.

**Architecture:** The installer keeps one current-user Companion service and copies a sidebar source into its owned install directory. The Companion injects that source into eligible `app://` renderers over CDP; Codex++ supplies CDP directly, while `codex open` launches official Codex with the same loopback debug port. The Admin UI parses `surface=codex` once and passes explicit capabilities into existing presentation, dialog, and event boundaries.

**Tech Stack:** TypeScript 5, React 18.2, Vitest, Node.js 22 built-in WebSocket/fetch, Chrome DevTools Protocol, macOS LaunchAgent, Windows Task Scheduler.

## Global Constraints

- Development commands use `pnpm`; shipped runtime must remain `npm`/`npx` safe.
- Support only macOS and Windows for desktop integration; reject other platforms with a clear error.
- Use Node.js 22 or newer and zero production dependencies in `bin/codex-integration/`.
- Use loopback-only CDP at `127.0.0.1:9229` and Make at `http://127.0.0.1:53817`.
- Never execute arbitrary renderer input; binding accepts only `{ id, action: 'ensure-make' }`.
- Never force-quit Codex; official Codex launch must refuse when an ordinary running instance prevents CDP startup.
- Do not modify Codex or Codex++ app files, use CSP bypass, inject an iframe, add MCP, create a second Make port, or open an external browser.
- Preserve all existing standard-surface behavior. `surface=codex` is a UI capability profile, not a security boundary.
- Preserve direct image, prototype, canvas, annotation, prompt-optimization, version-description, and prompt-copy paths in the Codex surface.
- Make only scoped changes and never stage unrelated worktree files.

---

### Task 1: Define CDP Injection Asset And Installer Migration

**Files:**
- Delete: `bin/codex-integration/axhub-make.user.js`
- Create: `bin/codex-integration/axhub-make.sidebar.js`
- Modify: `src/server/codexIntegration/paths.ts`
- Modify: `src/server/codexIntegration/install.ts`
- Modify: `src/server/__tests__/codexIntegration-paths.test.ts`
- Modify: `src/server/__tests__/codexIntegration-install.test.ts`
- Modify: `src/server/__tests__/codexIntegration-user-script.test.ts`
- Modify: `scripts/release-make.mjs`
- Modify: `scripts/release-make.test.mjs`

**Interfaces:**
- Consumes: `resolveCodexIntegrationPaths`, `CODEX_INTEGRATION_ASSET_FILES`, the prior exact legacy script names.
- Produces: `paths.sidebarSourceFile`, `paths.legacyUserScriptFile`, packaged `axhub-make.sidebar.js`, and an install that copies every asset beneath `installRoot`.

- [ ] **Step 1: Write the failing migration tests**

In `codexIntegration-paths.test.ts`, assert that both platforms resolve an owned source and only the historical legacy file outside the install root:

```ts
expect(paths.sidebarSourceFile).toBe(path.posix.join(paths.installRoot, 'axhub-make.sidebar.js'));
expect(paths.legacyUserScriptFile).toBe(path.posix.join(
  homeDir,
  '.config/Codex++/user_scripts/axhub-make.user.js',
));
```

In the macOS and mapped-Windows install tests, pre-create the legacy file, run `installCodexIntegration`, and assert:

```ts
await expect(fs.stat(paths.legacyUserScriptFile)).rejects.toMatchObject({ code: 'ENOENT' });
await expect(fs.readFile(paths.sidebarSourceFile, 'utf8')).resolves.toBe('asset:axhub-make.sidebar.js\n');
```

In the release test, assert the packed tarball contains `bin/codex-integration/axhub-make.sidebar.js` and does not require the legacy user script.

- [ ] **Step 2: Run the new installer tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-install.test.ts src/server/__tests__/codexIntegration-user-script.test.ts scripts/release-make.test.mjs
```

Expected: assertions fail because `sidebarSourceFile` and `legacyUserScriptFile` do not exist and the package still copies `axhub-make.user.js` into Codex++.

- [ ] **Step 3: Implement owned-source installation and exact legacy cleanup**

Replace the path fields with:

```ts
sidebarSourceFile: pathApi.join(installRoot, 'axhub-make.sidebar.js'),
legacyUserScriptFile: platform === 'darwin'
  ? path.posix.join(homeDir, '.config/Codex++/user_scripts/axhub-make.user.js')
  : path.win32.join(appData, 'Codex++', 'user_scripts', 'axhub-make.user.js'),
```

Rename the distributed source to `axhub-make.sidebar.js`, include it in `CODEX_INTEGRATION_ASSET_FILES`, and copy every listed asset with `pathApi.join(paths.installRoot, asset)`. After a successful copy, call `fileSystem.rm(paths.legacyUserScriptFile, { force: true })`; never remove its parent directory. Make doctor require the owned source asset and make uninstall remove the exact legacy file before removing the validated owned root. Update release staging to include only the renamed source.

The source must remain idempotent and use the fixed in-app URL:

```js
const MAKE_URL = 'http://127.0.0.1:53817/?surface=codex';
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-install.test.ts src/server/__tests__/codexIntegration-user-script.test.ts
node --test scripts/release-make.test.mjs
```

Expected: every selected test passes; install writes no file into `Codex++/user_scripts` and uninstall only removes the owned legacy filename.

- [ ] **Step 5: Commit the migration unit**

```bash
git add -A -- bin/codex-integration/axhub-make.user.js bin/codex-integration/axhub-make.sidebar.js src/server/codexIntegration/paths.ts src/server/codexIntegration/install.ts src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-install.test.ts src/server/__tests__/codexIntegration-user-script.test.ts scripts/release-make.mjs scripts/release-make.test.mjs
git commit -m "feat: migrate Codex sidebar source into companion"
```

### Task 2: Inject The Sidebar Into Current And Future CDP Renderers

**Files:**
- Modify: `bin/codex-integration/cdp-session.mjs`
- Modify: `bin/codex-integration/cdp-session.d.mts`
- Modify: `bin/codex-integration/companion.mjs`
- Modify: `bin/codex-integration/companion.d.mts`
- Modify: `src/server/__tests__/codexIntegration-runtime.test.ts`

**Interfaces:**
- Consumes: installed source text, `HOST_BINDING`, `listCodexTargets`, and `createMakeEnsurer`.
- Produces: `attachCodexTarget(target, { ensureMake, sidebarSource, ... })`, which registers the source for new documents and evaluates it in the current renderer without CSP bypass.

- [ ] **Step 1: Write the failing CDP command-order test**

Extend `FakeWebSocket` in `codexIntegration-runtime.test.ts` and call:

```ts
await attachCodexTarget(target, {
  WebSocketImpl: FakeWebSocket,
  ensureMake: vi.fn(async () => ({ origin: validConfig.origin, reused: true })),
  sidebarSource: 'window.__axhubMakeSidebarSource = true;',
});
```

Assert that the sent protocol methods include this ordered prefix and never include bypass CSP:

```ts
expect(socket.sent.slice(0, 5).map((message) => message.method)).toEqual([
  'Page.enable',
  'Runtime.enable',
  'Runtime.addBinding',
  'Page.addScriptToEvaluateOnNewDocument',
  'Runtime.evaluate',
]);
expect(socket.sent.some((message) => message.method === 'Page.setBypassCSP')).toBe(false);
expect(socket.sent[3]?.params?.source).toBe('window.__axhubMakeSidebarSource = true;');
expect(socket.sent[4]?.params?.expression).toBe('window.__axhubMakeSidebarSource = true;');
```

Add a companion test that passes `readSidebarSource: vi.fn(async () => source)` and verifies its `attachTarget` dependency receives exactly that source once per attached target.

- [ ] **Step 2: Run the runtime test and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-runtime.test.ts
```

Expected: the test fails because `attachCodexTarget` has no `sidebarSource` option and does not call `Page.enable`, `Page.addScriptToEvaluateOnNewDocument`, or the initial evaluation.

- [ ] **Step 3: Add explicit source injection to the CDP session**

In `attachCodexTarget`, validate that `sidebarSource` is a non-empty string and, after connection, execute:

```js
await session.command('Page.enable');
await session.command('Runtime.enable');
await session.command('Runtime.addBinding', { name: HOST_BINDING });
await session.command('Page.addScriptToEvaluateOnNewDocument', { source: sidebarSource });
await session.command('Runtime.evaluate', { expression: sidebarSource });
```

Retain the existing `Runtime.bindingCalled` handler and use the event execution context only for the host response. Do not call `Page.setBypassCSP`, `Runtime.callFunctionOn`, or any renderer command derived from a binding payload.

In `companion.mjs`, load `axhub-make.sidebar.js` from `dirname(configPath)` exactly once during CLI boot. Pass the source into `createCompanion`; validate non-empty text and make the injected `readSidebarSource` dependency injectable for tests. Preserve current polling, target filtering, closed-socket idle behavior, and session cleanup.

- [ ] **Step 4: Run focused runtime tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-runtime.test.ts
```

Expected: CDP test proves current evaluation and document-start registration use the same source; existing host-protocol and Make-start tests remain green.

- [ ] **Step 5: Commit the CDP injection unit**

```bash
git add bin/codex-integration/cdp-session.mjs bin/codex-integration/cdp-session.d.mts bin/codex-integration/companion.mjs bin/codex-integration/companion.d.mts src/server/__tests__/codexIntegration-runtime.test.ts
git commit -m "feat: inject Axhub sidebar through Codex CDP"
```

### Task 3: Add The Official Codex Cross-Platform Launcher

**Files:**
- Create: `src/server/codexIntegration/launcher.ts`
- Modify: `src/server/codexIntegration/paths.ts`
- Modify: `src/server/codexIntegration/install.ts`
- Modify: `src/server/codexIntegration/cli.ts`
- Modify: `src/server/cli.ts`
- Create: `src/server/__tests__/codexIntegration-launcher.test.ts`
- Modify: `src/server/__tests__/codexIntegration-cli.test.ts`
- Modify: `src/server/__tests__/codexIntegration-command.test.ts`

**Interfaces:**
- Consumes: `CodexIntegrationPaths`, `CODEX_INTEGRATION_DEBUG_PORT`, `listCodexTargets` semantics, and the existing CLI context runner/filesystem patterns.
- Produces: `openCodexIntegration(context): Promise<{ launched: boolean; reused: boolean; appPath: string }>` and `axhub-make codex open`.

- [ ] **Step 1: Write failing macOS, Windows, ready-port, and conflict tests**

Create `codexIntegration-launcher.test.ts` with fake `fileSystem`, `run`, `launch`, `probeTargets`, and `sleep` dependencies. Cover:

```ts
expect(resolveCodexIntegrationPaths(macContext).codexCandidates).toEqual([
  '/Applications/Codex.app',
  path.posix.join(homeDir, 'Applications/Codex.app'),
]);

await expect(openCodexIntegration({
  ...macContext,
  probeTargets: vi.fn(async () => [{ url: 'app://-/index.html' }]),
})).resolves.toMatchObject({ reused: true, launched: false });

await expect(openCodexIntegration({
  ...macContext,
  probeTargets: vi.fn(async () => []),
  isCodexRunning: vi.fn(async () => true),
})).rejects.toThrow(/quit Codex.*codex open/i);
```

For the new launch case assert the exact arguments:

```ts
expect(launch).toHaveBeenCalledWith('open', [
  '-n', macCodexPath, '--args',
  '--remote-debugging-port=9229',
  '--remote-allow-origins=http://127.0.0.1:9229',
]);
expect(windowsLaunch).toHaveBeenCalledWith(windowsCodexPath, [
  '--remote-debugging-port=9229',
  '--remote-allow-origins=http://127.0.0.1:9229',
]);
```

Assert a launch that never observes an `app://` target throws a 20-second readiness timeout. Add CLI tests that `codex open` prints a ready/reused result and rejects additional arguments.

- [ ] **Step 2: Run launcher and CLI tests to verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-launcher.test.ts src/server/__tests__/codexIntegration-cli.test.ts src/server/__tests__/codexIntegration-command.test.ts
```

Expected: tests fail because no `codex open` command, official Codex candidates, launcher, or launch dependency exists.

- [ ] **Step 3: Implement safe discovery, launch, and readiness polling**

Add `codexCandidates` for macOS and Windows next to existing `codexPlusCandidates`. Implement `openCodexIntegration` with this fixed control flow:

```ts
const existingTargets = await listCodexTargets(CODEX_INTEGRATION_DEBUG_PORT, fetchImpl);
if (existingTargets.length > 0) return { launched: false, reused: true, appPath: '' };
if (await isCodexRunning(platform, run)) {
  throw new Error('Codex is already running without Axhub CDP. Quit Codex completely, then run axhub-make codex open again.');
}
const appPath = await firstExistingFile(fileSystem, paths.codexCandidates);
if (!appPath) throw new Error('Official Codex was not found in its default install location. Open Codex++ instead or install Codex first.');
await launchCodex(platform, appPath, launch);
await waitForCodexTarget({ port: 9229, fetch: fetchImpl, sleep, maxAttempts: 20, retryDelayMs: 1000 });
return { launched: true, reused: false, appPath };
```

Use `spawn` with `{ detached: true, stdio: 'ignore', windowsHide: true }` for the Windows executable and `open -n <app-path> --args ...` as an argument array on macOS. `isCodexRunning` uses `pgrep -x Codex` on macOS and `tasklist.exe /FI "IMAGENAME eq Codex.exe" /NH` on Windows. No shell string, kill command, retrying alternate port, or automatic Make launch is permitted.

Pass launcher dependencies through the existing install context only where needed for CLI construction. Update install warnings and doctor checks so Codex++ and official Codex are independently reported, and show both supported daily-launch instructions in `nextAction`.

- [ ] **Step 4: Run focused server tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-launcher.test.ts src/server/__tests__/codexIntegration-cli.test.ts src/server/__tests__/codexIntegration-command.test.ts src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-install.test.ts
```

Expected: macOS and Windows contracts pass; the port-ready path never launches a second client and the running-normal-client path never invokes a kill operation.

- [ ] **Step 5: Commit the launcher unit**

```bash
git add src/server/codexIntegration/launcher.ts src/server/codexIntegration/paths.ts src/server/codexIntegration/install.ts src/server/codexIntegration/cli.ts src/server/cli.ts src/server/__tests__/codexIntegration-launcher.test.ts src/server/__tests__/codexIntegration-cli.test.ts src/server/__tests__/codexIntegration-command.test.ts src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-install.test.ts
git commit -m "feat: launch official Codex with CDP"
```

### Task 4: Establish The Make Surface Capability Contract

**Files:**
- Create: `src/index/app/makeSurface.ts`
- Create: `src/index/app/makeSurface.test.ts`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/index-page/resourceDeepLink.ts`
- Modify: `src/index/app/index-page/resourceDeepLink.test.ts`

**Interfaces:**
- Consumes: browser `location.search` and existing URL/deep-link utilities.
- Produces: `MakeSurface`, `MakeSurfaceCapabilities`, `resolveMakeSurface(search)`, `resolveMakeSurfaceCapabilities(surface)`, and `preserveMakeSurface(url, surface)`.

- [ ] **Step 1: Write the failing pure capability and URL tests**

Create tests with the exact expected values:

```ts
expect(resolveMakeSurface('')).toBe('standard');
expect(resolveMakeSurface('?surface=codex')).toBe('codex');
expect(resolveMakeSurface('?surface=unknown')).toBe('standard');
expect(resolveMakeSurfaceCapabilities('codex')).toEqual({
  conversationUi: false,
  externalOpenMenu: false,
  directAiTools: true,
});
expect(preserveMakeSurface('/?projectId=demo', 'codex')).toBe('/?projectId=demo&surface=codex');
```

Add a deep-link test proving an existing `surface=standard` is replaced with `surface=codex` only when the caller supplies the Codex surface.

- [ ] **Step 2: Run capability tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/makeSurface.test.ts src/index/app/index-page/resourceDeepLink.test.ts
```

Expected: module resolution fails because the surface helper does not exist.

- [ ] **Step 3: Implement immutable surface parsing and URL preservation**

Create `makeSurface.ts` with:

```ts
export type MakeSurface = 'standard' | 'codex';
export interface MakeSurfaceCapabilities {
  conversationUi: boolean;
  externalOpenMenu: boolean;
  directAiTools: boolean;
}
export function resolveMakeSurface(search: string): MakeSurface { /* URLSearchParams, codex only */ }
export function resolveMakeSurfaceCapabilities(surface: MakeSurface): MakeSurfaceCapabilities { /* fixed matrix */ }
```

Use `new URL(url, window.location.origin)` or an equivalent explicit base in `preserveMakeSurface`; set the query parameter only for `codex` and return a root-relative URL when the input was root-relative. In `IndexPage`, memoize the parsed surface once, derive the capabilities once, and pass the object to the builders rather than re-reading `window.location.search` in leaf components.

- [ ] **Step 4: Run capability tests and existing deep-link tests**

Run:

```bash
pnpm exec vitest run src/index/app/makeSurface.test.ts src/index/app/index-page/resourceDeepLink.test.ts
```

Expected: parser and URL preservation tests pass; standard URLs retain current behavior.

- [ ] **Step 5: Commit the surface contract unit**

```bash
git add src/index/app/makeSurface.ts src/index/app/makeSurface.test.ts src/index/app/IndexPage.tsx src/index/app/index-page/resourceDeepLink.ts src/index/app/index-page/resourceDeepLink.test.ts
git commit -m "feat: add Codex surface capability contract"
```

### Task 5: Remove Conversation UI Without Removing Direct AI

**Files:**
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/hooks/useIndexPageSidebarPropsBuilder.ts`
- Modify: `src/index/app/hooks/useIndexPageSidebarPropsBuilder.test.ts`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts`
- Modify: `src/index/components/app/IndexPageDesktop.tsx`
- Modify: `src/index/components/app/IndexPageLayout.tsx`
- Modify: `src/index/components/content/PresentationArea.tsx`
- Modify: `src/index/components/content/PresentationToolbar.tsx`
- Modify: `src/index/components/content/PresentationToolbar.test.ts`
- Modify: `src/index/components/sidebar/ContentPanel.tsx`
- Modify: `src/index/components/sidebar/NewSidebar.tsx`
- Modify: `src/index/components/SettingsDialog.tsx`
- Modify: `src/index/components/SettingsDialog.source.test.ts`
- Modify: `src/index/components/PromptActionButton.tsx`
- Modify: `src/index/components/PromptActionButton.source.test.ts`
- Modify: `src/index/components/dialogs/CreateDialogContainer.tsx`

**Interfaces:**
- Consumes: `MakeSurfaceCapabilities` from Task 4 and the existing assistant controller, dialog props, builders, toolbar, and prompt action contracts.
- Produces: a Codex surface with no mounted `AssistantPanel`, no open menu, no chat settings/execution, and unchanged direct-AI callbacks.

- [ ] **Step 1: Write failing source and builder tests for the capability boundary**

Extend builder tests to pass:

```ts
surfaceCapabilities: { conversationUi: false, externalOpenMenu: false, directAiTools: true },
```

and assert the resulting sidebar/presentation props have `webAgentPanelOpen: false`, `aiPanelMode: null`, `onOpenAcpWebAgent: undefined`, `onOpenWebAgentInPanel: undefined`, `onExecutePrompt: undefined`, while `onOpenImageAiPanel` and `onSubmitCanvasAssistantPrompt` remain functions.

Add source assertions that Codex mode supplies `mounted: false` to `AssistantPanel`, does not invoke `restoreAssistantPanel`, and conditionally omits the `OpenInDropdown` owner. Add `PromptActionButton` assertions for `allowExecute={false}` and no execute dropdown item; add SettingsDialog assertions that its conversation section is gated but direct-AI configuration remains rendered.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/useIndexPageSidebarPropsBuilder.test.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/components/PromptActionButton.source.test.ts src/index/components/SettingsDialog.source.test.ts src/index/components/content/PresentationToolbar.test.ts
```

Expected: tests fail because capability props are absent and all existing paths remain conversation-enabled.

- [ ] **Step 3: Thread capabilities through the existing composition boundaries**

Keep `useAssistantPanelController` available for direct runtime/API helpers, but gate its visible conversation surface:

```ts
const conversationUiEnabled = surfaceCapabilities.conversationUi;
const assistantPanelProps = {
  mounted: conversationUiEnabled && assistantController.assistantPanelMounted,
  visible: conversationUiEnabled && assistantController.assistantVisible,
  // keep direct runtime fields only where existing direct tools require them
};
```

Guard all effects that call `restoreAssistantPanel`, `handleToggleAssistantPanel`, notification subscription, and auto-open behavior with `conversationUiEnabled`. Pass the capability object through both props builders. In their returned props, remove only the conversation callbacks listed in Step 1; preserve image panel and canvas direct-submit callbacks.

Add `externalOpenMenu` to the owner components and render no `OpenInDropdown` trigger when false. Do not hide it with CSS. Add `allowExecute?: boolean` to `PromptActionButton`, default it to `true`, and compute execution availability as `allowExecute && typeof onExecutePrompt === 'function'`; set `allowExecute={surfaceCapabilities.conversationUi}` wherever Make's dialog containers render prompt-action buttons. In `SettingsDialog`, accept `conversationUi?: boolean`, hide only conversation/client-panel settings, and keep model/provider settings used by image/canvas direct runs.

- [ ] **Step 4: Run focused tests and the existing open-menu regression**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/useIndexPageSidebarPropsBuilder.test.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/components/PromptActionButton.source.test.ts src/index/components/SettingsDialog.source.test.ts src/index/components/content/PresentationToolbar.test.ts src/index/components/sidebar/OpenInDropdown.test.ts
```

Expected: Codex props have no conversation entry points; standard-surface `OpenInDropdown` tests stay green; direct image/canvas callback assertions remain green.

- [ ] **Step 5: Commit the presentation unit**

```bash
git add src/index/app/IndexPage.tsx src/index/app/hooks/useIndexPageSidebarPropsBuilder.ts src/index/app/hooks/useIndexPageSidebarPropsBuilder.test.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/components/app/IndexPageDesktop.tsx src/index/components/app/IndexPageLayout.tsx src/index/components/content/PresentationArea.tsx src/index/components/content/PresentationToolbar.tsx src/index/components/content/PresentationToolbar.test.ts src/index/components/sidebar/ContentPanel.tsx src/index/components/sidebar/NewSidebar.tsx src/index/components/SettingsDialog.tsx src/index/components/SettingsDialog.source.test.ts src/index/components/PromptActionButton.tsx src/index/components/PromptActionButton.source.test.ts src/index/components/dialogs/CreateDialogContainer.tsx
git commit -m "feat: hide Make conversation UI in Codex surface"
```

### Task 6: Degrade Legacy Conversation Events And Preserve Direct Tools

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Modify: `src/dev-template/webEditorV2Integration.ts`
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.tsx`
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.test.ts`
- Modify: `src/index/domains/notifications/notificationCoordinator.ts`
- Modify: `src/index/domains/notifications/notificationCoordinator.test.ts`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Consumes: `surfaceCapabilities.conversationUi`, preview action callbacks, and direct-run hooks.
- Produces: explicit results for old `send-to-agent`/`wake-agent` events and no conversation-only notification or iframe allocation on Codex surface.

- [ ] **Step 1: Write failing event and controller tests**

Add a `conversationUiEnabled: false` parameter to the preview-action hook fixture. Assert:

```ts
await expect(actions.handleHostToolbarAction({ type: 'copy-prompt', prompt: 'Build this' })).resolves.toBe(true);
await expect(actions.handleHostToolbarAction({ type: 'send-to-agent', prompt: 'Build this' })).resolves.toBe(true);
expect(copyPrompt).toHaveBeenCalledWith('Build this');
expect(openAssistant).not.toHaveBeenCalled();
```

Add a no-prompt `wake-agent` assertion returning `false` and issuing the existing warning API exactly once. Add controller tests that a disabled conversation profile never creates an iframe entry or reports `assistantVisible: true`; retain existing direct bridge/runtime helper tests.

- [ ] **Step 2: Run event tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/domains/notifications/notificationCoordinator.test.ts
```

Expected: tests fail because the hook has no conversation-enabled option and legacy actions open the assistant.

- [ ] **Step 3: Implement explicit no-conversation behavior**

Add `conversationUiEnabled?: boolean` defaulting to `true` to the preview hook and controller. For `copy-prompt`, retain current copy behavior. For `send-to-agent` or `wake-agent`, copy the event prompt if non-empty and return `true`; otherwise show `messageApi.warning('Codex 页面不提供 Make 对话 AI，请复制提示词后在 Codex 中继续。')` and return `false`. Leave direct-run event branches untouched.

When `conversationUiEnabled` is false, have the controller return stable hidden-panel values and skip iframe-pool creation, auto-open, and conversation notification subscription. Do not disable `probeAssistantRuntimeSilently`, direct canvas submission, annotation direct-run, or AI configuration opening.

- [ ] **Step 4: Run direct-run and event tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/domains/assistant/annotationDirectRun.test.ts src/index/domains/ai-generation/canvasDirectRun.test.ts src/index/domains/notifications/notificationCoordinator.test.ts
```

Expected: legacy conversation events deterministically copy or reject; direct annotation and canvas execution tests pass unchanged.

- [ ] **Step 5: Commit the event-boundary unit**

```bash
git add src/index/app/index-page/useIndexPagePreviewActions.tsx src/index/app/index-page/useIndexPagePreviewActions.test.ts src/dev-template/webEditorV2Integration.ts src/index/domains/assistant/hooks/useAssistantPanelController.tsx src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/domains/notifications/notificationCoordinator.ts src/index/domains/notifications/notificationCoordinator.test.ts src/index/app/IndexPage.tsx
git commit -m "feat: degrade conversation events in Codex surface"
```

### Task 7: Document The Two User Flows And Verify The Release Package

**Files:**
- Modify: `README.md`
- Modify: `src/server/codexIntegration/cli.ts`
- Modify: `src/server/__tests__/codexIntegration-cli.test.ts`
- Modify: `scripts/release-make.mjs`
- Modify: `scripts/release-make.test.mjs`

**Interfaces:**
- Consumes: final CLI commands, packed assets, and actual CDP/source/surface behavior from Tasks 1-6.
- Produces: concise install and daily-use documentation for both client types, and a checked release artifact.

- [ ] **Step 1: Write failing CLI/documentation contract tests**

Add assertions that help contains every command and both startup paths:

```ts
expect(CODEX_INTEGRATION_USAGE).toContain('open       Start official Codex with the Axhub CDP integration.');
expect(CODEX_INTEGRATION_USAGE).toContain('Codex++: open Codex++ normally.');
expect(CODEX_INTEGRATION_USAGE).toContain('Official Codex: run axhub-make codex open.');
```

Extend release test checks to require all five runtime modules plus `axhub-make.sidebar.js` in the npm package.

- [ ] **Step 2: Run final focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-cli.test.ts
node --test scripts/release-make.test.mjs
```

Expected: text/assets assertions fail until the final CLI wording and release manifest are updated.

- [ ] **Step 3: Update the user contract and release package contract**

Document exactly one installation command:

```bash
npx -y @axhub/make@latest codex install
```

Then document two daily paths: Codex++ users open Codex++ normally; official Codex users first quit a normally running instance and run `npx -y @axhub/make@latest codex open`. Explain that both click the same sidebar entry, that click starts/reuses Make, and that it opens Codex's in-app browser. State the CDP/Electron integration is private and must be reinstalled after client changes if doctor reports failure. Keep user-facing docs free of any requirement to configure MCP, install a separate application, start Make manually, or use an external browser.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
pnpm exec vitest run src/server/__tests__/codexIntegration-*.test.ts src/index/app/makeSurface.test.ts src/index/app/index-page/resourceDeepLink.test.ts src/index/app/hooks/useIndexPageSidebarPropsBuilder.test.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/components/PromptActionButton.source.test.ts src/index/components/SettingsDialog.source.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/domains/assistant/hooks/useAssistantPanelController.test.ts
pnpm server:build
pnpm admin:build
node --test scripts/release-make.test.mjs
node scripts/release-make.mjs --dry-run --skip-github
```

Expected: all commands exit `0`; dry-run package lists `axhub-make.sidebar.js`, `cdp-session.mjs`, `companion.mjs`, `host-protocol.mjs`, and `make-runtime.mjs`.

- [ ] **Step 5: Run a local browser smoke check**

Start a local server on an unused loopback port using the repository's development command, then inspect both `/?surface=codex` and `/` with the browser automation workflow. Verify standard surface has a conversation entry and open menu; verify Codex surface has neither, renders no assistant panel, and still shows a direct image or canvas generation trigger. Stop only the server process started for this smoke test.

- [ ] **Step 6: Commit release documentation and verification changes**

```bash
git add README.md src/server/codexIntegration/cli.ts src/server/__tests__/codexIntegration-cli.test.ts scripts/release-make.mjs scripts/release-make.test.mjs
git commit -m "docs: describe Codex sidebar installation flows"
```
