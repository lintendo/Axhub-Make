import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useAssistantPanelController source', () => {
  it('uses base current file context to drive file-switch synchronization', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const assistantBaseContextV1 = useMemo<AssistantContextV1>');
    expect(source).toContain('currentCanvas?: CanvasItem | null;');
    expect(source).toContain('currentTheme?: ThemeResourceItem | null;');
    expect(source).toContain('currentDataTable?: DataTableResourceItem | null;');
    expect(source).toContain('currentCanvas,');
    expect(source).toContain('currentTheme,');
    expect(source).toContain('currentDataTable,');
    expect(source).toContain('mergeAssistantContextForActiveFile(assistantBaseContextV1, assistantExternalContext)');
    expect(source).toContain('getAssistantContextCurrentFilePath(assistantBaseContextV1)');
    expect(source).toContain('const nextContext = buildAssistantCurrentFileSyncContext(assistantBaseContextV1);');
    expect(source).toContain('syncAssistantContextToTargets(nextContext, \'replace\', {');

    const baseContextSource = source.slice(
      source.indexOf('const assistantBaseContextV1 = useMemo<AssistantContextV1>'),
      source.indexOf('const assistantContextV1 = useMemo<AssistantContextV1>'),
    );
    expect(baseContextSource).toContain('currentCanvas,');
    expect(baseContextSource).toContain('currentTheme,');
    expect(baseContextSource).toContain('currentDataTable,');
    expect(baseContextSource).toContain('currentCanvas,');
    expect(baseContextSource).toContain('currentDataTable,');
    expect(baseContextSource).toContain('currentTheme,');
  });

  it('syncs ACP context through iframe postMessage without starting the Agent integration bridge', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('useAssistantBridge(assistantIframeSrc, assistantBridgeOptions)');
    expect(source).toContain('const latestAssistantSyncContextRef = useRef<AssistantContextV1 | null>(null);');
    expect(source).toContain('latestAssistantSyncContextRef.current = context;');
    expect(source).not.toContain('createGenieIntegrationBridge');
    expect(source).not.toContain('appendRequiredGenieOpenParams');
    expect(source).not.toContain("updateContext(latestContext, 'replace')");
  });

  it('does not keep Agent WebSocket integration state for ACP UI', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).not.toContain('assistantBridgeRef');
    expect(source).not.toContain('assistantBridgeApiBaseUrlRef');
    expect(source).not.toContain('assistantBridgeIntegrationChannelRef');
    expect(source).not.toContain('assistantBridgeContextSyncSignatureRef');
    expect(source).not.toContain('integrationChannel:');
    expect(source).not.toContain('targetClientId: GENIE_REQUIRED_INTEGRATION_CLIENT_ID');
  });

  it('opens ACP UI with the freshly resolved runtime cwd before React state catches up', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('activeProjectId: string | null;');
    expect(source).toContain('const projectId = activeProjectId?.trim() || undefined;');
    expect(source).toContain('projectId,');
    expect(source).toContain('const buildAssistantIframeUrlForRuntime = useCallback((');
    expect(source).toContain('const buildImagePlaygroundUrlForRuntime = useCallback((');
    expect(source).toContain("url.searchParams.set('cwd', projectPath);");
    expect(source).toContain("const url = new URL(`${webBaseUrl}/image-playground`);");
    expect(source).toContain("const resolvedTargetUrl = options.panelMode === 'image-ai'");
    expect(source).toContain('? buildImagePlaygroundUrlForRuntime(resolvedRuntime)');
    expect(source).toContain('const runtimeForUrl = runtimeOverride || assistantRuntime;');
    expect(source).toContain('const sourceUrl = targetUrl || buildAssistantIframeUrlForRuntime(runtimeForUrl, conversationStorePath);');
    expect(source).toContain('const handleOpenAcpWebAgent = useCallback((targetPath?: string, _provider?: AcpProvider) => {');
    expect(source).toContain("void ensureAssistantReadyThenOpen('button', undefined, targetPath, 'iframe', null, {");
    expect(source).toContain("panelMode: 'general-ai',");
    expect(source).toContain("const openImageAiPanel = useCallback(() => {");
    expect(source).toContain("void ensureAssistantReadyThenOpen('button', undefined, undefined, 'iframe', null, {");
    expect(source).toContain("panelMode: 'image-ai',");
    expect(source).toContain('suppressResourceThreadBinding: true,');
    expect(source).toContain('const requestedProjectId = projectId || \'\';');
    expect(source).toContain('const runtime = await apiService.getAssistantRuntime({');
    expect(source).toContain('projectId: requestedProjectId,');
    expect(source).toContain('refreshRuntime({ autoStart: false })');
    expect(source).not.toContain('buildAssistantIframeUrlForRuntime(assistantRuntime, provider)');
    expect(source).not.toContain("searchParams.set('targetPath'");
    expect(source).toContain("url.searchParams.set('provider', preferredProvider);");
    expect(source).toContain("url.searchParams.set('model', normalizedPreferredModel);");
    expect(source).not.toContain("url.searchParams.set('context'");
    expect(source).not.toContain("url.searchParams.set('prompt'");
    expect(source).toContain('openAssistantInNewWindowWithUrl(resolvedTargetUrl, targetPath, resolvedRuntime, contextOverride);');
    expect(source).toContain('openAssistantWithUrl(resolvedTargetUrl, targetPath, resolvedRuntime, {');
  });

  it('scopes ACP UI conversation storage and last active thread by prototype store path', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');

    expect(source).toContain('resolvePrototypeConversationStorePath');
    expect(source).toContain("url.searchParams.set('conversationStorePath', normalizedConversationStorePath);");
    expect(source).toContain("url.searchParams.set('restoreLastThread', '1');");
    expect(source).toContain('latestAssistantConversationStorePathRef');
    expect(source).toContain('getAssistantStoreThreadId({');
    expect(source).toContain('setAssistantStoreThreadId({');
    expect(source).toContain('const resolvedThreadId = storeThreadId || threadId || resourceFallbackThreadId;');
    expect(source).toContain('conversationStorePath: latestAssistantConversationStorePathRef.current || undefined,');
    expect(source).toContain('assistantIframeResourceSwitchSignatureRef');
    expect(bridgeSource).toContain('conversationStorePath?: string;');
    expect(bridgeSource).toContain('...(query.conversationStorePath ? { conversationStorePath: query.conversationStorePath } : {}),');
  });

  it('caps the embedded assistant sidebar at half of the viewport width', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const ASSISTANT_PANEL_MAX_VIEWPORT_RATIO = 0.5;');
    expect(source).toContain('function getAssistantPanelMaxWidth(): number');
    expect(source).toContain('window.innerWidth * ASSISTANT_PANEL_MAX_VIEWPORT_RATIO');
    expect(source).toContain('function clampAssistantPanelWidth(width: number): number');
    expect(source).toContain('Math.min(Math.max(width, MIN_ASSISTANT_PANEL_WIDTH), getAssistantPanelMaxWidth())');
    expect(source).toContain('const [assistantPanelMaxWidth, setAssistantPanelMaxWidth] = useState(getAssistantPanelMaxWidth);');
    expect(source).toContain('return clampAssistantPanelWidth(parsed);');
    expect(source).toContain('setAssistantPanelWidthValue((currentWidth) => clampAssistantPanelWidth(currentWidth));');
    expect(source).toContain('const setAssistantPanelWidth = useCallback((nextWidth: number) => {');
    expect(source).toContain('setAssistantPanelWidthValue(clampAssistantPanelWidth(nextWidth));');
    expect(source).toContain('assistantPanelMinWidth: Math.min(MIN_ASSISTANT_PANEL_WIDTH, assistantPanelMaxWidth),');
    expect(source).toContain('assistantPanelMaxWidth,');
  });

  it('opens image AI at half width with a transient resyncable save directory', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const imageOpenStart = source.indexOf('const openImageAiPanel = useCallback');
    const imageOpenEnd = source.indexOf('const handleOpenImageAiPanelInNewWindow', imageOpenStart);
    const imageOpenSource = source.slice(imageOpenStart, imageOpenEnd);
    const imageSyncStart = source.indexOf('const syncAssistantImageGenerationConfigToIframe = useCallback');
    const imageSyncEnd = source.indexOf('const postAssistantContextToWindowWithRetry', imageSyncStart);
    const imageSyncSource = source.slice(imageSyncStart, imageSyncEnd);

    expect(source).toContain('imageAiSaveDirectory?: string | null;');
    expect(source).toContain('imageAiSaveDirectory = null,');
    expect(source).toContain('const effectiveAssistantImageGenerationConfig = useMemo<AssistantImageGenerationConfig>(() => ({');
    expect(source).toContain('...(assistantImageGenerationConfig || {}),');
    expect(source).toContain('...(imageAiSaveDirectory ? { saveDirectory: imageAiSaveDirectory } : {}),');
    expect(imageSyncSource).toContain('getAcpImageGenerationConfigSignature(effectiveAssistantImageGenerationConfig)');
    expect(imageSyncSource).toContain('postAssistantImageGenerationConfigToIframeWithRetry(effectiveAssistantImageGenerationConfig)');
    expect(imageSyncSource).toContain('postAssistantImageGenerationConfigToIframeWithAck(effectiveAssistantImageGenerationConfig)');
    expect(imageOpenSource).toContain('setAssistantPanelWidthValue(getAssistantPanelMaxWidth());');
    expect(imageOpenSource.indexOf('setAssistantPanelWidthValue(getAssistantPanelMaxWidth());'))
      .toBeLessThan(imageOpenSource.indexOf('ensureAssistantReadyThenOpen'));
    expect(source).toContain('setAssistantPanelWidth,');
  });

  it('refreshes the host only for origin-checked image save events from the ACP iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const messageHandlerStart = source.indexOf('const handleAssistantIframeRunEvent = (event: MessageEvent) => {');
    const messageHandlerEnd = source.indexOf("window.addEventListener('message', handleAssistantIframeRunEvent);", messageHandlerStart);
    const messageHandlerSource = source.slice(messageHandlerStart, messageHandlerEnd);

    expect(source).toContain("import { readAssistantImageSavedEvent, type AssistantImageSavedEvent } from '../assistantImageSavedEvent';");
    expect(source).toContain('onImageSaved?: (event: AssistantImageSavedEvent) => void;');
    expect(messageHandlerSource).toContain('const iframeElement = assistantIframePool.getIframe(iframeKey);');
    expect(messageHandlerSource).toContain('const iframeSrc = iframeEntry?.src || iframeElement?.src;');
    expect(messageHandlerSource).toContain('if (!iframeSrc) {');
    expect(messageHandlerSource).not.toContain('if (!iframeEntry) {');
    expect(messageHandlerSource).toContain('const imageSavedEvent = readAssistantImageSavedEvent(event.data);');
    expect(messageHandlerSource).toContain('onImageSaved?.(imageSavedEvent);');
    expect(messageHandlerSource.indexOf('if (event.origin !== expectedOrigin)'))
      .toBeLessThan(messageHandlerSource.indexOf('const imageSavedEvent = readAssistantImageSavedEvent(event.data);'));
  });

  it('keys assistant runtime probing by active project id so cached cwd cannot cross projects', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantRuntime.ts'), 'utf8');

    expect(source).toContain('projectId?: string | null;');
    expect(source).toContain('function resolveAssistantRuntimeProjectKey(projectId?: string | null): string');
    expect(source).toContain("return projectId?.trim() || '__none__';");
    expect(source).toContain('const projectKey = resolveAssistantRuntimeProjectKey(projectId);');
    expect(source).toContain('stores: Record<string, AssistantRuntimeProjectStore>;');
    expect(source).toContain('requestAssistantRuntime(normalizedProjectId, {');
    expect(source).toContain('apiService.getAssistantRuntime({');
    expect(source).toContain('projectId,');
    expect(source).toContain('if (!normalizedProjectId) {');
  });

  it('deactivates the current pooled iframe before reopening the assistant for a changed project', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('buildAssistantIframePoolKey,');
    expect(source).toContain('readAssistantIframeRunEvent,');
    expect(source).toContain('useAssistantIframePool,');
    expect(source).toContain('const assistantIframePool = useAssistantIframePool();');
    expect(source).toContain('const previousAssistantProjectIdRef = useRef(projectId || \'\');');
    expect(source).toContain('const reopenMountedAssistantForProjectChange = assistantPanelMounted');
    expect(source).toContain('&& assistantVisible');
    expect(source).toContain('previousAssistantProjectIdRef.current = nextProjectId;');
    expect(source).toContain('assistantIframePool.deactivate();');
    expect(source).not.toContain('setAssistantIframeOverrideUrl(null);');
    expect(source).toContain("void ensureAssistantReadyThenOpen('event', undefined, getAssistantContextCurrentFilePath(assistantContextV1), 'iframe', null, {");
    expect(source).toContain("panelMode: 'general-ai',");
    expect(source).toContain('loadingText: false,');
    expect(source).toContain('openSettingsOnFailure: false,');
  });

  it('activates stable general-assistant keys and routes ACP run events to their source iframe entries', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const assistantIframeKey = buildAssistantIframePoolKey({');
    expect(source).toContain('assistantIframePool.activate({');
    expect(source).toContain('key: assistantIframeKey,');
    expect(source).toContain("panelMode: 'general-ai',");
    expect(source).toContain('const iframeKey = assistantIframePool.findKeyByWindow(event.source);');
    expect(source).toContain('const runEvent = readAssistantIframeRunEvent(event.data);');
    expect(source).toContain('assistantIframePool.markRunState(iframeKey, runEvent.runState, runEvent.threadId);');
    expect(source).toContain('assistantIframeEntries,');
    expect(source).toContain('assistantActiveIframeKey,');
    expect(source).toContain('handleAssistantIframeRef,');
  });

  it('keeps navigation state per pooled iframe and restores it when the key is reused', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const iframeKey = assistantIframePool.findKeyByWindow(event.source);');
    expect(source).toContain('const iframeEntry = assistantIframePool.entries.find((entry) => entry.key === iframeKey);');
    expect(source).toContain('assistantIframePool.markNavigation(');
    expect(source).toContain('if (iframeKey !== assistantIframePool.activeKey) {');
    expect(source).toContain('const targetNavigationUrl = targetPoolEntry?.navigationUrl || nextUrl;');
    expect(source).toContain('latestAssistantNavigationThreadIdRef.current = targetPoolEntry');
    expect(source).toContain('? targetPoolEntry.navigationThreadId');
  });

  it('waits for the current project runtime before activating a resource iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const resourceEffect = source.slice(
      source.indexOf('const targetProjectId = projectId || \'\';'),
      source.indexOf('const openAssistantWithUrl = useCallback(('),
    );

    expect(resourceEffect).toContain('if (previousAssistantProjectIdRef.current !== targetProjectId) {');
    expect(source).toContain("&& assistantRuntime.health.status === 'ready'");
    expect(source).toContain('&& (!projectId || assistantRuntime.projectId === projectId),');
    expect(resourceEffect).toContain('if (!assistantRuntimeReadyForCurrentProject) {');
    expect(resourceEffect.indexOf('if (!assistantRuntimeReadyForCurrentProject) {'))
      .toBeLessThan(resourceEffect.indexOf('assistantIframePool.activate(assistantIframeDescriptor);'));
  });

  it('refuses to activate a stale assistant runtime response for another project', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const ensureSource = source.slice(
      source.indexOf('const ensureAssistantReadyThenOpen = useCallback(async ('),
      source.indexOf('useEffect(() => {\n        const nextProjectId', source.indexOf('const ensureAssistantReadyThenOpen = useCallback(async (')),
    );

    expect(source).toContain('const currentAssistantProjectIdRef = useRef(projectId || \'\');');
    expect(source).toContain('currentAssistantProjectIdRef.current = projectId || \'\';');
    expect(source).toContain('const assistantOpenRequestIdRef = useRef(0);');
    expect(ensureSource).toContain("if (assistantChecking && trigger === 'button') {");
    expect(ensureSource).toContain('const requestId = assistantOpenRequestIdRef.current + 1;');
    expect(ensureSource).toContain('const requestedProjectId = projectId || \'\';');
    expect(ensureSource).toContain('if (requestId !== assistantOpenRequestIdRef.current');
    expect(ensureSource).toContain('|| currentAssistantProjectIdRef.current !== requestedProjectId');
    expect(ensureSource).toContain('|| (requestedProjectId && runtime.projectId !== requestedProjectId)');
    expect(ensureSource).toContain("console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} ignored stale runtime response`");
    expect(ensureSource.indexOf('if (requestId !== assistantOpenRequestIdRef.current'))
      .toBeLessThan(ensureSource.indexOf('setAssistantRuntime(runtime);'));
    expect(ensureSource).toContain('if (requestId === assistantOpenRequestIdRef.current) {\n                setAssistantChecking(false);');
  });

  it('keeps automatic assistant reopen failures from opening AI settings repeatedly', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const ensureSource = source.slice(
      source.indexOf('const ensureAssistantReadyThenOpen = useCallback(async ('),
      source.indexOf('const syncAssistantCanvasComments = useCallback(('),
    );
    const restoreSource = source.slice(
      source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {'),
      source.indexOf('useEffect(() => {\n        const handleOpenAssistantUrl', source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {')),
    );

    expect(source).toContain('openSettingsOnFailure?: boolean;');
    expect(ensureSource).toContain('const shouldOpenSettingsOnFailure = options.openSettingsOnFailure !== false;');
    expect(ensureSource).toContain('if (shouldOpenSettingsOnFailure) {');
    expect(ensureSource).toContain("openAISettingsForAssistantRuntime(resolvedRuntime, resolvedRuntime.health.message || '本地 ACP 服务未链接');");
    expect(ensureSource).toContain("openAISettingsForAssistantRuntime(runtime, error?.message || '检测 AI 助手状态失败');");
    expect(restoreSource).toContain("return ensureAssistantReadyThenOpen('event', undefined, targetPath, 'iframe', null, {");
    expect(restoreSource).toContain('panelMode: restoreMode,');
    expect(restoreSource).toContain('loadingText: false,');
    expect(restoreSource).toContain('openSettingsOnFailure: false,');
  });

  it('updates mounted assistant context without changing iframe src when the admin current file changes', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const fileSyncEffect = source.slice(
      source.indexOf('const nextCurrentFilePath = getAssistantContextCurrentFilePath(assistantBaseContextV1);'),
      source.indexOf('const resolveAssistantUrl = useCallback(('),
    );

    expect(source).toContain('const nextContext = buildAssistantCurrentFileSyncContext(assistantBaseContextV1);');
    expect(fileSyncEffect).toContain("syncAssistantContextToTargets(nextContext, 'replace', {");
    expect(fileSyncEffect).not.toContain('forceBridge: true,');
    expect(fileSyncEffect).not.toContain('syncAssistantIframeUrlContext(nextContext)');
    expect(fileSyncEffect).not.toContain('setAssistantIframeOverrideUrl');
    expect(fileSyncEffect).not.toContain('buildAssistantUrlWithContext');
  });

  it('resends the latest context with retry when an already opened ACP UI iframe finishes loading', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const assistantIframeLoadSyncSignatureRef = useRef(\'\');');
    expect(source).toContain('const syncAssistantContextToTargets = useCallback((');
    expect(source).toContain('latestAssistantSyncContextRef.current = context;');
    expect(source).not.toContain('assistantBridgeContextSyncSignatureRef');
    expect(source).not.toContain("assistantBridgeRef.current?.updateContext(context, mode)");
    expect(source).toContain('const contextSignature = JSON.stringify(assistantContextV1);');
    expect(source).toContain('assistantIframeLoadSyncSignatureRef.current = contextSignature;');
    expect(source).toContain("syncAssistantContextToTargets(assistantContextV1, 'replace', {");
    expect(source).toContain('assistantIframeLoadSyncSignatureRef.current = \'\';');
    expect(source).toContain('if (!assistantSupportsAcpContext || !assistantVisible || !assistantIframeLoaded) {');
  });

  it('submits assistant prompts through the public ACP chat postMessage protocol', () => {
    const adapterSource = readFileSync(resolve(__dirname, '../assistantAcpContext.ts'), 'utf8');
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(controllerSource).toContain("import { flushSync } from 'react-dom';");
    expect(controllerSource).toContain('function waitForAssistantPanelPaint(): Promise<void>');
    expect(controllerSource).toContain('flushSync(() => {');
    expect(controllerSource).toContain('await waitForAssistantPanelPaint();');
    expect(controllerSource).toContain('waitForAssistantIframeReady(30_000)');
    expect(adapterSource).toContain("'acp.context.replace'");
    expect(adapterSource).toContain("'acp.context.add'");
    expect(adapterSource).toContain("messageFilter: AcpPostMessageFilter = 'snapshot'");
    expect(bridgeSource).toContain('buildAcpContextPostMessage(context, mode)');
    expect(bridgeSource).toContain('submitPromptWithRetry');
    expect(bridgeSource).toContain("'acp.chat.submit'");
    expect(bridgeSource).toContain('interface SubmitPromptOptions {');
    expect(bridgeSource).toContain('newThread?: boolean;');
    expect(bridgeSource).toContain("waitUntil?: 'started' | 'finished';");
    expect(bridgeSource).toContain('provider?: string | null;');
    expect(bridgeSource).toContain('model?: string | null;');
    expect(bridgeSource).toContain('modeId?: string | null;');
    expect(bridgeSource).toContain('thoughtLevel?: string | null;');
    expect(bridgeSource).toContain('autoSend?: boolean;');
    expect(bridgeSource).toContain("payload: {");
    expect(bridgeSource).toContain("text: prompt,");
    expect(bridgeSource).toContain("waitUntil: submitOptions?.waitUntil || 'started',");
    expect(bridgeSource).toContain("...(submitOptions?.provider ? { provider: submitOptions.provider } : {}),");
    expect(bridgeSource).toContain("...(submitOptions?.model ? { model: submitOptions.model } : {}),");
    expect(bridgeSource).toContain("...(submitOptions?.modeId ? { modeId: submitOptions.modeId } : {}),");
    expect(bridgeSource).toContain("...(submitOptions?.thoughtLevel ? { thoughtLevel: submitOptions.thoughtLevel } : {}),");
    expect(bridgeSource).toContain("...(submitOptions?.autoSend === false ? { autoSend: false } : {}),");
    expect(bridgeSource).toContain("...(submitOptions?.newThread === true ? { newThread: true } : {}),");
    expect(bridgeSource).toContain('const ACP_CHAT_SUBMIT_TIMEOUT_MS = 30_000;');
    expect(bridgeSource).toContain("'acp.chat.result'");
    expect(bridgeSource).toContain("'acp.chat.error'");
    expect(controllerSource).toContain('submitPromptWithRetry');
    expect(controllerSource).toContain('openAssistantWithContextAndSubmitPrompt');
    expect(controllerSource).toContain('provider?: string | null;');
    expect(controllerSource).toContain('model?: string | null;');
    expect(controllerSource).toContain('mode?: string | null;');
    expect(controllerSource).toContain('thought?: string | null;');
    expect(controllerSource).toContain('autoSend?: boolean;');
    expect(controllerSource).toContain("messageApi.loading('正在连接 AI...', 0)");
    expect(controllerSource).toContain("syncAssistantContextToTargets(context, 'replace', {");
    expect(bridgeSource).not.toContain("'update_context'");
    expect(bridgeSource).not.toContain("'update_prompt'");
    expect(bridgeSource).not.toContain('syncPrompt');
    expect(controllerSource).not.toContain("url.searchParams.set('prompt'");
    expect(controllerSource).not.toContain('postAssistantPromptToIframe');
  });

  it('passes annotation provider and model preferences through ACP chat submit options', () => {
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const submitSource = controllerSource.slice(
      controllerSource.indexOf('const openAssistantWithContextAndSubmitPrompt = useCallback(async ('),
      controllerSource.indexOf('const probeAssistantRuntimeSilently = useCallback(async () => {'),
    );

    expect(controllerSource).toContain('type OpenAssistantSubmitOptions = {');
    expect(controllerSource).toContain('provider?: string | null;');
    expect(controllerSource).toContain('model?: string | null;');
    expect(controllerSource).toContain('mode?: string | null;');
    expect(controllerSource).toContain('thought?: string | null;');
    expect(controllerSource).toContain('autoSend?: boolean;');
    expect(submitSource).toContain('provider: options.provider,');
    expect(submitSource).toContain('model: options.model,');
    expect(submitSource).toContain('modeId: options.mode,');
    expect(submitSource).toContain('thoughtLevel: options.thought,');
    expect(submitSource).toContain('autoSend: options.autoSend,');
    expect(submitSource).toContain("waitUntil: options.collectArtifacts === true ? 'started' : options.waitUntil || 'started',");
  });

  it('can wait for visible canvas assistant runs and query their ACP artifacts', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(bridgeSource).toContain('export interface AcpThreadArtifactsQueryResult');
    expect(bridgeSource).toContain('queryArtifactsWithRetry');
    expect(bridgeSource).toContain("type: 'acp.artifacts.get'");
    expect(bridgeSource).toContain("source: query.source || 'auto'");
    expect(bridgeSource).toContain("format: query.format || 'ai-sdk/v6'");
    expect(controllerSource).toContain('type OpenAssistantSubmitResult = {');
    expect(controllerSource).toContain('artifacts?: unknown[];');
    expect(controllerSource).toContain('waitUntil?: \'started\' | \'finished\';');
    expect(controllerSource).toContain('ignoredArtifactPaths?: string[];');
    expect(controllerSource).toContain('function getAcpArtifactPath(artifact: unknown): string');
    expect(controllerSource).toContain('async function waitForAcpArtifacts(');
    expect(controllerSource).toContain('const timeoutMs = options.timeoutMs ?? 420_000;');
    expect(controllerSource).toContain('const ignoredPaths = new Set((options.ignoredArtifactPaths || [])');
    expect(controllerSource).toContain('const artifacts = filterArtifacts(latest.artifacts);');
    expect(controllerSource).toContain('if (artifacts.length || workspaceArtifacts.length || latest.imageGenerationRecords?.length) {');
    expect(controllerSource).toContain('const submitResult = await submitPromptWithRetry(text, {');
    expect(controllerSource).toContain('waitUntil: options.collectArtifacts === true ? \'started\' : options.waitUntil || \'started\',');
    expect(controllerSource).toContain("if (options.collectArtifacts === true && submitResult.threadId) {");
    expect(controllerSource).toContain('const artifactSinceMs = Date.now();');
    expect(controllerSource).toContain('await waitForAcpArtifacts(() => queryArtifactsWithRetry({');
    expect(controllerSource).toContain('threadId: submitResult.threadId,');
    expect(controllerSource).toContain('sinceMs: artifactSinceMs,');
    expect(controllerSource).toContain('ignoredArtifactPaths: options.ignoredArtifactPaths,');
  });

  it('does not show startup loading when submitting into an already open assistant panel', () => {
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const submitSource = controllerSource.slice(
      controllerSource.indexOf('const openAssistantWithContextAndSubmitPrompt = useCallback(async ('),
      controllerSource.indexOf('const probeAssistantRuntimeSilently = useCallback(async () => {'),
    );

    expect(submitSource).toContain('const panelAlreadyOpen = assistantSupportsAcpContext');
    expect(submitSource).toContain('&& Boolean(assistantIframeRef.current?.contentWindow);');
    expect(submitSource).toContain('&& (assistantVisible || assistantPanelMounted)');
    expect(submitSource).toContain('if (panelAlreadyOpen && !assistantVisible) {');
    expect(submitSource).toContain('setAssistantVisible(true);');
    expect(submitSource).toContain("let hideLoading = panelAlreadyOpen\n            ? () => undefined\n            : messageApi.loading('正在连接 AI...', 0);");
    expect(submitSource).toContain('const closeLoading = () => {');
    expect(submitSource).toContain('const opened = panelAlreadyOpen');
    expect(submitSource).toContain('const ready = panelAlreadyOpen');
    expect(submitSource).toContain('closeLoading();\n            const artifactSinceMs = Date.now();\n            const submitResult = await submitPromptWithRetry(text, {');
    expect(submitSource).toContain('newThread: shouldForceNewThread,');
    expect(submitSource).toContain("waitUntil: options.collectArtifacts === true ? 'started' : options.waitUntil || 'started',");
    expect(submitSource).not.toContain('const panelAlreadyOpen = !shouldForceNewThread');
    expect(submitSource).not.toContain('const alreadyReady = assistantSupportsAcpContext');
  });

  it('can force prompt submission into a fresh assistant thread', () => {
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const submitSource = controllerSource.slice(
      controllerSource.indexOf('const openAssistantWithContextAndSubmitPrompt = useCallback(async ('),
      controllerSource.indexOf('const probeAssistantRuntimeSilently = useCallback(async () => {'),
    );

    expect(controllerSource).toContain('type OpenAssistantSubmitOptions = {');
    expect(controllerSource).toContain('forceNewThread?: boolean;');
    expect(controllerSource).toContain('const assistantResourceThreadBindingSuppressedRef = useRef(false);');
    expect(controllerSource).toContain('if (assistantResourceThreadBindingSuppressedRef.current) {');
    expect(controllerSource).not.toContain('function resolveFreshAssistantUrl(sourceUrl: string): string');
    expect(controllerSource).not.toContain('axhubFreshThread');
    expect(submitSource).toContain('options: OpenAssistantSubmitOptions = {},');
    expect(submitSource).toContain('const shouldForceNewThread = options.forceNewThread === true;');
    expect(submitSource).toContain('assistantResourceThreadBindingSuppressedRef.current = shouldForceNewThread;');
    expect(submitSource).toContain('const panelAlreadyOpen = assistantSupportsAcpContext');
    expect(submitSource).not.toContain('const panelAlreadyOpen = !shouldForceNewThread');
    expect(submitSource).toContain('if (!shouldForceNewThread) {\n                    syncAssistantContextToTargets(context, \'replace\', {');
    expect(submitSource).toContain('const assistantOpenUrl = assistantIframeUrl;');
    expect(submitSource).not.toContain('resolveFreshAssistantUrl(assistantIframeUrl)');
    expect(submitSource).toContain('const targetPath = shouldForceNewThread\n                ? undefined\n                : context ? getAssistantContextCurrentFilePath(context) : undefined;');
    expect(submitSource).toContain('if (shouldForceNewThread) {\n                latestAssistantResourcePathRef.current = \'\';\n            }');
    expect(submitSource).toContain('else if (targetPath) {\n                latestAssistantResourcePathRef.current = targetPath;\n            }');
    expect(submitSource).toContain("await ensureAssistantReadyThenOpen('button', assistantOpenUrl, targetPath, 'iframe', context, {");
    expect(submitSource).toContain('const submitResult = await submitPromptWithRetry(text, {');
    expect(submitSource).toContain('newThread: shouldForceNewThread,');
    expect(submitSource).toContain("waitUntil: options.collectArtifacts === true ? 'started' : options.waitUntil || 'started',");
    expect(submitSource).toContain('if (shouldForceNewThread) {\n                assistantResourceThreadBindingSuppressedRef.current = false;');
    expect(submitSource).toContain('latestAssistantResourcePathRef.current = context ? getAssistantContextCurrentFilePath(context) : getAssistantContextCurrentFilePath(assistantContextV1);');
  });

  it('keeps the mounted ACP iframe when toggling the assistant panel closed', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const toggleSource = source.slice(
      source.indexOf('const handleToggleAssistant = useCallback(() => {'),
      source.indexOf('const handleOpenAcpWebAgent = useCallback', source.indexOf('const handleToggleAssistant = useCallback(() => {')),
    );

    expect(toggleSource).toContain('if (assistantVisible) {');
    expect(toggleSource).toContain('setAssistantVisible(false);');
    expect(toggleSource).not.toContain('setAssistantPanelMounted(false);');
    expect(toggleSource).not.toContain('setAssistantIframeLoaded(false);');
    expect(toggleSource).not.toContain('setAssistantIframeOverrideUrl(null);');
    expect(toggleSource).not.toContain("setAssistantPanelMode('general-ai');");
  });

  it('switches a hidden pooled assistant to the current conversation store before showing it', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const toggleSource = source.slice(
      source.indexOf('const handleToggleAssistant = useCallback(() => {'),
      source.indexOf('const handleOpenAcpWebAgent = useCallback', source.indexOf('const handleToggleAssistant = useCallback(() => {')),
    );
    const restoreSource = source.slice(
      source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {'),
      source.indexOf('useEffect(() => {\n        const handleOpenAssistantUrl', source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {')),
    );

    expect(toggleSource).toContain('if (!assistantRuntimeReadyForCurrentProject) {');
    expect(toggleSource).toContain("void ensureAssistantReadyThenOpen('button', undefined, getAssistantContextCurrentFilePath(assistantContextV1), 'iframe', null, {");
    expect(toggleSource).toContain('const currentTargetPath = getAssistantContextCurrentFilePath(assistantContextV1);');
    expect(toggleSource).toContain('const currentTargetDescriptor = buildGeneralAssistantIframeDescriptor(');
    expect(toggleSource).toContain('if (assistantIframePool.activeKey !== currentTargetDescriptor.key) {');
    expect(toggleSource).toContain("openAssistantWithUrl(undefined, currentTargetPath, assistantRuntime, { panelMode: 'general-ai' });");
    expect(restoreSource).toContain('const nextGeneralIframeDescriptor = restoreMode === \'general-ai\'');
    expect(restoreSource).toContain('assistantIframePool.activeKey !== nextGeneralIframeDescriptor.key');
    expect(restoreSource).toContain("const canReuseMountedAssistant = restoreMode !== 'general-ai'");
    expect(restoreSource).toContain('|| assistantRuntimeReadyForCurrentProject;');
    expect(restoreSource).toContain('if (assistantPanelMounted && canReuseMountedAssistant) {');
  });

  it('tracks mutually exclusive general and image AI panel modes in the shared iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain("export type AssistantAiPanelMode = 'general-ai' | 'image-ai' | 'external' | null;");
    expect(source).toContain('initialAssistantPanelMode?: AssistantAiPanelMode;');
    expect(source).toContain('initialAssistantPanelMode = null,');
    expect(source).toContain('function resolveStoredAssistantPanelMode(mode: AssistantAiPanelMode): AssistantAiPanelMode');
    expect(source).toContain('const [assistantPanelMode, setAssistantPanelMode] = useState<AssistantAiPanelMode>(() => resolveStoredAssistantPanelMode(initialAssistantPanelMode));');
    expect(source).toContain("const assistantSupportsAcpContext = assistantPanelMode === 'general-ai';");
    expect(source).toContain("const assistantAcceptsImageRuntimeConfig = assistantPanelMode === 'general-ai' || assistantPanelMode === 'image-ai';");
    expect(source).toContain("panelMode?: AssistantAiPanelMode;");
    expect(source).toContain("const nextPanelMode = options.panelMode || assistantPanelMode || 'general-ai';");
    expect(source).toContain('setAssistantPanelMode(nextPanelMode);');
    expect(source).toContain("setAssistantPanelMode('external');");
    expect(source).toContain("const visibleAiPanelMode = assistantPanelMode === 'general-ai' || assistantPanelMode === 'image-ai'");
    expect(source).toContain('aiPanelMode: assistantVisible ? visibleAiPanelMode : null,');
    expect(source).toContain('openImageAiPanel,');
  });

  it('syncs image generation runtime config to the standalone image AI iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const contextAckSource = source.slice(
      source.indexOf('const syncAssistantContextToIframeWithAck = useCallback'),
      source.indexOf('const syncAssistantImageGenerationConfigToIframe = useCallback'),
    );
    const imageSyncSource = source.slice(
      source.indexOf('const syncAssistantImageGenerationConfigToIframe = useCallback'),
      source.indexOf('const postAssistantContextToWindowWithRetry = useCallback'),
    );
    const iframeLoadSource = source.slice(
      source.indexOf('const handleAssistantIframeLoad = useCallback((key: string) => {'),
      source.indexOf('const visibleAiPanelMode = assistantPanelMode', source.indexOf('const handleAssistantIframeLoad = useCallback((key: string) => {')),
    );

    expect(contextAckSource).toContain('!assistantSupportsAcpContext');
    expect(contextAckSource).not.toContain('!assistantAcceptsImageRuntimeConfig');
    expect(imageSyncSource).toContain('!assistantAcceptsImageRuntimeConfig');
    expect(imageSyncSource).not.toContain('!assistantSupportsAcpContext');
    expect(imageSyncSource).toContain('postAssistantImageGenerationConfigToIframeWithRetry(effectiveAssistantImageGenerationConfig);');
    expect(iframeLoadSource).toContain("if (assistantPanelMode === 'image-ai') {");
    expect(iframeLoadSource).toContain('syncAssistantImageGenerationConfigToIframe({');
    expect(iframeLoadSource).toContain('requireLoaded: false,');
    expect(iframeLoadSource).toContain('requireVisible: false,');
    expect(iframeLoadSource).toContain('force: true,');
  });

  it('syncs Make theme changes to the mounted ACP UI iframe through acp.theme.set', () => {
    const adapterSource = readFileSync(resolve(__dirname, '../assistantAcpContext.ts'), 'utf8');
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const indexPageSource = readFileSync(resolve(__dirname, '../../../app/IndexPage.tsx'), 'utf8');
    const themeSyncSource = controllerSource.slice(
      controllerSource.indexOf('const syncAssistantThemeToIframe = useCallback'),
      controllerSource.indexOf('const syncAssistantPreviewMcpConfigToIframe = useCallback'),
    );
    const iframeLoadSource = controllerSource.slice(
      controllerSource.indexOf('const handleAssistantIframeLoad = useCallback((key: string) => {'),
      controllerSource.indexOf('const visibleAiPanelMode = assistantPanelMode', controllerSource.indexOf('const handleAssistantIframeLoad = useCallback((key: string) => {')),
    );

    expect(indexPageSource).toContain('isDarkMode,');
    expect(controllerSource).toContain('isDarkMode: boolean;');
    expect(controllerSource).toContain('const assistantThemeSyncSignatureRef = useRef(\'\');');
    expect(controllerSource).toContain('syncThemeWithRetry: postAssistantThemeToIframeWithRetry,');
    expect(adapterSource).toContain('export interface AcpThemePostMessage');
    expect(adapterSource).toContain("type: 'acp.theme.set';");
    expect(adapterSource).toContain('export function buildAcpThemePostMessage');
    expect(adapterSource).toContain("theme: isDarkMode ? 'dark' : 'light'");
    expect(bridgeSource).toContain('buildAcpThemePostMessage');
    expect(bridgeSource).toContain('const syncTheme = useCallback((isDarkMode: boolean) => {');
    expect(bridgeSource).toContain('const message = buildAcpThemePostMessage(isDarkMode);');
    expect(bridgeSource).toContain('syncThemeWithRetry');
    expect(themeSyncSource).toContain('const themeSignature = isDarkMode ? \'dark\' : \'light\';');
    expect(themeSyncSource).toContain('if (!options.force && assistantThemeSyncSignatureRef.current === themeSignature) {');
    expect(themeSyncSource).toContain('assistantThemeSyncSignatureRef.current = themeSignature;');
    expect(themeSyncSource).toContain('postAssistantThemeToIframeWithRetry(isDarkMode);');
    expect(controllerSource).toContain('syncAssistantThemeToIframe();');
    expect(controllerSource).toContain("assistantThemeSyncSignatureRef.current = '';");
    expect(iframeLoadSource).toContain('syncAssistantThemeToIframe({');
    expect(iframeLoadSource).toContain('requireLoaded: false,');
    expect(iframeLoadSource).toContain('requireVisible: false,');
    expect(iframeLoadSource).toContain('force: true,');
    expect(controllerSource).not.toContain("url.searchParams.set('theme'");
  });

  it('restores a hidden mounted assistant with the remembered panel mode and matching iframe url', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const restoreSource = source.slice(
      source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {'),
      source.indexOf('useEffect(() => {\n        const handleOpenAssistantUrl', source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {')),
    );

    expect(restoreSource).toContain("const restoreMode = panelMode === 'image-ai' || panelMode === 'general-ai'");
    expect(restoreSource).toContain('if (assistantPanelMounted && canReuseMountedAssistant) {');
    expect(restoreSource).toContain("const nextTargetUrl = restoreMode === 'image-ai'");
    expect(restoreSource).toContain('? buildImagePlaygroundUrlForRuntime(assistantRuntime)');
    expect(restoreSource).toContain(': buildAssistantIframeUrlForRuntime(assistantRuntime);');
    expect(restoreSource).toContain('const shouldReloadForRestoreMode = restoreMode !== assistantPanelMode');
    expect(restoreSource).toContain("|| (restoreMode === 'image-ai' && assistantIframeOverrideUrl !== nextTargetUrl)");
    expect(restoreSource).toContain('|| (nextGeneralIframeDescriptor !== null');
    expect(restoreSource).toContain('&& assistantIframePool.activeKey !== nextGeneralIframeDescriptor.key);');
    expect(restoreSource).toContain('if (shouldReloadForRestoreMode) {');
    expect(restoreSource).toContain('openAssistantWithUrl(nextTargetUrl, targetPath, assistantRuntime, {');
    expect(restoreSource).toContain('panelMode: restoreMode,');
    expect(restoreSource).toContain("suppressResourceThreadBinding: restoreMode === 'image-ai',");
    expect(restoreSource.indexOf('if (shouldReloadForRestoreMode) {'))
      .toBeLessThan(restoreSource.indexOf('if (assistantVisible) {'));
    expect(restoreSource).toContain('setAssistantVisible(true);');
    expect(restoreSource).toContain('return true;');
    expect(restoreSource).toContain('panelMode: restoreMode,');
  });

  it('force-resyncs ACP runtime config when auto-restoring an already mounted hidden iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const restoreSource = source.slice(
      source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {'),
      source.indexOf('useEffect(() => {\n        const handleOpenAssistantUrl', source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {')),
    );

    expect(source).toContain('const forceSyncAssistantRuntimeConfigToIframe = useCallback(() => {');
    expect(restoreSource).toContain('forceSyncAssistantRuntimeConfigToIframe();');
    expect(restoreSource.indexOf('setAssistantVisible(true);'))
      .toBeLessThan(restoreSource.indexOf('forceSyncAssistantRuntimeConfigToIframe();'));
    expect(source).toContain("assistantImageGenerationConfigSyncSignatureRef.current = '';");
    expect(source).toContain("assistantPreviewMcpConfigSyncSignatureRef.current = '';");
    expect(source).toContain('await syncAssistantImageGenerationConfigToIframeWithAck({');
    expect(source).toContain('await syncAssistantPreviewMcpConfigToIframeWithAck({');
    expect(source).toContain('syncAssistantImageGenerationConfigToIframe({');
    expect(source).toContain('syncAssistantPreviewMcpConfigToIframe({');
    expect(source).toContain('requireVisible: false,');
    expect(source).toContain('force: true,');
  });

  it('adds context items and image attachments through ACP postMessage protocols', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(bridgeSource).toContain('type AcpAttachmentAddResult');
    expect(bridgeSource).toContain('type AcpComposerAppendResult');
    expect(bridgeSource).toContain("'acp.attachment.add'");
    expect(bridgeSource).toContain("'acp.attachment.result'");
    expect(bridgeSource).toContain("'acp.attachment.error'");
    expect(bridgeSource).toContain("'acp.composer.append'");
    expect(bridgeSource).toContain("'acp.composer.result'");
    expect(bridgeSource).toContain("'acp.composer.error'");
    expect(bridgeSource).toContain('addImageAttachmentWithRetry');
    expect(bridgeSource).toContain('appendComposerTextWithRetry');
    expect(bridgeSource).toContain('addContextItems');
    expect(bridgeSource).toContain('buildAcpContextItemsPostMessage(items,');
    expect(controllerSource).toContain('const addContextItems = useCallback((items: AcpContextItem[]) => {');
    expect(controllerSource).toContain('const addImageAttachment = useCallback(async (attachment: AssistantImageAttachmentPayload) => {');
    expect(controllerSource).toContain('const appendComposerText = useCallback(async (text: string) => {');
    expect(controllerSource).toContain('addImageAttachmentWithRetry(attachment)');
    expect(controllerSource).toContain('appendComposerTextWithRetry(text)');
    expect(controllerSource).toContain('addContextItems,');
    expect(controllerSource).toContain('addImageAttachment,');
    expect(controllerSource).toContain('appendComposerText,');
  });

  it('syncs Make image generation config to an already loaded ACP UI iframe', () => {
    const adapterSource = readFileSync(resolve(__dirname, '../assistantAcpContext.ts'), 'utf8');
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(controllerSource).toContain('assistantImageGenerationConfig?: AssistantImageGenerationConfig | null;');
    expect(controllerSource).toContain('const assistantImageGenerationConfigSyncSignatureRef = useRef(\'\');');
    expect(controllerSource).toContain('syncImageGenerationConfigWithRetry: postAssistantImageGenerationConfigToIframeWithRetry,');
    expect(controllerSource).toContain('const syncAssistantImageGenerationConfigToIframe = useCallback((options: { requireLoaded?: boolean; requireVisible?: boolean; force?: boolean } = {}) => {');
    expect(controllerSource).toContain('const requireLoaded = options.requireLoaded !== false;');
    expect(controllerSource).toContain('const requireVisible = options.requireVisible !== false;');
    expect(controllerSource).toContain('|| (requireVisible && !assistantVisible)');
    expect(controllerSource).toContain('|| (requireLoaded && !assistantIframeLoaded)');
    expect(controllerSource).toContain('const imageConfigSignature = getAcpImageGenerationConfigSignature(effectiveAssistantImageGenerationConfig);');
    expect(controllerSource).toContain('if (!options.force && assistantImageGenerationConfigSyncSignatureRef.current === imageConfigSignature) {');
    expect(controllerSource).toContain('assistantImageGenerationConfigSyncSignatureRef.current = imageConfigSignature;');
    expect(controllerSource).toContain('postAssistantImageGenerationConfigToIframeWithRetry(effectiveAssistantImageGenerationConfig);');
    expect(controllerSource).toContain('syncAssistantImageGenerationConfigToIframe();');
    expect(controllerSource).toContain('syncAssistantImageGenerationConfigToIframe({');
    expect(controllerSource).toContain('syncAssistantImageGenerationConfigToIframeWithAck({');
    expect(controllerSource).toContain('assistantImageGenerationConfigSyncSignatureRef.current = \'\';');
    expect(controllerSource).toContain('const assistantIframeBridgeRecoveringRef = useRef(false);');
    expect(controllerSource).toContain('if (assistantIframeBridgeRecoveringRef.current) {');
    expect(controllerSource).toContain('handleAssistantIframeLoad');
    expect(bridgeSource).toContain('buildAcpImageGenerationPostMessage(config)');
    expect(bridgeSource).toContain('syncImageGenerationConfigWithRetry');
    expect(adapterSource).toContain("'acp.runtime.configure'");
    expect(adapterSource).toContain("'acp.runtime.clear'");
    expect(adapterSource).toContain("'image-generation'");
    expect(adapterSource).toContain('builtinToolSettings');
    expect(adapterSource).not.toContain("'acp.tool.imageGeneration.configure'");
    expect(adapterSource).not.toContain("'acp.tool.imageGeneration.clear'");
    expect(bridgeSource).toContain('syncImageGenerationConfig');
    expect(controllerSource).not.toContain("url.searchParams.set('imageGeneration'");
  });

  it('syncs axhub-preview MCP whenever ACP UI is open and folds axhub-canvas into the same runtime config for canvas context', () => {
    const adapterSource = readFileSync(resolve(__dirname, '../assistantAcpContext.ts'), 'utf8');
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const retrySyncSource = controllerSource.slice(
      controllerSource.indexOf('const syncAssistantPreviewMcpConfigToIframe = useCallback'),
      controllerSource.indexOf('const syncAssistantPreviewMcpConfigToIframeWithAck = useCallback'),
    );

    expect(adapterSource).toContain('buildAcpPreviewMcpPostMessage');
    expect(adapterSource).toContain("'axhub-preview'");
    expect(adapterSource).toContain("'x-axhub-preview-mcp-token'");
    expect(adapterSource).toContain("'x-axhub-preview-bridge-client-id'");
    expect(adapterSource).toContain('buildAcpCanvasMcpPostMessage');
    expect(adapterSource).toContain("'axhub-canvas'");
    expect(adapterSource).toContain("'x-axhub-canvas-mcp-token'");
    expect(adapterSource).toContain('ACP_MCP_RUNTIME_CLEAR_FIELDS');
    expect(bridgeSource).toContain('syncPreviewMcpConfigWithRetry');
    expect(bridgeSource).toContain('buildAcpPreviewMcpPostMessage(config)');
    expect(bridgeSource).toContain('syncCanvasMcpConfigWithAck');
    expect(bridgeSource).toContain('buildAcpCanvasMcpPostMessage(config');
    expect(controllerSource).toContain('const assistantPreviewMcpConfigSyncSignatureRef = useRef(\'\');');
    expect(controllerSource).toContain('syncPreviewMcpConfigWithRetry: postAssistantPreviewMcpConfigToIframeWithRetry,');
    expect(controllerSource).toContain('function isAssistantCanvasMcpContext(context: AssistantContextV1): boolean');
    expect(controllerSource).toContain('function isAssistantCanvasMcpPath(value: unknown): boolean');
    expect(controllerSource).toContain('function getAssistantPreviewMcpRuntimeConfig(context: AssistantContextV1, targetPath?: string)');
    expect(retrySyncSource).toContain('const previewMcpContext = options.context || assistantContextV1;');
    expect(retrySyncSource).toContain('getAssistantPreviewMcpRuntimeConfig(previewMcpContext, latestAssistantResourcePathRef.current)');
    expect(retrySyncSource).not.toContain('postAssistantCanvasMcpConfigToIframeWithRetry');
    expect(controllerSource).toContain('const previewMcpContext = options.context || assistantContextV1;');
    expect(controllerSource).toContain('getAssistantPreviewMcpRuntimeConfig(previewMcpContext, latestAssistantResourcePathRef.current)');
    expect(controllerSource).not.toContain('await postAssistantCanvasMcpConfigToIframeWithAck');
    expect(controllerSource).toContain('await syncAssistantPreviewMcpConfigToIframeWithAck({');
    expect(controllerSource).toContain('context,');
    expect(controllerSource).toContain('__AXHUB_PREVIEW_BRIDGE_CLIENT_ID__');
    expect(controllerSource.indexOf('const assistantContextV1 = useMemo<AssistantContextV1>'))
      .toBeLessThan(controllerSource.indexOf('const syncAssistantPreviewMcpConfigToIframe = useCallback'));
    expect(controllerSource).toContain('const previewMcpConfigSignature = getAcpPreviewMcpConfigSignature(previewMcpConfig);');
    expect(controllerSource).toContain('postAssistantPreviewMcpConfigToIframeWithRetry(previewMcpConfig);');
    expect(controllerSource).toContain('syncAssistantPreviewMcpConfigToIframe();');
    expect(controllerSource).toContain('syncAssistantPreviewMcpConfigToIframe({');
    expect(controllerSource).toContain('syncAssistantPreviewMcpConfigToIframeWithAck({');
    expect(controllerSource).toContain('assistantIframeBridgeRecoveringRef.current = true;');
    expect(controllerSource).toContain('assistantIframeBridgeRecoveringRef.current = false;');
    expect(controllerSource).not.toContain('url.searchParams.set(\'mcpServers\'');
  });

  it('includes the resource canvas MCP in the primary runtime MCP config for canvas contexts', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const previewConfigSource = source.slice(
      source.indexOf('function getAssistantPreviewMcpRuntimeConfig'),
      source.indexOf('function resolveStoredAssistantPanelMode'),
    );

    expect(previewConfigSource).toContain('const includeCanvas = isAssistantCanvasMcpContext(context) || isAssistantCanvasMcpPath(targetPath);');
    expect(previewConfigSource).toContain("const canvasToken = String(globals.__AXHUB_CANVAS_MCP_TOKEN__ || '').trim();");
    expect(previewConfigSource).toContain('...(includeCanvas && canvasToken ? { includeCanvas: true, canvasToken } : {}),');
  });

  it('recovers ACP UI iframe refreshes with host ready and acked runtime/context sync before falling back to retries', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(bridgeSource).toContain('const ACP_POST_MESSAGE_RETRY_DELAYS_MS = [0, 160, 520, 1200, 2500] as const;');
    expect(bridgeSource).toContain('function createAcpHostReadyRequestId(): string');
    expect(bridgeSource).toContain('function createAcpRuntimeConfigRequestId(): string');
    expect(bridgeSource).toContain('function createAcpContextRequestId(): string');
    expect(bridgeSource).toContain('postAcpRequestWithRetry');
    expect(bridgeSource).toContain("event.origin !== targetOrigin");
    expect(bridgeSource).toContain("successTypes: ['acp.ui.ready']");
    expect(bridgeSource).toContain("successTypes: ['acp.runtime.result']");
    expect(bridgeSource).toContain("successTypes: ['acp.context.result']");
    expect(bridgeSource).toContain("errorTypes: ['acp.runtime.error']");
    expect(bridgeSource).toContain("errorTypes: ['acp.context.error']");
    expect(bridgeSource).toContain('requestHostReadyWithRetry');
    expect(bridgeSource).toContain('subscribeEventsWithRetry');
    expect(bridgeSource).toContain("type: 'acp.subscribe',");
    expect(bridgeSource).toContain("successTypes: ['acp.query.result'],");
    expect(bridgeSource).toContain("ui: { closeButton: false },");
    expect(bridgeSource).toContain('syncContextWithAck');
    expect(bridgeSource).toContain('syncImageGenerationConfigWithAck');
    expect(bridgeSource).toContain('syncPreviewMcpConfigWithAck');

    expect(controllerSource).toContain('const ACP_HOST_READY_EVENTS = [');
    expect(controllerSource).toContain("'thread.runtime.changed'");
    expect(controllerSource).toContain("'thread.messages.changed'");
    expect(controllerSource).toContain("'thread.artifacts.changed'");
    expect(controllerSource).toContain("'thread.idle'");
    expect(controllerSource).toContain('const recoverAssistantIframeBridge = useCallback(async () => {');
    expect(controllerSource).toContain('assistantIframeBridgeRecoveringRef.current = true;');
    expect(controllerSource).toContain('await requestHostReadyWithRetry();');
    expect(controllerSource).toContain('await subscribeAssistantEventsWithRetry(ACP_HOST_READY_EVENTS);');
    expect(controllerSource).toContain('await syncAssistantImageGenerationConfigToIframeWithAck({ requireLoaded: false, requireVisible: false, force: true });');
    expect(controllerSource).toContain('await syncAssistantPreviewMcpConfigToIframeWithAck({ requireLoaded: false, requireVisible: false, force: true });');
    expect(controllerSource).toContain("await syncAssistantContextToIframeWithAck(assistantContextV1, 'replace', {");
    expect(controllerSource).toContain("console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} iframe refresh recovery fell back to retry sync`, error);");
    expect(controllerSource).toContain('} finally {\n            if (recoveryIsCurrent()) {');
    expect(controllerSource).toContain('assistantIframeBridgeRecoveringRef.current = false;');
    expect(controllerSource).toContain('void recoverAssistantIframeBridge();');
    expect(controllerSource).toContain('const previousAssistantActiveIframeKeyRef = useRef<string | null>(null);');
    expect(controllerSource).toContain('const activeIframeChanged = previousAssistantActiveIframeKeyRef.current !== assistantActiveIframeKey;');
    expect(controllerSource).toContain('if (!activeIframeChanged || !assistantIframePool.activeEntry?.loaded) {');
    expect(controllerSource.indexOf('setAssistantIframeLoaded(true);'))
      .toBeLessThan(controllerSource.indexOf('void recoverAssistantIframeBridge();'));
  });

  it('does not subscribe to ACP artifact bridge messages after canvas history removal', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');

    expect(bridgeSource).not.toContain('assistantArtifactBridge');
    expect(bridgeSource).not.toContain('normalizeAssistantArtifactsChangedMessage');
    expect(bridgeSource).not.toContain('dispatchAssistantArtifactsChanged');
    expect(bridgeSource).not.toContain('dispatchAssistantArtifactsSyncRequest');
    expect(bridgeSource).not.toContain('createAssistantArtifactDedupe');
    expect(bridgeSource).not.toContain("'acp.messages.changed'");
    expect(bridgeSource).not.toContain("'thread.idle'");
    expect(bridgeSource).toContain("'acp.artifacts.get'");
  });

  it('notifies the host when ACP reports the active thread', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');

    expect(bridgeSource).toContain('export function useAssistantBridge(iframeSrc: string, bridgeOptions?: UseAssistantBridgeOptions)');
    expect(bridgeSource).toContain('onActiveThreadChanged?: (threadId: string) => void;');
    expect(bridgeSource).toContain('bridgeOptions?.onActiveThreadChanged?.(resultThreadId);');
    expect(bridgeSource).not.toContain('options?.onActiveThreadChanged?.(resultThreadId);');
    expect(bridgeSource).not.toContain('snapshotThreadId');
  });

  it('does not expose ACP artifact query plumbing as a shared canvas history API after canvas history removal', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(bridgeSource).not.toContain('getArtifacts:');
    expect(controllerSource).not.toContain('getArtifacts: getAssistantArtifactsFromIframe,');
    expect(controllerSource).not.toContain('const getAssistantArtifacts = useCallback((');
    expect(controllerSource).not.toContain('getAssistantArtifacts,');
    expect(controllerSource).toContain('queryArtifactsWithRetry');
    expect(controllerSource).toContain("if (options.collectArtifacts === true && submitResult.threadId) {");
  });

  it('treats visible running ACP submit results as draft-only and skips artifact collection', () => {
    const bridgeSource = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');
    const controllerSource = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(bridgeSource).toContain('isRunning?: boolean;');
    expect(bridgeSource).toContain("...(typeof data.payload?.isRunning === 'boolean'");
    expect(controllerSource).toContain("typeof submitResult.isRunning === 'boolean'");
    expect(controllerSource).toContain('if (submitResult.isRunning === true && submitResult.canSend === false) {');
    expect(controllerSource).toContain("messageApi.info('已填入输入框，等待当前回复结束后发送');");
    expect(controllerSource).toContain('return {');
    expect(controllerSource).toContain('ok: false,');
  });

  it('does not expose Web Editor Agent request handling for ACP UI', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).not.toContain('handleWebEditorGenieRequest');
    expect(source).not.toContain('normalizeWebEditorGenieRequestPayload');
    expect(source).not.toContain('WebEditorGenieRequestPayload');
    expect(source).not.toContain('webEditorIntegrationClientIdRef');
    expect(source).not.toContain('assistantWebEditorClientId');
    expect(source).not.toContain('startAssistantRuntimeForWebEditor');
    expect(source).not.toContain('tryOpenByAssistantIframe');
  });

  it('exposes a non-opening assistant runtime connector for annotation toolbar state', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const connectAssistantRuntimeSilently = useCallback(async () => {');
    expect(source).toContain('const runtime = await refreshRuntime({ autoStart: true }) as AssistantRuntimeState;');
    expect(source).toContain('const resolvedRuntime = await waitForAssistantRuntimeReady(runtime);');
    expect(source).toContain('connectAssistantRuntimeSilently,');
  });

  it('revalidates a cached assistant runtime before a silent connection', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const connectorSource = source.slice(
      source.indexOf('const connectAssistantRuntimeSilently = useCallback(async () => {'),
      source.indexOf('const handleCopyProjectDirectoryForMobile', source.indexOf('const connectAssistantRuntimeSilently = useCallback(async () => {')),
    );

    expect(connectorSource).not.toContain("if (assistantRuntime?.health.status === 'ready') {");
    expect(connectorSource).toContain('refreshRuntime({ autoStart: true })');
  });

  it('exposes a comment sync callback and sends comment-only context changes with replace mode', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('syncAssistantCanvasComments');
    expect(source).toContain('buildAssistantContextWithCanvasComments');
    expect(source).toContain("syncAssistantContextToTargets(nextContext, 'replace', {");
    expect(source).toContain('setAssistantExternalContext(nextContext);');
    expect(source).toContain('assistantContextCommentsSignatureRef');
  });

  it('can open a non-ACP web agent URL directly in the sidebar iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('const openRawUrlInAssistantPanel = useCallback((url: string) => {');
    expect(source).toContain('setAssistantIframeOverrideUrl(nextUrl);');
    expect(source).toContain('handleOpenAcpWebAgent');
    expect(source).toContain('openRawUrlInAssistantPanel');
    expect(source).not.toContain('stopAssistantIntegrationBridge');
  });

  it('posts item context to ACP child windows instead of serializing it into URLs', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const itemContextSource = source.slice(
      source.indexOf('const handleOpenAssistantWithItemContext = useCallback((item: ItemData) => {'),
      source.indexOf('const probeAssistantRuntimeSilently = useCallback(async () => {'),
    );

    expect(source).toContain('postAssistantContextToWindowWithRetry(childWindow, nextUrl, contextOverride);');
    expect(source).toContain("const childWindow = window.open(nextUrl, '_blank', windowFeatures);");
    expect(source).toContain("const windowFeatures = contextOverride ? undefined : 'noopener,noreferrer';");
    expect(itemContextSource).toContain("void ensureAssistantReadyThenOpen('button', url.toString(), targetPath, 'window', itemContext, {");
    expect(itemContextSource).toContain("panelMode: 'general-ai',");
    expect(itemContextSource).not.toContain("searchParams.set('targetPath'");
    expect(itemContextSource).not.toContain("url.searchParams.set('context'");
    expect(itemContextSource).not.toContain('JSON.stringify');
  });

  it('allows the compact viewport entry point to preserve the selected target path in a new window', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const entrySource = source.slice(
      source.indexOf('const handleOpenAssistantInNewWindowNoContext'),
      source.indexOf('const handleOpenAssistantWithItemContext'),
    );

    expect(entrySource).toContain('(targetPath?: string)');
    expect(entrySource).toContain("ensureAssistantReadyThenOpen('button', assistantIframeUrl, targetPath, 'window', null");
  });

  it('can restore the assistant panel after a page refresh without submitting a prompt', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const restoreSource = source.slice(
      source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {'),
      source.indexOf('useEffect(() => {', source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {')),
    );

    expect(source).toContain('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {');
    expect(restoreSource).toContain('if (assistantPanelMounted && canReuseMountedAssistant) {');
    expect(restoreSource).toContain('if (shouldReloadForRestoreMode) {');
    expect(restoreSource).toContain('if (assistantVisible) {');
    expect(restoreSource).toContain('return true;');
    expect(restoreSource.indexOf('if (shouldReloadForRestoreMode) {'))
      .toBeLessThan(restoreSource.indexOf('if (assistantVisible) {'));
    expect(restoreSource).toContain('setAssistantVisible(true);');
    expect(source).toContain("return ensureAssistantReadyThenOpen('event', undefined, targetPath, 'iframe', null, {");
    expect(source).toContain("loadingText: false,");
    expect(source).toContain('restoreAssistantPanel,');
  });

  it('can temporarily hide the assistant panel without unmounting the iframe', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const temporaryHideSource = source.slice(
      source.indexOf('const hideAssistantPanelTemporarily = useCallback(() => {'),
      source.indexOf('const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {'),
    );

    expect(source).toContain('const hideAssistantPanelTemporarily = useCallback(() => {');
    expect(temporaryHideSource).toContain('setAssistantVisible(false);');
    expect(temporaryHideSource).not.toContain('setAssistantPanelMounted(false);');
    expect(temporaryHideSource).not.toContain('setAssistantIframeLoaded(false);');
    expect(temporaryHideSource).not.toContain('setAssistantIframeOverrideUrl(null);');
    expect(source).toContain('hideAssistantPanelTemporarily,');
  });

  it('uses a resource-bound ACP thread only as the assistant landing page', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain("const ACP_NAVIGATION_CHANGED_EVENT = 'acp.navigation.changed';");
    expect(source).toContain('getAssistantResourceThreadId');
    expect(source).toContain('getAssistantResourceThreadIdWithFallback');
    expect(source).not.toContain("url.searchParams.get('fromP')");
    expect(source).not.toContain("`src/prototypes/${fromP}/canvas.excalidraw`");
    expect(source).toContain("return /^src\\/resources\\/.+\\.excalidraw$/u.test(currentFilePath);");
    expect(source).toContain('const resolvedResourceThreadStoragePath = threadId');
    expect(source).toContain('latestAssistantResourcePathRef.current = resolvedAssistantUrl.resourceThreadStoragePath;');
    expect(source).toContain('setAssistantResourceThreadId');
    expect(source).toContain('const resolveAssistantThreadLandingUrl = useCallback((');
    expect(source).toContain('if (!targetPath) {');
    expect(source).toContain("parsedUrl.pathname = `/thread/${encodeURIComponent(resolvedThreadId)}`;");
    expect(source).toContain('const handleAssistantActiveThreadChange = useCallback((threadId: string | null | undefined) => {');
    expect(source).toContain('setAssistantResourceThreadId({');
    expect(source).toContain('onActiveThreadChanged: handleAssistantActiveThreadChange,');
    expect(source).toContain('function readAcpNavigationChangedMessage(');
    expect(source).toContain('function resolveAcpNavigationThreadId(');
    expect(source).toContain('const iframeKey = assistantIframePool.findKeyByWindow(event.source);');
    expect(source).toContain('if (event.origin !== expectedOrigin) {');
    expect(source).toContain('const navigation = readAcpNavigationChangedMessage(event.data);');
    expect(source).toContain('const navigationUrl = resolveAssistantNavigationUrl(');
    expect(source).toContain('iframeEntry.navigationUrl || iframeEntry.src,');
    expect(source).toContain('assistantIframePool.markNavigation(');
    expect(source).toContain('if (iframeKey !== assistantIframePool.activeKey) {');
    expect(source).toContain('assistantIframeCurrentUrlRef.current = navigationUrl;');
    expect(source).toContain('const navigationThreadId = navigation.threadId ?? resolveAcpNavigationThreadId(navigationUrl);');
    expect(source).toContain('latestAssistantNavigationThreadIdRef.current = navigationThreadId;');
    expect(source).toContain('handleAssistantActiveThreadChange(navigationThreadId);');
    expect(source).not.toContain('setAssistantIframeOverrideUrl(navigationUrl);');
    expect(source).not.toContain('setAssistantVisible(Boolean(getAssistantResourceThreadId');
    expect(source).not.toContain('setAssistantPanelMounted(Boolean(getAssistantResourceThreadId');
  });

  it('routes hidden pooled navigation even when a non-general panel is active', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const navigationHandler = source.slice(
      source.indexOf('const handleAssistantNavigationChanged = (event: MessageEvent) => {'),
      source.indexOf("window.addEventListener('message', handleAssistantNavigationChanged);"),
    );

    expect(navigationHandler).not.toContain('assistantSupportsAcpContext');
    expect(navigationHandler).toContain('assistantIframePool.findKeyByWindow(event.source)');
  });

  it('keeps resource-thread binding pointed at the current assistant resource', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain('latestAssistantResourcePathRef.current = getAssistantContextCurrentFilePath(assistantContextV1);');
    expect(source).toContain('}, [assistantContextV1, assistantRuntime?.projectPath]);');
  });

  it('opens AI settings with runtime failure context instead of showing a not-ready modal', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');
    const ensureReadySource = source.slice(
      source.indexOf('const ensureAssistantReadyThenOpen = useCallback(async ('),
      source.indexOf('const syncAssistantCanvasComments = useCallback('),
    );

    expect(source).toContain('onOpenAISettings?: (runtime?: AssistantRuntimeState | null, message?: string) => void;');
    expect(source).toContain('const openAISettingsForAssistantRuntime = useCallback((');
    expect(source).toContain('onOpenAISettings?.(runtime, message);');
    expect(source).toContain('type EnsureAssistantOpenOptions = {');
    expect(source).toContain('options: EnsureAssistantOpenOptions = {}');
    expect(source).toContain("messageApi.loading(options.loadingText || '正在打开 AI...', 0)");
    expect(source).toContain("const DEFAULT_ASSISTANT_INSTALL_CMD = 'npx -y @axhub/acp --port 32124';");
    expect(source).toContain('start: DEFAULT_ASSISTANT_INSTALL_CMD,');
    expect(source).toContain("status: 'curl http://localhost:32124/api/chat',");
    expect(source).not.toContain('@axhub/genie@latest');
    expect(source).not.toContain('正在启动并检测 Axhub Genie');
    expect(source).not.toContain('const showAssistantNotReadyModal = useCallback((');
    expect(source).not.toContain('modal.confirm({');
    expect(source).not.toContain("title: 'AI 助手未就绪'");
    expect(source).not.toContain('请先通过 CLI 启动 AI 助手。');
    expect(source).not.toContain("messageApi.success('启动命令已复制')");
    expect(ensureReadySource).toContain('openAISettingsForAssistantRuntime(resolvedRuntime, resolvedRuntime.health.message || \'本地 ACP 服务未链接\');');
    expect(ensureReadySource).toContain('messageApi.warning(\'已打开 AI 设置，请检查本地 ACP 服务\');');
    expect(ensureReadySource).toContain("openAISettingsForAssistantRuntime(runtime, error?.message || '检测 AI 助手状态失败');");
  });

  it('adapts only validated compatible ACP events into host notifications', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantPanelController.tsx'), 'utf8');

    expect(source).toContain("import { createAssistantNotificationTracker } from '../../notifications/assistantNotificationEvents';");
    expect(source).toContain("import { notificationDiagnostics } from '../../notifications/notificationDiagnostics';");
    expect(source).toContain("import type { NotificationIntent } from '../../notifications/notificationCoordinator';");
    expect(source).toContain('onAiNotification?: (intent: NotificationIntent) => void;');
    expect(source).toContain('const assistantNotificationTrackerRef = useRef(createAssistantNotificationTracker(notificationDiagnostics));');
    expect(source).toContain("notificationDiagnostics.record('assistant.event.received'");
    expect(source).toContain("reason: 'unmatched-source'");
    expect(source).toContain("reason: 'origin-mismatch'");
    expect(source).toContain("reason: 'accepted'");
    expect(source).toContain('const notificationIntent = assistantNotificationTrackerRef.current.consume(event.data);');
    expect(source).toContain('onAiNotification?.(notificationIntent);');
  });
});
