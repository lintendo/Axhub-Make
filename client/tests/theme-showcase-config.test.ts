import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createThemeShowcaseConfig } from '../src/common/DesignMdBatchShowcase/createThemeShowcaseConfig';
import themeData from '../src/themes/chatgpt-mobile/theme.json';

const imageUrls = {
  'assets/product-screenshot-01.webp': './assets/product-screenshot-01.webp',
  'assets/product-screenshot-02.webp': './assets/product-screenshot-02.webp',
  'assets/product-screenshot-03.webp': './assets/product-screenshot-03.webp',
};

describe('createThemeShowcaseConfig', () => {
  it('maps normalized theme data and verified image URLs into the shared showcase contract', () => {
    const config = createThemeShowcaseConfig({ theme: themeData, imageUrls });

    expect(config).toMatchObject({
      brand: 'ChatGPT 主题',
      brandAlias: 'ChatGPT',
      description: themeData.display.description,
      descriptionEn: themeData.display.descriptionEn,
      variant: 'mobile-product',
      distributionTags: ['移动端', 'AI 与开发工具'],
      palette: themeData.display.palette,
      typography: themeData.display.typography,
      radius: themeData.display.radius,
      spacing: themeData.display.spacing,
      shadows: themeData.display.shadows,
      borders: themeData.display.borders,
      panels: themeData.display.panels,
      usageGuidance: themeData.display.usageGuidance,
      source: themeData.source,
    });
    expect(config.previewImages).toEqual([
      { type: 'product-screenshot', url: './assets/product-screenshot-01.webp' },
      { type: 'product-screenshot', url: './assets/product-screenshot-02.webp' },
      { type: 'product-screenshot', url: './assets/product-screenshot-03.webp' },
    ]);
  });

  it('rejects theme preview paths that were not verified by the caller', () => {
    expect(() => createThemeShowcaseConfig({
      theme: themeData,
      imageUrls: {
        'assets/product-screenshot-01.webp': './assets/product-screenshot-01.webp',
      },
    })).toThrow(/Missing verified preview image URL/u);
  });

  it('falls back to identity and token data for sparse themes', () => {
    const config = createThemeShowcaseConfig({
      theme: {
        identity: {
          slug: 'sparse-demo',
          titleZh: '稀疏主题',
          titleEn: 'Sparse Demo',
          descriptionZh: '只有基础数据的主题。',
          descriptionEn: 'A theme with minimal data.',
        },
        tags: { distributionTags: ['工具'] },
        tokens: {
          palette: ['#111111', '#ffffff'],
          typography: { display: 'Inter', body: 'Arial', mono: 'Menlo' },
        },
        previewImages: [],
      },
      imageUrls: {},
    });

    expect(config).toMatchObject({
      brand: '稀疏主题',
      brandAlias: 'Sparse Demo',
      description: '只有基础数据的主题。',
      descriptionEn: 'A theme with minimal data.',
      variant: 'saas-devtool',
      distributionTags: ['工具'],
      palette: ['#111111', '#ffffff'],
      typography: ['Inter', 'Arial', 'Menlo'],
      panels: [],
      previewImages: [],
    });
  });

  it('shares the ChatGPT showcase class between theme metadata and the React consumer', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/themes/chatgpt-mobile/implementations/react/index.tsx'),
      'utf8',
    );

    expect(themeData.display.showcaseClassName).toBe('chatgpt-theme');
    expect(source).toContain('className={themeData.display.showcaseClassName}');
  });
});
