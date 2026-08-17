import { randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import WebSocket, { type RawData } from 'ws';

import type {
  VoiceAssistantSecretPath,
  VoiceAssistantSettings,
  VoiceAssistantSettingsPatch,
} from './projectCore/voice-assistant-settings.ts';
import { mergeVoiceAssistantSettingsPatch } from './projectCore/voice-assistant-settings.ts';

export type VoiceAssistantTestSection = 'doubao' | 'processing' | 'vision';

export interface DoubaoProbeSocket {
  on(event: 'message', listener: (data: RawData) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  off(event: 'message', listener: (data: RawData) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'close', listener: () => void): unknown;
  send(data: Buffer): void;
  close(): void;
  terminate?: () => void;
}

export type DoubaoSessionProbe = (options: {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
}) => Promise<DoubaoProbeSocket>;

export class VoiceAssistantConfigTestError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = 'VoiceAssistantConfigTestError';
  }
}

const MAX_PUBLIC_ERROR_CHARACTERS = 500;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const MAX_DOUBAO_FRAME_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_DOUBAO_SPEAKER = 'zh_female_vv_jupiter_bigtts';
const DOUBAO_REALTIME_APP_KEY = 'PlgvMymc7f3tQnJ6';
const DOUBAO_REALTIME_RESOURCE_ID = 'volc.speech.dialog';
const DOUBAO_REALTIME_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const SECRET_PATHS = new Set<VoiceAssistantSecretPath>([
  'doubao.accessKey',
  'processing.apiKey',
  'vision.apiKey',
]);
const DOUBAO_EVENTS = Object.freeze({
  StartConnection: 1,
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  StartSession: 100,
  SessionStarted: 150,
  SessionFailed: 153,
  DialogCommonError: 599,
});
const DOUBAO_MESSAGE_TYPES = Object.freeze({
  ClientFullRequest: 0x1,
  ServerFullResponse: 0x9,
  ServerAck: 0xb,
  ServerError: 0xf,
});
const DOUBAO_FLAG_WITH_EVENT = 0x4;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '连接测试失败';
}

function sanitizeErrorWithSecrets(error: unknown, secrets: readonly string[]): string {
  let message = rawErrorMessage(error);
  for (const secret of [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length)) {
    message = message.split(secret).join('***');
  }
  message = message
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return (message || '连接测试失败').slice(0, MAX_PUBLIC_ERROR_CHARACTERS);
}

export function sanitizeVoiceAssistantTestError(error: unknown): string {
  return sanitizeErrorWithSecrets(error, []);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

export function encodeDoubaoJsonEvent(
  event: number,
  payload: unknown,
  sessionId?: string,
  options: { messageType?: number; errorCode?: number } = {},
): Buffer {
  const messageType = options.messageType ?? DOUBAO_MESSAGE_TYPES.ClientFullRequest;
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const parts = [
    Buffer.from([0x11, (messageType << 4) | DOUBAO_FLAG_WITH_EVENT, 0x11, 0]),
    uint32(event),
  ];
  if (messageType === DOUBAO_MESSAGE_TYPES.ServerError) {
    parts.push(uint32(options.errorCode ?? 0));
  } else if (sessionId !== undefined) {
    const encodedSessionId = Buffer.from(sessionId, 'utf8');
    parts.push(uint32(encodedSessionId.length), encodedSessionId);
  }
  parts.push(uint32(compressed.length), compressed);
  return Buffer.concat(parts);
}

function readFrameUint32(frame: Buffer, offset: number, label: string): number {
  if (offset + 4 > frame.length) throw new Error(`豆包响应帧读取 ${label} 时被截断`);
  return frame.readUInt32BE(offset);
}

function rawDataBuffer(value: RawData | Buffer): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.byteLength > MAX_DOUBAO_FRAME_BYTES) throw new Error('豆包响应帧超过允许大小');
    return value;
  }
  if (value instanceof ArrayBuffer) {
    if (value.byteLength > MAX_DOUBAO_FRAME_BYTES) throw new Error('豆包响应帧超过允许大小');
    return Buffer.from(value);
  }
  let totalBytes = 0;
  for (const chunk of value) {
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_DOUBAO_FRAME_BYTES) throw new Error('豆包响应帧超过允许大小');
  }
  return Buffer.concat(value);
}

