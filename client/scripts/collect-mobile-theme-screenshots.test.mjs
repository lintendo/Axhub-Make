import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { runCli } from './collect-mobile-theme-screenshots.mjs';
import {
  discoverAppleCandidates,
  lookupAppleScreenshots,
} from './mobile-theme-screenshots/apple-source.mjs';
import { normalizeScreenshotSet } from './mobile-theme-screenshots/image-pipeline.mjs';

const temporaryDirs = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function temporaryDir(prefix = 'mobile-shots-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

function source(overrides = {}) {
  return {
    kind: 'official-promo',
    pageUrl: 'https://example.com/product',
    officialPageUrl: 'https://example.com/product',
    marketId: null,
    storefront: null,
    ...overrides,
  };
}

async function imageBuffer(background, width = 640, height = 1136) {
  return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
}

function imageResponse(buffer) {
  return new Response(buffer, { headers: { 'content-type': 'image/png' } });
}

async function threeImageFetch(colors = ['#ff0000', '#00ff00', '#0000ff']) {
  const buffers = await Promise.all(colors.map((color) => imageBuffer(color)));
  return async (url) => imageResponse(buffers[Number(new URL(url).pathname.slice(-1))]);
}

function writeTheme(clientRoot, slug, brand = 'Example') {
  const themeDir = path.join(clientRoot, 'src', 'themes', slug);
  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  const theme = {
    identity: { slug, brand },
    assets: {},
    previewImages: [{ type: 'local-preview', path: 'assets/cover.svg' }],
    display: { previewImages: [{ type: 'local-preview', path: 'assets/cover.svg' }] },
    status: { displayPage: 'pending' },
  };
  fs.writeFileSync(path.join(themeDir, 'theme.json'), `${JSON.stringify(theme, null, 2)}\n`);
  return themeDir;
}

describe('Apple screenshot source', () => {
  it('returns discovery candidates but refuses an exact product with no static screenshots', async () => {
    const fetchImpl = async (url) => {
      if (new URL(url).pathname.endsWith('/search')) {
        return new Response(JSON.stringify({
          results: [
            {
              trackId: 310633997,
              trackName: 'WhatsApp Messenger',
              artistName: 'WhatsApp Inc.',
              bundleId: 'net.whatsapp.WhatsApp',
              screenshotUrls: [],
            },
            {
              trackId: 1386412985,
              trackName: 'WhatsApp Business',
              artistName: 'WhatsApp Inc.',
              bundleId: 'net.whatsapp.WhatsAppSMB',
              screenshotUrls: ['https://example.com/business.webp'],
            },
          ],
        }));
      }
      return new Response(JSON.stringify({
        results: [{ trackId: 310633997, screenshotUrls: [] }],
      }));
    };

    const candidates = await discoverAppleCandidates({
      term: 'WhatsApp Messenger',
      storefront: 'us',
      fetchImpl,
    });

    expect(candidates).toEqual([
      {
        trackId: 310633997,
        trackName: 'WhatsApp Messenger',
        artistName: 'WhatsApp Inc.',
        bundleId: 'net.whatsapp.WhatsApp',
        screenshotCount: 0,
      },
      {
        trackId: 1386412985,
        trackName: 'WhatsApp Business',
        artistName: 'WhatsApp Inc.',
        bundleId: 'net.whatsapp.WhatsAppSMB',
        screenshotCount: 1,
      },
    ]);
    await expect(lookupAppleScreenshots({
      storeId: '310633997',
      storefront: 'us',
      fetchImpl,
    })).rejects.toThrow(/STATIC_SCREENSHOTS_UNAVAILABLE/);
  });

  it('reports stable source HTTP errors', async () => {
    const fetchImpl = async () => new Response('unavailable', { status: 503 });
    await expect(discoverAppleCandidates({ term: 'Example', fetchImpl }))
      .rejects.toThrow(/SOURCE_HTTP_ERROR 503/);
    await expect(lookupAppleScreenshots({ storeId: '42', fetchImpl }))
      .rejects.toThrow(/SOURCE_HTTP_ERROR 503/);
  });

  it('rejects a lookup response whose product ID does not match the requested store ID', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      results: [{
        trackId: 99,
        trackViewUrl: 'https://apps.apple.com/us/app/sibling/id99',
        screenshotUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      }],
    }));
    await expect(lookupAppleScreenshots({ storeId: '42', storefront: 'us', fetchImpl }))
      .rejects.toThrow(/SOURCE_PRODUCT_MISMATCH/);
  });
});

