import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface AxhubReviewProjectContext {
    project: {
        id: string;
        root: string;
    };
}
interface AxhubReviewApiHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => AxhubReviewProjectContext | null;
    createProjectContextFromBody: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, body: unknown) => AxhubReviewProjectContext | null;
}
export declare function handleAxhubReviewReportsApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, url: URL, handlers: AxhubReviewApiHandlers): boolean;
export {};
