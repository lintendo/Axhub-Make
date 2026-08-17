import { getDocumentTemplate, type DocumentTemplateId } from '../../common/documentTemplates';
import type { ProjectScope } from './projectScope';
import { withProjectScope } from './projectScope';

export interface DocumentTemplateOption {
    name: string;
    displayName: string;
    description: string;
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any)?.error || fallbackMessage);
    }
    return response.json() as Promise<T>;
}

async function parseTextResponse(response: Response, fallbackMessage: string): Promise<string> {
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any)?.error || fallbackMessage);
    }
    return response.text();
}

export type DocumentTemplateOutputFormat = '' | 'md' | 'html' | 'mermaid' | 'drawio';

export function isDocumentTemplateCompatibleWithFormat(
    templateName: string,
    format: DocumentTemplateOutputFormat,
): boolean {
    const lowerName = templateName.trim().toLowerCase();
    const isMarkdown = lowerName.endsWith('.md');
    const isHtml = lowerName.endsWith('.html');
    if (!format || format === 'html') return isMarkdown || isHtml;
    if (format === 'md') return isMarkdown;
    return false;
}

export function filterCompatibleDocumentTemplates<T extends { name: string }>(
    templates: T[],
    format: DocumentTemplateOutputFormat,
): T[] {
    return templates.filter((template) => isDocumentTemplateCompatibleWithFormat(template.name, format));
}

export function normalizeDocumentTemplateList(value: unknown): DocumentTemplateOption[] {
    const items = value && typeof value === 'object' && Array.isArray((value as { templates?: unknown }).templates)
        ? (value as { templates: unknown[] }).templates
        : [];
    return items.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const record = item as Record<string, unknown>;
        const template = getDocumentTemplate(record.id);
        if (!template || record.exists !== true || record.path !== template.path) return [];
        return [{
            name: template.path,
            displayName: typeof record.displayName === 'string' && record.displayName.trim()
                ? record.displayName.trim()
                : template.displayName,
            description: typeof record.description === 'string' ? record.description.trim() : '',
        }];
    });
}

export const documentTemplatesApi = {
    async list(scope: ProjectScope): Promise<DocumentTemplateOption[]> {
        const response = await fetch(withProjectScope('/api/document-templates', scope));
        const data = await parseJsonResponse<unknown>(response, '读取文档模板失败');
        return normalizeDocumentTemplateList(data);
    },

    async read(templateId: DocumentTemplateId, scope: ProjectScope): Promise<string> {
        const template = getDocumentTemplate(templateId);
        if (!template) throw new Error('模板 ID 无效');
        const response = await fetch(withProjectScope(`/api/document-templates/${encodeURIComponent(template.id)}`, scope));
        return parseTextResponse(response, '读取文档模板内容失败');
    },
};
