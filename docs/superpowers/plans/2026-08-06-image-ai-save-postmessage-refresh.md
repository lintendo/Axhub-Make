# Image AI Save PostMessage Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route embedded image-playground image download actions into Make's fixed resource directory, notify the Make host after successful saves via `postMessage`, and refresh the Resources sidebar without a page reload.

**Architecture:** The ACP image playground will centralize fixed-directory saves in its existing download helper and emit one `acp.image.saved` event per completed save operation to the parent window. Axhub Make will validate the iframe source/origin, parse the additive event, and call the existing docs-resource refresh callback while preserving folder selection.

**Tech Stack:** React 19/Vite/TypeScript in `acp-ui/vendor/gpt-image-playground`, React 18/Vite/Vitest in `apps/axhub-make`, existing ACP `postMessage` bridge, existing `/api/tools/image-generation/save` endpoint.

## Global Constraints

- Keep the existing download button UI and labels; change click behavior only.
- Use the already configured absolute `saveDirectory`; do not add another persistence setting.
- Refresh only after a successful fixed-directory save; failures keep the existing toast behavior.
- Keep browser/ZIP download behavior for standalone mode when no `saveDirectory` is configured.
- Preserve Make's iframe source and origin validation before consuming host events.
- Use pnpm for Axhub Make commands and the vendor package's existing test/build commands.

---

### Task 1: Add the ACP save event contract

**Files:**
- Create: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/lib/acpImageSaveHost.ts`
- Test: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/lib/acpImageSaveHost.test.ts`

**Interfaces:**
- Produces `notifyAcpImageSaved(paths: string[]): void`, which posts
  `{ type: 'acp.image.saved', payload: { paths, savedCount, requestedCount } }`
  to `window.parent` only when the parent is different from the current window
  and at least one path exists.

- [ ] **Step 1: Write the failing test**

  Stub `window.parent.postMessage`, call `notifyAcpImageSaved(['/tmp/images/a.png'])`, and assert the exact envelope; add a no-op assertion for an empty path list and a standalone window.

- [ ] **Step 2: Run the test to verify it fails**

  Run from `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground`:

  ```bash
  pnpm exec vitest run src/lib/acpImageSaveHost.test.ts
  ```

  Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the minimal helper**

  Guard `typeof window === 'undefined'`, `window.parent === window`, and empty normalized paths; then call `window.parent.postMessage(message, '*')`.

- [ ] **Step 4: Run the test to verify it passes**

  Run the same command and expect the new tests to pass.

- [ ] **Step 5: Commit**

  The ACP UI directory is currently not a git checkout; leave this source change in place and record it in the final handoff instead of staging unrelated generated files.

### Task 2: Make all fixed-directory image saves emit one event

**Files:**
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/lib/downloadImages.ts`
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/lib/acpImageSave.ts`
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/components/TaskCard.tsx`
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/components/DetailModal.tsx`
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/components/ImageContextMenu.tsx`
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/components/InputBar.tsx`
- Modify: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/components/AgentWorkspace.tsx`
- Test: `/Volumes/WORK/rd/acp-ui/vendor/gpt-image-playground/src/lib/downloadImages.test.ts`

**Interfaces:**
- `downloadImageIds` and `downloadImageEntriesAsZip` retain their existing result shape. When `getAcpImageSaveDirectory()` is set, they save each image through `/api/tools/image-generation/save`, return counts, and call `notifyAcpImageSaved` once with successful paths. Without it, they retain browser download/ZIP behavior.

- [ ] **Step 1: Write the failing tests**

  Add tests that mock the image fetch/cache and save endpoint, set the host save directory, call the single-image and multi-image helpers, and expect fixed-directory POSTs plus one host event. Add a no-directory test proving browser download behavior remains selected.

- [ ] **Step 2: Run the tests to verify they fail**

  ```bash
  pnpm exec vitest run src/lib/downloadImages.test.ts
  ```

  Expected: FAIL because the helpers currently trigger only browser downloads and emit no event.

- [ ] **Step 3: Implement the minimal save path**

  Convert fetched blobs to data URLs, derive collision-safe file-name stems from the existing names, call `saveAcpImage`, collect successful paths, and notify once after the loop. Use the same conditional helper from every image-playground download action. Route DetailModal's current/original/all/partial actions through these helpers and make the existing explicit “save current” action share the same implementation so no action can bypass the fixed directory.

- [ ] **Step 4: Run ACP tests**

  ```bash
  pnpm test
  ```

  Expected: all image-playground tests pass, including the new fixed-directory and event tests.

- [ ] **Step 5: Build the image playground**

  ```bash
  pnpm build:image-playground
  ```

  Expected: Vite output succeeds and the generated ACP UI contains the updated source.

### Task 3: Add Make-side event parsing and resource refresh callback

**Files:**
- Create: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/domains/assistant/assistantImageSavedEvent.ts`
- Test: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/domains/assistant/assistantImageSavedEvent.test.ts`
- Modify: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/domains/assistant/hooks/useAssistantPanelController.tsx`
- Modify: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/domains/assistant/hooks/useAssistantPanelController.test.ts`

**Interfaces:**
- `readAssistantImageSavedEvent(value: unknown): AssistantImageSavedEvent | null` validates the `acp.image.saved` type and positive integer `savedCount`, returning normalized paths/counts.
- `useAssistantPanelController` accepts optional `onImageSaved?: (event: AssistantImageSavedEvent) => void` and invokes it only after iframe source/origin validation.

- [ ] **Step 1: Write the failing parser test**

  Cover a valid envelope, malformed payload, zero count, and unknown type.

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  pnpm exec vitest run src/index/domains/assistant/assistantImageSavedEvent.test.ts
  ```

  Expected: FAIL because the parser is not present.

