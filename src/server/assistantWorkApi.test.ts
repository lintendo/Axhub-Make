import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { createCanvasWorkStore } from './assistantWorkStore.ts';
import { createAssistantWorkDispatcher } from './assistantWorkDispatcher.ts';
import { handleAssistantWorkApi } from './assistantWorkApi.ts';

class Response extends EventEmitter {
  statusCode = 200;
  body = '';
  headers = new Map<string, string>();
  setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); }
  end(chunk?: string | Buffer) { if (chunk) this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk; this.emit('finish'); }
  json() { return JSON.parse(this.body); }
}

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = body === undefined ? {} : { 'content-type': 'application/json' };
  if (body !== undefined) queueMicrotask(() => { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  return req;
}

describe('assistant work API', () => {
  it('creates a Canvas Work idempotently and returns 202', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'assistant-work-api-test-'));
    const store = createCanvasWorkStore({ projectRoot, projectId: 'project-1' });
    const dispatcher = createAssistantWorkDispatcher({ store, acp: {
      createThread: vi.fn(async () => ({ threadId: 'thread-1' })),
      createRun: vi.fn(async () => ({ runId: 'run-1' })),
      queryRuntime: vi.fn(async () => ({ runState: 'running' })),
      subscribeRuntime: vi.fn(() => ({ abort: vi.fn(), done: Promise.resolve(undefined) })),
      abortRun: vi.fn(async () => undefined),
    } });
    const response = new Response();
    const handled = await handleAssistantWorkApi(request('POST', '/api/assistant-work?projectId=project-1', {
      kind: 'canvas', operationId: 'create-1', resourcePath: 'flows/home.excalidraw', objective: '补全流程', baseRevision: 'revision-1',
    }), response as unknown as ServerResponse, {
      projectId: 'project-1',
    }, { store, dispatcher });
    expect(handled).toBe(true);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ kind: 'canvas', status: 'queued', resourcePath: 'flows/home.excalidraw' });
    await dispatcher.stop();
  });

  it('rejects unsafe paths before touching the store', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'assistant-work-api-test-unsafe-'));
    const store = createCanvasWorkStore({ projectRoot, projectId: 'project-1' });
    const create = vi.spyOn(store, 'create');
    const response = new Response();
    await handleAssistantWorkApi(request('POST', '/api/assistant-work?projectId=project-1', {
      kind: 'canvas', operationId: 'create-1', resourcePath: '../secret.excalidraw', objective: 'bad', baseRevision: 'r1',
    }), response as unknown as ServerResponse, { projectId: 'project-1' }, { store });
    expect(response.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
