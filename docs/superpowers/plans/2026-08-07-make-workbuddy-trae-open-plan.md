# Make WorkBuddy and TRAEWORK Open Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WorkBuddy and TRAEWORK to Make's top-left AI open menu with verified directory-opening behavior and honest fallback boundaries.

**Architecture:** Reuse Make's project-scoped local-app open API for both providers. WorkBuddy uses its `workbuddy://task?action=start` deep link with an encoded `cwd`; TRAEWORK uses the TRAE SOLO / TRAE SOLO CN directory launcher (`trae-solo [paths...]` or the detected app executable). The CDP package remains the internal-browser path for qualified hosts only; WorkBuddy and TRAEWORK remain diagnostic/experimental for injection until a stable internal Browser smoke test exists.

**Tech Stack:** TypeScript, React, Vitest, Node `child_process`, existing Make launcher abstractions.

## Global Constraints

- Use pnpm and preserve unrelated dirty worktree changes.
- Keep macOS and Windows behavior explicit and shell-free at the process-spawn boundary.
- Do not claim WorkBuddy or TRAEWORK internal-browser injection support without a verified smoke test.
- Preserve existing ChatGPT/Cursor restart and normal-open behavior.

### Task 1: Add provider contracts and failing launcher tests

**Files:**
- Modify: `src/server/agentTypes.ts`
- Modify: `src/server/agentOpen.ts`
- Test: `src/server/__tests__/agent-open-api.test.ts`

- [x] Add failing tests for WorkBuddy `cwd` deep-link encoding on macOS/Windows and TRAEWORK directory command dispatch.
- [x] Add provider labels/options and typed normalization.
- [x] Run the focused tests and confirm they fail for the missing providers.

### Task 2: Implement the two directory open paths

**Files:**
- Modify: `src/server/agentOpen.ts`
- Modify: `src/server/ideOpen.ts` only if the existing TRAE launcher needs a narrowly scoped shared helper.

- [x] Implement WorkBuddy's `workbuddy://task?action=start&prompt=...&cwd=...` launch using the existing detached deep-link path.
- [x] Route TRAEWORK through TRAE SOLO / TRAE SOLO CN, preserving Windows executable/app-path fallback.
- [x] Keep path validation in the API handler and avoid shell-string command execution.
- [x] Run the focused tests and confirm they pass.

### Task 3: Wire the top-left menu and API response types

**Files:**
- Modify: `src/index/components/sidebar/OpenInDropdown.tsx`
- Modify: `src/index/services/api.ts`
- Modify: `src/index/components/sidebar/OpenInDropdown.test.ts`
- Modify: `src/index/services/api.test.ts`

- [x] Add WorkBuddy and TRAEWORK to the local open group with provider-specific icons/labels.
- [x] Keep ChatGPT/Cursor integrated restart dialog unchanged.
- [x] Show clear success/failure messages and do not show an injection success message for experimental hosts.
- [x] Run frontend-focused tests.

### Task 4: Verify release and document support matrix

**Files:**
- Modify: `README.md` or app-scoped docs only if the existing Make usage documentation has a provider table.

- [x] Run Make server typecheck and focused server/frontend tests.
- [x] Verify the generated command shapes for macOS and Windows.
- [x] Record that WorkBuddy supports cwd task deep links, TRAEWORK supports TRAE SOLO directory opening, and neither is yet qualified for package CDP injection.
