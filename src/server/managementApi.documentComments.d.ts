import type { IncomingMessage, ServerResponse } from 'node:http';
type DocumentCommentsContext = {
    project: {
        root: string;
    };
};
export declare function handleDocumentCommentsApi(req: IncomingMessage, res: ServerResponse, context: DocumentCommentsContext, url: URL): boolean;
export {};
