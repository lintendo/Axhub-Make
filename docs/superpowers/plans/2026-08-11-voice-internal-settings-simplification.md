# Make 与 ACP 语音内部参数精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从 Make 与 ACP 的用户设置和配置契约中移除 App Key、Resource ID、实时语音 URL，同时保留豆包协议所需的内部固定常量，并统一批注菜单的语音助手图标状态。

**Architecture:** 配置层只向浏览器公开 App ID、Access Key presence 和 speaker 等用户选项；服务端/ACP 运行时在请求适配层注入固定协议常量。旧配置字段只读兼容但不再参与用户配置更新。Make 菜单复用现有 `aria-checked`/选中高亮模式，保持既有挂载回调和生命周期不变。

**Tech Stack:** TypeScript, React, Next/Vite, Vitest, Node test, lucide-react, pnpm.

## Global Constraints

- 不删除用户已有配置文件；读取旧 `appKey`/`resourceId`/`realtimeUrl` 时忽略。
- 豆包协议内部常量固定为 `PlgvMymc7f3tQnJ6`、`volc.speech.dialog`、`wss://openspeech.bytedance.com/api/v3/realtime/dialogue`。
- 浏览器只获得脱敏 Access Key 状态，不获得真实密钥。
- Make Commentary 入口仍只用 App ID 与 Access Key 判断是否 ready。
- 不修改语音 session、工具、批注持久化或 direct-run 主链路。

### Task 1: Make settings contract and store

**Files:**

- Modify: `src/server/projectCore/voice-assistant-settings.ts`
- Modify: `src/server/projectCore/voice-assistant-settings.test.ts`
- Modify: `src/server/managementApi.config.ts`
- Modify: `src/server/__tests__/voice-assistant-settings-api.test.ts`
- Modify: `src/index/components/settings/voiceAssistantSettingsForm.ts`
- Modify: `src/index/components/settings/VoiceAssistantSettingsSection.tsx`
- Modify: `src/index/components/settings/VoiceAssistantSettingsSection.test.ts`
- Modify: `src/index/services/api.ts`
- Modify: `src/index/domains/assistant/makeVoiceConfiguration.ts`

**Interfaces:** `VoiceAssistantSettingsPublic.doubao` keeps `appId`, `speaker`, `hasAccessKey`; `VoiceAssistantSecretPath` no longer includes `doubao.appKey`; Make config readiness signature remains unchanged.

- [ ] Write failing tests asserting the Make public settings/form no longer contains App Key, Resource ID, or realtime URL, defaults do not expose them as user-editable fields, and old stored fields are ignored while fixed values remain available only to internal normalization.
- [ ] Run the Make settings/API tests and confirm the new assertions fail against the current implementation.
- [ ] Remove the three fields from public draft/update/secret types and JSX; preserve Access Key, App ID, speaker, processing and vision settings.
- [ ] Update Make store/API masking and patch filtering so `appKey`, `resourceId`, and `realtimeUrl` are ignored from user payloads; keep internal constants in a private runtime helper if needed by downstream consumers.
- [ ] Run the Make settings/API/configuration focused tests and confirm they pass.

### Task 2: ACP settings and runtime contract

**Files:**

- Modify: `lib/voice-agent/settings.ts`
- Modify: `lib/voice-agent/settings-client.ts`
- Modify: `components/assistant-ui/voice-settings-panel.tsx`
- Modify: `components/assistant-ui/voice-settings-panel.source.test.mjs`
- Modify: `scripts/livekit-codex-voice/runtime-settings.mjs`
- Modify: `scripts/livekit-codex-voice/runtime-settings.test.mjs`
- Modify: `scripts/livekit-voice/doubao-realtime-model.mjs`
- Modify: `scripts/livekit-voice-agent.mjs`
- Modify: `scripts/livekit-codex-voice-agent.mjs`
- Modify: `scripts/doubao-voice-gateway.mjs`
- Modify: `scripts/doubao-voice-gateway.test.mjs`
- Modify: related ACP voice settings tests under `lib/voice-agent` and `components/assistant-ui`.

**Interfaces:** ACP public settings expose `hasAccessKey` but no `hasAppKey`; update/clear secret paths only retain supported user secrets. Runtime adapters use internal constants and do not read `DOUBAO_REALTIME_APP_KEY` or user `appKey`.

- [ ] Write failing tests for the reduced ACP settings shape, absence of three fields from the panel/update payload, and fixed runtime headers/constants.
- [ ] Run the focused ACP tests and confirm they fail for the expected field/constant assertions.
- [ ] Remove the three user-facing fields and secret paths, then replace runtime configuration reads with internal constants while keeping required protocol headers.
- [ ] Run ACP voice settings, runtime-settings, gateway, and source contract tests.

### Task 3: Commentary menu voice state

**Files:**

- Modify: `src/index/components/content/PresentationToolbar.tsx`
- Modify: `src/index/components/content/MakeCommentaryVoiceVisibility.source.test.ts`
- Modify: `src/index/components/content/PresentationToolbar.source.test.ts`

**Interfaces:** Existing `commentaryVoiceVisible` and `onToggleCommentaryVoice` remain unchanged.

- [ ] Write failing source assertions for fixed `语音助手` text, `Mic` when off, `Check` when on, `role="menuitemcheckbox"`, and `aria-checked`.
- [ ] Run the focused toolbar tests and confirm they fail against dynamic show/hide text.
- [ ] Implement the menu item using the existing AI menu pattern: fixed label, conditional icon, selected background, and existing click/close behavior.
- [ ] Run the toolbar and visibility tests.

### Task 4: Cross-repo verification and docs

**Files:**

- Modify: `docs/superpowers/specs/2026-08-10-make-voice-global-settings-design.md`
- Modify: `docs/superpowers/plans/2026-08-10-make-voice-global-settings.md`
- Modify: ACP component/runtime API docs where the removed fields are documented.

- [ ] Update documentation to say the three values are internal constants and only App ID/Access Key are user credentials.
- [ ] Run ACP voice tests, lint, `tsc`, public API build/package verification.
- [ ] Run Make focused tests, Make lint/typecheck where possible, and isolated voice entry build; record unrelated existing admin build blockers if still present.
- [ ] Run `git diff --check` in Make and review all changed file paths before delivery.
