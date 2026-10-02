import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { readJsonBody, sendJson } from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';

const MAX_PROMPT_CHARACTERS = 100_000;
const MAX_REFERENCE_IMAGES = 10;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 32 * 1024 * 1024;

interface AiServiceProxyProjectContext {
  project: { root: string };
}

interface AiServiceProxyHandlers {
  getServerConfigStoreForRequest: (options: ManagementApiOptions) => {
    getConfig: (params: { activeProjectRoot: string }) => any;
  };
}

class AiServiceProxyError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AiServiceProxyError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AiServiceProxyError(`${label}不能为空`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new AiServiceProxyError(`${label}必须是字符串`);
  return value.trim();
}

function timeoutSeconds(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0 || normalized > maximum) {
    throw new AiServiceProxyError(`timeoutSeconds 必须在 0 到 ${maximum} 之间`);
  }
  return normalized;
}

function providerUrl(baseUrl: string, endpoint: string): string {
  const normalized = requiredString(baseUrl, '服务地址').replace(/\/+$/u, '');
  return `${normalized}/${endpoint}`;
}

function visionProviderUrl(endpoint: string): string {
  const normalized = requiredString(endpoint, '视觉服务地址').replace(/\/+$/u, '');
  return /\/chat\/completions$/iu.test(normalized)
    ? normalized
    : `${normalized}/chat/completions`;
}

function sanitizeMessage(value: unknown, secrets: readonly string[]): string {
  let message = value instanceof Error ? value.message : String(value || '请求失败');
  for (const secret of [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length)) {
    message = message.split(secret).join('***');
  }
  return message
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 500) || '请求失败';
}

function sanitizeProviderPayload(value: unknown, secrets: readonly string[], depth = 0): unknown {
  if (depth > 50) return null;
  const uniqueSecrets = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const redact = (text: string) => uniqueSecrets.reduce(
    (result, secret) => result.split(secret).join('***'),
    text,
  );
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProviderPayload(item, uniqueSecrets, depth + 1));
  }
  const source = record(value);
  if (source) {
    return Object.fromEntries(Object.entries(source).map(([key, item]) => [
      redact(key),
      sanitizeProviderPayload(item, uniqueSecrets, depth + 1),
    ]));
  }
  return value;
}

async function readBoundedText(response: Response): Promise<string> {
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
        throw new AiServiceProxyError('供应商响应超过允许大小', 502);
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function readProviderJson(response: Response): Promise<unknown> {
  const text = await readBoundedText(response);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AiServiceProxyError('供应商未返回有效 JSON', 502);
  }
}

function providerError(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  const source = record(payload);
  if (!source) return '';
  if (typeof source.error === 'string') return source.error;
  const error = record(source.error);
  if (error && typeof error.message === 'string') return error.message;
  return typeof source.message === 'string' ? source.message : '';
}

function parseJsonContent(content: unknown): unknown {
  if (content && typeof content === 'object' && !Array.isArray(content)) return content;
  const text = Array.isArray(content)
    ? content.map((item) => (typeof item === 'string' ? item : record(item)?.text || '')).join('')
    : String(content || '');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiServiceProxyError('视觉 API 未返回有效 JSON', 502);
  }
}

function normalizeRegions(value: unknown, kind: 'assets' | 'text') {
  const source = record(value);
  const regions = Array.isArray(source?.regions) ? source.regions : null;
  if (!regions) throw new AiServiceProxyError('视觉 API JSON 缺少 regions 数组', 502);
  return regions.map((rawRegion, index) => {
    const region = record(rawRegion);
    const id = typeof region?.id === 'string' && region.id.trim()
      ? region.id.trim()
      : `asset-${index + 1}`;
    const rawBounds = record(region?.bounds);
    if (!rawBounds || !['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(Number(rawBounds[key])))) {
      throw new AiServiceProxyError(`视觉 API region ${id} 缺少有效 bounds`, 502);
    }
    const bounds = Object.fromEntries(['left', 'top', 'right', 'bottom'].map((key) => {
      const number = Math.round(Number(rawBounds[key]));
      if (number < 0 || number > 1000) {
        throw new AiServiceProxyError(`视觉 API region ${id} 的 ${key} 必须在 0–1000`, 502);
      }
      return [key, number];
    })) as { left: number; top: number; right: number; bottom: number };
    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
      throw new AiServiceProxyError(`视觉 API region ${id} 的 bounds 无面积`, 502);
    }
    const confidence = Number(region?.confidence);
    return {
      id,
      bounds,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      ...(kind === 'text' ? { text: typeof region?.text === 'string' ? region.text : '' } : {}),
    };
  });
}

