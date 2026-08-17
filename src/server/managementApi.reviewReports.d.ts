import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ProjectMetadata, type RegisteredProject } from './projectCore/index.ts';
import type { ManagementApiOptions } from './managementApi.ts';
interface ReviewReportsProjectContext {
    project: RegisteredProject;
    metadata: ProjectMetadata;
    metadataStore: {
        getMetadata: () => ProjectMetadata;
        saveMetadata: (metadata: ProjectMetadata) => ProjectMetadata;
    };
}
interface MultipartPart {
    name: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
}
interface ReviewReportsApiHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => ReviewReportsProjectContext | null;
    createProjectContextFromBody: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, body: unknown) => ReviewReportsProjectContext | null;
    createProjectContextFromMultipartParts: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, parts: MultipartPart[]) => ReviewReportsProjectContext | null;
    readMultipartParts: (req: IncomingMessage) => Promise<MultipartPart[]>;
    readProjectConfig: (projectRoot: string) => any;
}
export declare function handleReviewReportsApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, url: URL, handlers: ReviewReportsApiHandlers): boolean;
export {};
