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

describe('wechat-mobile source-backed theme', () => {
  it('projects the pinned light DESIGN.md tokens', () => {
    const designMd = read('DESIGN.md');
    const theme = readJson('theme.json');
    const tokens = readJson('assets/tokens.json');

    expect(theme.source.upstreamCommit).toBe('5d3aeca239caef3ea4080034eb22ab87cc77fa24');
    expect(designMd).toContain('**WeChat Green** (`#07C160`): Send-ready accent');
    expect(designMd).toContain('**Canvas White** (`#FFFFFF`): Cards, list rows');

    expect(theme.tokens.appearance).toEqual({ defaultMode: 'light', source: 'design-md' });
    expect(theme.tokens.palette).toEqual([
      '#07C160',
      '#06A050',
      '#95EC69',
      '#EDEDED',
      '#FFFFFF',
      '#F7F7F7',
      '#D9D9D9',
      '#181818',
      '#888888',
      '#B2B2B2',
      '#FA5151',
      '#576B95',
      '#FBE3B3',
    ]);
    expect(theme.tokens.typography).toMatchObject({
      display: 'PingFang SC',
      body: 'PingFang SC',
      primary: 'PingFang SC',
    });
    expect(theme.tokens.spacing).toEqual({
      base: '4px',
      scale: ['4px', '8px', '12px', '16px', '20px', '24px', '28px', '44px', '56px'],
      source: 'design-md',
    });
    expect(theme.tokens.radius).toEqual({
      control: '6px',
      card: '8px',
      preview: '8px',
      pill: '8px',
      circle: '50%',
      scale: ['4px', '6px', '8px', '50%'],
      source: 'design-md',
    });
    expect(tokens).toEqual(theme.tokens);
  });

  it('uses the WeChat projection in local CSS and cover', () => {
    const css = read('style.css');
    const cover = read('assets/cover.svg');

    expect(css).toContain('--dmb-bg: #EDEDED;');
    expect(css).toContain('--dmb-surface: #FFFFFF;');
    expect(css).toContain('--dmb-accent: #07C160;');
    expect(css).toContain('--dmb-ink: #181818;');
    expect(css).toContain('--dmb-font-display: "PingFang SC"');
    expect(css).not.toContain('--dmb-accent: #FFFFFF;');
    expect(css).not.toContain('#6b7280');

    expect(cover).toContain('fill="#07C160"');
    expect(cover).toContain('fill="#EDEDED"');
    expect(cover).toContain('fill="#95EC69"');
    expect(cover).toContain('fill="#FA5151"');
    expect(cover).toContain('font-family="PingFang SC');
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
