import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  documentTemplatesApi,
  filterCompatibleDocumentTemplates,
  normalizeDocumentTemplateList,
} from './documentTemplates';

describe('documentTemplatesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('normalizes only existing entries from the fixed template response', () => {
    expect(normalizeDocumentTemplateList({ templates: [
      { id: 'prd', path: 'templates/prd.md', displayName: 'PRD 模板', description: 'PRD 模板', exists: true },
      { id: 'prototype-spec-html', path: 'templates/prototype-spec.html', displayName: 'HTML 规格文档模板', description: 'HTML 模板', exists: true },
      { id: 'ui-review', path: 'templates/ui-review.md', displayName: 'UI 评审报告模板', exists: false },
      { id: 'custom', path: 'templates/custom.md', displayName: 'Custom', exists: true },
    ] })).toEqual([
      {
        name: 'templates/prd.md',
        displayName: 'PRD 模板',
        description: 'PRD 模板',
      },
      {
        name: 'templates/prototype-spec.html',
        displayName: 'HTML 规格文档模板',
        description: 'HTML 模板',
      },
    ]);
  });

  it('filters templates by output compatibility', () => {
    const templates = normalizeDocumentTemplateList({ templates: [
      { id: 'prd', path: 'templates/prd.md', displayName: 'PRD 模板', exists: true },
      { id: 'prototype-spec-html', path: 'templates/prototype-spec.html', displayName: 'HTML 规格文档模板', exists: true },
    ] });

    expect(filterCompatibleDocumentTemplates(templates, 'html').map((template) => template.name)).toEqual([
      'templates/prd.md',
      'templates/prototype-spec.html',
    ]);
    expect(filterCompatibleDocumentTemplates(templates, 'md').map((template) => template.name)).toEqual([
      'templates/prd.md',
    ]);
    expect(filterCompatibleDocumentTemplates(templates, 'mermaid')).toEqual([]);
    expect(filterCompatibleDocumentTemplates(templates, 'drawio')).toEqual([]);
  });

  it('reads the fixed template list and content from /api/document-templates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ templates: [
        { id: 'prd', path: 'templates/prd.md', displayName: 'PRD 模板', exists: true },
        { id: 'prototype-spec-html', path: 'templates/prototype-spec.html', displayName: 'HTML 规格文档模板', exists: true },
        { id: 'ui-review', path: 'templates/ui-review.md', displayName: 'UI 评审报告模板', exists: false },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('# Write PRD\n\n## 背景\n', {
        status: 200,
        headers: { 'Content-Type': 'text/markdown' },
      }));

    const scope = { projectId: 'client-project' };
    await expect(documentTemplatesApi.list(scope)).resolves.toEqual([
      { name: 'templates/prd.md', displayName: 'PRD 模板', description: '' },
      { name: 'templates/prototype-spec.html', displayName: 'HTML 规格文档模板', description: '' },
    ]);
    await expect(documentTemplatesApi.read('prd', scope)).resolves.toBe('# Write PRD\n\n## 背景\n');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/document-templates?projectId=client-project');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/document-templates/prd?projectId=client-project');
  });
});
