import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('IndexPage source', () => {
  it('mounts the Commentary voice entry through existing preview callbacks only', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const voiceSource = source.slice(
      source.indexOf('const commentaryVoiceCommentAdapter = useMemo'),
      source.indexOf('const prototypeSpecNavigation = usePrototypeSpecNavigationGuard'),
    );

		expect(voiceSource).toContain('toAcpVoiceHostTools');
    expect(voiceSource).toContain('preview.runAnnotationAcpChatPrompt');
    expect(voiceSource).toContain('preview.abortAnnotationDirectRun');
    expect(voiceSource).toContain('mcpServers: buildCommentaryVoiceMcpServersForDirectRun()');
    expect(voiceSource).toContain('commentaryVoiceToolRegistrationsRef');
    expect(source).toContain("registration.confirmation !== 'none'");
    expect(voiceSource).toContain('createMakeVoiceToolRegistry');
    expect(voiceSource).toContain('createMakeVoiceCommentOperations');
    expect(voiceSource).toContain('pageScope: buildInternalPrototypeCommentPageScope(targetPath, selectedPrototypePageId) || undefined');
    expect(voiceSource).toContain('getVoiceTargets: preview.getCommentaryVoiceTargets');
    expect(voiceSource).toContain('findVoiceElements: preview.findCommentaryVoiceElements');
    expect(voiceSource).toContain('getVoiceElementStructure: preview.getCommentaryVoiceElementStructure');
    expect(voiceSource).toContain('activateVoiceElement: preview.activateCommentaryVoiceElement');
    expect(voiceSource).toContain('createVoiceComment: preview.createCommentaryVoiceComment');
    expect(voiceSource).toContain('tasks: commentaryVoiceExecutionDependencies');
    expect(voiceSource).toContain('comments: commentaryVoiceCommentOperations');
    expect(source).not.toContain('onSubmitCommentExecution: handleSubmitCommentExecution');
    expect(voiceSource).toContain('resolve: async ({ commentId, signal }');
    expect(voiceSource).toContain('preview.resolveCommentaryExecutionContext(commentId)');
    expect(voiceSource).toContain('if (!await preview.refreshCommentaryVoicePersistedComments())');
    expect(voiceSource).toContain("ensureDefaultAiConfigured(preferences.annotationPromptClient, '批注 AI')");
    expect(voiceSource.indexOf("ensureDefaultAiConfigured(preferences.annotationPromptClient, '批注 AI')"))
      .toBeLessThan(voiceSource.indexOf('preview.runAnnotationAcpChatPrompt'));
    expect(voiceSource).toContain('requestCurrentScreenshot(input.scope)');
    expect(voiceSource).not.toContain('screenshotUrl: capture.dataUrl');
    expect(voiceSource).toContain('returnExecutionHandle: true');
    expect(voiceSource).toContain('const promptText = String(executionContext?.promptText');
    expect(voiceSource).not.toContain('prompt: stringValue(comment.comment');
    expect(voiceSource).toContain('findByOperationId');
    expect(voiceSource).toContain('preview.getAnnotationDirectRunOperation');
    expect(voiceSource).toContain('<MakeCommentaryVoiceEntry');
    expect(voiceSource).toContain('checkMakeVoiceConfiguration');
    expect(voiceSource).toContain('checkMakeVoiceConfigurationAfterRuntimeReady');
    expect(voiceSource).toContain('assistantController.connectAssistantRuntimeSilently');
    expect(voiceSource).toContain('checkVoiceConfiguration={commentaryVoiceConfigurationCheck}');
    expect(voiceSource).toContain("openSettingsDialog('ai', { voiceSection: 'voice-doubao' })");
    expect(voiceSource).not.toContain('handleOpenAcpWebAgent');
    expect(voiceSource).toContain("contentMode === 'preview'");
    expect(voiceSource).toContain("preview.editorStatus.mode === 'quickEdit'");
    expect(voiceSource).not.toMatch(/streamAcpChat|\/api\/chat|createAcpSession|task-service/u);
		expect(voiceSource).not.toMatch(/createMakeVoiceConversationBridge|createMakeVoiceSpeechAdapter/u);
  });

  it('keeps live comments out of the automatic turn context', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const voiceSource = source.slice(
      source.indexOf('const commentaryVoiceCommentAdapter = useMemo'),
      source.indexOf('const prototypeSpecNavigation = usePrototypeSpecNavigationGuard'),
    );

    expect(voiceSource).toContain('instructions: MAKE_COMMENTARY_VOICE_INSTRUCTIONS');
    expect(voiceSource).toContain('activeTargets');
    expect(voiceSource).not.toContain('recentComments');
    expect(voiceSource).not.toContain('commentTotal');
    expect(voiceSource).not.toContain('commentaryVoiceCommentOperations.list({');
    expect(voiceSource).toContain('buildMakeVoiceTurnContext');
    expect(source).toContain('executeMakeVoiceTool');
    expect(voiceSource).toContain('buildSafeVoicePrototypeResourcePath(selectedItem)');
    expect(voiceSource).not.toContain('resourcePath: selectedItem ? getSelectedResourceTargetPath(selectedItem)');
    expect(voiceSource).not.toContain('创建成功后询问用户是否立即执行');
    expect(voiceSource).not.toContain('Use the existing Axhub Make Commentary workflow.');
  });

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

  it('passes image generation settings and caller-provided MCP servers into annotation direct API runs', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const directRunSource = source.slice(
      source.indexOf('const handleRunAnnotationAssistantPromptViaApi = useCallback'),
      source.indexOf('const buildPromptActionAssistantContext = useCallback'),
    );

    expect(directRunSource).toContain('builtinToolSettings: preferences.assistantImageGenerationConfig');
    expect(directRunSource).toContain('? { imageGeneration: preferences.assistantImageGenerationConfig }');
    expect(directRunSource).toContain('mcpServers?: unknown[];');
    expect(directRunSource).toContain('mcpServers: request.mcpServers,');
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

  it('treats an unconfigured annotation AI as a feedback-handled preflight result', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const directRunSource = source.slice(
      source.indexOf('const handleRunAnnotationAssistantPromptViaApi = useCallback'),
      source.indexOf('const buildPromptActionAssistantContext = useCallback'),
    );

    expect(source).toContain('createAnnotationDirectRunPreflightResult');
    expect(directRunSource).toContain(
      "if (!ensureDefaultAiConfigured(preferences.annotationPromptClient, '批注 AI')) return createAnnotationDirectRunPreflightResult();",
    );
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
    const previewPreferenceIndex = source.indexOf('agentRunConcurrency: preferences.agentRunConcurrency', previewIndex);
    const autoClearPreferenceIndex = source.indexOf('autoClearCompletedComments: preferences.autoClearCompletedComments', previewIndex);

    expect(preferencesIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(-1);
    expect(previewPreferenceIndex).toBeGreaterThan(previewIndex);
    expect(autoClearPreferenceIndex).toBeGreaterThan(previewIndex);
    expect(preferencesIndex).toBeLessThan(previewPreferenceIndex);
    expect(preferencesIndex).toBeLessThan(autoClearPreferenceIndex);
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
    expect(source).toContain('apiService.getMakeClientUpdateStatus(activeProjectId)');
    expect(source).toContain('setMakeClientUpdateAvailable(updateAvailable)');
    expect(source).toContain('setMakeClientUpdateReminderVisible(updateAvailable && !readMakeClientUpdateReminderDismissed(activeProjectId, status.targetVersion))');
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
    expect(submitHandlerSource).toContain("mcpServers: request.source === 'canvas-viewport'");
    expect(submitHandlerSource).toContain(': buildCanvasMcpServersForDirectRun(getAssistantContextCurrentFilePath(canvasAssistantContext)),');
    expect(submitHandlerSource).toContain('const selectedProvider = resolveAcpPromptClientProvider(request.provider) || purposeProvider;');
    expect(submitHandlerSource).toContain('provider: selectedProvider,');
    expect(submitHandlerSource).toContain('model: request.model ?? purposeModel,');
    expect(submitHandlerSource).toContain('mode: request.mode,');
    expect(submitHandlerSource).toContain('thought: request.thought,');
    expect(submitHandlerSource).toContain('onPrepared: request.onPrepared,');
    expect(submitHandlerSource).toContain('onAccepted: request.onAccepted,');
    expect(submitHandlerSource).toContain('onEvent: request.onEvent,');
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

  it('tracks prototype start drafts without a hidden generation submission callback', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const draftStateSource = source.slice(
      source.indexOf('const [prototypeStartDraftActive'),
      source.indexOf('const openSettingsDialog', source.indexOf('const [prototypeStartDraftActive')),
    );
    const createDraftSource = source.slice(
      source.indexOf('const handleCreatePrototypeStartDraft = useCallback'),
      source.indexOf('const handleOpenPrototypeCreateDialog', source.indexOf('const handleCreatePrototypeStartDraft = useCallback')),
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
    expect(source).not.toContain('handleCreatePrototypeForDraftStart');
    expect(source).not.toContain('buildCreatedPrototypeStartItem');
    expect(sidebarBuilderCall).toContain('prototypeStartDraftActive,');
    expect(sidebarBuilderCall).toContain('handleCreatePrototypeStartDraft,');
    expect(presentationBuilderCall).toContain('prototypeStartDraftActive,');
    expect(presentationBuilderCall).not.toContain('onCreatePrototypeForDraftStart');
  });

  it('opens all start-guide requests with the conversation AI configuration', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );

    expect(submitSource).toContain("const shouldOpenStartGuideConversation = request.source === 'placeholder-start'");
    expect(submitSource).toContain("|| request.source === 'resource-start'");
    expect(submitSource).toContain("|| request.source === 'theme-start';");
    expect(submitSource).toContain('const submitted = await handleSubmitConversationAssistantPrompt(');
    expect(submitSource).toContain('canvasAssistantContext,');
    expect(submitSource).toContain('forceNewThread: true,');
    expect(submitSource).toContain("waitUntil: 'started',");
    expect(submitSource).toContain('provider: selectedProvider,');
    expect(submitSource).toContain('model: request.model ?? conversationModel,');
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
    expect(submitSource).toContain("if (!ensureDefaultAiConfigured(preferences.annotationPromptClient, '批注 AI')) return false;");
    expect(submitSource).toContain('const annotationPromptClient = preferences.annotationPromptClient;');
    expect(submitSource).toContain('const annotationProvider = resolveAcpPromptClientProvider(annotationPromptClient);');
    expect(submitSource).toContain('if (!annotationProvider) return false;');
    expect(submitSource).toContain('const annotationModel = preferences.annotationModel || null;');
    expect(submitSource).toContain('provider: options?.provider ?? annotationProvider,');
    expect(submitSource).toContain('model: options?.model ?? annotationModel,');
    expect(submitSource).toContain('autoSend: options?.autoSend,');
    expect(submitSource).toContain('agentRunConcurrency: preferences.agentRunConcurrency,');
    expect(source).not.toContain('preferences.preferredPromptClient');
    expect(source).toContain('preferences.conversationPromptClient,');
    expect(source).toContain('preferences.canvasPromptClient,');
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
    expect(guardSource).toContain('messageApi.warning(`请先在 AI 设置中配置${purposeLabel}`);');
    expect(acpOpenSource).toContain("if (!ensureDefaultAiConfigured(preferences.conversationPromptClient, '对话 AI')) return;");
    expect(imageOpenSource).toContain("if (!ensureDefaultAiConfigured(preferences.conversationPromptClient, '对话 AI')) return;");
    expect(source).toContain('ensureDefaultAiConfigured,');
  });

  it('prepares the selected resource parent before opening image AI', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const controllerStart = source.indexOf('const assistantController = useAssistantPanelController({');
    const controllerEnd = source.indexOf('});', controllerStart);
    const controllerSource = source.slice(controllerStart, controllerEnd);
    const imageOpenStart = source.indexOf('const handleOpenImageAiPanel = useCallback');
    const imageOpenEnd = source.indexOf('const handleCloseAiPanel', imageOpenStart);
    const imageOpenSource = source.slice(imageOpenStart, imageOpenEnd);

    expect(source).toContain("import { resolveImageAiResourceTargetFolder } from '../domains/assistant/imageAiResourceTarget';");
    expect(source).toContain("const [imageAiSaveDirectory, setImageAiSaveDirectory] = useState('');");
    expect(source.indexOf("const [imageAiSaveDirectory, setImageAiSaveDirectory] = useState('');"))
      .toBeLessThan(controllerStart);
    expect(controllerSource).toContain('imageAiSaveDirectory,');
    expect(imageOpenSource).toContain('const handleOpenImageAiPanel = useCallback(async () => {');
    expect(imageOpenSource).toContain('const targetFolder = resolveImageAiResourceTargetFolder({');
    expect(imageOpenSource).toContain('sidebarTab,');
    expect(imageOpenSource).toContain('selectedFolder: resources.selectedResourceFolder,');
    expect(imageOpenSource).toContain('selectedResource: resources.selectedDoc,');
    expect(imageOpenSource).toContain('const preparedFolder = await resources.prepareImageAiResourceFolder(targetFolder);');
    expect(imageOpenSource).toContain('if (!preparedFolder) return;');
    expect(imageOpenSource).toContain('setImageAiSaveDirectory(preparedFolder.absolutePath);');
    expect(imageOpenSource.indexOf('setImageAiSaveDirectory(preparedFolder.absolutePath);'))
      .toBeLessThan(imageOpenSource.indexOf('assistantController.openImageAiPanel();'));
  });

  it('refreshes Resources after ACP image saves without changing the current folder', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const controllerSource = source.slice(
      source.indexOf('const assistantController = useAssistantPanelController({'),
      source.indexOf('const syncAssistantCanvasComments = assistantController.syncAssistantCanvasComments'),
    );

    expect(source).toContain('const handleImageAiSaved = useCallback(() => {');
    expect(source).toContain('void resources.refreshDocsResources().catch(');
    expect(controllerSource).toContain('onImageSaved: handleImageAiSaved,');
  });

  it('routes annotation prompt cards to annotation AI and other canvas requests to canvas AI', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );

    expect(submitSource).toContain("const isAnnotationPromptCard = request.source === 'annotation-prompt-card';");
    expect(submitSource).toContain("const purposeLabel = isAnnotationPromptCard ? '批注 AI' : '画布 AI';");
    expect(submitSource).toContain('if (!ensureDefaultAiConfigured(purposePromptClient, purposeLabel)) return { ok: false };');
    expect(submitSource).toContain('const purposePromptClient = isAnnotationPromptCard');
    expect(submitSource).toContain('? preferences.annotationPromptClient');
    expect(submitSource).toContain(': preferences.canvasPromptClient;');
    expect(submitSource).toContain('const purposeModel = isAnnotationPromptCard');
    expect(submitSource).toContain('? preferences.annotationModel');
    expect(submitSource).toContain(': preferences.canvasModel;');
    expect(submitSource).toContain('model: request.model ?? purposeModel,');
  });

  it('returns visible direct API output artifacts from canvas generation submissions', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const submitSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback'),
      source.indexOf('const switchProjectWithReturnTarget', source.indexOf('const handleSubmitCanvasAssistantPrompt = useCallback')),
    );

    expect(source).toContain("import { mapCanvasDirectRunArtifacts } from '../domains/ai-generation/canvasDirectRun';");
    expect(submitSource).toContain('const result = await submitAnnotationPromptViaApi({');
    expect(submitSource).toContain('threadId: request.threadId,');
    expect(submitSource).toContain('conversationId: request.conversationId,');
    expect(submitSource).toContain('referenceImages: request.referenceImages,');
    expect(submitSource).toContain("permissionMode: request.source === 'canvas-viewport' ? 'bypassPermissions' : undefined,");
    expect(submitSource).toContain('targetPath: request.canvasFilePath || undefined,');
    expect(submitSource).toContain("mcpServers: request.source === 'canvas-viewport'");
    expect(submitSource).toContain('? undefined');
    expect(submitSource).toContain(': buildCanvasMcpServersForDirectRun(getAssistantContextCurrentFilePath(canvasAssistantContext)),');
    expect(submitSource).toContain("const artifacts = request.source === 'canvas-viewport'");
    expect(submitSource).toContain(': mapCanvasDirectRunArtifacts((result.artifacts || []) as Record<string, unknown>[], {');
    expect(submitSource).toContain('canvasFilePath: request.canvasFilePath,');
    expect(submitSource).toContain('runId: result.runId,');
    expect(submitSource).toContain('threadId: result.threadId,');
    expect(submitSource).toContain("request.source === 'canvas-viewport' && result.output.trim()");
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

  it('does not thread a removed initial tab into the online theme drawer', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const dialogsSource = readFileSync(resolve(__dirname, '../components/app/IndexDialogs.tsx'), 'utf8');
    const containerSource = readFileSync(resolve(__dirname, '../components/dialogs/CreateThemeDialogContainer.tsx'), 'utf8');

    expect(source).not.toContain('initialThemeDialogTab');
    expect(dialogsSource).not.toContain('initialTab?: \'import\' | \'onlineSelect\';');
    expect(containerSource).not.toContain('ThemeDialogTab');
    expect(containerSource).not.toContain('initialTab={state.initialTab}');
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

  it('does not auto-restore the embedded assistant on compact viewports', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const autoOpenEffectEnd = source.indexOf('restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode)', autoOpenEffectStart);
    const autoOpenEffectSource = source.slice(source.lastIndexOf('useEffect(() => {', autoOpenEffectStart), autoOpenEffectEnd);

    expect(autoOpenEffectSource).toContain('if (assistantCompactViewport) {');
    expect(autoOpenEffectSource).toContain('return;');
  });

  it('routes manual assistant opens to a new window on compact viewports', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const openGeneralSource = source.slice(
      source.indexOf('const handleOpenAcpWebAgent'),
      source.indexOf('const handleOpenImageAiPanel', source.indexOf('const handleOpenAcpWebAgent')),
    );
    const openImageSource = source.slice(
      source.indexOf('const handleOpenImageAiPanel'),
      source.indexOf('const handleCloseAiPanel', source.indexOf('const handleOpenImageAiPanel')),
    );
    const assistantPanelPropsSource = source.slice(
      source.indexOf('const assistantPanelProps = {'),
      source.indexOf('const dialogsProps = {'),
    );

    expect(openGeneralSource).toContain('assistantCompactViewport');
    expect(openGeneralSource).toContain('handleOpenAssistantInNewWindowNoContext(targetPath)');
    expect(openImageSource).toContain('assistantCompactViewport');
    expect(openImageSource).toContain('handleOpenImageAiPanelInNewWindow');
    expect(assistantPanelPropsSource).toContain('!assistantCompactViewport');
  });

  it('hides an already-open embedded assistant when the viewport becomes compact', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain('if (!assistantCompactViewport || !assistantController.assistantVisible) {');
    expect(source).toContain('assistantController.hideAssistantPanelTemporarily();');
  });

  it('treats an existing prototype placeholder as an ordinary page shell', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');

    expect(source).toContain("const prototypeStartDraftShellActive = contentMode === 'preview'");
    expect(source).toContain('&& prototypeStartDraftActive');
    expect(source).toContain('&& !selectedItem;');
    expect(source).toContain('const prototypeStartPageActive = prototypeStartDraftShellActive;');
    expect(source).not.toContain('prototypePlaceholderActive');
    expect(source).not.toContain('prototypePlaceholderAutoCloseKey');
    expect(source).not.toContain('closedPrototypePlaceholderAutoCloseKeyRef');
    expect(source).not.toContain('prototypeWaitingGenerationActive');
    expect(source).not.toContain('prototypeWaitingGenerationAutoOpenKey');
    expect(source).not.toContain('openedPrototypeWaitingGenerationKeyRef');
  });

  it('suppresses the global assistant only for a no-resource prototype draft', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const draftShellDefinition = source.slice(
      source.indexOf('const prototypeStartDraftShellActive ='),
      source.indexOf('const preferences = useIndexPagePreferences'),
    );
    const autoOpenEffectStart = source.indexOf('if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {');
    const autoOpenEffectSource = source.slice(
      source.lastIndexOf('useEffect(() => {', autoOpenEffectStart),
      source.indexOf('const handleOpenAcpWebAgent', autoOpenEffectStart),
    );
    const restoreHiddenEffectStart = source.indexOf('if (!assistantController.assistantPanelMounted) {');
    const restoreHiddenEffectSource = source.slice(
      source.lastIndexOf('useEffect(() => {', restoreHiddenEffectStart),
      source.indexOf('workspace.ensureSidebarTreeLoaded', restoreHiddenEffectStart),
    );
    const assistantPanelPropsSource = source.slice(
      source.indexOf('const assistantPanelProps = {'),
      source.indexOf('const dialogsProps = {'),
    );

    expect(draftShellDefinition).not.toContain('placeholder');
    expect(autoOpenEffectSource).toContain('if (prototypeStartDraftShellActive) {');
    expect(restoreHiddenEffectSource).toContain('if (prototypeStartDraftShellActive) {');
    expect(assistantPanelPropsSource).toContain('mounted: conversationUiEnabled && !assistantCompactViewport && !prototypeStartDraftShellActive && assistantController.assistantPanelMounted,');
    expect(assistantPanelPropsSource).toContain('visible: conversationUiEnabled && !assistantCompactViewport && !prototypeStartDraftShellActive && assistantController.assistantVisible,');
  });

  it('uses stable project ids to suppress auto-open only after real project switches', () => {
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
    expect(projectScopeEffectStart).toBeGreaterThan(-1);
    expect(source).toContain("const assistantAutoOpenProjectScope = workspace.activeProjectId || '';");
    expect(source).not.toContain('const assistantAutoOpenProjectScope = workspace.activeProjectId\n        || workspace.projectTitle;');
    expect(projectScopeEffectSource).toContain('const previousScope = previousAssistantAutoOpenProjectScopeRef.current;');
    expect(projectScopeEffectSource).toContain('if (shouldSuppressAssistantAutoOpenForProjectChange(');
    expect(projectScopeEffectSource).toContain('previousScope,\n            nextScope,\n            assistantController.assistantVisible,');
    expect(projectScopeEffectSource).toContain('assistantAutoOpenSuppressedProjectScopeRef.current = nextScope;');
    expect(autoOpenEffectSource).toContain('if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {');
    expect(restoreHiddenEffectSource).toContain('if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {');
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

  it('keeps the global assistant sidebar for standard Make while disabling it on the Codex surface', () => {
    const source = readFileSync(resolve(__dirname, './IndexPage.tsx'), 'utf8');
    const startStateSource = source.slice(
      source.indexOf('const reviewPanelVisible = viewMode'),
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

    expect(startStateSource).toContain('const prototypeStartPageActive = prototypeStartDraftShellActive;');
    expect(sidebarBuilderCall).toContain('prototypeStartPageActive,');
    expect(sidebarBuilderCall).toContain('surfaceCapabilities,');
    expect(sidebarBuilderCall).toContain('webAgentPanelOpen: assistantController.assistantVisible,');
    expect(sidebarBuilderCall).toContain('aiPanelMode: assistantController.aiPanelMode,');
    expect(sidebarBuilderCall).toContain('handleOpenAcpWebAgent,');
    expect(sidebarBuilderCall).toContain('handleOpenImageAiPanel,');
    expect(presentationBuilderCall).toContain('assistantVisible: assistantController.assistantVisible,');
    expect(presentationBuilderCall).toContain('surfaceCapabilities,');
    expect(presentationBuilderCall).toContain('webAgentPanelOpen: assistantController.assistantVisible,');
    expect(presentationBuilderCall).toContain('aiPanelMode: assistantController.aiPanelMode,');
    expect(presentationBuilderCall).toContain('handleToggleAssistant: handleToggleAssistantPanel,');
    expect(source).toContain("import { resolveMakeSurface, resolveMakeSurfaceCapabilities } from './makeSurface';");
    expect(source).toContain('const conversationUiEnabled = surfaceCapabilities.conversationUi;');
    expect(assistantPanelPropsSource).toContain('mounted: conversationUiEnabled && !assistantCompactViewport && !prototypeStartDraftShellActive && assistantController.assistantPanelMounted,');
    expect(assistantPanelPropsSource).toContain('visible: conversationUiEnabled && !assistantCompactViewport && !prototypeStartDraftShellActive && assistantController.assistantVisible,');
    expect(source).not.toContain('placeholderActive ? false : assistantController');
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
