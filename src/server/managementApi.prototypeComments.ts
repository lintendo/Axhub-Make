import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isPathInside, resolveProjectPath, type ProjectMetadata } from './projectCore/index.ts';

import { readJsonBody, sendCorsJson, sendCorsPreflight, sendFile, sendJson } from './http.ts';
import {
  normalizePrototypeCommentTargetPath,
  resolvePrototypeCommentStorage,
  type PrototypeCommentStorageOptions,
  type PrototypeCommentStorage,
} from './documentCommentsStorage.ts';
import { readRealtimeManifest } from './lanPublishingStorage.ts';
import { isLanAccessRequestLocal } from './lanAccessControl.ts';
import { resolveRequestIp } from './localPublishingPublic.ts';

type PrototypeCommentsWriteReason = 'changes' | 'state' | 'restore' | 'clear';

export type ObservedCommentTombstone = {
  kind: 'comment';
  commentId: string;
  deletedAt: number;
};

export type ObservedImageTombstone = {
  kind: 'image';
  id: string;
  commentId: string;
  deletedAt: number;
};

export type ObservedTombstone = ObservedCommentTombstone | ObservedImageTombstone;

type PrototypeCommentsContext = {
  project: {
    root: string;
    id?: string;
  };
  metadata?: ProjectMetadata;
};

type ResolveResult =
  | ({ ok: true } & PrototypeCommentStorage)
  | {
      ok: false;
      status: number;
      error: string;
    };

function normalizeTargetPath(rawValue: string | null): { ok: true; value: string; id: string } | { ok: false; status: number; error: string } {
  const raw = String(rawValue ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw) {
    return { ok: false, status: 400, error: 'Missing targetPath' };
  }
  if (raw.includes('..')) {
    return { ok: false, status: 403, error: 'Invalid targetPath' };
  }
  const normalized = normalizePrototypeCommentTargetPath(raw);
  if (!normalized) {
    return { ok: false, status: 400, error: 'targetPath must be prototypes/<id>' };
  }
  return { ok: true, value: normalized, id: normalized.slice('prototypes/'.length) };
}

function isResolveError<T extends { ok: boolean }>(result: T): result is Extract<T, { ok: false }> {
  return result.ok === false;
}

function getDeclaredPrototypeWriteDir(projectRoot: string, metadata?: ProjectMetadata): string | null {
  const target = metadata?.resourceWriteTargets?.prototypes;
  if (!target || target.type !== 'project-relative-path' || !target.path) {
    return null;
  }
  try {
    return resolveProjectPath(projectRoot, target.path);
  } catch {
    return null;
  }
}

function resolvePrototypeCommentsPath(
  projectRoot: string,
  rawTargetPath: string | null,
  metadata?: ProjectMetadata,
  storageOptions?: PrototypeCommentStorageOptions,
): ResolveResult {
  const normalized = normalizeTargetPath(rawTargetPath);
  if (normalized.ok === false) {
    return {
      ok: false,
      status: normalized.status,
      error: normalized.error,
    };
  }

  const prototypesDir = getDeclaredPrototypeWriteDir(projectRoot, metadata);
  if (!prototypesDir) {
    return { ok: false, status: 424, error: 'Prototype comment persistence requires declared prototype write target' };
  }
  const defaultPrototypesDir = path.join(projectRoot, 'src', 'prototypes');
  if (path.resolve(prototypesDir) !== path.resolve(defaultPrototypesDir)) {
    return { ok: false, status: 403, error: 'Prototype comment persistence is limited to src/prototypes' };
  }

  const storage = resolvePrototypeCommentStorage(projectRoot, normalized.value, storageOptions);
  return storage
    ? { ok: true, ...storage }
    : { ok: false, status: 403, error: 'Prototype comment path crosses a symbolic link boundary' };
}

function inferImageExtension(mimeType: string): string {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/svg+xml') return 'svg';
  return 'png';
}

function sanitizeAssetBaseName(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim().replace(/\.[a-z0-9+.-]+$/iu, '');
  const safe = normalized
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  return safe || fallback;
}

function parseImageDataUrl(dataUrl: unknown): { mimeType: string; buffer: Buffer } | null {
  const raw = String(dataUrl ?? '').trim();
  const match = raw.match(/^data:(image\/[a-z0-9+.-]+);base64,([a-z0-9+/=\s]+)$/iu);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s+/gu, ''), 'base64'),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isDeletedRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const deletedAt = Number(value.deletedAt);
  return Number.isFinite(deletedAt) && deletedAt > 0;
}

