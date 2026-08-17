# Configurable Local AI Entry Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-on setting that can launch Make's supported local AI applications without injecting the Axhub Make entry.

**Architecture:** Persist `automation.injectLocalAiEntry` in the project-scoped Make server config, expose it as a switch in AI settings, and read it in the desktop integration API before choosing the launch mode. Disabled injection maps an integrated request to the existing normal local-app/IDE opener, so client launch and project opening remain available without creating an Agent Surface.

**Tech Stack:** TypeScript 5, React 18.2, Vitest, pnpm, Make server configuration and Agent Surface integration.

## Global Constraints

- `automation.injectLocalAiEntry` defaults to `true`, including old configurations without the field.
- One setting applies to `chatgpt`, `cursor`, `workbuddy`, and `traework`.
- Disabling injection must still launch or reuse the local application and open the selected project.
- Preserve the existing `activate: false` behavior when injection is enabled.
- Use pnpm and preserve unrelated dirty-worktree changes.

---

### Task 1: Add the normalized configuration contract

**Files:**
- Modify: `src/server/projectCore/server-config.ts`
- Test: `src/server/__tests__/projects-config-api.test.ts`

**Interfaces:**
- Consumes: persisted `automation.injectLocalAiEntry` values.
- Produces: `MakeServerConfig.automation.injectLocalAiEntry: boolean` with a default of `true`.

- [ ] **Step 1: Write failing config API assertions**

Assert that a config without the field returns `automation.injectLocalAiEntry === true`, and a POST with `false` returns and subsequently reads `false`.

- [ ] **Step 2: Run the config test and verify the new assertions fail**

Run: `pnpm exec vitest run src/server/__tests__/projects-config-api.test.ts`

Expected: FAIL because the normalized automation config does not yet contain `injectLocalAiEntry`.

- [ ] **Step 3: Add the typed default and strict boolean normalization**

Add the property to `MakeServerConfig`, set it to `true` in `DEFAULT_SERVER_CONFIG`, and preserve only explicit boolean input in `normalizeConfig`.

- [ ] **Step 4: Re-run the config test**

Run: `pnpm exec vitest run src/server/__tests__/projects-config-api.test.ts`

Expected: PASS.

### Task 2: Add the AI settings switch

**Files:**
- Modify: `src/index/components/SettingsDialog.tsx`
- Test: `src/index/components/SettingsDialog.source.test.ts`

**Interfaces:**
- Consumes: `Config.automation.injectLocalAiEntry`.
- Produces: `SettingsFormState.injectLocalAiEntry` and a saved automation field.

- [ ] **Step 1: Write failing source-contract assertions**

Assert that the form default is `true`, config normalization uses `!== false`, the AI tab renders a checked switch labelled “注入 Axhub Make 入口”, and `handleSave` writes the field.

- [ ] **Step 2: Run the component source test and verify failure**

Run: `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`

Expected: FAIL because the switch and field do not exist.

- [ ] **Step 3: Implement the form field, switch, description, and save payload**

Place the switch below the local ACP status section. Explain that turning it off still starts the selected application but omits the Make sidebar entry.

- [ ] **Step 4: Re-run the component source test**

Run: `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`

Expected: PASS.

### Task 3: Gate Agent Surface injection without gating application launch

**Files:**
- Modify: `src/server/managementApi.assistantIde.ts`
- Test: `src/server/__tests__/agent-open-api.test.ts`

**Interfaces:**
- Consumes: `config.automation.injectLocalAiEntry`.
- Produces: an `ensureSurface` callback that invokes `openMakeAgentSurface` only when enabled.

- [ ] **Step 1: Add API regression coverage**

Exercise `/api/desktop-integration/open` with `injectLocalAiEntry: false` and assert the local app/project opener still runs while the injected surface function does not. Keep the default-on case asserting current injection behavior.

- [ ] **Step 2: Run the API test and verify the disabled case fails**

Run: `pnpm exec vitest run src/server/__tests__/agent-open-api.test.ts`

Expected: FAIL because `ensureSurface` always calls `openMakeAgentSurface`.

- [ ] **Step 3: Read the scoped config and map disabled injection to normal opening**

Resolve the project-scoped server config once in the desktop integration handler. When `config.automation.injectLocalAiEntry === false`, normalize `prepare`/`restart` to the existing `normal` action so Cursor uses its existing IDE opener and the other providers use their existing local-app opener. When enabled, retain the existing integrated coordinator and `openMakeAgentSurface` error handling.

- [ ] **Step 4: Re-run desktop integration tests**

Run: `pnpm exec vitest run src/server/__tests__/agent-open-api.test.ts src/server/__tests__/desktopIntegrationOpen.test.ts src/server/agentSurfaceIntegration.test.ts`

Expected: PASS.

### Task 4: Verify the complete change

**Files:**
- Verify: all modified files above.

**Interfaces:**
- Consumes: the completed setting path.
- Produces: type-safe, regression-tested Make behavior.

- [ ] **Step 1: Run all targeted tests**

Run: `pnpm exec vitest run src/server/__tests__/projects-config-api.test.ts src/index/components/SettingsDialog.source.test.ts src/server/__tests__/agent-open-api.test.ts src/server/__tests__/desktopIntegrationOpen.test.ts src/server/agentSurfaceIntegration.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the server build**

Run: `pnpm server:build`

Expected: vendor sync and TypeScript compilation succeed.

- [ ] **Step 3: Check the final diff**

Run: `git diff --check && git diff -- src/server/projectCore/server-config.ts src/index/components/SettingsDialog.tsx src/server/managementApi.assistantIde.ts`

Expected: no whitespace errors; the diff contains only the scoped config, UI, and launch-gating changes.
