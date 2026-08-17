import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(__dirname, '..');

function listFiles(root: string, relativeDirectory = ''): string[] {
  const directory = path.join(root, relativeDirectory);

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? listFiles(root, relativePath) : [relativePath];
    })
    .sort();
}

describe('client skill mirrors', () => {
  it('keeps the .agents and .claude skill trees synchronized', () => {
    const agentsRoot = path.join(clientRoot, '.agents/skills');
    const claudeRoot = path.join(clientRoot, '.claude/skills');
    const agentsFiles = listFiles(agentsRoot);
    const claudeFiles = listFiles(claudeRoot);

    expect(claudeFiles).toEqual(agentsFiles);

    for (const relativePath of agentsFiles) {
      expect(fs.readFileSync(path.join(claudeRoot, relativePath))).toEqual(
        fs.readFileSync(path.join(agentsRoot, relativePath)),
      );
    }
  });

  it('documents the local-first search and bounded theme install contract', () => {
    const agents = fs.readFileSync(path.join(clientRoot, '.agents/skills/search-design-system/SKILL.md'), 'utf8');
    const response = fs.readFileSync(path.join(clientRoot, '.agents/skills/search-design-system/references/response-schema.md'), 'utf8');
    for (const text of [agents, response]) {
      expect(text).toContain('bundled');
      expect(text).toContain('spec-only');
    }
    expect(agents).toContain('design-knowledge/manifest.json');
    expect(agents).toContain('install');
    expect(agents).toContain('10 seconds');
    expect(agents).toContain('GitHub Pages');
    expect(agents).toContain('Gitee');
    expect(agents).not.toContain('默认使用 `scripts/cli.mjs search` 读取 Make-Template 的线上 manifest');
  });

  it('teaches prototype annotation skills to declare active foreground layers', () => {
    const skillPath = path.join('.agents/skills/prototype-annotation/SKILL.md');
    const referencePath = path.join(
      '.agents/skills/prototype-annotation/references/axhub-annotation.md',
    );
    const skill = fs.readFileSync(path.join(clientRoot, skillPath), 'utf8');
    const reference = fs.readFileSync(path.join(clientRoot, referencePath), 'utf8');

    expect(skill).toContain('presentation.layerSelectors');
    expect(skill).toContain('实际 DOM');
    expect(reference).toContain('"layerSelectors"');
    expect(reference).toContain('包含弹窗内容');
  });

  it('teaches canvas agents the context-action output rules', () => {
    const skill = fs.readFileSync(
      path.join(clientRoot, '.agents/skills/canvas-workspace/SKILL.md'),
      'utf8',
    );
    const reference = fs.readFileSync(
      path.join(
        clientRoot,
        '.agents/skills/canvas-workspace/references/canvas-read-write.md',
      ),
      'utf8',
    );

    expect(skill).toContain('编辑、新增或不明确');
    expect(skill).toContain('## 画布上下文操作');
    expect(skill).toContain('指定的 `.excalidraw` 目标文件');
    expect(skill).toContain('用户当前看到的画布截图');
    expect(skill).toContain('上下左右');
    expect(skill).toContain('只清理遮挡');
    expect(skill).toContain('才询问必要问题');
    expect(skill).not.toContain('问题数量不设限制');
    expect(skill).toContain('不调用任何 MCP');
    expect(skill).toContain('写入前重新读取');
    expect(skill).toContain('先创建一个唯一的 Frame');
    expect(skill).toContain('frameId');
    expect(skill).toContain('较长任务可渐进式写入以减少用户等待');
    expect(skill).toContain('每次写入都必须保持完整、可解析的 Excalidraw JSON');
    expect(skill).not.toContain('先问一个问题');
    expect(skill).not.toContain('画布底部');
    expect(skill).not.toContain('AI 按钮');
    expect(reference).toContain('## 画布上下文操作中的视觉标记');
    expect(reference).toContain('才询问必要问题');
    expect(reference).not.toContain('问题数量不设限制');
    expect(reference).toContain('不能仅按 `freedraw`、`arrow` 或 `text`');
    expect(reference).toContain('修复连接关系');
  });

  it('routes durable outputs before choosing their canvas presentation', () => {
    const skill = fs.readFileSync(
      path.join(clientRoot, '.agents/skills/canvas-workspace/SKILL.md'),
      'utf8',
    );
    const outputRoutingIndex = skill.indexOf('## 产物分流');
    const contextActionIndex = skill.indexOf('## 画布上下文操作');

    expect(outputRoutingIndex).toBeGreaterThan(-1);
    expect(contextActionIndex).toBeGreaterThan(-1);
    expect(outputRoutingIndex).toBeLessThan(contextActionIndex);
    expect(skill).toContain('项目内正式文档资源');
    expect(skill).toContain('以内嵌文档节点');
    expect(skill).toContain('不要把文档正文铺成普通画布文本');
    expect(skill).toContain('项目内可运行的原型');
    expect(skill).toContain('以内嵌预览节点');
    expect(skill).toContain('不要使用普通 Excalidraw 元素模拟页面 UI');
    expect(skill).toContain('可持久化的图片资源');
    expect(skill).toContain('以图片节点');
    expect(skill).toContain('流程图、关系图和对既有画布元素的修改');
    expect(skill).not.toContain('$write-prd');
    expect(skill).not.toContain('$screenshot-to-prototype');
    expect(skill).not.toContain('$ui-image-generation');
  });

  it('uses named frames as semantic groups without duplicating visible containers', () => {
    const skill = fs.readFileSync(path.join(clientRoot, '.agents/skills/canvas-workspace/SKILL.md'), 'utf8');
    const basics = fs.readFileSync(
      path.join(clientRoot, '.agents/skills/canvas-workspace/references/excalidraw-basics.md'),
      'utf8',
    );

    expect(skill).toContain('Frame 必须使用能够表达产物内容的名称');
    expect(skill).toContain('先创建一个唯一的 Frame');
    expect(skill).toContain('所有相关元素（包括文字、形状、连线和图片）都必须设置同一个 `frameId`');
    expect(skill).toContain('该 `frameId` 必须指向实际存在的 Frame');
    expect(skill).toContain('Frame 的边界必须覆盖所有相关元素');
    expect(skill).toContain('写入后检查 Frame 的子元素');
    expect(skill).toContain('不得留下没有 `frameId` 的相关元素');
    expect(skill).toContain('已有可见边框或视觉容器');
    expect(skill).toContain('Frame 的边框和背景保持透明');
    expect(skill).toContain('不要重复创建视觉外框');
    expect(basics).toContain('所有相关元素（包括文字、形状、连线和图片）都必须设置同一个 `frameId`');
    expect(basics).toContain('Frame 的边界必须覆盖所有相关元素');
  });
});
