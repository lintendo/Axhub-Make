import type {
  CommentaryApi,
  CommentaryClearEditsOptions,
  CommentaryDebugState,
  CommentaryEditedSnapshot,
  CommentaryHostToolbarAction,
  CommentaryHostToolbarState,
  CommentaryHostToolbarStateListener,
  CommentaryModifiedElementSummary,
  CommentaryPageElementActivationResult,
  CommentaryPageElementSearchQuery,
  CommentaryPageElementSearchResult,
  CommentaryPageElementStructureQuery,
  CommentaryPageElementStructureResult,
  CommentaryState,
  CommentaryStyleChangeSet,
  CommentaryTargetedTextChange,
  CommentaryStatus,
  CommentaryStatusListener,
  CommentaryTextChange,
  CommentaryVoiceTarget,
  CommentaryVoiceCommentOptions,
  CommentaryVoiceCommentResult,
  CommentaryVoiceTargets,
  CommentaryVoiceTargetsListener,
  CommentaryExternalEditingStateResult,
  CommentaryExternalEditingTargetRef,
  SelectedElementSummary,
  WebEditorElementKey,
  WebEditorRevertElementResponse,
} from '../../web-editor-types';
import {
  WEB_EDITOR_V2_HOST_ID,
  WEB_EDITOR_V2_OVERLAY_ID,
  WEB_EDITOR_V2_UI_ID,
  WEB_EDITOR_V2_VERSION,
} from '../../constants';
import { createElementLocator, locateElement } from '../locator';
import { generateFullElementLabel, generateStableElementKey } from '../element-key';
import {
  createCommentaryVoiceTarget,
  resolveCommentaryVoiceTargetElement,
} from '../../voice/target';
import type { EditorServices, ExternalEditingElementTarget } from './contracts';
import { createChangesService } from './changes';
import { createFeedbackService } from './feedback';
import { createAgentBridgeService } from './agent-bridge';
import { createEditorIntegrationWsService } from './integration-ws';
import { createInteractionService } from './interaction';
import { createLifecycleService } from './lifecycle';
import { createLocalActionsService } from './local-actions';
import { createPersistenceService } from './persistence';
import { createConversationTaskMonitor } from './conversation-task-monitor';
import { captureElementScreenshot } from './screenshot';
import {
  resolveAnnotationElementIdentity,
  resolveAnnotationNodeIdFromLocator,
  resolveAnnotationTargetIdentity,
} from './annotation-target';
import {
  createEditorRuntimeState,
  DEFAULT_MODIFIERS,
  resolveWebEditorOptions,
  type ElementAgentTaskState,
  type ExternalEditingTaskRef,
  type CommentaryInitOptions,
} from './state';
import { createEditorSummariesService } from './summaries';
import { createTextSessionService } from './text-session';
import { pushMobileModeOverride } from '../../utils/mobile-detect';
import { installGlobalCommentaryReviewCommentProtocol } from '../../review/comment-protocol';
import { createCommentaryVoicePageTools } from '../../voice/page-tools';

const VOICE_HOVER_STABILITY_MS = 250;
const VOICE_TARGET_UNAVAILABLE_ERROR = '目标当前不可交互，请重新查找';

export type {
  CommentaryAgentBridgeOptions,
  CommentaryIntegrationWsOptions,
  CommentaryUiOptions,
  CommentaryInitOptions,
  CommentaryPromptContextOptions,
  WebEditorV2AgentBridgeOptions,
  WebEditorV2IntegrationWsOptions,
  WebEditorV2UiOptions,
  WebEditorV2InitOptions,
  WebEditorV2PromptContextOptions,
} from './state';
export type {
  CommentaryDesignAdjustmentTool,
  CommentaryAgentProvider,
  CommentaryUiSettings,
  WebEditorAgentProvider,
  WebEditorDesignAdjustmentTool,
  WebEditorUiSettings,
} from './ui-settings';

/**
 * Create the Commentary instance.
 *
 * The editor exposes a small local-only API while the implementation stays
 * split across lifecycle, interaction, persistence, and panel services.
 */
