import { createElement } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ant-design/x', () => ({
  Mermaid: ({ children }: { children?: unknown }) => createElement('div', null, children),
}));

vi.mock('@ant-design/x-markdown', () => ({
  XMarkdown: ({ content, className }: { content?: string; className?: string }) => createElement(
    'div',
    { className },
    String(content || '').includes('|') ? createElement('table') : null,
  ),
}));

vi.mock('@ant-design/x-markdown/themes/light.css', () => ({}));

import { ReadOnlyMarkdown } from './ReadOnlyMarkdown';

describe('ReadOnlyMarkdown', () => {
  it('renders GFM table cells through the shared reader', () => {
    const tree = create(
      createElement(ReadOnlyMarkdown, {
        content: '| 用户 | 场景 |\n| --- | --- |\n| 销售 | 首页 |',
      }),
    ).toJSON();

    expect(JSON.stringify(tree)).toContain('table');
  });
});
