import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../common/markdown/ReadOnlyMarkdown', () => ({
    ReadOnlyMarkdown: ({ content, documentUrl }: { content: string; documentUrl?: string }) => createElement(
        'div',
        {
            'data-document-url': documentUrl,
            'data-markdown-content': content,
        },
    ),
}));

import AxhubDocEmbed, { normalizeFetchedMarkdownContent } from './AxhubDocEmbed';
import { ReadOnlyMarkdown } from '../../../../common/markdown/ReadOnlyMarkdown';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AxhubDocEmbed markdown content normalization', () => {
    it('unwraps project document content API JSON responses before rendering markdown', () => {
        const rawResponse = JSON.stringify({
            content: '# 健身 App 需求文档\n\n## 0. 文档信息',
            path: '/workspace/docs/fitness-app.md',
        });

        expect(normalizeFetchedMarkdownContent(rawResponse)).toBe('# 健身 App 需求文档\n\n## 0. 文档信息');
    });

    it('keeps ordinary markdown response text unchanged', () => {
        const markdown = '# Ordinary Markdown\n\n- item';

        expect(normalizeFetchedMarkdownContent(markdown)).toBe(markdown);
    });

    it('keeps JSON-looking documents unchanged when they are not content wrappers', () => {
        const jsonDocument = '{"title":"API Example","body":"still documentation"}';

        expect(normalizeFetchedMarkdownContent(jsonDocument)).toBe(jsonDocument);
    });

    it('passes fetched table Markdown to the shared read-only reader', async () => {
        const markdown = '| 用户 | 场景 |\n| --- | --- |\n| 销售 | 首页 |';
        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            text: async () => markdown,
        }));

        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(createElement(AxhubDocEmbed, {
                url: '/api/markdown-file?path=src%2Fresources%2Fcrm.md',
                width: 720,
                height: 480,
                elementId: 'doc-1',
            }));
        });

        const reader = renderer!.root.findByType(ReadOnlyMarkdown);
        expect(reader.props.content).toBe(markdown);
        expect(reader.props.documentUrl).toContain('/api/markdown-file');
    });
});
