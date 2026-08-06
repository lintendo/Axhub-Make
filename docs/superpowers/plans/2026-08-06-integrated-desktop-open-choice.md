# ChatGPT And Cursor Integrated Open Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing ChatGPT and Cursor entries launch with Axhub CDP integration and show a two-action restart dialog only when an ordinary running instance blocks injection.

**Architecture:** Provider launchers expose inspect and graceful-close primitives while keeping their fixed ports and launch arguments. A small coordinator owns the `prepare | restart | normal` state machine, the existing management API supplies project-scoped normal/project opening callbacks, and `OpenInDropdown` delegates restart presentation to a focused dialog component.

**Tech Stack:** TypeScript 5, React 18.2, Node.js 22 ESM, Vitest, Radix/shadcn Dialog, macOS `osascript`/`pgrep`, Windows PowerShell process APIs.

## Global Constraints

- Scope is exactly the existing ChatGPT and Cursor menu entries.
- macOS and Windows support integrated launch; unsupported platforms keep current normal opening.
- Reuse Codex CDP port `9229` and Cursor CDP port `9230` with their existing fixed launch arguments.
- Never force-kill a client; graceful exit timeout leaves the existing process running.
- Dialog actions are exactly `重启并注入` and `普通打开`; close button, backdrop, and Escape are the only cancellation affordances.
- Dismissing the dialog performs no action and does not save an open-method preference.
- Project paths must pass the existing explicit project-scope and `resolveProjectPath` boundary.
- Renderer requests cannot provide executable paths, ports, commands, or launch arguments.
- Use argument-array process execution and preserve all other providers and menu behavior.
- Development uses pnpm; published runtime remains npm/npx safe.

---

### Task 1: Provider Inspection And Graceful Desktop Lifecycle

**Files:**
- Create: `src/server/desktopClientLifecycle.ts`
- Create: `src/server/__tests__/desktopClientLifecycle.test.ts`
- Modify: `src/server/codexIntegration/paths.ts`
- Modify: `src/server/codexIntegration/launcher.ts`
- Modify: `src/server/cursorIntegration/launcher.ts`
- Modify: `src/server/__tests__/codexIntegration-paths.test.ts`
- Modify: `src/server/__tests__/codexIntegration-launcher.test.ts`
- Modify: `src/server/__tests__/cursorIntegration-launcher.test.ts`

**Interfaces:**
- Produces: `DesktopClientProvider = 'chatgpt' | 'cursor'`.
- Produces: `buildDesktopClientProcessProbe(provider, platform): CommandSpec` and `buildDesktopClientGracefulQuit(provider, platform): CommandSpec` with fixed argument arrays.
- Produces: `waitForDesktopClientExit({ isRunning, wait, maxAttempts, retryDelayMs }): Promise<boolean>`.
- Produces: `inspectCodexIntegration(context): Promise<DesktopIntegrationInspection>` and `inspectCursorIntegration(context): Promise<DesktopIntegrationInspection>`.
- Produces: `closeCodexIntegrationGracefully(context): Promise<void>` and `closeCursorIntegrationGracefully(context): Promise<void>`.
- `DesktopIntegrationInspection` is `{ platform: 'darwin' | 'win32'; ready: boolean; running: boolean; installed: boolean; integrationInstalled: boolean; appPath: string }`.

- [ ] **Step 1: Write lifecycle RED tests**

Create tests that lock fixed non-force commands and timeout behavior:

```ts
expect(buildDesktopClientGracefulQuit('chatgpt', 'darwin')).toEqual({
  command: 'osascript',
  args: ['-e', 'tell application id "com.openai.codex" to quit'],
});
expect(buildDesktopClientGracefulQuit('cursor', 'win32')).toMatchObject({
  command: 'powershell.exe',
});
expect(JSON.stringify(buildDesktopClientGracefulQuit('cursor', 'win32'))).not.toMatch(/\/F|Stop-Process|kill -9/iu);
await expect(waitForDesktopClientExit({
  isRunning: vi.fn(async () => true),
  wait: vi.fn(async () => {}),
  maxAttempts: 2,
  retryDelayMs: 0,
})).resolves.toBe(false);
```

