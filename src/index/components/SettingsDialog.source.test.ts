import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(resolve(__dirname, './SettingsDialog.tsx'), 'utf8');
}

function readIndexDialogsSource() {
  return readFileSync(resolve(__dirname, './app/IndexDialogs.tsx'), 'utf8');
}

function readVersionCollaborationPanelSource() {
  return readFileSync(resolve(__dirname, './VersionCollaborationPanel.tsx'), 'utf8');
}

function readWorkspaceVersionCollaborationDrawerSource() {
  return readFileSync(resolve(__dirname, './WorkspaceVersionCollaborationDrawer.tsx'), 'utf8');
}

describe('SettingsDialog source', () => {
  it('can open directly on the AI settings tab', () => {
    const source = readSource();

    expect(source).toContain("export type SettingsDialogInitialTab = 'project' | 'update' | 'ai' | 'network';");
    expect(source).toContain('initialTab?: SettingsDialogInitialTab;');
    expect(source).toContain('initialAcpRuntime?: AssistantRuntimeResponse | null;');
    expect(source).toContain('initialAcpFailureSource?: string;');
    expect(source).toContain('initialAcpFailureMessage?: string;');
    expect(source).toContain('export interface SettingsDialogAIContext');
    expect(source).toContain("export default function SettingsDialog({ open, projectId, onClose, onSaved, makeClientUpdateReminderVisible, onMakeClientUpdateReminderSeen, onMakeClientUpdateAvailabilityChange, onOpenVersionCollaboration, initialTab = 'project', initialAcpRuntime = null, initialAcpFailureSource = '', initialAcpFailureMessage = '' }: SettingsDialogProps)");
    expect(source).toContain("const [activeTab, setActiveTab] = useState<SettingsDialogInitialTab>(initialTab);");
    expect(source).toContain('setActiveTab(initialTab);');
  });

  it('receives the workspace project id and scopes project-owned settings requests', () => {
    const source = readSource();
    const dialogsSource = readIndexDialogsSource();

    expect(source).toContain('projectId: string;');
    expect(source).toContain('withProjectScope(url, requireProjectScope(projectId))');
    expect(source).toContain("fetch(buildSettingsUrl('/api/config'))");
    expect(source).toContain("fetch(buildSettingsUrl('/api/themes'))");
    expect(source).toContain("fetch(buildSettingsUrl('/api/config'), {");
    expect(source).toContain("fetch(buildSettingsUrl('/api/config/ai-image/test'), {");
    expect(source).toContain("fetch(buildSettingsUrl('/api/themes/sync-design'), {");
    expect(source).not.toContain("fetch('/api/config')");
    expect(source).not.toContain("fetch('/api/themes')");
    expect(dialogsSource).toContain('settingsDialogProjectId: string;');
    expect(dialogsSource).toContain('projectId={settingsDialogProjectId}');
  });

  it('uses the tab switcher as the drawer title control', () => {
    const source = readSource();

    expect(source).toContain("from '@/components/ui/tabs'");
    expect(source).toContain('<Tabs value={activeTab} onValueChange={handleTabValueChange} className="flex h-full flex-col"');
    expect(source).toContain('<SheetTitle className="sr-only">项目设置 / 项目更新 / AI 设置 / 网络配置</SheetTitle>');
    expect(source).toContain('<SheetHeader className="border-b px-5 py-3.5">');
    expect(source).toContain('<div className="flex items-center justify-between gap-3">');
    expect(source).toContain('grid-cols-4');
    expect(source).toContain('<TabsTrigger value="project"');
    expect(source).toContain('项目设置');
    expect(source).toContain('<TabsTrigger value="update"');
    expect(source).toContain('项目更新');
    expect(source).toContain('<TabsTrigger value="ai"');
    expect(source).toContain('AI 设置');
    expect(source).toContain('<TabsTrigger value="network"');
    expect(source).toContain('网络配置');
    expect(source).not.toContain('<SheetTitle className="m-0 text-[14px] font-medium leading-none">项目设置</SheetTitle>');
    expect(source).not.toContain('<div className="border-b px-5 py-3">');
  });

  it('does not expose automation execution preferences in project settings', () => {
    const source = readSource();

    expect(source).not.toContain('自动化执行');
    expect(source).not.toContain('默认 Genie 供应商');
    expect(source).not.toContain('默认 IDE');
  });

  it('exposes local and LAN share settings without the legacy allow-LAN switch', () => {
    const source = readSource();
    const handleSaveSource = source.slice(
      source.indexOf('const handleSave = async () => {'),
      source.indexOf('\n    return (', source.indexOf('const handleSave = async () => {')),
    );
    const projectTabSource = source.slice(
      source.indexOf('<TabsContent value="project"'),
      source.indexOf('<TabsContent value="update"'),
    );
    const aiTabSource = source.slice(
      source.indexOf('<TabsContent value="ai"'),
      source.indexOf('<TabsContent value="network"'),
    );
    const networkTabSource = source.slice(
      source.indexOf('<TabsContent value="network"'),
      source.indexOf('<SheetFooter'),
    );

    expect(source).toContain("import { Switch } from '@/components/ui/switch';");
    expect(source).toContain('lanHost: string;');
    expect(source).toContain('skipLanPreviewAuth?: boolean;');
    expect(source).toContain('skipLanPreviewAuth: boolean;');
    expect(source).toContain('availableLANHosts?: string[];');
    expect(source).toContain('lanHost: config.server.lanHost || config.availableLANHosts?.[0] ||');
    expect(source).toContain('skipLanPreviewAuth: config.server.skipLanPreviewAuth === true');
    expect(source).toContain('const [availableLANHosts, setAvailableLANHosts] = useState<string[]>([]);');
    expect(source).toContain('setAvailableLANHosts(Array.isArray(config.availableLANHosts) ? config.availableLANHosts : []);');
    expect(source).toContain('lanHost: formState.lanHost.trim()');
    expect(source).toContain('skipLanPreviewAuth: formState.skipLanPreviewAuth');
    expect(source).toContain('window.__AXHUB_SHARE_HOSTS__ = {');
    expect(projectTabSource).not.toContain('本地地址');
    expect(projectTabSource).not.toContain('局域网地址');
    expect(projectTabSource).not.toContain('局域网访问密码');
    expect(projectTabSource).not.toContain('全局二维码');
    expect(aiTabSource).not.toContain('本地地址');
    expect(aiTabSource).not.toContain('局域网地址');
    expect(networkTabSource).toContain('网络配置');
    expect(networkTabSource).toContain('配置服务监听地址与网络访问范围。');
    expect(networkTabSource).toContain('本地地址');
    expect(networkTabSource).toContain('局域网地址');
    expect(networkTabSource).toContain('availableLANHosts.slice(0, 4).map');
    expect(networkTabSource).toContain("onClick={() => updateField('lanHost', host)}");
    expect(networkTabSource).toContain('rounded-full border border-border bg-muted/40');
    expect(networkTabSource).toContain("updateField('lanHost'");
    expect(networkTabSource).toContain('局域网访问密码');
    expect(networkTabSource).toContain('全局二维码');
    expect(source).toContain('apiService.getLanAccessStatus');
    expect(source).toContain('apiService.setLanAccessPassword');
    expect(source).toContain('apiService.clearLanAccessPassword');
    expect(source).toContain('apiService.createLanAccessShareUrl');
    expect(networkTabSource).toContain('预览免验证');
    expect(networkTabSource).toContain('开启后，局域网可直接访问当前项目预览；管理端和 API 仍需验证。');
    expect(networkTabSource).toContain('checked={formState.skipLanPreviewAuth}');
    expect(networkTabSource).toContain("onCheckedChange={(checked) => updateField('skipLanPreviewAuth', checked === true)}");
    expect(handleSaveSource).toContain('await loadConfig();');
    expect(source).not.toContain('服务配置');
    expect(source).not.toContain('allowLAN: boolean;');
    expect(source).not.toContain('formState.allowLAN');
    expect(source).not.toContain('允许局域网访问');
    expect(source).not.toContain('<SelectTrigger className="w-[168px] shrink-0">');
    expect(source).not.toContain('<SelectValue placeholder="选择地址" />');
  });

  it('loads Make client update status from the update tab and applies updates through project APIs', () => {
    const source = readSource();
    const projectIndex = source.indexOf('<TabsTrigger value="project"');
    const updateIndex = source.indexOf('<TabsTrigger value="update"');
    const aiIndex = source.indexOf('<TabsTrigger value="ai"');
    const networkIndex = source.indexOf('<TabsTrigger value="network"');
    const updateTabSource = source.slice(
      source.indexOf('<TabsContent value="update"'),
      source.indexOf('<TabsContent value="ai"'),
    );

    expect(projectIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(projectIndex);
    expect(aiIndex).toBeGreaterThan(updateIndex);
    expect(networkIndex).toBeGreaterThan(aiIndex);
    expect(source).toContain('MakeClientUpdateStatus');
    expect(source).toContain('MakeClientUpdateApplyResult');
    expect(source).toContain('makeClientUpdateStatus');
    expect(source).toContain('loadMakeClientUpdateStatus');
    expect(source).toContain('handleApplyMakeClientUpdate');
    expect(source).toContain('apiService.getMakeClientUpdateStatus');
    expect(source).toContain('apiService.applyMakeClientUpdate');
    expect(source).toContain("if (value === 'update')");
    expect(updateTabSource).toContain('当前客户端版本');
    expect(updateTabSource).toContain('最新模板版本');
    expect(updateTabSource).toContain('项目路径');
    expect(updateTabSource).toContain("makeClientUpdateStatus?.metadataSource === 'bundled'");
    expect(updateTabSource).toContain('未能连接线上更新源，当前显示本机可用版本。');
    expect(updateTabSource).toContain('版本说明');
    expect(updateTabSource).toContain('makeClientUpdateStatus?.releaseNotes');
    expect(updateTabSource).toContain('whitespace-pre-wrap');
    expect(updateTabSource).not.toContain('数据备份方式');
    expect(updateTabSource).not.toContain('自动压缩包备份');
    expect(updateTabSource).not.toContain('更新方式');
    expect(source).not.toContain('Git 保护');
    expect(updateTabSource).not.toContain('Git 状态');
    expect(updateTabSource).not.toContain('工作区有改动');
    expect(updateTabSource).toContain('检测更新');
    expect(updateTabSource).toContain('开始更新');
    expect(updateTabSource).toContain('更新前会自动备份本次覆盖的文件。你也可以先通过 Git 提交一版作为额外备份。');
    expect(updateTabSource).toContain('打开版本管理');
    expect(updateTabSource).toContain('{makeClientUpdateAvailable && !makeClientUpdateApplying ? (');
    expect(source).toContain('onOpenVersionCollaboration?: () => void;');
    expect(source).toContain('handleOpenVersionCollaboration');
    expect(source).toContain('onOpenVersionCollaboration?.();');
    expect(updateTabSource).toContain('正在更新项目');
    expect(updateTabSource).toContain('正在执行完整模板更新流程，请保持此窗口打开。');
    expect(updateTabSource).toContain('更新失败时会保留错误诊断和备份位置，方便继续处理。');
    expect(updateTabSource).toContain('makeClientUpdateResult.postUpdateWarning');
    expect(updateTabSource).toContain('项目模板文件已更新完成。依赖安装或项目清单同步需要稍后重试。');
    expect(updateTabSource).toContain('后续步骤需要处理');
    expect(source).toContain('项目模板已更新完成；依赖安装或清单同步需要稍后重试');
    expect(updateTabSource).not.toContain('MAKE_CLIENT_UPDATE_STEPS.map');
    expect(source).not.toContain('检测版本');
    expect(source).not.toContain('下载模板');
    expect(source).not.toContain('创建备份中');
    expect(source).not.toContain('覆盖文件中');
    expect(source).not.toContain('写入版本');
    expect(source).not.toContain('安装依赖/同步元数据');
    expect(updateTabSource).toContain('复制给 AI 处理');
    expect(updateTabSource).toContain('backupRoot');
    expect(updateTabSource).toContain('备份位置');
    expect(updateTabSource).toContain('backupZipPath');
    expect(updateTabSource).toContain('备份压缩包');
    expect(updateTabSource).toContain('上次更新记录');
    expect(updateTabSource).toContain('版本变化');
    expect(updateTabSource).toContain('覆盖文件');
    expect(updateTabSource).toContain('复制给 AI 处理/还原');
    expect(source).toContain('我不懂命令行、Node.js、npm 或 pnpm。请你把每一步都说清楚');
    expect(source).not.toContain('我不懂命令行、Git、Node.js、npm 或 pnpm');
    expect(source).toContain("const visibleMakeClientUpdateBlocker = makeClientUpdateAvailable ? getVisibleMakeClientUpdateBlocker(makeClientUpdateStatus) : '';");
    expect(source).toContain('const latestMakeClientUpdateBackup = makeClientUpdateResult?.backupRecord || makeClientUpdateStatus?.lastBackup || null;');
    expect(updateTabSource).not.toContain('当前项目没有可用的 Git 版本记录，会先备份再覆盖官方文件');
    expect(source).toContain('getVisibleMakeClientUpdateBlocker');
    expect(source).toContain('makeClientUpdateCanApply');
    expect(source).toContain('buildMakeClientUpdateFailurePrompt');
    expect(source).toContain('formatMakeClientUpdateError');
    expect(source).not.toContain('formatMakeClientUpdateGitStatus');
    expect(source).not.toContain('isMakeClientUpdateGitReady');
    expect(source).not.toContain('isMakeClientUpdateBackupMode');
    expect(updateTabSource).not.toContain('回退');
  });

  it('marks unread project updates in the settings tab switcher', () => {
    const source = readSource();
    const updateTriggerSource = source.slice(
      source.indexOf('<TabsTrigger value="update"'),
      source.indexOf('</TabsTrigger>', source.indexOf('<TabsTrigger value="update"')),
    );

    expect(source).toContain('const makeClientUpdateAvailable = makeClientUpdateStatus?.updateAvailable === true;');
    expect(source).toContain('makeClientUpdateReminderVisible?: boolean;');
    expect(source).toContain('onMakeClientUpdateReminderSeen?: () => void;');
    expect(updateTriggerSource).toContain('relative');
    expect(updateTriggerSource).toContain('{makeClientUpdateReminderVisible ? (');
    expect(updateTriggerSource).toContain('aria-label="有项目更新"');
    expect(updateTriggerSource).toContain('bg-destructive');
    expect(source).toContain("if (value === 'update') {");
    expect(source).toContain('onMakeClientUpdateReminderSeen?.();');
  });

  it('notifies the page when make client update availability changes', () => {
    const source = readSource();

    expect(source).toContain('onMakeClientUpdateAvailabilityChange?: (status: MakeClientUpdateStatus | null) => void;');
    expect(source).toContain('onMakeClientUpdateAvailabilityChange,');
    expect(source).toContain('onMakeClientUpdateAvailabilityChange?.(status);');
    expect(source).toContain('onMakeClientUpdateAvailabilityChange?.(null);');
  });

  it('keeps version and collaboration out of project settings tabs', () => {
    const source = readSource();

    expect(source).not.toContain("import { VersionCollaborationPanel } from './VersionCollaborationPanel';");
    expect(source).not.toContain('<TabsTrigger value="version-collaboration"');
    expect(source).not.toContain('<TabsContent value="version-collaboration"');
    expect(source).not.toContain('<VersionCollaborationPanel />');
    expect(source).not.toContain("activeTab === 'update' || activeTab === 'version-collaboration'");
  });

  it('hosts version and collaboration in a standalone drawer with local and online tabs', () => {
    const panelSource = readVersionCollaborationPanelSource();
    const drawerPath = resolve(__dirname, './WorkspaceVersionCollaborationDrawer.tsx');
    const drawerSource = readWorkspaceVersionCollaborationDrawerSource();
    const apiSource = readFileSync(resolve(__dirname, '../services/api.ts'), 'utf8');

    expect(existsSync(drawerPath)).toBe(true);
    expect(drawerSource).toContain('export default function WorkspaceVersionCollaborationDrawer');
    expect(drawerSource).toContain('<Sheet');
    expect(drawerSource).toContain('<SheetTitle className="sr-only">版本和协作</SheetTitle>');
    expect(drawerSource).not.toContain('<h2');
    expect(drawerSource).toContain('<TabsTrigger value="local"');
    expect(drawerSource).toContain('本地仓库');
    expect(drawerSource).not.toContain('本地版本');
    expect(drawerSource).toContain('<TabsTrigger value="online"');
    expect(drawerSource).toContain('在线仓库');
    expect(drawerSource).not.toContain('在线版本');
    expect(drawerSource).toContain('<TabsTrigger value="skills"');
    expect(drawerSource).toContain('管理技能');
    expect(drawerSource).toContain('<VersionCollaborationPanel projectId={projectId} activeTab="local" />');
    expect(drawerSource).toContain('<VersionCollaborationPanel projectId={projectId} activeTab="online" />');
    expect(drawerSource).toContain('<VersionCollaborationPanel projectId={projectId} activeTab="skills" />');

    expect(panelSource).toContain('export function VersionCollaborationPanel({');
    expect(panelSource).toContain('projectId,');
    expect(panelSource).toContain('projectId: string;');
    expect(panelSource).toContain('activeTab?: VersionCollaborationTab;');
    expect(panelSource).toContain('apiService.getGitWorkspaceStatus');
    expect(panelSource).toContain('apiService.initGitWorkspace');
    expect(panelSource).toContain('apiService.commitGitWorkspace');
    expect(panelSource).toContain('apiService.setGitWorkspaceRemote');
    expect(panelSource).toContain('apiService.fetchGitWorkspace');
    expect(panelSource).toContain('apiService.syncDownGitWorkspace');
    expect(panelSource).toContain('apiService.pushGitWorkspace');
    expect(panelSource).not.toContain('apiService.switchGitWorkspaceBranch');
    expect(panelSource).toContain('apiService.createGitWorkspaceRemoteRepository');
    expect(panelSource).not.toContain('apiService.getGitWorkspacePrompt');
    expect(panelSource).toContain('信息');
    expect(panelSource).toContain('更改文件');
    expect(panelSource).toContain('提交版本');
    expect(panelSource).not.toContain('<h3 className="text-base font-semibold text-foreground">本地仓库</h3>');
    expect(panelSource).not.toContain('<h3 className="text-base font-semibold text-foreground">在线仓库</h3>');
    expect(panelSource).toContain('工作区分支');
    expect(panelSource).toContain('查看分支');
    expect(panelSource).toContain('localBranchOptions');
    expect(panelSource).not.toContain('handleSwitchBranch');
    expect(panelSource).toContain('<SelectValue placeholder="选择分支" />');
    expect(panelSource).not.toContain('切换分支失败');
    expect(panelSource).not.toContain('项目路径');
    expect(panelSource).toContain('flattenChangeGroups');
    expect(panelSource).toContain('groupLabel');
    expect(panelSource).toContain("const shouldShowGroupLabel = item.groupKey !== 'other';");
    expect(panelSource).toContain('{shouldShowGroupLabel ? (');
    expect(panelSource).toContain('更改文件');
    expect(panelSource).not.toContain('已经更改的内容');
    expect(panelSource).not.toContain('{group.label}');
    expect(panelSource).not.toContain('{group.fileCount} 个文件');
    expect(panelSource).toContain('一键初始化');
    expect(panelSource).toContain('提交版本');
    expect(panelSource).toContain('连接已有仓库');
    expect(panelSource).toContain('创建新仓库');
    expect(panelSource).toContain('仓库名称');
    expect(panelSource).toContain("const [onlineMode, setOnlineMode] = useState<'connect' | 'create'>('connect');");
    expect(panelSource).toContain('setCreateRepositoryName');
    expect(panelSource).toContain('同步下来');
    expect(panelSource).toContain('同步到在线');
    expect(panelSource).toContain('const hasConfiguredRemote = Boolean(status?.remote?.url);');
    expect(panelSource).toContain('const incomingChangeItems = useMemo(');
    expect(panelSource).toContain('const outgoingChangeItems = useMemo(');
    expect(panelSource).toContain('renderOnlineRemoteSetupCard()');
    expect(panelSource).toContain('renderOnlineInfoCard()');
    expect(panelSource).toContain('线上分支');
    expect(panelSource).toContain("getVersionChangeTitle('incoming', behindCount)");
    expect(panelSource).toContain("getVersionChangeTitle('outgoing', aheadCount)");
    expect(panelSource).toContain('incomingChangeItems.length > 0 ? (');
    expect(panelSource).toContain('outgoingChangeItems.length > 0 ? (');
    expect(panelSource).toContain('hasConfiguredRemote ? (');
    expect(panelSource).not.toContain('<SectionCard title="同步">');
    expect(panelSource).toContain('复制给 AI 处理');
    expect(panelSource).toContain('GIT_REPO_BEGINNER_GUIDE_SKILL_URL');
    expect(panelSource).toContain('INSTALL_GIT_REPO_SKILL_PROMPT');
    expect(panelSource).toContain('https://github.com/lintendo/Axhub-Skills/blob/main/skills/git-repo-beginner-guide/SKILL.md');
    expect(panelSource).toContain('版本管理、团队协作、异地办公，以及在多台设备间同步项目');
    expect(panelSource).toContain('<SectionCard title="管理技能">');
    expect(panelSource).toContain('复制提示词');
    expect(panelSource).not.toContain('branchPromptAction');
    expect(panelSource).not.toContain('handleCopyBranchPrompt');
    expect(panelSource).not.toContain('分支管理');
    expect(panelSource).not.toContain('复制分支处理提示词');
    expect(panelSource).toContain("const [commitMessage, setCommitMessage] = useState('');");
    expect(panelSource).toContain('showLocalPanel');
    expect(panelSource).toContain('showOnlinePanel');
    expect(panelSource).toContain('isRepositoryReady ? (');
    expect(panelSource).toContain('renderRepositoryNotReadyHint');
    expect(panelSource).toContain('本地仓库初始化后，才能连接或同步在线仓库。');
    expect(panelSource).toContain("当前项目还没有可用的本地版本记录");
    expect(panelSource).not.toContain('CHANGE_GROUP_PLACEHOLDER');
    expect(panelSource).not.toContain('remote.provider');
    expect(panelSource).not.toContain('remoteProvider');
    expect(panelSource).toContain('MAX_VISIBLE_CHANGE_ITEMS');
    expect(panelSource).toContain('getVisibleChangeItems');
    expect(panelSource).toContain('remainingCount');
    expect(panelSource).toContain('查看更多');
    expect(panelSource).toContain('+{visibleChangeItems.remainingCount}');
    expect(panelSource).toContain('getVisibleChangeItems(items, MAX_VISIBLE_CHANGE_ITEMS)');
    expect(panelSource).not.toContain('data-change-item-measure-list');
    expect(panelSource).not.toContain('data-change-item-measure-chip');
    expect(panelSource).not.toContain('data-change-item-measure-summary');
    expect(panelSource).not.toContain('measureCandidateVisibleRows');
    expect(panelSource).not.toContain('ResizeObserver');
    expect(panelSource).not.toContain('requestAnimationFrame');
    expect(panelSource).toContain('flex flex-wrap items-center gap-1.5 overflow-hidden');
    expect(panelSource).not.toContain('留空时使用当前分支');
    expect(panelSource).not.toContain('placeholder={status?.currentBranch || \'main\'}');
    expect(panelSource).not.toContain('setDefaultBranch(nextStatus.remote?.defaultBranch || nextStatus.currentBranch || \'\')');
    expect(panelSource).not.toContain("querySelectorAll<HTMLElement>('[data-change-item-chip]')");
    expect(panelSource).not.toContain('key={`measure:${item.id}`}');

    expect(apiSource).toContain('export interface GitWorkspaceRemoteConfig');
    expect(apiSource).toContain('url?: string;');
    expect(apiSource).toContain('defaultBranch?: string;');
    expect(apiSource).toContain('branch?: string;');
    expect(apiSource).toContain('remoteBranch?: string;');
    expect(apiSource).not.toContain('async switchGitWorkspaceBranch(branch: string)');
    expect(apiSource).toContain("async createGitWorkspaceRemoteRepository(payload: CreateGitWorkspaceRemoteRepositoryRequest, scope: ProjectScope)");
    expect(apiSource).not.toContain('remote.provider');
  });

  it('renders local AI execution agent preferences as a provider table above image settings', () => {
    const source = readSource();
    const acpConfigSource = readFileSync(resolve(__dirname, '../../common/acpModelConfig.ts'), 'utf8');
    const acpServiceIndex = source.indexOf('本地 ACP 服务');
    const localAiIndex = source.indexOf('AI Agent');
    const annotationAiIndex = source.indexOf('批注执行 AI');
    const imageGenerationIndex = source.indexOf('图片生成 AI');
    const localAiSource = source.slice(localAiIndex, annotationAiIndex);

    expect(acpServiceIndex).toBeGreaterThan(-1);
    expect(localAiIndex).toBeGreaterThan(-1);
    expect(annotationAiIndex).toBeGreaterThan(-1);
    expect(imageGenerationIndex).toBeGreaterThan(-1);
    expect(acpServiceIndex).toBeLessThan(localAiIndex);
    expect(localAiIndex).toBeLessThan(annotationAiIndex);
    expect(annotationAiIndex).toBeLessThan(imageGenerationIndex);
    expect(source).toContain('用于在网页端直接使用相关 AI Agent。');
    expect(source).toContain('执行 agent');
    expect(source).toContain('LOCAL_AI_AGENT_OPTIONS');
    expect(source).toContain("from '@/components/ui/table'");
    expect(source).toContain("from '@/components/ui/radio-group'");
    expect(source).toContain("from '@/components/ui/tooltip'");
    expect(localAiSource).toContain('<Table');
    expect(localAiSource).toContain('<TableHead');
    expect(localAiSource).toContain('默认');
    expect(localAiSource).not.toContain('执行\n');
    expect(localAiSource).not.toContain('默认执行');
    expect(localAiSource).toContain('供应商');
    expect(localAiSource).toContain('版本');
    expect(localAiSource).not.toContain('脚本版本');
    expect(localAiSource).toContain('上次测试');
    expect(localAiSource).not.toContain('<TableHead className="h-8 w-[96px] text-right text-xs">测试</TableHead>');
    expect(localAiSource).toContain('<TableHead className="h-8 w-[76px] px-2 text-xs">');
    expect(localAiSource).toContain('aria-label="默认说明"');
    expect(localAiSource).toContain('<TableHead className="h-8 w-[170px] px-2 text-xs">供应商</TableHead>');
    expect(localAiSource).toContain('<TableHead className="h-8 w-[180px] px-3 text-xs">');
    expect(localAiSource).toContain('<TableHead className="h-8 w-[230px] px-3 text-center text-xs">上次测试</TableHead>');
    expect(localAiSource).toContain('<TableCell className="w-[230px] max-w-[230px] px-3 py-2 text-center text-xs align-middle">');
    expect(localAiSource).toContain('<div className="inline-flex min-w-0 max-w-full items-center justify-center gap-2">');
    expect(localAiSource).toContain('<TableCell className="w-[180px] max-w-[180px] px-3 py-2 text-xs text-muted-foreground">');
    expect(localAiSource).toContain('className="block max-w-[144px] truncate font-mono text-[11px] leading-4"');
    expect(localAiSource).toContain('aria-label={`刷新 ${option.label} 版本`}');
    expect(localAiSource).toContain('<RefreshCw');
    expect(localAiSource).toContain('<RadioGroup');
    expect(localAiSource).toContain('<RadioGroupItem');
    expect(localAiSource).not.toContain('<Select');
    expect(localAiSource).toContain('用于原型生成和本地 AI 面板的默认 agent');
    expect(localAiSource).not.toContain('用于原型生成、批注执行和本地 AI 面板的默认 agent');
    expect(source).toContain("defaultPromptClient: formState.defaultPromptClient");
    expect(source).toContain("normalizePromptClientPreference(config.automation?.defaultPromptClient)");
    expect(source).toContain('配置本地可用的 AI Agent。');
    expect(source).toContain('defaultPromptClient: null');
    expect(source).toContain('ACP_PROVIDER_OPTIONS.map((option) => ({');
    expect(source).toContain('value: option.client');
    expect(source).toContain('provider: option.provider');
    expect(source).toContain('label: option.label');
    expect(source).toContain('versionKey: option.provider');
    for (const provider of ['claude', 'codex', 'opencode', 'cursor', 'qoder', 'codebuddy', 'reasonix', 'grok-build']) {
      expect(acpConfigSource).toContain(`provider: '${provider}'`);
      expect(acpConfigSource).toContain(`client: 'acp:${provider}'`);
    }
    expect(acpConfigSource).not.toContain("provider: 'gemini'");
    expect(acpConfigSource).not.toContain("client: 'acp:gemini'");
    for (const label of ['Claude Code', 'Codex CLI', 'OpenCode', 'Cursor CLI', 'Qoder CLI', 'CodeBuddy CLI', 'Reasonix CLI', 'Grok Build']) {
      expect(acpConfigSource).toContain(`label: '${label}'`);
    }
    expect(acpConfigSource).not.toContain("label: 'Gemini CLI'");
    expect(source).not.toContain("value: 'genie:codex'");
    expect(source).not.toContain('配置 Genie 默认使用的本地执行 agent。');
  });

  it('configures annotation AI separately from the default execution provider table', () => {
    const source = readSource();
    const aiTabSource = source.slice(
      source.indexOf('AI Agent'),
      source.indexOf('图片生成 AI'),
    );

    expect(source).toContain('annotationPromptClient: PromptClientPreference;');
    expect(source).toContain('annotationModel: string;');
    expect(source).toContain('agentRunConcurrency: number;');
    expect(source).toContain('annotationPromptClient: null');
    expect(source).toContain("annotationModel: ''");
    expect(source).toContain('agentRunConcurrency: 5');
    expect(source).toContain('normalizePromptClientPreference(config.automation?.annotationPromptClient)');
    expect(source).toContain('annotationModel: config.automation?.annotationModel ||');
    expect(source).toContain('agentRunConcurrency: sanitizeAgentRunConcurrency(config.automation?.agentRunConcurrency)');
    expect(source).toContain('annotationPromptClient: formState.annotationPromptClient || null');
    expect(source).toContain('annotationModel: formState.annotationModel.trim() || null');
    expect(source).toContain('agentRunConcurrency: sanitizeAgentRunConcurrency(formState.agentRunConcurrency)');
    expect(aiTabSource).toContain('批注执行 AI');
    expect(aiTabSource).toContain('可以单独为批注场景配置一个执行速度更快的 AI；不选择时使用上面的执行 Agent。');
    expect(aiTabSource).toContain('批注供应商');
    expect(aiTabSource).toContain('批注执行时优先使用的本地 ACP 供应商；不选择时使用上面的执行 Agent');
    expect(aiTabSource).toContain('value={formState.annotationPromptClient || undefined}');
    expect(aiTabSource).toContain("onValueChange={(value) => updateField('annotationPromptClient', normalizePromptClientPreference(value))}");
    expect(aiTabSource).toContain('clearable');
    expect(aiTabSource).toContain('hasValue={Boolean(formState.annotationPromptClient)}');
    expect(aiTabSource).toContain("onClear={() => updateField('annotationPromptClient', null)}");
    expect(aiTabSource).toContain('<SelectValue placeholder="默认供应商" />');
    expect(aiTabSource).toContain('批注执行模型');
    expect(aiTabSource).toContain('placeholder="例如输入自定义模型 ID"');
    expect(aiTabSource).not.toContain('placeholder="例如 gpt-5.5 / sonnet / auto"');
    expect(aiTabSource).toContain('AI 并发数');
    expect(aiTabSource).toContain('批量批注执行时同时发送的 AI 任务数量，默认 5。');
    expect(aiTabSource).toContain('min={1}');
    expect(aiTabSource).toContain('max={10}');
    expect(aiTabSource).toContain("onChange={(event) => updateField('agentRunConcurrency', sanitizeAgentRunConcurrency(event.target.value))}");
    expect(aiTabSource).toContain('<Select');
    expect(aiTabSource).toContain('LOCAL_AI_AGENT_OPTIONS.map((option) => (');
    expect(aiTabSource).not.toContain('模型配置');
    expect(aiTabSource).not.toContain('DialogContent');
    expect(aiTabSource).not.toContain('openai');
  });

  it('gates AI settings behind the local ACP service status', () => {
    const source = readSource();
    const aiTabSource = source.slice(
      source.indexOf('<TabsContent value="ai"'),
      source.indexOf('<TabsContent value="network"'),
    );

    expect(source).toContain('AssistantRuntimeResponse');
    expect(source).toContain('localAcpRuntime');
    expect(source).toContain('const localAcpConnected = localAcpRuntime?.health.status === \'ready\';');
    expect(source).toContain('const localAcpHasCorsFailure = isLocalAcpCorsFailure(localAcpRuntime, localAcpFailureContext?.message);');
    expect(source).toContain("const localAcpActionLabel = localAcpConnected || localAcpHasCorsFailure ? '重新检测' : '链接';");
    expect(source).toContain('formatLocalAcpCheckedAt');
    expect(source).toContain('handleLocalAcpRuntimeCheck');
    expect(source).toContain('handleLocalAcpRuntimeConnect');
    expect(source).toContain('handleLocalAcpRuntimeRefresh');
    expect(source).toContain('apiService.getAssistantRuntime({ autoStart: false');
    expect(source).toContain('apiService.getAssistantRuntime({ autoStart: true');
    expect(source).not.toContain("apiService.bootstrapAssistant({ mode: 'restart_existing', projectId: activeProjectId || projectId })");
    expect(aiTabSource).toContain('本地 ACP 服务');
    expect(aiTabSource).toContain('已链接');
    expect(aiTabSource).toContain('未链接');
    expect(aiTabSource).toContain('上次检测');
    expect(aiTabSource).toContain('onClick={localAcpHasCorsFailure || localAcpConnected ? handleLocalAcpRuntimeRefresh : handleLocalAcpRuntimeConnect}');
    expect(aiTabSource).toContain('{localAcpActionLabel}');
    expect(aiTabSource).not.toContain('onClick={() => handleLocalAcpRuntimeCheck()}');
    expect(aiTabSource).not.toContain('{localAcpChecking ? <Loader2');
    expect(aiTabSource).toContain('{localAcpConnected ? (');
    expect(aiTabSource).toContain('AI Agent');
    expect(aiTabSource).toContain('图片生成 AI');
    expect(aiTabSource).not.toContain('本地 ACP 服务未链接');
  });

  it('keeps the settings dialog open while local ACP link and refresh actions resolve', () => {
    const source = readSource();
    const connectSource = source.slice(
      source.indexOf('const handleLocalAcpRuntimeConnect = async () => {'),
      source.indexOf('const handleLocalAcpRuntimeRefresh = async () => {'),
    );
    const refreshSource = source.slice(
      source.indexOf('const handleLocalAcpRuntimeRefresh = async () => {'),
      source.indexOf('const loadMakeClientUpdateStatus = async'),
    );

    expect(source).toContain('const localAcpAutoCloseBlockedRef = useRef(false);');
    expect(source).toContain('const preserveSettingsDialogDuringLocalAcpAction = async <T,>(action: () => Promise<T>): Promise<T> => {');
    expect(source).toContain('localAcpAutoCloseBlockedRef.current = true;');
    expect(source).toContain('window.setTimeout(() => {');
    expect(source).toContain('localAcpAutoCloseBlockedRef.current = false;');
    expect(source).toContain('const handleSettingsDialogOpenChange = (nextOpen: boolean) => {');
    expect(source).toContain('if (localAcpAutoCloseBlockedRef.current) {');
    expect(source).toContain('<Sheet open={open} onOpenChange={handleSettingsDialogOpenChange}>');
    expect(connectSource).toContain('return preserveSettingsDialogDuringLocalAcpAction(async () => {');
    expect(refreshSource).toContain('return preserveSettingsDialogDuringLocalAcpAction(async () => {');
    expect(connectSource).not.toContain('onClose();');
    expect(refreshSource).not.toContain('onClose();');
  });

  it('accepts external ACP failure context and keeps it visible until the user manually checks again', () => {
    const source = readSource();

    expect(source).toContain('const initialAcpFailureAppliedRef = useRef(false);');
    expect(source).toContain('setLocalAcpRuntime(initialAcpRuntime);');
    expect(source).toContain('setLocalAcpFailureContext({');
    expect(source).toContain('source: initialAcpFailureSource');
    expect(source).toContain('message: initialAcpFailureMessage');
    expect(source).toContain("if (initialTab === 'ai' && initialAcpRuntime && initialAcpRuntime.health.status !== 'ready')");
    expect(source).toContain('initialAcpFailureAppliedRef.current = true;');
    expect(source).toContain("if (initialTab === 'ai' && !initialAcpFailureAppliedRef.current)");
    expect(source).not.toContain("if (initialTab === 'ai') {\n            void handleLocalAcpRuntimeCheck({ silent: true });\n        }");
  });

  it('shows ACP repair actions with copyable commands and an AI troubleshooting prompt when not linked', () => {
    const source = readSource();
    const aiTabSource = source.slice(
      source.indexOf('<TabsContent value="ai"'),
      source.indexOf('<TabsContent value="network"'),
    );

    expect(source).toContain('function resolveLocalAcpRepairCommand(runtime: AssistantRuntimeResponse | null): string');
    expect(source).toContain('function resolveLocalAcpRepairMessage(params: {');
    expect(source).toContain("return '本地 ACP 已响应，但未允许当前 Make 地址跨域访问。为避免覆盖共享服务的跨域配置，Make 不会自动重启；请在 ACP 配置中追加该地址后重新检测。';");
    expect(source).toContain("return '本地 ACP 未就绪。请使用下方命令启动，或点击“链接”自动处理。';");
    expect(source).toContain("runtime?.health.status === 'missing_cli'");
    expect(source).toContain('runtime?.health.hints.installGlobal');
    expect(source).toContain('runtime?.health.hints.start');
    expect(source).toContain('function buildLocalAcpTroubleshootingPrompt');
    expect(source).toContain('当前错误：');
    expect(source).toContain('ACP 地址：');
    expect(source).toContain('项目路径：');
    expect(source).toContain('启动命令：');
    expect(source).toContain('检测命令：');
    expect(source).toContain('当前 Make URL：');
    expect(source).toContain('请检查 Node/npm/npx、端口占用、CORS、网络和 /api/chat 可达性。');
    expect(source).toContain('handleCopyLocalAcpRepairCommand');
    expect(source).toContain('handleCopyLocalAcpTroubleshootingPrompt');
    expect(aiTabSource).toContain('复制启动命令');
    expect(aiTabSource).toContain('复制给 AI 处理');
    expect(aiTabSource).toContain('data-local-acp-status-card');
    expect(aiTabSource).toContain('data-local-acp-repair');
    expect(aiTabSource).toContain('resolveLocalAcpRepairMessage({');
    expect(aiTabSource).toContain('whitespace-pre-wrap break-words');
    expect(aiTabSource).toContain('[overflow-wrap:anywhere]');
    expect(aiTabSource).not.toContain('localAcpFailureContext?.message || localAcpRuntime.health.message || \'请检测或链接本地 ACP 服务后重试。\'');
    const repairActionsSource = aiTabSource.slice(
      aiTabSource.indexOf('<div className="flex flex-wrap items-center gap-3 pl-[96px]">'),
      aiTabSource.indexOf('</div>\n                                    </div>\n                                ) : null}'),
    );
    expect(repairActionsSource).toContain('<button');
    expect(repairActionsSource).toContain('text-primary');
    expect(repairActionsSource).not.toContain('<Button');
    expect(repairActionsSource).not.toContain('<Copy');
    expect(aiTabSource).not.toContain('border-amber');
    expect(aiTabSource).not.toContain('bg-amber');
    expect(aiTabSource).not.toContain('variant={localAcpConnected ? \'outline\' : \'brand\'}');
    expect(aiTabSource).not.toContain('请先通过 CLI 启动 AI 助手。');
  });

  it('saves the selected local AI provider only through defaultPromptClient form state', () => {
    const source = readSource();

    expect(source).toContain('value={formState.defaultPromptClient || undefined}');
    expect(source).toContain("onValueChange={(value) => updateField('defaultPromptClient', normalizePromptClientPreference(value))}");
    expect(source).toContain("defaultPromptClient: formState.defaultPromptClient");
    expect(source).not.toContain("value={formState.defaultPromptClient || 'acp:codex'}");
    expect(source).not.toContain("normalizePromptClientPreference(value) || 'acp:codex'");
  });

  it('checks agent versions when the AI tab is activated, clears missing selections, and reuses a larger cache with latest versions', () => {
    const source = readSource();
    const agentVersionCacheSource = readFileSync(resolve(__dirname, '../utils/agentVersionCache.ts'), 'utf8');

    expect(source).toContain('handleTabValueChange');
    expect(source).toContain("if (value === 'ai')");
    expect(source).toContain('void loadAgentVersions().then(clearMissingDefaultPromptClientAfterVersionCheck);');
    expect(source).toContain('clearMissingDefaultPromptClientAfterVersionCheck');
    expect(source).toContain("status === 'missing'");
    expect(source).toContain('defaultPromptClient: null');
    expect(source).toContain('刷新版本');
    expect(source).toContain('apiService.getAgentVersions');
    expect(source).toContain('const refreshAgentVersion = async (provider: AcpProviderKey): Promise<AgentVersionMap> =>');
    expect(source).toContain("apiService.getAgentVersions({ agent: provider })");
    expect(source).toContain('setAgentVersionRefreshingProvider(provider);');
    expect(source).toContain('agentVersionCacheRef');
    expect(source).toContain('formatAgentVersionMeta');
    expect(source).toContain('formatAgentVersionMetaTitle');
    expect(source).toContain('latestAgentVersions');
    expect(source).toContain('latestVersions');
    expect(source).toContain('const meta = formatAgentVersionMeta(agentVersions[option.versionKey], latestAgentVersions[option.versionKey]);');
    expect(source).toContain('const metaTitle = formatAgentVersionMetaTitle(agentVersions[option.versionKey], latestAgentVersions[option.versionKey]);');
    expect(source).toContain('title={metaTitle || undefined}');
    expect(source).toContain('<TableCell className="w-[180px] max-w-[180px] px-3 py-2 text-xs text-muted-foreground">');
    expect(source).toContain('className="block max-w-[144px] truncate font-mono text-[11px] leading-4"');
    expect(source).not.toContain('AI 设置首次打开时检测版本并缓存');
    expect(source).not.toContain('刷新版本会强制重新检测');
    expect(source).not.toContain('handleLocalAiSelectOpenChange');
    expect(agentVersionCacheSource).toContain('AGENT_VERSION_CACHE_TTL_MS');
    expect(agentVersionCacheSource).toContain('type AgentVersionKey = AcpProviderKey | CLIAgent;');
    expect(agentVersionCacheSource).toContain('10 * 60_000');
    expect(agentVersionCacheSource).toContain('latestVersions');
    expect(agentVersionCacheSource).toContain('（${latestMeta}）');
    expect(agentVersionCacheSource).toContain('未安装');
  });

  it('disables unavailable local AI provider selection and tests while keeping version refresh available', () => {
    const source = readSource();
    const tableBodySource = source.slice(
      source.indexOf('{LOCAL_AI_AGENT_OPTIONS.map'),
      source.indexOf('</TableBody>'),
    );
    const providerCellSource = tableBodySource.slice(
      tableBodySource.indexOf('<TableCell className="w-[170px] max-w-[170px] px-2 py-2">'),
      tableBodySource.indexOf('<TableCell className="w-[180px] max-w-[180px] px-3 py-2 text-xs text-muted-foreground">'),
    );
    const versionCellSource = tableBodySource.slice(
      tableBodySource.indexOf('<TableCell className="w-[180px] max-w-[180px] px-3 py-2 text-xs text-muted-foreground">'),
      tableBodySource.indexOf('<TableCell className="w-[230px] max-w-[230px] px-3 py-2 text-center text-xs align-middle">'),
    );
    const aiAgentHeaderSource = source.slice(
      source.indexOf('<h3 className="text-base font-semibold text-foreground">AI Agent</h3>'),
      source.indexOf('<Field>', source.indexOf('<h3 className="text-base font-semibold text-foreground">AI Agent</h3>')),
    );

    expect(source).toContain('const isAgentProviderMissing = (provider: AcpProviderKey): boolean =>');
    expect(source).toContain('supportsNpxFallback: option.supportsNpxFallback === true');
    expect(source).toContain('const providerSupportsNpxFallback = (provider: AcpProviderKey): boolean =>');
    expect(source).toContain("versions[provider]?.status === 'missing' && !providerSupportsNpxFallback(provider)");
    expect(source).toContain('const allLocalAiAgentOptionsDisabled =');
    expect(source).toContain('未检测到可用的本地 AI Agent，暂时无法设置。请先安装后刷新版本检测。');
    expect(aiAgentHeaderSource).toContain('allLocalAiAgentOptionsDisabled');
    expect(tableBodySource).toContain('const optionDisabled = isAgentProviderMissing(option.provider);');
    expect(tableBodySource).toContain('const versionRefreshing = agentVersionRefreshingProvider === option.provider;');
    expect(tableBodySource).toContain('data-state={!optionDisabled && formState.defaultPromptClient === option.value ?');
    expect(tableBodySource).toContain('<RadioGroupItem value={option.value} disabled={optionDisabled}');
    expect(tableBodySource).toContain('disabled={isTesting || optionDisabled}');
    expect(providerCellSource).not.toContain('refreshAgentVersion');
    expect(versionCellSource).toContain('onClick={() => refreshAgentVersion(option.provider)}');
    expect(versionCellSource).toContain('disabled={versionRefreshing}');
    expect(versionCellSource).toContain('aria-label={`刷新 ${option.label} 版本`}');
    expect(versionCellSource).toContain('versionRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />');
    expect(source).not.toContain('onClick={() => loadAgentVersions(true).then(clearMissingDefaultPromptClientAfterVersionCheck)}');
    expect(tableBodySource).not.toContain('disabled={agentVersionsLoading || optionDisabled}');
  });

  it('tests local AI providers through prompt execution without adding a backend endpoint', () => {
    const source = readSource();

    expect(source).toContain('AGENT_PROVIDER_TEST_KEYWORD');
    expect(source).toContain('AXHUB_AGENT_TEST_OK');
    expect(source).toContain('handleAgentProviderTest');
    expect(source).toContain("from '../domains/ai-generation/aiRunClient'");
    expect(source).toContain('runAiText({');
    expect(source).toContain("scene: 'agent-provider-test'");
    expect(source).toContain("scene: 'agent-provider-test'");
    expect(source).toContain('client: option.value');
    expect(source).toContain('prompt: AGENT_PROVIDER_TEST_PROMPT');
    expect(source).toContain('output.includes(AGENT_PROVIDER_TEST_KEYWORD)');
    expect(source).toContain("updateAgentProviderTestState(option.value, { status: 'passed', message: '通过', testedAt: Date.now() });");
    expect(source).toContain("updateAgentProviderTestState(option.value, { status: 'failed', message: summary });");
    expect(source).toContain("updateAgentProviderTestState(option.value, { status: 'failed', message });");
    expect(source).toContain("handleAiRunAcpRuntimeUnavailable(error, '本地执行 agent 测试')");
    expect(source).not.toContain("status: 'failed', message: summary, testedAt: Date.now()");
    expect(source).not.toContain("status: 'failed', message, testedAt: Date.now()");
    expect(source).toContain('formatAgentProviderTestTime');
    expect(source).toContain("status: 'passed'");
    expect(source).toContain("status: 'failed'");
    expect(source).not.toContain('/api/agent/test');
    expect(source).not.toContain('/api/prompt/execute');
  });

  it('keeps local AI provider test feedback in the last-test column', () => {
    const source = readSource();
    const tableBodySource = source.slice(
      source.indexOf('{LOCAL_AI_AGENT_OPTIONS.map'),
      source.indexOf('</TableBody>'),
    );

    expect(source).toContain('setAgentProviderTests((previous) => ({ ...previous, [client]: state }));');
    expect(tableBodySource).toContain("const testTime = testState?.status === 'passed' ? formatAgentProviderTestTime(testState.testedAt) : '';");
    expect(tableBodySource).toContain('aria-label={`测试 ${option.label}`}');
    expect(tableBodySource).toContain('<TooltipContent arrow>测试连接</TooltipContent>');
    expect(tableBodySource).toContain("testState?.status === 'failed' && testState.message");
    expect(tableBodySource).toContain("testState?.status === 'passed' && testTime");
    expect(tableBodySource).toContain('inline-flex min-w-0 max-w-full items-center justify-center gap-2');
    expect(tableBodySource).toContain('items-center text-center');
    expect(tableBodySource).toContain('max-w-[190px] whitespace-normal break-words leading-5');
    expect(tableBodySource).toContain('[overflow-wrap:anywhere]');
    expect(tableBodySource).not.toContain('items-start gap-2');
    expect(tableBodySource).not.toContain('justify-between');
    expect(tableBodySource).not.toContain("{isTesting ? '测试中' : '测试'}");
    expect(tableBodySource).not.toContain('<TableCell className="py-2">\n                                                                <div className="flex justify-end">');
    expect(tableBodySource).not.toContain('max-w-[180px] truncate text-destructive');
    expect(tableBodySource).not.toContain('flex flex-col items-end gap-1');
  });

  it('shows recognizable icons for local AI providers', () => {
    const source = readSource();

    expect(source).toContain("from '@lobehub/icons'");
    expect(source).toContain('Cursor');
    expect(source).toContain("import qoderIconUrl from '../assets/brand-icons/qoder.svg?url';");
    expect(source).toContain("import codeBuddyIconUrl from '../assets/brand-icons/codebuddy.svg?url';");
    expect(source).toContain('DeepSeek');
    expect(source).toContain('Grok');
    expect(source).toContain("if (provider === 'codex') return <Codex.Color size={16} />;");
    expect(source).not.toContain('GeminiCLI');
    expect(source).not.toContain("if (provider === 'gemini') return");
    expect(source).toContain("if (provider === 'claude') return <ClaudeCode.Color size={16} />;");
    expect(source).toContain("if (provider === 'opencode') return <OpenCode size={16} />;");
    expect(source).toContain("if (provider === 'cursor') return <Cursor size={16} />;");
    expect(source).toContain("if (provider === 'qoder') return <img src={qoderIconUrl} alt=\"\" aria-hidden width={16} height={16} />;");
    expect(source).toContain("if (provider === 'codebuddy') return <img src={codeBuddyIconUrl} alt=\"\" aria-hidden width={16} height={16} />;");
    expect(source).not.toContain('<Qoder.Color');
    expect(source).not.toContain('<CodeBuddy.Color');
    expect(source).toContain("if (provider === 'reasonix') return <DeepSeek.Color size={16} />;");
    expect(source).toContain("if (provider === 'grok-build') return <Grok size={16} />;");
    expect(source).toContain('getAgentProviderIcon(option.provider)');
    expect(source).toContain('defaultPromptClient: null');
    expect(source).not.toContain('Bot');
    expect(source).not.toContain('data-provider={provider}');
  });

  it('tests AI image generation settings directly against the configured image API using the current form values', () => {
    const source = readSource();

    expect(source).toContain('AiImageConfigTestState');
    expect(source).toContain('AiImageConfigLastTest');
    expect(source).toContain('handleAiImageConfigTest');
    expect(source).toContain("fetch(buildSettingsUrl('/api/config/ai-image/test')");
    expect(source).toContain('body: JSON.stringify({');
    expect(source).toContain('prompt: AI_IMAGE_CONFIG_TEST_PROMPT');
    expect(source).toContain('baseUrl: formState.aiBaseUrl.trim()');
    expect(source).toContain('apiKey: formState.aiApiKey.trim()');
    expect(source).toContain("model: formState.aiModel.trim() || 'gpt-image-2'");
    expect(source).toContain("const successMessage = typeof body?.message === 'string' && body.message.trim()");
    expect(source).toContain("persistAiImageConfigLastTest({ status: 'passed', message: successMessage, testedAt })");
    expect(source).toContain("persistAiImageConfigLastTest({ status: 'failed', message, testedAt })");
    expect(source).toContain("toast.success('图片配置测试通过')");
    expect(source).toContain("toast.error(`图片配置测试失败：${message}`)");
    expect(source).toContain('测试图片配置');
    expect(source).not.toContain('runAiStream({');
    expect(source).not.toContain('AI_IMAGE_CONFIG_TEST_TIMEOUT_MS');
    expect(source).not.toContain('/api/ai-image/test');
  });

  it('maps structured AI run ACP failures back into the local ACP repair block', () => {
    const source = readSource();

    expect(source).toContain('function isAiRunAcpRuntimeUnavailable(error: unknown): error is');
    expect(source).toContain("record.code === 'ACP_RUNTIME_UNAVAILABLE' || record.action === 'open-ai-settings'");
    expect(source).toContain("function handleAiRunAcpRuntimeUnavailable(error: unknown, source: string): boolean");
    expect(source).toContain('setLocalAcpRuntime(record.runtime as AssistantRuntimeResponse);');
    expect(source).toContain('setLocalAcpFailureContext({');
    expect(source).toContain('source,');
    expect(source).toContain('message: typeof record.message === \'string\' ? record.message : \'本地 ACP 服务不可用\',');
    expect(source).toContain('toast.warning(\'本地 ACP 服务不可用，请查看上方修复信息\');');
  });

  it('saves AI image generation config through /api/config', () => {
    const source = readSource();

    expect(source).toContain("fetch(buildSettingsUrl('/api/config')");
    expect(source).toContain('ai: {');
    expect(source).toContain('imageGeneration: {');
    expect(source).toContain('baseUrl: formState.aiBaseUrl.trim()');
    expect(source).toContain('apiKey: formState.aiApiKey.trim() || null');
    expect(source).toContain("model: formState.aiModel.trim() || 'gpt-image-2'");
    expect(source).toContain('lastTest: aiImageConfigLastTest');
    expect(source).not.toContain('codexCli: formState.aiCodexCli');
    expect(source).not.toContain('responseFormatB64Json: formState.aiResponseFormatB64Json');
    expect(source).not.toContain('apiMode: formState.aiApiMode');
    expect(source).not.toContain('timeout: Math.max');
  });

  it('uses draft wording for AI image settings visible copy', () => {
    const source = readSource();

    expect(source).toContain('配置图片生成 AI 的接口信息。');
    expect(source).not.toContain('配置草稿 AI 图片生成使用的 OpenAI-compatible 接口。');
  });

  it('can import AI image generation settings from local Codex config', () => {
    const source = readSource();
    const imageSectionSource = source.slice(
      source.indexOf('图片生成 AI'),
      source.indexOf('<TabsContent value="network"'),
    );
    const footerSource = source.slice(source.indexOf('<SheetFooter'));

    expect(source).toContain('handleImportCodexConfig');
    expect(source).toContain("fetch(buildSettingsUrl('/api/config/ai-image/codex-local')");
    expect(source).toContain("toast.success('已读取本地 Codex 配置')");
    expect(source).toContain('读取本地 Codex 配置');
    expect(imageSectionSource).toContain('data-ai-image-config-actions');
    expect(imageSectionSource).toContain('handleAiImageConfigTest');
    expect(imageSectionSource).toContain('handleImportCodexConfig');
    expect(footerSource).not.toContain('handleAiImageConfigTest');
    expect(footerSource).not.toContain('handleImportCodexConfig');
    expect(source).toContain("updateField('aiBaseUrl', imported.baseUrl || DEFAULT_FORM_STATE.aiBaseUrl)");
    expect(source).toContain("updateField('aiApiKey', imported.apiKey || '')");
    expect(source).toContain("updateField('aiModel', imported.model || 'gpt-image-2')");
    expect(source).not.toContain("updateField('aiApiMode'");
    expect(source).not.toContain("updateField('aiCodexCli'");
    expect(source).not.toContain("updateField('aiResponseFormatB64Json'");
  });

  it('shows the persisted last AI image test result as aligned field text', () => {
    const source = readSource();
    const imageSectionSource = source.slice(
      source.indexOf('图片生成 AI'),
      source.indexOf('<TabsContent value="network"'),
    );

    expect(source).toContain('setAiImageConfigLastTest(normalizeAiImageConfigLastTest(config.ai?.imageGeneration?.lastTest));');
    expect(source).toContain('formatAiImageConfigLastTestTime');
    expect(source).toContain('getAiImageConfigLastTestLabel');
    expect(imageSectionSource).toContain('data-ai-image-last-test');
    expect(imageSectionSource).toContain('<Field data-ai-image-last-test className="min-w-0">');
    expect(imageSectionSource).toContain('<FieldLabelWithHint hint="图片生成配置的最近一次测试状态">上次测试</FieldLabelWithHint>');
    expect(imageSectionSource).toContain('className="flex min-h-9 min-w-0 items-center text-sm"');
    expect(imageSectionSource).toContain('className="block max-w-full whitespace-normal break-words leading-5 text-emerald-600 [overflow-wrap:anywhere]"');
    expect(imageSectionSource).toContain('className="block max-w-full whitespace-normal break-words leading-5 text-destructive [overflow-wrap:anywhere]"');
    expect(imageSectionSource).toContain("getAiImageConfigLastTestLabel(aiImageConfigLastTest)");
    expect(imageSectionSource).toContain("formatAiImageConfigLastTestTime(aiImageConfigLastTest?.testedAt)");
    expect(imageSectionSource).toContain("aiImageConfigLastTest?.status === 'passed'");
    expect(imageSectionSource).toContain("aiImageConfigLastTest?.status === 'failed'");
    expect(imageSectionSource).toContain('未测试');
    expect(imageSectionSource).not.toContain("aiImageConfigLastTest?.message || '暂无结果'");
    expect(imageSectionSource).not.toContain('justify-between');
    expect(imageSectionSource).not.toContain('border-input');
    expect(imageSectionSource).not.toContain('shadow-xs');
  });

  it('wraps inline AI image test feedback inside the settings drawer width', () => {
    const source = readSource();
    const imageSectionSource = source.slice(
      source.indexOf('图片生成 AI'),
      source.indexOf('<TabsContent value="network"'),
    );

    expect(imageSectionSource).toContain('data-ai-image-config-actions');
    expect(imageSectionSource).toContain('block max-w-full whitespace-normal break-words text-xs leading-5 text-emerald-600 [overflow-wrap:anywhere]');
    expect(imageSectionSource).toContain('block max-w-full whitespace-normal break-words text-xs leading-5 text-destructive [overflow-wrap:anywhere]');
    expect(imageSectionSource).not.toContain('max-w-[220px] truncate text-xs text-destructive');
  });

  it('does not expose removed AI image transport toggles in AI settings', () => {
    const source = readSource();

    expect(source).not.toContain('Codex CLI 兼容');
    expect(source).not.toContain('checked={formState.aiCodexCli}');
    expect(source).not.toContain('接口模式');
    expect(source).not.toContain('优先返回 Base64 图片数据');
    expect(source).not.toContain('超时秒数');
  });

  it('does not expose advanced AI image generation defaults in AI settings', () => {
    const source = readSource();

    expect(source).not.toContain('默认尺寸');
    expect(source).not.toContain('默认质量');
    expect(source).not.toContain('默认格式');
    expect(source).not.toContain('默认数量');
    expect(source).not.toContain('formState.aiDefaultSize');
    expect(source).not.toContain('formState.aiDefaultQuality');
    expect(source).not.toContain('formState.aiDefaultOutputFormat');
    expect(source).not.toContain('formState.aiDefaultCount');
  });

  it('restores the project default design setting in project settings', () => {
    const source = readSource();

    expect(source).toContain('defaultTheme: string;');
    expect(source).toContain("defaultTheme: config.projectDefaults?.defaultTheme || ''");
    expect(source).toContain('const [availableThemes, setAvailableThemes] = useState<ThemeResourceItem[]>([]);');
    expect(source).toContain("const response = await fetch(buildSettingsUrl('/api/themes'));");
    expect(source).toContain('setAvailableThemes(Array.isArray(themes) ? themes : []);');
    expect(source).toContain('projectDefaults: {');
    expect(source).toContain('defaultTheme: formState.defaultTheme.trim() || null,');
    expect(source).toContain("fetch(buildSettingsUrl('/api/themes/sync-design'), {");
    expect(source).toContain("body: JSON.stringify({ themeName: formState.defaultTheme.trim() })");
    expect(source).toContain('默认设计');
    expect(source).toContain('从“资产管理-设计”中选择一个作为项目默认设计');
    expect(source).toContain('<PrototypeThemeSearchSelect');
    expect(source).toContain("value={formState.defaultTheme || NO_PROTOTYPE_THEME_VALUE}");
    expect(source).toContain("updateField('defaultTheme', themeName === NO_PROTOTYPE_THEME_VALUE ? '' : themeName)");
    expect(source).not.toContain('默认主题');
  });

  it('keeps notification sound controls browser-local to the AI tab', () => {
    const source = readSource();
    const aiTabSource = source.slice(
      source.indexOf('<TabsContent value="ai"'),
      source.indexOf('<TabsContent value="network"'),
    );
    const handleSaveSource = source.slice(
      source.indexOf('const handleSave = async () => {'),
      source.indexOf('\n    return (', source.indexOf('const handleSave = async () => {')),
    );

    expect(aiTabSource).toContain('声音通知');
    expect(aiTabSource).toContain('完成音');
    expect(aiTabSource).toContain('提醒音');
    expect(source).toContain('readNotificationSettings');
    expect(source).toContain('writeNotificationSettings');
    expect(source).toContain("notificationPlayer.play('completion')");
    expect(source).toContain("notificationPlayer.play('reminder')");
    expect(handleSaveSource).not.toContain('notificationSettings');
  });
});
