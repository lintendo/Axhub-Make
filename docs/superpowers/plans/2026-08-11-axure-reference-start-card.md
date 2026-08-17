# Axure Reference Prototype Start Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the affected prototype start-card labels visible on one line and add a `参考 Axure 生成原型` card whose prompt uses Axure as a positive product and interaction reference.

**Architecture:** Extend the existing `PROTOTYPE_START_PROMPT_CARDS` data so the current copy and quick-execute pipeline remains unchanged. Adjust only the shared card label spacing and wrapping classes; do not change the responsive grid or the resource-document Axure card.

**Tech Stack:** React 18.2, TypeScript 5, Tailwind utility classes, Vitest, React Test Renderer, pnpm.

## Global Constraints

- Use `pnpm` for repository commands.
- The visible Axure label is exactly `参考 Axure 生成原型`.
- The full prompt accepts an Axure online link or locally exported HTML and names the `extract-axure-data` skill URL.
- The prompt describes Axure positively as a reference; it contains no mechanical-conversion, copying, or prohibition wording.
- Keep the existing `Axure 转产品文档` resource card unchanged.
- Keep prototype card selection copy-only and quick execute at `autoSend: false`.
- Preserve the current responsive grid and show the full label without an ellipsis.
- The target source and test files already contain unrelated uncommitted work. Do not stage, commit, reorder, or revert those existing changes.

---

### Task 1: Prototype card copy and Axure reference prompt

