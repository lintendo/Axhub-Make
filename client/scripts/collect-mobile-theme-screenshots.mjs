import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverAppleCandidates, lookupAppleScreenshots } from './mobile-theme-screenshots/apple-source.mjs';
import { normalizeScreenshotSet } from './mobile-theme-screenshots/image-pipeline.mjs';
import {
  deriveDisplayPageStatus,
  listMobileThemeDirs,
  validateProductScreenshotStatus,
  validateScreenshotAsset,
  writeJsonAtomic,
} from './mobile-theme-screenshots/model.mjs';

const FALLBACK_SOURCE_KINDS = new Set(['google-play', 'official-promo', 'market-mirror']);

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`ARGUMENT_REQUIRED ${option}`);
  return value;
}

export function parseCliArgs(argv) {
  const commandIndex = argv.findIndex((value) => value !== '--');
  const [command, ...rest] = commandIndex === -1 ? [] : argv.slice(commandIndex);
  if (!['discover', 'collect'].includes(command)) throw new Error('USAGE expected discover or collect command');
  const options = { assetUrls: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === '--all') {
      options.all = true;
      continue;
    }
    if (![
      '--theme', '--store-id', '--storefront', '--source-kind', '--source-page', '--official-page',
      '--asset-url', '--approved-sources', '--output',
    ].includes(option)) {
      throw new Error(`UNKNOWN_ARGUMENT ${option}`);
    }
    const value = requireValue(rest, index, option);
    index += 1;
    if (option === '--asset-url') options.assetUrls.push(value);
    else options[option.slice(2).replaceAll('-', '')] = value;
  }
  if (options.all && options.theme) throw new Error('USAGE --all and --theme are mutually exclusive');
  if (!options.all && !options.theme) throw new Error('USAGE provide --theme or --all');
  return { command, options };
}

