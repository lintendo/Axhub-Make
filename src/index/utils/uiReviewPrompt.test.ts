import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildReviewPrompt, resolveReviewDocumentPath } from './uiReviewPrompt';

describe('ui review prompts', () => {
  const selectedItem = {
    name: 'home',
    displayName: 'Home Prototype',
    resourceId: 'home',
    filePath: 'src/prototypes/home/index.tsx',
  };

  it('builds a design review prompt that treats DESIGN.md as optional guidance', () => {
    const reviewDocumentPath = resolveReviewDocumentPath(selectedItem, 'design');
    const prompt = buildReviewPrompt({
      selectedItem,
      reviewDocumentPath,
      kind: 'design',
    });

    expect(prompt).toContain('rules/ui-review-guide.md');
    expect(prompt).toContain('优先读取当前原型附近的 DESIGN.md');
    expect(prompt).toContain('如果没有 DESIGN.md');
    expect(prompt).toContain('按常规设计评审执行');
    expect(prompt).toContain('src/prototypes/home/.spec/reviews/ui-review.md');
    expect(prompt).toContain('templates/ui-review.md');
    expect(prompt).toContain('请先读取并套用报告模板');
    expect(prompt).toContain('细节以规则文档和报告模板为准');
    expect(prompt).toContain('输出 Markdown');
    expect(prompt).not.toContain('不要输出 JSON');
    expect(prompt.split('\n').length).toBeLessThanOrEqual(24);
    expect(prompt).not.toContain('score');
    expect(prompt).not.toContain('score 是可选字段');
    expect(prompt).not.toContain('不要默认填写某个中庸分');
    expect(prompt).not.toMatch(/score:\s*\d/u);
    expect(prompt).not.toContain('0-100');
    expect(prompt).not.toContain('frontmatter');
    expect(prompt).not.toContain('设计评审报告的 title 固定写成 "UI 评审"');
    expect(prompt).not.toContain('正文必须使用 Markdown 标题语法');
    expect(prompt).not.toContain('问题小节的优先级按实际判断填写');
    expect(prompt).not.toContain('### P1 -');
    expect(prompt).not.toContain('Home Prototype · UI Review');
    expect(prompt).not.toContain('没有 DESIGN.md 时先停止');
  });

  it('builds a requirements review prompt that prefers HTML main specs and follows linked subdocuments', () => {
    const reviewDocumentPath = resolveReviewDocumentPath(selectedItem, 'requirements');
    const prompt = buildReviewPrompt({
      selectedItem,
      reviewDocumentPath,
      kind: 'requirements',
    });

    expect(prompt).toContain('rules/prototype-review-guide.md');
    expect(prompt).toContain('src/prototypes/home/.spec/spec.html');
    expect(prompt).toContain('src/prototypes/home/.spec/spec.md');
    expect(prompt).toContain('同时存在时以 HTML 为准');
    expect(prompt).toContain('按主规格链接读取必要子文档');
    expect(prompt).toContain('src/prototypes/home/.spec/reviews/prototype-review.md');
    expect(prompt).toContain('templates/prototype-review.md');
    expect(prompt).toContain('请先读取并套用报告模板');
    expect(prompt).toContain('细节以规则文档和报告模板为准');
    expect(prompt).toContain('输出 Markdown');
    expect(prompt).not.toContain('不要输出 JSON');
    expect(prompt.split('\n').length).toBeLessThanOrEqual(24);
    expect(prompt).not.toContain('score');
    expect(prompt).not.toContain('score 是可选字段');
    expect(prompt).not.toContain('不要默认填写某个中庸分');
    expect(prompt).not.toMatch(/score:\s*\d/u);
    expect(prompt).not.toContain('0-100');
    expect(prompt).not.toContain('frontmatter');
    expect(prompt).not.toContain('需求评审报告的 title 固定写成 "原型评审"');
    expect(prompt).not.toContain('正文必须使用 Markdown 标题语法');
    expect(prompt).not.toContain('问题小节的优先级按实际判断填写');
    expect(prompt).not.toContain('### P1 -');
    expect(prompt).not.toContain('Home Prototype · Prototype Review');
  });

  it('keeps review report templates in the fixed project templates directory', () => {
    const templateRoot = resolve(__dirname, '../../../client/templates');
    const uiTemplatePath = resolve(templateRoot, 'ui-review.md');
    const prototypeTemplatePath = resolve(templateRoot, 'prototype-review.md');

    expect(existsSync(uiTemplatePath)).toBe(true);
    expect(existsSync(prototypeTemplatePath)).toBe(true);

    const uiTemplate = readFileSync(uiTemplatePath, 'utf8');
    const prototypeTemplate = readFileSync(prototypeTemplatePath, 'utf8');

    expect(uiTemplate).not.toContain('```markdown');
    expect(uiTemplate).toContain('title: "UI 评审"');
    expect(uiTemplate).toContain('reviewer: "AI"');
    expect(uiTemplate).toContain('createdAt: "<ISO 时间>"');
    expect(uiTemplate).toContain('score: <百分制整数总分>');
    expect(uiTemplate).toContain('如果无法给出明确总分，请删除 score 行');
    expect(uiTemplate).toContain('# UI 评审');
    expect(uiTemplate).toContain('## 评分依据');
    expect(uiTemplate).toContain('成熟度档位');
    expect(uiTemplate).toContain('封顶规则');
    expect(uiTemplate).toContain('没有 score 时说明不评分及原因');
    expect(uiTemplate).not.toMatch(/score:\s*\d/u);
    expect(uiTemplate).not.toContain('### P1 -');
    expect(uiTemplate).toContain('## P0-P3 优先级问题');
    expect(uiTemplate).toContain('## 核心元件');

    expect(prototypeTemplate).not.toContain('```markdown');
    expect(prototypeTemplate).toContain('title: "原型评审"');
    expect(prototypeTemplate).toContain('reviewer: "AI"');
    expect(prototypeTemplate).toContain('createdAt: "<ISO 时间>"');
    expect(prototypeTemplate).toContain('score: <百分制整数总分>');
    expect(prototypeTemplate).toContain('如果无法给出明确总分，请删除 score 行');
    expect(prototypeTemplate).toContain('# 原型评审');
    expect(prototypeTemplate).toContain('## 评分依据');
    expect(prototypeTemplate).toContain('成熟度档位');
    expect(prototypeTemplate).toContain('封顶规则');
    expect(prototypeTemplate).toContain('没有 score 时说明不评分及原因');
    expect(prototypeTemplate).not.toMatch(/score:\s*\d/u);
    expect(prototypeTemplate).not.toContain('### P1 -');
    expect(prototypeTemplate).toContain('## P0-P3 优先级问题');
    expect(prototypeTemplate).toContain('## 完整性与项目对齐');
  });

  it('uses one shared maturity scoring rubric with domain-specific caps', () => {
    const commonRule = readFileSync(resolve(__dirname, '../../../client/rules/review-common-guide.md'), 'utf8');
    const uiRule = readFileSync(resolve(__dirname, '../../../client/rules/ui-review-guide.md'), 'utf8');
    const prototypeRule = readFileSync(resolve(__dirname, '../../../client/rules/prototype-review-guide.md'), 'utf8');

    expect(commonRule).not.toMatch(/score:\s*\d/u);
    expect(commonRule).toContain('不要默认填写某个中庸分');
    expect(commonRule).toContain('无法给出明确总分时，删除 score 行');
    expect(commonRule).toContain('成熟度评分');
    expect(commonRule).toContain('封顶规则');
    expect(commonRule).toContain('有任何 `P0`，最高');
    expect(commonRule).toContain('有 `2 个及以上 P1`，最高');
    expect(commonRule).toContain('报告必须包含 `评分依据` 分组');

    for (const domainRule of [uiRule, prototypeRule]) {
      expect(domainRule).toContain('rules/review-common-guide.md');
      expect(domainRule).not.toContain('不要默认填写某个中庸分');
      expect(domainRule).not.toContain('有任何 `P0`，最高 59');
    }
    expect(uiRule).toContain('未检查移动端或关键响应式断点，最高 75');
    expect(prototypeRule).toContain('缺少核心用户、主流程或成功标准且只能从源码推断，最高 72');
  });
});
