import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface SourceZipProjectContext {
    project: {
        id: string;
        root: string;
    };
    metadata: any;
}
interface SourceZipApiHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required') => SourceZipProjectContext | null;
    findProjectResourceByPath: (metadata: SourceZipProjectContext['metadata'], rawPath: string) => any;
    resolveSourceFileFromMetadata: (context: SourceZipProjectContext, rawPath: string) => string | null;
    sendDisabledCapability: (res: ServerResponse, status: number, payload: {
        code: string;
        error: string;
        projectId?: string;
        projectRoot?: string;
        path?: string;
        sourceRequired?: boolean;
    }) => void;
}
export declare function handleProjectSourceAndZipApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, requestContext: SourceZipProjectContext, pathname: string, url: URL, handlers: SourceZipApiHandlers): boolean;
export {};
