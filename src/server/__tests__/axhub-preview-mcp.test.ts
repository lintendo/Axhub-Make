import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewBridgeError } from '../previewBridge.ts';
import {
  AXHUB_PREVIEW_MCP_PATH,
  AXHUB_PREVIEW_BRIDGE_CLIENT_ID_HEADER,
  AXHUB_PREVIEW_MCP_TOKEN_HEADER,
  AXHUB_PREVIEW_VOICE_TOOLS_HEADER,
  handleAxhubPreviewMcp,
} from '../axhubPreviewMcp.ts';

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
  request.url = AXHUB_PREVIEW_MCP_PATH;
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
  bridgeClientId?: string;
  voiceTools?: boolean;
  bridgeHub?: MockBridgeHub;
  captureOutputRoot?: string;
} = {}) {
  const response = new MockResponse();
  const headers: Record<string, string> = {};
  if (options.headerToken !== undefined) {
    headers[AXHUB_PREVIEW_MCP_TOKEN_HEADER] = options.headerToken;
  }
  if (options.bridgeClientId !== undefined) {
    headers[AXHUB_PREVIEW_BRIDGE_CLIENT_ID_HEADER] = options.bridgeClientId;
  }
  if (options.voiceTools === true) {
    headers[AXHUB_PREVIEW_VOICE_TOOLS_HEADER] = '1';
  }
  const request = createRequest(body, headers);

  const handled = await handleAxhubPreviewMcp(request, response as unknown as ServerResponse, {
    token: options.token ?? 'secret-token',
    bridgeHub: options.bridgeHub ?? { sendCommand: vi.fn(async () => ({})) },
    ...(options.captureOutputRoot ? { captureOutputRoot: options.captureOutputRoot } : {}),
  });

  return { handled, response, json: response.body ? response.json() : null };
}

