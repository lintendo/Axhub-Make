import type { CdpClient, CdpSocket, CdpSessionOptions } from "./session.js";
import { CdpSession } from "./session.js";
export interface CdpTarget {
    id: string;
    type: string;
    title?: string;
    url: string;
    webSocketDebuggerUrl: string;
    transport?: "pipe";
}
export interface CdpTargetListOptions {
    fetchImpl?: typeof fetch;
}
export declare function listTargets(port: number, { fetchImpl, }?: CdpTargetListOptions): Promise<CdpTarget[]>;
export interface AttachTargetOptions extends CdpSessionOptions {
    source: string;
    bypassCsp?: boolean;
    reloadAfterInstall?: boolean;
}
export declare function installTargetSource<T extends CdpClient>(session: T, { source, commandTimeoutMs, bypassCsp, reloadAfterInstall, }: AttachTargetOptions): Promise<T>;
export declare function attachTarget(target: CdpTarget, { source, WebSocketImpl, connectTimeoutMs, commandTimeoutMs, bypassCsp, reloadAfterInstall, }: AttachTargetOptions): Promise<CdpSession>;
export type { CdpSocket };
