export declare const DESIGN_KNOWLEDGE_MANIFEST_URL = "https://lintendo.github.io/Make-Template/knowledge/latest/manifest.json";
export declare const DESIGN_KNOWLEDGE_READER_VERSION = "1.0.0";
export declare const THEME_CATALOG_CACHE_TTL_MS: number;
export type ThemeCatalogPlatform = 'desktop' | 'mobile';
export interface ThemeCatalogItem {
    id: string;
    slug: string;
    title: string;
    platform: ThemeCatalogPlatform;
    description: string;
    tags: string[];
    previewUrl: string;
    coverUrl?: string;
    canDirectImport: boolean;
    directImportDisabledReason?: string;
}
export interface ThemeCatalogLoadResult {
    platform: ThemeCatalogPlatform;
    total: number;
    stale: boolean;
    designSystems: ThemeCatalogItem[];
}
export interface ThemeCatalogRecord extends ThemeCatalogItem {
    publishable: boolean;
    reasons: string[];
    packageUrl?: string;
    packageHash?: string;
}
interface CatalogOptions {
    fetch?: typeof globalThis.fetch;
    now?: () => number;
    manifestUrl?: string;
}
export declare function validateThemePackageArchive(bytes: Buffer): string[];
export declare function createDesignKnowledgeThemeCatalog(options?: CatalogOptions): {
    load: (platform: ThemeCatalogPlatform) => Promise<ThemeCatalogLoadResult>;
    getRecord: (platform: ThemeCatalogPlatform, themeId: string) => Promise<ThemeCatalogRecord | null>;
    downloadPackage: (record: ThemeCatalogRecord) => Promise<Buffer>;
};
export declare const designKnowledgeThemeCatalog: {
    load: (platform: ThemeCatalogPlatform) => Promise<ThemeCatalogLoadResult>;
    getRecord: (platform: ThemeCatalogPlatform, themeId: string) => Promise<ThemeCatalogRecord | null>;
    downloadPackage: (record: ThemeCatalogRecord) => Promise<Buffer>;
};
export {};
