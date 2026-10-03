import { createElement } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Parser } from '@ant-design/x-markdown/lib/XMarkdown/core';

vi.mock('@ant-design/x', () => ({
  Mermaid: ({ children }: { children?: unknown }) => createElement('div', null, children),
}));

vi.mock('@ant-design/x-markdown', () => ({
  XMarkdown: ({ content, className }: { content?: string; className?: string }) => createElement(
    'div',
    { className, 'data-markdown-content': content },
  ),
}));

vi.mock('@ant-design/x-markdown/themes/light.css', () => ({}));

import { ReadOnlyMarkdown } from './ReadOnlyMarkdown';

describe('ReadOnlyMarkdown', () => {
  const tableMarkdown = '| 用户 | 场景 |\n| --- | --- |\n| 销售 | 首页 |';

  it('parses GFM table cells through the installed XMarkdown parser', () => {
    const html = new Parser().parse(tableMarkdown);

    expect(html).toContain('<table>');
    expect(html).toContain('<th>用户</th>');
    expect(html).toContain('<td>销售</td>');
  });

  it('passes table Markdown to XMarkdown with the shared light reader class', () => {
    const tree = create(
      createElement(ReadOnlyMarkdown, {
        content: tableMarkdown,
      }),
    ).toJSON();

    expect(tree).toMatchObject({
      props: {
        className: 'axhub-readonly-markdown x-markdown-light',
        'data-markdown-content': tableMarkdown,
      },
    });
  });
});
