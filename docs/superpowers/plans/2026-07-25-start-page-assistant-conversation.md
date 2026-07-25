# Start Page Assistant Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make resource and design start-page sends open a visible fresh assistant conversation and stop composer loading once the message has started.

**Architecture:** Keep canvas generation on the existing direct SSE runner, but route `resource-start` and `theme-start` through `openAssistantWithContextAndSubmitPrompt` with a fresh thread and `started` acknowledgement. Remove `startPageActive` presentation masks so the existing assistant controller owns sidebar visibility, and normalize downstream submit results to a boolean before returning them to the display composer.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, assistant-ui 0.14, ACP iframe bridge.

## Global Constraints

- Use pnpm for repository commands.
- Preserve unrelated staged and unstaged workspace changes.
- Keep React at 18.2.0 and TypeScript at 5.x.
- Do not add compatibility branches or new dependencies.
- Do not change canvas direct-run concurrency, status cards, or artifact collection.
- Do not create empty resources or designs before AI execution produces them.

---

### Task 1: Restore assistant sidebar lifecycle on start pages

**Files:**
- Modify: `src/index/app/IndexPage.test.ts`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Consumes: `assistantController.assistantPanelMounted`, `assistantController.assistantVisible`, `assistantController.aiPanelMode`, `handleToggleAssistantPanel`, `handleOpenAcpWebAgent`, and `handleOpenImageAiPanel`.
- Produces: start-page sidebar props that mirror the assistant controller without a `startPageActive` override.

- [ ] **Step 1: Replace the blocking source regression with an availability regression**

Update the current `blocks the global assistant sidebar while a prototype start page is active` test so it asserts that start-page state remains available for layout decisions while assistant state and actions are passed through unchanged:

```ts
it('keeps the global assistant sidebar available while a start page is active', () => {
  const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
  const startStateSource = source.slice(
    source.indexOf('const prototypePlaceholderActive = contentMode ==='),
    source.indexOf('const preferences = useIndexPagePreferences'),
  );
  const sidebarBuilderCall = source.slice(
    source.indexOf('const sidebarProps = useIndexPageSidebarPropsBuilder'),
    source.indexOf('const handleEnterSelectedPrototypePreview'),
  );
  const presentationBuilderCall = source.slice(
    source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder'),
    source.indexOf('const handleMobileItemClick', source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder')),
  );
  const assistantPanelPropsSource = source.slice(
    source.indexOf('const assistantPanelProps = {'),
    source.indexOf('const dialogsProps = {'),
  );

  expect(startStateSource).toContain('const prototypeStartPageActive = prototypeStartDraftActive || prototypePlaceholderActive;');
  expect(sidebarBuilderCall).toContain('prototypeStartPageActive,');
  expect(sidebarBuilderCall).toContain('webAgentPanelOpen: assistantController.assistantVisible,');
  expect(sidebarBuilderCall).toContain('aiPanelMode: assistantController.aiPanelMode,');
  expect(sidebarBuilderCall).toContain('handleOpenAcpWebAgent,');
  expect(sidebarBuilderCall).toContain('handleOpenImageAiPanel,');
  expect(presentationBuilderCall).toContain('assistantVisible: assistantController.assistantVisible,');
  expect(presentationBuilderCall).toContain('webAgentPanelOpen: assistantController.assistantVisible,');
  expect(presentationBuilderCall).toContain('aiPanelMode: assistantController.aiPanelMode,');
  expect(presentationBuilderCall).toContain('handleToggleAssistant: handleToggleAssistantPanel,');
  expect(assistantPanelPropsSource).toContain('mounted: assistantController.assistantPanelMounted,');
  expect(assistantPanelPropsSource).toContain('visible: assistantController.assistantVisible,');
  expect(source).not.toContain('startPageActive ? false : assistantController');
  expect(source).not.toContain('startPageActive ? undefined : handleOpen');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts
```

Expected: FAIL because `IndexPage` still masks assistant values and actions with `startPageActive`.

- [ ] **Step 3: Remove start-page assistant masks**

Delete the now-unused aggregate `startPageActive` declaration. Keep `prototypeStartPageActive` because the sidebar still uses it for prototype start-page presentation.

Pass controller state and actions directly:

```ts
webAgentPanelOpen: assistantController.assistantVisible,
aiPanelMode: assistantController.aiPanelMode,
```

```ts
handleOpenAcpWebAgent,
handleOpenImageAiPanel,
```

```ts
assistantVisible: assistantController.assistantVisible,
handleToggleAssistant: handleToggleAssistantPanel,
onOpenAcpWebAgent: handleOpenAcpWebAgent,
onOpenImageAiPanel: handleOpenImageAiPanel,
```

```ts
const assistantPanelProps = {
  mounted: assistantController.assistantPanelMounted,
  visible: assistantController.assistantVisible,
  width: assistantController.assistantPanelWidth,
  minWidth: assistantController.assistantPanelMinWidth,
  maxWidth: assistantController.assistantPanelMaxWidth,
  iframeEntries: assistantController.assistantIframeEntries,
  activeIframeKey: assistantController.assistantActiveIframeKey,
  onIframeRef: assistantController.handleAssistantIframeRef,
  onIframeLoad: assistantController.handleAssistantIframeLoad,
  onResize: assistantController.setAssistantPanelWidth,
  onAddContextItems: assistantController.addContextItems,
  onToggle: handleToggleAssistantPanel,
};
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts
```

