import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AiArtifact } from './managementApi.aiRuns.ts';
import { type ProjectMetadata } from './projectCore/index.ts';
declare const HISTORY_KIND = "generation-artifacts";
declare const TASK_HISTORY_KIND = "generation-tasks";
export type GenerationArtifactKind = 'image' | 'prototype' | 'document' | 'drawio' | 'file' | 'link';
export type GenerationArtifactOperation = 'created' | 'updated';
export type GenerationArtifactStatus = 'running' | 'done' | 'error';
export interface GenerationArtifactRecord {
    id: string;
    artifactId: string;
    taskId?: string;
    conversationId?: string;
    kind: GenerationArtifactKind;
    operation: GenerationArtifactOperation;
    title: string;
    source: Record<string, unknown>;
    target: Record<string, unknown>;
    assetRef?: Record<string, unknown>;
    runId?: string;
    threadId?: string;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number;
    status: GenerationArtifactStatus;
    metadata: Record<string, unknown>;
}
export interface GenerationArtifactHistory {
    schemaVersion: 1;
    kind: typeof HISTORY_KIND;
    targetPath: string;
    limit: number;
    artifacts: GenerationArtifactRecord[];
}
export interface GenerationTaskRecord {
    id: string;
    taskId: string;
    conversationId?: string;
    runId?: string;
    threadId?: string;
    scene?: string;
    prompt: string;
    sourcePrompt?: string;
    params: Record<string, unknown>;
    context: Record<string, unknown>;
    targetPath?: string;
    generatorElementId?: string;
    status: GenerationArtifactStatus;
    error?: string | null;
    output?: string;
    artifactIds: string[];
    createdAt: number;
    updatedAt: number;
    finishedAt?: number;
    deletedAt?: number;
    metadata: Record<string, unknown>;
}
export interface GenerationTaskHistory {
    schemaVersion: 1;
    kind: typeof TASK_HISTORY_KIND;
    targetPath: string;
    limit: number;
    tasks: GenerationTaskRecord[];
}
interface GenerationArtifactHistoryContext {
    project: {
        id: string;
        root: string;
    };
    metadata: ProjectMetadata;
}
export declare function appendAiRunArtifactsToHistory(params: {
    context: GenerationArtifactHistoryContext;
    targetPath?: unknown;
    artifacts: AiArtifact[];
    taskId?: string;
    conversationId?: string;
    runId?: string;
    threadId?: string;
    status?: GenerationArtifactStatus;
}): Promise<GenerationArtifactHistory | null>;
export declare function upsertAiRunTaskToHistory(params: {
    context: GenerationArtifactHistoryContext;
    targetPath?: unknown;
    task: unknown;
    taskId?: string;
    conversationId?: string;
    runId?: string;
    threadId?: string;
    scene?: string;
    prompt?: string;
    generatorElementId?: string;
    status?: GenerationArtifactStatus;
}): Promise<GenerationTaskHistory | null>;
export declare function handleAiArtifactHistoryApi(req: IncomingMessage, res: ServerResponse, context: GenerationArtifactHistoryContext, pathname: string): boolean;
export {};
