# Mobile Theme Product Screenshot Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow synthetic phone mockup used by all 50 mobile themes with three real, publishable product screenshots arranged horizontally, while tracking collection provenance and visual regression status per theme.

**Architecture:** Each mobile theme's `theme.json` is the single source of truth for screenshot assets, source provenance, collection state, and regression state. A Node CLI discovers and downloads official App Store assets first, accepts official marketing or approved market-mirror URLs as fallbacks, normalizes three images to WebP, and updates theme metadata; the shared React showcase renders those three local assets in a responsive horizontal gallery. A separate regression CLI verifies all 50 routes at desktop and mobile viewports and writes the final regression state back to each theme.

**Tech Stack:** Node.js ESM, TypeScript 5.x compiler API, React 18.2.0, Vite 5, Vitest 4, Playwright through the repository's existing browser runtime, Sharp for cross-platform image normalization, pnpm workspace commands.

**Working directory:** Run every command from `apps/axhub-make/` unless a step explicitly states otherwise.

## Global Constraints

- Use `pnpm`; do not add npm/yarn development commands.
- Scope implementation to `apps/axhub-make/client/` and app-specific documentation under `apps/axhub-make/docs/`.
- Cover all 50 directories matching `client/src/themes/*-mobile`.
- Every ready mobile theme must ship exactly three local product screenshots.
- Desktop preview uses three equal-width columns in one row; narrow viewports use one horizontal, scroll-snapped row rather than wrapping into stacked cards.
- Screenshots must remain fully visible with `object-fit: contain`; do not crop product UI.
- Source priority is Apple App Store, Google Play, the product's official site/press kit, then an approved third-party market mirror.
- Qimai may be used for manual discovery only. It is not a default automated source because its search endpoint returned HTTP 403 during research.
- Third-party pages may provide a mirror of an application-market image, but metadata must retain both the mirror page and the closest known official product/store page.
- The project owner has approved publishing official promotional and application-market images with `make-client`.
- Store source page URL, asset URL, market identifier, storefront, collection time, SHA-256, byte length, width, and height for every image.
- Normalize committed images to `product-screenshot-01.webp`, `product-screenshot-02.webp`, and `product-screenshot-03.webp` at WebP quality 82, maximum width 720px, and maximum file size 450 KiB.
- Reject images below 320px wide, landscape images, exact duplicate hashes, and HTML/error responses masquerading as images.
- Do not add compatibility branches for older mobile theme metadata. Migrate all 50 themes in the same rollout.
- Keep temporary discovery reports, candidate lists, screenshots, and browser output under `client/.local/`; do not commit them.
- Preserve unrelated user changes in the dirty worktree.

---

## Decision Record

### Chosen approach: official-first local asset pipeline

Download and commit three normalized images per theme. This makes preview rendering deterministic, works offline, avoids runtime dependence on expiring CDN URLs, and lets the build and regression tests validate the exact assets that will ship.

### Alternatives not selected

1. **Hotlink application-market CDN images at runtime.** This is initially fast, but store URLs can expire or change, network failures create blank previews, and published output becomes nondeterministic.
2. **Use Qimai or another aggregator as the only source.** This centralizes discovery, but access is protected, page contracts are unstable, and provenance becomes weaker than an official store or product page.
3. **Keep generated theme mockups and only improve width.** This fixes whitespace but does not meet the requirement to show the actual product across three screens.

### Source fallback rules

1. Apple Search/Lookup API returns at least three portrait `screenshotUrls`: use the first three distinct current iPhone screenshots.
2. Apple has fewer than three static screenshots: check Google Play and the brand's official product/press pages.
3. Official pages are inaccessible or provide fewer than three images: use an approved market mirror, record the mirror page, and retain the official store page as `officialPageUrl`.
4. A source cannot establish three coherent screens for the intended product: set collection to `blocked`, record a stable error code, and do not substitute a sibling product. For example, WhatsApp Business screenshots must not be used for the WhatsApp consumer theme.

## Status Model

Each mobile theme retains its existing top-level `status` object and replaces the current unresolved `displayPage` value with a derived summary plus the following record:

```json
{
  "status": {
    "displayPage": "pending",
    "productScreenshots": {
      "collection": "pending",
      "regression": "pending",
      "expected": 3,
      "actual": 0,
      "lastRegressionAt": null,
      "errors": []
    },
    "collectionErrors": []
  }
}
```

Allowed values:

- `collection`: `pending | collecting | review | complete | blocked`
- `regression`: `pending | running | passed | failed`
- `displayPage`: `pending | in-progress | ready | blocked`

Derivation rules:

```text
collection=blocked                       -> displayPage=blocked
collection=complete + regression=passed -> displayPage=ready
collection=pending                       -> displayPage=pending
all other combinations                   -> displayPage=in-progress
```

Stable collection error codes:

- `SOURCE_NOT_RESOLVED`
- `STATIC_SCREENSHOTS_UNAVAILABLE`
- `INSUFFICIENT_SCREENSHOTS`
- `SOURCE_PRODUCT_MISMATCH`
- `SOURCE_HTTP_ERROR`
- `INVALID_IMAGE_RESPONSE`
- `INVALID_IMAGE_DIMENSIONS`
- `DUPLICATE_IMAGE`
- `IMAGE_TOO_LARGE`

## Progress Dashboard

| Workstream | Status | Exit condition |
|---|---|---|
| Repository and page investigation | complete | Current 390px mockup and all 50 unresolved records identified |
| Source feasibility sampling | complete | Apple API verified; Google Play timeout and Qimai 403 recorded |
| Metadata contract | complete | Model and tests pass |
| Collection CLI | complete | App Store plus manual fallback paths pass tests |
| Three-image gallery | complete | Desktop and narrow viewport layout tests pass |
| WhatsApp pilot | in-progress | Three reviewed consumer-product images collected; regression pending |
| Remaining 49 themes | complete | Every theme has three reviewed assets |
| Full visual regression | pending | 50/50 desktop and mobile routes pass |
| Build verification | pending | Focused tests, typecheck, and client build pass |