Expected: PASS with zero failures.

- [ ] **Step 5: Inspect the task diff without staging shared files**

The target files already contain unrelated user changes. Do not stage or commit these shared files. Inspect only the relevant hunks:

```bash
git diff -- src/index/app/IndexPage.test.ts src/index/app/IndexPage.tsx
```

---

### Task 2: Route resource and design starts into visible fresh conversations

**Files:**
- Modify: `src/index/app/IndexPage.test.ts`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Consumes: `buildCanvasAssistantContext(request)`, `handleSubmitAnnotationAssistantPrompt(context, prompt, options)`, and `CanvasAiGenerationRequest.source`.
- Produces: `handleSubmitCanvasAssistantPrompt(request): Promise<CanvasAiGenerationResult>` with visible start-page routing for `resource-start` and `theme-start`, while retaining direct SSE routing for canvas sources.

- [ ] **Step 1: Add failing routing assertions**

Replace the obsolete `starts every canvas generation request as a direct API run` test with separate route assertions:

```ts
it('opens resource and design start requests in fresh visible assistant conversations', () => {
  const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
  const submitSource = source.slice(
    source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
    source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
  );

  expect(submitSource).toContain("const shouldOpenStartGuideConversation = request.source === 'resource-start'");
  expect(submitSource).toContain("|| request.source === 'theme-start';");
  expect(submitSource).toContain('const submitted = await handleSubmitAnnotationAssistantPrompt(');
  expect(submitSource).toContain('canvasAssistantContext,');
  expect(submitSource).toContain('forceNewThread: true,');
  expect(submitSource).toContain("waitUntil: 'started',");
  expect(submitSource).toContain('provider: selectedProvider,');
  expect(submitSource).toContain('model: request.model ?? annotationModel,');
  expect(submitSource).toContain('mode: request.mode,');
  expect(submitSource).toContain('thought: request.thought,');
  expect(submitSource).toContain("return { ok: Boolean(submitted && (typeof submitted !== 'object' || submitted.ok !== false)) };");
});

it('keeps non-start-guide canvas requests on the direct API runner', () => {
  const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
  const submitSource = source.slice(
    source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
    source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
  );

  expect(submitSource).toContain('const result = await submitAnnotationPromptViaApi({');
  expect(submitSource).toContain('scene: `canvas-${request.scene}-direct`,');
  expect(submitSource).toContain('agentRunConcurrency: preferences.agentRunConcurrency,');
  expect(submitSource.indexOf('if (shouldOpenStartGuideConversation) {'))
    .toBeLessThan(submitSource.indexOf('const result = await submitAnnotationPromptViaApi({'));
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts
```

Expected: FAIL because all current requests still use `submitAnnotationPromptViaApi`.

- [ ] **Step 3: Add the visible start-page branch before the direct runner**

After resolving `selectedProvider`, `annotationModel`, and `canvasAssistantContext`, add:

```ts
const shouldOpenStartGuideConversation = request.source === 'resource-start'
  || request.source === 'theme-start';
if (shouldOpenStartGuideConversation) {
  const submitted = await handleSubmitAnnotationAssistantPrompt(
    canvasAssistantContext,
    prompt,
    {
      forceNewThread: true,
      waitUntil: 'started',
      provider: selectedProvider,
      model: request.model ?? annotationModel,
      mode: request.mode,
      thought: request.thought,
    },
  );
  return { ok: Boolean(submitted && (typeof submitted !== 'object' || submitted.ok !== false)) };
}
```

Keep the existing `submitAnnotationPromptViaApi` block immediately after this branch. Add `handleSubmitAnnotationAssistantPrompt` to the callback dependency array.

- [ ] **Step 4: Run the tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/index/app/IndexPage.test.ts
```

Expected: PASS with zero failures.

- [ ] **Step 5: Inspect the routing diff without staging shared files**

```bash
git diff -- src/index/app/IndexPage.test.ts src/index/app/IndexPage.tsx
```

---

### Task 3: Preserve composer state when downstream submission fails

**Files:**
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`

**Interfaces:**
- Consumes: `onSubmitCanvasAssistantPrompt(request): CanvasAiGenerationResult | boolean | Promise<CanvasAiGenerationResult | boolean>`.
- Produces: `onSubmitPrototypeStartRequest(request): boolean | Promise<boolean>` and `handleSubmitPrototypeStartRequest(request): Promise<boolean>`.

- [ ] **Step 1: Add a failing return-propagation source test**

Add a test that isolates `handleSubmitPrototypeStartRequest` and requires normalized booleans on every branch:

