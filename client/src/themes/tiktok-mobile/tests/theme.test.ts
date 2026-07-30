import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const themeRoot = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath: string): string {
  return fs.readFileSync(path.join(themeRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(read(relativePath)) as Record<string, any>;
}

describe('tiktok-mobile source-backed theme', () => {
  it('projects the pinned DESIGN.md colors, typography, spacing, and radius', () => {
    const theme = readJson('theme.json');
    const tokens = readJson('assets/tokens.json');

    expect(theme.tokens.appearance).toEqual({ defaultMode: 'dark', source: 'design-md' });
    expect(theme.tokens.palette).toEqual([
      '#010101',
      '#FE2C55',
      '#25F4EE',
      '#FFFFFF',
      '#161823',
      '#2F2F2F',
      '#E5E5E5',
    ]);
    expect(theme.tokens.typography).toMatchObject({
      display: 'Proxima Nova',
      body: 'Proxima Nova',
      primary: 'Proxima Nova',
    });
    expect(theme.tokens.spacing).toEqual({
      base: '4px',
      scale: ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '48px', '64px', '96px'],
      source: 'design-md',
    });
    expect(theme.tokens.radius).toEqual({
      control: '4px',
      card: '8px',
      preview: '12px',
      pill: '500px',
      circle: '50%',
      scale: ['0px', '4px', '8px', '12px', '500px', '50%'],
      source: 'design-md',
    });
    expect(tokens).toEqual(theme.tokens);
  });

  it('uses the dark TikTok projection in its theme-local CSS and cover', () => {
    const css = read('style.css');
    const cover = read('assets/cover.svg');

    expect(css).toContain('--dmb-bg: #010101;');
    expect(css).toContain('--dmb-accent: #FE2C55;');
    expect(css).toContain('--dmb-secondary-accent: #25F4EE;');
    expect(css).toContain('--dmb-ink: #FFFFFF;');
    expect(css).toContain('--dmb-font-display: "Proxima Nova"');
    expect(css).toContain('--dmb-radius-control: 4px;');
    expect(css).not.toContain('--dmb-bg: #ffffff;');

    expect(cover).toContain('fill="#010101"');
    expect(cover).toContain('fill="#FE2C55"');
    expect(cover).toContain('fill="#25F4EE"');
    expect(cover).toContain('font-family="Proxima Nova');
  });

  it('keeps the official screenshot gallery without the generic feed preview', () => {
    const theme = readJson('theme.json');
    const source = read('index.tsx');

    expect(theme.assets.productScreenshots).toHaveLength(3);
    expect(theme.previewImages).toEqual([
      { type: 'product-screenshot', path: 'assets/product-screenshot-01.webp' },
      { type: 'product-screenshot', path: 'assets/product-screenshot-02.webp' },
      { type: 'product-screenshot', path: 'assets/product-screenshot-03.webp' },
    ]);
    expect(theme.display.mobilePreview).toBeUndefined();
    expect(source).not.toContain('BatchMobilePreview');
    expect(source).not.toContain('mobilePreview');
  });
});
