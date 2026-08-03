import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('IndexPage source', () => {
  it('passes the active markdown resource and content mode into the assistant controller', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const baseContentModeIndex = source.indexOf('const baseContentMode = useMemo');
    const contentModeIndex = source.indexOf("const contentMode: IndexContentMode = prototypeSpec.isOpen ? 'prototype-spec' : baseContentMode;");
    const markdownResourceIndex = source.indexOf('const currentMarkdownResource = useMemo');
    const assistantControllerIndex = source.indexOf('const assistantController = useAssistantPanelController');

    expect(baseContentModeIndex).toBeGreaterThan(-1);
    expect(contentModeIndex).toBeGreaterThan(-1);
    expect(markdownResourceIndex).toBeGreaterThan(-1);
    expect(assistantControllerIndex).toBeGreaterThan(-1);
    expect(baseContentModeIndex).toBeLessThan(contentModeIndex);
    expect(contentModeIndex).toBeLessThan(assistantControllerIndex);
    expect(markdownResourceIndex).toBeLessThan(assistantControllerIndex);
    expect(source).toContain('contentMode,');
    expect(source).toContain('currentMarkdownResource,');
  });

  it('passes the selected resource open mode into content mode resolution', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const contentModeCall = source.slice(
      source.indexOf('const baseContentMode = useMemo'),
      source.indexOf('const currentMarkdownResource = useMemo'),
    );

    expect(contentModeCall).toContain('selectedDocOpenMode: resources.selectedDoc?.openMode');
    expect(contentModeCall).toContain('resources.selectedDoc?.openMode');
  });

  it('passes non-prototype active resources into the assistant controller for current-file sync', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const assistantControllerCall = source.slice(
      source.indexOf('const assistantController = useAssistantPanelController'),
      source.indexOf('const syncAssistantCanvasComments = assistantController.syncAssistantCanvasComments'),
    );

    expect(source).toContain('const currentAssistantCanvasResource = useMemo(() => (');
    expect(source).toContain("resources.selectedDoc?.openMode === 'canvas'");
    expect(source).toContain('? resources.selectedDoc');
    expect(source).toContain(': resources.selectedCanvas');
    expect(assistantControllerCall).toContain('currentCanvas: currentAssistantCanvasResource,');
    expect(assistantControllerCall).toContain('currentTheme: resources.selectedTheme,');
    expect(assistantControllerCall).toContain('currentDataTable: resources.selectedDataTable,');
  });

  it('passes active project id into the assistant controller like IDE and OpenCode actions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const preferencesCall = source.slice(
      source.indexOf('const preferences = useIndexPagePreferences'),
      source.indexOf('const assistantController = useAssistantPanelController'),
    );
    const assistantControllerCall = source.slice(
      source.indexOf('const assistantController = useAssistantPanelController'),
      source.indexOf('const preview = useIndexPagePreviewActions'),
    );

    expect(source).toContain('activeProjectId: workspace.activeProjectId,');
    expect(preferencesCall).toContain('activeProjectId: workspace.activeProjectId,');
    expect(preferencesCall).toContain('enabled: !workspace.loading,');
    expect(assistantControllerCall).toContain('activeProjectId: workspace.activeProjectId,');
  });

  it('passes current image generation settings into the assistant controller', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const assistantControllerCall = source.slice(
      source.indexOf('const assistantController = useAssistantPanelController'),
      source.indexOf('const syncAssistantCanvasComments = assistantController.syncAssistantCanvasComments'),
    );

    expect(source).toContain('assistantImageGenerationConfig: preferences.assistantImageGenerationConfig,');
    expect(assistantControllerCall).toContain('assistantImageGenerationConfig: preferences.assistantImageGenerationConfig,');
  });

  it('passes image generation settings into annotation direct API runs without canvas MCP servers', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const directRunSource = source.slice(
      source.indexOf('const handleRunAnnotationAssistantPromptViaApi = useCallback'),
      source.indexOf('const buildPromptActionAssistantContext = useCallback'),
    );

    expect(directRunSource).toContain('builtinToolSettings: preferences.assistantImageGenerationConfig');
    expect(directRunSource).toContain('? { imageGeneration: preferences.assistantImageGenerationConfig }');
    expect(directRunSource).not.toContain('mcpServers');
  });

  it('passes abort signals into annotation direct API runs', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const directRunSource = source.slice(
      source.indexOf('const handleRunAnnotationAssistantPromptViaApi = useCallback'),
      source.indexOf('const buildPromptActionAssistantContext = useCallback'),
    );

    expect(directRunSource).toContain('signal?: AbortSignal;');
    expect(directRunSource).toContain('signal: request.signal,');
  });

  it('runs review prompts through the direct API channel and passes the handler into preview actions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const reviewDirectRunSource = source.slice(
      source.indexOf('const handleRunReviewAssistantPromptViaApi = useCallback'),
      source.indexOf('const buildPromptActionAssistantContext = useCallback'),
    );
    const previewSource = source.slice(
      source.indexOf('const preview = useIndexPagePreviewActions'),
      source.indexOf('const selection = useIndexPageSelectionSync'),
    );

    expect(reviewDirectRunSource).toContain('context: AssistantContextV1;');
    expect(reviewDirectRunSource).toContain('targetPath?: string | null;');
    expect(reviewDirectRunSource).toContain('submitAnnotationPromptViaApi({');
    expect(reviewDirectRunSource).toContain("scene: 'prototype-review-direct'");
    expect(reviewDirectRunSource).toContain('targetPath: request.targetPath || undefined,');
    expect(reviewDirectRunSource).toContain('preferredPromptClient: annotationPromptClient || `acp:${annotationProvider}`,');
    expect(reviewDirectRunSource).toContain('provider: annotationProvider,');
    expect(reviewDirectRunSource).toContain('model: annotationModel,');
    expect(reviewDirectRunSource).toContain('agentRunConcurrency: preferences.agentRunConcurrency,');
    expect(previewSource).toContain('onRunReviewAssistantPromptViaApi: handleRunReviewAssistantPromptViaApi,');
  });

  it('passes project and pending selection context into resource actions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const resourceActionsCall = source.slice(
      source.indexOf('const resources = useIndexPageResourceActions'),
      source.indexOf('const contentMode = useMemo'),
    );

    expect(resourceActionsCall).toContain('activeProjectId: workspace.activeProjectId,');
    expect(resourceActionsCall).toContain('setPendingReturnTarget,');
  });

  it('initializes preferences before passing preference values into preview actions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const preferencesIndex = source.indexOf('const preferences = useIndexPagePreferences');
    const previewIndex = source.indexOf('const preview = useIndexPagePreviewActions');
    const previewPreferenceIndex = source.indexOf('preferredPromptClient: preferences.preferredPromptClient', previewIndex);

    expect(preferencesIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(-1);
    expect(previewPreferenceIndex).toBeGreaterThan(previewIndex);
    expect(preferencesIndex).toBeLessThan(previewPreferenceIndex);
  });

  it('wires the project default design through preferences, sidebar, and presentation props', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const preferencesCall = source.slice(
      source.indexOf('const preferences = useIndexPagePreferences'),
      source.indexOf('const assistantController = useAssistantPanelController'),
    );
    const sidebarBuilderCall = source.slice(
      source.indexOf('const sidebarProps = useIndexPageSidebarPropsBuilder'),
      source.indexOf('const handleEnterSelectedPrototypePreview'),
    );
    const presentationBuilderCall = source.slice(
      source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder'),
      source.indexOf('const handleMobileItemClick'),
    );

    expect(preferencesCall).toContain('setDefaultThemeName: resources.setDefaultThemeName,');
    expect(sidebarBuilderCall).toContain('defaultThemeName: resources.defaultThemeName,');
    expect(presentationBuilderCall).toContain('defaultThemeName: resources.defaultThemeName,');
  });

  it('passes project setup required state into the sidebar builder', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const sidebarBuilderCall = source.slice(
      source.indexOf('const sidebarProps = useIndexPageSidebarPropsBuilder'),
      source.indexOf('const handleEnterSelectedPrototypePreview'),
    );

    expect(sidebarBuilderCall).toContain('projectSetupRequired: workspace.projectSetupRequired,');
  });

  it('checks make client update status and passes update availability into the sidebar', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const sidebarBuilderCall = source.slice(
      source.indexOf('const sidebarProps = useIndexPageSidebarPropsBuilder'),
      source.indexOf('const handleEnterSelectedPrototypePreview'),
    );

    expect(source).toContain('const [makeClientUpdateAvailable, setMakeClientUpdateAvailable] = useState(false);');
    expect(source).toContain('const [makeClientUpdateReminderVisible, setMakeClientUpdateReminderVisible] = useState(false);');
    expect(source).toContain('buildMakeClientUpdateReminderDismissedKey');
    expect(source).toContain('readMakeClientUpdateReminderDismissed');
    expect(source).toContain('writeMakeClientUpdateReminderDismissed');
    expect(source).toContain("type MakeClientUpdateReminderMode = 'update' | 'repair';");
    expect(source).toContain("const reminderMode: MakeClientUpdateReminderMode = status?.repairAvailable === true ? 'repair' : 'update';");
    expect(source).toContain("return mode === 'repair' ? `${key}.repair` : key;");
    expect(source).toContain('apiService.getMakeClientUpdateStatus(activeProjectId)');
    expect(source).toContain('setMakeClientUpdateAvailable(updateAvailable)');
    expect(source).toContain('setMakeClientUpdateReminderVisible(updateAvailable && !readMakeClientUpdateReminderDismissed(activeProjectId, status.targetVersion, reminderMode))');
    expect(source).toContain('setMakeClientUpdateReminderVisible(false);');
    expect(source).toContain('setMakeClientUpdateAvailable(false);');
    expect(source).toContain('handleMakeClientUpdateAvailabilityChange');
    expect(sidebarBuilderCall).toContain('makeClientUpdateAvailable,');
    expect(sidebarBuilderCall).toContain('makeClientUpdateReminderVisible,');
  });

  it('keeps assistant active resource calculation aligned with preview documents and templates', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain("const [resourceSection, setResourceSection] = useState<ResourceSection>('themes')");
    expect(source).toContain('resolveIndexContentMode({');
    expect(source).toContain('viewMode,');
    expect(source).toContain("return { item: resources.selectedTemplate, kind: 'template' as const };");
    expect(source).not.toContain('setResourceSection: () => undefined');
  });

  it('syncs the browser URL to the current short deep link state', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('buildIndexDeepLinkUrl');
    expect(source).toContain('shouldSyncIndexDeepLinkUrl');
    expect(source).toContain('initialResourceDeepLinkHandled');
    expect(source).toContain('const handleInitialResourceDeepLinkHandled = useCallback(() => {');
    expect(source).toContain('onInitialResourceDeepLinkHandled: handleInitialResourceDeepLinkHandled');
    expect(source).toContain('if (!canSyncCurrentDeepLinkUrl || !currentDeepLinkUrl');
    expect(source).toContain('handleCopyCurrentAddress');
    expect(source).toContain('copyToClipboard');
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain('activeProjectId: workspace.activeProjectId');
    expect(source).toContain('resourceType: \'prototype\'');
    expect(source).toContain("const currentContentIsDocumentResource = contentMode === 'doc' || (contentMode === 'canvas' && sidebarTab === 'document');");
    expect(source).toContain('if (currentContentIsDocumentResource && resources.selectedDoc)');
    expect(source).toContain("resourceType: resources.selectedDoc.projectDocumentPath ? 'project-doc' : 'doc'");
    expect(source).toContain('resources.selectedDoc.projectDocumentPath || resources.selectedDoc.resourceId || resources.selectedDoc.name');
    expect(source).toContain("view: contentMode === 'canvas' ? 'canvas' : 'demo'");
    expect(source).toContain('resourceType: \'template\'');
    expect(source).toContain('resourceType: \'theme\'');
  });

  it('wires preview_navigate to current-project resource selection without switching projects', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const navigateStart = source.indexOf('const handlePreviewNavigate = useCallback');
    const navigateEnd = source.indexOf('const previewBridgeContext = useMemo', navigateStart);
    const navigateSource = source.slice(navigateStart, navigateEnd);
    const selectionStart = source.indexOf('const selection = useIndexPageSelectionSync({');
    const selectionEnd = source.indexOf('});', selectionStart);
    const selectionSource = source.slice(selectionStart, selectionEnd);
    const hookStart = source.indexOf('usePreviewBridgeHost({');
    const hookEnd = source.indexOf('});', hookStart);
    const hookSource = source.slice(hookStart, hookEnd);

    expect(navigateStart).toBeGreaterThan(-1);
    expect(navigateEnd).toBeGreaterThan(navigateStart);
    expect(selectionStart).toBeGreaterThan(-1);
    expect(selectionEnd).toBeGreaterThan(selectionStart);
    expect(navigateSource).toContain('target.deepLinkTarget');
    expect(navigateSource).toContain('handleInitialResourceDeepLinkHandled();');
    expect(navigateSource).toContain("target.resourceType === 'canvas'");
    expect(navigateSource).toContain("setSidebarTab('prototype')");
    expect(navigateSource).toContain('setSelectedItem(target.resource)');
    expect(navigateSource).toContain("setViewMode('canvas')");
    expect(navigateSource).toContain("resources.setSelectedDoc(target.resource)");
    expect(navigateSource).toContain("resources.setSelectedTemplate(target.resource)");
    expect(navigateSource).toContain("resources.setSelectedTheme(target.resource)");
    expect(navigateSource).not.toContain('workspace.switchProject');
    expect(selectionSource).toContain('initialResourceDeepLink: initialResourceDeepLinkHandled ? null : initialResourceDeepLink,');
    expect(hookSource).toContain('context: previewBridgeContext,');
    expect(hookSource).toContain('onNavigate: handlePreviewNavigate,');
  });

  it('keeps prototype page selection separate from the selected prototype resource', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('const [selectedPrototypePageId, setSelectedPrototypePageId] = useState<string | null>(null);');
    expect(source).toContain('selectedPrototypePageId,');
    expect(source).toContain('setSelectedPrototypePageId,');
    expect(source).toContain('selectedPageId: selectedPrototypePageId');
    expect(source).toContain('onPrototypePageChange: setSelectedPrototypePageId');
    expect(source).toContain('if (contentMode === \'preview\' && selectedItem)');
    expect(source).toContain('pageId: selectedPrototypePageId || undefined');
  });

  it('syncs project document path selections back to docPath deep links', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const deepLinkTargetSource = source.slice(
      source.indexOf('const currentDeepLinkTarget = useMemo<ResourceDeepLinkTarget | null>(() => {'),
      source.indexOf('const currentDeepLinkUrl = useMemo(() => ('),
    );

    expect(deepLinkTargetSource).toContain("resourceType: resources.selectedDoc.projectDocumentPath ? 'project-doc' : 'doc'");
    expect(deepLinkTargetSource).toContain('resourceId: resources.selectedDoc.projectDocumentPath || resources.selectedDoc.resourceId || resources.selectedDoc.name');
  });

  it('syncs an open prototype spec to a collapsed project review deep link', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const deepLinkTargetSource = source.slice(
      source.indexOf('const currentDeepLinkTarget = useMemo<ResourceDeepLinkTarget | null>(() => {'),
      source.indexOf('const currentDeepLinkUrl = useMemo(() => ('),
    );

    expect(source).toContain('autoOpen: shouldAutoOpenInitialPrototypeSpec');
    expect(deepLinkTargetSource).toContain("if (contentMode === 'prototype-spec' && selectedItem)");
    expect(deepLinkTargetSource).toContain('openSpec: true');
    expect(deepLinkTargetSource).toContain('collapseSidebar: true');
  });

  it('merges runtime prototype route info into workspace state before syncing the selected page', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const routePageNormalizer = source.slice(
      source.indexOf('function normalizePrototypeRoutePage('),
      source.indexOf('function resolveSelectedPrototypePageAfterRouteInfo('),
    );

    expect(source).toContain('workspace.setData');
    expect(source).toContain('setSelectedItem((previous) =>');
    expect(source).toContain('item.name !== selectedItem.name');
    expect(source).toContain('pages: nextPages');
    expect(source).toContain('defaultPageId: normalizePrototypeRoutePageId(routeInfo.defaultPageId) || nextPages[0]?.id || \'\'');
    expect(source).toContain('resolveSelectedPrototypePageAfterRouteInfo');
    expect(source).toContain('setSelectedPrototypePageId((previousPageId) =>');
    expect(source).not.toContain('setSelectedPrototypePageId(normalizePrototypeRoutePageId(routeInfo.activePageId) || null)');
    expect(source).toContain('onPrototypeRouteInfo:');
    expect(routePageNormalizer).toContain("const group = typeof value?.group === 'string' ? value.group.trim() : '';");
    expect(routePageNormalizer).toContain('...(group ? { group } : {})');
  });

  it('refreshes the currently selected prototype after canvas-side prototype reloads', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const refreshSource = source.slice(
      source.indexOf('const handleRefreshCanvasPrototypeItems = useCallback(async (preferredName?: string) => {'),
      source.indexOf('const buildCanvasAssistantContext = useCallback', source.indexOf('const handleRefreshCanvasPrototypeItems = useCallback(async (preferredName?: string) => {')),
    );

    expect(refreshSource).toContain('let nextPrototypes: ItemData[] = workspace.data.prototypes;');
    expect(refreshSource).toContain('nextPrototypes = normalizeProjectResourcesPayload(payload, projectId).data.prototypes;');
    expect(refreshSource).toContain("const targetName = String(preferredName || selectedItem?.name || '').trim();");
    expect(refreshSource).toContain('nextPrototypes.find((item) => item.name === targetName)');
    expect(refreshSource).toContain('setSelectedItem(refreshedSelectedItem);');
    expect(refreshSource).toContain('return nextPrototypes;');
  });

  it('does not reload the sidebar tree on every workspace object identity change', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const ensureEffectStart = source.indexOf('workspace.ensureSidebarTreeLoaded(sidebarTab);');
    const ensureEffectEnd = source.indexOf('});', ensureEffectStart);
    const ensureEffectSource = source.slice(ensureEffectStart, ensureEffectEnd);

    expect(ensureEffectStart).toBeGreaterThan(-1);
    expect(ensureEffectSource).toContain('workspace.ensureSidebarTreeLoaded');
    expect(ensureEffectSource).not.toContain('[sidebarTab, workspace]');
  });

  it('retries loading the current sidebar tree after the initial workspace loading completes', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const ensureEffectStart = source.indexOf('workspace.ensureSidebarTreeLoaded(sidebarTab);');
    const ensureEffectEnd = source.indexOf('});', ensureEffectStart);
    const ensureEffectSource = source.slice(ensureEffectStart, ensureEffectEnd);

    expect(ensureEffectStart).toBeGreaterThan(-1);
    expect(ensureEffectSource).toContain('workspace.loading');
    expect(ensureEffectSource).toContain('[sidebarTab, workspace.ensureSidebarTreeLoaded, workspace.loading]');
  });

  it('labels current project dev startup as client startup', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain("messageApi.loading('正在启动客户端...', 0)");
    expect(source).toContain("payload?.reused ? '客户端已在运行' : '客户端已启动'");
    expect(source).toContain("error?.message || '启动客户端失败'");
    expect(source).not.toContain('正在启动服务器...');
    expect(source).not.toContain('服务器已启动');
  });

  it('builds and exposes a copyable AI prompt for current project startup failures', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const startHandlerSource = source.slice(
      source.indexOf('const handleStartCurrentProjectServer = async () => {'),
      source.indexOf('const handleOpenCanvasInIDE = useCallback', source.indexOf('const handleStartCurrentProjectServer = async () => {')),
    );
    const presentationBuilderCall = source.slice(
      source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder'),
      source.indexOf('const handleMobileItemClick', source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder')),
    );

    expect(source).toContain('buildMakeClientStartupFailurePrompt');
    expect(source).toContain('const [startServerErrorPrompt, setStartServerErrorPrompt]');
    expect(startHandlerSource).toContain('const diagnostic = error?.diagnostic || error;');
    expect(startHandlerSource).toContain('setStartServerErrorPrompt(buildMakeClientStartupFailurePrompt(diagnostic');
    expect(startHandlerSource).toContain('const handleCopyStartServerErrorPrompt = useCallback');
    expect(startHandlerSource).toContain("messageApi.success('已复制给 AI 的处理说明')");
    expect(presentationBuilderCall).toContain('handleCopyStartServerErrorPrompt,');
  });

  it('uses draft wording when opening the selected canvas file in an IDE', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const openCanvasSource = source.slice(
      source.indexOf('const handleOpenCanvasInIDE = useCallback'),
      source.indexOf('const handleOpenCanvasAgent = useCallback'),
    );

    expect(openCanvasSource).toContain('copyText: targetPath ? `[画布](${targetPath})` : undefined');
    expect(openCanvasSource).toContain("emptySelectionMessage: '当前画布文件路径不可用，无法在编辑器中打开'");
    expect(openCanvasSource).not.toContain('[草稿]');
    expect(openCanvasSource).not.toContain('当前草稿文件路径不可用');
  });

  it('submits canvas AI prompts with canvas context and request metadata', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const buildCanvasAssistantContext = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const buildCanvasAssistantContext = useCallback')),
    );

    expect(source).toContain('resolveAssistantCurrentFile');
    expect(submitSource).toContain("const canvasFilePath = String(request.canvasFilePath || '').trim();");
    expect(submitSource).toContain('const requestPrototypeItem = request.createdPrototype || selectedItem;');
    expect(submitSource).toContain("const isPrototypePlaceholderStart = request.source === 'placeholder-start' && request.scene === 'page';");
    expect(submitSource).toContain("const isStartGuideCanvasGeneration = request.source === 'placeholder-start'");
    expect(submitSource).toContain("|| request.source === 'resource-start'");
    expect(submitSource).toContain("|| request.source === 'theme-start';");
    expect(submitSource).toContain('const canvasCurrentFile = canvasFilePath');
    expect(submitSource).toContain("path: canvasFilePath");
    expect(submitSource).toContain("displayName: canvasFilePath.split('/').filter(Boolean).pop() || 'canvas.excalidraw'");
    expect(submitSource).toContain('const currentFile = isPrototypePlaceholderStart');
    expect(submitSource).toContain('currentFile,');
    expect(submitSource).toContain("viewMode: isPrototypePlaceholderStart ? 'demo' : isStartGuideCanvasGeneration ? 'demo' : 'canvas'");
    expect(submitSource).toContain('selectedItem: requestPrototypeItem');
    expect(submitSource).toContain('canvasAiGeneration: {');
    expect(submitSource).toContain('scene: request.scene');
    expect(submitSource).toContain('source: request.source || \'canvas-node\'');
    expect(submitSource).toContain('generatorId: request.generatorId');
    expect(submitSource).toContain('canvasFilePath: isStartGuideCanvasGeneration ? undefined : request.canvasFilePath');
    expect(submitSource).toContain('attachments: request.attachments || []');
    expect(submitSource).toContain('referenceImages: request.referenceImages || []');
    expect(submitSource).toContain('localContextRefs: isPrototypePlaceholderStart ? [] : request.localContextRefs || []');
    expect(submitSource).toContain('provider: request.provider');
    expect(submitSource).toContain('model: request.model');
    expect(submitSource).toContain('mode: request.mode');
    expect(submitSource).toContain('thought: request.thought');
    expect(submitSource).toContain('contextBundle: request.contextBundle');
    expect(submitSource).toContain('canvasContext: {');
    expect(submitSource).toContain('canvasFilePath: request.canvasFilePath');
    expect(submitSource).toContain('canvasName: currentFilePath');
    expect(submitSource).toContain('generatorElementId: request.generatorId');
    expect(submitSource).toContain('statusTaskId: request.statusTaskId');
    expect(submitSource).not.toContain('statusTaskKind');
    expect(submitSource).toContain('source: request.source || \'canvas-node\'');
    expect(submitSource).not.toContain('sceneSettings: request.sceneSettings');
    expect(submitSource).toContain('buildCanvasAssistantContext(request)');
    expect(submitSource).toContain('const handleSubmitCanvasAssistantPrompt = useCallback');
    expect(submitSource).toContain('provider: request.provider,');
    expect(submitSource).toContain('model: request.model,');
    expect(submitSource).toContain('mode: request.mode,');
    expect(submitSource).toContain('thought: request.thought,');
    expect(submitSource).not.toContain('assistantController.assistantContextV1,');
  });

  it('forwards canvas AI selector choices to the direct API submit options', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitHandlerSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback(async (request: CanvasAiGenerationRequest) => {'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );
    const directApiSubmitSource = submitHandlerSource.slice(
      submitHandlerSource.indexOf('const result = await submitAnnotationPromptViaApi({'),
    );

    expect(source).toContain('buildAcpCanvasMcpServers');
    expect(source).toContain('function isCanvasMcpResourcePath(value: unknown): boolean');
    expect(source).toContain('function buildCanvasMcpServersForDirectRun(canvasFilePath: string): unknown[] | undefined');
    expect(submitHandlerSource).toContain('const result = await submitAnnotationPromptViaApi({');
    expect(submitHandlerSource).toContain('const canvasAssistantContext = buildCanvasAssistantContext(request);');
    expect(submitHandlerSource).toContain('mcpServers: buildCanvasMcpServersForDirectRun(getAssistantContextCurrentFilePath(canvasAssistantContext)),');
    expect(submitHandlerSource).toContain('const selectedProvider = resolveAcpPromptClientProvider(request.provider) || annotationProvider;');
    expect(submitHandlerSource).toContain('provider: selectedProvider,');
    expect(submitHandlerSource).toContain('model: request.model ?? annotationModel,');
    expect(submitHandlerSource).toContain('mode: request.mode,');
    expect(submitHandlerSource).toContain('thought: request.thought,');
    expect(submitHandlerSource).toContain('onPrepared: request.onPrepared,');
    expect(submitHandlerSource).toContain('onAccepted: request.onAccepted,');
    expect(submitHandlerSource).toContain('signal: request.signal,');
    expect(directApiSubmitSource.indexOf('provider: selectedProvider,')).toBeGreaterThan(
      directApiSubmitSource.indexOf('scene: `canvas-${request.scene}-direct`,'),
    );
  });

  it('keeps canvas generation currentFile values on the canvas file except prototype placeholder starts', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const buildCanvasAssistantContext = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const buildCanvasAssistantContext = useCallback')),
    );

    expect(submitSource).toContain("const canvasFilePath = String(request.canvasFilePath || '').trim();");
    expect(submitSource).toContain("const isPrototypePlaceholderStart = request.source === 'placeholder-start' && request.scene === 'page';");
    expect(submitSource).toContain("const isStartGuideCanvasGeneration = request.source === 'placeholder-start'");
    expect(submitSource).toContain("|| request.source === 'resource-start'");
    expect(submitSource).toContain("|| request.source === 'theme-start';");
    expect(submitSource).toContain('const placeholderStartCurrentFile = isPrototypePlaceholderStart');
    expect(submitSource).toContain('resolveAssistantCurrentFile({');
    expect(submitSource).toContain("viewMode: 'demo'");
    expect(submitSource).toContain("contentMode: 'preview'");
    expect(submitSource).toContain('const canvasCurrentFile = canvasFilePath');
    expect(submitSource).toContain('? placeholderStartCurrentFile');
    expect(submitSource).toContain("const currentFilePath = isPrototypePlaceholderStart ? getAssistantContextCurrentFilePath({ currentFile }) : canvasFilePath || getAssistantContextCurrentFilePath({ currentFile });");
    expect(submitSource).toContain("const currentFileDirectory = currentFilePath.replace(/\\/[^/]+$/u, '');");
    expect(submitSource).toContain("viewMode: isPrototypePlaceholderStart ? 'demo' : isStartGuideCanvasGeneration ? 'demo' : 'canvas'");
    expect(submitSource).toContain("canvasFilePath: isStartGuideCanvasGeneration ? undefined : request.canvasFilePath");
  });

  it('tracks prototype start drafts and creates a real prototype before first submission', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const draftStateSource = source.slice(
      source.indexOf('const [prototypeStartDraftActive'),
      source.indexOf('const openSettingsDialog', source.indexOf('const [prototypeStartDraftActive')),
    );
    const createDraftSource = source.slice(
      source.indexOf('const handleCreatePrototypeStartDraft = useCallback'),
      source.indexOf('const handleOpenPrototypeCreateDialog', source.indexOf('const handleCreatePrototypeStartDraft = useCallback')),
    );
    const createForDraftSource = source.slice(
      source.indexOf('const handleCreatePrototypeForDraftStart = useCallback'),
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback', source.indexOf('const handleCreatePrototypeForDraftStart = useCallback')),
    );
    const sidebarBuilderCall = source.slice(
      source.indexOf('const sidebarProps = useIndexPageSidebarPropsBuilder'),
      source.indexOf('const handleEnterSelectedPrototypePreview'),
    );
    const presentationBuilderCall = source.slice(
      source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder'),
      source.indexOf('const handleMobileItemClick'),
    );

    expect(draftStateSource).toContain('const [prototypeStartDraftActive, setPrototypeStartDraftActive] = useState(false);');
    expect(draftStateSource).toContain('if (!prototypeStartDraftActive) return;');
    expect(draftStateSource).toContain("sidebarTab !== 'prototype'");
    expect(draftStateSource).toContain("viewMode !== 'demo'");
    expect(draftStateSource).toContain('selectedItem');
    expect(createDraftSource).toContain("setActiveTab('prototypes');");
    expect(createDraftSource).toContain("setSidebarTab('prototype');");
    expect(createDraftSource).toContain("setViewMode('demo');");
    expect(createDraftSource).toContain('setSelectedItem(null);');
    expect(createDraftSource).toContain('setSelectedPrototypePageId(null);');
    expect(createDraftSource).toContain('setResourceStartDraftActive(false);');
    expect(createDraftSource).toContain('setThemeStartDraftActive(false);');
    expect(createDraftSource).toContain('setPrototypeStartDraftActive(true);');
    expect(createForDraftSource).toContain('apiService.createPlaceholderPrototype(requireProjectScope(workspace.activeProjectId))');
    expect(createForDraftSource).toContain('const createdFromResult = buildCreatedPrototypeStartItem(result);');
    expect(createForDraftSource).toContain('const refreshedPrototypes = await handleRefreshCanvasPrototypeItems(createdFromResult.name);');
    expect(createForDraftSource).toContain('const created = refreshedPrototypes.find((item) => item.name === createdFromResult.name) || createdFromResult;');
    expect(createForDraftSource).toContain('setSelectedItem(created);');
    expect(createForDraftSource).toContain('setPrototypeStartDraftActive(false);');
    expect(createForDraftSource).toContain('return created;');
    expect(sidebarBuilderCall).toContain('prototypeStartDraftActive,');
    expect(sidebarBuilderCall).toContain('handleCreatePrototypeStartDraft,');
    expect(presentationBuilderCall).toContain('prototypeStartDraftActive,');
    expect(presentationBuilderCall).toContain('onCreatePrototypeForDraftStart: handleCreatePrototypeForDraftStart,');
  });

  it('opens resource and design start requests in fresh visible assistant conversations', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );

    expect(submitSource).toContain("const shouldOpenStartGuideConversation = request.source === 'resource-start'");
    expect(submitSource).toContain("|| request.source === 'theme-start';");
    expect(submitSource).toContain('const submitted = await handleSubmitAnnotationAssistantPrompt(');
    expect(submitSource).toContain('canvasAssistantContext,');
    expect(submitSource).toContain('forceNewThread: true,');
    expect(submitSource).toContain("waitUntil: 'started',");
    expect(submitSource).toContain('provider: selectedProvider,');
    expect(submitSource).toContain('model: request.model ?? annotationModel,');
    expect(submitSource).toContain('mode: request.mode,');
    expect(submitSource).toContain('thought: request.thought,');
    expect(submitSource).toContain("return { ok: Boolean(submitted && (typeof submitted !== 'object' || submitted.ok !== false)) };");
  });

  it('keeps non-start-guide canvas requests on the direct API runner', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );

    expect(submitSource).toContain('submitAnnotationPromptViaApi({');
    expect(submitSource).toContain('scene: `canvas-${request.scene}-direct`,');
    expect(submitSource).toContain('agentRunConcurrency: preferences.agentRunConcurrency,');
    expect(submitSource.indexOf('if (shouldOpenStartGuideConversation) {'))
      .toBeLessThan(submitSource.indexOf('const result = await submitAnnotationPromptViaApi({'));
  });

  it('submits annotation prompts with the configured annotation provider and model', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitAnnotationAssistantPrompt = useCallback'),
      source.indexOf('const buildPromptActionAssistantContext', source.indexOf('const handleSubmitAnnotationAssistantPrompt = useCallback')),
    );
    const previewSource = source.slice(
      source.indexOf('const preview = useIndexPagePreviewActions'),
      source.indexOf('const selection = useIndexPageSelectionSync'),
    );

    expect(source).toContain("import { resolveAcpPromptClientProvider } from '@/common/acpModelConfig';");
    expect(submitSource).toContain('if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return false;');
    expect(submitSource).toContain('const annotationPromptClient = preferences.annotationPromptClient || preferences.preferredPromptClient;');
    expect(submitSource).toContain('const annotationProvider = resolveAcpPromptClientProvider(annotationPromptClient);');
    expect(submitSource).toContain('if (!annotationProvider) return false;');
    expect(submitSource).toContain('const annotationModel = preferences.annotationModel || null;');
    expect(submitSource).toContain('provider: options?.provider ?? annotationProvider,');
    expect(submitSource).toContain('model: options?.model ?? annotationModel,');
    expect(submitSource).toContain('autoSend: options?.autoSend,');
    expect(submitSource).toContain('agentRunConcurrency: preferences.agentRunConcurrency,');
    expect(source).toContain('preferences.preferredPromptClient,');
    expect(source).toContain('preferences.annotationPromptClient,');
    expect(source).toContain('preferences.annotationModel,');
    expect(source).toContain('preferences.agentRunConcurrency,');
    expect(previewSource).toContain('openSettingsDialog,');
  });

  it('opens AI settings instead of triggering AI when no default AI provider is configured', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const guardSource = source.slice(
      source.indexOf('const ensureDefaultAiConfigured = useCallback'),
      source.indexOf('const handleSubmitAnnotationAssistantPrompt = useCallback'),
    );
    const acpOpenSource = source.slice(
      source.indexOf('const handleOpenAcpWebAgent = useCallback'),
      source.indexOf('const handleOpenImageAiPanel = useCallback'),
    );
    const imageOpenSource = source.slice(
      source.indexOf('const handleOpenImageAiPanel = useCallback'),
      source.indexOf('const handleOpenAssistantCanvas = useCallback'),
    );

    expect(guardSource).toContain('if (resolveAcpPromptClientProvider(normalizePromptClientPreference(promptClient))) return true;');
    expect(guardSource).toContain("openSettingsDialog('ai');");
    expect(guardSource).toContain("messageApi.warning('请先在 AI 设置中选择本地 AI Agent');");
    expect(acpOpenSource).toContain('if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return;');
    expect(imageOpenSource).toContain('if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return;');
    expect(source).toContain('ensureDefaultAiConfigured,');
  });

  it('returns visible direct API output artifacts from canvas generation submissions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );

    expect(source).toContain("import { mapCanvasDirectRunArtifacts } from '../domains/ai-generation/canvasDirectRun';");
    expect(submitSource).toContain('const result = await submitAnnotationPromptViaApi({');
    expect(submitSource).toContain('targetPath: request.canvasFilePath || undefined,');
    expect(submitSource).toContain('const artifacts = mapCanvasDirectRunArtifacts((result.artifacts || []) as Record<string, unknown>[], {');
    expect(submitSource).toContain('canvasFilePath: request.canvasFilePath,');
    expect(submitSource).toContain('runId: result.runId,');
    expect(submitSource).toContain('threadId: result.threadId,');
    expect(submitSource).toContain('return { ok: true, artifacts };');
  });

  it('shows a short startup warning when the Make state directory is not writable', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain("fetch('/api/make-state/health')");
    expect(source).toContain('MAKE_STATE_DIR_NOT_WRITABLE');
    expect(source).toContain("title: '无法保存项目列表'");
    expect(source).toContain("description: '本机数据目录不可写，新建项目可能失败。'");
    expect(source).toContain("confirmText: '复制给 AI 处理'");
    expect(source).toContain('buildMakeStatePermissionPrompt');
  });

  it('keeps the desktop preview workspace available in narrow desktop browser panes', () => {
    const styles = readFileSync(resolve(__dirname, './styles/index-page.css'), 'utf8');

    expect(styles).toContain('@media (max-width: 640px) and (hover: none) and (pointer: coarse)');
    expect(styles).not.toContain('@media (max-width: 640px) {');
    expect(styles).not.toContain('@media (min-width: 641px)');
    expect(styles).not.toContain('@media (max-width: 768px)');
    expect(styles).not.toContain('@media (min-width: 769px)');
  });

  it('destructures the initial create dialog tab before passing it to dialogs', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const createDialogHookStart = source.indexOf('} = useCreateDialog(activeTab, workspace.data);');
    const createDialogHookSource = source.slice(
      source.lastIndexOf('const {', createDialogHookStart),
      createDialogHookStart,
    );
    const dialogsPropsStart = source.indexOf('const dialogsProps = {');
    const dialogsPropsEnd = source.indexOf('const presentationProps = useIndexPagePresentationPropsBuilder', dialogsPropsStart);
    const dialogsPropsSource = source.slice(dialogsPropsStart, dialogsPropsEnd);

    expect(createDialogHookStart).toBeGreaterThan(-1);
    expect(createDialogHookSource).toContain('initialCreateDialogTab,');
    expect(dialogsPropsSource).toContain('initialTab: initialCreateDialogTab,');
  });

  it('tracks the requested settings tab before opening the settings dialog', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const dialogsSource = readFileSync(resolve(__dirname, '../components/app/IndexDialogs.tsx'), 'utf8');

    expect(source).toContain("import type { SettingsDialogAIContext, SettingsDialogInitialTab } from '../components/SettingsDialog';");
    expect(source).toContain("const [settingsDialogInitialTab, setSettingsDialogInitialTab] = useState<SettingsDialogInitialTab>('project');");
    expect(source).toContain('const [settingsDialogAIContext, setSettingsDialogAIContext] = useState<SettingsDialogAIContext | null>(null);');
    expect(source).toContain("const openSettingsDialog = useCallback((tab: SettingsDialogInitialTab = 'project', aiContext?: SettingsDialogAIContext | null) => {");
    expect(source).toContain('setSettingsDialogInitialTab(tab);');
    expect(source).toContain("setSettingsDialogAIContext(tab === 'ai' ? aiContext || null : null);");
    expect(source).toContain('setSettingsDialogOpen(true);');
    expect(source).toContain('openSettingsDialog,');
    expect(source).toContain('settingsDialogInitialTab,');
    expect(source).toContain('settingsDialogAIContext,');
    expect(dialogsSource).toContain('settingsDialogInitialTab: SettingsDialogInitialTab;');
    expect(dialogsSource).toContain('settingsDialogAIContext: SettingsDialogAIContext | null;');
    expect(dialogsSource).toContain('settingsDialogInitialTab,');
    expect(dialogsSource).toContain('settingsDialogAIContext,');
    expect(dialogsSource).toContain('initialTab={settingsDialogInitialTab}');
    expect(dialogsSource).toContain('initialAcpRuntime={settingsDialogAIContext?.runtime}');
    expect(dialogsSource).toContain('initialAcpFailureSource={settingsDialogAIContext?.failureSource}');
    expect(dialogsSource).toContain('initialAcpFailureMessage={settingsDialogAIContext?.failureMessage}');
  });

  it('opens workspace version collaboration as a separate drawer from the sidebar menu', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const sidebarBuilderSource = readFileSync(resolve(__dirname, './hooks/useIndexPageSidebarPropsBuilder.ts'), 'utf8');
    const dialogsSource = readFileSync(resolve(__dirname, '../components/app/IndexDialogs.tsx'), 'utf8');
    const typesSource = readFileSync(resolve(__dirname, '../types/index-page.types.ts'), 'utf8');

    expect(source).toContain('const [versionCollaborationDrawerOpen, setVersionCollaborationDrawerOpen] = useState(false);');
    expect(source).toContain('setVersionCollaborationDrawerOpen,');
    expect(source).toContain('versionCollaborationDrawerOpen,');
    expect(source).toContain('versionCollaborationDrawerOpen,');
    expect(sidebarBuilderSource).toContain('setVersionCollaborationDrawerOpen: Dispatch<SetStateAction<boolean>>;');
    expect(sidebarBuilderSource).toContain('onVersionCollaborationClick: () => deps.setVersionCollaborationDrawerOpen(true),');
    expect(typesSource).toContain('onVersionCollaborationClick: () => void;');
    expect(dialogsSource).toContain('versionCollaborationDrawerOpen: boolean;');
    expect(dialogsSource).toContain('setVersionCollaborationDrawerOpen: (open: boolean) => void;');
    expect(source).toContain('const openVersionCollaborationFromSettings = useCallback(() => {');
    expect(source).toContain('setSettingsDialogOpen(false);');
    expect(source).toContain('setVersionCollaborationDrawerOpen(true);');
    expect(dialogsSource).toContain('onOpenVersionCollaborationFromSettings: () => void;');
    expect(dialogsSource).toContain('onOpenVersionCollaborationFromSettings,');
  });

  it('connects the hidden Admin bridge while a Web Agent panel is open', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('const assistantVisible = assistantController.assistantVisible;');
    expect(source).toContain('if (assistantVisible) {');
    expect(source).toContain('connectBridge();');
    expect(source).toContain('disconnectBridge();');
    expect(source).not.toContain('onBridgeToggle: bridge.toggle');
  });

  it('clears OpenCode bridge context before disconnecting the Web Agent panel', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const effectStart = source.indexOf('if (assistantVisible) {');
    const effectEnd = source.indexOf('}, [assistantVisible, connectBridge, clearBridgeContext, disconnectBridge]);', effectStart);
    const effectSource = source.slice(effectStart, effectEnd);

    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(source).toContain('const clearBridgeContext = bridge.clearContext;');
    expect(effectSource).toContain('clearBridgeContext();');
    expect(effectSource.indexOf('clearBridgeContext();')).toBeLessThan(effectSource.indexOf('disconnectBridge();'));
  });

  it('does not expose a dedicated canvas OpenCode WebUI opener', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const agentStart = source.indexOf('const handleOpenCanvasAgent = useCallback(async () =>');
    const agentEnd = source.indexOf('const buildCanvasAssistantContext = useCallback', agentStart);
    const agentSource = source.slice(agentStart, agentEnd);

    expect(source).not.toContain('handleOpenCanvasOpenCode');
    expect(source).not.toContain('onOpenCanvasOpenCode');
    expect(source).not.toContain("assistantController.handleOpenAcpWebAgent(undefined, 'opencode')");
    expect(agentStart).toBeGreaterThan(-1);
    expect(agentEnd).toBeGreaterThan(agentStart);
    expect(agentSource).not.toContain('canvasFilePath');
    expect(agentSource).toContain('handleOpenAcpWebAgent()');
  });

  it('syncs canvas annotation comments with the assistant current file path', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const effectStart = source.indexOf('// Auto-sync annotations to bridge context');
    const effectEnd = source.indexOf('// Handle "open in editor" from canvas embed toolbar', effectStart);
    const effectSource = source.slice(effectStart, effectEnd);

    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(effectSource).toContain('syncAssistantCanvasComments(canvasAnnotations, assistantCurrentFilePath);');
    expect(effectSource).not.toContain('syncAssistantCanvasComments(canvasAnnotations, currentFilePath);');
  });

  it('restores the assistant panel after refresh when it was left open for the project', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('buildAssistantAutoOpenDismissedStorageKey');
    expect(source).toContain('buildAssistantAutoOpenPanelModeStorageKey');
    expect(source).toContain('getAssistantAutoOpenDismissed');
    expect(source).toContain('getAssistantAutoOpenPanelMode');
    expect(source).toContain('setAssistantAutoOpenDismissed');
    expect(source).toContain('setAssistantAutoOpenPanelMode');
    expect(source).toContain("import type { AcpProvider } from '@/common/assistant-context/types';");
    expect(source).toMatch(/import\s+\{[^}]*getAssistantContextCurrentFilePath[^}]*\}\s+from '..\/utils\/assistantContext';/s);
    expect(source).toContain("const onlineOpenAutoTriggeredRef = useRef('');");
    expect(source).toContain("const onlineOpenAutoRestorePendingRef = useRef('');");
    expect(source).toContain('const assistantCurrentFilePath = getAssistantContextCurrentFilePath(assistantController.assistantContextV1);');
    expect(source).toContain('const assistantAutoOpenTargetPath = assistantCurrentFilePath');
    expect(source).toContain('const assistantAutoOpenDismissedStorageKey = useMemo(() => (');
    expect(source).toContain('buildAssistantAutoOpenDismissedStorageKey(assistantAutoOpenProjectScope)');
    expect(source).toContain('const assistantAutoOpenPanelModeStorageKey = useMemo(() => (');
    expect(source).toContain('buildAssistantAutoOpenPanelModeStorageKey(assistantAutoOpenProjectScope)');
    expect(source).toContain('const initialAssistantPanelMode = useMemo(() => (');
    expect(source).toContain('getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey)');
    expect(source).toContain('initialAssistantPanelMode,');
    expect(source.indexOf('const assistantAutoOpenPanelModeStorageKey = useMemo(() => ('))
      .toBeLessThan(source.indexOf('const initialAssistantPanelMode = useMemo(() => ('));
    expect(source.indexOf('const initialAssistantPanelMode = useMemo(() => ('))
      .toBeLessThan(source.indexOf('const assistantController = useAssistantPanelController({'));
    expect(source).toContain('const handleOpenAcpWebAgent = useCallback((targetPath?: string, provider?: AcpProvider) => {');
    expect(source).toContain('setAssistantAutoOpenDismissed(buildAssistantAutoOpenKeyForTarget(targetPath), false);');
    expect(source).toContain("setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, 'general-ai');");
    expect(source).toContain('setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);');
    expect(source).toContain("setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, 'image-ai');");
    expect(source.indexOf('setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);'))
      .toBeLessThan(source.indexOf('return assistantController.openAssistantWithContextAndSubmitPrompt(context, prompt'));
    expect(source).toContain('const handleCloseWebAgentPanel = useCallback(() => {');
    expect(source).toContain('setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, true);');
    expect(source).toContain('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    expect(source).toContain('if (!assistantAutoOpenTargetPath) {');
    expect(source).toContain('if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {');
    expect(source).toContain('onlineOpenAutoRestorePendingRef.current = autoOpenTargetKey;');
    expect(source).toContain('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);');
    expect(source).toContain('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode)');
    expect(source).toContain('onCloseWebAgentPanel: handleCloseWebAgentPanel,');
    expect(source).toContain('assistantAutoOpenDismissedStorageKey,');
    expect(source).toContain('assistantAutoOpenPanelModeStorageKey,');
    expect(source).toContain('preferences.initialPreferencesLoaded,');
    expect(source).not.toContain('parseOpenMethod(preferences.preferredIDE)');
    expect(source).not.toContain('resolveCachedOnlineOpenProvider');

    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const autoOpenEffectEnd = source.indexOf('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode)', autoOpenEffectStart);
    const autoOpenEffectSource = source.slice(autoOpenEffectStart, autoOpenEffectEnd);

    expect(autoOpenEffectSource.indexOf('const autoOpenTargetKey = assistantAutoOpenTargetPath;'))
      .toBeLessThan(autoOpenEffectSource.indexOf('if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {'));
    expect(autoOpenEffectSource.indexOf('if (onlineOpenAutoTriggeredRef.current === autoOpenTargetKey) {'))
      .toBeLessThan(autoOpenEffectSource.indexOf('if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {'));
    expect(autoOpenEffectSource.indexOf('if (onlineOpenAutoRestorePendingRef.current === autoOpenTargetKey) {'))
      .toBeLessThan(autoOpenEffectSource.indexOf('if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {'));
    expect(autoOpenEffectSource.indexOf('if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {'))
      .toBeLessThan(autoOpenEffectSource.indexOf('onlineOpenAutoRestorePendingRef.current = autoOpenTargetKey;'));
    expect(autoOpenEffectSource).toContain('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);');
  });

  it('dedupes in-flight assistant auto-restore attempts while retrying later after failures', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const autoOpenEffectEnd = source.indexOf('}, [', autoOpenEffectStart);
    const autoOpenEffectSource = source.slice(autoOpenEffectStart, autoOpenEffectEnd);

    expect(autoOpenEffectStart).toBeGreaterThan(-1);
    expect(autoOpenEffectEnd).toBeGreaterThan(autoOpenEffectStart);
    expect(source).toContain("const onlineOpenAutoTriggeredRef = useRef('');");
    expect(source).toContain("const onlineOpenAutoRestorePendingRef = useRef('');");
    expect(autoOpenEffectSource).toContain('const autoOpenTargetKey = assistantAutoOpenTargetPath;');
    expect(autoOpenEffectSource).toContain('if (onlineOpenAutoTriggeredRef.current === autoOpenTargetKey) {');
    expect(autoOpenEffectSource).toContain('if (onlineOpenAutoRestorePendingRef.current === autoOpenTargetKey) {');
    expect(autoOpenEffectSource).toContain('onlineOpenAutoRestorePendingRef.current = autoOpenTargetKey;');
    expect(autoOpenEffectSource).toContain('Promise.resolve(restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode))');
    expect(autoOpenEffectSource).toContain('then((opened) => {');
    expect(autoOpenEffectSource).toContain('if (opened) {');
    expect(autoOpenEffectSource).toContain('onlineOpenAutoTriggeredRef.current = autoOpenTargetKey;');
    expect(autoOpenEffectSource).toContain('finally(() => {');
    expect(autoOpenEffectSource).toContain('if (onlineOpenAutoRestorePendingRef.current === autoOpenTargetKey) {');
    expect(autoOpenEffectSource).toContain("onlineOpenAutoRestorePendingRef.current = '';");
  });

  it('keeps the assistant panel closed on the prototype placeholder start page', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const autoOpenEffectEnd = source.indexOf('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode)', autoOpenEffectStart);
    const autoOpenEffectSource = source.slice(autoOpenEffectStart, autoOpenEffectEnd);
    const autoCloseEffectStart = source.indexOf('if (!prototypePlaceholderAutoCloseKey) {');
    const autoCloseEffectEnd = source.indexOf('}, [', autoCloseEffectStart);
    const autoCloseEffectSource = source.slice(autoCloseEffectStart, autoCloseEffectEnd);

    expect(source).toContain("const prototypePlaceholderActive = contentMode === 'preview' && viewMode === 'demo' && selectedItem?.placeholder === true;");
    expect(source).toContain('const prototypePlaceholderAutoCloseKey = prototypePlaceholderActive && selectedItem');
    expect(source).toContain("const closedPrototypePlaceholderAutoCloseKeyRef = useRef('');");
    expect(autoOpenEffectSource).toContain('if (prototypePlaceholderActive) {');
    expect(autoOpenEffectSource.indexOf('if (prototypePlaceholderActive) {'))
      .toBeLessThan(autoOpenEffectSource.indexOf('const autoOpenTargetKey = assistantAutoOpenTargetPath;'));
    expect(autoCloseEffectSource).toContain("closedPrototypePlaceholderAutoCloseKeyRef.current = '';");
    expect(autoCloseEffectSource).toContain('if (!assistantController.assistantVisible) {');
    expect(autoCloseEffectSource).toContain('if (closedPrototypePlaceholderAutoCloseKeyRef.current === prototypePlaceholderAutoCloseKey) {');
    expect(autoCloseEffectSource).toContain('closedPrototypePlaceholderAutoCloseKeyRef.current = prototypePlaceholderAutoCloseKey;');
    expect(autoCloseEffectSource.indexOf('if (!assistantController.assistantVisible) {'))
      .toBeLessThan(autoCloseEffectSource.indexOf('closedPrototypePlaceholderAutoCloseKeyRef.current = prototypePlaceholderAutoCloseKey;'));
    expect(autoCloseEffectSource).toContain('assistantController.hideAssistantPanelTemporarily();');
    expect(autoCloseEffectSource).not.toContain('setAssistantAutoOpenDismissed(');
    expect(autoCloseEffectSource).not.toContain('assistantController.handleToggleAssistant();');
  });

  it('restores a temporarily hidden assistant after leaving a prototype placeholder', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const restoreHiddenEffectStart = source.indexOf('if (!assistantController.assistantPanelMounted) {');
    const restoreHiddenEffectEnd = source.indexOf('}, [', restoreHiddenEffectStart);
    const restoreHiddenEffectSource = source.slice(restoreHiddenEffectStart, restoreHiddenEffectEnd);

    expect(restoreHiddenEffectStart).toBeGreaterThan(-1);
    expect(restoreHiddenEffectEnd).toBeGreaterThan(restoreHiddenEffectStart);
    expect(restoreHiddenEffectSource).toContain('if (prototypePlaceholderActive) {');
    expect(restoreHiddenEffectSource).toContain('if (prototypeWaitingGenerationActive) {');
    expect(restoreHiddenEffectSource).toContain('if (!assistantController.assistantPanelMounted) {');
    expect(restoreHiddenEffectSource).toContain('if (assistantController.assistantVisible) {');
    expect(restoreHiddenEffectSource).toContain('if (!assistantAutoOpenTargetPath) {');
    expect(restoreHiddenEffectSource).toContain('if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {');
    expect(restoreHiddenEffectSource).toContain('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);');
    expect(restoreHiddenEffectSource).toContain('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);');
    expect(restoreHiddenEffectSource).not.toContain('onlineOpenAutoTriggeredRef.current');
  });

  it('does not auto-open a closed mounted assistant panel after switching projects', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const projectScopeEffectStart = source.indexOf('const previousAssistantAutoOpenProjectScopeRef = useRef');
    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const restoreHiddenEffectStart = source.indexOf('if (!assistantController.assistantPanelMounted) {');
    const projectScopeEffectSource = source.slice(projectScopeEffectStart, autoOpenEffectStart);
    const autoOpenEffectSource = source.slice(
      autoOpenEffectStart,
      source.indexOf('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode)', autoOpenEffectStart),
    );
    const restoreHiddenEffectSource = source.slice(
      restoreHiddenEffectStart,
      source.indexOf('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);', restoreHiddenEffectStart),
    );
    const waitingEffectStart = source.indexOf('if (!prototypeWaitingGenerationActive) {');
    const waitingEffectSource = source.slice(
      waitingEffectStart,
      source.indexOf("void restoreAssistantPanel(assistantAutoOpenTargetPath, 'general-ai');", waitingEffectStart),
    );

    expect(projectScopeEffectStart).toBeGreaterThan(-1);
    expect(projectScopeEffectSource).toContain('const previousScope = previousAssistantAutoOpenProjectScopeRef.current;');
    expect(projectScopeEffectSource).toContain('if (previousScope && nextScope && previousScope !== nextScope && !assistantController.assistantVisible) {');
    expect(projectScopeEffectSource).toContain('assistantAutoOpenSuppressedProjectScopeRef.current = nextScope;');
    expect(autoOpenEffectSource).toContain('if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {');
    expect(restoreHiddenEffectSource).toContain('if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {');
    expect(waitingEffectSource).not.toContain('if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {');
  });

  it('opens the assistant panel for waiting prototype previews with the active target path', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const autoOpenEffectEnd = source.indexOf('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode)', autoOpenEffectStart);
    const autoOpenEffectSource = source.slice(autoOpenEffectStart, autoOpenEffectEnd);
    const waitingEffectStart = source.indexOf('if (!prototypeWaitingGenerationActive) {');
    const waitingEffectEnd = source.indexOf('}, [', waitingEffectStart);
    const waitingEffectSource = source.slice(waitingEffectStart, waitingEffectEnd);

    expect(source).toContain("const prototypeWaitingGenerationActive = contentMode === 'preview' && viewMode === 'demo' && selectedItem?.generationStatus === 'waiting' && selectedItem?.placeholder !== true;");
    expect(source).toContain('const prototypeWaitingGenerationAutoOpenKey = prototypeWaitingGenerationActive && selectedItem');
    expect(source).toContain("const openedPrototypeWaitingGenerationKeyRef = useRef('');");
    expect(autoOpenEffectSource).toContain('if (prototypeWaitingGenerationActive) {');
    expect(autoOpenEffectSource.indexOf('if (prototypeWaitingGenerationActive) {'))
      .toBeLessThan(autoOpenEffectSource.indexOf('const autoOpenTargetKey = assistantAutoOpenTargetPath;'));
    expect(waitingEffectStart).toBeGreaterThan(-1);
    expect(waitingEffectEnd).toBeGreaterThan(waitingEffectStart);
    expect(waitingEffectSource).toContain("openedPrototypeWaitingGenerationKeyRef.current = '';");
    expect(waitingEffectSource).toContain('if (!preferences.initialPreferencesLoaded) {');
    expect(waitingEffectSource).toContain('if (!prototypeWaitingGenerationAutoOpenKey) {');
    expect(waitingEffectSource).toContain('const waitingGenerationAutoOpenKey = prototypeWaitingGenerationAutoOpenKey;');
    expect(waitingEffectSource).toContain('if (openedPrototypeWaitingGenerationKeyRef.current === waitingGenerationAutoOpenKey) {');
    expect(waitingEffectSource).toContain('openedPrototypeWaitingGenerationKeyRef.current = waitingGenerationAutoOpenKey;');
    expect(waitingEffectSource).toContain('if (!assistantAutoOpenTargetPath) {');
    expect(waitingEffectSource.indexOf('if (!assistantAutoOpenTargetPath) {'))
      .toBeLessThan(waitingEffectSource.indexOf('openedPrototypeWaitingGenerationKeyRef.current = waitingGenerationAutoOpenKey;'));
    expect(waitingEffectSource).toContain('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);');
    expect(waitingEffectSource).toContain('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);');
    expect(waitingEffectSource).not.toContain("restoreAssistantPanel(assistantAutoOpenTargetPath, 'general-ai');");
  });

  it('preserves the remembered assistant panel mode when auto-opening waiting prototype previews', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const waitingEffectStart = source.indexOf('if (!prototypeWaitingGenerationActive) {');
    const waitingEffectEnd = source.indexOf('}, [', waitingEffectStart);
    const waitingEffectSource = source.slice(waitingEffectStart, waitingEffectEnd);

    expect(waitingEffectStart).toBeGreaterThan(-1);
    expect(waitingEffectEnd).toBeGreaterThan(waitingEffectStart);
    expect(waitingEffectSource).toContain("assistantAutoOpenSuppressedProjectScopeRef.current = '';");
    expect(waitingEffectSource).toContain('setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);');
    expect(waitingEffectSource).toContain('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);');
    expect(waitingEffectSource).toContain('setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, rememberedAiPanelMode);');
    expect(waitingEffectSource).not.toContain("setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, 'general-ai');");
    expect(waitingEffectSource).not.toContain("restoreAssistantPanel(assistantAutoOpenTargetPath, 'general-ai');");
    expect(waitingEffectSource.indexOf('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);'))
      .toBeLessThan(waitingEffectSource.indexOf('setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, rememberedAiPanelMode);'));
    expect(waitingEffectSource.indexOf("assistantAutoOpenSuppressedProjectScopeRef.current = '';"))
      .toBeLessThan(waitingEffectSource.indexOf('void restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);'));
    expect(waitingEffectSource.indexOf('setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);'))
      .toBeLessThan(waitingEffectSource.indexOf('void restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);'));
    expect(waitingEffectSource.indexOf('setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, rememberedAiPanelMode);'))
      .toBeLessThan(waitingEffectSource.indexOf('void restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);'));
  });

  it('does not retry failed automatic assistant starts for waiting prototype previews', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const waitingEffectStart = source.indexOf('if (!prototypeWaitingGenerationActive) {');
    const waitingEffectEnd = source.indexOf('}, [', waitingEffectStart);
    const waitingEffectSource = source.slice(waitingEffectStart, waitingEffectEnd);

    expect(waitingEffectStart).toBeGreaterThan(-1);
    expect(waitingEffectEnd).toBeGreaterThan(waitingEffectStart);
    expect(waitingEffectSource).toContain('const waitingGenerationAutoOpenKey = prototypeWaitingGenerationAutoOpenKey;');
    expect(waitingEffectSource).toContain('const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);');
    expect(waitingEffectSource).toContain('openedPrototypeWaitingGenerationKeyRef.current = waitingGenerationAutoOpenKey;');
    expect(waitingEffectSource).toContain('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);');
    expect(waitingEffectSource).not.toContain('then((opened) => {');
    expect(waitingEffectSource).not.toContain('if (!opened && openedPrototypeWaitingGenerationKeyRef.current === waitingGenerationAutoOpenKey) {');
  });

  it('passes assistant drag/drop and screenshot attachment handlers into the assistant panel and canvas', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain("import type { AssistantImageAttachmentPayload } from '../domains/assistant/assistantContextPayload';");
    expect(source).toContain('const handleAddCanvasScreenshotToAssistant = useCallback(async (attachment: AssistantImageAttachmentPayload) => {');
    expect(source).toContain('assistantController.addImageAttachment(attachment)');
    expect(source).toContain('const handleAddCanvasImageToAssistant = useCallback(async (attachment: AssistantImageAttachmentPayload, promptText?: string) => {');
    expect(source).toContain('const added = await assistantController.addImageAttachment(attachment);');
    expect(source).toContain('if (!added) return false;');
    expect(source).toContain('return assistantController.appendComposerText(prompt);');
    expect(source).toContain('onAddCanvasScreenshotToAI: handleAddCanvasScreenshotToAssistant,');
    expect(source).toContain('onAddCanvasImageToAI: handleAddCanvasImageToAssistant,');
    expect(source).toContain('onAddContextItems: assistantController.addContextItems,');
    expect(source).toContain('handleAddCanvasScreenshotToAssistant');
    expect(source).toContain('handleAddCanvasImageToAssistant');
    expect(source).toContain('onAddCanvasImageToAI');
  });

  it('does not pass assistant artifact queries into the canvas presentation path', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const presentationBuilderCall = source.slice(
      source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder'),
      source.indexOf('const handleMobileItemClick', source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder')),
    );

    expect(source).not.toContain('getAssistantArtifacts: assistantController.getAssistantArtifacts,');
    expect(presentationBuilderCall).not.toContain('getAssistantArtifacts');
  });

  it('keeps the global assistant sidebar available while a start page is active', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const startStateSource = source.slice(
      source.indexOf('const prototypePlaceholderActive = contentMode ==='),
      source.indexOf('const preferences = useIndexPagePreferences'),
    );
    const sidebarBuilderCall = source.slice(
      source.indexOf('const sidebarProps = useIndexPageSidebarPropsBuilder'),
      source.indexOf('const handleEnterSelectedPrototypePreview'),
    );
    const presentationBuilderCall = source.slice(
      source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder'),
      source.indexOf('const handleMobileItemClick', source.indexOf('const presentationAreaProps = useIndexPagePresentationPropsBuilder')),
    );
    const assistantPanelPropsSource = source.slice(
      source.indexOf('const assistantPanelProps = {'),
      source.indexOf('const dialogsProps = {'),
    );

    expect(startStateSource).toContain('const prototypeStartPageActive = prototypeStartDraftActive || prototypePlaceholderActive;');
    expect(sidebarBuilderCall).toContain('prototypeStartPageActive,');
    expect(sidebarBuilderCall).toContain('webAgentPanelOpen: assistantController.assistantVisible,');
    expect(sidebarBuilderCall).toContain('aiPanelMode: assistantController.aiPanelMode,');
    expect(sidebarBuilderCall).toContain('handleOpenAcpWebAgent,');
    expect(sidebarBuilderCall).toContain('handleOpenImageAiPanel,');
    expect(presentationBuilderCall).toContain('assistantVisible: assistantController.assistantVisible,');
    expect(presentationBuilderCall).toContain('webAgentPanelOpen: assistantController.assistantVisible,');
    expect(presentationBuilderCall).toContain('aiPanelMode: assistantController.aiPanelMode,');
    expect(presentationBuilderCall).toContain('handleToggleAssistant: handleToggleAssistantPanel,');
    expect(assistantPanelPropsSource).toContain('mounted: assistantController.assistantPanelMounted,');
    expect(assistantPanelPropsSource).toContain('visible: assistantController.assistantVisible,');
    expect(source).not.toContain('startPageActive ? false : assistantController');
    expect(source).not.toContain('startPageActive ? undefined : handleOpen');
  });

  it('clears the selected resource folder before opening a folder preview item', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const handlerSource = source.slice(
      source.indexOf('onSelectResourceFolderItem: (item) => {'),
      source.indexOf('onOpenResourceFolderInSystem: resources.handleOpenResourceFolderInSystem,'),
    );

    expect(handlerSource).toContain('resources.setSelectedResourceFolder(null);');
    expect(handlerSource.indexOf('resources.setSelectedResourceFolder(null);'))
      .toBeLessThan(handlerSource.indexOf('preview.handleSelectDoc(item);'));
  });

  it('threads the workspace project into project-owned dialogs and document uploads', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain("formData.append('projectId', requireProjectScope(workspace.activeProjectId).projectId);");
    expect(source).toContain('activeProjectId: workspace.activeProjectId || \'\',');
    expect(source).toContain('settingsDialogProjectId: workspace.activeProjectId || \'\',');
  });

  it('creates one host-owned notification coordinator and passes it to preview actions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('const notificationPlayerRef = useRef<NotificationPlayer | null>(null);');
    expect(source).toContain('createNotificationCoordinator({');
    expect(source).toContain('player: notificationPlayerRef.current,');
    expect(source).toContain('const notificationCoordinatorRef = useRef<NotificationCoordinator | null>(null);');
    expect(source).toContain('const notifyAiNotification = useCallback((intent: NotificationIntent) => {');
    expect(source).toContain('onAiNotification: notifyAiNotification,');
  });

  it('primes host notification audio from the first user gesture', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('const primeNotificationAudio = () => {');
    expect(source).toContain('notificationPlayerRef.current?.prime?.();');
    expect(source).toContain("window.addEventListener('pointerdown', primeNotificationAudio, { capture: true, once: true });");
    expect(source).toContain("window.addEventListener('keydown', primeNotificationAudio, { capture: true, once: true });");
  });

  it('exposes the host notification diagnostics API only through the development installer', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('installNotificationDebugApi');
    expect(source).toContain('diagnostics: notificationDiagnostics,');
    expect(source).toContain('player: notificationPlayerRef.current!,');
  });
});
