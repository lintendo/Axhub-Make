# AI Purpose Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Make's AI configuration into independent conversation, annotation, and canvas Agent/model preferences, separate diagnostics from configuration, collapse healthy diagnostics, and remove the old canvas prompt composer.

**Architecture:** Normalize legacy configuration once at the server-config boundary into six explicit purpose fields, then carry those fields through the existing preferences hook and request APIs. The settings dialog derives selectable Agents only from `installed` version records and renders diagnostics in state-aware collapsible sections. Existing request paths send the appropriate purpose defaults explicitly; the server selects the same purpose as a fallback.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vite, Vitest, local Radix-based UI components, pnpm workspace, `@axhub/acp@0.1.11`.

## Global Constraints

- Use pnpm for repository development commands.
- Preserve all pre-existing uncommitted changes; target files are already modified by the user.
- Do not stage or commit mixed implementation files in this session. Commit only this new plan document.
- Do not duplicate-write `defaultPromptClient`; legacy compatibility exists only in config normalization.
- Agent choices require `status === 'installed'`; connection-test status never filters choices.
- Models remain optional free-text IDs; do not add model discovery.
- Leave the old canvas composer draft cache untouched.

---

### Task 1: Normalize Three Purpose Preferences

**Files:**
- Modify: `src/server/projectCore/server-config.ts`
- Modify: `src/server/__tests__/projects-config-api.test.ts`
- Modify: `src/index/services/api.ts`
- Modify: `src/index/types.ts`

**Interfaces:**
- Consumes: legacy `automation.defaultPromptClient`, `annotationPromptClient`, and `annotationModel`.
- Produces: `conversationPromptClient`, `conversationModel`, `annotationPromptClient`, `annotationModel`, `canvasPromptClient`, and `canvasModel` on normalized config responses.

- [ ] **Step 1: Write failing migration tests**

Add a legacy-config assertion equivalent to:

```ts
expect(config.automation).toMatchObject({
  conversationPromptClient: 'acp:qoder',
  conversationModel: null,
  annotationPromptClient: 'acp:qoder',
  annotationModel: null,
  canvasPromptClient: 'acp:qoder',
  canvasModel: null,
});
expect(config.automation).not.toHaveProperty('defaultPromptClient');
```

Add a second case proving explicit new fields beat the legacy value and preserve explicit annotation configuration.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/server/__tests__/projects-config-api.test.ts`.

Expected: FAIL because normalized config still exposes `defaultPromptClient` and lacks conversation/canvas fields.

- [ ] **Step 3: Implement the normalized schema**

Change `MakeServerConfig['automation']` and `DEFAULT_SERVER_CONFIG` to the six explicit fields. In `normalizeConfig`, use own-property checks and migrate through these values:

```ts
const legacyPromptClient = hasOwn(automation, 'defaultPromptClient')
  ? normalizePromptClient(automation.defaultPromptClient, null)
  : null;
const conversationPromptClient = hasOwn(automation, 'conversationPromptClient')
  ? normalizePromptClient(automation.conversationPromptClient, fallback.automation.conversationPromptClient)
  : legacyPromptClient || fallback.automation.conversationPromptClient;
const annotationPromptClient = hasOwn(automation, 'annotationPromptClient')
  ? normalizeAnnotationPromptClient(
      automation.annotationPromptClient,
      legacyPromptClient || fallback.automation.annotationPromptClient,
    ) || legacyPromptClient
  : legacyPromptClient || fallback.automation.annotationPromptClient;
const canvasPromptClient = hasOwn(automation, 'canvasPromptClient')
  ? normalizePromptClient(automation.canvasPromptClient, fallback.automation.canvasPromptClient)
  : legacyPromptClient || fallback.automation.canvasPromptClient;
