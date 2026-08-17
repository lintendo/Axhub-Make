import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';

import { buildExportHtmlStaticFiles } from './exportHtmlArchive.ts';
import { getRequestUrl, readJsonBody, sendJson, sendText } from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import { normalizeProjectResourcePath } from './managementApi.resourceLookup.ts';
import {
  resolvePrototypeIdForReviewSubmit,
} from './reviewLanSubmitConfig.ts';
import {
  AxhubApiError,
  createAxhubAuthClient,
  resolveRequestOrigin,
  type AxhubUserInfo,
  type AxhubPublishFile,
  type AxhubPublishResponse,
} from './axhubAuthClient.ts';
import { createProjectCommunicationStore, type ProjectMetadata } from './projectCore/index.ts';

interface AxhubPublishContext {
  project: {
    id: string;
    root: string;
  };
  metadata?: ProjectMetadata;
}

interface AxhubApiHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
    body?: unknown,
  ) => AxhubPublishContext | null;
  resolveSourceFileFromMetadata: (context: AxhubPublishContext, targetPath: string) => string | null;
  findProjectResourceByPath: (metadata: unknown, targetPath: string) => any;
  getDeclaredResourceWriteDir?: (context: AxhubPublishContext, type: 'media') => string | null;
  readProjectConfig: (projectRoot: string) => any;
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createClient(options: ManagementApiOptions) {
  return createAxhubAuthClient({
    registryPath: options.registryPath,
    serverInfoHomeDir: options.serverInfoHomeDir,
    onlineBaseUrl: options.axhubOnlineBaseUrl,
  });
}

function sendError(res: ServerResponse, error: any, fallback: string) {
  const status = Number(error?.status) || Number(error?.statusCode) || 500;
  sendJson(res, {
    error: error?.message || fallback,
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.details !== undefined ? { details: error.details } : {}),
  }, { status });
}

function createAxhubContentHash(body: Buffer): string {
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, 8);
}

const AXHUB_CORE_PUBLISH_FILE_PATHS = new Set([
  'index.html',
  'index.js',
]);

function isEmptyAxhubPublishFile(file: { body: Buffer }): boolean {
  return file.body.length <= 0;
}

function isAxhubCorePublishFilePath(filePath: string): boolean {
  return AXHUB_CORE_PUBLISH_FILE_PATHS.has(filePath.split(path.sep).join('/'));
}

function assertNonEmptyAxhubCoreFiles(files: Array<{ path: string; body: Buffer }>) {
  for (const file of files) {
    if (!isAxhubCorePublishFilePath(file.path) || !isEmptyAxhubPublishFile(file)) {
      continue;
    }
    throw new AxhubApiError(`Axhub 发布核心文件为空：${file.path}`, {
      status: 500,
      code: 'AXHUB_CORE_FILE_EMPTY',
      details: { path: file.path },
    });
  }
}

