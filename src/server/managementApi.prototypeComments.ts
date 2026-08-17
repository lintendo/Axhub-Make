import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { isPathInside, resolveProjectPath, type ProjectMetadata } from './projectCore/index.ts';

import { readJsonBody, sendCorsJson, sendCorsPreflight, sendFile, sendJson } from './http.ts';
import {
  normalizePrototypeCommentTargetPath,
  resolvePrototypeCommentStorage,
  type PrototypeCommentStorage,
} from './documentCommentsStorage.ts';

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

function isResolveError(result: ResolveResult): result is Extract<ResolveResult, { ok: false }> {
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

  const storage = resolvePrototypeCommentStorage(projectRoot, normalized.value);
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
  if (!previous) return incoming;
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
  const incomingCommentIdentities = new Set(
    incomingActiveComments
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
      ...incomingActiveComments,
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
    comments: record.comments,
    images: record.images,
  };
}

function persistImageAssets(
  document: Record<string, unknown>,
  resolved: Extract<ResolveResult, { ok: true }>,
): Record<string, unknown> {
  const rawImages = Array.isArray(document.images) ? document.images : [];
  const images = rawImages.map((rawImage, index) => {
    const image = rawImage && typeof rawImage === 'object' && !Array.isArray(rawImage)
      ? { ...(rawImage as Record<string, unknown>) }
      : {};
    const parsed = parseImageDataUrl(image.data);
    if (parsed) {
      const id = sanitizeAssetBaseName(image.id, `image-${index + 1}`);
      const extension = inferImageExtension(String(image.mimeType || parsed.mimeType));
      const fileName = `${id}.${extension}`;
      const assetPath = path.join(resolved.assetDir, fileName);
      if (!isPathInside(resolved.assetDir, assetPath)) {
        throw new Error('Invalid comment asset path');
      }
      fs.mkdirSync(resolved.assetDir, { recursive: true });
      fs.writeFileSync(assetPath, parsed.buffer);
      image.assetPath = `${resolved.projectRelativeAssetRoot}/${fileName}`;
      image.mimeType = image.mimeType || parsed.mimeType;
      image.size = Number(image.size ?? parsed.buffer.length);
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

  const resolved = resolvePrototypeCommentsPath(context.project.root, url.searchParams.get('targetPath'), context.metadata);
  if (isResolveError(resolved)) {
    sendJson(res, { error: resolved.error }, { status: resolved.status });
    return true;
  }
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

  const resolved = resolvePrototypeCommentsPath(context.project.root, url.searchParams.get('targetPath'), context.metadata);
  if (isResolveError(resolved)) {
    sendCorsJson(res, { error: resolved.error }, { status: resolved.status });
    return true;
  }

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
      const document = JSON.parse(fs.readFileSync(resolved.commentFilePath, 'utf8'));
      sendCorsJson(res, {
        exists: true,
        document: hydrateImageData(document, resolved, url),
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
        const merged = reason === 'restore' && previousDocument
          ? normalizeCommentDocument(
              compactObservedTombstones(previousDocument, observedTombstones),
              resolved,
            )
          : reason === 'clear'
            ? normalized
            : mergeStoredTombstones(previousDocument, normalized);
        const document = persistImageAssets(merged, resolved);
        fs.mkdirSync(path.dirname(resolved.commentFilePath), { recursive: true });
        fs.writeFileSync(resolved.commentFilePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
        if (reason === 'restore' || reason === 'clear') {
          removeUnreferencedImageAssets(previousDocument, document, resolved);
        }
        sendCorsJson(res, {
          ok: true,
          exists: true,
          document,
          path: resolved.projectRelativeCommentPath,
        });
      })
      .catch((error) => sendCorsJson(res, { error: error?.message || 'Failed to write comments' }, { status: 400 }));
    return true;
  }

  sendCorsJson(res, { error: 'Method not allowed' }, { status: 405 });
  return true;
}
