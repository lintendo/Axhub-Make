# Cursor Agents Project Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make integrated Cursor opening focus the desktop Agents window and attach the selected Make project directory without creating a Cursor IDE window.

**Architecture:** Keep CDP launch/readiness in the existing Cursor launcher, add a narrow native desktop-router handoff that focuses Agents and sends one bare directory argument, and make the desktop coordinator tell provider adapters whether a project open is `integrated` or `normal`. The management API routes only integrated Cursor opens to the new handoff; explicit normal opens continue through `openIDEPath()`.

**Tech Stack:** TypeScript 5.x, Node.js `child_process` argument-array execution, Vitest 4, pnpm workspace scripts, Cursor desktop CDP on loopback port `9230`.

## Global Constraints

- Integrated Cursor opening never passes `--new-window`, `--reuse-window`, `--classic`, `--add`, or another IDE-routing flag.
- All process execution uses executable-plus-argument arrays with `shell: false`.
- macOS resolves Cursor's bundled CLI from the discovered `.app`; users do not need a global `cursor` command.
- Windows uses the discovered `Cursor.exe` and requires a native Windows release smoke before publication.
- Integrated failure never silently falls back to `openIDEPath()`.
- Preserve every pre-existing uncommitted change in the shared worktree; do not stage or commit dirty files owned by the user.
- The unrelated pre-existing failures in the latter part of `agent-open-api.test.ts` remain outside scope; the desktop-integration test filter is the regression boundary for this task.

---

### Task 1: Cursor Agents Native Directory Handoff

**Files:**
- Modify: `src/server/cursorIntegration/launcher.ts`
- Test: `src/server/__tests__/cursorIntegration-launcher.test.ts`

**Interfaces:**
- Consumes: `inspectCursorIntegration(context)`, the discovered `appPath`, fixed `CURSOR_DEBUG_PORT`, and `CursorLauncherContext` process/test dependencies.
- Produces: `openCursorAgentsProject(targetPath: string, context?: CursorLauncherContext): Promise<OpenCursorAgentsProjectResult>` where the result contains `appPath` and `targetPath`.

- [ ] **Step 1: Write failing cold-launch tests for Agents-only startup**

Update the existing macOS and Windows launch expectations so `--chat` is the first Cursor application argument:

```ts
expect(launch).toHaveBeenCalledWith('open', [
  '-n', appPath, '--args', '--chat',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=9230',
  '--remote-allow-origins=http://127.0.0.1:9230',
]);

expect(launch).toHaveBeenCalledWith(appPath, [
  '--chat',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=9230',
  '--remote-allow-origins=http://127.0.0.1:9230',
]);
```