function normalizeWriteReason(value: unknown): PrototypeCommentsWriteReason {
  return value === 'state' || value === 'restore' || value === 'clear' ? value : 'changes';
}

function readStoredCommentDocument(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) && parsed.schemaVersion === 3 && parsed.kind === 'prototype-edit-comments'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function normalizeIdentityPart(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildCommentIdentity(record: { id?: unknown }): string {
  return normalizeIdentityPart(record.id);
}

export function buildImageIdentity(record: { id?: unknown }): string {
  return normalizeIdentityPart(record.id);
}

export function normalizeObservedTombstones(value: unknown): ObservedTombstone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): ObservedTombstone[] => {
    if (!isRecord(candidate)) return [];
    const kind = candidate.kind;
    const commentId = normalizeIdentityPart(candidate.commentId);
    const deletedAt = Number(candidate.deletedAt);
    if (!commentId || !Number.isFinite(deletedAt) || deletedAt <= 0) return [];
    if (kind === 'comment') {
      return [{ kind, commentId, deletedAt }];
    }
    if (kind === 'image') {
      const id = normalizeIdentityPart(candidate.id);
      return id ? [{ kind, id, commentId, deletedAt }] : [];
    }
    return [];
  });
}

export function mergeStoredTombstones(
  previous: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!previous) {
    return incoming;
  }
  const previousComments = Array.isArray(previous.comments) ? previous.comments : [];
  const incomingComments = Array.isArray(incoming.comments) ? incoming.comments : [];
  const commentTombstones = previousComments.filter(
    (value): value is Record<string, unknown> => isRecord(value) && isDeletedRecord(value),
  );
  const commentBarriers = new Set(
    commentTombstones.map(buildCommentIdentity).filter(Boolean),
  );
  const incomingActiveComments = incomingComments.filter((value) => {
    if (!isRecord(value)) return true;
    return !commentBarriers.has(buildCommentIdentity(value));
  });
  const previousCommentsByIdentity = new Map(
    previousComments
      .filter(isRecord)
      .map((value) => [buildCommentIdentity(value), value] as const)
      .filter(([identity]) => Boolean(identity)),
  );
  const incomingCommentsWithExternalPreserved = incomingActiveComments.map((value) => {
    if (!isRecord(value)) return value;
    const identity = buildCommentIdentity(value);
    const previousValue = identity ? previousCommentsByIdentity.get(identity) : undefined;
    const previousExternal = previousValue && Array.isArray(previousValue.externalComments)
      ? previousValue.externalComments
      : [];
    if (!previousExternal.length) {
      if (!Array.isArray(value.externalComments)) return value;
      const { externalComments: _ignoredExternalComments, ...withoutExternalComments } = value;
      return withoutExternalComments;
    }
    return {
      ...value,
      externalComments: previousExternal.map((entry) => ({ ...entry })),
    };
  });
  const incomingCommentIdentities = new Set(
    incomingCommentsWithExternalPreserved
      .filter(isRecord)
      .map(buildCommentIdentity)
      .filter(Boolean),
  );
  const preservedActiveComments = previousComments.filter((value) => {
    if (!isRecord(value) || isDeletedRecord(value)) return false;
    const identity = buildCommentIdentity(value);
    return Boolean(
      identity
      && !commentBarriers.has(identity)
      && !incomingCommentIdentities.has(identity),
    );
  });
  const previousImages = Array.isArray(previous.images) ? previous.images : [];
  const incomingImages = Array.isArray(incoming.images) ? incoming.images : [];
  const imageTombstones = previousImages.filter(
    (value): value is Record<string, unknown> => isRecord(value) && isDeletedRecord(value),
  );
  const imageBarriers = new Set(imageTombstones.map(buildImageIdentity).filter(Boolean));
  const incomingActiveImages = incomingImages.filter((value) => {
    if (!isRecord(value)) return true;
    const commentIdentity = normalizeIdentityPart(value.commentId);
    const imageIdentity = buildImageIdentity(value);
    return !commentBarriers.has(commentIdentity) && !imageBarriers.has(imageIdentity);
  });
  const incomingImageIdentities = new Set(
    incomingActiveImages
      .filter(isRecord)
      .map(buildImageIdentity)
      .filter(Boolean),
  );
  const preservedActiveImages = previousImages.filter((value) => {
    if (!isRecord(value) || isDeletedRecord(value)) return false;
    const commentIdentity = normalizeIdentityPart(value.commentId);
    const imageIdentity = buildImageIdentity(value);
    return Boolean(
      imageIdentity
      && !commentBarriers.has(commentIdentity)
      && !imageBarriers.has(imageIdentity)
      && !incomingImageIdentities.has(imageIdentity),
    );
  });

  return {
    ...incoming,
    comments: [
      ...incomingCommentsWithExternalPreserved,
      ...preservedActiveComments,
      ...commentTombstones,
    ],
    images: [
      ...incomingActiveImages,
      ...preservedActiveImages,
      ...imageTombstones,
    ],
  };
}

