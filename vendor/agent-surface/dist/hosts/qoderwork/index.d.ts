import { readFileSync } from "node:fs";
import type { HostAdapter, HostLaunchSpec } from "../adapter.js";
type QoderWorkEnvironment = Partial<Record<"HOME" | "APPDATA", string>>;
export declare function buildQoderWorkLaunchSpec(appPath: string, platform: NodeJS.Platform): HostLaunchSpec;
export declare function qoderWorkDevToolsActivePortPaths(platform: NodeJS.Platform, appPath: string | undefined, environment?: QoderWorkEnvironment): string[];
export declare function parseQoderWorkDevToolsActivePort(value: string): number | undefined;
export declare function readQoderWorkDevToolsActivePort(platform: NodeJS.Platform, appPath: string | undefined, environment?: QoderWorkEnvironment, readFile?: typeof readFileSync): number | undefined;
export declare const qoderworkAdapter: HostAdapter;
export {};
