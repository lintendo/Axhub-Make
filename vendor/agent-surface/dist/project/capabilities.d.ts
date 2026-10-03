import type { ProjectProviderId } from "../types.js";
export type ProjectOpenSupportStatus = "supported" | "unsupported";
export type SupportedProjectProviderId = Exclude<ProjectProviderId, "traework">;
export declare function getProjectOpenSupport(provider: ProjectProviderId): ProjectOpenSupportStatus;
export declare function projectOpenUnsupportedMessage(provider: ProjectProviderId): string;
export declare function requireProjectOpenSupport(provider: ProjectProviderId): asserts provider is SupportedProjectProviderId;
