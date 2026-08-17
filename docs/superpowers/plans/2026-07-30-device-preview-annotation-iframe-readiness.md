# Device Preview Annotation iframe Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make annotation entry in mobile, tablet, and custom-size preview views wait for the current iframe Runtime instead of reusing a replaced iframe's stale ready state.

**Architecture:** Add one pure iframe-identity readiness predicate, then use it at both the iframe load fast path and the annotation entry point. Track the iframe that emitted the accepted `runtimeReady`; when the user clicks during a replacement iframe's load, reuse the existing prototype-editor restore queue and consume the intent once the current iframe reports ready.

**Tech Stack:** React 18.2, TypeScript 5.x, Vitest 4, Vite preview Runtime, Chrome DevTools Protocol for local browser verification.

## Global Constraints

- Use pnpm only for repository development commands.
- Preserve all unrelated unstaged changes in the nested `apps/axhub-make` repository.
- `previewActions.helpers.ts`, `previewActions.helpers.test.ts`, `useIndexPagePreviewActions.tsx`, and `useIndexPagePreviewActions.test.ts` already contain user changes; edit only the named behavior and do not stage or commit those files.
- Do not change `DevTemplateBootstrap`, `HtmlTemplateBootstrap`, the client template, device layout components, or editor message protocol.
- Keep the same-iframe hash-navigation fast path.
- A queued toolbar click must be consumed once, must not show the false missing-bootstrap warning, and must be cleared on a real missing/error result or resource reset.
- Keep the annotation entry enabled while the current iframe Runtime status is `pending`, with a connecting tooltip, so a user click can reach the queue; `missing` and `error` remain unavailable.
- Do not add legacy compatibility branches.

---

### Task 1: Define current-iframe Runtime readiness

**Files:**
- Modify: `src/index/app/index-page/previewActions.helpers.test.ts`
- Modify: `src/index/app/index-page/previewActions.helpers.ts`

**Interfaces:**
- Consumes: `QuickEditRuntimeStatus`, the iframe that last emitted an accepted `runtimeReady`, and the current primary preview iframe.
- Produces: `isQuickEditRuntimeReadyForIframe(status, readyIframe, currentIframe): boolean`.

- [ ] **Step 1: Write the failing helper test**

Add `isQuickEditRuntimeReadyForIframe` to the named import from `./previewActions.helpers`, then add:

```ts
it('binds quick-edit runtime readiness to the current iframe identity', () => {
  const readyIframe = {} as HTMLIFrameElement;
  const replacementIframe = {} as HTMLIFrameElement;

  expect(isQuickEditRuntimeReadyForIframe('ready', readyIframe, readyIframe)).toBe(true);
  expect(isQuickEditRuntimeReadyForIframe('ready', readyIframe, replacementIframe)).toBe(false);
  expect(isQuickEditRuntimeReadyForIframe('pending', readyIframe, readyIframe)).toBe(false);
  expect(isQuickEditRuntimeReadyForIframe('ready', readyIframe, null)).toBe(false);
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/previewActions.helpers.test.ts
```

Expected: FAIL because `isQuickEditRuntimeReadyForIframe` is not exported.

- [ ] **Step 3: Add the minimal predicate**

Place this immediately after `QuickEditRuntimeStatus`:

```ts
export function isQuickEditRuntimeReadyForIframe(
    status: QuickEditRuntimeStatus,
    readyIframe: HTMLIFrameElement | null | undefined,
    currentIframe: HTMLIFrameElement | null | undefined,
): boolean {
    return status === 'ready'
        && Boolean(currentIframe)
        && readyIframe === currentIframe;
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run the command from Step 2.

Expected: PASS with no new warnings.

- [ ] **Step 5: Inspect the scoped diff without committing**

Run:

```bash
git diff --check -- src/index/app/index-page/previewActions.helpers.ts src/index/app/index-page/previewActions.helpers.test.ts
git diff -- src/index/app/index-page/previewActions.helpers.ts src/index/app/index-page/previewActions.helpers.test.ts
```

Expected: no whitespace errors; retain all pre-existing hunks and do not stage the files.

---

### Task 2: Queue annotation entry for a replacement iframe

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`

