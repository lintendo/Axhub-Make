#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readPng, writeJson, writePng } from './png-utils.mjs';

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function regionList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.regions)) return value.regions;
  return [];
}

function normalizedBounds(bounds, image) {
  if (!bounds || !['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(Number(bounds[key])))) return null;
  const left = Math.max(0, Math.min(image.width, Math.floor(Number(bounds.left) * image.width / 1000)));
  const top = Math.max(0, Math.min(image.height, Math.floor(Number(bounds.top) * image.height / 1000)));
  const right = Math.max(left, Math.min(image.width, Math.ceil(Number(bounds.right) * image.width / 1000)));
  const bottom = Math.max(top, Math.min(image.height, Math.ceil(Number(bounds.bottom) * image.height / 1000)));
  return { x: left, y: top, right, bottom, width: right - left, height: bottom - top };
}

function ocrBounds(region, image) {
  const points = Array.isArray(region?.points) ? region.points : [];
  const coordinates = points
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (coordinates.length) {
    const xs = coordinates.map(([x]) => x);
    const ys = coordinates.map(([, y]) => y);
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const right = Math.min(image.width, Math.ceil(Math.max(...xs)) + 1);
    const bottom = Math.min(image.height, Math.ceil(Math.max(...ys)) + 1);
    return { x: left, y: top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  const bounds = region?.bounds;
  if (!bounds) return null;
  const left = Math.max(0, Math.floor(Number(bounds.left ?? bounds.x)));
  const top = Math.max(0, Math.floor(Number(bounds.top ?? bounds.y)));
  const right = Math.min(image.width, Math.ceil(Number(bounds.right ?? (left + Number(bounds.width)))));
  const bottom = Math.min(image.height, Math.ceil(Number(bounds.bottom ?? (top + Number(bounds.height)))));
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return { x: left, y: top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function paint(image, bounds, rgba) {
  for (let y = bounds.y; y < bounds.bottom; y += 1) {
    for (let x = bounds.x; x < bounds.right; x += 1) image.data.set(rgba, (y * image.width + x) * 4);
  }
}

function sameFile(left, right) {
  if (path.resolve(left) === path.resolve(right)) return true;
  try {
    const leftStat = fs.statSync(left);
    const rightStat = fs.statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      regions: { type: 'string' },
      ocr: { type: 'string' },
      'text-regions': { type: 'string' },
      out: { type: 'string' },
      report: { type: 'string' },
    },
  });
  const textRegionsPath = values['text-regions'] || values.ocr;
  if (!values.source || !values.regions || !textRegionsPath || !values.out) {
    throw new Error('Usage: node mask-layer-recall.mjs --source source.png --regions pass-1.json --text-regions text-regions.json --out masked.png [--report masked.json]');
  }
  const sourcePath = values.source;
  if (sameFile(sourcePath, values.out)) throw new Error('Source and output paths must differ');
  if (values.report && (sameFile(sourcePath, values.report) || path.resolve(values.out) === path.resolve(values.report))) {
    throw new Error('Source, output, and report paths must differ');
  }
  const image = readPng(sourcePath);
  const pass1 = regionList(readJson(values.regions, 'regions'));
  const ocr = regionList(readJson(textRegionsPath, 'text regions'));
  const boxes = [];
  for (const [index, region] of pass1.entries()) {
    const bounds = normalizedBounds(region?.bounds, image);
    if (!bounds || !bounds.width || !bounds.height) continue;
    paint(image, bounds, [238, 238, 238, 255]);
    boxes.push({ source: 'pass-1', id: region.id || `asset-${index + 1}`, bounds });
  }
  for (const [index, region] of ocr.entries()) {
    const bounds = ocrBounds(region, image);
    if (!bounds || !bounds.width || !bounds.height) continue;
    paint(image, bounds, [238, 238, 238, 255]);
    boxes.push({ source: 'ocr', id: region.id || `ocr-${index + 1}`, bounds });
  }
  fs.mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  writePng(values.out, image);
  writeJson(values.report, {
    schemaVersion: 1,
    status: 'ok',
    source: sourcePath,
    sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
    output: values.out,
    padding: 0,
    ocrSubmitted: false,
    regionCount: pass1.length,
    ocrCount: ocr.length,
    textRegionCount: ocr.length,
    maskedCount: boxes.length,
    boxes,
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
