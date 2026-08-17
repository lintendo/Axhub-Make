import type { CdpSocket, CdpSessionOptions } from "./session.js";
import { CdpSession } from "./session.js";
export interface CdpTarget {
    id: string;
    type: string;
    title?: string;
    url: string;
    webSocketDebuggerUrl: string;
}
export interface CdpTargetListOptions {
    fetchImpl?: typeof fetch;
}
export declare function listTargets(port: number, { fetchImpl, }?: CdpTargetListOptions): Promise<CdpTarget[]>;
export interface AttachTargetOptions extends CdpSessionOptions {
    source: string;
}
export declare function attachTarget(target: CdpTarget, { source, WebSocketImpl, connectTimeoutMs, commandTimeoutMs, }: AttachTargetOptions): Promise<CdpSession>;
export type { CdpSocket };
