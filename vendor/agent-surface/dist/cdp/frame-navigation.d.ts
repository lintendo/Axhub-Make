export type FrameNavigationResult = {
    ok: true;
    url: string;
} | {
    ok: false;
    code: "frame-load-failed" | "frame-load-timeout";
    message: string;
};
export interface FrameNavigationOptions {
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    timeoutMs?: number;
    intervalMs?: number;
    expectedUrl?: string;
}
export interface FrameNavigationSession {
    command(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
export declare function waitForFrameNavigation(session: FrameNavigationSession, entryId: string, options?: FrameNavigationOptions): Promise<FrameNavigationResult>;
