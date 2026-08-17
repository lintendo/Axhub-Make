# Canvas Viewport AI Direct File Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-click viewport AI's Canvas MCP dependency with a pre-saved, metadata-rich direct edit of the active `.excalidraw` file.

**Architecture:** The canvas flushes pending browser changes before capturing the screenshot, viewport rectangle, and visible element IDs. The programmatic ACP request receives that context, explicitly uses `bypassPermissions`, omits Canvas MCP configuration, and instructs the agent to edit only the target file. Existing Canvas Bridge file watching reloads the finished JSON into the browser.

**Tech Stack:** React 18.2, TypeScript 5, Vitest 4, pnpm, ACP HTTP chat, Excalidraw.

## Global Constraints

- Do not change ACP UI or its sidebar conversation approval behavior.
- Do not mount `axhub-canvas` MCP for `source: "canvas-viewport"`.
- Preserve Canvas MCP behavior for every other canvas AI entry.
- Save pending browser canvas state before starting the AI request; abort when it remains dirty.
- Keep the existing 30-minute and eight-accepted-turn session limits.
- Do not commit from this dirty submodule worktree; verify only the scoped diff.

---

### Task 1: Define viewport metadata and direct-file prompt

**Files:**
- Modify: `src/index/domains/ai-generation/canvasViewportAiPrompt.ts`
- Modify: `src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts`
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`
- Test: `src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

**Interfaces:**
- Produces: `CanvasViewportAiCapture` with `dataUrl`, `viewportRect`, and `visibleElementIds`.
- Produces: `buildCanvasViewportAiPrompt({ canvasFilePath, viewportRect, visibleElementIds })`.

- [x] **Step 1: Write failing prompt and source-contract tests**

```ts
expect(prompt).toContain('不得调用任何 MCP');
expect(prompt).toContain('直接修改指定画布文件');
expect(prompt).toContain('"x":100');
expect(prompt).toContain('visible-a');
expect(prompt).not.toContain('画布 MCP');
expect(source).toContain('export interface CanvasViewportAiCapture');
expect(source).toContain('viewportRect: capture.viewportRect');
```

- [x] **Step 2: Run tests and confirm RED**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

Expected: prompt still requires Canvas MCP and capture is still a string.

- [x] **Step 3: Implement the metadata contract and prompt**

```ts
export interface CanvasViewportAiCapture {
  dataUrl: string;
  viewportRect: { x: number; y: number; width: number; height: number };
  visibleElementIds: string[];
}
```

The prompt must name the target file, serialize the finite viewport rectangle, include a bounded visible-ID list, forbid every MCP call, require re-reading before writing, preserve existing elements, and require valid Excalidraw JSON.

- [x] **Step 4: Re-run tests and confirm GREEN**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

Expected: both files pass.

### Task 2: Flush the canvas and capture placement metadata

**Files:**
- Modify: `src/index/components/content/ExcalidrawCanvas.tsx`
- Test: `src/index/components/content/ExcalidrawCanvas.source.test.ts`

**Interfaces:**
- Consumes: `CanvasViewportAiCapture`.
- Produces: `captureCurrentCanvasViewport(): Promise<CanvasViewportAiCapture>`.

- [x] **Step 1: Write the failing source-contract test**

```ts
expect(source).toContain('await saveToServer(elements, appState)');
expect(source).toContain("throw new Error('当前画布尚未保存完成')");
expect(source).toContain('viewportRect,');
expect(source).toContain('visibleElementIds: visibleElements.map');
```

- [x] **Step 2: Run the test and confirm RED**

Run: `pnpm exec vitest run src/index/components/content/ExcalidrawCanvas.source.test.ts`

Expected: capture returns only `capture.dataUrl` and does not flush pending state.

- [x] **Step 3: Implement save-before-capture**

Read one scene snapshot, call the existing `saveToServer` when `pendingLocalContentRef` or `bridgeDirtyRef` is set, and throw if either remains dirty. Then compute `getCanvasCommandViewportRect(appState)`, filter visible elements with `getCanvasCommandElementsInRect`, capture the same viewport, and return the image plus rect and IDs.

- [x] **Step 4: Re-run the test and confirm GREEN**

Run: `pnpm exec vitest run src/index/components/content/ExcalidrawCanvas.source.test.ts`

Expected: pass.

### Task 3: Route viewport requests without Canvas MCP

**Files:**
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/IndexPage.test.ts`
- Modify: `src/index/domains/assistant/annotationDirectRun.ts`
- Modify: `src/index/domains/assistant/annotationDirectRun.test.ts`
- Modify: `src/index/domains/ai-generation/aiRunClient.ts`

**Interfaces:**
- Produces: optional `permissionMode` through `submitAnnotationPromptViaApi` and `runAiStream`.
- Preserves: non-viewport direct runs continue receiving `buildCanvasMcpServersForDirectRun(...)`.

- [x] **Step 1: Write failing routing tests**

```ts
expect(submitSource).toContain("permissionMode: request.source === 'canvas-viewport' ? 'bypassPermissions' : undefined");
expect(submitSource).toContain("mcpServers: request.source === 'canvas-viewport'");
expect(params.permissionMode).toBe('bypassPermissions');
```

- [x] **Step 2: Run tests and confirm RED**

Run: `pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/domains/assistant/annotationDirectRun.test.ts`

Expected: viewport request still always builds Canvas MCP servers and no permission field exists.

- [x] **Step 3: Implement conditional routing**

Add `permissionMode?: string | null` to the direct-run and AI-run request types, serialize it in `runAiStream`, and pass it from `submitAnnotationPromptViaApi`. In `IndexPage`, set `bypassPermissions` and `mcpServers: undefined` only for `canvas-viewport`; keep the current MCP builder for all other sources.

- [x] **Step 4: Re-run tests and confirm GREEN**

Run: `pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/domains/assistant/annotationDirectRun.test.ts`

Expected: pass.

### Task 4: Forward permission mode to ACP HTTP chat

**Files:**
- Modify: `src/server/managementApi.aiRuns.ts`
- Test: `src/server/__tests__/ai-runs-api.test.ts`

**Interfaces:**
- Consumes: `request.permissionMode` from `/api/ai/runs`.
- Produces: `permissionMode` in the ACP `/api/chat` JSON body.

- [x] **Step 1: Write a failing API test**

Submit a direct AI run with `permissionMode: "bypassPermissions"` and assert:

```ts
expect(acp.requests[0].body.permissionMode).toBe('bypassPermissions');
expect(acp.requests[0].body.mcpServers).toBeUndefined();
```

- [x] **Step 2: Run the test and confirm RED**

Run: `pnpm exec vitest run src/server/__tests__/ai-runs-api.test.ts`

Expected: ACP body omits `permissionMode`.

- [x] **Step 3: Forward the normalized permission mode**

```ts
permissionMode: safeText(request.permissionMode) || undefined,
```

- [x] **Step 4: Re-run the test and confirm GREEN**

Run: `pnpm exec vitest run src/server/__tests__/ai-runs-api.test.ts`

Expected: pass.

### Task 5: Verify the complete direct-file flow

**Files:**
- Review all files from Tasks 1-4.

- [x] **Step 1: Run focused regression tests**

Run all prompt, session, controller, canvas, page, direct-run, and AI-runs API test files changed by this feature.

- [x] **Step 2: Run production builds**

Run: `pnpm server:build`

Run: `pnpm admin:build`

Expected: both exit 0.

- [x] **Step 3: Inspect the scoped diff**

Run `git diff --check` and verify the viewport prompt has no Canvas MCP instruction, the viewport request does not include `mcpServers`, and ACP UI files are untouched.