**Interfaces:**
- Consumes: `isQuickEditRuntimeReadyForIframe`, `getPreviewIframeGeneration`, `beginQuickEditRuntimeHandshake`, `pendingPrototypeEditorRestoreRef`, `restorePendingPrototypeEditor`, and accepted `runtimeReady` messages.
- Produces: `quickEditRuntimeReadyIframeRef`, `pendingPrototypeEditorOpenIntentRef`, and single-consumption restoration of a toolbar click.

- [ ] **Step 1: Write the failing source-integration test**

Add a test to `useIndexPagePreviewActions.test.ts`:

```ts
it('queues annotation entry until the replacement preview iframe runtime is ready', () => {
  const source = readPreviewRootSource();
  const loadSegment = getSourceSegment(
    source,
    'const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {',
    'useEffect(() => {\n        const handleQuickEditRuntimeMessage',
  );
  const runtimeReadySegment = getSourceSegment(
    source,
    "if (event.data?.type === 'axhub.quickEdit.runtimeReady') {",
    "if (event.data?.type === 'axhub.quickEdit.patch') {",
  );
  const openSegment = getSourceSegment(
    source,
    'const handleOpenWebEditor = useCallback(async () => {',
    'const handleExitWebEditor = useCallback',
  );

  expect(source).toContain('const quickEditRuntimeReadyIframeRef = useRef<HTMLIFrameElement | null>(null);');
  expect(source).toContain('const pendingPrototypeEditorOpenIntentRef = useRef(false);');
  expect(loadSegment).toContain('isQuickEditRuntimeReadyForIframe(');
  expect(loadSegment).toContain('quickEditRuntimeReadyIframeRef.current');
  expect(runtimeReadySegment).toContain('quickEditRuntimeReadyIframeRef.current = previewIframe;');
  expect(runtimeReadySegment).toContain('void restorePendingPrototypeEditor();');
  expect(openSegment).toContain('pendingPrototypeEditorRestoreRef.current = prototypeEditorLaunchOptions;');
  expect(openSegment).toContain('pendingPrototypeEditorOpenIntentRef.current = true;');
  expect(openSegment).toContain('getPreviewIframeGeneration(primaryIframe) > 0');
  expect(openSegment).toContain('beginQuickEditRuntimeHandshake(primaryIframe);');
  expect(source).toContain("quickEditRuntimeStatus === 'pending'");
  expect(source).toContain("? '正在连接批注编辑器'");
});
```

- [ ] **Step 2: Run the focused hook test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: FAIL because the two refs, identity predicate wiring, and queued toolbar-entry path do not exist.

- [ ] **Step 3: Import the predicate and add lifecycle refs**

Add `isQuickEditRuntimeReadyForIframe` to the existing helper import. Near `lastQuickEditRuntimeDocumentUrlKeyRef`, add:

```ts
const quickEditRuntimeReadyIframeRef = useRef<HTMLIFrameElement | null>(null);
const pendingPrototypeEditorOpenIntentRef = useRef(false);
```

- [ ] **Step 4: Make the iframe-load fast path identity-aware**

In `handlePreviewIframeLoad`, compute:

```ts
const runtimeReadyForPrimaryIframe = isQuickEditRuntimeReadyForIframe(
    quickEditRuntimeStatus,
    quickEditRuntimeReadyIframeRef.current,
    primaryIframe,
);
```

Replace the URL-only reuse condition with:

```ts
if (!waitingForPrototypeRuntime
    && runtimeReadyForPrimaryIframe
    && lastQuickEditRuntimeDocumentUrlKeyRef.current === currentDocumentUrlKey) {
    // Hash-routed prototype subpages keep the same iframe document.
    // The runtime script is already connected, so avoid flipping the
    // toolbar back to a pending/missing state while preserving editor
    // re-entry below.
} else {
    quickEditRuntimeReadyIframeRef.current = null;
    lastQuickEditRuntimeDocumentUrlKeyRef.current = currentDocumentUrlKey;
    beginQuickEditRuntimeHandshake(primaryIframe);
}
```

In the HTML-document branch, also set `quickEditRuntimeReadyIframeRef.current = null` before setting the Runtime status to `idle`.

- [ ] **Step 5: Record only the accepted current iframe as ready**

