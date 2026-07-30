import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveMarkdownDocumentLinkTarget,
  resolvePrototypeSpecAssetUrl,
  resolvePrototypeSpecDocumentLink,
  stripMarkdownPreviewFrontmatter,
} from './previewMarkdownContent';

describe('stripMarkdownPreviewFrontmatter', () => {
  it('removes YAML frontmatter from read-only Markdown preview content', () => {
    const content = [
      '---',
      'title: "原型评审"',
      'reviewer: "AI"',
      'createdAt: "<ISO 时间>"',
      'source: "ai-review"',
      'score: <百分制整数总分>',
      '---',
      '',
      '# 原型评审',
      '',
      '- 审查目标：src/prototypes/<prototype-id>',
    ].join('\n');

    expect(stripMarkdownPreviewFrontmatter(content)).toBe([
      '',
      '# 原型评审',
      '',
      '- 审查目标：src/prototypes/<prototype-id>',
    ].join('\n'));
  });

  it('keeps regular Markdown horizontal rules when they are not metadata blocks', () => {
    const content = [
      '---',
      '',
      'Opening note',
      '',
      '---',
      '',
      '# Body',
    ].join('\n');

    expect(stripMarkdownPreviewFrontmatter(content)).toBe(content);
  });
});

describe('resolvePrototypeSpecDocumentLink', () => {
  const documentUrl = '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Foverview.md';

  it('resolves relative Markdown and HTML links inside a prototype spec', () => {
    expect(resolvePrototypeSpecDocumentLink('../flows/order.md#states', documentUrl)).toBe('flows/order.md');
    expect(resolvePrototypeSpecDocumentLink('./details.html', documentUrl)).toBe('documents/details.html');
    expect(resolvePrototypeSpecDocumentLink('./section-a.md', documentUrl)).toBe('documents/section-a.md');
    expect(resolvePrototypeSpecDocumentLink('../section-b.htm', documentUrl)).toBe('section-b.htm');
  });

  it('leaves anchors, external URLs, assets, and escaped paths alone', () => {
    expect(resolvePrototypeSpecDocumentLink('#states', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('#local-anchor', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('https://example.com/spec.md', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('https://example.com/guide.md', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('./assets/hero.png', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('./asset.png', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('../../../secret.md', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecDocumentLink('./details.md', '/api/docs/guide.md')).toBeNull();
  });
});

describe('resolveMarkdownDocumentLinkTarget', () => {
  const resourceDocUrl = '/api/projects/make-project/docs/kangbaobao%2Fprd-02-home-growth/content';

  it('resolves ordinary resource-document links relative to the selected document', () => {
    expect(resolveMarkdownDocumentLinkTarget('./PROJECT.md', resourceDocUrl)).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/PROJECT.md',
    });
    expect(resolveMarkdownDocumentLinkTarget(
      './sources/documents/001-axure-export/pages/首页/screenshot.png',
      resourceDocUrl,
    )).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/sources/documents/001-axure-export/pages/首页/screenshot.png',
    });
    expect(resolveMarkdownDocumentLinkTarget(
      './sources/documents/001-axure-export/pages/%E9%A6%96%E9%A1%B5/screenshot.png',
      resourceDocUrl,
    )).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/sources/documents/001-axure-export/pages/首页/screenshot.png',
    });
    expect(resolveMarkdownDocumentLinkTarget(
      './sources/documents/001-axure-export/pages/首页/data.json',
      resourceDocUrl,
    )).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/sources/documents/001-axure-export/pages/首页/data.json',
    });
    expect(resolveMarkdownDocumentLinkTarget('./PROJECT.md?raw=1#overview', resourceDocUrl)).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/PROJECT.md',
    });
  });

  it('keeps project-document and prototype-spec navigation typed', () => {
    expect(resolveMarkdownDocumentLinkTarget(
      '../prd-04.md',
      '/api/projects/make-project/document-content?path=src%2Fprototypes%2Fhome%2Fdocs%2Fsections%2Fprd-03.md',
    )).toEqual({
      kind: 'project-doc',
      resourceId: 'src/prototypes/home/docs/prd-04.md',
    });
    expect(resolveMarkdownDocumentLinkTarget(
      '../flows/order.md#states',
      '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Foverview.md',
    )).toEqual({
      kind: 'prototype-spec',
      resourceId: 'flows/order.md',
    });
  });

  it('does not intercept anchors, external links, absolute paths, or escaped resource paths', () => {
    expect(resolveMarkdownDocumentLinkTarget('#states', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('https://example.com/guide.md', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('/PROJECT.md', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('../../outside.md', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('%2e%2e/%2e%2e/outside.md', resourceDocUrl)).toBeNull();
  });
});

describe('resolvePrototypeSpecAssetUrl', () => {
  it('routes relative Markdown images through the prototype spec content endpoint', () => {
    const documentUrl = '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Foverview.md';

    expect(resolvePrototypeSpecAssetUrl('../assets/hero.png', documentUrl)).toBe(
      '/api/projects/make-project/prototypes/home/spec/content?path=assets%2Fhero.png',
    );
    expect(resolvePrototypeSpecAssetUrl('https://example.com/hero.png', documentUrl)).toBeNull();
    expect(resolvePrototypeSpecAssetUrl('../../../secret.png', documentUrl)).toBeNull();
  });
});

describe('resolvePrototypeSpecResourceUrl', () => {
  it('routes relative Markdown attachments through the prototype spec endpoint', async () => {
    const previewModule = await import('./previewMarkdownContent');
    const resolveResource = (previewModule as Record<string, unknown>).resolvePrototypeSpecResourceUrl;
    const documentUrl = '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Foverview.md';

    expect(typeof resolveResource).toBe('function');
    expect((resolveResource as (href: string, url: string) => string | null)(
      '../attachments/guide.pdf#page=2',
      documentUrl,
    )).toBe('/api/projects/make-project/prototypes/home/spec/content?path=attachments%2Fguide.pdf#page=2');
    expect((resolveResource as (href: string, url: string) => string | null)(
      'https://example.com/guide.pdf',
      documentUrl,
    )).toBeNull();

    const viewerSource = readFileSync(resolve(__dirname, 'MarkdownViewer.tsx'), 'utf8');
    expect(viewerSource).toContain('href={resourceUrl || props.href}');
    expect(viewerSource).toContain('resolveMarkdownDocumentLinkTarget(');
    expect(viewerSource).toContain("type: 'axhub-prototype-spec:navigate'");
    expect(viewerSource).toContain("type: 'axhub-document-resource:navigate'");
    expect(viewerSource).toContain('resourceType: navigationTarget.kind');
  });
});
