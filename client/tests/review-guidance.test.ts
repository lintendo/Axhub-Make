import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRule(fileName: string): string {
  return fs.readFileSync(path.join(clientRoot, 'rules', fileName), 'utf8');
}

function readClientFile(filePath: string): string {
  return fs.readFileSync(path.join(clientRoot, filePath), 'utf8');
}

describe('client workflow guidance', () => {
  it('limits requirements alignment triggers to new pages and structural changes', () => {
    const alignmentGuide = readRule('requirements-alignment-guide.md');
    const triggerSection = alignmentGuide.match(/## 何时触发\n\n([\s\S]*?)\n\n## /u)?.[1] ?? '';
    const triggers = triggerSection.match(/^- /gmu) ?? [];

    expect(triggers).toHaveLength(2);
    expect(triggerSection).toContain('新建原型或为现有原型新增页面。');
    expect(triggerSection).toContain('明显重构信息架构、核心交互、页面流程或视觉方向。');
  });

  it('uses one current prototype main spec with HTML priority and bidirectional sync', () => {
    const alignmentGuide = readRule('requirements-alignment-guide.md');
    const developmentGuide = readRule('prototype-development-guide.md');
    const prototypeReviewGuide = readRule('prototype-review-guide.md');
    const mainSpecSection = alignmentGuide.match(/## 原型主规格\n\n([\s\S]*?)\n## /u)?.[1] ?? '';
    const questionSection = alignmentGuide.match(/## 提问规则\n\n([\s\S]*?)\n## /u)?.[1] ?? '';

    expect(alignmentGuide).toContain('读取上下文 -> 产品需求对齐 -> DESIGN.md 候选与设计方向对齐 -> 创建/更新主规格草案 -> 围绕主规格多轮评审与确认 -> 实现 -> 同步主规格 -> 提供预览链接 -> 验收');
    expect(alignmentGuide).toContain('需求与设计完成第一轮对齐后');
    expect(mainSpecSection.match(/^- /gmu)).toHaveLength(4);
    expect(mainSpecSection).toContain('`.spec/spec.html` 或 `.spec/spec.md`');
    expect(mainSpecSection).toContain('同时存在时以 HTML 为准');
    expect(mainSpecSection).toContain('Markdown（节省 Token）或 HTML（体验更好）');
    expect(mainSpecSection).toContain('只维护当前版本');
    expect(mainSpecSection).toContain('不复制 `DESIGN.md`');
    expect(mainSpecSection).toContain('确认前不得修改原型');
    expect(mainSpecSection).toContain('双向同步');
    expect(mainSpecSection).toContain('主规格缺失时先确认需求与设计已完成第一轮对齐，再创建草案');
    expect(mainSpecSection).toContain('规格评审链接');
    expect(mainSpecSection).toContain('创建提示词提供的完整 Make 服务规格评审链接');
    expect(mainSpecSection).toContain('根据用户反馈更新同一份主规格');
    expect(mainSpecSection).toContain('直到确认');
    expect(questionSection).toContain('默认单选');
    expect(questionSection).toContain('明确允许多选');
    expect(questionSection).not.toContain('互斥选项');
    expect(alignmentGuide).toContain('原型必须以主规格作为确认载体');

    expect(developmentGuide).toContain('requirements-alignment-guide.md');
    expect(alignmentGuide).toContain('templates/prototype-spec.html');
    expect(alignmentGuide).toContain('templates/prototype-spec.md');
    expect(developmentGuide).toContain('templates/prototype-spec.html');
    expect(developmentGuide).toContain('templates/prototype-spec.md');
    expect(prototypeReviewGuide).toContain('`.spec/spec.html`、`.spec/spec.md`');
    expect(prototypeReviewGuide).toContain('主规格链接的必要子文档');
  });

  it('does not maintain a separate visual-alignment layer outside the main spec', () => {
    const alignmentGuide = readRule('requirements-alignment-guide.md');

    expect(alignmentGuide).not.toContain('## 可视化对齐');
    expect(alignmentGuide).not.toContain('ASCII Wireframe');
    expect(alignmentGuide).not.toContain('ASCII Diagram');
  });

  it('uses one concise local-first gate for DESIGN.md recommendations', () => {
    const alignmentGuide = readRule('requirements-alignment-guide.md');
    const designSection = alignmentGuide.match(/## 设计方案对齐\n\n([\s\S]*?)\n## /u)?.[1] ?? '';

    expect(designSection).toContain('先从当前项目本地候选（项目默认主题、已有同类原型和 `src/themes/`）中选择');
    expect(designSection).toContain('本地不足 3 个时，才使用 `$search-design-system` 从 Design Knowledge 主题库补足');
    expect(designSection).not.toContain('只有用户明确要求线上检索时才访问线上源');
    expect(designSection).toContain('从这些已有候选中选择设计基底不得触发 `$build-design-system`');
    expect(designSection).toContain('只有用户明确要求创建或修改主题时才使用它');
    expect(designSection).toContain('http://localhost:53817/?projectId=<project-id>&theme=<theme-key>');
    expect(designSection).toContain('并标出对应 `DESIGN.md` 路径');
    expect(designSection).toContain('Design Knowledge 候选使用检索结果提供的链接');
    expect(designSection).not.toContain('serverUrl');
    expect(designSection).not.toContain('$design-system-search');
  });

  it('prefers token-efficient structured text before visual diagrams during alignment', () => {
    const expected = '优先用简短摘要或结构化文字对齐；文字难以表达时再用 ASCII Wireframe/Diagram 或 Mermaid';

    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md']) {
      expect(readClientFile(guidancePath)).toContain(expected);
    }
  });

  it('keeps optional post-acceptance stages in the client entry guidance only', () => {
    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md']) {
      const guidance = readClientFile(guidancePath);
      expect(guidance).toContain('验收后由用户按需发起的可选阶段');
      expect(guidance).toContain('原型标注使用 `$prototype-annotation`。');
      expect(guidance).toContain('Commentary 批注处理使用 `$handle-comments`，不属于原型标注阶段。');
    }
    const alignmentGuide = readRule('requirements-alignment-guide.md');
    expect(alignmentGuide).not.toContain('## 可选后续');
    expect(alignmentGuide).not.toContain('Review（可选）');
    expect(alignmentGuide).not.toContain('触发过对齐时');
  });

  it('keeps preview-link guidance brief with a default Make origin and custom-host fallback', () => {
    const alignmentGuide = readRule('requirements-alignment-guide.md');
    const developmentGuide = readRule('prototype-development-guide.md');

    expect(alignmentGuide).toContain('Make 管理端默认使用 `http://localhost:53817/`；`check-app-ready` 返回 `serverUrl` 时以实际返回值为准。');
    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md']) {
      const guidance = readClientFile(guidancePath);
      expect(guidance).toContain('Make 管理端默认使用 `http://localhost:53817/`；`check-app-ready` 返回 `serverUrl` 时以实际值为准。');
      expect(guidance).not.toContain('Make 管理端固定使用');
    }
    expect(alignmentGuide).not.toContain('## 预览链接口径');
    expect(alignmentGuide).not.toContain('.dev-server-info.json');
    expect(developmentGuide).not.toContain('“预览链接口径”');
  });

  it('uses Make serverUrl for user-facing annotation and theme links', () => {
    const annotationSkill = readClientFile('.agents/skills/prototype-annotation/SKILL.md');
    const annotationReference = readClientFile(
      '.agents/skills/prototype-annotation/references/axhub-annotation.md',
    );
    const themeContract = readClientFile(
      '.agents/skills/build-design-system/references/theme-output-contract.md',
    );

    for (const guidance of [annotationSkill, annotationReference, themeContract]) {
      expect(guidance).toContain('`serverUrl`');
      expect(guidance).not.toContain('使用 ready 检查返回的 `targetUrl`');
    }
  });

  it('routes theme work through build-design-system instead of legacy rule files', () => {
    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md', 'rules/prototype-development-guide.md']) {
      const guidance = readClientFile(guidancePath);
      expect(guidance).toContain('$build-design-system');
      expect(guidance).not.toContain('rules/theme-guide.md');
      expect(guidance).not.toContain('rules/theme-source-capture-guide.md');
    }

    expect(fs.existsSync(path.join(clientRoot, 'rules/theme-guide.md'))).toBe(false);
    expect(fs.existsSync(path.join(clientRoot, 'rules/theme-source-capture-guide.md'))).toBe(false);
  });

  it('separates existing-theme search from explicit theme creation in core guidance', () => {
    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md']) {
      const guidance = readClientFile(guidancePath);
      expect(guidance).toContain('先检查当前项目本地候选（项目默认主题、已有同类原型和 `src/themes/`）');
      expect(guidance).toContain('本地不足 3 个时，再使用 `$search-design-system` 从 Design Knowledge 主题库补足');
      expect(guidance).not.toContain('只有用户明确要求线上检索时才访问线上源');
      expect(guidance).toContain('只有用户明确要求创建或修改主题时才使用 `$build-design-system`');
    }
  });

  it('lists theme-creation and PRD skill routes in every core workflow table', () => {
    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md']) {
      const guidance = readClientFile(guidancePath);
      expect(guidance).not.toContain('| 选择设计基底 |');
      expect(guidance).toContain('| 创建或修改主题、设计系统、设计规范 |');
      expect(guidance).toContain('$build-design-system 技能');
      expect(guidance).toContain('| PRD 文档 | `src/resources/` |');
      expect(guidance).toContain('$plan-prds 技能');
      expect(guidance).toContain('$write-prd 技能');
      expect(guidance).not.toContain('主题设计系统设计规范');
      expect(guidance).not.toContain('src/resources/prd/');
    }
  });

  it('keeps fixed document templates outside the ordinary resource route', () => {
    for (const guidancePath of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.template.md']) {
      const guidance = readClientFile(guidancePath);
      expect(guidance).toContain('| 固定文档模板 | `templates/` | 项目设置 |');
      expect(guidance).not.toContain('`templates/` 是普通子目录');
    }
  });

  it('ships aligned Markdown and HTML main-spec templates with stable multipage navigation', () => {
    const templatesDir = path.join(clientRoot, 'templates');
    const markdownPath = path.join(templatesDir, 'prototype-spec.md');
    const htmlPath = path.join(templatesDir, 'prototype-spec.html');

    expect(fs.existsSync(markdownPath)).toBe(true);
    expect(fs.existsSync(htmlPath)).toBe(true);

    const markdown = fs.readFileSync(markdownPath, 'utf8');
    const html = fs.readFileSync(htmlPath, 'utf8');
    expect(markdown).toMatch(/^# 规格文档 Markdown 模板$/mu);
    expect(html).toContain('<title>规格文档 HTML 模板</title>');
    expect(html).toContain('<h1>规格文档 HTML 模板</h1>');
    for (const section of ['当前方案', '事实与输入', '原型范围', '页面与内容方案', '交互与状态方案', '设计基底与原型特有调整', '当前待确认事项', '用户重要决策与变更']) {
      expect(markdown).toContain(`## ${section}`);
      expect(html).toContain(`>${section}</h2>`);
    }

    expect(html).toContain('<aside class="sidebar">');
    expect(html).toContain('<nav class="page-nav" aria-label="规格文档页面">');
    expect(html).toContain('data-page-target="overview"');
    expect(html).toContain('data-page-target="detail-one"');
    expect(html).toContain('data-page-target="detail-two"');
    expect(html).toContain('data-spec-page="overview"');
    expect(html).toContain('data-spec-page="detail-one"');
    expect(html).toContain('data-spec-page="detail-two"');
    expect(html).toContain('page.hidden = page.dataset.specPage !== pageId');
    expect(html).toContain('scrollbar-gutter: stable;');
    expect(html).not.toContain('href="#current-plan"');
    expect(html).not.toContain('new IntersectionObserver');
  });

  it('keeps shared review policy in one common guide', () => {
    const commonGuide = readRule('review-common-guide.md');
    const uiGuide = readRule('ui-review-guide.md');
    const prototypeGuide = readRule('prototype-review-guide.md');

    for (const guide of [uiGuide, prototypeGuide]) {
      expect(guide).toContain('rules/review-common-guide.md');
      expect(guide).not.toContain('扣分建议：');
      expect(guide).not.toContain('有任何 `P0`，最高 59');
      expect(guide).not.toContain('不要默认填写某个中庸分');
    }

    expect(commonGuide).toContain('不要默认填写某个中庸分');
    expect(commonGuide).toContain('有任何 `P0`，最高 59');
    expect(commonGuide).toContain('扣分建议：');
    expect(commonGuide).toContain('未参与实现的子代理');
    expect(commonGuide).toContain('两个独立视角都完成时标记为 `full`');
    expect(commonGuide).toContain('否则标记为 `degraded`');
    expect(commonGuide).toContain('报告必须包含 `评分依据` 分组');
    expect(commonGuide).toContain('没有 score 时说明不评分及原因');
    expect(prototypeGuide).toContain('src/resources/**/*.excalidraw');
  });

  it('keeps spec confirmation policy in the shared alignment guide instead of skill copies', () => {
    const skillPaths = [
      '.agents/skills/write-prd/SKILL.md',
      '.claude/skills/write-prd/SKILL.md',
    ];

    for (const skillPath of skillPaths) {
      const skill = readClientFile(skillPath);
      expect(skill).toContain('rules/requirements-alignment-guide.md');
      expect(skill).not.toContain('同时存在时以 HTML 为准');
      expect(skill).not.toContain('确认前不得修改原型');
    }
  });
});
