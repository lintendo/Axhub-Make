import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import {
    apiService,
    type AxhubHtmlProject,
    type AxhubPublishResponse,
    type AxhubStatusResponse,
} from '../../services/api';
import { requireProjectScope } from '../../services/projectScope';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface AxhubPublishDialogProps {
    open: boolean;
    targetPath: string;
    projectId: string;
    onOpenChange: (open: boolean) => void;
    onPublished?: (result: AxhubPublishResponse) => void;
}

function formatBytes(bytes?: number): string {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return '0 KB';
    }
    if (value >= 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${Math.ceil(value / 1024)} KB`;
}

function projectUpdatedAt(project: AxhubHtmlProject): string {
    const value = project.generateTime || project.updateTime || project.createTime;
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(value));
    } catch {
        return '';
    }
}

function buildProjectPreviewUrl(baseUrl: string | undefined, project: AxhubHtmlProject): string {
    const normalizedBase = String(baseUrl || 'https://axhub.im').replace(/\/+$/u, '');
    return `${normalizedBase}/html/${encodeURIComponent(String(project.path || ''))}/`;
}

function buildEnterpriseProjectPreviewUrl(baseUrl: string | undefined, project: AxhubHtmlProject): string {
    const normalizedBase = String(baseUrl || '').replace(/\/+$/u, '');
    return `${normalizedBase}/pro/${encodeURIComponent(String(project.path || ''))}/`;
}

function normalizeAvatarUrl(value?: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    return raw;
}

export default function AxhubPublishDialog({
    open,
    targetPath,
    projectId,
    onOpenChange,
    onPublished,
}: AxhubPublishDialogProps) {
    const [status, setStatus] = useState<AxhubStatusResponse | null>(null);
    const [projects, setProjects] = useState<AxhubHtmlProject[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [loading, setLoading] = useState(false);
    const [authorizing, setAuthorizing] = useState(false);
    const [enterpriseFormOpen, setEnterpriseFormOpen] = useState(false);
    const [enterpriseServerUrl, setEnterpriseServerUrl] = useState('');
    const [enterpriseToken, setEnterpriseToken] = useState('');
    const [connectingEnterprise, setConnectingEnterprise] = useState(false);
    const [creating, setCreating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [clearingProjectId, setClearingProjectId] = useState('');

    const connected = status?.connected === true;
    const provider = status?.provider || 'online';
    const isEnterprise = provider === 'enterprise';
    const isPlus = status?.me?.isPlus === true;
    const selectedProject = useMemo(
        () => projects.find((project) => String(project.pid) === selectedProjectId) || null,
        [projects, selectedProjectId],
    );
    const avatarUrl = normalizeAvatarUrl(status?.me?.avatar);
    const displayName = isEnterprise
        ? status?.me?.name || status?.name || 'Enterprise Token'
        : status?.me?.userName || 'Axhub 用户';
    const avatarFallback = (displayName || 'A').slice(0, 1).toUpperCase();

    const loadData = useCallback(async (options: { quiet?: boolean } = {}) => {
        if (!options.quiet) {
            setLoading(true);
        }
        try {
            const nextStatus = await apiService.getAxhubStatus();
            setStatus(nextStatus);
            if (nextStatus.connected && nextStatus.me?.isPlus === true) {
                const [result, latest] = await Promise.all([
                    apiService.getAxhubHtmlProjects(),
                    apiService.getCloudPublishingLatest(targetPath, requireProjectScope(projectId)),
                ]);
                setProjects(result.projects || []);
                const boundProjectId = String(latest.targets.axhub?.axhubProjectId || '');
                setSelectedProjectId((current) => {
                    if (current && result.projects?.some((project) => String(project.pid) === current)) {
                        return current;
                    }
                    if (boundProjectId && result.projects?.some((project) => String(project.pid) === boundProjectId)) {
                        return boundProjectId;
                    }
                    return result.projects?.[0] ? String(result.projects[0].pid) : '';
                });
            } else {
                setProjects([]);
                setSelectedProjectId('');
            }
        } catch (error: any) {
            toast.error(error?.message || '加载 Axhub 状态失败');
            setStatus(null);
            setProjects([]);
            setSelectedProjectId('');
        } finally {
            if (!options.quiet) {
                setLoading(false);
            }
        }
    }, [projectId, targetPath]);

    useEffect(() => {
        if (!open) {
            setAuthorizing(false);
            setEnterpriseFormOpen(false);
            setEnterpriseToken('');
            return;
        }
        void loadData();
    }, [loadData, open]);

    useEffect(() => {
        if (!open || !authorizing) return;
        const timer = window.setInterval(() => {
            apiService.getAxhubStatus()
                .then((nextStatus) => {
                    setStatus(nextStatus);
                    if (nextStatus.connected) {
                        setAuthorizing(false);
                        void loadData({ quiet: true });
                        toast.success('Axhub 授权成功');
                    }
                })
                .catch(() => undefined);
        }, 1800);
        return () => window.clearInterval(timer);
    }, [authorizing, loadData, open]);

    const handleConnect = async () => {
        try {
            const result = await apiService.connectAxhub();
            window.open(result.authorizeUrl, 'axhub-authorize', 'width=980,height=760');
            setAuthorizing(true);
        } catch (error: any) {
            toast.error(error?.message || '创建 Axhub 授权链接失败');
        }
    };

    const handleConnectEnterprise = async () => {
        const serverUrl = enterpriseServerUrl.trim();
        const token = enterpriseToken.trim();
        if (!serverUrl) {
            toast.error('请输入企业版地址');
            return;
        }
        if (!token) {
            toast.error('请输入 Enterprise Token');
            return;
        }
        setConnectingEnterprise(true);
        try {
            const nextStatus = await apiService.connectAxhubEnterprise({ serverUrl, token });
            setStatus(nextStatus);
            setEnterpriseToken('');
            setEnterpriseFormOpen(false);
            await loadData({ quiet: true });
            toast.success('企业版已连接');
        } catch (error: any) {
            toast.error(error?.message || '连接企业版失败');
        } finally {
            setConnectingEnterprise(false);
        }
    };

    const handleCreateProject = async () => {
        const name = newProjectName.trim();
        if (!name || creating) return;
        if (!isPlus) {
            toast.error('目前只有 Plus 会员支持创建 HTML 项目');
            return;
        }
        setCreating(true);
        try {
            const result = await apiService.createAxhubHtmlProject(name);
            setProjects((current) => [result.project, ...current.filter((project) => project.pid !== result.project.pid)]);
            setSelectedProjectId(String(result.project.pid));
            setNewProjectName('');
            toast.success('HTML 项目已创建');
        } catch (error: any) {
            toast.error(error?.message || '创建 Axhub HTML 项目失败');
        } finally {
            setCreating(false);
        }
    };

    const handlePublish = async () => {
        if (!selectedProject || publishing) return;
        if (!isPlus) {
            toast.error('目前只有 Plus 会员支持发布 HTML 项目');
            return;
        }
        setPublishing(true);
        try {
            const result = await apiService.publishAxhubHtmlProject({
                pid: selectedProject.pid,
                path: targetPath,
                projectId,
            });
            toast.success('已发布到 Axhub', {
                duration: Infinity,
                description: (
                    <a href={result.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        {result.url}
                    </a>
                ),
            });
            onPublished?.(result);
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error?.message || '发布到 Axhub 失败');
        } finally {
            setPublishing(false);
        }
    };

    const handleClearReviewReports = async (project: AxhubHtmlProject, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const count = Math.max(0, Number(project.reviewReportCount || 0));
        if (count <= 0 || clearingProjectId) return;
        if (!window.confirm(`将删除云端 ${count} 份评审报告，不影响已同步到本地的报告`)) return;
        setClearingProjectId(String(project.pid));
        try {
            await apiService.clearAxhubHtmlProjectReviewReports(project.pid);
            setProjects((current) => current.map((item) => item.pid === project.pid
                ? { ...item, reviewReportCount: 0 }
                : item));
            toast.success('云端评审报告已清空');
        } catch (error: any) {
            toast.error(error?.message || '清空 Axhub 评审报告失败');
        } finally {
            setClearingProjectId('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(88vh,560px)] w-[min(90vw,680px)] max-w-[680px] flex-col overflow-hidden p-0 text-sm [&>[data-dialog-close]]:hidden">
                <DialogTitle className="sr-only">发布到 Axhub</DialogTitle>
                <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                    <div className="min-w-0 truncate text-sm font-semibold">发布到 Axhub</div>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => onOpenChange(false)} aria-label="关闭">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
                    {loading ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            加载中...
                        </div>
                    ) : !connected ? (
                        enterpriseFormOpen ? (
                            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center">
                                <div className="grid w-full max-w-[420px] gap-2 text-left">
                                    <Input
                                        value={enterpriseServerUrl}
                                        onChange={(event) => setEnterpriseServerUrl(event.target.value)}
                                        placeholder="https://enterprise.example.com"
                                        autoComplete="off"
                                        disabled={connectingEnterprise}
                                    />
                                    <Input
                                        value={enterpriseToken}
                                        onChange={(event) => setEnterpriseToken(event.target.value)}
                                        placeholder="Enterprise Token"
                                        type="password"
                                        autoComplete="off"
                                        disabled={connectingEnterprise}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                void handleConnectEnterprise();
                                            }
                                        }}
                                    />
                                    <div className="flex items-center justify-between gap-2">
                                        <Button
                                            type="button"
                                            variant="link"
                                            className="h-8 px-1 text-muted-foreground hover:text-foreground"
                                            onClick={() => setEnterpriseFormOpen(false)}
                                            disabled={connectingEnterprise}
                                        >
                                            返回
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => void handleConnectEnterprise()}
                                            disabled={connectingEnterprise}
                                        >
                                            {connectingEnterprise ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                            验证并连接
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                                <div className="text-base font-semibold">连接 Axhub</div>
                                <div className="max-w-full text-sm leading-6 text-muted-foreground sm:whitespace-nowrap">
                                    选择 Axhub 授权，或使用企业版地址和 Enterprise Token 连接。
                                </div>
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button type="button" onClick={() => void handleConnect()} disabled={authorizing || connectingEnterprise}>
                                        {authorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        {authorizing ? '等待授权完成' : '连接 Axhub'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="link"
                                        className="px-1 text-muted-foreground hover:text-foreground"
                                        onClick={() => setEnterpriseFormOpen(true)}
                                        disabled={authorizing || connectingEnterprise}
                                    >
                                        连接企业版
                                    </Button>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex h-full min-h-0 flex-col gap-4">
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt=""
                                            className="h-7 w-7 shrink-0 rounded-full object-cover"
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                            {avatarFallback}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{displayName}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {isEnterprise
                                                ? `${status?.serverUrl || status?.me?.serverUrl || '企业版'} · Token ${status?.tokenPrefix || status?.me?.tokenPrefix || '已保存'}`
                                                : `${isPlus ? 'Plus 会员' : '非 Plus 会员'} · 可用空间 ${formatBytes(status?.me?.freeDiskSpace)}`}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => void loadData()} aria-label="刷新">
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            void apiService.disconnectAxhub().then(() => loadData());
                                        }}
                                    >
                                        断开
                                    </Button>
                                </div>
                            </div>

                            {!isPlus ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                    目前只有 Plus 会员支持创建和发布 HTML 项目。
                                </div>
                            ) : (
                                <>
                                    <div className="grid shrink-0 rounded-md border bg-muted/20 p-3">
                                        <div className="flex gap-2">
                                            <Input
                                                className="min-w-0"
                                                value={newProjectName}
                                                onChange={(event) => setNewProjectName(event.target.value)}
                                                placeholder="新建 HTML 项目名称"
                                                disabled={creating}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        void handleCreateProject();
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="shrink-0"
                                                onClick={() => void handleCreateProject()}
                                                disabled={creating || !newProjectName.trim()}
                                            >
                                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                                新建
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                                        <div className="shrink-0 text-sm font-medium">HTML 项目</div>
                                        {projects.length ? (
                                            <RadioGroup value={selectedProjectId} onValueChange={setSelectedProjectId} className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
                                                {projects.map((project) => (
                                                    <label
                                                        key={project.pid}
                                                        className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/40"
                                                    >
                                                        <RadioGroupItem value={String(project.pid)} />
                                                        <div className="flex min-w-0 flex-1 items-baseline gap-2">
                                                            <div className="min-w-0 truncate text-sm font-medium">{project.name}</div>
                                                            <div className="shrink-0 text-xs text-muted-foreground">
                                                                {formatBytes(project.htmlUsedSpace)}
                                                                {projectUpdatedAt(project) ? ` · ${projectUpdatedAt(project)}` : ''}
                                                                {Number(project.reviewReportCount || 0) > 0 ? (
                                                                    <> · 评审报告 {project.reviewReportCount} 份</>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                        <TooltipProvider delayDuration={150}>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                {Number(project.reviewReportCount || 0) > 0 ? (
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon-xs"
                                                                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                                                                aria-label="清空评审报告"
                                                                                disabled={clearingProjectId === String(project.pid)}
                                                                                onClick={(event) => { void handleClearReviewReports(project, event); }}
                                                                            >
                                                                                {clearingProjectId === String(project.pid)
                                                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                                    : <Trash2 className="h-4 w-4" />}
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>清空评审报告</TooltipContent>
                                                                    </Tooltip>
                                                                ) : null}
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon-xs"
                                                                            className="shrink-0 text-muted-foreground hover:text-foreground"
                                                                            aria-label="打开 Axhub 项目"
                                                                            onClick={(event) => {
                                                                                event.preventDefault();
                                                                                event.stopPropagation();
                                                                                const previewUrl = isEnterprise
                                                                                    ? buildEnterpriseProjectPreviewUrl(status?.serverUrl || status?.me?.serverUrl, project)
                                                                                    : buildProjectPreviewUrl(status?.onlineBaseUrl, project);
                                                                                window.open(previewUrl, '_blank', 'noopener,noreferrer');
                                                                            }}
                                                                        >
                                                                            <ExternalLink className="h-4 w-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>打开 Axhub 项目</TooltipContent>
                                                                </Tooltip>
                                                            </div>
                                                        </TooltipProvider>
                                                    </label>
                                                ))}
                                            </RadioGroup>
                                        ) : (
                                            <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                                                暂无 HTML 项目
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t px-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void handlePublish()}
                        disabled={!connected || !isPlus || !selectedProject || publishing}
                    >
                        {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        发布
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
