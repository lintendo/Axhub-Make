import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import type { VoiceAssistantSettings } from './projectCore/voice-assistant-settings.ts';
import {
  buildDoubaoHeaders,
  decodeDoubaoFrame,
  encodeDoubaoJsonEvent,
  testVoiceAssistantConfig,
} from './voiceAssistantConfigTest.ts';

const savedSettings: VoiceAssistantSettings = {
  doubao: {
    appId: 'saved-app',
    accessKey: 'saved-access-key',
    speaker: '',
  },
  processing: {
    baseUrl: 'https://processing.example/v1',
    apiKey: 'saved-key',
    model: 'saved-model',
  },
  vision: {
    endpoint: 'https://vision.example/v1',
    apiKey: 'saved-vision-key',
    model: 'saved-vision-model',
  },
};

class FakeDoubaoSocket extends EventEmitter {
  readonly sentEvents: number[] = [];
  readonly startSessionPayloads: unknown[] = [];
  closeCount = 0;
  terminateCount = 0;

  constructor(private readonly responses: Array<{
    event: number;
    payload?: unknown;
    sessionId?: string;
    messageType?: number;
    errorCode?: number;
  }>) {
    super();
  }

  send(data: Buffer): void {
    const frame = decodeDoubaoFrame(data);
    this.sentEvents.push(frame.event ?? -1);
    if (frame.event === 100) this.startSessionPayloads.push(frame.payload);
    const response = this.responses.shift();
    if (!response) return;
    queueMicrotask(() => {
      this.emit('message', encodeDoubaoJsonEvent(
        response.event,
        response.payload ?? {},
        response.sessionId ?? '',
        {
          messageType: response.messageType ?? 0xb,
          errorCode: response.errorCode,
        },
      ));
    });
  }

