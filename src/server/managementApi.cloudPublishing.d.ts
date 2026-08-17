import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ProjectMetadata, type ServerCloudPublishingConfig } from './projectCore/index.ts';
import type { ManagementApiOptions } from './managementApi.ts';
export type CloudPublishTarget = 'vercel' | 'cloudflare-pages' | 's3' | 'github-pages' | 'axhub';
export type CommandExecutor = (command: string, args: string[], options: {
    cwd: string;
}) => Promise<{
    stdout: string;
    stderr: string;
}>;
interface CloudPublishingContext {
    project: {
        id: string;
        root: string;
    };
    metadata?: ProjectMetadata;
}
interface CloudPublishingHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => CloudPublishingContext | null;
    resolveSourceFileFromMetadata: (context: CloudPublishingContext, targetPath: string) => string | null;
    findProjectResourceByPath: (metadata: unknown, targetPath: string) => any;
    getDeclaredResourceWriteDir?: (context: CloudPublishingContext, type: 'media') => string | null;
    getServerConfigStoreForRequest: (options: ManagementApiOptions) => {
        getConfig: (params: {
            activeProjectRoot: string;
        }) => {
            cloudPublishing: CloudPublishingConfig;
        };
        saveConfig: (config: {
            cloudPublishing?: CloudPublishingConfig;
        }) => {
            cloudPublishing: CloudPublishingConfig;
        };
    };
    commandExecutor?: CommandExecutor;
    sendDisabledCapability: (res: ServerResponse, status: number, payload: {
        code: string;
        error: string;
        projectId?: string;
        projectRoot?: string;
        path?: string;
        sourceRequired?: boolean;
    }) => void;
}
type CloudPublishingConfig = ServerCloudPublishingConfig;
type S3Config = NonNullable<CloudPublishingConfig['s3']>;
declare function normalizeCloudPublishingConfig(value: unknown, fallback?: CloudPublishingConfig): CloudPublishingConfig;
declare function joinS3Key(prefix: string | undefined, filePath: string): string;
declare function buildS3Url(bucket: string, region: string, key: string): string;
declare function signS3PutObject(params: {
    config: S3Config;
    key: string;
    body: Buffer;
    contentType: string;
    now: Date;
}): {
    url: string;
    headers: {
        'Content-Type': string;
        'x-amz-content-sha256': string;
        'x-amz-date': string;
        Authorization: string;
    };
};
export declare function handleCloudPublishingApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: CloudPublishingHandlers): boolean;
export declare const __cloudPublishingTestUtils: {
    normalizeCloudPublishingConfig: typeof normalizeCloudPublishingConfig;
    signS3PutObject: typeof signS3PutObject;
    joinS3Key: typeof joinS3Key;
    buildS3Url: typeof buildS3Url;
};
export {};
