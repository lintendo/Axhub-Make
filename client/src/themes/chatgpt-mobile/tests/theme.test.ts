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

describe('chatgpt-mobile source-backed theme', () => {
  it('projects the pinned monochromatic DESIGN.md tokens', () => {
    const designMd = read('DESIGN.md');
    const theme = readJson('theme.json');
    const tokens = readJson('assets/tokens.json');

    expect(theme.source.upstreamCommit).toBe('5d3aeca239caef3ea4080034eb22ab87cc77fa24');
    expect(designMd).toContain('stripping out the legacy ChatGPT Green (`#10A37F`)');
    expect(designMd).toContain('**Black** (`#0D0D0D`): Primary text on light mode');

    expect(theme.tokens.appearance).toEqual({ defaultMode: 'light', source: 'design-md' });
    expect(theme.tokens.palette).toEqual([
      '#0D0D0D',
      '#FFFFFF',
      '#212121',
      '#ECECEC',
      '#F7F7F8',
      '#2F2F2F',
      '#E5E5E5',
      '#676767',
      '#8E8E8E',
      '#2A7FFF',
      '#CCCCCC',
      '#4D4D4D',
      '#3B82F6',
      '#60A5FA',
      '#93C5FD',
    ]);
    expect(theme.tokens.typography).toMatchObject({
      display: 'Söhne',
      body: 'Söhne',
      primary: 'Söhne',
      mono: 'Menlo',
    });
    expect(theme.tokens.spacing).toEqual({
      base: '4px',
      scale: ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '40px', '56px', '72px'],
      source: 'design-md',
    });
    expect(theme.tokens.radius).toEqual({
      control: '8px',
      card: '18px',
      preview: '24px',
      pill: '500px',
      circle: '50%',
      scale: ['0px', '4px', '8px', '12px', '18px', '24px', '500px', '50%'],
      source: 'design-md',
    });
    expect(tokens).toEqual(theme.tokens);
  });

  it('uses the post-2024 monochromatic projection in local CSS and cover', () => {
    const css = read('style.css');
    const cover = read('assets/cover.svg');

    expect(css).toContain('--dmb-bg: #FFFFFF;');
    expect(css).toContain('--dmb-accent: #0D0D0D;');
    expect(css).toContain('--dmb-link: #2A7FFF;');
    expect(css).toContain('--dmb-font-display: "Söhne"');
    expect(css).not.toContain('#10A37F');
    expect(css).not.toContain('#6b7280');

    expect(cover).toContain('fill="#0D0D0D"');
    expect(cover).toContain('fill="#FFFFFF"');
    expect(cover).toContain('fill="#2A7FFF"');
    expect(cover).toContain('stop-color="#3B82F6"');
    expect(cover).toContain('font-family="Söhne');
    expect(cover).not.toContain('#10A37F');
    expect(cover).not.toContain('#6b7280');
  });

  it('keeps three official screenshots without the generic assistant preview', () => {
    const theme = readJson('theme.json');
    const source = read('index.tsx');

    expect(theme.assets.productScreenshots).toHaveLength(3);
    expect(theme.previewImages).toHaveLength(3);
    expect(theme.display.mobilePreview).toBeUndefined();
    expect(source).not.toContain('BatchMobilePreview');
    expect(source).not.toContain('mobilePreview');
  });
});
