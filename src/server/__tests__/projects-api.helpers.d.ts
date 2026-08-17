import type { GitWorkspaceCommandExecutor } from '../managementApi.git.ts';
export declare function createTempRoot(prefix?: string): string;
export declare function cleanupProjectApiTestRoots(): void;
export declare function writeJson(filePath: string, value: unknown): void;
export declare function writeMakeClientProjectMarker(projectRoot: string, id: string, name: string): void;
export declare function writeProjectMetadata(projectRoot: string, overrides?: Record<string, unknown>, options?: {
    makeClientMarker?: boolean;
}): {
    docPath: string;
};
export declare function getTestProjectRegistryPath(registryHome: string): string;
export declare function startTestServer(projectRoot: string, registryHomeOrOptions?: string | {
    runtimeOrigin?: string;
    serverConfig?: unknown;
    gitWorkspaceCommandExecutor?: GitWorkspaceCommandExecutor;
}, options?: {
    runtimeOrigin?: string;
    serverConfig?: unknown;
    gitWorkspaceCommandExecutor?: GitWorkspaceCommandExecutor;
}): Promise<import("../index.ts").RunningMakeServer>;
export declare function registerProject(origin: string, projectRoot: string, id: string, name?: string): Promise<any>;
export declare function setActiveProject(origin: string, projectId: string): Promise<any>;
export declare function scopeProjectApiUrl(projectRoot: string, rawUrl: string): string;
export declare function writeTable(projectRoot: string, fileName: string, tableName: string, records: any[]): void;
export declare function createZipFromDirectory(sourceDir: string, zipPath: string): void;
export declare function initGitRepo(projectRoot: string): Promise<void>;
