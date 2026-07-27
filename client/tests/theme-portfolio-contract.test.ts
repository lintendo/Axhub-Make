import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const themesRoot = path.join(appRoot, 'src/themes');
const qualityUpgradeSlugs = [
  'kami',
  'august-health-ehr',
  'duolingo',
  'elevenlabs',
  'eventbrite',
  'factory-ai',
  'headspace',
  'incident',
  'surfshark',
  'xbox-com',
] as const;

function readThemeFile(slug: string, relativePath: string) {
  return fs.readFileSync(path.join(themesRoot, slug, relativePath), 'utf8');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flattenValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenValues);
  return [value];
}

describe('retained PC theme portfolio quality contract', () => {
  it.each(qualityUpgradeSlugs)('%s has a complete executable DESIGN.md', (slug) => {
    const source = readThemeFile(slug, 'DESIGN.md');
    expect(source).not.toMatch(/derived from collected metadata/i);
    for (const section of ['Colors', 'Typography', 'Components', 'Layout', 'Responsive', "Do's and Don'ts"]) {
      expect(source, `${slug}: ${section}`).toMatch(new RegExp(`^## .*${escapeRegExp(section)}`, 'mi'));
    }
    expect(source, `${slug}: evidence boundary`).toMatch(/Observed|Inference|Known Gaps/i);
  });

  it.each(qualityUpgradeSlugs.filter((slug) => slug !== 'kami'))('%s keeps token categories semantically separate', (slug) => {
    const tokens = JSON.parse(readThemeFile(slug, 'assets/tokens.json'));
    const spacingValues = flattenValues(tokens.spacing ?? []);
    for (const value of spacingValues) {
      expect(String(value), `${slug}: spacing ${String(value)}`).toMatch(/^-?\d*\.?\d+(?:px|rem|em|ch|vw|vh|%)$/);
    }
    const radiusValues = flattenValues(tokens.radius ?? tokens.radii ?? []);
    for (const value of radiusValues) {
      expect(String(value), `${slug}: radius ${String(value)}`).not.toMatch(/^(?:9999px|50%)$/);
    }
  });
});
