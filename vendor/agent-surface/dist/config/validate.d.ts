import type { AgentSurfaceConfig, EntryDefinition, HostId } from "../types.js";
export declare const HOST_IDS: readonly HostId[];
export declare const MAX_STARTUP_TIMEOUT_MS = 30000;
export declare const DEFAULT_STARTUP_TIMEOUT_MS = 30000;
export declare class ConfigValidationError extends Error {
    readonly code = "invalid-config";
    constructor(message: string);
}
export declare function validateConfig(input: unknown): AgentSurfaceConfig;
export declare function findEntry(config: AgentSurfaceConfig, host: HostId, entryId: string): EntryDefinition;
export declare function entriesForHost(config: AgentSurfaceConfig, host: HostId): EntryDefinition[];
export declare function resolveHealthUrl(entry: EntryDefinition): string;
