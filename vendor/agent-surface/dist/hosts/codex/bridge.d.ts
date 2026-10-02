import type { OpenNewTaskParams } from "../../bridge/types.js";
import { type BridgeParams, type HostBridgeHandler } from "../bridge-contract.js";
export declare const CODEX_REFRESH_ACTION = "refresh-recent-conversations-for-host";
export interface CodexHostApi {
    appVersion?: string;
    actions?: Partial<Record<string, (params?: BridgeParams) => unknown | Promise<unknown>>>;
    openThread?: (id: string, kind?: string) => boolean | Promise<boolean>;
    openNewTask?: (params: OpenNewTaskParams) => unknown | Promise<unknown>;
    prefillPrompt?: (prompt: string) => boolean | Promise<boolean>;
    listWorkspaceRoots?: () => string[] | Promise<string[]>;
    hasWorkspaceRoot?: (path: string) => boolean | Promise<boolean>;
    ensureWorkspaceRoot?: (path: string) => unknown | Promise<unknown>;
    pathExists?: (path: string) => boolean | Promise<boolean>;
}
export declare function createCodexHostBridge(api: CodexHostApi): HostBridgeHandler;
