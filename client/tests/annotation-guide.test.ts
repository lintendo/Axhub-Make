import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const { buildMakeProjectMetadata } = await import('../scripts/sync-project-metadata.mjs');

const appRoot = path.resolve(__dirname, '..');
const guideRoot = path.join(appRoot, 'src/prototypes/annotation-demo');

describe('annotation demo prototype', () => {
  it('is a self-contained annotation feature demo prototype', () => {
    const indexSource = fs.readFileSync(path.join(guideRoot, 'index.tsx'), 'utf8');
    const styleSource = fs.readFileSync(path.join(guideRoot, 'style.css'), 'utf8');
    const annotationSource = JSON.parse(
      fs.readFileSync(path.join(guideRoot, 'annotation-source.json'), 'utf8'),
    );

    expect(indexSource).toContain('@name 标注演示');
    expect(indexSource).toContain("import annotationSourceDocument from './annotation-source.json';");
    expect(indexSource).toContain('<AnnotationViewer');
    expect(indexSource).toContain('showThemeToggle: true');
    expect(indexSource).not.toContain('showThemeToggle: false');
    expect(indexSource).toContain('useProtoDevState');
    expect(indexSource).not.toContain('data-annotation-id="state-practice"');
    expect(indexSource).toContain('annotation-guide-sidebar');
    expect(indexSource).toContain('annotation-guide-manuscript');
    expect(indexSource).toContain('annotation-guide-section-title');
    expect(indexSource).toContain('annotation-guide-content-inner');
    expect(indexSource).toContain('annotation-guide-footer');
    expect(indexSource).toContain('原型即 PRD');
    expect(indexSource).toContain('我们的目的');
    expect(indexSource).toContain('原型 + PRD');
    expect(indexSource).toContain('annotation-guide-section-body');
    expect(indexSource).toContain('annotation-guide-comparison-table');
    expect(indexSource).toContain('字数');
    expect(indexSource).toContain('阅读时长');
    expect(indexSource).toContain("metrics: { wordCount: '约 860 字', readingTime: '约 3 分钟' }");
    expect(indexSource).toContain("metrics: { wordCount: '约 620 字', readingTime: '约 2 分钟' }");
    expect(indexSource).not.toContain('const chapterMetrics =');
    expect(indexSource).toContain([
      '<th scope="col">维度</th>',
      '                <th scope="col">原型即 PRD</th>',
      '                <th scope="col">原型 + PRD</th>',
    ].join('\n'));
    expect(indexSource).toContain('<th scope="col">原型即 PRD</th>');
    expect(indexSource).toContain('<td className="annotation-guide-comparison-prototype">{row.prototypeOnly}</td>');
    expect(indexSource).toContain('<td>{row.traditional}</td>');
    expect(indexSource).toContain('统一入口');
    expect(indexSource).toContain('生产效率');
    expect(indexSource).toContain('研发效率');
    expect(indexSource).not.toContain('SECTION');
    expect(indexSource).not.toContain('MODE');
    expect(indexSource).not.toContain('重置演示状态');
    expect(indexSource).not.toContain('className="annotation-guide-reset"');
    expect(indexSource).not.toContain("dimension: '需求载体'");
    expect(indexSource).not.toContain("dimension: '同步成本'");
    expect(indexSource).not.toContain("dimension: 'Agent 理解'");
    expect(indexSource).not.toContain("dimension: '评审方式'");
    expect(indexSource).not.toContain("dimension: '交付价值'");
    expect(indexSource).not.toContain('<span>{activeChapter.shortTitle}</span>');
    expect(indexSource).toContain('ContentAnnotationDemoView');
    expect(indexSource).toContain('annotation-guide-annotation-card-grid');
    expect(indexSource).toContain('annotation-guide-annotation-card is-default');
    expect(indexSource).toContain('annotation-guide-markdown-preview');
    expect(indexSource).toContain('annotation-guide-category-strip');
    expect(indexSource).toContain('annotation-guide-filter-preview');
    expect(indexSource).toContain('annotation-guide-node-stack');
    expect(indexSource).toContain('点击预览节点');
    expect(indexSource).toContain('多颜色标注');
    expect(indexSource).toContain('筛选颜色');
    expect(indexSource).toContain('一个节点多种标注');
    expect(indexSource).toContain('data-annotation-id="content-preview-node"');
    expect(indexSource).toContain('data-annotation-id="content-category-node"');
    expect(indexSource).toContain('data-annotation-id="content-filter-node"');
    expect(indexSource).toContain('data-annotation-id="content-multi-node"');
    expect(indexSource).toContain('StateAnnotationDemoView');
    expect(indexSource).toContain('annotation-guide-state-demo-grid');
    expect(indexSource).toContain('annotation-guide-state-demo-card');
    expect(indexSource).toContain('annotation-guide-result-symbol');
    expect(indexSource).toContain('annotation-guide-empty-list');
    expect(indexSource).toContain('annotation-guide-meter');
    expect(indexSource).toContain('结果页');
    expect(indexSource).toContain('列表页');
    expect(indexSource).toContain('指标卡');
    expect(indexSource).toContain('提交成功');
    expect(indexSource).toContain('暂无数据');
    expect(indexSource).toContain('转化率');
    expect(indexSource).toContain('className="annotation-guide-result-message"');
    expect(indexSource).toContain('data-annotation-id="state-result-card"');
    expect(indexSource).toContain('data-annotation-id="state-list-card"');
    expect(indexSource).toContain('data-annotation-id="state-metric-card"');
    expect(indexSource).toContain('DirectoryGuideView');
    expect(indexSource).toContain('annotation-guide-directory-overview');
    expect(indexSource).toContain('annotation-guide-directory-copy');
    expect(indexSource).toContain('annotation-guide-directory-type-list');
    expect(indexSource).toContain('annotation-guide-directory-pointer');
    expect(indexSource).toContain('点击这里打开目录');
    expect(indexSource).toContain('EnableAnnotationPractice');
    expect(indexSource).toContain('EditCommentsView');
    expect(indexSource).toContain('AgentReadView');
    expect(indexSource).toContain('annotation-guide-generate-capability-grid');
    expect(indexSource).toContain('annotation-guide-generate-section-body');
    expect(indexSource).toContain('id="enable-methods"');
    expect(indexSource).toContain('data-annotation-id="enable-annotation-methods"');
    expect(indexSource).toContain("'edit-comments-methods'");
    expect(indexSource).toContain('id="agent-read-skill"');
    expect(indexSource).toContain('任意元素标注');
    expect(indexSource).toContain('状态标注');
    expect(indexSource).toContain('原型目录内容');
    expect(indexSource).toContain('默认设置状态');
    expect(indexSource).toContain('annotation-guide-method-grid');
    expect(indexSource).toContain('人工开启');
    expect(indexSource).toContain('AI 开启');
    expect(indexSource).toContain('从原型顶部的标注入口进入');
    expect(indexSource).not.toContain('批注工具');
    expect(indexSource).not.toContain('批注模式更多菜单');
    expect(indexSource).toContain('annotation-guide-edit-method-list');
    expect(indexSource).toContain('AI 编辑');
    expect(indexSource).toContain('手动编辑');
    expect(indexSource).toContain('对话框直接提');
    expect(indexSource).toContain('批注后通过 AI 执行');
    expect(indexSource).toContain('编辑节点');
    expect(indexSource).toContain('编辑文档');
    expect(indexSource).toContain('annotation-guide-read-source-list');
    expect(indexSource).toContain('源码');
    expect(indexSource).toContain('标注内容');
    expect(indexSource).toContain('文档内容');
    expect(indexSource).toContain("import makeAnnotationAsset from './assets/make-annotation.png';");
    expect(indexSource).toContain("import aiSkillOpenAsset from './assets/ai-skill-open.png';");
    expect(indexSource).not.toContain("import commentMenuOpenAsset from './assets/comment-menu-open.png';");
    expect(indexSource).toContain("import documentEditAsset from './assets/document-edit.png';");
    expect(indexSource).toContain("import manualEditCommentAsset from './assets/manual-edit-comment.png';");
    expect(indexSource).toContain("import agentReadAsset from './assets/agent-read.png';");
    expect(indexSource).toContain('annotation-guide-method-placeholder');
    expect(indexSource.match(/className="annotation-guide-method-placeholder"/g)).toHaveLength(3);
    expect(indexSource).toContain('image: makeAnnotationAsset');
    expect(indexSource).toContain('image: aiSkillOpenAsset');
    expect(indexSource).not.toContain('image: commentMenuOpenAsset');
    expect(indexSource).toContain('image: manualEditCommentAsset');
    expect(indexSource).toContain('image: documentEditAsset');
    expect(indexSource).toContain('alt={`${item.title}界面`}');
    expect(indexSource).toContain('alt={`${method.title}界面`}');
    expect(indexSource).not.toContain('批注编辑功能站位图');
    expect(indexSource).not.toContain('Agent 技能标注站位图');
    expect(indexSource).toContain('annotation-guide-chrome');
    expect(indexSource).not.toContain('principle:');
    expect(indexSource).not.toContain('function getChapter');
    expect(indexSource).not.toContain('GENERATE · SCOPE');
    expect(indexSource).not.toContain('GENERATE · METHOD');
    expect(indexSource).not.toContain('METHOD 01');
    expect(indexSource).not.toContain('METHOD 02');
    expect(indexSource).not.toContain('annotation-guide-generate-intro');
    expect(indexSource).not.toContain('annotation-guide-prompt-card');
    expect(indexSource).not.toContain('发给 AI 的 Prompt');
    expect(indexSource).not.toContain('createGeneratePrompt');
    expect(indexSource).toContain("activeChapter.id === 'prototype-directory' ? 'is-directory-page' : ''");
    expect(indexSource).toContain('页面');
    expect(indexSource).toContain('文档');
    expect(indexSource).toContain('链接');
    expect(indexSource).not.toContain("id: 'settings'");
    expect(indexSource).not.toContain('SettingsPractice');
    expect(indexSource).not.toContain('Settings2');
    expect(indexSource).not.toContain('查看设置展示');
    expect(indexSource).not.toContain('annotation-guide-state-grid');
    expect(indexSource).not.toContain('业务状态');
    expect(indexSource).not.toContain('文本状态');
    expect(indexSource).not.toContain('数值状态');
    expect(indexSource).not.toContain('单点反馈展示');
    expect(indexSource).not.toContain('操作步骤');
    expect(indexSource).not.toContain('完成标准');
    expect(indexSource).not.toContain('标注指导');
    expect(styleSource).toContain('--accent:#002FA7');
    expect(styleSource).toContain('grid-template-columns:270px minmax(0, 1fr)');
    expect(styleSource).toContain('width:min(980px, calc(100% - 96px))');
    expect(styleSource).toContain('.annotation-guide-content-inner');
    expect(styleSource).toContain('.annotation-guide-footer');
    expect(styleSource).toContain('position:sticky');
    expect(styleSource).not.toContain('annotation-guide-view-tips');
    expect(styleSource).toContain('font-size:clamp(34px, 4.2vw, 54px)');
    expect(styleSource).toMatch(
      /\.annotation-guide-hero p:not\(\.annotation-guide-eyebrow\)\s*\{[\s\S]*font-size:16px;[\s\S]*font-weight:400;[\s\S]*line-height:1\.55;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-section-title\s*\{[\s\S]*font-size:20px;[\s\S]*font-weight:600;[\s\S]*line-height:1\.22;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-manuscript p\s*\{[\s\S]*font-size:15px;[\s\S]*font-weight:400;[\s\S]*line-height:1\.55;/,
    );
    expect(styleSource).toContain('annotation-guide-comparison-table');
    expect(styleSource).toMatch(
      /\.annotation-guide-section-body\s*\{[\s\S]*min-width:0;[\s\S]*border-top:1px solid var\(--ink\);[\s\S]*padding-top:18px;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-comparison-table th:first-child\s*\{[\s\S]*width:112px;[\s\S]*white-space:nowrap;/,
    );
    expect(styleSource).toContain('background:rgba(var(--accent-rgb), .06)');
    expect(styleSource).toContain('.annotation-guide-comparison-table thead th:nth-child(2)');
    expect(styleSource).toContain('grid-template-columns:auto auto');
    expect(styleSource).toContain('annotation-guide-state-demo-grid');
    expect(styleSource).toContain('annotation-guide-annotation-card-grid');
    expect(styleSource).toMatch(
      /\.annotation-guide-annotation-card-grid\s*\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap:24px;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-annotation-card\s*\{[\s\S]*border:1px solid var\(--ink\);[\s\S]*border-top-width:6px;[\s\S]*background:var\(--paper\);[\s\S]*padding:20px;/,
    );
    expect(styleSource).toContain('annotation-guide-markdown-preview');
    expect(styleSource).toContain('annotation-guide-filter-preview');
    expect(styleSource).toContain('annotation-guide-node-stack');
    expect(styleSource).toContain('annotation-guide-state-demo-card');
    expect(styleSource).toMatch(
      /\.annotation-guide-state-demo-card\s*\{[\s\S]*border-top:4px solid var\(--marker-default\);[\s\S]*background:var\(--grey-1\);[\s\S]*padding:16px;/,
    );
    expect(styleSource).toContain('annotation-guide-result-symbol');
    expect(styleSource).toContain('annotation-guide-empty-list');
    expect(styleSource).toContain('annotation-guide-meter');
    expect(styleSource).toContain('.annotation-guide-result-message');
    expect(styleSource).toContain('min-height:42px');
    expect(styleSource).toContain('.annotation-guide-shell.is-directory-page');
    expect(styleSource).toContain('.annotation-guide-directory-overview');
    expect(styleSource).toContain('.annotation-guide-directory-copy');
    expect(styleSource).toContain('grid-template-columns:minmax(0, 520px) minmax(0, 1fr)');
    expect(styleSource).toContain('.annotation-guide-directory-pointer');
    expect(styleSource).toMatch(
      /\.annotation-guide-directory-pointer\s*\{[\s\S]*position:fixed;[\s\S]*right:76px;[\s\S]*top:50%;[\s\S]*transform:translateY\(-42%\);/,
    );
    expect(styleSource).toContain('@media (max-width:1180px)');
    expect(styleSource).toContain('.annotation-guide-generate-capability-grid');
    expect(styleSource).toContain('.annotation-guide-generate-section-body');
    expect(styleSource).toContain('.annotation-guide-method-grid');
    expect(styleSource).toContain('.annotation-guide-method-placeholder');
    expect(styleSource).toContain('.annotation-guide-method-placeholder img');
    expect(styleSource).toMatch(
      /\.annotation-guide-generate-section-body\s*\{[\s\S]*border-top:1px solid var\(--ink\);[\s\S]*padding-top:18px;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-generate-section-body\s*\{[\s\S]*display:grid;[\s\S]*gap:24px;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-generate-capability-grid article\s*\{[\s\S]*border:0;[\s\S]*padding:0;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-method-grid article\s*\{[\s\S]*border:0;[\s\S]*border-radius:8px;/,
    );
    expect(styleSource).toMatch(
      /\.annotation-guide-method-placeholder img\s*\{[\s\S]*object-fit:contain;/,
    );
    expect(styleSource).toContain('height:100vh');
    expect(styleSource).toContain('overflow:hidden');
    expect(styleSource).not.toContain('annotation-guide-reset');
    expect(styleSource).not.toContain('linear-gradient');
    expect(styleSource).not.toContain('font-size:58px');
    expect(styleSource).not.toContain('font-size:20px;\n    font-weight:700');
    expect(styleSource).not.toContain('font-size:19px;\n    font-weight:650');
    expect(styleSource).not.toContain('font-size:25px;\n    font-weight:900');
    expect(styleSource).not.toContain('grid-template-columns:280px minmax(0, 1fr)');
    expect(styleSource).not.toContain('annotation-guide-main-grid');
    expect(styleSource).not.toContain('annotation-guide-cover');
    expect(styleSource).not.toContain('font-size:clamp(44px, 7vw, 92px)');
    expect(annotationSource.format).toBe('axhub-annotation-source');
    expect(annotationSource.data.prototypeName).toBe('annotation-guide');
    expect(annotationSource.markdownMap['prototype-as-prd-purpose']).toContain('原型是主需求载体');
    expect(annotationSource.markdownMap['enable-annotation-methods']).toContain('人工开启');
    expect(annotationSource.markdownMap['enable-annotation-methods']).toContain('AI 开启');
    expect(annotationSource.markdownMap['enable-annotation-methods']).not.toContain('批注工具');
    expect(annotationSource.markdownMap['enable-annotation-methods']).not.toContain('更多菜单');
    expect(annotationSource.markdownMap['edit-comments-methods']).toContain('# AI 编辑');
    expect(annotationSource.markdownMap['edit-comments-methods']).toContain('# 手动编辑');
    expect(annotationSource.markdownMap['edit-comments-methods']).toContain('从原型顶部的标注入口进入');
    expect(annotationSource.directory.nodes).toEqual([
      expect.objectContaining({ type: 'folder', id: 'directory-pages', title: '页面' }),
      expect.objectContaining({ type: 'folder', id: 'directory-documents', title: '文档' }),
      expect.objectContaining({ type: 'folder', id: 'directory-external-links', title: '外部链接' }),
    ]);
    expect(annotationSource.directory.nodes[0].children[0]).toMatchObject({
      type: 'route',
      id: 'route-prototype-as-prd',
      title: '原型即 PRD',
      route: 'prototype-as-prd',
    });
    expect(annotationSource.directory.nodes[0].children).toHaveLength(7);
    expect(annotationSource.directory.nodes[0].children).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'route-settings' })]),
    );
    expect(annotationSource.directory.nodes[1].children).toHaveLength(6);
    expect(annotationSource.directory.nodes[1].children).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'doc-prd-example' })]),
    );
    expect(annotationSource.directory.nodes[1].children.map((node: any) => node.title)).toEqual([
      'PRD 00｜总览',
      'PRD 01｜角色',
      'PRD 02｜流程',
      'PRD 03｜状态',
      'PRD 04｜风险',
      'PRD 05｜交付',
    ]);
    const prdDocuments = annotationSource.directory.nodes[1].children as Array<{ markdownPath: string }>;
    const prdMarkdown = prdDocuments.map((node) => {
      expect(node).toHaveProperty('markdownPath');
      expect(node).not.toHaveProperty('markdown');
      expect(node.markdownPath).toMatch(/^docs\/prd-\d{2}-[a-z-]+\.md$/);
      return fs.readFileSync(path.join(guideRoot, node.markdownPath), 'utf8');
    });
    expect(prdMarkdown[0]).toContain('## 1. 背景与目标');
    expect(prdMarkdown[0]).toContain('## 2. 功能范围');
    expect(prdMarkdown[0]).toContain('原型即 PRD');
    expect(prdMarkdown[0]).toContain('内容标注');
    expect(prdMarkdown[0]).toContain('状态标注');
    expect(prdMarkdown[0]).toContain('原型目录');
    expect(prdMarkdown[0]).toContain('开启标注');
    expect(prdMarkdown[0]).toContain('编辑标注');
    expect(prdMarkdown[0]).toContain('Agent 读取');
    expect(prdMarkdown[0]).toContain('人工开启');
    expect(prdMarkdown[0]).toContain('AI 开启');
    expect(prdMarkdown[0]).toContain('## 4. Markdown 层级案例');
    expect(prdMarkdown[0]).toContain('- [背景](#背景)');
    expect(prdMarkdown[0]).toContain('    - [页面范围](#页面范围)');
    expect(prdMarkdown[0]).toContain('1. 一级事项：评审入口');
    expect(prdMarkdown[0]).toContain('    1. 二级事项：页面切换');
    expect(prdMarkdown[0]).toContain('        - 三级事项：保留当前标注上下文');
    expect(prdMarkdown[1]).toContain('## 1. 使用者');
    expect(prdMarkdown[1]).toContain('## 2. 协作职责');
    expect(prdMarkdown[1]).toContain('产品负责人');
    expect(prdMarkdown[1]).toContain('研发');
    expect(prdMarkdown[2]).toContain('## 1. 主流程');
    expect(prdMarkdown[2]).toContain('## 2. 页面流转');
    expect(prdMarkdown[2]).toContain('人工开启或 AI 开启');
    expect(prdMarkdown[2]).toContain('开发 Agent');
    expect(prdMarkdown[3]).toContain('## 1. 状态标注范围');
    expect(prdMarkdown[3]).toContain('结果状态');
    expect(prdMarkdown[3]).toContain('列表状态');
    expect(prdMarkdown[3]).toContain('指标状态');
    expect(prdMarkdown[4]).toContain('## 1. 已知风险');
    expect(prdMarkdown[4]).toContain('信息过载');
    expect(prdMarkdown[4]).toContain('状态遗漏');
    expect(prdMarkdown[5]).toContain('## 1. 交付物');
    expect(prdMarkdown[5]).toContain('## 2. 验收标准');
    expect(prdMarkdown[5]).toContain('只保留必要的外部设计来源链接');
    expect(annotationSource.directory.nodes[2].children).toHaveLength(1);
    expect(annotationSource.directory.nodes[2].children[0]).toMatchObject({
      type: 'link',
      id: 'link-design-source-guizang-ppt-skill',
      title: '设计来源：op7418/guizang-ppt-skill',
      href: 'https://github.com/op7418/guizang-ppt-skill',
      target: 'blank',
    });
    expect(annotationSource.markdownMap['content-preview-node']).toContain('Markdown 示例');
    expect(annotationSource.markdownMap['content-preview-node']).toContain('`行内代码`');
    expect(annotationSource.markdownMap['content-category-node']).toContain('多颜色标注');
    expect(annotationSource.markdownMap['content-filter-node']).toContain('筛选颜色');
    expect(annotationSource.markdownMap['content-multi-node-note']).toContain('一个节点多种标注');
    expect(annotationSource.markdownMap).not.toHaveProperty('state-result-card');
    expect(annotationSource.markdownMap['state-list-card']).toContain('文案标注和状态标注可以同时存在');
    expect(annotationSource.markdownMap['state-list-card']).toContain('点击上方');
    expect(annotationSource.markdownMap['state-metric-card']).toContain('文案标注和状态标注可以同时存在');
    expect(annotationSource.markdownMap['state-metric-card']).toContain('点击上方');
    expect(annotationSource.markdownMap['directory-practice']).toContain('页面、文档和链接');
    expect(annotationSource.markdownMap).not.toHaveProperty('generate-practice');
    expect(annotationSource.markdownMap).not.toHaveProperty('agent-read-skill');
    expect(annotationSource.markdownMap).not.toHaveProperty('settings-practice');
    expect(annotationSource.markdownMap).not.toHaveProperty('settings-theme-color');
    expect(annotationSource.markdownMap).not.toHaveProperty('content-practice');
    expect(annotationSource.markdownMap).toHaveProperty('content-preview-node');
    expect(annotationSource.markdownMap).toHaveProperty('content-category-node');
    expect(annotationSource.markdownMap).toHaveProperty('content-filter-node');
    expect(annotationSource.markdownMap).toHaveProperty('content-multi-node-note');
    expect(annotationSource.markdownMap).not.toHaveProperty('generate-practice');
  });

  it('uses annotation colors and state controls according to the demo behavior', () => {
    const annotationSource = JSON.parse(
      fs.readFileSync(path.join(guideRoot, 'annotation-source.json'), 'utf8'),
    );

    const nodes = annotationSource.data.nodes as Array<{
      id: string;
      pageId: string;
      locator: {
        selectors: string[];
      };
      color?: string;
      controls?: Array<{
        type: string;
        attributeId: string;
        options?: Array<{ label: string; value: string | number }>;
      }>;
    }>;
    const contentDemoNodes = nodes.filter((node) => node.pageId === 'content-annotation');

    expect(nodes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ pageId: 'settings' }),
      expect.objectContaining({ id: 'settings-practice' }),
      expect.objectContaining({ id: 'settings-theme-color' }),
      expect.objectContaining({ color: '#002FA7' }),
    ]));
    expect(contentDemoNodes.map((node) => node.id)).toEqual([
      'content-preview-node',
      'content-category-node',
      'content-filter-node',
      'content-multi-node-note',
      'content-multi-node-category',
      'content-multi-node-filter',
    ]);
    expect(contentDemoNodes.map((node) => node.color?.toUpperCase())).toEqual([
      '#D97706',
      '#059669',
      '#7C3AED',
      '#D97706',
      '#059669',
      '#7C3AED',
    ]);
    expect(contentDemoNodes.filter((node) => node.locator.selectors[0] === '[data-annotation-id="content-multi-node"]')).toHaveLength(3);

    const resultStateNode = nodes.find((node) => node.id === 'state-result-card');
    const listStateNode = nodes.find((node) => node.id === 'state-list-card');
    const metricStateNode = nodes.find((node) => node.id === 'state-metric-card');

    expect(resultStateNode).toMatchObject({
      hasMarkdown: false,
      annotationText: '',
      locator: { selectors: ['[data-annotation-id="state-result-card"]'] },
    });
    expect(listStateNode).toMatchObject({
      hasMarkdown: true,
      locator: { selectors: ['[data-annotation-id="state-list-card"]'] },
    });
    expect(metricStateNode).toMatchObject({
      hasMarkdown: true,
      locator: { selectors: ['[data-annotation-id="state-metric-card"]'] },
    });
    expect(resultStateNode?.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'segmented', attributeId: 'result_state' }),
    ]));
    expect(listStateNode?.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'segmented', attributeId: 'list_state' }),
    ]));
    expect(metricStateNode?.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'segmented', attributeId: 'metric_state' }),
    ]));
    expect(resultStateNode?.controls?.[0].options?.map((option) => option.label)).toEqual(['成功', '失败']);
    expect(listStateNode?.controls?.[0].options?.map((option) => option.label)).toEqual(['空列表', '有内容']);
    expect(metricStateNode?.controls?.[0].options?.map((option) => option.label)).toEqual(['偏低', '正常', '偏高']);

    for (const control of [
      ...(resultStateNode?.controls ?? []),
      ...(listStateNode?.controls ?? []),
      ...(metricStateNode?.controls ?? []),
    ]) {
      expect(['input', 'inputNumber', 'slider', 'textarea', 'colorPicker']).not.toContain(control.type);
      if ((control.options?.length ?? 0) <= 3) {
        expect(control.type).toBe('segmented');
      }
    }
  });

  it('declares the comparison intro and demo chapters in project metadata', () => {
    const metadata = buildMakeProjectMetadata(appRoot, {
      clientOrigin: 'http://localhost:51720',
    });
    const prototype = metadata.resources.prototypes.find((item: any) => item.id === 'annotation-demo');

    expect(prototype).toMatchObject({
      title: '标注演示',
      defaultPageId: 'prototype-as-prd',
      pages: [
        { id: 'prototype-as-prd', title: '原型即 PRD' },
        { id: 'content-annotation', title: '内容标注' },
        { id: 'state-annotation', title: '状态标注' },
        { id: 'prototype-directory', title: '原型目录' },
        { id: 'generate-annotation', title: '开启标注' },
        { id: 'edit-comments', title: '编辑标注' },
        { id: 'agent-read', title: 'Agent 读取' },
      ],
    });
  });
});
