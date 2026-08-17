import { attachTarget } from "../cdp/targets.js";
import { startCommand } from "../core/start-command.js";
import type { HostAdapter } from "../hosts/adapter.js";
import type { OpenOptions, OpenResult } from "../types.js";
export interface RuntimeDependencies {
    getAdapter?: (host: OpenOptions["host"]) => HostAdapter;
    startImpl?: typeof startCommand;
    attachImpl?: typeof attachTarget;
}
export declare function openEntry(options: OpenOptions, dependencies?: RuntimeDependencies): Promise<OpenResult>;
