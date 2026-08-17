# 预览入口早期错误捕获实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 捕获 Quick Edit runtime 尚未完成异步 bootstrap 时发生的预览入口模块错误，并交给现有诊断/弹窗链路处理。

**Architecture:** `clientPreviewPlugin.ts` 在管理 runtime 注入脚本的异步等待前同步安装一次性早期监听器，将普通化事件放入有限队列。`quickEditRuntimeApi.ts` 在正式监听器注册后停止早期监听器并回放队列，保留现有资源诊断、瞬态刷新和错误弹窗行为。

**Tech Stack:** TypeScript、Vite HTML middleware、浏览器 `window` error events、Vitest。

## Global Constraints

- 使用 pnpm/Vitest；不新增依赖。
- 保留用户已有的未提交修改，只修改错误捕获相关代码与回归测试。
- 保留 React 18.2.0、TypeScript 5.x 约束。
- 首次瞬态 Vite 资源失败仍只自动刷新一次，重复失败才显示现有错误弹窗。

### Task 1: 注入脚本的早期错误队列

**Files:**
- Modify: `client/tests/quick-edit-runtime-injection.test.ts`
- Modify: `client/vite-plugins/clientPreviewPlugin.ts:408-457`

**Interfaces:**
- Produces `window.__AXHUB_EARLY_RUNTIME_ERROR_CAPTURE__ = { queue, stop }` for the later runtime.

- [ ] **Step 1: Write the failing test**

Extend the test harness with `window.addEventListener`, `window.removeEventListener`, and an `emit` helper. Add a test that starts `runManagementRuntimeLoader` with an unresolved bootstrap Promise, emits one resource `error` and one `unhandledrejection`, and asserts both normalized records are already in `window.__AXHUB_EARLY_RUNTIME_ERROR_CAPTURE__.queue` before bootstrap resolves.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `pnpm exec vitest run client/tests/quick-edit-runtime-injection.test.ts -t "captures preview errors before bootstrap resolves"` from `apps/axhub-make`.

Expected: FAIL because the injected loader currently has no early capture state.

- [ ] **Step 3: Implement the minimal synchronous capture**

At the beginning of `createManagementRuntimeLoaderSource`'s returned source, before `window.__AXHUB_MANAGEMENT_RUNTIME_BOOTSTRAP__ ||= (async () => {`, initialize the global state once, register capture-phase listeners, normalize event fields and cap the queue at 50. Keep the existing async bootstrap body unchanged after the synchronous setup.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Vitest command; expect PASS.

### Task 2: Quick Edit queue replay

**Files:**
- Modify: `src/server/__tests__/quickEditRuntimeApi.test.ts`
- Modify: `src/server/quickEditRuntimeApi.ts:1200-1260`

**Interfaces:**
- Consumes `window.__AXHUB_EARLY_RUNTIME_ERROR_CAPTURE__` records with `eventType`, `error`, `reason`, `message`, `filename`, `lineno`, `colno`, and optional normalized `target`.
- Produces no new public API; replay routes through the existing internal `autoReportPrototypeError`/Vite recovery code paths.

- [ ] **Step 1: Write the failing test**

Pass a pre-populated early capture state through `createRuntimeHarness`, containing a queued ordinary `error` with message `Queued module failure` and a `stop` spy. Assert after runtime initialization that the queue is empty, `stop` ran once, and the existing prototype error dialog contains `Queued module failure`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `pnpm exec vitest run src/server/__tests__/quickEditRuntimeApi.test.ts -t "replays early runtime errors"` from `apps/axhub-make`.

Expected: FAIL because the runtime currently never drains the early capture state.

- [ ] **Step 3: Implement replay through shared handlers**

Extract the bodies of the current inline `error` and `unhandledrejection` listeners into named handlers. Register those handlers, drain the queued records after registration, call `stop`, and replay each record through the matching handler. Preserve resource-specific transient Vite recovery and all existing metadata normalization.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Vitest command; expect PASS.

### Task 3: Regression verification

**Files:**
- No additional source files.

- [ ] **Step 1: Run both focused suites**

Run `pnpm exec vitest run client/tests/quick-edit-runtime-injection.test.ts src/server/__tests__/quickEditRuntimeApi.test.ts` from `apps/axhub-make`.

- [ ] **Step 2: Run workspace checks**

Run `pnpm server:build` and `pnpm --dir client typecheck` from `apps/axhub-make`.

- [ ] **Step 3: Re-run the requested prototype acceptance**

Run `node scripts/check-app-ready.mjs /prototypes/home-pilot` from `apps/axhub-make/client` and confirm the result is `READY` with `typeCheck.status === "SUCCESS"`; inspect the final diff to ensure `src/prototypes/home-pilot/**` remains untouched by this task.
