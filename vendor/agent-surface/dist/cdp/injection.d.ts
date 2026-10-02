import type { EntryDefinition, HostDomProfile } from "../types.js";
import type { HostBridgeRuntimeOptions } from "../runtime/host-bridge.js";
export interface InjectionEntry {
    id: string;
    name: string;
    url: string;
    order: number;
    icon?: string;
    headerActions?: EntryDefinition["headerActions"];
}
export declare function toInjectionEntry(entry: EntryDefinition, icon?: string): InjectionEntry;
export declare function buildEntryInjection(entries: InjectionEntry[], profile: HostDomProfile, hostBridge?: HostBridgeRuntimeOptions): string;