function requireHttps(value, label) {
  if (typeof value !== 'string' || !/^https:\/\//.test(value)) throw new Error(`${label} must be an https URL`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function themePathForSlug(themesRoot, slug) {
  requireString(slug, '--theme');
  const themeDir = path.resolve(themesRoot, slug);
  if (!themeDir.startsWith(`${path.resolve(themesRoot)}${path.sep}`) || !fs.existsSync(path.join(themeDir, 'theme.json'))) {
    throw new Error(`THEME_NOT_FOUND ${slug}`);
  }
  return themeDir;
}

function loadTheme(themeDir) {
  return JSON.parse(fs.readFileSync(path.join(themeDir, 'theme.json'), 'utf8'));
}

function themeDescriptor(themeDir) {
  const theme = loadTheme(themeDir);
  return {
    slug: theme.identity?.slug || path.basename(themeDir),
    brand: theme.identity?.brand || theme.identity?.slug || path.basename(themeDir),
    themeDir,
    theme,
  };
}

function selectedThemes(options, themesRoot) {
  if (options.all) return listMobileThemeDirs(themesRoot).map(themeDescriptor);
  return [themeDescriptor(themePathForSlug(themesRoot, options.theme))];
}

function writeReport(outputPath, value) {
  if (!outputPath) return;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeJsonAtomic(outputPath, value);
}

function buildFallbackSource(options) {
  if (!FALLBACK_SOURCE_KINDS.has(options.sourcekind)) {
    throw new Error('INVALID_SOURCE_KIND expected google-play, official-promo, or market-mirror');
  }
  if (options.assetUrls.length !== 3) throw new Error('INSUFFICIENT_SCREENSHOTS expected exactly 3 asset URLs');
  const pageUrl = requireHttps(options.sourcepage, '--source-page');
  const officialPageUrl = requireHttps(options.officialpage, '--official-page');
  options.assetUrls.forEach((assetUrl) => requireHttps(assetUrl, '--asset-url'));
  if (options.sourcekind === 'official-promo') {
    return {
      kind: options.sourcekind,
      pageUrl,
      officialPageUrl,
      marketId: null,
      storefront: null,
    };
  }
  return {
    kind: options.sourcekind,
    pageUrl,
    officialPageUrl,
    marketId: requireString(options.storeid, '--store-id'),
    storefront: options.storefront || 'us',
  };
}

function applyCollectedAssets({ theme, themePath, assets }) {
  for (const asset of assets) validateScreenshotAsset(asset);
  const productScreenshots = {
    collection: 'review',
    regression: 'pending',
    expected: 3,
    actual: 3,
    lastRegressionAt: null,
    errors: [],
  };
  validateProductScreenshotStatus(productScreenshots);
  theme.assets ??= {};
  theme.display ??= {};
  theme.status ??= {};
  theme.assets.productScreenshots = assets;
  theme.previewImages = assets.map(({ type, path: assetPath }) => ({ type, path: assetPath }));
  theme.display.previewImages = assets.map(({ type, path: assetPath }) => ({ type, path: assetPath }));
  theme.status.productScreenshots = productScreenshots;
  theme.status.displayPage = deriveDisplayPageStatus(productScreenshots);
  writeJsonAtomic(themePath, theme);
}

async function collectTheme({ descriptor, assetUrls, source, fetchImpl, collectedAt }) {
  const assets = await normalizeScreenshotSet({
    assetUrls,
    outputDir: path.join(descriptor.themeDir, 'assets'),
    source,
    fetchImpl,
    collectedAt,
  });
  applyCollectedAssets({
    theme: descriptor.theme,
    themePath: path.join(descriptor.themeDir, 'theme.json'),
    assets,
  });
  return { theme: descriptor.slug, status: 'collected', actual: assets.length };
}

async function collectAppleTheme({ descriptor, storeId, storefront, fetchImpl, collectedAt }) {
  const resolvedStoreId = requireString(storeId, '--store-id');
  const resolvedStorefront = storefront || 'us';
  const lookup = await lookupAppleScreenshots({
    storeId: resolvedStoreId,
    storefront: resolvedStorefront,
    fetchImpl,
  });
  const pageUrl = requireHttps(lookup.pageUrl, 'Apple pageUrl');
  return collectTheme({
    descriptor,
    assetUrls: lookup.screenshotUrls,
    source: {
      kind: 'apple-app-store',
      pageUrl,
      officialPageUrl: pageUrl,
      marketId: resolvedStoreId,
      storefront: resolvedStorefront,
    },
    fetchImpl,
    collectedAt,
  });
}

function readApprovedSources(filePath) {
  const approved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (approved?.schemaVersion !== 1 || !approved.sources || Array.isArray(approved.sources)) {
    throw new Error('INVALID_APPROVED_SOURCES expected { schemaVersion: 1, sources: { [themeSlug]: { kind, storeId, storefront } } }');
  }
  return approved.sources;
}

async function collectApprovedThemes({ descriptors, approvedSources, fetchImpl, collectedAt }) {
  const results = [];
  for (const descriptor of descriptors) {
    const approved = approvedSources[descriptor.slug];
    if (!approved) {
      results.push({ theme: descriptor.slug, status: 'skipped', error: 'APPROVED_SOURCE_NOT_FOUND' });
      continue;
    }
    try {
      if (approved.kind !== 'apple-app-store') throw new Error('UNSUPPORTED_APPROVED_SOURCE_KIND');
      results.push(await collectAppleTheme({
        descriptor,
        storeId: approved.storeId,
        storefront: approved.storefront,
        fetchImpl,
        collectedAt,
      }));
    } catch (error) {
      results.push({ theme: descriptor.slug, status: 'error', error: error.message });
    }
  }
  return results;
}

export async function runCli(argv, {
  clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  fetchImpl = fetch,
  collectedAt = new Date().toISOString(),
  now = () => new Date(),
} = {}) {
  const { command, options } = parseCliArgs(argv);
  const themesRoot = path.join(clientRoot, 'src', 'themes');
  const descriptors = selectedThemes(options, themesRoot);
  if (command === 'discover') {
    const themes = [];
    for (const descriptor of descriptors) {
      try {
        themes.push({
          theme: descriptor.slug,
          term: descriptor.brand,
          candidates: await discoverAppleCandidates({
            term: descriptor.brand,
            storefront: options.storefront || 'us',
            fetchImpl,
          }),
        });
      } catch (error) {
        if (!options.all) throw error;
        themes.push({ theme: descriptor.slug, term: descriptor.brand, candidates: [], error: error.message });
      }
    }
    const report = {
      schemaVersion: 1,
      kind: 'apple-candidate-report',
      generatedAt: now().toISOString(),
      storefront: options.storefront || 'us',
      themes,
    };
    writeReport(options.output, report);
    return report;
  }

  let themes;
  if (options.all) {
    if (options.sourcekind || options.sourcepage || options.officialpage || options.assetUrls.length) {
      throw new Error('USAGE explicit fallback options require a single --theme');
    }
    if (!options.approvedsources) throw new Error('ARGUMENT_REQUIRED --approved-sources');
    themes = await collectApprovedThemes({
      descriptors,
      approvedSources: readApprovedSources(options.approvedsources),
      fetchImpl,
      collectedAt,
    });
  } else if (options.sourcekind || options.sourcepage || options.officialpage || options.assetUrls.length) {
    themes = [await collectTheme({
      descriptor: descriptors[0],
      assetUrls: options.assetUrls,
      source: buildFallbackSource(options),
      fetchImpl,
      collectedAt,
    })];
  } else {
    themes = [await collectAppleTheme({
      descriptor: descriptors[0],
      storeId: options.storeid,
      storefront: options.storefront,
      fetchImpl,
      collectedAt,
    })];
  }
  const report = {
    schemaVersion: 1,
    kind: 'mobile-theme-screenshot-collection',
    generatedAt: now().toISOString(),
    themes,
  };
  writeReport(options.output, report);
  return report;
}

const isCliEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCliEntrypoint) {
  runCli(process.argv.slice(2))
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