Inside the already source/origin-validated `runtimeReady` branch, before setting status to `ready`, add:

```ts
quickEditRuntimeReadyIframeRef.current = previewIframe;
```

Inside the `axhub.quickEdit.error` branch, clear it only if it still belongs to the same iframe:

```ts
if (quickEditRuntimeReadyIframeRef.current === previewIframe) {
    quickEditRuntimeReadyIframeRef.current = null;
}
```

- [ ] **Step 6: Preserve toolbar-entry UI completion across the queue**

Before `reenterPrototypeEditorAfterIframeLoad`, extract the existing post-entry UI work:

```ts
const completePrototypeEditorOpen = useCallback(() => {
    setStandalonePanelOpen(false);
    if (sidebarCollapsedBeforeWebEditorRef.current === null) {
        sidebarCollapsedBeforeWebEditorRef.current = collapsed;
    }
    setCollapsed(true);
}, [collapsed, setCollapsed]);
```

Update `restorePendingPrototypeEditor` so it captures and clears `pendingPrototypeEditorOpenIntentRef.current`, restores both the options and flag if re-entry fails, and calls `completePrototypeEditorOpen()` exactly once after successful re-entry when that flag was true:

```ts
const pendingOpenIntent = pendingPrototypeEditorOpenIntentRef.current;
pendingPrototypeEditorRestoreRef.current = null;
pendingPrototypeEditorOpenIntentRef.current = false;
activePrototypeEditorLaunchOptionsRef.current = restoreOptions;
const restored = await reenterPrototypeEditorAfterIframeLoad(restoreOptions);
if (!restored) {
    pendingPrototypeEditorRestoreRef.current = restoreOptions;
    pendingPrototypeEditorOpenIntentRef.current = pendingOpenIntent;
    return false;
}
if (pendingOpenIntent) {
    completePrototypeEditorOpen();
}
return true;
```

- [ ] **Step 7: Queue a click while the current iframe is still loading**

At the beginning of the prototype branch in `handleOpenWebEditor`, resolve the primary iframe and current readiness before the existing missing-Runtime warning:

```ts
const primaryIframe = getPrimaryPreviewIframe();
const runtimeReadyForPrimaryIframe = isQuickEditRuntimeReadyForIframe(
    quickEditRuntimeStatus,
    quickEditRuntimeReadyIframeRef.current,
    primaryIframe,
);
const canWaitForPrimaryIframe = Boolean(primaryIframe?.contentWindow)
    && (quickEditRuntimeStatus === 'pending'
        || (quickEditRuntimeStatus === 'ready' && !runtimeReadyForPrimaryIframe));

if (resourceType === 'prototype' && !runtimeReadyForPrimaryIframe) {
    if (canWaitForPrimaryIframe) {
        standalonePanelBeforeQuickEditRef.current = standalonePanelOpen;
        activePrototypeEditorLaunchOptionsRef.current = prototypeEditorLaunchOptions;
        pendingPrototypeEditorRestoreRef.current = prototypeEditorLaunchOptions;
        pendingPrototypeEditorOpenIntentRef.current = true;
        setQuickEditRuntimeStatus('pending');
        if (getPreviewIframeGeneration(primaryIframe) > 0) {
            beginQuickEditRuntimeHandshake(primaryIframe);
        }
        return;
    }
    messageApi.warning('当前客户端页面尚未接入 /runtime/quick-edit.js，请通过 script、Vite 插件或 Webpack 插件加载后再使用快速编辑');
    return;
}
```

Remove the later duplicate `primaryIframe` declaration. After a normal successful `enterPrototypeEditor`, replace the duplicated panel/sidebar statements with `completePrototypeEditorOpen()`.

Update `quickEditAvailable` so prototype annotation entry remains available during `pending`:

```ts
&& (quickEditRuntimeStatus === 'ready'
    || quickEditRuntimeStatus === 'pending'
    || resourceType === 'theme');
```

In `PresentationToolbar.tsx`, resolve the pending tooltip before the missing-Runtime tooltip:

```ts
: quickEditRuntimeStatus === 'pending'
    ? '正在连接批注编辑器'
: quickEditRuntimeStatus !== 'ready'
    ? '当前客户端页面尚未接入 /runtime/quick-edit.js'
    : '批注后快速微调'
```

