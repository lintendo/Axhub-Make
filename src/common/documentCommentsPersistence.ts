import type {
  CommentaryHostResource,
  PrototypeEditCommentsDocument,
  PrototypeEditCommentsPersistenceAdapter,
  PrototypeEditCommentsPersistenceScope,
} from '@axhub/commentary';
import { buildMakeServerApiUrl } from './makeServerOrigin';

export type DocumentCommentContext = {
  projectId: string;
  documentPath: string;
  makeServerOrigin?: string;
  commentFilePath?: string;
  commentAssetRoot?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveScopeContext(
  getContext: () => DocumentCommentContext | null,
  scope: PrototypeEditCommentsPersistenceScope,
): DocumentCommentContext | null {
  const context = getContext();
  if (!context) return null;
  const documentPath = normalizeString(context.documentPath || scope.targetPath);
  const projectId = normalizeString(context.projectId || scope.prototypeId);
  return documentPath && projectId
    ? { ...context, documentPath, projectId }
    : null;
}

function buildScopeResource(context: DocumentCommentContext): CommentaryHostResource {
  return {
    kind: 'document',
    id: context.documentPath,
    path: context.documentPath,
    meta: {
      projectId: context.projectId,
      documentPath: context.documentPath,
    },
  };
}

export function createDocumentCommentsPersistenceScope(
  context: DocumentCommentContext,
  resource: CommentaryHostResource | null = buildScopeResource(context),
): PrototypeEditCommentsPersistenceScope {
  return {
    targetPath: context.documentPath,
    storageScope: `document:${context.documentPath}`,
    prototypeId: context.projectId,
    filePath: context.documentPath,
    resource,
    documentKind: 'document',
  };
}

export function createDocumentCommentsPersistenceAdapter(
  getContext: () => DocumentCommentContext | null,
): PrototypeEditCommentsPersistenceAdapter {
  const resolveRequestUrl = async (
    scope: PrototypeEditCommentsPersistenceScope,
    extraSearchParams: Record<string, string> = {},
  ): Promise<string> => {
    const context = resolveScopeContext(getContext, scope);
    if (!context) return '';
    const params = new URLSearchParams({
      path: context.documentPath,
      projectId: context.projectId,
      ...extraSearchParams,
    });
    return buildMakeServerApiUrl(
      context.makeServerOrigin || '',
      '/api/document-comments',
      params,
    );
  };

  return {
    async read(scope) {
      const url = await resolveRequestUrl(scope, { hydrateImages: '1' });
      if (!url) return null;
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Failed to read document comments: ${response.status}`);
      }
      const payload = await response.json().catch(() => null) as {
        exists?: boolean;
        document?: PrototypeEditCommentsDocument | null;
      } | null;
      return payload?.exists && payload.document ? payload.document : null;
    },
    async write(scope, document, reason, context) {
      if (!resolveScopeContext(getContext, scope)) {
        throw new Error('Document comment context is unavailable');
      }
      const url = await resolveRequestUrl(scope);
      if (!url) {
        throw new Error(
          'Make server origin is unavailable; standalone previews do not support comments.',
        );
      }
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document,
          reason,
          ...(context?.observedTombstones?.length
            ? { observedTombstones: context.observedTombstones }
            : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to write document comments: ${response.status}`);
      }
    },
  };
}
