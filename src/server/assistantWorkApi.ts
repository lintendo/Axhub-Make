import type { IncomingMessage, ServerResponse } from 'node:http';

import { getRequestUrl, readJsonBody, sendJson } from './http.ts';
import {
  AssistantWorkDispatcherError,
  assistantWorkSnapshotFromRecord,
  type AssistantWorkDispatcher,
} from './assistantWorkDispatcher.ts';
import {
  CanvasWorkStoreError,
  normalizeCanvasWorkResourcePath,
  type CanvasWorkStore,
} from './assistantWorkStore.ts';

const ASSISTANT_WORK_PATH = '/api/assistant-work';
const ASSISTANT_WORK_EVENTS_PATH = '/api/assistant-work/events';

export interface AssistantWorkApiContext {
  projectId: string;
}

export interface AssistantWorkApiDeps {
  store: CanvasWorkStore;
  dispatcher?: AssistantWorkDispatcher;
  ready?: Promise<void>;
  resolveResourceForWork?: (workId: string) => Promise<string | null>;
}

function text(value: unknown, maximum = 8_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function bad(res: ServerResponse, message: string, code = 'INVALID_ASSISTANT_WORK_REQUEST', status = 400): void {
  sendJson(res, { error: message, code }, { status });
}

function resourceFromQuery(req: IncomingMessage): string | null {
  return normalizeCanvasWorkResourcePath(getRequestUrl(req).searchParams.get('resourcePath'));
}

async function resolveResource(req: IncomingMessage, workId: string, deps: AssistantWorkApiDeps): Promise<string | null> {
  return resourceFromQuery(req) || await deps.resolveResourceForWork?.(workId) || null;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(req);
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function matchWorkPath(pathname: string): { workId: string; action?: 'follow-ups' | 'cancel' } | null {
  const match = pathname.match(/^\/api\/assistant-work\/([^/]+)(?:\/(follow-ups|cancel))?$/u);
  if (!match) return null;
  try {
    return { workId: decodeURIComponent(match[1]), action: match[2] as 'follow-ups' | 'cancel' | undefined };
  } catch {
    return null;
  }
}

export async function handleAssistantWorkApi(
  req: IncomingMessage,
  res: ServerResponse,
  context: AssistantWorkApiContext,
  deps: AssistantWorkApiDeps,
): Promise<boolean> {
  const url = getRequestUrl(req);
  if (url.pathname !== ASSISTANT_WORK_PATH && url.pathname !== ASSISTANT_WORK_EVENTS_PATH && !url.pathname.startsWith(`${ASSISTANT_WORK_PATH}/`)) return false;
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (!context.projectId) {
    bad(res, 'Project context is required.', 'PROJECT_CONTEXT_REQUIRED', 409);
    return true;
  }

  try {
    if (deps.ready) await deps.ready;
    if (url.pathname === ASSISTANT_WORK_PATH && req.method === 'POST') {
      const body = await readBody(req);
      if (body.projectId && text(body.projectId, 256) !== context.projectId) {
        bad(res, 'Project context cannot be overridden.', 'PROJECT_CONTEXT_MISMATCH', 403);
        return true;
      }
      if (body.kind !== 'canvas') {
        bad(res, 'Only Canvas assistant work is supported by this API.', 'UNSUPPORTED_WORK_KIND', 400);
        return true;
      }
      const resourcePath = normalizeCanvasWorkResourcePath(body.resourcePath);
      const operationId = text(body.operationId, 256);
      const objective = text(body.objective, 8_000);
      const baseRevision = text(body.baseRevision, 256);
      if (!resourcePath || !operationId || !objective || !baseRevision) {
        bad(res, 'resourcePath, operationId, objective and baseRevision are required.');
        return true;
      }
      const work = await deps.store.create({ resourcePath, operationId, objective, baseRevision });
      if (deps.dispatcher) {
        void deps.dispatcher.start(work).catch(() => undefined);
      }
      sendJson(res, assistantWorkSnapshotFromRecord(work), { status: 202 });
      return true;
    }

    if ((url.pathname === ASSISTANT_WORK_PATH || url.pathname === ASSISTANT_WORK_EVENTS_PATH) && req.method === 'GET') {
      const resourcePath = resourceFromQuery(req);
      if (!resourcePath) {
        bad(res, 'A valid resourcePath is required.', 'INVALID_RESOURCE_PATH');
        return true;
      }
      const listed = await deps.store.list(resourcePath, {
        cursor: url.searchParams.get('cursor') || undefined,
        limit: Number(url.searchParams.get('limit') || 20),
      });
      const snapshots = listed.works.map(assistantWorkSnapshotFromRecord);
      if (url.pathname === ASSISTANT_WORK_EVENTS_PATH) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(`event: snapshot\ndata: ${JSON.stringify({ snapshots, nextCursor: listed.nextCursor })}\n\n`);
        return true;
      }
      sendJson(res, { works: snapshots, total: listed.total, nextCursor: listed.nextCursor });
      return true;
    }

    const matched = matchWorkPath(url.pathname);
    if (!matched || req.method !== 'GET' && req.method !== 'POST') {
      bad(res, 'Assistant Work route not found.', 'WORK_NOT_FOUND', 404);
      return true;
    }
    const resourcePath = await resolveResource(req, matched.workId, deps);
    if (!resourcePath) {
      bad(res, 'A valid resourcePath is required for this Work.', 'INVALID_RESOURCE_PATH');
      return true;
    }
    const current = await deps.store.findByWorkId(resourcePath, matched.workId);
    if (!current) {
      bad(res, 'Canvas work was not found.', 'WORK_NOT_FOUND', 404);
      return true;
    }
    if (!matched.action && req.method === 'GET') {
      sendJson(res, assistantWorkSnapshotFromRecord(current));
      return true;
    }
    if (!deps.dispatcher) {
      bad(res, 'Assistant Work dispatcher is unavailable.', 'ACP_RUN_REJECTED', 503);
      return true;
    }
    const body = await readBody(req);
    if (matched.action === 'follow-ups' && req.method === 'POST') {
      const snapshot = await deps.dispatcher.followUp(resourcePath, matched.workId, {
        operationId: text(body.operationId, 256),
        content: text(body.content, 4_000),
        baseRevision: text(body.baseRevision, 256),
      });
      sendJson(res, snapshot, { status: 202 });
      return true;
    }
    if (matched.action === 'cancel' && req.method === 'POST') {
      const snapshot = await deps.dispatcher.cancel(resourcePath, matched.workId, text(body.operationId, 256));
      sendJson(res, snapshot);
      return true;
    }
    bad(res, 'Assistant Work route not found.', 'WORK_NOT_FOUND', 404);
    return true;
  } catch (error) {
    const code = error instanceof AssistantWorkDispatcherError || error instanceof CanvasWorkStoreError ? error.code : 'ASSISTANT_WORK_FAILED';
    const status = code === 'WORK_NOT_FOUND' ? 404 : code === 'WORK_FOLLOW_UP_ALREADY_QUEUED' ? 409 : 400;
    bad(res, error instanceof Error ? error.message : 'Assistant Work request failed.', code, status);
    return true;
  }
}