## Per-Theme Collection And Regression Tracker

Update this table while executing Task 7. `Source` is a target, not proof of a completed binding; the committed `theme.json` remains authoritative.

| Theme | Source target | Collection | Provenance review | Regression | Current note |
|---|---|---|---|---|---|
| airbnb-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| apple-music-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| audible-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| binance-mobile | App Store (gb) | complete | complete | pending | 3/3 reviewed; global product, not Binance.US |
| booking-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| bumble-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| calm-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| canva-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| cash-app-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| chatgpt-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| coinbase-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| discord-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| disney-plus-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| doordash-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| duolingo-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| facebook-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| fitbit-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| gmail-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| google-calendar-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| google-maps-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| headspace-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| instagram-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| jira-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| linkedin-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| mcdonalds-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| myfitnesspal-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| netflix-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| notion-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| paypal-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| reddit-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| revolut-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| robinhood-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| slack-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| soundcloud-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| spotify-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| starbucks-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| strava-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| telegram-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| tiktok-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| tinder-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| trello-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| twitch-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| uber-eats-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| uber-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| waze-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| wechat-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| whatsapp-mobile | App Store (fr) | complete | complete | pending | 3/3 reviewed; consumer product only |
| x-twitter-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| youtube-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |
| zoom-mobile | App Store (us) | complete | complete | pending | 3/3 reviewed |

---

## File Map

### New files

- `client/scripts/mobile-theme-screenshots/model.mjs`: schema validation, status derivation, theme enumeration, and atomic JSON writes.
- `client/scripts/mobile-theme-screenshots/apple-source.mjs`: Apple Search/Lookup discovery and CDN URL normalization.
- `client/scripts/mobile-theme-screenshots/image-pipeline.mjs`: downloads, validates, hashes, normalizes, and atomically writes three WebP assets.
- `client/scripts/collect-mobile-theme-screenshots.mjs`: CLI orchestration for discovery, official-source collection, and explicit fallback URLs.
- `client/scripts/collect-mobile-theme-screenshots.test.mjs`: CLI and source-selection tests with mocked fetch responses.
- `client/scripts/sync-mobile-theme-screenshot-wiring.mjs`: TypeScript-AST-assisted update of explicit asset imports in all mobile theme entries.
- `client/scripts/sync-mobile-theme-screenshot-wiring.test.mjs`: code-generation fixture tests.
- `client/scripts/report-mobile-theme-screenshot-status.mjs`: derives the 50-theme progress table from `theme.json` files.
- `client/scripts/report-mobile-theme-screenshot-status.test.mjs`: summary-count tests.
- `client/scripts/regress-mobile-theme-screenshots.mjs`: Vite/Playwright route checks, screenshots, and regression status writes.
- `client/scripts/regress-mobile-theme-screenshots.test.mjs`: pure gallery-state and result aggregation tests.
- `client/tests/mobile-theme-screenshot-contract.test.ts`: final 50-theme asset, provenance, status, and entry-wiring contract.

### Modified shared files

- `client/package.json`: add Sharp and four screenshot workflow scripts.
- `pnpm-lock.yaml`: lock the Sharp dependency.
- `client/src/common/DesignMdBatchShowcase/index.tsx`: render three real images for `mobile-product` themes and reuse the existing lightbox.
- `client/src/common/DesignMdBatchShowcase/base.css`: full-width three-column gallery plus narrow horizontal scroll behavior.
- `client/tests/design-md-mobile-showcase.test.tsx`: assert three screenshot controls instead of the synthetic phone UI.
- `client/tests/design-md-batch-showcase-open-layout.test.ts`: assert desktop gallery and responsive scroll CSS contracts.

### Modified generated/theme-owned files

- `client/src/themes/*-mobile/theme.json`: add three asset records, provenance, and status.
- `client/src/themes/*-mobile/index.tsx`: replace `cover.svg` preview import with three explicit WebP imports.
- `client/src/themes/*-mobile/assets/product-screenshot-01.webp`: first product screen.
- `client/src/themes/*-mobile/assets/product-screenshot-02.webp`: second product screen.
- `client/src/themes/*-mobile/assets/product-screenshot-03.webp`: third product screen.

---

### Task 1: Define And Test The Metadata/Status Contract

**Files:**
- Create: `client/scripts/mobile-theme-screenshots/model.mjs`
- Create: `client/scripts/mobile-theme-screenshots/model.test.mjs`

**Interfaces:**
- Produces: `COLLECTION_STATES`, `REGRESSION_STATES`, `deriveDisplayPageStatus(productScreenshots)`, `validateScreenshotAsset(asset)`, `validateProductScreenshotStatus(status)`, `listMobileThemeDirs(themesRoot)`, and `writeJsonAtomic(filePath, value)`.
- Consumes: Node `fs`, `path`, and existing `theme.json` files.

- [ ] **Step 1: Write failing status derivation and validation tests**

```js
import { describe, expect, it } from 'vitest';

import {
  deriveDisplayPageStatus,
  validateProductScreenshotStatus,
  validateScreenshotAsset,
} from './model.mjs';

describe('mobile screenshot model', () => {
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
});
```

- [ ] **Step 2: Run the model test and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/mobile-theme-screenshots/model.test.mjs`

Expected: FAIL because `model.mjs` does not exist.

- [ ] **Step 3: Implement the model and atomic JSON writer**

```js
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
```

- [ ] **Step 4: Run the model test**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/mobile-theme-screenshots/model.test.mjs`

Expected: PASS with 8 parameterized/regular assertions.

- [ ] **Step 5: Commit the model**

```bash
git add client/scripts/mobile-theme-screenshots/model.mjs client/scripts/mobile-theme-screenshots/model.test.mjs
git commit -m "feat(client): define mobile screenshot status model"
```

### Task 2: Build The Official-First Image Collector

