import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('HomeDataTable project scope', () => {
  it('scopes every data table request to the supplied project id', () => {
    const source = readFileSync(resolve(__dirname, './HomeDataTable.tsx'), 'utf8');
    const contentAreaSource = readFileSync(resolve(__dirname, './ContentAreaView.tsx'), 'utf8');

    expect(source).toContain('projectId: string;');
    expect(source).toContain("import { requireProjectScope, withProjectScope } from '../../services/projectScope';");
    expect(source).toContain('withProjectScope(url, requireProjectScope(projectId))');
    expect(source).toContain('fetch(buildDataUrl(`/api/data/${encodeURIComponent(fileName)}`))');
    expect(source).toContain('buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/${encodeURIComponent(String(editingId))}`)');
    expect(source).toContain('buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/${encodeURIComponent(String(id))}`)');
    expect(source).toContain('fetch(buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/export`))');
    expect(source).toContain('fetch(buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/import`), {');
    expect(contentAreaSource).toContain('projectId={activeProjectId || \'\'}');
  });
});
