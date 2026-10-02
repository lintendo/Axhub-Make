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
    throw new Error(`Unable to read Make server info ${infoPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const origin = typeof source?.origin === 'string' ? source.origin.trim().replace(/\/+$/u, '') : '';
  if (!origin || !/^https?:\/\//u.test(origin)) {
    throw new Error(`Make server info has no valid origin: ${infoPath}`);
  }
  return origin;
}

async function fetchWithTimeout(url, init, signal, timeoutSeconds) {
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw new Error(`Make image proxy request timed out after ${timeoutSeconds} seconds`);
    throw error;
  }
}

async function jsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Make image proxy returned HTTP ${response.status} with invalid JSON`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'project-id': { type: 'string' },
      'prompt-file': { type: 'string' },
      out: { type: 'string' },
      size: { type: 'string' },
      quality: { type: 'string' },
      image: { type: 'string', multiple: true },
      'timeout-seconds': { type: 'string' },
    },
  });
  if (!values['project-id']?.trim()) throw new Error('Missing required --project-id');
  if (!values['prompt-file']) throw new Error('Missing required --prompt-file');
  if (!values.out) throw new Error('Missing required --out');

  const outputPath = path.resolve(values.out);
  try {
    await fs.access(outputPath);
    throw new Error(`Output already exists: ${outputPath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const prompt = (await fs.readFile(path.resolve(values['prompt-file']), 'utf8')).trim();
  if (!prompt) throw new Error('Prompt file is empty');
  const timeoutSeconds = Number(values['timeout-seconds'] || 600);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 900) {
    throw new Error('--timeout-seconds must be greater than 0 and at most 900');
  }
  const signal = AbortSignal.timeout(timeoutSeconds * 1000);
  const origin = await readMakeOrigin();
  const url = new URL('/api/ai/image/generate', origin);
  url.searchParams.set('projectId', values['project-id'].trim());
  const images = await Promise.all((values.image || []).map(async (imagePath) => {
    const resolvedPath = path.resolve(imagePath);
    return {
      fileName: path.basename(resolvedPath),
      mimeType: imageMimeType(resolvedPath),
      base64: (await fs.readFile(resolvedPath)).toString('base64'),
    };
  }));
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...(values.size ? { size: values.size } : {}),
      ...(values.quality ? { quality: values.quality } : {}),
      ...(images.length ? { images } : {}),
      timeoutSeconds,
    }),
  }, signal, timeoutSeconds);
  const payload = await jsonResponse(response);
  if (!response.ok) {
    throw new Error(`Make image proxy returned HTTP ${response.status}: ${payload?.error || 'request failed'}`);
  }

  const item = payload?.data?.[0];
  let imageBytes;
  if (item?.b64_json) {
    imageBytes = Buffer.from(item.b64_json, 'base64');
  } else if (typeof item?.url === 'string' && item.url.startsWith('data:')) {
    const match = item.url.match(/^data:[^,]*?(;base64)?,(.*)$/su);
    if (!match) throw new Error('Image provider returned an invalid data URL');
    imageBytes = match[1]
      ? Buffer.from(match[2], 'base64')
      : Buffer.from(decodeURIComponent(match[2]));
  } else if (typeof item?.url === 'string' && /^https?:\/\//u.test(item.url)) {
    const imageResponse = await fetchWithTimeout(item.url, {}, signal, timeoutSeconds);
    if (!imageResponse.ok) throw new Error(`Image download returned HTTP ${imageResponse.status}`);
    imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error('Image provider response is missing a supported image result');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await fs.writeFile(outputPath, imageBytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Output already exists: ${outputPath}`);
    throw error;
  }
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`Image request failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
