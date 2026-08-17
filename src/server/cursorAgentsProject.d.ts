export declare const CURSOR_DEBUG_PORT = 9230;
export interface CursorLauncherFileSystem {
    access(filePath: string): Promise<void>;
}
export interface CursorCdpTarget {
    id?: unknown;
    title?: unknown;
    type?: unknown;
    url?: unknown;
    webSocketDebuggerUrl?: unknown;
}
export type CursorProcessRunner = (command: string, args: string[]) => Promise<{
    stdout: string;
    stderr: string;
}>;
export interface CursorLauncherContext {
    platform?: NodeJS.Platform | string;
    homeDir?: string;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    fileSystem?: CursorLauncherFileSystem;
    run?: CursorProcessRunner;
    probeTargets?: (debugPort: number) => Promise<CursorCdpTarget[]>;
    wait?: (delayMs: number) => Promise<void>;
    maxAttempts?: number;
    retryDelayMs?: number;
}
export interface OpenCursorAgentsProjectResult {
    appPath: string;
    targetPath: string;
}
export declare function isCursorWorkbenchTarget(target: CursorCdpTarget): boolean;
export declare function openCursorAgentsProject(targetPath: string, context?: CursorLauncherContext): Promise<OpenCursorAgentsProjectResult>;
