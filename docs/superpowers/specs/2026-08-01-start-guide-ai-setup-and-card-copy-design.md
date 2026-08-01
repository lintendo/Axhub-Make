# Start Guide AI Setup And Card Copy Design

## Goal

Make the start guide honest and useful when no default local AI Agent is configured: keep the composer visible but prevent editing, while preserving direct routes to AI settings and local AI applications. Add a hover copy action to resource and design prompt cards so users can copy a fully assembled prompt for a local AI without changing the current form state.

## Scope

- The locked composer state applies only to the homepage `StartGuide` display composer.
- Resource and design prompt cards gain a copy action; prototype template cards are unchanged.
- Existing submission and prompt-optimization preflight guards remain as defense in depth.
- No compatibility layer or new dependency is introduced.

## Composer Behavior

`StartGuide` derives whether a default Agent is configured from `preferredPromptClient` using the existing prompt-client normalization and ACP provider resolver.

When no default Agent is configured:

- Keep the composer shell and settings fallback visible.
- Disable text entry, attachments, context selection, prompt optimization, submission, and prompt-card selection.
- Replace the empty-state placeholder with `请使用下方本地 AI 应用，或前往 AI 设置完成配置`.
- Keep `设置 AI Agent` clickable so it can open the existing AI settings dialog.
- Keep resource and design card copy actions enabled so the user can work in a local AI application.
- Preserve an existing draft without allowing edits; restoring configuration makes it editable again.

A configured Agent whose ACP runtime is temporarily unavailable is not treated as unconfigured. Its existing runtime fallback behavior remains unchanged.

## Prompt Card Interaction

Resource and design cards share a presentational card component. The card body remains the primary action that selects the example and may change the active scene or settings. A separate sibling icon button appears on the right on pointer hover and keyboard focus, avoiding nested interactive elements.

The copy button:

- Uses the Lucide `Copy` icon.
- Has the accessible label and tooltip `复制提示词给本地 AI 使用`.
- Remains available when card selection is disabled because AI setup is missing.
- Does not select the card, change scenes, change image size or PRD settings, or write into the composer.
- Reports success with `提示词已复制到剪贴板` and reports clipboard failures with a clear error toast.

## Full Prompt Assembly

The parent `StartGuide` owns full-prompt assembly because it already owns scene system prompts and settings. Card grids receive an asynchronous copy callback and do not know how prompts are assembled or written to the clipboard.

For resource cards, prompt assembly uses the card's own scene rather than the currently selected scene:

- Design cards apply the card's `imageSize` over the current image settings.
- Document cards apply the card's `prdPlanning` value over the current document settings.
- Other current scene settings remain intact where applicable.

For design-source cards, prompt assembly uses the design start-guide system prompt. Both card types append the existing `local-ai-acknowledgement` final guide so the copied text is ready to paste into a local AI.

## Components And Data Flow

1. `StartGuide` computes `aiSetupRequired` and passes it to the display composer.
2. The display composer separates editing controls from the settings fallback, disabling only editing behavior.
3. A resource or design grid passes card data to a shared prompt-card component.
4. The shared component invokes `onCopyPrompt(card)` from its copy icon without invoking the card selection callback.
5. `StartGuide` assembles the prompt with the card scene and metadata, writes it to the clipboard, and shows a toast.

## Error Handling

- Empty card prompts are filtered by the existing card-list construction and are not copied.
- Clipboard rejection produces an error toast and does not alter the composer or card state.
- Existing submit and optimization guards continue to open AI settings if a stale UI somehow triggers them without a configured Agent.

## Testing

- Extend the ACP visibility tests to distinguish `defaultAgentConfigured` from editing lock behavior.
- Cover the homepage wiring for the setup-required placeholder and display-composer lock.
- Render resource and design grids to verify selection and copying are separate actions.
- Verify copy remains available when selection is disabled.
- Verify resource card copy assembly uses card scene, image size, and PRD planning metadata.
- Verify design card copy assembly uses the design start prompt and local-AI final guide.
- Run the focused Vitest files, TypeScript/build validation required by the Make workspace, and visual browser checks for configured and unconfigured states.
