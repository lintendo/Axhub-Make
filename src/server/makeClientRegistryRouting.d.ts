export declare const NPM_OFFICIAL_REGISTRY: {
    id: "npmjs";
    label: string;
    url: string;
};
export declare const NPM_MIRROR_REGISTRY: {
    id: "npmmirror";
    label: string;
    url: string;
};
export interface RegistryProbePackage {
    name: string;
    version?: string;
}
export interface NpmRegistryProbeResult {
    id: 'npmjs' | 'npmmirror';
    label: string;
    url: string;
    ok: boolean;
    durationMs: number;
    error?: string;
}
export interface AutomaticRegistryRoute {
    mode: 'automatic';
    reason: 'faster' | 'close-to-official' | 'only-available' | 'probe-fallback';
    selected: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY;
    alternate: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY;
    probes: NpmRegistryProbeResult[];
}
export interface ConfiguredRegistryRoute {
    mode: 'configured';
    reason: 'environment-configured' | 'npm-configured' | 'scoped-npm-configured' | 'config-unavailable';
    probes: [];
}
export type MakeClientRegistryRoute = AutomaticRegistryRoute | ConfiguredRegistryRoute;
type RegistryCommandRunner = (command: string, args: string[], options: {
    cwd: string;
    timeoutMs?: number;
}) => Promise<{
    stdout?: unknown;
}>;
type RegistryProbe = (registry: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY, packages: RegistryProbePackage[], timeoutMs?: number) => Promise<NpmRegistryProbeResult>;
export declare function deriveRegistryProbePackages(packageJson: unknown): RegistryProbePackage[];
export declare function chooseNpmRegistry(probes: NpmRegistryProbeResult[], closeThresholdMs?: number): Omit<AutomaticRegistryRoute, 'mode' | 'probes'>;
export declare function probeNpmRegistry(registry: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY, packages: RegistryProbePackage[], options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<NpmRegistryProbeResult>;
export declare function resolveMakeClientRegistryRoute(options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    npmCommand: string;
    probePackages: RegistryProbePackage[];
    probeRegistry?: RegistryProbe;
    probeTimeoutMs?: number;
    runCommand: RegistryCommandRunner;
}): Promise<MakeClientRegistryRoute>;
export declare function registryInstallArgs(args: string[], registryUrl?: string): string[];
export declare function isRetryableRegistryError(error: unknown): boolean;
export {};
