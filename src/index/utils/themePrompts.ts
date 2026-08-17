import { stripPromptPaths } from './promptPathSafety';

type OptionWithDisplayName = {
    name: string;
    displayName: string;
};

interface DocOption extends OptionWithDisplayName {}

export type ThemeImportSource =
    | 'make_zip'
    | 'local_axure'
    | 'axure_prototype'
    | 'web_page'
    | 'screenshot'
    | 'v0'
    | 'google_aistudio'
    | 'figma_make'
    | 'app_direct';

export interface ThemeLibraryPromptItem {
    id: string;
    title: string;
    slug: string;
    sourcePath: string;
    sourceUrl?: string;
    entryPath: string;
    tokenPath: string;
    stylePath: string;
    description: string;
}

const THEME_IMPORT_SHARED_GUIDANCE = [
    '主题生成说明',
    '文档补充说明',
    '数据模型说明',
];

const THEME_SOURCE_AVAILABILITY_GUARDRAILS = [
    '来源为空、404、DESIGN NOT FOUND、Not Found、登录墙或只有空模板时，停止创建/导入并说明来源不可用。',
    '不要补写、猜测或套用通用主题内容；没有明确来源证据的 token、页面、建议项/禁止项都不要生成或显示。',
];

const THEME_IMPORT_SOURCE_GUIDANCE: Record<ThemeImportSource, string[]> = {
    make_zip: ['本地 Axure 项目转换说明'],
    local_axure: ['本地 Axure 项目转换说明'],
    axure_prototype: [
        'Axure 原型导入说明',
        'Axure 资产提取说明',
    ],
    web_page: [
        '网页导入说明',
        '网页资产提取说明',
    ],
    screenshot: [
        '截图识别说明',
        '截图素材整理说明',
    ],
    v0: [
        'V0 项目转换说明',
    ],
    google_aistudio: [
        'Google AIStudio 项目转换说明',
    ],
    figma_make: [
        'Figma Make 项目转换说明',
    ],
    app_direct: [],
};

const THEME_CREATE_GUIDE_PATHS = [
    'AGENTS.md',
    '$build-design-system',
    'rules/resource-management-guide.md',
];

function dedupeGuidanceItems(items: string[]): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();

    for (const item of items) {
        const normalized = String(item || '').trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        deduped.push(normalized);
    }

    return deduped;
}

function collectReferencedGuidanceFromPrompt(prompt: string): Set<string> {
    const referenced = new Set<string>();
    for (const item of Object.values(THEME_IMPORT_SOURCE_GUIDANCE).flat().concat(THEME_IMPORT_SHARED_GUIDANCE)) {
        if (item && prompt.includes(item)) {
            referenced.add(item);
        }
    }
    return referenced;
}

function renderResourceReferenceList(
    selected: string[],
    available: OptionWithDisplayName[],
): string {
    const normalizedSelected = selected
        .map((name) => String(name || '').trim())
        .filter(Boolean);
    if (normalizedSelected.length === 0) {
        return '- 无';
    }

    return normalizedSelected.map((name) => {
        const option = available.find((item) => item.name === name);
        return `- \`${name}\`${option?.displayName ? ` - ${option.displayName}` : ''}`;
    }).join('\n');
}

export function isThemeImportLinkSource(source: ThemeImportSource): source is 'axure_prototype' | 'web_page' {
    return source === 'axure_prototype' || source === 'web_page';
}

export function isThemeImportDisabledSource(source: ThemeImportSource): source is 'app_direct' {
    return source === 'app_direct';
}

export function getThemeImportDocPaths(source: ThemeImportSource): string[] {
    if (source === 'app_direct') {
        return [];
    }
    return dedupeGuidanceItems([
        ...(THEME_IMPORT_SOURCE_GUIDANCE[source] || []),
        ...THEME_IMPORT_SHARED_GUIDANCE,
    ]);
}

export function generateThemeImportLinkPrompt(source: 'axure_prototype' | 'web_page'): string {
    const sourceLabel = source === 'axure_prototype' ? 'Axure 原型链接' : '网页链接';
    const docs = getThemeImportDocPaths(source);

    return `**系统指令**：你将作为UI/UX 设计架构师 × 前端工程师（复合型），协助用户「基于${sourceLabel}导入并创建主题」。

**📋 参考文档（必须阅读）**：
${docs.map((docPath) => `- ${docPath}`).join('\n')}

**目标输出**：
- 在项目当前主题资源约定的位置创建主题 token、规范说明和运行入口
- 按项目当前文档资源约定的位置补充项目文档
- 按项目当前数据资源约定的位置补充数据模型

**空源处理**：
${THEME_SOURCE_AVAILABILITY_GUARDRAILS.map((item) => `- ${item}`).join('\n')}

**首次回复模板**：
\`\`\`
收到，我将基于${sourceLabel}导入并创建主题。

请把链接发我（URL）：
\`\`\``;
}

