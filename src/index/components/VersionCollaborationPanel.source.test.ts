import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(fileName: string) {
  return readFileSync(resolve(__dirname, `./${fileName}`), 'utf8');
}

describe('version collaboration source contracts', () => {
  it('exposes a development-only prototype Git state preview entry', () => {
    const previewSource = readFileSync(resolve(__dirname, '../../git-version-states/index.tsx'), 'utf8');
    const managerSource = readSource('VersionManager.tsx');
    expect(previewSource).toContain('GitVersionStatePreview');
    expect(previewSource).toContain('加载中');
    expect(previewSource).toContain('未安装 Git');
    expect(previewSource).toContain('有未提交更改');
    expect(previewSource).toContain('有线上更新');
    expect(previewSource).toContain('版本历史');
    expect(previewSource).toContain("localBranches: ['stable', 'feature/2026-q3-logistics-homepage-polish']");
    expect(managerSource).toContain('VersionManagerPreviewState');
    expect(managerSource).toContain('preview?: VersionManagerPreviewState');
  });

  it('anchors prototype Git management in a compact popover', () => {
    const source = readSource('PrototypeVersionPopover.tsx');
    expect(source).toContain('<Popover open={open} onOpenChange={onOpenChange}>');
    expect(source).toContain('<PopoverTrigger asChild>');
    expect(source).toContain('<VersionManagerContent');
    expect(source).toContain('w-[min(420px,calc(100vw-24px))]');
    expect(source).toContain('max-h-[min(680px,calc(100vh-6rem))]');
  });

  it('uses OpenPencil Git title, empty-state, commit, and history copy', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('{currentBranch}');
    expect(source).toContain('这份文件还没有版本历史');
    expect(source).not.toContain('Git 是可选的 — 跳过也不影响使用');
    expect(source).toContain('h-full min-h-[360px] flex-col items-center justify-center');
    expect(source).toContain('mb-5 flex h-12 w-12 shrink-0 items-center justify-center');
    expect(source).toContain('mt-0 text-[13px] font-medium" data-openpencil-copy="git.empty.heading"');
    expect(source).not.toContain('data-openpencil-copy="git.empty.optional"');
    expect(source).toContain('mt-6 flex w-full justify-center');
    expect(source).toContain('data-openpencil-copy="git.empty.initButton"');
    expect(source).toContain('开启本地版本');
    expect(source).not.toContain('已有仓库');
    expect(source).not.toContain('从远程仓库');
    expect(source).toContain('描述这次改动…');
    expect(source).toContain('保存为版本');
    expect(source).toContain('暂无历史');
    expect(source).toContain('远端设置');
    expect(source).not.toContain('远端设置…');
    expect(source).toContain('onClick={() => void handleFetchRemote()}');
    expect(source).toContain('<RefreshCw className="h-3.5 w-3.5" /> 刷新远端');
    expect(source).toContain("toast.success('已刷新远端')");
    expect(source).not.toContain('<RefreshCw className="h-3.5 w-3.5" /> 获取');
    expect(source.indexOf('onClick={openRemoteRepositorySettings}')).toBeLessThan(source.indexOf('onClick={() => void handleFetchRemote()}'));
    expect(source.indexOf('onClick={() => void handleFetchRemote()}')).toBeLessThan(source.lastIndexOf('<DropdownMenuSeparator />'));
    expect(source).toContain('onClick={() => void handleSyncDown()}');
    expect(source).toContain('disabled={!hasConfiguredRemote || !hasIncoming || isBusy || !canWriteViewedBranch}');
    expect(source).toContain('<Download className="h-3.5 w-3.5" />');
    expect(source).toContain(' />} 拉取');
    expect(source).not.toContain('aria-label="拉取"');
    expect(source).toContain('onClick={() => void handlePush()}');
    expect(source).toContain('<Upload className="h-3.5 w-3.5" />} 推送');
    expect(source).toContain('disabled={!hasConfiguredRemote || !hasOutgoing || isBusy || !canWriteViewedBranch}');
    expect(source).not.toContain('aria-label="推送"');
    expect(source).toContain('<TooltipContent side="bottom">远端仓库</TooltipContent>');
    expect(source).toContain('<TooltipContent side="bottom">关闭</TooltipContent>');
    expect(source).toContain('<TooltipContent side="top">刷新版本状态</TooltipContent>');
    expect(source).not.toContain('没有需要推送的内容 — 已是最新');
  });

  it('restores AI-generated version notes in the compact commit editor', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain("import { generateGitCommitMessage } from '../domains/ai-generation/gitCommitMessageGeneration';");
    expect(source).toContain('const [generatingCommitMessage, setGeneratingCommitMessage] = useState(false);');
    expect(source).toContain('const handleGenerateCommitMessage = async () =>');
    expect(source).toContain('const generatedMessage = await generateGitCommitMessage({');
    expect(source).toContain("scope: isProjectScope ? 'workspace' : 'prototype'");
    expect(source).toContain('status: workspaceStatus');
    expect(source).toContain("targetName: String(item?.displayName || item?.title || item?.name || '').trim()");
    expect(source).toContain('targetPath,');
    expect(source).toContain('currentMessage: commitMessage');
    expect(source).toContain('setCommitMessage(generatedMessage);');
    expect(source).toContain('onClick={() => void handleGenerateCommitMessage()}');
    expect(source).toContain('disabled={isBusy || generatingCommitMessage}');
    expect(source).toContain('aria-label="AI生成版本记录"');
    expect(source).toContain('<TooltipContent side="top">AI生成版本记录</TooltipContent>');
    expect(source).toContain('<Sparkles className="h-3.5 w-3.5" />');
    expect(source).toContain('className="flex items-center justify-end gap-1.5 pt-2"');
    expect(source).not.toContain('absolute right-1.5 top-1.5 h-7 w-7');
    expect(source).not.toContain('p-0 pr-10 text-xs leading-relaxed');
  });

  it('keeps prototype Git as one panel instead of local/online tabs or stacked sections', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('<header className="flex min-h-11');
    expect(source).toContain('<GitFork');
    expect(source).toContain('<GitBranch');
    expect(source).toContain('className="h-7 w-auto min-w-0 shrink-0 justify-start gap-1');
    expect(source).toContain('<div className="ml-auto flex shrink-0 items-center gap-1">');
    expect(source).not.toContain('<GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />');
    expect(source).toContain('max-w-[240px] border-0 bg-transparent px-0 text-[11px]');
    expect(source).toContain('<SelectContent align="start" className="w-64">');
    expect(source).not.toContain('<Tabs defaultValue="local"');
    expect(source).not.toContain('<TabsTrigger value="online"');
    expect(source).not.toContain('<SectionCard title="Git"');
    expect(source).not.toContain('<SectionCard title="提交版本">');
    expect(source).not.toContain('rows={4}');
  });

  it('reuses the OpenPencil empty-state card rhythm and icons', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('rounded-2xl bg-gradient-to-br from-muted/60 to-muted/20');
    expect(source).toContain('data-openpencil-copy="git.empty.initButton"');
    expect(source).not.toContain('grid w-full grid-cols-3 gap-2');
    expect(source).toContain('<FilePlus');
    expect(source).toContain('开启本地版本');
  });

  it('keeps restore and prototype preview actions without exposing commit hash copying', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('hasPrototype?: boolean;');
    expect(source).toContain('prototypeUrl?: string | null;');
    expect(source).toContain('previewReady?: boolean;');
    expect(source).toContain('data.commits.filter((commit: CommitItem) => commit.hasPrototype !== false)');
    expect(source).toContain("import { probeGitVersionEntry } from './gitVersionPreview';");
    expect(source).toContain('previewReady: Boolean(commit.prototypeUrl) && await probeGitVersionEntry({');
    expect(source).toContain('const [viewingPrototypeId, setViewingPrototypeId] = useState<string | null>(null);');
    expect(source).toContain('const handleViewPrototype = async (commit: CommitItem) =>');
    expect(source).toContain("window.open(resolvePrototypeVersionPreviewUrl(item, commit.prototypeUrl), '_blank', 'noopener,noreferrer');");
    expect(source).toContain("withProjectScope('/api/git/build-version', projectScope)");
    expect(source).toContain('aria-label="预览历史版本"');
    expect(source).toContain('<TooltipContent side="top">预览历史版本</TooltipContent>');
    expect(source).toContain('<Eye className="h-3.5 w-3.5" />');
    expect(source).toContain('aria-label="恢复"');
    expect(source).toContain('git.history.restoreButton');
    expect(source).not.toContain('handleCopyCommitHash');
    expect(source).not.toContain('aria-label="复制哈希"');
    expect(source).not.toContain('git.history.copyHashButton');
  });

  it('keeps all Git requests scoped to the selected project and prototype path', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('getGitTargetPath(item)');
    expect(source).toContain('targetItem.projectDocumentPath');
    expect(source).toContain('targetItem.resourceId || targetItem.name');
    expect(source).toContain('if (!targetPath) {');
    expect(source).toContain('if (preview || (!isProjectScope && !targetPath)) return;');
    expect(source).toContain('const historyQuery = new URLSearchParams({ path: targetPath });');
    expect(source).toContain("if (branchOverride) historyQuery.set('branch', branchOverride);");
    expect(source).toContain('withProjectScope(`/api/git/history?${historyQuery.toString()}`, projectScope)');
    expect(source).toContain("withProjectScope('/api/git/restore', projectScope)");
    expect(source).toContain('path: targetPath || undefined');
    expect(source).toContain('branch: branchOverride || undefined');
    expect(source).toContain('apiService.commitGitWorkspace(commitMessage.trim(), projectScope, { path: targetPath })');
    expect(source).toContain('apiService.fetchGitWorkspace(projectScope)');
    expect(source).toContain('apiService.syncDownGitWorkspace(projectScope)');
    expect(source).toContain('apiService.pushGitWorkspace(projectScope)');
  });

  it('preserves shared history row primitives for project and prototype views', () => {
    const cardsSource = readSource('VersionCards.tsx');
    const panelSource = readSource('VersionCollaborationPanel.tsx');
    const managerSource = readSource('VersionManager.tsx');
    expect(cardsSource).toContain('export function VersionCommitRow(');
    expect(panelSource).toContain('VersionCommitRow');
    expect(managerSource).toContain('<VersionCommitRow');
    expect(managerSource).not.toContain('<VersionCommitCard');
  });

  it('labels update logs concisely and keeps version titles to one truncated line', () => {
    const cardsSource = readSource('VersionCards.tsx');
    expect(cardsSource).toContain("label = '更新日志'");
    expect(cardsSource).not.toContain("label = '完整更新日志'");
    expect(cardsSource).toContain('truncate whitespace-nowrap text-[13px] font-semibold leading-5 text-foreground');
    expect(cardsSource).toContain('title={commit.message || getCommitShortHash(commit)}');
  });

  it('keeps project collaboration features separate from prototype Git popover', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).not.toContain('onOpenWorkspaceVersionCollaboration');
    expect(source).not.toContain('openWorkspaceVersionCollaboration');
  });

  it('uses the remote repository trigger and opens settings when no remote is configured', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('const hasConfiguredRemote = Boolean(workspaceStatus?.remote?.url);');
    expect(source).toContain('aria-label="远端仓库"');
    expect(source).toContain('<TooltipContent side="bottom">远端仓库</TooltipContent>');
    expect(source).toContain('<GitFork className="h-4 w-4" />');
    expect(source).toContain('hasConfiguredRemote ? (');
    expect(source).toContain('<DropdownMenuItem onClick={openRemoteRepositorySettings} className="gap-2">');
    expect(source).toContain('<Settings2 className="h-3.5 w-3.5" /> 远端设置');
    expect(source).toContain('<Copy className="h-3.5 w-3.5" /> 管理技能');
    expect(source).toContain('INSTALL_GIT_REPO_SKILL_PROMPT');
    expect(source).not.toContain('aria-label="更多操作"');
    expect(source).not.toContain('<TooltipContent side="bottom">更多操作</TooltipContent>');
  });

  it('keeps remote settings compact without rendering sync detail tabs', () => {
    const source = readSource('VersionCollaborationPanel.tsx');
    expect(source).not.toContain('VersionSyncTabs');
    expect(source).not.toContain('VersionChangeCard');
    expect(source).not.toContain('<VersionSyncTabs');
    expect(source).not.toContain('<VersionChangeCard');
    expect(source).toContain('<InfoRow label="同步">');
    expect(source).toContain('本地领先');
    expect(source).toContain('线上有更新');
    expect(source).toContain('onClick={handleSyncDown}');
    expect(source).toContain('onClick={handlePush}');
  });

  it('switches between prototype and project scopes in one panel and keeps branch state read-only', () => {
    const managerSource = readSource('VersionManager.tsx');
    const popoverSource = readSource('PrototypeVersionPopover.tsx');
    const gitApiSource = readSource('../services/api.ts');
    const gitServerSource = readFileSync(resolve(__dirname, '../../server/managementApi.git.ts'), 'utf8');
    expect(popoverSource).toContain('aria-label="版本"');
    expect(popoverSource).toContain('<span className="ax-presentation-toolbar-label">版本</span>');
    expect(managerSource).toContain("type VersionScope = 'prototype' | 'project';");
    expect(managerSource).toContain('当前原型');
    expect(managerSource).toContain('当前项目');
    expect(managerSource).toContain('const [scope, setScope] = useState<VersionScope>(\'prototype\');');
    expect(managerSource).toContain('const isProjectScope = scope === \'project\';');
    expect(managerSource).toContain('branchOverview?.localBranches');
    expect(managerSource).toContain('branch: branchOverride || undefined');
    expect(managerSource).toContain('value={selectedBranch || currentBranch}');
    expect(managerSource).toContain('text-muted-foreground');
    expect(gitApiSource).toContain('branch?: string;');
    expect(gitServerSource).toContain("const requestedBranch = String(url.searchParams.get('branch') || '').trim();");
    expect(gitServerSource).toContain("const historyRef = requestedBranch || 'HEAD';");
  });

  it('keeps the legacy project-level Sheet wrapper available', () => {
    const source = readSource('VersionManager.tsx');
    expect(source).toContain('<Sheet open={visible} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>');
    expect(source).toContain('<SheetTitle className="sr-only">版本和协作</SheetTitle>');
    expect(source).toContain('export function VersionManagerContent(');
  });

  it('restores toolbar vertical rhythm while keeping compact mobile controls', () => {
    const source = readSource('content/PresentationToolbar.tsx');
    expect(source).toContain('relative h-10 flex items-center justify-between');
    expect(source).toContain('absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2');
    expect(source).toContain('flex items-center justify-end gap-1.5 z-10');
    expect(source).toContain('const toolbarTextButtonClass = "ax-presentation-toolbar-compact-button gap-1.5');
    expect(source).toContain('const toolbarPillButtonClass = "ax-presentation-toolbar-compact-button h-8 rounded-md px-3 gap-1.5 text-[12px]');
    expect(source).not.toContain('text-[0px] md:w-auto');
    expect(source).not.toContain('hidden md:inline');
  });
});
