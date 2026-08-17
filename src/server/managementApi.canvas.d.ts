import type { IncomingMessage, ServerResponse } from 'node:http';
interface CanvasApiContext {
    metadata?: unknown;
    projectId?: string;
}
export declare function createDefaultCanvasData(): {
    type: string;
    version: number;
    source: string;
    elements: any[];
    appState: {
        viewBackgroundColor: string;
    };
    files: {};
};
export declare function handleCanvasApi(req: IncomingMessage, res: ServerResponse, projectRoot: string, pathname: string, context?: CanvasApiContext): boolean;
export {};
