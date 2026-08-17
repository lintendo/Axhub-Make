import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ProjectMetadata, type RegisteredProject } from './projectCore/index.ts';
import type { ManagementApiOptions } from './managementApi.ts';
export type PrototypeSpecFormat = 'html' | 'markdown';
export interface PrototypeSpecDescriptor {
    exists: boolean;
    format: PrototypeSpecFormat | null;
    activePath: 'spec.html' | 'spec.md' | null;
    hasHtml: boolean;
    hasMarkdown: boolean;
    previewUrl: string | null;
    editable: boolean;
}
export interface PrototypeSpecProjectContext {
    project: Pick<RegisteredProject, 'root'>;
    metadata: ProjectMetadata;
}
export interface PrototypeMainSpecStatus {
    available: boolean;
    activePath: 'spec.html' | 'spec.md' | null;
    projectPath: string | null;
}
interface PrototypeSpecApiHandlers {
    resolveProjectContext: (req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, mode: 'explicit-required', body?: unknown) => PrototypeSpecProjectContext | null;
}
export declare function resolvePrototypeMainSpecStatus(context: PrototypeSpecProjectContext, prototypeId: string): PrototypeMainSpecStatus;
export declare function handlePrototypeSpecApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string, handlers: PrototypeSpecApiHandlers): boolean;
export {};