```

Normalize all model fields with `normalizeNullableString`. Update API request/response types to the same names and remove `defaultPromptClient` from new save payloads.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: all config API tests pass.

---

### Task 2: Load and Route Purpose Preferences

**Files:**
- Modify: `src/index/app/hooks/useIndexPagePreferences.ts`
- Modify: `src/index/app/hooks/useIndexPagePreferences.test.ts`
- Modify: `src/server/managementApi.aiRuns.ts`
- Modify: `src/server/__tests__/ai-runs-api.test.ts`

**Interfaces:**
- Consumes: Task 1's normalized fields.
- Produces: the six values in `UseIndexPagePreferencesResult` and `resolveAiPurposePreference(scene, automation)` for server provider/model fallback.

- [ ] **Step 1: Write failing hook assertions**

Require initialization, load, reload, reset, and return behavior for all six fields. Require exact load statements for conversation and canvas values.

- [ ] **Step 2: Write failing server fallback tests**

Configure three different provider/model pairs and submit requests without explicit selections for `direct`, `prototype-review-direct`, and `canvas-page-direct`. Assert conversation, annotation, and canvas provider/model values respectively. Assert explicit request values still win.

- [ ] **Step 3: Run RED**

Run `pnpm exec vitest run src/index/app/hooks/useIndexPagePreferences.test.ts src/server/__tests__/ai-runs-api.test.ts`.

Expected: FAIL because the hook still exposes one preferred Agent and the server always uses the legacy fallback.

- [ ] **Step 4: Implement hook state and scene fallback**

Add the six hook states and update bootstrap/settings-saved paths. Preserve the raw scene string and resolve fallback with:

```ts
export function resolveAiPurposePreference(scene: unknown, automation: any) {
  const normalized = safeText(scene).toLowerCase();
  if (normalized.includes('annotation') || normalized.includes('review')) {
    return {
      promptClient: automation?.annotationPromptClient,
      model: automation?.annotationModel,
    };
  }
  if (normalized.startsWith('canvas-')) {
    return {
      promptClient: automation?.canvasPromptClient,
      model: automation?.canvasModel,
    };
  }
  return {
    promptClient: automation?.conversationPromptClient,
    model: automation?.conversationModel,
  };
}
```

Use `preference.promptClient` only when the request omits provider/client/preferredPromptClient, and `preference.model` only when the request omits model.

- [ ] **Step 5: Run GREEN**

Run the Step 3 command. Expected: both test files pass.

---

### Task 3: Render Purpose Configuration and Collapsed Diagnostics

**Files:**
- Modify: `src/index/components/SettingsDialog.tsx`
- Modify: `src/index/components/SettingsDialog.source.test.ts`

**Interfaces:**
- Consumes: `AgentVersionMap`, `LOCAL_AI_AGENT_OPTIONS`, and six purpose values.
- Produces: a three-row purpose table, installed-only choices, and two diagnostic disclosures.

- [ ] **Step 1: Write failing settings tests**

Require `AI 用途配置`, all three purpose row labels, installed-only filtering, six saved fields, `aria-expanded={localAcpDetailsOpen}`, and `aria-expanded={agentDiagnosticsOpen}`. Reject the old default `RadioGroup` and any test-status filtering of config choices.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`.

Expected: FAIL because the default-radio table and always-expanded ACP card remain.

- [ ] **Step 3: Implement form state and choices**

Replace the legacy form fields with the six purpose fields and derive:

```ts
const installedLocalAiAgentOptions = LOCAL_AI_AGENT_OPTIONS.filter(
  (option) => agentVersions[option.versionKey]?.status === 'installed',
);
```

Preserve an unavailable saved value through a disabled current-value item and warning. Disable model input only when its Agent is empty. Save trimmed empty models as `null`.

- [ ] **Step 4: Implement the responsive table**

Render one shared row for each purpose with a Select and Input. Put annotation concurrency below the table. Use a compact desktop table and a label-above-control narrow layout without horizontal scrolling.

- [ ] **Step 5: Implement diagnostic disclosure**

Use `localAcpDetailsOpen` and `agentDiagnosticsOpen`. Open ACP details for non-ready states and close them on a successful connect/refresh transition. Open Agent diagnostics while testing or after failure. Show installed Agents in the main list and unavailable counts in one summary line. Keep refresh and disclosure as separate icon buttons.

- [ ] **Step 6: Run GREEN**

Run the Step 2 command. Expected: settings tests pass.

---

### Task 4: Send Conversation Defaults to Start Guides and Sidebar

**Files:**
- Modify: `src/index/domains/shared/CanvasGenerationComposer.tsx`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.source.test.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.tsx`
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.test.ts`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/IndexPage.test.ts`

**Interfaces:**
- Consumes: conversation Agent/model from Task 2.
- Produces: `preferredModel?: string | null` for display composers and the assistant controller; iframe URLs with `provider` and optional `model`.

- [ ] **Step 1: Write failing default-propagation tests**

Require `resolveCanvasAcpSelectorDefaults(preferredPromptClient, preferredModel)` to return the configured model. Require the assistant URL builder to set:

```ts
const provider = resolveAcpPromptClientProvider(preferredPromptClient);
if (provider) url.searchParams.set('provider', provider);
if (preferredModel?.trim()) url.searchParams.set('model', preferredModel.trim());
```

Require each `StartGuide` composer to receive the conversation model.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/domains/shared/CanvasGenerationComposer.source.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.test.ts`.

