#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { alphaSummary, colorSummary, parseArgs, parseSize, readPng, writeJson } from './png-utils.mjs';

const usage = `Usage: node prepare-reconstruction-source.mjs --input source.png [--viewport WIDTHxHEIGHT] [--dpr 1] [--output report.json]`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return console.log(usage);
  if (!args.input) throw new Error(`${usage}\n--input is required`);
  const input = String(args.input);
  const image = readPng(input);
  const deviceScaleFactor = Number(args.dpr ?? args['device-scale-factor'] ?? 1);
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) throw new Error('--dpr must be a positive number');
  const viewport = {
    ...(args.viewport ? parseSize(args.viewport) : { width: image.width, height: image.height }),
    deviceScaleFactor,
  };
  const sourceBytes = fs.readFileSync(input);
  const summary = {
    status: 'ok',
    input,
    sha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
    width: image.width,
    height: image.height,
    dimensions: { width: image.width, height: image.height },
    viewport,
    color: colorSummary(image),
    alpha: alphaSummary(image),
  };
  writeJson(args.report || args.output, summary);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