Extend launcher tests so inspect reports `ready`, `running`, client `installed`, and `integrationInstalled` independently. The integration check requires the owned config, companion, and sidebar/launcher source files. Graceful close throws a manual-quit error when polling never observes exit.

- [ ] **Step 2: Run lifecycle and launcher tests to verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/desktopClientLifecycle.test.ts src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-launcher.test.ts src/server/__tests__/cursorIntegration-launcher.test.ts
```

Expected: FAIL because the lifecycle module and launcher inspection/close exports do not exist.

- [ ] **Step 3: Implement fixed lifecycle commands and polling**

Add the shared command model and keep every command free of renderer-derived values:

```ts
export interface DesktopClientCommandSpec { command: string; args: string[] }

export function buildDesktopClientGracefulQuit(
  provider: DesktopClientProvider,
  platform: 'darwin' | 'win32',
): DesktopClientCommandSpec {
  if (platform === 'darwin') {
    return provider === 'chatgpt'
      ? { command: 'osascript', args: ['-e', 'tell application id "com.openai.codex" to quit'] }
      : { command: 'osascript', args: ['-e', 'tell application "Cursor" to quit'] };
  }
  const names = provider === 'chatgpt' ? "'ChatGPT','Codex'" : "'Cursor'";
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile', '-NonInteractive', '-Command',
      `$items = Get-Process -Name ${names} -ErrorAction SilentlyContinue; $items | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
    ],
  };
}
```

Use `execFile(command, args, { shell: false, windowsHide: true })` through an injectable runner. Poll only the provider-specific running probe and return `false` after the bounded timeout.

- [ ] **Step 4: Refactor both launchers around inspection**

Add ChatGPT desktop candidates alongside the historical Codex names and make `open*Integration` consume its exported inspection:

```ts
export interface DesktopIntegrationInspection {
  platform: 'darwin' | 'win32';
  ready: boolean;
  running: boolean;
  installed: boolean;
  integrationInstalled: boolean;
  appPath: string;
}

const inspection = await inspectCodexIntegration(context);
if (inspection.ready) return { launched: false, reused: true, appPath: inspection.appPath };
if (inspection.running) throw new Error('ChatGPT is already running without Axhub CDP.');
if (!inspection.installed) throw new Error('ChatGPT was not found in a supported installation location.');
```

The graceful-close exports execute the fixed command, call `waitForDesktopClientExit`, and throw `请手动退出后重试` if it returns `false`. Integrated launch rejects a missing owned integration with the exact install command (`codex install` or `cursor install`) instead of reporting a successful injection. Preserve exact CDP launch arguments and existing readiness polling.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run the Step 2 command again.

Expected: PASS; snapshots/assertions show no force flag and unchanged ports `9229`/`9230`.

- [ ] **Step 6: Commit provider lifecycle**

```bash
git add src/server/desktopClientLifecycle.ts src/server/__tests__/desktopClientLifecycle.test.ts src/server/codexIntegration/paths.ts src/server/codexIntegration/launcher.ts src/server/cursorIntegration/launcher.ts src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-launcher.test.ts src/server/__tests__/cursorIntegration-launcher.test.ts
git commit -m "feat: inspect and gracefully restart desktop integrations"
```

### Task 2: Project-Scoped Integrated Open Coordinator And API

**Files:**
- Create: `src/server/desktopIntegrationOpen.ts`
- Create: `src/server/__tests__/desktopIntegrationOpen.test.ts`
- Modify: `src/server/managementApi.assistantIde.ts`
- Modify: `src/server/__tests__/agent-open-api.test.ts`
- Modify: `src/index/services/api.ts`
- Modify: `src/index/services/api.test.ts`

**Interfaces:**
- Produces: `DesktopIntegrationOpenAction = 'prepare' | 'restart' | 'normal'`.
- Produces: `DesktopIntegrationOpenResult` with `status: 'opened' | 'restart-required'`, `mode?: 'integrated' | 'normal'`, `launched?: boolean`, and `reused?: boolean`.
- Produces: `coordinateDesktopIntegrationOpen(input, adapters): Promise<DesktopIntegrationOpenResult>`.
- Produces: `apiService.openDesktopIntegration(payload)` posting to `/api/desktop-integration/open`.

- [ ] **Step 1: Write coordinator RED tests**

Cover the full state machine with injected adapters:

```ts
await expect(coordinateDesktopIntegrationOpen({ provider: 'chatgpt', action: 'prepare' }, {
  inspect: vi.fn(async () => ({ ready: false, running: true, installed: true, integrationInstalled: true, appPath: '/Applications/ChatGPT.app', platform: 'darwin' })),
  launch: vi.fn(),
  close: vi.fn(),
  openProject: vi.fn(async () => ({})),
})).resolves.toEqual({ provider: 'chatgpt', status: 'restart-required' });
```

Also assert: ready reuses and opens the project; stopped launches then opens; restart closes before launch; normal only calls `openProject`; missing client rejects; unsupported platform runs normal; duplicate provider/action values are rejected by normalizers.

- [ ] **Step 2: Run coordinator test to verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/desktopIntegrationOpen.test.ts
```

Expected: FAIL because `desktopIntegrationOpen.ts` does not exist.

- [ ] **Step 3: Implement the minimal coordinator**

Use an explicit adapter boundary:

```ts
export interface DesktopIntegrationOpenAdapters {
  inspect(): Promise<DesktopIntegrationInspection>;
  launch(): Promise<{ launched: boolean; reused: boolean }>;
  close(): Promise<void>;
  openProject(): Promise<{ url?: string; openInBrowser?: boolean }>;
}

export async function coordinateDesktopIntegrationOpen(
  input: { provider: DesktopClientProvider; action: DesktopIntegrationOpenAction },
  adapters: DesktopIntegrationOpenAdapters,
): Promise<DesktopIntegrationOpenResult> {
  if (input.action === 'normal') {
    const project = await adapters.openProject();
    return { provider: input.provider, status: 'opened', mode: 'normal', ...project };
  }
  const state = await adapters.inspect();
  if (!state.installed && !state.ready) throw new Error(`${input.provider} is not installed`);
  if (!state.integrationInstalled && !state.ready) throw new Error(`${input.provider} integration is not installed`);
  if (state.running && !state.ready && input.action === 'prepare') {
    return { provider: input.provider, status: 'restart-required' };
  }
  if (state.running && !state.ready) await adapters.close();
  const launch = await adapters.launch();
  const project = await adapters.openProject();
  return { provider: input.provider, status: 'opened', mode: 'integrated', ...launch, ...project };
}
```

Do not catch launcher errors in the coordinator; the API maps them to a stable failure payload.

- [ ] **Step 4: Write API RED tests**

Add requests proving:

```ts
expect(await post({ provider: 'unknown', action: 'prepare' })).toMatchObject({
  status: 400,
  body: { code: 'DESKTOP_INTEGRATION_PROVIDER_UNSUPPORTED' },
});
expect(await post({ provider: 'chatgpt', action: 'force', executablePath: '/tmp/tool' })).toMatchObject({
  status: 400,
  body: { code: 'DESKTOP_INTEGRATION_ACTION_UNSUPPORTED' },
});
expect(await post({ provider: 'cursor', action: 'normal', targetPath: outsideProject })).toMatchObject({
  status: 403,
  body: { code: 'PATH_OUTSIDE_PROJECT' },
});
```

Mock `coordinateDesktopIntegrationOpen` with `vi.mock('../desktopIntegrationOpen.ts')` for ready, restart-required, restart, and normal success so route tests never open a real desktop client.

- [ ] **Step 5: Add the project-scoped route and typed client**

Route only `POST /api/desktop-integration/open`. Resolve the selected project with `explicit-required`, resolve `targetPath` with `resolveProjectPath`, normalize fixed provider/action enums, then build provider adapters from the Task 1 exports. The `openProject` callback delegates ChatGPT to the existing `openLocalAppAgent({ agent: 'codex' })` path and Cursor to `openIDEPath({ ide: 'cursor' })`, preserving tool-open-state updates.

Expose the exact frontend contract:

```ts
export interface DesktopIntegrationOpenRequest {
  projectId: string;
  provider: 'chatgpt' | 'cursor';
  action: 'prepare' | 'restart' | 'normal';
  targetPath?: string;
}

export interface DesktopIntegrationOpenResponse {
  success: true;
  provider: 'chatgpt' | 'cursor';
  status: 'opened' | 'restart-required';
  mode?: 'integrated' | 'normal';
  launched?: boolean;
  reused?: boolean;
  url?: string;
  openInBrowser?: boolean;
}
```

- [ ] **Step 6: Run API and client tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/desktopIntegrationOpen.test.ts src/server/__tests__/agent-open-api.test.ts src/index/services/api.test.ts
```

Expected: PASS; the API never accepts caller-supplied executable or CDP configuration.

- [ ] **Step 7: Commit coordinator and API**

```bash
git add src/server/desktopIntegrationOpen.ts src/server/__tests__/desktopIntegrationOpen.test.ts src/server/managementApi.assistantIde.ts src/server/__tests__/agent-open-api.test.ts src/index/services/api.ts src/index/services/api.test.ts
git commit -m "feat: add project-scoped integrated desktop open API"
```

### Task 3: Two-Action Restart Dialog And Menu Routing

**Files:**
- Create: `src/index/components/sidebar/DesktopIntegrationRestartDialog.tsx`
- Create: `src/index/components/sidebar/DesktopIntegrationRestartDialog.test.tsx`
- Modify: `src/index/components/sidebar/OpenInDropdown.tsx`
- Modify: `src/index/components/sidebar/OpenInDropdown.test.ts`

**Interfaces:**
- Produces: `DesktopIntegrationRestartDialog({ provider, open, loading, onOpenChange, onRestart, onOpenNormally })`.
- `OpenInDropdown` routes only local app `codex` to provider `chatgpt` and IDE `cursor` to provider `cursor`.
- Other local apps, IDEs, CLI entries, online AI, and image AI keep their existing handlers.

- [ ] **Step 1: Write dialog and routing RED tests**

Render the dialog and assert:

```tsx
expect(screen.getByRole('button', { name: '重启并注入' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '普通打开' })).toBeInTheDocument();
expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
expect(screen.getByText(/保存正在进行的工作/)).toBeInTheDocument();
```

Exercise `onOpenChange(false)` through Escape and backdrop behavior supplied by `Dialog`, and assert it calls the parent close callback without either action. Extend the existing source contract so ChatGPT/Cursor call the integrated prepare handler while OpenCode and all other IDEs retain their existing handlers.

- [ ] **Step 2: Run UI tests to verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/sidebar/DesktopIntegrationRestartDialog.test.tsx src/index/components/sidebar/OpenInDropdown.test.ts
```

Expected: FAIL because the dialog and integrated routing do not exist.

- [ ] **Step 3: Implement the focused dialog**

Use the existing shadcn dialog primitives with no cancel footer button:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>需要重启 {label}</DialogTitle>
      <DialogDescription>为了加载 Axhub Make 入口，需要重启应用。请先保存正在进行的工作。</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" disabled={loading} onClick={onOpenNormally}>普通打开</Button>
      <Button disabled={loading} onClick={onRestart}>
        {loading ? <Loader2 className="animate-spin" /> : null}
        重启并注入
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Do not disable the built-in close button, backdrop dismissal, or Escape dismissal before an action starts.

- [ ] **Step 4: Route ChatGPT and Cursor through prepare**

Add pending state only after the API returns `restart-required`:

```ts
const [pendingIntegratedProvider, setPendingIntegratedProvider] = useState<'chatgpt' | 'cursor' | null>(null);

const handleIntegratedOpen = async (provider: 'chatgpt' | 'cursor', preference: OpenMethod) => {
  const result = await apiService.openDesktopIntegration({
    projectId,
    provider,
    action: 'prepare',
    targetPath: openTargetPath,
  });
  if (result.status === 'restart-required') {
    setPendingIntegratedProvider(provider);
    return;
  }
  if (shouldUpdateDefaultOpenMethod) await savePreference(preference);
  toast.success(`已在${provider === 'chatgpt' ? ' ChatGPT' : ' Cursor'} 中打开`);
};
```

The dialog's two actions send `restart` or `normal`; only a successful `opened` response saves the corresponding preference. Closing clears pending state and saves nothing. Preserve `openInBrowser` URL handling returned by the normal ChatGPT path.

- [ ] **Step 5: Run UI tests to verify GREEN**

Run the Step 2 command again.

Expected: PASS; the rendered footer has two action buttons, no cancel button, and no other menu item changes handlers.

- [ ] **Step 6: Commit UI integration**

```bash
git add src/index/components/sidebar/DesktopIntegrationRestartDialog.tsx src/index/components/sidebar/DesktopIntegrationRestartDialog.test.tsx src/index/components/sidebar/OpenInDropdown.tsx src/index/components/sidebar/OpenInDropdown.test.ts
git commit -m "feat: prompt before restarting desktop integrations"
```

### Task 4: Build And Desktop Smoke Verification

**Files:**
- Modify only if verification exposes a scoped defect in files from Tasks 1-3.
- Keep screenshots and ad hoc logs under `.local/`; do not commit them.

**Interfaces:**
- Consumes: complete provider lifecycle, API, and UI from Tasks 1-3.
- Produces: verified local ChatGPT and Cursor interaction evidence without leaving test processes or temporary integrations running.

- [ ] **Step 1: Run the complete focused regression set**

```bash
pnpm exec vitest run src/server/__tests__/desktopClientLifecycle.test.ts src/server/__tests__/desktopIntegrationOpen.test.ts src/server/__tests__/codexIntegration-paths.test.ts src/server/__tests__/codexIntegration-launcher.test.ts src/server/__tests__/cursorIntegration-launcher.test.ts src/server/__tests__/agent-open-api.test.ts src/index/services/api.test.ts src/index/components/sidebar/DesktopIntegrationRestartDialog.test.tsx src/index/components/sidebar/OpenInDropdown.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Build server and Admin UI**

```bash
pnpm server:build
pnpm build
```

Expected: both commands exit `0` without TypeScript or bundler errors.

- [ ] **Step 3: Verify the dialog in the browser**

Start the local Make server and use a temporary Playwright route interception for `POST /api/desktop-integration/open` that returns `{ "success": true, "provider": "cursor", "status": "restart-required" }` for `prepare`. Open the real Admin UI at desktop and narrow widths, click Cursor, and verify the dialog has no visible cancel button, text does not overflow, backdrop/Escape dismiss it, and dismissal sends no follow-up request. Keep the temporary script under `.local/test-scripts/` and do not commit it.

- [ ] **Step 4: Verify real macOS process behavior**

With user work preserved, test these paths one at a time:

1. stopped client -> click -> CDP launch -> current project opens;
2. ready CDP client -> click -> same client reused;
3. ordinary running client -> click -> dialog appears;
4. `普通打开` -> current existing open behavior;
5. `重启并注入` -> graceful quit, CDP relaunch, project opens;
6. graceful-quit timeout simulation -> no force kill and manual-exit message.

Use the computer automation skill for desktop screenshots and disconnect it when finished. Do not close the Codex task hosting this implementation during the ChatGPT restart smoke; use a disposable secondary client instance or defer only that destructive live branch and report it explicitly.

- [ ] **Step 5: Inspect scoped diff and commit verification fixes if needed**

```bash
git diff --check -- src/server/desktopClientLifecycle.ts src/server/desktopIntegrationOpen.ts src/server/codexIntegration src/server/cursorIntegration src/server/managementApi.assistantIde.ts src/index/services/api.ts src/index/components/sidebar/DesktopIntegrationRestartDialog.tsx src/index/components/sidebar/OpenInDropdown.tsx
git status --short
```

Expected: no whitespace errors; unrelated dirty files remain untouched. If verification required a scoped fix, commit only those files with `fix: stabilize integrated desktop opening`.

## Final Verification

- [ ] Confirm the design acceptance criteria against test output and desktop evidence.
- [ ] Record that native Windows smoke remains required before publishing.
- [ ] Report any live ChatGPT restart branch intentionally deferred to avoid terminating the current Codex task.