Expected: FAIL because model defaults and iframe query values are not wired.

- [ ] **Step 3: Implement conversation propagation**

Extend composer props with `preferredModel` and pass it into selector defaults. Pass conversation values through start guides. Destructure the conversation values in `useAssistantPanelController`, add them to iframe URLs, and pass them from `IndexPage`. Explicit composer selections remain higher priority.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: all four test files pass.

---

### Task 5: Route Annotation and Canvas Runs Independently

**Files:**
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/IndexPage.test.ts`
- Modify: `src/index/types/index-page.types.ts`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- Modify: `src/index/components/content/PresentationArea.tsx`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ExcalidrawCanvas.tsx`
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`

**Interfaces:**
- Consumes: annotation and canvas preferences from Task 2.
- Produces: explicit purpose provider/model on direct runs and request source `annotation-prompt-card` for canvas annotations.

- [ ] **Step 1: Write failing mapping tests**

Require canvas handlers to resolve `preferences.canvasPromptClient` and use `request.model ?? preferences.canvasModel`. Keep annotation handlers on annotation fields. Add `annotation-prompt-card` to the request source union and require Excalidraw annotation execution to use it.

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/app/IndexPage.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`.

Expected: FAIL because canvas requests still borrow annotation defaults.

- [ ] **Step 3: Implement purpose routing**

Keep `placeholder-start`, `resource-start`, and `theme-start` on conversation defaults. Route `canvas-start` and `canvas-viewport` to canvas defaults. Route `annotation-prompt-card` to annotation defaults. Pass canvas defaults through the presentation/content/canvas prop chain for one-click generation and canvas prompt optimization.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: all three files pass.

---

### Task 6: Remove the Old Canvas Prompt Composer

**Files:**
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`
- Modify: `src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

**Interfaces:**
- Consumes: existing viewport capture and direct-run session logic.
- Produces: only the Sparkles one-click launcher plus running/cancel state.

- [ ] **Step 1: Write failing removal tests**

Add:

```ts
expect(source).not.toContain('aria-label="打开画布 AI 输入框"');
expect(source).not.toContain('data-axhub-canvas-start-composer');
expect(source).not.toContain('<CanvasGenerationDisplayComposer');
expect(source).toContain("title={canvasViewportRunActive ? '画布 AI 正在处理' : '根据当前画布生成'}");
expect(source).toContain('onClick={handleCanvasViewportAiCancel}');
```

- [ ] **Step 2: Run RED**

Run `pnpm exec vitest run src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`.

Expected: FAIL because the slider launcher and composer still render.

- [ ] **Step 3: Remove composer-owned code**

Delete the slider button, composer JSX, prompt-draft state, start-scene settings, and callbacks used only by the prompt flow. Preserve viewport submit, capture, session lifetime, timing, running state, cancellation, result application, and errors.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: all canvas tool tests pass.

---

### Task 7: Integrated Verification and Visual QA

**Files:**
- Verify every file modified in Tasks 1-6.
- Store temporary screenshots only under `.local/`.

**Interfaces:**
- Consumes: completed implementation.
- Produces: passing focused suite, passing build checks, and desktop/narrow visual evidence.

- [ ] **Step 1: Run the focused suite**

Run the nine focused test files from Tasks 1-6 together. Expected: zero failures.

- [ ] **Step 2: Run static/build verification**

Run `pnpm server:build` and `pnpm admin:build`. Expected: both exit 0.

- [ ] **Step 3: Start the admin server**

Run `pnpm admin:dev --host 127.0.0.1`, using a free port when needed, and leave it running for review.

- [ ] **Step 4: Perform browser QA**

Use the browser-automation skill. Verify desktop and narrow widths: three purpose rows, installed-only menus, healthy ACP summary, expanded failure state, Agent diagnostics, no overflow, and no old canvas slider/composer.

- [ ] **Step 5: Inspect final changes**

Run `git diff --check`, `git status --short`, and `git diff --stat`. Expected: no whitespace errors, no unrelated files changed by this task, and mixed implementation files remain unstaged.
