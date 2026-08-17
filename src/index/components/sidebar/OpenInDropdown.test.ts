import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OpenInDropdown source', () => {
  it('loads the CodeBuddy and Qoder icons through host-safe asset URLs', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain("import { codeBuddyIconUrl, qoderIconUrl } from '../../assets/brand-icons/brandIconUrls';");
    expect(source).toContain('src={codeBuddyIconUrl}');
    expect(source).toContain('src={qoderIconUrl}');
    expect(source).not.toContain('.svg?url');
  });

  it('routes only verified providers through desktop integration and directly opens the remaining apps', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const registrySource = readFileSync(resolve(__dirname, './localAppOpenOptions.ts'), 'utf8');
    const localAppHandler = source.slice(
      source.indexOf('const handleLocalAppOption'),
      source.indexOf('const handleIDEOption'),
    );
    const editorHandler = source.slice(
      source.indexOf('const handleIDEOption'),
      source.indexOf('const handleGuideToAISettings'),
    );

    expect(source).toContain("handleIntegratedOpen('cursor'");
    expect(registrySource).toContain("codex: 'chatgpt'");
    expect(registrySource).toContain("workbuddy: 'workbuddy'");
    expect(registrySource).toContain("traework: 'traework'");
    expect(registrySource).toContain("qoderwork: 'qoderwork'");
    expect(source).toContain('apiService.openDesktopIntegration({');
    expect(source).toContain('action,');
    expect(source).toContain('<DesktopIntegrationRestartDialog');
    expect(localAppHandler).toContain('const provider = INTEGRATED_LOCAL_APP_PROVIDERS[agent];');
    expect(localAppHandler).toContain("void handleIntegratedOpen(provider, 'prepare');");
    expect(localAppHandler).toContain('void handleOpenWithLocalApp(agent);');
    expect(localAppHandler).not.toContain("handleIntegratedOpen('opencode'");
    expect(editorHandler).toContain("ide === 'cursor'");
    expect(editorHandler).toContain('handleOpenWithIDE(ide)');
  });

  it('keeps TRAEWORK clickable and reports that project selection remains manual', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const localAppHandler = source.slice(
      source.indexOf('const handleLocalAppOption'),
      source.indexOf('const handleIDEOption'),
    );
    const localAppRenderer = source.slice(
      source.indexOf('const renderLocalAppOption'),
      source.indexOf('const renderLocalAppOpenOption'),
    );
    const inlineVariantSegment = source.slice(
      source.indexOf("if (variant === 'inline-app-list')"),
      source.indexOf("if (variant === 'placeholder-card')"),
    );

    expect(source).toContain("'WorkBuddy'");
    expect(source).toContain("'TRAEWORK'");
    expect(source).toContain("agent === 'workbuddy'");
    expect(source).toContain("agent === 'traework'");
    expect(source).toContain('LOCAL_APP_AGENT_APP_NAMES[agent]');
    expect(source).toContain("traework: 'traework'");
    expect(localAppHandler).not.toContain('supportsLocalAppProjectOpen');
    expect(localAppHandler).not.toContain('TRAEWORK_PROJECT_OPEN_UNSUPPORTED_MESSAGE');
    expect(localAppRenderer).not.toContain('disabled=');
    expect(localAppRenderer).not.toContain('暂不支持');
    expect(inlineVariantSegment).toContain('disabled={openLoading}');
    expect(inlineVariantSegment).not.toContain('supportsLocalAppProjectOpen');
    expect(inlineVariantSegment).not.toContain('暂不支持');
  });

  it('does not report a successful desktop open as failed when preference persistence fails', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const integratedHandler = source.slice(
      source.indexOf('const handleIntegratedOpen'),
      source.indexOf('const handleLocalAppOption'),
    );

    expect(integratedHandler).toContain('let preferenceSaveFailed = false;');
    expect(integratedHandler).toContain('preferenceSaveFailed = true;');
    expect(integratedHandler).toContain("toast.warning('应用已打开，但保存默认打开方式失败');");
    expect(integratedHandler).toContain('} else if (result.notice) {');
    expect(integratedHandler).toContain('toast.warning(result.notice);');
    expect(integratedHandler.indexOf('setPendingIntegratedProvider(null);')).toBeGreaterThan(
      integratedHandler.indexOf('preferenceSaveFailed = true;'),
    );
  });

  it('lists only the seven supported local app entries in help text', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const localAppHelpSource = source.slice(
      source.indexOf('const LOCAL_APP_GROUP_HELP'),
      source.indexOf('const WEB_AGENT_GROUP_HELP'),
    );

    expect(localAppHelpSource).toContain("'QoderWork'");
    expect(localAppHelpSource).toContain("'TRAE'");
    expect(localAppHelpSource).not.toContain("'VS Code'");
    expect(localAppHelpSource).not.toContain("'TRAE CN'");
    expect(localAppHelpSource).not.toContain("'Windsurf'");
    expect(localAppHelpSource).not.toContain("'Antigravity'");
  });

  it('saves IDE preference through the server preferences API', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('apiService,');
    expect(source).toContain("from '../../services/api';");
    expect(source).toContain('apiService.saveServerPreferences');
    expect(source).toContain('}, requireProjectScope(projectId));');
    expect(source).not.toContain("const configRes = await fetch('/api/config');");
    expect(source).not.toContain('const currentConfig = await configRes.json();');
  });

  it('distinguishes an unavailable Web Agent action from a missing AI Agent preference', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const guideSource = source.slice(
      source.indexOf('const handleGuideToAISettings = useCallback'),
      source.indexOf('const handleUnavailableWebAgent'),
    );
    const unavailableSource = source.slice(
      source.indexOf('const handleUnavailableWebAgent'),
      source.indexOf('const handleOpenWithWebAgent'),
    );
    const webHandlerSource = source.slice(
      source.indexOf('const handleOpenWithWebAgent'),
      source.indexOf('const handleOpenWithImageAi'),
    );
    const defaultWebBranch = source.slice(
      source.indexOf("if (openMethod.type === 'web')"),
      source.indexOf("if (openMethod.type === 'cli')"),
    );

    expect(guideSource).toContain('onOpenAISettings?.();');
    expect(guideSource).toContain("toast.warning('请先在 AI 设置中配置对话 AI');");
    expect(unavailableSource).toContain("toast.warning('当前页面请通过提示词卡片复制或执行操作');");
    expect(unavailableSource).not.toContain('onOpenAISettings?.();');
    expect(webHandlerSource).toContain('handleUnavailableWebAgent();');
    expect(webHandlerSource).not.toContain('handleGuideToAISettings();');
    expect(defaultWebBranch).toContain('handleGuideToAISettings();');
    expect(defaultWebBranch).not.toContain("toast.warning('打开 Web Agent 失败');");
  });

  it('renders chat and image AI actions plus AI settings and only the fixed local app group', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const onlineOptionsSource = source.slice(
      source.indexOf('const WEB_AI_OPEN_OPTION'),
      source.indexOf('export default function OpenInDropdown'),
    );
    const onlineGroupSource = source.slice(
      source.indexOf("renderAgentGroup('在线打开'"),
      source.indexOf("renderAgentGroup('在本地应用中打开'"),
    );

    expect(source).toContain('在本地应用中打开');
    expect(source).not.toContain("renderAgentGroup('在编辑器中打开'");
    expect(source).not.toContain("renderAgentGroup('在 CLI 中打开'");
    expect(source).not.toContain('本地 CLI');
    expect(source).toContain('在线打开');
    expect(source).not.toContain('打开 Web AI');
    expect(source).toContain('对话 AI');
    expect(source).not.toContain('通用 AI');
    expect(source).toContain('生图 AI');
    expect(source).toContain('onOpenImageAiPanel?: () => void | Promise<void>;');
    expect(source).toContain("const IMAGE_AI_OPEN_OPTION = {");
    expect(source).toContain("label: '生图 AI'");
    expect(source).toContain('onOpenAISettings?: () => void;');
    expect(source).toContain('const handleOpenAISettings = useCallback(() => {');
    expect(source).toContain('onOpenAISettings?.();');
    expect(onlineGroupSource).toContain('onClick={handleToggleWebAiMenu}');
    expect(onlineGroupSource).toContain('onClick={handleToggleImageAiMenu}');
    expect(onlineGroupSource).toContain('handleOpenAISettings');
    expect(onlineGroupSource).toContain('设置');
    expect(onlineGroupSource).not.toContain('visibleOnlineWebAgentOptions.map');
    expect(onlineGroupSource).not.toContain('renderOptionMeta');
    expect(source).toContain("title: '本地应用'");
    expect(source).not.toContain("title: '本地 CLI'");
    expect(source).not.toContain('Visual Studio Code');
    expect(source).not.toContain('Kiro');
    expect(source).not.toContain("'kiro'");
    expect(source).not.toContain('GeminiCLI');
    expect(source).not.toContain('GeminiCli');
    expect(source).toContain('打开浏览器内置的 Web AI 面板。');
    expect(source).not.toContain('打开浏览器内置的 Web AI 面板，或访问 Chrome 扩展。');
    expect(source).toContain('WEB_AI_OPEN_OPTION');
    expect(source).not.toContain('ONLINE_WEB_AGENT_OPTIONS');
    expect(source).not.toContain('genieProvider?: AcpProvider;');
    expect(onlineOptionsSource).not.toContain("webAgent: 'opencode'");
    expect(onlineOptionsSource).not.toContain("label: 'OpenCode'");
    expect(onlineOptionsSource).toContain("label: '对话 AI'");
    expect(onlineOptionsSource).toContain("label: '生图 AI'");
    expect(onlineOptionsSource).toContain("webAgent: 'acp'");
    expect(source).not.toContain("availabilitySource: 'cli'");
    expect(source).not.toContain("availabilityKey: 'claudecode'");
    expect(source).not.toContain("availabilityKey: 'codex'");
    expect(source).not.toContain("availabilityKey: 'opencode'");
    expect(source).not.toContain("availabilityKey: 'gemini'");
    expect(source).not.toContain("genieProvider: 'opencode'");
    expect(source).not.toContain('未检测到可用的本地应用或编辑器');
    expect(source).not.toContain('未检测到可用的 CLI Agent');
    expect(source).not.toContain('未检测到可用的 Web Agent');
    expect(source).not.toContain('hasLocalAppMenuItems');
    expect(source).toContain('const renderAgentGroup =');
    expect(source).toContain('const localAppOpenOptions = LOCAL_APP_OPEN_OPTIONS;');
    expect(source).toContain("from './localAppOpenOptions';");
    expect(source).not.toContain('MAIN_IDE_OPTIONS');
    expect(source).toContain('LOCAL_APP_AGENT_OPTIONS');
    expect(source).not.toContain('getVisibleAgentOptions');
    expect(source).not.toContain('const visibleLocalAppAgentOptions =');
    expect(source).not.toContain('const visibleCLIAgentOptions =');
    expect(source).not.toContain('const detectedIDEOptions =');
    expect(source).not.toContain('LOCAL_APP_AGENT_OPTIONS.map(renderLocalAppOption)');
    expect(source).toContain('apiService.openLocalAppAgent({ agent, projectId, targetPath: openTargetPath });');
    expect(source).toContain('formatLocalAppOpenFailureMessage(LOCAL_APP_AGENT_APP_NAMES[agent])');
    expect(source).not.toContain("toast.warning(error?.message || '打开本地应用失败')");
    expect(source).toContain("if (result?.openInBrowser && result.url && typeof window !== 'undefined')");
    expect(source).toContain('window.location.href = result.url;');
    expect(source).toContain("void savePreference({ type: 'local-app', value: agent })");
    expect(source).toContain("if (openMethod.type === 'local-app')");
    expect(source).not.toContain('<DropdownMenuSub>');
    expect(source).not.toContain('更多');
    expect(source).not.toContain('MoreHorizontal');
    expect(source).toContain('<ChevronRight className="h-4 w-4" />');
    expect(source).not.toContain('overflowLocalAppOpenOptions');
    expect(source).not.toContain('renderCLIAgentSubmenu');
    expect(source).toContain('className="w-64 p-1.5"');
    expect(source).toContain('className="z-[3000] w-72 max-w-none whitespace-normal leading-5"');
    expect(source).toContain('renderGroupHelp(help)');
    expect(source).toContain('px-2 pb-1 pt-2 first:pt-1');
    expect(source).toContain('text-[11px] font-medium leading-4 text-muted-foreground');
    expect(source).toContain('className="-mx-1 my-1.5"');
    expect(source).toContain("if (agent === 'acp' && onOpenAcpWebAgent)");
    expect(source).toContain('onOpenAcpWebAgent(openTargetPath, provider)');
    expect(source).toContain('await Promise.resolve(onOpenImageAiPanel?.());');
    expect(source).toContain("void savePreference({ type: 'web', value: provider || agent })");
    expect(source).not.toContain("if (agent === 'opencode' && onOpenAcpWebAgent)");
    expect(source).not.toContain("void savePreference({ type: 'web', value: 'opencode' })");
    expect(source).not.toContain("onOpenAcpWebAgent(openTargetPath, 'opencode')");
    expect(source).not.toContain('const WEB_AGENT_READY_ATTEMPTS = 20;');
    expect(source).not.toContain('async function waitForWebAgentUrlReady(url: string): Promise<boolean>');
    expect(source).not.toContain('const ready = await waitForWebAgentUrlReady(readinessUrl);');
    expect(source).toContain('activeProjectId?: string | null;');
    expect(source).toContain('targetProjectId?: string | null;');
    expect(source).toContain('targetPath?: string | null;');
    expect(source).toContain("const projectId = targetProjectId?.trim() || activeProjectId?.trim() || '';");
    expect(source).toContain('const openTargetPath = targetPath?.trim() || undefined;');
    expect(source).toContain('handleOpenProjectInIDE(ide, openTargetPath, projectId)');
    expect(source).toContain('projectId,');
    expect(source).toContain('targetPath: openTargetPath');
    expect(source).not.toContain('corsOrigin: window.location.origin');
    expect(source).not.toContain("let panelUrl = result.url?.startsWith('/')");
    expect(source).not.toContain('await Promise.resolve(onOpenWebAgentInPanel(panelUrl));');
    expect(source).not.toContain("toast.warning('OpenCode 正在启动，已在侧边栏打开');");
    expect(source).not.toContain('void handleOpenWithOnlineWebAgent(option)');
    expect(source).toContain('void handleOpenWithWebAgent(storedWebOpenMethod.agent, storedWebOpenMethod.provider);');
    expect(source).toContain('handleLocalAppOption(openMethod.value as LocalAppAgent);');
    expect(source).not.toContain('<DropdownMenuLabel>{renderGroupLabel');
    expect(source).not.toContain('<DropdownMenuSeparator />');
    expect(source).not.toContain('visibleIDEOptions.length > 0');
  });

  it('does not expose Chrome extension links in the online group', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).not.toContain('CHROME_EXTENSION_OPTIONS');
    expect(source).not.toContain('renderChromeExtensionSubmenu');
    expect(source).not.toContain('Chrome 扩展');
    expect(source).not.toContain('https://axhub.im/chrome/');
    expect(source).not.toContain('chromewebstore.google.com/detail/chatgpt');
  });

  it('does not check or render agent versions in the open menu', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('handleDropdownOpenChange');
    expect(source).not.toContain('AGENT_VERSION_CACHE_TTL_MS');
    expect(source).not.toContain('apiService.getAgentVersions');
    expect(source).not.toContain('agentVersionCacheRef');
    expect(source).not.toContain('formatAgentVersionMeta');
    expect(source).not.toContain('loadAgentVersions');
    expect(source).not.toContain('optionMeta');
    expect(source).not.toContain('ml-auto');
  });

  it('keeps the split Web AI actions visible regardless of local agent availability', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const propsSource = source.slice(
      source.indexOf('export default function OpenInDropdown({'),
      source.indexOf('}: OpenInDropdownProps)'),
    );

    expect(source).toContain('agentAvailability?: RuntimeAgentAvailability;');
    expect(source).toContain('const WEB_AI_OPEN_OPTION');
    expect(source).toContain('const IMAGE_AI_OPEN_OPTION');
    expect(source).toContain('const activeAiPanelMode = aiPanelMode !== undefined');
    expect(source).not.toContain('const visibleOnlineWebAgentOptions');
    expect(source).not.toContain("status !== 'missing'");
    expect(propsSource).not.toContain('agentAvailability,');
  });

  it('places the online group before the fixed local app provider registry', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const agentTypesSource = readFileSync(resolve(__dirname, '../../../server/agentTypes.ts'), 'utf8');
    const registrySource = readFileSync(resolve(__dirname, './localAppOpenOptions.ts'), 'utf8');
    const localAppOptionsSource = agentTypesSource.slice(
      agentTypesSource.indexOf('export const LOCAL_APP_AGENT_OPTIONS'),
      agentTypesSource.indexOf('export type CLIAgent'),
    );
    const localAppNamesSource = agentTypesSource.slice(
      agentTypesSource.indexOf('export const LOCAL_APP_AGENT_APP_NAMES'),
      agentTypesSource.indexOf('export type AgentAvailabilityMap'),
    );

    const onlineIndex = source.indexOf("renderAgentGroup('在线打开'");
    const localAppGroupIndex = source.indexOf("renderAgentGroup('在本地应用中打开'");
    const localAppOptionIndex = source.indexOf('const localAppOpenOptions = LOCAL_APP_OPEN_OPTIONS;');

    expect(onlineIndex).toBeGreaterThan(-1);
    expect(localAppGroupIndex).toBeGreaterThan(-1);
    expect(localAppOptionIndex).toBeGreaterThan(-1);
    expect(onlineIndex).toBeLessThan(localAppGroupIndex);
    expect(localAppOptionsSource).toContain("{ value: 'codex', label: 'ChatGPT' }");
    expect(localAppOptionsSource).toContain("{ value: 'opencode', label: 'OpenCode' }");
    expect(localAppOptionsSource).toContain("{ value: 'qoderwork', label: 'QoderWork' }");
    expect(localAppOptionsSource).toContain("{ value: 'trae', label: 'TRAE' }");
    expect(registrySource).toContain("{ kind: 'ide', option: CURSOR_LOCAL_APP_OPTION }");
    expect(localAppNamesSource).toContain("codex: 'ChatGPT'");
  });

  it('uses shared product icons for WorkBuddy, QoderWork, TRAEWORK and TRAE', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const localAppIconSource = source.slice(
      source.indexOf('const getLocalAppIcon'),
      source.indexOf('const getWebAgentIcon'),
    );

    expect(source).toContain('OpenAI,');
    expect(source).not.toContain('const getOnlineWebAgentIcon');
    expect(source).toContain("items: ['ChatGPT', 'OpenCode', 'WorkBuddy', 'TRAEWORK', 'Cursor', 'QoderWork', 'TRAE']");
    expect(localAppIconSource).toContain("if (agent === 'codex') return <OpenAI size={14} />;");
    expect(localAppIconSource).toContain("if (agent === 'workbuddy') return <img src={codeBuddyIconUrl}");
    expect(localAppIconSource).toContain("if (agent === 'traework' || agent === 'trae') return <Trae.Color size={14} />;");
    expect(localAppIconSource).toContain("if (agent === 'qoderwork') return <img src={qoderIconUrl}");
  });

  it('keeps the seven local app entries fixed regardless of local installation state', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('LOCAL_APP_OPEN_OPTIONS');
    expect(source).not.toContain('MAIN_IDE_OPTIONS');
    expect(source).not.toContain('CLI_AGENT_OPTIONS');
    expect(source).not.toContain('getVisibleAgentOptions');
    expect(source).not.toContain('isIDEMissing');
    expect(source).not.toContain('未检测到可用的本地应用或编辑器');
    expect(source).not.toContain('未检测到可用的 CLI Agent');
    expect(source).toContain('type LocalAppOpenOption,');
    expect(source).toContain('localAppOpenOptions.map(renderLocalAppOpenOption)');
    expect(source).not.toContain('overflowLocalAppOpenOptions');
  });

  it('explicitly exposes local app options through the browser-safe common agent boundary', () => {
    const source = readFileSync(resolve(__dirname, '../../../common/agent.ts'), 'utf8');

    expect(source).toContain('LOCAL_APP_AGENT_OPTIONS');
    expect(source).toContain('export type');
  });

  it('keeps the open button text readable in default and active states', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain("'text-foreground/80 hover:text-foreground'");
    expect(source).toContain("'border border-primary/45 bg-background shadow-none'");
    expect(source).toContain("'text-primary hover:bg-primary/5 hover:text-primary'");
    expect(source).toContain("'border-primary/25 text-primary/70 hover:bg-primary/5 hover:text-primary'");
    expect(source).toContain('data-[active=true]:text-primary data-[active=true]:hover:bg-primary/5 data-[active=true]:hover:text-primary');
    expect(source).toContain('data-active={generalAiMenuActive || imageAiMenuActive ? \'true\' : undefined}');
    expect(source).not.toContain('text-primary hover:bg-background hover:text-primary');
    expect(source).not.toContain('border border-slate-900 bg-slate-900');
    expect(source).not.toContain('text-white hover:bg-slate-800');
    expect(source).not.toContain('bg-primary/[0.08]');
    expect(source).not.toContain('shadow-[0_0_0_2px');
  });

  it('adds a polished bottom help action for manual AI workspace setup', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const menuSource = source.slice(
      source.indexOf('const menuContent = ('),
      source.indexOf("if (variant === 'inline-app-list')"),
    );
    const helpDialogSource = source.slice(
      source.indexOf('<Dialog open={openHelpDialogOpen}'),
      source.indexOf('</Dialog>', source.indexOf('<Dialog open={openHelpDialogOpen}')),
    );

    expect(source).toContain("import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';");
    expect(source).toContain('const [openHelpDialogOpen, setOpenHelpDialogOpen] = useState(false);');
    expect(menuSource).toContain('无法打开？');
    expect(menuSource).toContain('setOpenHelpDialogOpen(true)');
    expect(helpDialogSource).toContain('手动打开 AI 应用');
    expect(helpDialogSource).toContain('如果 Web 无法直接唤起应用，请在应用内选择当前 Make 项目目录。');
    expect(helpDialogSource).toContain('方法一：新建对话');
    expect(helpDialogSource).toContain('选择工作空间');
    expect(helpDialogSource).toContain('方法二：新建项目');
    expect(helpDialogSource).toContain('选择当前 Make 项目目录');
    expect(helpDialogSource).toContain('如果应用无法自动打开，请按以上方式手动选择当前 Make 项目目录。');
    expect(helpDialogSource).toContain('知道了');
    expect(helpDialogSource).toContain('DialogFooter');
    expect(helpDialogSource).toContain('rounded-[20px]');
    expect(helpDialogSource).not.toContain('如果 Web AI 无法直接打开对应应用，或者下方列表里没有你正在使用的应用，可以在应用里手动选择当前项目。');
    expect(helpDialogSource).not.toContain('选择工作空间或项目目录后，再回到 Axhub Make 继续创建和编辑原型。');
    expect(helpDialogSource).not.toContain('DialogHeader className="border-b px-5 py-4"');
  });

  it('sizes the open button to fit the active label instead of clipping it', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain("'inline-flex items-center h-6 shrink-0");
    expect(source).toContain("buttonActive ? 'min-w-[104px] w-auto' : openLoading ? 'w-[92px]' : showExpanded ? 'w-[82px]' : 'w-[68px]'");
    expect(source).toContain('whitespace-nowrap');
    expect(source).not.toContain('h-6 w-[82px]');
  });

  it('closes the open Web Agent panel when the active open button is clicked', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('onCloseWebAgentPanel,');
    expect(source).toContain('const buttonActive = Boolean(webAgentPanelOpen);');
    expect(source).not.toContain('const buttonActive = isWebMethodActive && Boolean(webAgentPanelOpen);');
    expect(source).toContain('if (buttonActive) {');
    expect(source).toContain('onCloseWebAgentPanel?.();');
    expect(source).toContain('return;');
  });

  it('reopens stored ACP UI provider preferences through the web panel handler', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('const resolveStoredWebOpenMethod = (method: OpenMethod)');
    expect(source).toContain("method.value === 'claude' || method.value === 'codex' || method.value === 'opencode'");
    expect(source).not.toContain("method.value === 'gemini'");
    expect(source).toContain("return { agent: 'acp' as const, provider: method.value as AcpProvider };");
    expect(source).toContain('const storedWebOpenMethod = resolveStoredWebOpenMethod(openMethod);');
    expect(source).toContain('void handleOpenWithWebAgent(storedWebOpenMethod.agent, storedWebOpenMethod.provider);');
    expect(source).not.toContain('void handleOpenWithWebAgent(openMethod.value as WebAgent);');
  });

  it('keeps the Web Agent active preference while opening a local app from the active state', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('const shouldUpdateDefaultOpenMethod = !buttonActive;');
    expect(source).toContain("if (shouldUpdateDefaultOpenMethod) {\n            void savePreference({ type: 'local-app', value: agent }).catch(() => {});\n        }");
    expect(source).toContain("if (shouldUpdateDefaultOpenMethod) {\n            void savePreference({ type: 'ide', value: ide }).catch(() => {});\n        }");
    expect(source).toContain("if (shouldUpdateDefaultOpenMethod) {\n            void savePreference({ type: 'cli', value: agent }).catch(() => {});\n        }");
    expect(source).not.toContain("void savePreference({ type: 'local-app', value: agent }).catch(() => {});\n\n        try {");
  });

  it('shows "打开 AI" in default state and reveals full UI on hover', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain("'打开 AI'");
    expect(source).toContain('showExpanded');
    expect(source).toContain('setHovered(true)');
    expect(source).toContain('setHovered(false)');
    expect(source).not.toContain('onRefreshAvailability');
    expect(source).toContain('handleDropdownOpenChange');
  });

  it('gives the compact AI opening state enough width for the spinner and label', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain('const showExpanded = !openLoading && (hovered || buttonActive || dropdownOpen);');
    expect(source).toContain("openLoading ? 'w-[92px]' :");
    expect(source).toContain("openLoading ? 'px-3' : 'px-2'");
  });

  it('supports placeholder card trigger while preserving the shared open menu', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');

    expect(source).toContain("variant = 'compact'");
    expect(source).toContain('className,');
    expect(source).toContain("variant === 'placeholder-card'");
    expect(source).toContain('if (buttonActive) {');
    expect(source).toContain('return null;');
    expect(source).toContain("parseOpenMethod(preferredIDE) || { type: 'ide', value: activeOpenIDE }");
    expect(source).toContain('const activeOpenIDE = resolveVisibleIDEPreference(preferredIDE, ideAvailability) || visibleIDEOptions[0].value;');
    expect(source).toContain('<DropdownMenuTrigger asChild>');
    expect(source).toContain('placeholder-guide-card');
    expect(source).toContain('placeholder-guide-card-action');
    expect(source).toContain('placeholder-guide-ai-card');
    expect(source).toContain('cardIcon?: React.ReactNode');
    expect(source).toContain('{cardIcon ? <span className="text-slate-500">{cardIcon}</span> : null}');
    expect(source).toContain('className,');
    expect(source).toContain('placeholder-guide-card-title');
    expect(source).toContain('placeholder-guide-card-description');
    expect(source).not.toContain("buttonActive ? 'AI 已打开' : cardTitle");
    expect(source).toContain('openTargetPath');
    expect(source).toContain('handleOpenProjectInIDE(ide, openTargetPath, projectId)');
    expect(source).toContain('onOpenAcpWebAgent(openTargetPath, provider)');
    expect(source).toContain('apiService.openCLIAgent({ agent, projectId, targetPath: openTargetPath })');
    expect(source).not.toContain('apiService.openWebAgent({');
  });

  it('wires the dropdown settings action through sidebar and canvas AI settings openers', () => {
    const dropdownSource = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const contentPanelSource = readFileSync(resolve(__dirname, './ContentPanel.tsx'), 'utf8');
    const newSidebarSource = readFileSync(resolve(__dirname, './NewSidebar.tsx'), 'utf8');
    const sidebarBuilderSource = readFileSync(resolve(__dirname, '../../app/hooks/useIndexPageSidebarPropsBuilder.ts'), 'utf8');
    const contentAreaSource = readFileSync(resolve(__dirname, '../content/ContentAreaView.tsx'), 'utf8');
    const presentationAreaSource = readFileSync(resolve(__dirname, '../content/PresentationArea.tsx'), 'utf8');
    const indexPageTypesSource = readFileSync(resolve(__dirname, '../../types/index-page.types.ts'), 'utf8');
    const presentationBuilderSource = readFileSync(resolve(__dirname, '../../app/hooks/useIndexPagePresentationPropsBuilder.ts'), 'utf8');
    const indexPageSource = readFileSync(resolve(__dirname, '../../app/IndexPage.tsx'), 'utf8');

    expect(dropdownSource).toContain('onOpenAISettings?: () => void;');
    expect(dropdownSource).toContain('onOpenAISettings,');
    expect(dropdownSource).toContain('const handleOpenAISettings = useCallback(() => {');
    expect(dropdownSource).toContain('onOpenAISettings?.();');
    expect(contentPanelSource).toContain('onOpenAISettings={onOpenAISettings}');
    expect(newSidebarSource).toContain('onOpenAISettings={onOpenAISettings}');
    expect(sidebarBuilderSource).toContain("onOpenAISettings: () => deps.openSettingsDialog('ai')");
    expect(contentAreaSource).toContain('onOpenAISettings={onOpenAISettings}');
    expect(presentationAreaSource).toContain('onOpenAISettings={props.onOpenAISettings}');
    expect(indexPageTypesSource).toContain('onOpenAISettings?: () => void;');
    expect(presentationBuilderSource).toContain('openSettingsDialog?: (tab?: SettingsDialogInitialTab) => void;');
    expect(presentationBuilderSource).toContain("onOpenAISettings: actions.openSettingsDialog ? () => actions.openSettingsDialog?.('ai') : undefined");
    expect(indexPageSource).toContain('openSettingsDialog,');
  });

  it('supports inline app list variant through shared local app and IDE open handlers', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const inlineVariantSegment = source.slice(
      source.indexOf("if (variant === 'inline-app-list')"),
      source.indexOf("if (variant === 'placeholder-card')"),
    );

    expect(source).toContain("variant?: 'compact' | 'placeholder-card' | 'inline-app-list' | 'toolbar' | 'canvas-icon';");
    expect(source).toContain("variant === 'inline-app-list'");
    expect(inlineVariantSegment).toContain('在应用中新建：');
    expect(inlineVariantSegment).toContain('localAppOpenOptions.map');
    expect(inlineVariantSegment).not.toContain('setOpenHelpDialogOpen(true)');
    expect(inlineVariantSegment).not.toContain('更多');
    expect(inlineVariantSegment).not.toContain('<MoreHorizontal className="h-3.5 w-3.5" />');
    expect(inlineVariantSegment).toContain('{renderDialogs()}');
    expect(inlineVariantSegment).toContain('flex w-full flex-col items-center gap-3 text-center');
    expect(inlineVariantSegment).toContain('gap-2');
    expect(inlineVariantSegment).toContain('h-7 items-center gap-1.5 rounded-md px-2');
    expect(inlineVariantSegment).not.toContain('h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5');
    expect(inlineVariantSegment).not.toContain('shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50');
    expect(inlineVariantSegment).toContain('handleIDEOption(item.option.value as MainIDE)');
    expect(inlineVariantSegment).toContain('handleLocalAppOption(item.option.value)');
    expect(inlineVariantSegment).not.toContain('renderAgentGroup');
    expect(inlineVariantSegment).not.toContain('ONLINE_WEB_AGENT_OPTIONS');
    expect(inlineVariantSegment).not.toContain('CLI_AGENT_OPTIONS');
    expect(inlineVariantSegment).not.toContain('apiService.openIDE');
    expect(inlineVariantSegment).not.toContain('deeplink');
    expect(source).toContain('handleOpenProjectInIDE(ide, openTargetPath, projectId)');
    expect(source).toContain('apiService.openLocalAppAgent({ agent, projectId, targetPath: openTargetPath });');
  });

  it('supports a toolbar trigger style while preserving the shared open menu', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const toolbarVariantSegment = source.slice(
      source.indexOf("if (variant === 'toolbar')"),
      source.indexOf("if (variant === 'inline-app-list')"),
    );

    expect(source).toContain("variant?: 'compact' | 'placeholder-card' | 'inline-app-list' | 'toolbar' | 'canvas-icon';");
    expect(toolbarVariantSegment).toContain('<DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>');
    expect(toolbarVariantSegment).toContain('<DropdownMenuTrigger asChild>');
    expect(toolbarVariantSegment).toContain('className={cn(toolbarButtonClassName, className)}');
    expect(toolbarVariantSegment).toContain('data-active={buttonActive ? \'true\' : undefined}');
    expect(toolbarVariantSegment).toContain('<Sparkles />');
    expect(toolbarVariantSegment).toContain("{buttonActive ? '已打开' : '打开 AI'}");
    expect(toolbarVariantSegment).toContain('<ChevronDown className="h-3.5 w-3.5" />');
    expect(toolbarVariantSegment).toContain('{menuContent}');
    expect(toolbarVariantSegment).not.toContain('toolbarButtonGroupClassName');
    expect(toolbarVariantSegment).not.toContain('toolbarMainButtonClassName');
    expect(toolbarVariantSegment).not.toContain('toolbarMenuButtonClassName');
    expect(toolbarVariantSegment).not.toContain('onClick={handleOpenDefault}');
    expect(toolbarVariantSegment).not.toContain('placeholder-guide-card');
    expect(toolbarVariantSegment).not.toContain('inline-app-list');
  });

  it('supports a canvas icon trigger that only opens the shared AI menu', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const canvasIconSegment = source.slice(
      source.indexOf("if (variant === 'canvas-icon')"),
      source.indexOf("if (variant === 'toolbar')"),
    );

    expect(source).toContain("variant?: 'compact' | 'placeholder-card' | 'inline-app-list' | 'toolbar' | 'canvas-icon';");
    expect(canvasIconSegment).toContain('<DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>');
    expect(canvasIconSegment).toContain('<DropdownMenuTrigger asChild>');
    expect(canvasIconSegment).toContain('aria-label={buttonActive ? \'AI 已打开\' : \'打开 AI\'}');
    expect(canvasIconSegment).toContain('title={buttonActive ? \'AI 已打开\' : \'打开 AI\'}');
    expect(canvasIconSegment).toContain('data-active={generalAiMenuActive || imageAiMenuActive ? \'true\' : undefined}');
    expect(canvasIconSegment).toContain('{openLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}');
    expect(canvasIconSegment).toContain('{menuContent}');
    expect(canvasIconSegment).not.toContain('onClick={handleOpenDefault}');
    expect(canvasIconSegment).not.toContain('<ChevronDown');
    expect(canvasIconSegment).not.toContain('打开 AI</span>');
  });

  it('marks the toolbar Web AI action as active when the Web UI panel is open', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const menuSource = source.slice(
      source.indexOf("const generalAiMenuActive = activeAiPanelMode === 'general-ai';"),
      source.indexOf("if (variant === 'toolbar')"),
    );

    expect(menuSource).toContain("const generalAiMenuActive = activeAiPanelMode === 'general-ai';");
    expect(menuSource).toContain("const imageAiMenuActive = activeAiPanelMode === 'image-ai';");
    expect(menuSource).toContain('const webAiMenuActive = generalAiMenuActive;');
    expect(menuSource).toContain("webAiMenuActive && 'bg-secondary text-secondary-foreground'");
    expect(menuSource).toContain('aria-checked={webAiMenuActive}');
    expect(menuSource).toContain('{webAiMenuActive ? <Check className="h-3.5 w-3.5" /> : getWebAgentIcon(WEB_AI_OPEN_OPTION.webAgent)}');
    expect(menuSource).toContain("imageAiMenuActive && 'bg-secondary text-secondary-foreground'");
    expect(menuSource).toContain('aria-checked={imageAiMenuActive}');
  });

  it('toggles the active AI menu items off and closes the side panel', () => {
    const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const menuSource = source.slice(
      source.indexOf('const handleToggleWebAiMenu = useCallback(() => {'),
      source.indexOf("if (variant === 'toolbar')"),
    );

    expect(menuSource).toContain('const handleToggleWebAiMenu = useCallback(() => {');
    expect(menuSource).toContain('if (webAiMenuActive) {');
    expect(menuSource).toContain('closeAiPanel();');
    expect(menuSource).toContain('return;');
    expect(menuSource).toContain('void handleOpenWithWebAgent(WEB_AI_OPEN_OPTION.webAgent);');
    expect(menuSource).toContain('}, [closeAiPanel, handleOpenWithWebAgent, webAiMenuActive]);');
    expect(menuSource).toContain('const handleToggleImageAiMenu = useCallback(() => {');
    expect(menuSource).toContain('if (imageAiMenuActive) {');
    expect(menuSource).toContain('void handleOpenWithImageAi();');
    expect(menuSource).toContain('onClick={handleToggleWebAiMenu}');
    expect(menuSource).toContain('onClick={handleToggleImageAiMenu}');
  });

  it('keeps ACP UI Web Agent provider selection typed through every open menu boundary', () => {
    const dropdownSource = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
    const contentPanelSource = readFileSync(resolve(__dirname, './ContentPanel.tsx'), 'utf8');
    const sidebarBuilderSource = readFileSync(resolve(__dirname, '../../app/hooks/useIndexPageSidebarPropsBuilder.ts'), 'utf8');
    const contentAreaSource = readFileSync(resolve(__dirname, '../content/ContentAreaView.tsx'), 'utf8');
    const presentationAreaSource = readFileSync(resolve(__dirname, '../content/PresentationArea.tsx'), 'utf8');
    const presentationBuilderSource = readFileSync(resolve(__dirname, '../../app/hooks/useIndexPagePresentationPropsBuilder.ts'), 'utf8');
    const indexPageTypesSource = readFileSync(resolve(__dirname, '../../types/index-page.types.ts'), 'utf8');

    for (const source of [
      dropdownSource,
      contentPanelSource,
      sidebarBuilderSource,
      contentAreaSource,
      presentationBuilderSource,
      indexPageTypesSource,
    ]) {
      expect(source).toContain("import type { AcpProvider } from '@/common/assistant-context/types';");
      expect(source).toMatch(/(?:on|handle)OpenAcpWebAgent\?: \(targetPath\?: string, provider\?: AcpProvider\) => void \| Promise<void>;/);
    }

    expect(presentationAreaSource).toContain('onOpenAcpWebAgent={props.onOpenAcpWebAgent}');

    expect(dropdownSource).toContain('const handleOpenWithWebAgent = async (agent: WebAgent, provider?: AcpProvider) => {');
    expect(dropdownSource).toContain('onOpenAcpWebAgent(openTargetPath, provider)');
    expect(dropdownSource).not.toContain('genieProvider?: AcpProvider;');
  });
});