- [ ] **Step 2: Run the cold-launch tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-launcher.test.ts -t 'launches macOS|launches Windows'
```

Expected: both tests fail because the production argument arrays do not contain `--chat`.

- [ ] **Step 3: Add the minimal Agents-only launch argument**

Build the fixed launch arguments as:

```ts
const cdpArgs = [
  '--chat',
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${CURSOR_DEBUG_PORT}`,
  `--remote-allow-origins=${CURSOR_REMOTE_ALLOW_ORIGINS}`,
];
```

- [ ] **Step 4: Run the cold-launch tests and verify GREEN**

Run the command from Step 2. Expected: 2 tests pass.

- [ ] **Step 5: Write failing native handoff tests**

Import `openCursorAgentsProject` and add tests covering macOS, Windows, and incompatibility detection. The macOS test must expect the bundled CLI and exact argument order:

```ts
function fileSystemWithInstalledIntegration(
  paths: ReturnType<typeof resolveCursorIntegrationPaths>,
  appPath: string,
  ...extraPaths: string[]
) {
  return fileSystemWith(
    appPath,
    paths.configFile,
    paths.companionFile,
    paths.launcherSourceFile,
    ...extraPaths,
  );
}

const cliPath = `${appPath}/Contents/Resources/app/bin/cursor`;
const run = vi.fn(async () => ({ stdout: '', stderr: '' }));

await openCursorAgentsProject('/workspace/demo', {
  platform: 'darwin',
  homeDir: '/tmp/demo',
  env: {},
  fileSystem: fileSystemWithInstalledIntegration(paths, appPath, cliPath),
  probeTargets: vi.fn(async () => [cursorTarget]),
  isCursorRunning: vi.fn(async () => true),
  run,
  wait: vi.fn(async () => {}),
});

expect(run).toHaveBeenNthCalledWith(1, cliPath, ['--chat']);
expect(run).toHaveBeenNthCalledWith(2, cliPath, ['/workspace/demo']);
```

The Windows test expects `Cursor.exe` for both calls. The incompatibility test returns a newly created non-Agents workbench page from the final target probe and expects rejection containing `Cursor-version incompatibility`.

- [ ] **Step 6: Run the handoff tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-launcher.test.ts -t 'Agents project|version incompatibility'
```

Expected: test collection or assertions fail because `openCursorAgentsProject` does not exist.

- [ ] **Step 7: Implement the native handoff**

Add a workbench-page predicate, platform router resolver, and exported operation with this behavior:

```ts
export interface OpenCursorAgentsProjectResult {
  appPath: string;
  targetPath: string;
}

export async function openCursorAgentsProject(
  targetPath: string,
  context: CursorLauncherContext = {},
): Promise<OpenCursorAgentsProjectResult> {
  const inspection = await inspectCursorIntegration(context);
  if (!inspection.ready || !inspection.appPath) {
    throw new Error('Cursor Agents is not ready for project handoff.');
  }

  const router = inspection.platform === 'darwin'
    ? path.posix.join(inspection.appPath, 'Contents/Resources/app/bin/cursor')
    : inspection.appPath;
  if (inspection.platform === 'darwin') {
    await (context.fileSystem || defaultFileSystem).access(router);
  }

  const run = context.run || defaultRun;
  const probeTargets = context.probeTargets || defaultProbeTargets;
  const wait = context.wait || defaultWait;

  await run(router, ['--chat']);
  await waitForCursorTarget({
    probeTargets,
    wait,
    maxAttempts: context.maxAttempts ?? 20,
    retryDelayMs: context.retryDelayMs ?? 1000,
  });

  const before = await probeTargets(CURSOR_DEBUG_PORT);
  await run(router, [targetPath]);
  await wait(250);
  const after = await probeTargets(CURSOR_DEBUG_PORT);
  assertNoNewNonAgentsWorkbench(before, after);

  return { appPath: inspection.appPath, targetPath };
}
```

`assertNoNewNonAgentsWorkbench` compares stable target IDs for top-level `page` targets whose URL is Cursor's workbench URL. It throws a fixed `Cursor-version incompatibility: project opened outside Cursor Agents.` error only for a newly created non-Agents workbench page.

- [ ] **Step 8: Run the complete launcher test file and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/cursorIntegration-launcher.test.ts
```

Expected: all launcher tests pass with no warning or unhandled rejection.

### Task 2: Explicit Integrated Versus Normal Coordinator Mode

**Files:**
- Modify: `src/server/desktopIntegrationOpen.ts`
- Test: `src/server/__tests__/desktopIntegrationOpen.test.ts`

**Interfaces:**
- Consumes: existing provider inspection, launch, close, and project result types.
- Produces: `openProject(mode: 'integrated' | 'normal'): Promise<DesktopIntegrationProjectOpenResult>` on `DesktopIntegrationOpenAdapters`.

- [ ] **Step 1: Write failing mode-routing tests**

Change the adapter fixture to accept a mode and assert exact calls:

```ts
openProject: vi.fn(async (_mode: 'integrated' | 'normal') => ({})),
```

In the ready/direct/restart tests:

```ts
expect(adapters.openProject).toHaveBeenCalledWith('integrated');
```

In the normal test:

```ts
expect(adapters.openProject).toHaveBeenCalledWith('normal');
```

- [ ] **Step 2: Run the coordinator tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/desktopIntegrationOpen.test.ts
```

Expected: assertions fail because production calls `openProject()` without a mode.

- [ ] **Step 3: Pass the explicit mode from the coordinator**

Update the interface and the two calls:

```ts
openProject(mode: 'integrated' | 'normal'): Promise<DesktopIntegrationProjectOpenResult>;

const project = await adapters.openProject('normal');
// ...
const project = await adapters.openProject('integrated');
```

- [ ] **Step 4: Run the coordinator tests and verify GREEN**

Run the command from Step 2. Expected: all coordinator tests pass.

### Task 3: Route Integrated Cursor Project Opens Away From IDE

**Files:**
- Modify: `src/server/managementApi.assistantIde.ts`
- Test: `src/server/__tests__/agent-open-api.test.ts`

**Interfaces:**
- Consumes: `openCursorAgentsProject(targetPath)` from Task 1 and the mode argument from Task 2.
- Produces: the existing `/api/desktop-integration/open` response contract, with integrated Cursor using Agents and normal Cursor using `openIDEPath()`.

- [ ] **Step 1: Write the failing API adapter test**

Mock only the new narrow launcher operation while retaining the real launcher module:

```ts
const openCursorAgentsProjectMock = vi.hoisted(() => vi.fn(async () => ({
  appPath: '/Applications/Cursor.app',
  targetPath: '',
})));

vi.mock('../cursorIntegration/launcher.ts', async (importActual) => {
  const actual = await importActual<typeof import('../cursorIntegration/launcher.ts')>();
  return { ...actual, openCursorAgentsProject: openCursorAgentsProjectMock };
});
```

After calling the endpoint and capturing the coordinator adapters, invoke the adapter directly:

```ts
const adapters = coordinateDesktopIntegrationOpenMock.mock.calls[0][1];
await adapters.openProject('integrated');
expect(openCursorAgentsProjectMock).toHaveBeenCalledWith(projectRoot);
expect(childProcessMock.spawn).not.toHaveBeenCalled();
```

Add a separate normal-mode assertion that `openCursorAgentsProjectMock` is not called and the existing Cursor IDE opener still launches `open -a Cursor <projectRoot>` on macOS.

- [ ] **Step 2: Run only the desktop-integration API tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/agent-open-api.test.ts -t 'desktop integration'
```

Expected: integrated adapter assertion fails because it still calls the shared Cursor IDE opener.

- [ ] **Step 3: Split integrated and normal provider project routing**

Import `openCursorAgentsProject`, add the mode to `openDesktopIntegrationProject`, and put the integrated Cursor branch before the existing normal branch:

```ts
async function openDesktopIntegrationProject({
  provider,
  mode,
  targetPath,
  projectRoot,
  options,
  handlers,
}: {
  provider: 'chatgpt' | 'cursor';
  mode: 'integrated' | 'normal';
  targetPath: string;
  projectRoot: string;
  options: ManagementApiOptions;
  handlers: AssistantIdeHandlers;
}): Promise<DesktopIntegrationProjectOpenResult> {
  if (provider === 'cursor' && mode === 'integrated') {
    await openCursorAgentsProject(targetPath);
    return {};
  }

  const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
  const config = serverConfigStore.getConfig({ activeProjectRoot: projectRoot });

  if (provider === 'cursor') {
    const toolOpenStateKey = buildToolOpenStateKey('ide', 'cursor');
    const result = await openIDEPath({
      ide: 'cursor',
      targetPath,
      toolOpenState: config.toolOpenState?.[toolOpenStateKey],
    });
    serverConfigStore.saveConfig({
      toolOpenState: {
        [toolOpenStateKey]: {
          executablePath: result.executablePath,
          appPathName: result.appPathName,
          lastOpenMode: result.openMode,
        },
      },
    });
    return { url: result.url, openInBrowser: result.openInBrowser };
  }

  const availability = detectAgentAvailabilityAtStartup();
  const toolOpenStateKey = buildToolOpenStateKey('local-app', 'codex');
  const agentAvailability = withStoredCommandAvailability(
    availability.localApp.codex,
    config.toolOpenState?.[toolOpenStateKey],
  );
  if (agentAvailability?.status === 'missing') {
    throw new Error(getMissingLocalAppOpenError('codex').body.error);
  }
  const result = await openLocalAppAgent({
    agent: 'codex',
    targetPath,
    availability: agentAvailability,
    toolOpenState: config.toolOpenState?.[toolOpenStateKey],
  });
  serverConfigStore.saveConfig({
    toolOpenState: {
      [toolOpenStateKey]: {
        commandPath: agentAvailability?.path,
        lastOpenMode: result.openMode || (result.url || result.command.includes('://') ? 'deeplink' : 'direct-app'),
      },
    },
  });
  return { url: result.url, openInBrowser: result.openInBrowser };
}
```

Build the shared adapter as:

```ts
const openProject = (mode: 'integrated' | 'normal') => openDesktopIntegrationProject({
  provider,
  mode,
  targetPath: absoluteTargetPath,
  projectRoot: context.project.root,
  options,
  handlers,
});
```

- [ ] **Step 4: Run the desktop-integration API tests and verify GREEN**

Run the command from Step 2. Expected: all matching API tests pass.

- [ ] **Step 5: Run focused regression and server type verification**

Run:

```bash
pnpm exec vitest run \
  src/server/__tests__/cursorIntegration-launcher.test.ts \
  src/server/__tests__/desktopIntegrationOpen.test.ts \
  src/server/__tests__/agent-open-api.test.ts \
  -t 'Cursor CDP launcher|desktop integration'
pnpm server:build
```

Expected: the focused suite passes and the Node server TypeScript build exits with status `0`. If `server:build` exposes unrelated pre-existing failures, record them separately and rerun the narrow TypeScript/test proof for touched modules.

- [ ] **Step 6: Run the macOS desktop smoke**

With Cursor Agents already available on port `9230`, invoke the bundled Cursor desktop CLI with the current Make directory as one bare positional argument, then inspect the CDP target list and Agents body:

```bash
'/Applications/Cursor.app/Contents/Resources/app/bin/cursor' \
  '/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make'
curl -fsS http://127.0.0.1:9230/json
```

Expected: the only top-level workbench page is titled `Cursor Agents`, and the Agents workspace/file tree contains `axhub-make`.

- [ ] **Step 7: Review the final scoped diff without committing user-owned changes**

Run:

```bash
git diff --check -- \
  src/server/cursorIntegration/launcher.ts \
  src/server/__tests__/cursorIntegration-launcher.test.ts \
  src/server/desktopIntegrationOpen.ts \
  src/server/__tests__/desktopIntegrationOpen.test.ts \
  src/server/managementApi.assistantIde.ts \
  src/server/__tests__/agent-open-api.test.ts
git diff --stat
```

Expected: no whitespace errors. Do not stage or commit the dirty API/coordinator files because they include pre-existing user work.
