import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface ReferenceProjectContext {
    project: {
        id: string;
        root: string;
    };
}
interface MultipartPart {
    name: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
}
interface UploadAndReferenceHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required') => ReferenceProjectContext | null;
    readMultipartParts: (req: IncomingMessage) => Promise<MultipartPart[]>;
    resolveMarkdownFileAssetPath: (context: ReferenceProjectContext, markdownPath: string, assetPath: string) => string | null;
    resolveLegacySpecDocPath: (context: ReferenceProjectContext, docUrl: string) => string;
    getDeclaredResourceWriteDir: (context: ReferenceProjectContext, type: 'media') => string | null;
    sendResourceWriteAdapterRequired: (res: ServerResponse, context: ReferenceProjectContext, route: string, details?: Record<string, unknown>) => void;
    encodeUrlPathSegments: (value: string) => string;
}
export declare function handleUploadAndReferenceApis(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: UploadAndReferenceHandlers): boolean;
export {};
