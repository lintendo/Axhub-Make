import type { IncomingMessage } from 'node:http';
import { type ProjectMetadata } from './projectCore/index.ts';
type RuntimeLinkRequest = Pick<IncomingMessage, 'headers'>;
type ResourceWithUrls = {
    id?: string;
    name?: string;
    clientUrl?: string;
    previewUrl?: string;
};
export declare function backfillMakeClientThemePreviewLinks<T extends ResourceWithUrls>(themes: T[], projectRoot: string, runtimeOriginOverride?: string, request?: RuntimeLinkRequest): T[];
export declare function backfillMakeClientPrototypePreviewLinks<T extends ResourceWithUrls>(prototypes: T[], projectRoot: string, runtimeOriginOverride?: string, request?: RuntimeLinkRequest): T[];
export declare function backfillMakeClientResourcePreviewLinks(metadata: ProjectMetadata, projectRoot: string, runtimeOriginOverride?: string, request?: RuntimeLinkRequest): ProjectMetadata;
export {};
