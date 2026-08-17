import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProjectMetadata } from './projectCore/index.ts';
import type { ManagementApiOptions } from './managementApi.ts';
interface EntriesProjectContext {
    project: {
        id: string;
        root: string;
    };
    metadata: ProjectMetadata;
}
export declare function handleEntriesCompatibilityApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, context: EntriesProjectContext, pathname: string): boolean;
export {};
