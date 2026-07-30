#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { connectedAlphaComponents, cropPng, expandBounds, mergeNearbyComponents, numberArg, parseArgs, readPng, writePng } from './png-utils.mjs';

const usage = `Usage: node slice-alpha-components.mjs --input transparent.png --output-dir components [--manifest manifest.json] [--padding 1] [--merge-distance 2] [--alpha-threshold 8] [--min-area 1]`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return console.log(usage);
  if (!args.input || !(args['output-dir'] || args.output)) throw new Error(`${usage}\n--input and --output-dir are required`);
  const outputDir = path.resolve(String(args['output-dir'] || args.output));
  const manifestPath = path.resolve(String(args.manifest || path.join(outputDir, 'alpha-components.json')));
  const padding = numberArg(args.padding, 1, 'padding', { min: 0, integer: true });
  const mergeDistance = numberArg(args['merge-distance'], 2, 'merge-distance', { min: 0 });
  const alphaThreshold = numberArg(args['alpha-threshold'], 8, 'alpha-threshold', { min: 0, max: 255, integer: true });
  const minArea = numberArg(args['min-area'], 1, 'min-area', { min: 1, integer: true });
  const prefix = String(args.prefix || 'component');
  const image = readPng(args.input);
  const initial = connectedAlphaComponents(image, alphaThreshold).filter((component) => component.pixels >= minArea);
  const components = mergeNearbyComponents(initial, mergeDistance);
  fs.mkdirSync(outputDir, { recursive: true });
  const entries = components.map((component, index) => {
    const sourceBounds = expandBounds(component.bounds, padding, image);
    const id = `${prefix}-${String(index + 1).padStart(3, '0')}`;
    const file = `${id}.png`;
    writePng(path.join(outputDir, file), cropPng(image, sourceBounds));
    return {
      id, file, width: sourceBounds.width, height: sourceBounds.height, pixels: component.pixels,
      fragments: component.fragments, alphaBounds: component.bounds, sourceBounds, padding,
    };
  });
  const manifest = {
    schemaVersion: 1, source: path.relative(path.dirname(manifestPath), path.resolve(args.input)),
    width: image.width, height: image.height, alphaThreshold, minArea, mergeDistance, padding,
    components: entries, assets: entries,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(JSON.stringify({ status: 'ok', input: args.input, outputDir, manifest: manifestPath, components: entries.length, fragments: initial.length }) + '\n');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
