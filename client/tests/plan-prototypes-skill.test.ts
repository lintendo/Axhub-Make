import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillName = 'plan-prototypes';
const agentsRoot = path.join(clientRoot, '.agents/skills', skillName);
const claudeRoot = path.join(clientRoot, '.claude/skills', skillName);
const relativeFiles = ['SKILL.md', 'agents/openai.yaml'];

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('plan-prototypes skill', () => {
  it('ships matching skill packages with a narrow prototype-planning trigger', () => {
    for (const relativePath of relativeFiles) {
      expect(fs.existsSync(path.join(agentsRoot, relativePath)), `${relativePath} missing in .agents`).toBe(true);
      expect(fs.existsSync(path.join(claudeRoot, relativePath)), `${relativePath} missing in .claude`).toBe(true);
      expect(read(claudeRoot, relativePath)).toBe(read(agentsRoot, relativePath));
    }

    const skill = read(agentsRoot, 'SKILL.md');
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
    expect(frontmatter).toContain(`name: ${skillName}`);
    expect(frontmatter).toContain('description: Use when');
    expect(frontmatter).toContain('多个原型');
    expect(frontmatter).toContain('页面占位');
    expect(frontmatter).not.toContain('生成完整页面');

    const metadata = read(agentsRoot, 'agents/openai.yaml');
    expect(metadata).toContain('display_name: "PLAN 原型"');
    expect(metadata).toContain(`$${skillName}`);
  });

  it('defines the dialogue-first initialization boundary', () => {
    const skill = read(agentsRoot, 'SKILL.md');

    const mainFlow = '读取上下文 -> 产品需求对齐 -> DESIGN.md 候选与设计方向对齐';
    const branchMarker = '进入规划分支';
    expect(skill).toContain(mainFlow);
    expect(skill).toContain('主流程保持不变');
    expect(skill).toContain(branchMarker);
    expect(skill).toContain('未完成前置流程时不得进入规划分支');
    expect(skill.indexOf(mainFlow)).toBeLessThan(skill.indexOf(branchMarker));
    expect(skill).toContain('不在本技能中重复前置流程');
    expect(skill).toContain('先在对话中对齐初步方案');
    expect(skill).toContain('用户确认原型拆分');
    expect(skill).toContain('逐个确认每个原型的初始主规格');
    expect(skill).toContain('一次性创建全部原型的 HTML 主规格骨架');
    expect(skill).toContain('同时创建全部原型骨架');
    expect(skill).toContain('每个原型独立维护自己的规格文档');
    expect(skill).toContain('不创建 `PLAN.md`');
    expect(skill).toContain('不创建跨原型总规格');
    expect(skill).toContain('不生成完整页面');
    expect(skill).toContain('固定使用 `.spec/spec.html`');
    expect(skill).toContain('src/prototypes/<prototype-id>/.spec/spec.html');
    expect(skill).toContain('src/prototypes/<prototype-id>/index.tsx');
    expect(skill).toContain('#page=<page-id>');
  });

  it('defines the minimal page status and placeholder contract', () => {
    const skill = read(agentsRoot, 'SKILL.md');

    expect(skill).toContain('`[待完善]`');
    expect(skill).toContain('`[生成中]`');
    expect(skill).toContain('没有状态标记');
    expect(skill).toContain('页面标题和目录项');
    expect(skill).toContain('页面列表');
    expect(skill).toContain('执行批次');
    expect(skill).toContain('页面之间的关系');
    expect(skill).toContain('核心设计方向');
    expect(skill).toContain('简单占位提示');
  });

  it('hands later page generation back to the existing prototype workflow', () => {
    const skill = read(agentsRoot, 'SKILL.md');

    expect(skill).toContain('技能到此结束');
    expect(skill).toContain('建议用户为每个原型或批次新开一个对话');
    expect(skill).toContain('建议使用子代理');
    expect(skill).toContain('rules/requirements-alignment-guide.md');
    expect(skill).toContain('rules/prototype-development-guide.md');
    expect(skill).toContain('先读取目标原型的 `.spec/spec.html`');
    expect(skill).toContain('不要在当前技能中继续生成页面');
    expect(skill).toContain('创建完成的原型列表');
  });
});
