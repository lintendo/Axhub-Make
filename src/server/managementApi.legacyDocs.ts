import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPathInside, resolveProjectPath, type ProjectMetadata, type RegisteredProject } from './projectCore/index.ts';

import { readJsonBody, sendFile, sendJson } from './http.ts';
import { sendHtmlDocumentPreview } from './htmlDocumentPreview.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import { stripViteDevOnlyModuleImports } from './staticTemplateHtml.ts';
import { sendUnsupportedFilePreview } from './unsupportedFilePreview.ts';

interface LegacyDocsProjectContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
}

interface LegacyDocsHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
  ) => LegacyDocsProjectContext | null;
}

function buildMarkdownFileUrl(projectId: string, markdownPath: string): string {
  const params = new URLSearchParams({ projectId, path: markdownPath });
  return `/api/markdown-file?${params.toString()}`;
}

function findProjectDocByRouteName(projectRoot: string, routeName: string) {
  const normalizedRouteName = String(routeName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/iu, '');
  if (!normalizedRouteName || normalizedRouteName.startsWith('/') || normalizedRouteName.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }

  const relativePath = normalizedRouteName.endsWith('.md') ? normalizedRouteName : `${normalizedRouteName}.md`;
  const docsDir = path.join(projectRoot, 'src', 'resources');
  const docPath = path.resolve(docsDir, relativePath);
  if (!isPathInside(docsDir, docPath) || !fs.existsSync(docPath) || !fs.statSync(docPath).isFile()) {
    return null;
  }
  return {
    id: normalizedRouteName,
    name: normalizedRouteName,
    title: fs.readFileSync(docPath, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() || normalizedRouteName,
    path: docPath,
  };
}

function sendLegacyDocRedirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function renderLegacyDocTemplate(params: {
  adminRoot: string;
  title: string;
  markdownUrl: string;
}): string | null {
  const templatePath = path.resolve(params.adminRoot || '', 'spec-template.html');
  if (!fs.existsSync(templatePath) || !fs.statSync(templatePath).isFile()) {
    return null;
  }
  return stripViteDevOnlyModuleImports(fs.readFileSync(templatePath, 'utf8'))
    .replace(/\{\{TITLE\}\}/g, params.title)
    .replace(/\{\{SPEC_URL\}\}/g, params.markdownUrl)
    .replace(/\{\{DOCS_CONFIG\}\}/g, '[]')
    .replace(/\{\{MULTI_DOC\}\}/g, 'false');
}

function handleMarkdownFileApi(
  req: IncomingMessage,
  res: ServerResponse,
  activeProjectRoot: string,
  pathname: string,
  url: URL,
): boolean {
  if (pathname !== '/api/markdown-file' && pathname !== '/api/markdown-file-meta') {
    return false;
  }
  if (pathname === '/api/markdown-file' && req.method !== 'GET' && req.method !== 'PUT') {
    return false;
  }
  if (pathname === '/api/markdown-file-meta' && req.method !== 'GET') {
    return false;
  }

  try {
    const filePath = resolveProjectPath(activeProjectRoot, url.searchParams.get('path') || '');
    if (pathname === '/api/markdown-file-meta') {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendJson(res, { exists: false, path: filePath, updatedAt: null }, { status: 404 });
        return true;
      }
      const stat = fs.statSync(filePath);
      sendJson(res, {
        exists: true,
        path: filePath,
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
      });
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, String(body?.content ?? ''), 'utf8');
        sendJson(res, { success: true, path: filePath });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
    if (sendUnsupportedFilePreview({
      req,
      res,
      docName: path.basename(filePath),
      filePath,
      openEndpoint: '/api/docs/open-system',
      resourceType: 'docs',
    })) {
      return true;
    }
    if (sendHtmlDocumentPreview(req, res, filePath)) {
      return true;
    }
    if (!sendFile(res, filePath)) {
      sendJson(res, { error: 'Document not found' }, { status: 404 });
    }
  } catch (error: any) {
    sendJson(res, { error: error.message }, { status: 403 });
  }
  return true;
}

function handleLegacyDocsPreview(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  projectContext: LegacyDocsProjectContext | null,
  pathname: string,
  url: URL,
  handlers: LegacyDocsHandlers,
): boolean {
  const assetsLegacyMatch = pathname.match(/^\/assets\/docs\/(.+)\/spec\.html$/u);
  if (assetsLegacyMatch) {
    const projectId = String(url.searchParams.get('projectId') || '').trim();
    const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    sendLegacyDocRedirect(res, `/docs/${assetsLegacyMatch[1]}${params}`);
    return true;
  }

  if (!pathname.startsWith('/docs/')) {
    return false;
  }

  const context = projectContext || handlers.resolveProjectContext(req, res, options, 'explicit-required');
  if (!context) {
    return true;
  }

  const markdownMatch = pathname.match(/^\/docs\/(.+)\.md$/u);
  const previewMatch = pathname.match(/^\/docs\/(.+?)(?:\/spec\.html)?$/u);
  const encodedDocName = markdownMatch?.[1] || previewMatch?.[1] || '';
  const routeName = decodeURIComponent(encodedDocName);
  const doc = findProjectDocByRouteName(context.project.root, routeName);
  if (!doc || !isPathInside(context.project.root, doc.path)) {
    return false;
  }

  if (markdownMatch) {
    if (!sendFile(res, doc.path)) {
      sendJson(res, { error: 'Document not found' }, { status: 404 });
    }
    return true;
  }

  const markdownUrl = buildMarkdownFileUrl(context.project.id, doc.path);
  const html = renderLegacyDocTemplate({
    adminRoot: options.adminRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/admin'),
    title: `Docs: ${doc.title || doc.name || doc.id}`,
    markdownUrl,
  }) || renderLegacyDocTemplate({
    adminRoot: path.resolve(context.project.root, 'admin'),
    title: `Docs: ${doc.title || doc.name || doc.id}`,
    markdownUrl,
  });

  if (!html) {
    return false;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
  return true;
}

export function handleLegacyDocsApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  projectContext: LegacyDocsProjectContext | null,
  pathname: string,
  url: URL,
  handlers: LegacyDocsHandlers,
): boolean {
  return handleLegacyDocsPreview(req, res, options, projectContext, pathname, url, handlers)
    || (projectContext ? handleMarkdownFileApi(req, res, projectContext.project.root, pathname, url) : false);
}
