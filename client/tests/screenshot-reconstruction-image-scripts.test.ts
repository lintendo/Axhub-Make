import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

describe('screenshot reconstruction image scripts', () => {
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
});