export function decodeDoubaoFrame(value: RawData | Buffer): {
  messageType: number;
  event: number | null;
  sessionId: string | null;
  payload: unknown;
  errorCode: number | null;
} {
  const frame = rawDataBuffer(value);
  if (frame.length < 4) throw new Error('豆包响应帧被截断');
  if (frame.length > MAX_PROVIDER_RESPONSE_BYTES + 1024) {
    throw new Error('豆包响应帧超过允许大小');
  }
  const version = frame[0] >> 4;
  const headerSize = frame[0] & 0x0f;
  if (version !== 1 || headerSize < 1) throw new Error('豆包响应帧头无效');
  let offset = headerSize * 4;
  if (offset > frame.length) throw new Error('豆包响应帧被截断');
  const messageType = frame[1] >> 4;
  const flags = frame[1] & 0x0f;
  const serialization = frame[2] >> 4;
  const compression = frame[2] & 0x0f;
  if (flags & 0x3) {
    readFrameUint32(frame, offset, 'sequence');
    offset += 4;
  }
  let event: number | null = null;
  if (flags & DOUBAO_FLAG_WITH_EVENT) {
    event = readFrameUint32(frame, offset, 'event');
    offset += 4;
  }
  let errorCode: number | null = null;
  let sessionId: string | null = null;
  if (messageType === DOUBAO_MESSAGE_TYPES.ServerError) {
    errorCode = readFrameUint32(frame, offset, 'error code');
    offset += 4;
  } else if (
    messageType === DOUBAO_MESSAGE_TYPES.ServerFullResponse
    || messageType === DOUBAO_MESSAGE_TYPES.ServerAck
    || (event !== null && event >= DOUBAO_EVENTS.StartSession)
  ) {
    const sessionIdLength = readFrameUint32(frame, offset, 'session id length');
    offset += 4;
    if (offset + sessionIdLength > frame.length) throw new Error('豆包响应帧 session id 被截断');
    sessionId = frame.subarray(offset, offset + sessionIdLength).toString('utf8');
    offset += sessionIdLength;
  }
  const payloadLength = readFrameUint32(frame, offset, 'payload length');
  offset += 4;
  if (payloadLength > MAX_PROVIDER_RESPONSE_BYTES) throw new Error('豆包响应 payload 超过允许大小');
  if (offset + payloadLength > frame.length) throw new Error('豆包响应帧 payload 被截断');
  let payloadBytes = frame.subarray(offset, offset + payloadLength);
  if (compression === 1) {
    try {
      payloadBytes = gunzipSync(payloadBytes, { maxOutputLength: MAX_PROVIDER_RESPONSE_BYTES });
    } catch {
      throw new Error('豆包响应 gzip payload 无效或解压后超过允许大小');
    }
  }
  else if (compression !== 0) throw new Error('豆包响应使用了不支持的压缩格式');
  let payload: unknown = payloadBytes;
  if (serialization === 1) {
    try {
      payload = JSON.parse(payloadBytes.toString('utf8'));
    } catch {
      throw new Error('豆包响应 JSON 无效');
    }
  } else if (serialization !== 0) {
    throw new Error('豆包响应使用了不支持的序列化格式');
  }
  return { messageType, event, sessionId, payload, errorCode };
}

export function buildDoubaoHeaders(
  config: { appId: string; accessKey: string },
  connectId: string,
): Record<string, string> {
  return {
    'X-Api-App-ID': config.appId,
    'X-Api-Access-Key': config.accessKey,
    'X-Api-Resource-Id': DOUBAO_REALTIME_RESOURCE_ID,
    'X-Api-App-Key': DOUBAO_REALTIME_APP_KEY,
    'X-Api-Connect-Id': connectId,
  };
}

