export interface HealthResult {
    ok: boolean;
    status?: number;
    headers?: Headers;
    responseUrl?: string;
    error?: string;
    elapsedMs: number;
}
export interface HealthOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
}
export interface WaitForHealthOptions extends HealthOptions {
    intervalMs?: number;
    delay?: (milliseconds: number) => Promise<void>;
}
export declare function probeHealth(url: string, { fetchImpl, timeoutMs, now, }?: HealthOptions): Promise<HealthResult>;
export declare function waitForHealth(url: string, { fetchImpl, timeoutMs, intervalMs, delay, now, }?: WaitForHealthOptions): Promise<HealthResult>;
