export type HostId = "codex" | "cursor" | "workbuddy" | "traework" | "qoderwork" | "trae";
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
    contentRootSelector: string;
    /** Complete host workspace after its native sidebar; falls back to contentRootSelector when absent. */
    surfaceRootSelector?: string;
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
    host: HostId;
    entryId?: string;
}
export interface OpenOptions {
    host: HostId;
    entryId: string;
    config: AgentSurfaceConfig;
    activate?: boolean;
    configDir?: string;
    platform?: NodeJS.Platform;
    fetchImpl?: typeof fetch;
    hostFetchImpl?: typeof fetch;
    WebSocketImpl?: typeof WebSocket;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    intervalMs?: number;
    spawnImpl?: typeof import("node:child_process").spawn;
}
export interface InjectOptions {
    host: HostId;
    config: AgentSurfaceConfig;
    configDir?: string;
    platform?: NodeJS.Platform;
    fetchImpl?: typeof fetch;
    hostFetchImpl?: typeof fetch;
    WebSocketImpl?: typeof WebSocket;
    spawnImpl?: typeof import("node:child_process").spawn;
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
    startedCommand?: boolean;
    readinessWaitMs?: number;
}
export interface ProjectOpenOptions {
    provider: ProjectProviderId;
    targetPath: string;
    /** Explicit application executable or command path. Required on Windows. */
    appPath?: string;
    platform?: NodeJS.Platform;
    preferDeeplink?: boolean;
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
    activate?: boolean;
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
}