function parseTestRequest(body: unknown): {
  section: VoiceAssistantTestSection;
  patch: VoiceAssistantSettingsPatch;
  clearSecrets: VoiceAssistantSecretPath[];
} {
  const source = record(body);
  if (!source) throw new VoiceAssistantConfigTestError('测试请求必须是 JSON 对象', 400);
  if (source.section !== 'doubao' && source.section !== 'processing' && source.section !== 'vision') {
    throw new VoiceAssistantConfigTestError('不支持的语音配置测试类型', 400);
  }
  const patch = source.patch === undefined ? {} : record(source.patch);
  if (!patch) throw new VoiceAssistantConfigTestError('patch 必须是 JSON 对象', 400);
  const fieldsBySection: Record<VoiceAssistantTestSection, readonly string[]> = {
    doubao: ['appId', 'accessKey', 'speaker'],
    processing: ['baseUrl', 'apiKey', 'model'],
    vision: ['endpoint', 'apiKey', 'model'],
  };
  for (const section of Object.keys(fieldsBySection) as VoiceAssistantTestSection[]) {
    if (!(section in patch)) continue;
    const sectionPatch = record(patch[section]);
    if (!sectionPatch) throw new VoiceAssistantConfigTestError(`${section} patch 必须是 JSON 对象`, 400);
    for (const [field, value] of Object.entries(sectionPatch)) {
      if (!fieldsBySection[section].includes(field)) {
        throw new VoiceAssistantConfigTestError(`不支持的 ${section} 配置项：${field}`, 400);
      }
      if (typeof value !== 'string') {
        throw new VoiceAssistantConfigTestError(`${section}.${field} 必须是字符串`, 400);
      }
    }
  }
  const clearSecrets = source.clearSecrets === undefined ? [] : source.clearSecrets;
  if (!Array.isArray(clearSecrets) || clearSecrets.some((item) => typeof item !== 'string')) {
    throw new VoiceAssistantConfigTestError('clearSecrets 必须是字符串数组', 400);
  }
  for (const secretPath of clearSecrets) {
    if (!SECRET_PATHS.has(secretPath as VoiceAssistantSecretPath)) {
      throw new VoiceAssistantConfigTestError(`不支持清除配置项：${secretPath}`, 400);
    }
  }
  return {
    section: source.section,
    patch: patch as VoiceAssistantSettingsPatch,
    clearSecrets: clearSecrets as VoiceAssistantSecretPath[],
  };
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new VoiceAssistantConfigTestError(`${label}不能为空`, 400);
  return normalized;
}

export function normalizeOpenAIChatCompletionsUrl(endpoint: string): string {
  const url = new URL(endpoint);
  const pathWithoutTrailingSlash = url.pathname.replace(/\/+$/u, '');
  url.pathname = pathWithoutTrailingSlash.endsWith('/chat/completions')
    ? pathWithoutTrailingSlash
    : `${pathWithoutTrailingSlash}/chat/completions`.replace(/^\/+/u, '/');
  return url.toString();
}

async function readBoundedResponseText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('供应商响应超过允许大小');
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

function activeSecrets(settings: VoiceAssistantSettings): string[] {
  return [
    settings.doubao.accessKey,
    settings.processing.apiKey,
    settings.vision.apiKey,
  ].filter(Boolean);
}

