# Global Settings AI Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow local-Agent configuration prompt with a secret-safe Axhub Make global-settings prompt backed by a shipped rules document.

**Architecture:** Keep editable global settings in their existing stores and APIs. A pure prompt builder receives the current Make API origin and project ID, points external AI agents to one client rules document, and describes the existing CLI/provider verification endpoints without duplicating the configuration schema in UI code.

**Tech Stack:** TypeScript 5, React 18, Markdown, Vitest.

## Global Constraints

- Cover only `~/.axhub/make/server.config.json` and `~/.axhub/make/voice-assistant.settings.json` (or `%USERPROFILE%` equivalents).
- Never modify project-level `.axhub/make/axhub.config.json` through this guidance.
- Preserve unknown JSON fields and refuse to overwrite invalid JSON.
- Require explicit confirmation for installation, secrets, passwords, tokens, and external publishing.
- Preserve unrelated dirty-worktree changes and do not stage or commit them.

---

### Task 1: Global settings prompt contract

**Files:**
- Modify: `src/index/components/settings/localAgentSettings.test.ts`
- Modify: `src/index/components/settings/localAgentSettings.ts`

**Interfaces:**
- Produces: `buildGlobalSettingsAiPrompt({ makeApiOrigin, projectId }): string`.
- The builder remains pure and does not read `window` or other browser globals.

- [x] Replace the old prompt test with a failing contract test that calls `buildGlobalSettingsAiPrompt({ makeApiOrigin: 'http://127.0.0.1:53817/', projectId: 'demo-project' })`.
- [x] Assert the prompt references `rules/axhub-make-global-settings.md`, both global JSON files, merge/unknown-field/invalid-JSON protections, secret confirmation, the normalized versions URL, the project-scoped AI-runs URL, `scene: "agent-provider-test"`, `client: "acp:<agent>"`, and `AXHUB_AGENT_TEST_OK`.
- [x] Run `pnpm exec vitest run src/index/components/settings/localAgentSettings.test.ts` and confirm failure because the new export is absent.
- [x] Implement the pure builder, normalizing only trailing slashes on the supplied API origin and URL-encoding the supplied project ID.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Settings dialog wiring and copy

**Files:**
- Modify: `src/index/services/api.test.ts`
- Modify: `src/index/services/api.ts`
- Modify: `src/index/components/SettingsDialog.source.test.ts`
- Modify: `src/index/components/SettingsDialog.tsx`

**Interfaces:**
- Produces: `resolveMakeApiOrigin(): string`, preferring the injected Make API origin and falling back to the page origin.
- Consumes: `projectId` and `resolveMakeApiOrigin()` from the settings dialog.
- Calls: `buildGlobalSettingsAiPrompt({ makeApiOrigin: resolveMakeApiOrigin(), projectId })`.

- [x] Add failing source assertions for the new import, explicit builder parameters, the button text `复制 AI 配置提示词`, and matching success/error toast copy.
- [x] Run the two focused settings tests and confirm the source contract fails on old names/copy.
- [x] Add a failing API-origin test for a page served separately from its injected Make API.
- [x] Export the existing Make API origin resolution and wire the current origin/project ID into the prompt builder; keep clipboard ownership in the dialog.
- [x] Re-run the focused settings and API tests.

### Task 3: Shipped rules document

**Files:**
- Create: `client/tests/global-settings-guidance.test.ts`
- Create: `client/rules/axhub-make-global-settings.md`

**Interfaces:**
- The Markdown file is the stable long-form schema and safety reference used by external AI agents.

- [x] Add a failing document contract test for Windows/macOS paths, UTF-8/two-space JSON, `automation`, `assistant`, `ai.imageGeneration`, `uiPreferences`, `toolOpenState`, LAN/cloud publishing, `doubao`, `processing` with UI name `网页任务 API`, `vision`, secret protection, desktop/CLI path keys, rollback semantics, and both verification APIs.
- [x] Run `pnpm --dir client exec vitest --run tests/global-settings-guidance.test.ts` and confirm failure because the rule file is absent.
- [x] Write the rules document with field meanings, safe read-merge-write steps, explicit-confirmation boundaries, official-install guidance, CLI rollback verification, provider SSE verification, and desktop-path validation.
- [x] Run all three focused tests.

### Task 4: Verification

**Files:**
- Verify only.

- [x] Run `pnpm exec vitest run src/index/services/api.test.ts src/index/components/settings/localAgentSettings.test.ts src/index/components/SettingsDialog.source.test.ts`.
- [x] Run `pnpm --dir client exec vitest --run tests/global-settings-guidance.test.ts`.
- [x] Run `pnpm exec tsc --noEmit -p tsconfig.json`; it is blocked before source checking by missing project-reference declaration outputs (`TS6305`). A reference-free scoped typecheck passes for the new pure logic.
- [x] Run `pnpm admin:build`; it is blocked by the existing unresolved `@tiptap/react` import from `vendor/tiptap-editor/dist/index.js`.
- [x] Run `git diff --check` and inspect the scoped diff against every requirement in the design spec.

### Task 5: Concise rules and Doubao acquisition guidance

**Files:**
- Modify: `client/tests/global-settings-guidance.test.ts`
- Modify: `client/rules/axhub-make-global-settings.md`

**Interfaces:**
- Keeps the same rule path consumed by `buildGlobalSettingsAiPrompt`.
- Adds the official Doubao Speech console URL and user-guidance behavior without changing configuration storage or APIs.

- [x] Add assertions that the rule contains `https://console.volcengine.com/speech/new/overview`, tells the AI to guide the user there when Doubao configuration is missing, and remains at most 100 lines.
- [x] Run `pnpm --dir client exec vitest --run tests/global-settings-guidance.test.ts`; confirm failure because the official URL and acquisition fields are absent.
- [x] Rewrite the rule with short sections and field tables while preserving its existing scope, secret handling, merge safety, Agent path formats, rollback behavior, and both verification APIs.
- [x] Re-run the focused rule test and `pnpm exec vitest run src/index/components/settings/localAgentSettings.test.ts`.
- [x] Run `git diff --check` and inspect the rewritten rule for duplicated instructions or exposed secret examples.
