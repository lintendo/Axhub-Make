#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

let apiKeyForRedaction = '';

function redact(value) {
  const text = value instanceof Error ? value.message : String(value);
  return apiKeyForRedaction ? text.replaceAll(apiKeyForRedaction, '[REDACTED]') : text;
}

function endpointUrl(value) {
  const endpoint = String(value || '').trim().replace(/\/+$/u, '');
  return /\/chat\/completions$/iu.test(endpoint) ? endpoint : `${endpoint}/chat/completions`;
}

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function parseJsonContent(content) {
  if (content && typeof content === 'object') return content;
  const text = Array.isArray(content)
    ? content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join('')
    : String(content || '');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('视觉 API 未返回有效 JSON');
  }
}

function normalizeRegions(value, kind) {
  const regions = Array.isArray(value?.regions) ? value.regions : null;
  if (!regions) throw new Error('视觉 API JSON 缺少 regions 数组');
  return regions.map((region, index) => {
    const id = typeof region?.id === 'string' && region.id.trim() ? region.id.trim() : `asset-${index + 1}`;
    const bounds = region?.bounds;
    if (!bounds || !['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(Number(bounds[key])))) {
      throw new Error(`视觉 API region ${id} 缺少有效 bounds`);
    }
    const normalized = {};
    for (const key of ['left', 'top', 'right', 'bottom']) {
      const number = Math.round(Number(bounds[key]));
      if (number < 0 || number > 1000) throw new Error(`视觉 API region ${id} 的 ${key} 必须在 0–1000`);
      normalized[key] = number;
    }
    if (normalized.right <= normalized.left || normalized.bottom <= normalized.top) {
      throw new Error(`视觉 API region ${id} 的 bounds 无面积`);
    }
    const confidence = Number(region?.confidence);
    const normalizedRegion = {
      id,
      bounds: normalized,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    };
    if (kind === 'text') normalizedRegion.text = typeof region?.text === 'string' ? region.text : '';
    return normalizedRegion;
  });
}

async function readVisionConfig() {
  const homeDir = process.env.AXHUB_MAKE_HOME_DIR || os.homedir();
  const settingsPath = path.join(homeDir, '.axhub', 'make', 'voice-assistant.settings.json');
  let source;
  try {
    source = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { settingsPath, vision: {} };
    throw new Error(`无法读取视觉 API 设置 ${settingsPath}: ${redact(error)}`);
  }
  return { settingsPath, vision: source?.vision && typeof source.vision === 'object' ? source.vision : {} };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'prompt-file': { type: 'string' },
      image: { type: 'string' },
      out: { type: 'string' },
      kind: { type: 'string' },
      'timeout-seconds': { type: 'string' },
    },
  });
  if (!values['prompt-file']) throw new Error('Missing required --prompt-file');
  if (!values.image) throw new Error('Missing required --image');
  if (!values.out) throw new Error('Missing required --out');
  const kind = String(values.kind || 'assets').trim().toLowerCase();
  if (!['assets', 'text'].includes(kind)) throw new Error('--kind must be assets or text');

  const prompt = (await fs.readFile(path.resolve(values['prompt-file']), 'utf8')).trim();
  if (!prompt) throw new Error('Prompt file is empty');
  const imagePath = path.resolve(values.image);
  const outputPath = path.resolve(values.out);
  try {
    await fs.access(outputPath);
    throw new Error(`Output already exists: ${outputPath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const { settingsPath, vision } = await readVisionConfig();
  const endpoint = typeof vision.endpoint === 'string' ? vision.endpoint.trim() : '';
  const apiKey = typeof vision.apiKey === 'string' ? vision.apiKey.trim() : '';
  const model = typeof vision.model === 'string' ? vision.model.trim() : '';
  if (!endpoint || !apiKey || !model) {
    const fallback = {
      schemaVersion: 1,
      status: 'fallback-required',
      fallback: 'current-agent',
      reason: 'vision-config-incomplete',
      settingsPath,
      promptFile: path.resolve(values['prompt-file']),
      image: imagePath,
      kind,
      ocrSubmitted: false,
      regions: [],
    };
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(fallback, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(fallback, null, 2)}\n`);
    return;
  }

  apiKeyForRedaction = apiKey;
  const timeoutSeconds = Number(values['timeout-seconds'] || 240);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error('--timeout-seconds must be greater than 0');
  const imageData = (await fs.readFile(imagePath)).toString('base64');
  const body = {
    model,
    temperature: 0.1,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
    ...(/qwen/iu.test(model) ? { enable_thinking: false } : {}),
    ...(/doubao|seed/iu.test(model) ? { thinking: { type: 'disabled' } } : {}),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${imageMimeType(imagePath)};base64,${imageData}`, detail: 'high' } },
      ],
    }],
  };
  const signal = AbortSignal.timeout(timeoutSeconds * 1000);
  let response;
  try {
    response = await fetch(endpointUrl(endpoint), {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new Error(`视觉 API 请求超时（${timeoutSeconds} 秒）`);
    throw error;
  }
  if (!response.ok) throw new Error(`视觉 API 返回 HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content ?? payload?.output?.[0]?.content;
  const parsed = parseJsonContent(rawContent);
  const regions = normalizeRegions(parsed, kind);
  const result = {
    schemaVersion: 1,
    status: 'completed',
    provider: 'visual-api',
    model,
    endpoint: endpointUrl(endpoint),
    kind,
    ocrSubmitted: false,
    regions,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Vision request failed: ${redact(error)}\n`);
  process.exitCode = 1;
});
