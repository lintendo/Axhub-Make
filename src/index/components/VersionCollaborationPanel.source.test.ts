import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readPanelSource() {
  return readFileSync(resolve(__dirname, './VersionCollaborationPanel.tsx'), 'utf8');
}

function readDrawerSource() {
  return readFileSync(resolve(__dirname, './WorkspaceVersionCollaborationDrawer.tsx'), 'utf8');
}

function readVersionManagerSource() {
  return readFileSync(resolve(__dirname, './VersionManager.tsx'), 'utf8');
}

function readVersionCardsSource() {
  return readFileSync(resolve(__dirname, './VersionCards.tsx'), 'utf8');
}

describe('VersionCollaborationPanel source', () => {
  it('scopes every workspace and prototype Git request to the selected project', () => {
    const panelSource = readPanelSource();
    const managerSource = readVersionManagerSource();

    expect(panelSource).toContain('projectId: string;');
    expect(panelSource).toContain('apiService.getGitWorkspaceStatus({');
    expect(panelSource).toContain('}, { projectId });');
    expect(panelSource).toContain('apiService.initGitWorkspace({ projectId })');
    expect(panelSource).toContain('apiService.commitGitWorkspace(message, { projectId })');
    expect(panelSource).toContain('apiService.setGitWorkspaceRemote({ url }, { projectId })');
    expect(panelSource).toContain('apiService.fetchGitWorkspace({ projectId })');
    expect(panelSource).toContain('apiService.syncDownGitWorkspace({ projectId })');
    expect(panelSource).toContain('apiService.pushGitWorkspace({ projectId })');
    expect(panelSource).toContain('apiService.createGitWorkspaceRemoteRepository({ repositoryName, visibility }, { projectId })');

    expect(managerSource).toContain("withProjectScope(`/api/git/history?path=${encodeURIComponent(targetPath)}`, projectScope)");
    expect(managerSource).toContain("withProjectScope('/api/git/restore', projectScope)");
    expect(managerSource).toContain('apiService.getGitWorkspaceStatus({ path: targetPath }, projectScope)');
    expect(managerSource).toContain('apiService.commitGitWorkspace(commitMessage.trim(), projectScope, { path: targetPath })');
    expect(managerSource).toContain("withProjectScope('/api/git/build-version', projectScope)");
    expect(managerSource).toContain('apiService.fetchGitWorkspace(projectScope)');
    expect(managerSource).toContain('apiService.syncDownGitWorkspace(projectScope)');
    expect(managerSource).toContain('apiService.pushGitWorkspace(projectScope)');
  });

  it('exports shared flat version section, info, and commit row primitives', () => {
    const cardsSource = readVersionCardsSource();

    expect(cardsSource).toContain('export function VersionSection(');
    expect(cardsSource).toContain('export function VersionInfoRow(');
    expect(cardsSource).toContain('export function VersionInfoValue(');
    expect(cardsSource).toContain('export function VersionCommitRow(');
  });

  it('composes the project version panel from shared flat primitives', () => {
    const panelSource = readPanelSource();

    expect(panelSource).toContain('VersionSection');
    expect(panelSource).toContain('VersionInfoRow');
    expect(panelSource).toContain('VersionInfoValue');
    expect(panelSource).not.toContain('function SectionCard(');
    expect(panelSource).not.toContain('function InfoRow(');
    expect(panelSource).not.toContain('function InfoValue(');
    expect(panelSource).not.toContain('<VersionCommitCard');
  });

  it('composes prototype version history from shared flat rows', () => {
    const managerSource = readVersionManagerSource();
    const localTabStart = managerSource.indexOf('<TabsContent value="local"');
    const onlineTabStart = managerSource.indexOf('<TabsContent value="online"');
    const localTabSource = managerSource.slice(localTabStart, onlineTabStart);

    expect(managerSource).toContain('VersionSection');
    expect(managerSource).toContain('VersionInfoRow');
    expect(managerSource).toContain('VersionInfoValue');
    expect(managerSource).toContain('VersionCommitRow');
    expect(managerSource).not.toContain('function SectionCard(');
    expect(managerSource).not.toContain('function InfoRow(');
    expect(managerSource).not.toContain('function InfoValue(');
    expect(localTabSource).not.toContain('<VersionCommitCard');
    expect(localTabSource).toContain('className="divide-y divide-border/50"');
  });

  it('keeps shared version rows compact and aligned without timeline decoration', () => {
    const cardsSource = readVersionCardsSource();
    const rowStart = cardsSource.indexOf('export function VersionCommitRow(');
    const changeCardStart = cardsSource.indexOf('export function VersionChangeCard(');
    const rowSource = cardsSource.slice(rowStart, changeCardStart);

    expect(rowSource).toContain("'grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3'");
    expect(rowSource).not.toContain('rounded-full bg-primary');
    expect(rowSource).not.toContain('first:pt-0');
    expect(rowSource).not.toContain('last:pb-0');
  });

  it('hides local change and commit cards when there are no local changes', () => {
    const source = readPanelSource();
    const localPanelStart = source.indexOf('{showLocalPanel ? (');
    const onlinePanelStart = source.indexOf('{showOnlinePanel ? (');

    expect(localPanelStart).toBeGreaterThan(-1);
    expect(onlinePanelStart).toBeGreaterThan(localPanelStart);

    const localPanelSource = source.slice(localPanelStart, onlinePanelStart);

    expect(localPanelSource).toMatch(/status\?\.hasChanges \? \(\s*<>\s*<SectionCard title="更改文件">[\s\S]*?<ChangeItemList items=\{changeItems\} \/>[\s\S]*?<\/SectionCard>[\s\S]*?<SectionCard title="提交版本">/);
  });

  it('shows current local changes and commit controls before version history', () => {
    const source = readPanelSource();
    const localPanelStart = source.indexOf('{showLocalPanel ? (');
    const onlinePanelStart = source.indexOf('{showOnlinePanel ? (');
    const localPanelSource = source.slice(localPanelStart, onlinePanelStart);
    const currentChangesStart = localPanelSource.indexOf('{!status?.isHistoricalVersion && status?.hasChanges ? (');
    const changeFilesIndex = localPanelSource.indexOf('<SectionCard title="更改文件">', currentChangesStart);
    const commitVersionIndex = localPanelSource.indexOf('<SectionCard title="提交版本">', currentChangesStart);
    const historyIndex = localPanelSource.indexOf('<SectionCard title="历史版本"');

    expect(currentChangesStart).toBeGreaterThan(-1);
    expect(changeFilesIndex).toBeGreaterThan(currentChangesStart);
    expect(commitVersionIndex).toBeGreaterThan(changeFilesIndex);
    expect(historyIndex).toBeGreaterThan(commitVersionIndex);
  });

  it('keeps branch selection out of the connect-remote form', () => {
    const source = readPanelSource();
    const connectFormStart = source.indexOf("{onlineMode === 'connect' ? (");
    const createFormStart = source.indexOf('仓库名称', connectFormStart);
    const onlineInfoStart = source.indexOf('const renderOnlineInfoCard = () =>');

    expect(connectFormStart).toBeGreaterThan(-1);
    expect(createFormStart).toBeGreaterThan(connectFormStart);
    expect(onlineInfoStart).toBeGreaterThan(createFormStart);

    const connectFormSource = source.slice(connectFormStart, createFormStart);
    const onlineInfoSource = source.slice(onlineInfoStart);

    expect(connectFormSource).toContain('仓库 URL');
    expect(connectFormSource).toContain('连接已有仓库');
    expect(connectFormSource).not.toContain('在线分支');
    expect(connectFormSource).not.toContain('defaultBranch');
    expect(connectFormSource).not.toContain('请选择在线分支');
    expect(connectFormSource).not.toContain('setDefaultBranch');
    expect(connectFormSource).not.toContain('remoteBranchOptions.map');
    expect(onlineInfoSource).toContain('线上分支');
    expect(onlineInfoSource).toContain('renderOnlineBranchSelect()');
  });

  it('treats branch selectors as read-only status views', () => {
    const panelSource = readPanelSource();

    expect(panelSource).toContain("const [viewedBranch, setViewedBranch] = useState('');");
    expect(panelSource).toContain("const [viewedRemoteBranch, setViewedRemoteBranch] = useState('');");
    expect(panelSource).toContain('branch: historicalVersion ? undefined : requestedBranch || undefined');
    expect(panelSource).toContain('remoteBranch: historicalVersion ? undefined : requestedRemoteBranch || undefined');
    expect(panelSource).toContain('<InfoRow label="工作区分支">');
    expect(panelSource).toContain('<InfoRow label="查看分支">');
    expect(panelSource).toContain('const branchView = status?.branchView;');
    expect(panelSource).toContain('branchView?.recentCommits');
    expect(panelSource).toContain('branchView?.remoteComparison');
    expect(panelSource).toContain('const canWriteViewedPair = Boolean(');
    expect(panelSource).toContain("getActionErrorCode(error) === 'BRANCH_NOT_FOUND'");
    expect(panelSource).toContain('查看的分支已不存在，已返回工作区分支');
    expect(panelSource).toContain('!canWriteViewedPair');
    expect(panelSource).not.toContain("| 'branch'");
    expect(panelSource).not.toContain('handleSwitchBranch');
    expect(panelSource).not.toContain('switchGitWorkspaceBranch');
    expect(panelSource).not.toContain("() => apiService.setGitWorkspaceRemote({ url, defaultBranch: branch })");
  });

  it('moves git management prompts into a dedicated skill tab', () => {
    const panelSource = readPanelSource();
    const drawerSource = readDrawerSource();

    expect(drawerSource).toContain('grid-cols-3');
    expect(drawerSource).toContain('<TabsTrigger value="skills"');
    expect(drawerSource).toContain('管理技能');
    expect(drawerSource).toContain('<VersionCollaborationPanel projectId={projectId} activeTab="skills" />');

    expect(panelSource).toContain("export type VersionCollaborationTab = 'local' | 'online' | 'skills' | 'all';");
    expect(panelSource).toContain("const showSkillPanel = activeTab === 'skills' || activeTab === 'all';");
    expect(panelSource).toContain('GIT_REPO_BEGINNER_GUIDE_SKILL_URL');
    expect(panelSource).toContain('https://github.com/lintendo/Axhub-Skills/blob/main/skills/git-repo-beginner-guide/SKILL.md');
    expect(panelSource).toContain('INSTALL_GIT_REPO_SKILL_PROMPT');
    expect(panelSource).toContain('版本管理、团队协作、异地办公，以及在多台设备间同步项目');
    expect(panelSource).toContain('<SectionCard title="管理技能">');
    expect(panelSource).toContain('复制提示词');
    expect(panelSource).not.toContain('branchPromptAction');
    expect(panelSource).not.toContain('handleCopyBranchPrompt');
    expect(panelSource).not.toContain('分支管理');
    expect(panelSource).not.toContain('复制分支处理提示词');
    expect(panelSource).not.toContain('apiService.getGitWorkspacePrompt');
    expect(panelSource).not.toContain('GitBranch');
  });

  it('caps the change preview without resize-observer layout feedback', () => {
    const panelSource = readPanelSource();

    expect(panelSource).toContain('const MAX_VISIBLE_CHANGE_ITEMS = 5;');
    expect(panelSource).toContain('getVisibleChangeItems(items, MAX_VISIBLE_CHANGE_ITEMS)');
    expect(panelSource).toContain('+{visibleChangeItems.remainingCount} 变更');
    expect(panelSource).not.toContain('ResizeObserver');
    expect(panelSource).not.toContain('measureCandidateVisibleRows');
    expect(panelSource).not.toContain('requestAnimationFrame');
  });

  it('renders historical versions as read-only local version snapshots', () => {
    const panelSource = readPanelSource();

    expect(panelSource).toContain('const historicalVersion = getHistoricalVersionFromLocation();');
    expect(panelSource).toContain('gitVersion: historicalVersion,');
    expect(panelSource).toContain('branch: historicalVersion ? undefined : requestedBranch || undefined');
    expect(panelSource).toContain('<InfoRow label="版本">');
    expect(panelSource).toContain('function getWorkspaceVersionText(');
    expect(panelSource).toContain('status.currentCommit?.shortHash');
    expect(panelSource).toContain('getWorkspaceVersionText(status)');
    expect(panelSource).toContain('<InfoRow label="版本提交信息">');
    expect(panelSource).toContain('status?.currentCommit?.message');
    expect(panelSource).toContain('!status?.isHistoricalVersion && status?.hasChanges ? (');
    expect(panelSource).toContain('status?.isHistoricalVersion && status?.hasChanges ? (');
  });

  it('uses consistent information value styling and avoids vague version fallbacks', () => {
    const panelSource = readPanelSource();
    const refreshAction = panelSource.indexOf('onClick={() => loadStatus()}');
    const localInfoStart = panelSource.indexOf('<InfoRow label="状态">', refreshAction);
    const localInfoEnd = panelSource.indexOf('{status?.isHistoricalVersion && status?.hasChanges ? (', localInfoStart);

    expect(refreshAction).toBeGreaterThan(-1);
    expect(localInfoStart).toBeGreaterThan(-1);
    expect(localInfoEnd).toBeGreaterThan(localInfoStart);

    const localInfoSource = panelSource.slice(localInfoStart, localInfoEnd);

    expect(panelSource).toContain('VersionInfoValue');
    expect(panelSource).toContain('function getWorkspaceVersionText(');
    expect(panelSource).toContain("if (!status) return '读取中';");
    expect(panelSource).toContain("return status.currentCommit?.shortHash || '版本号读取失败';");
    expect(localInfoSource).toContain('<StatusValue');
    expect(localInfoSource).toContain('<InfoValue contentClassName="font-mono">');
    expect(localInfoSource).toContain('getWorkspaceVersionText(status)');
    expect(localInfoSource).not.toContain('<VersionCommitCard');
    expect(localInfoSource).not.toContain("|| '未检测'");
    expect(localInfoSource).not.toContain('rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium');
  });

  it('shows project history as shared flat version rows without duplicating the current hash field', () => {
    const panelSource = readPanelSource();
    const localPanelStart = panelSource.indexOf('{showLocalPanel ? (');
    const onlinePanelStart = panelSource.indexOf('{showOnlinePanel ? (');
    const localPanelSource = panelSource.slice(localPanelStart, onlinePanelStart);
    const infoStart = localPanelSource.indexOf('<InfoRow label="状态">');
    const historicalDetailsStart = localPanelSource.indexOf('{status?.isHistoricalVersion ? (', infoStart);
    const currentInfoSource = localPanelSource.slice(infoStart, historicalDetailsStart);

    expect(panelSource).toContain('VersionCommitRow');
    expect(panelSource).toContain('const recentCommits = branchView?.recentCommits || status?.recentCommits || [];');
    expect(localPanelSource).toContain('<SectionCard title="历史版本" contentClassName="px-3.5 py-0">');
    expect(localPanelSource).toContain('<VersionCommitRow');
    expect(localPanelSource).toContain('index === 0');
    expect(localPanelSource).toContain('分支最新');
    expect(currentInfoSource).not.toContain('<InfoRow label="版本">');
    expect(currentInfoSource).not.toContain('getWorkspaceVersionText(status)');
  });

  it('generates version notes from an AI icon inside the workspace commit input', () => {
    const panelSource = readPanelSource();
    const commitSectionStart = panelSource.indexOf('<SectionCard title="提交版本">');
    const commitSectionEnd = panelSource.indexOf('</SectionCard>', commitSectionStart);
    const commitSectionSource = panelSource.slice(commitSectionStart, commitSectionEnd);

    expect(panelSource).toContain("import { generateGitCommitMessage } from '../domains/ai-generation/gitCommitMessageGeneration';");
    expect(panelSource).toContain('const handleGenerateCommitMessage = async () =>');
    expect(panelSource).toContain('await generateGitCommitMessage({');
    expect(panelSource).toContain("scope: 'workspace'");
    expect(panelSource).toContain('setCommitMessage(generatedMessage);');
    expect(panelSource).toContain("toast.error(error instanceof Error ? error.message : 'AI 生成版本记录失败');");
    expect(panelSource).toContain("import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';");
    expect(panelSource).toContain("import { Textarea } from '@/components/ui/textarea';");
    expect(commitSectionSource).toContain('<Textarea');
    expect(commitSectionSource).not.toContain('<Input');
    expect(commitSectionSource).toContain('AI生成版本记录');
    expect(commitSectionSource).toContain('<Sparkles');
    expect(commitSectionSource).toContain("generatingCommitMessage ? <Loader2 className=\"h-3.5 w-3.5 animate-spin\" /> : <Sparkles");
    expect(commitSectionSource).toContain('<TooltipProvider>');
    expect(commitSectionSource).toContain('<TooltipTrigger asChild>');
    expect(commitSectionSource).toContain('<TooltipContent side="top">AI生成版本记录</TooltipContent>');
    expect(commitSectionSource).not.toContain('title="AI生成版本记录"');
    expect(commitSectionSource).not.toContain('复制给 AI 处理');
    expect(panelSource).not.toContain('handleCopyCommitPrompt');
    expect(panelSource).not.toContain('function buildWorkspaceCommitMessageSuggestion(');
  });

  it('renders prototype version management as a two-tab version collaboration drawer', () => {
    const source = readVersionManagerSource();

    expect(source).toContain('<Sheet open={visible} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>');
    expect(source).toContain('<SheetTitle className="sr-only">版本和协作');
    expect(source).toContain('<Tabs defaultValue="local" className="flex h-full flex-col">');
    expect(source).toContain('<TabsTrigger value="local"');
    expect(source).toContain('本地仓库');
    expect(source).toContain('<TabsTrigger value="online"');
    expect(source).toContain('在线仓库');
    expect(source).not.toContain('<TabsTrigger value="skills"');
    expect(source).not.toContain('管理技能');
    expect(source).not.toContain('<DialogContent');
    expect(source).not.toContain('版本管理 -');
  });

  it('keeps prototype local changes as status-only while preserving history actions', () => {
    const source = readVersionManagerSource();
    const localTabStart = source.indexOf('<TabsContent value="local"');
    const onlineTabStart = source.indexOf('<TabsContent value="online"');
    const localTabSource = source.slice(localTabStart, onlineTabStart);

    expect(source).toContain('function getPrototypeLocalStatusText(');
    expect(source).toContain('const localStatusText = getPrototypeLocalStatusText({');
    expect(localTabSource).toContain('{localStatusText}');
    expect(localTabSource).not.toContain('uncommittedFiles');
    expect(localTabSource).not.toContain('changedFilesCount');
    expect(localTabSource).not.toContain('ChangeItemList');
    expect(localTabSource).toContain('aria-label="预览历史版本"');
    expect(localTabSource).toContain('aria-label="恢复此版本"');
    expect(localTabSource).not.toContain('title="预览历史版本"');
    expect(localTabSource).not.toContain('title="恢复此版本"');
  });

  it('shows hover tooltips for prototype history icon buttons', () => {
    const source = readVersionManagerSource();
    const localTabStart = source.indexOf('<TabsContent value="local"');
    const onlineTabStart = source.indexOf('<TabsContent value="online"');
    const localTabSource = source.slice(localTabStart, onlineTabStart);

    expect(source).toContain("import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';");
    expect(localTabSource).toContain('<TooltipProvider>');
    expect(localTabSource).toContain('<TooltipTrigger asChild>');
    expect(localTabSource).toContain('<TooltipContent side="top">预览历史版本</TooltipContent>');
    expect(localTabSource).toContain('<TooltipContent side="top">恢复此版本</TooltipContent>');
    expect(localTabSource).not.toContain('title="预览历史版本"');
    expect(localTabSource).not.toContain('title="恢复此版本"');
  });

  it('filters prototype history entries that have no current prototype entry', () => {
    const source = readVersionManagerSource();
    const localTabStart = source.indexOf('<TabsContent value="local"');
    const onlineTabStart = source.indexOf('<TabsContent value="online"');
    const localTabSource = source.slice(localTabStart, onlineTabStart);

    expect(source).toContain('hasPrototype?: boolean;');
    expect(source).toContain("data.commits.filter((commit: CommitItem) => commit.hasPrototype !== false)");
    expect(localTabSource).toContain('const canPreview = commit.hasPrototype !== false;');
    expect(localTabSource).toContain('{canPreview ? (');
    expect(source).toContain('这个历史版本里还没有当前原型，无法预览。');
    expect(source).not.toContain('该版本没有原型文件');
  });

  it('probes historical preview entries and opens only versions that are already ready', () => {
    const source = readVersionManagerSource();

    expect(source).toContain('function resolvePrototypeVersionPreviewUrl(');
    expect(source).toContain('targetItem?.clientUrl || targetItem?.previewUrl');
    expect(source).toContain('new URL(value, runtimeOrigin).toString()');
    expect(source).toContain("import { probeGitVersionEntry } from './gitVersionPreview';");
    expect(source).toContain('prototypeUrl?: string | null;');
    expect(source).toContain('previewReady?: boolean;');
    expect(source).toContain('probeGitVersionEntry({');
    expect(source).toContain('if (commit.previewReady && commit.prototypeUrl) {');
    expect(source).toContain("window.open(resolvePrototypeVersionPreviewUrl(item, commit.prototypeUrl), '_blank', 'noopener,noreferrer')");
    expect(source).toContain("toast.info('正在准备历史版本预览，完成后请再次点击预览');");
    expect(source).toContain('previewReady: true,');
    expect(source).toContain("toast.success('历史版本已准备好，请再次点击预览');");

    const buildRequestStart = source.indexOf("const response = await fetch(withProjectScope('/api/git/build-version', projectScope)");
    const buildHandlerEnd = source.indexOf('const handleFetchRemote', buildRequestStart);
    const buildRequestSource = source.slice(buildRequestStart, buildHandlerEnd);
    expect(buildRequestStart).toBeGreaterThan(-1);
    expect(buildHandlerEnd).toBeGreaterThan(buildRequestStart);
    expect(buildRequestSource).not.toContain('window.open(');
  });

  it('generates version notes from an AI icon inside the prototype commit input', () => {
    const source = readVersionManagerSource();
    const localTabStart = source.indexOf('<TabsContent value="local"');
    const onlineTabStart = source.indexOf('<TabsContent value="online"');
    const localTabSource = source.slice(localTabStart, onlineTabStart);

    expect(source).toContain("import { generateGitCommitMessage } from '../domains/ai-generation/gitCommitMessageGeneration';");
    expect(source).toContain('const handleGenerateCommitMessage = async () =>');
    expect(source).toContain('await generateGitCommitMessage({');
    expect(source).toContain("scope: 'prototype'");
    expect(source).toContain('setCommitMessage(generatedMessage);');
    expect(source).toContain("toast.error(error instanceof Error ? error.message : 'AI 生成版本记录失败');");
    expect(source).toContain("import { Textarea } from '@/components/ui/textarea';");
    expect(localTabSource).toContain('<Textarea');
    expect(localTabSource).not.toContain('<Input');
    expect(localTabSource).toContain('AI生成版本记录');
    expect(localTabSource).toContain('<Sparkles');
    expect(localTabSource).toContain("generatingCommitMessage ? <Loader2 className=\"h-3.5 w-3.5 animate-spin\" /> : <Sparkles");
    expect(localTabSource).toContain('<TooltipProvider>');
    expect(localTabSource).toContain('<TooltipTrigger asChild>');
    expect(localTabSource).toContain('<TooltipContent side="top">AI生成版本记录</TooltipContent>');
    expect(localTabSource).not.toContain('title="AI生成版本记录"');
    expect(localTabSource).not.toContain('PromptActionButton');
    expect(localTabSource).not.toContain('复制给 AI 处理');
    expect(source).not.toContain('function buildPrototypeCommitMessageSuggestion(');
  });

  it('keeps prototype local tab minimal until repository data is actionable', () => {
    const source = readVersionManagerSource();
    const localTabStart = source.indexOf('<TabsContent value="local"');
    const onlineTabStart = source.indexOf('<TabsContent value="online"');
    const localTabSource = source.slice(localTabStart, onlineTabStart);

    expect(source).toContain("const [loadedHistoryPath, setLoadedHistoryPath] = useState('');");
    expect(source).toContain('const hasLoadedLocalHistory = loadedHistoryPath === targetPath;');
    expect(source).toContain('const showLocalSetupHint = hasLoadedLocalHistory && Boolean(gitUnavailableState);');
    expect(source).toContain('const showLocalStatus = hasLoadedLocalHistory && !showLocalSetupHint && Boolean(item && targetPath);');
    expect(source).toContain('const showLocalCommit = showLocalStatus && hasUncommitted;');
    expect(source).toContain('const showLocalHistory = showLocalStatus && commits.length > 0;');
    expect(localTabSource).toContain('{showLocalSetupHint ? renderSetupHint(gitUnavailableState?.description || \'\') : null}');
    expect(localTabSource).toContain('{showLocalStatus ? (');
    expect(localTabSource).toContain('{showLocalCommit ? (');
    expect(localTabSource).toContain('{showLocalHistory ? (');
    expect(localTabSource).not.toContain('暂无版本历史');
  });

  it('keeps online sync descriptions concise and folds prototype scope into the subtitle', () => {
    const panelSource = readPanelSource();
    const source = readVersionManagerSource();
    const onlineTabStart = source.indexOf('<TabsContent value="online"');
    const onlineTabSource = source.slice(onlineTabStart);

    expect(source).toContain('const hasLoadedWorkspaceStatus = Boolean(workspaceStatus);');
    expect(source).toContain('const showOnlineSetupHint = hasLoadedWorkspaceStatus && (!isRepositoryReady || !hasConfiguredRemote);');
    expect(source).toContain('const showOnlineContent = hasLoadedWorkspaceStatus && !showOnlineSetupHint;');
    expect(source).toContain('const showOnlineIncoming = showOnlineContent && incomingTotal > 0;');
    expect(source).toContain('const showOnlineOutgoing = showOnlineContent && outgoingTotal > 0;');
    expect(onlineTabSource).toContain('{showOnlineSetupHint ? renderSetupHint(onlineSetupDescription) : null}');
    expect(onlineTabSource).toContain('{showOnlineContent ? (');
    expect(onlineTabSource).toContain('{showOnlineIncoming ? (');
    expect(onlineTabSource).toContain('{showOnlineOutgoing ? (');
    expect(panelSource).toContain("description={`从线上 ${viewedRemoteComparison?.branch || onlineBranchValue || '当前'} 同步到本地，涉及 ${incomingTotal} 个文件。`}");
    expect(panelSource).toContain("description={`推送到线上 ${viewedRemoteComparison?.branch || onlineBranchValue || '当前'}，涉及 ${outgoingTotal} 个文件。`}");
    expect(onlineTabSource).toContain("description={`从线上 ${workspaceStatus?.remoteComparison?.branch || '当前'} 同步整个项目，当前原型涉及 ${incomingTotal} 个文件。`}");
    expect(onlineTabSource).toContain("description={`推送整个项目到线上 ${workspaceStatus?.remoteComparison?.branch || '当前'}，当前原型涉及 ${outgoingTotal} 个文件。`}");
    expect(onlineTabSource).not.toContain('note=');
    expect(onlineTabSource).not.toContain('仅显示当前原型相关变更，实际会同步整个项目。');
    expect(panelSource).not.toContain('同步下来后，本地将更新到线上');
    expect(panelSource).not.toContain('推送上去后，线上');
    expect(onlineTabSource).not.toContain('同步下来后，当前原型将更新到线上');
    expect(onlineTabSource).not.toContain('推送上去后，线上');
    expect(onlineTabSource).not.toContain("getPrototypeOnlineChangeText(incomingTotal, '当前原型有线上更新', '当前原型暂无线上更新')");
    expect(onlineTabSource).not.toContain("getPrototypeOnlineChangeText(outgoingTotal, '当前原型待同步到在线', '当前原型暂无待同步内容')");
  });

  it('keeps both sync directions visible in shared online repository tabs', () => {
    const cardsSource = readVersionCardsSource();
    const panelSource = readPanelSource();
    const managerSource = readVersionManagerSource();

    expect(cardsSource).toContain('export function VersionSyncTabs(');
    expect(cardsSource).toContain('<Tabs defaultValue="incoming"');
    expect(cardsSource).toContain('<TabsTrigger value="incoming"');
    expect(cardsSource).toContain('同步下来');
    expect(cardsSource).toContain('<TabsTrigger value="outgoing"');
    expect(cardsSource).toContain('推送上去');
    expect(cardsSource).toContain('暂无线上更新');
    expect(cardsSource).toContain('暂无待推送内容');
    expect(panelSource).toContain('<VersionSyncTabs');
    expect(managerSource).toContain('<VersionSyncTabs');
    expect(panelSource).toContain('incoming={incomingChangeItems.length > 0 ? (');
    expect(panelSource).toContain('outgoing={outgoingChangeItems.length > 0 ? (');
    expect(managerSource).toContain('incoming={showOnlineIncoming ? (');
    expect(managerSource).toContain('outgoing={showOnlineOutgoing ? (');
    expect(panelSource).toContain('推送上去');
    expect(managerSource).toContain('推送上去');
  });

  it('uses shared version cards for project sync cards and prototype history', () => {
    const panelSource = readPanelSource();
    const managerSource = readVersionManagerSource();

    expect(panelSource).toContain("from './VersionCards';");
    expect(managerSource).toContain("from './VersionCards';");
    expect(panelSource).not.toContain('<VersionCommitCard');
    expect(panelSource).toContain('<VersionChangeCard');
    expect(managerSource).toContain('<VersionCommitRow');
    expect(managerSource).not.toContain('<VersionCommitCard');
    expect(managerSource).toContain('<VersionChangeCard');
    expect(panelSource).toContain('recentCommits={incomingRecentCommits}');
    expect(panelSource).toContain('recentCommits={outgoingRecentCommits}');
    expect(managerSource).toContain('recentCommits={incomingRecentCommits}');
    expect(managerSource).toContain('recentCommits={outgoingRecentCommits}');
  });

  it('keeps full version log tooltip readable and focused on log text', () => {
    const source = readVersionCardsSource();
    const tooltipStart = source.indexOf('function VersionLogTooltipButton');
    const commitCardStart = source.indexOf('export function VersionCommitCard');
    const tooltipSource = source.slice(tooltipStart, commitCardStart);

    expect(tooltipSource).toContain('bg-background text-foreground border border-border shadow-lg');
    expect(tooltipSource).toContain('arrowClassName="bg-background fill-background"');
    expect(tooltipSource).toContain("const logText = commit.fullMessage || commit.message || '无更新说明';");
    expect(tooltipSource).toContain('{logText}');
    expect(tooltipSource).not.toContain('<code');
    expect(tooltipSource).not.toContain("commit.author || 'Unknown'");
    expect(tooltipSource).not.toContain('formatVersionCommitTimestamp(commit.timestamp, commit.date)');
  });

  it('keeps online information card focused on connection fields instead of version compare cards', () => {
    const source = readPanelSource();
    const infoStart = source.indexOf('const renderOnlineInfoCard = () => (');
    const infoEnd = source.indexOf('    return (', infoStart);
    const infoSource = source.slice(infoStart, infoEnd);

    expect(infoSource).toContain('<InfoRow label="状态">');
    expect(infoSource).toContain('<InfoRow label="线上分支">');
    expect(infoSource).toContain('<InfoRow label="仓库">');
    expect(infoSource).not.toContain('<VersionCommitCard');
    expect(infoSource).not.toContain('localHeadCommit');
    expect(infoSource).not.toContain('remoteHeadCommit');
  });

  it('does not show zero-version titles when only file differences are known', () => {
    const cardsSource = readVersionCardsSource();
    const panelSource = readPanelSource();
    const managerSource = readVersionManagerSource();
    const changeCardStart = cardsSource.indexOf('export function VersionChangeCard');
    const changeCardSource = cardsSource.slice(changeCardStart);

    expect(cardsSource).toContain('export function getVersionChangeTitle(');
    expect(cardsSource).toContain("return kind === 'incoming' ? '线上有更新' : '本地待同步';");
    expect(changeCardSource).not.toContain('版本明细');
    expect(changeCardSource).toContain('影响资源');
    expect(changeCardSource).toContain('divide-y divide-border/50');
    expect(changeCardSource).not.toContain('<VersionCommitCard');
    expect(panelSource).toContain("getVersionChangeTitle('incoming', behindCount)");
    expect(panelSource).toContain("getVersionChangeTitle('outgoing', aheadCount)");
    expect(managerSource).toContain("getVersionChangeTitle('incoming', behindCount)");
    expect(managerSource).toContain("getVersionChangeTitle('outgoing', aheadCount)");
    expect(cardsSource).not.toContain('allCommits: VersionCardCommit[];');
    expect(cardsSource).not.toContain('<VersionLogTooltipButton commits={allCommits} />');
    expect(panelSource).not.toContain('allCommits={incomingAllCommits}');
    expect(panelSource).not.toContain('allCommits={outgoingAllCommits}');
    expect(managerSource).not.toContain('allCommits={incomingAllCommits}');
    expect(managerSource).not.toContain('allCommits={outgoingAllCommits}');
    expect(panelSource).not.toContain('title={`线上领先 ${behindCount} 个版本`}');
    expect(panelSource).not.toContain('title={`本地领先 ${aheadCount} 个版本`}');
    expect(managerSource).not.toContain('title={`线上领先 ${behindCount} 个版本`}');
    expect(managerSource).not.toContain('title={`本地领先 ${aheadCount} 个版本`}');
  });
});
