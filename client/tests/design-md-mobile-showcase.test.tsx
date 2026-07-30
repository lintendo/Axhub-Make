import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/common/DesignMdBatchShowcase/base.css', () => ({}));

import { DesignMdBatchShowcase, type BatchShowcaseConfig } from '../src/common/DesignMdBatchShowcase';

const sharedConfig: Omit<BatchShowcaseConfig, 'variant' | 'mobilePreview'> = {
  brand: 'Long Product Brand Name That Must Wrap Safely',
  description: 'A focused product experience.',
  distributionTags: ['产品'],
  palette: ['#155eef', '#ffffff', '#111827'],
  typography: ['Inter', 'Inter', 'ui-monospace'],
  previewImages: [],
  panels: [{ title: 'Panel', eyebrow: 'Eyebrow', body: 'Body' }],
};

describe('DesignMdBatchShowcase mobile product preview', () => {
  it('renders exactly three real product screenshots for a mobile theme', () => {
    const html = renderToStaticMarkup(
      <DesignMdBatchShowcase
        config={{
          ...sharedConfig,
          variant: 'mobile-product',
          previewImages: [
            { type: 'product-screenshot', url: '/screen-1.webp' },
            { type: 'product-screenshot', url: '/screen-2.webp' },
            { type: 'product-screenshot', url: '/screen-3.webp' },
          ],
          mobilePreview: {
            pattern: 'chat',
            navigation: ['首页', '消息', '我的'],
            primaryAction: '开始对话',
          },
        }}
      />,
    );

    expect(html).toContain('dmb-mobile-screenshot-gallery');
    expect(html.match(/class="dmb-mobile-screenshot"/g)).toHaveLength(3);
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).not.toContain('dmb-mobile-primary-action');
    expect(html).not.toContain('dmb-mobile-nav');
  });

  it('does not render a mobile preview for ordinary desktop configurations', () => {
    const html = renderToStaticMarkup(
      <DesignMdBatchShowcase config={{ ...sharedConfig, variant: 'dashboard' }} />,
    );

    expect(html).not.toContain('dmb-mobile-screenshot-gallery');
  });
});