export function generateThemeLibraryImportPrompt(params: {
    designSystem: ThemeLibraryPromptItem;
    repo?: string;
}): string {
    const repo = params.repo || 'lintendo/Make-Template';
    const designSystem = params.designSystem;
    const sourcePath = `apps/make-template/${designSystem.sourcePath}`;
    const sourceUrl = String(designSystem.sourceUrl || '').trim()
        || `https://github.com/${repo.replace(/^https:\/\/github\.com\//u, '').replace(/\/+$/u, '')}/tree/main/${sourcePath.replace(/^\/+/u, '')}`;
    const targetPath = `src/themes/${designSystem.slug}`;

    return `请导入设计系统主题 \`${designSystem.slug}\`。

**来源**：
- GitHub 目录：${sourceUrl}

**目标**：
- 优先放到当前项目 metadata 声明的 themes 目录：<themes>/${designSystem.slug}
- 读取不到 metadata 声明时，使用当前项目的 ${targetPath}
- 若目标目录已存在，停止并询问；不要覆盖或自动改名

**要求**：
1. 导入前确认来源目录不是空内容；遇到来源为空、404、DESIGN NOT FOUND、Not Found 或只有空模板时，停止并说明来源不可用。
2. 不要补写、猜测或套用通用主题内容；没有明确来源证据的 token、页面、建议项/禁止项都不要生成或显示。
3. 复制来源目录的全部内容，保持目录结构。
4. 确认目标目录至少包含 index.tsx 或 designToken.json；缺失则停止并说明模板不完整。
5. 完成后运行项目适用的构建或运行验证；如有导入问题，修复后交付。`;
}

export function appendThemeImportDocsToPrompt(
    prompt: string,
    source: ThemeImportSource,
): string {
    const trimmedPrompt = stripPromptPaths(String(prompt || '').trim());
    if (!trimmedPrompt) {
        return '';
    }

    const docs = getThemeImportDocPaths(source);
    if (docs.length === 0) {
        return trimmedPrompt;
    }

    const referenced = collectReferencedGuidanceFromPrompt(trimmedPrompt);
    const missingDocs = docs.filter((docPath) => !referenced.has(docPath));

    if (missingDocs.length === 0) {
        return trimmedPrompt;
    }

    return `${trimmedPrompt}

📋 主题导入参考说明：
${missingDocs.map((docPath) => `- ${docPath}`).join('\n')}`;
}

export function generateCreateThemePrompt(
    selectedDocs: string[] = [],
    availableDocs: DocOption[] = [],
    selectedReferencePages: string[] = [],
    availableReferencePages: DocOption[] = [],
): string {
    return `**系统指令**：你将作为 UI/UX 设计架构师 × 前端工程师（复合型），协助用户「新建设计系统」。

**📋 参考文档（必须阅读）**：
${THEME_CREATE_GUIDE_PATHS.map((docPath) => `- \`${docPath}\``).join('\n')}

**参考文档**：
${renderResourceReferenceList(selectedDocs, availableDocs)}

**参考原型页面**：
${renderResourceReferenceList(selectedReferencePages, availableReferencePages)}

**目标输出**：
- 在项目当前主题资源约定的位置创建一个新的设计系统目录
- 产出完整的 \`DESIGN.md\`、\`theme.json\`、\`assets/tokens.json\`、\`style.css\`、\`tw.css\` 和 \`index.tsx\`
- 设计系统应能被管理端识别，并能作为后续原型生成的主题配置使用

**执行要求**：
- 先阅读参考文档和参考原型，判断业务类型、信息密度、页面气质和可复用视觉规则
- 以 \`DESIGN.md\` 作为事实源，再同步派生 \`theme.json\`、token、样式和演示入口
- 新设计系统必须用自己的命名、色彩、字体、圆角、间距、组件规则和 Do/Don't，不要复制参考主题的品牌内容
- 资源引用使用主题目录内相对路径；不要写入本机绝对路径、根路径或跨目录逃逸路径
- 完成后运行项目适用的主题验收或就绪检查，并修复到通过`;
}
