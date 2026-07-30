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

describe('discord-mobile source-backed theme', () => {
  it('projects the pinned dark DESIGN.md tokens', () => {
    const designMd = read('DESIGN.md');
    const theme = readJson('theme.json');
    const tokens = readJson('assets/tokens.json');

    expect(theme.source.upstreamCommit).toBe('5d3aeca239caef3ea4080034eb22ab87cc77fa24');
    expect(designMd).toContain('**Blurple** (`#5865F2`): THE brand color');
    expect(designMd).toContain('**Online Green** (`#23A55A`): Active users');

    expect(theme.tokens.appearance).toEqual({ defaultMode: 'dark', source: 'design-md' });
    expect(theme.tokens.palette).toEqual([
      '#5865F2',
      '#4752C4',
      '#1E1F22',
      '#2B2D31',
      '#313338',
      '#383A40',
      '#3F4147',
      '#F2F3F5',
      '#B5BAC1',
      '#949BA4',
      '#00A8FC',
      '#23A55A',
      '#F0B232',
      '#F23F43',
      '#EB459E',
    ]);
    expect(theme.tokens.typography).toMatchObject({
      display: 'gg sans',
      body: 'gg sans',
      primary: 'gg sans',
      mono: 'gg mono',
    });
    expect(theme.tokens.spacing).toEqual({
      base: '4px',
      scale: ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '40px', '48px', '56px', '72px'],
      source: 'design-md',
    });
    expect(theme.tokens.radius).toEqual({
      control: '8px',
      card: '12px',
      preview: '16px',
      pill: '9999px',
      circle: '50%',
      scale: ['0px', '4px', '8px', '12px', '16px', '50%'],
      source: 'design-md',
    });
    expect(tokens).toEqual(theme.tokens);
  });

  it('uses the Discord dark projection in local CSS and cover', () => {
    const css = read('style.css');
    const cover = read('assets/cover.svg');

    expect(css).toContain('--dmb-bg: #313338;');
    expect(css).toContain('--dmb-accent: #5865F2;');
    expect(css).toContain('--dmb-surface: #2B2D31;');
    expect(css).toContain('--dmb-ink: #F2F3F5;');
    expect(css).toContain('--dmb-font-display: "gg sans"');
    expect(css).not.toContain('--dmb-accent: #23A55A;');
    expect(css).not.toContain('#6b7280');

    expect(cover).toContain('fill="#5865F2"');
    expect(cover).toContain('fill="#1E1F22"');
    expect(cover).toContain('fill="#313338"');
    expect(cover).toContain('fill="#23A55A"');
    expect(cover).toContain('font-family="gg sans');
    expect(cover).not.toContain('#6b7280');
  });

  it('keeps three official screenshots without the generic chat preview', () => {
    const theme = readJson('theme.json');
    const source = read('index.tsx');

    expect(theme.assets.productScreenshots).toHaveLength(3);
    expect(theme.previewImages).toHaveLength(3);
    expect(theme.display.mobilePreview).toBeUndefined();
    expect(source).not.toContain('BatchMobilePreview');
    expect(source).not.toContain('mobilePreview');
  });
});
