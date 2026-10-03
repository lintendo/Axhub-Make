import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FileText, Loader2, AlertCircle } from 'lucide-react';

import { ReadOnlyMarkdown } from '../../../../common/markdown/ReadOnlyMarkdown';
import { logEmbedDebug } from './AxhubWebEmbed';

interface AxhubDocEmbedProps {
    url: string;
    title?: string;
    width: number;
    height: number;
    elementId: string;
    screenshotUrl?: string;
}

function extractMarkdownUrl(url: string): string {
    if (!url) return '';

    try {
        const parsed = new URL(url, 'http://localhost');
        if (parsed.pathname.endsWith('/spec-template.html') || parsed.pathname === '/spec-template.html') {
            const innerUrl = parsed.searchParams.get('url');
            if (innerUrl) return innerUrl;
        }
    } catch {
        // Keep the original URL as the fetch target below.
    }

    if (url.includes('/api/markdown-file') || url.includes('/api/projects/') || url.includes('/api/docs/')) {
        return url;
    }
    return url;
}

export function normalizeFetchedMarkdownContent(rawContent: string): string {
    const text = String(rawContent || '');
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return text;
    }

    try {
        const payload = JSON.parse(trimmed);
        return typeof payload?.content === 'string' ? payload.content : text;
    } catch {
        return text;
    }
}

function AxhubDocEmbedInner({ url, title, elementId }: AxhubDocEmbedProps) {
    const [markdownContent, setMarkdownContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchedUrlRef = useRef<string>('');

    const displayTitle = title || '文档';
    const markdownUrl = useMemo(() => extractMarkdownUrl(url), [url]);

    const fetchContent = useCallback(async () => {
        if (!markdownUrl) {
            setError('无文档地址');
            return;
        }
        if (fetchedUrlRef.current === markdownUrl && markdownContent !== null) {
            return;
        }

        fetchedUrlRef.current = markdownUrl;
        setLoading(true);
        setError(null);
        try {
            logEmbedDebug('doc', 'fetch:start', { elementId, url: markdownUrl, title: displayTitle });
            const response = await fetch(markdownUrl);
            if (!response.ok) {
                throw new Error(`加载文档失败 (${response.status})`);
            }
            const content = normalizeFetchedMarkdownContent(await response.text());
            setMarkdownContent(content);
            logEmbedDebug('doc', 'fetch:success', { elementId, url: markdownUrl, length: content.length });
        } catch (fetchError: any) {
            logEmbedDebug('doc', 'fetch:error', { elementId, url: markdownUrl, message: fetchError?.message });
            setError(fetchError?.message || '加载文档失败');
        } finally {
            setLoading(false);
        }
    }, [markdownUrl, elementId, displayTitle]);

    useEffect(() => {
        void fetchContent();
    }, [fetchContent]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail || detail.elementId !== elementId) return;
            fetchedUrlRef.current = '';
            setMarkdownContent(null);
        };
        window.addEventListener('axhub:embedRefresh', handler);
        return () => window.removeEventListener('axhub:embedRefresh', handler);
    }, [elementId]);

    useEffect(() => {
        if (markdownContent === null && fetchedUrlRef.current === '') {
            void fetchContent();
        }
    }, [markdownContent, fetchContent]);

    if (loading) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', gap: 8 }}>
                <Loader2 style={{ width: 20, height: 20, color: '#94a3b8', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>加载文档中...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', gap: 8 }}>
                <AlertCircle style={{ width: 20, height: 20, color: '#ef4444' }} />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{error}</span>
            </div>
        );
    }

    if (!markdownContent) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', gap: 8, color: '#94a3b8', fontSize: 12, userSelect: 'none' }}>
                <FileText style={{ width: 32, height: 32, opacity: 0.5 }} />
                <span>暂无内容</span>
            </div>
        );
    }

    return (
        <div
            className="axhub-doc-embed"
            style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                background: '#fff',
                padding: '20px 24px',
                boxSizing: 'border-box',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}
        >
            <ReadOnlyMarkdown
                content={markdownContent}
                documentUrl={markdownUrl}
                className="axhub-doc-embed__markdown"
            />
            <style>{`
                .axhub-doc-embed__markdown { min-width: 0; }
                .axhub-doc-embed__markdown table:not(pre) { max-width: none; }
            `}</style>
        </div>
    );
}

const AxhubDocEmbed = React.memo(AxhubDocEmbedInner, (prev, next) => {
    return prev.url === next.url && prev.title === next.title && prev.width === next.width && prev.height === next.height && prev.screenshotUrl === next.screenshotUrl && prev.elementId === next.elementId;
});

export default AxhubDocEmbed;