**Files:**
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`

**Interfaces:**
- Consumes: `ThemeStartPromptCard` and the existing `buildStartGuidePrompt({ kind: 'prototype', scene: 'page', ... })` path.
- Produces: seven entries in `PROTOTYPE_START_PROMPT_CARDS`, including `id: 'axure-reference-prototype'` and `title: '参考 Axure 生成原型'`.

- [x] **Step 1: Write the failing content assertions**

  In the existing prototype-card source test, isolate the prototype definition and assert the two concise labels plus the new Axure entry:

  ```ts
  const prototypeCardsSegment = getSourceSegment(
    source,
    'const PROTOTYPE_START_PROMPT_CARDS = [',
    'const RESOURCE_START_PROMPT_CARDS = [',
  );

  expect(prototypeCardsSegment).toContain("title: '运动记录 APP 首页'");
  expect(prototypeCardsSegment).toContain("title: 'Apple 风格智能家居'");
  expect(prototypeCardsSegment).toContain("id: 'axure-reference-prototype'");
  expect(prototypeCardsSegment).toContain("title: '参考 Axure 生成原型'");
  expect(prototypeCardsSegment).toContain('参考我提供的 Axure 原型');
  expect(prototypeCardsSegment).toContain('在线链接或本地导出的 HTML 文件');
  expect(prototypeCardsSegment).toContain('extract-axure-data');
  expect(prototypeCardsSegment).toContain('https://github.com/lintendo/Axhub-Skills/tree/main/skills/extract-axure-data');
  expect(prototypeCardsSegment).not.toMatch(/机械转换|像素级|照搬|复刻/);
  ```

  Update the test name from six to seven capability cards and assert the previous two long visible titles are absent from `prototypeCardsSegment`.

- [x] **Step 2: Run the focused source test and verify RED**

  Run:

  ```bash
  pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts --reporter=dot
  ```

  Expected: FAIL because the concise labels and Axure prototype entry do not exist yet.

- [x] **Step 3: Implement the minimal card definitions**

  Change only the visible titles for the existing fitness and Apple cards; keep their detailed prompts unchanged. Insert this new card in the prototype array:

  ```ts
  {
      id: 'axure-reference-prototype',
      title: '参考 Axure 生成原型',
      prompt: '请参考我提供的 Axure 原型（在线链接或本地导出的 HTML 文件）生成当前项目的可运行原型。先使用 extract-axure-data 技能（https://github.com/lintendo/Axhub-Skills/tree/main/skills/extract-axure-data）理解原型中的页面结构、核心流程、交互、标注、字段和状态，再结合当前项目的设计规范规划并实现页面；信息不足处请标注待确认。',
      icon: FileIcon,
  },
  ```

- [x] **Step 4: Run the focused source test and verify GREEN**

  Run the same Vitest command. Expected: PASS with zero failures.

---

### Task 2: Single-line card-label layout

**Files:**
- Modify: `src/index/components/content/StartPromptCard.test.ts`
- Modify: `src/index/components/content/StartPromptCard.tsx`

**Interfaces:**
- Consumes: existing `StartPromptCard` body button and title span.
- Produces: a full visible title with `whitespace-nowrap` and enough right-side content width through `pr-10` while retaining the quick-execute button.

- [x] **Step 1: Write the failing renderer assertion**

  Add a test that renders `参考 Axure 生成原型`, finds the card body by accessible name, and asserts:

  ```ts
  const cardButton = renderer!.root.findByProps({ 'aria-label': '参考 Axure 生成原型' });
  const title = cardButton.findByType('span');

  expect(cardButton.props.className).toContain('pr-10');
  expect(cardButton.props.className).not.toContain('pr-12');
  expect(title.props.className).toContain('whitespace-nowrap');
  expect(title.props.className).not.toContain('truncate');
  ```

- [x] **Step 2: Run the focused component test and verify RED**

  Run:

  ```bash
  pnpm exec vitest run src/index/components/content/StartPromptCard.test.ts --reporter=dot
  ```

  Expected: FAIL because the current card reserves `pr-12` and allows title wrapping.

- [x] **Step 3: Implement the minimal layout change**

  In `StartPromptCard.tsx`, change the body button from `pr-12` to `pr-10` and change the title span to:

  ```tsx
  <span className="min-w-0 flex-1 whitespace-nowrap leading-5">{title}</span>
  ```

  Do not change the grid, font size, icon, tooltip, or execute-button position.

- [x] **Step 4: Run the focused component test and verify GREEN**

  Run the same Vitest command. Expected: PASS with zero failures.

---

### Task 3: Start-guide regression and build verification

**Files:**
- Verify: `src/index/components/content/ContentAreaView.source.test.ts`
- Verify: `src/index/components/content/StartPromptCard.test.ts`
- Verify: `src/index/components/content/ThemeStartPromptGrid.test.ts`
- Verify: `src/index/components/content/StartPromptGrid.source.test.ts`
- Verify: `src/index/components/content/startGuidePrompt.test.ts`

**Interfaces:**
- Consumes: final source and shared prompt-card rendering behavior.
- Produces: verification evidence without staging unrelated dirty-worktree changes.

- [x] **Step 1: Run the focused start-guide regression set**

  ```bash
  pnpm exec vitest run \
    src/index/components/content/ContentAreaView.source.test.ts \
    src/index/components/content/StartPromptCard.test.ts \
    src/index/components/content/ThemeStartPromptGrid.test.ts \
    src/index/components/content/StartPromptGrid.source.test.ts \
    src/index/components/content/startGuidePrompt.test.ts \
    --reporter=dot
  ```

  Expected: all selected test files pass with zero failed tests.

- [x] **Step 2: Build the Vite application**

  ```bash
  pnpm exec vite build
  ```

  Expected: exit code 0.

- [x] **Step 3: Inspect only the task hunks**

  ```bash
  git diff --check -- \
    src/index/components/content/ContentAreaView.tsx \
    src/index/components/content/ContentAreaView.source.test.ts \
    src/index/components/content/StartPromptCard.tsx \
    src/index/components/content/StartPromptCard.test.ts
  git diff --unified=3 -- \
    src/index/components/content/ContentAreaView.tsx \
    src/index/components/content/ContentAreaView.source.test.ts \
    src/index/components/content/StartPromptCard.tsx \
    src/index/components/content/StartPromptCard.test.ts
  ```

  Confirm the requested card copy, positive reference prompt, single-line class, and spacing class are present. Do not stage or commit these shared dirty files.
