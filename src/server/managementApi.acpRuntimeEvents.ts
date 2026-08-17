import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { getRequestUrl, LOCAL_API_CORS_HEADERS, sendJson } from './http.ts';
import { normalizePrototypeCommentTargetPath } from './documentCommentsStorage.ts';
import type { ManagementApiOptions } from './managementApi.ts';

const ACP_RUNTIME_EVENTS_PATH = '/api/acp/conversations/runtime/events';
const ACP_RUNTIME_STATUS_PATH = '/api/acp/conversations/runtime/status';
const DEFAULT_ACP_API_BASE_URL = 'http://localhost:32124/api';

interface AcpRuntimeEventsProjectContext {
  project: {
    id: string;
    root: string;
  };
}

function normalizeBaseUrl(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().replace(/\/+$/u, '') : '';
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/u, '');
  } catch {
    return '';
  }
}

function resolveConfiguredAcpApiBaseUrl(config: any): string {
  const apiBaseUrl = normalizeBaseUrl(config?.assistant?.apiBaseUrl);
  if (apiBaseUrl) return apiBaseUrl;
  const webBaseUrl = normalizeBaseUrl(config?.assistant?.webBaseUrl);
  return webBaseUrl ? `${webBaseUrl}/api` : DEFAULT_ACP_API_BASE_URL;
}

async function relayAcpRuntimeEvents(params: {
  req: IncomingMessage;
  res: ServerResponse;
  apiBaseUrl: string;
  workspacePath: string;
  conversationStorePath?: string;
}): Promise<void> {
  const upstreamUrl = new URL(
    `${params.apiBaseUrl.replace(/\/chat$/u, '')}/conversations/runtime/events`,
  );
  upstreamUrl.searchParams.set('workspacePath', params.workspacePath);
  if (params.conversationStorePath) {
    upstreamUrl.searchParams.set('conversationStorePath', params.conversationStorePath);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  params.res.once('close', abort);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    params.res.statusCode = upstream.status;
    params.res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
    );
    params.res.setHeader('Cache-Control', 'no-store, no-transform');
    params.res.setHeader('Connection', 'keep-alive');
    params.res.flushHeaders?.();
    if (!upstream.body) {
      params.res.end();
      return;
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted || params.res.destroyed) break;
        params.res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    if (!params.res.destroyed) params.res.end();
  } catch (error) {
    if (controller.signal.aborted || params.res.destroyed) return;
    if (!params.res.headersSent) {
      sendJson(params.res, {
        error: error instanceof Error ? error.message : 'ACP runtime events unavailable',
        code: 'ACP_RUNTIME_EVENTS_UNAVAILABLE',
      }, { status: 502 });
      return;
    }
    params.res.end();
  } finally {
    params.res.off('close', abort);
  }
}

async function relayAcpRuntimeStatus(params: {
  res: ServerResponse;
  apiBaseUrl: string;
  workspacePath: string;
  conversationStorePath?: string;
  threadId: string;
}): Promise<void> {
  const upstreamUrl = new URL(
    `${params.apiBaseUrl.replace(/\/chat$/u, '')}/conversations/${encodeURIComponent(params.threadId)}/runtime`,
  );
  upstreamUrl.searchParams.set('workspacePath', params.workspacePath);
  if (params.conversationStorePath) {
    upstreamUrl.searchParams.set('conversationStorePath', params.conversationStorePath);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  params.res.once('close', abort);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    if (controller.signal.aborted || params.res.destroyed) return;
    params.res.statusCode = upstream.status;
    params.res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    );
    params.res.setHeader('Cache-Control', 'no-store');
    params.res.end(body);
  } catch (error) {
    if (controller.signal.aborted || params.res.destroyed) return;
    sendJson(params.res, {
      error: error instanceof Error ? error.message : 'ACP conversation runtime unavailable',
      code: 'ACP_CONVERSATION_RUNTIME_UNAVAILABLE',
    }, { status: 502 });
  } finally {
    params.res.off('close', abort);
  }
}

export function handleAcpRuntimeEventsApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  context: AcpRuntimeEventsProjectContext,
  pathname: string,
  getServerConfig: (
    options: ManagementApiOptions,
  ) => { getConfig(params: { activeProjectRoot: string }): any },
): boolean {
  if (pathname !== ACP_RUNTIME_EVENTS_PATH && pathname !== ACP_RUNTIME_STATUS_PATH) return false;
  for (const [key, value] of Object.entries(LOCAL_API_CORS_HEADERS)) {
    res.setHeader(key, value);
  }
  if (req.method !== 'GET') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  const config = getServerConfig(options).getConfig({
    activeProjectRoot: context.project.root,
  });
  const requestedTargetPath = getRequestUrl(req).searchParams.get('targetPath');
  const targetPath = requestedTargetPath === null
    ? null
    : normalizePrototypeCommentTargetPath(requestedTargetPath);
  if (requestedTargetPath !== null && !targetPath) {
    sendJson(res, { error: 'Invalid prototype target path' }, { status: 400 });
    return true;
  }
  const conversationStorePath = targetPath
    ? path.join(
        context.project.root,
        'src',
        targetPath,
        '.spec',
        'acp',
        'conversations.json',
      )
    : undefined;
  const apiBaseUrl = resolveConfiguredAcpApiBaseUrl(config);
  if (pathname === ACP_RUNTIME_STATUS_PATH) {
    const threadId = getRequestUrl(req).searchParams.get('threadId')?.trim() || '';
    if (!threadId) {
      sendJson(res, { error: 'ACP thread ID is required' }, { status: 400 });
      return true;
    }
    void relayAcpRuntimeStatus({
      res,
      apiBaseUrl,
      workspacePath: context.project.root,
      conversationStorePath,
      threadId,
    });
  } else {
    void relayAcpRuntimeEvents({
      req,
      res,
      apiBaseUrl,
      workspacePath: context.project.root,
      conversationStorePath,
    });
  }
  return true;
}
