import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface AcpRuntimeEventsProjectContext {
    project: {
        id: string;
        root: string;
    };
}
export declare function handleAcpRuntimeEventsApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, context: AcpRuntimeEventsProjectContext, pathname: string, getServerConfig: (options: ManagementApiOptions) => {
    getConfig(params: {
        activeProjectRoot: string;
    }): any;
}): boolean;
export {};
