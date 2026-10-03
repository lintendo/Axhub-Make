import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Loader2, RotateCw } from 'lucide-react';
import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { copyToClipboard } from '../../utils/clipboard';
import { withProjectScope } from '../../services/projectScope';
import HomeDataTable from './HomeDataTable';

export interface JsonDocumentResource {
    name?: string;
    projectId?: string;
    specUrl?: string;
    previewUrl?: string;
    filePath?: string;
    absoluteFilePath?: string;
}

export type JsonDocumentParseResult =
    | { kind: 'json'; data: unknown; rawText: string }
    | { kind: 'text'; rawText: string };

export function isJsonDocumentResource(item: JsonDocumentResource | null | undefined): boolean {
    if (!item) return false;
    return [item.name, item.specUrl, item.previewUrl, item.filePath, item.absoluteFilePath]
        .some((value) => /\.json(?:[?#/]|$)/iu.test(String(value || '').trim()));
}

export function parseJsonDocument(rawText: string): JsonDocumentParseResult {
    const normalizedText = String(rawText || '');
    try {
        return { kind: 'json', data: JSON.parse(normalizedText), rawText: normalizedText };
    } catch {
        return { kind: 'text', rawText: normalizedText };
    }
}

export function isDatabaseJsonPayload(value: unknown): value is { tableName: string; records: Record<string, unknown>[] } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const payload = value as { tableName?: unknown; records?: unknown };
    return typeof payload.tableName === 'string' && Array.isArray(payload.records)
        && payload.records.every((record) => Boolean(record) && typeof record === 'object' && !Array.isArray(record));
}

export function isDataDirectoryResource(item: JsonDocumentResource | null | undefined): boolean {
    if (!item) return false;
    return [item.name, item.filePath, item.absoluteFilePath]
        .some((value) => /(?:^|[\\/])data(?:[\\/]|$)/iu.test(String(value || '').trim()));
}

export function getDataTableFileName(item: JsonDocumentResource): string {
    const value = String(item.filePath || item.name || '').trim().replace(/\\/g, '/');
    const baseName = value.split('/').filter(Boolean).pop() || value;
    return baseName.replace(/\.json$/iu, '');
}

function resolveJsonDocumentUrl(item: JsonDocumentResource, projectId: string): string {
    const sourceUrl = String(item.previewUrl || item.specUrl || '').trim();
    if (sourceUrl) {
        return projectId && sourceUrl.startsWith('/api/')
            ? withProjectScope(sourceUrl, { projectId })
            : sourceUrl;
    }

    const name = String(item.name || '').trim();
    return projectId && name
        ? withProjectScope(`/api/docs/${encodeURIComponent(name)}`, { projectId })
        : '';
}

function JsonToolbar({ expanded, onToggleExpanded, rawText }: {
    expanded: boolean;
    onToggleExpanded: () => void;
    rawText: string;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await copyToClipboard(rawText);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '复制失败');
        }
    };

    return (
        <div className="flex shrink-0 items-center justify-end gap-1 border-b bg-muted/20 px-3 py-1.5">
            <TooltipProvider delayDuration={250}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleExpanded}>
                            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{expanded ? '收起 JSON' : '展开 JSON'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleCopy()}>
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? '已复制' : '复制 JSON'}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}

export default function JsonDocumentPreview({ item, projectId }: {
    item: JsonDocumentResource;
    projectId: string;
}) {
    const [rawText, setRawText] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState(true);
    const [reloadToken, setReloadToken] = useState(0);
    const url = useMemo(() => resolveJsonDocumentUrl(item, projectId), [item, projectId]);
    const parsed = useMemo(() => parseJsonDocument(rawText), [rawText]);
    const shouldExpandNode = (_level: number) => expanded;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        setRawText('');
        if (!url) {
            setLoading(false);
            setError('当前 JSON 没有可访问的文件地址');
            return () => { cancelled = true; };
        }

        fetch(url)
            .then(async (response) => {
                if (!response.ok) throw new Error(`加载 JSON 失败（${response.status}）`);
                return response.text();
            })
            .then((text) => {
                if (!cancelled) setRawText(text);
            })
            .catch((loadError) => {
                if (!cancelled) setError(loadError instanceof Error ? loadError.message : '加载 JSON 失败');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [reloadToken, url]);

    if (loading) {
        return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
    }

    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <span>{error}</span>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setReloadToken((value) => value + 1)}>
                    <RotateCw className="h-3.5 w-3.5" />
                    重试
                </Button>
            </div>
        );
    }

    if (parsed.kind === 'text') {
        return (
            <div className="flex h-full min-h-0 flex-col bg-background">
                <JsonToolbar expanded={expanded} onToggleExpanded={() => setExpanded((value) => !value)} rawText={parsed.rawText} />
                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-foreground">{parsed.rawText}</pre>
            </div>
        );
    }

    if (isDatabaseJsonPayload(parsed.data) && isDataDirectoryResource(item)) {
        return (
            <div className="h-full min-h-0 overflow-hidden bg-background p-3">
                <HomeDataTable
                    projectId={projectId}
                    fileName={getDataTableFileName(item)}
                    tableName={parsed.data.tableName}
                />
            </div>
        );
    }

    const isTreeValue = parsed.data !== null && typeof parsed.data === 'object';
    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            <JsonToolbar expanded={expanded} onToggleExpanded={() => setExpanded((value) => !value)} rawText={parsed.rawText} />
            <div className="min-h-0 flex-1 overflow-auto p-4 text-xs [&_.child-fields-container]:ml-4 [&_.child-fields-container]:border-l [&_.child-fields-container]:border-border/50 [&_.child-fields-container]:pl-3">
                {isTreeValue ? (
                    <JsonView key={`${parsed.rawText}-${expanded}`} data={parsed.data as object} shouldExpandNode={shouldExpandNode} style={defaultStyles} />
                ) : (
                    <pre className="font-mono leading-5 text-foreground">{JSON.stringify(parsed.data, null, 2)}</pre>
                )}
            </div>
        </div>
    );
}
