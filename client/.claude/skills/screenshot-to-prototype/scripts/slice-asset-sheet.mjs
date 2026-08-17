#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { cropPng, expandBounds, findAlphaBounds, readPng, writePng } from './png-utils.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/slice-asset-sheet.mjs --input sheet.png --output-dir candidates --grid 4x3 --names icon-a,banner-b --manifest candidates/candidate-manifest.json',
    '',
    'Options:',
    '  --input       Source transparent PNG sheet',
    '  --output-dir  Directory for extracted PNG assets',
    '  --grid        Grid size as COLSxROWS',
    '  --names       Optional comma-separated asset names',
    '  --manifest    Output manifest path',
    '  --padding     Transparent padding to keep around alpha bounds, default 1',
  ].join('\n');
}

function toKebabName(input, fallback) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || fallback;
}

function parseGrid(grid) {
  const match = String(grid || '').match(/^(\d+)x(\d+)$/iu);
  if (!match) throw new Error('--grid must use COLSxROWS, for example 4x3');
  const columns = Number(match[1]);
  const rows = Number(match[2]);
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new Error('--grid values must be positive integers');
  }
  return { columns, rows };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args['output-dir'] || !args.grid) {
    console.error(usage());
    process.exit(1);
  }

  const inputPath = path.resolve(String(args.input));
  const outputDir = path.resolve(String(args['output-dir']));
  const manifestPath = path.resolve(String(args.manifest || path.join(outputDir, 'candidate-manifest.json')));
  const padding = Math.max(0, Number(args.padding ?? 1));
  const { columns, rows } = parseGrid(args.grid);
  const names = String(args.names || '').split(',').map((item) => item.trim()).filter(Boolean);
  const image = readPng(inputPath);
  const cellWidth = Math.floor(image.width / columns);
  const cellHeight = Math.floor(image.height / rows);

  if (cellWidth < 1 || cellHeight < 1) {
    throw new Error('Grid creates empty cells; use fewer columns or rows');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const assets = [];
  let assetIndex = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = {
        x: column * cellWidth,
        y: row * cellHeight,
        width: column === columns - 1 ? image.width - column * cellWidth : cellWidth,
        height: row === rows - 1 ? image.height - row * cellHeight : cellHeight,
      };
      const alphaBounds = findAlphaBounds(image, cell);
      if (!alphaBounds) continue;

      const paddedBounds = expandBounds(alphaBounds, padding, image);
      const id = toKebabName(names[assetIndex], `asset-${String(assetIndex + 1).padStart(2, '0')}`);
      const file = `${id}.png`;
      writePng(path.join(outputDir, file), cropPng(image, paddedBounds));

      assets.push({
        id,
        file,
        width: paddedBounds.width,
        height: paddedBounds.height,
        sourceCell: { column, row },
        sourceBounds: paddedBounds,
        alphaBounds,
      });
      assetIndex += 1;
    }
  }

  const manifest = {
    schemaVersion: 1,
    source: path.relative(outputDir, inputPath) || path.basename(inputPath),
    grid: { columns, rows },
    assets,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'ok', manifest: manifestPath, assets: assets.length }, null, 2));
}

main();
