export type ResourceFileOpenMode = 'document' | 'canvas' | 'drawio' | 'image' | 'file';
export interface ResourceFile {
    id: string;
    name: string;
    title: string;
    path: string;
    filePath: string;
    ext: string;
    size: number;
    fileSize: number;
    updatedAt: string;
    absoluteFilePath: string;
    description: string;
    openMode: ResourceFileOpenMode;
}
export declare function getResourcesDir(projectRoot: string): string;
export declare function normalizeResourceRelativePath(value: unknown): string;
export declare function normalizeResourceAssetRelativePath(value: unknown): string;
export declare function isIgnoredResourceRelativePath(relativePath: string): boolean;
export declare function isResourceAssetSidecarDirectoryName(name: string): boolean;
export declare function getResourceAssetRelativePath(resourcePath: unknown): string;
export declare function getResourceAssetDirectory(resourcesDir: string, resourcePath: unknown): string | null;
export declare function getResourceFileExt(fileName: string): string;
export declare function getResourceOpenMode(fileName: string): ResourceFileOpenMode;
export declare function scanResourceFiles(projectRoot: string): ResourceFile[];
export declare function resolveResourceFilePath(projectRoot: string, resourcePath: unknown, options?: {
    allowAssetPath?: boolean;
}): {
    relativePath: string;
    absolutePath: string;
    resourcesDir: string;
} | null;
