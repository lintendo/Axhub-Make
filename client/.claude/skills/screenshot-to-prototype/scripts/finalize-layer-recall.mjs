#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { cropPng, readPng, writeJson, writePng } from './png-utils.mjs';

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function regionsFrom(value, label) {
  if (value?.status === 'fallback-required') throw new Error(`${label} requires current-agent vision fallback before finalization`);
  if (!Array.isArray(value?.regions)) throw new Error(`${label} JSON 缺少 regions 数组`);
  return value.regions;
}

function toPixelBounds(bounds, image) {
  if (!bounds || !['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(Number(bounds[key])))) return null;
  const x = Math.max(0, Math.min(image.width, Math.floor(Number(bounds.left) * image.width / 1000)));
  const y = Math.max(0, Math.min(image.height, Math.floor(Number(bounds.top) * image.height / 1000)));
  const right = Math.max(0, Math.min(image.width, Math.ceil(Number(bounds.right) * image.width / 1000)));
  const bottom = Math.max(0, Math.min(image.height, Math.ceil(Number(bounds.bottom) * image.height / 1000)));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

function area(bounds) {
  return Math.max(0, bounds.width * bounds.height);
}

function intersection(left, right) {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const endX = Math.min(left.right, right.right);
  const endY = Math.min(left.bottom, right.bottom);
  return endX <= x || endY <= y ? 0 : (endX - x) * (endY - y);
}

function isDuplicate(candidate, existing) {
  const overlap = intersection(candidate, existing);
  if (!overlap) return false;
  const union = area(candidate) + area(existing) - overlap;
  return overlap / Math.min(area(candidate), area(existing)) >= 0.8 || overlap / union >= 0.7;
}

function ocrPixelBounds(region, image) {
  const points = Array.isArray(region?.points) ? region.points : [];
  const coordinates = points
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (coordinates.length) {
    const xs = coordinates.map(([x]) => x);
    const ys = coordinates.map(([, y]) => y);
    const x = Math.max(0, Math.floor(Math.min(...xs)));
    const y = Math.max(0, Math.floor(Math.min(...ys)));
    const right = Math.min(image.width, Math.ceil(Math.max(...xs)) + 1);
    const bottom = Math.min(image.height, Math.ceil(Math.max(...ys)) + 1);
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y), right, bottom };
  }
  const bounds = region?.bounds;
  if (!bounds) return null;
  const x = Math.max(0, Math.floor(Number(bounds.left ?? bounds.x)));
  const y = Math.max(0, Math.floor(Number(bounds.top ?? bounds.y)));
  const right = Math.min(image.width, Math.ceil(Number(bounds.right ?? (x + Number(bounds.width)))));
  const bottom = Math.min(image.height, Math.ceil(Number(bounds.bottom ?? (y + Number(bounds.height)))));
  if (![x, y, right, bottom].every(Number.isFinite)) return null;
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y), right, bottom };
}

function safeName(value, fallback) {
  const name = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return name || fallback;
}

