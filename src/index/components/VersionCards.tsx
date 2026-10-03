import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface VersionCardCommit {
    hash: string;
    shortHash?: string;
    message: string;
    fullMessage?: string;
    author?: string;
    timestamp?: number;
    date?: string;
}

function getCommitShortHash(commit: VersionCardCommit): string {
    return commit.shortHash || commit.hash.slice(0, 7) || '-------';
}

export function formatVersionCommitTimestamp(timestamp?: number, date?: string): string {
    const value = Number(timestamp || 0);
    const d = value > 0 ? new Date(value) : date ? new Date(date) : null;
    if (!d || Number.isNaN(d.getTime())) return '未知时间';
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatVersionCommitRelativeTime(timestamp?: number, date?: string): string {
    const value = Number(timestamp || 0);
    const d = value > 0 ? new Date(value) : date ? new Date(date) : null;
    if (!d || Number.isNaN(d.getTime())) return '未知时间';
    const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    const units = [
        { seconds: 31536000, label: '年' },
        { seconds: 2592000, label: '个月' },
        { seconds: 86400, label: '天' },
        { seconds: 3600, label: '小时' },
        { seconds: 60, label: '分钟' },
    ];
    for (const unit of units) {
        const count = Math.floor(seconds / unit.seconds);
        if (count > 0) return `${count} ${unit.label}前`;
    }
    return '刚刚';
}

export function getVersionChangeTitle(kind: 'incoming' | 'outgoing', commitCount: number): string {
    if (commitCount <= 0) {
        return kind === 'incoming' ? '线上有更新' : '本地待同步';
    }
    return kind === 'incoming' ? `线上领先 ${commitCount} 个版本` : `本地领先 ${commitCount} 个版本`;
}

export function VersionSyncTabs({
    incoming,
    outgoing,
}: {
    incoming?: ReactNode;
    outgoing?: ReactNode;
}) {
    return (
        <Tabs defaultValue="incoming" className="space-y-3">
            <TabsList className="grid h-8 w-full grid-cols-2 rounded-lg border border-border/70 bg-muted/50 p-0.5">
                <TabsTrigger value="incoming" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                    同步下来
                </TabsTrigger>
                <TabsTrigger value="outgoing" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                    推送上去
                </TabsTrigger>
            </TabsList>
            <TabsContent value="incoming" className="m-0">
                {incoming || (
                    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
                        暂无线上更新
                    </div>
                )}
            </TabsContent>
            <TabsContent value="outgoing" className="m-0">
                {outgoing || (
                    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
                        暂无待推送内容
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
}

export function VersionSection({
    title,
    actions,
    children,
    contentClassName,
}: {
    title: string;
    actions?: ReactNode;
    children: ReactNode;
    contentClassName?: string;
}) {
    return (
        <section className="overflow-hidden rounded-md border border-border bg-background">
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                <h3 className="text-[13px] font-semibold leading-5 text-foreground">{title}</h3>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
            <div className={cn('border-t border-border/60 px-3.5 py-3', contentClassName)}>{children}</div>
        </section>
    );
}

export function VersionInfoRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="grid min-h-8 grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-xs">
            <span className="whitespace-nowrap text-muted-foreground">{label}</span>
            <div className="min-w-0 text-foreground">{children}</div>
        </div>
    );
}

export function VersionInfoValue({
    children,
    className,
    contentClassName,
    title,
}: {
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    title?: string;
}) {
    return (
        <div
            className={cn(
                'flex h-8 min-w-0 items-center rounded-md border border-border/70 bg-muted/30 px-2.5 text-xs font-medium text-foreground',
                className,
            )}
            title={title}
        >
            <span className={cn('min-w-0 truncate', contentClassName)}>{children}</span>
        </div>
    );
}

function VersionLogTooltipButton({
    commits,
    label = '更新日志',
}: {
    commits: VersionCardCommit[];
    label?: string;
}) {
    if (!commits.length) return null;
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={label}
                    >
                        <FileText className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent
                    side="top"
                    className="max-w-[360px] whitespace-normal bg-background text-foreground border border-border shadow-lg text-left"
                    arrowClassName="bg-background fill-background"
                >
                    <div className="space-y-2">
                        <div className="text-[11px] font-medium text-foreground">{label}</div>
                        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                            {commits.map((commit) => {
                                const logText = commit.fullMessage || commit.message || '无更新说明';
                                return (
                                    <div key={commit.hash} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                                        <div className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                                            {logText}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export function VersionCommitCard({
    commit,
    badge,
    actions,
    logCommits,
    compact = false,
    className,
}: {
    commit: VersionCardCommit;
    badge?: ReactNode;
    actions?: ReactNode;
    logCommits?: VersionCardCommit[];
    compact?: boolean;
    className?: string;
}) {
    const commitsForLog = logCommits?.length ? logCommits : [commit];
    return (
        <div className={cn('rounded-md border border-border bg-card px-3.5 py-3', compact && 'px-3 py-2.5', className)}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div
                        className="truncate whitespace-nowrap text-[13px] font-semibold leading-5 text-foreground"
                        title={commit.message || getCommitShortHash(commit)}
                    >
                        {commit.message || getCommitShortHash(commit)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{commit.author || 'Unknown'}</span>
                        <span>·</span>
                        <span title={formatVersionCommitTimestamp(commit.timestamp, commit.date)}>
                            {formatVersionCommitRelativeTime(commit.timestamp, commit.date)}
                        </span>
                        <span>·</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4">{getCommitShortHash(commit)}</code>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {badge}
                    <VersionLogTooltipButton commits={commitsForLog} />
                    {actions}
                </div>
            </div>
        </div>
    );
}

export function VersionCommitRow({
    commit,
    badge,
    actions,
    logCommits,
    className,
}: {
    commit: VersionCardCommit;
    badge?: ReactNode;
    actions?: ReactNode;
    logCommits?: VersionCardCommit[];
    className?: string;
}) {
    const commitsForLog = logCommits?.length ? logCommits : [commit];
    return (
        <div className={cn('grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3', className)}>
            <div className="min-w-0">
                <div
                    className="truncate whitespace-nowrap text-[13px] font-semibold leading-5 text-foreground"
                    title={commit.message || getCommitShortHash(commit)}
                >
                    {commit.message || getCommitShortHash(commit)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{commit.author || 'Unknown'}</span>
                    <span>·</span>
                    <span title={formatVersionCommitTimestamp(commit.timestamp, commit.date)}>
                        {formatVersionCommitRelativeTime(commit.timestamp, commit.date)}
                    </span>
                    <span>·</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4">{getCommitShortHash(commit)}</code>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {badge}
                <VersionLogTooltipButton commits={commitsForLog} />
                {actions}
            </div>
        </div>
    );
}

export function VersionChangeCard({
    title,
    description,
    recentCommits,
    actions,
    children,
    note,
}: {
    title: string;
    description: string;
    recentCommits: VersionCardCommit[];
    actions?: ReactNode;
    children?: ReactNode;
    note?: ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-md border border-border bg-background">
            <div className="flex items-start justify-between gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-5 text-foreground">{title}</div>
                    <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{description}</div>
                </div>
                {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
            </div>
            {recentCommits.length > 0 ? (
                <div className="border-t border-border/60 px-3.5 py-3">
                    <div className="divide-y divide-border/50">
                        {recentCommits.map((commit) => (
                            <VersionCommitRow
                                key={commit.hash}
                                commit={commit}
                            />
                        ))}
                    </div>
                </div>
            ) : null}
            {children ? (
                <div className="border-t border-border/60 px-3.5 py-3">
                    <div className="mb-2 text-xs font-medium leading-5 text-muted-foreground">影响资源</div>
                    {children}
                </div>
            ) : null}
            {note ? <div className="border-t border-border/60 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">{note}</div> : null}
        </div>
    );
}
