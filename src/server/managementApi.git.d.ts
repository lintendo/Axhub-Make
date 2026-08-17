import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface GitProjectContext {
    project: {
        id: string;
        root: string;
    };
    metadata: {
        resources: {
            prototypes: any[];
            themes: any[];
        };
        resourceWriteTargets?: Record<string, {
            type?: string;
            path?: string;
        } | undefined>;
    };
}
interface GitApiHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required') => GitProjectContext | null;
    findProjectResourceByPath: (metadata: GitProjectContext['metadata'], rawPath: string) => any | undefined;
    commandExecutor?: GitWorkspaceCommandExecutor;
}
export type GitWorkspaceCommandExecutor = (command: string, args: string[], options: {
    cwd: string;
}) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare function handleGitApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, url: URL, handlers: GitApiHandlers): boolean;
export {};
