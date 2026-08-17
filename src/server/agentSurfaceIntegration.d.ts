import { type AgentSurfaceConfig, type HostId, type OpenProjectAndEntryOptions, type OpenResult, type OpenOptions, type ProjectOpenResult } from '../../vendor/agent-surface/dist/index.js';
import { type DesktopClientProvider, type DesktopIntegrationInspection } from './desktopClientLifecycle.ts';
export type AgentSurfaceDesktopProvider = Exclude<DesktopClientProvider, 'opencode'>;
export interface MakeAgentSurfaceConfigOptions {
    makeOrigin: string;
    projectId: string;
}
export interface MakeAgentSurfaceProjectOpenOptions extends MakeAgentSurfaceConfigOptions {
    provider: DesktopClientProvider;
    targetPath: string;
    appPath?: string;
}
export declare function resolveMakeAgentSurfaceHost(provider: DesktopClientProvider): HostId | null;
export declare function buildMakeAgentSurfaceConfig({ makeOrigin, projectId, }: MakeAgentSurfaceConfigOptions): AgentSurfaceConfig;
export declare function openMakeAgentSurface({ provider, makeOrigin, projectId, appPath, }: MakeAgentSurfaceConfigOptions & {
    provider: AgentSurfaceDesktopProvider;
    appPath?: string;
}): Promise<OpenResult>;
export declare function buildMakeAgentSurfaceProjectOpenOptions({ provider, makeOrigin, projectId, targetPath, appPath, }: MakeAgentSurfaceProjectOpenOptions): OpenProjectAndEntryOptions;
export declare function openMakeAgentSurfaceProject(options: MakeAgentSurfaceProjectOpenOptions): Promise<ProjectOpenResult>;
export declare function openMakeAgentProjectOnly(options: MakeAgentSurfaceProjectOpenOptions): Promise<ProjectOpenResult>;
export declare function buildMakeAgentSurfaceOpenOptions({ provider, makeOrigin, projectId, appPath, }: MakeAgentSurfaceConfigOptions & {
    provider: AgentSurfaceDesktopProvider;
    appPath?: string;
}): OpenOptions;
export declare function inspectMakeAgentSurfaceHost(provider: AgentSurfaceDesktopProvider, options?: {
    platform?: NodeJS.Platform;
    appPath?: string;
}): Promise<DesktopIntegrationInspection>;
export declare function closeMakeAgentSurfaceHost(provider: AgentSurfaceDesktopProvider, options?: {
    platform?: NodeJS.Platform;
    appPath?: string;
    wait?: (delayMs: number) => Promise<void>;
    maxAttempts?: number;
    retryDelayMs?: number;
}): Promise<void>;
