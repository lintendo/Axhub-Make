import type { DataType, ItemData, PrototypePlaceholderGuide } from '../types';
import type {
    ThemeResourceItem,
} from '../domains/resources/resource.types';
import { buildMarkdownFileUrl, buildSpecTemplatePreviewUrl } from '../utils/markdownPreview';

export interface ProjectCapabilities {
    lanAccessAllowed: boolean;
    quickEdit?: boolean;
    quickEditMode?: string;
    figmaExport?: boolean;
    axureExport?: boolean;
    localExports: LocalExportCapabilities;
    resourceWrites: ResourceWriteCapabilities;
}

export interface LocalExportCapabilities {
    html: boolean;
    make: boolean;
}

export interface ResourceWriteCapabilities {
    prototypeCreate: boolean;
    prototypeUpload: boolean;
    docCreate: boolean;
    docImport: boolean;
    themeCreate: boolean;
    themeImport: boolean;
    dataCreate: boolean;
    dataImport: boolean;
    templateCreate: boolean;
    templateDuplicate: boolean;
}

export const DEFAULT_RESOURCE_WRITE_CAPABILITIES: ResourceWriteCapabilities = {
    prototypeCreate: false,
    prototypeUpload: false,
    docCreate: false,
    docImport: false,
    themeCreate: false,
    themeImport: false,
    dataCreate: false,
    dataImport: false,
    templateCreate: false,
    templateDuplicate: false,
};

export const DEFAULT_LOCAL_EXPORT_CAPABILITIES: LocalExportCapabilities = {
    html: false,
    make: false,
};

export const DEFAULT_PROJECT_CAPABILITIES: ProjectCapabilities = {
    lanAccessAllowed: true,
    localExports: DEFAULT_LOCAL_EXPORT_CAPABILITIES,
    resourceWrites: DEFAULT_RESOURCE_WRITE_CAPABILITIES,
};

export const DEFAULT_PROTOTYPE_PLACEHOLDER_GUIDE: PrototypePlaceholderGuide = {
    kind: 'prototype-empty',
    title: '这个原型还没有开始创建',
    description: '告诉 AI 你想做什么：目标用户、使用场景、页面内容和参考风格。',
    steps: [],
    tips: [
        '模型不要用 auto，推荐：Claude Opus 4.8、Gemini 3.1 Pro、GPT-5.5、Kimi K2.7、GLM-5.2。',
        '一个任务一个对话，避免多个需求互相干扰。',
        '多用图片和语音，截图、草图和参考页面更清楚。',
        '如果已有视觉规范，建议先创建设计系统。',
    ],
};

export interface ProjectResourceBundle {
    projectId: string | null;
    projectName: string | null;
    capabilities: ProjectCapabilities;
    data: DataType;
    docs: ItemData[];
    themes: ThemeResourceItem[];
    dataTables: [];
    templates: [];
    orders: {
        themes: string[];
    };
}

export interface ProjectListItem {
    id: string;
    name: string;
    root: string;
    metadataPath?: string;
    createdAt?: string;
    updatedAt?: string;
    runtimeStatus?: ProjectRuntimeStatus;
}

export interface ProjectListPayload {
    activeProjectId: string | null;
    projects: ProjectListItem[];
}

export interface ProjectRuntimeStatus {
    projectId: string | null;
    makeClient: boolean;
    running: boolean;
    runtime: Record<string, unknown> | null;
    reason: string;
}

export function buildDocContentEndpoint(projectId: string | null, resourceId: string): string {
    const normalizedResourceId = String(resourceId || '').trim();
    if (!projectId || !normalizedResourceId) {
        return '';
    }
    return `/api/projects/${encodeURIComponent(projectId)}/docs/${encodeURIComponent(normalizedResourceId)}/content`;
}

function withProjectIdQuery(url: string, projectId: string | null): string {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId || !url) {
        return url;
    }
    const [path, query = ''] = url.split('?');
    const params = new URLSearchParams(query);
    params.set('projectId', normalizedProjectId);
    const nextQuery = params.toString();
    return nextQuery ? `${path}?${nextQuery}` : path;
}

function hasFileExtension(value: unknown): boolean {
    const normalized = pickString(value).replace(/\\/g, '/').split('/').pop() || '';
    return /\.[a-z0-9]+$/iu.test(normalized);
}

