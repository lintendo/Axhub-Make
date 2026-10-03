import type { HostId, HostSelector } from "../types.js";
export declare const HOST_BRIDGE_CHANNEL: "axhub-agent-surface:host-bridge";
export type HostBridgeChannel = typeof HOST_BRIDGE_CHANNEL;
export type HostBridgeMethod = "capabilities.get" | "projects.list" | "projects.has" | "projects.ensure" | "tasks.list" | "tasks.refresh" | "tasks.open" | "tasks.openNew";
export type HostBridgeErrorCode = "invalid-request" | "forbidden-origin" | "unsupported" | "host-not-found" | "ambiguous" | "not-found" | "timeout" | "host-api-error";
export interface HostBridgeError {
    code: HostBridgeErrorCode;
    message: string;
    details?: unknown;
}
export interface HostBridgeRequest {
    channel: HostBridgeChannel;
    type: "request";
    requestId: string;
    method: HostBridgeMethod;
    params?: Record<string, unknown>;
}
export interface HostBridgeResponse {
    channel: HostBridgeChannel;
    type: "response";
    requestId: string;
    ok: boolean;
    result?: unknown;
    error?: HostBridgeError;
}
export interface HostBridgeCapabilities {
    host: HostId;
    appVersion?: string;
    projects: {
        list: boolean;
        has: boolean;
        ensure: boolean;
    };
    tasks: {
        list: boolean;
        refresh: boolean;
        open: boolean;
        openNew: boolean;
        prefillPrompt: boolean;
    };
    taskCreation: "external";
    privateApi: boolean;
}
export type HostSelectionReason = "explicit" | "running" | "preferred" | "installed" | "ambiguous" | "host-not-found";
export interface HostDetectionCandidate {
    host: HostId;
    running: boolean;
    /** True only when a matching CDP target is available for bridge connection. */
    connectable?: boolean;
    version?: string;
    appPath?: string;
    cdpPort?: number;
}
export interface HostDetectionResult {
    candidates: HostDetectionCandidate[];
    selectedHost?: HostId;
    selectionReason: HostSelectionReason;
    running: boolean;
    version?: string;
    code?: "ready" | "ambiguous" | "host-not-found" | "host-api-error";
    message?: string;
}
export interface DetectHostOptions {
    preferredHosts?: HostId[];
    platform?: NodeJS.Platform;
    hosts?: HostId[];
    hostConfigs?: Partial<Record<HostId, import("../types.js").HostConfig>>;
    fetchImpl?: typeof fetch;
}
export interface ResolveHostOptions extends DetectHostOptions {
    host: HostSelector;
}
export type DetectHostResult = HostDetectionResult;
export type ResolveHostResult = HostDetectionResult;
export type DetectHost = (options?: DetectHostOptions) => Promise<DetectHostResult>;
export type ResolveHost = (options: ResolveHostOptions) => Promise<ResolveHostResult>;
export type ProjectPath = string;
export interface ProjectListParams {
    path?: ProjectPath;
}
export interface ProjectPathParams {
    path: ProjectPath;
}
export type ProjectHasParams = ProjectPathParams;
export type ProjectEnsureParams = ProjectPathParams;
export interface TaskOpenParams {
    id: string;
    kind?: string;
}
export interface TaskListItem {
    id: string;
    title?: string;
    kind?: string;
    updatedAt?: string;
}
export interface TaskListResult {
    tasks: TaskListItem[];
}
export type OpenTaskParams = TaskOpenParams;
export interface OpenNewTaskParams {
    projectPath?: ProjectPath;
    prompt?: string;
    activate?: boolean;
}
export interface OpenNewTaskResult {
    opened: true;
    draftOnly: true;
    promptApplied: boolean;
}
export declare function isHostBridgeMethod(value: unknown): value is HostBridgeMethod;
export declare function isHostBridgeErrorCode(value: unknown): value is HostBridgeErrorCode;
export declare function isHostBridgeRequest(value: unknown): value is HostBridgeRequest;
export declare function isHostBridgeResponse(value: unknown): value is HostBridgeResponse;
export declare function validateHostBridgeRequest(value: unknown): asserts value is HostBridgeRequest;
export declare function validateHostBridgeResponse(value: unknown): asserts value is HostBridgeResponse;
