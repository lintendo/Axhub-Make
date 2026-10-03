import type { HostAdapter } from "../hosts/adapter.js";
import type { HostId, InjectOptions, InjectResult } from "../types.js";
import { resolveHost } from "../bridge/host-selection.js";
import { type HostClientDependencies } from "./host-client.js";
export interface InjectDependencies extends HostClientDependencies {
    getAdapter?: (host: HostId) => HostAdapter;
    resolveHostImpl?: typeof resolveHost;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    intervalMs?: number;
}
export declare function injectEntries(options: InjectOptions, dependencies?: InjectDependencies): Promise<InjectResult>;
