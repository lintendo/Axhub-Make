import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CheckCircle2, Download, GitBranch, Moon, RefreshCw, Sun, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { AppDialogProvider } from '../index/components/dialogs/AppDialogProvider';
import {
    VersionManagerContent,
    type VersionManagerPreviewState,
} from '../index/components/VersionManager';
import type {
    GitWorkspaceChangeGroup,
    GitWorkspaceCommitSummary,
    GitWorkspaceRemoteComparison,
    GitWorkspaceStatusResponse,
} from '../index/services/api';
import type { ItemData } from '../index/types';
import '../index.css';

type PreviewCard = {
    id: string;
    title: string;
    description: string;
    preview: VersionManagerPreviewState;
    width?: number;
};

type PreviewCardState = {
    preview: VersionManagerPreviewState;
    revision: number;
};

type RemoteDialogState = {
    cardId: string;
} | null;

type RemoteOperation = 'init' | 'fetch' | 'sync-down' | 'push';

const EMPTY_GROUPS: GitWorkspaceChangeGroup[] = [];

function createComparison(overrides: Partial<GitWorkspaceRemoteComparison> = {}): GitWorkspaceRemoteComparison {
    return {
        available: true,
        branch: 'stable',
        targetRef: 'origin/stable',
        aheadCount: 0,
        behindCount: 0,
        incoming: { totalFiles: 0, groups: EMPTY_GROUPS },
        outgoing: { totalFiles: 0, groups: EMPTY_GROUPS },
        ...overrides,
    };
}

function createStatus(overrides: Partial<GitWorkspaceStatusResponse> = {}): GitWorkspaceStatusResponse {
    return {
        available: true,
        gitAvailable: true,
        isGitRepo: true,
        hasCommits: true,
        currentBranch: 'stable',
        currentCommit: createCommit('a1b2c3d4', '完成首页布局调整', 2),
        recentCommits: [],
        hasChanges: false,
        changedFilesCount: 0,
        changeSummary: { totalFiles: 0, groups: EMPTY_GROUPS },
        branchOverview: {
            localBranches: ['stable', 'feature/2026-q3-logistics-homepage-polish'],
            remoteBranches: ['origin/stable', 'origin/feature/2026-q3-logistics-homepage-polish'],
        },
        remote: { url: 'https://github.com/example/logistics-home.git', defaultBranch: 'stable' },
        remoteComparison: createComparison(),
        ...overrides,
    };
}

function createCommit(hash: string, message: string, daysAgo = 0): GitWorkspaceCommitSummary {
    const timestamp = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    return {
        hash,
        shortHash: hash.slice(0, 7),
        message,
        fullMessage: message,
        author: daysAgo % 2 ? 'Lin' : 'Axhub',
        email: 'preview@example.com',
        timestamp,
        date: new Date(timestamp).toISOString(),
    };
}

const history = [
    createCommit('a1b2c3d4e5f6', '完成首页布局调整', 2),
    createCommit('b2c3d4e5f6a7', '补充运输路线状态', 5),
    createCommit('c3d4e5f6a7b8', '更新导航与筛选交互', 9),
    createCommit('d4e5f6a7b8c9', '初始化物流服务原型', 14),
];

const changedGroups: GitWorkspaceChangeGroup[] = [
    {
        key: 'prototypes',
        label: '原型',
        fileCount: 3,
        items: [
            { id: 'home', name: 'logistics-home', fileCount: 1 },
            { id: 'tracking', name: 'tracking-detail', fileCount: 1 },
            { id: 'route', name: 'route-status', fileCount: 1 },
        ],
    },
    {
        key: 'resources',
        label: '资源',
        fileCount: 2,
        items: [
            { id: 'copy', name: 'navigation.json', fileCount: 1 },
            { id: 'theme', name: 'theme.css', fileCount: 1 },
        ],
    },
];

