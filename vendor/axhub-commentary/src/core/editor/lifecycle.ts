import { WEB_EDITOR_V2_LOG_PREFIX } from '../../constants';
import { mountShadowHost } from '../../ui/shadow-host';
import { createWebEditorUiRuntime } from '../../ui/web-editor-ui-runtime';
import { createCanvasOverlay } from '../../overlay/canvas-overlay';
import { createHandlesController } from '../../overlay/handles-controller';
import { createParentSelectCorner } from '../../overlay/parent-select-corner';
import { createSelectionEngine } from '../../selection/selection-engine';
import { createTextCommentManager } from '../../selection/text-comment-manager';
import { createEventController } from '../event-controller';
import { createPositionTracker } from '../position-tracker';
import { createTransactionManager, type TransactionManager } from '../transaction-manager';
import { createPerfMonitor } from '../perf-monitor';
import { createDesignTokensService } from '../design-tokens';
import { locateElement } from '../locator';
import {
  exportSelectionToDesignTool,
  getDesignToolExportBlockReason,
  isExportableDesignElement,
} from '../../design-tool-export';
import { clearEditorRuntimeRefs, resetEditorTransientState } from './state';
import type { EditorLifecycleDeps, ExternalEditingElementTarget } from './contracts';
import { resolveTextCommentElementMeta, TEXT_COMMENT_TARGET_ATTR } from './text-comment-target';
import { getGlobalCommentaryTweakProtocol } from '../../tweak/protocol';
import { resolveWebEditorOptions } from './state';
import type { WebEditorInteractionProfile } from './ui-settings';
import type { PropertyPanelOptions } from '../../ui/property-panel';
import type { CommentaryHostToolbarAction } from '../../web-editor-types';
import { appendImplicitAnnotationSkillToPrompt } from '../../ui/runtime/prompt-card-skills';

interface EditorLifecycle {
  start(): void;
  startPanelOnly(): void;
  stop(options?: { keepPanelOnly?: boolean }): void;
  stopPanelOnly(): void;
  flushPendingCommentContextSync(): void;
}

type SelectionModeHotkeyDebugDecision =
  | 'received'
  | 'ignored-repeat'
  | 'ignored-shortcut-mismatch'
  | 'ignored-editor-ui'
  | 'triggered';

interface SelectionModeHotkeyDebugEvent {
  at: number;
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  target: string;
  decision: SelectionModeHotkeyDebugDecision;
}

interface SelectionModeHotkeyDebugAction {
  at: number;
  hasPropertyPanel: boolean;
  pending: boolean;
  result: boolean | null;
  error: string | null;
}

interface SelectionModeHotkeyDebugSnapshot {
  installed: boolean;
  installCount: number;
  shortcut: string;
  receivedCount: number;
  matchedCount: number;
  ignoredRepeatCount: number;
  ignoredMismatchCount: number;
  ignoredEditorUiCount: number;
  triggerCount: number;
  lastEvent: SelectionModeHotkeyDebugEvent | null;
  lastAction: SelectionModeHotkeyDebugAction | null;
}

interface SelectionModeHotkeyDebugApi extends SelectionModeHotkeyDebugSnapshot {
  reset(): void;
  snapshot(): SelectionModeHotkeyDebugSnapshot;
}

type SelectionModeHotkeyDebugWindow = Window & {
  __AXHUB_SELECTION_HOTKEY_DEBUG__?: SelectionModeHotkeyDebugApi;
};

const SELECTION_MODE_HOTKEY_SHORTCUT_LABEL = 'Ctrl / Cmd + S';

