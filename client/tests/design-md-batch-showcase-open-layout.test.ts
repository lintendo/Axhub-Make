import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function cssValue(rule: string, property: string) {
  return rule.match(new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`))?.[1]?.trim();
}

describe('DesignMdBatchShowcase open layout', () => {
  const baseCss = read('src/common/DesignMdBatchShowcase/base.css');
  const appleCss = read('src/themes/apple/implementations/react/style.css');

  it('does not frame the whole showcase as a bordered card', () => {
    const sheetRule = baseCss.match(/\.dmb-sheet\s*\{[^}]+\}/)?.[0] ?? '';

    expect(sheetRule).toContain('background: transparent');
    expect(sheetRule).toContain('border: 0');
    expect(sheetRule).toContain('border-radius: 0');
  });

  it('keeps hierarchy through open header, preview, and metadata surfaces', () => {
    expect(baseCss).toContain('.dmb-overview-meta');
    expect(baseCss).toContain('.dmb-preview::before');
    expect(baseCss).toContain('.dmb-token-card');
  });

  it('keeps compact token summary pieces from inheriting oversized card radii', () => {
    const tokenChipRule = baseCss.match(/\.dmb-token-chip\s*\{[^}]+\}/)?.[0] ?? '';
    const tokenGridTileRule = baseCss.match(/\.dmb-token-grid > div\s*\{[^}]+\}/)?.[0] ?? '';

    expect(cssValue(tokenChipRule, 'border-radius')).toBe('var(--dmb-radius-control, 0)');
    expect(cssValue(tokenGridTileRule, 'border-radius')).toBe('var(--dmb-radius-control, 0)');
  });

  it('sizes enlarged image previews by width and scrolls only when content exceeds the viewport', () => {
    const lightboxScrollRule = baseCss.match(/\.dmb-lightbox-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const lightboxImageRule = baseCss.match(/\.dmb-lightbox img\s*\{[^}]+\}/)?.[0] ?? '';

    expect(lightboxScrollRule).toContain('max-width: calc(100vw - 48px)');
    expect(lightboxScrollRule).toContain('max-height: calc(100vh - 86px)');
    expect(cssValue(lightboxScrollRule, 'height')).toBe('auto');
    expect(lightboxImageRule).toContain('max-height: none');
  });

  it('lets Apple render the primary screenshot as an edge-to-edge brand canvas', () => {
    expect(appleCss).toContain('--dmb-radius-preview: 0px');
    expect(appleCss).toContain('.dmb-variant-consumer-commerce .dmb-preview');
    expect(appleCss).toContain('height: min(760px, 72vw)');
    expect(appleCss).toContain('.dmb-variant-consumer-commerce .dmb-preview-label');
    expect(appleCss).toContain('display: none');
  });

  it('uses the full content width for three mobile screenshots on desktop', () => {
    const galleryRule = baseCss.match(/\.dmb-mobile-screenshot-gallery\s*\{[^}]+\}/)?.[0] ?? '';

    expect(galleryRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(galleryRule).toContain('width: 100%');
    expect(galleryRule).not.toContain('390px');
  });

  it('keeps mobile screenshots in a horizontal snap row on narrow viewports', () => {
    expect(baseCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.dmb-mobile-screenshot-gallery[\s\S]*overflow-x: auto/);
    expect(baseCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.dmb-mobile-screenshot-gallery[\s\S]*grid-auto-flow: column/);
    expect(baseCss).toContain('scroll-snap-type: x mandatory');
  });
});
