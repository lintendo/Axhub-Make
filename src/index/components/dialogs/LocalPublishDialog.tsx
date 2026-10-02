import React, { useEffect, useState } from 'react';
import { QRCode } from 'antd';
import { Check, Clipboard, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import {
    apiService,
    type LanHtmlPublishResponse,
    type LanLatestPublishResponse,
    type LanRealtimePublishResponse,
} from '../../services/api';
import { requireProjectScope } from '../../services/projectScope';
import { buildLANServerUrl } from '../../utils/url';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export type LocalPublishMode = 'html' | 'realtime';

export interface LocalPublishDialogProps {
    open: boolean;
    mode: LocalPublishMode;
    projectId: string;
    targetPath: string;
    previewUrl?: string;
    onOpenChange: (open: boolean) => void;
    onPublished?: (result: LanHtmlPublishResponse | LanRealtimePublishResponse) => void;
}

function normalizeLatest(value: LanLatestPublishResponse): LanLatestPublishResponse {
    return {
        ...value,
        html: value.html ? { ...value.html, url: buildLANServerUrl(value.html.url) } : null,
        realtime: value.realtime ? {
            ...value.realtime,
            url: buildLANServerUrl(value.realtime.url),
            annotationUrl: buildLANServerUrl(value.realtime.annotationUrl || value.realtime.url),
            previewUrl: buildLANServerUrl(value.realtime.previewUrl),
        } : null,
    };
}

function normalizeRealtimeResult(value: LanRealtimePublishResponse): LanRealtimePublishResponse {
    const annotationUrl = buildLANServerUrl(value.annotationUrl || value.url);
    return {
        ...value,
        url: annotationUrl,
        annotationUrl,
        previewUrl: buildLANServerUrl(value.previewUrl),
    };
}

async function copyLink(value: string) {
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
        toast.success('链接已复制');
    } catch {
        toast.error('复制失败，请手动复制');
    }
}

