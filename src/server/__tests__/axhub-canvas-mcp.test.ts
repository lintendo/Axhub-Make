import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { CanvasBridgeError } from '../canvasBridge.ts';
import {
  AXHUB_CANVAS_MCP_PATH,
  AXHUB_CANVAS_MCP_TOKEN_HEADER,
  handleAxhubCanvasMcp,
} from '../axhubCanvasMcp.ts';

type MockBridgeHub = {
  sendCommand: (command: string, payload: unknown, options?: unknown) => Promise<unknown>;
};

class MockResponse extends EventEmitter {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  body = '';

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(chunk?: string | Buffer): void {
    if (chunk) this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
    this.emit('finish');
  }

  json(): any {
    return JSON.parse(this.body);
  }
}

function createRequest(body: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage;
  request.method = 'POST';
  request.url = AXHUB_CANVAS_MCP_PATH;
  request.headers = headers;
  queueMicrotask(() => {
    request.emit('data', Buffer.from(JSON.stringify(body), 'utf8'));
    request.emit('end');
  });
  return request;
}

async function callMcp(body: unknown, options: {
  token?: string;
  headerToken?: string;
  bridgeHub?: MockBridgeHub;
} = {}) {
  const response = new MockResponse();
  const request = createRequest(body, options.headerToken === undefined ? {} : {
    [AXHUB_CANVAS_MCP_TOKEN_HEADER]: options.headerToken,
  });

  const handled = await handleAxhubCanvasMcp(request, response as unknown as ServerResponse, {
    token: options.token ?? 'secret-token',
    bridgeHub: options.bridgeHub ?? { sendCommand: vi.fn(async () => ({})) },
  });

  return { handled, response, json: response.body ? response.json() : null };
}

describe('axhub canvas MCP endpoint', () => {
  it('rejects requests without the Make-generated token header', async () => {
    const { handled, response, json } = await callMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(handled).toBe(true);
    expect(response.statusCode).toBe(401);
    expect(json).toMatchObject({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized',
      },
    });
  });

  it('lists the axhub canvas MCP tools and their input schemas', async () => {
    const { response, json } = await callMcp({
      jsonrpc: '2.0',
      id: 'tools',
      method: 'tools/list',
    }, {
      headerToken: 'secret-token',
    });

    expect(response.statusCode).toBe(200);
    expect(json.id).toBe('tools');
    expect(json.result.tools.map((tool: any) => tool.name)).toEqual([
      'canvas_get_state',
      'canvas_checkpoint',
      'canvas_insert_elements',
      'canvas_insert_mermaid',
      'canvas_refresh',
      'canvas_capture',
      'canvas_update_elements',
      'canvas_delete_elements',
      'canvas_focus',
    ]);
    expect(json.result.tools[0].inputSchema).toMatchObject({
      type: 'object',
      properties: expect.any(Object),
    });
    const mermaidTool = json.result.tools.find((tool: any) => tool.name === 'canvas_insert_mermaid');
    expect(mermaidTool).toMatchObject({
      description: expect.stringContaining('Mermaid'),
      inputSchema: {
        type: 'object',
      },
    });
    expect(mermaidTool.inputSchema.properties.mermaidCode.type).toBe('string');
    expect(mermaidTool.inputSchema.properties.position.oneOf).toEqual(expect.any(Array));
    expect(mermaidTool.inputSchema.properties.themeVariables.type).toBe('object');
    expect(mermaidTool.inputSchema.properties.flowchart.type).toBe('object');
  });

  it('accepts MCP initialized notifications without a JSON-RPC response body', async () => {
    const { response, json } = await callMcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, {
      headerToken: 'secret-token',
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toBe('');
    expect(json).toBeNull();
  });

  it('routes tool calls to the canvas bridge and returns MCP text content', async () => {
    const sendCommand = vi.fn(async () => ({
      canvasName: 'resources/flows/home.excalidraw',
      selectedElementIds: [],
    }));

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: {
        name: 'canvas_get_state',
        arguments: {
          canvasName: 'resources/flows/home.excalidraw',
          includeElements: true,
          timeoutMs: 1234,
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
    });

    expect(sendCommand).toHaveBeenCalledWith('canvas_get_state', {
      includeElements: true,
    }, {
      canvasName: 'resources/flows/home.excalidraw',
      timeoutMs: 1234,
    });
    expect(json.result).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          payload: {
            canvasName: 'resources/flows/home.excalidraw',
            selectedElementIds: [],
          },
        }),
      }],
    });
  });

  it('routes Mermaid insertion tool calls to the canvas bridge', async () => {
    const sendCommand = vi.fn(async () => ({
      insertedElementIds: ['node-a', 'node-b'],
    }));

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'call-mermaid',
      method: 'tools/call',
      params: {
        name: 'canvas_insert_mermaid',
        arguments: {
          canvasName: 'resources/flows/home.excalidraw',
          expectedRevision: 'revision-1',
          requestId: 'tool-request',
          mermaidCode: 'flowchart TD\n  A --> B',
          position: { x: 120, y: 240 },
          themeVariables: { fontSize: '20px' },
          flowchart: { curve: 'linear' },
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
    });

    expect(sendCommand).toHaveBeenCalledWith('canvas_insert_mermaid', {
      expectedRevision: 'revision-1',
      mermaidCode: 'flowchart TD\n  A --> B',
      position: { x: 120, y: 240 },
      themeVariables: { fontSize: '20px' },
      flowchart: { curve: 'linear' },
    }, {
      canvasName: 'resources/flows/home.excalidraw',
      requestId: 'tool-request',
    });
    expect(json.result).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          payload: {
            insertedElementIds: ['node-a', 'node-b'],
          },
        }),
      }],
    });
  });

  it('returns a tool error payload when no canvas tab is connected', async () => {
    const sendCommand = vi.fn(async () => {
      throw new CanvasBridgeError('canvas_not_connected', 'No browser canvas tab is connected.');
    });

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'call-2',
      method: 'tools/call',
      params: {
          name: 'canvas_capture',
        arguments: { scope: 'viewport' },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
    });

    expect(json.result).toEqual({
      isError: true,
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: {
            code: 'canvas_not_connected',
            message: 'No browser canvas tab is connected.',
          },
        }),
      }],
    });
  });

  it('rejects persistent mutations without revision and request id', async () => {
    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'missing-revision',
      method: 'tools/call',
      params: { name: 'canvas_delete_elements', arguments: { elementIds: ['node-a'] } },
    }, { headerToken: 'secret-token' });
    expect(json.error).toMatchObject({ data: { code: 'CANVAS_REVISION_CONFLICT' } });
  });

  it('returns a JSON-RPC error for invalid tool calls instead of closing the request', async () => {
    const { response, json } = await callMcp({
      jsonrpc: '2.0',
      id: 'bad-call',
      method: 'tools/call',
      params: {
        arguments: {},
      },
    }, {
      headerToken: 'secret-token',
    });

    expect(response.statusCode).toBe(200);
    expect(json).toEqual({
      jsonrpc: '2.0',
      id: 'bad-call',
      error: {
        code: -32602,
        message: 'tools/call params must include a tool name.',
        data: {
          code: 'invalid_tool_call',
        },
      },
    });
  });
});
