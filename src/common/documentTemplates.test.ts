import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_TEMPLATES,
  getDocumentTemplate,
} from './documentTemplates';

describe('document template registry', () => {
  it('declares the fixed templates in settings order', () => {
    expect(DOCUMENT_TEMPLATES).toEqual([
      expect.objectContaining({ id: 'prd', format: 'markdown', path: 'templates/prd.md' }),
      expect.objectContaining({ id: 'prototype-spec-md', format: 'markdown', path: 'templates/prototype-spec.md' }),
      expect.objectContaining({ id: 'prototype-spec-html', format: 'html', path: 'templates/prototype-spec.html' }),
      expect.objectContaining({ id: 'prototype-review', format: 'markdown', path: 'templates/prototype-review.md' }),
      expect.objectContaining({ id: 'ui-review', format: 'markdown', path: 'templates/ui-review.md' }),
    ]);
  });

  it('looks up only registered IDs', () => {
    expect(getDocumentTemplate('prd')?.displayName).toBe('PRD 模板');
    expect(getDocumentTemplate('../prd')).toBeUndefined();
    expect(getDocumentTemplate('custom-template')).toBeUndefined();
  });

  it('publishes the shared registry with the Make server package', () => {
    const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { files?: string[] };

    expect(packageJson.files).toContain('src/common/documentTemplates.ts');
  });
});
