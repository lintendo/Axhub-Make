# Prototype Annotation Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated prototype annotation entry and session mode that reuses existing annotation storage, enablement, and prompt rules while improving the user-facing interaction.

**Architecture:** Make owns the top-toolbar entry, unopened-annotation dialog, prompt copy action, and launch options. DevTemplate forwards an `annotation` interaction profile into `@axhub/commentary`. Commentary reuses the existing prompt card and annotation Markdown editor, changing only default state, visible controls, and the manual/AI toggle for this special profile.

**Tech Stack:** TypeScript 5.x, React 18.2.0, Ant Design 6, Radix UI Dialog, Vitest, pnpm workspace.

## Global Constraints

- Use pnpm only.
- Do not change `AnnotationSourceDocument`, directory node, marker, or annotation markdown wire formats.
- Do not replace the existing `/api/prototype-annotation/enable` flow.
- Do not create a second selection, locator, save, or AI execution chain.
- AI generation path copies a prompt; it does not automatically execute AI.
- Ordinary comment mode and document quick-edit mode must keep their current behavior.
- Preserve unrelated user changes in both the root repository and `apps/axhub-make`.
- Do not create commits unless the user explicitly asks for them.

---

### Task 1: Add the annotation launch profile contract

**Files:**
- Modify: `apps/axhub-make/src/index/utils/url.ts`
- Modify: `apps/axhub-make/src/index/app/index-page/previewActions.helpers.ts`
- Modify: `apps/axhub-make/src/index/app/index-page/usePrototypeEditorBridgeActions.ts`
- Modify: `apps/axhub-make/src/dev-template/webEditorV2Integration.ts`
- Modify: `apps/axhub-make/src/dev-template/index.tsx`
- Modify: `packages/axhub-commentary/src/core/editor/ui-settings.ts`
- Modify: `packages/axhub-commentary/src/core/editor/state.ts`
- Modify: `packages/axhub-commentary/src/ui/runtime/runtime-shell.tsx`
- Test: `apps/axhub-make/src/index/app/index-page/previewActions.helpers.test.ts`
- Test: `apps/axhub-make/src/dev-template/webEditorV2Integration.test.ts`
- Test: `packages/axhub-commentary/src/ui/runtime/runtime-shell.test.tsx`

**Interfaces:**
- Produces: `BuildEditorUrlOptions.annotationSession?: boolean`, `WebEditorV2EnableOptions.interactionProfile?: 'design' | 'text-comment' | 'annotation'`.
- Consumes: existing `hostToolbar`, mobile mode, assistant panel, annotation API base URL, and project ID launch options.

- [ ] **Step 1: Write failing tests** asserting `buildProjectPrototypeIframeUrl(..., { hostToolbar: true, annotationSession: true })` appends `annotationSession=1`; `controller.enable({ interactionProfile: 'annotation' })` passes `interactionProfile: 'annotation'` to `createCommentary`; and annotation profile disables design settings like text-comment.

- [ ] **Step 2: Run RED**
```bash
pnpm exec vitest run apps/axhub-make/src/index/app/index-page/previewActions.helpers.test.ts apps/axhub-make/src/dev-template/webEditorV2Integration.test.ts packages/axhub-commentary/src/ui/runtime/runtime-shell.test.tsx
```

- [ ] **Step 3: Implement contract** by carrying `annotationSession=1` through URL helpers, bridge enable options, DevTemplate enable options, and Commentary interaction profile normalization.

- [ ] **Step 4: Run GREEN** with the same command.

### Task 2: Add the top-toolbar annotation entry and prompt

