import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
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
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error(`Invalid PNG signature: ${filePath}`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idatChunks: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (colorType !== 6) throw new Error(`Expected an RGBA PNG: ${filePath}`);

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    if (filter !== 0) throw new Error(`Expected PNG filter 0, received ${filter}: ${filePath}`);
    inflated.copy(pixels, y * stride, inputOffset, inputOffset + stride);
    inputOffset += stride;
  }
  return { width, height, pixels };
}

function pixelAt(image: ReturnType<typeof readRgbaPng>, x: number, y: number): [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2], image.pixels[offset + 3]];
}

function fixtureScreenshot(filePath: string) {
  const width = 8;
  const height = 6;
  const pixels = new Uint8Array(width * height * 4);
  const set = (x: number, y: number, rgba: [number, number, number, number]) => {
    const offset = (y * width + x) * 4;
    pixels.set(rgba, offset);
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) set(x, y, [0, 255, 0, 255]);
  for (let y = 2; y < 5; y += 1) for (let x = 2; x < 6; x += 1) set(x, y, [220, 40, 40, 255]);
  writeRgbaPng(filePath, width, height, pixels);
}

function run(script: string, args: string[]) {
  return execFileSync(process.execPath, [path.join(scriptsRoot, script), ...args], { cwd: appRoot, encoding: 'utf8' });
}