**Files:**
- Create: `client/scripts/mobile-theme-screenshots/apple-source.mjs`
- Create: `client/scripts/mobile-theme-screenshots/image-pipeline.mjs`
- Create: `client/scripts/collect-mobile-theme-screenshots.mjs`
- Create: `client/scripts/collect-mobile-theme-screenshots.test.mjs`
- Modify: `client/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: theme slug, optional `--store-id`, `--storefront`, `--source-page`, `--official-page`, and exactly three repeatable `--asset-url` values.
- Produces: three normalized WebP files, `assets.productScreenshots`, root/display `previewImages`, and `status.productScreenshots` in the selected `theme.json`.
- Produces: `discoverAppleCandidates({ term, storefront, fetchImpl })` and `lookupAppleScreenshots({ storeId, storefront, fetchImpl })` for tests and later refreshes.

- [ ] **Step 1: Add Sharp and workflow script names**

Run: `pnpm --filter @axhub/make-client add -D sharp@^0.34.3`

Add these `package.json` scripts:

```json
{
  "screenshots:collect": "node scripts/collect-mobile-theme-screenshots.mjs",
  "screenshots:status": "node scripts/report-mobile-theme-screenshot-status.mjs",
  "screenshots:wire": "node scripts/sync-mobile-theme-screenshot-wiring.mjs",
  "screenshots:regress": "node scripts/regress-mobile-theme-screenshots.mjs"
}
```

- [ ] **Step 2: Write failing Apple discovery and download tests**

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { discoverAppleCandidates, lookupAppleScreenshots } from './mobile-theme-screenshots/apple-source.mjs';
import { normalizeScreenshotSet } from './mobile-theme-screenshots/image-pipeline.mjs';

const temporaryDirs = [];
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('mobile screenshot collection', () => {
  it('returns official Apple candidates without accepting sibling products', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      results: [
        { trackId: 310633997, trackName: 'WhatsApp Messenger', artistName: 'WhatsApp Inc.', screenshotUrls: [] },
        { trackId: 1386412985, trackName: 'WhatsApp Business', artistName: 'WhatsApp Inc.', screenshotUrls: ['https://example.com/business.webp'] },
      ],
    }));
    const candidates = await discoverAppleCandidates({ term: 'WhatsApp Messenger', storefront: 'us', fetchImpl });
    expect(candidates.map((item) => item.trackId)).toEqual([310633997, 1386412985]);
    await expect(lookupAppleScreenshots({ storeId: '310633997', storefront: 'us', fetchImpl })).rejects.toThrow(
      /STATIC_SCREENSHOTS_UNAVAILABLE/,
    );
  });

  it('normalizes exactly three distinct portrait images', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-shots-'));
    temporaryDirs.push(dir);
    const buffers = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map((background) => (
      sharp({ create: { width: 640, height: 1136, channels: 3, background } }).png().toBuffer()
    )));
    const fetchImpl = async (url) => {
      const index = Number(new URL(url).pathname.slice(1));
      return new Response(buffers[index], { headers: { 'content-type': 'image/png' } });
    };
    const assets = await normalizeScreenshotSet({
      assetUrls: ['https://example.com/0', 'https://example.com/1', 'https://example.com/2'],
      outputDir: dir,
      source: {
        kind: 'official-promo',
        pageUrl: 'https://example.com/product',
        officialPageUrl: 'https://example.com/product',
        marketId: null,
        storefront: null,
      },
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
  });
});
```

- [ ] **Step 3: Run the collector tests and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/collect-mobile-theme-screenshots.test.mjs`

Expected: FAIL because the source and image pipeline modules do not exist.

- [ ] **Step 4: Implement Apple discovery and strict lookup**

```js
const APPLE_SEARCH_URL = 'https://itunes.apple.com/search';
const APPLE_LOOKUP_URL = 'https://itunes.apple.com/lookup';

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'user-agent': 'Axhub-theme-screenshot-collector/1.0' } });
  if (!response.ok) throw new Error(`SOURCE_HTTP_ERROR ${response.status} ${url}`);
  return response.json();
}

export async function discoverAppleCandidates({ term, storefront = 'us', fetchImpl = fetch }) {
  const url = new URL(APPLE_SEARCH_URL);
  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'software');
  url.searchParams.set('country', storefront);
  url.searchParams.set('limit', '10');
  const payload = await fetchJson(url, fetchImpl);
  return (payload.results || []).map(({ trackId, trackName, artistName, bundleId, screenshotUrls = [] }) => ({
    trackId,
    trackName,
    artistName,
    bundleId,
    screenshotCount: screenshotUrls.length,
  }));
}

export async function lookupAppleScreenshots({ storeId, storefront = 'us', fetchImpl = fetch }) {
  const url = new URL(APPLE_LOOKUP_URL);
  url.searchParams.set('id', storeId);
  url.searchParams.set('entity', 'software');
  url.searchParams.set('country', storefront);
  const payload = await fetchJson(url, fetchImpl);
  const app = payload.results?.[0];
  if (!app) throw new Error(`SOURCE_NOT_RESOLVED ${storeId}`);
  const screenshotUrls = [...new Set(app.screenshotUrls || [])];
  if (screenshotUrls.length === 0) throw new Error(`STATIC_SCREENSHOTS_UNAVAILABLE ${storeId}`);
  if (screenshotUrls.length < 3) throw new Error(`INSUFFICIENT_SCREENSHOTS ${storeId} ${screenshotUrls.length}`);
  return {
    app,
    pageUrl: app.trackViewUrl,
    screenshotUrls: screenshotUrls.slice(0, 3),
  };
}
```

- [ ] **Step 5: Implement image validation, WebP normalization, and atomic replacement**

The implementation must download all candidates to a temporary directory, validate all three, and only then rename them over existing assets. Core normalization:

```js
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MAX_BYTES = 450 * 1024;

