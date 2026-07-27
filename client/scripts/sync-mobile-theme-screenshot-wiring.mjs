import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { listMobileThemeDirs } from './mobile-theme-screenshots/model.mjs';

const importBlock = [
  "import productScreenshot01 from './assets/product-screenshot-01.webp?url';",
  "import productScreenshot02 from './assets/product-screenshot-02.webp?url';",
  "import productScreenshot03 from './assets/product-screenshot-03.webp?url';",
].join('\n');

const previewInitializer = `[
    { type: 'product-screenshot', url: productScreenshot01 },
    { type: 'product-screenshot', url: productScreenshot02 },
    { type: 'product-screenshot', url: productScreenshot03 },
  ]`;

export function rewriteMobileThemeEntry(source, fileName = 'index.tsx') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === './assets/cover.svg?url') {
      edits.push({ start: statement.getStart(sourceFile), end: statement.getEnd(), text: importBlock });
    }
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'previewImages') {
      edits.push({ start: node.initializer.getStart(sourceFile), end: node.initializer.getEnd(), text: previewInitializer });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (edits.length !== 2) throw new Error(`${fileName}: expected cover import and config.previewImages edit`);
  return edits.sort((a, b) => b.start - a.start).reduce(
    (text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`,
    source,
  );
}

function themeIsReady(themeDir) {
  const themePath = path.join(themeDir, 'theme.json');
  if (!fs.existsSync(themePath)) return { ok: false, reason: 'theme.json missing' };
  let theme;
  try { theme = JSON.parse(fs.readFileSync(themePath, 'utf8')); } catch { return { ok: false, reason: 'invalid theme.json' }; }
  const records = theme.assets?.productScreenshots;
  if (!Array.isArray(records) || records.length !== 3) return { ok: false, reason: 'metadata must contain exactly 3 productScreenshots' };
  for (let i = 0; i < 3; i += 1) {
    const expected = `assets/product-screenshot-0${i + 1}.webp`;
    const record = records[i];
    if (record?.type !== 'product-screenshot' || record.path !== expected) return { ok: false, reason: `metadata missing ${expected}` };
    if (!fs.existsSync(path.join(themeDir, expected))) return { ok: false, reason: `${expected} missing` };
  }
  return { ok: true };
}

export function parseCliArgs(argv) {
  const options = { check: false, all: false, theme: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--theme') options.theme = argv[++i];
    else throw new Error(`UNKNOWN_ARGUMENT ${arg}`);
  }
  if (options.all && options.theme) throw new Error('USAGE --all and --theme are mutually exclusive');
  if (!options.all && !options.theme) options.all = true;
  return options;
}

export function syncMobileThemeScreenshotWiring({ themesRoot, check = false, all = true, theme } = {}) {
  const dirs = all ? listMobileThemeDirs(themesRoot) : [path.join(themesRoot, theme)];
  const results = [];
  for (const themeDir of dirs) {
    const slug = path.basename(themeDir);
    const readiness = themeIsReady(themeDir);
    if (!readiness.ok) { results.push({ theme: slug, status: 'skipped', reason: readiness.reason }); continue; }
    const filePath = path.join(themeDir, 'index.tsx');
    const source = fs.readFileSync(filePath, 'utf8');
    const rewritten = rewriteMobileThemeEntry(source, filePath);
    if (rewritten === source) results.push({ theme: slug, status: 'unchanged' });
    else if (check) results.push({ theme: slug, status: 'needs-update' });
    else { fs.writeFileSync(filePath, rewritten); results.push({ theme: slug, status: 'updated' }); }
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const themesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/themes');
    const results = syncMobileThemeScreenshotWiring({ themesRoot, ...options });
    for (const result of results) console.log(`[screenshots:wire] ${result.theme}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    if (options.check && results.some((result) => result.status === 'needs-update')) process.exitCode = 1;
  } catch (error) {
    console.error(`[screenshots:wire] ${error.message}`);
    process.exitCode = 1;
  }
}
