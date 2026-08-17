import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    buildDocumentTemplateOpenUrl,
    buildDocumentTemplatesApiUrl,
    type DocumentTemplateSettingsItem,
} from './documentTemplateSettings';

interface DocumentTemplateSettingsProps {
    projectId: string;
}

interface DocumentTemplatesResponse {
    templates?: DocumentTemplateSettingsItem[];
    template?: DocumentTemplateSettingsItem;
    error?: string;
}

async function readResponse(response: Response): Promise<DocumentTemplatesResponse> {
    const payload = await response.json().catch(() => ({})) as DocumentTemplatesResponse;
    if (!response.ok) {
        throw new Error(payload.error || `请求失败（${response.status}）`);
    }
    return payload;
}

export function DocumentTemplateSettings({ projectId }: DocumentTemplateSettingsProps) {
    const [templates, setTemplates] = useState<DocumentTemplateSettingsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const response = await fetch(buildDocumentTemplatesApiUrl(projectId), { cache: 'no-store' });
            const payload = await readResponse(response);
            setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : '加载文档模板失败');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    const openTemplate = (template: DocumentTemplateSettingsItem) => {
        if (!template.exists) return;
        window.open(buildDocumentTemplateOpenUrl(template, projectId), '_blank', 'noopener,noreferrer');
    };

    const restoreTemplate = async (template: DocumentTemplateSettingsItem) => {
        if (!window.confirm(`确认恢复“${template.displayName}”的默认文件？`)) return;
        setRestoringId(template.id);
        try {
            const response = await fetch(buildDocumentTemplatesApiUrl(projectId, template.id, 'restore'), {
                method: 'POST',
            });
            const payload = await readResponse(response);
            if (payload.template) {
                setTemplates((current) => current.map((item) => (
                    item.id === payload.template?.id ? payload.template : item
                )));
            } else {
                await loadTemplates();
            }
            toast.success('默认模板已恢复');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '恢复默认模板失败');
        } finally {
            setRestoringId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在加载模板…
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <span className="min-w-0 text-xs text-destructive">{loadError}</span>
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0" onClick={() => void loadTemplates()}>
                    重试
                </Button>
            </div>
        );
    }

    return (
        <div className="divide-y rounded-md border border-border">
            {templates.map((template) => {
                const restoring = restoringId === template.id;
                return (
                    <div key={template.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0 space-y-0.5">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{template.displayName}</span>
                                <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {template.format === 'html' ? 'HTML' : 'Markdown'}
                                </span>
                                {!template.exists ? (
                                    <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                        文件缺失
                                    </span>
                                ) : null}
                            </div>
                            <p className="truncate text-xs leading-4 text-muted-foreground">
                                {template.description} · {template.path}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            {template.exists ? (
                                <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={() => openTemplate(template)}>
                                    <ExternalLink className="h-3 w-3" />
                                    查看
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1"
                                    disabled={restoring}
                                    onClick={() => void restoreTemplate(template)}
                                >
                                    {restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                    恢复默认模板
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
