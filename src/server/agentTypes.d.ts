export type AgentAvailabilityStatus = 'installed' | 'missing' | 'unknown';
export type AgentAvailabilityConfidence = 'high' | 'low';
export interface AgentAvailabilityInfo {
    status: AgentAvailabilityStatus;
    confidence: AgentAvailabilityConfidence;
    checkedAt: string;
    source?: string;
    path?: string;
    reason?: string;
}
export interface AgentVersionInfo {
    status: AgentAvailabilityStatus;
    checkedAt: string;
    command: string;
    version?: string;
    packageName?: string;
    reason?: string;
}
export declare const CLI_AGENT_OPTIONS: readonly [{
    readonly value: "codex";
    readonly label: "Codex";
}, {
    readonly value: "claudecode";
    readonly label: "Claude Code";
}, {
    readonly value: "opencode";
    readonly label: "OpenCode";
}];
export declare const WEB_AGENT_OPTIONS: readonly [{
    readonly value: "opencode";
    readonly label: "OpenCode";
}, {
    readonly value: "acp";
    readonly label: "ACP UI";
}];
export declare const LOCAL_APP_AGENT_OPTIONS: readonly [{
    readonly value: "codex";
    readonly label: "ChatGPT";
}, {
    readonly value: "opencode";
    readonly label: "OpenCode";
}, {
    readonly value: "workbuddy";
    readonly label: "WorkBuddy";
}, {
    readonly value: "traework";
    readonly label: "TRAEWORK";
}, {
    readonly value: "qoderwork";
    readonly label: "QoderWork";
}, {
    readonly value: "trae";
    readonly label: "TRAE";
}];
export type CLIAgent = typeof CLI_AGENT_OPTIONS[number]['value'];
export type WebAgent = typeof WEB_AGENT_OPTIONS[number]['value'];
export type LocalAppAgent = typeof LOCAL_APP_AGENT_OPTIONS[number]['value'];
export declare const CLI_AGENT_VALUES: CLIAgent[];
export declare const WEB_AGENT_VALUES: WebAgent[];
export declare const LOCAL_APP_AGENT_VALUES: LocalAppAgent[];
export declare const CLI_AGENT_APP_NAMES: Record<CLIAgent, string>;
export declare const WEB_AGENT_APP_NAMES: Record<WebAgent, string>;
export declare const LOCAL_APP_AGENT_APP_NAMES: Record<LocalAppAgent, string>;
export type AgentAvailabilityMap<T extends string> = Partial<Record<T, AgentAvailabilityInfo>>;
export interface RuntimeAgentAvailability {
    cli: AgentAvailabilityMap<CLIAgent>;
    localApp: AgentAvailabilityMap<LocalAppAgent>;
    web: AgentAvailabilityMap<WebAgent>;
}
export declare function isAgentMissing<T extends string>(agent: T, availability?: AgentAvailabilityMap<T> | null): boolean;
export declare function getVisibleAgentOptions<T extends string, TOption extends {
    value: T;
}>(options: readonly TOption[], availability?: AgentAvailabilityMap<T> | null): TOption[];
export declare function normalizeCLIAgent(value: unknown): CLIAgent | null;
export declare function normalizeWebAgent(value: unknown): WebAgent | null;
export declare function normalizeLocalAppAgent(value: unknown): LocalAppAgent | null;
