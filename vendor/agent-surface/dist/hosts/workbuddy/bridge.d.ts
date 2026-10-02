import type { OpenNewTaskParams } from "../../bridge/types.js";
import { type HostBridgeHandler } from "../bridge-contract.js";
export interface WorkBuddyHostApi {
    appVersion?: string;
    listTasks?: () => unknown | Promise<unknown>;
    refreshConversations?: (options: {
        silent: boolean;
    }) => unknown | Promise<unknown>;
    openSession?: (id: string) => boolean | Promise<boolean>;
    openNewTask?: (params: OpenNewTaskParams) => unknown | Promise<unknown>;
    listWorkspaces?: () => string[] | Promise<string[]>;
    hasWorkspace?: (path: string) => boolean | Promise<boolean>;
    ensureWorkspace?: (path: string) => unknown | Promise<unknown>;
    pathExists?: (path: string) => boolean | Promise<boolean>;
}
export declare function createWorkBuddyHostBridge(api: WorkBuddyHostApi): HostBridgeHandler;