function getDocRelativePathFromResourcePath(value: unknown): string {
    const normalizedPath = pickString(value).replace(/\\/g, '/');
    if (!normalizedPath) {
        return '';
    }
    const markers = [
        '/src/resources/',
        'src/resources/',
        '/content/docs/',
        'content/docs/',
    ];
    for (const marker of markers) {
        const index = normalizedPath.indexOf(marker);
        if (index >= 0) {
            return normalizedPath.slice(index + marker.length).replace(/^\/+/, '');
        }
    }
    return '';
}

function resolveDocFileRouteName(resourceName: string, markdownPath: string): string {
    if (hasFileExtension(resourceName)) {
        return resourceName.replace(/\\/g, '/').replace(/^\/+/, '');
    }
    const pathRouteName = getDocRelativePathFromResourcePath(markdownPath);
    return pathRouteName || resourceName.replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildDocsFileUrl(routeName: string, projectId: string | null): string {
    const normalizedRouteName = String(routeName || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedRouteName || !String(projectId || '').trim()) {
        return '';
    }
    return withProjectIdQuery(`/api/docs/${encodeURIComponent(normalizedRouteName)}`, projectId);
}

function pickString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function pickOptionalString(value: unknown): string | null {
    return typeof value === 'string' ? value.trim() : null;
}

function pickNonNegativeNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeResourceOpenMode(value: unknown): ItemData['openMode'] | undefined {
    return value === 'document'
        || value === 'canvas'
        || value === 'drawio'
        || value === 'image'
        || value === 'file'
        ? value
        : undefined;
}

function getResourceFileExtension(value: unknown): string {
    const normalized = String(value || '').trim().replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('.drawio.svg')) {
        return '.drawio.svg';
    }
    const fileName = normalized.split('/').filter(Boolean).pop() || '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
}

function inferResourceOpenMode(...values: unknown[]): ItemData['openMode'] | undefined {
    for (const value of values) {
        const ext = getResourceFileExtension(value);
        if (ext === '.excalidraw') return 'canvas';
        if (ext === '.drawio' || ext === '.drawio.svg') return 'drawio';
    }
    return undefined;
}

