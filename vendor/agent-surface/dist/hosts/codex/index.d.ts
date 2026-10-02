export declare const codexApplicationCandidates: {
    darwin: string[];
    win32: string[];
};
export declare const codexAdapter: {
    prepareLaunchEnvironment(userDataDir: string, platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv>;
    id: import("../../types.js").HostId;
    defaultCdpPort: number;
    support: import("../../types.js").HostSupportStatus;
    verified: boolean;
    cdpTransport?(platform: NodeJS.Platform): import("../adapter.js").HostCdpTransport;
    resolveApplicationPath(platform: NodeJS.Platform, config?: import("../../types.js").HostConfig): string | undefined;
    launchSpec(appPath: string, port: number, platform: NodeJS.Platform): import("../adapter.js").HostLaunchSpec;
    newClientLaunchSpec(appPath: string, port: number, platform: NodeJS.Platform, userDataDir: string): import("../adapter.js").HostLaunchSpec;
    prepareUserDataDir?(userDataDir: string, platform: NodeJS.Platform): Promise<void>;
    matchesTarget(target: import("../../cdp/targets.js").CdpTarget, port: number): boolean;
    domProfile(): import("../../types.js").HostDomProfile;
    injectionPolicy?(): import("../adapter.js").HostInjectionPolicy;
    inspect(context: import("../adapter.js").HostContext): Promise<import("../adapter.js").HostInspection>;
    doctor(context: import("../adapter.js").HostContext): Promise<import("../../types.js").HostDoctorResult>;
};
export { createCodexHostBridge, CODEX_REFRESH_ACTION } from "./bridge.js";
export type { CodexHostApi } from "./bridge.js";
