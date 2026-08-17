import { type RegisteredProject } from './projectCore/index.ts';
export declare function findRegisteredProjectByRoot(projects: RegisteredProject[], projectRoot: string, platform?: NodeJS.Platform): RegisteredProject | null;
export declare function allocateRegisteredProjectId(sourceId: string, isTaken: (projectId: string) => boolean): string;
