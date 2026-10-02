#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readPng, writeJson } from './png-utils.mjs';

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizedBoundsFromPixels(pixelBounds, image) {
  return {
    left: Math.max(0, Math.min(1000, Math.round(pixelBounds.left * 1000 / image.width))),
    top: Math.max(0, Math.min(1000, Math.round(pixelBounds.top * 1000 / image.height))),
    right: Math.max(0, Math.min(1000, Math.round(pixelBounds.right * 1000 / image.width))),
    bottom: Math.max(0, Math.min(1000, Math.round(pixelBounds.bottom * 1000 / image.height))),
  };
}

function pixelBoundsFromOcr(region, image) {
  const coordinates = (Array.isArray(region?.points) ? region.points : [])
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (coordinates.length) {
    const xs = coordinates.map(([x]) => x);
    const ys = coordinates.map(([, y]) => y);
    return {
      left: Math.max(0, Math.floor(Math.min(...xs))),
      top: Math.max(0, Math.floor(Math.min(...ys))),
      right: Math.min(image.width, Math.ceil(Math.max(...xs)) + 1),
      bottom: Math.min(image.height, Math.ceil(Math.max(...ys)) + 1),
    };
  }
  const bounds = region?.bounds;
  if (!bounds) return null;
  const left = Number(bounds.left ?? bounds.x);
  const top = Number(bounds.top ?? bounds.y);
  const right = Number(bounds.right ?? (left + Number(bounds.width)));
  const bottom = Number(bounds.bottom ?? (top + Number(bounds.height)));
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    left: Math.max(0, Math.floor(left)),
    top: Math.max(0, Math.floor(top)),
    right: Math.min(image.width, Math.ceil(right)),
    bottom: Math.min(image.height, Math.ceil(bottom)),
  };
}

function normalizeOcr(ocr, image) {
  const regions = Array.isArray(ocr?.regions) ? ocr.regions : Array.isArray(ocr) ? ocr : [];
  return regions.flatMap((region, index) => {
    const pixelBounds = pixelBoundsFromOcr(region, image);
    if (!pixelBounds || pixelBounds.right <= pixelBounds.left || pixelBounds.bottom <= pixelBounds.top) return [];
    const confidence = Number(region?.score ?? region?.confidence);
    return [{
      id: typeof region?.id === 'string' && region.id.trim() ? region.id.trim() : `ocr-${index + 1}`,
      text: typeof region?.text === 'string' ? region.text : '',
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      bounds: normalizedBoundsFromPixels(pixelBounds, image),
      points: [
        [pixelBounds.left, pixelBounds.top],
        [pixelBounds.right - 1, pixelBounds.top],
        [pixelBounds.right - 1, pixelBounds.bottom - 1],
        [pixelBounds.left, pixelBounds.bottom - 1],
      ],
    }];
  });
}

function normalizeVision(vision, image) {
  if (vision?.status === 'fallback-required') {
    return { status: 'fallback-required', source: 'current-agent', regions: [] };
  }
  if (!Array.isArray(vision?.regions)) throw new Error('Vision text JSON 缺少 regions 数组');
  const source = vision.provider === 'visual-api' ? 'vision-api' : 'current-agent';
  const regions = vision.regions.flatMap((region, index) => {
    const bounds = region?.bounds;
    if (!bounds || !['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(Number(bounds[key])))) return [];
    const normalized = Object.fromEntries(['left', 'top', 'right', 'bottom'].map((key) => [key, Math.max(0, Math.min(1000, Math.round(Number(bounds[key]))))]));
    if (normalized.right <= normalized.left || normalized.bottom <= normalized.top) return [];
    const confidence = Number(region?.confidence);
    const pixelBounds = {
      left: Math.max(0, Math.floor(normalized.left * image.width / 1000)),
      top: Math.max(0, Math.floor(normalized.top * image.height / 1000)),
      right: Math.min(image.width, Math.ceil(normalized.right * image.width / 1000)),
      bottom: Math.min(image.height, Math.ceil(normalized.bottom * image.height / 1000)),
    };
    return [{
      id: typeof region?.id === 'string' && region.id.trim() ? region.id.trim() : `text-${index + 1}`,
      text: typeof region?.text === 'string' ? region.text : '',
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      bounds: normalized,
      points: [
        [pixelBounds.left, pixelBounds.top],
        [pixelBounds.right - 1, pixelBounds.top],
        [pixelBounds.right - 1, pixelBounds.bottom - 1],
        [pixelBounds.left, pixelBounds.bottom - 1],
      ],
    }];
  });
  return { status: 'ok', source, regions };
}

function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      ocr: { type: 'string' },
      vision: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.source || !values.out) {
    throw new Error('Usage: node normalize-text-regions.mjs --source source.png [--ocr ocr.json | --vision vision-text.json] --out text-regions.json');
  }
  const sourcePath = path.resolve(values.source);
  const outputPath = path.resolve(values.out);
  if (sourcePath === outputPath) throw new Error('Source and output paths must differ');
  const image = readPng(sourcePath);
  let normalized;
  if (values.ocr && fs.existsSync(values.ocr)) {
    normalized = { status: 'ok', source: 'ocr', regions: normalizeOcr(readJson(values.ocr, 'OCR'), image) };
  } else if (values.vision) {
    normalized = normalizeVision(readJson(values.vision, 'vision text'), image);
  } else {
    throw new Error('OCR is unavailable; run request-vision.mjs --kind text, then pass its result with --vision');
  }
  writeJson(outputPath, {
    schemaVersion: 1,
    ...normalized,
    sourceImage: sourcePath,
    sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
