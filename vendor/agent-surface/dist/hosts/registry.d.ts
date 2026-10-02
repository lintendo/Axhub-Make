import type { HostAdapter } from "./adapter.js";
import type { HostId } from "../types.js";
export declare function getHostAdapter(host: HostId): HostAdapter;
export declare function listHostAdapters(): HostAdapter[];
