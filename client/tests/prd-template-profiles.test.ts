import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesRoot = path.join(clientRoot, 'templates');
const agentWritePrdPath = path.join(clientRoot, '.agents/skills/write-prd/SKILL.md');
const claudeWritePrdPath = path.join(clientRoot, '.claude/skills/write-prd/SKILL.md');
const agentPlanPrdsPath = path.join(clientRoot, '.agents/skills/plan-prds/SKILL.md');
const claudePlanPrdsPath = path.join(clientRoot, '.claude/skills/plan-prds/SKILL.md');
const templateManifestPath = path.join(clientRoot, 'template-manifest.json');

function readTemplate(fileName: string): string {
  return fs.readFileSync(path.join(templatesRoot, fileName), 'utf8');
}

describe('PRD template profiles', () => {
  it('ships one scalable built-in PRD template', () => {
    const template = readTemplate('prd.md');
    const comprehensivePath = path.join(templatesRoot, 'prd-comprehensive-template.md');

    expect(fs.existsSync(comprehensivePath)).toBe(false);
    expect(template).toMatch(/^# PRD 模板$/mu);
    expect(template).toContain('标题标有“（可选）”的章节按需使用，其余章节默认保留。');
    expect(template.match(/^## .+$/gmu)).toEqual([
      '## 文档目录与关联文档（可选）',
      '## 背景与问题',
      '## 目标与成功标准',
      '## 用户、角色与场景',
      '## 范围',
      '## 用户故事',
      '## 能力与信息架构（可选）',
      '## 数据模型（可选）',
      '## 业务规则',
      '## 权限与作用范围（可选）',
      '## 状态、异常与边界',
      '## 字段、内容与交互要求',
      '## 非功能要求（可选）',
      '## 验收标准与来源追溯',
      '## 风险与依赖（可选）',
      '## 开放问题',
    ]);
    expect(template).toContain('不要从页面表现推断数据库表、API Schema、外键或权限算法');
    expect(template).toContain('不补造指标');
    expect(template).toContain('来源编号、用户决策、原型或已有文档');
  });

  it('publishes only the unified built-in PRD template', () => {
    const manifest = JSON.parse(fs.readFileSync(templateManifestPath, 'utf8')) as {
      runtime: { files: string[] };
      resources: { files: string[] };
    };
    const unifiedEntries = manifest.runtime.files.filter(
      (filePath) => filePath === 'templates/prd.md',
    );

    expect(unifiedEntries).toHaveLength(1);
    expect(manifest.resources.files).not.toContain('src/resources/templates/prd-comprehensive-template.md');
    expect(manifest.resources.files).not.toContain('src/resources/templates/prd-template.md');
  });

  it('keeps write-prd focused on the unified or explicitly supplied template', () => {
    const agentSkill = fs.readFileSync(agentWritePrdPath, 'utf8');
    const claudeSkill = fs.readFileSync(claudeWritePrdPath, 'utf8');

    expect(agentSkill).toBe(claudeSkill);
    expect(agentSkill).toContain('统一内置模板');
    expect(agentSkill).toContain('templates/prd.md');
    expect(agentSkill).toContain('允许用户或项目指定其他模板文件');
    expect(agentSkill).not.toContain('prd-comprehensive-template.md');
    expect(agentSkill).not.toContain('src/resources/templates');
  });

  it('uses the unified template without built-in profile selection', () => {
    const agentSkill = fs.readFileSync(agentPlanPrdsPath, 'utf8');
    const claudeSkill = fs.readFileSync(claudePlanPrdsPath, 'utf8');

    expect(agentSkill).toBe(claudeSkill);
    expect(agentSkill).toContain('#### 记录 PRD 模板');
    expect(agentSkill).toContain('templates/prd.md');
    expect(agentSkill).toContain('用户明确指定其他模板时直接采用');
    expect(agentSkill).toContain('用户明确指定时可覆盖单个任务');
    expect(agentSkill).not.toContain('src/resources/templates');
    expect(agentSkill).not.toContain('确认 PRD 模板');
    expect(agentSkill).not.toContain('轻量 PRD');
    expect(agentSkill).not.toContain('完善型 PRD');
  });
});
