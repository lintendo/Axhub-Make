import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import zlib from 'node:zlib';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(appRoot, '.agents/skills/screenshot-to-prototype/scripts');

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writeRgbaPng(filePath: string, width: number, height: number, pixels: Uint8Array) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(scanlines, row + 1);
  }
  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function readRgbaPng(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') idatChunks.push(data);
    else if (type === 'IEND') break;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    expect(inflated[inputOffset++]).toBe(0);
    inflated.copy(pixels, y * stride, inputOffset, inputOffset + stride);
    inputOffset += stride;
  }
  return { width, height, pixels };
}

function pixelAt(image: ReturnType<typeof readRgbaPng>, x: number, y: number) {
  const offset = (y * image.width + x) * 4;
  return [...image.pixels.subarray(offset, offset + 4)];
}

function fixturePng(filePath: string, width = 10, height = 10) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels.set([x * 10, y * 10, 200, 255], (y * width + x) * 4);
    }
  }
  writeRgbaPng(filePath, width, height, pixels);
}

function run(script: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env,
  });
}

function runAsync(script: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [path.join(scriptsRoot, script), ...args], {
      cwd: appRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function writeVisionSettings(homeDir: string, vision: Record<string, string>) {
  const settingsPath = path.join(homeDir, '.axhub', 'make', 'voice-assistant.settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ vision }));
}

describe('screenshot layer recall scripts', () => {
  it('requests the current Agent only when the global visual API is incomplete', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-fallback-'));
    const image = path.join(dir, 'source.png');
    const prompt = path.join(dir, 'prompt.txt');
    const output = path.join(dir, 'pass-1.json');
    fixturePng(image);
    fs.writeFileSync(prompt, '完整检查整张图片（含状态栏）。');
    writeVisionSettings(dir, { endpoint: '', apiKey: '', model: '' });

    const result = run('request-vision.mjs', [
      '--prompt-file', prompt,
      '--image', image,
      '--out', output,
    ], { ...process.env, AXHUB_MAKE_HOME_DIR: dir });
    const payload = JSON.parse(fs.readFileSync(output, 'utf8'));

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      status: 'fallback-required',
      fallback: 'current-agent',
      reason: 'vision-config-incomplete',
      ocrSubmitted: false,
      regions: [],
    });
  });

  it('normalizes optional OCR or fallback vision text into a separate text-regions contract', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-text-regions-'));
    const source = path.join(dir, 'source.png');
    const ocr = path.join(dir, 'ocr.json');
    const ocrOutput = path.join(dir, 'text-regions-ocr.json');
    const vision = path.join(dir, 'vision.json');
    const visionOutput = path.join(dir, 'text-regions-vision.json');
    fixturePng(source);
    fs.writeFileSync(ocr, JSON.stringify({ regions: [{ id: 'ocr-1', text: '标题', score: 0.97, points: [[1, 2], [4, 2], [4, 4], [1, 4]] }] }));
    fs.writeFileSync(vision, JSON.stringify({
      status: 'completed',
      provider: 'visual-api',
      kind: 'text',
      regions: [{ id: 'text-1', text: '状态栏', confidence: 0.9, bounds: { left: 100, top: 100, right: 300, bottom: 300 } }],
    }));

    const ocrResult = run('normalize-text-regions.mjs', [
      '--source', source,
      '--ocr', ocr,
      '--out', ocrOutput,
    ]);
    const visionResult = run('normalize-text-regions.mjs', [
      '--source', source,
      '--vision', vision,
      '--out', visionOutput,
    ]);
    const ocrPayload = JSON.parse(fs.readFileSync(ocrOutput, 'utf8'));
    const visionPayload = JSON.parse(fs.readFileSync(visionOutput, 'utf8'));

    expect(ocrResult.status).toBe(0);
    expect(visionResult.status).toBe(0);
    expect(ocrPayload).toMatchObject({ status: 'ok', source: 'ocr', regions: [{ id: 'ocr-1', text: '标题', confidence: 0.97 }] });
    expect(ocrPayload.regions[0].bounds).toEqual({ left: 100, top: 200, right: 500, bottom: 500 });
    expect(visionPayload).toMatchObject({ status: 'ok', source: 'vision-api', regions: [{ id: 'text-1', text: '状态栏', confidence: 0.9 }] });
  });

  it('uses the configured visual API without submitting OCR or masking metadata', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-vision-'));
    const image = path.join(dir, 'source.png');
    const prompt = path.join(dir, 'prompt.txt');
    const output = path.join(dir, 'pass-1.json');
    fixturePng(image);
    fs.writeFileSync(prompt, '完整检查整张图片（含状态栏）。');

    let requestBody: any;
    let authorization = '';
    const server = http.createServer((request, response) => {
      authorization = String(request.headers.authorization || '');
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            regions: [{ id: 'asset-1', bounds: { left: 100, top: 200, right: 400, bottom: 500 }, confidence: 0.98 }],
          }) } }],
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
    writeVisionSettings(dir, {
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'vision-secret',
      model: 'qwen3.8-max',
    });

    try {
      const result = await runAsync('request-vision.mjs', [
        '--prompt-file', prompt,
        '--image', image,
        '--out', output,
      ], { ...process.env, AXHUB_MAKE_HOME_DIR: dir });
      const payload = JSON.parse(fs.readFileSync(output, 'utf8'));

      expect(result.status).toBe(0);
      expect(authorization).toBe('Bearer vision-secret');
      expect(requestBody.model).toBe('qwen3.8-max');
      expect(requestBody.enable_thinking).toBe(false);
      expect(JSON.stringify(requestBody)).toContain('完整检查整张图片（含状态栏）');
      expect(JSON.stringify(requestBody)).toContain('data:image/png;base64,');
      expect(JSON.stringify(requestBody).toLowerCase()).not.toContain('ocr');
      expect(JSON.stringify(requestBody).toLowerCase()).not.toContain('mask');
      expect(payload).toMatchObject({
        status: 'completed',
        provider: 'visual-api',
        ocrSubmitted: false,
        regions: [{ id: 'asset-1', bounds: { left: 100, top: 200, right: 400, bottom: 500 } }],
      });
    } finally {
      server.close();
    }
  });

  it('surfaces configured provider failures instead of silently using the Agent fallback', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-vision-failure-'));
    const image = path.join(dir, 'source.png');
    const prompt = path.join(dir, 'prompt.txt');
    const output = path.join(dir, 'pass-1.json');
    fixturePng(image);
    fs.writeFileSync(prompt, '完整检查整张图片（含状态栏）。');
    const server = http.createServer((_request, response) => {
      response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('provider unavailable for vision-secret');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
    writeVisionSettings(dir, {
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'vision-secret',
      model: 'vision-model',
    });

    try {
      const result = await runAsync('request-vision.mjs', [
        '--prompt-file', prompt,
        '--image', image,
        '--out', output,
      ], { ...process.env, AXHUB_MAKE_HOME_DIR: dir });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('HTTP 502');
      expect(result.stderr).toContain('[REDACTED]');
      expect(result.stderr).not.toContain('vision-secret');
      expect(fs.existsSync(output)).toBe(false);
    } finally {
      server.close();
    }
  });

  it('masks first-pass regions and post-pass OCR with no extra spacing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-mask-'));
    const source = path.join(dir, 'source.png');
    const pass1 = path.join(dir, 'pass-1.json');
    const ocr = path.join(dir, 'ocr.json');
    const output = path.join(dir, 'masked.png');
    const report = path.join(dir, 'masked.json');
    fixturePng(source);
    fs.writeFileSync(pass1, JSON.stringify({
      status: 'completed',
      regions: [{ id: 'asset-1', bounds: { left: 100, top: 100, right: 300, bottom: 300 }, confidence: 0.9 }],
    }));
    fs.writeFileSync(ocr, JSON.stringify({
      regions: [{ id: 'ocr-1', points: [[6, 6], [8, 6], [8, 8], [6, 8]], text: '文字' }],
    }));

    const result = run('mask-layer-recall.mjs', [
      '--source', source,
      '--regions', pass1,
      '--text-regions', ocr,
      '--out', output,
      '--report', report,
    ]);
    const masked = readRgbaPng(output);
    const metadata = JSON.parse(fs.readFileSync(report, 'utf8'));

    expect(result.status).toBe(0);
    expect(pixelAt(masked, 1, 1)).toEqual([238, 238, 238, 255]);
    expect(pixelAt(masked, 6, 6)).toEqual([238, 238, 238, 255]);
    expect(pixelAt(masked, 0, 0)).toEqual([0, 0, 200, 255]);
    expect(pixelAt(masked, 3, 3)).toEqual([30, 30, 200, 255]);
    expect(metadata).toMatchObject({ padding: 0, ocrSubmitted: false, regionCount: 1, ocrCount: 1 });
  });

  it('never overwrites the untouched source while creating the second-pass mask', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-mask-source-'));
    const source = path.join(dir, 'source.png');
    const pass1 = path.join(dir, 'pass-1.json');
    const ocr = path.join(dir, 'ocr.json');
    fixturePng(source);
    const original = fs.readFileSync(source);
    fs.writeFileSync(pass1, JSON.stringify({ status: 'completed', regions: [] }));
    fs.writeFileSync(ocr, JSON.stringify({ regions: [] }));

    const result = run('mask-layer-recall.mjs', [
      '--source', source,
      '--regions', pass1,
      '--text-regions', ocr,
      '--out', source,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Source and output paths must differ');
    expect(fs.readFileSync(source)).toEqual(original);
  });

  it('merges both passes and crops exact rectangles from the untouched source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-recall-finalize-'));
    const source = path.join(dir, 'source.png');
    const pass1 = path.join(dir, 'pass-1.json');
    const pass2 = path.join(dir, 'pass-2.json');
    const ocr = path.join(dir, 'ocr.json');
    const outDir = path.join(dir, 'final');
    fixturePng(source);
    fs.writeFileSync(pass1, JSON.stringify({
      status: 'completed',
      regions: [{ id: 'asset-a', bounds: { left: 100, top: 100, right: 300, bottom: 300 }, confidence: 0.95 }],
    }));
    fs.writeFileSync(pass2, JSON.stringify({
      status: 'completed',
      regions: [
        { id: 'duplicate-a', bounds: { left: 100, top: 100, right: 300, bottom: 300 }, confidence: 0.9 },
        { id: 'asset-b', bounds: { left: 600, top: 600, right: 900, bottom: 900 }, confidence: 0.88 },
      ],
    }));
    fs.writeFileSync(ocr, JSON.stringify({ regions: [] }));

    const result = run('finalize-layer-recall.mjs', [
      '--source', source,
      '--pass-1', pass1,
      '--pass-2', pass2,
      '--text-regions', ocr,
      '--out-dir', outDir,
    ]);
    const merged = JSON.parse(fs.readFileSync(path.join(outDir, 'merged-regions.json'), 'utf8'));
    const firstCrop = readRgbaPng(path.join(outDir, merged.regions[0].referencePath));
    const secondCrop = readRgbaPng(path.join(outDir, merged.regions[1].referencePath));

    expect(result.status).toBe(0);
    expect(merged.summary).toMatchObject({ pass1: 1, pass2: 2, duplicatesRemoved: 1, merged: 2 });
    expect(merged.regions.map((region: any) => region.sourcePass)).toEqual([1, 2]);
    expect([firstCrop.width, firstCrop.height]).toEqual([2, 2]);
    expect([secondCrop.width, secondCrop.height]).toEqual([3, 3]);
    expect(pixelAt(firstCrop, 0, 0)).toEqual([10, 10, 200, 255]);
    expect(fs.existsSync(path.join(outDir, 'asset-reference-matrix.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'asset-reference-matrix.json'))).toBe(true);
  });
});
