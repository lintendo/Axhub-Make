import { describe, expect, it } from 'vitest';

import {
  deriveDisplayPageStatus,
  validateProductScreenshotStatus,
  validateScreenshotAsset,
} from './model.mjs';

describe('mobile screenshot model', () => {
  const screenshotAsset = (source = {}) => ({
    type: 'product-screenshot',
    path: 'assets/product-screenshot-01.webp',
    source: {
      kind: 'apple-app-store',
      pageUrl: 'https://apps.apple.com/us/app/example/id1',
      officialPageUrl: 'https://apps.apple.com/us/app/example/id1',
      assetUrl: 'https://is1-ssl.mzstatic.com/image/example.webp',
      marketId: '1',
      storefront: 'us',
      collectedAt: '2026-07-27T00:00:00.000Z',
      usage: 'official-promotional',
      ...source,
    },
    integrity: {
      sha256: 'a'.repeat(64),
      byteLength: 120000,
      width: 640,
      height: 1136,
    },
  });

  it.each([
    [{ collection: 'pending', regression: 'pending' }, 'pending'],
    [{ collection: 'collecting', regression: 'pending' }, 'in-progress'],
    [{ collection: 'review', regression: 'pending' }, 'in-progress'],
    [{ collection: 'complete', regression: 'pending' }, 'in-progress'],
    [{ collection: 'complete', regression: 'passed' }, 'ready'],
    [{ collection: 'blocked', regression: 'pending' }, 'blocked'],
  ])('derives display state from %j', (input, expected) => {
    expect(deriveDisplayPageStatus(input)).toBe(expected);
  });

  it('accepts a complete status and rejects inconsistent counts', () => {
    expect(() => validateProductScreenshotStatus({
      collection: 'complete',
      regression: 'pending',
      expected: 3,
      actual: 3,
      lastRegressionAt: null,
      errors: [],
    })).not.toThrow();
    expect(() => validateProductScreenshotStatus({
      collection: 'complete',
      regression: 'pending',
      expected: 3,
      actual: 2,
      lastRegressionAt: null,
      errors: [],
    })).toThrow(/complete collection requires exactly 3 assets/);
  });

  it('requires complete promotional provenance and image integrity', () => {
    expect(() => validateScreenshotAsset({
      type: 'product-screenshot',
      path: 'assets/product-screenshot-01.webp',
      source: {
        kind: 'apple-app-store',
        pageUrl: 'https://apps.apple.com/us/app/example/id1',
        officialPageUrl: 'https://apps.apple.com/us/app/example/id1',
        assetUrl: 'https://is1-ssl.mzstatic.com/image/example.webp',
        marketId: '1',
        storefront: 'us',
        collectedAt: '2026-07-27T00:00:00.000Z',
        usage: 'official-promotional',
      },
      integrity: {
        sha256: 'a'.repeat(64),
        byteLength: 120000,
        width: 640,
        height: 1136,
      },
    })).not.toThrow();
  });

  it.each([
    ['apple-app-store', 'marketId'],
    ['apple-app-store', 'storefront'],
    ['google-play', 'marketId'],
    ['google-play', 'storefront'],
    ['market-mirror', 'marketId'],
    ['market-mirror', 'storefront'],
  ])('requires a non-empty %s %s', (kind, field) => {
    expect(() => validateScreenshotAsset(screenshotAsset({ kind, [field]: '  ' })))
      .toThrow(new RegExp(`source\\.${field} must be a non-empty string`));
  });

  it('requires explicit nullable market metadata for official promotions', () => {
    expect(() => validateScreenshotAsset(screenshotAsset({
      kind: 'official-promo',
      marketId: null,
      storefront: null,
    }))).not.toThrow();

    const asset = screenshotAsset({ kind: 'official-promo' });
    delete asset.source.marketId;
    delete asset.source.storefront;
    expect(() => validateScreenshotAsset(asset)).toThrow(/source.marketId must be explicitly present/);
  });

  it('rejects timestamps that are not canonical ISO timestamps', () => {
    expect(() => validateScreenshotAsset(screenshotAsset({
      collectedAt: '2026-02-31T00:00:00.000Z',
    }))).toThrow(/invalid source.collectedAt/);
  });
});
