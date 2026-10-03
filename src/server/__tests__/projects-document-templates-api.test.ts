import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const restoreMock = vi.hoisted(() => vi.fn(async (projectRoot: string, relativePath: string) => {
  const targetPath = path.join(projectRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, '# Restored default\n', 'utf8');
  return { restored: true, version: 'test', sourceUrl: 'https://example.com/template.zip' };
}));

vi.mock('../makeClientProject.ts', async (importActual) => {
  const actual = await importActual<typeof import('../makeClientProject.ts')>();
  return {
    ...actual,
    restoreMakeClientTemplateFile: restoreMock,
  };
});

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  setActiveProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

afterEach(() => {
  restoreMock.mockClear();
  cleanupProjectApiTestRoots();
});

describe('fixed document template API', () => {
  it('lists every fixed template and marks missing files without dropping them', async () => {
    const projectRoot = createTempRoot();
    fs.mkdirSync(path.join(projectRoot, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'templates', 'prd.md'), '# Project PRD\n', 'utf8');
    writeProjectMetadata(projectRoot, { project: { id: 'fixed-templates', name: 'Fixed Templates' } });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'fixed-templates', 'Fixed Templates');
      await setActiveProject(server.origin, 'fixed-templates');
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/document-templates`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.templates.map((template: any) => template.id)).toEqual([
        'prd',
        'prototype-spec-md',
        'prototype-spec-html',
        'prototype-review',
        'ui-review',
      ]);
      expect(body.templates[0]).toMatchObject({
        id: 'prd',
        exists: true,
        path: 'templates/prd.md',
        contentUrl: expect.stringContaining('/api/document-templates/prd'),
        previewUrl: expect.stringContaining('/spec-template.html?'),
        editUrl: expect.stringContaining('/spec-template.html?'),
      });
      expect(body.templates[1]).toMatchObject({ id: 'prototype-spec-md', exists: false });
      expect(body.templates[2]).toMatchObject({
        id: 'prototype-spec-html',
        editUrl: expect.stringContaining('mode=edit'),
      });
    } finally {
      await server.close();
    }
  });

  it('reads, previews, and saves only existing registered files', async () => {
    const projectRoot = createTempRoot();
    fs.mkdirSync(path.join(projectRoot, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'templates', 'prd.md'), '# Project PRD\n', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'templates', 'prototype-spec.html'), '<!doctype html><html><body><h1>Spec</h1></body></html>\n', 'utf8');
    writeProjectMetadata(projectRoot, { project: { id: 'template-content', name: 'Template Content' } });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'template-content', 'Template Content');
      await setActiveProject(server.origin, 'template-content');
      const scoped = (url: string) => scopeProjectApiUrl(projectRoot, `${server.origin}${url}`);

      const markdown = await fetch(scoped('/api/document-templates/prd'));
      expect(markdown.status).toBe(200);
      expect(await markdown.text()).toBe('# Project PRD\n');

      const html = await fetch(scoped('/api/document-templates/prototype-spec-html'), {
        headers: { Accept: 'text/html' },
      });
      expect(html.status).toBe(200);
      expect(await html.text()).toContain('/assets/html-template-bootstrap.js');

      const saved = await fetch(scoped('/api/document-templates/prd'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Edited PRD\n' }),
      });
      expect(saved.status).toBe(200);
      expect(fs.readFileSync(path.join(projectRoot, 'templates', 'prd.md'), 'utf8')).toBe('# Edited PRD\n');

      const missing = await fetch(scoped('/api/document-templates/ui-review'));
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ code: 'DOCUMENT_TEMPLATE_MISSING' });

      const unknown = await fetch(scoped('/api/document-templates/%2E%2E%2Fprd'));
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toMatchObject({ code: 'DOCUMENT_TEMPLATE_NOT_FOUND' });
    } finally {
      await server.close();
    }
  });

  it('restores a missing default explicitly and never overwrites an existing template', async () => {
    const projectRoot = createTempRoot();
    fs.mkdirSync(path.join(projectRoot, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'templates', 'prd.md'), '# Custom PRD\n', 'utf8');
    writeProjectMetadata(projectRoot, { project: { id: 'restore-template', name: 'Restore Template' } });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'restore-template', 'Restore Template');
      await setActiveProject(server.origin, 'restore-template');
      const scoped = (url: string) => scopeProjectApiUrl(projectRoot, `${server.origin}${url}`);

      const restored = await fetch(scoped('/api/document-templates/ui-review/restore'), { method: 'POST' });
      expect(restored.status).toBe(201);
      expect(restoreMock).toHaveBeenCalledWith(projectRoot, 'templates/ui-review.md');
      expect(fs.readFileSync(path.join(projectRoot, 'templates', 'ui-review.md'), 'utf8')).toBe('# Restored default\n');

      const existing = await fetch(scoped('/api/document-templates/prd/restore'), { method: 'POST' });
      expect(existing.status).toBe(409);
      expect(await existing.json()).toMatchObject({ code: 'DOCUMENT_TEMPLATE_EXISTS' });
      expect(fs.readFileSync(path.join(projectRoot, 'templates', 'prd.md'), 'utf8')).toBe('# Custom PRD\n');
      expect(restoreMock).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });
});
