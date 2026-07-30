import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { listMobileThemeDirs } from './mobile-theme-screenshots/model.mjs';

const DEFAULT_CLIENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client',
);

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

function isWiredPreviewInitializer(initializer) {
  if (!ts.isArrayLiteralExpression(initializer) || initializer.elements.length !== 3) return false;
  return initializer.elements.every((element, index) => {
    if (!ts.isObjectLiteralExpression(element)) return false;
    const type = element.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText() === 'type');
    const url = element.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText() === 'url');
    return ts.isPropertyAssignment(type)
      && ts.isStringLiteral(type.initializer)
      && type.initializer.text === 'product-screenshot'
      && ts.isPropertyAssignment(url)
      && ts.isIdentifier(url.initializer)
      && url.initializer.text === `productScreenshot0${index + 1}`;
  });
}

export function rewriteMobileThemeEntry(source, fileName = 'index.tsx') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screenshotPaths = [1, 2, 3].map((index) => `./assets/product-screenshot-0${index}.webp?url`);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const coverImports = imports.filter((statement) => statement.moduleSpecifier.text === './assets/cover.svg?url');
  const screenshotImports = imports.filter((statement) => screenshotPaths.includes(statement.moduleSpecifier.text));
  const configDeclarations = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)
      || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'config' && ts.isObjectLiteralExpression(declaration.initializer)) {
        configDeclarations.push(declaration);
      }
    }
  }
  if (configDeclarations.length !== 1) throw new Error(`${fileName}: expected exactly one const config object`);
  const configObject = configDeclarations[0].initializer;
  const previewProperties = configObject.properties.filter((property) => ts.isPropertyAssignment(property)
    && property.name.getText(sourceFile) === 'previewImages');
  if (previewProperties.length !== 1) throw new Error(`${fileName}: expected exactly one config.previewImages property`);

  const hasCompleteScreenshotImports = screenshotPaths.every((assetPath, index) => {
    const matching = screenshotImports.filter((statement) => statement.moduleSpecifier.text === assetPath);
    return matching.length === 1 && matching[0].importClause?.name?.text === `productScreenshot0${index + 1}`;
  });
  const isLegacy = coverImports.length === 1 && screenshotImports.length === 0;
  const isWired = coverImports.length === 0 && screenshotImports.length === 3 && hasCompleteScreenshotImports;
  if (!isLegacy && !isWired) throw new Error(`${fileName}: incomplete or mixed screenshot imports`);

  const edits = [];
  if (isLegacy) edits.push({ start: coverImports[0].getStart(sourceFile), end: coverImports[0].getEnd(), text: importBlock });
  const previewProperty = previewProperties[0];
  if (!isWiredPreviewInitializer(previewProperty.initializer)) {
    edits.push({ start: previewProperty.initializer.getStart(sourceFile), end: previewProperty.initializer.getEnd(), text: previewInitializer });
  }
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
    if (arg === '--') continue;
    else if (arg === '--check') options.check = true;
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
    const themesRoot = path.join(DEFAULT_CLIENT_ROOT, 'src/themes');
    const results = syncMobileThemeScreenshotWiring({ themesRoot, ...options });
    for (const result of results) console.log(`[screenshots:wire] ${result.theme}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    if (options.check && results.some((result) => result.status === 'needs-update')) process.exitCode = 1;
  } catch (error) {
    console.error(`[screenshots:wire] ${error.message}`);
    process.exitCode = 1;
  }
}
