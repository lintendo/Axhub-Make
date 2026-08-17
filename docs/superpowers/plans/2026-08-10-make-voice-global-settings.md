# Axhub Make Voice Global Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global, secret-safe settings for Doubao speech, an OpenAI-compatible processing API, and a vision API to Axhub Make's existing AI settings tab.

**Architecture:** A dedicated Make-owned settings store writes `~/.axhub/make/voice-assistant.settings.json` atomically with `0600` permissions. A thin project-scoped management endpoint exposes only masked data, while a separate React section owns its fetch/draft lifecycle and exposes save to the existing dialog-wide save action without changing any voice runtime flow.

**Tech Stack:** TypeScript 5, Node.js filesystem APIs, Axhub Make management API, React 18, shadcn/Radix UI, Vitest.

## Global Constraints

- Do not modify the existing voice conversation, tool, annotation, ACP/direct-run, or task execution paths.
- Do not read ACP UI's voice settings file.
- Do not return stored secrets to the browser.
- Do not add new runtime dependencies.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Make-owned global voice settings store

**Files:**
- Modify: `src/server/projectCore/paths.ts`
- Create: `src/server/projectCore/voice-assistant-settings.ts`
- Modify: `src/server/projectCore/index.ts`
- Test: `src/server/projectCore/voice-assistant-settings.test.ts`

**Interfaces:**
- Produces: `getGlobalVoiceAssistantSettingsPath(homeDir?)`, `readVoiceAssistantSettings(options?)`, `writeVoiceAssistantSettingsPatch(patch, options?)`, `maskVoiceAssistantSettings(settings)`.
- Stored sections: `doubao`, `processing`, and `vision`; supported secret paths are `doubao.accessKey`, `processing.apiKey`, and `vision.apiKey`. The later protocol simplification design removes user-configurable App Key, Resource ID, and realtime URL.

- [ ] Write failing tests for defaults, URL/number normalization, masked responses, secret preservation, explicit clearing, atomic persistence, and `0600` permissions.
- [ ] Run `pnpm exec vitest run src/server/projectCore/voice-assistant-settings.test.ts` and confirm the missing module failure.
- [ ] Implement the path helper, types, defaults, normalization, masking, patch merge, atomic writer, and permission enforcement.
- [ ] Re-run the focused store test and confirm all cases pass.

### Task 2: Secret-safe management API

**Files:**
- Modify: `src/server/managementApi.config.ts`
- Create: `src/server/__tests__/voice-assistant-settings-api.test.ts`

**Interfaces:**
- Consumes: the Task 1 store helpers.
- Produces: `GET /api/config/voice-assistant` and `PUT /api/config/voice-assistant` with response `{ settings: VoiceAssistantSettingsPublic }`.

- [ ] Write failing API tests that register two projects against one registry home, save from project A, read from project B, and assert no secret text appears in either response.
- [ ] Run `pnpm exec vitest run src/server/__tests__/voice-assistant-settings-api.test.ts` and confirm a 404/missing-route failure.
- [ ] Add the thin route branch to `handleConfigApi`, derive the Make home from `registryPath`, parse `{ patch, clearSecrets }`, and return structured 400 errors for invalid input.
- [ ] Re-run the focused API test and confirm all cases pass.

### Task 3: Isolated AI-tab settings section

**Files:**
- Create: `src/index/components/settings/VoiceAssistantSettingsSection.tsx`
- Create: `src/index/components/settings/VoiceAssistantSettingsSection.test.ts`
- Modify: `src/index/components/SettingsDialog.tsx`

**Interfaces:**
- Consumes: `projectId`, the existing `withProjectScope` helper, and Task 2's API.
- Produces: `<VoiceAssistantSettingsSection ref={voiceAssistantSettingsRef} projectId={projectId} active={activeTab === 'ai'} />`, three independent global-service panels, a shared `SettingsCollapsiblePanel`, and a one-time-per-opening tab initialization guard.

- [ ] Write failing tests for public-to-draft conversion, patch construction, secret-preservation placeholders, explicit clear paths, all three configuration sections, and project-scoped GET/PUT URLs.
- [ ] Run `pnpm exec vitest run src/index/components/settings/VoiceAssistantSettingsSection.test.ts` and confirm the missing component failure.
- [ ] Implement the focused component with its own loading, draft, secret, clear, and feedback state using existing UI primitives; expose an imperative save handle without rendering a separate save button.
- [ ] Present Doubao speech, the processing API, and the vision API as three independent collapsible global-service panels rather than one voice-assistant group.
- [ ] Mount the panels after “图片生成 API”, name the speech panel “豆包语音 API”, make every top-level AI settings area independently collapsible, invoke the save handle from the existing dialog footer save action, and prevent later prop changes from resetting the active settings tab.
- [ ] Re-run the focused component test and the existing `SettingsDialog.source.test.ts`.

### Task 4: Focused regression and build verification

**Files:**
- Verify only; do not modify unrelated failures.

- [ ] Run `pnpm exec vitest run src/server/projectCore/voice-assistant-settings.test.ts src/server/__tests__/voice-assistant-settings-api.test.ts src/index/components/settings/VoiceAssistantSettingsSection.test.ts src/index/components/SettingsDialog.source.test.ts`.
- [ ] Run `pnpm exec tsc --noEmit -p tsconfig.node.json`.
- [ ] Run `pnpm exec tsc --noEmit -p tsconfig.json`.
- [ ] Run `pnpm admin:build`.
- [ ] Inspect `git diff --check` and the scoped diff, confirming no runtime voice files changed.