  close(): void {
    this.closeCount += 1;
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

describe('voice assistant provider probes', () => {
  it('uses a saved key when the draft leaves it blank', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer saved-key' });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: 'draft-model', temperature: 0 });
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    });

    await expect(testVoiceAssistantConfig({
      body: {
        section: 'processing',
        patch: { processing: { apiKey: '', model: 'draft-model' } },
      },
      savedSettings,
      fetchImpl,
    })).resolves.toEqual({ message: '网页任务配置连接成功' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not fall back or make a request after an explicit clear', async () => {
    const fetchImpl = vi.fn();
    await expect(testVoiceAssistantConfig({
      body: {
        section: 'processing',
        patch: {},
        clearSecrets: ['processing.apiKey'],
      },
      savedSettings,
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves an exact chat/completions endpoint', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://processing.example/v1/chat/completions');
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    });
    await testVoiceAssistantConfig({
      body: {
        section: 'processing',
        patch: { processing: { baseUrl: 'https://processing.example/v1/chat/completions' } },
      },
      savedSettings,
      fetchImpl,
    });
  });

  it('sends a tiny image using OpenAI-compatible multimodal content', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://vision.example/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: 'vision-1', temperature: 0 });
      expect(body.messages[1].content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({ url: expect.stringMatching(/^data:image\/png;base64,/u) }),
        }),
      ]));
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    });
    await expect(testVoiceAssistantConfig({
      body: {
        section: 'vision',
        patch: { vision: { endpoint: 'https://vision.example/v1', model: 'vision-1' } },
      },
      savedSettings,
      fetchImpl,
    })).resolves.toEqual({ message: '视觉配置连接成功' });
  });

  it('rejects missing configuration before making a provider request', async () => {
    const fetchImpl = vi.fn();
    await expect(testVoiceAssistantConfig({
      body: {
        section: 'vision',
        patch: { vision: { endpoint: '', model: '' } },
        clearSecrets: ['vision.apiKey'],
      },
      savedSettings,
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed nested drafts before reusing saved credentials', async () => {
    const fetchImpl = vi.fn();
    await expect(testVoiceAssistantConfig({
      body: {
        section: 'processing',
        patch: { processing: { apiKey: 123 } },
      },
      savedSettings,
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-object section drafts before making a provider request', async () => {
    const fetchImpl = vi.fn();
    await expect(testVoiceAssistantConfig({
      body: {
        section: 'vision',
        patch: { vision: [] },
      },
      savedSettings,
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('redacts active secrets and caps provider errors at 500 characters', async () => {
    const providerDetail = `saved-key:${'x'.repeat(700)}`;
    const fetchImpl = vi.fn(async () => new Response(providerDetail, { status: 401 }));

    const error = await testVoiceAssistantConfig({
      body: { section: 'processing', patch: {} },
      savedSettings,
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ statusCode: 502 });
    expect(String((error as Error).message)).not.toContain('saved-key');
    expect(String((error as Error).message)).toContain('***');
    expect(String((error as Error).message).length).toBeLessThanOrEqual(500);
  });

  it('redacts an active secret before normalizing whitespace', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('provider rejected draft\nkey');
    });
    const error = await testVoiceAssistantConfig({
      body: {
        section: 'processing',
        patch: { processing: { apiKey: 'draft\nkey' } },
      },
      savedSettings,
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(String((error as Error).message)).toContain('***');
    expect(String((error as Error).message)).not.toContain('draft key');
  });

  it('rejects an oversized response without reading it without a bound', async () => {
    const oversized = JSON.stringify({
      choices: [{ message: { content: 'x'.repeat(70_000) } }],
    });
    const fetchImpl = vi.fn(async () => new Response(oversized));

    await expect(testVoiceAssistantConfig({
      body: { section: 'processing', patch: {} },
      savedSettings,
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('Doubao provider probe', () => {
  it('builds the ACP-compatible Doubao authentication headers', () => {
    expect(buildDoubaoHeaders({ appId: 'app', accessKey: 'secret' }, 'connect-id')).toEqual({
      'X-Api-App-ID': 'app',
      'X-Api-Access-Key': 'secret',
      'X-Api-Resource-Id': 'volc.speech.dialog',
      'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
      'X-Api-Connect-Id': 'connect-id',
    });
  });

  it('encodes ACP-compatible gzip JSON frames', () => {
    const encoded = encodeDoubaoJsonEvent(1, {});
    expect([...encoded.subarray(0, 4)]).toEqual([0x11, 0x14, 0x11, 0]);
    expect(encoded.readUInt32BE(4)).toBe(1);
    expect([...encoded.subarray(12, 15)]).toEqual([0x1f, 0x8b, 0x08]);
    expect(decodeDoubaoFrame(encoded)).toMatchObject({ event: 1, payload: {} });
  });

  it('rejects a gzip frame whose decompressed payload exceeds the response bound', () => {
    const encoded = encodeDoubaoJsonEvent(
      150,
      { content: 'x'.repeat(70_000) },
      'session-1',
      { messageType: 0xb },
    );
    expect(() => decodeDoubaoFrame(encoded)).toThrow(/响应|大小|length/iu);
  });

  it('rejects oversized fragmented WebSocket data before decoding it', () => {
    const fragments = [Buffer.alloc(40_000), Buffer.alloc(40_000)];
    expect(() => decodeDoubaoFrame(fragments)).toThrow(/响应帧超过允许大小/u);
  });

  it('requires SessionStarted before the Doubao probe passes', async () => {
    const socket = new FakeDoubaoSocket([
      { event: 50, sessionId: '' },
      { event: 150, sessionId: 'session-1' },
    ]);
    await expect(testVoiceAssistantConfig({
      body: {
        section: 'doubao',
        patch: { doubao: { appId: 'app', accessKey: 'secret' } },
      },
      savedSettings,
      openDoubaoSessionImpl: async () => socket,
    })).resolves.toEqual({ message: '豆包配置连接成功' });
    expect(socket.sentEvents).toEqual([1, 100]);
    expect(socket.startSessionPayloads[0]).toMatchObject({
      tts: { speaker: 'zh_female_vv_jupiter_bigtts' },
    });
    expect(socket.closeCount).toBe(1);
    expect(socket.terminateCount).toBe(1);
  });

  it('redacts Doubao secrets from server error frames and closes the socket', async () => {
    const socket = new FakeDoubaoSocket([{
      event: 51,
      payload: { error: 'credential saved-access-key rejected' },
      sessionId: '',
    }]);

    const error = await testVoiceAssistantConfig({
      body: { section: 'doubao', patch: {} },
      savedSettings,
      openDoubaoSessionImpl: async () => socket,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ statusCode: 502 });
    expect(String((error as Error).message)).toContain('***');
    expect(String((error as Error).message)).not.toContain('saved-access-key');
    expect(socket.closeCount).toBe(1);
  });

  it('applies the timeout budget while opening the Doubao socket', async () => {
    const socket = new FakeDoubaoSocket([
      { event: 50, sessionId: '' },
      { event: 150, sessionId: 'session-1' },
    ]);
    await expect(testVoiceAssistantConfig({
      body: { section: 'doubao', patch: {} },
      savedSettings,
      timeoutMs: 5,
      openDoubaoSessionImpl: async () => new Promise((resolve) => {
        setTimeout(() => resolve(socket), 30);
      }),
    })).rejects.toMatchObject({ statusCode: 504 });
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(socket.closeCount).toBe(1);
    expect(socket.terminateCount).toBe(1);
  });

  it('times out without SessionStarted and closes the socket', async () => {
    const socket = new FakeDoubaoSocket([]);
    await expect(testVoiceAssistantConfig({
      body: { section: 'doubao', patch: {} },
      savedSettings,
      timeoutMs: 5,
      openDoubaoSessionImpl: async () => socket,
    })).rejects.toMatchObject({ statusCode: 504 });
    expect(socket.closeCount).toBe(1);
  });
});
