import React from 'react';
import { Download, FileArchive, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import type { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { PromptClientPreference } from '../../types';
import { apiService, type ExportMakeProbeResponse } from '../../services/api';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import PromptActionButton from '../PromptActionButton';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface FigmaMakeExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemName?: string | null;
    itemDisplayName?: string | null;
    targetPath?: string | null;
    projectId: string;
    ideTargetPath?: string | null;
    preferredPromptClient: PromptClientPreference;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    assistantOpen?: boolean;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    onDownloadSuccess?: (fileName: string) => void;
    onDownloadFailure?: (error: unknown) => void;
}

function formatExportedAt(value: string | null): string {
    if (!value) return '尚未导出';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export default function FigmaMakeExportDialog({
    open,
    onOpenChange,
    itemName,
    targetPath,
    projectId,
    ideTargetPath,
    preferredPromptClient,
    preferredIDE,
    ideAvailability,
    assistantOpen,
    onExecutePrompt,
    onDownloadSuccess,
    onDownloadFailure,
}: FigmaMakeExportDialogProps) {
    const resolvedTargetPath = String(targetPath || '').trim();
    const resolvedIdeTargetPath = String(ideTargetPath || '').trim();
    const scope = React.useMemo(() => requireProjectScope(projectId), [projectId]);
    const [probe, setProbe] = React.useState<ExportMakeProbeResponse | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [downloading, setDownloading] = React.useState(false);

    const loadProbe = React.useCallback(async () => {
        if (!resolvedTargetPath) {
            setProbe(null);
            return;
        }

        setLoading(true);
        try {
            const result = await apiService.probeExportMake(resolvedTargetPath, scope);
            setProbe(result);
        } catch (nextError: any) {
            setProbe(null);
            toast.error(nextError?.message || '加载导出状态失败');
        } finally {
            setLoading(false);
        }
    }, [resolvedTargetPath, scope]);

    React.useEffect(() => {
        if (!open) {
            return;
        }
        void loadProbe();
    }, [loadProbe, open]);

    const handleDownload = React.useCallback(async () => {
        if (!resolvedTargetPath) {
            toast.warning('请先选择一个原型页面');
            return;
        }

        setDownloading(true);
        try {
            const response = await fetch(withProjectScope(`/api/export-make?path=${encodeURIComponent(resolvedTargetPath)}`, scope));
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result?.error || '下载 .fig 失败');
            }

            const blob = await response.blob();
            const fileName = probe?.fileName || `${itemName || 'project'}.fig`;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            toast.success('.fig 文件已开始下载');
            onDownloadSuccess?.(fileName);
            await loadProbe();
        } catch (nextError: any) {
            onDownloadFailure?.(nextError);
            toast.error(nextError?.message || '下载 .fig 失败');
        } finally {
            setDownloading(false);
        }
    }, [itemName, loadProbe, onDownloadFailure, onDownloadSuccess, probe?.fileName, resolvedTargetPath, scope]);

    const canDownload = Boolean(probe?.hasMakeAssets) && !probe?.hasDriftRisk && !loading && !downloading;
    const fileName = probe?.fileName || `${itemName || 'project'}.fig`;
    const lastUpdated = formatExportedAt(probe?.lastExportedAt || null);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader className="gap-1.5">
                    <DialogTitle className="text-[18px] font-semibold tracking-tight">
                        导出 Figma Make
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-6">
                        使用 AI 导出或更新 .fig 文件
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Figma Make 文件</div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs"
                            onClick={() => void loadProbe()}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            刷新状态
                        </Button>
                    </div>

                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className={`rounded-lg p-2 ${probe?.hasMakeAssets ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    <FileArchive className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <div className="truncate text-sm font-medium">
                                        {probe?.hasMakeAssets ? fileName : '尚未生成'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        最后更新：{lastUpdated}
                                    </div>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="brand"
                                size="sm"
                                className="shrink-0 self-center gap-1.5"
                                onClick={() => void handleDownload()}
                                disabled={!canDownload}
                            >
                                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                下载 Figma Make
                            </Button>
                        </div>
                    </div>

                    {probe?.hasDriftRisk && probe.driftReasons.length > 0 ? (
                        <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                            {probe.driftReasons.map((reason) => (
                                <div key={reason}>- {reason}</div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <DialogFooter className="gap-2 sm:justify-end">
                    <PromptActionButton
                        type="default"
                        preferredClient={preferredPromptClient}
                        preferredIDE={preferredIDE}
                        ideAvailability={ideAvailability}
                        assistantOpen={assistantOpen}
                        scene="export-figma-make"
                        buildPrompt={async () => {
                            if (!resolvedTargetPath) {
                                throw new Error('请先选择一个原型页面');
                            }
                            const result = await apiService.getExportMakePrompt(resolvedTargetPath, scope);
                            return result.prompt;
                        }}
                        getTargetPath={() => resolvedIdeTargetPath || resolvedTargetPath || null}
                        onExecutePrompt={onExecutePrompt}
                        copySuccessMessage="导出 Prompt 已复制，请发送给 AI 继续生成或更新 .fig 文件"
                        executeSuccessMessage="已打开新会话"
                        fallbackMessage="自动执行失败，已回退为复制导出 Prompt"
                        copyLabel="复制导出 Prompt"
                        disabled={!resolvedTargetPath}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