export async function normalizeScreenshotSet({ assetUrls, outputDir, source, fetchImpl = fetch, collectedAt = new Date().toISOString() }) {
  if (assetUrls.length !== 3) throw new Error('INSUFFICIENT_SCREENSHOTS expected exactly 3 asset URLs');
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
      if (!inputMetadata.width || !inputMetadata.height || inputMetadata.width < 320 || inputMetadata.height <= inputMetadata.width) {
        throw new Error(`INVALID_IMAGE_DIMENSIONS ${assetUrl}`);
      }
      const normalized = await sharp(sourceBuffer)
        .rotate()
        .resize({ width: 720, withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      if (normalized.data.byteLength > MAX_BYTES) throw new Error(`IMAGE_TOO_LARGE ${assetUrl}`);
      const sha256 = crypto.createHash('sha256').update(normalized.data).digest('hex');
      if (assets.some((asset) => asset.integrity.sha256 === sha256)) throw new Error(`DUPLICATE_IMAGE ${assetUrl}`);
      const fileName = `product-screenshot-0${index + 1}.webp`;
      fs.writeFileSync(path.join(stagingDir, fileName), normalized.data);
      assets.push({
        type: 'product-screenshot',
        path: `assets/${fileName}`,
        source: { ...source, assetUrl, collectedAt, usage: 'official-promotional' },
        integrity: {
          sha256,
          byteLength: normalized.data.byteLength,
          width: normalized.info.width,
          height: normalized.info.height,
        },
      });
    }
    for (const asset of assets) {
      fs.renameSync(path.join(stagingDir, path.basename(asset.path)), path.join(outputDir, path.basename(asset.path)));
    }
    return assets;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 6: Implement CLI discovery, App Store collection, and explicit fallback collection**

CLI behavior:

```text
node scripts/collect-mobile-theme-screenshots.mjs discover --theme instagram-mobile --storefront us
node scripts/collect-mobile-theme-screenshots.mjs collect --theme instagram-mobile --store-id 389801252 --storefront us
```

For fallback collection, the CLI accepts `--source-kind`, `--source-page`, `--official-page`, and exactly three repeatable `--asset-url` arguments. Task 7 obtains those values from the reviewed source pages. The CLI must reject non-HTTPS URLs and require real, reachable image responses before modifying the theme.

After collection, update both preview lists and status atomically:

```js
theme.assets.productScreenshots = assets;
theme.previewImages = assets.map(({ type, path }) => ({ type, path }));
theme.display.previewImages = assets.map(({ type, path }) => ({ type, path }));
theme.status.productScreenshots = {
  collection: 'review',
  regression: 'pending',
  expected: 3,
  actual: 3,
  lastRegressionAt: null,
  errors: [],
};
theme.status.displayPage = deriveDisplayPageStatus(theme.status.productScreenshots);
writeJsonAtomic(themePath, theme);
```

- [ ] **Step 7: Run collector tests**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/collect-mobile-theme-screenshots.test.mjs scripts/mobile-theme-screenshots/model.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit the collector**

```bash
git add client/package.json pnpm-lock.yaml client/scripts/mobile-theme-screenshots client/scripts/collect-mobile-theme-screenshots.mjs client/scripts/collect-mobile-theme-screenshots.test.mjs
git commit -m "feat(client): add mobile product screenshot collector"
```

### Task 3: Generate Explicit Per-Theme Asset Wiring

**Files:**
- Create: `client/scripts/sync-mobile-theme-screenshot-wiring.mjs`
- Create: `client/scripts/sync-mobile-theme-screenshot-wiring.test.mjs`
- Modify: `client/src/themes/*-mobile/index.tsx`

**Interfaces:**
- Consumes: a mobile `index.tsx` and a `theme.json` containing exactly three product screenshots.
- Produces: three explicit `?url` imports and a three-item `previewImages` runtime array, preserving all unrelated source text.

- [ ] **Step 1: Write a failing TypeScript-AST edit test**

```js
import { describe, expect, it } from 'vitest';
import { rewriteMobileThemeEntry } from './sync-mobile-theme-screenshot-wiring.mjs';

describe('mobile theme screenshot wiring', () => {
  it('replaces only the cover import and previewImages initializer', () => {
    const source = `
import previewAsset0 from './assets/cover.svg?url';
const config = {
  brand: display.brand,
  previewImages: [
    { type: display.previewImages[0].type, url: previewAsset0 }
  ],
  mobilePreview,
};
`;
    const output = rewriteMobileThemeEntry(source, 'fixture.tsx');
    expect(output).toContain("import productScreenshot01 from './assets/product-screenshot-01.webp?url';");
    expect(output).toContain("import productScreenshot03 from './assets/product-screenshot-03.webp?url';");
    expect(output).not.toContain('cover.svg?url');
    expect(output).toContain("{ type: 'product-screenshot', url: productScreenshot01 }");
    expect(output).toContain("{ type: 'product-screenshot', url: productScreenshot03 }");
    expect(output).toContain('mobilePreview,');
  });
});
```

- [ ] **Step 2: Run the wiring test and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/sync-mobile-theme-screenshot-wiring.test.mjs`

Expected: FAIL because the synchronizer does not exist.

- [ ] **Step 3: Implement parser-guided text edits**

Use the TypeScript compiler API to locate nodes; do not use a repository-wide regular-expression replacement.

```js
import ts from 'typescript';

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

export function rewriteMobileThemeEntry(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === './assets/cover.svg?url') {
      edits.push({ start: statement.getStart(sourceFile), end: statement.getEnd(), text: importBlock });
    }
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'previewImages') {
      edits.push({
        start: node.initializer.getStart(sourceFile),
        end: node.initializer.getEnd(),
        text: previewInitializer,
      });
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
```

The CLI enumerates mobile themes through `listMobileThemeDirs`, refuses to rewrite a theme until all three WebP files and metadata records exist, and supports `--check` for CI.

- [ ] **Step 4: Run the wiring test**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/sync-mobile-theme-screenshot-wiring.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the synchronizer before applying it to themes**

```bash
git add client/scripts/sync-mobile-theme-screenshot-wiring.mjs client/scripts/sync-mobile-theme-screenshot-wiring.test.mjs
git commit -m "feat(client): generate mobile screenshot imports"
```

### Task 4: Replace The Synthetic Phone With A Three-Image Gallery

**Files:**
- Modify: `client/src/common/DesignMdBatchShowcase/index.tsx`
- Modify: `client/tests/design-md-mobile-showcase.test.tsx`

**Interfaces:**
- Consumes: `BatchShowcaseConfig.previewImages`, exactly three items for a ready `mobile-product` theme.
- Produces: `MobileScreenshotGallery({ config, onOpen })`, three image buttons, and existing lightbox behavior.

- [ ] **Step 1: Replace the SSR test with the three-image contract**

```tsx
it('renders exactly three real product screenshots for a mobile theme', () => {
  const html = renderToStaticMarkup(
    <DesignMdBatchShowcase
      config={{
        ...sharedConfig,
        variant: 'mobile-product',
        previewImages: [
          { type: 'product-screenshot', url: '/screen-1.webp' },
          { type: 'product-screenshot', url: '/screen-2.webp' },
          { type: 'product-screenshot', url: '/screen-3.webp' },
        ],
        mobilePreview: {
          pattern: 'chat',
          navigation: ['首页', '消息', '我的'],
          primaryAction: '开始对话',
        },
      }}
    />,
  );

  expect(html).toContain('dmb-mobile-screenshot-gallery');
  expect(html.match(/class="dmb-mobile-screenshot"/g)).toHaveLength(3);
  expect(html.match(/<img /g)).toHaveLength(3);
  expect(html).not.toContain('dmb-mobile-primary-action');
  expect(html).not.toContain('dmb-mobile-nav');
});
```

Keep the existing ordinary desktop-configuration test.

- [ ] **Step 2: Run the focused SSR test and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run tests/design-md-mobile-showcase.test.tsx`

Expected: FAIL because the synthetic phone still renders.

- [ ] **Step 3: Replace `MobilePreview` with `MobileScreenshotGallery`**

```tsx
function MobileScreenshotGallery({
  config,
  onOpen,
}: {
  config: BatchShowcaseConfig;
  onOpen: (url: string) => void;
}) {
  if (config.variant !== 'mobile-product') return null;
  const screenshots = config.previewImages.filter((image) => image.type === 'product-screenshot').slice(0, 3);
  const imageLabel = config.brandAlias || config.brand;

  return (
    <section className="dmb-mobile-screenshot-gallery" aria-label={`${imageLabel} product screenshots`}>
      {screenshots.map((image, index) => (
        <button
          className="dmb-mobile-screenshot"
          key={`${image.url}-${index}`}
          type="button"
          onClick={() => onOpen(image.url)}
          aria-label={`Open ${imageLabel} product screenshot ${index + 1}`}
        >
          <img src={image.url} alt={`${imageLabel} product screenshot ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} />
        </button>
      ))}
    </section>
  );
}
```

Render it as:

```tsx
<MobileScreenshotGallery config={config} onOpen={setZoomImage} />
{config.variant === 'mobile-product' ? null : <PreviewFigure config={config} onOpen={setZoomImage} />}
```

Delete `mobileScenes` and the synthetic phone markup. Keep `BatchMobilePreview` temporarily because the 50 theme metadata files still use it for design guidance; it no longer controls the hero preview.

- [ ] **Step 4: Run the focused SSR test**

Run: `pnpm --filter @axhub/make-client exec vitest --run tests/design-md-mobile-showcase.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the gallery markup**

