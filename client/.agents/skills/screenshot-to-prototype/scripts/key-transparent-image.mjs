#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { colorDistance, findAlphaBounds, numberArg, parseArgs, parseColor, readPng, writeJson, writePng } from './png-utils.mjs';

const usage = `Usage: node key-transparent-image.mjs --input keyed.png --output transparent.png --key green|magenta|cyan|purple|#rrggbb [--tolerance 40] [--near-tolerance 64] [--report report.json]`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return console.log(usage);
  if (!args.input || !args.output || !(args.key || args['key-color'])) throw new Error(`${usage}\n--input, --output, and --key are required`);
  const tolerance = numberArg(args.tolerance, 40, 'tolerance', { min: 0, max: 441.7 });
  const nearTolerance = numberArg(args['near-tolerance'], Math.min(441.7, tolerance + 24), 'near-tolerance', { min: tolerance, max: 441.7 });
  const key = parseColor(args.key || args['key-color']);
  const image = readPng(args.input);
  const totalPixels = image.width * image.height;
  const removed = new Uint8Array(totalPixels);
  const queue = [];
  const enqueue = (index) => {
    if (removed[index] || image.data[index * 4 + 3] === 0 || colorDistance(image.data, index * 4, key.rgb) > tolerance) return;
    removed[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < image.width; x += 1) {
    enqueue(x);
    if (image.height > 1) enqueue((image.height - 1) * image.width + x);
  }
  for (let y = 1; y + 1 < image.height; y += 1) {
    enqueue(y * image.width);
    if (image.width > 1) enqueue(y * image.width + image.width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < image.width) enqueue(index + 1);
    if (y > 0) enqueue(index - image.width);
    if (y + 1 < image.height) enqueue(index + image.width);
  }

  let preexistingTransparentPixels = 0;
  let residualKeyPixels = 0;
  let nearKeyOpaquePixels = 0;
  let edgeContaminationPixels = 0;
  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4;
    if (image.data[offset + 3] === 0) preexistingTransparentPixels += 1;
    if (removed[index]) image.data[offset + 3] = 0;
    if (image.data[offset + 3] === 0) continue;
    const distance = colorDistance(image.data, offset, key.rgb);
    if (distance <= tolerance) residualKeyPixels += 1;
    else if (distance <= nearTolerance) nearKeyOpaquePixels += 1;
    if (distance <= nearTolerance) {
      const x = index % image.width;
      const y = Math.floor(index / image.width);
      const touchesImageEdge = x === 0 || y === 0 || x + 1 === image.width || y + 1 === image.height;
      const touchesRemoved = (x > 0 && removed[index - 1]) || (x + 1 < image.width && removed[index + 1])
        || (y > 0 && removed[index - image.width]) || (y + 1 < image.height && removed[index + image.width]);
      if (touchesImageEdge || touchesRemoved) edgeContaminationPixels += 1;
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  writePng(args.output, image);
  const transparentPixels = preexistingTransparentPixels + queue.length;
  const contentPixels = totalPixels - transparentPixels;
  const contentRatio = contentPixels / totalPixels;
  const contentBounds = findAlphaBounds(image);
  const emptyCutoutRisk = contentRatio < 0.01 ? 'high' : contentRatio < 0.05 ? 'medium' : 'low';
  const quality = {
    contentPixels,
    contentRatio,
    contentBounds,
    residualKeyPixels,
    residualKeyRatio: residualKeyPixels / totalPixels,
    nearKeyOpaquePixels,
    nearKeyOpaqueRatio: nearKeyOpaquePixels / totalPixels,
    emptyCutoutRisk,
    riskOfEmptyCutout: emptyCutoutRisk !== 'low',
    edgeContaminationPixels,
    edgeContaminationRatio: edgeContaminationPixels / totalPixels,
  };
  const report = {
    status: 'ok', input: args.input, output: args.output, width: image.width, height: image.height,
    key, tolerance, nearTolerance, transparentPixels, newlyTransparentPixels: queue.length,
    preexistingTransparentPixels, ...quality, quality,
  };
  writeJson(args.report, report);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
