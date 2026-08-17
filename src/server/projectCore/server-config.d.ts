export type ServerPromptClientPreference = 'acp:codex' | 'acp:claude' | 'acp:opencode' | 'acp:cursor' | 'acp:qoder' | 'acp:codebuddy' | 'acp:reasonix' | 'acp:grok-build' | 'manual';
export type ServerAiPromptClientPreference = ServerPromptClientPreference | null;
export type ServerAnnotationPromptClientPreference = Exclude<ServerPromptClientPreference, 'manual'> | null;
export type ServerAcpExecutionMode = 'prompt' | 'exec';
export type ServerAcpPermissionMode = 'approve-all';
export type ServerIDEPreference = 'cursor' | 'trae' | 'trae_cn' | 'windsurf' | 'vscode' | 'antigravity' | 'qoder' | 'none' | `web:${string}` | `cli:${string}`;
export type ExcalidrawPropertyPanelModePreference = 'collapsed' | 'expanded';
export type ExcalidrawPropertyPanelPositionPreference = 'left' | 'right';
export type ToolOpenKind = 'ide' | 'cli' | 'web' | 'local-app';
export type ToolOpenMode = 'direct-app' | 'app-path' | 'browser-deeplink' | 'deeplink' | 'terminal' | 'managed-web';
export interface ToolOpenStateEntry {
    executablePath?: string;
    commandPath?: string;
    appPathName?: string;
    lastOpenMode?: ToolOpenMode | '';
}
export type ToolOpenState = Record<string, ToolOpenStateEntry>;
export type AiImageGenerationLastTestStatus = 'passed' | 'failed';
export interface AiImageGenerationLastTest {
    status: AiImageGenerationLastTestStatus;
    message: string;
    testedAt: number;
}
export interface AiImageGenerationConfig {
    baseUrl: string;
    apiKey: string | null;
    model: string;
    lastTest?: AiImageGenerationLastTest;
}
export interface LanAccessPasswordConfig {
    algorithm: 'scrypt';
    passwordHash: string | null;
    salt: string | null;
    secret: string;
    updatedAt: string | null;
}
export type ServerCloudPublishTarget = 'vercel' | 'cloudflare-pages' | 's3' | 'github-pages' | 'axhub';
export interface ServerVercelPublishConfig {
    token?: string;
    projectName?: string;
    teamId?: string;
}
export interface ServerCloudflarePagesPublishConfig {
    apiToken?: string;
    accountId?: string;
    projectName?: string;
    productionBranch?: string;
}
export interface ServerS3PublishConfig {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    baseUrl?: string;
    endpoint?: string;
}
export interface ServerGithubPagesPublishConfig {
    repository?: string;
    branch?: string;
    sourceDirectory?: string;
    pathPrefix?: string;
}
export interface ServerPublishSettingsConfig {
    includeSource: boolean;
    visibleTargets: ServerCloudPublishTarget[];
}
export interface ServerCloudPublishingConfig {
    vercel?: ServerVercelPublishConfig;
    cloudflarePages?: ServerCloudflarePagesPublishConfig;
    s3?: ServerS3PublishConfig;
    githubPages?: ServerGithubPagesPublishConfig;
    publishSettings?: ServerPublishSettingsConfig;
}
export interface MakeServerConfig {
    automation: {
        conversationPromptClient: ServerAiPromptClientPreference;
        conversationModel: string | null;
        defaultIDE: ServerIDEPreference;
        injectLocalAiEntry: boolean;
        acp: {
            mode: ServerAcpExecutionMode;
            permission: ServerAcpPermissionMode;
            timeout: number;
        };
        annotationPromptClient: ServerAnnotationPromptClientPreference;
        annotationModel: string | null;
        canvasPromptClient: ServerAiPromptClientPreference;
        canvasModel: string | null;
        agentRunConcurrency: number;
    };
    assistant: {
        webBaseUrl: string | null;
        apiBaseUrl: string | null;
    };
    ai: {
        imageGeneration: AiImageGenerationConfig;
    };
    uiPreferences: {
        excalidrawPropertyPanelMode: ExcalidrawPropertyPanelModePreference;
        excalidrawPropertyPanelPosition: ExcalidrawPropertyPanelPositionPreference;
    };
    toolOpenState: ToolOpenState;
    accessControl: {
        lanPassword: LanAccessPasswordConfig;
    };
    cloudPublishing: ServerCloudPublishingConfig;
}
export interface ServerConfigStoreOptions {
    homeDir?: string;
    configPath?: string;
}
export interface ServerConfigGetOptions {
    activeProjectRoot?: string | null;
}
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export declare const DEFAULT_AGENT_RUN_CONCURRENCY = 5;
export declare const ACP_NO_RESPONSE_MIN_SECONDS = 1200;
export declare const DEFAULT_VISIBLE_SERVER_CLOUD_PUBLISH_TARGETS: ServerCloudPublishTarget[];
export declare function sanitizeAgentRunConcurrency(value: unknown, fallback?: number): number;
export declare function normalizeServerCloudPublishingConfig(value: unknown, fallback?: ServerCloudPublishingConfig): ServerCloudPublishingConfig;
export declare function buildToolOpenStateKey(kind: ToolOpenKind, value: string): string;
export declare function createServerConfigStore(options?: ServerConfigStoreOptions): {
    getConfigPath(): string;
    getConfig(getOptions?: ServerConfigGetOptions): MakeServerConfig;
    saveConfig(input: DeepPartial<MakeServerConfig>): MakeServerConfig;
};
export {};
