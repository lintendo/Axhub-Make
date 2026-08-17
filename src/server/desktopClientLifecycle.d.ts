export type DesktopClientProvider = 'chatgpt' | 'cursor' | 'opencode' | 'workbuddy' | 'traework' | 'qoderwork';
export type DesktopClientPlatform = 'darwin' | 'win32';
export interface DesktopClientCommandSpec {
    command: string;
    args: string[];
}
export interface DesktopIntegrationInspection {
    platform: DesktopClientPlatform;
    ready: boolean;
    recoverable?: boolean;
    running: boolean;
    installed: boolean;
    integrationInstalled: boolean;
    appPath: string;
}
export declare function buildDesktopClientProcessProbe(provider: DesktopClientProvider, platform: DesktopClientPlatform): DesktopClientCommandSpec;
export declare function buildDesktopClientGracefulQuit(provider: DesktopClientProvider, platform: DesktopClientPlatform, appPath?: string): DesktopClientCommandSpec;
export declare function waitForDesktopClientExit({ isRunning, wait, maxAttempts, retryDelayMs, }: {
    isRunning: () => Promise<boolean>;
    wait: (delayMs: number) => Promise<void>;
    maxAttempts: number;
    retryDelayMs: number;
}): Promise<boolean>;
