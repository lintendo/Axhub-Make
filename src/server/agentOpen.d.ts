import { normalizeCLIAgent, normalizeLocalAppAgent, normalizeWebAgent, type AgentAvailabilityInfo, type CLIAgent, type LocalAppAgent, type WebAgent } from './agentTypes.ts';
import type { ToolOpenMode, ToolOpenStateEntry } from './projectCore/server-config.ts';
export type { CLIAgent, LocalAppAgent, WebAgent };
export { normalizeCLIAgent, normalizeLocalAppAgent, normalizeWebAgent };
export interface OpenAgentResult {
    success: true;
    agent: CLIAgent | LocalAppAgent | WebAgent;
    targetPath: string;
    command: string;
    serverUrl?: string;
    url?: string;
    openInBrowser?: boolean;
    openMode?: ToolOpenMode;
}
interface CommandSpec {
    command: string;
    args: string[];
    displayCommand: string;
}
export declare function closeManagedOpenCodeServers(): void;
export declare function buildLocalAppLaunchCommandForPlatform({ applicationPath, platform, }: {
    applicationPath: string;
    platform?: NodeJS.Platform;
}): CommandSpec;
export declare function buildLocalAppOpenCommandForPlatform({ agent, directory, platform, applicationPath, }: {
    agent: LocalAppAgent;
    directory: string;
    platform?: NodeJS.Platform;
    applicationPath?: string;
}): CommandSpec;
export declare function buildLocalAppOpenResultForPlatform({ agent, directory, platform, availability, preferDeeplink, }: {
    agent: LocalAppAgent;
    directory: string;
    platform?: NodeJS.Platform;
    availability?: AgentAvailabilityInfo;
    preferDeeplink?: boolean;
}): Promise<Pick<OpenAgentResult, 'command' | 'url' | 'openInBrowser' | 'openMode'>>;
export declare function readManagedOpenCodeServerUrl(targetPath?: string): string;
export declare function openLocalAppApplication({ applicationPath, platform, }: {
    applicationPath: string;
    platform?: NodeJS.Platform;
}): Promise<{
    command: string;
    openMode: 'direct-app';
}>;
export declare function openLocalAppAgent({ agent, targetPath, availability, toolOpenState, }: {
    agent: LocalAppAgent;
    targetPath: string;
    availability?: AgentAvailabilityInfo;
    toolOpenState?: ToolOpenStateEntry;
}): Promise<OpenAgentResult>;
export declare function openCLIAgent({ agent, targetPath, availability, }: {
    agent: CLIAgent;
    targetPath: string;
    availability?: AgentAvailabilityInfo;
}): Promise<OpenAgentResult>;
export declare function openWebAgent({ agent, targetPath, availability, corsOrigin: _corsOrigin, }: {
    agent: WebAgent;
    targetPath: string;
    availability?: AgentAvailabilityInfo;
    corsOrigin?: string | null;
}): Promise<OpenAgentResult>;
export declare function getMissingCLIAgentOpenError(agent: CLIAgent): {
    statusCode: number;
    body: {
        error: string;
        code: string;
        agent: "codex" | "opencode" | "claudecode";
    };
};
export declare function getMissingWebAgentOpenError(agent: WebAgent): {
    statusCode: number;
    body: {
        error: string;
        code: string;
        agent: "opencode" | "acp";
    };
};
export declare function getMissingLocalAppOpenError(agent: LocalAppAgent): {
    statusCode: number;
    body: {
        error: string;
        code: string;
        agent: "codex" | "opencode" | "traework" | "workbuddy" | "qoderwork" | "trae";
    };
};
