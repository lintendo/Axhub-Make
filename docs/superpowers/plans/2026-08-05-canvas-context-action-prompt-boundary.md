# Canvas Context Action Prompt Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace trigger-position wording and duplicated runtime instructions with a stable “画布上下文操作” contract owned by `$canvas-workspace`.

**Architecture:** `buildCanvasViewportAiPrompt` selects the named skill workflow and serializes only request-specific context. The mirrored `canvas-workspace` skill owns intent classification, direct-file tool policy, clarification, cleanup, and Excalidraw integrity rules; its reference retains field-level editing details.

**Tech Stack:** TypeScript 5, Vitest 4, Markdown skills, Excalidraw JSON, pnpm.

## Global Constraints

- Name the agent-facing scene “画布上下文操作”.
- Define the scene by target `.excalidraw` file plus the user’s current canvas screenshot/view context, never by button position or trigger mechanism.
- Keep internal `canvas-viewport` identifiers unchanged.
- Keep the runtime prompt limited to the scene name, `$canvas-workspace` reference, and dynamic request context.
- Preserve all existing intent, clarification, direct-file, no-MCP, cleanup, re-read, JSON integrity, unique-ID, and relationship-repair rules in the skill.
- Keep `.agents` and `.claude` skill copies byte-identical.
- Do not commit from the current dirty submodule.

---

### Task 1: Make the runtime prompt a thin skill invocation

**Files:**
- Modify: `src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts`
- Modify: `src/index/domains/ai-generation/canvasViewportAiPrompt.ts`

**Interfaces:**
- Consumes: `canvasFilePath`, `viewportRect`, and `visibleElementIds` already accepted by `buildCanvasViewportAiPrompt`.
- Produces: a compact prompt that invokes `$canvas-workspace` and passes only dynamic canvas context.

- [x] **Step 1: Write the failing prompt contract**

Replace detailed-rule assertions with this boundary contract:

```ts
expect(prompt).toContain('画布上下文操作');
expect(prompt).toContain('使用 $canvas-workspace 技能');
expect(prompt).toContain('当前画布截图已随请求作为图片附件提供');
expect(prompt).toContain('src/resources/flows/home.excalidraw');
expect(prompt).toContain('"x":100');
expect(prompt).toContain('visible-a');
expect(prompt).not.toContain('画布底部');
expect(prompt).not.toContain('编辑、新增或不明确');
expect(prompt).not.toContain('不得调用任何 MCP');
expect(prompt).not.toContain('重新读取目标文件');
expect(prompt).not.toContain('遮挡正式节点、文字或连线');
```

- [x] **Step 2: Run the prompt test and confirm RED**

Run:

```bash
pnpm exec vitest run src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts
```

Expected: FAIL because the current prompt names a bottom button and repeats skill-owned rules.

- [x] **Step 3: Implement the minimal prompt recipe**

Keep input normalization unchanged and replace the returned lines with:

```ts
return [
  '任务：画布上下文操作。',
  '使用 $canvas-workspace 技能，并按其中的“画布上下文操作”规则执行。',
  canvasFilePath ? `目标画布文件：${canvasFilePath}。` : '',
  viewportRect ? `当前视图范围（画布坐标系）：${JSON.stringify(viewportRect)}。` : '',
  visibleElementIds.length > 0 ? `当前可见元素 ID：${visibleElementIds.join(', ')}。` : '',
  '当前画布截图已随请求作为图片附件提供，表示用户当前看到的内容。',
].filter(Boolean).join('\n\n');
```

- [x] **Step 4: Run the prompt test and confirm GREEN**

Run the Task 1 command again. Expected: the prompt test passes.

### Task 2: Make the skill own and discover the complete scene

**Files:**
- Modify: `client/tests/client-skill-mirroring.test.ts`
- Modify: `client/.agents/skills/canvas-workspace/SKILL.md`
- Modify: `client/.claude/skills/canvas-workspace/SKILL.md`
- Modify: `client/.agents/skills/canvas-workspace/references/canvas-read-write.md`
- Modify: `client/.claude/skills/canvas-workspace/references/canvas-read-write.md`

**Interfaces:**
- Consumes: the prompt’s explicit `$canvas-workspace` invocation and dynamic scene context.
- Produces: one stable `## 画布上下文操作` workflow with complete reusable behavior.

