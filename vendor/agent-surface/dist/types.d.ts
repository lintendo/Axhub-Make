export type HostId = "codex" | "cursor" | "workbuddy" | "traework" | "qoderwork" | "trae";
/** A concrete host, or an explicit request to resolve one at runtime. */
export type HostSelector = HostId | "auto";
export type ProjectProviderId = "codex" | "cursor" | "opencode" | "workbuddy" | "traework" | "qoderwork";
export type HostSupportStatus = "supported" | "experimental" | "unavailable";
export interface StartCommand {
    executable: string;
    args: string[];
    cwd?: string;
}
export interface EntryIcon {
    type: "path" | "data-url";
    value: string;
}
export interface EntryHeaderActions {
    refresh?: boolean;
    copyUrl?: boolean;
}
export interface EntryDefinition {
    id: string;
    name: string;
    hosts: HostId[];
    url: string;
    icon?: EntryIcon;
    headerActions?: EntryHeaderActions;
    order?: number;
    healthUrl?: string;
    start?: StartCommand;
    startupTimeoutMs?: number;
}
export interface HostConfig {
    appPath?: string;
    cdpPort?: number;
    variant?: string;
}
export interface HostDomProfile {
    sidebarSlotSelector: string;
    referenceSelector?: string;
    /** Visible native navigation labels used when referenceSelector does not match the current host build. */
    referenceLabels?: string[];
    contentRootSelector: string;
    /** Complete host workspace after its native sidebar; falls back to contentRootSelector when absent. */
    surfaceRootSelector?: string;
    /** Mounts into the matched workspace element's parent, for hosts whose viewport is nested beside native chrome. */
    surfaceRootUseParent?: boolean;
    /** Raises the mounted workspace above host chrome that lives in a higher stacking layer. */
    surfaceRootZIndex?: number;
    contentTopInset?: number;
    surfaceHeaderHeight?: number;
    observeMutations?: boolean;
    observeResize?: boolean;
    sidebarExpandControlSelector?: string;
    sidebarCollapsedSelector?: string;
    macosCollapsedHeaderLeftInset?: number;
    selectedClassName?: string;
    inactiveClassName?: string;
    hideShortcutHint?: boolean;
    /** Removes a host-native icon container from a cloned entry before adding its configured icon. */
    entryIconSelector?: string;
    /** Selects the host-visible label inside a cloned entry. */
    entryLabelSelector?: string;
    /** Removes host-only residue such as a cloned shortcut hint. */
    entryCleanupSelector?: string;
    /** Overrides the horizontal spacing between an injected entry icon and its title. */
    entryIconTextGap?: number;
    nativeSelectionSelector?: string;
    nativeNavigationSelector?: string;
}
export interface AgentSurfaceConfig {
    schemaVersion: 1;
    entries: EntryDefinition[];
    hosts?: Partial<Record<HostId, HostConfig>>;
}
export interface OperationResult {
    ok: boolean;
    code: string;
    message: string;
    host: HostSelector;
    entryId?: string;
}
export interface OpenOptions {
    host: HostSelector;
    entryId: string;
    config: AgentSurfaceConfig;
    /** Starts an isolated desktop client. Defaults to true. */
    newClient?: boolean;
    /** Reconnects a client started earlier in the same combined operation. */
    client?: HostClientReference;
    activate?: boolean;
    /** Desktop client and CDP readiness timeout. Defaults to 90 seconds. */
    timeoutMs?: number;
    configDir?: string;
    platform?: NodeJS.Platform;
    fetchImpl?: typeof fetch;
    hostFetchImpl?: typeof fetch;
    WebSocketImpl?: typeof WebSocket;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    intervalMs?: number;
    preferredHosts?: HostId[];
    spawnImpl?: typeof import("node:child_process").spawn;
}
export interface InjectOptions {
    host: HostSelector;
    config: AgentSurfaceConfig;
    /** Starts an isolated desktop client. Defaults to true. */
    newClient?: boolean;
    /** Desktop client and CDP readiness timeout. Defaults to 90 seconds. */
    timeoutMs?: number;
    configDir?: string;
    platform?: NodeJS.Platform;
    fetchImpl?: typeof fetch;
    hostFetchImpl?: typeof fetch;
    WebSocketImpl?: typeof WebSocket;
    spawnImpl?: typeof import("node:child_process").spawn;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    intervalMs?: number;
    preferredHosts?: HostId[];
}
export interface DoctorOptions {
    hosts: HostId[];
    config?: AgentSurfaceConfig;
    hostConfigs?: Partial<Record<HostId, HostConfig>>;
    platform?: NodeJS.Platform;
    fetchImpl?: typeof fetch;
}
export interface OpenResult extends OperationResult {
    reusedHost?: boolean;
    startedClient?: boolean;
    cdpPort?: number;
    client?: HostClientReference;
    startedCommand?: boolean;
    readinessWaitMs?: number;
}
export interface HostClientReference {
    appPath: string;
    cdpPort: number;
    userDataDir?: string;
    startedClient: boolean;
    transport?: "pipe";
    pipeClientId?: string;
}
export interface ProjectOpenOptions {
    provider: ProjectProviderId;
    targetPath: string;
    /** Explicit application executable or command path. Required on Windows. */
    appPath?: string;
    platform?: NodeJS.Platform;
    preferDeeplink?: boolean;
    /** Routes the project command to an isolated desktop client that is already running. */
    isolatedClient?: {
        cdpPort: number;
        userDataDir: string;
        transport?: "pipe";
    };
    spawnImpl?: typeof import("node:child_process").spawn;
    delay?: (milliseconds: number) => Promise<void>;
}
export interface ProjectOpenResult {
    ok: boolean;
    code: string;
    message: string;
    provider: ProjectProviderId;
    targetPath: string;
    appPath?: string;
    command?: string;
    url?: string;
    openInBrowser?: boolean;
}
export interface ProjectSurfaceOptions {
    entryId: string;
    config: AgentSurfaceConfig;
    /** Starts an isolated desktop client for the combined operation. Defaults to true. */
    newClient?: boolean;
    activate?: boolean;
    /** Combined project and surface readiness timeout. Defaults to 120 seconds. */
    timeoutMs?: number;
    configDir?: string;
    fetchImpl?: typeof fetch;
    hostFetchImpl?: typeof fetch;
    WebSocketImpl?: typeof WebSocket;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    intervalMs?: number;
}
export interface OpenProjectAndEntryOptions extends ProjectOpenOptions {
    surface?: ProjectSurfaceOptions;
}
export interface OpenProjectAndEntryResult extends ProjectOpenResult {
    project?: ProjectOpenResult;
    surface?: OpenResult;
}
export interface InjectResult extends OperationResult {
    injectedEntryIds?: string[];
    reusedHost?: boolean;
    startedClient?: boolean;
    cdpPort?: number;
}
export interface HostDoctorResult {
    host: HostId;
    status: HostSupportStatus;
    code: string;
    message: string;
    appPath?: string;
    cdpPort?: number;
    version?: string;
}
export interface DoctorReport {
    ok: boolean;
    hosts: HostDoctorResult[];
    hostDetection?: import("./bridge/types.js").HostDetectionResult;
    hostBridge?: {
        runtimeVersion: number;
        capabilities: import("./bridge/types.js").HostBridgeCapabilities[];
    };
}
