import { useEffect, useState } from 'react';
import { Check, Copy, Download, Eye, FilePlus, GitBranch, GitCommit, GitFork, History, Loader2, RefreshCw, RotateCcw, Settings2, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiService, type GitWorkspaceStatusResponse } from '../services/api';
import { generateGitCommitMessage } from '../domains/ai-generation/gitCommitMessageGeneration';
import { requireProjectScope, withProjectScope } from '../services/projectScope';
import { ItemData } from '../types';
import { getGitVersionUnavailableState, type GitVersionUnavailableState } from '../utils/gitVersionErrors';
import { useAppDialog } from './dialogs/AppDialogProvider';
import { probeGitVersionEntry } from './gitVersionPreview';
import {
    VersionCommitRow,
} from './VersionCards';
import { INSTALL_GIT_REPO_SKILL_PROMPT } from './gitRepoSkillPrompt';

export interface VersionManagerProps {
    projectId: string;
    visible: boolean;
    onCancel: () => void;
    item: ItemData | null;
    onOpenRemoteRepositorySettings?: () => void;
    preview?: VersionManagerPreviewState;
    previewActions?: VersionManagerPreviewActions;
}

export interface VersionManagerPreviewCommit {
    hash: string;
    message: string;
    author: string;
    timestamp: number;
    hasPrototype?: boolean;
    prototypeUrl?: string | null;
    previewReady?: boolean;
}

type CommitItem = VersionManagerPreviewCommit;

type VersionScope = 'prototype' | 'project';

export type PrototypeVersionAction = 'init' | 'load' | 'commit' | 'fetch' | 'sync-down' | 'push';

export interface VersionManagerPreviewActions {
    onInitializeRepository?: () => void;
    onFetchRemote?: () => void;
    onSyncDown?: () => void;
    onPush?: () => void;
}

export interface VersionManagerPreviewState {
    loadingHistory?: boolean;
    unavailableState?: GitVersionUnavailableState | null;
    workspaceStatus?: GitWorkspaceStatusResponse | null;
    hasUncommitted?: boolean;
    commits?: VersionManagerPreviewCommit[];
    commitMessage?: string;
    busyAction?: PrototypeVersionAction | null;
}

function getPrototypeLocalStatusText(options: {
    loading: boolean;
    unavailableState: GitVersionUnavailableState | null;
    hasUncommitted: boolean;
    changedFilesCount?: number;
}) {
    if (options.loading) return '正在加载仓库…';
    if (options.unavailableState) return options.unavailableState.title;
    return options.hasUncommitted
        ? `${Math.max(1, options.changedFilesCount || 0)} 项更改`
        : '工作区干净';
}

function normalizeGitPath(rawPath: string) {
    let normalizedPath = String(rawPath || '').trim().replace(/\\/g, '/');

    const srcMarkerIndex = normalizedPath.lastIndexOf('/src/');
    if (srcMarkerIndex >= 0) {
        normalizedPath = normalizedPath.substring(srcMarkerIndex + '/src/'.length);
    } else if (normalizedPath.startsWith('src/')) {
        normalizedPath = normalizedPath.substring('src/'.length);
    }

    return normalizedPath
        .replace(/^\/+/, '')
        .replace(/\/index\.(t|j)sx?$/i, '')
        .replace(/\/+$/, '');
}

function getGitTargetPath(targetItem: ItemData | null) {
    if (!targetItem) return '';
    const rawPath = String(
        targetItem.filePath
        || targetItem.absoluteFilePath
        || targetItem.projectDocumentPath
        || '',
    ).trim();
    if (rawPath) return normalizeGitPath(rawPath);

    const rawPrototypeId = String(targetItem.resourceId || targetItem.name || '').trim().replace(/\\/g, '/');
    if (!rawPrototypeId) return '';
    const fallbackPath = rawPrototypeId.startsWith('prototypes/') || rawPrototypeId.startsWith('src/prototypes/')
        ? rawPrototypeId
        : `src/prototypes/${rawPrototypeId}/index.tsx`;
    return normalizeGitPath(fallbackPath);
}

