import type { IncomingMessage, ServerResponse } from 'node:http';
import { type AcpChatRunResult } from './acpChatRunner.ts';
import { type AiImageTaskParams } from './aiImageGeneration.ts';
import type { ManagementApiOptions } from './managementApi.ts';
interface AiRunsProjectContext {
    project: {
        id: string;
        root: string;
    };
    metadata?: any;
}
interface AiRunsHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => AiRunsProjectContext | null;
    getServerConfigStoreForRequest: (options: ManagementApiOptions) => {
        getConfig: (params: {
            activeProjectRoot: string;
        }) => any;
    };
}
export type AiRunScene = 'direct' | 'prototype' | 'image' | 'document';
export type AiArtifactKind = 'prototype' | 'image' | 'document' | 'drawio' | 'file' | 'link';
export type AiArtifactOperation = 'created' | 'updated';
export interface AiArtifact {
    id: string;
    taskId?: string;
    conversationId?: string;
    kind: AiArtifactKind;
    operation: AiArtifactOperation;
    source: Record<string, unknown>;
    target?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    dataUrl?: string;
    revisedPrompt?: string;
    actualParams?: Partial<AiImageTaskParams>;
    rawUrl?: string;
}
export declare function resolveAiPurposePreference(scene: unknown, automation: any): {
    promptClient: unknown;
    model: unknown;
};
export declare function resolveAiRunTimeoutMs(scene: AiRunScene, config: any): number;
export type AcpConversationRunState = {
    status: 'completed';
    result: AcpChatRunResult;
} | {
    status: 'failed';
    error: string;
    details?: unknown;
} | {
    status: 'running' | 'unknown';
};
export declare function resolveAcpConversationRunState(params: {
    conversationStorePath?: unknown;
    runId: string;
    threadId: string;
    conversationId: string;
    provider: string;
}): AcpConversationRunState;
export declare function handleAiRunsApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: AiRunsHandlers): boolean;
export {};
