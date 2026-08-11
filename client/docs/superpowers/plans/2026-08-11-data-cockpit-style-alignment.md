# Data Cockpit Style Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the data cockpit Skill's `DESIGN.md` dependency with user-aligned built-in visualization styles and reduce the bundled 4K reference-image footprint without harming style selection.

**Architecture:** Keep `visualization-style-prompts.md` and its images as the single source of truth. Add a concise `style-alignment.md` reference to both mirrored Skill packages, update the main Skill to route requirement alignment through that reference, and encode the contract in Vitest. Convert only the eight 4K PNG references to same-resolution WebP assets and update Markdown links.

**Tech Stack:** Markdown, YAML, Vitest, Node.js filesystem APIs, `cwebp`, ImageMagick, pnpm.

## Global Constraints

- Use pnpm for repository tests.
- Keep React at 18.2.0; this change adds no runtime dependency.
- Treat this Skill as an explicit exception to the client-wide `DESIGN.md` alignment flow; do not modify the global guide.
- Preserve the selected candidate image as the only visible reconstruction authority.
- Keep all eight published reference images at 3840×2160.
- Prefer visual style-selection quality over the 12–16 MB aggregate size target.
- Keep `.agents` and `.claude` Skill packages byte-for-byte aligned.
- Preserve unrelated working-tree changes.

---

### Task 1: Capture the failing style-alignment behavior

**Files:**
- Modify: `client/tests/data-cockpit-prototype-skill.test.ts`
- Read: `client/.agents/skills/generate-data-cockpit-prototype/SKILL.md`
- Read: `client/src/resources/data-visualization-style-reference/visualization-style-prompts.md`

**Interfaces:**
- Consumes: the current Skill behavior that requires an existing `DESIGN.md`.
- Produces: a failing behavioral baseline and static contract for the replacement workflow.

- [ ] **Step 1: Run a clean behavioral baseline against the current Skill**

Dispatch a fresh-context evaluator with this task-local prompt:

```text
Use the generate-data-cockpit-prototype Skill at
/Volumes/WORK/rd/Axhub Runtime/apps/axhub-make/client/.agents/skills/generate-data-cockpit-prototype
for this request: “帮我做一个智慧水务运营驾驶舱。我没有设计要求，也没有参考图。”
Stop after describing the requirement/design-alignment response you would give before generating images.
```

Expected baseline failure: it asks the user to choose an existing `DESIGN.md` or treats a theme as the required design basis instead of recommending three built-in data-visualization styles.

- [ ] **Step 2: Replace the old `DESIGN.md` assertions with the new contract**

Extend `relativeFiles` with `references/style-alignment.md`, then make the requirement-alignment test assert this shape:

```ts
expect(skill).toContain('明确例外');
expect(skill).toContain('跳过 `DESIGN.md`');
expect(skill).toContain('[style-alignment.md](references/style-alignment.md)');
expect(skill).not.toContain('用户确认一个现有 `DESIGN.md`');

const styleAlignment = read(agentsRoot, 'references/style-alignment.md');
for (const required of [
  '用户参考图',
  '用户明确的布局、风格和主题色',
  '内置 8 套风格',
  '推荐 3 套',
  '主要板块与布局',
  '中央载体',
  '主题色',
  '主要取舍',
  '完整提示词',
]) {
  expect(styleAlignment).toContain(required);
}
expect(styleAlignment).toContain(
  '../../../../src/resources/data-visualization-style-reference/visualization-style-prompts.md',
);
expect(styleAlignment).toContain('不静默回退到 `DESIGN.md`');
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest --run tests/data-cockpit-prototype-skill.test.ts
```

Expected: FAIL because `references/style-alignment.md` is missing and the current Skill still requires an existing `DESIGN.md`.

- [ ] **Step 4: Commit the failing contract**

```bash
git add client/tests/data-cockpit-prototype-skill.test.ts
git commit -m "test: define cockpit style alignment contract"
```

### Task 2: Implement the Skill-local style decision workflow

**Files:**
- Modify: `client/.agents/skills/generate-data-cockpit-prototype/SKILL.md`
- Create: `client/.agents/skills/generate-data-cockpit-prototype/references/style-alignment.md`
- Modify: `client/.claude/skills/generate-data-cockpit-prototype/SKILL.md`
- Create: `client/.claude/skills/generate-data-cockpit-prototype/references/style-alignment.md`
- Test: `client/tests/data-cockpit-prototype-skill.test.ts`

**Interfaces:**
- Consumes: user-provided reference images, explicit layout/style/color requirements, and the central eight-style resource.
- Produces: three recommended directions when visual input is absent and complete prompts for candidate image generation.

