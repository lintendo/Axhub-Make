import { type CdpTarget } from "../cdp/targets.js";
import type { HostConfig, HostDoctorResult, HostDomProfile, HostId, HostSupportStatus } from "../types.js";
import type { HostAdapter, HostCdpTransport, HostContext, HostInjectionPolicy, HostInspection, HostLaunchSpec } from "./adapter.js";
import { type WindowsAppxPackage } from "./windows-discovery.js";
export interface WindowsHostDiscovery {
    executableNames?: string[];
    appxPackages?: WindowsAppxPackage[];
}
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
    windowsApplicationDiscovery?: WindowsHostDiscovery;
    cdpTransports?: Partial<Record<"darwin" | "win32", HostCdpTransport>>;
    targetPredicate: (target: CdpTarget, port: number) => boolean;
    domProfile: HostDomProfile;
    injectionPolicy?: HostInjectionPolicy;
}
export declare function resolveApplicationPath(platform: NodeJS.Platform, config: HostConfig | undefined, candidates: {
    darwin: string[];
    win32: string[];
}, windowsApplicationDiscovery?: WindowsHostDiscovery): string | undefined;
export declare function discoverApplicationPaths(platform: NodeJS.Platform, config: HostConfig | undefined, candidates: {
    darwin: string[];
    win32: string[];
}, windowsApplicationDiscovery?: WindowsHostDiscovery): string[];
export declare function resolveLaunchSpec(appPath: string, port: number): HostLaunchSpec;
export declare function buildNewClientLaunchSpec(appPath: string, port: number, platform: NodeJS.Platform, userDataDir: string): HostLaunchSpec;
export declare function buildNewClientPipeLaunchSpec(appPath: string, userDataDir: string): HostLaunchSpec;
export declare function isProcessRunning(appPath: string, platform: NodeJS.Platform): boolean;
export declare function validTargetSocket(target: CdpTarget, port: number): boolean;
export declare function inspectDefinition(definition: HostDefinition, context: HostContext): Promise<HostInspection>;
export declare function doctorDefinition(definition: HostDefinition, context: HostContext): Promise<HostDoctorResult>;
export declare function createAdapter(definition: HostDefinition): HostAdapter;
