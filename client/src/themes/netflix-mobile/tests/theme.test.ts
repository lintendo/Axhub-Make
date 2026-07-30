import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const themeRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath: string) => fs.readFileSync(path.join(themeRoot, relativePath), 'utf8');
const readJson = (relativePath: string): Record<string, any> => JSON.parse(read(relativePath)) as Record<string, any>;

describe('netflix-mobile source-backed theme', () => {
  it('projects the pinned dark-only DESIGN.md tokens', () => {
    const designMd = read('DESIGN.md');
    const theme = readJson('theme.json');
    const tokens = readJson('assets/tokens.json');

    expect(theme.source.upstreamCommit).toBe('5d3aeca239caef3ea4080034eb22ab87cc77fa24');
    expect(designMd).toContain('**Dark mode only**');
    expect(theme.tokens.appearance).toEqual({ defaultMode: 'dark', supportedModes: ['dark'], source: 'design-md' });
    expect(theme.tokens.palette).toEqual([
      '#E50914', '#B7070F', '#141414', '#000000', '#1F1F1F', '#2A2A2A', '#3A3A3A',
      '#2B2B2B', '#333333', '#FFFFFF', '#AAAAAA', '#777777', '#54B9C5',
    ]);
    expect(theme.tokens.typography).toMatchObject({ display: 'Netflix Sans', body: 'Netflix Sans', primary: 'Netflix Sans' });
    expect(theme.tokens.spacing).toEqual({
      base: '4px',
      scale: ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '48px', '56px', '64px'],
      source: 'design-md',
    });
    expect(theme.tokens.radius).toEqual({
      control: '4px', card: '4px', preview: '4px', pill: '500px', circle: '50%',
      scale: ['0px', '4px', '8px', '12px', '500px', '50%'], source: 'design-md',
    });
    expect(tokens).toEqual(theme.tokens);
  });

  it('renders the dark Netflix projection locally', () => {
    const css = read('style.css');
    const cover = read('assets/cover.svg');
    expect(css).toContain('--dmb-bg: #141414;');
    expect(css).toContain('--dmb-accent: #E50914;');
    expect(css).toContain('--dmb-font-display: "Netflix Sans"');
    expect(css).not.toContain('--dmb-bg: #ffffff;');
    expect(css).not.toContain('#6b7280');
    expect(cover).toContain('fill="#141414"');
    expect(cover).toContain('fill="#E50914"');
    expect(cover).toContain('font-family="Netflix Sans');
    expect(cover).not.toContain('#6b7280');
  });

  it('keeps three official screenshots without the generic media preview', () => {
    const theme = readJson('theme.json');
    const source = read('index.tsx');
    expect(theme.assets.productScreenshots).toHaveLength(3);
    expect(theme.previewImages).toHaveLength(3);
    expect(theme.display.mobilePreview).toBeUndefined();
    expect(source).not.toContain('BatchMobilePreview');
    expect(source).not.toContain('mobilePreview');
  });
});
