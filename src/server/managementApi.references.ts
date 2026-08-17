import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { isPathInside } from './projectCore/index.ts';

import {
  getRequestUrl,
  readJsonBody,
  sendFile,
  sendJson,
} from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';

interface ReferenceProjectContext {
  project: {
    id: string;
    root: string;
  };
}

interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

interface UploadAndReferenceHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
  ) => ReferenceProjectContext | null;
  readMultipartParts: (req: IncomingMessage) => Promise<MultipartPart[]>;
  resolveMarkdownFileAssetPath: (
    context: ReferenceProjectContext,
    markdownPath: string,
    assetPath: string,
  ) => string | null;
  resolveLegacySpecDocPath: (context: ReferenceProjectContext, docUrl: string) => string;
  getDeclaredResourceWriteDir: (
    context: ReferenceProjectContext,
    type: 'media',
  ) => string | null;
  sendResourceWriteAdapterRequired: (
    res: ServerResponse,
    context: ReferenceProjectContext,
    route: string,
    details?: Record<string, unknown>,
  ) => void;
  encodeUrlPathSegments: (value: string) => string;
}

function normalizeUploadFileName(value: string): string {
  const baseName = path.basename(String(value || '').trim());
  const safeName = baseName
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safeName || `image-${Date.now()}`;
}

function getAvailableFilePath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext) || 'image';
  let candidate = path.join(dir, fileName);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}-${index}${ext}`);
    index += 1;
  }
  return candidate;
}

function getMultipartTextField(parts: MultipartPart[], name: string): string {
  return parts.find((part) => part.name === name && !part.filename)?.data.toString('utf8').trim() || '';
}

function getPrimaryMultipartFile(parts: MultipartPart[]): MultipartPart | null {
  return parts.find((part) => part.name === 'file' && part.filename)
    || parts.find((part) => part.filename)
    || null;
}

export function handleUploadAndReferenceApis(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  handlers: UploadAndReferenceHandlers,
): boolean {
  if (pathname === '/api/markdown-file-asset' && req.method === 'GET') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const url = getRequestUrl(req);
    try {
      const targetPath = handlers.resolveMarkdownFileAssetPath(
        context,
        url.searchParams.get('path') || '',
        url.searchParams.get('asset') || '',
      );
      if (!targetPath) {
        sendJson(res, { error: 'Invalid Markdown asset path' }, { status: 403 });
        return true;
      }
      if (!sendFile(res, targetPath)) {
        sendJson(res, { error: 'Markdown asset not found' }, { status: 404 });
      }
    } catch (error: any) {
      sendJson(res, { error: error.message }, { status: 403 });
    }
    return true;
  }

  if (pathname === '/api/spec-doc/save' && req.method === 'POST') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    readJsonBody(req).then((body) => {
      const targetPath = handlers.resolveLegacySpecDocPath(context, String(body?.docUrl || ''));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, String(body?.content ?? ''), 'utf8');
      sendJson(res, {
        success: true,
        projectId: context.project.id,
        path: targetPath,
        relativePath: path.relative(context.project.root, targetPath).split(path.sep).join('/'),
      });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (pathname === '/api/spec-doc/upload-image' && req.method === 'POST') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    handlers.readMultipartParts(req).then((parts) => {
      const filePart = getPrimaryMultipartFile(parts);
      if (!filePart?.filename) {
        sendJson(res, { error: 'Missing file' }, { status: 400 });
        return;
      }

      const docPath = handlers.resolveLegacySpecDocPath(context, getMultipartTextField(parts, 'docUrl'));
      const assetDir = path.join(path.dirname(docPath), 'assets');
      const fileName = normalizeUploadFileName(filePart.filename);
      const targetPath = getAvailableFilePath(assetDir, fileName);
      if (!isPathInside(path.dirname(docPath), targetPath)) {
        sendJson(res, { error: 'Invalid image path' }, { status: 403 });
        return;
      }

      fs.mkdirSync(assetDir, { recursive: true });
      fs.writeFileSync(targetPath, filePart.data);
      const relativeToDoc = path.relative(path.dirname(docPath), targetPath).split(path.sep).join('/');
      const relativeToProject = path.relative(context.project.root, targetPath).split(path.sep).join('/');
      sendJson(res, {
        success: true,
        projectId: context.project.id,
        name: path.basename(targetPath),
        path: relativeToProject,
        url: relativeToDoc,
        absoluteFilePath: targetPath,
        mimeType: filePart.contentType,
        size: filePart.data.byteLength,
      }, { status: 201 });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (pathname === '/api/media/upload' && req.method === 'POST') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const mediaDir = handlers.getDeclaredResourceWriteDir(context, 'media');
    if (!mediaDir) {
      handlers.sendResourceWriteAdapterRequired(res, context, '/api/media/upload');
      req.resume();
      return true;
    }
    handlers.readMultipartParts(req).then((parts) => {
      const filePart = getPrimaryMultipartFile(parts);
      if (!filePart?.filename) {
        sendJson(res, { error: 'Missing file' }, { status: 400 });
        return;
      }
      const fileName = path.basename(filePart.filename);
      if (!fileName || fileName === '.' || fileName === '..') {
        sendJson(res, { error: 'Invalid file name' }, { status: 400 });
        return;
      }
      const parentPath = String(getMultipartTextField(parts, 'path') || getMultipartTextField(parts, 'parentPath') || '').replace(/\\/g, '/');
      const normalizedParent = parentPath.split('/').filter(Boolean).join('/');
      if (parentPath.includes('..')) {
        sendJson(res, { error: 'Invalid media path' }, { status: 403 });
        return;
      }
      const targetDir = path.resolve(mediaDir, normalizedParent);
      const targetPath = path.resolve(targetDir, fileName);
      if (!isPathInside(mediaDir, targetDir) || !isPathInside(mediaDir, targetPath)) {
        sendJson(res, { error: 'Invalid media path' }, { status: 403 });
        return;
      }
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetPath, filePart.data);
      const relativePath = path.relative(mediaDir, targetPath).split(path.sep).join('/');
      sendJson(res, {
        success: true,
        projectId: context.project.id,
        name: fileName,
        path: relativePath,
        url: `/api/media/file/${handlers.encodeUrlPathSegments(relativePath)}`,
        absoluteFilePath: targetPath,
        mimeType: filePart.contentType,
        size: filePart.data.byteLength,
      }, { status: 201 });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (pathname === '/api/items/check-references' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      sendJson(res, {
        path: String(body?.path || ''),
        action: String(body?.action || ''),
        references: [],
        hasReferences: false,
      });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  return false;
}