- [x] **Step 1: Write the failing skill contract**

Extend the existing canvas skill test:

```ts
expect(skill).toContain('## 画布上下文操作');
expect(skill).toContain('指定的 `.excalidraw` 目标文件');
expect(skill).toContain('用户当前看到的画布截图');
expect(skill).toContain('写入前重新读取');
expect(skill).toContain('完整、可解析的 Excalidraw JSON');
expect(skill).not.toContain('画布底部');
expect(skill).not.toContain('AI 按钮');
expect(reference).toContain('## 画布上下文操作中的视觉标记');
```

Keep assertions for edit/add/unclear intent, unlimited necessary questions, no MCP, obstruction-based cleanup, and connection repair.

- [x] **Step 2: Run the skill test and confirm RED**

Run from `client/`:

```bash
pnpm exec vitest run tests/client-skill-mirroring.test.ts
```

Expected: FAIL on the new stable name/input-contract assertions while the mirror assertion remains green.

- [x] **Step 3: Move the full workflow into both skill mirrors**

Update frontmatter descriptions to include requests that provide a target canvas file and current screenshot/view context. Rename `## 视口意图处理` to `## 画布上下文操作` and define the observable input contract before the rules.

The section must contain these behaviors without referring to any UI trigger:

```md
## 画布上下文操作

当任务同时提供指定的 `.excalidraw` 目标文件和用户当前看到的画布截图，并可能附带当前视图坐标或可见元素 ID 时，按本节执行。触发入口不影响处理方式。

- 直接读取并修改指定文件，不调用任何 MCP 或画布桥接工具。
- 写入前重新读取目标文件，只修改该文件，不创建替代文件或任务状态元素。
- 先结合截图与文件判断编辑、新增或不明确；编辑原位修改，新增加在相关空白位置，不明确时只问必要问题且不限制数量。
- 只清理遮挡正式内容或造成歧义的操作标记，保留不遮挡的说明和无关手绘内容。
- 写回完整、可解析的 Excalidraw JSON，保持唯一 ID、版本字段、绑定、容器、分组和连线关系有效。
```

Retain the more detailed intent bullets where they avoid ambiguity. In both references, rename `## 按视觉标记编辑原图` to `## 画布上下文操作中的视觉标记` and update its opening sentence to use the stable scene name.

- [x] **Step 4: Run the skill test and confirm GREEN**

Run the Task 2 command again. Expected: all client skill tests pass and the full mirror comparison remains green.

### Task 3: Validate the boundary and mirrored skill

**Files:**
- Review all Task 1-2 files plus the design and plan documents.

**Interfaces:**
- Consumes: the thin prompt and complete skill workflow.
- Produces: verified behavior without changing direct-run transport or internal source identifiers.

- [x] **Step 1: Run focused tests**

Run from `apps/axhub-make/`:

```bash
pnpm exec vitest run \
  src/index/domains/ai-generation/canvasViewportAiPrompt.test.ts \
  src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts \
  src/index/app/IndexPage.test.ts
```

Run from `apps/axhub-make/client/`:

```bash
pnpm exec vitest run tests/client-skill-mirroring.test.ts
```

Expected: all selected tests pass.

- [x] **Step 2: Validate skill folders and mirror equality**

Run:

```bash
python3 /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.agents/skills/canvas-workspace
python3 /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.claude/skills/canvas-workspace
cmp -s client/.agents/skills/canvas-workspace/SKILL.md client/.claude/skills/canvas-workspace/SKILL.md
cmp -s client/.agents/skills/canvas-workspace/references/canvas-read-write.md client/.claude/skills/canvas-workspace/references/canvas-read-write.md
```

Expected: both validators report `Skill is valid!` and both comparisons exit 0.

- [x] **Step 3: Run production checks**

Run:

```bash
pnpm server:build
pnpm admin:build
```

Expected: both builds exit 0; the existing Vite chunk-size warning is non-blocking.

- [x] **Step 4: Inspect the scoped diff**

Run `git diff --check` for tracked Task 1-2 files and `git diff --no-index --check /dev/null <file>` for new files. Confirm `画布底部` and `底部的 AI` are absent from the runtime prompt and both skill mirrors, detailed behavior phrases exist only in the skill/tests/docs, and internal `canvas-viewport` identifiers are unchanged.