export function compactObservedTombstones(
  previous: Record<string, unknown>,
  observedTombstones: ObservedTombstone[],
): Record<string, unknown> {
  const comments = Array.isArray(previous.comments) ? previous.comments : [];
  const images = Array.isArray(previous.images) ? previous.images : [];
  const observedComments = observedTombstones.filter(
    (value): value is ObservedCommentTombstone => value.kind === 'comment',
  );
  const matchedCommentIdentities = new Set<string>();
  for (const value of comments) {
    if (!isRecord(value) || !isDeletedRecord(value)) continue;
    const identity = buildCommentIdentity(value);
    if (!identity) continue;
    if (observedComments.some((tombstone) => (
      identity === tombstone.commentId
      && Number(value.deletedAt) === tombstone.deletedAt
    ))) {
      matchedCommentIdentities.add(identity);
    }
  }

  const observedImages = observedTombstones.filter(
    (value): value is ObservedImageTombstone => value.kind === 'image',
  );
  const matchedImageIdentities = new Set<string>();
  for (const value of images) {
    if (!isRecord(value) || !isDeletedRecord(value)) continue;
    const identity = buildImageIdentity(value);
    if (!identity) continue;
    if (observedImages.some((tombstone) => (
      identity === tombstone.id
      && Number(value.deletedAt) === tombstone.deletedAt
    ))) {
      matchedImageIdentities.add(identity);
    }
  }

  return {
    ...previous,
    comments: comments.filter((value) => {
      if (!isRecord(value)) return true;
      return !matchedCommentIdentities.has(buildCommentIdentity(value));
    }),
    images: images.filter((value) => {
      if (!isRecord(value)) return true;
      return !matchedCommentIdentities.has(normalizeIdentityPart(value.commentId))
        && !matchedImageIdentities.has(buildImageIdentity(value));
    }),
  };
}

function normalizeCommentDocument(input: unknown, resolved: Extract<ResolveResult, { ok: true }>): Record<string, unknown> {
  const raw = input && typeof input === 'object' && 'document' in input
    ? (input as { document?: unknown }).document
    : input;
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
  if (
    record.schemaVersion !== 3 ||
    record.kind !== 'prototype-edit-comments' ||
    !Array.isArray(record.comments) ||
    !Array.isArray(record.images)
  ) {
    throw new Error('Prototype comments require schema version 3');
  }
  const resource = record.resource && typeof record.resource === 'object' && !Array.isArray(record.resource)
    ? { ...(record.resource as Record<string, unknown>) }
    : {};
  const { tasks: _removedTasks, ...recordWithoutTasks } = record;

  return {
    ...recordWithoutTasks,
    schemaVersion: 3,
    kind: 'prototype-edit-comments',
    resource: {
      ...resource,
      id: resolved.prototypeId,
      targetPath: `prototypes/${resolved.prototypeId}`,
      filePath: resolved.projectRelativeCommentPath,
    },
    comments: record.comments.map((comment) => {
      if (!isRecord(comment)) return comment;
      return {
        ...comment,
        ...(Array.isArray(comment.externalComments)
          ? { externalComments: normalizeExternalComments(comment.externalComments) }
          : {}),
      };
    }),
    images: record.images,
  };
}

type PublishedCommentIdentity = {
  author: string;
  authorIp: string;
  commenterId: string;
  viewer: boolean;
};

const PUBLISHED_COMMENTER_HEADER = 'x-axhub-published-commenter';

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function resolvePublishedCommenterId(req: IncomingMessage, shareId: string): string {
  const token = getHeaderValue(req.headers[PUBLISHED_COMMENTER_HEADER]).trim();
  if (!/^[a-z0-9_-]{32,160}$/iu.test(token)) return '';
  return crypto.createHash('sha256').update(`${shareId}\0${token}`).digest('hex');
}

