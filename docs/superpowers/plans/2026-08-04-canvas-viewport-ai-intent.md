# Canvas Viewport AI Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas viewport AI classify edit, add, or unclear intent before changing the active `.excalidraw` file.

**Architecture:** The one-click prompt owns request-specific intent priority and removes the fixed right/down placement bias. The mirrored `canvas-workspace` skill and file-editing reference define the reusable visual-mark interpretation, obstruction-based cleanup, and Excalidraw relationship repair rules.

**Tech Stack:** TypeScript 5, Vitest 4, Markdown skills, Excalidraw JSON, pnpm.

## Global Constraints

- Preserve the no-MCP direct-file viewport flow.
- Classify intent as `edit`, `add`, or `unclear` before writing.
- For `edit`, modify the original target structure in place.
- For `add`, choose any nearby non-overlapping direction from geometry, semantics, and reading order.
- Ask clarification questions only for genuine ambiguity; do not impose a numeric question limit.
- Remove only operation marks that obstruct formal content or make the finished diagram ambiguous.
- Preserve non-obstructing explanatory text and unrelated freeform elements.
- Keep `.agents` and `.claude` skill trees byte-identical.
- Do not commit from the current dirty submodule.

---

### Task 1: Replace fixed placement with intent classification

**Files:**
- Modify: `src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts`
- Modify: `src/index/domains/ai-generation/canvasViewportAiPrompt.ts`

**Interfaces:**
- Produces: `buildCanvasViewportAiPrompt(...)` with `edit`/`add`/`unclear` behavior.

- [x] **Step 1: Write the failing prompt assertions**

Replace the fixed-placement assertions with the intent contract:

```ts
expect(prompt).toContain('编辑、新增或不明确');
expect(prompt).toContain('原位修改');
expect(prompt).toContain('上下左右');
expect(prompt).toContain('遮挡正式节点、文字或连线');
expect(prompt).toContain('保留不遮挡的说明文字');
expect(prompt).toContain('问题数量不设限制');
expect(prompt).not.toContain('右侧不足时放在下方');
expect(prompt).not.toContain('一个简短的澄清问题');
```

Keep existing assertions for target path, viewport metadata, valid JSON, file re-read, and no MCP.

- [x] **Step 2: Run the prompt test and confirm RED**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts`

Expected: FAIL because the prompt still forces right/down placement and limits clarification to one question.

- [x] **Step 3: Implement the three-mode prompt recipe**

Replace the generic inference and fixed-placement lines with explicit positive recipes:

```ts
'先结合截图和目标文件判断用户意图属于编辑、新增或不明确。手绘圈选、指向箭头、划线和邻近说明文字都是意图线索，但不能只按元素类型判断。',
'若为编辑：定位被指向的已有元素，在原位修改目标节点、文字、分支、连线或关系；允许按意图更新、删除、重连或重排目标结构，同时保留无关内容。',
'若为新增：把新增内容放在相关内容附近，根据可用空白、语义关系和阅读顺序，从上下左右选择合理且不重叠的位置。',
'若意图或目标不明确：向用户询问澄清所需的问题，问题数量不设限制，但只问无法从截图和文件可靠推断的信息，并尽量合并相关问题；澄清前不要猜测性写入。',
'完成后只清理遮挡正式节点、文字或连线，或会让结果产生歧义的操作标记；保留不遮挡的说明文字，不得仅按 freedraw、arrow 或 text 类型批量删除。',
```

Do not change the existing file-only, re-read, JSON validity, unique-ID, or status-element constraints.

- [x] **Step 4: Run the prompt test and confirm GREEN**

Run: `pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts`

Expected: the prompt test passes.

### Task 2: Teach the mirrored canvas skill the same intent contract

**Files:**
- Modify: `client/tests/client-skill-mirroring.test.ts`
- Modify: `client/.agents/skills/canvas-workspace/SKILL.md`
- Modify: `client/.claude/skills/canvas-workspace/SKILL.md`
- Modify: `client/.agents/skills/canvas-workspace/references/canvas-read-write.md`
- Modify: `client/.claude/skills/canvas-workspace/references/canvas-read-write.md`

**Interfaces:**
- Produces: a reusable skill recipe for intent classification and safe cleanup.
- Preserves: byte-identical `.agents` and `.claude` copies.

- [x] **Step 1: Write the failing skill contract test**

Add a focused test after the existing mirror test:

```ts
it('teaches canvas agents to distinguish edits from additions before writing', () => {
  const skill = fs.readFileSync(
    path.join(clientRoot, '.agents/skills/canvas-workspace/SKILL.md'),
    'utf8',
  );
  const reference = fs.readFileSync(
    path.join(clientRoot, '.agents/skills/canvas-workspace/references/canvas-read-write.md'),
    'utf8',
  );

  expect(skill).toContain('编辑、新增或不明确');
  expect(skill).toContain('上下左右');
  expect(skill).toContain('只清理遮挡');
  expect(skill).toContain('问题数量不设限制');
  expect(reference).toContain('不能仅按 `freedraw`、`arrow` 或 `text`');
  expect(reference).toContain('修复连接关系');
});
```

- [x] **Step 2: Run the client skill test and confirm RED**

Run from `client/`: `pnpm exec vitest run tests/client-skill-mirroring.test.ts`

Expected: the new intent assertions fail while the existing mirror assertion remains green.

- [x] **Step 3: Add the minimal reusable skill guidance**

Add a concise `## 视口意图处理` section to both `SKILL.md` files:

