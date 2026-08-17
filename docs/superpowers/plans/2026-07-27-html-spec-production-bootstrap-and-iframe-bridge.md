# HTML 规格生产 Bootstrap 与 iframe 消息桥 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让 HTML 原型规格的生产 bootstrap 可执行，并在动态端口 iframe 切换中可靠、安全地完成编辑器桥接。

**Architecture:** 将 Ant Design X 与 Ant Design runtime 置于同一个 production chunk，消除 TDZ 循环。新增独立、可注入时钟与事件宿主的 iframe request/response helper；原型编辑器桥通过该 helper 等待 ACK、验证 source/origin/requestId，并在 iframe 代次变化时放弃请求。生产测试直接执行新构建和 release staged package 的 ESM entry。

**Tech Stack:** TypeScript 5.x、Vite/Rollup、Vitest 4、Node ESM、pnpm。

## Global Constraints

- 只使用 pnpm；临时浏览器脚本位于已忽略的 .local/test-scripts。
- 不写死任何 Make、client 或 ACP 端口。
- postMessage 目标使用由有效动态 URL 推导的严格 origin；不以星号作为成功路径。
- 生产行为必须以新构建和 staged npm package 执行验证，不能只依赖源码 Vitest。
- 不修改 apps/axhub-scaffold，不重排当前工作区的无关改动。

---

### Task 1: 锁定 Ant Design X 的 production chunk 归属与 bootstrap 导入回归

**Files:**

- Modify: src/chunking/manualChunks.ts
- Modify: src/chunking/manualChunks.test.ts
- Create: scripts/regression/html-template-production-import.mjs
- Create: scripts/regression/html-template-production-import.test.mjs
- Modify: package.json

**Interfaces:**

- Consumes: getManualChunkName(id: string): string | undefined。
- Produces: assertHtmlTemplateBootstrapImport({ adminRoot: string }): Promise<void> 和 test:production:html-bootstrap。

- [ ] **Step 1: Write the failing ownership test**

Add a dedicated test that expects both @ant-design/x and @ant-design/x-markdown package ids to resolve to vendor-antd, while highlight.js and html-react-parser remain spec-template-vendor.

- [ ] **Step 2: Run the test to verify it fails**

Run: pnpm exec vitest run src/chunking/manualChunks.test.ts

Expected: @ant-design/x packages are currently returned as spec-template-vendor.

- [ ] **Step 3: Write the minimal implementation**

Remove only @ant-design/x and @ant-design/x-markdown from SPEC_TEMPLATE_PACKAGES. The existing @ant-design/ package-group rule assigns them to vendor-antd.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: pnpm exec vitest run src/chunking/manualChunks.test.ts

Expected: PASS, with parser/highlight packages unchanged.

- [ ] **Step 5: Write the failing production import runner**

Create a Node ESM runner that:

    export async function assertHtmlTemplateBootstrapImport({ adminRoot }) {
      const entry = path.join(adminRoot, 'assets', 'html-template-bootstrap.js');
      await import(pathToFileURL(entry).href + '?run=' + Date.now());
    }

The CLI accepts --admin-root, throws an explicit missing-entry error, and prints success only after the dynamic import settles.

- [ ] **Step 6: Verify the runner exposes the current production failure**

Run: node scripts/regression/html-template-production-import.mjs --admin-root "$PWD/dist/admin"

Expected: FAIL containing Cannot access 'Oi' before initialization.

- [ ] **Step 7: Build and verify the real production graph**

Run: pnpm admin:build && node scripts/regression/html-template-production-import.mjs --admin-root "$PWD/dist/admin"

Expected: build succeeds and the import no longer throws TDZ.

- [ ] **Step 8: Add a named production command**

Add package script:

    test:production:html-bootstrap:
      pnpm admin:build && node scripts/regression/html-template-production-import.mjs --admin-root dist/admin

### Task 2: 建立可测试的严格 iframe 请求会话

**Files:**

- Create: src/index/app/index-page/iframeMessageRequest.ts
- Create: src/index/app/index-page/iframeMessageRequest.test.ts

**Interfaces:**

- Produces: postIframeMessageRequest(options): Promise<Record<string, unknown> | null>。
- Consumes: a MessageEventHost with addEventListener, removeEventListener, setTimeout, clearTimeout; targetUrl, targetWindow, message envelope and a current-session predicate.

- [ ] **Step 1: Write failing behavioral tests**

Cover the following independent cases:

1. A matching ACK is accepted only when source, dynamic target origin, requestId and success type match.
2. Wrong source or origin is ignored even if requestId matches.
3. A later correct ACK after an initial retry resolves exactly once.
4. An iframe session becoming stale resolves null and clears timers/listeners.
5. Invalid URL, error ACK and timeout finish deterministically.

Use fake timers and a fake event host so tests exercise real helper logic, not mocks of helper behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: pnpm exec vitest run src/index/app/index-page/iframeMessageRequest.test.ts

Expected: module-not-found error for iframeMessageRequest.

- [ ] **Step 3: Write minimal implementation**

Use retry delays [0, 160, 520, 1200, 2500]. Capture the target window at request start. Require isCurrent before each send and receive. Calculate origin with new URL(targetUrl, hostOrigin).origin. Resolve null on stale or timeout and remove every timer/listener.

- [ ] **Step 4: Verify the helper suite is green**

Run: pnpm exec vitest run src/index/app/index-page/iframeMessageRequest.test.ts