function writeFakeRembg(binDir: string, source: string) {
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'fake-rembg.cjs');
  fs.writeFileSync(scriptPath, source);
  if (process.platform === 'win32') {
    const executablePath = path.join(binDir, 'rembg.exe');
    try {
      fs.linkSync(process.execPath, executablePath);
    } catch {
      fs.copyFileSync(process.execPath, executablePath);
    }
    fs.writeFileSync(path.join(binDir, 'i'), `process.argv.splice(2, 0, 'i');\n${source}`);
  } else {
    const executablePath = path.join(binDir, 'rembg');
    fs.writeFileSync(executablePath, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} "$@"\n`);
    fs.chmodSync(executablePath, 0o755);
  }
}

function runRembgWrapper(input: string, output: string, env: NodeJS.ProcessEnv, cwd = appRoot) {
  return spawnSync(process.execPath, [
    path.join(scriptsRoot, 'remove-background-rembg.mjs'),
    '--input', input,
    '--output', output,
  ], { cwd, encoding: 'utf8', env });
}

describe('screenshot reconstruction image scripts', () => {
  it('skips optional rembg removal when the CLI is unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-missing-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'cutout.png');
    const emptyBin = path.join(dir, 'empty-bin');
    fs.mkdirSync(emptyBin);
    fixtureScreenshot(input);

    const result = runRembgWrapper(input, output, { ...process.env, PATH: emptyBin });
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report).toMatchObject({ status: 'skipped', reason: 'rembg-unavailable', model: 'birefnet-general' });
    expect(fs.existsSync(output)).toBe(false);
  });

  it('uses BiRefNet General when optional rembg removal is available', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-success-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'cutout.png');
    const argsFile = path.join(dir, 'args.json');
    const binDir = path.join(dir, 'bin');
    fixtureScreenshot(input);
    writeFakeRembg(binDir, [
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "fs.writeFileSync(process.env.REMBG_ARGS_FILE, JSON.stringify(args));",
      "fs.copyFileSync(args.at(-2), args.at(-1));",
    ].join('\n'));

    const result = runRembgWrapper(input, output, {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      REMBG_ARGS_FILE: argsFile,
    }, binDir);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report).toMatchObject({ status: 'passed', model: 'birefnet-general', output });
    expect(JSON.parse(fs.readFileSync(argsFile, 'utf8'))).toEqual(['i', '-m', 'birefnet-general', input, output]);
    expect(fs.existsSync(output)).toBe(true);
  });

  it('reports rembg execution failures without blocking fallback', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-failure-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'cutout.png');
    const binDir = path.join(dir, 'bin');
    fixtureScreenshot(input);
    writeFakeRembg(binDir, [
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "fs.copyFileSync(args.at(-2), args.at(-1));",
      "console.error('model failed');",
      "process.exit(7);",
    ].join('\n'));

    const result = runRembgWrapper(input, output, {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    }, binDir);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report).toMatchObject({ status: 'failed', reason: 'rembg-exit', exitCode: 7 });
    expect(report.stderr).toContain('model failed');
    expect(fs.existsSync(output)).toBe(false);
  });

  it('cleans partial output after a post-launch rembg spawn error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-spawn-error-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'cutout.png');
    const binDir = path.join(dir, 'bin');
    fixtureScreenshot(input);
    writeFakeRembg(binDir, [
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "fs.copyFileSync(args.at(-2), args.at(-1));",
      "process.stdout.write('x'.repeat(2 * 1024 * 1024));",
    ].join('\n'));

    const result = runRembgWrapper(input, output, {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    }, binDir);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report).toMatchObject({ status: 'failed', reason: 'rembg-spawn' });
    expect(fs.existsSync(output)).toBe(false);
  });

  it('rejects identical input and output paths without deleting the source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-same-path-'));
    const input = path.join(dir, 'source.png');
    fixtureScreenshot(input);
    const source = fs.readFileSync(input);

    const result = runRembgWrapper(input, input, process.env);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Input and output paths must differ');
    expect(fs.readFileSync(input)).toEqual(source);
  });

  it('rejects output aliases that point to the input file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-alias-path-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'source-alias.png');
    const emptyBin = path.join(dir, 'empty-bin');
    fs.mkdirSync(emptyBin);
    fixtureScreenshot(input);
    fs.linkSync(input, output);
    const source = fs.readFileSync(input);

    const result = runRembgWrapper(input, output, { ...process.env, PATH: emptyBin });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Input and output paths must differ');
    expect(fs.readFileSync(input)).toEqual(source);
    expect(fs.readFileSync(output)).toEqual(source);
  });

  it('rejects a successful rembg exit that does not create output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-rembg-no-output-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'cutout.png');
    const binDir = path.join(dir, 'bin');
    fixtureScreenshot(input);
    fs.copyFileSync(input, output);
    writeFakeRembg(binDir, 'process.exit(0);\n');

    const result = runRembgWrapper(input, output, {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    }, binDir);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report).toMatchObject({ status: 'failed', reason: 'rembg-output-missing' });
    expect(fs.existsSync(output)).toBe(false);
  });

  it('prepares a source summary and chooses a collision-aware key colour', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-'));
    const input = path.join(dir, 'source.png');
    fixtureScreenshot(input);
    const prepared = JSON.parse(run('prepare-reconstruction-source.mjs', ['--input', input, '--viewport', '390x844']));
    expect(prepared.width).toBe(8);
    expect(prepared.height).toBe(6);
    expect(prepared.viewport).toEqual({ width: 390, height: 844, deviceScaleFactor: 1 });
    expect(prepared.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const probe = JSON.parse(run('probe-key-color.mjs', ['--input', input]));
    expect(['green', 'magenta', 'cyan', 'purple']).toContain(probe.key.name);
    expect(probe.key.name).toBe('magenta');
  });

  it('keys connected background and slices alpha components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-'));
    const input = path.join(dir, 'source.png');
    const keyed = path.join(dir, 'keyed.png');
    const outputDir = path.join(dir, 'slices');
    const manifest = path.join(dir, 'manifest.json');
    fixtureScreenshot(input);
    const keyReport = JSON.parse(run('key-transparent-image.mjs', ['--input', input, '--output', keyed, '--key', 'green']));
    expect(keyReport.output).toBe(keyed);
    expect(keyReport.transparentPixels).toBeGreaterThan(0);
    const sliceReport = JSON.parse(run('slice-alpha-components.mjs', ['--input', keyed, '--output-dir', outputDir, '--manifest', manifest, '--padding', '1']));
    expect(sliceReport.components).toBe(1);
    expect(JSON.parse(fs.readFileSync(manifest, 'utf8')).components).toHaveLength(1);
  });

  it('removes key-coloured background enclosed by foreground pixels', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-enclosed-'));
    const input = path.join(dir, 'ring.png');
    const output = path.join(dir, 'ring-transparent.png');
    const width = 7;
    const height = 7;
    const pixels = new Uint8Array(width * height * 4);
    const set = (x: number, y: number, rgba: [number, number, number, number]) => {
      pixels.set(rgba, (y * width + x) * 4);
    };
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) set(x, y, [0, 255, 0, 255]);
    for (let x = 2; x <= 4; x += 1) {
      set(x, 2, [255, 255, 255, 255]);
      set(x, 4, [255, 255, 255, 255]);
    }
    for (let y = 2; y <= 4; y += 1) {
      set(2, y, [255, 255, 255, 255]);
      set(4, y, [255, 255, 255, 255]);
    }
    writeRgbaPng(input, width, height, pixels);

    run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'green']);

    expect(pixelAt(readRgbaPng(output), 3, 3)[3]).toBe(0);
  });

  it('creates a despilled soft alpha for a key-colour edge blend', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-soft-edge-'));
    const input = path.join(dir, 'soft-edge.png');
    const output = path.join(dir, 'soft-edge-transparent.png');
    writeRgbaPng(input, 3, 1, new Uint8Array([
      255, 0, 255, 255,
      255, 128, 255, 255,
      255, 255, 255, 255,
    ]));

    const report = JSON.parse(run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'magenta']));
    const result = readRgbaPng(output);
    const edge = pixelAt(result, 1, 0);

    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
    expect(edge[1]).toBeGreaterThan(128);
    expect(pixelAt(result, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(report.hasSoftEdges).toBe(true);
    expect(report.mattingMode).toBe('global-soft-key');
  });

  it('keeps a neutral foreground edge neutral when the generated key colour drifts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-drifted-key-'));
    const input = path.join(dir, 'drifted-key.png');
    const output = path.join(dir, 'drifted-key-transparent.png');
    writeRgbaPng(input, 3, 1, new Uint8Array([
      240, 20, 235, 255,
      248, 138, 245, 255,
      255, 255, 255, 255,
    ]));

    run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'magenta']);

    const edge = pixelAt(readRgbaPng(output), 1, 0);
    const channels = edge.slice(0, 3);
    expect(edge[3]).toBeGreaterThan(96);
    expect(edge[3]).toBeLessThan(160);
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(3);
  });

  it('preserves near-key foreground colours away from the background boundary', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-near-key-foreground-'));
    const input = path.join(dir, 'near-key-foreground.png');
    const output = path.join(dir, 'near-key-foreground-transparent.png');
    const width = 9;
    const height = 9;
    const pixels = new Uint8Array(width * height * 4);
    const set = (x: number, y: number, rgba: [number, number, number, number]) => {
      pixels.set(rgba, (y * width + x) * 4);
    };
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) set(x, y, [255, 0, 255, 255]);
    for (let y = 1; y < 8; y += 1) for (let x = 1; x < 8; x += 1) set(x, y, [220, 20, 100, 255]);
    writeRgbaPng(input, width, height, pixels);

    run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'magenta']);

    expect(pixelAt(readRgbaPng(output), 4, 4)).toEqual([220, 20, 100, 255]);
  });

  it('selects a foreground edge colour by mixture fit instead of spatial ties', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-foreground-fit-'));
    const input = path.join(dir, 'foreground-fit.png');
    const output = path.join(dir, 'foreground-fit-transparent.png');
    const width = 5;
    const height = 3;
    const pixels = new Uint8Array(width * height * 4);
    const set = (x: number, y: number, rgba: [number, number, number, number]) => {
      pixels.set(rgba, (y * width + x) * 4);
    };
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) set(x, y, [255, 0, 255, 255]);
    set(1, 1, [248, 20, 143, 255]);
    set(2, 0, [255, 255, 255, 255]);
    set(3, 1, [240, 40, 30, 255]);
    writeRgbaPng(input, width, height, pixels);

    run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'magenta']);

    const edge = pixelAt(readRgbaPng(output), 1, 1);
    expect(edge[0]).toBeGreaterThan(200);
    expect(edge[1]).toBeLessThan(100);
    expect(edge[2]).toBeLessThan(100);
  });

  it('uses the fitted foreground colour instead of amplifying edge noise', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-noisy-edge-'));
    const input = path.join(dir, 'noisy-edge.png');
    const output = path.join(dir, 'noisy-edge-transparent.png');
    writeRgbaPng(input, 3, 1, new Uint8Array([
      255, 0, 255, 255,
      250, 128, 180, 255,
      255, 255, 255, 255,
    ]));

    run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'magenta']);

    const edge = pixelAt(readRgbaPng(output), 1, 0);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
    expect(Math.max(...edge.slice(0, 3)) - Math.min(...edge.slice(0, 3))).toBeLessThanOrEqual(3);
  });

  it('combines the soft matte with pre-existing transparency', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-existing-alpha-'));
    const input = path.join(dir, 'existing-alpha.png');
    const output = path.join(dir, 'existing-alpha-transparent.png');
    writeRgbaPng(input, 1, 1, new Uint8Array([255, 128, 255, 128]));

    run('key-transparent-image.mjs', ['--input', input, '--output', output, '--key', 'magenta']);

    const alpha = pixelAt(readRgbaPng(output), 0, 0)[3];
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(128);
  });

  it('rejects a near tolerance that does not create a soft matte range', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconstruction-thresholds-'));
    const input = path.join(dir, 'source.png');
    const output = path.join(dir, 'transparent.png');
    fixtureScreenshot(input);

    const result = spawnSync(process.execPath, [
      path.join(scriptsRoot, 'key-transparent-image.mjs'),
      '--input', input,
      '--output', output,
      '--key', 'green',
      '--tolerance', '40',
      '--near-tolerance', '40',
    ], { cwd: appRoot, encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--near-tolerance must be greater than --tolerance');
  });
});
