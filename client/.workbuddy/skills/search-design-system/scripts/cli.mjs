#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { fetchArtifact } from './lib/fetch-artifact.mjs';
import { CONTRACT, search } from './lib/index.mjs';
import { installTheme } from './lib/install-theme.mjs';

export const DEFAULT_MANIFEST_URL = 'https://lintendo.github.io/Make-Template/knowledge/latest/manifest.json';
const DEFAULT_ALLOWED_ORIGIN = 'https://lintendo.github.io';
const DEFAULT_ALLOWED_BASE_PATH = '/Make-Template/knowledge/';

export function resolveSearchSource(options = {}) {
  if (options.indexPath || options.index) {
    return options.indexPath
      ? { indexPath: options.indexPath, ...(options.localRoot ? { localRoot: options.localRoot } : {}) }
      : { index: options.index, ...(options.localRoot ? { localRoot: options.localRoot } : {}) };
  }
  if (options.manifestUrl) return {
    manifestUrl: options.manifestUrl,
    ...(options.allowedOrigin ? { allowedOrigin: options.allowedOrigin } : {}),
    ...(options.allowedBasePath ? { allowedBasePath: options.allowedBasePath } : {}),
  };
  if (options.online) throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'manifest' } });
  return {
    source: 'bundled',
    ...(options.snapshotRoot ? { snapshotRoot: options.snapshotRoot } : {}),
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'search';
  const options = { command };
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--offline') options.offline = true;
    else if (flag === '--allow-stale-cache') options.allowStaleCache = true;
    else if (flag === '--online') options.online = true;
    else {
      const value = args.shift();
      if (value === undefined) throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { flag } });
      const key = {
        '--request': 'requestPath',
        '--index': 'indexPath',
        '--manifest': 'manifestUrl',
        '--cache': 'cacheDir',
        '--local-root': 'localRoot',
        '--snapshot-root': 'snapshotRoot',
        '--project-root': 'projectRoot',
        '--allowed-origin': 'allowedOrigin',
        '--allowed-base-path': 'allowedBasePath',
        '--expected-hash': 'expectedHash',
        '--cached-index-hash': 'cachedIndexHash',
        '--kind': 'kind',
        '--timeout-ms': 'timeoutMs',
      }[flag];
      if (!key) throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { flag } });
      options[key] = value;
    }
  }
  return options;
}

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readInput(file) {
  try {
    return JSON.parse(file ? await fs.readFile(file, 'utf8') : await stdin());
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) {
      throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'request' } });
    }
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const explicitSourceCount = Number(Boolean(options.indexPath)) + Number(Boolean(options.manifestUrl)) + Number(Boolean(options.online));
  if (options.command === 'search' && explicitSourceCount > 1 && !(options.online && options.manifestUrl && !options.indexPath)) {
    throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'source' } });
  }
  if (options.command === 'search' && options.online && !options.manifestUrl) {
    throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'manifest' } });
  }
  if (options.command === 'search' && options.offline && !options.manifestUrl) {
    throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'offline' } });
  }
  const input = await readInput(options.requestPath);
  if (options.command === 'search') {
    const source = resolveSearchSource(options);
    if (source.source === 'bundled' && !source.snapshotRoot && !source.startDir) {
      source.startDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
    }
    return search(input, { ...options, ...source });
  }
  if (options.command === 'install') {
    const timeoutMs = options.timeoutMs === undefined ? undefined : Number(options.timeoutMs);
    if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)) {
      throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'timeoutMs' } });
    }
    const projectRoot = options.projectRoot ?? input.projectRoot;
    if (!projectRoot) throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { field: 'projectRoot' } });
    return installTheme({
      themeId: input.themeId,
      platform: input.platform,
      projectRoot,
      snapshotRoot: options.snapshotRoot,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  }
  if (options.command === 'fetch') return fetchArtifact(input, {
    ...(!options.allowedOrigin ? {
      allowedOrigin: DEFAULT_ALLOWED_ORIGIN,
      allowedBasePath: DEFAULT_ALLOWED_BASE_PATH,
    } : {}),
    ...options,
  });
  throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST', details: { command: options.command } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await main();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: CONTRACT.schemaVersion,
      taxonomyVersion: CONTRACT.taxonomyVersion,
      searchContractVersion: CONTRACT.searchContractVersion,
      results: [],
      error: { code: error?.code ?? 'INVALID_REQUEST', details: error?.details ?? {} },
    })}\n`);
    process.exitCode = 1;
  }
}

export { search, fetchArtifact, installTheme };