```bash
git add client/src/common/DesignMdBatchShowcase/index.tsx client/tests/design-md-mobile-showcase.test.tsx
git commit -m "feat(client): show three mobile product screenshots"
```

### Task 5: Implement Desktop And Narrow Gallery Layouts

**Files:**
- Modify: `client/src/common/DesignMdBatchShowcase/base.css`
- Modify: `client/tests/design-md-batch-showcase-open-layout.test.ts`

**Interfaces:**
- Consumes: `.dmb-mobile-screenshot-gallery` with exactly three child buttons.
- Produces: one desktop grid row and one narrow horizontal snap row without document-level horizontal overflow.

- [ ] **Step 1: Add failing CSS contract assertions**

```ts
it('uses the full content width for three mobile screenshots on desktop', () => {
  const galleryRule = baseCss.match(/\.dmb-mobile-screenshot-gallery\s*\{[^}]+\}/)?.[0] ?? '';
  expect(galleryRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  expect(galleryRule).toContain('width: 100%');
  expect(galleryRule).not.toContain('390px');
});

it('keeps mobile screenshots in a horizontal snap row on narrow viewports', () => {
  expect(baseCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.dmb-mobile-screenshot-gallery[\s\S]*overflow-x: auto/);
  expect(baseCss).toMatch(/@media \(max-width: 760px\)[\s\S]*grid-auto-flow: column/);
  expect(baseCss).toContain('scroll-snap-type: x mandatory');
});
```

- [ ] **Step 2: Run the layout contract and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run tests/design-md-batch-showcase-open-layout.test.ts`

Expected: FAIL because the gallery rules do not exist.

- [ ] **Step 3: Remove the synthetic phone rules and add gallery CSS**

```css
.dmb-mobile-screenshot-gallery {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
  overflow: hidden;
}

.dmb-mobile-screenshot {
  width: 100%;
  aspect-ratio: 9 / 16;
  display: block;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dmb-border, #dfe1e7) 88%, transparent);
  border-radius: var(--dmb-radius-preview, 7px);
  background: var(--dmb-surface, #ffffff);
  padding: 0;
  cursor: zoom-in;
  scroll-snap-align: start;
}

.dmb-mobile-screenshot img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  object-position: center;
}