function parseBase64Image(value: unknown, label: string): {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
} {
  const source = record(value);
  if (!source) throw new AiServiceProxyError(`${label}必须是对象`);
  const mimeType = requiredString(source.mimeType, `${label}.mimeType`).toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw new AiServiceProxyError(`${label}.mimeType 不受支持`);
  }
  const base64 = requiredString(source.base64, `${label}.base64`);
  if (!/^[a-z\d+/]+={0,2}$/iu.test(base64)) {
    throw new AiServiceProxyError(`${label}.base64 无效`);
  }
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new AiServiceProxyError(`${label}大小无效`);
  }
  const defaultExtension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png';
  const rawFileName = optionalString(source.fileName, `${label}.fileName`);
  const fileName = rawFileName ? path.basename(rawFileName) : `${label}${defaultExtension}`;
  return { bytes, mimeType, fileName };
}

async function fetchProvider(url: string, init: RequestInit, seconds: number, secrets: readonly string[]): Promise<Response> {
  const signal = AbortSignal.timeout(seconds * 1000);
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw new AiServiceProxyError(`供应商请求超时（${seconds} 秒）`, 504);
    throw new AiServiceProxyError(sanitizeMessage(error, secrets), 502);
  }
}

async function handleVisionRequest(body: unknown, settings: any): Promise<{ status: number; body: unknown }> {
  const source = record(body);
  if (!source) throw new AiServiceProxyError('请求必须是 JSON 对象');
  const prompt = requiredString(source.prompt, 'prompt');
  if (prompt.length > MAX_PROMPT_CHARACTERS) throw new AiServiceProxyError('prompt 过长');
  const kind = source.kind === undefined ? 'assets' : source.kind;
  if (kind !== 'assets' && kind !== 'text') throw new AiServiceProxyError('kind 必须是 assets 或 text');
  const image = parseBase64Image(source.image, 'image');
  const seconds = timeoutSeconds(source.timeoutSeconds, 240, 600);
  const endpoint = String(settings?.endpoint || '').trim();
  const apiKey = String(settings?.apiKey || '').trim();
  const model = String(settings?.model || '').trim();
  const family = String(settings?.family || '').trim();
  const responseFormat = String(settings?.responseFormat || 'auto').trim();
  if (!endpoint || !apiKey || !model || !family) {
    return {
      status: 409,
      body: {
        schemaVersion: 1,
        status: 'fallback-required',
        fallback: 'current-agent',
        reason: 'vision-config-incomplete',
        kind,
        ocrSubmitted: false,
        regions: [],
      },
    };
  }
  if (family !== 'qwen3' && family !== 'doubao-seed') {
    throw new AiServiceProxyError('视觉模型系列仅支持 qwen3 或 doubao-seed');
  }
  if (responseFormat !== 'auto' && responseFormat !== 'none') {
    throw new AiServiceProxyError('视觉结构化响应策略仅支持 auto 或 none');
  }

  const requestBody = {
    model,
    temperature: 0.1,
    max_tokens: 6000,
    ...(responseFormat === 'auto' ? { response_format: { type: 'json_object' } } : {}),
    ...(family === 'qwen3' ? { enable_thinking: false } : {}),
    ...(family === 'doubao-seed' ? { thinking: { type: 'disabled' } } : {}),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.bytes.toString('base64')}`, detail: 'high' } },
      ],
    }],
  };
  const response = await fetchProvider(visionProviderUrl(endpoint), {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  }, seconds, [apiKey]);
  const payload = sanitizeProviderPayload(await readProviderJson(response), [apiKey]);
  if (!response.ok) {
    const detail = sanitizeMessage(providerError(payload), [apiKey]);
    throw new AiServiceProxyError(`视觉 API 返回 HTTP ${response.status}${detail ? `: ${detail}` : ''}`, 502);
  }
  const payloadRecord = record(payload);
  const choices = Array.isArray(payloadRecord?.choices) ? payloadRecord.choices : [];
  const firstChoice = record(choices[0]);
  const message = record(firstChoice?.message);
  const output = Array.isArray(payloadRecord?.output) ? payloadRecord.output : [];
  const firstOutput = record(output[0]);
  const parsed = parseJsonContent(message?.content ?? firstOutput?.content);
  return {
    status: 200,
    body: {
      schemaVersion: 1,
      status: 'completed',
      provider: 'visual-api',
      model,
      family,
      responseFormat,
      kind,
      ocrSubmitted: false,
      regions: normalizeRegions(parsed, kind),
    },
  };
}

async function handleImageRequest(body: unknown, settings: any): Promise<{ status: number; body: unknown }> {
  const source = record(body);
  if (!source) throw new AiServiceProxyError('请求必须是 JSON 对象');
  const prompt = requiredString(source.prompt, 'prompt');
  if (prompt.length > MAX_PROMPT_CHARACTERS) throw new AiServiceProxyError('prompt 过长');
  const size = optionalString(source.size, 'size');
  const quality = optionalString(source.quality, 'quality');
  const rawImages = source.images === undefined ? [] : source.images;
  if (!Array.isArray(rawImages) || rawImages.length > MAX_REFERENCE_IMAGES) {
    throw new AiServiceProxyError(`images 最多包含 ${MAX_REFERENCE_IMAGES} 项`);
  }
  const images = rawImages.map((image, index) => parseBase64Image(image, `images[${index}]`));
  const seconds = timeoutSeconds(source.timeoutSeconds, 600, 900);
  const baseUrl = String(settings?.baseUrl || '').trim();
  const apiKey = String(settings?.apiKey || '').trim();
  const model = String(settings?.model || '').trim();
  if (!baseUrl || !apiKey || !model) {
    throw new AiServiceProxyError('图片生成配置不完整', 409);
  }

  let requestBody: BodyInit;
  let headers: Record<string, string>;
  let endpoint: string;
  if (images.length) {
    endpoint = 'images/edits';
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', prompt);
    if (size) formData.append('size', size);
    if (quality) formData.append('quality', quality);
    for (const image of images) {
      formData.append('image[]', new Blob([Uint8Array.from(image.bytes)], { type: image.mimeType }), image.fileName);
    }
    requestBody = formData;
    headers = { authorization: `Bearer ${apiKey}` };
  } else {
    endpoint = 'images/generations';
    requestBody = JSON.stringify({
      model,
      prompt,
      ...(size ? { size } : {}),
      ...(quality ? { quality } : {}),
    });
    headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  }
  const response = await fetchProvider(providerUrl(baseUrl, endpoint), {
    method: 'POST',
    headers,
    body: requestBody,
  }, seconds, [apiKey]);
  const payload = sanitizeProviderPayload(await readProviderJson(response), [apiKey]);
  if (!response.ok) {
    const detail = sanitizeMessage(providerError(payload), [apiKey]);
    throw new AiServiceProxyError(`图片 API 返回 HTTP ${response.status}${detail ? `: ${detail}` : ''}`, 502);
  }
  return { status: 200, body: payload };
}

export function handleAiServiceProxyApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  context: AiServiceProxyProjectContext,
  pathname: string,
  handlers: AiServiceProxyHandlers,
): boolean {
  const isVision = pathname === '/api/ai/vision/analyze';
  const isImage = pathname === '/api/ai/image/generate';
  if (!isVision && !isImage) return false;
  if (req.method !== 'POST') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  readJsonBody(req).then(async (body) => {
    const config = handlers.getServerConfigStoreForRequest(options).getConfig({
      activeProjectRoot: context.project.root,
    });
    return isVision
      ? handleVisionRequest(body, config.ai.vision)
      : handleImageRequest(body, config.ai.imageGeneration);
  }).then((result) => {
    sendJson(res, result.body, { status: result.status });
  }).catch((error) => {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
    sendJson(res, { error: sanitizeMessage(error, []) }, { status });
  });
  return true;
}
