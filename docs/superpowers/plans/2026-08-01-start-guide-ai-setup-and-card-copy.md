# Start Guide AI Setup And Card Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock homepage start-guide editing until a default local AI Agent is configured and let resource/design cards copy fully assembled local-AI prompts.

**Architecture:** Keep configuration detection at the shared display-composer ACP boundary but activate the editing lock only through an explicit homepage prop. Extract the duplicated resource/design card shell into one presentational component, while `StartGuide` remains responsible for scene-aware prompt assembly and clipboard feedback.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, react-test-renderer, Tailwind CSS, Lucide React, pnpm.

## Global Constraints

- Use pnpm only for repository development, tests, and builds.
- Preserve all unrelated and pre-existing worktree changes.
- Do not add legacy compatibility branches or new dependencies.
- Keep the editing lock scoped to the homepage `StartGuide`; the canvas start composer is unchanged.
- Keep card copy available when card selection is disabled because AI setup is missing.

---

### Task 1: Homepage AI setup editing lock

**Files:**
- Modify: `src/index/domains/shared/CanvasGenerationComposer.tsx`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.test.ts`
- Modify: `src/index/domains/shared/CanvasGenerationComposer.source.test.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`

**Interfaces:**
- Consumes: `preferredPromptClient`, `resolveCanvasAcpSelectorVisibility`, and the existing `onOpenAISettings` callback.
- Produces: `CanvasGenerationDisplayComposerProps.disableEditingWithoutConfiguredAgent?: boolean`; when true and no default provider exists, the display composer disables editing while leaving `CanvasAcpModelSelectorFallback` interactive.

- [ ] **Step 1: Write failing lock-state tests**

Add assertions covering the explicit opt-in prop and separated disabled states:

```ts
expect(displayPropsSegment).toContain('disableEditingWithoutConfiguredAgent?: boolean;');
expect(displayAcpSegment).toContain('const editingDisabled = Boolean(disableEditingWithoutConfiguredAgent)');
expect(displayAcpSegment).toContain('&& !selectorVisibility.defaultAgentConfigured;');
expect(displayComponentSegment).toContain("const resolvedPlaceholder = editingDisabled ? '请使用下方本地 AI 应用，或前往 AI 设置完成配置' : placeholder;");
expect(displayComponentSegment).toContain('const controlsDisabled = disabled || editingDisabled || optimizingPrompt || submitting;');
expect(displayComponentSegment).toContain('const selectorControlsDisabled = disabled || optimizingPrompt || submitting;');
```

Assert in `ContentAreaView.source.test.ts` that only `StartGuide` opts in with `disableEditingWithoutConfiguredAgent`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts src/index/components/content/ContentAreaView.source.test.ts
```

Expected: FAIL because the opt-in editing lock and setup placeholder do not exist.

- [ ] **Step 3: Implement the minimal lock**

Add the opt-in prop, compute the lock in `CanvasGenerationDisplayComposerWithAcp`, and pass an internal `editingDisabled` flag into `CanvasGenerationDisplayComposerContent`. Use `controlsDisabled` for input, attachments, prompt cards, optimization, and submit, but use `selectorControlsDisabled` for the selector wrapper so `设置 AI Agent` remains clickable. In `StartGuide`, pass:

```tsx
disableEditingWithoutConfiguredAgent
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run the Step 2 command again.

Expected: all selected files pass with zero failures.

---

### Task 2: Shared hover copy action for start prompt cards

**Files:**
- Create: `src/index/components/content/StartPromptCard.tsx`
- Create: `src/index/components/content/StartPromptCard.test.ts`
- Modify: `src/index/components/content/ResourceStartPromptGrid.tsx`
- Modify: `src/index/components/content/ThemeStartPromptGrid.tsx`
- Modify: `src/index/components/content/resourceStartPromptSelection.test.ts`
- Modify: `src/index/components/content/ThemeStartPromptGrid.test.ts`
- Modify: `src/index/components/content/ThemeStartPromptGrid.source.test.ts`

**Interfaces:**
- Produces: `StartPromptCard({ title, icon, selectionDisabled, onSelect, onCopy })` with sibling select/copy buttons.
- Updates: both grids require `onCopyPrompt: (card) => void | Promise<void>` and pass the original card object to it.

- [ ] **Step 1: Write failing interaction tests**

Render each grid with `onCopyPrompt={vi.fn()}`. Select buttons by their card-specific `aria-label`; select the copy button by `aria-label="复制提示词给本地 AI 使用"`. Assert:

```ts
expect(onCopyPrompt).toHaveBeenCalledWith(cards[0]);
expect(selectPrompt).not.toHaveBeenCalled();
```

Repeat with `disabled: true` and assert the copy callback still runs while selection, scene, image-size, and PRD callbacks remain untouched.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/index/components/content/StartPromptCard.test.ts src/index/components/content/resourceStartPromptSelection.test.ts src/index/components/content/ThemeStartPromptGrid.test.ts src/index/components/content/ThemeStartPromptGrid.source.test.ts
```

