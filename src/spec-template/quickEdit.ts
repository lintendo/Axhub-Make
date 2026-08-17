export type MarkdownQuickEditResourceKind = 'doc' | 'template' | 'unknown';

const PROTOTYPE_SPEC_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/prototypes\/[^/]+\/spec\/content$/u;
const FIXED_MARKDOWN_TEMPLATES = new Map([
    ['prd', 'templates/prd.md'],
    ['prototype-spec-md', 'templates/prototype-spec.md'],
    ['prototype-review', 'templates/prototype-review.md'],
    ['ui-review', 'templates/ui-review.md'],
]);

export interface MarkdownQuickEditMeta {
    resourceKind: MarkdownQuickEditResourceKind;
    entryType: 'components' | 'prototypes' | 'themes' | 'unknown';
    entryName: string;
    docType: 'doc' | 'template' | 'unknown';
    docPath: string;
    prototypePath: string;
}

export interface MarkdownQuickEditModifiedElement {
    label: string;
    note: string;
    imageCount: number;
    changeKinds: Array<'text' | 'style' | 'class'>;
    locator?: { selectors?: string[]; path?: number[] };
}

export type MarkdownCommentPromptTemplate = (params: {
    meta: MarkdownQuickEditMeta;
    docLabel: string;
    docPath: string;
    modifiedElements: MarkdownQuickEditModifiedElement[];
}) => string;

function safeDecodeURIComponent(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function ensureMarkdownExtension(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
}

function getPathname(docUrl?: string): string {
    if (!docUrl) return '';

    try {
        return new URL(docUrl, 'http://localhost').pathname;
    } catch {
        return '';
    }
}

export function buildPrototypeSpecMarkdownSaveRequest(
    docUrl: string,
    nextContent: string,
    baseUrl = 'http://localhost',
): { url: string; init: RequestInit } | null {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(docUrl, baseUrl);
    } catch {
        return null;
    }
    if (!PROTOTYPE_SPEC_CONTENT_PATH_RE.test(parsedUrl.pathname)) return null;
    return {
        url: `${parsedUrl.pathname}${parsedUrl.search}`,
        init: {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: nextContent }),
        },
    };
}

export function formatLocatorPath(locator: { selectors?: string[]; path?: number[] } | null | undefined): string {
    if (!locator) return '';

    const selectors = Array.isArray(locator.selectors)
        ? locator.selectors.map((selector) => String(selector || '').trim()).filter(Boolean)
        : [];
    if (selectors.length > 0) {
        return selectors.join(' | ');
    }

    return Array.isArray(locator.path) && locator.path.length > 0
        ? locator.path.join('>')
        : '';
}

export function shouldIgnoreInitialMarkdownEditorChange(params: {
    savedContent: string;
    currentContent: string;
    nextContent: string;
    userChanged: boolean;
}): boolean {
    const savedContent = String(params.savedContent ?? '');
    const currentContent = String(params.currentContent ?? '');
    const nextContent = String(params.nextContent ?? '');
    return !params.userChanged
        && savedContent === currentContent
        && nextContent !== currentContent;
}

