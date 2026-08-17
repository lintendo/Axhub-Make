# Canvas Workspace Output Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach canvas-context agents to prioritize durable project outputs, present them through native canvas nodes, ask only necessary questions, frame related multi-element outputs, and keep each progressive write valid.

**Architecture:** The two mirrored `canvas-workspace` skill trees own these reusable rules. One Vitest contract checks the `.agents` text while the existing mirror test ensures `.claude` is byte-identical; `canvas-read-write.md` retains the same clarification wording where it expands visual-marker handling.

**Tech Stack:** Markdown skills, Vitest 4, Excalidraw JSON, pnpm.

## Global Constraints

- Do not constrain how many questions an agent may ask; state only that questions must be necessary.
- For each new flowchart or other output made of related elements, create one unique Frame first, assign every related element its `frameId`, and verify the Frame bounds and references after writing.
- Permit progressive writes only as a way to reduce waiting; every write must be complete, parseable Excalidraw JSON.
- Do not prescribe task thresholds, placeholder shapes, or batches.
- Route documents, prototypes, and images to native project resources before canvas placement; do not name their production skills in `canvas-workspace`.
- Use embedded document/prototype nodes and image nodes instead of simulating long documents or UI with ordinary Excalidraw elements.
- Give every generated Frame a meaningful name; when the content already has a visible container, keep the Frame border and background transparent.
- Keep `.agents` and `.claude` canvas-workspace files byte-identical.
- Do not commit from the current dirty submodule.

---

### Task 1: Define the revised skill contract

**Files:**
- Modify: `client/tests/client-skill-mirroring.test.ts`

**Interfaces:**
- Consumes: the `.agents/skills/canvas-workspace` skill and its `canvas-read-write.md` reference.
- Produces: assertions for necessary-question wording, one-Frame related outputs, progressive-write purpose, and complete-JSON gate.

- [x] **Step 1: Replace obsolete clarification assertions**

Change the canvas-workspace test to require these phrases and reject the previous numeric wording:

```ts
expect(skill).toContain('才询问必要问题');
expect(skill).not.toContain('问题数量不设限制');
expect(skill).toContain('先创建一个唯一的 Frame');
expect(skill).toContain('较长任务可渐进式写入以减少用户等待');
expect(skill).toContain('每次写入都必须保持完整、可解析的 Excalidraw JSON');
expect(reference).toContain('才询问必要问题');
expect(reference).not.toContain('问题数量不设限制');
```

- [x] **Step 2: Confirm the contract fails before the skill change**

Run from `client/`:

```bash
pnpm exec vitest run tests/client-skill-mirroring.test.ts
```

Expected: FAIL because the current skill still says `问题数量不设限制` and lacks the new Frame and progressive-write rules.

### Task 2: Apply the smallest mirrored skill update

**Files:**
- Modify: `client/.agents/skills/canvas-workspace/SKILL.md`
- Modify: `client/.claude/skills/canvas-workspace/SKILL.md`
- Modify: `client/.agents/skills/canvas-workspace/references/canvas-read-write.md`
- Modify: `client/.claude/skills/canvas-workspace/references/canvas-read-write.md`

**Interfaces:**
- Consumes: the Task 1 contract.
- Produces: matching, concise rules without procedural constraints for long tasks.

- [x] **Step 1: Simplify necessary-question wording**

Use `才询问必要问题` in the main skill’s generic and context-operation decision rules, and in the visual-marker reference. Remove all `问题数量不设限制` text.

- [x] **Step 2: Add output completion rules to each SKILL.md**

Add only these semantics in `## 默认规则`:

```md
- 流程图及其他由多个相关元素组成的新产物先创建一个唯一的 Frame，再让所有相关元素通过同一个 `frameId` 归属该 Frame，并检查 Frame 边界与引用。
- 较长任务可渐进式写入以减少用户等待；每次写入都必须保持完整、可解析的 Excalidraw JSON，并保留文件中的其他有效字段。
```

Do not add placeholder, batch, ordering, or threshold instructions.

- [x] **Step 3: Confirm the focused test passes**

Run the Task 1 command again. Expected: PASS, including the full tree mirror comparison.

### Task 3: Validate the distributable skills

**Files:**
- Review: all Task 1-2 files and this plan/spec.

**Interfaces:**
- Consumes: the updated skill mirrors.
- Produces: structurally valid and synchronized skill packages.

- [x] **Step 1: Validate both skill folders and mirrored files**

Run:

```bash
python3 /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.agents/skills/canvas-workspace
python3 /Users/jianzhoulin/.codex/skills/.system/skill-creator/scripts/quick_validate.py client/.claude/skills/canvas-workspace
cmp -s client/.agents/skills/canvas-workspace/SKILL.md client/.claude/skills/canvas-workspace/SKILL.md
cmp -s client/.agents/skills/canvas-workspace/references/canvas-read-write.md client/.claude/skills/canvas-workspace/references/canvas-read-write.md
```

Expected: both validators report `Skill is valid!`; all comparisons exit 0.

- [x] **Step 2: Run production checks and inspect the scoped diff**

Run from `apps/axhub-make/`:

```bash
pnpm server:build
pnpm admin:build
git diff --check -- client/.agents/skills/canvas-workspace client/.claude/skills/canvas-workspace client/tests/client-skill-mirroring.test.ts docs/superpowers/specs/2026-08-05-canvas-context-action-prompt-boundary-design.md docs/superpowers/plans/2026-08-05-canvas-workspace-output-rules.md
```

Expected: both builds exit 0; the scoped diff has no whitespace errors.
