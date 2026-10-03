import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { STALE_AGENT_BRIDGE_QUERY_PARAMS } from '../common/editorLaunchQuery.ts';
import {
  createProjectCommunicationStore,
  getProjectExportsDir,
  type ProjectMetadata,
} from './projectCore/index.ts';
import { buildExportHtmlStaticFiles } from './exportHtmlArchive.ts';
import { getRequestUrl, readJsonBody, sendCorsJson, sendJson } from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import { normalizeProjectResourcePath } from './managementApi.resourceLookup.ts';
import {
  createLanRealtimeShareId,
  readHtmlManifest,
  readRealtimeManifest,
  removeHtmlSnapshot,
  removeRealtimeManifest,
  writeHtmlSnapshot,
  writeRealtimeManifest,
  type LanRealtimeManifest,
} from './lanPublishingStorage.ts';

interface LocalPublishingContext {
  project: { id: string; root: string };
  metadata: ProjectMetadata;
}

interface LocalPublishingHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
    body?: unknown,
  ) => LocalPublishingContext | null;
  resolveSourceFileFromMetadata: (context: LocalPublishingContext, targetPath: string) => string | null;
  findProjectResourceByPath: (metadata: ProjectMetadata, targetPath: string) => any;
  getDeclaredResourceWriteDir?: (context: LocalPublishingContext, type: 'media') => string | null;
  sendDisabledCapability: (
    res: ServerResponse,
    status: number,
    payload: { code: string; error: string; projectId?: string; projectRoot?: string; path?: string; sourceRequired?: boolean },
  ) => void;
}

export interface LanLatestPublishResponse {
  resourcePath: string;
  html: {
    publishId: string;
    version: number;
    url: string;
    createdAt: string;
  } | null;
  realtime: {
    shareId: string;
    commentable: boolean;
    url: string;
    annotationUrl: string;
    previewUrl: string;
    updatedAt: string;
  } | null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolvePublicOrigin(req: IncomingMessage, fallback: string): string {
  const protocolHeader = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : req.headers['x-forwarded-proto'];
  const forwardedProtocol = String(protocolHeader || '').split(',')[0]?.trim().toLowerCase();
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
    ? forwardedProtocol
    : (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
  const host = String(req.headers.host || '').trim();
  if (host) return `${protocol}://${host}`;
  return String(fallback || '').replace(/\/+$/u, '');
}

function resourceIdentity(resource: any, targetPath: string): { resourceId: string; resourceType: string } {
  const group = targetPath.replace(/^src\//u, '').split('/')[0] || 'prototypes';
  return {
    resourceId: stringValue(resource?.id) || stringValue(resource?.name) || targetPath,
    resourceType: group.replace(/s$/u, '') || 'prototype',
  };
}

function toRuntimeResourcePath(resourcePath: string): string {
  const normalized = String(resourcePath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/gu, '');
  const withoutSource = normalized.replace(/^src\//u, '').replace(/\/index\.(t|j)sx?$/iu, '');
  const segments = withoutSource.split('/').filter(Boolean);
  if (segments.length < 2 || segments.some((segment) => segment === '.' || segment === '..')) {
    return '';
  }
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function normalizePreviewPath(
  value: unknown,
  expectedRuntimePath: string,
  fallbackPreviewPath = expectedRuntimePath,
): string | null {
  const raw = stringValue(value);
  if (!raw) return fallbackPreviewPath;
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://localhost');
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.pathname !== expectedRuntimePath) {
    return null;
  }
  for (const key of STALE_AGENT_BRIDGE_QUERY_PARAMS) {
    parsed.searchParams.delete(key);
  }
  parsed.searchParams.delete('projectId');
  parsed.searchParams.delete('publishedShareId');
  parsed.searchParams.set('agentToolbar', 'host');
  const query = parsed.searchParams.toString();
  return `${expectedRuntimePath}${query ? `?${query}` : ''}${parsed.hash}`;
}

function buildPreviewUrl(origin: string, manifest: Pick<LanRealtimeManifest, 'resourcePath' | 'previewPath'>): string {
  const runtimePath = toRuntimeResourcePath(manifest.resourcePath);
  const previewPath = normalizePreviewPath(manifest.previewPath, runtimePath) || runtimePath;
  return new URL(previewPath, `${origin}/`).toString();
}

function resolveRuntimeOriginForPublicRequest(runtimeOrigin: string, requestOrigin: string): string {
  try {
    const runtimeUrl = new URL(runtimeOrigin || requestOrigin);
    const requestUrl = new URL(requestOrigin);
    if (/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/u.test(runtimeUrl.hostname)) {
      runtimeUrl.hostname = requestUrl.hostname;
    }
    return runtimeUrl.toString().replace(/\/+$/u, '');
  } catch {
    return requestOrigin;
  }
}

function readLanHtmlVersion(projectRoot: string, projectId: string, resourcePath: string): number {
  const exportsDir = getProjectExportsDir(projectRoot);
  if (!fs.existsSync(exportsDir)) return 1;
  let count = 0;
  for (const name of fs.readdirSync(exportsDir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(exportsDir, name), 'utf8')) as any;
      if (
        record?.operationType === 'lan.publish.html'
        && record?.status === 'success'
        && String(record?.projectId || '') === projectId
        && String(record?.metadata?.path || '') === resourcePath
      ) {
        count += 1;
      }
    } catch {
      // Ignore malformed historical operation records.
    }
  }
  return count + 1;
}

function findExistingRealtimeShareId(projectRoot: string, projectId: string, resourcePath: string): string {
  const directory = path.join(getProjectExportsDir(projectRoot), 'published-realtime');
  if (!fs.existsSync(directory)) return '';
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith('.json')) continue;
    const shareId = name.slice(0, -'.json'.length);
    const manifest = readRealtimeManifest(projectRoot, shareId);
    if (manifest?.projectId === projectId && manifest.resourcePath === resourcePath) {
      return manifest.shareId;
    }
  }
  return '';
}