- [ ] **Step 1: Replace the main Skill's `DESIGN.md` requirement**

Update stage 1 so it explicitly states:

```markdown
- 本 Skill 是 client 默认 `DESIGN.md` 设计对齐流程的明确例外：读取需求对齐指南，但跳过 `DESIGN.md` 候选、主题深链和设计基底确认。
- 按 [style-alignment.md](references/style-alignment.md) 对齐业务板块、布局、中央载体、设计风格和主题色。
- 设计输入按“用户参考图 → 用户明确的布局、风格和主题色 → 内置 8 套风格”处理。
- 用户没有任何设计输入时，推荐 3 套有实质差异的内置风格并等待确认；不静默回退到 `DESIGN.md`。
```

Keep the existing rule that requirement alignment is temporary and cannot correct the selected image later.

- [ ] **Step 2: Create the progressive-disclosure reference**

Write `references/style-alignment.md` with these concrete sections:

```markdown
# 数据大屏设计对齐

## 权威资料

读取 `../../../../src/resources/data-visualization-style-reference/visualization-style-prompts.md`。它是 8 套风格、参考图和完整提示词的唯一来源；不要在本 Skill 复制完整提示词。

## 输入优先级

1. 用户参考图。
2. 用户明确的布局、风格和主题色。
3. 内置 8 套风格。

## 无设计输入时

按行业匹配度、数据密度、GIS/3D 倾向、明暗倾向和文化气质推荐 3 套有实质差异的方向。每套包含风格名称、参考图、推荐理由、主要板块与布局、中央载体、主题色和主要取舍，等待用户选择。

## 提示词合同

以所选风格的完整提示词为骨架，替换行业、标题、中央载体、核心业务对象和关键指标；保留构图、模块密度、卡片语言、配色、光照、渲染方式和负面约束。用户要求优先，不得只摘取风格名称或少量关键词。

## 失败处理

资料缺失时说明问题并停止生成，不静默回退到 `DESIGN.md`。
```

Also cover reference-image precedence, direct screenshot reconstruction routing, and the requirement to keep business content and viewport stable across candidates.

- [ ] **Step 3: Mirror the Skill package mechanically**

Copy the changed `.agents` files to the same relative paths under `.claude`; do not hand-edit divergent copies.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest --run tests/data-cockpit-prototype-skill.test.ts
```

Expected: PASS for the style-alignment and mirror tests.

- [ ] **Step 5: Validate both Skill packages**

Run:

```bash
python /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.agents/skills/generate-data-cockpit-prototype
python /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.claude/skills/generate-data-cockpit-prototype
```

Expected: both commands report a valid Skill.

- [ ] **Step 6: Commit the Skill workflow**

```bash
git add client/.agents/skills/generate-data-cockpit-prototype client/.claude/skills/generate-data-cockpit-prototype
git commit -m "feat: align cockpit generation with built-in styles"
```

### Task 3: Define and implement the 4K WebP packaging contract

**Files:**
- Modify: `client/tests/data-cockpit-prototype-skill.test.ts`
- Modify: `client/template-manifest.json`
- Modify: `client/src/resources/data-visualization-style-reference/visualization-style-prompts.md`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/01-cinematic-fui-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/02-holographic-lattice-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/03-enterprise-blue-ioc-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/04-photoreal-digital-twin-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/05-bright-natural-gis-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/06-new-chinese-oriental-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/07-minimal-glass-saas-4k.webp`
- Create: `client/src/resources/data-visualization-style-reference/assets/4k/08-data-decision-bi-4k.webp`
- Delete: the eight matching `*-4k.png` files after reference verification.
- Delete: `client/src/resources/data-visualization-style-reference/.DS_Store`
- Delete: `client/src/resources/data-visualization-style-reference/assets/.DS_Store`

**Interfaces:**
- Consumes: eight 3840×2160 PNG source images.
- Produces: eight same-resolution WebP files referenced by the central Markdown document.

- [ ] **Step 1: Add the failing asset contract**

Add a test that reads the Markdown and 4K directory:

```ts
const styleRoot = path.join(clientRoot, 'src/resources/data-visualization-style-reference');
const stylePrompts = fs.readFileSync(path.join(styleRoot, 'visualization-style-prompts.md'), 'utf8');
const fourKRoot = path.join(styleRoot, 'assets/4k');
const fourKFiles = fs.readdirSync(fourKRoot).sort();

expect(fourKFiles.filter((name) => name.endsWith('.webp'))).toHaveLength(8);
expect(fourKFiles.filter((name) => name.endsWith('.png'))).toEqual([]);
expect((stylePrompts.match(/assets%2F4k%2F[^)]+-4k\.webp/gu) ?? [])).toHaveLength(8);
expect(stylePrompts).not.toContain('-4k.png');

const totalBytes = fourKFiles
  .filter((name) => name.endsWith('.webp'))
  .reduce((total, name) => total + fs.statSync(path.join(fourKRoot, name)).size, 0);
expect(totalBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
```

