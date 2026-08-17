import { attachTarget } from "../cdp/targets.js";
import type { HostAdapter } from "../hosts/adapter.js";
import type { InjectOptions, InjectResult } from "../types.js";
export interface InjectDependencies {
    getAdapter?: (host: InjectOptions["host"]) => HostAdapter;
    attachImpl?: typeof attachTarget;
}
export declare function injectEntries(options: InjectOptions, dependencies?: InjectDependencies): Promise<InjectResult>;
