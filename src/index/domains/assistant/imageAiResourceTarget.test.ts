import { describe, expect, it } from 'vitest';

import { resolveImageAiResourceTargetFolder } from './imageAiResourceTarget';

describe('image AI resource target folder', () => {
  it('uses the selected resource folder', () => {
    expect(resolveImageAiResourceTargetFolder({
      sidebarTab: 'document',
      selectedFolder: {
        id: 'folder-docs-brand',
        title: 'brand',
        path: 'brand',
        treeTab: 'docs',
      },
      selectedResource: null,
    })).toBe('brand');
  });

  it('uses the parent folder of any selected nested resource', () => {
    expect(resolveImageAiResourceTargetFolder({
      sidebarTab: 'document',
      selectedFolder: null,
      selectedResource: {
        filePath: 'src/resources/brand/icons/logo.svg',
      },
    })).toBe('brand/icons');

    expect(resolveImageAiResourceTargetFolder({
      sidebarTab: 'document',
      selectedFolder: null,
      selectedResource: {
        resourceId: 'research/brief.md',
      },
    })).toBe('research');
  });

  it('normalizes Windows resource paths', () => {
    expect(resolveImageAiResourceTargetFolder({
      sidebarTab: 'document',
      selectedFolder: null,
      selectedResource: {
        filePath: 'src\\resources\\research\\brief.md',
      },
    })).toBe('research');
  });

  it('falls back to images for root resources and non-resource contexts', () => {
    expect(resolveImageAiResourceTargetFolder({
      sidebarTab: 'document',
      selectedFolder: null,
      selectedResource: {
        filePath: 'src/resources/cover.png',
      },
    })).toBe('images');

    expect(resolveImageAiResourceTargetFolder({
      sidebarTab: 'prototype',
      selectedFolder: null,
      selectedResource: null,
    })).toBe('images');
  });
});
