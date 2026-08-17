import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectPath } from './projectCore/index.ts';

import {
  sendFile,
  sendJson,
  streamDirectoryAsZip,
} from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';

interface SourceZipProjectContext {
  project: {
    id: string;
    root: string;
  };
  metadata: any;
}

interface SourceZipApiHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
  ) => SourceZipProjectContext | null;
  findProjectResourceByPath: (metadata: SourceZipProjectContext['metadata'], rawPath: string) => any;
  resolveSourceFileFromMetadata: (context: SourceZipProjectContext, rawPath: string) => string | null;
  sendDisabledCapability: (
    res: ServerResponse,
    status: number,
    payload: {
      code: string;
      error: string;
      projectId?: string;
      projectRoot?: string;
      path?: string;
      sourceRequired?: boolean;
    },
  ) => void;
}

function resolveDirectoryFromResourceMetadata(context: SourceZipProjectContext, resource: any): string | null {
  const candidates = [
    resource?.absoluteFilePath,
    resource?.filePath,
    resource?.path,
    resource?.sourcePath,
  ];
  for (const candidate of candidates) {
    const rawPath = String(candidate || '').trim();
    if (!rawPath) {
      continue;
    }
    try {
      const resolvedPath = resolveProjectPath(context.project.root, rawPath);
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        return resolvedPath;
      }
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        return path.dirname(resolvedPath);
      }
    } catch {
      // Try the next declared metadata path.
    }
  }
  return null;
}

function normalizeLegacySourcePath(rawPath: string): string {
  const normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalizedPath === 'src' || normalizedPath.startsWith('src/')) {
    return normalizedPath;
  }
  return path.posix.join('src', normalizedPath);
}

function handleSourceAndZip(
  req: IncomingMessage,
  res: ServerResponse,
  context: SourceZipProjectContext,
  pathname: string,
  url: URL,
): boolean {
  const projectRoot = context.project.root;
  if (pathname === '/api/source' && req.method === 'GET') {
    const targetPath = url.searchParams.get('path') || '';
    const sourcePath = path.posix.join(normalizeLegacySourcePath(targetPath), 'index.tsx');
    try {
      const sourceFile = resolveProjectPath(projectRoot, sourcePath);
      if (!sendFile(res, sourceFile)) {
        sendJson(res, { error: 'Source file not found' }, { status: 404 });
      }
    } catch (error: any) {
      sendJson(res, { error: error.message }, { status: 403 });
    }
    return true;
  }

  if (pathname === '/api/zip' && req.method === 'GET') {
    const targetPath = url.searchParams.get('path') || '';
    const sourcePath = normalizeLegacySourcePath(targetPath);
    try {
      const sourceDir = resolveProjectPath(projectRoot, sourcePath);
      if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        sendJson(res, { error: 'Directory not found' }, { status: 404 });
        return true;
      }
      const fileName = `${path.posix.basename(sourcePath)}.zip`;
      if (url.searchParams.get('probe') === '1') {
        sendJson(res, { ok: true, fileName, path: targetPath, projectId: context.project.id });
        return true;
      }
      streamDirectoryAsZip(res, sourceDir, fileName);
    } catch (error: any) {
      sendJson(res, { error: error.message }, { status: 403 });
    }
    return true;
  }

  return false;
}

function handleProjectAwareSourceAndZip(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  url: URL,
  handlers: SourceZipApiHandlers,
): boolean {
  if (pathname !== '/api/source' && pathname !== '/api/zip') {
    return false;
  }

  const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
  if (!context) {
    return true;
  }

  const targetPath = url.searchParams.get('path') || '';
  const resource = handlers.findProjectResourceByPath(context.metadata, targetPath);
  if (!resource) {
    return false;
  }

  if (pathname === '/api/source' && req.method === 'GET') {
    const sourceFile = handlers.resolveSourceFileFromMetadata(context, targetPath);
    if (!sourceFile) {
      handlers.sendDisabledCapability(res, 424, {
        error: 'Source metadata is required to read source code for this resource',
        code: 'SOURCE_METADATA_REQUIRED',
        projectId: context.project.id,
        projectRoot: context.project.root,
        path: targetPath,
        sourceRequired: true,
      });
      return true;
    }
    sendFile(res, sourceFile);
    return true;
  }

  if (pathname === '/api/zip' && req.method === 'GET') {
    const sourceFile = handlers.resolveSourceFileFromMetadata(context, targetPath);
    const sourceDir = sourceFile
      ? path.dirname(sourceFile)
      : resolveDirectoryFromResourceMetadata(context, resource);
    if (!sourceDir) {
      handlers.sendDisabledCapability(res, 424, {
        error: 'Source metadata is required to download source files for this resource',
        code: 'SOURCE_METADATA_REQUIRED',
        projectId: context.project.id,
        projectRoot: context.project.root,
        path: targetPath,
        sourceRequired: true,
      });
      return true;
    }
    const fileName = `${path.basename(sourceDir)}.zip`;
    if (url.searchParams.get('probe') === '1') {
      sendJson(res, { ok: true, fileName, path: targetPath, projectId: context.project.id });
      return true;
    }
    streamDirectoryAsZip(res, sourceDir, fileName);
    return true;
  }

  return false;
}

export function handleProjectSourceAndZipApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  requestContext: SourceZipProjectContext,
  pathname: string,
  url: URL,
  handlers: SourceZipApiHandlers,
): boolean {
  return handleProjectAwareSourceAndZip(req, res, options, pathname, url, handlers)
    || handleSourceAndZip(req, res, requestContext, pathname, url);
}