async function probeOpenAICompatible(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  vision: boolean;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const content = params.vision
      ? [
          { type: 'text', text: '请识别这张图片，并仅回复 OK。' },
          { type: 'image_url', image_url: { url: TINY_PNG_DATA_URL } },
        ]
      : '请仅回复 OK。';
    const response = await params.fetchImpl(normalizeOpenAIChatCompletionsUrl(params.endpoint), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: 'This is a connectivity test. Reply with OK.' },
          { role: 'user', content },
        ],
        temperature: 0,
        max_tokens: 8,
      }),
      signal: controller.signal,
    });
    const responseText = await readBoundedResponseText(response);
    if (!response.ok) {
      throw new Error(`供应商返回 HTTP ${response.status}${responseText ? `：${responseText}` : ''}`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error('供应商返回的 JSON 无效');
    }
    const root = record(payload);
    const choices = Array.isArray(root?.choices) ? root.choices : [];
    const firstChoice = record(choices[0]);
    const message = record(firstChoice?.message);
    const assistantContent = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!assistantContent) throw new Error('供应商未返回有效的 assistant 内容');
  } catch (error) {
    if (controller.signal.aborted) {
      throw new VoiceAssistantConfigTestError('连接测试超时', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function closeDoubaoSocket(socket: DoubaoProbeSocket): void {
  try {
    socket.close();
  } catch {
    // Continue to terminate below when the transport supports it.
  }
  try {
    socket.terminate?.();
  } catch {
    // The socket is already unusable; cleanup is best-effort here.
  }
}

async function openDoubaoSessionWithinTimeout(
  openSession: DoubaoSessionProbe,
  options: Parameters<DoubaoSessionProbe>[0],
): Promise<DoubaoProbeSocket> {
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout>;
  const opening = Promise.resolve().then(() => openSession(options));
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      reject(new VoiceAssistantConfigTestError('连接测试超时', 504));
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([opening, timeoutPromise]);
  } catch (error) {
    if (timedOut) void opening.then(closeDoubaoSocket, () => undefined);
    throw error;
  } finally {
    clearTimeout(timeout!);
  }
}

async function openDoubaoSession(options: {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<DoubaoProbeSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(options.url, {
      headers: options.headers,
      maxPayload: MAX_DOUBAO_FRAME_BYTES,
      perMessageDeflate: false,
    });
    socket.binaryType = 'nodebuffer';
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('open', onOpen);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        socket.terminate();
      } catch {
        closeDoubaoSocket(socket);
      }
      reject(error);
    };
    const onOpen = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(socket);
    };
    const onError = (error: Error) => fail(error);
    const onClose = () => fail(new Error('豆包实时语音连接在握手前关闭'));
    const timeout = setTimeout(() => {
      fail(new VoiceAssistantConfigTestError('连接测试超时', 504));
    }, options.timeoutMs);
    socket.once('open', onOpen);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function doubaoStartSessionPayload(speaker: string): unknown {
  return {
    asr: {
      extra: {
        end_smooth_window_ms: 800,
        enable_asr_twopass: true,
      },
    },
    tts: {
      speaker,
      audio_config: {
        channel: 1,
        format: 'pcm_s16le',
        sample_rate: 24_000,
      },
    },
    dialog: {
      bot_name: '豆包',
      system_role: '你是本地开发语音助手。',
      speaking_style: '说话简洁明了，语速适中，语调自然。',
      extra: {
        strict_audit: true,
        recv_timeout: 10,
        input_mod: 'keep_alive',
        model: '1.2.1.1',
        enable_user_query_exit: false,
      },
    },
  };
}

function doubaoErrorMessage(frame: ReturnType<typeof decodeDoubaoFrame>): string {
  const payload = record(frame.payload);
  const detail = typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.message === 'string'
      ? payload.message
      : '';
  return detail || `豆包连接测试失败${frame.errorCode === null ? '' : `（错误码 ${frame.errorCode}）`}`;
}

async function probeDoubaoSocket(
  socket: DoubaoProbeSocket,
  speaker: string,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let startSessionSent = false;
    const sessionId = randomUUID();
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
      closeDoubaoSocket(socket);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (raw: RawData) => {
      try {
        const frame = decodeDoubaoFrame(raw);
        if (
          frame.messageType === DOUBAO_MESSAGE_TYPES.ServerError
          || frame.event === DOUBAO_EVENTS.ConnectionFailed
          || frame.event === DOUBAO_EVENTS.SessionFailed
          || frame.event === DOUBAO_EVENTS.DialogCommonError
        ) {
          finish(new Error(doubaoErrorMessage(frame)));
          return;
        }
        if (frame.event === DOUBAO_EVENTS.ConnectionStarted && !startSessionSent) {
          startSessionSent = true;
          socket.send(encodeDoubaoJsonEvent(
            DOUBAO_EVENTS.StartSession,
            doubaoStartSessionPayload(speaker),
            sessionId,
          ));
          return;
        }
        if (frame.event === DOUBAO_EVENTS.SessionStarted && startSessionSent) finish();
      } catch (error) {
        finish(error);
      }
    };
    const onError = (error: Error) => finish(error);
    const onClose = () => finish(new Error('豆包实时语音连接提前关闭'));
    const timeout = setTimeout(() => {
      finish(new VoiceAssistantConfigTestError('连接测试超时', 504));
    }, timeoutMs);
    socket.on('message', onMessage);
    socket.on('error', onError);
    socket.on('close', onClose);
    try {
      socket.send(encodeDoubaoJsonEvent(DOUBAO_EVENTS.StartConnection, {}));
    } catch (error) {
      finish(error);
    }
  });
}

