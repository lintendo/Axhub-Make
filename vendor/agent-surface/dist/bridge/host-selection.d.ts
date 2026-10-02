import type { DetectHostOptions, HostDetectionResult, ResolveHostOptions } from "./types.js";
import type { HostAdapter } from "../hosts/adapter.js";
import type { HostSelector } from "../types.js";
export interface HostSelectionDependencies {
    adapters?: HostAdapter[];
}
export type DetectHostInput = DetectHostOptions & HostSelectionDependencies;
export type ResolveHostInput = ResolveHostOptions & HostSelectionDependencies;
export declare function detectHost(options?: DetectHostInput): Promise<HostDetectionResult>;
export declare function resolveHost(options: ResolveHostInput): Promise<HostDetectionResult>;
export declare function isHostSelector(value: unknown): value is HostSelector;
