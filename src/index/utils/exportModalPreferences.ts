import type { AxureCopyOptions, ImageConfig } from '../types';

export type ExportModalTabKey = 'dynamicPrototype' | 'staticPrototype' | 'axureApi' | 'copyConfig' | 'usageGuide';
export type ExportConfigType = '' | 'code';

export interface ExportModalPreferences {
    version: 1;
    activeTabKey?: ExportModalTabKey;
    selectedExportType?: ExportConfigType;
    imageConfig?: Pick<ImageConfig, 'width' | 'height' | 'includeConfig' | 'includeImageAssets' | 'contentType' | 'isFullScreen'>;
    axureCopyOptions?: AxureCopyOptions;
}

const STORAGE_KEY_EXPORT_MODAL_PREFERENCES = 'axhub-admin-export-modal-preferences';

const EXPORT_MODAL_TAB_KEYS: ExportModalTabKey[] = [
    'dynamicPrototype',
    'staticPrototype',
    'axureApi',
    'copyConfig',
    'usageGuide',
];

const EXPORT_CONFIG_TYPES: ExportConfigType[] = [
    '',
    'code',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function sanitizeImageConfig(value: unknown): ExportModalPreferences['imageConfig'] | undefined {
    if (!isRecord(value)) return undefined;

    const width = isPositiveNumber(value.width) ? Math.round(value.width) : undefined;
    const height = isPositiveNumber(value.height) ? Math.round(value.height) : undefined;
    const includeConfig = value.includeConfig === 'none'
        || value.includeConfig === 'code'
        ? value.includeConfig
        : undefined;
    const includeImageAssets = typeof value.includeImageAssets === 'boolean'
        ? value.includeImageAssets
        : undefined;
    const contentType = value.contentType === 'title' || value.contentType === 'screenshot'
        ? value.contentType
        : undefined;

    const isFullScreen = typeof value.isFullScreen === 'boolean' ? value.isFullScreen : undefined;

    if (
        width === undefined
        && height === undefined
        && includeConfig === undefined
        && includeImageAssets === undefined
        && contentType === undefined
        && isFullScreen === undefined
    ) {
        return undefined;
    }

    return {
        width: width ?? 500,
        height: height ?? 300,
        includeConfig: includeConfig ?? 'code',
        includeImageAssets: includeImageAssets ?? true,
        contentType: contentType ?? 'title',
        isFullScreen: isFullScreen ?? true,
    };
}

function sanitizeAxureCopyOptions(value: unknown): ExportModalPreferences['axureCopyOptions'] | undefined {
    if (!isRecord(value)) return undefined;

    const preserveHierarchy = typeof value.preserveHierarchy === 'boolean'
        ? value.preserveHierarchy
        : undefined;
    const preserveSvgIcons = typeof value.preserveSvgIcons === 'boolean'
        ? value.preserveSvgIcons
        : undefined;

    if (preserveHierarchy === undefined && preserveSvgIcons === undefined) {
        return undefined;
    }

    return {
        preserveHierarchy: preserveHierarchy ?? false,
        preserveSvgIcons: preserveSvgIcons ?? true,
    };
}

function sanitizeExportModalPreferences(value: unknown): ExportModalPreferences {
    if (!isRecord(value)) {
        return { version: 1 };
    }

    const activeTabKey = typeof value.activeTabKey === 'string' && EXPORT_MODAL_TAB_KEYS.includes(value.activeTabKey as ExportModalTabKey)
        ? value.activeTabKey as ExportModalTabKey
        : undefined;
    const selectedExportType = typeof value.selectedExportType === 'string' && EXPORT_CONFIG_TYPES.includes(value.selectedExportType as ExportConfigType)
        ? value.selectedExportType as ExportConfigType
        : undefined;

    return {
        version: 1,
        activeTabKey,
        selectedExportType,
        imageConfig: sanitizeImageConfig(value.imageConfig),
        axureCopyOptions: sanitizeAxureCopyOptions(value.axureCopyOptions),
    };
}

export function buildExportModalPreferencesStorageKey(projectPath?: string | null): string {
    const normalizedProjectPath = typeof projectPath === 'string' ? projectPath.trim() : '';
    if (!normalizedProjectPath) {
        return STORAGE_KEY_EXPORT_MODAL_PREFERENCES;
    }
    return `${STORAGE_KEY_EXPORT_MODAL_PREFERENCES}:${encodeURIComponent(normalizedProjectPath)}`;
}

export function readExportModalPreferences(storageKey: string): ExportModalPreferences {
    if (typeof window === 'undefined') {
        return { version: 1 };
    }

    try {
        const rawValue = window.localStorage.getItem(storageKey);
        if (!rawValue) {
            return { version: 1 };
        }
        return sanitizeExportModalPreferences(JSON.parse(rawValue));
    } catch {
        return { version: 1 };
    }
}

export function mergeExportModalPreferences(
    storageKey: string,
    patch: Partial<ExportModalPreferences>,
): ExportModalPreferences {
    const current = readExportModalPreferences(storageKey);
    const next = sanitizeExportModalPreferences({
        ...current,
        ...patch,
        imageConfig: patch.imageConfig ? { ...current.imageConfig, ...patch.imageConfig } : current.imageConfig,
        axureCopyOptions: patch.axureCopyOptions
            ? { ...current.axureCopyOptions, ...patch.axureCopyOptions }
            : current.axureCopyOptions,
    });

    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
        }
    }

    return next;
}