Use ImageMagick's `identify` through a small cross-platform Node child-process call only if the existing test runtime supports it; otherwise verify dimensions in the execution and packaging QA commands rather than coupling Vitest to a global binary.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest --run tests/data-cockpit-prototype-skill.test.ts
```

Expected: FAIL because no 4K WebP assets exist and Markdown still references PNG.

- [ ] **Step 3: Encode the eight images**

For each exact source filename, run `cwebp` with the same basename and `.webp` extension:

```bash
cwebp -quiet -q 84 -m 6 -mt -metadata none INPUT.png -o OUTPUT.webp
```

If the aggregate exceeds 16 MB, lower the largest files in two-point quality steps down to 80. If visual comparison shows material artifacts, raise only the affected image to 86 and accept a documented size overage rather than harming selection.

- [ ] **Step 4: Verify every encoded file before removing PNG sources**

Run:

```bash
magick identify -format '%f %m %wx%h %b\n' client/src/resources/data-visualization-style-reference/assets/4k/*.webp
du -ch client/src/resources/data-visualization-style-reference/assets/4k/*.webp
```

Expected: eight `WEBP 3840x2160` rows and an aggregate near 12–16 MB.

- [ ] **Step 5: Build temporary visual comparison sheets**

Create fit-to-window and 100% crop comparisons under an ignored `.local/` directory while both source PNG and encoded WebP files are present. Compare every pair, checking gradients, small text blocks, thin borders, bloom, glass, PBR texture, and natural terrain.

- [ ] **Step 6: Update Markdown references and remove obsolete package files**

Change only the eight encoded 4K links from `.png` to `.webp`. Search the client tree for old references; when none remain, remove the exact eight 4K PNG files and both `.DS_Store` files.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest --run tests/data-cockpit-prototype-skill.test.ts
```

Expected: PASS for the eight-file, reference, mirror, and size contracts.

- [ ] **Step 8: Commit the optimized assets**

```bash
git add client/tests/data-cockpit-prototype-skill.test.ts client/src/resources/data-visualization-style-reference
git commit -m "perf: optimize cockpit style references"
```

### Task 4: Forward-test and visually verify the completed Skill

**Files:**
- Verify: `client/.agents/skills/generate-data-cockpit-prototype/`
- Verify: `client/.claude/skills/generate-data-cockpit-prototype/`
- Verify: `client/src/resources/data-visualization-style-reference/`
- Verify: `client/tests/data-cockpit-prototype-skill.test.ts`

**Interfaces:**
- Consumes: the completed Skill and optimized reference assets.
- Produces: behavioral, static, and visual verification evidence.

- [ ] **Step 1: Forward-test the no-input fallback**

Dispatch a fresh evaluator with the same智慧水务 request used in Task 1 and the updated Skill. Expected: three differentiated built-in directions, each containing a reference image, layout, central carrier, palette, rationale, and trade-off; no `DESIGN.md` selection.

- [ ] **Step 2: Forward-test user-input precedence**

Use this request:

```text
帮我做一个供应链控制塔。参考我提供的浅色玻璃风图片，主色必须是薄荷绿，中央是全球物流 GIS，左右分别是履约和风险。我不要深色科技风。
```

Expected: it treats the reference and explicit layout/colors as authoritative, uses built-in prompts only to fill missing structure, and does not force three unrelated built-in styles.

- [ ] **Step 3: Review the saved visual comparison sheets**

Review the comparison sheets created before source deletion and confirm that all eight pairs preserve the style-selection cues.

- [ ] **Step 4: Run complete verification**

Run:

```bash
pnpm exec vitest --run tests/data-cockpit-prototype-skill.test.ts tests/client-skill-mirroring.test.ts
python /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.agents/skills/generate-data-cockpit-prototype
python /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.claude/skills/generate-data-cockpit-prototype
git diff --check HEAD~3..HEAD
```

Expected: all tests and validations pass, diff check is clean, and no unrelated files are staged.

- [ ] **Step 5: Review final repository state**

Confirm:

```bash
git status --short
git log -4 --oneline
```

Expected: only pre-existing unrelated worktree changes remain; the design, test, Skill, and asset commits are visible as separate commits.
