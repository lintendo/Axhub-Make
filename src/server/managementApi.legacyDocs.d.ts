import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ProjectMetadata, type RegisteredProject } from './projectCore/index.ts';
import type { ManagementApiOptions } from './managementApi.ts';
interface LegacyDocsProjectContext {
    project: RegisteredProject;
    metadata: ProjectMetadata;
}
interface LegacyDocsHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required') => LegacyDocsProjectContext | null;
}
export declare function handleLegacyDocsApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, projectContext: LegacyDocsProjectContext | null, pathname: string, url: URL, handlers: LegacyDocsHandlers): boolean;
export {};
