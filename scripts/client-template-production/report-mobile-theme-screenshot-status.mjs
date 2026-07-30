import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveDisplayPageStatus,
  listMobileThemeDirs,
  writeJsonAtomic,
} from './mobile-theme-screenshots/model.mjs';

const DEFAULT_CLIENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client',
);

export function summarizeStatuses(rows) {
  const summary = { total: rows.length, assets: 0, collection: {}, regression: {}, ready: 0 };
  for (const row of rows) {
    summary.assets += Number.isFinite(row.actual) ? row.actual : 0;
    summary.collection[row.collection] = (summary.collection[row.collection] || 0) + 1;
    summary.regression[row.regression] = (summary.regression[row.regression] || 0) + 1;
    if (row.collection === 'complete' && row.regression === 'passed') summary.ready += 1;
  }
  return summary;
}

function normalizeErrors(status, theme) {
  const errors = Array.isArray(status?.errors) ? status.errors : [];
  const collectionErrors = Array.isArray(theme?.status?.collectionErrors) ? theme.status.collectionErrors : [];
  return [...errors, ...collectionErrors];
}

export function readStatusRows(themesRoot) {
  return listMobileThemeDirs(themesRoot).map((themeDir) => {
    const slug = path.basename(themeDir);
    const themePath = path.join(themeDir, 'theme.json');
    let theme = {};
    let parseError = null;
    try {
      theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    const status = theme.status?.productScreenshots;
    const errors = parseError ? [parseError] : normalizeErrors(status, theme);
    const collection = status?.collection || 'pending';
    const regression = status?.regression || 'pending';
    const actual = Number.isInteger(status?.actual)
      ? status.actual
      : (Array.isArray(theme.assets?.productScreenshots) ? theme.assets.productScreenshots.length : 0);
    return { slug, collection, actual, regression, errors, display: deriveDisplayPageStatus({ collection, regression }) };
  }).sort((a, b) => a.slug.localeCompare(b.slug));
}

function printReport(rows, summary) {
  console.log(`Mobile theme screenshot status: ${summary.ready}/${summary.total} ready (${summary.assets} assets)`);
  console.log('theme\tcollection\tassets\tregression\terrors');
  for (const row of rows) {
    console.log(`${row.slug}\t${row.collection}\t${row.actual}\t${row.regression}\t${row.errors.length}`);
  }
}

export function reportMobileThemeScreenshotStatus({ themesRoot, json = false, strict = false, outputPath } = {}) {
  if (!themesRoot) throw new Error('themesRoot is required');
  const themes = readStatusRows(themesRoot);
  const summary = summarizeStatuses(themes);
  printReport(themes, summary);
  if (json) {
    const destination = outputPath || path.resolve(path.dirname(themesRoot), '..', '.local/mobile-theme-screenshots/status.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    writeJsonAtomic(destination, { summary, themes });
  }
  const hasBlockingStatus = themes.some((row) => row.collection === 'blocked' || row.regression === 'failed');
  return { summary, themes, exitCode: strict && hasBlockingStatus ? 1 : 0 };
}

export function parseCliArgs(argv) {
  const options = { json: false, strict: false };
  for (const [index, arg] of argv.entries()) {
    if (index === 0 && arg === '--') continue;
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else throw new Error(`UNKNOWN_ARGUMENT ${arg}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = reportMobileThemeScreenshotStatus({
      themesRoot: path.join(DEFAULT_CLIENT_ROOT, 'src/themes'),
      ...options,
    });
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[screenshots:status] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