export function normalizeFilesForAxhub(files: Array<{ path: string; contentType: string; body: Buffer }>): AxhubPublishFile[] {
  assertNonEmptyAxhubCoreFiles(files);
  const indexJs = files.find((file) => file.path === 'index.js');
  const hashedIndexJsPath = indexJs ? `index.${createAxhubContentHash(indexJs.body)}.js` : '';

  return files.map((file) => ({
    ...file,
    path: file.path === 'index.js' && hashedIndexJsPath ? hashedIndexJsPath : file.path,
    body: file.path === 'index.html' && hashedIndexJsPath
      ? Buffer.from(file.body.toString('utf8').replace(/(['"])\.\/index\.js\1/gu, `$1./${hashedIndexJsPath}$1`), 'utf8')
      : file.body,
  })).filter((file) => !isEmptyAxhubPublishFile(file)).map((file) => ({
    path: file.path,
    contentType: file.contentType,
    body: file.body,
  }));
}

function resolveAxhubHostedUrl(rawUrl: string, onlineBaseUrl: string): string {
  const value = stringValue(rawUrl);
  if (!value) return value;
  try {
    return new URL(value, `${onlineBaseUrl.replace(/\/+$/u, '')}/`).toString();
  } catch {
    return value;
  }
}

export function normalizeAxhubPublishResultUrl(
  result: AxhubPublishResponse,
  onlineBaseUrl: string,
): AxhubPublishResponse {
  return {
    ...result,
    url: resolveAxhubHostedUrl(result.url, onlineBaseUrl),
  };
}

function sanitizeAxhubMe(me: AxhubUserInfo): AxhubUserInfo {
  const record = me && typeof me === 'object' ? me as unknown as Record<string, unknown> : {};
  const {
    token: _token,
    accessToken: _accessToken,
    refreshToken: _refreshToken,
    ...safeRecord
  } = record;
  return {
    ...safeRecord,
    serverUrl: stringValue(me.serverUrl),
    tokenPrefix: stringValue(me.tokenPrefix),
  } as AxhubUserInfo;
}

export async function publishAxhubHtmlTarget(params: {
  options: ManagementApiOptions;
  pid: number;
  files: Array<{ path: string; contentType: string; body: Buffer }>;
  reviewContext?: { projectId: string; prototypeId: string };
}) {
  const client = createClient(params.options);
  const result = await client.publishHtmlProject(params.pid, normalizeFilesForAxhub(params.files), params.reviewContext);
  return normalizeAxhubPublishResultUrl(result, client.getActiveBaseUrl());
}

async function buildPublishFiles(params: {
  req: IncomingMessage;
  res: ServerResponse;
  options: ManagementApiOptions;
  handlers: AxhubApiHandlers;
  body: any;
}) {
  const targetPath = stringValue(params.body?.path);
  const context = params.handlers.resolveProjectContext(params.req, params.res, params.options, 'explicit-required', params.body);
  if (!context) return null;
  const metadata = context.metadata;
  const normalizedTargetPath = metadata
    ? normalizeProjectResourcePath(metadata, targetPath)
    : targetPath;
  const sourceFile = params.handlers.resolveSourceFileFromMetadata(context, normalizedTargetPath);
  if (!sourceFile) {
    params.handlers.sendDisabledCapability(params.res, 424, {
      error: 'Source metadata is required to publish this page',
      code: 'SOURCE_METADATA_REQUIRED',
      projectId: context.project.id,
      projectRoot: context.project.root,
      path: normalizedTargetPath,
      sourceRequired: true,
    });
    return null;
  }
  const projectConfig = params.handlers.readProjectConfig(context.project.root);
  const resource = params.handlers.findProjectResourceByPath(metadata, normalizedTargetPath);
  const reviewSubmitPrototypeId = resolvePrototypeIdForReviewSubmit({
    resource,
    targetPath: normalizedTargetPath,
    sourceFile,
  });
  const files = await buildExportHtmlStaticFiles({
    projectRoot: context.project.root,
    sourceFile,
    entryName: stringValue(resource?.name) || path.basename(path.dirname(sourceFile)),
    displayName: stringValue(resource?.title) || stringValue(resource?.name) || path.basename(path.dirname(sourceFile)),
    group: normalizedTargetPath.replace(/^src\//u, '').split('/')[0] || 'prototypes',
    includeSource: projectConfig?.cloudPublishing?.publishSettings?.includeSource === true,
    mediaRoot: params.handlers.getDeclaredResourceWriteDir?.(context, 'media') || undefined,
  });
  return {
    files,
    normalizedTargetPath,
    context,
    reviewContext: reviewSubmitPrototypeId
      ? { projectId: context.project.id, prototypeId: reviewSubmitPrototypeId }
      : undefined,
  };
}

export function handleAxhubApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  handlers: AxhubApiHandlers,
): boolean {
  if (!pathname.startsWith('/api/axhub/')) {
    return false;
  }

  const client = createClient(options);
  const url = getRequestUrl(req);

  if (pathname === '/api/axhub/status') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const status = client.getStatus();
    if (!status.connected) {
      sendJson(res, status);
      return true;
    }
    client.getMe()
      .then((me) => sendJson(res, { ...status, me: sanitizeAxhubMe(me) }))
      .catch((error) => sendError(res, error, '读取 Axhub 登录状态失败'));
    return true;
  }

  if (pathname === '/api/axhub/connect') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    try {
      const session = client.beginAuthorization(resolveRequestOrigin(req));
      sendJson(res, {
        authorizeUrl: session.authorizeUrl,
        state: session.state,
      });
    } catch (error) {
      sendError(res, error, '创建 Axhub 授权链接失败');
    }
    return true;
  }

  if (pathname === '/api/axhub/connect-enterprise') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    readJsonBody(req)
      .then((body) => client.connectEnterprise({
        serverUrl: stringValue(body?.serverUrl),
        token: stringValue(body?.token),
      }))
      .then((me) => {
        const status = client.getStatus();
        sendJson(res, {
          ...status,
          provider: 'enterprise',
          serverUrl: stringValue(me.serverUrl) || ('serverUrl' in status ? stringValue(status.serverUrl) : ''),
          tokenPrefix: stringValue(me.tokenPrefix) || ('tokenPrefix' in status ? stringValue(status.tokenPrefix) : ''),
          me: sanitizeAxhubMe(me),
        });
      })
      .catch((error) => sendError(res, error, '连接企业版失败'));
    return true;
  }

  if (pathname === '/api/axhub/callback') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    client.completeAuthorization(url.searchParams)
      .then(() => {
        sendText(res, [
          '<!doctype html><meta charset="utf-8">',
          '<title>Axhub 授权成功</title>',
          '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111827;">',
          '<div id="message">Axhub 授权成功，正在返回 Axhub Make...</div>',
          '<script>',
          'try{window.opener&&window.opener.postMessage({type:"axhub-auth-success"},"*")}catch(e){}',
          'setTimeout(function(){window.close();setTimeout(function(){document.getElementById("message").textContent="Axhub 授权成功，可以关闭此窗口。"},300)},500);',
          '</script>',
          '</body>',
        ].join(''), 'text/html; charset=utf-8');
      })
      .catch((error) => {
        sendText(res, `Axhub 授权失败：${error?.message || '请重新授权'}`, 'text/plain; charset=utf-8', 400);
      });
    return true;
  }

  if (pathname === '/api/axhub/disconnect') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    client.disconnect()
      .then(() => sendJson(res, { success: true }))
      .catch((error) => sendError(res, error, '断开 Axhub 授权失败'));
    return true;
  }

  if (pathname === '/api/axhub/html-projects') {
    if (req.method === 'GET') {
      client.listHtmlProjects(stringValue(url.searchParams.get('keyword')))
        .then((projects) => sendJson(res, { projects }))
        .catch((error) => sendError(res, error, '加载 Axhub HTML 项目失败'));
      return true;
    }
    if (req.method === 'POST') {
      readJsonBody(req)
        .then((body) => client.createHtmlProject(stringValue(body?.name)))
        .then((project) => sendJson(res, { project }))
        .catch((error) => sendError(res, error, '创建 Axhub HTML 项目失败'));
      return true;
    }
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  const reviewReportsMatch = pathname.match(/^\/api\/axhub\/html-projects\/(\d+)\/review-reports$/u);
  if (reviewReportsMatch) {
    if (req.method !== 'DELETE') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const pid = Number(reviewReportsMatch[1]);
    client.clearHtmlProjectReviewReports(pid)
      .then((result) => sendJson(res, result))
      .catch((error) => sendError(res, error, '清空 Axhub 评审报告失败'));
    return true;
  }

  if (pathname === '/api/axhub/publish') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    readJsonBody(req)
      .then(async (body) => {
        const pid = Number(body?.pid);
        if (!Number.isInteger(pid) || pid <= 0) {
          throw new AxhubApiError('请选择要发布的 Axhub HTML 项目', {
            status: 400,
            code: 'AXHUB_PROJECT_REQUIRED',
          });
        }
        const built = await buildPublishFiles({ req, res, options, handlers, body });
        if (!built) return;
        const rawResult = await client.publishHtmlProject(pid, normalizeFilesForAxhub(built.files), built.reviewContext);
        const result = normalizeAxhubPublishResultUrl(rawResult, client.getActiveBaseUrl());
        const communicationStore = createProjectCommunicationStore(built.context.project.root);
        communicationStore.ensureDirectories();
        communicationStore.appendExportRecord({
          projectId: built.context.project.id,
          resourceId: built.reviewContext?.prototypeId || built.normalizedTargetPath,
          resourceType: built.reviewContext ? 'prototype' : 'resource',
          operationType: 'cloud.publish.axhub',
          status: 'success',
          timestamp: result.generateTime,
          metadata: {
            path: built.normalizedTargetPath,
            url: result.url,
            axhubProjectId: result.pid,
            axhubProjectPath: result.path,
            htmlUsedSpace: result.htmlUsedSpace,
            prototypeId: built.reviewContext?.prototypeId,
          },
        });
        sendJson(res, {
          url: result.url,
          project: result,
          path: built.normalizedTargetPath,
        });
      })
      .catch((error) => sendError(res, error, '发布到 Axhub 失败'));
    return true;
  }

  return false;
}
