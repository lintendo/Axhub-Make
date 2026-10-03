import { type HostBridgeErrorCode, type HostBridgeMethod } from "./types.js";
export interface MessageWindowLike {
    addEventListener(type: string, listener: (event: MessageEvent) => void): void;
    removeEventListener(type: string, listener: (event: MessageEvent) => void): void;
    postMessage(message: unknown, targetOrigin: string): void;
}
export interface HostBridgeClientOptions {
    sourceWindow?: MessageWindowLike;
    targetWindow?: MessageWindowLike;
    targetOrigin: string;
    timeoutMs?: number;
    maxMessageBytes?: number;
}
export declare class HostBridgeRequestError extends Error {
    readonly code: HostBridgeErrorCode;
    readonly details?: unknown;
    constructor(code: HostBridgeErrorCode, message: string, details?: unknown);
}
export declare class HostBridgeClient {
    #private;
    constructor(options: HostBridgeClientOptions);
    request(method: HostBridgeMethod, params?: Record<string, unknown>): Promise<unknown>;
    dispose(): void;
}
