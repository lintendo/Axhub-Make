import { createServer, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

const upstreamServers: Server[] = [];

async function startRuntimeEventsServer() {
  const requests: URL[] = [];
  const server = createServer((req, res) => {
    const address = server.address();
    const origin = address && typeof address !== 'string'
      ? `http://127.0.0.1:${address.port}`
      : 'http://127.0.0.1';
    requests.push(new URL(String(req.url || '/'), origin));
    if (req.url?.startsWith('/api/conversations/runtime/events')) {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.write('event: snapshot\n');
      res.end('data: {"statuses":[]}\n\n');
      return;
    }
    if (req.url?.startsWith('/api/conversations/thread-1/runtime')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        threadId: 'thread-1',
        provider: 'codex',
        workspacePath: '/upstream-workspace',
        metadata: { runState: 'completed' },
        lastUsedAt: 123,
      }));
      return;
    }
    res.writeHead(404).end();
  });
  upstreamServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing upstream address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
  };
}

afterEach(async () => {
  for (const server of upstreamServers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  cleanupProjectApiTestRoots();
});

describe('ACP runtime events API', () => {
  it('relays the runtime stream with server-owned project scope', async () => {
    const projectRoot = createTempRoot('axhub-acp-runtime-events-project-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'project-a', name: 'Project A' },
    });
    const upstream = await startRuntimeEventsServer();
    const make = await startTestServer(projectRoot, {
      serverConfig: {
        assistant: {
          webBaseUrl: upstream.origin,
          apiBaseUrl: `${upstream.origin}/api`,
        },
      },
    });
    await registerProject(make.origin, projectRoot, 'project-a', 'Project A');

    try {
      const response = await fetch(
        `${make.origin}/api/acp/conversations/runtime/events?projectId=project-a&targetPath=prototypes%2Fhome&apiBaseUrl=http%3A%2F%2Fevil.invalid%2Fapi&workspacePath=%2Fevil&conversationStorePath=%2Fevil%2Fconversations.json`,
        { headers: { Accept: 'text/event-stream' } },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(await response.text()).toBe('event: snapshot\ndata: {"statuses":[]}\n\n');
      expect(upstream.requests).toHaveLength(1);
      expect(upstream.requests[0]?.pathname).toBe('/api/conversations/runtime/events');
      expect(upstream.requests[0]?.searchParams.get('workspacePath')).toBe(projectRoot);
      expect(upstream.requests[0]?.searchParams.get('conversationStorePath')).toBe(
        `${projectRoot}/src/prototypes/home/.spec/acp/conversations.json`,
      );
      expect(upstream.requests[0]?.searchParams.has('apiBaseUrl')).toBe(false);
    } finally {
      await make.close();
    }
  });

  it('requires an explicit registered project', async () => {
    const projectRoot = createTempRoot('axhub-acp-runtime-events-required-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'project-required', name: 'Project Required' },
    });
    const upstream = await startRuntimeEventsServer();
    const make = await startTestServer(projectRoot, {
      serverConfig: {
        assistant: {
          webBaseUrl: upstream.origin,
          apiBaseUrl: `${upstream.origin}/api`,
        },
      },
    });

    try {
      const response = await fetch(`${make.origin}/api/acp/conversations/runtime/events`);
      expect(response.status).toBe(400);
      expect(upstream.requests).toHaveLength(0);
    } finally {
      await make.close();
    }
  });

  it('relays durable conversation runtime with the same server-owned scope', async () => {
    const projectRoot = createTempRoot('axhub-acp-runtime-status-project-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'project-status', name: 'Project Status' },
    });
    const upstream = await startRuntimeEventsServer();
    const make = await startTestServer(projectRoot, {
      serverConfig: {
        assistant: {
          webBaseUrl: upstream.origin,
          apiBaseUrl: `${upstream.origin}/api`,
        },
      },
    });
    await registerProject(make.origin, projectRoot, 'project-status', 'Project Status');

    try {
      const response = await fetch(
        `${make.origin}/api/acp/conversations/runtime/status?projectId=project-status&targetPath=prototypes%2Fhome&threadId=thread-1&workspacePath=%2Fevil&conversationStorePath=%2Fevil`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(await response.json()).toMatchObject({
        threadId: 'thread-1',
        metadata: { runState: 'completed' },
      });
      const request = upstream.requests.at(-1);
      expect(request?.pathname).toBe('/api/conversations/thread-1/runtime');
      expect(request?.searchParams.get('workspacePath')).toBe(projectRoot);
      expect(request?.searchParams.get('conversationStorePath')).toBe(
        `${projectRoot}/src/prototypes/home/.spec/acp/conversations.json`,
      );
    } finally {
      await make.close();
    }
  });
});
