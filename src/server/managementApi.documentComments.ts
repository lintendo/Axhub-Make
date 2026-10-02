import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonBody, sendCorsJson, sendCorsPreflight, sendFile } from './http.ts';
import {
  resolveDocumentCommentStorage,
  type DocumentCommentStorage,
} from './documentCommentsStorage.ts';
import {
  compactObservedTombstones,
  isDeletedRecord,
  isRecord,
  mergeStoredTombstones,
  normalizeObservedTombstones,
} from './managementApi.prototypeComments.ts';

type DocumentCommentsWriteReason = 'changes' | 'state' | 'restore' | 'clear';

type DocumentCommentsContext = {
  project: { root: string };
};

function normalizeWriteReason(value: unknown): DocumentCommentsWriteReason {
  return value === 'state' || value === 'restore' || value === 'clear' ? value : 'changes';
}

function readStoredDocument(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(value) && value.schemaVersion === 3 && value.kind === 'document-edit-comments'
      ? value
      : null;
  } catch {
    return null;
  }
}

function normalizeDocument(input: unknown, resolved: DocumentCommentStorage): Record<string, unknown> {
  const raw = isRecord(input) && 'document' in input ? input.document : input;
  const record = isRecord(raw) ? { ...raw } : {};
  if (
    record.schemaVersion !== 3 ||
    record.kind !== 'document-edit-comments' ||
    !Array.isArray(record.comments) ||
    !Array.isArray(record.images)
  ) {
    throw new Error('Document comments require schema version 3');
  }
  const { tasks: _removedTasks, ...recordWithoutTasks } = record;
  return {
    ...recordWithoutTasks,
    schemaVersion: 3,
    kind: 'document-edit-comments',
    documentPath: resolved.documentPath,
    resource: {
      id: resolved.documentHash,
      targetPath: resolved.documentPath,
      filePath: resolved.projectRelativeCommentPath,
    },
    comments: Array.isArray(record.comments) ? record.comments : [],
    images: Array.isArray(record.images) ? record.images : [],
  };
}

function parseImageDataUrl(value: unknown): { mimeType: string; buffer: Buffer } | null {
  const match = String(value ?? '').trim().match(/^data:(image\/[a-z0-9+.-]+);base64,([a-z0-9+/=\s]+)$/iu);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), buffer: Buffer.from(match[2].replace(/\s+/gu, ''), 'base64') };
}

function inferImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'png';
}

function assetFileName(id: unknown, index: number, extension: string): string {
  const safe = String(id ?? '').trim().replace(/\.[a-z0-9]+$/iu, '').replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase();
  return `${safe || `image-${index + 1}`}.${extension}`;
}

function persistImageAssets(document: Record<string, unknown>, resolved: DocumentCommentStorage): Record<string, unknown> {
  const images = (Array.isArray(document.images) ? document.images : []).map((rawImage, index) => {
    const image = isRecord(rawImage) ? { ...rawImage } : {};
    const parsed = parseImageDataUrl(image.data);
    if (parsed) {
      const extension = inferImageExtension(String(image.mimeType || parsed.mimeType));
      const fileName = assetFileName(image.id, index, extension);
      const fullPath = path.join(resolved.assetDir, fileName);
      if (!fullPath.startsWith(resolved.assetDir + path.sep)) throw new Error('Invalid document comment asset path');
      fs.mkdirSync(resolved.assetDir, { recursive: true });
      fs.writeFileSync(fullPath, parsed.buffer);
      image.assetPath = `.axhub/make/comment-assets/${resolved.documentHash}/${fileName}`;
      image.mimeType = image.mimeType || parsed.mimeType;
      image.size = Number(image.size ?? parsed.buffer.length);
    }
    delete image.data;
    return image;
  });
  return { ...document, images };
}

function normalizeAssetPath(value: unknown, resolved: DocumentCommentStorage): string | null {
  const raw = String(value ?? '').trim().replace(/\\/gu, '/').replace(/^\/+/, '');
  const expectedPrefix = `.axhub/make/comment-assets/${resolved.documentHash}/`;
  if (!raw.startsWith(expectedPrefix) || raw.includes('\0') || raw.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return raw;
}

function collectAssetPaths(document: Record<string, unknown> | null, resolved: DocumentCommentStorage): Set<string> {
  return new Set((Array.isArray(document?.images) ? document.images : []).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const assetPath = normalizeAssetPath(entry.assetPath, resolved);
    return assetPath ? [assetPath] : [];
  }));
}

