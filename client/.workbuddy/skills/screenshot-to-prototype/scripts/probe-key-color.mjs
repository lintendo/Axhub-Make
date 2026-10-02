#!/usr/bin/env node
import { KEY_COLORS, colorDistance, parseArgs, readPng, rgbToHex, writeJson } from './png-utils.mjs';

const usage = `Usage: node probe-key-color.mjs --input source.png [--tolerance 24] [--report report.json]`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return console.log(usage);
  if (!args.input) throw new Error(`${usage}\n--input is required`);
  const tolerance = Number(args.tolerance ?? 24);
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('--tolerance must be a non-negative number');
  const image = readPng(args.input);
  const totalPixels = image.width * image.height;
  const candidates = Object.entries(KEY_COLORS).map(([name, rgb]) => {
    let collisionPixels = 0;
    let nearestDistance = Infinity;
    let distanceTotal = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (image.data[offset + 3] === 0) continue;
      const distance = colorDistance(image.data, offset, rgb);
      nearestDistance = Math.min(nearestDistance, distance);
      distanceTotal += distance;
      if (distance <= tolerance) collisionPixels += 1;
    }
    return {
      name,
      rgb,
      hex: rgbToHex(rgb),
      collisionPixels,
      collisionRatio: collisionPixels / totalPixels,
      meanDistance: distanceTotal / Math.max(1, totalPixels),
      nearestDistance: Number.isFinite(nearestDistance) ? nearestDistance : null,
    };
  });
  const key = candidates.reduce((best, candidate) => candidate.collisionPixels < best.collisionPixels ? candidate : best);
  const result = { status: 'ok', input: args.input, width: image.width, height: image.height, tolerance, key, candidates };
  writeJson(args.report, result);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