```ts
it('returns canvas assistant submission success to the start-page composer', () => {
  const source = readContentAreaViewSource();
  const startSubmitSegment = getSourceSegment(
    source,
    'const handleSubmitPrototypeStartRequest = async (request: CanvasAiGenerationRequest) => {',
    '    if (projectAccessDeniedReason) {',
  );

  expect(source).toContain('onSubmitPrototypeStartRequest?: (request: CanvasAiGenerationRequest) => boolean | Promise<boolean>;');
  expect(startSubmitSegment).toContain('const submitCanvasAssistantPrompt = async (submittedRequest: CanvasAiGenerationRequest): Promise<boolean> => {');
  expect(startSubmitSegment).toContain('const result = await onSubmitCanvasAssistantPrompt?.(submittedRequest);');
  expect(startSubmitSegment).toContain("return result === true || (typeof result === 'object' && result?.ok === true);");
  expect(startSubmitSegment).toContain("return submitCanvasAssistantPrompt(request);");
  expect(startSubmitSegment).toContain("return false;");
  expect(startSubmitSegment).toContain('return submitCanvasAssistantPrompt(submittedRequest);');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts
```

Expected: FAIL because the handler currently awaits submissions and returns `undefined`.

- [ ] **Step 3: Normalize and return downstream submission results**

Change the `StartGuide` prop contract to:

```ts
onSubmitPrototypeStartRequest?: (request: CanvasAiGenerationRequest) => boolean | Promise<boolean>;
```

At the start of `handleSubmitPrototypeStartRequest`, add:

```ts
const submitCanvasAssistantPrompt = async (submittedRequest: CanvasAiGenerationRequest): Promise<boolean> => {
  const result = await onSubmitCanvasAssistantPrompt?.(submittedRequest);
  return result === true || (typeof result === 'object' && result?.ok === true);
};
```

Then return normalized results from each branch:

```ts
if (request.source === 'resource-start' || request.source === 'theme-start') {
  return submitCanvasAssistantPrompt(request);
}
```

```ts
if (!startItem) {
  toast.error('创建原型失败');
  return false;
}
```

```ts
if (request.scene === 'page' && startItem?.name) {
  await apiService.startPlaceholderPrototypeGeneration(startItem.name, requireProjectScope(activeProjectId));
  const refreshedPrototypes = await onRefreshPrototypes?.(startItem.name);
  const refreshedStartItem = refreshedPrototypes?.find((item) => item.name === startItem.name);
  if (refreshedStartItem) {
    submittedRequest.createdPrototype = refreshedStartItem;
  }
  setViewMode?.('demo');
  return submitCanvasAssistantPrompt(submittedRequest);
}
setViewMode?.('canvas');
return submitCanvasAssistantPrompt(submittedRequest);
```

- [ ] **Step 4: Run targeted composer and content tests**

Run:

```bash
pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts src/index/domains/shared/CanvasGenerationComposer.test.ts
```

Expected: PASS with zero failures, confirming false results preserve the display composer draft.

- [ ] **Step 5: Inspect the result-propagation diff without staging shared files**

```bash
git diff -- src/index/components/content/ContentAreaView.source.test.ts src/index/components/content/ContentAreaView.tsx
```

---

### Task 4: Verify integration and browser behavior

**Files:**
- Verify: `src/index/app/IndexPage.tsx`
- Verify: `src/index/components/content/ContentAreaView.tsx`
- Verify: `src/index/domains/shared/CanvasGenerationComposer.tsx`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified start-page conversation behavior without regressions to canvas direct runs.

- [ ] **Step 1: Run the combined targeted regression suite**

Run:

```bash
pnpm exec vitest run \
  src/index/app/IndexPage.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/domains/shared/CanvasGenerationComposer.source.test.ts \
  src/index/domains/shared/CanvasGenerationComposer.test.ts \
  src/index/domains/assistant/hooks/useAssistantPanelController.test.ts
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Run the production admin build**

Run:

```bash
pnpm admin:build
```

Expected: both the admin Vite build and Axure export build exit with code 0.

- [ ] **Step 3: Start the development server for browser verification**

Run:

```bash
pnpm server:dev -- --no-open
```

Expected: the server reports an available management origin, normally `http://localhost:53817`. If that port is occupied, use the exact alternate origin printed by the CLI.

- [ ] **Step 4: Verify resource start behavior in a browser**

Open a resource start draft, submit a distinctive prompt, and confirm:

- the right assistant sidebar mounts and becomes visible;
- a fresh conversation contains the submitted prompt;
- the display composer leaves submitting state after the conversation reports started;
- the assistant response may continue while the display composer is no longer spinning.

- [ ] **Step 5: Verify design start and failure behavior**

Repeat from a design start draft. Then force a safe submission failure using unavailable AI configuration or a stopped local runtime and confirm the prompt remains in the display composer with a visible error.

- [ ] **Step 6: Inspect final diff and whitespace**

Run:

```bash
git diff --check -- \
  src/index/app/IndexPage.tsx \
  src/index/app/IndexPage.test.ts \
  src/index/components/content/ContentAreaView.tsx \
  src/index/components/content/ContentAreaView.source.test.ts
```

Expected: no output.