```md
## 视口意图处理

先结合截图与当前 `.excalidraw` 文件，把用户意图判断为编辑、新增或不明确，再写入：

- 编辑：标记或说明指向已有元素时，原位修改目标节点、文字、分支、连线或关系。
- 新增：用户明确要求补充内容时，根据空白、语义关系和阅读顺序，在相关内容上下左右的合理位置放置，避免重叠。
- 不明确：只有无法从截图和文件可靠判断时才提问；问题数量不设限制，但只问完成判断所需的信息。

视觉标记只是证据，不能按元素类型直接判定。完成后只清理遮挡正式内容或导致结果歧义的操作标记；保留不遮挡的说明文字和无关手绘内容。
```

Add a detailed `## 按视觉标记编辑原图` section to both `canvas-read-write.md` files. Require geometry/text/binding evidence, in-place updates, version-field updates, connection repair, obstruction-based deletion, and no bulk deletion by element type.

- [x] **Step 4: Run the client skill test and confirm GREEN**

Run from `client/`: `pnpm exec vitest run tests/client-skill-mirroring.test.ts`

Expected: both the new behavior test and full mirror test pass.

### Task 3: Validate the prompt and skill together

**Files:**
- Review all Task 1-2 files.

- [x] **Step 1: Run focused behavior tests**

Run from `apps/axhub-make/`:

```bash
pnpm exec vitest run \
  src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts \
  src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts
```

Run from `apps/axhub-make/client/`:

```bash
pnpm exec vitest run tests/client-skill-mirroring.test.ts
```

Expected: all selected tests pass.

- [x] **Step 2: Validate both mirrored skill folders**

Run:

```bash
python3 /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.agents/skills/canvas-workspace
python3 /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.claude/skills/canvas-workspace
```

Expected: both validations report success.

- [x] **Step 3: Inspect the scoped diff**

Run `git diff --check` for all Task 1-2 files. Confirm the old fixed right/down and one-question rules are absent, the no-MCP rule remains, and both skill copies are identical.

### Task 4: Resume the browser timing plan

**Files:**
- Continue: `docs/superpowers/plans/2026-08-04-canvas-viewport-ai-browser-timing.md`

- [x] **Step 1: Return to the paused timing RED/GREEN cycle**

Run the already-created helper test, finish Tasks 1-4 of the timing plan, and include both feature sets in the final focused regression and production build verification.