function readLatestExportRecord(
  projectRoot: string,
  projectId: string,
  resourcePath: string,
  operationType: 'lan.publish.html' | 'lan.publish.realtime',
): any | null {
  const exportsDir = getProjectExportsDir(projectRoot);
  if (!fs.existsSync(exportsDir)) return null;
  return fs.readdirSync(exportsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(exportsDir, name), 'utf8')) as any;
      } catch {
        return null;
      }
    })
    .filter((record) => (
      record?.operationType === operationType
      && record?.status === 'success'
      && String(record?.projectId || '') === projectId
      && String(record?.metadata?.path || '') === resourcePath
    ))
    .sort((left, right) => String(right?.createdAt || '').localeCompare(String(left?.createdAt || '')))[0] || null;
}

function readLatestPublishResponse(
  projectRoot: string,
  projectId: string,
  resourcePath: string,
  origin: string,
  runtimeOrigin: string,
): LanLatestPublishResponse {
  const htmlRecord = readLatestExportRecord(projectRoot, projectId, resourcePath, 'lan.publish.html');
  const htmlPublishId = stringValue(htmlRecord?.metadata?.publishId);
  const htmlManifest = htmlPublishId ? readHtmlManifest(projectRoot, htmlPublishId) : null;
  const realtimeRecord = readLatestExportRecord(projectRoot, projectId, resourcePath, 'lan.publish.realtime');
  const realtimeShareId = stringValue(realtimeRecord?.metadata?.shareId);
  const realtimeManifest = realtimeShareId ? readRealtimeManifest(projectRoot, realtimeShareId) : null;

  return {
    resourcePath,
    html: htmlManifest ? {
      publishId: htmlManifest.publishId,
      version: Number(htmlRecord?.metadata?.version || 0),
      url: `${origin}/published/html/${htmlManifest.publishId}/index.html`,
      createdAt: htmlManifest.createdAt,
    } : null,
    realtime: realtimeManifest ? {
      shareId: realtimeManifest.shareId,
      commentable: realtimeManifest.commentable,
      url: `${origin}/published/prototype/${realtimeManifest.shareId}`,
      annotationUrl: `${origin}/published/prototype/${realtimeManifest.shareId}`,
      previewUrl: buildPreviewUrl(resolveRuntimeOriginForPublicRequest(
        runtimeOrigin || origin,
        origin,
      ), realtimeManifest),
      updatedAt: realtimeManifest.updatedAt,
    } : null,
  };
}