describe('axhub preview MCP endpoint', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-preview-mcp-'));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('rejects requests without the Make-generated preview token header', async () => {
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

  it('lists preview browser tools including navigation and capture schemas', async () => {
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
      'preview_get_current',
      'preview_navigate',
      'preview_capture',
      'preview_get_last_diagnostics',
    ]);
    expect(json.result.tools[1].inputSchema).toMatchObject({
      type: 'object',
      properties: {
        target: {
          type: 'object',
          properties: {
            resourceType: {
              enum: ['prototype', 'canvas', 'doc', 'theme'],
            },
            resourceId: { type: 'string' },
            pageId: { type: 'string' },
            collapseSidebar: { type: 'boolean' },
          },
          required: ['resourceType', 'resourceId'],
        },
      },
    });
    expect(json.result.tools[2].inputSchema).toMatchObject({
      type: 'object',
      properties: {
        target: expect.any(Object),
        viewports: expect.any(Object),
        outputPath: {
          type: 'string',
        },
        outputDir: {
          type: 'string',
        },
        waitSeconds: {
          type: 'number',
          minimum: 0,
          maximum: 30,
        },
      },
    });
  });

  it('exposes all confirmation-free Chinese tools to an opted-in inner run', async () => {
    const sendCommand = vi.fn(async () => ({ elements: [], nextCursor: null }));
    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'voice-tools',
      method: 'tools/list',
    }, {
      headerToken: 'secret-token',
      voiceTools: true,
    });

    const voiceTools = json.result.tools.slice(4);
    expect(voiceTools.map((tool: any) => tool.name)).toEqual([
      'axhub_make_capture_page',
      'axhub_make_get_page_target',
      'axhub_make_find_page_elements',
      'axhub_make_get_page_structure',
      'axhub_make_activate_page_element',
      'axhub_make_create_comment',
      'axhub_make_apply_page_change',
      'axhub_make_list_comments',
      'axhub_make_execute_comment',
      'axhub_make_get_comment_execution',
      'axhub_make_cancel_comment_execution',
      'axhub_make_delete_comment',
    ]);
    expect(voiceTools.every((tool: any) => /[\u3400-\u9fff]/u.test(tool.description))).toBe(true);
    expect(JSON.stringify(voiceTools)).not.toMatch(/"targetId"|"taskId"|"prompt"/u);

    await callMcp({
      jsonrpc: '2.0',
      id: 'voice-find',
      method: 'tools/call',
      params: {
        name: 'axhub_make_find_page_elements',
        arguments: { text: '保存', requestId: 'voice-request-1' },
      },
    }, {
      headerToken: 'secret-token',
      bridgeClientId: 'preview-voice',
      voiceTools: true,
      bridgeHub: { sendCommand },
    });

    expect(sendCommand).toHaveBeenCalledWith('axhub_make_find_page_elements', {
      text: '保存',
    }, {
      requestId: 'voice-request-1',
      clientId: 'preview-voice',
    });

    const denied = await callMcp({
      jsonrpc: '2.0',
      id: 'voice-create-denied',
      method: 'tools/call',
      params: {
        name: 'axhub_make_create_comment',
        arguments: { targetRef: 'page.1.1', content: '提高对比度' },
      },
    }, {
      headerToken: 'secret-token',
      bridgeClientId: 'preview-voice',
      voiceTools: true,
      bridgeHub: { sendCommand },
    });
    expect(denied.json.error).toMatchObject({ code: -32602 });
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it('routes navigation calls to the preview bridge without capture file persistence', async () => {
    const sendCommand = vi.fn(async () => ({
      navigated: true,
      current: {
        projectId: 'make-project',
        resourceType: 'canvas',
        resourceId: 'home',
        contentMode: 'canvas',
        viewMode: 'canvas',
        url: 'http://localhost:5174/?p=home&v=canvas',
      },
      screenshots: [{
        viewportId: 'desktop',
        dataUrl: 'data:image/png;base64,c2hvdWxkLW5vdC1iZS13cml0dGVu',
      }],
    }));

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'navigate',
      method: 'tools/call',
      params: {
        name: 'preview_navigate',
        arguments: {
          target: {
            resourceType: 'canvas',
            resourceId: 'home',
          },
          requestId: 'navigate-request',
          timeoutMs: 4321,
          outputDir: tempDir,
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
      captureOutputRoot: tempDir,
    });

    expect(sendCommand).toHaveBeenCalledWith('preview_navigate', {
      target: {
        resourceType: 'canvas',
        resourceId: 'home',
      },
    }, {
      requestId: 'navigate-request',
      timeoutMs: 4321,
    });
    const payload = JSON.parse(json.result.content[0].text);
    expect(payload).toMatchObject({
      ok: true,
      payload: {
        navigated: true,
        current: {
          resourceType: 'canvas',
          resourceId: 'home',
        },
        screenshots: [{
          dataUrl: 'data:image/png;base64,c2hvdWxkLW5vdC1iZS13cml0dGVu',
        }],
      },
    });
    expect(fs.readdirSync(tempDir)).toEqual([]);
  });

  it('forwards the requested preview bridge client id from the MCP request header', async () => {
    const sendCommand = vi.fn(async () => ({
      current: {
        resourceType: 'prototype',
        resourceId: 'home',
      },
    }));

    await callMcp({
      jsonrpc: '2.0',
      id: 'targeted-current',
      method: 'tools/call',
      params: {
        name: 'preview_get_current',
        arguments: {
          requestId: 'targeted-request',
          timeoutMs: 1234,
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeClientId: 'preview-2',
      bridgeHub: { sendCommand },
    });

    expect(sendCommand).toHaveBeenCalledWith('preview_get_current', {}, {
      requestId: 'targeted-request',
      timeoutMs: 1234,
      clientId: 'preview-2',
    });
  });

  it('routes current context calls to the preview bridge', async () => {
    const sendCommand = vi.fn(async () => ({
      current: {
        resourceType: 'prototype',
        resourceId: 'home',
        url: 'http://localhost:5174/prototypes/home',
        viewMode: 'demo',
      },
    }));

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'call-current',
      method: 'tools/call',
      params: {
        name: 'preview_get_current',
        arguments: {
          requestId: 'tool-request',
          timeoutMs: 1234,
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
    });

    expect(sendCommand).toHaveBeenCalledWith('preview_get_current', {}, {
      requestId: 'tool-request',
      timeoutMs: 1234,
    });
    expect(json.result).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          payload: {
            current: {
              resourceType: 'prototype',
              resourceId: 'home',
              url: 'http://localhost:5174/prototypes/home',
              viewMode: 'demo',
            },
          },
        }),
      }],
    });
  });

  it('writes preview captures to local files and returns only file path metadata', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const sendCommand = vi.fn(async () => ({
      target: {
        kind: 'url',
        url: 'http://localhost:5174/prototypes/home',
      },
      screenshots: [{
        viewportId: 'desktop',
        width: 1440,
        height: 900,
        mimeType: 'image/png',
        dataUrl,
      }],
      diagnostics: [],
    }));

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'capture',
      method: 'tools/call',
      params: {
        name: 'preview_capture',
        arguments: {
          target: { url: '/prototypes/home' },
          viewports: ['desktop'],
          waitSeconds: 0.75,
          outputDir: tempDir,
          requestId: 'capture-request',
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
      captureOutputRoot: tempDir,
    });

    expect(sendCommand).toHaveBeenCalledWith('preview_capture', {
      target: { url: '/prototypes/home' },
      viewports: ['desktop'],
      waitSeconds: 0.75,
    }, {
      requestId: 'capture-request',
    });
    expect(json.result.content).toHaveLength(1);
    expect(json.result.content[0].type).toBe('text');
    expect(json.result.content[0].text).not.toContain('base64');
    expect(json.result.content[0].text).not.toContain('iVBORw0KGgo');

    const payload = JSON.parse(json.result.content[0].text);
    expect(payload).toMatchObject({
      ok: true,
      payload: {
        target: {
          kind: 'url',
          url: 'http://localhost:5174/prototypes/home',
        },
        screenshots: [{
          viewportId: 'desktop',
          width: 1440,
          height: 900,
          mimeType: 'image/png',
        }],
        diagnostics: [],
      },
    });

    const filePath = payload.payload.screenshots[0].filePath;
    expect(filePath).toEqual(expect.stringMatching(/desktop\.png$/u));
    expect(path.dirname(filePath)).toBe(tempDir);
    expect(fs.readFileSync(filePath)).toEqual(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64'));
  });

  it('adds viewport suffixes when a single outputPath is used for multiple captures', async () => {
    const outputPath = path.join(tempDir, 'preview.png');
    const sendCommand = vi.fn(async () => ({
      target: { kind: 'current', url: 'http://localhost:5174/prototypes/home' },
      screenshots: [
        {
          viewportId: 'mobile',
          width: 393,
          height: 852,
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,bW9iaWxl',
        },
        {
          viewportId: 'desktop',
          width: 1440,
          height: 900,
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,ZGVza3RvcA==',
        },
      ],
      diagnostics: [],
    }));

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'multi-capture',
      method: 'tools/call',
      params: {
        name: 'preview_capture',
        arguments: {
          viewports: ['mobile', 'desktop'],
          outputPath,
        },
      },
    }, {
      headerToken: 'secret-token',
      bridgeHub: { sendCommand },
      captureOutputRoot: tempDir,
    });

    const payload = JSON.parse(json.result.content[0].text);
    expect(payload.payload.screenshots.map((entry: any) => entry.filePath)).toEqual([
      path.join(tempDir, 'preview-mobile.png'),
      path.join(tempDir, 'preview-desktop.png'),
    ]);
    expect(fs.readFileSync(path.join(tempDir, 'preview-mobile.png'), 'utf8')).toBe('mobile');
    expect(fs.readFileSync(path.join(tempDir, 'preview-desktop.png'), 'utf8')).toBe('desktop');
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('returns a tool error payload when no preview host is connected', async () => {
    const sendCommand = vi.fn(async () => {
      throw new PreviewBridgeError('preview_not_connected', 'No browser preview host is connected.');
    });

    const { json } = await callMcp({
      jsonrpc: '2.0',
      id: 'call-error',
      method: 'tools/call',
      params: {
        name: 'preview_capture',
        arguments: {},
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
            code: 'preview_not_connected',
            message: 'No browser preview host is connected.',
          },
        }),
      }],
    });
  });
});
