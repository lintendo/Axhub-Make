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

function objectLeaves(value: unknown, prefix = ''): Array<{ path: string; value: unknown }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ path: prefix, value }];
  return Object.entries(value).flatMap(([key, child]) => objectLeaves(child, prefix ? `${prefix}.${key}` : key));
}

function expectNonEmptyRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  expect(value, message).toBeTypeOf('object');
  expect(value, message).not.toBeNull();
  expect(Array.isArray(value), message).toBe(false);
  expect(Object.keys(value as Record<string, unknown>).length, message).toBeGreaterThan(0);
}

function expectNonEmptyString(value: unknown, message: string): asserts value is string {
  expect(value, message).toBeTypeOf('string');
  expect((value as string).trim().length, message).toBeGreaterThan(0);
}

function expectNonEmptyStringArray(value: unknown, message: string): asserts value is string[] {
  expect(Array.isArray(value), message).toBe(true);
  expect((value as unknown[]).length, message).toBeGreaterThan(0);
  for (const item of value as unknown[]) expectNonEmptyString(item, message);
}

function hasGenericExtremeRuntimeRadius(source: string) {
  return /(?:\b(?:control|card|preview|pill|circle|full|radius)\s*:\s*['"](?:9999px|50%)|--[\w-]*radius-(?:control|card|preview|pill|circle|full)\s*:\s*(?:9999px|50%)|\bborder-radius\s*:\s*(?:9999px|50%))/i.test(source);
}

function isCssLength(value: unknown) {
  return /^-?\d*\.?\d+(?:px|rem|em|ch|vw|vh)$/.test(String(value));
}

function hasObservedExtremeRadiusEvidence(source: string, role: string, value: unknown) {
  const rolePattern = role.replace(/([a-z])([A-Z])/g, '$1[-\\s]?$2');
  const valuePattern = escapeRegExp(String(value));
  return source.split(/\r?\n/).some((line) => (
    /\*\*Observed(?:\s+—[^*]+)?:\*\*/i.test(line)
    && new RegExp(rolePattern, 'i').test(line)
    && new RegExp(valuePattern).test(line)
  ));
}

describe('retained PC theme portfolio quality contract', () => {
  it.each(qualityUpgradeSlugs)('%s has a complete executable DESIGN.md', (slug) => {
    const source = readThemeFile(slug, 'DESIGN.md');
    expect(source).not.toMatch(/derived from collected metadata/i);
    for (const section of ['Colors', 'Typography', 'Components', 'Layout', 'Responsive', "Do's and Don'ts"]) {
      expect(source, `${slug}: ${section}`).toMatch(new RegExp(`^## .*${escapeRegExp(section)}`, 'mi'));
    }
    expect(source, `${slug}: evidence/source heading`).toMatch(/^## .*Evidence.*Source Record/im);
    expect(source, `${slug}: local or remote source`).toMatch(/\*\*(?:Observed — )?(?:source URL(?:s)?|local source paths?):\*\*/i);
    expect(source, `${slug}: pinned commit applicability`).toMatch(/\*\*Pinned upstream commit:\*\*/i);
    expect(source, `${slug}: license status`).toMatch(/\*\*License:\*\*/i);
    expect(source, `${slug}: conversion notes`).toMatch(/\*\*Conversion notes:\*\*/i);
    expect(source, `${slug}: observed facts`).toMatch(/\*\*Observed(?:\s+—[^*]+)?:\*\*/i);
    expect(source, `${slug}: inference`).toMatch(/\*\*Inference(?:\s+—[^*]+)?:\*\*/i);
    expect(source, `${slug}: Known Gaps`).toMatch(/^## Known Gaps\s*$/im);
    expect(source, `${slug}: blocking unresolved license gap`).toMatch(
      /^## Known Gaps\s*$[\s\S]*^- \*\*Blocking license gap:\*\*/im,
    );
  });

  it.each(qualityUpgradeSlugs)('%s has complete independent token categories', (slug) => {
    const tokens = JSON.parse(readThemeFile(slug, 'assets/tokens.json'));
    const theme = JSON.parse(readThemeFile(slug, 'theme.json'));
    const source = readThemeFile(slug, 'DESIGN.md');

    for (const category of ['spacing', 'radius', 'typography'] as const) {
      expectNonEmptyRecord(tokens[category], `${slug}: assets/tokens.json ${category}`);
      expectNonEmptyRecord(theme.tokens?.[category], `${slug}: theme.json tokens.${category}`);
      expect(theme.tokens[category], `${slug}: ${category} metadata matches tokens`).toEqual(tokens[category]);
    }

    for (const { path: tokenPath, value } of objectLeaves(tokens.spacing)) {
      expect(tokenPath, `${slug}: spacing key ${tokenPath}`).not.toMatch(/font|type|text|lineHeight|leading|tracking|letter|radius|radii|corner/i);
      expect(isCssLength(value), `${slug}: spacing ${String(value)}`).toBe(true);
    }

    for (const { path: role, value } of objectLeaves(tokens.radius)) {
      expect(role, `${slug}: radius key ${role}`).not.toMatch(/font|type|text|lineHeight|leading|tracking|letter|space|gap|padding|margin/i);
      expect(String(value), `${slug}: radius.${role}`).toMatch(/^-?\d*\.?\d+(?:px|rem|em|%)$/);
      if (/^(?:9999px|50%)$/.test(String(value))) {
        expect(role, `${slug}: extreme radius role ${role}`).toMatch(/^(?!pill$|circle$|full$).+(?:pill|circle)$/i);
        expect(hasObservedExtremeRadiusEvidence(source, role, value), `${slug}: source evidence for ${role}`).toBe(true);
      }
    }

    const typography = tokens.typography;
    expectNonEmptyRecord(typography.fontFamily, `${slug}: typography.fontFamily`);
    expectNonEmptyRecord(typography.fontSize, `${slug}: typography.fontSize`);
    expectNonEmptyRecord(typography.lineHeight, `${slug}: typography.lineHeight`);
    expectNonEmptyRecord(typography.letterSpacing, `${slug}: typography.letterSpacing`);
    expect(flattenValues(typography.fontSize).every((value) => /^-?\d*\.?\d+(?:px|rem|em)$/.test(String(value)))).toBe(true);
    expect(flattenValues(typography.lineHeight).every((value) => /^(?:normal|-?\d*\.?\d+)$/.test(String(value)))).toBe(true);
    expect(flattenValues(typography.letterSpacing).every((value) => /^(?:normal|-?\d*\.?\d+(?:px|rem|em))$/.test(String(value)))).toBe(true);

    expectNonEmptyRecord(theme.display?.spacing, `${slug}: display.spacing`);
    expectNonEmptyRecord(theme.display?.radius, `${slug}: display.radius`);

    const runtimeRadiusSource = [readThemeFile(slug, 'index.tsx'), readThemeFile(slug, 'style.css')].join('\n');
    expect(hasGenericExtremeRuntimeRadius(runtimeRadiusSource), `${slug}: generic runtime extreme radius`).toBe(false);
  });

  it.each(qualityUpgradeSlugs)('%s has honest structured source metadata', (slug) => {
    const theme = JSON.parse(readThemeFile(slug, 'theme.json'));
    expectNonEmptyRecord(theme.source, `${slug}: source metadata`);
    const sourceUrls = [theme.source.originalDetailUrl, theme.source.websiteUrl].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    const localPaths = Array.isArray(theme.source.localPaths)
      ? theme.source.localPaths.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
      : [];
    expect(sourceUrls.length + localPaths.length, `${slug}: source URL or path`).toBeGreaterThan(0);
    expect(theme.source.pinnedCommit?.status, `${slug}: pinned commit applicability`).toMatch(
      /^(?:pinned|not-applicable|unavailable)$/i,
    );
    if (theme.source.pinnedCommit.status === 'pinned') {
      expectNonEmptyString(theme.source.pinnedCommit.commit, `${slug}: pinned commit`);
    } else {
      expectNonEmptyString(theme.source.pinnedCommit.reason, `${slug}: pinned commit reason`);
    }
    expect(theme.source.license?.status, `${slug}: license status`).toMatch(/^(?:verified|unresolved)$/i);
    expectNonEmptyString(theme.source.license.evidence, `${slug}: license evidence`);
    expectNonEmptyString(theme.source.license.scope, `${slug}: license scope`);
    expectNonEmptyString(theme.source.conversionNotes, `${slug}: conversion notes`);
    for (const category of ['observed', 'inferred', 'knownGaps'] as const) {
      expectNonEmptyStringArray(theme.source.evidence?.[category], `${slug}: source evidence.${category}`);
    }
    if (theme.source.license.status === 'unresolved') {
      expect(theme.status?.collectionErrors, `${slug}: unresolved license remains blocking`).toEqual(
        expect.arrayContaining([expect.stringMatching(/blocking.*license/i)]),
      );
    }
  });

  it.each([
    "radius: { control: '9999px' }",
    "radius: { full: '50%' }",
    '.dmb { --dmb-radius-control: 9999px; }',
    '.button { border-radius: 9999px; }',
  ])('rejects generic runtime extreme radius: %s', (source) => {
    expect(hasGenericExtremeRuntimeRadius(source)).toBe(true);
  });

  it('rejects percentages from the spacing CSS length category', () => {
    expect(isCssLength('10%')).toBe(false);
  });

  it('requires extreme radius role/value evidence to be observed, not inferred', () => {
    expect(hasObservedExtremeRadiusEvidence('**Inference:** category icon circle may use `50%`.', 'categoryIconCircle', '50%')).toBe(false);
    expect(hasObservedExtremeRadiusEvidence('**Observed — narrow role:** category icon circle may use `50%`.', 'categoryIconCircle', '50%')).toBe(true);
  });
});
