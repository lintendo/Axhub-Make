import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ManagementApiOptions } from './managementApi.ts';
interface AssistantIdeProjectContext {
    project: {
        id: string;
        root: string;
    };
    metadata?: any;
}
interface AssistantIdeHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => AssistantIdeProjectContext | null;
    getServerConfigStoreForRequest: (options: ManagementApiOptions) => {
        getConfig: (params: {
            activeProjectRoot: string;
        }) => any;
        saveConfig: (config: Record<string, unknown>) => unknown;
    };
    sendDisabledCapability: (res: ServerResponse, status: number, payload: {
        code: string;
        error: string;
        projectId?: string;
        projectRoot?: string;
        adapterRequired?: boolean;
        runtime?: Record<string, unknown>;
    }) => void;
}
export declare function resolvePromptExecutionAcpConfig(scene: unknown, legacyConfig: any): any;
export declare function resolveCanvasPrototypeGenerationSessionName(projectId: unknown, targetPath: unknown): string | null;
export declare function handleAssistantPromptIde(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: AssistantIdeHandlers): boolean;
export {};