const cards: PreviewCard[] = [
    {
        id: 'loading',
        title: '加载中',
        description: '首次打开气泡，等待仓库状态返回。',
        preview: { loadingHistory: true, busyAction: 'load' },
    },
    {
        id: 'git-unavailable',
        title: '未安装 Git',
        description: '本机没有可用的 Git 运行环境。',
        preview: {
            unavailableState: {
                title: '当前环境未安装 Git',
                description: '安装 Git 并重启开发服务器后，才能使用版本管理功能。',
            },
        },
    },
    {
        id: 'empty',
        title: '尚无版本历史',
        description: '项目还没有初始化或提交过版本。',
        preview: { workspaceStatus: createStatus({ isGitRepo: false, hasCommits: false, remote: undefined }) },
    },
    {
        id: 'remote-ready',
        title: '已添加远端仓库',
        description: '本地版本已经连接在线仓库，可以打开远端菜单继续操作。',
        preview: {
            workspaceStatus: createStatus({
                remote: { url: 'https://github.com/example/logistics-home.git', defaultBranch: 'stable' },
                remoteComparison: createComparison({
                    branch: 'stable',
                    targetRef: 'origin/stable',
                }),
            }),
            commits: [history[0]],
            hasUncommitted: false,
        },
    },
    {
        id: 'clean',
        title: '工作区干净',
        description: '没有待提交更改，远端已连接。',
        preview: { workspaceStatus: createStatus(), commits: [history[0]], hasUncommitted: false },
    },
    {
        id: 'changed',
        title: '有未提交更改',
        description: '多文件变更，提交按钮保持禁用直到填写说明。',
        preview: {
            workspaceStatus: createStatus({
                hasChanges: true,
                changedFilesCount: 5,
                changeSummary: { totalFiles: 5, groups: changedGroups },
            }),
            hasUncommitted: true,
        },
    },
    {
        id: 'incoming',
        title: '有线上更新',
        description: '远端领先两个版本，拉取按钮可用。',
        preview: {
            workspaceStatus: createStatus({
                remoteComparison: createComparison({
                    behindCount: 2,
                    incoming: { totalFiles: 4, groups: changedGroups },
                }),
            }),
            commits: history.slice(0, 2),
        },
    },
    {
        id: 'outgoing',
        title: '待推送',
        description: '本地领先一个版本，推送按钮可用。',
        preview: {
            workspaceStatus: createStatus({
                remoteComparison: createComparison({
                    aheadCount: 1,
                    outgoing: { totalFiles: 2, groups: changedGroups },
                }),
            }),
            commits: history.slice(0, 2),
            commitMessage: '完成首页布局调整',
        },
    },
    {
        id: 'history',
        title: '版本历史',
        description: '多条历史记录，当前版本与恢复操作同时出现。',
        preview: { workspaceStatus: createStatus(), commits: history, hasUncommitted: false },
    },
    {
        id: 'narrow-long',
        title: '窄面板与长文本',
        description: '长分支名、长文件名和窄气泡宽度下的截断表现。',
        width: 340,
        preview: {
            workspaceStatus: createStatus({
                currentBranch: 'feature/2026-q3-logistics-homepage-polish',
                remoteComparison: createComparison({ behindCount: 1, aheadCount: 1 }),
            }),
            commits: [{
                hash: 'f6a7b8c9d0e1',
                message: '优化全国网络运输服务首页中转节点与异常状态提示',
                author: 'Axhub Design Team',
                timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
            }],
            hasUncommitted: true,
            commitMessage: '补充移动端和小屏幕下的版本管理交互细节',
        },
    },
];

const item: ItemData = {
    name: 'logistics-home',
    displayName: '批注演示',
    filePath: 'src/prototypes/logistics-home/index.tsx',
    jsUrl: '',
    specUrl: '',
};

