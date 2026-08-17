import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
import { type AxhubPublishFile, type AxhubPublishResponse } from './axhubAuthClient.ts';
import { type ProjectMetadata } from './projectCore/index.ts';
interface AxhubPublishContext {
    project: {
        id: string;
        root: string;
    };
    metadata?: ProjectMetadata;
}
interface AxhubApiHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => AxhubPublishContext | null;
    resolveSourceFileFromMetadata: (context: AxhubPublishContext, targetPath: string) => string | null;
    findProjectResourceByPath: (metadata: unknown, targetPath: string) => any;
    getDeclaredResourceWriteDir?: (context: AxhubPublishContext, type: 'media') => string | null;
    readProjectConfig: (projectRoot: string) => any;
    sendDisabledCapability: (res: ServerResponse, status: number, payload: {
        code: string;
        error: string;
        projectId?: string;
        projectRoot?: string;
        path?: string;
        sourceRequired?: boolean;
    }) => void;
}
export declare function normalizeFilesForAxhub(files: Array<{
    path: string;
    contentType: string;
    body: Buffer;
}>): AxhubPublishFile[];
export declare function normalizeAxhubPublishResultUrl(result: AxhubPublishResponse, onlineBaseUrl: string): AxhubPublishResponse;
export declare function publishAxhubHtmlTarget(params: {
    options: ManagementApiOptions;
    pid: number;
    files: Array<{
        path: string;
        contentType: string;
        body: Buffer;
    }>;
    reviewContext?: {
        projectId: string;
        prototypeId: string;
    };
}): Promise<AxhubPublishResponse>;
export declare function handleAxhubApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: AxhubApiHandlers): boolean;
export {};
