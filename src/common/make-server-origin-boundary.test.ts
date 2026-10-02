import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const runtimeSources = [
  '../dev-template/webEditorV2Integration.ts',
  './documentCommentsPersistence.ts',
  '../html-template/index.tsx',
  '../spec-template/MarkdownViewer.tsx',
];

describe('Make server origin boundary', () => {
  it('does not let runtime persistence discover or fall back to the status route', () => {
    for (const relativePath of runtimeSources) {
      const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
      expect(source, relativePath).not.toContain('/__axhub/make-server/status');
      expect(source, relativePath).not.toMatch(/fetch\(\s*['"]\/api\//u);
    }
  });

  it('keeps status discovery limited to startup sources', () => {
    const startupSources = [
      '../../client/src/index.html',
      '../../client/scripts/check-app-ready.mjs',
      '../../client/vite-plugins/autoStartMakeServerPlugin.ts',
    ];
    for (const relativePath of startupSources) {
      const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
      expect(source, relativePath).toContain('/__axhub/make-server/status');
    }
  });
});
