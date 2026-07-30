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

describe('doordash-mobile source-backed theme', () => {
  it('projects the pinned DESIGN.md colors, typography, spacing, and radius', () => {
    const designMd = read('DESIGN.md');
    const theme = readJson('theme.json');
    const tokens = readJson('assets/tokens.json');

    expect(theme.source.upstreamCommit).toBe('5d3aeca239caef3ea4080034eb22ab87cc77fa24');
    expect(designMd).toContain('**DoorDash Red** (`#EB1700`): Primary CTA backgrounds');
    expect(designMd).toContain('**Fee Green** (`#008B4A`): "$0 delivery" green tags');

    expect(theme.tokens.appearance).toEqual({ defaultMode: 'light', source: 'design-md' });
    expect(theme.tokens.palette).toEqual([
      '#EB1700',
      '#C31500',
      '#FFEBE8',
      '#FFFFFF',
      '#191919',
      '#757575',
      '#F7F7F7',
      '#E5E5E5',
      '#FF8000',
      '#008B4A',
      '#006B82',
    ]);
    expect(theme.tokens.typography).toMatchObject({
      display: 'TT Norms Pro',
      body: 'TT Norms Pro',
      primary: 'TT Norms Pro',
      mono: 'SF Mono',
    });
    expect(theme.tokens.spacing).toEqual({
      base: '4px',
      scale: ['2px', '4px', '8px', '12px', '16px', '20px', '24px', '32px', '40px', '56px', '72px'],
      source: 'design-md',
    });
    expect(theme.tokens.radius).toEqual({
      control: '12px',
      card: '16px',
      preview: '16px',
      pill: '28px',
      circle: '50%',
      scale: ['4px', '8px', '12px', '16px', '20px', '28px', '50%'],
      source: 'design-md',
    });
    expect(tokens).toEqual(theme.tokens);
  });

  it('uses the DoorDash light projection in its theme-local CSS and cover', () => {
    const css = read('style.css');
    const cover = read('assets/cover.svg');

    expect(css).toContain('--dmb-bg: #FFFFFF;');
    expect(css).toContain('--dmb-accent: #EB1700;');
    expect(css).toContain('--dmb-link: #0066E3;');
    expect(css).toContain('--dmb-ink: #191919;');
    expect(css).toContain('--dmb-font-display: "TT Norms Pro"');
    expect(css).toContain('--dmb-radius-control: 12px;');
    expect(css).not.toContain('--dmb-accent: #008B4A;');
    expect(css).not.toContain('#6b7280');

    expect(cover).toContain('fill="#EB1700"');
    expect(cover).toContain('fill="#FFEBE8"');
    expect(cover).toContain('fill="#008B4A"');
    expect(cover).toContain('font-family="TT Norms Pro');
    expect(cover).not.toContain('#6b7280');
  });

  it('keeps the official screenshot gallery without the generic commerce preview', () => {
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