@media (max-width: 760px) {
  .dmb-mobile-screenshot-gallery {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: min(78vw, 320px);
    gap: 12px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .dmb-mobile-screenshot-gallery::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 4: Run SSR and layout tests together**

Run: `pnpm --filter @axhub/make-client exec vitest --run tests/design-md-mobile-showcase.test.tsx tests/design-md-batch-showcase-open-layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the responsive layout**

```bash
git add client/src/common/DesignMdBatchShowcase/base.css client/tests/design-md-batch-showcase-open-layout.test.ts
git commit -m "style(client): expand mobile screenshot gallery"
```

### Task 6: Add Status Reporting

**Files:**
- Create: `client/scripts/report-mobile-theme-screenshot-status.mjs`
- Create: `client/scripts/report-mobile-theme-screenshot-status.test.mjs`

**Interfaces:**
- Consumes: all 50 mobile `theme.json` files.
- Produces: console summary, per-theme table, process exit code 1 for blocked/failed themes when `--strict` is present, and optional `.local/mobile-theme-screenshots/status.json` with `--json`.

- [ ] **Step 1: Write failing aggregation tests**

```js
import { describe, expect, it } from 'vitest';
import { summarizeStatuses } from './report-mobile-theme-screenshot-status.mjs';

describe('mobile screenshot status report', () => {
  it('counts collection and regression states independently', () => {
    expect(summarizeStatuses([
      { slug: 'one-mobile', collection: 'complete', regression: 'passed', actual: 3 },
      { slug: 'two-mobile', collection: 'review', regression: 'pending', actual: 3 },
      { slug: 'three-mobile', collection: 'blocked', regression: 'pending', actual: 0 },
    ])).toEqual({
      total: 3,
      assets: 6,
      collection: { complete: 1, review: 1, blocked: 1 },
      regression: { passed: 1, pending: 2 },
      ready: 1,
    });
  });
});
```

- [ ] **Step 2: Run the report test and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/report-mobile-theme-screenshot-status.test.mjs`

Expected: FAIL because the report module does not exist.

- [ ] **Step 3: Implement deterministic aggregation and output**

```js
export function summarizeStatuses(rows) {
  const summary = { total: rows.length, assets: 0, collection: {}, regression: {}, ready: 0 };
  for (const row of rows) {
    summary.assets += row.actual;
    summary.collection[row.collection] = (summary.collection[row.collection] || 0) + 1;
    summary.regression[row.regression] = (summary.regression[row.regression] || 0) + 1;
    if (row.collection === 'complete' && row.regression === 'passed') summary.ready += 1;
  }
  return summary;
}
```

The CLI prints columns `theme`, `collection`, `assets`, `regression`, and `errors`, sorted by slug. It derives rows only from theme metadata and never treats this plan's tracker table as runtime input.

- [ ] **Step 4: Run the report test**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/report-mobile-theme-screenshot-status.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the reporter**

```bash
git add client/scripts/report-mobile-theme-screenshot-status.mjs client/scripts/report-mobile-theme-screenshot-status.test.mjs client/package.json
git commit -m "feat(client): report mobile screenshot rollout status"
```

### Task 7: Collect, Review, And Wire All 50 Themes

**Files:**
- Modify: `client/src/themes/*-mobile/theme.json`
- Modify: `client/src/themes/*-mobile/index.tsx`
- Create: `client/src/themes/*-mobile/assets/product-screenshot-01.webp`
- Create: `client/src/themes/*-mobile/assets/product-screenshot-02.webp`
- Create: `client/src/themes/*-mobile/assets/product-screenshot-03.webp`
- Modify: `docs/superpowers/plans/2026-07-27-mobile-theme-product-screenshot-rollout.md` after each reviewed batch.

**Interfaces:**
- Consumes: collector, wiring synchronizer, and the source fallback rules in this plan.
- Produces: 150 committed WebP assets and 50 metadata records in `collection=complete`, `regression=pending`.

- [ ] **Step 1: Run source discovery for every theme and retain the report locally**

Run: `pnpm --filter @axhub/make-client screenshots:collect -- discover --all --storefront us --output .local/mobile-theme-screenshots/candidates.json`

Expected: a 50-theme candidate report; no source files modified.

- [ ] **Step 2: Review candidate product/publisher identity**

For every candidate, verify that `trackName`, `artistName`, and `bundleId` represent the exact product named by the theme. Reject sibling products such as WhatsApp Business for `whatsapp-mobile`. Save approved IDs to `.local/mobile-theme-screenshots/approved-sources.json`; this local file is input only and is not committed.

- [ ] **Step 3: Collect the Apple-backed themes**

Run: `pnpm --filter @axhub/make-client screenshots:collect -- collect --all --approved-sources .local/mobile-theme-screenshots/approved-sources.json`

Expected: themes with at least three static App Store images move to `collection=review`; unavailable themes remain unchanged and appear in the error report with stable codes.

- [ ] **Step 4: Resolve fallback themes from Google Play, official promotional pages, or approved market mirrors**

For each unavailable theme, run the same `collect` command with one `--source-page`, one `--official-page`, one allowed `--source-kind`, and exactly three `--asset-url` arguments. The collector validates the actual URLs and records them in metadata. Do not edit image files manually and do not substitute sibling products.

- [ ] **Step 5: Review each three-image set as a coherent product sample**

Accept a set only when all three images:

- show the intended product rather than generic campaign photography;
- cover three materially different screens or states;
- contain no obvious personal/private user data beyond official promotional fixtures;
- are current enough to represent the product's present visual system;
- remain legible at the normalized 720px width.

After review, set `collection=complete`, preserve `regression=pending`, and derive `displayPage=in-progress` through the model helper.

- [ ] **Step 6: Run explicit import synchronization**

Run: `pnpm --filter @axhub/make-client screenshots:wire`

Expected: 50 updated entry files with three explicit WebP imports.

- [ ] **Step 7: Verify wiring is stable**

Run: `pnpm --filter @axhub/make-client screenshots:wire -- --check`

Expected: exit 0 with `50 mobile theme entries are synchronized`.

- [ ] **Step 8: Print and review rollout status**

Run: `pnpm --filter @axhub/make-client screenshots:status -- --strict`

Expected before regression: `collection complete 50/50`, `assets 150/150`, `regression passed 0/50`; strict mode must allow `pending` regression but reject blocked/failed records.

- [ ] **Step 9: Commit reviewed assets in five bounded batches**

Use alphabetical batches of ten themes so a reviewer can reject one source set without mixing the entire portfolio into one commit.

```bash
git add client/src/themes/airbnb-mobile client/src/themes/apple-music-mobile client/src/themes/audible-mobile client/src/themes/binance-mobile client/src/themes/booking-mobile client/src/themes/bumble-mobile client/src/themes/calm-mobile client/src/themes/canva-mobile client/src/themes/cash-app-mobile client/src/themes/chatgpt-mobile
git commit -m "feat(client): add mobile screenshots batch 1"

git add client/src/themes/coinbase-mobile client/src/themes/discord-mobile client/src/themes/disney-plus-mobile client/src/themes/doordash-mobile client/src/themes/duolingo-mobile client/src/themes/facebook-mobile client/src/themes/fitbit-mobile client/src/themes/gmail-mobile client/src/themes/google-calendar-mobile client/src/themes/google-maps-mobile
git commit -m "feat(client): add mobile screenshots batch 2"

git add client/src/themes/headspace-mobile client/src/themes/instagram-mobile client/src/themes/jira-mobile client/src/themes/linkedin-mobile client/src/themes/mcdonalds-mobile client/src/themes/myfitnesspal-mobile client/src/themes/netflix-mobile client/src/themes/notion-mobile client/src/themes/paypal-mobile client/src/themes/reddit-mobile
git commit -m "feat(client): add mobile screenshots batch 3"

git add client/src/themes/revolut-mobile client/src/themes/robinhood-mobile client/src/themes/slack-mobile client/src/themes/soundcloud-mobile client/src/themes/spotify-mobile client/src/themes/starbucks-mobile client/src/themes/strava-mobile client/src/themes/telegram-mobile client/src/themes/tiktok-mobile client/src/themes/tinder-mobile
git commit -m "feat(client): add mobile screenshots batch 4"

git add client/src/themes/trello-mobile client/src/themes/twitch-mobile client/src/themes/uber-eats-mobile client/src/themes/uber-mobile client/src/themes/waze-mobile client/src/themes/wechat-mobile client/src/themes/whatsapp-mobile client/src/themes/x-twitter-mobile client/src/themes/youtube-mobile client/src/themes/zoom-mobile
git commit -m "feat(client): add mobile screenshots batch 5"
```

### Task 8: Add And Run Visual Regression For All Mobile Themes

**Files:**
- Create: `client/scripts/regress-mobile-theme-screenshots.mjs`
- Create: `client/scripts/regress-mobile-theme-screenshots.test.mjs`
- Modify: `client/src/themes/*-mobile/theme.json`

**Interfaces:**
- Consumes: local theme routes, viewport set `{ desktop: 1440x900, mobile: 390x844 }`, and `.dmb-mobile-screenshot-gallery`.
- Produces: `.local/mobile-theme-screenshot-regression/<slug>/{desktop,mobile}.png`, DOM measurements, and `regression=passed|failed` metadata.

- [ ] **Step 1: Write failing pure validation tests**

```js
import { describe, expect, it } from 'vitest';
import { validateGalleryState } from './regress-mobile-theme-screenshots.mjs';

describe('mobile screenshot visual regression state', () => {
  it('accepts a desktop row with three loaded images and no page overflow', () => {
    expect(validateGalleryState({
      viewport: 'desktop',
      imageCount: 3,
      loadedCount: 3,
      itemTops: [210, 210, 210],
      galleryClientWidth: 1110,
      galleryScrollWidth: 1110,
      documentClientWidth: 1440,
      documentScrollWidth: 1440,
    })).toEqual([]);
  });

  it('accepts narrow gallery overflow but rejects document overflow', () => {
    expect(validateGalleryState({
      viewport: 'mobile',
      imageCount: 3,
      loadedCount: 3,
      itemTops: [170, 170, 170],
      galleryClientWidth: 342,
      galleryScrollWidth: 812,
      documentClientWidth: 390,
      documentScrollWidth: 390,
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the regression unit test and verify failure**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/regress-mobile-theme-screenshots.test.mjs`

Expected: FAIL because the regression module does not exist.

- [ ] **Step 3: Implement gallery-state validation**

```js
export function validateGalleryState(state) {
  const failures = [];
  if (state.imageCount !== 3) failures.push(`expected 3 images, found ${state.imageCount}`);
  if (state.loadedCount !== 3) failures.push(`expected 3 loaded images, found ${state.loadedCount}`);
  if (Math.max(...state.itemTops) - Math.min(...state.itemTops) > 2) failures.push('images are not in one row');
  if (state.documentScrollWidth > state.documentClientWidth + 1) failures.push('document has horizontal overflow');
  if (state.viewport === 'desktop' && state.galleryScrollWidth > state.galleryClientWidth + 1) {
    failures.push('desktop gallery unexpectedly scrolls');
  }
  if (state.viewport === 'mobile' && state.galleryScrollWidth <= state.galleryClientWidth) {
    failures.push('mobile gallery is not horizontally scrollable');
  }
  return failures;
}
```

- [ ] **Step 4: Implement Vite startup, Playwright inspection, screenshots, and status writes**

Use Vite's `createServer` API with port `0` so the script is cross-platform and avoids collisions. Reuse the Chromium lookup fallback pattern from `capture-theme-source.mjs`; do not start a shell command string. For each theme and viewport, evaluate:

```js
const state = await page.evaluate((viewport) => {
  const gallery = document.querySelector('.dmb-mobile-screenshot-gallery');
  const images = [...document.querySelectorAll('.dmb-mobile-screenshot img')];
  const items = [...document.querySelectorAll('.dmb-mobile-screenshot')];
  return {
    viewport,
    imageCount: images.length,
    loadedCount: images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length,
    itemTops: items.map((item) => Math.round(item.getBoundingClientRect().top)),
    galleryClientWidth: gallery?.clientWidth || 0,
    galleryScrollWidth: gallery?.scrollWidth || 0,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  };
}, viewportName);
```

Write `regression=passed`, an ISO `lastRegressionAt`, empty errors, and derived `displayPage=ready` only after both viewports pass. On failure, write `regression=failed`, stable failure strings, and derived `displayPage=in-progress`.

- [ ] **Step 5: Run regression unit tests**

Run: `pnpm --filter @axhub/make-client exec vitest --run scripts/regress-mobile-theme-screenshots.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run all 50 browser regressions**

Run: `pnpm --filter @axhub/make-client screenshots:regress -- --all --write-status`

Expected: `50 passed, 0 failed`; 100 diagnostic screenshots written under `.local/`.

- [ ] **Step 7: Inspect representative output**

Visually inspect at least:

- `whatsapp-mobile` because it uses the fallback source path;
- `instagram-mobile` because it represents App Store static screenshots;
- the longest brand name in the set;
- one light theme and one dark theme;
- one 390x844 narrow capture with horizontal scrolling.

Confirm actual product UI is visible, screenshots are not cropped, no two images overlap, desktop uses the available width, and narrow pages do not introduce page-level horizontal overflow.

- [ ] **Step 8: Commit regression states and scripts**

```bash
git add client/scripts/regress-mobile-theme-screenshots.mjs client/scripts/regress-mobile-theme-screenshots.test.mjs client/src/themes/*-mobile/theme.json client/package.json
git commit -m "test(client): regress mobile screenshot galleries"
```

### Task 9: Enforce The Final 50-Theme Contract And Verify The Build

**Files:**
- Create: `client/tests/mobile-theme-screenshot-contract.test.ts`
- Modify: `docs/superpowers/plans/2026-07-27-mobile-theme-product-screenshot-rollout.md`

**Interfaces:**
- Consumes: all mobile theme assets, metadata, entries, and regression states.
- Produces: a permanent guard preventing a theme from returning to one synthetic image, incomplete provenance, or a failed regression state.

- [ ] **Step 1: Write the final portfolio contract**

```ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const themesRoot = path.join(appRoot, 'src/themes');
const slugs = fs.readdirSync(themesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.endsWith('-mobile'))
  .map((entry) => entry.name)
  .sort();

describe('mobile product screenshot portfolio', () => {
  it('contains the expected 50 mobile themes', () => {
    expect(slugs).toHaveLength(50);
  });

  it.each(slugs)('%s ships three verified product screenshots', (slug) => {
    const themeRoot = path.join(themesRoot, slug);
    const theme = JSON.parse(fs.readFileSync(path.join(themeRoot, 'theme.json'), 'utf8'));
    const assets = theme.assets?.productScreenshots;
    expect(assets).toHaveLength(3);
    expect(theme.previewImages).toEqual(assets.map(({ type, path: assetPath }) => ({ type, path: assetPath })));
    expect(theme.display.previewImages).toEqual(theme.previewImages);
    expect(theme.status.productScreenshots).toMatchObject({
      collection: 'complete',
      regression: 'passed',
      expected: 3,
      actual: 3,
      errors: [],
    });
    expect(theme.status.displayPage).toBe('ready');
    for (const asset of assets) {
      const filePath = path.join(themeRoot, asset.path);
      expect(fs.existsSync(filePath), `${slug}: ${asset.path}`).toBe(true);
      const contents = fs.readFileSync(filePath);
      expect(crypto.createHash('sha256').update(contents).digest('hex')).toBe(asset.integrity.sha256);
      expect(contents.byteLength).toBe(asset.integrity.byteLength);
      expect(asset.source.usage).toBe('official-promotional');
      expect(asset.source.pageUrl).toMatch(/^https:\/\//);
      expect(asset.source.officialPageUrl).toMatch(/^https:\/\//);
    }
    const indexSource = fs.readFileSync(path.join(themeRoot, 'index.tsx'), 'utf8');
    expect(indexSource.match(/product-screenshot-0[1-3]\.webp\?url/g)).toHaveLength(3);
    expect(indexSource).not.toContain("./assets/cover.svg?url");
  });
});
```

- [ ] **Step 2: Run all screenshot-focused tests**

Run:

```bash
pnpm --filter @axhub/make-client exec vitest --run \
  scripts/mobile-theme-screenshots/model.test.mjs \
  scripts/collect-mobile-theme-screenshots.test.mjs \
  scripts/sync-mobile-theme-screenshot-wiring.test.mjs \
  scripts/report-mobile-theme-screenshot-status.test.mjs \
  scripts/regress-mobile-theme-screenshots.test.mjs \
  tests/design-md-mobile-showcase.test.tsx \
  tests/design-md-batch-showcase-open-layout.test.ts \
  tests/mobile-theme-screenshot-contract.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 3: Run final status report**

Run: `pnpm --filter @axhub/make-client screenshots:status -- --strict`

Expected: `ready 50/50`, `assets 150/150`, `collection complete 50/50`, `regression passed 50/50`, no errors.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @axhub/make-client typecheck`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 5: Run the complete client test suite**

Run: `pnpm --filter @axhub/make-client test:run`

Expected: exit 0; all tests pass.

- [ ] **Step 6: Build every client entry**

Run: `pnpm --filter @axhub/make-client build`

Expected: exit 0; all prototype/theme entries build and each mobile entry resolves its three WebP imports.

- [ ] **Step 7: Update this plan's trackers**

Set every workstream to `complete` and every per-theme row to `collection=complete`, `provenance review=complete`, `regression=passed`, `3/3`. The machine-generated report remains the authoritative verification result.

- [ ] **Step 8: Commit the final contract and plan status**

```bash
git add client/tests/mobile-theme-screenshot-contract.test.ts docs/superpowers/plans/2026-07-27-mobile-theme-product-screenshot-rollout.md
git commit -m "test(client): enforce mobile screenshot portfolio"
```

---

## Completion Criteria

- The WhatsApp route at `?projectId=make-project&theme=whatsapp-mobile` uses the available content width for three real consumer-product screenshots.
- All 50 mobile themes render exactly three local screenshots on desktop.
- Narrow layouts retain a single horizontal scroll row and never create document-level horizontal overflow.
- All 150 images have committed source provenance and integrity metadata.
- Every theme reports `collection=complete`, `regression=passed`, and `displayPage=ready`.
- Qimai is not a runtime or automated collection dependency.
- Screenshot-focused tests, full client tests, typecheck, and build all pass.