describe('image normalization pipeline', () => {
  it('normalizes exactly three distinct portrait images', async () => {
    const outputDir = temporaryDir();
    const fetchImpl = await threeImageFetch();

    const assets = await normalizeScreenshotSet({
      assetUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      outputDir,
      source: source(),
      fetchImpl,
      collectedAt: '2026-07-27T00:00:00.000Z',
    });

    expect(assets).toHaveLength(3);
    expect(assets.map((asset) => asset.path)).toEqual([
      'assets/product-screenshot-01.webp',
      'assets/product-screenshot-02.webp',
      'assets/product-screenshot-03.webp',
    ]);
    expect(new Set(assets.map((asset) => asset.integrity.sha256)).size).toBe(3);
    expect(assets.every((asset) => asset.integrity.width === 640)).toBe(true);
    expect(fs.readdirSync(outputDir).sort()).toEqual([
      'product-screenshot-01.webp',
      'product-screenshot-02.webp',
      'product-screenshot-03.webp',
    ]);
  });

  it.each([
    ['too few', ['https://example.com/0', 'https://example.com/1']],
    ['too many', ['https://example.com/0', 'https://example.com/1', 'https://example.com/2', 'https://example.com/3']],
  ])('rejects %s URLs before downloading', async (_label, assetUrls) => {
    let fetchCount = 0;
    await expect(normalizeScreenshotSet({
      assetUrls,
      outputDir: temporaryDir(),
      source: source(),
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error('should not fetch');
      },
    })).rejects.toThrow(/expected exactly 3 asset URLs/);
    expect(fetchCount).toBe(0);
  });

  it('rejects HTTP failures and HTML masquerading as an asset', async () => {
    const urls = ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'];
    await expect(normalizeScreenshotSet({
      assetUrls: urls,
      outputDir: temporaryDir(),
      source: source(),
      fetchImpl: async () => new Response('missing', { status: 404 }),
    })).rejects.toThrow(/SOURCE_HTTP_ERROR 404/);
    await expect(normalizeScreenshotSet({
      assetUrls: urls,
      outputDir: temporaryDir(),
      source: source(),
      fetchImpl: async () => new Response('<html>login</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    })).rejects.toThrow(/INVALID_IMAGE_RESPONSE/);
  });

  it('rejects corrupt bytes even when the response claims to be an image', async () => {
    await expect(normalizeScreenshotSet({
      assetUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      outputDir: temporaryDir(),
      source: source(),
      fetchImpl: async () => new Response('not an image', {
        headers: { 'content-type': 'image/png' },
      }),
    })).rejects.toThrow(/INVALID_IMAGE_RESPONSE/);
  });

  it('rejects malformed and non-HTTPS asset URLs before making a request', async () => {
    for (const invalidUrl of ['https://', 'http://example.com/image.png']) {
      let fetchCount = 0;
      await expect(normalizeScreenshotSet({
        assetUrls: [invalidUrl, 'https://example.com/1', 'https://example.com/2'],
        outputDir: temporaryDir(),
        source: source(),
        fetchImpl: async () => {
          fetchCount += 1;
          throw new Error('should not fetch');
        },
      })).rejects.toThrow(/INVALID_ASSET_URL/);
      expect(fetchCount).toBe(0);
    }
  });

  it.each([
    ['narrow', 319, 800],
    ['landscape', 800, 640],
  ])('rejects a %s image', async (_label, width, height) => {
    const invalid = await imageBuffer('#ff0000', width, height);
    await expect(normalizeScreenshotSet({
      assetUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      outputDir: temporaryDir(),
      source: source(),
      fetchImpl: async () => imageResponse(invalid),
    })).rejects.toThrow(/INVALID_IMAGE_DIMENSIONS/);
  });

  it('rejects images that normalize to the same hash', async () => {
    const duplicate = await imageBuffer('#ff0000');
    await expect(normalizeScreenshotSet({
      assetUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      outputDir: temporaryDir(),
      source: source(),
      fetchImpl: async () => imageResponse(duplicate),
    })).rejects.toThrow(/DUPLICATE_IMAGE/);
  });

  it('leaves existing assets untouched and removes staging when validation fails', async () => {
    const outputDir = temporaryDir();
    const originalNames = [1, 2, 3].map((index) => `product-screenshot-0${index}.webp`);
    for (const name of originalNames) fs.writeFileSync(path.join(outputDir, name), `original-${name}`);
    const valid = await imageBuffer('#ff0000');
    const invalid = await imageBuffer('#0000ff', 800, 640);

    await expect(normalizeScreenshotSet({
      assetUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      outputDir,
      source: source(),
      fetchImpl: async (url) => imageResponse(url.endsWith('/2') ? invalid : valid),
    })).rejects.toThrow(/DUPLICATE_IMAGE|INVALID_IMAGE_DIMENSIONS/);

    expect(originalNames.map((name) => fs.readFileSync(path.join(outputDir, name), 'utf8')))
      .toEqual(originalNames.map((name) => `original-${name}`));
    expect(fs.readdirSync(outputDir).filter((name) => name.startsWith('.screenshot-stage-'))).toEqual([]);
  });
});

describe('collector CLI', () => {
  it('collects one Apple source and atomically writes provenance, previews, and status', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    const themeDir = writeTheme(clientRoot, 'example-mobile');
    const buffers = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map((color) => imageBuffer(color)));
    const fetchImpl = async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'itunes.apple.com') {
        return new Response(JSON.stringify({ results: [{
          trackId: 42,
          trackViewUrl: 'https://apps.apple.com/gb/app/example/id42',
          screenshotUrls: ['https://cdn.example.com/0', 'https://cdn.example.com/1', 'https://cdn.example.com/2'],
        }] }));
      }
      return imageResponse(buffers[Number(parsed.pathname.slice(-1))]);
    };

    const result = await runCli([
      'collect', '--theme', 'example-mobile', '--store-id', '42', '--storefront', 'gb',
    ], { clientRoot, fetchImpl, collectedAt: '2026-07-27T00:00:00.000Z' });
    const theme = JSON.parse(fs.readFileSync(path.join(themeDir, 'theme.json'), 'utf8'));

    expect(result.themes).toEqual([{ theme: 'example-mobile', status: 'collected', actual: 3 }]);
    expect(theme.assets.productScreenshots).toHaveLength(3);
    expect(theme.assets.productScreenshots[0].source).toMatchObject({
      kind: 'apple-app-store',
      pageUrl: 'https://apps.apple.com/gb/app/example/id42',
      officialPageUrl: 'https://apps.apple.com/gb/app/example/id42',
      marketId: '42',
      storefront: 'gb',
    });
    expect(theme.previewImages).toEqual(theme.display.previewImages);
    expect(theme.status).toMatchObject({
      displayPage: 'in-progress',
      productScreenshots: {
        collection: 'review',
        regression: 'pending',
        expected: 3,
        actual: 3,
        lastRegressionAt: null,
        errors: [],
      },
    });
  });

  it('collects an explicit official fallback while preserving source and official pages', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    const themeDir = writeTheme(clientRoot, 'fallback-mobile');
    const fetchImpl = await threeImageFetch();

    await runCli([
      'collect', '--theme', 'fallback-mobile',
      '--source-kind', 'official-promo',
      '--source-page', 'https://promo.example.com/mobile',
      '--official-page', 'https://www.example.com/mobile',
      '--asset-url', 'https://example.com/0',
      '--asset-url', 'https://example.com/1',
      '--asset-url', 'https://example.com/2',
    ], { clientRoot, fetchImpl, collectedAt: '2026-07-27T00:00:00.000Z' });

    const theme = JSON.parse(fs.readFileSync(path.join(themeDir, 'theme.json'), 'utf8'));
    expect(theme.assets.productScreenshots[0].source).toMatchObject({
      kind: 'official-promo',
      pageUrl: 'https://promo.example.com/mobile',
      officialPageUrl: 'https://www.example.com/mobile',
      marketId: null,
      storefront: null,
    });
  });

  it.each(['google-play', 'market-mirror'])(
    'records required market metadata for a %s fallback',
    async (sourceKind) => {
      const clientRoot = temporaryDir('mobile-client-');
      const themeDir = writeTheme(clientRoot, `${sourceKind}-mobile`);
      const fetchImpl = await threeImageFetch();

      await runCli([
        'collect', '--theme', `${sourceKind}-mobile`,
        '--source-kind', sourceKind,
        '--source-page', `https://${sourceKind}.example.com/product`,
        '--official-page', 'https://www.example.com/product',
        '--store-id', 'com.example.product',
        '--storefront', 'de',
        '--asset-url', 'https://example.com/0',
        '--asset-url', 'https://example.com/1',
        '--asset-url', 'https://example.com/2',
      ], { clientRoot, fetchImpl, collectedAt: '2026-07-27T00:00:00.000Z' });

      const theme = JSON.parse(fs.readFileSync(path.join(themeDir, 'theme.json'), 'utf8'));
      expect(theme.assets.productScreenshots[0].source).toMatchObject({
        kind: sourceKind,
        pageUrl: `https://${sourceKind}.example.com/product`,
        officialPageUrl: 'https://www.example.com/product',
        marketId: 'com.example.product',
        storefront: 'de',
      });
    },
  );

  it('rejects non-HTTPS fallback metadata before changing theme files', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    const themeDir = writeTheme(clientRoot, 'fallback-mobile');
    const themePath = path.join(themeDir, 'theme.json');
    const before = fs.readFileSync(themePath, 'utf8');
    let fetchCount = 0;

    await expect(runCli([
      'collect', '--theme', 'fallback-mobile',
      '--source-kind', 'official-promo',
      '--source-page', 'http://promo.example.com/mobile',
      '--official-page', 'https://www.example.com/mobile',
      '--asset-url', 'https://example.com/0',
      '--asset-url', 'https://example.com/1',
      '--asset-url', 'https://example.com/2',
    ], { clientRoot, fetchImpl: async () => { fetchCount += 1; } }))
      .rejects.toThrow(/must be an https URL/);

    expect(fetchCount).toBe(0);
    expect(fs.readFileSync(themePath, 'utf8')).toBe(before);
  });

  it('rejects a malformed HTTPS source page before downloading fallback assets', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    writeTheme(clientRoot, 'malformed-url-mobile');
    let fetchCount = 0;
    await expect(runCli([
      'collect', '--theme', 'malformed-url-mobile',
      '--source-kind', 'official-promo',
      '--source-page', 'https://',
      '--official-page', 'https://www.example.com/mobile',
      '--asset-url', 'https://example.com/0',
      '--asset-url', 'https://example.com/1',
      '--asset-url', 'https://example.com/2',
    ], { clientRoot, fetchImpl: async () => { fetchCount += 1; } }))
      .rejects.toThrow(/INVALID_URL/);
    expect(fetchCount).toBe(0);
  });

  it('rolls back promoted assets when theme metadata writing fails', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    const themeDir = writeTheme(clientRoot, 'transaction-mobile');
    const oldNames = [1, 2, 3].map((index) => `product-screenshot-0${index}.webp`);
    for (const name of oldNames) fs.writeFileSync(path.join(themeDir, 'assets', name), `old-${name}`);
    const fetchImpl = await threeImageFetch();
    const themePath = path.join(themeDir, 'theme.json');

    await expect(runCli([
      'collect', '--theme', 'transaction-mobile',
      '--source-kind', 'official-promo',
      '--source-page', 'https://promo.example.com/mobile',
      '--official-page', 'https://www.example.com/mobile',
      '--asset-url', 'https://example.com/0',
      '--asset-url', 'https://example.com/1',
      '--asset-url', 'https://example.com/2',
    ], {
      clientRoot,
      fetchImpl,
      writeJsonImpl: (filePath) => {
        if (filePath === themePath) throw new Error('METADATA_WRITE_FAILED');
      },
    })).rejects.toThrow(/METADATA_WRITE_FAILED/);

    expect(oldNames.map((name) => fs.readFileSync(path.join(themeDir, 'assets', name), 'utf8')))
      .toEqual(oldNames.map((name) => `old-${name}`));
    expect(fs.readdirSync(path.join(themeDir, 'assets')).filter((name) => name.startsWith('.screenshot-')))
      .toEqual([]);
    expect(JSON.parse(fs.readFileSync(themePath, 'utf8')).assets.productScreenshots).toBeUndefined();
  });

  it('discovers all mobile themes and writes the candidate report to --output', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    writeTheme(clientRoot, 'alpha-mobile', 'Alpha');
    writeTheme(clientRoot, 'beta-mobile', 'Beta');
    const outputPath = path.join(clientRoot, '.local', 'candidates.json');
    const terms = [];
    const fetchImpl = async (url) => {
      terms.push(new URL(url).searchParams.get('term'));
      return new Response(JSON.stringify({ results: [] }));
    };

    const report = await runCli([
      'discover', '--all', '--storefront', 'ca', '--output', outputPath,
    ], { clientRoot, fetchImpl, now: () => new Date('2026-07-27T00:00:00.000Z') });

    expect(terms.sort()).toEqual(['Alpha', 'Beta']);
    expect(report).toMatchObject({
      schemaVersion: 1,
      kind: 'apple-candidate-report',
      storefront: 'ca',
      themes: [
        { theme: 'alpha-mobile', term: 'Alpha', candidates: [] },
        { theme: 'beta-mobile', term: 'Beta', candidates: [] },
      ],
    });
    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual(report);
  });

  it('accepts the package-manager argument separator before the command', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    writeTheme(clientRoot, 'separator-mobile', 'Separator');
    const report = await runCli(
      ['--', 'discover', '--theme', 'separator-mobile'],
      { clientRoot, fetchImpl: async () => new Response(JSON.stringify({ results: [] })) },
    );
    expect(report.themes).toEqual([
      { theme: 'separator-mobile', term: 'Separator', candidates: [] },
    ]);
  });

  it('fails a single-theme discovery when the source endpoint is unavailable', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    writeTheme(clientRoot, 'unavailable-mobile', 'Unavailable');
    await expect(runCli(
      ['discover', '--theme', 'unavailable-mobile'],
      { clientRoot, fetchImpl: async () => new Response('down', { status: 503 }) },
    )).rejects.toThrow(/SOURCE_HTTP_ERROR 503/);
  });

  it('collects --all entries from the approved-sources JSON and writes a result report', async () => {
    const clientRoot = temporaryDir('mobile-client-');
    writeTheme(clientRoot, 'alpha-mobile', 'Alpha');
    writeTheme(clientRoot, 'beta-mobile', 'Beta');
    const approvedPath = path.join(clientRoot, 'approved-sources.json');
    const outputPath = path.join(clientRoot, '.local', 'collection.json');
    fs.writeFileSync(approvedPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: {
        'alpha-mobile': { kind: 'apple-app-store', storeId: '101', storefront: 'us' },
        'beta-mobile': { kind: 'apple-app-store', storeId: '202', storefront: 'gb' },
      },
    }, null, 2)}\n`);
    const buffers = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map((color) => imageBuffer(color)));
    const fetchImpl = async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'itunes.apple.com') {
        const storeId = parsed.searchParams.get('id');
        return new Response(JSON.stringify({ results: [{
          trackId: Number(storeId),
          trackViewUrl: `https://apps.apple.com/app/id${storeId}`,
          screenshotUrls: [
            `https://cdn.example.com/${storeId}/0`,
            `https://cdn.example.com/${storeId}/1`,
            `https://cdn.example.com/${storeId}/2`,
          ],
        }] }));
      }
      return imageResponse(buffers[Number(parsed.pathname.slice(-1))]);
    };

    const report = await runCli([
      'collect', '--all', '--approved-sources', approvedPath, '--output', outputPath,
    ], { clientRoot, fetchImpl, collectedAt: '2026-07-27T00:00:00.000Z' });

    expect(report.themes).toEqual([
      { theme: 'alpha-mobile', status: 'collected', actual: 3 },
      { theme: 'beta-mobile', status: 'collected', actual: 3 },
    ]);
    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual(report);
  });
});