function removeUnreferencedImageAssets(previous: Record<string, unknown> | null, next: Record<string, unknown>, resolved: DocumentCommentStorage): void {
  const nextPaths = collectAssetPaths(next, resolved);
  const previousPaths = collectAssetPaths(previous, resolved);
  for (const assetPath of previousPaths) {
    if (nextPaths.has(assetPath)) continue;
    const filePath = path.resolve(resolved.commentFilePath, '..', '..', '..', '..', assetPath);
    if (!filePath.startsWith(resolved.assetDir + path.sep)) continue;
    try {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    } catch (error) {
      console.warn('[Make] Failed to remove document comment asset:', error);
    }
  }
}

function hydrateImages(document: Record<string, unknown>, resolved: DocumentCommentStorage, url: URL): Record<string, unknown> {
  if (url.searchParams.get('hydrateImages') !== '1') return document;
  return {
    ...document,
    images: (Array.isArray(document.images) ? document.images : []).map((rawImage) => {
      const image = isRecord(rawImage) ? { ...rawImage } : {};
      const assetPath = normalizeAssetPath(image.assetPath, resolved);
      if (!assetPath) return image;
      const filePath = path.resolve(resolved.commentFilePath, '..', '..', '..', '..', assetPath);
      if (!filePath.startsWith(resolved.assetDir + path.sep) || !fs.existsSync(filePath)) return image;
      const mimeType = String(image.mimeType || 'image/png');
      image.data = `data:${mimeType};base64;${fs.readFileSync(filePath).toString('base64')}`.replace(';base64;', ';base64,');
      return image;
    }),
  };
}

function sendAsset(req: IncomingMessage, res: ServerResponse, context: DocumentCommentsContext, url: URL): boolean {
  if (url.pathname !== '/api/document-comments/asset') return false;
  if (req.method !== 'GET') {
    sendCorsJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }
  const resolved = resolveDocumentCommentStorage(context.project.root, url.searchParams.get('path'));
  const asset = resolved ? normalizeAssetPath(url.searchParams.get('asset'), resolved) : null;
  if (!resolved || !asset) {
    sendCorsJson(res, { error: 'Invalid document comment asset path' }, { status: 403 });
    return true;
  }
  const filePath = path.resolve(resolved.commentFilePath, '..', '..', '..', '..', asset);
  if (!filePath.startsWith(resolved.assetDir + path.sep) || !sendFile(res, filePath, { cacheControl: 'no-store' })) {
    sendCorsJson(res, { error: 'Asset not found' }, { status: 404 });
  }
  return true;
}

export function handleDocumentCommentsApi(
  req: IncomingMessage,
  res: ServerResponse,
  context: DocumentCommentsContext,
  url: URL,
): boolean {
  if (sendAsset(req, res, context, url)) return true;
  if (url.pathname !== '/api/document-comments') return false;
  const resolved = resolveDocumentCommentStorage(context.project.root, url.searchParams.get('path'));
  if (!resolved) {
    sendCorsJson(res, { error: 'Invalid document comment path' }, { status: 403 });
    return true;
  }
  if (req.method === 'OPTIONS') {
    sendCorsPreflight(res);
    return true;
  }
  if (req.method === 'GET') {
    const document = readStoredDocument(resolved.commentFilePath);
    sendCorsJson(res, {
      exists: Boolean(document),
      document: document ? hydrateImages(document, resolved, url) : null,
      path: resolved.projectRelativeCommentPath,
    });
    return true;
  }
  if (req.method === 'PUT') {
    readJsonBody(req).then((body) => {
      const reason = normalizeWriteReason(isRecord(body) ? body.reason : undefined);
      const previous = readStoredDocument(resolved.commentFilePath);
      const normalized = normalizeDocument(body, resolved);
      const observed = normalizeObservedTombstones(isRecord(body) ? body.observedTombstones : undefined);
      const merged = reason === 'restore' && previous
        ? normalizeDocument(compactObservedTombstones(previous, observed), resolved)
        : reason === 'clear' ? normalized : mergeStoredTombstones(previous, normalized);
      const document = persistImageAssets(merged, resolved);
      fs.mkdirSync(path.dirname(resolved.commentFilePath), { recursive: true });
      fs.writeFileSync(resolved.commentFilePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
      if (reason === 'restore' || reason === 'clear') removeUnreferencedImageAssets(previous, document, resolved);
      sendCorsJson(res, { ok: true, exists: true, document, path: resolved.projectRelativeCommentPath });
    }).catch((error) => sendCorsJson(res, { error: error?.message || 'Failed to write document comments' }, { status: 400 }));
    return true;
  }
  sendCorsJson(res, { error: 'Method not allowed' }, { status: 405 });
  return true;
}