export default function LocalPublishDialog({
    open,
    mode,
    projectId,
    targetPath,
    onOpenChange,
    onPublished,
}: LocalPublishDialogProps) {
    const [publishing, setPublishing] = useState(false);
    const [loadingLatest, setLoadingLatest] = useState(false);
    const [latest, setLatest] = useState<LanLatestPublishResponse | null>(null);
    const [commentable, setCommentable] = useState(true);

    useEffect(() => {
        if (!open) return;
        const normalizedPath = String(targetPath || '').trim();
        let cancelled = false;
        setPublishing(false);
        setLoadingLatest(true);
        setLatest(null);
        setCommentable(true);
        const scope = requireProjectScope(projectId);
        apiService.getLatestLanPublishing(normalizedPath, scope).then((current) => {
            if (cancelled) return;
            const normalized = normalizeLatest(current);
            setCommentable(normalized.realtime?.commentable ?? true);
            setLatest(normalized);
        }).catch(() => {
            if (!cancelled) {
                setLatest({ resourcePath: normalizedPath, html: null, realtime: null });
                setCommentable(true);
            }
        }).finally(() => {
            if (!cancelled) setLoadingLatest(false);
        });
        return () => {
            cancelled = true;
        };
    }, [open, projectId, targetPath]);

    const currentHtml = latest?.html || null;
    const currentRealtime = latest?.realtime || null;
    const currentAnnotationUrl = currentRealtime
        ? buildLANServerUrl(currentRealtime.annotationUrl || currentRealtime.url)
        : '';
    const currentPreviewUrl = currentRealtime ? buildLANServerUrl(currentRealtime.previewUrl) : '';
    const currentUrl = mode === 'html' ? currentHtml?.url : currentAnnotationUrl;
    const showHtmlPublishAction = !loadingLatest && mode === 'html' && !currentHtml;

    const handlePublish = async () => {
        if (mode !== 'html') return;
        const normalizedPath = String(targetPath || '').trim();
        if (!normalizedPath) {
            toast.error('当前没有可发布的原型路径');
            return;
        }
        setPublishing(true);
        try {
            const scope = requireProjectScope(projectId);
            const response = await apiService.publishLanHtml({ path: normalizedPath }, scope);
            setLatest((current) => ({
                resourcePath: normalizedPath,
                html: { ...response, url: buildLANServerUrl(response.url) },
                realtime: current?.realtime || null,
            }));
            onPublished?.(response);
            toast.success('当前版本原型已发布');
        } catch (error: any) {
            toast.error(error?.message || '发布当前版本原型失败');
        } finally {
            setPublishing(false);
        }
    };

    const handleCommentableChange = async (checked: boolean) => {
        setCommentable(checked);
        if (mode !== 'realtime' || !currentRealtime) return;
        const normalizedPath = String(targetPath || '').trim();
        if (!normalizedPath) return;
        setPublishing(true);
        try {
            const response = await apiService.publishLanRealtime(
                { path: normalizedPath, previewUrl: currentRealtime.previewUrl || undefined, commentable: checked },
                requireProjectScope(projectId),
            );
            const normalizedResponse = normalizeRealtimeResult(response);
            setLatest((current) => current ? {
                ...current,
                realtime: {
                    ...normalizedResponse,
                    updatedAt: new Date().toISOString(),
                },
            } : current);
            onPublished?.(normalizedResponse);
            toast.success(checked ? '已允许团队批注' : '已关闭团队批注');
        } catch (error: any) {
            setCommentable(!checked);
            toast.error(error?.message || '保存批注设置失败');
        } finally {
            setPublishing(false);
        }
    };

    const renderCurrentLink = () => {
        if (!currentUrl) return null;
        const renderLinkRow = (label: string, value: string) => (
            <div className="space-y-1.5">
                <div className="text-xs font-medium text-foreground">{label}</div>
                <div className="flex items-center gap-2">
                    <Input value={value} readOnly className="h-9 min-w-0 bg-background text-xs" />
                    <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => void copyLink(value)} aria-label={`复制${label}`}>
                        <Clipboard className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => window.open(value, '_blank', 'noopener,noreferrer')} aria-label={`打开${label}`}>
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );
        return (
            <div className="space-y-3">
                <div className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground">
                            {mode === 'html' ? `当前发布地址 · v${currentHtml?.version || 0}` : '当前实时地址'}
                        </div>
                    </div>
                </div>
                {mode === 'realtime' ? (
                    <div className="space-y-3">
                        {renderLinkRow('批注地址', currentAnnotationUrl)}
                        {renderLinkRow('普通预览地址', currentPreviewUrl)}
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Input value={currentUrl} readOnly className="h-9 min-w-0 bg-background text-xs" />
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => void copyLink(currentUrl)} aria-label="复制链接">
                            <Clipboard className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')} aria-label="打开链接">
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" disabled={publishing} onClick={() => void handlePublish()}>
                            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            更新
                        </Button>
                    </div>
                )}
                {mode === 'realtime' ? (
                    <div className="flex justify-center rounded-md border border-border/60 bg-muted/20 p-3">
                        <QRCode value={currentPreviewUrl} size={132} bordered={false} />
                    </div>
                ) : null}
            </div>
        );
    };

    const handleCancel = async () => {
        if (mode !== 'html' || !currentHtml) {
            onOpenChange(false);
            return;
        }
        const normalizedPath = String(targetPath || '').trim();
        if (!normalizedPath) return;
        setPublishing(true);
        try {
            const scope = requireProjectScope(projectId);
            await apiService.cancelLanPublish('html', { path: normalizedPath }, scope);
            setLatest((current) => current ? {
                ...current,
                html: null,
            } : current);
            toast.success('已取消发布');
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error?.message || '取消局域网发布失败');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[min(92vw,460px)] max-w-[460px] overflow-hidden rounded-[20px] border-border bg-card p-0 text-sm shadow-md [&>[data-dialog-close]]:hidden">
                <DialogTitle className="sr-only">发布</DialogTitle>
                <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                    {loadingLatest ? (
                        <div className="flex min-h-[150px] items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在读取已有发布地址…
                        </div>
                    ) : null}
                    {!loadingLatest ? renderCurrentLink() : null}
                    {!loadingLatest && mode === 'realtime' && currentRealtime ? (
                        <div className="mt-4 flex items-center justify-between gap-4 py-1">
                            <div className="font-medium">允许团队批注</div>
                            <Switch
                                checked={commentable}
                                disabled={publishing}
                                onCheckedChange={(checked) => void handleCommentableChange(checked === true)}
                                aria-label="允许团队批注"
                            />
                        </div>
                    ) : null}
                    {!loadingLatest && mode === 'html' && !currentUrl ? (
                        <div className="flex min-h-[170px] flex-col items-center justify-center gap-3 text-center">
                            <p className="text-sm text-muted-foreground">
                                还没有当前版本原型链接
                            </p>
                            {showHtmlPublishAction ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    disabled={publishing}
                                    onClick={() => void handlePublish()}
                                >
                                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    发布当前版本原型
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                    <DialogFooter className="mt-5 flex flex-row justify-end gap-2 sm:space-x-0">
                        <Button type="button" variant="outline" size="sm" className="h-8" disabled={publishing} onClick={() => void handleCancel()}>
                            {mode === 'html' && currentUrl ? '取消发布' : '关闭'}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