export function handleLocalPublishingApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  handlers: LocalPublishingHandlers,
): boolean {
  if (pathname !== '/api/local-publishing/html'
    && pathname !== '/api/local-publishing/realtime'
    && pathname !== '/api/local-publishing/latest') {
    return false;
  }
  if (pathname === '/api/local-publishing/latest') {
    if (req.method !== 'GET') {
      sendCorsJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const url = getRequestUrl(req);
    const rawPath = stringValue(url.searchParams.get('path'));
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const normalizedPath = normalizeProjectResourcePath(context.metadata, rawPath);
    if (!normalizedPath || normalizedPath.includes('..')) {
      sendCorsJson(res, { error: 'Invalid resource path', code: 'INVALID_RESOURCE_PATH' }, { status: 400 });
      return true;
    }
    sendCorsJson(res, readLatestPublishResponse(
      context.project.root,
      context.project.id,
      normalizedPath,
      resolvePublicOrigin(req, options.origin),
      String(options.runtimeOrigin || ''),
    ));
    return true;
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  readJsonBody(req).then(async (body: any) => {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
    if (!context) return;
    const rawPath = stringValue(body?.path || body?.resourcePath);
    const normalizedPath = normalizeProjectResourcePath(context.metadata, rawPath);
    if (!normalizedPath || normalizedPath.includes('..')) {
      sendJson(res, { error: 'Invalid resource path', code: 'INVALID_RESOURCE_PATH' }, { status: 400 });
      return;
    }
    const resource = handlers.findProjectResourceByPath(context.metadata, normalizedPath);
    const identity = resourceIdentity(resource, normalizedPath);
    const origin = resolvePublicOrigin(req, options.origin);
    const communicationStore = createProjectCommunicationStore(context.project.root);
    communicationStore.ensureDirectories();

    if (req.method === 'DELETE') {
      const latestRecord = readLatestExportRecord(
        context.project.root,
        context.project.id,
        normalizedPath,
        pathname === '/api/local-publishing/html' ? 'lan.publish.html' : 'lan.publish.realtime',
      );
      const removed = pathname === '/api/local-publishing/html'
        ? removeHtmlSnapshot(context.project.root, stringValue(latestRecord?.metadata?.publishId))
        : removeRealtimeManifest(context.project.root, stringValue(latestRecord?.metadata?.shareId));
      sendJson(res, { success: true, removed });
      return;
    }

    if (pathname === '/api/local-publishing/realtime') {
      const runtimePath = toRuntimeResourcePath(normalizedPath);
      const existingShareId = findExistingRealtimeShareId(context.project.root, context.project.id, normalizedPath);
      const existingManifest = existingShareId
        ? readRealtimeManifest(context.project.root, existingShareId)
        : null;
      const latestRealtimeRecord = readLatestExportRecord(
        context.project.root,
        context.project.id,
        normalizedPath,
        'lan.publish.realtime',
      );
      const existingPreviewPath = normalizePreviewPath(existingManifest?.previewPath, runtimePath, '') || '';
      const historicalPreviewPath = normalizePreviewPath(
        latestRealtimeRecord?.metadata?.previewPath,
        runtimePath,
        '',
      ) || '';
      const previewPath = normalizePreviewPath(
        body?.previewUrl,
        runtimePath,
        existingPreviewPath || historicalPreviewPath || runtimePath,
      );
      if (!runtimePath || !previewPath) {
        sendJson(res, { error: 'Invalid prototype preview URL', code: 'INVALID_PREVIEW_URL' }, { status: 400 });
        return;
      }
      const historicalShareId = stringValue(latestRealtimeRecord?.metadata?.shareId);
      const reusableHistoricalShareId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(historicalShareId)
        ? historicalShareId
        : '';
      const shareId = existingShareId || reusableHistoricalShareId || createLanRealtimeShareId();
      const manifest: LanRealtimeManifest = {
        schemaVersion: 1,
        shareId,
        projectId: context.project.id,
        resourcePath: normalizedPath,
        previewPath,
        commentable: body?.commentable !== false,
        updatedAt: new Date().toISOString(),
      };
      writeRealtimeManifest(context.project.root, manifest);
      communicationStore.appendExportRecord({
        projectId: context.project.id,
        resourceId: identity.resourceId,
        resourceType: identity.resourceType,
        operationType: 'lan.publish.realtime',
        status: 'success',
        metadata: { path: normalizedPath, shareId, previewPath, commentable: manifest.commentable },
      });
      const annotationUrl = `${origin}/published/prototype/${shareId}`;
      sendJson(res, {
        shareId,
        resourcePath: normalizedPath,
        commentable: manifest.commentable,
        url: annotationUrl,
        annotationUrl,
        previewUrl: buildPreviewUrl(resolveRuntimeOriginForPublicRequest(
          String(options.runtimeOrigin || origin),
          origin,
        ), manifest),
      });
      return;
    }

    const sourceFile = handlers.resolveSourceFileFromMetadata(context, normalizedPath);
    if (!sourceFile) {
      handlers.sendDisabledCapability(res, 424, {
        error: 'Source metadata is required to publish this page',
        code: 'SOURCE_METADATA_REQUIRED',
        projectId: context.project.id,
        projectRoot: context.project.root,
        path: normalizedPath,
        sourceRequired: true,
      });
      return;
    }
    const files = await buildExportHtmlStaticFiles({
      projectRoot: context.project.root,
      sourceFile,
      entryName: stringValue(resource?.name) || path.basename(path.dirname(sourceFile)),
      displayName: stringValue(resource?.title) || stringValue(resource?.name) || path.basename(path.dirname(sourceFile)),
      group: normalizedPath.replace(/^src\//u, '').split('/')[0] || 'prototypes',
      includeSource: body?.includeSource === true,
      mediaRoot: handlers.getDeclaredResourceWriteDir?.(context, 'media') || undefined,
    });
    const snapshot = await writeHtmlSnapshot(context.project.root, files, {
      projectId: context.project.id,
      resourcePath: normalizedPath,
      includeSource: body?.includeSource === true,
    });
    const version = readLanHtmlVersion(context.project.root, context.project.id, normalizedPath);
    communicationStore.appendExportRecord({
      projectId: context.project.id,
      resourceId: identity.resourceId,
      resourceType: identity.resourceType,
      operationType: 'lan.publish.html',
      status: 'success',
      metadata: {
        path: normalizedPath,
        publishId: snapshot.publishId,
        version,
        fileCount: files.length,
      },
    });
    sendJson(res, {
      publishId: snapshot.publishId,
      resourcePath: normalizedPath,
      version,
      url: `${origin}/published/html/${snapshot.publishId}/index.html`,
      createdAt: snapshot.manifest.createdAt,
    });
  }).catch((error: any) => {
    sendJson(res, { error: error?.message || '局域网发布失败' }, { status: Number(error?.statusCode) || 400 });
  });
  return true;
}
