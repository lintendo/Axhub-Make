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
  it('renders exactly three navigation controls, one primary action, and a selected navigation state', () => {
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
    const navigation = html.match(/<nav class="dmb-mobile-nav"[^>]*>([\s\S]*?)<\/nav>/);

    expect(navigation).not.toBeNull();
    expect(navigation?.[1].match(/<button\b/g)).toHaveLength(3);
    expect(html.match(/<button class="dmb-mobile-primary-action"/g)).toHaveLength(1);
    expect(navigation?.[1]).toMatch(/aria-current="page" aria-pressed="true"/);
    expect(navigation?.[1]).toContain('首页');
    expect(navigation?.[1]).toContain('消息');
    expect(navigation?.[1]).toContain('我的');
    expect(html).toContain('开始对话');
  });

  it('does not render a mobile preview for ordinary desktop configurations', () => {
    const html = renderToStaticMarkup(
      <DesignMdBatchShowcase config={{ ...sharedConfig, variant: 'dashboard' }} />,
    );

    expect(html).not.toContain('dmb-mobile-preview');
  });
});
