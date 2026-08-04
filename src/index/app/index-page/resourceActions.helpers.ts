import type { ItemData } from '../../types';
import { requireProjectScope, withProjectScope, withProjectScopeBody } from '../../services/projectScope';
import {
    generateDeleteDocReferencePrompt,
    generateDeleteTemplateReferencePrompt,
    generateRenameDocReferencePrompt,
    generateRenameTemplateReferencePrompt,
} from '../../utils';
import { getExplicitLocalPath, getPrototypeLocalBasePath, stripIndexFilePath } from '../../utils/localPath';
import type { DocReferenceCheckResult } from '../index-page.helpers';

export function ensureStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

export function getLocalPathForItem(item: unknown): string {
    return getExplicitLocalPath(item);
}

export function getLocalBasePathForItem(item: unknown): string {
    return stripIndexFilePath(getLocalPathForItem(item));
}

export function getPrototypeBasePathForItem(item: unknown): string {
    return getPrototypeLocalBasePath(item);
}

export function getProjectRelativeResourcePathForItem(item: unknown): string {
    const localPath = getLocalPathForItem(item)
        .replace(/\\/g, '/')
        .trim()
        .replace(/^(?:\.\/)+/u, '');
    if (!localPath) {
        return '';
    }
    const resourceRoot = 'src/resources/';
    if (localPath.startsWith(resourceRoot)) {
        return localPath;
    }
    const isAbsolutePath = localPath.startsWith('/') || /^[a-z]:\//iu.test(localPath);
    if (isAbsolutePath) {
        const absoluteResourceRoot = `/${resourceRoot}`;
        const resourceRootIndex = localPath.lastIndexOf(absoluteResourceRoot);
        return resourceRootIndex >= 0 ? localPath.slice(resourceRootIndex + 1) : '';
    }
    return `${resourceRoot}${localPath}`;
}

export function buildLocalSiblingPath(localPath: string, siblingName: string): string {
    const normalizedPath = String(localPath || '').trim().replace(/\\/g, '/').replace(/\/+$/u, '');
    const normalizedName = String(siblingName || '').trim();
    if (!normalizedPath || !normalizedName) {
        return '';
    }
    const slashIndex = normalizedPath.lastIndexOf('/');
    if (slashIndex < 0) {
        return normalizedName;
    }
    return `${normalizedPath.slice(0, slashIndex + 1)}${normalizedName}`;
}

export function withResourceProject(url: string, projectId: string | null): string {
    return withProjectScope(url, requireProjectScope(projectId));
}

export function withResourceProjectBody<T extends Record<string, unknown>>(
    body: T,
    projectId: string | null,
): T & { projectId: string } {
    return withProjectScopeBody(body, requireProjectScope(projectId));
}

export async function checkDocReferencesRequest(
    docName: string,
    action: 'rename' | 'delete',
    nextBaseName: string | undefined,
    projectId: string | null,
): Promise<DocReferenceCheckResult> {
    const response = await fetch(withResourceProject('/api/docs/check-references', projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withResourceProjectBody({
            docName,
            action,
            ...(typeof nextBaseName === 'string' && nextBaseName.trim()
                ? { nextBaseName: nextBaseName.trim() }
                : {}),
        }, projectId)),
    });
    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw new Error(payload?.error || '检查资源引用失败');
    }
    return {
        docName: String(payload?.docName || docName),
        references: ensureStringArray(payload?.references),
        hasReferences: Boolean(payload?.hasReferences),
        protected: Boolean(payload?.protected),
        code: typeof payload?.code === 'string' ? payload.code : undefined,
        error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
}

export async function checkTemplateReferencesRequest(
    templateName: string,
    action: 'rename' | 'delete',
    nextBaseName: string | undefined,
    projectId: string | null,
): Promise<DocReferenceCheckResult> {
    const response = await fetch(withResourceProject('/api/docs/templates/check-references', projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withResourceProjectBody({
            templateName,
            action,
            ...(typeof nextBaseName === 'string' && nextBaseName.trim()
                ? { nextBaseName: nextBaseName.trim() }
                : {}),
        }, projectId)),
    });
    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw new Error(payload?.error || '检查模板引用失败');
    }
    return {
        docName: String(payload?.templateName || templateName),
        references: ensureStringArray(payload?.references),
        hasReferences: Boolean(payload?.hasReferences),
        protected: Boolean(payload?.protected),
        code: typeof payload?.code === 'string' ? payload.code : undefined,
        error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
}

export function buildDocReferencePromptDialog(dialogParams: {
    action: 'rename' | 'delete';
    item: ItemData;
    references: string[];
    nextBaseName?: string;
}) {
    const references = Array.from(new Set(ensureStringArray(dialogParams.references)));
    const prompt = dialogParams.action === 'rename'
        ? generateRenameDocReferencePrompt({
            docName: dialogParams.item.name,
            currentDisplayName: dialogParams.item.displayName,
            nextBaseName: String(dialogParams.nextBaseName || '').trim(),
            references,
        })
        : generateDeleteDocReferencePrompt({
            docName: dialogParams.item.name,
            currentDisplayName: dialogParams.item.displayName,
            references,
        });
    return {
        title: dialogParams.action === 'rename' ? '检测到资源引用，需先处理后改名' : '检测到资源引用，需先处理后删除',
        description: dialogParams.action === 'rename'
            ? `资源「${dialogParams.item.displayName}」当前仍被项目内文件引用，请先修复引用，再执行改名。`
            : `资源「${dialogParams.item.displayName}」当前仍被项目内文件引用，请先清理引用，再执行删除。`,
        references,
        prompt,
        scene: dialogParams.action === 'rename' ? 'rename-doc-ref-fix' : 'delete-doc-ref-fix',
        targetPath: getLocalPathForItem(dialogParams.item),
    };
}

export function buildTemplateReferencePromptDialog(dialogParams: {
    action: 'rename' | 'delete';
    item: any;
    references: string[];
    nextBaseName?: string;
}) {
    const references = Array.from(new Set(ensureStringArray(dialogParams.references)));
    const prompt = dialogParams.action === 'rename'
        ? generateRenameTemplateReferencePrompt({
            templateName: dialogParams.item.name,
            currentDisplayName: dialogParams.item.displayName,
            nextBaseName: String(dialogParams.nextBaseName || '').trim(),
            references,
        })
        : generateDeleteTemplateReferencePrompt({
            templateName: dialogParams.item.name,
            currentDisplayName: dialogParams.item.displayName,
            references,
        });
    return {
        title: dialogParams.action === 'rename' ? '检测到模板引用，需先处理后改名' : '检测到模板引用，需先处理后删除',
        description: dialogParams.action === 'rename'
            ? `模板「${dialogParams.item.displayName}」当前仍被项目内文件引用，请先修复引用，再执行改名。`
            : `模板「${dialogParams.item.displayName}」当前仍被项目内文件引用，请先清理引用，再执行删除。`,
        references,
        prompt,
        scene: dialogParams.action === 'rename' ? 'rename-template-ref-fix' : 'delete-template-ref-fix',
        targetPath: getLocalPathForItem(dialogParams.item),
    };
}
