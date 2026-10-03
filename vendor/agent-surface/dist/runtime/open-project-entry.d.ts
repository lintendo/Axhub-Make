import { openEntry } from "./open-entry.js";
import { openProject } from "./open-project.js";
import { getHostAdapter } from "../hosts/registry.js";
import type { OpenProjectAndEntryOptions, OpenProjectAndEntryResult } from "../types.js";
export interface OpenProjectAndEntryDependencies {
    openEntryImpl?: typeof openEntry;
    openProjectImpl?: typeof openProject;
    getAdapterImpl?: typeof getHostAdapter;
}
export declare function openProjectAndEntry(options: OpenProjectAndEntryOptions, dependencies?: OpenProjectAndEntryDependencies): Promise<OpenProjectAndEntryResult>;