export function createCommentary(options: CommentaryInitOptions = {}): CommentaryApi {
  const resolvedOptions = resolveWebEditorOptions(options);
  const cleanupMobileModeOverride = pushMobileModeOverride(resolvedOptions.mobileMode);
  const state = createEditorRuntimeState();
  const statusListeners = new Set<CommentaryStatusListener>();
  const voiceTargetListeners = new Set<CommentaryVoiceTargetsListener>();
  const initialHostResource = (() => {
    try {
      return resolvedOptions.host.getResourceContext?.() ?? null;
    } catch {
      return null;
    }
  })();
  const hostResourceProjectPath = String(initialHostResource?.meta?.projectPath ?? '').trim();
  const resolvedProjectPath = String(
    resolvedOptions.agentBridge.projectPath || hostResourceProjectPath,
  ).trim();
  const summaries = createEditorSummariesService({
    state,
    promptContext: resolvedOptions.promptContext,
    projectPath: resolvedProjectPath,
    getResourceContext: resolvedOptions.host.getResourceContext,
    getPersistenceScope: resolvedOptions.host.getPersistenceScope,
    getPersistedPrototypeCommentsDocument: () =>
      persistence?.getPersistedPrototypeCommentsDocument() ?? null,
    buildCopyPromptOverride: resolvedOptions.host.buildCopyPrompt,
    getCommentarySkillOptions: () => resolvedOptions.ui.commentarySkillOptions,
  });
  const feedback = createFeedbackService({
    getUiRoot: () => state.shadowHost?.getElements()?.uiRoot ?? null,
  });
  let persistence: ReturnType<typeof createPersistenceService> | null = null;
  let conversationTaskMonitor: ReturnType<typeof createConversationTaskMonitor> | null = null;
  let interaction: ReturnType<typeof createInteractionService> | null = null;
  let agentBridge: ReturnType<typeof createAgentBridgeService> | null = null;
  let destroyed = false;
  let voiceHoverTimer: ReturnType<typeof setTimeout> | null = null;
  let voiceMutationObserver: MutationObserver | null = null;
  const voicePageTools = createCommentaryVoicePageTools({
    getSelectedElement: () => state.selectedElement,
    getHoveredElement: () =>
      resolvedOptions.host.getCurrentHoveredElement?.() ?? state.hoveredElement,
  });

  function getVoiceTargets(): CommentaryVoiceTargets {
    return voicePageTools.getTargets();
  }

  function notifyVoiceTargets(): void {
    if (destroyed) return;
    const targets = getVoiceTargets();
    for (const listener of voiceTargetListeners) {
      try {
        listener(targets);
      } catch (error) {
        console.error('[Commentary] Voice target listener failed:', error);
      }
    }
  }

  function notifyVoiceSelectionChange(): void {
    if (voiceHoverTimer !== null) {
      clearTimeout(voiceHoverTimer);
      voiceHoverTimer = null;
    }
    notifyVoiceTargets();
  }

  function notifyVoiceHoverChange(): void {
    if (voiceHoverTimer !== null) clearTimeout(voiceHoverTimer);
    voiceHoverTimer = setTimeout(() => {
      voiceHoverTimer = null;
      notifyVoiceTargets();
    }, VOICE_HOVER_STABILITY_MS);
  }

  function isCommentaryOverlayNode(node: unknown): boolean {
    let element = node as {
      getAttribute?: (name: string) => string | null;
      parentElement?: unknown;
    } | null;
    while (element && typeof element.getAttribute === 'function') {
      const id = element.getAttribute('id') ?? '';
      if (
        id === WEB_EDITOR_V2_HOST_ID ||
        id === WEB_EDITOR_V2_OVERLAY_ID ||
        id === WEB_EDITOR_V2_UI_ID ||
        element.getAttribute('data-axhub-commentary-overlay') === 'true'
      ) {
        return true;
      }
      element = element.parentElement as typeof element;
    }
    return false;
  }

  function mutationOnlyTouchesCommentaryOverlay(record: MutationRecord): boolean {
    if (isCommentaryOverlayNode(record.target)) return true;
    const changedNodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
    return changedNodes.length > 0 && changedNodes.every(isCommentaryOverlayNode);
  }

  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const mutationRoot = document.documentElement;
    if (mutationRoot) {
      voiceMutationObserver = new MutationObserver((records) => {
        if (records.some((record) => !mutationOnlyTouchesCommentaryOverlay(record))) {
          voicePageTools.invalidate();
        }
      });
      voiceMutationObserver.observe(mutationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
  }

  function buildSelectedElementSummary(): SelectedElementSummary | null {
    const element = state.selectedElement;
    if (!element || !element.isConnected) return null;

    const locator = createElementLocator(element);
    const elementKey = generateStableElementKey(element, locator.shadowHostChain);
    const label = element.id
      ? `${element.tagName.toLowerCase()}#${element.id}`
      : element.tagName.toLowerCase();

    return {
      elementKey,
      locator,
      label,
      fullLabel: generateFullElementLabel(element, locator.shadowHostChain),
      tagName: element.tagName.toLowerCase(),
      updatedAt: Date.now(),
    };
  }

  function getVoiceTarget(): CommentaryVoiceTarget | null {
    const resolved = resolveCommentaryVoiceTargetElement(
      state.selectedElement,
      () => resolvedOptions.host.getCurrentHoveredElement?.() ?? state.hoveredElement,
    );
    return resolved ? createCommentaryVoiceTarget(resolved.element, resolved.source) : null;
  }

  function getHistoryCounts(): { undoCount: number; redoCount: number } {
    const tm = state.transactionManager;
    return {
      undoCount: tm?.getUndoStack().length ?? 0,
      redoCount: tm?.getRedoStack().length ?? 0,
    };
  }

  function getModifiedElements(): CommentaryModifiedElementSummary[] {
    return summaries.collectModifiedElementSummaries();
  }

  function getTextChanges(): CommentaryTextChange[] {
    return summaries.collectTextChanges();
  }

  function getTargetedTextChanges(): CommentaryTargetedTextChange[] {
    return summaries.collectTargetedTextChanges();
  }

  function getClearableCount(): number {
    const clearableElementKeys = new Set<WebEditorElementKey>();

    for (const meta of state.editMetaByKey.values()) {
      if (meta.dirtySince !== null) {
        clearableElementKeys.add(meta.elementKey);
      }
    }

    for (const task of agentBridge?.getVisibleTaskStates() ?? []) {
      if (task.status === 'completed' || task.status === 'error') {
        clearableElementKeys.add(task.elementKey);
      }
    }

    return clearableElementKeys.size;
  }

  function getStyleChanges(): CommentaryStyleChangeSet {
    return summaries.collectStyleChanges();
  }

  function getEditedSnapshot(): CommentaryEditedSnapshot {
    let resource = null;
    try {
      resource = resolvedOptions.host.getResourceContext?.() ?? null;
    } catch {
      resource = null;
    }

    return {
      resource,
      selectedElement: buildSelectedElementSummary(),
      modifiedElements: getModifiedElements(),
      textChanges: getTextChanges(),
      targetedTextChanges: getTargetedTextChanges(),
      styleChanges: getStyleChanges(),
    };
  }

  function getDebugState(): CommentaryDebugState {
    const selectedElement = buildSelectedElementSummary();
    const currentConversation = agentBridge?.getCurrentConversationState() ?? null;
    const currentTask = agentBridge?.getElementTaskState(state.selectedElement) ?? null;
    const visibleTasks = agentBridge?.getVisibleTaskStates() ?? [];
    const bridgeConfig = agentBridge?.getDebugInfo?.() ?? null;
    const integrationWsDebugState = services.integrationWs?.getDebugState() ?? null;

    return {
      available: agentBridge?.isAvailable() ?? false,
      connected: agentBridge?.isConnected() ?? false,
      integrationWsStatus: integrationWsDebugState?.status ?? 'disconnected',
      integrationWsUrl: integrationWsDebugState?.url ?? null,
      integrationWsLastError: integrationWsDebugState?.lastError ?? null,
      bridgeConfig,
      selectedElementKey: selectedElement?.elementKey ?? null,
      currentConversation: currentConversation
        ? {
            scopeKey: currentConversation.scopeKey,
            sessionId: currentConversation.sessionId,
            provider: currentConversation.provider,
            invalidated: currentConversation.invalidated,
            sentCount: currentConversation.sentCount,
            expiresAt: currentConversation.expiresAt,
            sessionUrl: currentConversation.sessionUrl,
          }
        : null,
      hasReusableConversation: agentBridge?.hasReusableConversation() ?? false,
      currentElementTask: currentTask
        ? {
            elementKey: currentTask.elementKey,
            status: currentTask.status,
            sessionId: currentTask.sessionId,
            provider: currentTask.provider,
            message: currentTask.message,
            updatedAt: currentTask.updatedAt,
          }
        : null,
      visibleTasks: visibleTasks.map((task) => ({
        elementKey: task.elementKey,
        status: task.status,
        sessionId: task.sessionId,
        requestId: task.requestId,
        provider: task.provider,
        message: task.message,
        updatedAt: task.updatedAt,
      })),
    };
  }

  function getStatus(): CommentaryStatus {
    const selectedElement = buildSelectedElementSummary();
    const textChanges = getTextChanges();
    const styleChanges = getStyleChanges();
    const modifiedCount = getModifiedElements().length;
    const clearableCount = getClearableCount();
    const { undoCount, redoCount } = getHistoryCounts();

    return {
      active: state.active,
      hasSelection: selectedElement !== null,
      selectedElement,
      undoCount,
      redoCount,
      modifiedCount,
      clearableCount,
      hasTextChanges: textChanges.length > 0,
      hasStyleChanges: Boolean(styleChanges.cssText),
      hasModifiedElements: modifiedCount > 0,
      hasClearableElements: clearableCount > 0,
    };
  }

  function getFallbackHostToolbarState(): CommentaryHostToolbarState {
    return {
      toolbarMode: resolvedOptions.ui.toolbarMode,
      visible: false,
      robotState: 'sleeping',
      robotTitle: '打开 AI',
      robotDisabled: true,
      robotLoading: false,
      sendVisible: false,
      sendTitle: '发送给 AI',
      sendDisabled: true,
      sendLoading: false,
      interruptVisible: false,
      interruptTitle: '停止 AI 修改',
      interruptDisabled: true,
      interruptLoading: false,
      copyPromptVisible: false,
      copyPromptTitle: '复制 Prompt',
      copyPromptDisabled: true,
      clearEditsTitle: '清空全部编辑',
      clearEditsDisabled: true,
      propertyPanelVisible: false,
      propertyPanelOpen: false,
      propertyPanelTitle: '打开设计决策',
      modifiedCount: 0,
      terminalTaskCount: 0,
      selectedAgent: null,
      agentOptions: [{ value: null, label: '默认' }],
      aiExecutionConfigSummary: '',
      aiExecutionConfigConfigured: false,
      aiExecutionProvider: '',
      aiExecutionWorkspacePath: '',
      aiExecutionRunConcurrency: 5,
      aiExecutionProviderOptions: [],
      darkMode: false,
      disablePageAnimations: false,
      captureTargetScreenshotAvailable: false,
      captureTargetScreenshot: false,
      pageZoomEnabled: false,
      copySkillInstallPromptDisabled: true,
      selectionModeActive: resolvedOptions.ui.initialSelectionModeActive,
      fullExitAvailable: false,
      annotationEnabled: false,
      annotationEnableAvailable: false,
      annotationEnableLoading: false,
      annotationEnableDisabled: true,
      annotationEnableTitle: '开启需求标注',
    };
  }

  function getHostToolbarState(): CommentaryHostToolbarState {
    return state.propertyPanel?.getHostToolbarState?.() ?? getFallbackHostToolbarState();
  }

  function subscribeHostToolbarState(listener: CommentaryHostToolbarStateListener): () => void {
    if (state.propertyPanel?.subscribeHostToolbarState) {
      return state.propertyPanel.subscribeHostToolbarState(listener);
    }
    listener(getFallbackHostToolbarState());
    return () => undefined;
  }

  async function runHostToolbarAction(action: CommentaryHostToolbarAction): Promise<boolean> {
    if (destroyed) return false;
    return state.propertyPanel?.runHostToolbarAction?.(action) ?? false;
  }

  function refresh(): void {
    if (destroyed) return;
    state.breadcrumbs?.refresh();
    state.propertyPanel?.refresh();
    state.positionTracker?.forceUpdate(true);
  }

  function normalizeExternalTaskRef(
    value: Partial<ExternalEditingTaskRef> | null | undefined,
  ): ExternalEditingTaskRef | null {
    if (!value) return null;
    return {
      provider:
        typeof value.provider === 'string' && value.provider.trim() ? value.provider.trim() : null,
      sessionId:
        typeof value.sessionId === 'string' && value.sessionId.trim()
          ? value.sessionId.trim()
          : null,
      requestId:
        typeof value.requestId === 'string' && value.requestId.trim()
          ? value.requestId.trim()
          : null,
      error: typeof value.error === 'string' && value.error.trim() ? value.error.trim() : null,
      code: typeof value.code === 'string' && value.code.trim() ? value.code.trim() : null,
      output: typeof value.output === 'string' && value.output.trim() ? value.output.trim() : null,
      ...(value.chunk !== undefined ? { chunk: value.chunk } : {}),
      ...(value.details !== undefined ? { details: value.details } : {}),
    };
  }

  function getTaskStateLabel(
    taskStatus: string | null | undefined,
  ): 'idle' | 'editing' | 'completed' | 'error' {
    if (taskStatus === 'pending' || taskStatus === 'created') {
      return 'editing';
    }
    if (taskStatus === 'completed') {
      return 'completed';
    }
    if (taskStatus === 'error') {
      return 'error';
    }
    return 'idle';
  }

  type EditorNodeChangeState = 'clean' | 'dirty' | 'handled';
  type EditorNodeTaskState = 'idle' | 'editing' | 'completed' | 'error';
  type EditorNodeItem = {
    elementKey: string;
    label: string;
    changeState: EditorNodeChangeState;
    taskState: EditorNodeTaskState;
    hasNote: boolean;
    hasImages: boolean;
    changeKinds: string[];
    dirtySince: number | null;
    lastHandledAt: number | null;
  };

  function resolveElementByKey(
    elementKey: string,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ): Element | null {
    const selectedSummary = buildSelectedElementSummary();
    if (selectedSummary?.elementKey === elementKey && state.selectedElement?.isConnected) {
      return state.selectedElement;
    }

    const locator =
      state.editMetaByKey.get(elementKey)?.locator ??
      agentBridge?.getTaskStateByElementKey?.(elementKey)?.locator ??
      state.externalEditingTaskByElementKey.get(elementKey)?.locator ??
      state.agentTaskByElementKey.get(elementKey)?.locator ??
      targetRef?.locator ??
      null;
    if (!locator) return null;

    try {
      const element = locateElement(locator);
      return element?.isConnected ? element : null;
    } catch {
      return null;
    }
  }

  function validateExternalEditingTarget(
    elementKey: string,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ): boolean {
    const normalizedElementKey = String(elementKey || '').trim();
    const element = resolveElementByKey(normalizedElementKey, targetRef);
    if (!element) return false;
    const annotationIdentity = resolveAnnotationElementIdentity(element);
    const locator = createElementLocator(element);
    const liveElementKey = annotationIdentity?.elementKey
      ?? generateStableElementKey(element, locator.shadowHostChain);
    return liveElementKey === normalizedElementKey;
  }

  function resolveExternalEditingTargetByKey(
    elementKey: string,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ): ExternalEditingElementTarget | null {
    const normalizedElementKey = String(elementKey ?? '').trim();
    if (!normalizedElementKey) return null;

    const meta = state.editMetaByKey.get(normalizedElementKey) ?? null;
    const task =
      agentBridge?.getTaskStateByElementKey?.(normalizedElementKey) ??
      state.externalEditingTaskByElementKey.get(normalizedElementKey) ??
      state.agentTaskByElementKey.get(normalizedElementKey) ??
      null;
    const locator = meta?.locator ?? task?.locator ?? targetRef?.locator ?? null;
    if (!locator) return null;
    const label =
      meta?.label ?? task?.label ?? (String(targetRef?.label ?? '').trim() || normalizedElementKey);
    const annotationTarget = resolveAnnotationTargetIdentity({
      elementKey: normalizedElementKey,
      locator,
      label,
    });
    if (annotationTarget) {
      return {
        elementKey: annotationTarget.elementKey,
        locator: annotationTarget.locator,
        label: annotationTarget.label,
      };
    }

    return {
      elementKey: normalizedElementKey,
      locator,
      label,
    };
  }

  function resolveLiveExternalEditingTarget(
    target: ExternalEditingElementTarget,
  ): ExternalEditingElementTarget | null {
    if (!target.locator) return null;
    let element: Element | null = null;
    try {
      element = locateElement(target.locator);
    } catch {
      element = null;
    }
    if (!element?.isConnected) return null;

    const annotationIdentity = resolveAnnotationElementIdentity(element);
    if (annotationIdentity) {
      return {
        elementKey: annotationIdentity.elementKey,
        locator: annotationIdentity.locator,
        label: annotationIdentity.label,
      };
    }

    const locator = createElementLocator(element);
    return {
      elementKey: generateStableElementKey(element, locator.shadowHostChain),
      locator,
      label: generateFullElementLabel(element, locator.shadowHostChain),
    };
  }

  function locateElementForTarget(target: ExternalEditingElementTarget): Element | null {
    if (!target.locator) return null;
    try {
      const element = locateElement(target.locator);
      return element?.isConnected ? element : null;
    } catch {
      return null;
    }
  }

  function collectTerminalCleanupTargets(
    target: ExternalEditingElementTarget,
  ): ExternalEditingElementTarget[] {
    const targets = new Map<string, ExternalEditingElementTarget>();
    const addTarget = (item: ExternalEditingElementTarget | null): void => {
      const elementKey = String(item?.elementKey ?? '').trim();
      if (!item || !elementKey || !item.locator || targets.has(elementKey)) return;
      targets.set(elementKey, {
        elementKey,
        locator: item.locator,
        label: String(item.label || '').trim() || elementKey,
      });
    };

    addTarget(target);
    const annotationTarget = resolveAnnotationTargetIdentity(target);
    addTarget(annotationTarget);
    const liveTarget = resolveLiveExternalEditingTarget(target);
    addTarget(liveTarget);

    const liveElement = liveTarget
      ? locateElementForTarget(liveTarget)
      : locateElementForTarget(target);
    const annotationNodeId =
      annotationTarget?.nodeId ||
      (liveElement ? resolveAnnotationElementIdentity(liveElement)?.nodeId : '') ||
      resolveAnnotationNodeIdFromLocator(target.locator);
    if (liveElement?.isConnected) {
      for (const meta of state.editMetaByKey.values()) {
        if (!meta.locator) continue;
        const metaElement = locateElementForTarget({
          elementKey: meta.elementKey,
          locator: meta.locator,
          label: meta.label,
        });
        if (metaElement === liveElement) {
          addTarget({
            elementKey: meta.elementKey,
            locator: meta.locator,
            label: meta.label,
          });
        }
      }
    }
    if (annotationNodeId) {
      for (const meta of state.editMetaByKey.values()) {
        if (!meta.locator) continue;
        const metaNodeId = resolveAnnotationNodeIdFromLocator(meta.locator);
        const metaKeyNodeId = String(meta.elementKey ?? '').startsWith('annotation-panel:')
          ? String(meta.elementKey).replace(/^annotation-panel:/, '')
          : '';
        if (metaNodeId !== annotationNodeId && metaKeyNodeId !== annotationNodeId) {
          continue;
        }
        addTarget({
          elementKey: meta.elementKey,
          locator: meta.locator,
          label: meta.label,
        });
      }
    }

    return Array.from(targets.values());
  }

  function listEditorNodes(): EditorNodeItem[] {
    const nodeKeys = new Set<string>([
      ...state.editMetaByKey.keys(),
      ...state.processedEditTimestampsByKey.keys(),
      ...state.agentTaskByElementKey.keys(),
      ...state.externalEditingTaskByElementKey.keys(),
    ]);

    const items = Array.from(nodeKeys)
      .map((elementKey) => {
        const meta = state.editMetaByKey.get(elementKey) ?? null;
        const task =
          agentBridge?.getTaskStateByElementKey?.(elementKey) ??
          state.externalEditingTaskByElementKey.get(elementKey) ??
          state.agentTaskByElementKey.get(elementKey) ??
          null;
        const lastHandledAtRaw = state.processedEditTimestampsByKey.get(elementKey);
        const lastHandledAt = Number.isFinite(Number(lastHandledAtRaw))
          ? Number(lastHandledAtRaw)
          : null;
        const hasNote = Boolean(String(meta?.note ?? '').trim());
        const hasImages = Boolean(meta?.images.length);
        const dirtySince = Number.isFinite(Number(meta?.dirtySince))
          ? Number(meta?.dirtySince)
          : null;
        const hasUnprocessedDirty =
          dirtySince !== null && (lastHandledAt === null || dirtySince > lastHandledAt);
        const changeState: EditorNodeChangeState =
          hasNote || hasImages || hasUnprocessedDirty
            ? 'dirty'
            : lastHandledAt !== null
              ? 'handled'
              : 'clean';
        const label =
          meta?.label ??
          task?.label ??
          (buildSelectedElementSummary()?.elementKey === elementKey
            ? buildSelectedElementSummary()?.fullLabel
            : null) ??
          elementKey;
        const taskState = getTaskStateLabel(task?.status);

        return {
          elementKey,
          label,
          changeState,
          taskState,
          hasNote,
          hasImages,
          changeKinds: meta?.changeKinds.slice() ?? [],
          dirtySince,
          lastHandledAt,
        };
      })
      .sort((a, b) => {
        const aTs = Math.max(Number(a.dirtySince ?? 0), Number(a.lastHandledAt ?? 0));
        const bTs = Math.max(Number(b.dirtySince ?? 0), Number(b.lastHandledAt ?? 0));
        if (aTs !== bTs) return bTs - aTs;
        return a.label.localeCompare(b.label);
      });

    return items;
  }

  function getEditedSnapshotPayload() {
    const snapshot = getEditedSnapshot();
    const nodeStateCounts = {
      clean: 0,
      dirty: 0,
      handled: 0,
      editing: 0,
      completed: 0,
      error: 0,
    } as Record<'clean' | 'dirty' | 'handled' | 'editing' | 'completed' | 'error', number>;
    const items = listEditorNodes();
    for (const item of items) {
      nodeStateCounts[item.changeState] += 1;
      if (
        item.taskState === 'editing' ||
        item.taskState === 'completed' ||
        item.taskState === 'error'
      ) {
        nodeStateCounts[item.taskState] += 1;
      }
    }

    return {
      ...snapshot,
      statusSummary: {
        active: getStatus().active,
        modifiedCount: items.filter((item) => item.changeState !== 'clean').length,
        nodeStateCounts,
      },
    };
  }

  function getContextImagesPayload() {
    const items = Array.from(state.editMetaByKey.values())
      .flatMap((meta) =>
        meta.images.map((image) => ({
          id: image.id,
          name: image.name,
          data: image.data,
          mimeType: image.mimeType,
          createdAt: image.createdAt,
          source: 'prompt-context' as const,
        })),
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    return { items };
  }

  async function getNodeScreenshotPayload(elementKey: string) {
    const targetElement = resolveElementByKey(elementKey);
    if (!targetElement) {
      throw new Error(`NOT_FOUND: Element not found for key: ${elementKey}`);
    }

    const screenshot = await captureElementScreenshot(targetElement, elementKey);
    return {
      elementKey,
      image: screenshot,
      mimeType: 'image/png' as const,
      width: screenshot.width,
      height: screenshot.height,
    };
  }

  type EditingSetState = 'editing' | 'idle' | 'completed' | 'error';

  async function setNodeEditingState(
    elementKey: string,
    nextState: EditingSetState,
    taskRef: Partial<ExternalEditingTaskRef> | null,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ): Promise<CommentaryExternalEditingStateResult> {
    const normalizedTaskRef = normalizeExternalTaskRef(taskRef);
    const settlePersistedEditingTask = async (): Promise<void> => {
      await persistence?.waitForPendingWrites();
      if (nextState === 'editing') {
        conversationTaskMonitor?.reconcile();
      }
    };
    const recordNodeTaskState = (targetElementKey: WebEditorElementKey): void => {
      if (nextState === 'completed') return;
      persistence?.recordCommentTaskState?.(targetElementKey, nextState, normalizedTaskRef);
    };
    const canForceCompleteWithoutTask = (targetElementKey: WebEditorElementKey): boolean => {
      if (nextState !== 'completed') return false;
      const existingTask = agentBridge?.getTaskStateByElementKey?.(targetElementKey) ?? null;
      if (!existingTask) return true;
      return Boolean(
        normalizedTaskRef?.requestId && existingTask.requestId === normalizedTaskRef.requestId,
      );
    };
    const forceCompleteStateByTarget = (target: ExternalEditingElementTarget): boolean => {
      let applied = false;
      for (const cleanupTarget of collectTerminalCleanupTargets(target)) {
        if (!canForceCompleteWithoutTask(cleanupTarget.elementKey)) continue;
        persistence?.recordCommentTaskState?.(
          cleanupTarget.elementKey,
          'completed',
          normalizedTaskRef,
        );
        applied = true;
      }
      if (applied) {
        persistence?.flushPendingWrite();
      }
      return applied;
    };
    const targetElement = resolveElementByKey(elementKey, targetRef);
    if (!targetElement) {
      const target = resolveExternalEditingTargetByKey(elementKey, targetRef);
      if (nextState === 'editing' && target && agentBridge?.setExternalEditingStateByElementKey) {
        const task = agentBridge.setExternalEditingStateByElementKey(target, taskRef);
        recordNodeTaskState(target.elementKey);
        await settlePersistedEditingTask();
        notifyStatusChange();
        return {
          elementKey: target.elementKey,
          state: nextState,
          applied: Boolean(task),
          ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
        };
      }
      if (
        (nextState === 'completed' || nextState === 'error') &&
        target &&
        agentBridge?.setExternalEditingTerminalStateByElementKey
      ) {
        const task = agentBridge.setExternalEditingTerminalStateByElementKey(
          target,
          nextState,
          taskRef,
        );
        if (!task) {
          if (forceCompleteStateByTarget(target)) {
            await settlePersistedEditingTask();
            notifyStatusChange();
            return {
              elementKey: target.elementKey,
              state: nextState,
              applied: true,
              ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
            };
          }
          notifyStatusChange();
          return {
            elementKey: target.elementKey,
            state: nextState,
            applied: false,
            ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
          };
        }
        recordNodeTaskState(target.elementKey);
        await settlePersistedEditingTask();
        notifyStatusChange();
        return {
          elementKey: target.elementKey,
          state: nextState,
          applied: Boolean(task),
          ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
        };
      }
      if (nextState !== 'editing' && agentBridge?.clearExternalEditingStateByElementKey) {
        const applied = agentBridge.clearExternalEditingStateByElementKey(elementKey, taskRef);
        recordNodeTaskState(elementKey);
        await settlePersistedEditingTask();
        notifyStatusChange();
        return {
          elementKey,
          state: nextState,
          applied,
          ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
        };
      }
      throw new Error(`NOT_FOUND: Element not found for key: ${elementKey}`);
    }
    if (targetRef?.locator) {
      const annotationTarget = resolveAnnotationTargetIdentity({
        elementKey,
        locator: targetRef.locator,
        label: targetRef.label ?? null,
      });
      const metaTarget = annotationTarget ?? {
        elementKey: elementKey as WebEditorElementKey,
        locator: targetRef.locator,
        label: String(targetRef.label || '').trim() || elementKey,
      };
      changes.getOrCreateEditMeta(metaTarget.elementKey, metaTarget.locator, metaTarget.label);
    }

    if (!agentBridge?.setExternalEditingState || !agentBridge.clearExternalEditingState) {
      throw new Error('NOT_IMPLEMENTED: External editing state control is unavailable');
    }

    if (nextState === 'editing') {
      agentBridge.setExternalEditingState(targetElement, taskRef);
    } else if (nextState === 'idle') {
      agentBridge.clearExternalEditingState(targetElement, taskRef);
    } else if (nextState === 'completed' || nextState === 'error') {
      const target = resolveExternalEditingTargetByKey(elementKey, targetRef);
      let task: ElementAgentTaskState | null = null;
      if (target && agentBridge.setExternalEditingTerminalStateByElementKey) {
        task = agentBridge.setExternalEditingTerminalStateByElementKey(target, nextState, taskRef);
        if (!task) {
          if (forceCompleteStateByTarget(target)) {
            await settlePersistedEditingTask();
            notifyStatusChange();
            return {
              elementKey,
              state: nextState,
              applied: true,
              ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
            };
          }
          notifyStatusChange();
          return {
            elementKey,
            state: nextState,
            applied: false,
            ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
          };
        }
      } else if (agentBridge.setExternalEditingTerminalState) {
        task = agentBridge.setExternalEditingTerminalState(targetElement, nextState, taskRef);
        if (!task) {
          notifyStatusChange();
          return {
            elementKey,
            state: nextState,
            applied: false,
            ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
          };
        }
      } else {
        // Fallback implementations can only clear the live task; the persisted status is kept below.
        const applied = agentBridge.clearExternalEditingState(targetElement, taskRef);
        if (!applied) {
          notifyStatusChange();
          return {
            elementKey,
            state: nextState,
            applied: false,
            ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
          };
        }
      }
    }
    notifyStatusChange();

    recordNodeTaskState(elementKey);
    await settlePersistedEditingTask();
    return {
      elementKey,
      state: nextState,
      applied: true,
      ...(normalizedTaskRef ? { taskRef: normalizedTaskRef } : {}),
    };
  }

  function notifyStatusChange(): void {
    const status = getStatus();
    for (const listener of statusListeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('[Commentary] Status listener failed:', error);
      }
    }
  }

  const changes = createChangesService({
    state,
    scheduleCacheWrite: () => persistence?.scheduleWrite(),
    persistMarkerVisibility: (visible) => persistence?.setMarkerVisibility(visible),
    getCommentTaskState: (elementKey) => persistence?.getCommentTaskState?.(elementKey) ?? null,
    onCommentEdited: (elementKey) => {
      if (persistence?.resetTerminalCommentStateForElement(elementKey)) {
        agentBridge?.clearExternalEditingStateByElementKey?.(elementKey);
      }
    },
    onSelectMarkedElement: (element, anchor) => {
      if (!element.isConnected) return;
      state.eventController?.setMode('selecting');
      void interaction?.handleSelect(element, DEFAULT_MODIFIERS, {
        clientX: anchor.clientX,
        clientY: anchor.clientY,
      });
    },
    onStatusChange: notifyStatusChange,
  });
  const reviewCommentInstallation = installGlobalCommentaryReviewCommentProtocol({
    isActive: () => !destroyed && state.active,
    setComment: (element, comment) => changes.setNoteForElement(element, comment),
    clearComment: (element) => changes.setNoteForElement(element, ''),
  });

  const textSession = createTextSessionService({
    state,
    ensureSelected: (element, modifiers) => {
      void interaction?.handleSelect(element, modifiers);
    },
    logPrefix: '[WebEditorV2]',
  });

  persistence = createPersistenceService({
    state,
    changes,
    getResourceContext: resolvedOptions.host.getResourceContext,
    getPersistenceScope: resolvedOptions.host.getPersistenceScope,
    persistenceAdapter: resolvedOptions.host.persistenceAdapter,
    interactionProfile:
      resolvedOptions.interactionProfile === 'text-comment' ? 'text-comment' : 'design',
    getInteractionProfile: () =>
      resolvedOptions.interactionProfile === 'text-comment' || state.uiSettings.documentCommentMode
        ? 'text-comment'
        : 'design',
    onSaveStatusChange: () => {
      state.propertyPanel?.refresh();
      notifyStatusChange();
    },
  });
  conversationTaskMonitor = createConversationTaskMonitor({
    persistence,
    transport: resolvedOptions.host.conversationTaskTransport,
    onTerminalPersisted: (transition) => {
      const taskRef = {
        provider: transition.provider,
        sessionId: transition.sessionId,
        requestId: transition.requestId,
      };
      const elementKeys = new Set<WebEditorElementKey>();
      const meta = Array.from(state.editMetaByKey.values()).find(
        (candidate) => candidate.commentId === transition.commentId,
      );
      if (meta) {
        elementKeys.add(meta.elementKey);
      }
      for (const task of agentBridge?.getVisibleTaskStates?.() ?? []) {
        if (task.origin === 'external-editing' && task.requestId === transition.requestId) {
          elementKeys.add(task.elementKey);
        }
      }
      for (const elementKey of elementKeys) {
        agentBridge?.clearExternalEditingStateByElementKey?.(elementKey, taskRef);
      }
      changes.renderChangeMarkers();
      state.propertyPanel?.refresh();
      notifyStatusChange();
    },
    onPageSettled: async ({ hasError }) => {
      await resolvedOptions.ui.onHostToolbarAction?.({
        type: 'play-notification-sound',
        sound: hasError ? 'reminder' : 'completion',
      });
    },
  });

  let flushPendingCommentContextSync: (() => void) | null = null;

  agentBridge = createAgentBridgeService({
    state,
    changes,
    feedback,
    persistence,
    summaries,
    bridgeOptions: {
      ...resolvedOptions.agentBridge,
      projectPath: resolvedProjectPath,
    },
    onAvailabilityChange: (available) => {
      if (agentBridge?.isConnected() && !state.uiSettings.agentAwake) {
        state.uiSettings = {
          ...state.uiSettings,
          agentAwake: true,
        };
      }
      if (available) {
        flushPendingCommentContextSync?.();
      }
      state.breadcrumbs?.refresh();
      state.propertyPanel?.refresh();
    },
  });

  const integrationWs = createEditorIntegrationWsService({
    integrationWsOptions: resolvedOptions.integrationWs,
    getPageUrl: () => {
      if (typeof window === 'undefined') return resolvedOptions.integrationWs.pageUrl || null;
      return (
        String(resolvedOptions.integrationWs.pageUrl || window.location.href || '').trim() || null
      );
    },
    getSessionId: () => {
      const integrationSessionId = String(resolvedOptions.integrationWs.sessionId ?? '').trim();
      if (integrationSessionId) return integrationSessionId;
      return agentBridge?.getCurrentConversationState()?.sessionId ?? null;
    },
    getEditedSnapshotPayload,
    listEditorNodes,
    getContextImagesPayload,
    getNodeScreenshotPayload,
    setNodeEditingState,
    onConnectionStatusChange: () => {
      notifyStatusChange();
    },
  });

  interaction = createInteractionService({
    state,
    changes,
    persistence,
    textSession,
    agentBridge,
    logPrefix: '[WebEditorV2]',
    onStatusChange: notifyStatusChange,
    onSelectionChange: notifyVoiceSelectionChange,
    onHoverChange: notifyVoiceHoverChange,
  });

  const localActions = createLocalActionsService({
    state,
    feedback,
    changes,
    interaction,
    summaries,
    persistence,
    onStatusChange: notifyStatusChange,
  });

  const services: EditorServices = {
    feedback,
    summaries,
    changes,
    persistence,
    textSession,
    interaction,
    agentBridge,
    integrationWs,
    conversationTaskMonitor,
    localActions,
  };

  const lifecycle = createLifecycleService({
    state,
    options: resolvedOptions,
    services,
    onStatusChange: notifyStatusChange,
  });
  flushPendingCommentContextSync = lifecycle.flushPendingCommentContextSync;

  function start(): void {
    if (destroyed) return;
    lifecycle.start();
  }

  function startPanelOnly(): void {
    if (destroyed) return;
    lifecycle.startPanelOnly();
  }

  function stop(): void {
    if (destroyed) return;
    lifecycle.stop();
  }

  function stopPanelOnly(): void {
    if (destroyed) return;
    lifecycle.stopPanelOnly();
  }

  function toggle(): boolean {
    if (destroyed) return false;
    if (state.active) {
      stop();
    } else {
      start();
    }
    return state.active;
  }

  function getState(): CommentaryState {
    return {
      active: state.active,
      panelOnlyMode: state.panelOnlyMode,
      version: WEB_EDITOR_V2_VERSION,
    };
  }

  function subscribeStatus(listener: CommentaryStatusListener): () => void {
    statusListeners.add(listener);
    listener(getStatus());
    return () => {
      statusListeners.delete(listener);
    };
  }

  function subscribeVoiceTargets(listener: CommentaryVoiceTargetsListener): () => void {
    voiceTargetListeners.add(listener);
    listener(getVoiceTargets());
    return () => {
      voiceTargetListeners.delete(listener);
    };
  }

  function findVoiceElements(
    query: CommentaryPageElementSearchQuery,
  ): CommentaryPageElementSearchResult {
    return voicePageTools.findElements(query);
  }

  function getVoiceElementStructure(
    query: CommentaryPageElementStructureQuery,
  ): CommentaryPageElementStructureResult {
    return voicePageTools.getStructure(query);
  }

  async function activateVoiceElement(
    targetRef: string,
  ): Promise<CommentaryPageElementActivationResult> {
    const element = voicePageTools.resolveTarget(targetRef);
    if (!interaction?.activatePageTarget(element)) {
      return { activated: false, targetRef, error: VOICE_TARGET_UNAVAILABLE_ERROR };
    }
    element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    return { activated: true, targetRef };
  }

  async function createVoiceComment(
    targetRef: string,
    content: string,
    options: CommentaryVoiceCommentOptions,
  ): Promise<CommentaryVoiceCommentResult> {
    const element = voicePageTools.resolveTarget(targetRef);
    const target = voicePageTools.summarizeTarget(targetRef);
    const rect = element.getBoundingClientRect();
    const activated = interaction?.activatePageTarget(element, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top,
    });
    if (!activated) {
      return { applied: false, targetRef, error: VOICE_TARGET_UNAVAILABLE_ERROR };
    }
    const commentId = changes.setNoteForElement(element, content, {
      voiceCreateOperationId: String(options.operationId || '').trim() || undefined,
      voiceTargetRef: targetRef,
      voiceTarget: target,
      anchorPlacement: 'target',
    });
    if (!commentId) {
      return { applied: false, targetRef, error: '批注内容不能为空' };
    }
    persistence?.flushPendingWrite();
    await persistence?.waitForPendingWrites();
    return { applied: true, targetRef, commentId, target };
  }

  function clearSelection(): void {
    if (destroyed) return;
    interaction?.clearSelection();
    notifyStatusChange();
  }

  async function openCommentTarget(element: Element): Promise<boolean> {
    if (destroyed || !interaction || !element?.isConnected) return false;
    await interaction.handleSelect(element, DEFAULT_MODIFIERS);
    interaction.enterCommentInput('bubble-card');
    notifyStatusChange();
    return true;
  }

  function acknowledgeSavedTextChanges(): void {
    if (destroyed) return;
    persistence?.clearCachedChanges('text');
    notifyStatusChange();
  }

  function acknowledgeSavedStyleChanges(): void {
    if (destroyed) return;
    persistence?.clearCachedChanges('style');
    notifyStatusChange();
  }

  async function clearElementEdits(elementKey: string): Promise<boolean> {
    if (destroyed) return false;

    const meta = state.editMetaByKey.get(elementKey);
    if (!meta) return false;

    let element: Element | null = null;
    try {
      element = locateElement(meta.locator);
    } catch {
      element = null;
    }

    if (!element?.isConnected) return false;

    const cleared = await localActions.handleClearElementEdits(element);
    notifyStatusChange();
    return cleared;
  }

  async function clearAllEdits(options: CommentaryClearEditsOptions = {}): Promise<void> {
    if (destroyed) return;
    const clearedTarget = await localActions.handleClearEdits({ ...options, skipConfirm: true });
    if (!clearedTarget) return;
    for (const task of agentBridge?.getVisibleTaskStates() ?? []) {
      if (
        task.status !== 'completed' &&
        (clearedTarget === 'completed' || task.status !== 'error')
      ) {
        continue;
      }
      const element = resolveElementByKey(task.elementKey);
      if (element?.isConnected) {
        agentBridge?.dismissElementTaskState(element);
      }
    }
    notifyStatusChange();
  }

  async function refreshPersistedComments(
    externallyDeletedCommentIds: readonly string[] = [],
  ): Promise<void> {
    if (destroyed || !persistence) return;
    await persistence.waitForPendingWrites();
    const deletedCommentIds = new Set(
      externallyDeletedCommentIds.map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const externallyDeletedElementKeys = Array.from(state.editMetaByKey.values())
      .filter((meta) => Boolean(meta.commentId && deletedCommentIds.has(meta.commentId)))
      .map((meta) => meta.elementKey);
    const externallyDeletedElementKeySet = new Set(externallyDeletedElementKeys);
    const linkedDeleteTransactions = Array.from(
      state.deleteElementAnnotationsByTransactionId.values(),
    )
      .filter(
        (link) => link.active && externallyDeletedElementKeySet.has(link.parentElementKey),
      )
      .reverse();
    for (const link of linkedDeleteTransactions) {
      if (state.transactionManager?.restoreDeletedElement(link.transactionId)) continue;
      feedback.toast('warning', '删除批注后未能还原对应元素，请刷新页面恢复。');
    }
    const persistedDeletedElementKeys = await persistence.restoreCachedChanges();
    conversationTaskMonitor?.reconcile();
    agentBridge?.discardDeletedElementStates?.([
      ...externallyDeletedElementKeys,
      ...persistedDeletedElementKeys,
    ]);
    changes.renderChangeMarkers();
    state.propertyPanel?.refresh();
    notifyStatusChange();
  }

  async function revertElement(elementKey: string): Promise<WebEditorRevertElementResponse> {
    if (destroyed) {
      return {
        success: false,
        error: 'Commentary instance has been destroyed.',
      };
    }
    if (!interaction) {
      return {
        success: false,
        error: 'Commentary interaction service is not ready.',
      };
    }
    const result = await interaction.revertElement(elementKey);
    notifyStatusChange();
    return result;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (voiceHoverTimer !== null) {
      clearTimeout(voiceHoverTimer);
      voiceHoverTimer = null;
    }
    voiceTargetListeners.clear();
    voiceMutationObserver?.disconnect();
    voiceMutationObserver = null;
    voicePageTools.destroy();
    reviewCommentInstallation.dispose();
    conversationTaskMonitor?.stop();
    lifecycle.stop();
    statusListeners.clear();
    cleanupMobileModeOverride();
  }

  return {
    start,
    startPanelOnly,
    stop,
    stopPanelOnly,
    destroy,
    toggle,
    getState,
    getStatus,
    subscribeStatus,
    getVoiceTargets,
    subscribeVoiceTargets,
    findVoiceElements,
    getVoiceElementStructure,
    activateVoiceElement,
    createVoiceComment,
    validateExternalEditingTarget,
    refresh,
    getSelectedElement: buildSelectedElementSummary,
    getVoiceTarget,
    getModifiedElements,
    getTextChanges,
    getTargetedTextChanges,
    getStyleChanges,
    getEditedSnapshot,
    getDebugState,
    getHistoryCounts,
    revertElement,
    clearSelection,
    openCommentTarget,
    acknowledgeSavedTextChanges,
    acknowledgeSavedStyleChanges,
    clearElementEdits,
    clearAllEdits,
    refreshPersistedComments,
    getHostToolbarState,
    subscribeHostToolbarState,
    runHostToolbarAction,
    setNodeEditingState,
    getCopyPromptText: () => summaries.buildCopyPrompt(),
    getElementPromptText: (elementKey) => summaries.buildSaveRunPromptForElementKey(elementKey),
  };
}

export function createWebEditorV2(options: CommentaryInitOptions = {}) {
  return createCommentary(options);
}
