import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface SourceBackedExportContext {
    project: {
        id: string;
        root: string;
    };
}
interface SourceBackedExportHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required') => SourceBackedExportContext | null;
    resolveSourceFileFromMetadata: (context: SourceBackedExportContext, targetPath: string) => string | null;
    getAxureArtifactPaths: (context: SourceBackedExportContext, targetPath: string) => {
        resource: any;
        runtimeBuiltJsPath: string | null;
        runtimeBuiltJsRelativePath: string;
        indexBundlePath: string | null;
    };
    readJsonFile: <T>(filePath: string, fallback: T) => T;
    getDeclaredResourceWriteDir?: (context: SourceBackedExportContext, type: 'media') => string | null;
    sendDisabledCapability: (res: ServerResponse, status: number, payload: {
        code: string;
        error: string;
        projectId?: string;
        projectRoot?: string;
        resourceId?: string;
        path?: string;
        adapterRequired?: boolean;
        sourceRequired?: boolean;
        runtime?: Record<string, unknown>;
        details?: Record<string, unknown>;
    }) => void;
    buildAttachmentContentDisposition: (fileName: string) => string;
}
export declare function handleSourceBackedExports(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, url: URL, handlers: SourceBackedExportHandlers): Promise<boolean>;
export declare function handleUnavailableManagement(req: IncomingMessage, res: ServerResponse, pathname: string, sendDisabledCapability: SourceBackedExportHandlers['sendDisabledCapability']): boolean;
export {};
