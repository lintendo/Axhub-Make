import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ProjectMetadata } from './projectCore/index.ts';
export type ObservedCommentTombstone = {
    kind: 'comment';
    commentId: string;
    deletedAt: number;
};
export type ObservedImageTombstone = {
    kind: 'image';
    id: string;
    commentId: string;
    deletedAt: number;
};
export type ObservedTombstone = ObservedCommentTombstone | ObservedImageTombstone;
type PrototypeCommentsContext = {
    project: {
        root: string;
    };
    metadata?: ProjectMetadata;
};
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function isDeletedRecord(value: unknown): boolean;
export declare function normalizeIdentityPart(value: unknown): string;
export declare function buildCommentIdentity(record: {
    id?: unknown;
}): string;
export declare function buildImageIdentity(record: {
    id?: unknown;
}): string;
export declare function normalizeObservedTombstones(value: unknown): ObservedTombstone[];
export declare function mergeStoredTombstones(previous: Record<string, unknown> | null, incoming: Record<string, unknown>): Record<string, unknown>;
export declare function compactObservedTombstones(previous: Record<string, unknown>, observedTombstones: ObservedTombstone[]): Record<string, unknown>;
export declare function handlePrototypeCommentsApi(req: IncomingMessage, res: ServerResponse, context: PrototypeCommentsContext, url: URL): boolean;
export {};
