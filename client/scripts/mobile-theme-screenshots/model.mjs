import fs from 'node:fs';
import path from 'node:path';

export const COLLECTION_STATES = new Set(['pending', 'collecting', 'review', 'complete', 'blocked']);
export const REGRESSION_STATES = new Set(['pending', 'running', 'passed', 'failed']);
export const DISPLAY_STATES = new Set(['pending', 'in-progress', 'ready', 'blocked']);

export function deriveDisplayPageStatus(value) {
  if (value.collection === 'blocked') return 'blocked';
  if (value.collection === 'complete' && value.regression === 'passed') return 'ready';
  if (value.collection === 'pending') return 'pending';
  return 'in-progress';
}

function requireUrl(value, label) {
  if (typeof value !== 'string' || !/^https:\/\//.test(value)) throw new Error(`${label} must be an https URL`);
}

export function validateScreenshotAsset(asset) {
  if (asset?.type !== 'product-screenshot') throw new Error('asset.type must be product-screenshot');
  if (!/^assets\/product-screenshot-0[1-3]\.webp$/.test(asset.path)) throw new Error('invalid screenshot asset path');
  if (!['apple-app-store', 'google-play', 'official-promo', 'market-mirror'].includes(asset.source?.kind)) {
    throw new Error('invalid screenshot source kind');
  }
  requireUrl(asset.source.pageUrl, 'source.pageUrl');
  requireUrl(asset.source.officialPageUrl, 'source.officialPageUrl');
  requireUrl(asset.source.assetUrl, 'source.assetUrl');
  if (asset.source.usage !== 'official-promotional') throw new Error('source.usage must be official-promotional');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(asset.source.collectedAt)) throw new Error('invalid source.collectedAt');
  if (!/^[a-f0-9]{64}$/.test(asset.integrity?.sha256 || '')) throw new Error('invalid integrity.sha256');
  if (!Number.isInteger(asset.integrity?.byteLength) || asset.integrity.byteLength <= 0) throw new Error('invalid byte length');
  if (!Number.isInteger(asset.integrity?.width) || asset.integrity.width < 320) throw new Error('screenshot width must be at least 320');
  if (!Number.isInteger(asset.integrity?.height) || asset.integrity.height <= asset.integrity.width) throw new Error('screenshot must be portrait');
}

export function validateProductScreenshotStatus(status) {
  if (!COLLECTION_STATES.has(status?.collection)) throw new Error('invalid collection state');
  if (!REGRESSION_STATES.has(status?.regression)) throw new Error('invalid regression state');
  if (status.expected !== 3) throw new Error('expected screenshot count must be 3');
  if (!Number.isInteger(status.actual) || status.actual < 0 || status.actual > 3) throw new Error('actual screenshot count must be 0..3');
  if (!Array.isArray(status.errors)) throw new Error('status.errors must be an array');
  if (status.collection === 'complete' && status.actual !== 3) throw new Error('complete collection requires exactly 3 assets');
}

export function listMobileThemeDirs(themesRoot) {
  return fs.readdirSync(themesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-mobile'))
    .map((entry) => path.join(themesRoot, entry.name))
    .sort();
}

export function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}
