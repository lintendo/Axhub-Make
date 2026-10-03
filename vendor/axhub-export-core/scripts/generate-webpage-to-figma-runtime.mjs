import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'tsup';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const repositoryRoot = resolve(packageDir, '../..');
const entryPath = resolve(scriptDir, 'webpage-to-figma-runtime-entry.ts');
const outputPath = resolve(
  repositoryRoot,
  'apps/skills/skills/figma-content-operator/assets/webpage-to-figma-runtime.js',
);
const temporaryOutput = mkdtempSync(resolve(tmpdir(), 'axhub-webpage-to-figma-runtime-'));

try {
  await build({
    entry: [entryPath],
    format: ['iife'],
    platform: 'browser',
    target: 'es2020',
    outDir: temporaryOutput,
    clean: false,
    dts: false,
    minify: true,
    splitting: false,
    sourcemap: false,
    silent: true,
  });
  const generatedFile = readdirSync(temporaryOutput).find((name) => name.endsWith('.global.js'));
  if (!generatedFile) {
    throw new Error(`Generated runtime was not found in ${temporaryOutput}`);
  }
  const source = readFileSync(resolve(temporaryOutput, generatedFile), 'utf8');
  writeFileSync(
    outputPath,
    `/* Generated from Axhub-owned axhub-export-core for Figma-compatible clipboard capture. */\n${source}`,
  );
  process.stdout.write(`${outputPath}\n`);
} finally {
  rmSync(temporaryOutput, { recursive: true, force: true });
}
