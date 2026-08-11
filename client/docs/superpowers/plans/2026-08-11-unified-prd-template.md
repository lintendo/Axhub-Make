# Unified PRD Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two built-in PRD profiles with one scalable template whose optional sections are explicitly marked.

**Architecture:** Keep `prd-template.md` as the only built-in template entry, merge the comprehensive profile's useful sections into it, and mark only optional headings with `（可选）`. Remove profile selection from planning while preserving explicit custom-template overrides and the existing `.agents`/`.claude` mirrors.

**Tech Stack:** Markdown skill files and templates, JSON template manifest, Vitest 4.

## Global Constraints

- Use pnpm for repository development and verification.
- Preserve unrelated uncommitted changes, including the resource asset-path update in `write-prd` and existing `template-manifest.json` edits.
- Existing PRD documents are not migrated or rewritten.
- Do not add a compatibility alias for `prd-comprehensive-template.md`.
- Headings marked `（可选）` are optional; all other template headings remain the default structure.

---

### Task 1: Consolidate the built-in PRD template contract

**Files:**
- Modify: `client/tests/prd-template-profiles.test.ts`
- Modify: `client/src/resources/templates/prd-template.md`
- Delete: `client/src/resources/templates/prd-comprehensive-template.md`
- Modify: `client/.agents/skills/plan-prds/SKILL.md`
- Modify: `client/.claude/skills/plan-prds/SKILL.md`
- Modify: `client/.agents/skills/write-prd/SKILL.md`
- Modify: `client/.claude/skills/write-prd/SKILL.md`
- Modify: `client/template-manifest.json`

**Interfaces:**
- Consumes: the existing PRD planning and writing skill contract.
- Produces: one built-in template path, `src/resources/templates/prd-template.md`, plus unchanged support for explicit custom template paths.

- [ ] **Step 1: Replace profile tests with the unified-template contract**

Update `client/tests/prd-template-profiles.test.ts` so it asserts:

```ts
it('ships one scalable built-in PRD template', () => {
  const template = readTemplate('prd-template.md');
  const comprehensivePath = path.join(templatesRoot, 'prd-comprehensive-template.md');

  expect(fs.existsSync(comprehensivePath)).toBe(false);
  expect(template).toMatch(/^# PRD 模板$/mu);
  expect(template).toContain('标题标有“（可选）”的章节按需使用，其余章节默认保留。');
  for (const heading of [
    '## 背景与问题',
    '## 目标与成功标准',
    '## 用户、角色与场景',
    '## 范围',
    '## 用户故事',
    '## 业务规则',
    '## 状态、异常与边界',
    '## 字段、内容与交互要求',
    '## 验收标准与来源追溯',
    '## 开放问题',
  ]) {
    expect(template).toContain(heading);
  }
  for (const heading of [
    '## 文档目录与关联文档（可选）',
    '## 能力与信息架构（可选）',
    '## 数据模型（可选）',
    '## 权限与作用范围（可选）',
    '## 非功能要求（可选）',
    '## 风险与依赖（可选）',
  ]) {
    expect(template).toContain(heading);
  }
});

it('uses the unified template without built-in profile selection', () => {
  const agentSkill = fs.readFileSync(agentPlanPrdsPath, 'utf8');
  const claudeSkill = fs.readFileSync(claudePlanPrdsPath, 'utf8');

  expect(agentSkill).toBe(claudeSkill);
  expect(agentSkill).toContain('src/resources/templates/prd-template.md');
  expect(agentSkill).toContain('用户明确指定其他模板时直接采用');
  expect(agentSkill).toContain('用户明确指定时可覆盖单个任务');
  expect(agentSkill).not.toContain('确认 PRD 模板');
  expect(agentSkill).not.toContain('轻量 PRD');
  expect(agentSkill).not.toContain('完善型 PRD');
  expect(agentSkill).not.toContain('prd-comprehensive-template.md');
});

it('keeps write-prd focused on the unified or explicitly supplied template', () => {
  const agentSkill = fs.readFileSync(agentWritePrdPath, 'utf8');
  const claudeSkill = fs.readFileSync(claudeWritePrdPath, 'utf8');

  expect(agentSkill).toBe(claudeSkill);
  expect(agentSkill).toContain('src/resources/templates/prd-template.md');
  expect(agentSkill).toContain('允许用户或项目指定其他模板文件');
  expect(agentSkill).not.toContain('prd-comprehensive-template.md');
});
```

