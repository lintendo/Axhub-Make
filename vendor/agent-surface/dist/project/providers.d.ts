import type { ProjectOpenOptions, StartCommand } from "../types.js";
export interface ProjectOpenCommand extends StartCommand {
    url?: string;
}
export declare function buildProjectOpenCommands(options: ProjectOpenOptions): ProjectOpenCommand[];
