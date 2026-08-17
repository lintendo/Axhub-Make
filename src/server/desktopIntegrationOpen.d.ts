import type { DesktopIntegrationInspection } from './desktopClientLifecycle.ts';
export declare const DESKTOP_INTEGRATION_PROVIDERS: readonly ["chatgpt", "cursor", "workbuddy", "traework", "qoderwork"];
export declare const DESKTOP_INTEGRATION_OPEN_ACTIONS: readonly ["prepare", "restart", "normal"];
export type DesktopIntegrationProvider = typeof DESKTOP_INTEGRATION_PROVIDERS[number];
export type DesktopIntegrationOpenAction = typeof DESKTOP_INTEGRATION_OPEN_ACTIONS[number];
export interface DesktopIntegrationOperationResult {
    url?: string;
    openInBrowser?: boolean;
    noticeCode?: 'project-selection-required';
    notice?: string;
}
export interface DesktopIntegrationOpenAdapters {
    inspect(): Promise<DesktopIntegrationInspection>;
    launch(): Promise<{
        launched: boolean;
        reused: boolean;
    }>;
    close(): Promise<void>;
    open(mode: 'integrated' | 'normal'): Promise<DesktopIntegrationOperationResult>;
}
export interface DesktopIntegrationOpenResult extends DesktopIntegrationOperationResult {
    provider: DesktopIntegrationProvider;
    status: 'opened' | 'restart-required';
    mode?: 'integrated' | 'normal';
    launched?: boolean;
    reused?: boolean;
}
export declare function normalizeDesktopIntegrationProvider(value: unknown): DesktopIntegrationProvider | null;
export declare function normalizeDesktopIntegrationOpenAction(value: unknown): DesktopIntegrationOpenAction | null;
export declare function coordinateDesktopIntegrationOpen(input: {
    provider: DesktopIntegrationProvider;
    action: DesktopIntegrationOpenAction;
}, adapters: DesktopIntegrationOpenAdapters): Promise<DesktopIntegrationOpenResult>;
