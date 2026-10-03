export declare const cursorAdapter: {
    prepareUserDataDir(userDataDir: string, platform: NodeJS.Platform): Promise<void>;
    launchSpec(appPath: string, port: number, platform: NodeJS.Platform): {
        args: string[];
        executable: string;
    };
    newClientLaunchSpec(appPath: string, port: number, platform: NodeJS.Platform, userDataDir: string): {
        args: string[];
        executable: string;
    };
    id: import("../../types.js").HostId;
    defaultCdpPort: number;
    support: import("../../types.js").HostSupportStatus;
    verified: boolean;
    cdpTransport?(platform: NodeJS.Platform): import("../adapter.js").HostCdpTransport;
    resolveApplicationPath(platform: NodeJS.Platform, config?: import("../../types.js").HostConfig): string | undefined;
    prepareLaunchEnvironment?(userDataDir: string, platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv>;
    matchesTarget(target: import("../../cdp/targets.js").CdpTarget, port: number): boolean;
    domProfile(): import("../../types.js").HostDomProfile;
    injectionPolicy?(): import("../adapter.js").HostInjectionPolicy;
    inspect(context: import("../adapter.js").HostContext): Promise<import("../adapter.js").HostInspection>;
    doctor(context: import("../adapter.js").HostContext): Promise<import("../../types.js").HostDoctorResult>;
};
export { createCursorHostBridge } from "./bridge.js";
export type { CursorHostApi } from "./bridge.js";
