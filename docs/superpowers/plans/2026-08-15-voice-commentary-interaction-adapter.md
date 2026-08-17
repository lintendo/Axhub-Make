# Voice Commentary Interaction Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make voice a thin interaction adapter over Make's existing manual Commentary behavior and remove the internal empty-spoken-reply failure.

**Architecture:** Manual Commentary continues to call its established direct-run code. Voice tools delegate into the same creation, persistence, and execution functions, while ACP UI remains responsible only for bounded model/tool orchestration and spoken output.

**Tech Stack:** React 18.2, TypeScript 5, Vitest, Node test runner, ACP UI LiveKit/Doubao voice worker.

**Spec:** `docs/superpowers/specs/2026-08-15-voice-commentary-interaction-adapter-design.md`

## Global Constraints

- Do not change or migrate existing comment documents.
- Do not route manual Commentary actions through voice-only operations.
- Do not add source-based or page-scope filtering to the full-list tool.
- Use pnpm for Axhub Runtime commands and the existing npm scripts for ACP UI.
- Preserve all unrelated dirty-worktree changes.
- Do not use HTML-based verification.

---

### Task 1: Restore the manual Commentary execution boundary

**Files:**
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- Modify: `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Consumes: `runAnnotationAcpChatPrompt(request)` and the existing manual `send-to-agent` actions.
- Produces: manual execution that does not call `MakeVoiceCommentOperations`.

- [ ] **Step 1: Write a failing regression test**

  Add a source-boundary test that extracts the manual `send-to-agent` branches
  and asserts they invoke `runAnnotationAcpChatPrompt`, not
  `submitPersistedCommentExecutions` or `onSubmitCommentExecution`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```bash
  pnpm exec vitest run src/index/app/index-page/useIndexPagePreviewActions.test.ts
  ```

  Expected: the new boundary assertion fails because manual actions currently
  route through the voice persistence adapter.

- [ ] **Step 3: Restore the established manual branches**

  Restore `runQuickEditHostToolbarAction`, `runPrototypePanePromptAction`, and
  the document/quick-edit `runHostToolbarAction` branches to call
  `runAnnotationAcpChatPrompt` with their collected prompt and editing targets.
  Remove the `onSubmitCommentExecution` dependency and its IndexPage ref/wiring;
  leave the voice tool's own `commentaryVoiceCommentOperations` wiring intact.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Re-run the command from Step 2 and require zero failures.

### Task 2: Make comment listing resource-wide and legacy-compatible

**Files:**
- Modify: `src/index/domains/assistant/makeVoiceCommentPersistence.test.ts`
- Modify: `src/index/domains/assistant/makeVoiceCommentPersistence.ts`
- Modify: `src/index/domains/assistant/makeVoiceTools.test.ts`

**Interfaces:**
- Consumes: the existing persisted comment document returned by the Make adapter.
- Produces: `MakeVoiceCommentOperations.list()` and
  `axhub_make_list_comments` returning all live matching comments.

- [ ] **Step 1: Write a failing behavior test**

  Build a real in-memory document containing two live comments with different
  non-empty `pageScope` values, query with a current `pageScope`, and assert that
  both literal comment IDs are returned.

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```bash
  pnpm exec vitest run src/index/domains/assistant/makeVoiceCommentPersistence.test.ts src/index/domains/assistant/makeVoiceTools.test.ts
  ```

  Expected: only the same-scope comment is returned.

- [ ] **Step 3: Remove query-only page filtering**

  Delete the `currentPageScope/pageScope` filter from `list()`. Keep deleted,
  status, keyword, linked-annotation, sorting, pagination, and explicit
  execution page validation unchanged.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Re-run the command from Step 2 and require zero failures.

### Task 3: Keep empty spoken-reply handling inside the voice layer

**Files:**
- Modify: `/Volumes/WORK/rd/acp-ui/scripts/livekit-codex-voice/openai-brain-client.test.mjs`
- Modify: `/Volumes/WORK/rd/acp-ui/scripts/livekit-codex-voice/openai-brain-client.mjs`
- Modify: `/Volumes/WORK/rd/acp-ui/scripts/livekit-codex-voice/codex-brain-client.test.mjs`
- Modify: `/Volumes/WORK/rd/acp-ui/scripts/livekit-codex-voice/codex-brain-client.mjs`

**Interfaces:**
- Consumes: model tool calls and host-tool results.
- Produces: a concise final spoken string without changing any Make business operation.

- [ ] **Step 1: Write failing orchestration tests**

  Add one test per client where five sequential tool calls are followed by a
  normal assistant reply. Add an exhaustion test that keeps returning tools and
  expects the literal safe response `我还没能完成这个操作，请重新指定目标后再试。`
  rather than an internal exception.

- [ ] **Step 2: Run the ACP client tests and verify RED**

  Run:

  ```bash
  node --test scripts/livekit-codex-voice/openai-brain-client.test.mjs scripts/livekit-codex-voice/codex-brain-client.test.mjs
  ```

  Expected: current four-round loops throw their internal empty-content errors.

- [ ] **Step 3: Implement the bounded voice-only fix**

  Raise the internal tool-round budget to eight. Track whether a tool was
  requested; if the budget is exhausted without assistant text, return the safe
  literal response and publish `brain.completed`. Preserve timeout, abort,
  history, tool execution, and provider error behavior.

- [ ] **Step 4: Run the ACP client tests and verify GREEN**

  Re-run the command from Step 2 and require zero failures.

### Task 4: Integration verification and runtime reload

**Files:**
- Verify only; no new production files expected.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: evidence that Make and ACP UI consume the corrected boundaries.

- [ ] **Step 1: Run affected Make tests**

  ```bash
  pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/app/index-page/useIndexPagePreviewActions.test.ts src/index/domains/assistant/makeVoiceTools.test.ts src/index/domains/assistant/makeVoiceCommentPersistence.test.ts src/index/domains/assistant/makeRealtimeVoice.test.ts
  ```

- [ ] **Step 2: Run the ACP voice suite**

  ```bash
  npm run test:voice:livekit
  ```

- [ ] **Step 3: Run affected package checks**

  ```bash
  pnpm exec tsc --noEmit -p tsconfig.json
  npm run lint -- scripts/livekit-codex-voice/openai-brain-client.mjs scripts/livekit-codex-voice/codex-brain-client.mjs
  ```

  If the repository scripts do not accept a path argument, use the documented
  whole-package command and report any pre-existing unrelated failures exactly.

- [ ] **Step 4: Review the exact diffs**

  Confirm manual execution no longer imports or receives a voice execution
  callback, the full-list operation has no `pageScope` predicate, and ACP
  changes contain no Make business concepts.

- [ ] **Step 5: Restart the ACP voice worker through its existing dev-app owner**

  Stop only the ACP dev-app process that owns port 32124 and its child LiveKit
  workers, restart it with the same command, and verify the service health. Do
  not kill unrelated Node or Make processes.

- [ ] **Step 6: Request independent review and apply valid findings**

  Review the changed files against the spec, with special attention to manual
  execution regressions, false success speech, comment compatibility, aborts,
  and tool-loop bounds.
