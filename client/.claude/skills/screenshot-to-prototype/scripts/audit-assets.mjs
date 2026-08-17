#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { findAlphaBounds, readPng } from './png-utils.mjs';

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    console.error('Usage: node scripts/audit-assets.mjs --manifest .local/screenshot-to-prototype/<slug>/candidate-manifest.json');
    process.exit(1);
  }

  const manifestPath = path.resolve(String(args.manifest));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestDir = path.dirname(manifestPath);
  const results = [];

  for (const asset of manifest.assets || []) {
    const file = String(asset.file || '');
    const assetPath = path.resolve(manifestDir, file);
    const issues = [];

    if (!file || !fs.existsSync(assetPath)) {
      issues.push('missing-file');
      results.push({ id: asset.id || file, file, status: 'failed', issues });
      continue;
    }

    const image = readPng(assetPath);
    const alphaBounds = findAlphaBounds(image);
    if (!image.hasAlphaChannel) issues.push('missing-alpha-channel');
    if (!alphaBounds) issues.push('empty-transparent-image');
    if (alphaBounds) {
      if (alphaBounds.x === 0 || alphaBounds.y === 0 || alphaBounds.x + alphaBounds.width === image.width || alphaBounds.y + alphaBounds.height === image.height) {
        issues.push('alpha-touches-edge');
      }
      const transparentCorners = [
        image.data[3],
        image.data[(image.width - 1) * 4 + 3],
        image.data[((image.height - 1) * image.width) * 4 + 3],
        image.data[((image.height * image.width) - 1) * 4 + 3],
      ].filter((alpha) => alpha <= 8).length;
      if (transparentCorners < 3) issues.push('opaque-corners');
    }
    if (asset.width && Number(asset.width) !== image.width) issues.push('manifest-width-mismatch');
    if (asset.height && Number(asset.height) !== image.height) issues.push('manifest-height-mismatch');

    results.push({
      id: asset.id || file,
      file,
      width: image.width,
      height: image.height,
      status: issues.length ? 'failed' : 'passed',
      issues,
    });
  }

  const failed = results.filter((result) => result.status !== 'passed').length;
  const report = {
    status: failed ? 'failed' : 'passed',
    summary: {
      total: results.length,
      passed: results.length - failed,
      failed,
    },
    assets: results,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed) process.exitCode = 1;
}

main();
