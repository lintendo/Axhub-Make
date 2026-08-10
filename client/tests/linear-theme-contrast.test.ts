import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function cssVar(css: string, name: string) {
  return css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`))?.[1];
}

function contrastRatio(foreground: string, background: string) {
  const channel = (hex: string, offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const value = hex.replace('#', '');
    return channel(value, 0) * 0.2126 + channel(value, 2) * 0.7152 + channel(value, 4) * 0.0722;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function rule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`))?.[0] ?? '';
}

describe('Linear theme contrast', () => {
  const baseCss = read('src/common/DesignMdBatchShowcase/base.css');
  const linearCss = read('src/themes/linear/implementations/react/style.css');

  it('keeps the dark showcase header readable on Linear canvas', () => {
    const canvas = cssVar(linearCss, '--dmb-bg');
    expect(canvas).toBe('#010102');

    for (const token of ['--dmb-ink', '--dmb-ink-muted', '--dmb-ink-subtle']) {
      const value = cssVar(linearCss, token);
      expect(value, token).toBeDefined();
      expect(contrastRatio(value!, canvas!), token).toBeGreaterThanOrEqual(4.5);
    }

    expect(rule(baseCss, '.dmb-page')).toContain('color: var(--dmb-ink, #111318)');
    expect(rule(baseCss, '.dmb-sheet-head p')).toContain('color: var(--dmb-ink-subtle, #686c76)');
    expect(rule(baseCss, '.dmb-sheet-head h1')).toContain('color: var(--dmb-ink, #121319)');
    expect(rule(baseCss, '.dmb-description p')).toContain('color: var(--dmb-ink-muted, #3f424b)');
  });

  it('keeps white component-card headings readable in the Linear dark theme', () => {
    const componentCard = rule(baseCss, '.dmb-component-grid article');
    const componentHeading = rule(baseCss, '.dmb-component-grid h3');

    expect(componentCard).toContain('background: #ffffff');
    expect(componentHeading).toContain('color: #151720');
    expect(contrastRatio('#151720', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