**Files:**
- Modify: `apps/axhub-make/src/index/utils/quickEditPrompts.ts`
- Modify: `apps/axhub-make/src/index/app/index-page/useIndexPagePreviewActions.tsx`
- Modify: `apps/axhub-make/src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- Modify: `apps/axhub-make/src/index/types/index-page.types.ts`
- Modify: `apps/axhub-make/src/index/components/content/PresentationArea.tsx`
- Modify: `apps/axhub-make/src/index/components/content/PresentationToolbar.tsx`
- Test: `apps/axhub-make/src/index/utils/quickEditPrompts.test.ts`
- Test: `apps/axhub-make/src/index/components/content/PresentationToolbar.test.ts`
- Test: `apps/axhub-make/src/index/app/index-page/useIndexPagePreviewActions.test.ts`

**Interfaces:**
- Produces: `handleOpenPrototypeAnnotationSession`, `prototypeAnnotationSessionActive`, `prototypeAnnotationPromptCopying`, and `buildPrototypeAnnotationAcpPrompt(...)`.
- Consumes: existing host toolbar annotation state, `enablePrototypeAnnotationFromHost`, quick-edit open/exit, and clipboard feedback.

- [ ] **Step 1: Write failing tests** asserting the prototype toolbar has no top `<Code2 /> 打开`, adds `<FileText /> 标注` after `批注`, removes `enable-annotation` from the host more menu, and the annotation prompt includes prototype-annotation guidance, specs/docs/directory/Markdown requirements, and no absolute paths.

- [ ] **Step 2: Run RED**
```bash
pnpm exec vitest run apps/axhub-make/src/index/utils/quickEditPrompts.test.ts apps/axhub-make/src/index/components/content/PresentationToolbar.test.ts apps/axhub-make/src/index/app/index-page/useIndexPagePreviewActions.test.ts
```

- [ ] **Step 3: Implement Make UI** by routing `标注` clicks through the existing status and enablement path, copying the new prompt on AI path, and launching quick edit with `annotationSession: true`.

- [ ] **Step 4: Run GREEN** with the same command.

### Task 3: Specialize the prompt card UI for annotation sessions

**Files:**
- Modify: `packages/axhub-commentary/src/ui/runtime/types.ts`
- Modify: `packages/axhub-commentary/src/ui/runtime/prompt-card-view.tsx`
- Modify: `packages/axhub-commentary/src/ui/runtime/runtime-shell.tsx`
- Test: `packages/axhub-commentary/src/ui/runtime/prompt-card-view.test.ts`
- Test: `packages/axhub-commentary/src/ui/runtime/prompt-card-view.test.tsx`
- Test: `packages/axhub-commentary/src/ui/runtime/runtime-shell.test.tsx`

**Interfaces:**
- Consumes: `interactionProfile === 'annotation'`, existing annotation Markdown editor props, existing AI note composer, and existing send-to-agent action.
- Produces: manual/AI toggle, manual default editor state, hidden design controls, and preserved drafts.

- [ ] **Step 1: Write failing tests** asserting annotation profile defaults to manual annotation editing, renders a `人工 / AI 生成` toggle, hides style/design controls, AI toggle hides the editor while preserving the draft, and design profile remains unchanged.

- [ ] **Step 2: Run RED**
```bash
pnpm exec vitest run packages/axhub-commentary/src/ui/runtime/prompt-card-view.test.ts packages/axhub-commentary/src/ui/runtime/prompt-card-view.test.tsx packages/axhub-commentary/src/ui/runtime/runtime-shell.test.tsx
```

- [ ] **Step 3: Implement prompt card behavior** by deriving `isAnnotationSession`, default-opening the annotation editor for selected targets, rendering the toggle, hiding non-annotation design actions, and passing the profile through runtime props.

- [ ] **Step 4: Run GREEN** with the same command.

### Task 4: Final verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused Make and Commentary tests**
```bash
pnpm exec vitest run apps/axhub-make/src/index/utils/quickEditPrompts.test.ts apps/axhub-make/src/index/components/content/PresentationToolbar.test.ts apps/axhub-make/src/index/app/index-page/previewActions.helpers.test.ts apps/axhub-make/src/index/app/index-page/useIndexPagePreviewActions.test.ts apps/axhub-make/src/dev-template/webEditorV2Integration.test.ts packages/axhub-commentary/src/ui/runtime/prompt-card-view.test.ts packages/axhub-commentary/src/ui/runtime/prompt-card-view.test.tsx packages/axhub-commentary/src/ui/runtime/runtime-shell.test.tsx
```

- [ ] **Step 2: Run type/build verification**
```bash
pnpm --filter @axhub/make server:build
pnpm --filter @axhub/commentary build
```

- [ ] **Step 3: Inspect diff** to confirm only scoped files changed and no unrelated user edits were reverted.

