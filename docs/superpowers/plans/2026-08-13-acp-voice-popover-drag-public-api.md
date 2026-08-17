# ACP Voice Popover And Drag Public API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically reveal the voice message card after connection and expose ACP's existing drag support to Make.

**Architecture:** Keep panel transition behavior inside ACP's shared surface, expose drag as a thin optional public prop, and let Make opt in. Rebuild the existing local package artifacts and refresh the current `file:` dependency without publishing.

**Tech Stack:** React, TypeScript, Node test runner, pnpm, ACP public library build, Vite.

**Spec:** `docs/superpowers/specs/2026-08-13-acp-voice-popover-drag-public-api-design.md`

## Global Constraints

- Do not change ACP or Make package versions.
- Do not publish to npm.
- Preserve `@axhub/acp: "file:../../../acp-ui"`.
- Preserve Make host tools while keeping ACP-owned tools disabled.
- Do not modify unrelated dirty worktree changes.

---

### Task 1: ACP panel transition behavior

**Files:**
- Create: `/Users/jianzhoulin/rd/acp-ui/components/assistant-ui/voice/shared-voice-panel-state.ts`
- Modify: `/Users/jianzhoulin/rd/acp-ui/components/assistant-ui/voice/shared-voice-surface.tsx`
- Test: `/Users/jianzhoulin/rd/acp-ui/components/assistant-ui/voice/shared-voice-surface.test.mjs`

**Interfaces:**
- Produces: `shouldAutoOpenVoicePanel(previousStatus, currentStatus): boolean`
- Consumes: `SharedVoiceSessionStatus`

- [ ] Add failing tests for initial connection, steady connected state, and reconnect.
- [ ] Run the focused ACP test and confirm the new assertion fails because the predicate is absent.
- [ ] Implement the predicate and wire it to a previous-status ref in `SharedVoiceSurface`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: ACP public draggable contract

**Files:**
- Modify: `/Users/jianzhoulin/rd/acp-ui/components/assistant-ui/voice/acp-voice-assistant.tsx`
- Modify: `/Users/jianzhoulin/rd/acp-ui/components/assistant-ui/voice/acp-voice-assistant.source.test.mjs`
- Modify: `/Users/jianzhoulin/rd/acp-ui/docs/component-runtime-api.md`

**Interfaces:**
- Produces: `AcpVoiceAssistantProps.draggable?: boolean`
- Consumes: `SharedVoiceSurfaceProps["draggable"]`

- [ ] Add a failing public-component regression for the missing draggable forwarding.
- [ ] Run the focused test and confirm the forwarding assertion fails.
- [ ] Add the optional prop, destructure it, and pass it to `SharedVoiceSurface`.
- [ ] Update the public API documentation and re-run the focused test.

### Task 3: Make consumer opt-in

**Files:**
- Modify: `src/index/components/content/MakeCommentaryVoiceEntry.tsx`
- Modify: `src/index/components/content/MakeCommentaryVoiceEntry.source.test.ts`

**Interfaces:**
- Consumes: `AcpVoiceAssistantProps.draggable?: boolean`
- Preserves: `injectAcpTools={false}` and `tools={tools}`

- [ ] Add a failing Make regression requiring the draggable prop.
- [ ] Run the focused Make test and confirm it fails.
- [ ] Pass `draggable` from the Make boundary.
- [ ] Re-run the focused Make test and confirm it passes.

### Task 4: Local artifact synchronization and verification

**Files:**
- Generate: `/Users/jianzhoulin/rd/acp-ui/dist/**`
- Refresh: Make's resolved pnpm `file:` dependency snapshot

- [ ] Run ACP focused and full voice tests.
- [ ] Run `npm run build:public-api` and `npm run test:public-api-package`.
- [ ] Run `pnpm install --force` in Make and compare local/resolved artifact hashes.
- [ ] Run Make focused tests, type checks, `server:build`, and `admin:build`.
- [ ] Perform independent review and local browser verification.

