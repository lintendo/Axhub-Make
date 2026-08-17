import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Eye, GitCommit, Loader2, RefreshCw, RotateCcw, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiService, type GitWorkspaceStatusResponse } from '../services/api';
import { generateGitCommitMessage } from '../domains/ai-generation/gitCommitMessageGeneration';
import { requireProjectScope, withProjectScope } from '../services/projectScope';
import { ItemData } from '../types';
import { getGitVersionUnavailableState, type GitVersionUnavailableState } from '../utils/gitVersionErrors';
import { useAppDialog } from './dialogs/AppDialogProvider';
import { probeGitVersionEntry } from './gitVersionPreview';
import {
    VersionChangeCard,
    VersionCommitRow,
    VersionInfoRow,
    VersionInfoValue,
    VersionSection,
    VersionSyncTabs,
    getVersionChangeTitle,
    type VersionCardCommit,
} from './VersionCards';

interface VersionManagerProps {
    projectId: string;
    visible: boolean;
    onCancel: () => void;
    item: ItemData | null;
    onOpenWorkspaceVersionCollaboration?: () => void;
}

interface CommitItem {
    hash: string;
    message: string;
    author: string;
    timestamp: number;
    hasPrototype?: boolean;
    prototypeUrl?: string | null;
    previewReady?: boolean;
}

type PrototypeVersionAction = 'load' | 'commit' | 'fetch' | 'sync-down' | 'push';

const SectionCard = VersionSection;
const InfoRow = VersionInfoRow;
const InfoValue = VersionInfoValue;

function getPrototypeLocalStatusText(options: {
    loading: boolean;
    unavailableState: GitVersionUnavailableState | null;
    hasUncommitted: boolean;
}) {
    if (options.loading) return '读取中';
    if (options.unavailableState) return options.unavailableState.title;
    return options.hasUncommitted ? '当前原型有未提交变更' : '当前原型暂无未提交变更';
}

