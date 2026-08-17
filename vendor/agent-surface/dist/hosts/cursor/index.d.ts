export declare const cursorAdapter: {
    launchSpec(appPath: string, port: number, platform: NodeJS.Platform): {
        args: string[];
        executable: string;
    };
    id: import("../../types.js").HostId;
    defaultCdpPort: number;
    support: import("../../types.js").HostSupportStatus;
    verified: boolean;
    resolveApplicationPath(platform: NodeJS.Platform, config?: import("../../types.js").HostConfig): string | undefined;
    matchesTarget(target: import("../../cdp/targets.js").CdpTarget, port: number): boolean;
    domProfile(): import("../../types.js").HostDomProfile;
    inspect(context: import("../adapter.js").HostContext): Promise<import("../adapter.js").HostInspection>;
    doctor(context: import("../adapter.js").HostContext): Promise<import("../../types.js").HostDoctorResult>;
};
