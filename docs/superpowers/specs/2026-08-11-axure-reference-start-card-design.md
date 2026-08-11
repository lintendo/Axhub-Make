# Axure Reference Prototype Start Card Design

## Goal

Keep prototype start-card labels on one line and add an Axure-based prototype-generation entry. Axure supplies product and interaction context for the new prototype.

## Scope

- Shorten the two prototype-card labels that currently wrap:
  - `生成运动记录 APP 首页` becomes `运动记录 APP 首页`.
  - `按 Apple 设计规范生成原型` becomes `Apple 风格智能家居`.
- Add a prototype card titled `参考 Axure 生成原型`.
- Keep the current prompt-card grid, copy behavior, and quick-execute behavior.
- Do not change the existing resource card titled `Axure 转产品文档`.

## Axure Reference Prompt

The full prompt behind `参考 Axure 生成原型` must:

- Accept an Axure online link or locally exported HTML.
- Use the `extract-axure-data` skill from `https://github.com/lintendo/Axhub-Skills/tree/main/skills/extract-axure-data` to understand the source pages, screenshots, flows, interactions, annotations, fields, and states.
- Treat the extracted material as a reference for product structure and interaction intent.
- Generate a new runnable prototype under the current Axhub Make client project and follow the current project's design system.
- Preserve only source-grounded product logic; mark missing or uncertain information as pending confirmation.

## Layout

- Prototype-card labels are single-line text.
- Use concise visible labels rather than reducing the font size until it becomes hard to read.
- Slightly reduce unnecessary horizontal reservation around the icon, label, and quick-execute affordance if required.
- Preserve the current responsive grid and its existing column behavior.
- Do not hide overflow with an ellipsis for the three affected labels; their complete text must remain visible.

## Data and Interaction Flow

- Add the new definition to `PROTOTYPE_START_PROMPT_CARDS` and reuse `ThemeStartPromptGrid`.
- Selecting the card keeps the existing copy-only behavior and does not auto-submit.
- Quick execute keeps `autoSend: false` and targets the current prototype start path.
- Prompt assembly continues through `buildStartGuidePrompt` with prototype/page context.

## Error Handling and Accessibility

- The new entry remains a real button whose accessible name matches `参考 Axure 生成原型`.
- Existing disabled, clipboard failure, and AI-sidebar failure behavior remains unchanged.
- The visible label and keyboard focus behavior remain available at all supported grid widths.

## Verification

- Add a failing source-level assertion before implementation for the three concise labels and the Axure reference prompt contract.
- Assert that the prompt names `extract-axure-data` and describes Axure as a reference.
- Add a failing style assertion for the single-line label rule before changing the card styles.
- Run the focused start-guide and card tests, then the app's Vite build.
- Run `git diff --check` and inspect only the touched start-card files and tests.
