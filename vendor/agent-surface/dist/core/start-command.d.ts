import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { StartCommand } from "../types.js";
export interface StartedCommand {
    child: ChildProcess;
    pid?: number;
    spawned: Promise<void>;
    exited: Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
        error?: Error;
    }>;
}
export interface StartCommandOptions {
    platform?: NodeJS.Platform;
    cwd?: string;
    spawnImpl?: typeof spawn;
    env?: NodeJS.ProcessEnv;
}
export interface TerminateStartedCommandOptions {
    platform?: NodeJS.Platform;
    spawnSyncImpl?: typeof spawnSync;
}
export declare function startCommand(command: StartCommand, { platform, cwd, spawnImpl, env, }?: StartCommandOptions): StartedCommand;
export declare function startPipeCommand(command: StartCommand, { platform, cwd, spawnImpl, env, }?: StartCommandOptions): StartedCommand;
export declare function terminateStartedCommand(started: StartedCommand, { platform, spawnSyncImpl, }?: TerminateStartedCommandOptions): void;