- [ ] **Step 3: Implement the parser and controller callback**

  Add the parser, import it in the controller, read it inside the existing accepted-origin message branch, and call `onImageSaved?.(savedEvent)` without changing run-state or notification handling.

- [ ] **Step 4: Add and run controller source assertions**

  Assert the callback parameter, parser call, and accepted-origin placement; run the focused controller tests and expect them to pass.

### Task 4: Connect the callback to the existing docs refresh flow

**Files:**
- Modify: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/app/index-page/useIndexPageResourceActions.tsx`
- Modify: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/app/IndexPage.tsx`
- Modify: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/app/index-page/useIndexPageResourceActions.test.ts`
- Modify: `/Users/jianzhoulin/rd/Axhub Runtime/apps/axhub-make/src/index/app/IndexPage.test.ts`

**Interfaces:**
- Expose the existing `refreshDocsResources` callback from the resource-actions hook.
- Pass `onImageSaved: () => { void resources.refreshDocsResources(); }` to the image AI controller only; the general assistant controller remains unchanged.

- [ ] **Step 1: Write failing source tests**

  Assert the resource action return object exposes `refreshDocsResources` and the image AI controller call wires `onImageSaved` to it.

- [ ] **Step 2: Run the tests to verify they fail**

  ```bash
  pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/IndexPage.test.ts
  ```

  Expected: FAIL because the callback is not exposed or connected.

- [ ] **Step 3: Implement the connection**

  Return `refreshDocsResources`, define a stable `handleImageAiSaved` callback in `IndexPage`, and pass it to the existing image-AI controller call. The callback does not alter `selectedResourceFolder` or open another view.

- [ ] **Step 4: Run focused Make tests**

  ```bash
  pnpm exec vitest run \
    src/index/domains/assistant/assistantImageSavedEvent.test.ts \
    src/index/domains/assistant/hooks/useAssistantPanelController.test.ts \
    src/index/app/index-page/useIndexPageResourceActions.test.ts \
    src/index/app/IndexPage.test.ts
  ```

  Expected: all listed tests pass.

### Task 5: Verify both applications and review the diff

**Files:**
- Verify: all files above plus the design document.

- [ ] **Step 1: Run ACP image-playground tests and build**

  ```bash
  pnpm test
  pnpm build:image-playground
  ```

- [ ] **Step 2: Run Make focused regression and builds**

  ```bash
  pnpm exec vitest run \
    src/index/domains/assistant/assistantImageSavedEvent.test.ts \
    src/index/domains/assistant/hooks/useAssistantPanelController.test.ts \
    src/index/app/index-page/useIndexPageResourceActions.test.ts \
    src/index/app/IndexPage.test.ts
  pnpm server:build
  pnpm admin:build
  ```

- [ ] **Step 3: Review changes**

  Run `git diff --check` in Make, inspect the ACP UI source diff directly because that directory has no git metadata, and verify no browser-download path is used when `saveDirectory` is configured.

