import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

let apiKeyForRedaction = '';

function redact(value) {
  const text = value instanceof Error ? value.message : String(value);
  return apiKeyForRedaction ? text.replaceAll(apiKeyForRedaction, '[REDACTED]') : text;
}

async function fetchWithTimeout(url, init, signal, timeoutSeconds) {
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw new Error(`Image provider request timed out after ${timeoutSeconds} seconds`);
    throw error;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'prompt-file': { type: 'string' },
      out: { type: 'string' },
      size: { type: 'string' },
      quality: { type: 'string' },
      image: { type: 'string', multiple: true },
      'timeout-seconds': { type: 'string' },
    },
  });
  if (!values['prompt-file']) throw new Error('Missing required --prompt-file');
  if (!values.out) throw new Error('Missing required --out');

  const outputPath = path.resolve(values.out);
  let outputExists = true;
  try {
    await fs.access(outputPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    outputExists = false;
  }
  if (outputExists) throw new Error(`Output already exists: ${outputPath}`);

  const prompt = (await fs.readFile(path.resolve(values['prompt-file']), 'utf8')).trim();
  if (!prompt) throw new Error('Prompt file is empty');
  const timeoutSeconds = Number(values['timeout-seconds'] || 600);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('--timeout-seconds must be greater than 0');
  }
  const signal = AbortSignal.timeout(timeoutSeconds * 1000);

  const makeHomeDir = process.env.AXHUB_MAKE_HOME_DIR || os.homedir();
  const configPath = path.join(makeHomeDir, '.axhub', 'make', 'server.config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const imageConfig = config?.ai?.imageGeneration;
  if (!imageConfig?.baseUrl || !imageConfig?.apiKey || !imageConfig?.model) {
    throw new Error(`Incomplete ai.imageGeneration configuration in ${configPath}`);
  }
  apiKeyForRedaction = imageConfig.apiKey;
  const referenceImages = values.image || [];
  let endpoint = 'images/generations';
  let requestBody;
  let requestHeaders = {
    authorization: `Bearer ${imageConfig.apiKey}`,
    'content-type': 'application/json',
  };
  if (referenceImages.length) {
    endpoint = 'images/edits';
    const formData = new FormData();
    formData.append('model', imageConfig.model);
    formData.append('prompt', prompt);
    if (values.size) formData.append('size', values.size);
    if (values.quality) formData.append('quality', values.quality);
    for (const imagePath of referenceImages) {
      const resolvedPath = path.resolve(imagePath);
      const extension = path.extname(resolvedPath).toLowerCase();
      const mimeType = extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.webp'
          ? 'image/webp'
          : 'image/png';
      formData.append('image[]', new Blob([await fs.readFile(resolvedPath)], { type: mimeType }), path.basename(resolvedPath));
    }
    requestBody = formData;
    requestHeaders = { authorization: `Bearer ${imageConfig.apiKey}` };
  } else {
    requestBody = JSON.stringify({
      model: imageConfig.model,
      prompt,
      ...(values.size ? { size: values.size } : {}),
      ...(values.quality ? { quality: values.quality } : {}),
    });
  }

  const response = await fetchWithTimeout(`${imageConfig.baseUrl.replace(/\/+$/u, '')}/${endpoint}`, {
    method: 'POST',
    headers: requestHeaders,
    body: requestBody,
  }, signal, timeoutSeconds);
  if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}: ${await response.text()}`);

  const payload = await response.json();
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
  process.stderr.write(`Image request failed: ${redact(error)}\n`);
  process.exitCode = 1;
});
