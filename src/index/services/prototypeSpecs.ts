import type { ItemData } from '../types';
import { buildSpecTemplatePreviewUrl } from '../utils/markdownPreview';

export type PrototypeSpecFormat = 'html' | 'markdown';

export interface PrototypeSpecDescriptor {
    exists: boolean;
    format: PrototypeSpecFormat | null;
    activePath: 'spec.html' | 'spec.md' | null;
    hasHtml: boolean;
    hasMarkdown: boolean;
    previewUrl: string | null;
    editable: boolean;
}

function buildPrototypeSpecBaseUrl(projectId: string, prototypeId: string): string {
    return `/api/projects/${encodeURIComponent(projectId)}/prototypes/${encodeURIComponent(prototypeId)}/spec`;
}

export function buildPrototypeSpecContentUrl(projectId: string, prototypeId: string, path = ''): string {
    const baseUrl = `${buildPrototypeSpecBaseUrl(projectId, prototypeId)}/content`;
    return path ? `${baseUrl}?path=${encodeURIComponent(path)}` : baseUrl;
}

async function parseDescriptor(response: Response): Promise<PrototypeSpecDescriptor> {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error((data as any)?.error || '读取原型规格失败') as Error & { code?: string; status?: number };
        error.code = (data as any)?.code;
        error.status = response.status;
        throw error;
    }
    return data as PrototypeSpecDescriptor;
}

export const prototypeSpecsApi = {
    async read(projectId: string, prototypeId: string): Promise<PrototypeSpecDescriptor> {
        return parseDescriptor(await fetch(buildPrototypeSpecBaseUrl(projectId, prototypeId)));
    },

};

function getPrototypeDirectory(prototypeFilePath: string, prototypeId: string): string {
    const normalized = String(prototypeFilePath || '').trim().replace(/\\/gu, '/').replace(/\/+$/gu, '');
    const specMarkerIndex = normalized.indexOf('/.spec/');
    if (specMarkerIndex > 0) return normalized.slice(0, specMarkerIndex);
    const slashIndex = normalized.lastIndexOf('/');
    if (slashIndex > 0) return normalized.slice(0, slashIndex);
    const fallbackId = String(prototypeId || '').trim();
    return fallbackId ? `src/prototypes/${fallbackId}` : 'src/prototypes/<prototype-id>';
}

export function buildPrototypeSpecCreationPrompt(params: {
    prototypeId: string;
    prototypeFilePath: string;
    reviewUrl?: string;
}): string {
    const prototypeDir = getPrototypeDirectory(params.prototypeFilePath, params.prototypeId);
    const specDir = `${prototypeDir}/.spec`;
    const reviewUrl = String(params.reviewUrl || '').trim();
    return [
        `当前原型 ${params.prototypeId || prototypeDir} 缺少主规格，请协助创建。`,
        '',
        '请先询问我选择 Markdown（节省 Token）还是 HTML（体验更好）；建议 HTML，但必须等我明确选择后再继续。',
        `- HTML：基于 templates/prototype-spec.html 写入 ${specDir}/spec.html`,
        `- Markdown：基于 templates/prototype-spec.md 写入 ${specDir}/spec.md`,
        '- 不要同时创建两个主规格；同时存在时以 HTML 为准。',
        '- 不要创建日期版本或 spec-state.json。',
        '- 可以在主规格中链接同目录下的子文档。',
        `- 创建或实质修改规格后，请直接提供已拼好的 Make 服务规格评审链接（规格评审页面的完整 URL）${reviewUrl ? `：${reviewUrl}` : ''}；根据我的反馈更新同一份主规格，直到确认。`,
        '- 确认规格前不要修改原型；确认后原型与规格必须保持双向同步。',
    ].join('\n');
}

function getPrototypeSpecFilePath(prototypeFilePath: string, documentPath: string): string {
    const prototypeDir = getPrototypeDirectory(prototypeFilePath, '');
    return prototypeDir ? `${prototypeDir}/.spec/${documentPath}` : '';
}

export function createPrototypeSpecItem(params: {
    projectId: string;
    prototypeId: string;
    prototypeFilePath: string;
    descriptor: PrototypeSpecDescriptor;
    path?: string;
}): ItemData {
    const documentPath = String(params.path || params.descriptor.activePath || '').trim().replace(/\\/gu, '/');
    const contentUrl = buildPrototypeSpecContentUrl(params.projectId, params.prototypeId, documentPath);
    const isMarkdown = documentPath.toLowerCase().endsWith('.md');
    const displayName = documentPath === params.descriptor.activePath
        ? '规格文档'
        : documentPath.split('/').filter(Boolean).pop() || documentPath;
    const filePath = getPrototypeSpecFilePath(params.prototypeFilePath, documentPath);
    return {
        name: documentPath,
        displayName,
        jsUrl: '',
        specUrl: contentUrl,
        previewUrl: isMarkdown ? buildSpecTemplatePreviewUrl(contentUrl) : contentUrl,
        filePath: filePath || undefined,
        absoluteFilePath: undefined,
        projectId: params.projectId,
        resourceId: params.prototypeId,
        projectDocumentPath: filePath || undefined,
        openMode: 'document',
    };
}
