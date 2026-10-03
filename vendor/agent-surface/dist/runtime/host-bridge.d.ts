import type { HostBridgeCapabilities } from "../bridge/types.js";
import type { HostId } from "../types.js";
export declare const HOST_BRIDGE_RUNTIME_KEY = "__AXHUB_AGENT_SURFACE_HOST_BRIDGE__";
export declare const HOST_BRIDGE_RUNTIME_VERSION = 1;
export interface HostBridgeRuntimeOptions {
    allowedOrigins: string[];
    capabilities: HostBridgeCapabilities;
    dispatchSource?: string;
    timeoutMs?: number;
    maxMessageBytes?: number;
}
export declare function createUnsupportedHostBridgeCapabilities(host: HostId): HostBridgeCapabilities;
export declare function createUnsupportedHostBridgeOptions(host: HostId, allowedOrigins: string[]): HostBridgeRuntimeOptions;
export declare function createHostBridgeOptions(host: HostId, allowedOrigins: string[]): HostBridgeRuntimeOptions;
export declare function buildHostBridgeRuntimeSource(options: HostBridgeRuntimeOptions): string;
