import { describe, expect, it } from 'vitest';

import {
    appendThemeImportDocsToPrompt,
    generateCreateThemePrompt,
    generateThemeLibraryImportPrompt,
    generateThemeImportLinkPrompt,
} from './themePrompts';

const PROMPT_PATH_PATTERN = /(?:^|[\s`"'：（(【\[])(?:\/?(?:src|skills|rules|temp|docs|database|themes|prototypes|assets|media|\.axhub)\/|~\/|[A-Za-z]:[\\/]|(?:[A-Za-z0-9_.-]+[\\/]){2,})/u;

function countOccurrences(haystack: string, needle: string): number {
    if (!needle) return 0;
    return haystack.split(needle).length - 1;
}

function expectPromptHasNoPaths(prompt: string): void {
    expect(prompt).not.toMatch(PROMPT_PATH_PATTERN);
}

describe('generateCreateThemePrompt', () => {
    it('builds a design system prompt with client guide paths and reference pages', () => {
        const prompt = generateCreateThemePrompt(
            [],
            [],
            ['beginner-guide'],
            [{ name: 'beginner-guide', displayName: '新手指导' }],
        );

        expect(prompt).toContain('**系统指令**');
        expect(prompt).toContain('新建设计系统');
        expect(prompt).toContain('**📋 参考文档（必须阅读）**：');
        expect(prompt).toContain('`AGENTS.md`');
        expect(prompt).toContain('`$build-design-system`');
        expect(prompt).toContain('`rules/resource-management-guide.md`');
        expect(prompt).not.toContain('rules/theme-guide.md');
        expect(prompt).not.toContain('rules/theme-source-capture-guide.md');
        expect(prompt).toContain('**参考原型页面**');
        expect(prompt).toContain('`beginner-guide` - 新手指导');
        expect(prompt).not.toContain('**任务**：新建一个主题');
        expect(prompt).not.toContain('**补充上下文**');
        expect(prompt).not.toContain('来源为空');
    });

    it('includes selected docs as resource references without forcing local src/resources paths', () => {
        const prompt = generateCreateThemePrompt(
            ['theme-reference.md'],
            [{ name: 'theme-reference.md', displayName: '主题参考文档' }],
        );

        expect(prompt).toContain('**参考文档**');
        expect(prompt).toContain('`theme-reference.md`');
        expect(prompt).not.toContain('`src/resources/theme-reference.md`');
        expect(prompt).toContain('主题参考文档');
    });

    it('does not force a fixed target themes directory for new design system output', () => {
        const prompt = generateCreateThemePrompt();

        expect(prompt).not.toContain('**目标目录**：`src/themes/<theme-key>/`');
        expect(prompt).not.toContain('`src/themes/<theme-key>/`');
        expect(prompt).toContain('项目当前主题资源约定的位置');
    });

    it('does not include baked-in process, technical docs, or response-template instructions', () => {
        const prompt = generateCreateThemePrompt();

        expect(prompt).not.toContain('项目主题规范');
        expect(prompt).not.toContain('**📋 必读规范文档**：');
        expect(prompt).not.toContain('⚠️ **重要提示**');
        expect(prompt).not.toContain('先完成需求对齐');
        expect(prompt).not.toContain('确认前不要');
        expect(prompt).not.toContain('首次回复模板');
        expect(prompt).not.toContain('收到，准备');
        expect(prompt).not.toContain('输出目标');
        expect(prompt).not.toContain('运行入口');
        expect(prompt).not.toContain('**补充上下文**');
    });
});

describe('theme import prompts', () => {
    it('keeps library theme import prompt concise and path-complete', () => {
        const prompt = generateThemeLibraryImportPrompt({
            designSystem: {
                id: 'trae-design',
                title: 'Trae Design',
                slug: 'trae-design',
                sourcePath: 'design-systems/trae-design',
                sourceUrl: 'https://github.com/lintendo/Make-Template/tree/main/apps/make-template/design-systems/trae-design',
                entryPath: 'design-systems/trae-design/index.tsx',
                tokenPath: 'design-systems/trae-design/designToken.json',
                stylePath: 'design-systems/trae-design/style.css',
                description: 'Trae 风格设计系统',
            },
            repo: 'lintendo/Make-Template',
        });

        expect(prompt).toContain('https://github.com/lintendo/Make-Template/tree/main/apps/make-template/design-systems/trae-design');
        expect(prompt).toContain('src/themes/trae-design');
        expect(prompt).toContain('项目 metadata 声明的 themes 目录');
        expect(prompt).toContain('index.tsx 或 designToken.json');
        expect(prompt).toContain('构建或运行验证');
        expect(prompt).toContain('来源为空');
        expect(prompt).toContain('不要补写');
        expect(prompt).not.toContain('resources.themes');
        expect(prompt).not.toContain('orders.themes');
        expect(prompt).not.toContain('同步或补充');
        expect(prompt).not.toContain('标题：');
        expect(prompt).not.toContain('描述：');
    });

    it('includes split import guidance names for link imports without exposing paths', () => {
        const prompt = generateThemeImportLinkPrompt('web_page');

        expect(prompt).toContain('主题生成说明');
        expect(prompt).toContain('文档补充说明');
        expect(prompt).toContain('数据模型说明');
        expect(prompt).toContain('来源为空');
        expect(prompt).toContain('不要补写');
        expectPromptHasNoPaths(prompt);
        expect(prompt).not.toContain('`/skills/web-page-workflow/theme-generation.md`');
        expect(prompt).not.toContain('`/skills/web-page-workflow/doc-generation.md`');
        expect(prompt).not.toContain('`/skills/web-page-workflow/data-generation.md`');
        expect(prompt).not.toContain('`/skills/axure-prototype-workflow/theme-generation.md`');
    });

    it('branches link prompt text by source', () => {
        const axurePrompt = generateThemeImportLinkPrompt('axure_prototype');
        const webpagePrompt = generateThemeImportLinkPrompt('web_page');

        expect(axurePrompt).toContain('Axure 原型链接');
        expect(webpagePrompt).toContain('网页链接');
    });

    it('does not force docs, data, or themes directories in link import prompts', () => {
        const prompt = generateThemeImportLinkPrompt('web_page');

        expect(prompt).toContain('项目当前主题资源约定的位置');
        expect(prompt).not.toContain('`src/themes/<theme-key>/`');
        expect(prompt).not.toContain('`src/resources/`');
        expect(prompt).not.toContain('`src/database/`');
        expectPromptHasNoPaths(prompt);
    });

    it('appends import guidance without exposing doc paths', () => {
        const inputPrompt = 'V0 项目预处理完成。';
        const resultPrompt = appendThemeImportDocsToPrompt(inputPrompt, 'v0');

        expect(resultPrompt).toContain('V0 项目转换说明');
        expect(resultPrompt).toContain('主题生成说明');
        expect(resultPrompt).toContain('文档补充说明');
        expect(resultPrompt).toContain('数据模型说明');
        expectPromptHasNoPaths(resultPrompt);
    });

    it('includes figma make guidance name when appending import docs', () => {
        const resultPrompt = appendThemeImportDocsToPrompt('Figma Make 项目预处理完成。', 'figma_make');

        expect(resultPrompt).toContain('Figma Make 项目转换说明');
        expect(resultPrompt).toContain('主题生成说明');
        expect(resultPrompt).toContain('数据模型说明');
        expectPromptHasNoPaths(resultPrompt);
    });

    it('dedupes guidance references when already present by title', () => {
        const inputPrompt = `Figma Make 项目预处理完成。

📋 主题导入参考说明：
- Figma Make 项目转换说明
- 主题生成说明`;
        const resultPrompt = appendThemeImportDocsToPrompt(inputPrompt, 'figma_make');

        expect(countOccurrences(resultPrompt, 'Figma Make 项目转换说明')).toBe(1);
        expect(countOccurrences(resultPrompt, '主题生成说明')).toBe(1);
        expect(resultPrompt).toContain('文档补充说明');
        expect(resultPrompt).toContain('数据模型说明');
        expectPromptHasNoPaths(resultPrompt);
    });
});
