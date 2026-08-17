export type ProjectResourceType = 'prototypes' | 'docs' | 'themes' | 'data' | 'templates';
export type ProjectResourceWriteTargetType = ProjectResourceType | 'media';
export type PrototypePreviewMode = 'clientRuntime';
export interface PrototypeResourceArtifacts {
    [key: string]: unknown;
}
export interface PrototypeResourcePage {
    id: string;
    title: string;
    group?: string;
}
export interface PrototypePlaceholderGuide {
    kind: string;
    title: string;
    description: string;
    steps: string[];
    tips: string[];
}
export type PrototypeGenerationStatus = 'waiting';
export interface PrototypeResource {
    id: string;
    name: string;
    title: string;
    clientUrl: string;
    previewMode: PrototypePreviewMode;
    description: string;
    updatedAt: string;
    placeholder?: boolean;
    placeholderGuide?: PrototypePlaceholderGuide;
    generationStatus?: PrototypeGenerationStatus;
    filePath?: string;
    absoluteFilePath?: string;
    specFilePath?: string;
    previewDisabled?: boolean;
    artifacts?: PrototypeResourceArtifacts;
    pages?: PrototypeResourcePage[];
    defaultPageId?: string;
    importReport?: Record<string, unknown>;
}
export interface GenericProjectResource {
    id: string;
    name?: string;
    title?: string;
    [key: string]: unknown;
}
/**
 * Project metadata describes resources and capabilities owned by .axhub/make/project.json.
 *
 * capabilities.resourceWrites are normalized effective server write switches.
 * Project files do not need to declare them; make-server derives write support
 * from resourceWriteTargets plus implemented routes.
 * resourceWriteTargets are write destinations, such as docs.path = "src/resources".
 *
 * resources stores dedicated Make artifacts only. Ordinary files, including
 * Markdown docs, data files, templates, images, Drawio diagrams, and Excalidraw
 * canvases, are discovered from src/resources instead of project metadata.
 *
 * navigation stores prototype display order.
 * orders stores theme display order.
 *
 * server and projectInfo belong to .axhub/make/axhub.config.json. They are
 * project runtime/display config, not project metadata fields.
 */
export interface ProjectMetadata {
    schemaVersion: 1;
    project: {
        id: string;
        name: string;
    };
    resources: {
        prototypes: PrototypeResource[];
        themes: GenericProjectResource[];
    };
    navigation: {
        prototypes: string[];
    };
    orders: {
        themes: string[];
    };
    capabilities: {
        quickEdit: boolean;
        quickEditMode: PrototypePreviewMode;
        figmaExport: boolean;
        axureExport: boolean;
        localExports: LocalExportCapabilities;
        resourceWrites: ResourceWriteCapabilities;
    };
    resourceWriteTargets: ProjectResourceWriteTargets;
}
export interface ProjectResourceWriteTarget {
    type: 'project-relative-path';
    path: string;
}
export type ProjectResourceWriteTargets = Partial<Record<ProjectResourceWriteTargetType, ProjectResourceWriteTarget>>;
export interface ResourceWriteCapabilities {
    prototypeCreate: boolean;
    prototypeUpload: boolean;
    docCreate: boolean;
    docImport: boolean;
    themeCreate: boolean;
    themeImport: boolean;
    dataCreate: boolean;
    dataImport: boolean;
    templateCreate: boolean;
    templateDuplicate: boolean;
}
export interface LocalExportCapabilities {
    html: boolean;
    make: boolean;
}
export declare function createProjectMetadataStore(projectRoot: string, options?: {
    metadataPath?: string;
}): {
    getMetadataPath(): string;
    getMetadata: () => ProjectMetadata;
    saveMetadata(metadata: unknown): ProjectMetadata;
};
