import fs from 'node:fs';
import path from 'node:path';
import { getProjectMetadataPath, resolveProjectRoot, } from './paths.ts';
function nowIso() {
    return new Date().toISOString();
}
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function stringList(value) {
    return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}
const PAGE_ID_RE = /^[a-z0-9-]+$/u;
function normalizePageId(value) {
    const id = stringValue(value);
    return PAGE_ID_RE.test(id) ? id : '';
}
function createDefaultMetadata(projectRoot) {
    const name = path.basename(resolveProjectRoot(projectRoot)) || 'project';
    return {
        schemaVersion: 1,
        project: {
            id: name,
            name,
        },
        resources: {
            prototypes: [],
            themes: [],
        },
        navigation: {
            prototypes: [],
        },
        orders: {
            themes: [],
        },
        capabilities: {
            quickEdit: true,
            quickEditMode: 'clientRuntime',
            figmaExport: true,
            axureExport: true,
            localExports: createDefaultLocalExportCapabilities(),
            resourceWrites: createDefaultResourceWriteCapabilities(),
        },
        resourceWriteTargets: {},
    };
}
function createDefaultLocalExportCapabilities() {
    return {
        html: false,
        make: false,
    };
}
function createDefaultResourceWriteCapabilities() {
    return {
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
}
function normalizeLocalExportCapabilities(value) {
    const defaults = createDefaultLocalExportCapabilities();
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    return {
        html: typeof raw.html === 'boolean' ? raw.html : defaults.html,
        make: typeof raw.make === 'boolean' ? raw.make : defaults.make,
    };
}
function normalizeResourceWriteCapabilities(value) {
    const defaults = createDefaultResourceWriteCapabilities();
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    return {
        prototypeCreate: typeof raw.prototypeCreate === 'boolean' ? raw.prototypeCreate : defaults.prototypeCreate,
        prototypeUpload: typeof raw.prototypeUpload === 'boolean' ? raw.prototypeUpload : defaults.prototypeUpload,
        docCreate: typeof raw.docCreate === 'boolean' ? raw.docCreate : defaults.docCreate,
        docImport: typeof raw.docImport === 'boolean' ? raw.docImport : defaults.docImport,
        themeCreate: typeof raw.themeCreate === 'boolean' ? raw.themeCreate : defaults.themeCreate,
        themeImport: typeof raw.themeImport === 'boolean' ? raw.themeImport : defaults.themeImport,
        dataCreate: typeof raw.dataCreate === 'boolean' ? raw.dataCreate : defaults.dataCreate,
        dataImport: typeof raw.dataImport === 'boolean' ? raw.dataImport : defaults.dataImport,
        templateCreate: typeof raw.templateCreate === 'boolean' ? raw.templateCreate : defaults.templateCreate,
        templateDuplicate: typeof raw.templateDuplicate === 'boolean' ? raw.templateDuplicate : defaults.templateDuplicate,
    };
}
function isDefaultResourceWriteCapabilities(value) {
    const defaults = createDefaultResourceWriteCapabilities();
    return Object.keys(defaults)
        .every((key) => value[key] === defaults[key]);
}
function serializeMetadataForWrite(metadata) {
    if (!isDefaultResourceWriteCapabilities(metadata.capabilities.resourceWrites)) {
        return metadata;
    }
    const { resourceWrites: _resourceWrites, ...capabilities } = metadata.capabilities;
    return {
        ...metadata,
        capabilities,
    };
}
function normalizeGenericResources(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => {
        const id = stringValue(item.id) || stringValue(item.name);
        if (!id) {
            return null;
        }
        return {
            ...item,
            id,
            ...(stringValue(item.name) ? { name: stringValue(item.name) } : {}),
            ...(stringValue(item.title) ? { title: stringValue(item.title) } : {}),
        };
    })
        .filter((item) => Boolean(item));
}
function normalizePrototypePlaceholderGuide(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const raw = value;
    const kind = stringValue(raw.kind);
    const title = stringValue(raw.title);
    const description = stringValue(raw.description);
    if (!kind || !title || !description) {
        return undefined;
    }
    return {
        kind,
        title,
        description,
        steps: stringList(raw.steps),
        tips: stringList(raw.tips),
    };
}
function normalizePrototypeRoutePages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => {
        const id = normalizePageId(item.id);
        const title = stringValue(item.title);
        const group = stringValue(item.group);
        return id && title ? { id, title, ...(group ? { group } : {}) } : null;
    })
        .filter((item) => Boolean(item));
}
function normalizePrototypeGenerationStatus(value) {
    return value === 'waiting' ? 'waiting' : undefined;
}
function normalizePrototypeResources(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => {
        const id = stringValue(item.id) || stringValue(item.name);
        const name = stringValue(item.name) || id;
        const title = stringValue(item.title) || name;
        const clientUrl = stringValue(item.clientUrl);
        if (!id || !name || !title || !clientUrl) {
            return null;
        }
        const filePath = stringValue(item.filePath);
        const absoluteFilePath = stringValue(item.absoluteFilePath);
        const specFilePath = stringValue(item.specFilePath);
        const artifacts = item.artifacts && typeof item.artifacts === 'object' && !Array.isArray(item.artifacts)
            ? item.artifacts
            : null;
        const placeholderGuide = normalizePrototypePlaceholderGuide(item.placeholderGuide);
        const generationStatus = normalizePrototypeGenerationStatus(item.generationStatus);
        const pages = normalizePrototypeRoutePages(item.pages);
        const requestedDefaultPageId = normalizePageId(item.defaultPageId);
        const defaultPageId = pages.some((page) => page.id === requestedDefaultPageId)
            ? requestedDefaultPageId
            : pages[0]?.id || '';
        const importReport = item.importReport && typeof item.importReport === 'object' && !Array.isArray(item.importReport)
            ? item.importReport
            : null;
        return {
            id,
            name,
            title,
            clientUrl,
            previewMode: 'clientRuntime',
            description: stringValue(item.description),
            updatedAt: stringValue(item.updatedAt) || nowIso(),
            ...(item.placeholder === true ? { placeholder: true } : {}),
            ...(placeholderGuide ? { placeholderGuide } : {}),
            ...(generationStatus ? { generationStatus } : {}),
            ...(filePath ? { filePath } : {}),
            ...(absoluteFilePath ? { absoluteFilePath } : {}),
            ...(specFilePath ? { specFilePath } : {}),
            ...(item.previewDisabled === true ? { previewDisabled: true } : {}),
            ...(artifacts ? { artifacts } : {}),
            ...(pages.length > 0 ? { pages, defaultPageId } : {}),
            ...(importReport ? { importReport } : {}),
        };
    })
        .filter((item) => Boolean(item));
}
function normalizeProjectRelativeWriteTargetPath(projectRoot, resourceType, value) {
    const rawPath = stringValue(value);
    if (!rawPath) {
        return '';
    }
    if (path.isAbsolute(rawPath)) {
        throw new Error(`Resource write target ${resourceType} must use a project-relative path`);
    }
    const normalized = path.posix.normalize(rawPath.replace(/\\/g, '/'));
    const trimmed = normalized.replace(/^\.\/+/u, '').replace(/\/+$/u, '');
    if (!trimmed || trimmed === '.') {
        return '';
    }
    const resolved = path.resolve(projectRoot, trimmed);
    const relative = path.relative(projectRoot, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Resource write target ${resourceType} is outside project root`);
    }
    return trimmed;
}
function normalizeResourceWriteTargets(value, projectRoot) {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const result = {};
    const keys = ['docs', 'templates', 'themes', 'data', 'media', 'prototypes'];
    for (const key of keys) {
        const target = raw[key];
        if (!target || typeof target !== 'object' || Array.isArray(target)) {
            continue;
        }
        const targetRecord = target;
        const targetType = stringValue(targetRecord.type) || 'project-relative-path';
        if (targetType !== 'project-relative-path') {
            throw new Error(`Resource write target ${key} has unsupported type: ${targetType}`);
        }
        const targetPath = normalizeProjectRelativeWriteTargetPath(projectRoot, key, targetRecord.path);
        if (!targetPath) {
            continue;
        }
        result[key] = {
            type: 'project-relative-path',
            path: targetPath,
        };
    }
    return result;
}
function normalizeMetadata(data, projectRoot) {
    const defaults = createDefaultMetadata(projectRoot);
    if (!data || typeof data !== 'object') {
        return defaults;
    }
    const parsed = data;
    const resources = parsed.resources && typeof parsed.resources === 'object' ? parsed.resources : {};
    const navigation = parsed.navigation && typeof parsed.navigation === 'object' ? parsed.navigation : {};
    const orders = parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {};
    const capabilities = parsed.capabilities && typeof parsed.capabilities === 'object' ? parsed.capabilities : {};
    const project = parsed.project && typeof parsed.project === 'object' ? parsed.project : {};
    return {
        schemaVersion: 1,
        project: {
            id: stringValue(project.id) || defaults.project.id,
            name: typeof project.name === 'string' ? project.name.trim() : stringValue(project.id) || defaults.project.name,
        },
        resources: {
            prototypes: normalizePrototypeResources(resources.prototypes),
            themes: normalizeGenericResources(resources.themes),
        },
        navigation: {
            prototypes: stringList(navigation.prototypes),
        },
        orders: {
            themes: stringList(orders.themes),
        },
        capabilities: {
            quickEdit: typeof capabilities.quickEdit === 'boolean' ? capabilities.quickEdit : defaults.capabilities.quickEdit,
            quickEditMode: 'clientRuntime',
            figmaExport: typeof capabilities.figmaExport === 'boolean' ? capabilities.figmaExport : defaults.capabilities.figmaExport,
            axureExport: typeof capabilities.axureExport === 'boolean' ? capabilities.axureExport : defaults.capabilities.axureExport,
            localExports: normalizeLocalExportCapabilities(capabilities.localExports),
            resourceWrites: normalizeResourceWriteCapabilities(capabilities.resourceWrites),
        },
        resourceWriteTargets: normalizeResourceWriteTargets(parsed.resourceWriteTargets, projectRoot),
    };
}
export function createProjectMetadataStore(projectRoot, options) {
    const resolvedProjectRoot = resolveProjectRoot(projectRoot);
    const metadataPath = options?.metadataPath ? path.resolve(options.metadataPath) : getProjectMetadataPath(resolvedProjectRoot);
    const getMetadata = () => normalizeMetadata(readJsonFile(metadataPath), resolvedProjectRoot);
    return {
        getMetadataPath() {
            return metadataPath;
        },
        getMetadata,
        saveMetadata(metadata) {
            const normalized = normalizeMetadata(metadata, resolvedProjectRoot);
            writeJsonAtomic(metadataPath, serializeMetadataForWrite(normalized));
            return normalized;
        },
    };
}
