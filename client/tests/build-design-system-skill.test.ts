import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentRoot = path.join(clientRoot, '.agents/skills/build-design-system');
const claudeRoot = path.join(clientRoot, '.claude/skills/build-design-system');
const relativeFiles = [
  'SKILL.md',
  'agents/openai.yaml',
  'assets/SOURCES.md',
  'assets/PLAN.md',
  'references/source-handlers.md',
  'references/theme-output-contract.md',
];

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('build-design-system skill', () => {
  it('ships matching skill packages with broad theme discovery and narrow outputs', () => {
    for (const relativePath of relativeFiles) {
      expect(fs.existsSync(path.join(agentRoot, relativePath)), `${relativePath} missing in .agents`).toBe(true);
      expect(fs.existsSync(path.join(claudeRoot, relativePath)), `${relativePath} missing in .claude`).toBe(true);
      expect(read(agentRoot, relativePath)).toBe(read(claudeRoot, relativePath));
    }

    const skill = read(agentRoot, 'SKILL.md');
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
    const frontmatterKeys = frontmatter
      .split('\n')
      .map((line) => line.match(/^([a-z][a-z0-9_-]*):/u)?.[1])
      .filter(Boolean);

    expect(frontmatterKeys).toEqual(['name', 'description']);
    expect(frontmatter).toContain('name: build-design-system');
    expect(frontmatter).toContain('description: Use when');
    for (const trigger of [
      '主题',
      'theme',
      '设计系统',
      'design system',
      '视觉规范',
      'visual specification',
      'DESIGN.md',
      'design tokens',
      'create',
      'update',
      'import',
      'extract',
      'reconstruct',
      'webpages',
      'Axure',
      'Figma',
      'screenshots',
      'prototypes',
      'existing theme files',
    ]) {
      expect(frontmatter).toContain(trigger);
    }

    const metadata = read(agentRoot, 'agents/openai.yaml');
    expect(metadata).toContain('display_name: "构建设计系统"');
    expect(metadata).toContain('$build-design-system');
    expect(metadata).not.toContain('icon_small');
    expect(metadata).not.toContain('icon_large');
  });

  it('plans sources and follow-up work while completing phase one in the same workflow', () => {
    const skill = read(agentRoot, 'SKILL.md');

    expect(skill).toContain('# 构建设计系统');
    expect(skill).toContain('references/source-handlers.md');
    expect(skill).toContain('references/theme-output-contract.md');
    expect(skill).toContain('SOURCES.md');
    expect(skill).toContain('PLAN.md');
    expect(skill).toContain('同一次执行');
    expect(skill).toContain('一期');
    expect(skill).toContain('组件任务');
    expect(skill).toContain('模板任务');
    expect(skill).toContain('不要转交给其他写作技能');
    expect(skill).toContain('不要创建 `PROJECT.md`');
    expect(skill).toContain('先改 `DESIGN.md`');
    expect(skill).toContain('再同步派生文件');
    expect(skill).toContain('完成验证后');
  });

  it('defines evidence-safe handlers for webpages, Axure, Figma, screenshots, and existing themes', () => {
    const handlers = read(agentRoot, 'references/source-handlers.md');

    expect(handlers).toContain('| 网站链接 |');
    expect(handlers).toContain('| Axure |');
    expect(handlers).toContain('| Figma |');
    expect(handlers).toContain('| 截图和图片 |');
    expect(handlers).toContain('| 现有原型和主题 |');
    expect(handlers).toContain('extract-axure-data');
    expect(handlers).toContain('Agent 自带的 Figma 工具或 Figma MCP');
    expect(handlers).toContain('普通网页浏览不能替代');
    expect(handlers).toContain('`阻塞`');
    expect(handlers).toContain('反馈用户');
    expect(handlers).toContain('Chrome CDP');
    expect(handlers).toContain('Bridge');
    expect(handlers).toContain('不索取或持久化用户密码');
    expect(handlers).toContain('.local/theme-capture-<theme-key>/');
    expect(handlers).toContain('getComputedStyle');
    expect(handlers).toContain('computed-tokens.json');
    expect(handlers).toContain('scripts/capture-theme-homepage.mjs');
    expect(handlers).toContain('networkidle');
    expect(handlers).toContain('theme.json.source');
    expect(handlers).toContain('采集日期');
    expect(handlers).toContain('已观察事实');
    expect(handlers).toContain('合理推断');
    expect(handlers).toContain('待用户确认');
    expect(handlers).toContain('不能用行业惯例补造');
  });

  it('provides durable source and task templates without a product control document', () => {
    const sources = read(agentRoot, 'assets/SOURCES.md');
    const plan = read(agentRoot, 'assets/PLAN.md');

    expect(sources).toContain('# 主题来源清单');
    expect(sources).toContain('## 来源总表');
    expect(sources).toContain('来源 ID');
    expect(sources).toContain('访问条件');
    expect(sources).toContain('覆盖范围');
    expect(sources).toContain('处理状态');
    expect(sources).toContain('证据属性');
    expect(sources).toContain('## 页面与视图证据');
    expect(sources).toContain('## 图片、设计稿与文档');
    expect(sources).toContain('## 来源缺口与冲突');
    expect(sources).toContain('解除条件');

    expect(plan).toContain('# 设计系统任务计划');
    for (const heading of ['## 状态定义', '## 执行阶段', '## 一期主题任务', '## 组件任务', '## 模板任务', '## 执行入口']) {
      expect(plan).toContain(heading);
    }
    for (const status of ['待确认', '待执行', '执行中', '待验收', '已完成', '阻塞']) {
      expect(plan).toContain(status);
    }
    expect(plan).toContain('来源 ID');
    expect(plan).toContain('依赖任务');
    expect(plan).toContain('验收标准');
    expect(plan).toContain('| 任务 ID | 阶段 | 类别 | 任务 |');
    expect(plan).toContain('无障碍要求');
    expect(plan).toContain('Radix');
    expect(plan).toContain('默认技术候选，不是强制依赖');
    expect(plan).toContain('一期默认不实现组件和模板');

    expect(fs.existsSync(path.join(agentRoot, 'assets/PROJECT.md'))).toBe(false);
    expect(fs.existsSync(path.join(claudeRoot, 'assets/PROJECT.md'))).toBe(false);
  });

  it('preserves the complete existing theme output and acceptance contract', () => {
    const contract = read(agentRoot, 'references/theme-output-contract.md');

    for (const output of ['DESIGN.md', 'theme.json', 'assets/tokens.json', 'preview.html', 'tw.css', 'implementations/react/index.tsx']) {
      expect(contract).toContain(output);
    }
    for (const section of [
      '视觉主题与氛围',
      '色彩系统',
      '字体系统',
      '组件规范',
      '布局与间距',
      '深度、阴影与边框',
      '动效',
      '响应式行为',
      'Prompt guide',
    ]) {
      expect(contract).toContain(section);
    }
    expect(contract).toContain('src/themes/linear/');
    expect(contract).toContain('getdesign.md');
    expect(contract).toContain('styles.refero.design');
    expect(contract).toContain('scripts/collect-design-md-batch.mjs');
    expect(contract).toContain('scripts/generate-design-md-theme-pages.mjs');
    expect(contract).toContain('scripts/review-design-md-theme-pages.mjs');
    expect(contract).toContain('@import "tailwindcss";');
    expect(contract).toContain('DesignMdBatchShowcase');
    expect(contract).toContain('主题内相对路径');
    expect(contract).toContain('scripts/check-app-ready.mjs');
    expect(contract).toContain('用户当前明确修改意图优先');
    expect(contract).toContain('来源证据优先级遵循 `references/source-handlers.md`');
    expect(contract).not.toContain('用户当前消息或附件的优先级高于已有文件');
    expect(contract).not.toContain('用户当前明确要求、附件、截图和链接');
  });
});