function buildResourceFilePath(resourceRouteName: string, explicitFilePath: string): string {
    if (explicitFilePath) {
        return explicitFilePath;
    }
    const normalizedRouteName = String(resourceRouteName || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    return normalizedRouteName ? `src/resources/${normalizedRouteName}` : '';
}

const PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizePageId(value: unknown): string {
    const id = pickString(value);
    return PAGE_ID_RE.test(id) ? id : '';
}

function hasMarkdownExtension(value: unknown): boolean {
    const rawValue = String(value || '').trim();
    if (!rawValue) return false;

    const candidates = [rawValue];
    for (let index = 0; index < 2; index += 1) {
        const previous = candidates[candidates.length - 1];
        try {
            const decoded = decodeURIComponent(previous);
            if (decoded === previous) break;
            candidates.push(decoded);
        } catch {
            break;
        }
    }

    return candidates.some((candidate) => /\.md(?:$|[?#&/])/i.test(candidate));
}

export function normalizeProjectsPayload(payload: unknown): ProjectListPayload {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const projects = Array.isArray(raw.projects)
        ? raw.projects
            .map((project: unknown): ProjectListItem | null => {
                const item = project && typeof project === 'object' ? project as Record<string, unknown> : {};
                const id = pickString(item.id);
                const root = pickString(item.root);
                if (!id || !root) {
                    return null;
                }
                const explicitName = pickOptionalString(item.name);
                return {
                    id,
                    name: explicitName === null ? id : explicitName,
                    root,
                    metadataPath: pickString(item.metadataPath) || undefined,
                    createdAt: pickString(item.createdAt) || undefined,
                    updatedAt: pickString(item.updatedAt) || undefined,
                    runtimeStatus: normalizeProjectRuntimeStatusPayload(item.runtimeStatus, id),
                };
            })
            .filter((project): project is ProjectListItem => Boolean(project))
        : [];

    const activeProjectId = pickString(raw.activeProjectId);
    return {
        activeProjectId: activeProjectId || projects[0]?.id || null,
        projects,
    };
}

export function normalizeProjectRuntimeStatusPayload(
    payload: unknown,
    fallbackProjectId: string | null,
): ProjectRuntimeStatus {
    const raw = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
    const makeClient = raw.makeClient === true;
    const running = raw.running === true;
    const runtime = raw.runtime && typeof raw.runtime === 'object' && !Array.isArray(raw.runtime)
        ? raw.runtime as Record<string, unknown>
        : null;
    const reason = pickString(raw.reason) || (makeClient ? '' : 'not-make-client');

    return {
        projectId: pickString(raw.projectId) || fallbackProjectId,
        makeClient,
        running,
        runtime: running ? runtime : null,
        reason,
    };
}

function normalizeResourceId(resource: Record<string, unknown>): string {
    return pickString(resource.id) || pickString(resource.name);
}

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
}

function normalizePlaceholderGuide(value: unknown): PrototypePlaceholderGuide | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    const kind = pickString(raw.kind);
    const title = pickString(raw.title);
    const description = pickString(raw.description);
    const steps = normalizeStringArray(raw.steps);
    const tips = normalizeStringArray(raw.tips);
    if (!kind || !title || !description) {
        return undefined;
    }
    return {
        kind,
        title,
        description,
        steps,
        tips,
    };
}

function normalizePrototypeRoutePages(value: unknown): { id: string; title: string; group?: string }[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((page): { id: string; title: string; group?: string } | null => {
            const raw = page && typeof page === 'object' && !Array.isArray(page)
                ? page as Record<string, unknown>
                : {};
            const id = normalizePageId(raw.id);
            const title = pickString(raw.title);
            const group = pickString(raw.group);
            return id && title ? { id, title, ...(group ? { group } : {}) } : null;
        })
        .filter((page): page is { id: string; title: string; group?: string } => Boolean(page));
}

function normalizePrototypeGenerationStatus(value: unknown): ItemData['generationStatus'] | undefined {
    return value === 'waiting' ? 'waiting' : undefined;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

export function normalizeResourceWriteCapabilities(value: unknown): ResourceWriteCapabilities {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Partial<Record<keyof ResourceWriteCapabilities, unknown>>
        : {};

    return {
        prototypeCreate: pickBoolean(raw.prototypeCreate, DEFAULT_RESOURCE_WRITE_CAPABILITIES.prototypeCreate),
        prototypeUpload: pickBoolean(raw.prototypeUpload, DEFAULT_RESOURCE_WRITE_CAPABILITIES.prototypeUpload),
        docCreate: pickBoolean(raw.docCreate, DEFAULT_RESOURCE_WRITE_CAPABILITIES.docCreate),
        docImport: pickBoolean(raw.docImport, DEFAULT_RESOURCE_WRITE_CAPABILITIES.docImport),
        themeCreate: pickBoolean(raw.themeCreate, DEFAULT_RESOURCE_WRITE_CAPABILITIES.themeCreate),
        themeImport: pickBoolean(raw.themeImport, DEFAULT_RESOURCE_WRITE_CAPABILITIES.themeImport),
        dataCreate: pickBoolean(raw.dataCreate, DEFAULT_RESOURCE_WRITE_CAPABILITIES.dataCreate),
        dataImport: pickBoolean(raw.dataImport, DEFAULT_RESOURCE_WRITE_CAPABILITIES.dataImport),
        templateCreate: pickBoolean(raw.templateCreate, DEFAULT_RESOURCE_WRITE_CAPABILITIES.templateCreate),
        templateDuplicate: pickBoolean(raw.templateDuplicate, DEFAULT_RESOURCE_WRITE_CAPABILITIES.templateDuplicate),
    };
}

export function normalizeLocalExportCapabilities(value: unknown): LocalExportCapabilities {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Partial<Record<keyof LocalExportCapabilities, unknown>>
        : {};

    return {
        html: pickBoolean(raw.html, DEFAULT_LOCAL_EXPORT_CAPABILITIES.html),
        make: pickBoolean(raw.make, DEFAULT_LOCAL_EXPORT_CAPABILITIES.make),
    };
}

function normalizeProjectCapabilities(value: unknown): ProjectCapabilities {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

    const capabilities: ProjectCapabilities = {
        lanAccessAllowed: pickBoolean(raw.lanAccessAllowed, DEFAULT_PROJECT_CAPABILITIES.lanAccessAllowed),
        localExports: normalizeLocalExportCapabilities(raw.localExports),
        resourceWrites: normalizeResourceWriteCapabilities(raw.resourceWrites),
    };
    if (typeof raw.quickEdit === 'boolean') capabilities.quickEdit = raw.quickEdit;
    const quickEditMode = pickString(raw.quickEditMode);
    if (quickEditMode) capabilities.quickEditMode = quickEditMode;
    if (typeof raw.figmaExport === 'boolean') capabilities.figmaExport = raw.figmaExport;
    if (typeof raw.axureExport === 'boolean') capabilities.axureExport = raw.axureExport;
    return capabilities;
}

export function normalizeProjectPrototypeResource(
    resource: Record<string, unknown>,
    projectId: string | null,
): ItemData | null {
    const name = normalizeResourceId(resource);
    if (!name) {
        return null;
    }

    const displayName = pickString(resource.title) || pickString(resource.displayName) || pickString(resource.name) || name;
    const clientUrl = pickString(resource.clientUrl);
    const filePath = pickString(resource.filePath);
    const absoluteFilePath = pickString(resource.absoluteFilePath);
    const specFilePath = pickString(resource.specFilePath);
    const artifacts = resource.artifacts && typeof resource.artifacts === 'object' && !Array.isArray(resource.artifacts)
        ? resource.artifacts as Record<string, unknown>
        : undefined;
    const placeholderGuide = normalizePlaceholderGuide(resource.placeholderGuide);
    const placeholder = resource.placeholder === true;
    const generationStatus = normalizePrototypeGenerationStatus(resource.generationStatus);
    const pages = normalizePrototypeRoutePages(resource.pages);
    const requestedDefaultPageId = normalizePageId(resource.defaultPageId);
    const defaultPageId = pages.some((page) => page.id === requestedDefaultPageId)
        ? requestedDefaultPageId
        : pages[0]?.id || '';

    return {
        name,
        displayName,
        jsUrl: '',
        specUrl: '',
        previewUrl: clientUrl,
        clientUrl: clientUrl || undefined,
        filePath: filePath || undefined,
        absoluteFilePath: absoluteFilePath || undefined,
        ...(specFilePath ? { specFilePath } : {}),
        artifacts,
        projectId: projectId || undefined,
        resourceId: name,
        previewDisabled: resource.previewDisabled === true || !clientUrl,
        placeholder,
        ...(placeholder ? { placeholderGuide: placeholderGuide || DEFAULT_PROTOTYPE_PLACEHOLDER_GUIDE } : {}),
        ...(generationStatus ? { generationStatus } : {}),
        ...(pages.length > 0 ? { pages, defaultPageId } : {}),
    };
}

export function normalizeProjectDocResource(
    resource: Record<string, unknown>,
    projectId: string | null,
): ItemData | null {
    const name = normalizeResourceId(resource);
    if (!name) {
        return null;
    }

    const displayName = pickString(resource.title) || pickString(resource.displayName) || pickString(resource.name) || name;
    const markdownPath = pickString(resource.path);
    const explicitFilePath = pickString(resource.filePath);
    const absoluteFilePath = pickString(resource.absoluteFilePath);
    const fileSize = pickNonNegativeNumber(resource.fileSize) ?? pickNonNegativeNumber(resource.size);
    const ext = pickString(resource.ext);
    const openMode = normalizeResourceOpenMode(resource.openMode)
        || inferResourceOpenMode(ext, name, displayName, markdownPath, explicitFilePath, absoluteFilePath);
    const contentEndpoint = buildDocContentEndpoint(projectId, name);
    const isMarkdown = [
        name,
        markdownPath,
    ].some(hasMarkdownExtension);
    const looksLikeFileResource = Boolean(markdownPath) || hasFileExtension(name);
    const docFileRouteName = !isMarkdown && looksLikeFileResource
        ? resolveDocFileRouteName(name, markdownPath)
        : '';
    const directDocsFileUrl = !isMarkdown && looksLikeFileResource
        ? buildDocsFileUrl(docFileRouteName, projectId)
        : '';
    const itemName = directDocsFileUrl && docFileRouteName ? docFileRouteName : name;
    const markdownUrl = isMarkdown && contentEndpoint
        ? contentEndpoint
        : directDocsFileUrl
            || (projectId && markdownPath ? buildMarkdownFileUrl(markdownPath, projectId) : '')
            || contentEndpoint;
    const shouldUseSpecTemplatePreview = isMarkdown || (!markdownPath && !directDocsFileUrl);
    const resourceRelativePath = getDocRelativePathFromResourcePath(markdownPath);
    const filePath = explicitFilePath
        || (resourceRelativePath ? `src/resources/${resourceRelativePath}` : '')
        || (openMode ? buildResourceFilePath(itemName, '') : '')
        || markdownPath;

    return {
        name: itemName,
        displayName,
        jsUrl: '',
        specUrl: markdownUrl,
        previewUrl: shouldUseSpecTemplatePreview ? buildSpecTemplatePreviewUrl(markdownUrl) : markdownUrl,
        filePath: filePath || markdownPath || undefined,
        absoluteFilePath: absoluteFilePath || markdownPath || undefined,
        projectId: projectId || undefined,
        resourceId: name,
        ...(openMode ? { openMode } : {}),
        ...(openMode === 'canvas' && filePath ? { canvasFilePath: filePath } : {}),
        ...(ext ? { ext } : {}),
        ...(fileSize !== undefined ? { fileSize } : {}),
    };
}

export function normalizeProjectThemeResource(resource: Record<string, unknown>, projectId: string | null): ThemeResourceItem | null {
    const name = normalizeResourceId(resource);
    if (!name) {
        return null;
    }

    const displayName = pickString(resource.title) || pickString(resource.displayName) || pickString(resource.name) || name;
    const previewUrl = pickString(resource.clientUrl) || pickString(resource.previewUrl);
    const sourcePath = pickString(resource.sourcePath);
    const pathValue = pickString(resource.path) || pickString(resource.filePath) || sourcePath;
    const absoluteFilePath = pickString(resource.absoluteFilePath);
    const description = pickString(resource.description);

    return {
        name,
        displayName,
        projectId: projectId || undefined,
        clientUrl: previewUrl,
        previewUrl,
        description: description || undefined,
        hasDoc: typeof resource.hasDoc === 'boolean' ? resource.hasDoc : undefined,
        hasIndexTsx: typeof resource.hasIndexTsx === 'boolean' ? resource.hasIndexTsx : undefined,
        path: pathValue || undefined,
        absoluteFilePath: absoluteFilePath || undefined,
    };
}

export function normalizeProjectResourcesPayload(payload: unknown, projectId: string | null): ProjectResourceBundle {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, any> : {};
    const resources = raw.resources && typeof raw.resources === 'object' ? raw.resources : raw;
    const orders = raw.orders && typeof raw.orders === 'object' ? raw.orders : {};
    const capabilities = normalizeProjectCapabilities(raw.capabilities);
    const project = raw.project && typeof raw.project === 'object' ? raw.project : {};
    const resolvedProjectId = projectId || pickString(project.id) || null;

    const prototypes = Array.isArray(resources.prototypes)
        ? resources.prototypes
            .map((resource: unknown) => normalizeProjectPrototypeResource(
                resource && typeof resource === 'object' ? resource as Record<string, unknown> : {},
                resolvedProjectId,
            ))
            .filter((item: ItemData | null): item is ItemData => Boolean(item))
        : [];

    const docs = Array.isArray(resources.docs)
        ? resources.docs
            .map((resource: unknown) => normalizeProjectDocResource(
                resource && typeof resource === 'object' ? resource as Record<string, unknown> : {},
                resolvedProjectId,
            ))
            .filter((item: ItemData | null): item is ItemData => Boolean(item))
        : [];

    const themes = Array.isArray(resources.themes)
        ? resources.themes
            .map((resource: unknown) => normalizeProjectThemeResource(
                resource && typeof resource === 'object' ? resource as Record<string, unknown> : {},
                resolvedProjectId,
            ))
            .filter((item: ThemeResourceItem | null): item is ThemeResourceItem => Boolean(item))
        : [];

    return {
        projectId: resolvedProjectId,
        projectName: pickOptionalString(project.name),
        capabilities,
        data: {
            components: [],
            prototypes,
        },
        docs,
        themes,
        dataTables: [],
        templates: [],
        orders: {
            themes: normalizeStringArray(orders.themes),
        },
    };
}