Expected: all source/origin/staleness/retry tests pass.

### Task 3: 迁移原型编辑器桥，并覆盖 HTML 规格 content URL

**Files:**

- Modify: src/index/app/index-page/usePrototypeEditorBridgeActions.ts
- Modify: src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts
- Modify: src/index/app/index-page/usePreviewIframeActions.ts
- Create or modify: src/index/app/index-page/usePreviewIframeActions.test.ts

**Interfaces:**

- Consumes: postIframeMessageRequest from Task 2.
- Produces: one request identity per editor action and rejection of responses from stale iframe instances.

- [ ] **Step 1: Write failing bridge tests**

Add a direct URL classifier test for:

    /api/projects/project/prototypes/home/spec/content?path=spec.html

It must be eligible for same-origin HTML bootstrap injection. Add source or behavior coverage that expects AXHUB_PROTOTYPE_EDITOR commands to use postIframeMessageRequest rather than a one-shot postMessage.

- [ ] **Step 2: Verify the tests are red**

Run: pnpm exec vitest run src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts src/index/app/index-page/usePreviewIframeActions.test.ts

Expected: prototype spec content URL is not recognized and the inline one-shot bridge remains.

- [ ] **Step 3: Implement the narrow migration**

Replace only the inline pending-request map/send path with the helper. Keep direct DevTemplateBootstrap and HtmlTemplateBootstrap APIs as the first path. Recognize prototype spec content only for HTML resources; Markdown must remain on the spec-template route.

- [ ] **Step 4: Add iframe generation invalidation**

Expose a generation token from usePreviewIframeActions that increments for a preview iframe load/replacement. Pass isCurrent to the bridge so a callback from a previous document cannot resolve a request for the replacement document.

- [ ] **Step 5: Verify focused bridge tests are green**

Run:

    pnpm exec vitest run \
      src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts \
      src/index/app/index-page/usePreviewIframeActions.test.ts \
      src/server/__tests__/prototype-spec-api.test.ts

Expected: bootstrap injection, direct API, stale bridge rejection and prototype spec HTML response checks pass.

### Task 4: 加入真实浏览器双端口与发布包验证

**Files:**

- Create: scripts/regression/html-spec-dynamic-origin.mjs
- Create: scripts/regression/html-spec-dynamic-origin.test.mjs
- Modify: package.json
- Modify: scripts/release-make.mjs only if no existing staged-package test hook can invoke the runner

**Interfaces:**

- Consumes: fresh dist/admin, temporary project fixture, staged .release/make/npm-package/dist/admin.
- Produces: test:production:html-spec and a release-package bootstrap assertion.

- [ ] **Step 1: Write the failing dynamic-port scenario definition**

The runner must allocate ports with listen(0), create a project with prototypes/home/.spec/spec.html, collect pageerror plus console errors, and fail if errors contain Cannot access before initialization or target origin provided.

- [ ] **Step 2: Verify it fails against the current build**

Run: pnpm admin:build && node scripts/regression/html-spec-dynamic-origin.mjs --admin-root "$PWD/dist/admin"

Expected: the runner records the TDZ failure.

- [ ] **Step 3: Implement the browser scenario**

Use the project’s existing browser test runtime. It must start Make and client on port 0, open the spec deep link, wait for HtmlTemplateBootstrap.editors, request editor enablement and ACK, switch to runtime and back, then assert no stale response or console mismatch.

Add negative unit fixtures for delayed ACK, wrong origin, wrong source and iframe replacement; do not weaken browser security.

- [ ] **Step 4: Verify the scenario is green**

Run: pnpm test:production:html-spec

Expected: output includes two dynamically assigned origins and a passing assertion summary.

- [ ] **Step 5: Validate the staged npm package**

Run:

    pnpm release:make:prepare
    node scripts/regression/html-template-production-import.mjs --admin-root "$PWD/.release/make/npm-package/dist/admin"
    pnpm release:make:test-local

Expected: staged asset import succeeds and the local package install smoke passes.

### Task 5: Full regression and release evidence

**Files:**

- Modify only if a test reveals an in-scope defect.

- [ ] **Step 1: Run focused suites**

Run:

    pnpm exec vitest run \
      src/chunking/manualChunks.test.ts \
      src/index/app/index-page/iframeMessageRequest.test.ts \
      src/index/app/index-page/usePreviewIframeActions.test.ts \
      src/index/app/index-page/usePrototypeEditorBridgeActions.test.ts \
      src/server/__tests__/prototype-spec-api.test.ts \
      src/server/__tests__/viteDevServer.test.ts

Expected: all selected tests pass; record any pre-existing dirty-worktree failure separately.

- [ ] **Step 2: Run production and release checks**

Run:

    pnpm test:production:html-bootstrap
    pnpm test:production:html-spec
    pnpm release:make:prepare
    node scripts/regression/html-template-production-import.mjs --admin-root "$PWD/.release/make/npm-package/dist/admin"
    pnpm release:make:test-local

Expected: no TDZ error, no target-origin mismatch, package starts from staged distribution.

- [ ] **Step 3: Run existing smoke coverage**

Run: pnpm smoke:test

Expected: all default journeys pass or an unrelated existing failure is recorded with its command and output.

- [ ] **Step 4: Inspect final diff**

Run:

    git diff --check
    git status --short

Expected: no whitespace errors and only in-scope files are included in the handoff.

