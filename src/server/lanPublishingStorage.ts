import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isPathInside, resolveProjectRoot } from './projectCore/index.ts';
import {
  getProjectPublishedHtmlDir,
  getProjectPublishedRealtimeDir,
} from './projectCore/index.ts';

export interface LanHtmlManifest {
  schemaVersion: 1;
  publishId: string;
  projectId: string;
  resourcePath: string;
  createdAt: string;
  includeSource: boolean;
  files: string[];
  fileContentTypes: Record<string, string>;
}

export interface LanRealtimeManifest {
  schemaVersion: 1;
  shareId: string;
  projectId: string;
  resourcePath: string;
  previewPath?: string;
  commentable: boolean;
  updatedAt: string;
}

export interface LanHtmlStaticFile {
  path: string;
  contentType: string;
  body: Buffer;
}

export interface LanHtmlSnapshotMetadata {
  projectId: string;
  resourcePath: string;
  includeSource?: boolean;
}

function createRandomId(): string {
  return crypto.randomBytes(12).toString('hex');
}

function createId(prefix: string): string {
  return `${prefix}-${createRandomId()}`;
}

export function createLanRealtimeShareId(): string {
  return createId('share');
}

function assertSafeId(id: string, label: string): string {
  const normalized = String(id || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function normalizeRelativeFilePath(value: string): string {
  const raw = String(value || '').replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || raw.includes('\0')) {
    throw new Error('Invalid published file path');
  }
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid published file path');
  }
  const normalized = segments.join('/');
  if (normalized !== raw) {
    throw new Error('Invalid published file path');
  }
  return normalized;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function getPublishedHtmlSnapshotDir(projectRoot: string, publishId: string): string {
  return path.join(getProjectPublishedHtmlDir(projectRoot), assertSafeId(publishId, 'publish id'));
}

export function getRealtimeManifestPath(projectRoot: string, shareId: string): string {
  return path.join(getProjectPublishedRealtimeDir(projectRoot), `${assertSafeId(shareId, 'share id')}.json`);
}

export async function writeHtmlSnapshot(
  projectRoot: string,
  files: LanHtmlStaticFile[],
  metadata: LanHtmlSnapshotMetadata,
): Promise<{ publishId: string; manifest: LanHtmlManifest; snapshotDir: string }> {
  const root = resolveProjectRoot(projectRoot);
  const publishedDir = getProjectPublishedHtmlDir(root);
  fs.mkdirSync(publishedDir, { recursive: true });

  const publishId = createRandomId();
  const snapshotDir = getPublishedHtmlSnapshotDir(root, publishId);
  const stagingDir = fs.mkdtempSync(path.join(publishedDir, '.staging-'));
  const normalizedFiles = files.map((file) => ({
    ...file,
    path: normalizeRelativeFilePath(file.path),
  }));
  const fileContentTypes: Record<string, string> = {};
  try {
    for (const file of normalizedFiles) {
      const target = path.resolve(stagingDir, file.path);
      if (!isPathInside(stagingDir, target)) {
        throw new Error('Invalid published file path');
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.body);
      fileContentTypes[file.path] = file.contentType;
    }
    const manifest: LanHtmlManifest = {
      schemaVersion: 1,
      publishId,
      projectId: String(metadata.projectId || '').trim(),
      resourcePath: String(metadata.resourcePath || '').trim(),
      createdAt: new Date().toISOString(),
      includeSource: metadata.includeSource === true,
      files: normalizedFiles.map((file) => file.path),
      fileContentTypes,
    };
    writeJsonAtomic(path.join(stagingDir, 'manifest.json'), manifest);
    fs.renameSync(stagingDir, snapshotDir);
    return { publishId, manifest, snapshotDir };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export function readHtmlManifest(projectRoot: string, publishId: string): LanHtmlManifest | null {
  const normalizedId = assertSafeId(publishId, 'publish id');
  const manifest = readJson<LanHtmlManifest>(path.join(getPublishedHtmlSnapshotDir(projectRoot, normalizedId), 'manifest.json'));
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.publishId !== normalizedId
    || !Array.isArray(manifest.files)
  ) {
    return null;
  }
  return manifest;
}

export function resolvePublishedFilePath(projectRoot: string, publishId: string, relativePath: string): string {
  const snapshotDir = getPublishedHtmlSnapshotDir(projectRoot, publishId);
  const normalizedPath = normalizeRelativeFilePath(relativePath);
  const candidate = path.resolve(snapshotDir, normalizedPath);
  if (!isPathInside(snapshotDir, candidate)) {
    throw new Error('Invalid published file path');
  }
  return candidate;
}

export function removeHtmlSnapshot(projectRoot: string, publishId: string): boolean {
  if (!String(publishId || '').trim()) return false;
  const snapshotDir = getPublishedHtmlSnapshotDir(projectRoot, publishId);
  if (!fs.existsSync(snapshotDir)) return false;
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  return true;
}

export function readRealtimeManifest(projectRoot: string, shareId: string): LanRealtimeManifest | null {
  const normalizedId = assertSafeId(shareId, 'share id');
  const manifest = readJson<LanRealtimeManifest>(getRealtimeManifestPath(projectRoot, normalizedId));
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.shareId !== normalizedId
    || !String(manifest.projectId || '').trim()
    || !String(manifest.resourcePath || '').trim()
  ) {
    return null;
  }
  return manifest;
}

export function writeRealtimeManifest(projectRoot: string, manifest: LanRealtimeManifest): void {
  const normalizedShareId = assertSafeId(manifest.shareId, 'share id');
  const previewPath = String(manifest.previewPath || '').trim();
  writeJsonAtomic(getRealtimeManifestPath(projectRoot, normalizedShareId), {
    schemaVersion: 1,
    shareId: normalizedShareId,
    projectId: String(manifest.projectId || '').trim(),
    resourcePath: String(manifest.resourcePath || '').trim(),
    ...(previewPath ? { previewPath } : {}),
    commentable: manifest.commentable !== false,
    updatedAt: String(manifest.updatedAt || '').trim(),
  });
}

export function removeRealtimeManifest(projectRoot: string, shareId: string): boolean {
  if (!String(shareId || '').trim()) return false;
  const manifestPath = getRealtimeManifestPath(projectRoot, shareId);
  if (!fs.existsSync(manifestPath)) return false;
  fs.rmSync(manifestPath, { force: true });
  return true;
}
