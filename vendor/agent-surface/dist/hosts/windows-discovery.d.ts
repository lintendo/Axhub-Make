type SpawnSyncLike = (command: string, args?: readonly string[], options?: Record<string, unknown>) => {
    status?: number | null;
    stdout?: unknown;
    error?: Error;
};
export interface WindowsAppxPackage {
    packageName: string;
    relativeExecutablePaths: string[];
}
export interface WindowsApplicationDiscoveryOptions {
    knownCandidates: readonly string[];
    executableNames?: readonly string[];
    appxPackages?: readonly WindowsAppxPackage[];
    env?: NodeJS.ProcessEnv;
    existsSync?: (candidate: string) => boolean;
    spawnSync?: SpawnSyncLike;
}
export declare function discoverWindowsApplicationPaths({ knownCandidates, executableNames, appxPackages, env, existsSync, spawnSync, }: WindowsApplicationDiscoveryOptions): string[];
export {};