function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      'pass-1': { type: 'string' },
      'pass-2': { type: 'string' },
      ocr: { type: 'string' },
      'text-regions': { type: 'string' },
      'out-dir': { type: 'string' },
    },
  });
  const textRegionsPath = values['text-regions'] || values.ocr;
  if (!values.source || !values['pass-1'] || !values['pass-2'] || !textRegionsPath || !values['out-dir']) {
    throw new Error('Usage: node finalize-layer-recall.mjs --source source.png --pass-1 pass-1.json --pass-2 pass-2.json --text-regions text-regions.json --out-dir final');
  }
  const sourcePath = path.resolve(values.source);
  const image = readPng(sourcePath);
  const pass1 = regionsFrom(readJson(values['pass-1'], 'pass-1'), 'pass-1');
  const pass2 = regionsFrom(readJson(values['pass-2'], 'pass-2'), 'pass-2');
  const ocr = readJson(textRegionsPath, 'text regions');
  const ocrBoxes = (Array.isArray(ocr?.regions) ? ocr.regions : [])
    .map((region) => ocrPixelBounds(region, image))
    .filter(Boolean);
  const outputDir = path.resolve(values['out-dir']);
  const referencesDir = path.join(outputDir, 'references');
  fs.mkdirSync(referencesDir, { recursive: true });

  const accepted = [];
  const skipped = [];
  const addPass = (regions, sourcePass) => {
    for (const [index, region] of regions.entries()) {
      const pixelBounds = toPixelBounds(region?.bounds, image);
      if (!pixelBounds) {
        skipped.push({ id: region?.id || `region-${sourcePass}-${index + 1}`, sourcePass, reason: 'invalid-bounds' });
        continue;
      }
      const ocrOverlap = ocrBoxes.some((box) => {
        const overlap = intersection(pixelBounds, box);
        return overlap / Math.max(1, area(pixelBounds)) >= 0.65;
      });
      if (sourcePass === 2 && ocrOverlap) {
        skipped.push({ id: region?.id || `region-${sourcePass}-${index + 1}`, sourcePass, reason: 'overlaps-ocr-mask' });
        continue;
      }
      const duplicate = accepted.find((item) => isDuplicate(pixelBounds, item.pixelBounds));
      if (duplicate) {
        skipped.push({ id: region?.id || `region-${sourcePass}-${index + 1}`, sourcePass, reason: 'duplicate', duplicateOf: duplicate.id });
        continue;
      }
      const baseId = safeName(region?.id, `asset-${sourcePass}-${index + 1}`);
      const id = accepted.some((item) => item.id === baseId) ? `${baseId}-${sourcePass}` : baseId;
      accepted.push({
        id,
        sourcePass,
        confidence: Number.isFinite(Number(region?.confidence)) ? Number(region.confidence) : null,
        normalizedBounds: {
          left: Math.round(pixelBounds.x * 1000 / image.width),
          top: Math.round(pixelBounds.y * 1000 / image.height),
          right: Math.round(pixelBounds.right * 1000 / image.width),
          bottom: Math.round(pixelBounds.bottom * 1000 / image.height),
        },
        pixelBounds,
      });
    }
  };
  addPass(pass1, 1);
  addPass(pass2, 2);

  for (const region of accepted) {
    const crop = cropPng(image, region.pixelBounds);
    const fileName = `${region.id}.png`;
    const cropPath = path.join(referencesDir, fileName);
    writePng(cropPath, crop);
    region.referencePath = path.join('references', fileName).split(path.sep).join('/');
    region.width = crop.width;
    region.height = crop.height;
    delete region.pixelBounds;
  }

  const matrixRegionsWithImages = accepted.map((region) => ({ ...region, pixelBounds: { x: 0, y: 0, width: region.width, height: region.height }, image: readPng(path.join(outputDir, region.referencePath)) }));
  // buildReferenceMatrix operates on source-style crops; compose from the saved references with the same deterministic grid.
  if (matrixRegionsWithImages.length) {
    const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(matrixRegionsWithImages.length))));
    const cellWidth = Math.max(...matrixRegionsWithImages.map((item) => item.width)) + 24;
    const cellHeight = Math.max(...matrixRegionsWithImages.map((item) => item.height)) + 24;
    const rows = Math.ceil(matrixRegionsWithImages.length / columns);
    const matrix = { width: columns * cellWidth, height: rows * cellHeight, data: Buffer.alloc(columns * cellWidth * rows * cellHeight * 4) };
    const cells = [];
    for (let index = 0; index < matrixRegionsWithImages.length; index += 1) {
      const item = matrixRegionsWithImages[index];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * cellWidth + Math.floor((cellWidth - item.width) / 2);
      const y = row * cellHeight + Math.floor((cellHeight - item.height) / 2);
      for (let cropY = 0; cropY < item.height; cropY += 1) {
        const sourceStart = cropY * item.width * 4;
        const targetStart = ((y + cropY) * matrix.width + x) * 4;
        item.image.data.copy(matrix.data, targetStart, sourceStart, sourceStart + item.width * 4);
      }
      cells.push({ id: item.id, x, y, width: item.width, height: item.height, sourcePass: item.sourcePass });
    }
    writePng(path.join(outputDir, 'asset-reference-matrix.png'), matrix);
    writeJson(path.join(outputDir, 'asset-reference-matrix.json'), { schemaVersion: 1, status: 'ok', columns, rows, cellWidth, cellHeight, width: matrix.width, height: matrix.height, transparentBackground: true, cells });
  }

  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  writeJson(path.join(outputDir, 'merged-regions.json'), {
    schemaVersion: 1,
    status: 'ok',
    source: sourcePath,
    sourceSha256,
    ocrSubmitted: false,
    padding: 0,
    summary: { pass1: pass1.length, pass2: pass2.length, textRegionCount: ocrBoxes.length, duplicatesRemoved: skipped.filter((item) => item.reason === 'duplicate').length, skipped: skipped.length, merged: accepted.length },
    regions: accepted,
    skipped,
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
