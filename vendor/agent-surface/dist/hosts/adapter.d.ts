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
export interface HostAdapter {
    id: HostId;
    defaultCdpPort: number;
    support: HostSupportStatus;
    verified: boolean;
    resolveApplicationPath(platform: NodeJS.Platform, config?: HostConfig): string | undefined;
    launchSpec(appPath: string, port: number, platform: NodeJS.Platform): HostLaunchSpec;
    matchesTarget(target: CdpTarget, port: number): boolean;
    domProfile(): HostDomProfile;
    inspect(context: HostContext): Promise<HostInspection>;
    doctor(context: HostContext): Promise<HostDoctorResult>;
}
