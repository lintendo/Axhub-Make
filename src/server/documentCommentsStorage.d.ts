export type DocumentCommentStorage = {
    documentPath: string;
    documentHash: string;
    commentFilePath: string;
    assetDir: string;
    projectRelativeCommentPath: string;
};
export type PrototypeCommentStorage = {
    prototypeId: string;
    targetPath: string;
    prototypeHash: string;
    prototypeDir: string;
    commentFilePath: string;
    assetDir: string;
    projectRelativeCommentPath: string;
    projectRelativeAssetRoot: string;
};
export declare function normalizeDocumentCommentPath(value: unknown): string | null;
export declare function documentCommentHash(documentPath: string): string;
export declare function normalizePrototypeCommentTargetPath(value: unknown): string | null;
export declare function prototypeCommentHash(targetPath: string): string;
export declare function resolveDocumentCommentStorage(projectRoot: string, documentPath: unknown): DocumentCommentStorage | null;
export declare function resolvePrototypeCommentStorage(projectRoot: string, targetPath: unknown): PrototypeCommentStorage | null;
