import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SettingsSectionSurface source', () => {
  it('defines the shared restrained surface and configuration row vocabulary', () => {
    const source = readFileSync(resolve(__dirname, './SettingsSectionSurface.tsx'), 'utf8');

    expect(source).toContain('export const SETTINGS_SURFACE_CLASS_NAME');
    expect(source).toContain('rounded-md border border-border bg-muted/30');
    expect(source).toContain('export function SettingsSectionSurface');
    expect(source).toContain('export function SettingsConfigRow');
    expect(source).toContain('FieldLabelWithHint');
    expect(source).toContain('border-t border-border');
  });
});
