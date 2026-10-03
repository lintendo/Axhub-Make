#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

async function readMakeOrigin() {
  const homeDir = process.env.AXHUB_MAKE_HOME_DIR || os.homedir();
  const infoPath = path.join(homeDir, '.axhub', 'make', '.admin-server-info.json');
  let source;
  try {
    source = JSON.parse(await fs.readFile(infoPath, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取 Make 服务信息 ${infoPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const origin = typeof source?.origin === 'string' ? source.origin.trim().replace(/\/+$/u, '') : '';
  if (!origin || !/^https?:\/\//u.test(origin)) {
    throw new Error(`Make 服务信息缺少有效 origin: ${infoPath}`);
  }
  return origin;
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Make 视觉代理返回 HTTP ${response.status}，但响应不是有效 JSON`);
  }
}

function validateResult(payload, kind) {
  if (payload?.status === 'fallback-required') {
    return {
      ...payload,
      schemaVersion: 1,
      status: 'fallback-required',
      fallback: 'current-agent',
      reason: 'vision-config-incomplete',
      kind,
      ocrSubmitted: false,
      regions: [],
    };
  }
  if (payload?.status !== 'completed' || !Array.isArray(payload.regions)) {
    throw new Error('Make 视觉代理返回的数据契约无效');
  }
  return payload;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'project-id': { type: 'string' },
      'prompt-file': { type: 'string' },
      image: { type: 'string' },
      out: { type: 'string' },
      kind: { type: 'string' },
      'timeout-seconds': { type: 'string' },
    },
  });
  if (!values['project-id']?.trim()) throw new Error('Missing required --project-id');
  if (!values['prompt-file']) throw new Error('Missing required --prompt-file');
  if (!values.image) throw new Error('Missing required --image');
  if (!values.out) throw new Error('Missing required --out');
  const kind = String(values.kind || 'assets').trim().toLowerCase();
  if (!['assets', 'text'].includes(kind)) throw new Error('--kind must be assets or text');

  const promptFile = path.resolve(values['prompt-file']);
  const prompt = (await fs.readFile(promptFile, 'utf8')).trim();
  if (!prompt) throw new Error('Prompt file is empty');
  const imagePath = path.resolve(values.image);
  const outputPath = path.resolve(values.out);
  try {
    await fs.access(outputPath);
    throw new Error(`Output already exists: ${outputPath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const timeoutSeconds = Number(values['timeout-seconds'] || 240);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 600) {
    throw new Error('--timeout-seconds must be greater than 0 and at most 600');
  }
  const origin = await readMakeOrigin();
  const url = new URL('/api/ai/vision/analyze', origin);
  url.searchParams.set('projectId', values['project-id'].trim());
  const signal = AbortSignal.timeout(timeoutSeconds * 1000);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        image: {
          mimeType: imageMimeType(imagePath),
          base64: (await fs.readFile(imagePath)).toString('base64'),
        },
        kind,
        timeoutSeconds,
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new Error(`Make 视觉代理请求超时（${timeoutSeconds} 秒）`);
    throw error;
  }
  const payload = await responsePayload(response);
  if (!response.ok && !(response.status === 409 && payload?.status === 'fallback-required')) {
    throw new Error(`Make 视觉代理返回 HTTP ${response.status}: ${payload?.error || '请求失败'}`);
  }
  const result = validateResult(payload, kind);
  const output = result.status === 'fallback-required'
    ? { ...result, promptFile, image: imagePath }
    : result;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Vision request failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
