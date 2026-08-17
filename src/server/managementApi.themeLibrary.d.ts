import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ProjectMetadata, type RegisteredProject } from './projectCore/index.ts';
import type { ManagementApiOptions } from './managementApi.ts';
interface ThemeLibraryProjectContext {
    project: RegisteredProject;
    metadata: ProjectMetadata;
    metadataStore: {
        getMetadata: () => ProjectMetadata;
        saveMetadata: (metadata: ProjectMetadata) => ProjectMetadata;
    };
}
interface ThemeLibraryHandlers {
    createProjectContextFromBody: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, body: unknown) => ThemeLibraryProjectContext | null;
    getDeclaredResourceWriteDir: (context: ThemeLibraryProjectContext, type: 'themes') => string | null;
    hasResourceWriteCapability: (context: ThemeLibraryProjectContext, capability: keyof ProjectMetadata['capabilities']['resourceWrites']) => boolean;
    sendDisabledCapability: (res: ServerResponse, status: number, payload: {
        code: string;
        error: string;
        projectId?: string;
        projectRoot?: string;
        adapterRequired?: boolean;
        details?: Record<string, unknown>;
    }) => void;
}
export declare function handleThemeLibraryApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: ThemeLibraryHandlers): boolean;
export {};