Also read `client/template-manifest.json` in the test and assert that its resource file list contains `src/resources/templates/prd-template.md` exactly once and does not contain `src/resources/templates/prd-comprehensive-template.md`.

- [ ] **Step 2: Run the focused test and verify the old two-profile contract fails**

Run:

```bash
pnpm --dir client exec vitest --run tests/prd-template-profiles.test.ts
```

Expected: FAIL because the comprehensive template still exists, optional headings are absent, and `plan-prds` still contains the profile-selection section.

- [ ] **Step 3: Replace the lightweight template with the unified scalable template**

Update `client/src/resources/templates/prd-template.md` to use this exact section order:

```markdown
# PRD 模板

标题标有“（可选）”的章节按需使用，其余章节默认保留。

## 文档目录与关联文档（可选）
## 背景与问题
## 目标与成功标准
## 用户、角色与场景
## 范围
### 本次包含
### 不在本次范围
## 用户故事
## 能力与信息架构（可选）
## 数据模型（可选）
## 业务规则
## 权限与作用范围（可选）
## 状态、异常与边界
## 字段、内容与交互要求
## 非功能要求（可选）
## 验收标准与来源追溯
## 风险与依赖（可选）
## 开放问题
```

Use the already-approved comprehensive descriptions under each heading, retain the user-story examples from the lightweight template, and keep the optional-section guidance to the single sentence shown above.

- [ ] **Step 4: Remove built-in profile selection from the mirrored skills**

In both `plan-prds/SKILL.md` mirrors, replace `#### 确认 PRD 模板` with the concise default rule:

```markdown
#### 记录 PRD 模板

未指定模板时统一使用 `src/resources/templates/prd-template.md`。用户明确指定其他模板时直接采用；同一计划默认共用一个模板，用户明确指定时可覆盖单个任务。
```

Keep `PRD 模板` in the plan confirmation list and continue passing the selected template to `write-prd`. In both `write-prd/SKILL.md` mirrors, retain the current custom-template support and asset-path wording while describing `prd-template.md` as the unified default template.

- [ ] **Step 5: Delete the retired template and remove its manifest entry**

Delete `client/src/resources/templates/prd-comprehensive-template.md`. Remove only this array item from `client/template-manifest.json`, preserving all unrelated manifest edits:

```json
"src/resources/templates/prd-comprehensive-template.md",
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --dir client exec vitest --run tests/prd-template-profiles.test.ts tests/client-skill-mirroring.test.ts
```

Expected: both test files PASS and the `.agents`/`.claude` skill mirrors remain byte-identical.

- [ ] **Step 7: Scan references and validate the diff**

Run:

```bash
rg -n "prd-comprehensive-template|轻量 PRD|完善型 PRD|确认 PRD 模板" client/.agents/skills/plan-prds client/.claude/skills/plan-prds client/.agents/skills/write-prd client/.claude/skills/write-prd client/src/resources/templates client/template-manifest.json client/tests/prd-template-profiles.test.ts
git diff --check -- client/.agents/skills/plan-prds/SKILL.md client/.claude/skills/plan-prds/SKILL.md client/.agents/skills/write-prd/SKILL.md client/.claude/skills/write-prd/SKILL.md client/src/resources/templates client/template-manifest.json client/tests/prd-template-profiles.test.ts
```

Expected: `rg` returns no matches and `git diff --check` returns no output.

- [ ] **Step 8: Commit the implementation**

```bash
git add client/.agents/skills/plan-prds/SKILL.md client/.claude/skills/plan-prds/SKILL.md client/.agents/skills/write-prd/SKILL.md client/.claude/skills/write-prd/SKILL.md client/src/resources/templates/prd-template.md client/src/resources/templates/prd-comprehensive-template.md client/template-manifest.json client/tests/prd-template-profiles.test.ts
git commit -m "docs: unify built-in PRD template"
```
