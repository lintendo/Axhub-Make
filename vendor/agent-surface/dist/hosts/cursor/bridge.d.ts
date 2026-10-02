import type { OpenNewTaskParams } from "../../bridge/types.js";
import { type HostBridgeHandler } from "../bridge-contract.js";
export interface CursorHostApi {
    appVersion?: string;
    refreshComposers?: () => unknown | Promise<unknown>;
    openComposer?: (id: string, kind?: string) => boolean | Promise<boolean>;
    openNewComposer?: (params: Omit<OpenNewTaskParams, "prompt">) => unknown | Promise<unknown>;
    prefillPrompt?: (prompt: string) => boolean | Promise<boolean>;
    listWorkspaceFolders?: () => string[] | Promise<string[]>;
    hasWorkspaceFolder?: (path: string) => boolean | Promise<boolean>;
    ensureWorkspaceFolder?: (path: string) => unknown | Promise<unknown>;
    pathExists?: (path: string) => boolean | Promise<boolean>;
    sidebarSynchronizationGuaranteed?: boolean;
}
export declare function createCursorHostBridge(api: CursorHostApi): HostBridgeHandler;
