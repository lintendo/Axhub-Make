import { renderToStaticMarkup } from 'react-dom/server';
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
  it('renders a chat mobile product with three navigation items and one primary action', () => {
    const html = renderToStaticMarkup(
      <DesignMdBatchShowcase
        config={{
          ...sharedConfig,
          variant: 'mobile-product',
          mobilePreview: {
            pattern: 'chat',
            navigation: ['首页', '消息', '我的'],
            primaryAction: '开始对话',
          },
        }}
      />,
    );

    expect(html).toContain('dmb-mobile-preview');
    expect(html).toContain('首页');
    expect(html).toContain('消息');
    expect(html).toContain('我的');
    expect(html).toContain('开始对话');
  });

  it('does not render a mobile preview for ordinary desktop configurations', () => {
    const html = renderToStaticMarkup(
      <DesignMdBatchShowcase config={{ ...sharedConfig, variant: 'dashboard' }} />,
    );

    expect(html).not.toContain('dmb-mobile-preview');
  });
});
