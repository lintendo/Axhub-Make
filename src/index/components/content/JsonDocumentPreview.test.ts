import { describe, expect, it } from 'vitest';

import {
  getDataTableFileName,
  isDataDirectoryResource,
  isDatabaseJsonPayload,
  isJsonDocumentResource,
  parseJsonDocument,
} from './JsonDocumentPreview';

describe('JsonDocumentPreview helpers', () => {
  it('recognizes JSON resources from the available document paths', () => {
    expect(isJsonDocumentResource({ name: 'settings.json' })).toBe(true);
    expect(isJsonDocumentResource({ name: 'settings', filePath: 'src/resources/settings.json' })).toBe(true);
    expect(isJsonDocumentResource({ name: 'notes.md', previewUrl: '/api/docs/notes.md?projectId=demo' })).toBe(false);
  });

  it('parses valid JSON for tree rendering', () => {
    expect(parseJsonDocument('{"enabled":true,"items":[1,2]}')).toEqual({
      kind: 'json',
      data: { enabled: true, items: [1, 2] },
      rawText: '{"enabled":true,"items":[1,2]}',
    });
  });

  it('keeps invalid JSON as raw text', () => {
    expect(parseJsonDocument('{"enabled":')).toEqual({
      kind: 'text',
      rawText: '{"enabled":',
    });
  });

  it('recognizes database JSON only for resources in the data directory', () => {
    const item = { name: 'sample-database.json', filePath: 'src/resources/data/sample-database.json' };
    const payload = { tableName: 'orders', records: [{ id: 1 }] };

    expect(isDatabaseJsonPayload(payload)).toBe(true);
    expect(isDataDirectoryResource(item)).toBe(true);
    expect(getDataTableFileName(item)).toBe('sample-database');
  });
});
