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
export interface CdpClient {
    on(method: string, handler: (params: Record<string, unknown>) => void | Promise<void>): () => void;
    waitFor(method: string, timeoutMs?: number): Promise<Record<string, unknown>>;
    command<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    close(): void;
}
export declare class CdpSession implements CdpClient {
    #private;
    constructor(url: string, { WebSocketImpl, connectTimeoutMs, commandTimeoutMs, }?: CdpSessionOptions);
    connect(): Promise<this>;
    on(method: string, handler: (params: Record<string, unknown>) => void | Promise<void>): () => void;
    waitFor(method: string, timeoutMs?: number): Promise<Record<string, unknown>>;
    command<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    close(): void;
}
