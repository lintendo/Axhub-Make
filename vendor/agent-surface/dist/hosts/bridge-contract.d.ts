import type { HostBridgeCapabilities, HostBridgeMethod } from "../bridge/types.js";
export type BridgeParams = Record<string, unknown>;
export interface HostBridgeHandler {
    readonly capabilities: HostBridgeCapabilities;
    handle(method: HostBridgeMethod, params?: BridgeParams): Promise<unknown>;
}
export declare class HostBridgeOperationError extends Error {
    readonly code: "unsupported" | "not-found" | "host-api-error" | "invalid-request";
    readonly details?: unknown;
    constructor(code: HostBridgeOperationError["code"], message: string, details?: unknown);
}
export declare function requirePath(params: BridgeParams | undefined): string;
export declare function requireTaskId(params: BridgeParams | undefined): string;
export declare function ensureDraftResult(output: unknown, promptApplied?: boolean): {
    opened: true;
    draftOnly: true;
    promptApplied: boolean;
};
export declare function invokeApi<T>(operation: (() => T | Promise<T>) | undefined, missingMessage: string): Promise<T>;
