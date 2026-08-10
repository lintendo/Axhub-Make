import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testFileDir, '..');
const figmaThemeDir = path.join(projectRoot, 'src/themes/figma');

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

describe('figma theme radius tokens', () => {
  it('keeps generated theme metadata and CSS aligned with the Design.md radius scale', () => {
    const themeJson = readJson(path.join(figmaThemeDir, 'theme.json'));
    const assetTokens = readJson(path.join(figmaThemeDir, 'assets/tokens.json'));
    const styleCss = fs.readFileSync(path.join(figmaThemeDir, 'implementations/react/style.css'), 'utf8');

    const expectedRadius = {
      control: '8px',
      card: '24px',
      preview: '32px',
      pill: '50px',
      source: 'design-md',
    };

    expect(themeJson.tokens.radius).toEqual(expectedRadius);
    expect(themeJson.display.radius).toEqual(expectedRadius);
    expect(assetTokens.radius).toEqual(expectedRadius);

    expect(styleCss).toContain('--dmb-radius-control: 8px;');
    expect(styleCss).toContain('--dmb-radius-card: 24px;');
    expect(styleCss).toContain('--dmb-radius-preview: 32px;');
    expect(styleCss).toContain('--dmb-radius-pill: 50px;');
  });
});
