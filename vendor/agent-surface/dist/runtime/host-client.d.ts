import { CdpPipeBrowser } from "../cdp/pipe.js";
import { type CdpClient } from "../cdp/session.js";
import { attachTarget as attachWebSocketTarget, listTargets, type AttachTargetOptions, type CdpTarget } from "../cdp/targets.js";
import { startCommand, startPipeCommand, terminateStartedCommand, type StartedCommand } from "../core/start-command.js";
import type { HostAdapter, HostContext, HostInspection } from "../hosts/adapter.js";
import type { HostClientReference } from "../types.js";
export interface HostClientInspection extends HostInspection {
    startedClient: boolean;
    userDataDir?: string;
    transport?: "pipe";
    pipeClientId?: string;
    attachTarget?: (target: CdpTarget, options: AttachTargetOptions) => Promise<CdpClient>;
    closeClient?: () => void;
}
export interface AcquireHostClientOptions {
    adapter: HostAdapter;
    context: HostContext;
    platform: NodeJS.Platform;
    newClient?: boolean;
    client?: HostClientReference;
    initialInspection?: HostInspection;
    timeoutMs?: number;
    spawnImpl?: typeof import("node:child_process").spawn;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    WebSocketImpl?: typeof WebSocket;
}
interface TargetReadyOptions {
    WebSocketImpl?: typeof WebSocket;
    now: () => number;
    delay: (milliseconds: number) => Promise<void>;
    timeoutMs: number;
}
export interface HostClientDependencies {
    startImpl?: typeof startCommand;
    startPipeImpl?: typeof startPipeCommand;
    createPipeBrowserImpl?: (started: StartedCommand, options: {
        commandTimeoutMs: number;
    }) => CdpPipeBrowser;
    attachImpl?: typeof attachWebSocketTarget;
    terminateStartedCommandImpl?: typeof terminateStartedCommand;
    listTargetsImpl?: typeof listTargets;
    reservePortImpl?: () => Promise<number>;
    createUserDataDirImpl?: (host: HostAdapter["id"]) => Promise<string>;
    waitForTargetReadyImpl?: (target: CdpTarget, adapter: HostAdapter, options: TargetReadyOptions) => Promise<boolean>;
    delayImpl?: (milliseconds: number) => Promise<void>;
}
export declare function reserveLoopbackPort(): Promise<number>;
export declare function createClientUserDataDir(host: HostAdapter["id"]): Promise<string>;
export declare function waitForTargetReady(target: CdpTarget, adapter: HostAdapter, options: TargetReadyOptions): Promise<boolean>;
export declare function acquireHostClient(options: AcquireHostClientOptions, dependencies?: HostClientDependencies): Promise<HostClientInspection>;
export {};
