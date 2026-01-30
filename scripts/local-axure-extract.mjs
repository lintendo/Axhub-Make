#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import extractZip from 'extract-zip';

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function truncateName(name, maxLength = 40) {
  if (!name) return name;
  return name.length > maxLength ? name.slice(0, maxLength) : name;
}

function sanitizeBasename(name) {
  return (name || 'axure')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function inferContentDir(extractDirAbs) {
  const entries = fs
    .readdirSync(extractDirAbs, { withFileTypes: true })
    .filter(entry => entry.name !== '__MACOSX' && entry.name !== '.DS_Store');

  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(extractDirAbs, entries[0].name);
  }

  return extractDirAbs;
}

async function main() {
  const [zipPathArg, originalFilenameArg] = process.argv.slice(2);

  if (!zipPathArg) {
    console.error('Usage: local-axure-extract.mjs <zipPath> [originalFilename]');
    process.exit(1);
  }

  const zipPath = path.resolve(process.cwd(), zipPathArg);
  if (!fs.existsSync(zipPath)) {
    console.error(`Zip not found: ${zipPath}`);
    process.exit(1);
  }

  const originalFilename = originalFilenameArg || path.basename(zipPath);
  const baseNameRaw = path.basename(originalFilename, path.extname(originalFilename));
  const baseName = truncateName(sanitizeBasename(baseNameRaw));
  const timestamp = Date.now();

  const extractDirRel = normalizePath(path.join('temp', `local-axure-${baseName}-${timestamp}`));
  const extractDirAbs = path.resolve(process.cwd(), extractDirRel);

  fs.mkdirSync(extractDirAbs, { recursive: true });

  await extractZip(zipPath, { dir: extractDirAbs });

  const contentDirAbs = inferContentDir(extractDirAbs);
  const contentDirRel = normalizePath(path.relative(process.cwd(), contentDirAbs));

  process.stdout.write(
    JSON.stringify({
      extractDir: extractDirRel,
      contentDir: contentDirRel,
    }),
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