- [ ] **Step 8: Clear failed or obsolete queued intent**

In the existing resource/editor reset effect, add:

```ts
quickEditRuntimeReadyIframeRef.current = null;
pendingPrototypeEditorOpenIntentRef.current = false;
```

Add an effect beside the Runtime status handling:

```ts
useEffect(() => {
    if (!pendingPrototypeEditorOpenIntentRef.current
        || (quickEditRuntimeStatus !== 'missing' && quickEditRuntimeStatus !== 'error')) {
        return;
    }
    pendingPrototypeEditorRestoreRef.current = null;
    pendingPrototypeEditorOpenIntentRef.current = false;
    activePrototypeEditorLaunchOptionsRef.current = null;
}, [quickEditRuntimeStatus]);
```

Also clear `pendingPrototypeEditorOpenIntentRef.current` in `handleExitWebEditor` next to `pendingPrototypeEditorRestoreRef.current = null`.

- [ ] **Step 9: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/index/app/index-page/previewActions.helpers.test.ts \
  src/index/app/index-page/usePreviewIframeActions.test.ts \
  src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts
```

Expected: all files PASS with zero failed tests.

- [ ] **Step 10: Inspect the scoped source diff without committing**

Run:

```bash
git diff --check -- \
  src/index/app/index-page/previewActions.helpers.ts \
  src/index/app/index-page/previewActions.helpers.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.tsx \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: exit 0. Do not stage these dirty files.

---

### Task 3: Verify the real device-switch race and regressions

**Files:**
- Temporary create/remove: `.local/test-scripts/device-preview-annotation-readiness.mjs`
- Verify only: `src/index/app/index-page/previewActions.helpers.ts`
- Verify only: `src/index/app/index-page/useIndexPagePreviewActions.tsx`

**Interfaces:**
- Consumes: local Make at its discovered port, current make-client Runtime URL, and the visible device/annotation toolbar controls.
- Produces: evidence that an immediate post-remount click is queued, emits no false warning, and opens the current iframe editor once ready.

- [ ] **Step 1: Run the complete focused suite fresh**

Run the five-file Vitest command from Task 2 Step 9.

Expected: zero failed tests.

- [ ] **Step 2: Run a production TypeScript/build boundary check**

Run:

```bash
pnpm admin:build
```

Expected: both admin Vite builds complete successfully. Existing unrelated warnings may be reported, but there must be no build error.

- [ ] **Step 3: Reproduce and verify through the running page**

Create `.local/test-scripts/device-preview-annotation-readiness.mjs` with:

```js
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const makeUrl = process.argv[2]
  || 'http://127.0.0.1:53817/?projectId=make-project&p=merchant-dashboard&page=overview';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const falseWarning = '当前客户端页面尚未接入真正的快速编辑器';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(read, accept, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch {
      // The target list changes while React replaces the OOPIF.
    }
    await delay(25);
  }
  throw new Error('Timed out waiting for browser state');
}

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true },
  }));
  const message = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP evaluation timed out')), 10000);
    socket.addEventListener('message', (event) => {
      const next = JSON.parse(String(event.data));
      if (next.id !== 1) return;
      clearTimeout(timeout);
      resolve(next);
    });
  });
  socket.close();
  if (message.result?.exceptionDetails) {
    throw new Error(message.result.exceptionDetails.text);
  }
  const remote = message.result?.result;
  return remote?.value;
}

const debugPort = await reservePort();
const profile = await mkdtemp(join(tmpdir(), 'axhub-device-preview-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-extensions',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  makeUrl,
], { stdio: 'ignore' });
const endpoint = `http://127.0.0.1:${debugPort}`;

