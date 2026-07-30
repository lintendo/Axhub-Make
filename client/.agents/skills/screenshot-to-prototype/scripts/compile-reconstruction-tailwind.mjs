#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}
function quoteSource(file) { return file.replaceAll('\\', '/').replaceAll('"', '\\"'); }
function scopeCss(css, scope) {
  if (!scope) return css;
  return css.replace(/^(\s*)(\.[^{}\n]+)\s*\{/gmu, (match, indent, selector) => {
    const scoped = selector.split(',').map((item) => `${scope} ${item.trim()}`).join(', ');
    return `${indent}${scoped} {`;
  });
}

async function main() {
  const flags = args(process.argv);
  if (!flags.spec || !flags.output) throw new Error('Usage: --spec <spec.html> --output <tailwind.css> [--prefix recon|--scope .recon]');
  const spec = path.resolve(flags.spec);
  const output = path.resolve(flags.output);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-reconstruction-tailwind-'));
  const entry = path.join(work, 'entry.css');
  const prefix = flags.prefix ? ` prefix(${String(flags.prefix).replace(/[^a-z0-9_-]/giu, '')})` : '';
  const tailwindEntry = fileURLToPath(await import.meta.resolve('tailwindcss'));
  const tailwindRoot = path.resolve(path.dirname(tailwindEntry), '..');
  fs.mkdirSync(path.join(work, 'node_modules'), { recursive: true });
  fs.symlinkSync(tailwindRoot, path.join(work, 'node_modules/tailwindcss'), 'junction');
  fs.writeFileSync(entry, `@import "tailwindcss/theme.css" layer(theme)${prefix};\n@import "tailwindcss/utilities.css" layer(utilities)${prefix};\n@source "${quoteSource(spec)}";\n`);
  try {
    const result = await build({
      root: work,
      logLevel: 'error',
      plugins: [tailwindcss()],
      build: { write: false, cssMinify: false, rollupOptions: { input: entry } },
    });
    const cssAsset = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output || []).find((item) => item.type === 'asset' && item.fileName.endsWith('.css'));
    if (!cssAsset || typeof cssAsset.source !== 'string') throw new Error('Tailwind did not emit CSS');
    const css = scopeCss(cssAsset.source, flags.scope ? String(flags.scope) : '');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, css);
    process.stdout.write(`${JSON.stringify({ output, spec, prefix: flags.prefix || null, scope: flags.scope || null })}\n`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