function getPrototypeOnlineStatusText(status: GitWorkspaceStatusResponse | null): string {
    if (!status) return '读取中';
    if (!status.gitAvailable) return '本机未检测到版本工具';
    if (!status.isGitRepo || !status.hasCommits) return '请先初始化本地仓库';
    if (!status.remote?.url) return '请先配置在线仓库';
    return '已连接在线仓库';
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
    const rawPath = String(targetItem.filePath || targetItem.absoluteFilePath || '').trim();
    return rawPath ? normalizeGitPath(rawPath) : '';
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

export default function VersionManager({
    projectId,
    visible,
    onCancel,
    item,
    onOpenWorkspaceVersionCollaboration,
}: VersionManagerProps) {
    const appDialog = useAppDialog();
    const [commits, setCommits] = useState<CommitItem[]>([]);
    const [hasUncommitted, setHasUncommitted] = useState(false);
    const [commitMessage, setCommitMessage] = useState('');
    const [generatingCommitMessage, setGeneratingCommitMessage] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadedHistoryPath, setLoadedHistoryPath] = useState('');
    const [viewingPrototypeId, setViewingPrototypeId] = useState<string | null>(null);
    const [gitUnavailableState, setGitUnavailableState] = useState<GitVersionUnavailableState | null>(null);
    const [workspaceStatus, setWorkspaceStatus] = useState<GitWorkspaceStatusResponse | null>(null);
    const [busyAction, setBusyAction] = useState<PrototypeVersionAction | null>(null);
    const projectScope = requireProjectScope(projectId);
    const targetPath = getGitTargetPath(item);
    const isBusy = busyAction !== null;
    const isRepositoryReady = Boolean(workspaceStatus?.isGitRepo && workspaceStatus?.hasCommits);
    const hasConfiguredRemote = Boolean(workspaceStatus?.remote?.url);
    const incomingTotal = workspaceStatus?.remoteComparison?.incoming.totalFiles || 0;
    const outgoingTotal = workspaceStatus?.remoteComparison?.outgoing.totalFiles || 0;
    const incomingAllCommits: VersionCardCommit[] = workspaceStatus?.remoteComparison?.incomingCommits || [];
    const incomingRecentCommits = incomingAllCommits.slice(0, 2);
    const outgoingAllCommits: VersionCardCommit[] = workspaceStatus?.remoteComparison?.outgoingCommits || [];
    const outgoingRecentCommits = outgoingAllCommits.slice(0, 2);
    const behindCount = workspaceStatus?.remoteComparison?.behindCount || incomingAllCommits.length;
    const aheadCount = workspaceStatus?.remoteComparison?.aheadCount || outgoingAllCommits.length;
    const hasLoadedLocalHistory = loadedHistoryPath === targetPath;
    const hasLoadedWorkspaceStatus = Boolean(workspaceStatus);
    const showLocalSetupHint = hasLoadedLocalHistory && Boolean(gitUnavailableState);
    const showLocalStatus = hasLoadedLocalHistory && !showLocalSetupHint && Boolean(item && targetPath);
    const showLocalCommit = showLocalStatus && hasUncommitted;
    const showLocalHistory = showLocalStatus && commits.length > 0;
    const showOnlineSetupHint = hasLoadedWorkspaceStatus && (!isRepositoryReady || !hasConfiguredRemote);
    const showOnlineContent = hasLoadedWorkspaceStatus && !showOnlineSetupHint;
    const showOnlineIncoming = showOnlineContent && incomingTotal > 0;
    const showOnlineOutgoing = showOnlineContent && outgoingTotal > 0;
    const onlineSetupDescription = !isRepositoryReady
        ? '请先在全局版本和协作中初始化本地仓库，然后再同步当前原型。'
        : '请先在全局版本和协作中配置在线仓库。';

    const loadVersionHistory = async () => {
        if (!item) return;
        setLoadingHistory(true);
        setGitUnavailableState(null);
        setLoadedHistoryPath('');
        try {
            if (!targetPath) {
                toast.error('无法获取文件路径');
                return;
            }
            const response = await fetch(withProjectScope(`/api/git/history?path=${encodeURIComponent(targetPath)}`, projectScope));
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
            setLoadedHistoryPath(targetPath);
            setLoadingHistory(false);
        }
    };

    const loadWorkspaceStatus = async () => {
        if (!targetPath) return;
        setBusyAction('load');
        setWorkspaceStatus(null);
        try {
            setWorkspaceStatus(await apiService.getGitWorkspaceStatus({ path: targetPath }, projectScope));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '加载版本状态失败');
        } finally {
            setBusyAction(null);
        }
    };

    const reloadAll = async () => {
        await Promise.all([
            loadVersionHistory(),
            loadWorkspaceStatus(),
        ]);
    };

    useEffect(() => {
        if (visible && item) {
            void reloadAll();
        }
    }, [visible, item?.name, item?.filePath, item?.absoluteFilePath, projectId]);

    const openWorkspaceVersionCollaboration = () => {
        onCancel();
        onOpenWorkspaceVersionCollaboration?.();
    };

    const handleRestore = async (commitHash: string) => {
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

    const handleSubmitCommit = async () => {
        if (!commitMessage.trim()) {
            toast.warning('请输入提交信息');
            return;
        }
        if (!targetPath) {
            toast.error('无法获取文件路径');
            return;
        }

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
                projectId,
                scope: 'prototype',
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

    const handleViewPrototype = async (commit: CommitItem) => {
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

    const handleFetchRemote = async () => {
        setBusyAction('fetch');
        try {
            await apiService.fetchGitWorkspace(projectScope);
            await loadWorkspaceStatus();
            toast.success('已读取在线仓库');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '读取在线仓库失败');
        } finally {
            setBusyAction(null);
        }
    };

    const handleSyncDown = async () => {
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

    const renderSetupHint = (description: string) => (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
            <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{description}</span>
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 bg-background"
                onClick={openWorkspaceVersionCollaboration}
            >
                打开全局版本和协作
            </Button>
        </div>
    );

    const localStatusText = getPrototypeLocalStatusText({
        loading: loadingHistory,
        unavailableState: gitUnavailableState,
        hasUncommitted,
    });

    return (
        <Sheet open={visible} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
            <SheetContent
                side="left"
                className="flex w-full max-w-[620px] flex-col p-0 text-sm sm:max-w-[620px] [&>[data-sheet-close]]:hidden"
            >
                <Tabs defaultValue="local" className="flex h-full flex-col">
                    <SheetHeader className="border-b px-5 py-3.5">
                        <SheetTitle className="sr-only">版本和协作 - {item?.displayName || '-'}</SheetTitle>
                        <div className="flex items-center justify-between gap-3">
                            <TabsList className="grid h-8 w-full max-w-[260px] grid-cols-2 rounded-lg border border-border/70 bg-muted/50 p-0.5">
                                <TabsTrigger value="local" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    本地仓库
                                </TabsTrigger>
                                <TabsTrigger value="online" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    在线仓库
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 shrink-0 rounded-md"
                                onClick={onCancel}
                                aria-label="关闭"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </SheetHeader>

                    <TabsContent value="local" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <div className="space-y-3.5">
                            {showLocalSetupHint ? renderSetupHint(gitUnavailableState?.description || '') : null}

                            {showLocalStatus ? (
                                <SectionCard
                                    title="信息"
                                    actions={(
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 gap-1.5 px-2"
                                            onClick={() => void reloadAll()}
                                            disabled={isBusy || loadingHistory}
                                        >
                                            {busyAction === 'load' || loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                            刷新
                                        </Button>
                                    )}
                                >
                                    <InfoRow label="状态">
                                        <InfoValue className={hasUncommitted ? 'border-primary/20 bg-primary/5 text-primary' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300'}>
                                            {localStatusText}
                                        </InfoValue>
                                    </InfoRow>
                                </SectionCard>
                            ) : null}

                            {showLocalCommit ? (
                                <SectionCard title="提交版本">
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <Textarea
                                                placeholder="手动输入版本说明..."
                                                value={commitMessage}
                                                onChange={(event) => setCommitMessage(event.target.value)}
                                                rows={4}
                                                className="min-h-[96px] resize-none pr-10"
                                                onKeyDown={(event) => {
                                                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                                        event.preventDefault();
                                                        void handleSubmitCommit();
                                                    }
                                                }}
                                            />
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            className="absolute right-1.5 top-1.5 h-7 w-7 text-muted-foreground hover:text-foreground"
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
                                        </div>
                                        <div className="flex justify-end">
                                            <Button
                                                variant="brand"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={() => void handleSubmitCommit()}
                                                disabled={isBusy || !commitMessage.trim()}
                                            >
                                                {busyAction === 'commit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCommit className="h-4 w-4" />}
                                                {busyAction === 'commit' ? '提交中...' : '提交版本'}
                                            </Button>
                                        </div>
                                    </div>
                                </SectionCard>
                            ) : null}

                            {showLocalHistory ? (
                                <SectionCard title="历史版本" contentClassName="px-3.5 py-0">
                                    <div className="divide-y divide-border/50">
                                        {commits.map((commit, index) => {
                                            const isCurrent = index === 0 && !hasUncommitted;
                                            const canPreview = commit.hasPrototype !== false;
                                            return (
                                                <VersionCommitRow
                                                    key={commit.hash}
                                                    commit={commit}
                                                    badge={isCurrent ? (
                                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
                                                            当前版本
                                                        </span>
                                                    ) : null}
                                                    actions={!isCurrent ? (
                                                        <TooltipProvider>
                                                            <div className="flex items-center gap-1">
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
                                                                                {viewingPrototypeId === commit.hash ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top">预览历史版本</TooltipContent>
                                                                    </Tooltip>
                                                                ) : null}
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-xs"
                                                                            onClick={() => void handleRestore(commit.hash)}
                                                                            aria-label="恢复此版本"
                                                                        >
                                                                            <RotateCcw className="h-4 w-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top">恢复此版本</TooltipContent>
                                                                </Tooltip>
                                                            </div>
                                                        </TooltipProvider>
                                                    ) : undefined}
                                                />
                                            );
                                        })}
                                    </div>
                                </SectionCard>
                            ) : null}
                        </div>
                    </TabsContent>

                    <TabsContent value="online" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <div className="space-y-3.5">
                            {showOnlineSetupHint ? renderSetupHint(onlineSetupDescription) : null}

                            {showOnlineContent ? (
                                <>
                                    <SectionCard
                                        title="信息"
                                        actions={(
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1.5 px-2"
                                                onClick={handleFetchRemote}
                                                disabled={isBusy}
                                            >
                                                {busyAction === 'fetch' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                读取分支
                                            </Button>
                                        )}
                                    >
                                        <div className="grid gap-2">
                                            <InfoRow label="状态">
                                                <InfoValue>{getPrototypeOnlineStatusText(workspaceStatus)}</InfoValue>
                                            </InfoRow>
                                            {workspaceStatus?.remote?.url ? (
                                                <InfoRow label="仓库">
                                                    <InfoValue title={workspaceStatus.remote.url}>{workspaceStatus.remote.url}</InfoValue>
                                                </InfoRow>
                                            ) : null}
                                        </div>
                                    </SectionCard>

                                    <VersionSyncTabs
                                        incoming={showOnlineIncoming ? (
                                            <VersionChangeCard
                                                title={getVersionChangeTitle('incoming', behindCount)}
                                                description={`从线上 ${workspaceStatus?.remoteComparison?.branch || '当前'} 同步整个项目，当前原型涉及 ${incomingTotal} 个文件。`}
                                                recentCommits={incomingRecentCommits}
                                                actions={(
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 gap-1.5 px-2"
                                                        onClick={handleSyncDown}
                                                        disabled={isBusy}
                                                    >
                                                        {busyAction === 'sync-down' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                                        同步下来
                                                    </Button>
                                                )}
                                            />
                                        ) : null}
                                        outgoing={showOnlineOutgoing ? (
                                            <VersionChangeCard
                                                title={getVersionChangeTitle('outgoing', aheadCount)}
                                                description={`推送整个项目到线上 ${workspaceStatus?.remoteComparison?.branch || '当前'}，当前原型涉及 ${outgoingTotal} 个文件。`}
                                                recentCommits={outgoingRecentCommits}
                                                actions={(
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 gap-1.5 px-2"
                                                        onClick={handlePush}
                                                        disabled={isBusy}
                                                    >
                                                        {busyAction === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                                        推送上去
                                                    </Button>
                                                )}
                                            />
                                        ) : null}
                                    />
                                </>
                            ) : null}
                        </div>
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