try {
  const readTargets = () => fetch(`${endpoint}/json/list`).then((response) => response.json());
  const getMainTarget = async () => {
    const targets = await readTargets();
    return targets.find((target) => target.type === 'page' && target.url.startsWith('http'));
  };
  const getPreviewTarget = async () => {
    const targets = await readTargets();
    return targets.find((target) => target.type === 'iframe' && target.url.includes('/prototypes/merchant-dashboard'));
  };
  const main = await waitFor(getMainTarget, Boolean);

  for (const label of ['移动端', '平板', '自定义']) {
    await evaluate(main, `location.href = ${JSON.stringify(`${makeUrl}&deviceCase=${Date.now()}-${label}`)}`);
    await waitFor(
      () => evaluate(main, `JSON.stringify({
        iframe: Boolean(document.querySelector('iframe')),
        ready: Array.from(document.querySelectorAll('button')).some(
          (button) => button.innerText === '批注' && !button.disabled,
        ),
      })`).then(JSON.parse),
      (state) => state.iframe && state.ready,
    );
    await waitFor(
      async () => {
        const preview = await getPreviewTarget();
        return preview
          ? evaluate(preview, `typeof window.DevTemplateBootstrap?.editors?.enable === 'function'`)
          : false;
      },
      Boolean,
    );

    const token = `${Date.now()}-${label}`;
    const switchResult = JSON.parse(await evaluate(main, `(async () => {
      const fire = (element) => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          const EventType = type.startsWith('pointer') ? PointerEvent : MouseEvent;
          element?.dispatchEvent(new EventType(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type.endsWith('down') ? 1 : 0,
            pointerType: 'mouse',
          }));
        }
      };
      const oldIframe = document.querySelector('iframe');
      oldIframe.dataset.cdpProbe = ${JSON.stringify(token)};
      fire(document.querySelector('button[aria-label="设备"]'));
      await new Promise((resolve) => setTimeout(resolve, 50));
      fire(Array.from(document.querySelectorAll('[role="button"]')).find(
        (element) => element.innerText === ${JSON.stringify(label)},
      ));
      const replacementStartedAt = performance.now();
      let currentIframe = null;
      while (performance.now() - replacementStartedAt < 1500) {
        currentIframe = document.querySelector('iframe');
        if (currentIframe && currentIframe.dataset.cdpProbe !== ${JSON.stringify(token)}) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      fire(Array.from(document.querySelectorAll('button')).find(
        (button) => button.innerText === '批注',
      ));
      const clickStartedAt = performance.now();
      let sawFalseWarning = false;
      let opened = false;
      while (performance.now() - clickStartedAt < 8000) {
        const bodyText = document.body.innerText;
        sawFalseWarning ||= bodyText.includes(${JSON.stringify(falseWarning)});
        opened ||= Array.from(document.querySelectorAll('button')).some(
          (button) => button.innerText === '退出',
        );
        if (sawFalseWarning || opened) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return JSON.stringify({
        iframeReplaced: currentIframe !== oldIframe,
        sawFalseWarning,
        opened,
      });
    })()`));

    if (!switchResult.iframeReplaced || switchResult.sawFalseWarning || !switchResult.opened) {
      throw new Error(`${label} failed: ${JSON.stringify(switchResult)}`);
    }
    console.log(`PASS ${label}`);
  }
} finally {
  chrome.kill('SIGTERM');
  await Promise.race([once(chrome, 'exit'), delay(2000)]);
  await rm(profile, { recursive: true, force: true });
}
```

Run:

```bash
node .local/test-scripts/device-preview-annotation-readiness.mjs \
  'http://127.0.0.1:53817/?projectId=make-project&p=merchant-dashboard&page=overview'
```

Expected: exit 0 with one PASS line for mobile, tablet, and custom-size; no false missing-bootstrap warning is observed.

- [ ] **Step 4: Remove the temporary script and inspect final scope**

Delete only `.local/test-scripts/device-preview-annotation-readiness.mjs`, then run:

```bash
git status --short -- \
  docs/superpowers/plans/2026-07-30-device-preview-annotation-iframe-readiness.md \
  src/index/app/index-page/previewActions.helpers.ts \
  src/index/app/index-page/previewActions.helpers.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.tsx \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts
git diff --check -- \
  src/index/app/index-page/previewActions.helpers.ts \
  src/index/app/index-page/previewActions.helpers.test.ts \
  src/index/app/index-page/useIndexPagePreviewActions.tsx \
  src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

Expected: only the plan plus intended source/test files are listed in this task scope, with no whitespace errors. Do not stage or commit the source/test files because they contain pre-existing user work.
