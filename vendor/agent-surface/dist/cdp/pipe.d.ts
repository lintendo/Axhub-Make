import type { ChildProcess } from "node:child_process";
import type { CdpClient } from "./session.js";
import { type AttachTargetOptions } from "./targets.js";
type EventHandler = (params: Record<string, unknown>) => void | Promise<void>;
declare class CdpEventChannel {
    #private;
    protected closed: boolean;
    on(method: string, handler: EventHandler): () => void;
    waitFor(method: string, timeoutMs: number): Promise<Record<string, unknown>>;
    protected dispatch(method: string, params?: Record<string, unknown>): void;
    protected markClosed(): void;
}
export interface CdpPipeTargetInfo {
    targetId: string;
    type: string;
    title?: string;
    url: string;
}
export interface CdpPipeBrowserOptions {
    commandTimeoutMs?: number;
}
export declare class CdpPipeSession extends CdpEventChannel implements CdpClient {
    #private;
    constructor(browser: CdpPipeBrowser, sessionId: string);
    command<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    receive(method: string, params: Record<string, unknown>): void;
    fail(): void;
    close(): void;
}
export declare function attachPipeTarget(browser: CdpPipeBrowser, targetId: string, options: AttachTargetOptions): Promise<CdpPipeSession>;
export declare class CdpPipeBrowser extends CdpEventChannel {
    #private;
    constructor(child: ChildProcess, { commandTimeoutMs }?: CdpPipeBrowserOptions);
    get isClosed(): boolean;
    open(): Promise<void>;
    command<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string, timeoutMs?: number): Promise<T>;
    targets(): Promise<CdpPipeTargetInfo[]>;
    connect(targetId: string): Promise<CdpPipeSession>;
    detach(sessionId: string): void;
    close(): void;
}
export {};
