import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf8');
}

function readRuntimeUiDefaults(path: string): string {
  const source = readSource(path);
  if (path !== 'dev-template/webEditorV2Integration.ts') return source;
  const start = source.indexOf('const resolvedUi = {');
  const end = source.indexOf('\n      const resolvedMobileMode =', start);
  return source.slice(start, end);
}

describe('Axhub Make commentary target screenshot defaults', () => {
  it.each([
    ['prototype preview', 'dev-template/webEditorV2Integration.ts'],
    ['HTML preview', 'html-template/index.tsx'],
    ['Markdown preview', 'spec-template/MarkdownViewer.tsx'],
  ])('does not override the persisted target screenshot preference for %s', (_label, path) => {
    expect(readRuntimeUiDefaults(path)).not.toContain('captureTargetScreenshot:');
  });

  it('keeps markdown in text-comment mode', () => {
    expect(readSource('spec-template/MarkdownViewer.tsx')).toContain(
      "interactionProfile: 'text-comment'",
    );
  });
});