export function resolveMarkdownQuickEditMeta(docUrl?: string): MarkdownQuickEditMeta {
    const defaultMeta: MarkdownQuickEditMeta = {
        resourceKind: 'unknown',
        entryType: 'unknown',
        entryName: '',
        docType: 'unknown',
        docPath: '',
        prototypePath: '',
    };

    const pathname = getPathname(docUrl);
    if (!pathname) return defaultMeta;

    try {
        const parsedUrl = new URL(docUrl || '', 'http://localhost');
        if (parsedUrl.pathname.startsWith('/api/document-templates/')) {
            const templateId = safeDecodeURIComponent(parsedUrl.pathname.slice('/api/document-templates/'.length));
            const templatePath = FIXED_MARKDOWN_TEMPLATES.get(templateId);
            if (!templatePath || parsedUrl.searchParams.get('path') !== templatePath) return defaultMeta;
            return {
                resourceKind: 'template',
                entryType: 'unknown',
                entryName: '',
                docType: 'template',
                docPath: templatePath,
                prototypePath: '',
            };
        }
        if (parsedUrl.pathname === '/api/markdown-file' || parsedUrl.pathname === '/markdown-file/spec.html') {
            const rawFilePath = ensureMarkdownExtension(
                safeDecodeURIComponent(parsedUrl.searchParams.get(parsedUrl.pathname === '/api/markdown-file' ? 'path' : 'file') || ''),
            );
            if (!rawFilePath) return defaultMeta;

            return {
                resourceKind: 'doc',
                entryType: 'unknown',
                entryName: '',
                docType: 'doc',
                docPath: rawFilePath,
                prototypePath: '',
            };
        }
    } catch {
        // noop
    }

    if (pathname.startsWith('/api/docs/templates/')) {
        const templateName = ensureMarkdownExtension(
            safeDecodeURIComponent(pathname.slice('/api/docs/templates/'.length)),
        );
        if (!templateName) return defaultMeta;

        return {
            resourceKind: 'template',
            entryType: 'unknown',
            entryName: '',
            docType: 'template',
            docPath: `src/resources/templates/${templateName}`,
            prototypePath: '',
        };
    }

    if (pathname.startsWith('/api/docs/')) {
        const docName = ensureMarkdownExtension(
            safeDecodeURIComponent(pathname.slice('/api/docs/'.length)),
        );
        if (!docName) return defaultMeta;

        return {
            resourceKind: 'doc',
            entryType: 'unknown',
            entryName: '',
            docType: 'doc',
            docPath: `src/resources/${docName}`,
            prototypePath: '',
        };
    }

    if (pathname.startsWith('/docs/templates/')) {
        const templateName = ensureMarkdownExtension(
            safeDecodeURIComponent(pathname.slice('/docs/templates/'.length)),
        );
        if (!templateName) return defaultMeta;

        return {
            resourceKind: 'template',
            entryType: 'unknown',
            entryName: '',
            docType: 'template',
            docPath: `src/resources/templates/${templateName}`,
            prototypePath: '',
        };
    }

    if (pathname.startsWith('/docs/')) {
        const docName = ensureMarkdownExtension(
            safeDecodeURIComponent(pathname.slice('/docs/'.length)),
        );
        if (!docName) return defaultMeta;

        return {
            resourceKind: 'doc',
            entryType: 'unknown',
            entryName: '',
            docType: 'doc',
            docPath: `src/resources/${docName}`,
            prototypePath: '',
        };
    }

    return defaultMeta;
}

export function buildMarkdownCommentPrompt(options: {
    docLabel: string;
    docUrl?: string;
    modifiedElements: MarkdownQuickEditModifiedElement[];
    promptTemplate?: MarkdownCommentPromptTemplate;
}): { prompt: string; targetPath: string; meta: MarkdownQuickEditMeta } {
    const { docLabel, docUrl, modifiedElements, promptTemplate } = options;
    const meta = resolveMarkdownQuickEditMeta(docUrl);
    const docPath = meta.docPath || docUrl || '(unknown)';
    const targetPath = meta.docPath || '';

    if (promptTemplate) {
        try {
            const prompt = promptTemplate({ meta, docLabel, docPath, modifiedElements });
            return { prompt, targetPath, meta };
        } catch (error) {
            console.warn('[quickEdit] Custom promptTemplate failed, falling back to default:', error);
        }
    }

    const lines: string[] = [];
    lines.push('请根据以下 Markdown 文档预览上的批注，完成对应文档更新。');
    lines.push('');
    lines.push(`文档名称: ${docLabel || '文档'}`);
    lines.push(`文档路径: ${docPath}`);
    if (meta.prototypePath) {
        lines.push(`对应原型入口: ${meta.prototypePath}`);
    }
    lines.push('');
    lines.push('执行要求：');
    lines.push(`1. 所有批注都要优先落到文档文件 ${docPath}。`);

    lines.push('2. 仅修改这个 Markdown 文档本身，不要额外同步更新页面、组件、原型或其他文件。');
    lines.push('3. 输出修改文件清单、关键改动摘要，以及需要我验证的点。');

    lines.push('');
    lines.push('批注列表：');

    modifiedElements.forEach((item, index) => {
        lines.push(`- 批注项 ${index + 1}`);
        lines.push(`  - 批注目标: ${item.label || '未命名元素'}`);
        const selectorPath = formatLocatorPath(item.locator);
        if (selectorPath) {
            lines.push(`  - 预览定位: ${selectorPath}`);
        }
        if (item.note) {
            lines.push(`  - 批注说明: ${item.note}`);
        }
        if (item.imageCount > 0) {
            lines.push(`  - 附带图片: ${item.imageCount} 张`);
        }
        if (item.changeKinds.length > 0) {
            lines.push(`  - 涉及改动类型: ${item.changeKinds.join(', ')}`);
        }
    });

    return {
        prompt: lines.join('\n'),
        targetPath,
        meta,
    };
}
