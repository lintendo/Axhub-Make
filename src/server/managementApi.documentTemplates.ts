import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
  DOCUMENT_TEMPLATES,
  getDocumentTemplate,
  type DocumentTemplateDefinition,
} from '../common/documentTemplates.ts';
import { readJsonBody, sendFile, sendJson } from './http.ts';
import { sendHtmlDocumentPreview } from './htmlDocumentPreview.ts';
import { restoreMakeClientTemplateFile } from './makeClientProject.ts';
import { isPathInside, type RegisteredProject } from './projectCore/index.ts';

interface DocumentTemplateProjectContext {
  project: RegisteredProject;
}

function resolveTemplatePath(projectRoot: string, template: DocumentTemplateDefinition): string {
  const templatesRoot = path.resolve(projectRoot, 'templates');
  const filePath = path.resolve(projectRoot, ...template.path.split('/'));
  if (!isPathInside(templatesRoot, filePath) || !isPathInside(projectRoot, filePath)) {
    throw new Error('Invalid document template registry path');
  }
  return filePath;
}

function templateExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function buildTemplateUrl(projectId: string, template: DocumentTemplateDefinition): string {
  const query = new URLSearchParams({ projectId, path: template.path });
  return `/api/document-templates/${encodeURIComponent(template.id)}?${query.toString()}`;
}

function buildTemplateDto(projectRoot: string, projectId: string, template: DocumentTemplateDefinition) {
  const contentUrl = buildTemplateUrl(projectId, template);
  const previewUrl = template.format === 'markdown'
    ? `/spec-template.html?url=${encodeURIComponent(contentUrl)}`
    : contentUrl;
  const editUrl = template.format === 'markdown'
    ? `${previewUrl}&mode=edit`
    : `${contentUrl}&mode=edit`;
  return {
    ...template,
    exists: templateExists(resolveTemplatePath(projectRoot, template)),
    contentUrl,
    previewUrl,
    editUrl,
  };
}

function sendTemplateNotFound(res: ServerResponse): void {
  sendJson(res, {
    error: 'Document template not found',
    code: 'DOCUMENT_TEMPLATE_NOT_FOUND',
  }, { status: 404 });
}

export function handleDocumentTemplatesApi(
  req: IncomingMessage,
  res: ServerResponse,
  context: DocumentTemplateProjectContext,
  pathname: string,
): boolean {
  if (pathname !== '/api/document-templates' && !pathname.startsWith('/api/document-templates/')) {
    return false;
  }

  const projectRoot = context.project.root;
  const projectId = context.project.id;
  if (pathname === '/api/document-templates') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
      return true;
    }
    sendJson(res, {
      projectId,
      templates: DOCUMENT_TEMPLATES.map((template) => buildTemplateDto(projectRoot, projectId, template)),
    });
    return true;
  }

  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(pathname.slice('/api/document-templates/'.length));
  } catch {
    sendTemplateNotFound(res);
    return true;
  }
  const restore = decodedPath.endsWith('/restore');
  const templateId = restore ? decodedPath.slice(0, -'/restore'.length) : decodedPath;
  const template = getDocumentTemplate(templateId);
  if (!template) {
    sendTemplateNotFound(res);
    return true;
  }
  const filePath = resolveTemplatePath(projectRoot, template);

  if (restore) {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
      return true;
    }
    if (templateExists(filePath)) {
      sendJson(res, {
        error: 'Document template already exists',
        code: 'DOCUMENT_TEMPLATE_EXISTS',
      }, { status: 409 });
      return true;
    }
    void restoreMakeClientTemplateFile(projectRoot, template.path)
      .then((result) => {
        sendJson(res, {
          success: true,
          template: buildTemplateDto(projectRoot, projectId, template),
          version: result.version,
        }, { status: 201 });
      })
      .catch((error: any) => {
        const status = typeof error?.status === 'number' ? error.status : error?.code === 'EEXIST' ? 409 : 502;
        sendJson(res, {
          error: error?.message || 'Failed to restore document template',
          code: status === 409 ? 'DOCUMENT_TEMPLATE_EXISTS' : 'DOCUMENT_TEMPLATE_RESTORE_FAILED',
        }, { status });
      });
    return true;
  }

  if (req.method === 'GET') {
    if (!templateExists(filePath)) {
      sendJson(res, {
        error: 'Document template file is missing',
        code: 'DOCUMENT_TEMPLATE_MISSING',
        template: buildTemplateDto(projectRoot, projectId, template),
      }, { status: 404 });
      return true;
    }
    if (sendHtmlDocumentPreview(req, res, filePath, {
      documentName: template.path,
      projectId,
    })) {
      return true;
    }
    sendFile(res, filePath);
    return true;
  }

  if (req.method === 'PUT') {
    if (!templateExists(filePath)) {
      sendJson(res, {
        error: 'Document template file is missing',
        code: 'DOCUMENT_TEMPLATE_MISSING',
      }, { status: 404 });
      return true;
    }
    void readJsonBody(req)
      .then((body) => {
        if (typeof body?.content !== 'string') {
          sendJson(res, { error: 'Missing content', code: 'DOCUMENT_TEMPLATE_CONTENT_REQUIRED' }, { status: 400 });
          return;
        }
        fs.writeFileSync(filePath, body.content, 'utf8');
        sendJson(res, { success: true, template: buildTemplateDto(projectRoot, projectId, template) });
      })
      .catch((error: any) => sendJson(res, { error: error?.message || 'Invalid JSON body' }, { status: 400 }));
    return true;
  }

  sendJson(res, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  return true;
}