export async function testVoiceAssistantConfig(params: {
  body: unknown;
  savedSettings: VoiceAssistantSettings;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  openDoubaoSessionImpl?: DoubaoSessionProbe;
}): Promise<{ message: string }> {
  let request: ReturnType<typeof parseTestRequest>;
  let merged: VoiceAssistantSettings;
  try {
    request = parseTestRequest(params.body);
    merged = mergeVoiceAssistantSettingsPatch(params.savedSettings, request.patch, {
      clearSecrets: request.clearSecrets,
    });
  } catch (error) {
    if (error instanceof VoiceAssistantConfigTestError) throw error;
    throw new VoiceAssistantConfigTestError(sanitizeVoiceAssistantTestError(error), 400);
  }

  const secrets = activeSecrets(merged);
  try {
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new VoiceAssistantConfigTestError('timeoutMs 必须是正数', 400);
    }
    if (request.section === 'processing') {
      await probeOpenAICompatible({
        endpoint: required(merged.processing.baseUrl, '网页任务 API Base URL'),
        apiKey: required(merged.processing.apiKey, '网页任务 API Key'),
        model: required(merged.processing.model, '网页任务模型'),
        vision: false,
        fetchImpl: params.fetchImpl ?? fetch,
        timeoutMs,
      });
      return { message: '网页任务配置连接成功' };
    }
    if (request.section === 'vision') {
      await probeOpenAICompatible({
        endpoint: required(merged.vision.endpoint, '视觉 API Endpoint'),
        apiKey: required(merged.vision.apiKey, '视觉 API Key'),
        model: required(merged.vision.model, '视觉模型'),
        vision: true,
        fetchImpl: params.fetchImpl ?? fetch,
        timeoutMs,
      });
      return { message: '视觉配置连接成功' };
    }
    const appId = required(merged.doubao.appId, '豆包 App ID');
    const accessKey = required(merged.doubao.accessKey, '豆包 Access Key');
    const speaker = merged.doubao.speaker.trim() || DEFAULT_DOUBAO_SPEAKER;
    const openSession = params.openDoubaoSessionImpl ?? openDoubaoSession;
    const startedAt = Date.now();
    const socket = await openDoubaoSessionWithinTimeout(openSession, {
      url: DOUBAO_REALTIME_URL,
      headers: buildDoubaoHeaders({ appId, accessKey }, randomUUID()),
      timeoutMs,
    });
    const remainingTimeoutMs = timeoutMs - (Date.now() - startedAt);
    if (remainingTimeoutMs <= 0) {
      closeDoubaoSocket(socket);
      throw new VoiceAssistantConfigTestError('连接测试超时', 504);
    }
    await probeDoubaoSocket(socket, speaker, remainingTimeoutMs);
    return { message: '豆包配置连接成功' };
  } catch (error) {
    const statusCode = error instanceof VoiceAssistantConfigTestError ? error.statusCode : 502;
    throw new VoiceAssistantConfigTestError(sanitizeErrorWithSecrets(error, secrets), statusCode);
  }
}