Expected: FAIL because there is no shared card or copy callback.

- [ ] **Step 3: Implement the shared card**

Create a relative `li` wrapper with a full-width primary button and an absolutely positioned sibling icon button. Use the Lucide `Copy` icon and existing tooltip primitives. The copy button uses:

```tsx
aria-label="复制提示词给本地 AI 使用"
className="pointer-events-none absolute right-2 top-1/2 ... opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
```

Refactor both grids to render `StartPromptCard`, keeping all scene and setting mutations exclusively inside `onSelect`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run the Step 2 command again.

Expected: all selected files pass with zero failures.

---

### Task 3: Scene-aware complete prompt copying

**Files:**
- Create: `src/index/components/content/startGuidePrompt.ts`
- Create: `src/index/components/content/startGuidePrompt.test.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`

**Interfaces:**
- Produces: `buildStartGuidePrompt({ kind, scene, prompt, settings, finalGuide }): string`.
- Wires: `copyResourceStartCardPrompt(card: ResourceStartPromptCard): Promise<void>` and `copyThemeStartCardPrompt(card: ThemeStartPromptCard): Promise<void>`.

- [ ] **Step 1: Write failing prompt assembly tests**

Test `buildStartGuidePrompt` with resource design and document scenes:

```ts
expect(designPrompt).toContain('图片生成设置：');
expect(designPrompt).toContain('- 尺寸：2048x1152');
expect(documentPrompt).toContain('文档生成设置：');
expect(documentPrompt).toContain('PRD 规划：');
expect(documentPrompt).toContain('请回复了解并等待用户发送需求。');
```

Add source assertions that resource card metadata overrides settings without changing the active scene, both grids receive copy callbacks, clipboard writes use `copyToClipboard`, success uses `toast.success('提示词已复制到剪贴板')`, and failures use the normalized error message.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/index/components/content/startGuidePrompt.test.ts src/index/components/content/ContentAreaView.source.test.ts
```

Expected: FAIL because the helper and card-copy wiring do not exist.

- [ ] **Step 3: Implement prompt assembly and clipboard wiring**

Build the prompt with the card's scene:

```ts
const systemPrompt = finalGuide === 'update-canvas'
  ? getCanvasAiStartSystemPrompt(kind, scene)
  : stripCanvasUpdateInstruction(getCanvasAiStartSystemPrompt(kind, scene));
return appendCanvasGenerationPromptSettings({
  scene,
  prompt: appendCanvasAiPrototypeStartSystemPrompt(prompt, systemPrompt),
  settings,
  finalGuide,
});
```

For resource design cards, merge `card.imageSize` into current effective image settings. For document cards, merge `card.prdPlanning === 'enable'` into current document settings. For design-source cards, pass `settings: undefined`. Copy through `copyToClipboard`, show the success toast, and show `error.message || '复制提示词失败'` on failure.

- [ ] **Step 4: Run focused and adjacent tests**

Run:

```bash
pnpm exec vitest run src/index/components/content/startGuidePrompt.test.ts src/index/components/content/StartPromptCard.test.ts src/index/components/content/resourceStartPromptSelection.test.ts src/index/components/content/ThemeStartPromptGrid.test.ts src/index/components/content/ThemeStartPromptGrid.source.test.ts src/index/components/content/ContentAreaView.source.test.ts src/index/domains/shared/CanvasGenerationComposer.test.ts src/index/domains/shared/CanvasGenerationComposer.source.test.ts src/index/app/IndexPage.test.ts
```

Expected: all selected files pass with zero failures.

- [ ] **Step 5: Run build and visual verification**

Run:

```bash
pnpm admin:build
```

Expected: both Vite admin builds complete successfully. Start `pnpm admin:dev`, then verify desktop and mobile start-guide states in a browser: configured input is editable; unconfigured input is locked with a working settings control; resource/design cards reveal copy on hover/focus and copying does not select a card.