function PreviewRemoteRepositoryDialog({
    open,
    status,
    onOpenChange,
    onSave,
    onOperation,
}: {
    open: boolean;
    status: GitWorkspaceStatusResponse | null;
    onOpenChange: (open: boolean) => void;
    onSave: (values: { mode: 'connect' | 'create'; url: string; repositoryName: string; visibility: 'private' | 'public' }) => void;
    onOperation: (operation: Exclude<RemoteOperation, 'init'>) => void;
}) {
    const [mode, setMode] = useState<'connect' | 'create'>('connect');
    const [showChangeRemote, setShowChangeRemote] = useState(false);
    const [url, setUrl] = useState('');
    const [repositoryName, setRepositoryName] = useState('');
    const [visibility, setVisibility] = useState<'private' | 'public'>('private');
    const isRepositoryReady = Boolean(status?.isGitRepo && status?.hasCommits);

    useEffect(() => {
        if (!open) return;
        setMode('connect');
        setShowChangeRemote(false);
        setUrl(status?.remote?.url || '');
        setRepositoryName('');
        setVisibility('private');
    }, [open, status?.remote?.url]);

    const hasConfiguredRemote = Boolean(status?.remote?.url);
    const incomingCount = Number(status?.remoteComparison?.behindCount || 0);
    const outgoingCount = Number(status?.remoteComparison?.aheadCount || 0);
    const syncSummary = incomingCount || outgoingCount
        ? `${incomingCount ? `${incomingCount} 个版本待拉取` : '没有待拉取更新'}${outgoingCount ? `，${outgoingCount} 个版本待推送` : ''}`
        : '本地与远端一致';

    const renderConfiguredRemote = () => (
        <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/50 dark:bg-emerald-950/20">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">已连接远端仓库</div>
                            <p className="mt-1 break-all text-xs leading-5 text-emerald-800/80 dark:text-emerald-200/80">{status?.remote?.url}</p>
                        </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 bg-background text-xs" onClick={() => setShowChangeRemote(true)}>
                        更换远端
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-card">
                <div className="grid gap-3 p-4 text-xs">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">当前分支</span>
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{status?.currentBranch || 'stable'}</span>
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">默认分支</span>
                        <span className="font-medium">{status?.remote?.defaultBranch || status?.currentBranch || 'stable'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">同步状态</span>
                        <span className={incomingCount || outgoingCount ? 'font-medium text-amber-600 dark:text-amber-300' : 'font-medium text-emerald-600 dark:text-emerald-300'}>{syncSummary}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onOperation('fetch')}>
                        <RefreshCw className="h-3.5 w-3.5" /> 刷新远端
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onOperation('sync-down')} disabled={!incomingCount}>
                        <Download className="h-3.5 w-3.5" /> 拉取
                    </Button>
                    <Button type="button" variant="brand" size="sm" className="h-8 gap-1.5" onClick={() => onOperation('push')} disabled={!outgoingCount}>
                        <Upload className="h-3.5 w-3.5" /> 推送
                    </Button>
                </div>
            </div>
        </div>
    );

    const renderRemoteSetup = () => (
        <div className="space-y-4">
            <div className="grid h-9 w-full grid-cols-2 rounded-lg border border-border/70 bg-muted/50 p-0.5">
                <button
                    type="button"
                    className={`rounded-md px-3 text-xs font-medium transition ${mode === 'connect' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setMode('connect')}
                >
                    连接已有仓库
                </button>
                <button
                    type="button"
                    className={`rounded-md px-3 text-xs font-medium transition ${mode === 'create' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setMode('create')}
                >
                    新建仓库
                </button>
            </div>

            {mode === 'connect' ? (
                <div className="space-y-2">
                    <label className="text-xs font-medium" htmlFor="preview-remote-url">仓库 URL</label>
                    <Input id="preview-remote-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/team/project.git" />
                    <p className="text-[11px] leading-4 text-muted-foreground">支持 HTTPS 或 SSH 地址，连接后会显示在远端菜单中。</p>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px]">
                    <div className="space-y-2">
                        <label className="text-xs font-medium" htmlFor="preview-repository-name">仓库名称</label>
                        <Input id="preview-repository-name" value={repositoryName} onChange={(event) => setRepositoryName(event.target.value)} placeholder="logistics-home" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium">可见性</label>
                        <Select value={visibility} onValueChange={(value) => setVisibility(value === 'public' ? 'public' : 'private')}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="private">私有</SelectItem>
                                <SelectItem value="public">公开</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[520px] gap-5">
                <DialogHeader>
                    <DialogTitle>远端设置</DialogTitle>
                    <DialogDescription>连接或创建在线仓库，之后可在远端菜单中刷新、推送和拉取。</DialogDescription>
                </DialogHeader>

                {hasConfiguredRemote && !showChangeRemote ? renderConfiguredRemote() : renderRemoteSetup()}

                <DialogFooter className="gap-2 sm:space-x-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
                    {(!hasConfiguredRemote || showChangeRemote) ? (
                        <Button
                            type="button"
                            variant="brand"
                            disabled={!isRepositoryReady || (mode === 'connect' ? !url.trim() : !repositoryName.trim())}
                            onClick={() => onSave({ mode, url, repositoryName, visibility })}
                        >
                            {mode === 'connect' ? (hasConfiguredRemote ? '更新远端' : '连接仓库') : '创建并连接'}
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PreviewCardView({
    card,
    state,
    onOpenRemoteRepositorySettings,
    onOperation,
}: {
    card: PreviewCard;
    state: PreviewCardState;
    onOpenRemoteRepositorySettings: () => void;
    onOperation: (operation: RemoteOperation) => void;
}) {
    return (
        <article className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-foreground">{card.title}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{card.description}</p>
                </div>
                <code className="shrink-0 text-[10px] text-muted-foreground">{card.id}</code>
            </div>
            <div
                className="flex w-full justify-center rounded-2xl border border-dashed border-border/80 bg-muted/30 p-3"
                style={{ minHeight: 420 }}
            >
                <div
                    className="flex max-h-[min(680px,calc(100vh-6rem))] min-h-[400px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_18px_45px_hsl(220_43%_11%_/_0.14)]"
                    style={{ width: card.width || 420 }}
                >
                    <VersionManagerContent
                        key={`${card.id}-${state.revision}`}
                        projectId="git-version-preview"
                        visible
                        item={item}
                        preview={state.preview}
                        onCancel={() => undefined}
                        onOpenRemoteRepositorySettings={onOpenRemoteRepositorySettings}
                        previewActions={{
                            onInitializeRepository: () => onOperation('init'),
                            onFetchRemote: () => onOperation('fetch'),
                            onSyncDown: () => onOperation('sync-down'),
                            onPush: () => onOperation('push'),
                        }}
                    />
                </div>
            </div>
        </article>
    );
}

function GitVersionStatePreview() {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [filter, setFilter] = useState('');
    const [cardStates, setCardStates] = useState<Record<string, PreviewCardState>>(() => Object.fromEntries(
        cards.map((card) => [card.id, { preview: card.preview, revision: 0 }]),
    ));
    const [remoteDialog, setRemoteDialog] = useState<RemoteDialogState>(null);
    const visibleCards = useMemo(() => {
        const normalizedFilter = filter.trim().toLowerCase();
        if (!normalizedFilter) return cards;
        return cards.filter((card) => `${card.id} ${card.title} ${card.description}`.toLowerCase().includes(normalizedFilter));
    }, [filter]);

    const updateCardPreview = (cardId: string, update: (preview: VersionManagerPreviewState) => VersionManagerPreviewState) => {
        setCardStates((current) => {
            const cardState = current[cardId];
            if (!cardState) return current;
            return {
                ...current,
                [cardId]: {
                    preview: update(cardState.preview),
                    revision: cardState.revision + 1,
                },
            };
        });
    };

    const runRemoteOperation = (cardId: string, operation: RemoteOperation) => {
        if (operation === 'init') {
            updateCardPreview(cardId, (preview) => {
                const nextStatus = preview.workspaceStatus || createStatus({ remote: undefined });
                return {
                    ...preview,
                    unavailableState: null,
                    busyAction: null,
                    hasUncommitted: false,
                    commits: preview.commits?.length ? preview.commits : [history[0]],
                    workspaceStatus: {
                        ...nextStatus,
                        available: true,
                        gitAvailable: true,
                        isGitRepo: true,
                        hasCommits: true,
                        currentBranch: nextStatus.currentBranch || 'stable',
                        currentCommit: nextStatus.currentCommit || history[0],
                        recentCommits: nextStatus.recentCommits?.length ? nextStatus.recentCommits : [history[0]],
                        remote: nextStatus.remote,
                        remoteComparison: nextStatus.remoteComparison || createComparison({ available: false }),
                    },
                };
            });
            toast.success('演示：已开启本地版本');
            return;
        }

        updateCardPreview(cardId, (preview) => ({ ...preview, busyAction: operation }));
        window.setTimeout(() => {
            updateCardPreview(cardId, (preview) => {
                const status = preview.workspaceStatus;
                if (!status) return { ...preview, busyAction: null };
                const comparison = status.remoteComparison || createComparison();
                const nextComparison = operation === 'sync-down'
                    ? {
                        ...comparison,
                        behindCount: 0,
                        incoming: { totalFiles: 0, groups: EMPTY_GROUPS },
                    }
                    : operation === 'push'
                        ? {
                            ...comparison,
                            aheadCount: 0,
                            outgoing: { totalFiles: 0, groups: EMPTY_GROUPS },
                        }
                        : { ...comparison, available: true };
                return {
                    ...preview,
                    busyAction: null,
                    workspaceStatus: { ...status, remoteComparison: nextComparison },
                };
            });
            toast.success(operation === 'fetch' ? '演示：已刷新远端' : operation === 'push' ? '演示：已推送到远端' : '演示：已从远端拉取');
        }, 700);
    };

    const saveRemoteRepository = (cardId: string, values: { mode: 'connect' | 'create'; url: string; repositoryName: string; visibility: 'private' | 'public' }) => {
        const remoteUrl = values.mode === 'connect'
            ? values.url.trim()
            : `https://github.com/example/${values.repositoryName.trim()}.git`;
        updateCardPreview(cardId, (preview) => {
            const status = preview.workspaceStatus || createStatus({ remote: undefined });
            const branch = status.currentBranch || 'stable';
            return {
                ...preview,
                unavailableState: null,
                hasUncommitted: Boolean(preview.hasUncommitted),
                commits: preview.commits?.length ? preview.commits : [history[0]],
                workspaceStatus: {
                    ...status,
                    available: true,
                    gitAvailable: true,
                    isGitRepo: true,
                    hasCommits: true,
                    currentBranch: branch,
                    currentCommit: status.currentCommit || history[0],
                    remote: { url: remoteUrl, defaultBranch: branch },
                    remoteComparison: createComparison({ branch, targetRef: `origin/${branch}` }),
                },
            };
        });
        setRemoteDialog(null);
        toast.success(values.mode === 'connect' ? '演示：已连接在线仓库' : '演示：已创建并连接在线仓库');
    };

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode);
        document.body.classList.toggle('dark', isDarkMode);
    }, [isDarkMode]);

    return (
        <div className="ax-admin-theme min-h-full bg-background text-foreground">
            <header className="sticky top-0 z-10 border-b border-border/70 bg-background/95 px-6 py-4 backdrop-blur">
                <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">开发态视觉检查</p>
                        <h1 className="mt-1 text-lg font-semibold">Git 气泡状态演示</h1>
                        <p className="mt-1 text-xs text-muted-foreground">复用右上角版本和协作面板，切换或并排检查各种仓库状态。</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="筛选状态…"
                            className="h-8 w-44 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setIsDarkMode((value) => !value)} aria-label={isDarkMode ? '切换浅色模式' : '切换深色模式'}>
                            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </header>
            <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-6 xl:grid-cols-2">
                {visibleCards.map((card) => (
                    <PreviewCardView
                        key={card.id}
                        card={card}
                        state={cardStates[card.id] || { preview: card.preview, revision: 0 }}
                        onOpenRemoteRepositorySettings={() => setRemoteDialog({ cardId: card.id })}
                        onOperation={(operation) => runRemoteOperation(card.id, operation)}
                    />
                ))}
            </main>
            <PreviewRemoteRepositoryDialog
                open={Boolean(remoteDialog)}
                status={remoteDialog ? cardStates[remoteDialog.cardId]?.preview.workspaceStatus || null : null}
                onOpenChange={(open) => {
                    if (!open) setRemoteDialog(null);
                }}
                onSave={(values) => {
                    if (remoteDialog) saveRemoteRepository(remoteDialog.cardId, values);
                }}
                onOperation={(operation) => {
                    if (remoteDialog) runRemoteOperation(remoteDialog.cardId, operation);
                }}
            />
            <Toaster
                position="top-right"
                theme={isDarkMode ? 'dark' : 'light'}
                duration={2500}
                closeButton
                visibleToasts={2}
                offset={16}
                mobileOffset={16}
            />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <AppDialogProvider>
        <GitVersionStatePreview />
    </AppDialogProvider>,
);

export { GitVersionStatePreview };
