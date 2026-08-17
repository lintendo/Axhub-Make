import { type QoderWorkProjectSelectionOptions } from "../project/qoderwork.js";
import type { ProjectOpenOptions, ProjectOpenResult } from "../types.js";
export declare function validateProjectOpenOptions(options: ProjectOpenOptions): ProjectOpenResult | null;
interface OpenProjectDependencies {
    synchronizeQoderWorkProjectImpl?: (options: QoderWorkProjectSelectionOptions) => Promise<void>;
}
export declare function openProject(options: ProjectOpenOptions, dependencies?: OpenProjectDependencies): Promise<ProjectOpenResult>;
export {};
