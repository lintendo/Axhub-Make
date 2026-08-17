export interface CdpSocket {
    readyState: number;
    onopen: (() => void) | null;
    onerror: (() => void) | null;
    onmessage: ((event: {
        data: unknown;
    }) => void) | null;
    onclose: (() => void) | null;
    send(data: string): void;
    close(): void;
}
export interface CdpSessionOptions {
    WebSocketImpl?: new (url: string) => CdpSocket;
    connectTimeoutMs?: number;
    commandTimeoutMs?: number;
}
export declare class CdpSession {
    #private;
    constructor(url: string, { WebSocketImpl, connectTimeoutMs, commandTimeoutMs, }?: CdpSessionOptions);
    connect(): Promise<this>;
    on(method: string, handler: (params: Record<string, unknown>) => void | Promise<void>): void;
    command<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    close(): void;
}
