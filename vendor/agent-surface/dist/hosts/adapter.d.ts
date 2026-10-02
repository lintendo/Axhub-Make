import type { CdpTarget } from "../cdp/targets.js";
import type { HostConfig, HostDoctorResult, HostDomProfile, HostId, HostSupportStatus } from "../types.js";
export interface HostContext {
    platform: NodeJS.Platform;
    config?: HostConfig;
    fetchImpl?: typeof fetch;
}
export interface HostInspection {
    code: string;
    message: string;
    appPath?: string;
    cdpPort: number;
    target?: CdpTarget;
    reusedHost: boolean;
    canLaunch: boolean;
    processRunning: boolean;
}
export interface HostLaunchSpec {
    executable: string;
    args: string[];
}
export type HostCdpTransport = "websocket" | "pipe";
export interface HostInjectionPolicy {
    bypassCsp?: boolean;
    reloadAfterInstall?: boolean;
}
export interface HostAdapter {
    id: HostId;
    defaultCdpPort: number;
    support: HostSupportStatus;
    verified: boolean;
    cdpTransport?(platform: NodeJS.Platform): HostCdpTransport;
    resolveApplicationPath(platform: NodeJS.Platform, config?: HostConfig): string | undefined;
    launchSpec(appPath: string, port: number, platform: NodeJS.Platform): HostLaunchSpec;
    newClientLaunchSpec(appPath: string, port: number, platform: NodeJS.Platform, userDataDir: string): HostLaunchSpec;
    prepareUserDataDir?(userDataDir: string, platform: NodeJS.Platform): Promise<void>;
    prepareLaunchEnvironment?(userDataDir: string, platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv>;
    matchesTarget(target: CdpTarget, port: number): boolean;
    domProfile(): HostDomProfile;
    injectionPolicy?(): HostInjectionPolicy;
    inspect(context: HostContext): Promise<HostInspection>;
    doctor(context: HostContext): Promise<HostDoctorResult>;
}
