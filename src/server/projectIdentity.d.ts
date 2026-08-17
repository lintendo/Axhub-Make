import { type ProjectMetadata } from './projectCore/index.ts';
export interface ProjectIdentity {
    id: string;
    name: string;
    source: 'make-client' | 'metadata' | 'fallback';
}
export interface ProjectIdentityFallback {
    id: string;
    name: string;
}
export declare function readProjectIdentity(projectRoot: string, options?: {
    metadataPath?: string;
    fallback?: ProjectIdentityFallback;
}): ProjectIdentity;
export declare function syncProjectIdentitySource(projectRoot: string, options?: {
    metadataPath?: string;
    fallback?: ProjectIdentityFallback;
    projectId?: string;
}): {
    identity: ProjectIdentity;
    metadata: ProjectMetadata;
};
export declare function updateProjectIdentityName(projectRoot: string, name: string, options?: {
    metadataPath?: string;
    fallback?: ProjectIdentityFallback;
}): {
    identity: ProjectIdentity;
    metadata: ProjectMetadata;
};