export function createLifecycleService(deps: EditorLifecycleDeps): EditorLifecycle {
  const { state, services, onStatusChange } = deps;
  const rawOptions: NonNullable<Parameters<typeof resolveWebEditorOptions>[0]> = deps.options
    ? (deps.options as NonNullable<Parameters<typeof resolveWebEditorOptions>[0]>)
    : {};
  const options = resolveWebEditorOptions(rawOptions);
  if (
    rawOptions.agentBridge &&
    !Object.prototype.hasOwnProperty.call(rawOptions.agentBridge, 'enableContextAppend')
  ) {
    (options.agentBridge as { enableContextAppend?: boolean }).enableContextAppend = undefined;
  }
  let inlineTextEditingElement: HTMLElement | null = null;
  let pendingCommentContextSync = false;
  let routeChangeCleanup: (() => void) | null = null;
  let interactionProfileRestartQueued = false;

  function resolveActiveInteractionProfile(): WebEditorInteractionProfile {
    if (options.interactionProfile === 'annotation') {
      return 'annotation';
    }
    return options.interactionProfile === 'text-comment' || state.uiSettings.documentCommentMode
      ? 'text-comment'
      : 'design';
  }

  function resolveAnnotationHostTarget(element: Element | null): Element | null {
    if (element?.getAttribute?.(TEXT_COMMENT_TARGET_ATTR) !== 'true') return element;
    return resolveTextCommentElementMeta(state, element)?.sourceElement ?? element;
  }

  const canEditAnnotationMarkdown = options.host.canEditAnnotationMarkdown
    ? (element: Element | null): boolean => {
        const target = resolveAnnotationHostTarget(element);
        return Boolean(target && options.host.canEditAnnotationMarkdown?.(target));
      }
    : undefined;
  const getCreateAnnotationBlockReason = options.host.getCreateAnnotationBlockReason
    ? (element: Element | null): string | undefined =>
        options.host.getCreateAnnotationBlockReason?.(resolveAnnotationHostTarget(element))
    : undefined;
  const getAnnotationDocumentEditUrl = options.host.getAnnotationDocumentEditUrl
    ? (element: Element | null): string | null | undefined =>
        options.host.getAnnotationDocumentEditUrl?.(resolveAnnotationHostTarget(element))
    : undefined;
  const getAnnotationMarkdown = options.host.getAnnotationMarkdown
    ? (element: Element | null): string | Promise<string> =>
        options.host.getAnnotationMarkdown?.(resolveAnnotationHostTarget(element)) ?? ''
    : undefined;
  const onAnnotationMarkdownChange = options.host.onAnnotationMarkdownChange
    ? async (element: Element, markdown: string): Promise<void> => {
        const target = resolveAnnotationHostTarget(element);
        if (!target) throw new Error('The selected document source is no longer available.');
        await options.host.onAnnotationMarkdownChange?.(target, markdown);
      }
    : undefined;

  function handleUiSettingsChange(settings: typeof state.uiSettings): void {
    const documentCommentModeChanged =
      settings.documentCommentMode !== state.uiSettings.documentCommentMode;
    state.uiSettings = settings;
    services.persistence.setUiSettings(settings);

    if (
      !documentCommentModeChanged ||
      options.interactionProfile === 'text-comment' ||
      !state.active ||
      interactionProfileRestartQueued
    ) {
      return;
    }

    interactionProfileRestartQueued = true;
    void Promise.resolve().then(() => {
      interactionProfileRestartQueued = false;
      if (!state.active || settings.documentCommentMode !== state.uiSettings.documentCommentMode) {
        return;
      }

      if (state.panelOnlyMode) {
        stopPanelOnly();
        startPanelOnly();
        return;
      }

      stop();
      start();
    });
  }

  function shouldDelegateAiActionToHost(): boolean {
    return (
      typeof rawOptions.ui?.onHostToolbarAction === 'function' &&
      typeof options.ui.onHostToolbarAction === 'function'
    );
  }

  function buildHostSendToAgentAction(element?: Element | null): CommentaryHostToolbarAction {
    const meta = services.changes.getMetaForElement(element ?? null);
    const promptText = element ? buildSaveRunPromptForAgentElement(element) : '';
    return meta?.elementKey
      ? {
          type: 'send-to-agent',
          elementKey: meta.elementKey,
          locator: meta.locator,
          label: meta.label,
          promptText: promptText || undefined,
        }
      : { type: 'send-to-agent' };
  }

  function toExternalEditingTarget(meta: {
    elementKey: string;
    locator: ExternalEditingElementTarget['locator'];
    label: string;
  }): ExternalEditingElementTarget {
    return {
      elementKey: meta.elementKey,
      locator: meta.locator,
      label: meta.label,
    };
  }

  function canReuseAgentConversationForElement(element: Element | null): boolean {
    if (services.agentBridge.canReuseConversationForElement) {
      return services.agentBridge.canReuseConversationForElement(element);
    }
    return services.agentBridge.hasReusableConversation();
  }

  function buildSaveRunPromptForAgentElement(element: Element): string {
    const prompt = canReuseAgentConversationForElement(element)
      ? services.summaries.buildAppendSaveRunPromptForElement(element)
      : services.summaries.buildSaveRunPromptForElement(element);
    return appendImplicitAnnotationSkillToPrompt(
      prompt,
      options.interactionProfile === 'annotation',
      options.ui.commentarySkillSettingsConfigured
        ? options.ui.commentarySelectedSkillIds
        : undefined,
      options.ui.commentarySkillOptions,
    );
  }

  function createHostExternalEditingTaskRef(): {
    provider: string;
    requestId: string;
  } {
    return {
      provider: 'host',
      requestId: `host_ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  function resolveHostExternalEditingElement(target: ExternalEditingElementTarget): Element | null {
    try {
      const element = locateElement(target.locator);
      return element?.isConnected ? element : null;
    } catch {
      return null;
    }
  }

  function beginHostExternalEditing(targetRefs: ExternalEditingElementTarget[]): {
    taskRef: ReturnType<typeof createHostExternalEditingTaskRef>;
    targetRefs: ExternalEditingElementTarget[];
  } | null {
    if (
      !services.agentBridge.setExternalEditingStateByElementKey &&
      !services.agentBridge.setExternalEditingState
    ) {
      return null;
    }

    const validTargets = targetRefs.filter(
      (target) => String(target?.elementKey ?? '').trim() && target?.locator,
    );
    if (validTargets.length === 0) {
      return null;
    }

    const taskRef = createHostExternalEditingTaskRef();
    const appliedTargets: ExternalEditingElementTarget[] = [];
    for (const target of validTargets) {
      if (services.agentBridge.setExternalEditingStateByElementKey) {
        const task = services.agentBridge.setExternalEditingStateByElementKey(target, taskRef);
        if (task) {
          appliedTargets.push(target);
        }
        continue;
      }

      const element = resolveHostExternalEditingElement(target);
      if (element && services.agentBridge.setExternalEditingState) {
        const task = services.agentBridge.setExternalEditingState(element, taskRef);
        if (task) {
          appliedTargets.push(target);
        }
      }
    }

    if (appliedTargets.length === 0) {
      return null;
    }

    state.positionTracker?.forceUpdate(true);
    return { taskRef, targetRefs: appliedTargets };
  }

  function markHostExternalEditingError(
    editingRun: ReturnType<typeof beginHostExternalEditing>,
    errorMessage?: string,
  ): void {
    if (!editingRun) return;

    const taskRef = {
      ...editingRun.taskRef,
      ...(errorMessage ? { error: errorMessage, code: 'HOST_AI_ACTION_FAILED' } : {}),
    };

    for (const target of editingRun.targetRefs) {
      if (services.agentBridge.setExternalEditingTerminalStateByElementKey) {
        services.agentBridge.setExternalEditingTerminalStateByElementKey(target, 'error', taskRef);
        continue;
      }

      const element = resolveHostExternalEditingElement(target);
      if (!element) continue;
      if (services.agentBridge.setExternalEditingTerminalState) {
        services.agentBridge.setExternalEditingTerminalState(element, 'error', taskRef);
      } else {
        services.agentBridge.clearExternalEditingState?.(element, editingRun.taskRef);
      }
    }

    state.positionTracker?.forceUpdate(true);
  }

  let lastHostAiActionError: string | null = null;

  async function runHostAiAction(action: CommentaryHostToolbarAction): Promise<boolean> {
    if (!shouldDelegateAiActionToHost()) {
      return false;
    }
    lastHostAiActionError = null;
    try {
      return Boolean(await options.ui.onHostToolbarAction(action));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastHostAiActionError = message || 'AI 执行请求失败。';
      if (message) {
        services.feedback.toast('error', `AI 执行失败：${message}`);
      }
      return false;
    }
  }

  async function interruptVisibleTasksLocally(): Promise<boolean> {
    if (!services.agentBridge.interruptVisibleTasks) return false;
    try {
      await services.agentBridge.interruptVisibleTasks();
      return true;
    } catch {
      return false;
    }
  }

  function isEventWithinElement(event: Event, element: Element): boolean {
    try {
      if (typeof event.composedPath === 'function') {
        return event.composedPath().some((node) => node === element);
      }
    } catch {
      // Fall back to target checks below.
    }

    const target = event.target;
    return target instanceof Node && element.contains(target);
  }

  function shouldAllowInlineEditingPageEvent(event: Event): boolean {
    if (!inlineTextEditingElement || !inlineTextEditingElement.isConnected) {
      return false;
    }

    if (isEventWithinElement(event, inlineTextEditingElement)) {
      return true;
    }

    const activeElement = document.activeElement;
    if (!(activeElement instanceof Node) || !inlineTextEditingElement.contains(activeElement)) {
      return false;
    }

    return (
      event.type.startsWith('key') ||
      event.type === 'beforeinput' ||
      event.type === 'input' ||
      event.type === 'change' ||
      event.type.startsWith('composition') ||
      event.type === 'selectionchange'
    );
  }

  function sendCommentContextSync(element: Element | null, mode: 'append' | 'replace'): void {
    void services.agentBridge
      .handleSyncCommentContextToAgent(element, mode)
      .then(() => {
        if (mode === 'replace') {
          pendingCommentContextSync = false;
        }
      })
      .catch((error) => {
        pendingCommentContextSync = true;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${WEB_EDITOR_V2_LOG_PREFIX} Failed to sync comment context:`, message);
      });
  }

  function hasCommentContextToSync(): boolean {
    try {
      return (services.changes.buildCommentCommentsContext?.() ?? []).length > 0;
    } catch {
      return pendingCommentContextSync;
    }
  }

  function flushPendingCommentContextSync(): void {
    if (!options.agentBridge.enabled || !services.agentBridge.isAvailable()) {
      return;
    }
    if (!pendingCommentContextSync && !hasCommentContextToSync()) {
      return;
    }

    sendCommentContextSync(null, 'replace');
  }

  function syncCommentContextAfterNoteSave(element: Element | null, note: string): void {
    const mode = String(note ?? '').trim() ? 'append' : 'replace';
    if (!options.agentBridge.enabled) {
      return;
    }
    if (!services.agentBridge.isAvailable()) {
      pendingCommentContextSync = true;
      return;
    }

    sendCommentContextSync(element, mode);
  }

  async function handleDeleteCurrentAnnotationNode(element: Element): Promise<void> {
    const hostTarget = resolveAnnotationHostTarget(element);
    if (!hostTarget) return;
    if (options.host.onDeleteAnnotationNode) {
      await options.host.onDeleteAnnotationNode(hostTarget);
    } else if (onAnnotationMarkdownChange) {
      if (canEditAnnotationMarkdown?.(hostTarget) === false) return;
      await onAnnotationMarkdownChange(hostTarget, '');
    } else {
      return;
    }

    services.changes.clearElementEditMeta(element);
    services.persistence.flushPendingWrite('clear');
  }

  function resolvePromptTargetsFromEditHistory(): Element[] {
    const metas = Array.from(state.editMetaByKey.values())
      .filter(
        (meta) =>
          services.persistence.getCommentTaskState?.(meta.elementKey) !== 'completed' &&
          (meta.dirtySince !== null ||
            String(meta.note ?? '').trim() ||
            (Array.isArray(meta.images) && meta.images.length > 0)),
      )
      .sort((a, b) => Number(b.dirtySince ?? 0) - Number(a.dirtySince ?? 0));
    const elements: Element[] = [];
    const seen = new Set<Element>();

    for (const meta of metas) {
      try {
        const element = locateElement(meta.locator);
        if (element?.isConnected && !seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
      } catch {
        // Ignore stale locators and continue scanning the next edited element.
      }
    }

    return elements;
  }

  function resolvePromptTargetRefsFromEditHistory(): ExternalEditingElementTarget[] {
    return Array.from(state.editMetaByKey.values())
      .filter(
        (meta) =>
          services.persistence.getCommentTaskState?.(meta.elementKey) !== 'completed' &&
          (meta.dirtySince !== null ||
            String(meta.note ?? '').trim() ||
            (Array.isArray(meta.images) && meta.images.length > 0)),
      )
      .sort((a, b) => Number(b.dirtySince ?? 0) - Number(a.dirtySince ?? 0))
      .map(toExternalEditingTarget);
  }

  function resolvePromptTargetRefs(
    preferredElement?: Element | null,
  ): ExternalEditingElementTarget[] {
    const recoveredTargets = resolvePromptTargetRefsFromEditHistory();
    if (recoveredTargets.length > 0) {
      return recoveredTargets;
    }
    const fallbackElement = preferredElement?.isConnected
      ? preferredElement
      : state.selectedElement?.isConnected
        ? state.selectedElement
        : null;
    const fallbackMeta = fallbackElement
      ? services.changes.getMetaForElement(fallbackElement)
      : null;
    return fallbackMeta ? [toExternalEditingTarget(fallbackMeta)] : [];
  }

  function resolvePromptTargetRef(
    preferredElement?: Element | null,
  ): ExternalEditingElementTarget | null {
    const fallbackElement = preferredElement?.isConnected
      ? preferredElement
      : state.selectedElement?.isConnected
        ? state.selectedElement
        : null;
    const fallbackMeta = fallbackElement
      ? services.changes.getMetaForElement(fallbackElement)
      : null;
    if (fallbackMeta) {
      return toExternalEditingTarget(fallbackMeta);
    }
    return resolvePromptTargetRefsFromEditHistory()[0] ?? null;
  }

  function resolvePromptTargets(preferredElement?: Element | null): Element[] {
    const recoveredElements = resolvePromptTargetsFromEditHistory();
    if (recoveredElements.length > 0) {
      return recoveredElements;
    }
    if (preferredElement?.isConnected) {
      return [preferredElement];
    }
    if (state.selectedElement?.isConnected) {
      return [state.selectedElement];
    }
    return [];
  }

  function resolvePromptTarget(preferredElement?: Element | null): Element | null {
    if (preferredElement?.isConnected) {
      return preferredElement;
    }
    if (state.selectedElement?.isConnected) {
      return state.selectedElement;
    }
    return resolvePromptTargetsFromEditHistory()[0] ?? null;
  }

  function resolveVisibleRunningTaskTarget(): Element | null {
    const runningTasks = services.agentBridge
      .getVisibleTaskStates()
      .filter((task) => task.status === 'pending' || task.status === 'created')
      .sort((a, b) => Number(b.startedAt ?? 0) - Number(a.startedAt ?? 0));

    for (const task of runningTasks) {
      try {
        const element = locateElement(task.locator);
        if (element?.isConnected) {
          return element;
        }
      } catch {
        // Ignore stale running task locators and keep looking for another task.
      }
    }

    return null;
  }

  function resolveInterruptTarget(preferredElement?: Element | null): Element | null {
    const preferredTarget = resolvePromptTarget(preferredElement);
    if (preferredTarget && services.agentBridge.canInterruptElementTask(preferredTarget)) {
      return preferredTarget;
    }
    return resolveVisibleRunningTaskTarget();
  }

  function handleTransactionError(error: unknown): void {
    console.error(`${WEB_EDITOR_V2_LOG_PREFIX} Transaction apply error:`, error);
  }

  function dismissVisibleElementAgentTaskStates(target: 'completed' | 'all' = 'all'): void {
    const tasks = services.agentBridge.getVisibleTaskStates();
    for (const task of tasks) {
      if (target === 'completed' && task.status !== 'completed') {
        continue;
      }
      try {
        const element = locateElement(task.locator);
        if (!element?.isConnected) {
          continue;
        }
        services.agentBridge.dismissElementTaskState(element);
      } catch {
        // Ignore stale locators while clearing visible task states.
      }
    }
  }

  function getClearableElementCount(): number {
    const clearableElementKeys = new Set<string>();

    for (const meta of state.editMetaByKey.values()) {
      if (meta.dirtySince !== null) {
        clearableElementKeys.add(meta.elementKey);
      }
    }

    for (const task of services.agentBridge.getVisibleTaskStates()) {
      if (task.status === 'completed' || task.status === 'error') {
        clearableElementKeys.add(task.elementKey);
      }
    }

    return clearableElementKeys.size;
  }

  function hasPrototypeComments(): boolean {
    const document = services.persistence.getPersistedPrototypeCommentsDocument?.() ?? null;
    return Boolean(document && (document.comments.length > 0 || document.images.length > 0));
  }

  function getTweakProtocol() {
    return getGlobalCommentaryTweakProtocol();
  }

  function cleanupMountedRuntime(): void {
    inlineTextEditingElement = null;
    services.conversationTaskMonitor?.stop();
    services.integrationWs?.stop();
    services.agentBridge.stop();

    routeChangeCleanup?.();
    routeChangeCleanup = null;

    state.uiResizeCleanup?.();
    state.uiResizeCleanup = null;

    state.propertyPanel?.dispose();
    state.propertyPanel = null;

    state.tokensService?.dispose();
    state.tokensService = null;

    state.breadcrumbs?.dispose();
    state.breadcrumbs = null;

    state.eventController?.dispose();
    state.eventController = null;

    state.commentShortcutCleanup?.();
    state.commentShortcutCleanup = null;

    if (state.textCommentTargetElement) {
      state.textCommentTargetElement.remove();
      state.textCommentTargetElement = null;
    }

    state.dragReorderController?.dispose();
    state.dragReorderController = null;

    state.handlesController?.dispose();
    state.handlesController = null;

    state.parentSelectController?.dispose();
    state.parentSelectController = null;

    state.parentSelectHotkeyCleanup?.();
    state.parentSelectHotkeyCleanup = null;

    state.transactionManager?.dispose();
    state.transactionManager = null;

    state.positionTracker?.dispose();
    state.positionTracker = null;

    state.selectionEngine?.dispose();
    state.selectionEngine = null;

    state.perfHotkeyCleanup?.();
    state.perfHotkeyCleanup = null;

    state.selectionModeHotkeyCleanup?.();
    state.selectionModeHotkeyCleanup = null;

    state.perfMonitor?.dispose();
    state.perfMonitor = null;

    state.canvasOverlay?.dispose();
    state.canvasOverlay = null;

    state.shadowHost?.dispose();
    state.shadowHost = null;

    clearEditorRuntimeRefs(state);
  }

  function installPerfHotkey(): void {
    const handler = (event: KeyboardEvent): void => {
      if (event.repeat) return;

      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || !event.shiftKey || event.altKey) return;

      const key = (event.key || '').toLowerCase();
      if (key !== 'p') return;

      const monitor = state.perfMonitor;
      if (!monitor) return;

      monitor.toggle();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const hotkeyOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    window.addEventListener('keydown', handler, hotkeyOptions);
    state.perfHotkeyCleanup = () => {
      window.removeEventListener('keydown', handler, hotkeyOptions);
    };
  }

  function isSelectionModeToggleShortcut(event: KeyboardEvent): boolean {
    const isMod = event.metaKey || event.ctrlKey;
    if (!isMod || event.altKey || event.shiftKey) return false;

    const key = (event.key || '').toLowerCase();
    return key === 's';
  }

  type ParentNavigationAction = 'select-parent' | 'return-previous';

  function getParentNavigationAction(event: KeyboardEvent): ParentNavigationAction | null {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return null;
    }
    if (event.key === 'ArrowUp') return 'select-parent';
    if (event.key === 'ArrowDown') return 'return-previous';
    return null;
  }

  const PARENT_SELECT_EDITABLE_SELECTOR =
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const PARENT_SELECT_INPUT_TOUCHED_ATTR = 'data-we-parent-select-input-touched';

  function isTextualInputType(type: string | null | undefined): boolean {
    const normalizedType = (type || 'text').toLowerCase();
    return ['', 'email', 'password', 'search', 'tel', 'text', 'url'].includes(normalizedType);
  }

  function isEmptyTextEntryControl(control: HTMLElement): boolean {
    if (!isTextEntryControl(control)) return false;
    return getTextEntryControlValue(control).length === 0;
  }

  function isTextEntryControl(control: HTMLElement): boolean {
    const tagName = control.tagName.toLowerCase();

    if (tagName === 'textarea') {
      return true;
    }

    if (tagName === 'input') {
      return isTextualInputType((control as HTMLInputElement).type);
    }

    return control.isContentEditable;
  }

  function getTextEntryControlValue(control: HTMLElement): string {
    const tagName = control.tagName.toLowerCase();
    if (tagName === 'textarea') return (control as HTMLTextAreaElement).value ?? '';
    if (tagName === 'input') return (control as HTMLInputElement).value ?? '';
    return control.textContent ?? '';
  }

  function getParentSelectEditableControlFromNode(node: EventTarget | null): HTMLElement | null {
    if (typeof HTMLElement === 'undefined' || !(node instanceof HTMLElement)) {
      return null;
    }
    if (node.isContentEditable) return node;
    if (typeof node.matches === 'function' && node.matches(PARENT_SELECT_EDITABLE_SELECTOR)) {
      return node;
    }
    const nearestControl =
      typeof node.closest === 'function' ? node.closest(PARENT_SELECT_EDITABLE_SELECTOR) : null;
    if (!(nearestControl instanceof HTMLElement)) {
      return null;
    }
    return nearestControl;
  }

  function getParentSelectEditableControl(event: Event): HTMLElement | null {
    if (typeof event.composedPath === 'function') {
      try {
        for (const node of event.composedPath()) {
          const control = getParentSelectEditableControlFromNode(node);
          if (control) return control;
        }
      } catch {
        // Fall back to the retargeted event target below.
      }
    }

    return getParentSelectEditableControlFromNode(event.target);
  }

  function shouldBlockParentSelectEvent(event: KeyboardEvent, eventFromEditorUi: boolean): boolean {
    const editableControl = getParentSelectEditableControl(event);
    if (editableControl) {
      if (!isTextEntryControl(editableControl)) return true;
      if (eventFromEditorUi) {
        return editableControl.getAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR) === 'true';
      }
      return !isEmptyTextEntryControl(editableControl);
    }
    return eventFromEditorUi;
  }

  function markParentSelectTextEntryControlTouched(event: Event): void {
    const editableControl = getParentSelectEditableControl(event);
    if (!editableControl || !isTextEntryControl(editableControl)) return;
    editableControl.setAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR, 'true');
  }

  function markParentSelectTextEntryControlUntouched(event: Event): void {
    const editableControl = getParentSelectEditableControl(event);
    if (!editableControl || !isTextEntryControl(editableControl)) return;
    editableControl.setAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR, 'false');
  }

  function describeHotkeyTarget(target: EventTarget | null): string {
    if (typeof Element === 'undefined' || !(target instanceof Element)) {
      return target ? Object.prototype.toString.call(target) : 'null';
    }

    const tagName = target.tagName.toLowerCase();
    const id = target.id ? `#${target.id}` : '';
    const className =
      typeof target.className === 'string'
        ? target.className
            .trim()
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 3)
            .map((name) => `.${name}`)
            .join('')
        : '';
    const role = target.getAttribute('role');
    return `${tagName}${id}${className}${role ? `[role="${role}"]` : ''}`;
  }

  function cloneSelectionModeHotkeyDebug(
    debug: SelectionModeHotkeyDebugApi,
  ): SelectionModeHotkeyDebugSnapshot {
    return {
      installed: debug.installed,
      installCount: debug.installCount,
      shortcut: debug.shortcut,
      receivedCount: debug.receivedCount,
      matchedCount: debug.matchedCount,
      ignoredRepeatCount: debug.ignoredRepeatCount,
      ignoredMismatchCount: debug.ignoredMismatchCount,
      ignoredEditorUiCount: debug.ignoredEditorUiCount,
      triggerCount: debug.triggerCount,
      lastEvent: debug.lastEvent ? { ...debug.lastEvent } : null,
      lastAction: debug.lastAction ? { ...debug.lastAction } : null,
    };
  }

  function getSelectionModeHotkeyDebug(): SelectionModeHotkeyDebugApi | null {
    if (typeof window === 'undefined') return null;
    const globalWindow = window as SelectionModeHotkeyDebugWindow;
    const existing = globalWindow.__AXHUB_SELECTION_HOTKEY_DEBUG__;
    if (existing) {
      existing.installed = true;
      existing.installCount += 1;
      return existing;
    }

    const debug: SelectionModeHotkeyDebugApi = {
      installed: true,
      installCount: 1,
      shortcut: SELECTION_MODE_HOTKEY_SHORTCUT_LABEL,
      receivedCount: 0,
      matchedCount: 0,
      ignoredRepeatCount: 0,
      ignoredMismatchCount: 0,
      ignoredEditorUiCount: 0,
      triggerCount: 0,
      lastEvent: null,
      lastAction: null,
      reset() {
        this.receivedCount = 0;
        this.matchedCount = 0;
        this.ignoredRepeatCount = 0;
        this.ignoredMismatchCount = 0;
        this.ignoredEditorUiCount = 0;
        this.triggerCount = 0;
        this.lastEvent = null;
        this.lastAction = null;
      },
      snapshot() {
        return cloneSelectionModeHotkeyDebug(this);
      },
    };
    globalWindow.__AXHUB_SELECTION_HOTKEY_DEBUG__ = debug;
    return debug;
  }

  function recordSelectionModeHotkeyEvent(
    debug: SelectionModeHotkeyDebugApi | null,
    event: KeyboardEvent,
    decision: SelectionModeHotkeyDebugDecision,
  ): void {
    if (!debug) return;
    debug.lastEvent = {
      at: Date.now(),
      key: event.key || '',
      code: event.code || '',
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      target: describeHotkeyTarget(event.target),
      decision,
    };
  }

  function installSelectionModeHotkey(): void {
    state.selectionModeHotkeyCleanup?.();
    state.selectionModeHotkeyCleanup = null;
    const debug = getSelectionModeHotkeyDebug();

    const handler = (event: KeyboardEvent): void => {
      debug && (debug.receivedCount += 1);
      recordSelectionModeHotkeyEvent(debug, event, 'received');
      if (event.repeat) {
        debug && (debug.ignoredRepeatCount += 1);
        recordSelectionModeHotkeyEvent(debug, event, 'ignored-repeat');
        return;
      }
      if (!isSelectionModeToggleShortcut(event)) {
        debug && (debug.ignoredMismatchCount += 1);
        recordSelectionModeHotkeyEvent(debug, event, 'ignored-shortcut-mismatch');
        return;
      }
      debug && (debug.matchedCount += 1);
      if (state.shadowHost?.isEventFromUi(event)) {
        debug && (debug.ignoredEditorUiCount += 1);
        recordSelectionModeHotkeyEvent(debug, event, 'ignored-editor-ui');
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      debug && (debug.triggerCount += 1);
      recordSelectionModeHotkeyEvent(debug, event, 'triggered');
      const action: SelectionModeHotkeyDebugAction = {
        at: Date.now(),
        hasPropertyPanel: Boolean(state.propertyPanel?.runHostToolbarAction),
        pending: true,
        result: null,
        error: null,
      };
      if (debug) {
        debug.lastAction = action;
      }
      void Promise.resolve(
        state.propertyPanel?.runHostToolbarAction?.({
          type: 'toggle-selection-mode',
        }) ?? false,
      )
        .then((result) => {
          action.pending = false;
          action.result = Boolean(result);
        })
        .catch((error) => {
          action.pending = false;
          action.result = false;
          action.error = error instanceof Error ? error.message : String(error);
        });
    };

    const hotkeyOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    window.addEventListener('keydown', handler, hotkeyOptions);
    state.selectionModeHotkeyCleanup = () => {
      window.removeEventListener('keydown', handler, hotkeyOptions);
      if (debug) {
        debug.installed = false;
      }
    };
  }

  function installParentSelectHotkey(): void {
    state.parentSelectHotkeyCleanup?.();
    state.parentSelectHotkeyCleanup = null;

    const handler = (event: KeyboardEvent): void => {
      if (!state.active) return;
      const action = getParentNavigationAction(event);
      if (!action) return;
      const eventFromEditorUi = state.shadowHost?.isEventFromUi(event) ?? false;
      if (shouldBlockParentSelectEvent(event, eventFromEditorUi)) return;

      const didNavigate =
        action === 'select-parent'
          ? (state.parentSelectController?.selectParent() ?? false)
          : (state.parentSelectController?.selectPrevious() ?? false);
      if (!didNavigate) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const hotkeyOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    const inputStateOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    window.addEventListener('keydown', handler, hotkeyOptions);
    window.addEventListener(
      'focusin',
      markParentSelectTextEntryControlUntouched,
      inputStateOptions,
    );
    window.addEventListener('input', markParentSelectTextEntryControlTouched, inputStateOptions);
    state.parentSelectHotkeyCleanup = () => {
      window.removeEventListener('keydown', handler, hotkeyOptions);
      window.removeEventListener(
        'focusin',
        markParentSelectTextEntryControlUntouched,
        inputStateOptions,
      );
      window.removeEventListener(
        'input',
        markParentSelectTextEntryControlTouched,
        inputStateOptions,
      );
    };
  }

  function installUiResizeClamp(): void {
    let uiResizeRafId: number | null = null;
    let markerViewportSyncRafId: number | null = null;

    const clampFloatingUi = (): void => {
      if (state.propertyPanel && state.propertyPanelPosition) {
        state.propertyPanel.setPosition(state.propertyPanelPosition);
      }
    };

    const onWindowResize = (): void => {
      if (!state.active || uiResizeRafId !== null) return;
      uiResizeRafId = window.requestAnimationFrame(() => {
        uiResizeRafId = null;
        clampFloatingUi();
      });
    };

    const syncChangeMarkersToViewport = (): void => {
      if (!state.active || markerViewportSyncRafId !== null) return;
      markerViewportSyncRafId = window.requestAnimationFrame(() => {
        markerViewportSyncRafId = null;
        services.changes.renderChangeMarkers();
      });
    };

    const canListenOnDocument = typeof document?.addEventListener === 'function';

    window.addEventListener('resize', onWindowResize, { passive: true });
    window.addEventListener('resize', syncChangeMarkersToViewport, {
      passive: true,
    });
    window.addEventListener('scroll', syncChangeMarkersToViewport, {
      passive: true,
      capture: true,
    });
    if (canListenOnDocument) {
      document.addEventListener('scroll', syncChangeMarkersToViewport, {
        passive: true,
        capture: true,
      });
    }
    state.uiResizeCleanup = () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('resize', syncChangeMarkersToViewport);
      window.removeEventListener('scroll', syncChangeMarkersToViewport, true);
      if (canListenOnDocument) {
        document.removeEventListener('scroll', syncChangeMarkersToViewport, true);
      }
      if (uiResizeRafId !== null) {
        window.cancelAnimationFrame(uiResizeRafId);
        uiResizeRafId = null;
      }
      if (markerViewportSyncRafId !== null) {
        window.cancelAnimationFrame(markerViewportSyncRafId);
        markerViewportSyncRafId = null;
      }
    };

    clampFloatingUi();
  }

  function installRouteChangeRefresh(): void {
    if (routeChangeCleanup || typeof window === 'undefined') return;
    const routeChangeEventType = 'axhub-web-editor-route-change';
    let routeChangeRafId: number | null = null;
    const historyRef = window.history;
    const originalPushState = historyRef?.pushState;
    const originalReplaceState = historyRef?.replaceState;
    let wrappedPushState: History['pushState'] | null = null;
    let wrappedReplaceState: History['replaceState'] | null = null;

    const scheduleRouteRefresh = (): void => {
      if (!state.active || routeChangeRafId !== null) return;
      routeChangeRafId = window.requestAnimationFrame(() => {
        routeChangeRafId = null;
        services.interaction.clearSelection();
        state.hoveredElement = null;
        state.selectionAnchor = null;
        state.pendingMarkerAnchors.clear();
        void Promise.resolve(services.persistence.restoreCachedChanges())
          .then((deletedElementKeys) => {
            services.agentBridge.discardDeletedElementStates?.(deletedElementKeys);
            services.conversationTaskMonitor?.reconcile();
            services.changes.renderChangeMarkers();
            state.propertyPanel?.refresh();
            onStatusChange?.();
          })
          .catch((error) => {
            console.warn(
              `${WEB_EDITOR_V2_LOG_PREFIX} Failed to refresh comments after route change:`,
              error,
            );
            services.changes.renderChangeMarkers();
          });
      });
    };

    const dispatchRouteChange = (): void => {
      window.dispatchEvent(new Event(routeChangeEventType));
    };

    if (historyRef && typeof originalPushState === 'function') {
      wrappedPushState = function pushState(
        this: History,
        data: unknown,
        unused: string,
        url?: string | URL | null,
      ) {
        const result = originalPushState.call(this, data, unused, url);
        dispatchRouteChange();
        return result;
      } as History['pushState'];
      historyRef.pushState = wrappedPushState;
    }

    if (historyRef && typeof originalReplaceState === 'function') {
      wrappedReplaceState = function replaceState(
        this: History,
        data: unknown,
        unused: string,
        url?: string | URL | null,
      ) {
        const result = originalReplaceState.call(this, data, unused, url);
        dispatchRouteChange();
        return result;
      } as History['replaceState'];
      historyRef.replaceState = wrappedReplaceState;
    }

    window.addEventListener('hashchange', scheduleRouteRefresh);
    window.addEventListener('popstate', scheduleRouteRefresh);
    window.addEventListener(routeChangeEventType, scheduleRouteRefresh);

    routeChangeCleanup = () => {
      window.removeEventListener('hashchange', scheduleRouteRefresh);
      window.removeEventListener('popstate', scheduleRouteRefresh);
      window.removeEventListener(routeChangeEventType, scheduleRouteRefresh);
      if (routeChangeRafId !== null) {
        window.cancelAnimationFrame(routeChangeRafId);
        routeChangeRafId = null;
      }
      if (historyRef && wrappedPushState && historyRef.pushState === wrappedPushState) {
        historyRef.pushState = originalPushState;
      }
      if (historyRef && wrappedReplaceState && historyRef.replaceState === wrappedReplaceState) {
        historyRef.replaceState = originalReplaceState;
      }
    };
  }

  function start(): void {
    if (state.active && !state.panelOnlyMode) {
      console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Already active`);
      return;
    }

    // Upgrading from panel-only → full mode: reuse existing shadow host & UI.
    const upgradingFromPanelOnly = state.active && state.panelOnlyMode;
    if (upgradingFromPanelOnly) {
      try {
        upgradeFromPanelOnly();
        return;
      } catch (error) {
        console.error(`${WEB_EDITOR_V2_LOG_PREFIX} Failed to upgrade from panel-only:`, error);
        // Fall through to a clean full start below.
        cleanupMountedRuntime();
        state.active = false;
        state.panelOnlyMode = false;
      }
    }

    try {
      resetEditorTransientState(state);

      state.shadowHost = mountShadowHost({});
      const elements = state.shadowHost.getElements();
      if (!elements?.overlayRoot) {
        throw new Error('Shadow host overlayRoot not available');
      }

      const ensureMarkersVisible = (): void => {
        if (state.changeMarkersVisible) return;
        state.changeMarkersVisible = true;
        services.persistence.setMarkerVisibility(true);
      };

      state.changeMarkersVisible = services.persistence.readMarkerVisibility();
      ensureMarkersVisible();
      state.commentShortcutSettings = services.persistence.readCommentShortcutSettings();
      state.uiSettings = {
        ...services.persistence.readUiSettings(),
        darkMode: options.ui.initialDarkMode,
      };

      const markerLayer = document.createElement('div');
      markerLayer.className = 'we-change-markers';
      markerLayer.hidden = true;
      elements.uiRoot.append(markerLayer);
      state.markerLayer = markerLayer;

      state.canvasOverlay = createCanvasOverlay({
        container: elements.overlayRoot,
      });

      state.perfMonitor = createPerfMonitor({
        container: elements.overlayRoot,
        fpsUiIntervalMs: 500,
        memorySampleIntervalMs: 1000,
      });
      installPerfHotkey();

      const interactionProfile = resolveActiveInteractionProfile();
      const isTextComment = interactionProfile === 'text-comment';
      const initialSelectionModeActive = !isTextComment && options.ui.initialSelectionModeActive;

      if (isTextComment) {
        const textCommentTarget = document.createElement('div');
        textCommentTarget.setAttribute(TEXT_COMMENT_TARGET_ATTR, 'true');
        textCommentTarget.setAttribute('aria-hidden', 'true');
        Object.assign(textCommentTarget.style, {
          position: 'fixed',
          left: '0px',
          top: '0px',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none',
          userSelect: 'none',
        });
        elements.overlayRoot.append(textCommentTarget);
        state.textCommentTargetElement = textCommentTarget;

        state.textCommentManager = createTextCommentManager({
          isOverlayElement: state.shadowHost.isOverlayElement,
        });
        state.selectionEngine = null;
      } else {
        state.selectionEngine = createSelectionEngine({
          isOverlayElement: state.shadowHost.isOverlayElement,
        });
        state.textCommentManager = null;
        state.textCommentTargetElement = null;
      }

      state.positionTracker = createPositionTracker({
        onPositionUpdate: services.interaction.handlePositionUpdate,
      });

      state.commentShortcutCleanup = null;

      state.transactionManager = createTransactionManager({
        enableKeyBindings: true,
        isEventFromEditorUi: (event) => {
          return Boolean(state.shadowHost?.isEventFromUi(event));
        },
        onChange: services.interaction.handleTransactionChange,
        onApplyError: handleTransactionError,
      });

      void Promise.resolve(services.persistence.restoreCachedChanges())
        .then((deletedElementKeys) => {
          services.agentBridge.discardDeletedElementStates?.(deletedElementKeys);
          services.agentBridge.rehydratePersistedAgentState();
          services.conversationTaskMonitor?.reconcile();
          ensureMarkersVisible();
          state.propertyPanel?.refresh();
          onStatusChange?.();
        })
        .catch((error) => {
          console.warn(`${WEB_EDITOR_V2_LOG_PREFIX} Failed to restore cached changes:`, error);
          services.agentBridge.rehydratePersistedAgentState();
          ensureMarkersVisible();
        });

      state.handlesController = createHandlesController({
        container: elements.overlayRoot,
        canvasOverlay: state.canvasOverlay,
        transactionManager: state.transactionManager,
        positionTracker: state.positionTracker,
      });

      state.parentSelectController = createParentSelectCorner({
        container: elements.overlayRoot,
        getParentCandidate: (element) => state.selectionEngine?.getParentCandidate(element) ?? null,
        onNavigate: (target) => {
          if (services.agentBridge.isElementInteractionLocked(target)) return false;
          const rect = target.getBoundingClientRect();
          const clientX = Number.isFinite(rect.left) ? rect.left + rect.width / 2 : undefined;
          const clientY = Number.isFinite(rect.top)
            ? rect.top + Math.min(18, Math.max(10, rect.height / 2))
            : undefined;

          void services.interaction.handleSelect(
            target,
            {
              alt: false,
              shift: false,
              ctrl: false,
              meta: false,
            },
            clientX !== undefined && clientY !== undefined ? { clientX, clientY } : undefined,
          );
          return true;
        },
      });

      state.eventController = createEventController({
        isOverlayElement: state.shadowHost.isOverlayElement,
        shouldAllowPageEvent: (event) =>
          Boolean(options.host.shouldAllowPageEvent?.(event)) ||
          shouldAllowInlineEditingPageEvent(event),
        allowNativeTextSelection: isTextComment,
        onHover: services.interaction.handleHover,
        onSelect: (event) => {
          const target = services.agentBridge.resolveSelectableElement(event.element);
          if (!target?.isConnected) return;
          void services.interaction.handleSelect(target, event.modifiers, {
            clientX: event.clientX,
            clientY: event.clientY,
          });
        },
        onDoubleClickSelected: isTextComment
          ? undefined
          : (event) => {
              if (!services.textSession.isEditable(event.element)) return;
              if (services.agentBridge.isElementInteractionLocked(event.element)) return;
              state.breadcrumbs?.enterInlineTextEdit?.();
              state.propertyPanel?.enterInlineTextEdit?.();
            },
        onDeselect: services.interaction.handleDeselect,
        resolveTargetForHover: isTextComment
          ? undefined
          : (target) => services.agentBridge.resolveSelectableElement(target),
        findTargetForSelect: isTextComment
          ? undefined
          : (_x, _y, modifiers, event) => {
              const target =
                state.selectionEngine?.findBestTargetFromEvent(event, modifiers) ?? null;
              return services.agentBridge.resolveSelectableElement(target);
            },
        getSelectedElement: () => state.selectedElement,
        isElementInteractionLocked: (element) =>
          services.agentBridge.isElementInteractionLocked(element),
      });
      if (!initialSelectionModeActive) {
        state.eventController.setMode('interaction', {
          allowPageInteraction: true,
        });
        state.selectionChromeVisible = false;
      }

      // Text-comment mode: listen for mouseup to commit text selections
      if (isTextComment && state.textCommentManager) {
        const textCommentManager = state.textCommentManager;
        let pendingTextSelectionCommitTimer: number | null = null;
        const queueTextSelectionCommit = (): void => {
          // Delay slightly so the browser has finished updating the selection.
          // Listen to both pointerup and mouseup because some environments
          // reliably emit only one of them for drag-selection completion.
          if (pendingTextSelectionCommitTimer !== null) {
            window.clearTimeout(pendingTextSelectionCommitTimer);
          }
          pendingTextSelectionCommitTimer = window.setTimeout(() => {
            pendingTextSelectionCommitTimer = null;
            const comment = textCommentManager.commitSelection();
            if (!comment) return;

            state.activeTextComment = comment;

            const usedNativeHighlight = textCommentManager.setActiveHighlight(comment);
            state.canvasOverlay?.setTextHighlightRects(
              usedNativeHighlight ? null : comment.clientRects,
            );
            state.canvasOverlay?.render();

            // Compute an anchor for the bubble card from the bounding rect
            const rect = comment.boundingRect;
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top;

            // Create a virtual "container element" reference using commonAncestorContainer
            // and enter the comment flow via the standard interaction service
            services.interaction.enterTextComment(comment, {
              clientX,
              clientY,
            });
          }, 10);
        };

        window.addEventListener('pointerup', queueTextSelectionCommit, {
          capture: true,
        });
        window.addEventListener('mouseup', queueTextSelectionCommit, {
          capture: true,
        });
        state.commentShortcutCleanup = () => {
          if (pendingTextSelectionCommitTimer !== null) {
            window.clearTimeout(pendingTextSelectionCommitTimer);
            pendingTextSelectionCommitTimer = null;
          }
          window.removeEventListener('pointerup', queueTextSelectionCommit, {
            capture: true,
          });
          window.removeEventListener('mouseup', queueTextSelectionCommit, {
            capture: true,
          });
        };
      }

      if (options.ui.propertyPanel) {
        state.tokensService = createDesignTokensService();
      } else {
        state.tokensService = null;
      }

      if (options.ui.propertyPanel || options.ui.breadcrumbs) {
        const selectElementWithCenterAnchor = (element: Element): void => {
          if (!element.isConnected) return;
          const rect = element.getBoundingClientRect();
          const clientX = Number.isFinite(rect.left) ? rect.left + rect.width / 2 : undefined;
          const clientY = Number.isFinite(rect.top)
            ? rect.top + Math.min(18, Math.max(10, rect.height / 2))
            : undefined;

          void services.interaction.handleSelect(
            element,
            {
              alt: false,
              shift: false,
              ctrl: false,
              meta: false,
            },
            clientX !== undefined && clientY !== undefined ? { clientX, clientY } : undefined,
          );
        };

        const propertyPanelOptions: PropertyPanelOptions = {
          container: elements.uiRoot,
          transactionManager: state.transactionManager,
          tokensService: state.tokensService ?? undefined,
          initialPosition: state.propertyPanelPosition,
          initialUiMode: state.commentEntryMode,
          onPositionChange: (position) => {
            state.propertyPanelPosition = position;
          },
          getUiMode: () => state.commentEntryMode,
          onUiModeChange: (mode) => {
            state.commentEntryMode = mode;
            state.positionTracker?.forceUpdate(true);
            services.changes.renderChangeMarkers();
          },
          getCommentShortcutSettings: () => state.commentShortcutSettings,
          onCommentShortcutSettingsChange: (settings) => {
            state.commentShortcutSettings = settings;
            services.persistence.setCommentShortcutSettings(settings);
          },
          getUiSettings: () => state.uiSettings,
          interactionProfile,
          documentCommentModeAvailable: options.interactionProfile !== 'text-comment',
          pageEditingSettingsAvailable: options.ui.pageEditingSettingsAvailable,
          onUiSettingsChange: handleUiSettingsChange,
          onLocateElement: (element) => {
            const target = services.agentBridge.resolveSelectableElement(element) ?? element;
            if (!target?.isConnected) return;
            services.interaction.clearSelection();
            state.eventController?.setMode('hover');
            state.eventController?.setProgrammaticHoverElement(target);
            services.interaction.handleHover(target);
          },
          onCommentShortcutDialogOpenChange: (open) => {
            state.commentShortcutDialogOpen = open;
          },
          onUndo: () => state.transactionManager?.undo(),
          onRedo: () => state.transactionManager?.redo(),
          onCopyPrompt: services.localActions.handleCopyPrompt,
          onEnableAnnotation: options.ui.onEnableAnnotation,
          getAnnotationEnabled: options.ui.getAnnotationEnabled,
          getAnnotationEnableAvailable: options.ui.getAnnotationEnableAvailable,
          getAnnotationEnableLoading: options.ui.getAnnotationEnableLoading,
          markdownSourceEditorAvailable: options.ui.markdownSourceEditorAvailable,
          getMarkdownSourceEditorOpen: options.ui.getMarkdownSourceEditorOpen,
          onMarkdownSourceEditorOpenChange: options.ui.onMarkdownSourceEditorOpenChange,
          onWakeAgent: shouldDelegateAiActionToHost()
            ? () => runHostAiAction({ type: 'wake-agent' })
            : options.agentBridge.allowWake !== false
              ? async () => {
                  try {
                    return await services.agentBridge.requestWake();
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (message) {
                      services.feedback.toast('warning', message);
                    }
                    return false;
                  }
                }
              : undefined,
          onSendPromptToAgent: async (element) => {
            if (shouldDelegateAiActionToHost()) {
              const targetRefs = resolvePromptTargetRefs(element);
              const editingRun = beginHostExternalEditing(targetRefs);
              const handled = await runHostAiAction(buildHostSendToAgentAction(element));
              if (!handled) {
                const message = lastHostAiActionError || '宿主暂未处理 AI 执行请求。';
                markHostExternalEditingError(editingRun, message);
                throw new Error(message);
              }
              return;
            }
            const targetElements = resolvePromptTargets(element);
            if (targetElements.length === 0) {
              throw new Error('当前没有可发送给 AI 的编辑元素。');
            }
            try {
              await services.agentBridge.handleSendPromptToAgentForElements(
                targetElements,
                buildSaveRunPromptForAgentElement,
              );
            } finally {
              state.positionTracker?.forceUpdate(true);
            }
          },
          onSendCurrentElementPromptToAgent: async (element) => {
            if (shouldDelegateAiActionToHost()) {
              const targetRef = resolvePromptTargetRef(element);
              const editingRun = beginHostExternalEditing(targetRef ? [targetRef] : []);
              const handled = await runHostAiAction(buildHostSendToAgentAction(element));
              if (!handled) {
                const message = lastHostAiActionError || '宿主暂未处理 AI 执行请求。';
                markHostExternalEditingError(editingRun, message);
                throw new Error(message);
              }
              return;
            }
            if (!element?.isConnected) {
              throw new Error('当前元素已失效，请重新选择后再试。');
            }
            const prompt = buildSaveRunPromptForAgentElement(element);
            if (!prompt) {
              throw new Error('当前元素没有可发送给 AI 的编辑。');
            }
            try {
              await services.agentBridge.handleSendPromptToAgentForElement(element, prompt);
            } finally {
              state.positionTracker?.forceUpdate(true);
            }
          },
          onAbortAgentPrompt: async (element) => {
            if (shouldDelegateAiActionToHost()) {
              const locallyInterrupted =
                element === null ? await interruptVisibleTasksLocally() : false;
              const handled = await runHostAiAction({
                type: 'interrupt-agent',
              });
              if (!handled && !locallyInterrupted) {
                throw new Error(lastHostAiActionError || '宿主暂未处理 AI 终止请求。');
              }
              return;
            }
            if (element === null) {
              if (services.agentBridge.interruptVisibleTasks) {
                await services.agentBridge.interruptVisibleTasks();
                return;
              }
              const targetElement = resolveVisibleRunningTaskTarget();
              if (!targetElement) {
                throw new Error('当前没有可中断的 AI 编辑元素。');
              }
              await services.agentBridge.interruptElementTask(targetElement);
              return;
            }
            const targetElement = resolveInterruptTarget(element);
            if (!targetElement) {
              throw new Error('当前没有可中断的 AI 编辑元素。');
            }
            await services.agentBridge.interruptElementTask(targetElement);
          },
          onRequestClose: services.interaction.clearSelection,
          onRequestFullExit: options.ui.onRequestFullExit,
          onClearEdits: async (clearOptions) => {
            const clearedTarget = await services.localActions.handleClearEdits(clearOptions);
            if (!clearedTarget) return null;
            if (clearedTarget === 'all') {
              services.agentBridge.invalidateCurrentConversation?.();
            }
            dismissVisibleElementAgentTaskStates(clearedTarget);
            return clearedTarget;
          },
          hasPrototypeComments,
          onClearCurrentElementEdits: async (element) => {
            const didClear = await services.localActions.handleClearElementEdits(element);
            if (didClear) {
              services.agentBridge.dismissElementTaskState(element, {
                includeRunning: true,
              });
            }
            return didClear;
          },
          onDeleteCurrentAnnotationNode:
            options.host.onDeleteAnnotationNode || options.host.onAnnotationMarkdownChange
              ? handleDeleteCurrentAnnotationNode
              : undefined,
          getCopyPromptBlockReason: services.summaries.getCopyPromptBlockReason,
          showCopyPromptAction: options.ui.showCopyPromptAction,
          toolbarMode: options.ui.toolbarMode,
          hideExecutionControls: options.ui.hideExecutionControls,
          hideCurrentElementExecutionAction: options.ui.hideCurrentElementExecutionAction,
          hostSurfaceVisibilityControl: options.ui.hostSurfaceVisibilityControl,
          aiExecutionConfigSummary: options.ui.aiExecutionConfigSummary,
          aiExecutionConfigConfigured: options.ui.aiExecutionConfigConfigured,
          aiExecutionProvider: options.ui.aiExecutionProvider,
          aiExecutionWorkspacePath: options.ui.aiExecutionWorkspacePath,
          aiExecutionRunConcurrency: options.ui.aiExecutionRunConcurrency,
          aiExecutionProviderOptions: options.ui.aiExecutionProviderOptions,
          htmlFileSaveEnabled: options.ui.htmlFileSaveEnabled,
          getAcpUiConnected: options.ui.getAcpUiConnected,
          onHostToolbarAction: options.ui.onHostToolbarAction,
          externalEditingStatusDescription: options.ui.externalEditingStatusDescription,
          skillInstallSource: options.ui.skillInstallSource,
          commentarySkillOptions: options.ui.commentarySkillOptions,
          commentarySelectedSkillIds: options.ui.commentarySelectedSkillIds,
          commentarySkillSettingsConfigured: options.ui.commentarySkillSettingsConfigured,
          getAgentBridgeAvailable: () => services.agentBridge.isAvailable(),
          getAgentBridgeConnected: () => services.agentBridge.isConnected(),
          getCanAbortAgentPrompt: (element) => {
            if (element === null) {
              return (
                services.agentBridge.canInterruptVisibleTasks?.() ??
                services.agentBridge.canInterruptElementTask(resolveVisibleRunningTaskTarget())
              );
            }
            return services.agentBridge.canInterruptElementTask(resolveInterruptTarget(element));
          },
          getHasReusableAgentConversation: () => services.agentBridge.hasReusableConversation(),
          getCurrentAgentConversationState: () =>
            services.agentBridge.getCurrentConversationState(),
          getElementAgentTaskState: (element) => services.agentBridge.getElementTaskState(element),
          getVisibleElementAgentTaskStates: () => services.agentBridge.getVisibleTaskStates(),
          getAgentProviderAvailability: (provider) =>
            services.agentBridge.getProviderAvailability(provider),
          getAgentProviderAvailabilities: () => services.agentBridge.getProviderAvailabilities(),
          refreshAgentProviderAvailabilities: (providers) =>
            services.agentBridge.refreshProviderAvailabilities(providers),
          subscribeSessionActivity: (target, listener) =>
            services.agentBridge.subscribeSessionActivity(target, listener),
          dismissElementAgentTaskState: (element) =>
            services.agentBridge.dismissElementTaskState(element),
          dismissVisibleElementAgentTaskStates,
          getSendPromptToAgentBlockReason: (element) => {
            const targetElements = resolvePromptTargets(element);
            if (targetElements.length === 0) {
              return '当前没有可发送给 AI 的编辑元素';
            }
            return services.summaries.getSaveRunPromptBlockReason();
          },
          getSendCurrentElementPromptToAgentBlockReason: (element) => {
            if (!element?.isConnected) {
              return '当前元素已失效，请重新选择后再试。';
            }
            return services.summaries.getSaveRunPromptForElementBlockReason(element);
          },
          canExportSelectionToDesignTool: (_tool, element) => {
            const targetElement = resolvePromptTarget(element);
            return isExportableDesignElement(targetElement);
          },
          onExportSelectionToDesignTool: async (tool, element) => {
            const targetElement = resolvePromptTarget(element);
            if (!targetElement) {
              throw new Error('当前没有可导出的元素。');
            }
            try {
              await exportSelectionToDesignTool(tool, targetElement);
              services.feedback.toast('success', `已导出到 ${tool}`);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              services.feedback.toast('error', message || `导出到 ${tool} 失败`);
            }
          },
          getExportSelectionToDesignToolBlockReason: (_tool, element) => {
            const targetElement = resolvePromptTarget(element);
            if (!targetElement) {
              return '当前没有可导出的元素';
            }
            if (services.agentBridge.isElementInteractionLocked(targetElement)) {
              return '当前元素正在由 AI 更新';
            }
            return getDesignToolExportBlockReason(targetElement);
          },
          canEditText: (element) => services.textSession.isEditable(element),
          getTextValue: (element) => services.textSession.getText(element),
          onTextValueChange: (element, value, previousValue) => {
            services.textSession.commitText(element, value, previousValue);
          },
          onInlineTextEditingElementChange: (element) => {
            inlineTextEditingElement = element?.isConnected ? element : null;
            state.inlineTextEditingActive = Boolean(inlineTextEditingElement);
            state.positionTracker?.forceUpdate(true);
          },
          getTweakSchema: (element) => getTweakProtocol()?.getSchema(element) ?? null,
          getTweakValues: (element) => getTweakProtocol()?.getValues(element) ?? null,
          getPageTweakEntries: () => getTweakProtocol()?.listEntries(document) ?? [],
          onUpdateTweakValues: async (element, patch) => {
            const protocol = getTweakProtocol();
            if (!protocol) {
              throw new Error('Tweak protocol is unavailable.');
            }
            const schema = protocol.getSchema(element);
            const beforeValues = protocol.getValues(element);
            await protocol.update(element, patch);
            const afterValues = protocol.getValues(element);
            services.changes.recordTweakValuesForElement?.(element, {
              schema,
              beforeValues,
              afterValues,
            });
            state.positionTracker?.forceUpdate(true);
            onStatusChange?.();
          },
          subscribeTweak: (listener) =>
            getTweakProtocol()?.subscribe(listener) ?? (() => undefined),
          getAiNote: (element) => services.changes.getMetaForElement(element)?.note ?? '',
          getAiNoteSkillIds: (element) =>
            services.changes.getMetaForElement(element)?.skillIds?.slice() ?? [],
          enableImageAttachments: options.ui.enableImageAttachments,
          onPrepareAiNoteImages: options.ui.onPrepareImageAttachments,
          getAiNoteImages: (element) => services.changes.getImagesForElement(element),
          getHoveredElement: () => state.hoveredElement,
          onRememberSelectionAnchor: (element, selectionAnchor) => {
            services.changes.rememberSelectionAnchor(element, selectionAnchor);
          },
          onAiNoteChange: (element, note, noteOptions) => {
            if (noteOptions) {
              services.changes.setNoteForElement(element, note, noteOptions);
            } else {
              services.changes.setNoteForElement(element, note);
            }
            state.positionTracker?.forceUpdate(true);
            syncCommentContextAfterNoteSave(element, note);
          },
          onAiNoteImagesChange: (element, images) => {
            services.changes.setImagesForElement(element, images);
            state.positionTracker?.forceUpdate(true);
          },
          canEditAnnotationMarkdown,
          resolveAnnotationTarget: resolveAnnotationHostTarget,
          getCreateAnnotationBlockReason,
          annotationMarkdownEditorKind: options.host.annotationMarkdownEditorKind,
          getAnnotationDocumentEditUrl,
          getAnnotationMarkdown,
          onAnnotationMarkdownChange,
          onDismissSelection: services.interaction.clearSelection,
          getChangeMarkersVisible: () => state.changeMarkersVisible,
          onChangeMarkersVisible: services.changes.setChangeMarkersVisible,
          getModifiedElementCount: getClearableElementCount,
          onSelectionChromeVisibleChange: (visible) => {
            state.selectionChromeVisible = visible;
            if (!visible) {
              state.canvasOverlay?.setHoverRect(null);
              state.canvasOverlay?.setSelectionEffect('default');
              state.canvasOverlay?.setSelectionRect(null);
              state.canvasOverlay?.render();
              state.handlesController?.setSelectionRect(null);
            } else {
              state.positionTracker?.forceUpdate(true);
            }
            onStatusChange?.();
          },
          onPromptCardVisibleChange: (visible) => {
            if (state.promptCardVisible === visible) return;
            state.promptCardVisible = visible;
            services.changes.renderChangeMarkers();
            state.positionTracker?.forceUpdate(true);
            onStatusChange?.();
          },
          onToggleSelectionMode: (enabled, toggleOptions) => {
            if (!state.eventController) {
              return;
            }

            if (isTextComment) {
              state.eventController.setMode('interaction', {
                allowPageInteraction: true,
              });
              return;
            }

            const selectedElement = state.selectedElement;
            const hasSelection = !!selectedElement && selectedElement.isConnected;

            if (enabled) {
              state.eventController.setMode(hasSelection ? 'selecting' : 'hover');
              return;
            }

            state.eventController.setMode('interaction', {
              allowPageInteraction: toggleOptions?.allowPageInteraction ?? !hasSelection,
            });
          },
        };

        const runtime = createWebEditorUiRuntime({
          container: elements.uiRoot,
          shadowRoot: elements.shadowRoot,
          propertyPanelVisible: options.ui.propertyPanel,
          initialSelectionModeActive,
          toolbarMode: options.ui.toolbarMode,
          breadcrumbsOptions: options.ui.breadcrumbs
            ? {
                container: elements.uiRoot,
                dock: 'top',
                onSelect: selectElementWithCenterAnchor,
                getAssistantPanelOpen: options.ui.getAssistantPanelOpen,
                getAgentBridgeAvailable: () => services.agentBridge.isAvailable(),
                hideExecutionControls: options.ui.hideExecutionControls,
                getCommentShortcutSettings: () => state.commentShortcutSettings,
                getElementAgentTaskState: (element) =>
                  services.agentBridge.getElementTaskState(element),
                getVisibleElementAgentTaskStates: () => services.agentBridge.getVisibleTaskStates(),
                dismissElementAgentTaskState: (element) =>
                  services.agentBridge.dismissElementTaskState(element),
                externalEditingStatusDescription: options.ui.externalEditingStatusDescription,
                onAppendElementToAgentContext: options.agentBridge.enableContextAppend
                  ? (element) => {
                      if (!element.isConnected) return;
                      void services.agentBridge.handleSendSelectionToAgent(element);
                    }
                  : undefined,
                getElementStyleSummaryLines: (element) =>
                  services.changes.getMetaForElement(element)?.styleSummaryLines ?? [],
                getElementTools: options.host.getElementTools,
                onElementToolAction: options.host.onElementToolAction,
                canEditAnnotationMarkdown,
                resolveAnnotationTarget: resolveAnnotationHostTarget,
                getCreateAnnotationBlockReason,
                annotationMarkdownEditorKind: options.host.annotationMarkdownEditorKind,
                getAnnotationDocumentEditUrl,
                getAnnotationMarkdown,
                onAnnotationMarkdownChange,
                onDeleteCurrentAnnotationNode:
                  options.host.onDeleteAnnotationNode || options.host.onAnnotationMarkdownChange
                    ? handleDeleteCurrentAnnotationNode
                    : undefined,
                onSelectParent: (element) => {
                  const parent = state.selectionEngine?.getParentCandidate(element) ?? null;
                  if (parent) {
                    selectElementWithCenterAnchor(parent);
                  }
                },
              }
            : null,
          propertyPanelOptions,
        });

        state.breadcrumbs = runtime.breadcrumbs;
        state.propertyPanel = runtime.propertyPanel;
      } else {
        state.breadcrumbs = null;
        state.propertyPanel = null;
      }

      if (state.propertyPanel) {
        state.propertyPanel.setHistory(
          state.transactionManager.getUndoStack().length,
          state.transactionManager.getRedoStack().length,
        );
        state.propertyPanel.refresh();
      }

      services.changes.renderChangeMarkers();
      installParentSelectHotkey();
      if (!isTextComment) {
        installSelectionModeHotkey();
      }
      installUiResizeClamp();
      installRouteChangeRefresh();

      state.active = true;
      state.panelOnlyMode = false;
      if (options.agentBridge.autoStartOnLaunch !== false) {
        services.agentBridge.start();
      }
      services.integrationWs?.start();
      onStatusChange?.();
      console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Started`);
    } catch (error) {
      cleanupMountedRuntime();
      state.active = false;
      onStatusChange?.();
      console.error(`${WEB_EDITOR_V2_LOG_PREFIX} Failed to start:`, error);
    }
  }

  /**
   * Dispose only interaction-level subsystems while keeping
   * the shadow host, UI runtime, property panel and breadcrumbs alive.
   */
  function cleanupInteractionComponents(): void {
    inlineTextEditingElement = null;
    services.conversationTaskMonitor?.stop();
    services.integrationWs?.stop();
    services.agentBridge.stop();

    routeChangeCleanup?.();
    routeChangeCleanup = null;

    state.uiResizeCleanup?.();
    state.uiResizeCleanup = null;

    state.tokensService?.dispose();
    state.tokensService = null;

    state.eventController?.dispose();
    state.eventController = null;

    state.commentShortcutCleanup?.();
    state.commentShortcutCleanup = null;

    if (state.textCommentTargetElement) {
      state.textCommentTargetElement.remove();
      state.textCommentTargetElement = null;
    }

    state.dragReorderController?.dispose();
    state.dragReorderController = null;

    state.handlesController?.dispose();
    state.handlesController = null;

    state.parentSelectController?.dispose();
    state.parentSelectController = null;

    state.parentSelectHotkeyCleanup?.();
    state.parentSelectHotkeyCleanup = null;

    state.transactionManager?.dispose();
    state.transactionManager = null;

    state.positionTracker?.dispose();
    state.positionTracker = null;

    state.selectionEngine?.dispose();
    state.selectionEngine = null;

    state.perfHotkeyCleanup?.();
    state.perfHotkeyCleanup = null;

    state.selectionModeHotkeyCleanup?.();
    state.selectionModeHotkeyCleanup = null;

    state.perfMonitor?.dispose();
    state.perfMonitor = null;

    state.canvasOverlay?.dispose();
    state.canvasOverlay = null;

    if (state.markerLayer) {
      state.markerLayer.remove();
      state.markerLayer = null;
    }
  }

  function stop(stopOptions?: { keepPanelOnly?: boolean }): void {
    if (!state.active) {
      return;
    }

    // Downgrade to panel-only mode instead of a full stop.
    if (stopOptions?.keepPanelOnly && !state.panelOnlyMode) {
      try {
        services.persistence.flushPendingWrite();
        cleanupInteractionComponents();
        state.panelOnlyMode = true;
        // Reset transient selection/edit state but keep the panel alive.
        state.hoveredElement = null;
        state.selectedElement = null;
        state.selectionAnchor = null;
        state.pendingHoverTransition = false;
        state.inlineTextEditingActive = false;
        state.promptCardVisible = false;
        state.propertyPanel?.refresh();
        onStatusChange?.();
        console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Downgraded to panel-only mode`);
        return;
      } catch (error) {
        console.error(
          `${WEB_EDITOR_V2_LOG_PREFIX} Downgrade to panel-only failed, performing full stop:`,
          error,
        );
        // Fall through to full stop below.
      }
    }

    state.active = false;
    state.panelOnlyMode = false;

    try {
      services.persistence.flushPendingWrite();
      cleanupMountedRuntime();
      onStatusChange?.();
      console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Stopped`);
    } catch (error) {
      console.error(`${WEB_EDITOR_V2_LOG_PREFIX} Error during cleanup:`, error);
      cleanupMountedRuntime();
      onStatusChange?.();
    }
  }

  /**
   * Start the editor in property-panel-only mode.
   * Mounts the shadow host and property panel UI but does NOT create
   * interaction subsystems (selection, hover, event controller, etc.).
   */
  function startPanelOnly(): void {
    if (state.active) {
      if (state.panelOnlyMode) {
        console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Already in panel-only mode`);
      } else {
        console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Already fully active, ignoring startPanelOnly`);
      }
      return;
    }

    try {
      resetEditorTransientState(state);

      state.shadowHost = mountShadowHost({});
      const elements = state.shadowHost.getElements();
      if (!elements?.uiRoot) {
        throw new Error('Shadow host uiRoot not available');
      }

      state.uiSettings = {
        ...services.persistence.readUiSettings(),
        darkMode: options.ui.initialDarkMode,
      };
      const interactionProfile = resolveActiveInteractionProfile();
      const initialSelectionModeActive =
        interactionProfile !== 'text-comment' && options.ui.initialSelectionModeActive;

      if (options.ui.propertyPanel) {
        state.tokensService = createDesignTokensService();

        const propertyPanelOptions: PropertyPanelOptions = {
          container: elements.uiRoot,
          transactionManager: null as unknown as TransactionManager,
          tokensService: state.tokensService ?? undefined,
          initialPosition: state.propertyPanelPosition,
          initialUiMode: state.commentEntryMode,
          onPositionChange: (position) => {
            state.propertyPanelPosition = position;
          },
          getUiMode: () => state.commentEntryMode,
          onUiModeChange: (mode) => {
            state.commentEntryMode = mode;
          },
          getCommentShortcutSettings: () => state.commentShortcutSettings,
          onCommentShortcutSettingsChange: (settings) => {
            state.commentShortcutSettings = settings;
            services.persistence.setCommentShortcutSettings(settings);
          },
          getUiSettings: () => state.uiSettings,
          interactionProfile,
          documentCommentModeAvailable: options.interactionProfile !== 'text-comment',
          pageEditingSettingsAvailable: options.ui.pageEditingSettingsAvailable,
          onUiSettingsChange: handleUiSettingsChange,
          onLocateElement: () => {},
          onCommentShortcutDialogOpenChange: (open) => {
            state.commentShortcutDialogOpen = open;
          },
          onUndo: () => {},
          onRedo: () => {},
          onCopyPrompt: services.localActions.handleCopyPrompt,
          onEnableAnnotation: options.ui.onEnableAnnotation,
          getAnnotationEnabled: options.ui.getAnnotationEnabled,
          getAnnotationEnableAvailable: options.ui.getAnnotationEnableAvailable,
          getAnnotationEnableLoading: options.ui.getAnnotationEnableLoading,
          markdownSourceEditorAvailable: options.ui.markdownSourceEditorAvailable,
          getMarkdownSourceEditorOpen: options.ui.getMarkdownSourceEditorOpen,
          onMarkdownSourceEditorOpenChange: options.ui.onMarkdownSourceEditorOpenChange,
          onWakeAgent: undefined,
          onSendPromptToAgent: async () => {},
          onSendCurrentElementPromptToAgent: async () => {},
          onAbortAgentPrompt: () => {},
          onRequestClose: () => {},
          onRequestFullExit: options.ui.onRequestFullExit,
          onClearEdits: async () => {},
          onClearCurrentElementEdits: async () => false,
          getCopyPromptBlockReason: services.summaries.getCopyPromptBlockReason,
          showCopyPromptAction: options.ui.showCopyPromptAction,
          toolbarMode: options.ui.toolbarMode,
          hideExecutionControls: options.ui.hideExecutionControls,
          hideCurrentElementExecutionAction: options.ui.hideCurrentElementExecutionAction,
          hostSurfaceVisibilityControl: options.ui.hostSurfaceVisibilityControl,
          aiExecutionConfigSummary: options.ui.aiExecutionConfigSummary,
          aiExecutionConfigConfigured: options.ui.aiExecutionConfigConfigured,
          aiExecutionProvider: options.ui.aiExecutionProvider,
          aiExecutionWorkspacePath: options.ui.aiExecutionWorkspacePath,
          aiExecutionRunConcurrency: options.ui.aiExecutionRunConcurrency,
          aiExecutionProviderOptions: options.ui.aiExecutionProviderOptions,
          htmlFileSaveEnabled: options.ui.htmlFileSaveEnabled,
          getAcpUiConnected: options.ui.getAcpUiConnected,
          onHostToolbarAction: options.ui.onHostToolbarAction,
          externalEditingStatusDescription: options.ui.externalEditingStatusDescription,
          skillInstallSource: options.ui.skillInstallSource,
          commentarySkillOptions: options.ui.commentarySkillOptions,
          commentarySelectedSkillIds: options.ui.commentarySelectedSkillIds,
          commentarySkillSettingsConfigured: options.ui.commentarySkillSettingsConfigured,
          getAgentBridgeAvailable: () => false,
          getAgentBridgeConnected: () => false,
          getCanAbortAgentPrompt: () => false,
          getHasReusableAgentConversation: () => false,
          getCurrentAgentConversationState: () => null,
          getElementAgentTaskState: () => null,
          getVisibleElementAgentTaskStates: () => [],
          getAgentProviderAvailability: () => null,
          getAgentProviderAvailabilities: () => [],
          refreshAgentProviderAvailabilities: () => Promise.resolve(),
          subscribeSessionActivity: () => () => undefined,
          dismissElementAgentTaskState: () => {},
          dismissVisibleElementAgentTaskStates: () => {},
          getSendPromptToAgentBlockReason: () => '属性面板仅预览模式，不可发送',
          getSendCurrentElementPromptToAgentBlockReason: () => '属性面板仅预览模式，不可发送',
          canExportSelectionToDesignTool: () => false,
          onExportSelectionToDesignTool: async () => {},
          getExportSelectionToDesignToolBlockReason: () => '属性面板仅预览模式，不可导出',
          canEditText: () => false,
          getTextValue: () => '',
          onTextValueChange: () => {},
          onInlineTextEditingElementChange: () => {},
          getTweakSchema: (element) => getTweakProtocol()?.getSchema(element) ?? null,
          getTweakValues: (element) => getTweakProtocol()?.getValues(element) ?? null,
          getPageTweakEntries: () => getTweakProtocol()?.listEntries(document) ?? [],
          onUpdateTweakValues: async (element, patch) => {
            const protocol = getTweakProtocol();
            if (!protocol) {
              throw new Error('Tweak protocol is unavailable.');
            }
            await protocol.update(element, patch);
            onStatusChange?.();
          },
          subscribeTweak: (listener) =>
            getTweakProtocol()?.subscribe(listener) ?? (() => undefined),
          getAiNote: () => '',
          getAiNoteSkillIds: () => [],
          getAiNoteImages: () => [],
          getHoveredElement: () => null,
          onRememberSelectionAnchor: () => {},
          onAiNoteChange: () => {},
          onAiNoteImagesChange: () => {},
          canEditAnnotationMarkdown,
          resolveAnnotationTarget: resolveAnnotationHostTarget,
          getCreateAnnotationBlockReason,
          annotationMarkdownEditorKind: options.host.annotationMarkdownEditorKind,
          getAnnotationDocumentEditUrl,
          getAnnotationMarkdown,
          onAnnotationMarkdownChange,
          onDeleteCurrentAnnotationNode:
            options.host.onDeleteAnnotationNode || options.host.onAnnotationMarkdownChange
              ? handleDeleteCurrentAnnotationNode
              : undefined,
          onDismissSelection: () => {},
          getChangeMarkersVisible: () => false,
          onChangeMarkersVisible: () => {},
          getModifiedElementCount: () => 0,
          onSelectionChromeVisibleChange: () => {},
          onPromptCardVisibleChange: () => {},
          onToggleSelectionMode: () => {},
        };

        const runtime = createWebEditorUiRuntime({
          container: elements.uiRoot,
          shadowRoot: elements.shadowRoot,
          propertyPanelVisible: true,
          initialPropertyPanelOpen: true,
          initialSelectionModeActive,
          toolbarMode: options.ui.toolbarMode,
          breadcrumbsOptions: null,
          propertyPanelOptions,
        });

        state.breadcrumbs = runtime.breadcrumbs;
        state.propertyPanel = runtime.propertyPanel;
      }

      state.propertyPanel?.refresh();
      installUiResizeClamp();

      state.active = true;
      state.panelOnlyMode = true;
      onStatusChange?.();
      console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Started in panel-only mode`);
    } catch (error) {
      cleanupMountedRuntime();
      state.active = false;
      state.panelOnlyMode = false;
      onStatusChange?.();
      console.error(`${WEB_EDITOR_V2_LOG_PREFIX} Failed to start panel-only:`, error);
    }
  }

  /**
   * Upgrade from panel-only mode to full interaction mode.
   * Reuses the existing shadow host and disposes/recreates the UI runtime
   * so it gets the full set of callbacks.
   */
  function upgradeFromPanelOnly(): void {
    if (!state.active || !state.panelOnlyMode) return;

    // Dispose the lightweight panel-only UI so start() can recreate it
    // with the full set of interaction callbacks.
    state.propertyPanel?.dispose();
    state.propertyPanel = null;
    state.breadcrumbs?.dispose();
    state.breadcrumbs = null;
    state.tokensService?.dispose();
    state.tokensService = null;
    state.uiResizeCleanup?.();
    state.uiResizeCleanup = null;

    // Tear down the shadow host so start() can do a clean mount.
    state.shadowHost?.dispose();
    state.shadowHost = null;
    clearEditorRuntimeRefs(state);

    state.active = false;
    state.panelOnlyMode = false;

    // Delegate to the regular full start().
    start();
  }

  function stopPanelOnly(): void {
    if (!state.active) return;

    state.active = false;
    state.panelOnlyMode = false;

    try {
      cleanupMountedRuntime();
      onStatusChange?.();
      console.log(`${WEB_EDITOR_V2_LOG_PREFIX} Stopped panel-only mode`);
    } catch (error) {
      console.error(`${WEB_EDITOR_V2_LOG_PREFIX} Error during panel-only cleanup:`, error);
      cleanupMountedRuntime();
      onStatusChange?.();
    }
  }

  return {
    start,
    startPanelOnly,
    stop,
    stopPanelOnly,
    flushPendingCommentContextSync,
  };
}