function normalizePublishedTargetPath(resourcePath: string): string {
  return String(resourcePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^src\//u, '')
    .replace(/\/index\.(t|j)sx?$/iu, '')
    .replace(/^\/+|\/+$/gu, '');
}

function resolvePublishedCommentIdentity(
  req: IncomingMessage,
  url: URL,
  context: PrototypeCommentsContext,
  resolved: Extract<ResolveResult, { ok: true }>,
): { identity: PublishedCommentIdentity } | { status: number; error: string } | null {
  const shareId = String(url.searchParams.get('publishedShareId') || '').trim();
  if (!shareId) return null;
  const manifest = readRealtimeManifest(context.project.root, shareId);
  if (!manifest) {
    return { status: 404, error: 'Published realtime share not found' };
  }
  if (context.project.id && manifest.projectId !== context.project.id) {
    return { status: 403, error: 'Published realtime share does not belong to this project' };
  }
  if (normalizePublishedTargetPath(manifest.resourcePath) !== resolved.targetPath) {
    return { status: 403, error: 'Published realtime share does not match this prototype' };
  }
  if (!manifest.commentable) {
    return { status: 403, error: 'Published realtime comments are disabled' };
  }
  const authorIp = resolveRequestIp(req);
  const commenterName = String(url.searchParams.get('commenterName') || '').trim().slice(0, 120);
  const commenterId = resolvePublishedCommenterId(req, shareId);
  const remoteViewer = !isLanAccessRequestLocal(req);
  if (remoteViewer && !commenterId) {
    return { status: 401, error: 'Published commenter identity is required' };
  }
  return {
    identity: {
      author: commenterName || authorIp,
      authorIp,
      commenterId,
      viewer: Boolean(commenterId),
    },
  };
}

function normalizeExternalCommentEntry(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const id = normalizeIdentityPart(value.id);
  const authorId = normalizeIdentityPart(value.authorId);
  const authorName = normalizeIdentityPart(value.authorName) || '评审者';
  const content = normalizeIdentityPart(value.content).slice(0, 2000);
  const createdAt = Number(value.createdAt);
  if (!id || !authorId || !content || !Number.isFinite(createdAt) || createdAt <= 0) return null;
  return {
    ...value,
    id,
    authorId,
    authorName,
    content,
    createdAt,
    ...(Number(value.updatedAt) > 0 ? { updatedAt: Number(value.updatedAt) } : {}),
  };
}

function normalizeExternalComments(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const candidate of value) {
    const normalized = normalizeExternalCommentEntry(candidate);
    if (normalized) byId.set(String(normalized.id), normalized);
  }
  return [...byId.values()].sort((left, right) => (
    Number(left.createdAt) - Number(right.createdAt)
    || String(left.id).localeCompare(String(right.id))
  ));
}

function projectPublishedExternalCommentsForViewer(
  document: Record<string, unknown> | null,
  identity: PublishedCommentIdentity,
): Record<string, unknown> | null {
  if (!document) return null;
  const comments: Record<string, unknown>[] = (Array.isArray(document.comments) ? document.comments : [])
    .filter(isRecord)
    .map((comment) => {
      const externalComments = normalizeExternalComments(comment.externalComments)
        .filter((entry) => normalizeIdentityPart(entry.authorId) === identity.commenterId);
      const { comment: _localComment, author: _author, commenterId: _commenterId, authorIp: _authorIp, ...projected } = comment;
      return {
        ...projected,
        ...(externalComments.length > 0 ? { externalComments } : {}),
      };
    })
    .filter((comment) => Array.isArray(comment.externalComments) && comment.externalComments.length > 0);
  const ownedCommentIds = new Set(
    comments
      .map((comment) => normalizeIdentityPart(comment.id))
      .filter(Boolean),
  );
  const images = (Array.isArray(document.images) ? document.images : [])
    .filter(isRecord)
    .filter((image) => {
      const commentId = normalizeIdentityPart(image.commentId);
      if (!commentId) return false;
      return ownedCommentIds.has(commentId);
    });
  return {
    ...document,
    comments,
    images,
  };
}

