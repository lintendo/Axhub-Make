import { type CdpTarget } from "../cdp/targets.js";
import type { HostConfig, HostDoctorResult, HostDomProfile, HostId, HostSupportStatus } from "../types.js";
import type { HostAdapter, HostContext, HostInspection, HostLaunchSpec } from "./adapter.js";
export interface HostDefinition {
    id: HostId;
    defaultCdpPort: number;
    support: HostSupportStatus;
    verified: boolean;
    preferFirstCandidate?: boolean;
    candidates: {
        darwin: string[];
        win32: string[];
    };
    targetPredicate: (target: CdpTarget, port: number) => boolean;
    domProfile: HostDomProfile;
}
export declare function resolveApplicationPath(platform: NodeJS.Platform, config: HostConfig | undefined, candidates: {
    darwin: string[];
    win32: string[];
}): string | undefined;
export declare function discoverApplicationPaths(platform: NodeJS.Platform, config: HostConfig | undefined, candidates: {
    darwin: string[];
    win32: string[];
}): string[];
export declare function resolveLaunchSpec(appPath: string, port: number): HostLaunchSpec;
export declare function isProcessRunning(appPath: string, platform: NodeJS.Platform): boolean;
export declare function validTargetSocket(target: CdpTarget, port: number): boolean;
export declare function inspectDefinition(definition: HostDefinition, context: HostContext): Promise<HostInspection>;
export declare function doctorDefinition(definition: HostDefinition, context: HostContext): Promise<HostDoctorResult>;
export declare function createAdapter(definition: HostDefinition): HostAdapter;
