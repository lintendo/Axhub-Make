import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { validateScreenshotAsset } from './model.mjs';

const MAX_BYTES = 450 * 1024;

function replaceAssetSetAtomically({ assets, outputDir, stagingDir }) {
  const backupDir = fs.mkdtempSync(path.join(outputDir, '.screenshot-backup-'));
  const backups = [];
  const promoted = [];
  try {
    for (const asset of assets) {
      const fileName = path.basename(asset.path);
      const destination = path.join(outputDir, fileName);
      if (fs.existsSync(destination)) {
        const backup = path.join(backupDir, fileName);
        fs.renameSync(destination, backup);
        backups.push({ destination, backup });
      }
    }
    for (const asset of assets) {
      const fileName = path.basename(asset.path);
      const destination = path.join(outputDir, fileName);
      fs.renameSync(path.join(stagingDir, fileName), destination);
      promoted.push(destination);
    }
  } catch (error) {
    for (const destination of promoted.reverse()) fs.rmSync(destination, { force: true });
    for (const { destination, backup } of backups.reverse()) fs.renameSync(backup, destination);
    throw error;
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

export async function normalizeScreenshotSet({
  assetUrls,
  outputDir,
  source,
  fetchImpl = fetch,
  collectedAt = new Date().toISOString(),
}) {
  if (!Array.isArray(assetUrls) || assetUrls.length !== 3) {
    throw new Error('INSUFFICIENT_SCREENSHOTS expected exactly 3 asset URLs');
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(outputDir, '.screenshot-stage-'));
  try {
    const assets = [];
    for (const [index, assetUrl] of assetUrls.entries()) {
      const response = await fetchImpl(assetUrl);
      if (!response.ok) throw new Error(`SOURCE_HTTP_ERROR ${response.status} ${assetUrl}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) throw new Error(`INVALID_IMAGE_RESPONSE ${assetUrl}`);
      const sourceBuffer = Buffer.from(await response.arrayBuffer());
      const inputMetadata = await sharp(sourceBuffer).metadata();
      if (
        !inputMetadata.width
        || !inputMetadata.height
        || inputMetadata.width < 320
        || inputMetadata.height <= inputMetadata.width
      ) {
        throw new Error(`INVALID_IMAGE_DIMENSIONS ${assetUrl}`);
      }
      const normalized = await sharp(sourceBuffer)
        .rotate()
        .resize({ width: 720, withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      if (normalized.data.byteLength > MAX_BYTES) throw new Error(`IMAGE_TOO_LARGE ${assetUrl}`);
      const sha256 = crypto.createHash('sha256').update(normalized.data).digest('hex');
      if (assets.some((asset) => asset.integrity.sha256 === sha256)) {
        throw new Error(`DUPLICATE_IMAGE ${assetUrl}`);
      }
      const fileName = `product-screenshot-0${index + 1}.webp`;
      const asset = {
        type: 'product-screenshot',
        path: `assets/${fileName}`,
        source: { ...source, assetUrl, collectedAt, usage: 'official-promotional' },
        integrity: {
          sha256,
          byteLength: normalized.data.byteLength,
          width: normalized.info.width,
          height: normalized.info.height,
        },
      };
      validateScreenshotAsset(asset);
      fs.writeFileSync(path.join(stagingDir, fileName), normalized.data);
      assets.push(asset);
    }
    replaceAssetSetAtomically({ assets, outputDir, stagingDir });
    return assets;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