function mergePublishedExternalComments(
  previous: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  identity: PublishedCommentIdentity,
  reason: PrototypeCommentsWriteReason,
  observedTombstones: ObservedTombstone[],
): Record<string, unknown> {
  if (!previous) {
    return {
      ...incoming,
      comments: (Array.isArray(incoming.comments) ? incoming.comments : []).filter(isRecord).map((comment) => ({
        ...comment,
        externalComments: normalizeExternalComments(comment.externalComments).map((entry) => ({
          ...entry,
          authorId: identity.commenterId,
          authorName: identity.author || '评审者',
        })),
      })),
    };
  }
  const previousComments = Array.isArray(previous.comments) ? previous.comments : [];
  const incomingComments = Array.isArray(incoming.comments) ? incoming.comments : [];
  const incomingById = new Map(incomingComments.filter(isRecord).map((comment) => [normalizeIdentityPart(comment.id), comment]));
  const comments: Record<string, unknown>[] = previousComments.filter(isRecord).map((comment) => {
    const id = normalizeIdentityPart(comment.id);
    const own = normalizeExternalComments(comment.externalComments)
      .filter((entry) => normalizeIdentityPart(entry.authorId) === identity.commenterId);
    const others = normalizeExternalComments(comment.externalComments)
      .filter((entry) => normalizeIdentityPart(entry.authorId) !== identity.commenterId);
    const incomingComment = incomingById.get(id);
    const incomingExternal = incomingComment ? normalizeExternalComments(incomingComment.externalComments) : [];
    const incomingContent = incomingComment ? normalizeIdentityPart(incomingComment.comment) : '';
    const hasIncomingExternalField = Boolean(incomingComment && Array.isArray(incomingComment.externalComments));
    const requested = incomingContent
        ? [{
            id: own[0]?.id || `${identity.commenterId}-${id || crypto.randomUUID()}`,
            authorId: identity.commenterId,
            authorName: identity.author || '评审者',
            content: incomingContent,
            createdAt: Number(own[0]?.createdAt) > 0 ? Number(own[0].createdAt) : Date.now(),
            updatedAt: Date.now(),
          }]
        : hasIncomingExternalField
          ? incomingExternal.map((entry) => ({
              ...entry,
              authorId: identity.commenterId,
              authorName: identity.author || '评审者',
            }))
          : own;
    return {
      ...comment,
      externalComments: [...others, ...requested],
    };
  });
  const existingIds = new Set(comments.map((comment) => normalizeIdentityPart(comment.id)));
  for (const incomingComment of incomingComments.filter(isRecord)) {
    const id = normalizeIdentityPart(incomingComment.id);
    if (!id || existingIds.has(id)) continue;
    const external: Record<string, unknown>[] = normalizeExternalComments(incomingComment.externalComments).map((entry) => ({
      ...entry,
      authorId: identity.commenterId,
      authorName: identity.author || '评审者',
    }));
    const content = normalizeIdentityPart(incomingComment.comment);
    if (!external.length && content) {
      external.push({
        id: `${identity.commenterId}-${id}`,
        authorId: identity.commenterId,
        authorName: identity.author || '评审者',
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    comments.push({ ...incomingComment, externalComments: external });
  }
  if (reason === 'clear') {
    return {
      ...previous,
      comments: previousComments.filter(isRecord).map((comment) => ({
        ...comment,
        externalComments: normalizeExternalComments(comment.externalComments)
          .filter((entry) => normalizeIdentityPart(entry.authorId) !== identity.commenterId),
      })),
      images: Array.isArray(previous.images) ? previous.images : [],
    };
  }
  return {
    ...previous,
    comments,
    images: Array.isArray(previous.images) ? previous.images : [],
  };
}

type PrototypeCommentsRequestResolution =
  | {
      ok: true;
      resolved: Extract<ResolveResult, { ok: true }>;
      publishedIdentity: PublishedCommentIdentity | null;
    }
  | Extract<ResolveResult, { ok: false }>;

function resolvePrototypeCommentsRequest(
  req: IncomingMessage,
  url: URL,
  context: PrototypeCommentsContext,
): PrototypeCommentsRequestResolution {
  const authorResolved = resolvePrototypeCommentsPath(
    context.project.root,
    url.searchParams.get('targetPath'),
    context.metadata,
  );
  if (isResolveError(authorResolved)) return authorResolved;

  const publishedIdentity = resolvePublishedCommentIdentity(req, url, context, authorResolved);
  if (publishedIdentity && 'error' in publishedIdentity) {
    return {
      ok: false,
      status: publishedIdentity.status,
      error: publishedIdentity.error,
    };
  }

  if (!publishedIdentity && !isLanAccessRequestLocal(req)) {
    return { ok: false, status: 401, error: 'Published share identity is required' };
  }

  return {
    ok: true,
    resolved: authorResolved,
    publishedIdentity: publishedIdentity && 'identity' in publishedIdentity
      ? publishedIdentity.identity
      : null,
  };
}

function persistImageAssets(
  document: Record<string, unknown>,
  resolved: Extract<ResolveResult, { ok: true }>,
  publishedIdentity: PublishedCommentIdentity | null = null,
): Record<string, unknown> {
  const rawImages = Array.isArray(document.images) ? document.images : [];
  const ownedCommentIds = new Set(
    (Array.isArray(document.comments) ? document.comments : [])
      .filter(isRecord)
      .filter((comment) => {
        if (!publishedIdentity?.viewer) return true;
        return normalizeExternalComments(comment.externalComments)
          .some((entry) => normalizeIdentityPart(entry.authorId) === publishedIdentity.commenterId);
      })
      .map((comment) => normalizeIdentityPart(comment.id))
      .filter(Boolean),
  );
  const images = rawImages.map((rawImage, index) => {
    const image = rawImage && typeof rawImage === 'object' && !Array.isArray(rawImage)
      ? { ...(rawImage as Record<string, unknown>) }
      : {};
    const ownedPublishedImage = Boolean(
      publishedIdentity?.viewer
      && ownedCommentIds.has(normalizeIdentityPart(image.commentId)),
    );
    const parsed = parseImageDataUrl(image.data);
    if (publishedIdentity?.viewer && !ownedPublishedImage) {
      delete image.data;
      return image;
    }
    if (parsed) {
      const id = sanitizeAssetBaseName(image.id, `image-${index + 1}`);
      const commentId = sanitizeAssetBaseName(image.commentId, 'comment');
      const extension = inferImageExtension(String(image.mimeType || parsed.mimeType));
      const fileName = ownedPublishedImage
        ? `${commentId}-${id}.${extension}`
        : `${id}.${extension}`;
      const ownerAssetDir = ownedPublishedImage
        ? path.join(resolved.assetDir, publishedIdentity!.commenterId)
        : resolved.assetDir;
      const assetPath = path.join(ownerAssetDir, fileName);
      if (!isPathInside(resolved.assetDir, assetPath)) {
        throw new Error('Invalid comment asset path');
      }
      fs.mkdirSync(ownerAssetDir, { recursive: true });
      fs.writeFileSync(assetPath, parsed.buffer);
      image.assetPath = ownedPublishedImage
        ? `${resolved.projectRelativeAssetRoot}/${publishedIdentity!.commenterId}/${fileName}`
        : `${resolved.projectRelativeAssetRoot}/${fileName}`;
      image.mimeType = image.mimeType || parsed.mimeType;
      image.size = Number(image.size ?? parsed.buffer.length);
    } else if (ownedPublishedImage) {
      const normalizedAssetPath = normalizeAssetPath(
        typeof image.assetPath === 'string' ? image.assetPath : null,
        resolved,
      );
      const expectedOwnerPrefix = `${resolved.projectRelativeAssetRoot}/${publishedIdentity.commenterId}/`;
      if (!normalizedAssetPath?.startsWith(expectedOwnerPrefix)) {
        delete image.assetPath;
      }
    }
    delete image.data;
    return image;
  });
  return {
    ...document,
    images,
  };
}

function normalizeAssetPath(
  rawValue: string | null,
  resolved: Extract<ResolveResult, { ok: true }>,
): string | null {
  const normalized = String(rawValue ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) return null;
  const expectedPrefix = `${resolved.projectRelativeAssetRoot}/`;
  const assetSegments = normalized.slice(expectedPrefix.length).split('/').filter(Boolean);
  if (
    !normalized.startsWith(expectedPrefix)
    || assetSegments.length === 0
    || assetSegments.some((segment) => segment === '..' || segment === '.')
    || assetSegments.some((segment) => segment.startsWith('.'))
  ) {
    return null;
  }
  return `${expectedPrefix}${assetSegments.join('/')}`;
}

function collectImageAssetPaths(
  document: Record<string, unknown> | null,
  resolved: Extract<ResolveResult, { ok: true }>,
): Set<string> {
  const paths = new Set<string>();
  for (const value of Array.isArray(document?.images) ? document.images : []) {
    if (!isRecord(value)) continue;
    const assetPath = normalizeAssetPath(typeof value.assetPath === 'string' ? value.assetPath : null, resolved);
    if (assetPath) paths.add(assetPath);
  }
  return paths;
}

function resolveExistingImageAssetPath(
  assetPath: string,
  resolved: Extract<ResolveResult, { ok: true }>,
): string | null {
  const relativeAssetPath = assetPath.slice(`${resolved.projectRelativeAssetRoot}/`.length);
  const fullPath = path.resolve(resolved.assetDir, relativeAssetPath);
  if (!isPathInside(resolved.assetDir, fullPath) || !fs.existsSync(fullPath)) return null;
  try {
    const realAssetDir = fs.realpathSync.native(resolved.assetDir);
    const realFullPath = fs.realpathSync.native(fullPath);
    return fs.statSync(realFullPath).isFile() && isPathInside(realAssetDir, realFullPath)
      ? fullPath
      : null;
  } catch {
    return null;
  }
}

function writeCommentDocumentAtomic(filePath: string, document: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

function removeUnreferencedImageAssets(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
  resolved: Extract<ResolveResult, { ok: true }>,
): void {
  const previousPaths = collectImageAssetPaths(previous, resolved);
  const nextPaths = collectImageAssetPaths(next, resolved);
  let realAssetDir = '';
  try {
    if (fs.lstatSync(resolved.assetDir).isSymbolicLink()) return;
    realAssetDir = fs.realpathSync(resolved.assetDir);
  } catch {
    return;
  }
  for (const assetPath of previousPaths) {
    if (nextPaths.has(assetPath)) continue;
    const relativeAssetPath = assetPath.slice(`${resolved.projectRelativeAssetRoot}/`.length);
    const fullPath = path.resolve(resolved.assetDir, relativeAssetPath);
    if (!isPathInside(resolved.assetDir, fullPath)) continue;
    try {
      if (!fs.existsSync(fullPath)) continue;
      const realFullPath = fs.realpathSync(fullPath);
      if (!isPathInside(realAssetDir, realFullPath)) continue;
      fs.rmSync(fullPath, { force: true });
    } catch (error) {
      console.warn('[Make] Failed to remove prototype comment asset:', error);
    }
  }
}

function hydrateImageData(document: unknown, resolved: Extract<ResolveResult, { ok: true }>, url: URL): unknown {
  if (url.searchParams.get('hydrateImages') !== '1') {
    return document;
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return document;
  }
  const record = { ...(document as Record<string, unknown>) };
  const images = Array.isArray(record.images) ? record.images : [];
  record.images = images.map((rawImage) => {
    const image = rawImage && typeof rawImage === 'object' && !Array.isArray(rawImage)
      ? { ...(rawImage as Record<string, unknown>) }
      : {};
    const assetPath = normalizeAssetPath(typeof image.assetPath === 'string' ? image.assetPath : null, resolved);
    if (!assetPath) return image;
    const fullPath = resolveExistingImageAssetPath(assetPath, resolved);
    if (!fullPath) return image;
    const mimeType = String(image.mimeType || '').trim() || mimeTypeFromFileName(fullPath);
    image.data = `data:${mimeType};base64,${fs.readFileSync(fullPath).toString('base64')}`;
    return image;
  });
  return record;
}

function mimeTypeFromFileName(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/png';
}

function handleAssetRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: PrototypeCommentsContext,
  url: URL,
): boolean {
  if (url.pathname !== '/api/prototype-comments/asset') return false;
  if (req.method !== 'GET') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  const resolution = resolvePrototypeCommentsRequest(req, url, context);
  if (isResolveError(resolution)) {
    sendJson(res, { error: resolution.error }, { status: resolution.status });
    return true;
  }
  const { resolved } = resolution;
  const normalizedAsset = normalizeAssetPath(url.searchParams.get('asset'), resolved);
  if (!normalizedAsset) {
    const rawAsset = String(url.searchParams.get('asset') ?? '');
    sendJson(res, { error: 'Invalid asset path' }, { status: rawAsset.includes('..') ? 403 : 400 });
    return true;
  }
  const relativeAssetPath = normalizedAsset.slice(`${resolved.projectRelativeAssetRoot}/`.length);
  const assetPath = path.resolve(resolved.assetDir, relativeAssetPath);
  if (!isPathInside(resolved.assetDir, assetPath)) {
    sendJson(res, { error: 'Invalid asset path' }, { status: 403 });
    return true;
  }
  if (!fs.existsSync(assetPath)) {
    sendJson(res, { error: 'Asset not found' }, { status: 404 });
    return true;
  }
  if (resolution.publishedIdentity?.viewer) {
    const storedDocument = readStoredCommentDocument(resolved.commentFilePath);
    const visibleDocument = projectPublishedExternalCommentsForViewer(
      storedDocument,
      resolution.publishedIdentity,
    );
    if (!collectImageAssetPaths(visibleDocument, resolved).has(normalizedAsset)) {
      sendJson(res, { error: 'Asset not found' }, { status: 404 });
      return true;
    }
  }
  const safeAssetPath = resolveExistingImageAssetPath(normalizedAsset, resolved);
  if (!safeAssetPath) {
    sendJson(res, { error: 'Invalid asset path' }, { status: 403 });
    return true;
  }
  if (!sendFile(res, safeAssetPath, { cacheControl: 'no-store' })) {
    sendJson(res, { error: 'Asset not found' }, { status: 404 });
  }
  return true;
}

export function handlePrototypeCommentsApi(
  req: IncomingMessage,
  res: ServerResponse,
  context: PrototypeCommentsContext,
  url: URL,
): boolean {
  if (handleAssetRequest(req, res, context, url)) return true;
  if (url.pathname !== '/api/prototype-comments') return false;

  if (req.method === 'OPTIONS') {
    sendCorsPreflight(res);
    return true;
  }

  const resolution = resolvePrototypeCommentsRequest(req, url, context);
  if (isResolveError(resolution)) {
    sendCorsJson(res, { error: resolution.error }, { status: resolution.status });
    return true;
  }
  const { resolved, publishedIdentity } = resolution;

  if (req.method === 'GET') {
    if (!fs.existsSync(resolved.commentFilePath)) {
      sendCorsJson(res, {
        exists: false,
        document: null,
        path: resolved.projectRelativeCommentPath,
      });
      return true;
    }
    try {
      const storedDocument = JSON.parse(fs.readFileSync(resolved.commentFilePath, 'utf8')) as Record<string, unknown>;
      const document = publishedIdentity?.viewer
        ? projectPublishedExternalCommentsForViewer(storedDocument, publishedIdentity)
        : storedDocument;
      sendCorsJson(res, {
        exists: true,
        document: hydrateImageData(
          document,
          resolved,
          url,
        ),
        path: resolved.projectRelativeCommentPath,
      });
    } catch (error) {
      sendCorsJson(res, { error: error instanceof Error ? error.message : 'Invalid comment file' }, { status: 400 });
    }
    return true;
  }

  if (req.method === 'PUT') {
    readJsonBody(req)
      .then((body) => {
        const reason = normalizeWriteReason(isRecord(body) ? body.reason : undefined);
        const previousDocument = readStoredCommentDocument(resolved.commentFilePath);
        const normalized = normalizeCommentDocument(body, resolved);
        const observedTombstones = normalizeObservedTombstones(
          isRecord(body) ? body.observedTombstones : undefined,
        );
        const merged = publishedIdentity?.viewer
          ? mergePublishedExternalComments(
              previousDocument,
              normalized,
              publishedIdentity,
              reason,
              observedTombstones,
            )
          : reason === 'restore' && previousDocument
            ? normalizeCommentDocument(
                compactObservedTombstones(previousDocument, observedTombstones),
                resolved,
              )
            : reason === 'clear'
              ? normalized
              : mergeStoredTombstones(previousDocument, normalized);
        const document = persistImageAssets(merged, resolved, publishedIdentity);
        writeCommentDocumentAtomic(resolved.commentFilePath, document);
        if (reason === 'restore' || reason === 'clear') {
          removeUnreferencedImageAssets(previousDocument, document, resolved);
        }
        sendCorsJson(res, {
          ok: true,
          exists: true,
          document: publishedIdentity?.viewer
            ? projectPublishedExternalCommentsForViewer(document, publishedIdentity)
            : document,
          path: resolved.projectRelativeCommentPath,
        });
      })
      .catch((error) => sendCorsJson(res, { error: error?.message || 'Failed to write comments' }, { status: 400 }));
    return true;
  }

  sendCorsJson(res, { error: 'Method not allowed' }, { status: 405 });
  return true;
}
