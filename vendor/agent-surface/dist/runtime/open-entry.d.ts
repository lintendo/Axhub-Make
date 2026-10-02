import type { HostAdapter } from "../hosts/adapter.js";
import type { HostId, OpenOptions, OpenResult } from "../types.js";
import { resolveHost } from "../bridge/host-selection.js";
import { type HostClientDependencies } from "./host-client.js";
export interface RuntimeDependencies extends HostClientDependencies {
    getAdapter?: (host: HostId) => HostAdapter;
    resolveHostImpl?: typeof resolveHost;
}
export declare function openEntry(options: OpenOptions, dependencies?: RuntimeDependencies): Promise<OpenResult>;
