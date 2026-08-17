# Canvas Viewport AI Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click canvas AI action that uses the current viewport screenshot and a bounded, canvas-scoped ACP session.

**Architecture:** A small client utility owns local session expiry and prompt construction. `CanvasAiGenerationTool` captures the current viewport and starts a single direct run without a canvas status element. The app passes the explicit ACP thread IDs and screenshot to `submitAnnotationPromptViaApi`; the Agent performs final placement through canvas MCP.

**Tech Stack:** React 18.2, TypeScript 5, Vitest 4, pnpm.

## Task 1: Add deterministic session and prompt utilities

**Files:**
- Add: `src/index/domains/ai-generation/canvasViewportAiSession.ts`
- Add: `src/index/domains/ai-generation/canvasViewportAiSession.test.ts`
- Add: `src/index/domains/ai-generation/canvasViewportAiPrompt.ts`
- Add: `src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts`

- [x] Add tests for stable canvas session keys, provider invalidation, 30-minute absolute TTL, and eight accepted turns.
- [x] Implement a storage-backed resolver that only advances a turn after acceptance.
- [x] Add a concise viewport prompt builder with live-canvas and nearby-placement constraints.
- [x] Run the two targeted Vitest files.

## Task 2: Allow ACP direct runs to reuse threads and receive screenshots

**Files:**
- Modify: `src/index/domains/assistant/annotationDirectRun.ts`
- Modify: `src/index/domains/assistant/annotationDirectRun.test.ts`

- [x] Extend options with optional thread/conversation IDs and `referenceImages`.
- [x] Keep a unique run ID while respecting supplied session identities.
- [x] Forward images to `runAiStream` and add regression tests.
- [x] Run targeted direct-run tests.

## Task 3: Add viewport capture and one-click execution

**Files:**
- Modify: `src/index/components/content/ExcalidrawCanvas.tsx`
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`
- Modify: `src/index/app/IndexPage.tsx`
- Modify or add targeted canvas source/unit tests.

- [x] Expose a callback that exports the currently visible viewport to a PNG data URL.
- [x] Add a bottom one-click action with single-active-run state and cancel support.
- [x] Build the viewport-specific request without creating a status task.
- [x] Use the bounded session and prompt utilities; persist only accepted turns.
- [x] Pass the image, session IDs, and MCP server configuration through the app request path.
- [x] Skip client-side artifact placement for viewport writeback; surface concise AI clarification messages.

## Task 4: Verify scoped behavior

- [x] Run every changed targeted Vitest suite.
- [x] Run `pnpm server:build` from `apps/axhub-make`.
- [x] Inspect the scoped diff and confirm existing user changes were preserved.