function resolvePrototypeVersionPreviewUrl(targetItem: ItemData | null, prototypeUrl: string): string {
    const value = String(prototypeUrl || '').trim();
    if (!value) return '';
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch {
        // Relative preview URLs are resolved below.
    }

    const runtimeUrl = String(targetItem?.clientUrl || targetItem?.previewUrl || '').trim();
    if (runtimeUrl) {
        try {
            const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
            const runtimeOrigin = new URL(runtimeUrl, fallbackOrigin).origin;
            return new URL(value, runtimeOrigin).toString();
        } catch {
            // Keep the API-provided URL if the stored runtime URL is not parseable.
        }
    }
    return value;
}

export function VersionManagerContent({
    projectId,
    visible,
    onCancel,
    item,
    onOpenRemoteRepositorySettings,
    preview,
    previewActions,
}: VersionManagerProps) {
    const appDialog = useAppDialog();
    const [commits, setCommits] = useState<CommitItem[]>(() => preview?.commits || []);
    const [hasUncommitted, setHasUncommitted] = useState(() => Boolean(preview?.hasUncommitted));
    const [commitMessage, setCommitMessage] = useState(() => preview?.commitMessage || '');
    const [generatingCommitMessage, setGeneratingCommitMessage] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(() => Boolean(preview?.loadingHistory));
    const [loadedHistoryPath, setLoadedHistoryPath] = useState(() => preview ? getGitTargetPath(item) : '');
    const [gitUnavailableState, setGitUnavailableState] = useState<GitVersionUnavailableState | null>(() => preview?.unavailableState || null);
    const [workspaceStatus, setWorkspaceStatus] = useState<GitWorkspaceStatusResponse | null>(() => preview?.workspaceStatus || null);
    const [busyAction, setBusyAction] = useState<PrototypeVersionAction | null>(() => preview?.busyAction || null);
    const [viewingPrototypeId, setViewingPrototypeId] = useState<string | null>(null);
    const [scope, setScope] = useState<VersionScope>('prototype');
    const [selectedBranch, setSelectedBranch] = useState(() => preview?.workspaceStatus?.branchView?.branch || preview?.workspaceStatus?.currentBranch || '');
    const projectScope = requireProjectScope(projectId);
    const isProjectScope = scope === 'project';
    const targetPath = isProjectScope ? '' : getGitTargetPath(item);
    const scopeTargetKey = isProjectScope ? '__project__' : targetPath;
    const isBusy = busyAction !== null;
    const isRepositoryReady = Boolean(workspaceStatus?.isGitRepo && workspaceStatus?.hasCommits);
    const hasConfiguredRemote = Boolean(workspaceStatus?.remote?.url);
    const hasLoadedLocalHistory = loadedHistoryPath === scopeTargetKey;
    const hasLoadedWorkspaceStatus = Boolean(workspaceStatus);
    const branchOptions = Array.from(new Set([
        workspaceStatus?.currentBranch,
        ...(workspaceStatus?.branchOverview?.localBranches || []),
    ].filter((branch): branch is string => Boolean(branch && branch.trim()))));

    const loadVersionHistory = async (branchOverride = selectedBranch) => {
        if (isProjectScope) {
            setLoadedHistoryPath(scopeTargetKey);
            return;
        }
        if (!targetPath) {
            setLoadedHistoryPath(scopeTargetKey);
            return;
        }
        if (!item) return;
        setLoadingHistory(true);
        setGitUnavailableState(null);
        setLoadedHistoryPath('');
        try {
            if (!targetPath) {
                toast.error('无法获取文件路径');
                return;
            }
            const historyQuery = new URLSearchParams({ path: targetPath });
            if (branchOverride) historyQuery.set('branch', branchOverride);
            const response = await fetch(withProjectScope(`/api/git/history?${historyQuery.toString()}`, projectScope));
            const data = await response.json();

            if (response.ok) {
                setGitUnavailableState(getGitVersionUnavailableState(data));
                const historyCommits = Array.isArray(data.commits)
                    ? data.commits.filter((commit: CommitItem) => commit.hasPrototype !== false)
                    : [];
                setCommits(await Promise.all(historyCommits.map(async (commit: CommitItem) => ({
                    ...commit,
                    previewReady: Boolean(commit.prototypeUrl) && await probeGitVersionEntry({
                        commitHash: commit.hash,
                        targetPath,
                        projectId: projectScope.projectId,
                    }),
                }))));
                setHasUncommitted(Boolean(data.hasUncommitted));
            } else {
                const unavailableState = getGitVersionUnavailableState(data);
                if (unavailableState) {
                    setGitUnavailableState(unavailableState);
                    setCommits([]);
                    setHasUncommitted(false);
                } else {
                    toast.error(data.error || '加载版本历史失败');
                }
            }
        } catch {
            toast.error('加载版本历史失败');
        } finally {
            setLoadedHistoryPath(scopeTargetKey);
            setLoadingHistory(false);
        }
    };

    const loadWorkspaceStatus = async (branchOverride = selectedBranch) => {
        if (preview || (!isProjectScope && !targetPath)) return;
        setBusyAction('load');
        setWorkspaceStatus(null);
        try {
            const nextStatus = await apiService.getGitWorkspaceStatus({
                path: targetPath || undefined,
                branch: branchOverride || undefined,
            }, projectScope);
            setWorkspaceStatus(nextStatus);
            const nextViewedBranch = nextStatus.branchView?.branch || nextStatus.currentBranch || '';
            setSelectedBranch(nextViewedBranch);
            if (isProjectScope) {
                const nextCommits = nextStatus.branchView?.recentCommits || nextStatus.recentCommits || [];
                setCommits(nextCommits.map((commit) => ({ ...commit, hasPrototype: false })));
                setHasUncommitted(Boolean(nextStatus.hasChanges));
                setLoadedHistoryPath(scopeTargetKey);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '加载版本状态失败');
        } finally {
            setBusyAction(null);
        }
    };

    const reloadAll = async (branchOverride = selectedBranch) => {
        if (preview) return;
        if (!isProjectScope && !targetPath) {
            setWorkspaceStatus(null);
            setCommits([]);
            setHasUncommitted(false);
            setLoadedHistoryPath(scopeTargetKey);
            return;
        }
        await Promise.all([
            loadVersionHistory(branchOverride),
            loadWorkspaceStatus(branchOverride),
        ]);
    };

    const handleInitializeRepository = async () => {
        if (preview) {
            previewActions?.onInitializeRepository?.();
            return;
        }
        setBusyAction('init');
        try {
            await apiService.initGitWorkspace(projectScope);
            toast.success('已开启本地版本');
            await reloadAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '初始化仓库失败');
        } finally {
            setBusyAction(null);
        }
    };

    useEffect(() => {
        if (visible && (isProjectScope || item) && !preview) {
            void reloadAll();
        }
    }, [visible, item?.name, item?.filePath, item?.absoluteFilePath, projectId, preview, isProjectScope]);

    const openRemoteRepositorySettings = () => {
        if (!isRepositoryReady) {
            toast.warning('请先开启本地版本，再配置远端仓库');
            return;
        }
        onCancel();
        onOpenRemoteRepositorySettings?.();
    };

    const handleScopeChange = (nextScope: VersionScope) => {
        if (nextScope === scope) return;
        setScope(nextScope);
        setGitUnavailableState(null);
        setLoadedHistoryPath(preview ? (nextScope === 'project' ? '__project__' : getGitTargetPath(item)) : '');
        if (!preview) {
            setWorkspaceStatus(null);
            setCommits([]);
            setHasUncommitted(false);
        }
    };

    const handleBranchChange = (nextBranch: string) => {
        const branch = nextBranch.trim();
        if (!branch || branch === selectedBranch) return;
        setSelectedBranch(branch);
        if (preview) return;
        setWorkspaceStatus(null);
        setCommits([]);
        setLoadedHistoryPath('');
        void reloadAll(branch);
    };

    const handleRestore = async (commitHash: string) => {
        if (preview || isProjectScope) return;
        if (!item) return;
        const confirmed = await appDialog.confirm({
            title: '恢复此版本？',
            description: '当前未提交的更改将会丢失，请确认是否继续。',
            confirmText: '确认恢复',
            cancelText: '取消',
            tone: 'destructive',
            dismissible: false,
        });
        if (!confirmed) return;

        try {
            if (!targetPath) {
                toast.error('无法获取文件路径');
                return;
            }
            const response = await fetch(withProjectScope('/api/git/restore', projectScope), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath, commitHash }),
            });

            const data = await response.json();

            if (response.ok) {
                toast.success('版本恢复成功');
                void reloadAll();
            } else {
                toast.error(data.error || '版本恢复失败');
            }
        } catch {
            toast.error('版本恢复失败');
        }
    };

    const handleViewPrototype = async (commit: CommitItem) => {
        if (isProjectScope) return;
        if (commit.previewReady && commit.prototypeUrl) {
            window.open(resolvePrototypeVersionPreviewUrl(item, commit.prototypeUrl), '_blank', 'noopener,noreferrer');
            return;
        }

        const commitHash = commit.hash;
        setViewingPrototypeId(commitHash);
        try {
            if (!targetPath) {
                toast.error('无法获取文件路径');
                return;
            }
            toast.info('正在准备历史版本预览，完成后请再次点击预览');
            const response = await fetch(withProjectScope('/api/git/build-version', projectScope), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath, commitHash }),
            });

            const data = await response.json();

            if (response.ok && data.hasPrototype && data.prototypeUrl) {
                setCommits((currentCommits) => currentCommits.map((currentCommit) => (
                    currentCommit.hash === commitHash
                        ? {
                            ...currentCommit,
                            prototypeUrl: data.prototypeUrl,
                            previewReady: true,
                        }
                        : currentCommit
                )));
                toast.success('历史版本已准备好，请再次点击预览');
            } else if (response.ok && data.hasPrototype === false) {
                toast.warning('这个历史版本里还没有当前原型，无法预览。');
            } else {
                toast.error(data.error || '无法访问原型');
            }
        } catch {
            toast.error('加载原型失败');
        } finally {
            setViewingPrototypeId(null);
        }
    };

    const handleSubmitCommit = async () => {
        if (!commitMessage.trim()) {
            toast.warning('请输入提交信息');
            return;
        }
        if (!canWriteViewedBranch) {
            toast.warning('当前正在查看其他分支，切回当前分支后才能保存版本');
            return;
        }
        if (!isProjectScope && !targetPath) {
            toast.error('无法获取文件路径');
            return;
        }
        if (preview) return;

        setBusyAction('commit');
        try {
            await apiService.commitGitWorkspace(commitMessage.trim(), projectScope, { path: targetPath });
            toast.success('提交成功');
            setCommitMessage('');
            await reloadAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '提交失败');
        } finally {
            setBusyAction(null);
        }
    };

    const handleGenerateCommitMessage = async () => {
        setGeneratingCommitMessage(true);
        try {
            const generatedMessage = await generateGitCommitMessage({
                scope: isProjectScope ? 'workspace' : 'prototype',
                projectId,
                status: workspaceStatus,
                targetName: String(item?.displayName || item?.title || item?.name || '').trim(),
                targetPath,
                currentMessage: commitMessage,
            });
            setCommitMessage(generatedMessage);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'AI 生成版本记录失败');
        } finally {
            setGeneratingCommitMessage(false);
        }
    };

    const handleFetchRemote = async () => {
        if (preview) {
            previewActions?.onFetchRemote?.();
            return;
        }
        setBusyAction('fetch');
            try {
            await apiService.fetchGitWorkspace(projectScope);
            await loadWorkspaceStatus();
            toast.success('已刷新远端');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '读取在线仓库失败');
        } finally {
            setBusyAction(null);
        }
    };

    const handleSyncDown = async () => {
        if (preview) {
            previewActions?.onSyncDown?.();
            return;
        }
        if (!canWriteViewedBranch) return;
        setBusyAction('sync-down');
        try {
            await apiService.syncDownGitWorkspace(projectScope);
            await reloadAll();
            toast.success('已同步在线仓库');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '同步下来失败');
        } finally {
            setBusyAction(null);
        }
    };

    const handlePush = async () => {
        if (preview) {
            previewActions?.onPush?.();
            return;
        }
        if (!canWriteViewedBranch) return;
        setBusyAction('push');
        try {
            await apiService.pushGitWorkspace(projectScope);
            await reloadAll();
            toast.success('已同步到在线仓库');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '同步到在线失败');
        } finally {
            setBusyAction(null);
        }
    };

    const localStatusText = getPrototypeLocalStatusText({
        loading: loadingHistory,
        unavailableState: gitUnavailableState,
        hasUncommitted,
        changedFilesCount: workspaceStatus?.changedFilesCount,
    });

    const currentBranch = workspaceStatus?.branchView?.branch || selectedBranch || workspaceStatus?.currentBranch || workspaceStatus?.remoteComparison?.branch || 'main';
    const canWriteViewedBranch = !selectedBranch || !workspaceStatus?.currentBranch || selectedBranch === workspaceStatus.currentBranch;
    const remoteComparison = workspaceStatus?.remoteComparison;
    const incomingCount = Number(remoteComparison?.behindCount || 0);
    const outgoingCount = Number(remoteComparison?.aheadCount || 0);
    const hasIncoming = incomingCount > 0 || Number(remoteComparison?.incoming.totalFiles || 0) > 0;
    const hasOutgoing = outgoingCount > 0 || Number(remoteComparison?.outgoing.totalFiles || 0) > 0;
    const needsWorkspaceData = isProjectScope ? Boolean(projectId) : Boolean(item && targetPath);
    const panelLoading = loadingHistory || busyAction === 'load' || (!preview && needsWorkspaceData && (!hasLoadedLocalHistory || !hasLoadedWorkspaceStatus));
    const showEmptyState = !panelLoading && (!isRepositoryReady || Boolean(gitUnavailableState));
    const showReadyState = !panelLoading && isRepositoryReady && !gitUnavailableState;
    const gitUnavailable = gitUnavailableState?.title === '当前环境未安装 Git';

    return (
        <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden bg-popover">
            <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-2.5 py-1.5">
                <Select value={scope} onValueChange={(value) => handleScopeChange(value as VersionScope)}>
                    <SelectTrigger
                        className="h-7 w-auto min-w-0 shrink-0 justify-start gap-1 border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus:ring-0"
                        aria-label="切换仓库范围"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" className="w-36">
                        <SelectItem value="prototype">当前原型</SelectItem>
                        <SelectItem value="project">当前项目</SelectItem>
                    </SelectContent>
                </Select>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {isRepositoryReady && hasConfiguredRemote ? (
                        <DropdownMenu>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" aria-label="远端仓库">
                                                <GitFork className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">远端仓库</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">远端仓库</DropdownMenuLabel>
                                <DropdownMenuItem onClick={openRemoteRepositorySettings} className="gap-2">
                                    <Settings2 className="h-3.5 w-3.5" /> 远端设置
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void copyText(INSTALL_GIT_REPO_SKILL_PROMPT, '已复制管理技能提示词')} className="gap-2">
                                    <Copy className="h-3.5 w-3.5" /> 管理技能
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => void handleFetchRemote()} disabled={isBusy} className="gap-2">
                                    <RefreshCw className="h-3.5 w-3.5" /> 刷新远端
                                </DropdownMenuItem>
                                {showReadyState ? (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => void handlePush()}
                                            disabled={!hasConfiguredRemote || !hasOutgoing || isBusy || !canWriteViewedBranch}
                                            className="gap-2"
                                        >
                                            {busyAction === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} 推送
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => void handleSyncDown()}
                                            disabled={!hasConfiguredRemote || !hasIncoming || isBusy || !canWriteViewedBranch}
                                            className="gap-2"
                                        >
                                            {busyAction === 'sync-down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} 拉取
                                        </DropdownMenuItem>
                                    </>
                                ) : null}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-7 w-7 shrink-0"
                                        onClick={openRemoteRepositorySettings}
                                        aria-label="远端仓库"
                                    >
                                        <GitFork className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">远端仓库</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" onClick={onCancel} aria-label="关闭">
                                    <X className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">关闭</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </header>

            {showReadyState ? (
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5 text-[11px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <Select value={selectedBranch || currentBranch} onValueChange={handleBranchChange} disabled={isBusy || branchOptions.length === 0}>
                            <SelectTrigger className="h-6 min-w-0 max-w-[240px] border-0 bg-transparent px-0 text-[11px] text-muted-foreground shadow-none focus:ring-0">
                                <SelectValue placeholder={currentBranch} />
                            </SelectTrigger>
                            <SelectContent align="start" className="w-64">
                                {branchOptions.map((branch) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                        <span>{localStatusText}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => void reloadAll()} disabled={isBusy || loadingHistory} aria-label="刷新">
                                        {busyAction === 'load' || loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">刷新版本状态</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {panelLoading ? (
                    <div className="flex h-full min-h-[300px] items-center justify-center text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载仓库…
                    </div>
                ) : null}

                {!panelLoading && !item ? (
                    <div className="flex min-h-[300px] items-center justify-center px-5 text-center text-xs text-muted-foreground">Git · (尚未选择文件)</div>
                ) : null}

                {showEmptyState ? (
                    <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-5 py-6 text-center">
                        <div className="mb-5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-muted/60 to-muted/20 ring-1 ring-inset ring-border/60">
                            <History className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h3 className="mt-0 text-[13px] font-medium" data-openpencil-copy="git.empty.heading">{isProjectScope ? '这个项目还没有版本历史' : '这份文件还没有版本历史'}</h3>
                        <div className="mt-6 flex w-full justify-center">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 gap-1.5 rounded-lg px-4"
                                onClick={() => void handleInitializeRepository()}
                                disabled={gitUnavailable || isBusy}
                                data-openpencil-copy="git.empty.initButton"
                            >
                                <FilePlus className="h-3.5 w-3.5" />
                                开启本地版本
                            </Button>
                        </div>
                        {gitUnavailableState?.description && gitUnavailable ? (
                            <p className="mt-3 max-w-[320px] text-[11px] leading-4 text-destructive">{gitUnavailableState.description}</p>
                        ) : null}
                    </div>
                ) : null}

                {showReadyState ? (
                    <div className="px-2.5 pb-4">
                        <div className="mt-3 rounded-lg border border-border/70 bg-card p-3">
                            <Textarea
                                placeholder="描述这次改动…"
                                value={commitMessage}
                                onChange={(event) => setCommitMessage(event.target.value)}
                                rows={2}
                                className="min-h-[54px] resize-none border-0 bg-transparent p-0 text-xs leading-relaxed shadow-none focus-visible:ring-0"
                                data-openpencil-copy="git.commit.placeholder"
                                onKeyDown={(event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                        event.preventDefault();
                                        void handleSubmitCommit();
                                    }
                                }}
                            />
                            <div className="flex items-center justify-end gap-1.5 pt-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                onClick={() => void handleGenerateCommitMessage()}
                                                disabled={isBusy || generatingCommitMessage}
                                                aria-label="AI生成版本记录"
                                            >
                                                {generatingCommitMessage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">AI生成版本记录</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <Button
                                    variant="brand"
                                    size="sm"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => void handleSubmitCommit()}
                                    disabled={isBusy || !commitMessage.trim() || !canWriteViewedBranch}
                                >
                                    {busyAction === 'commit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
                                    {busyAction === 'commit' ? '保存中…' : '保存为版本'}
                                </Button>
                            </div>
                        </div>

                        <div className="mt-4 border-t border-border/60">
                            {commits.length ? (
                                <div className="divide-y divide-border/60">
                                    {commits.map((commit, index) => {
                                        const isCurrent = index === 0 && !hasUncommitted;
                                        const canPreview = !isProjectScope && commit.hasPrototype !== false;
                                        return (
                                            <VersionCommitRow
                                                key={commit.hash}
                                                commit={commit}
                                                className="min-h-14 py-2.5"
                                                badge={isCurrent ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                                        <Check className="h-3 w-3" /> 当前版本
                                                    </span>
                                                ) : null}
                                                actions={isProjectScope ? null : (
                                                    <TooltipProvider>
                                                        <div className="flex items-center gap-0.5">
                                                            {!isCurrent ? (
                                                                <>
                                                                    {canPreview ? (
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon-xs"
                                                                                    onClick={() => void handleViewPrototype(commit)}
                                                                                    disabled={viewingPrototypeId === commit.hash}
                                                                                    aria-label="预览历史版本"
                                                                                >
                                                                                    {viewingPrototypeId === commit.hash ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent side="top">预览历史版本</TooltipContent>
                                                                        </Tooltip>
                                                                    ) : null}
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button variant="ghost" size="icon-xs" onClick={() => void handleRestore(commit.hash)} aria-label="恢复">
                                                                                <RotateCcw className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top" data-openpencil-copy="git.history.restoreButton">恢复</TooltipContent>
                                                                    </Tooltip>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </TooltipProvider>
                                                )}
                                            />
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="px-2 py-6 text-center text-xs text-muted-foreground" data-openpencil-copy="git.history.empty">暂无历史</div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default function VersionManager({ visible, onCancel, ...props }: VersionManagerProps) {
    return (
        <Sheet open={visible} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
            <SheetContent
                side="left"
                className="flex w-full max-w-[620px] flex-col p-0 text-sm sm:max-w-[620px] [&>[data-sheet-close]]:hidden"
            >
                <SheetTitle className="sr-only">版本和协作</SheetTitle>
                <VersionManagerContent {...props} visible={visible} onCancel={onCancel} />
            </SheetContent>
        </Sheet>
    );
}
