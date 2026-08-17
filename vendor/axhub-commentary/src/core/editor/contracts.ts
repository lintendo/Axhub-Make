import type {
  ElementLocator,
  CommentaryStyleChangeSet,
  CommentaryTargetedTextChange,
  CommentaryTextChange,
  Transaction,
  WebEditorElementKey,
  WebEditorRevertElementResponse,
} from '../../web-editor-types';
import type { EventModifiers } from '../event-controller';
import type { TrackedRects } from '../position-tracker';
import type { TransactionChangeEvent } from '../transaction-manager';
import type { CommentShortcutSettings } from './comment-shortcut-settings';
import type {
  EditorRuntimeState,
  ElementAgentTaskState,
  ExternalEditingTaskRef,
  PageAgentConversationState,
  PersistedElementAgentTaskState,
} from './state';
import type { CommentEntryMode } from '../../ui/selection-ui-mode';
import type { WebEditorUiSettings } from './ui-settings';
import type { PromptImageAttachment } from './state';
import type {
  CommentaryCopyPromptContext,
  CommentaryAnnotationSaveStatus,
  CommentaryClearEditsOptions,
  CommentaryClearEditsTarget,
  CommentaryHostResource,
  CommentaryModifiedElementSummary,
  PrototypeEditCommentsDocument,
  PrototypeEditCommentStatus,
  PrototypeEditCommentsWriteReason,
} from '../../web-editor-types';
import type { TextComment } from '../../selection/text-comment-manager';
import type {
  CommentaryTweakSchema,
  CommentaryTweakValues,
} from '../../tweak/protocol';

export interface ConfirmDialogOptions {
  title: string;
  content?: string;
  confirmText: string;
  secondaryConfirmText?: string;
  cancelText?: string;
  confirmTone?: 'primary' | 'default';
}

export type ConfirmDialogResult = boolean | 'secondary';

export interface AlertDialogOptions {
  title: string;
  content?: string;
  confirmText: string;
  confirmTone?: 'primary' | 'default';
}

export interface PromptDialogOptions {
  title: string;
  content?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText: string;
  cancelText?: string;
  readOnly?: boolean;
  multiline?: boolean;
  rows?: number;
  selectOnOpen?: boolean;
  validate?: (value: string) => string | null;
}

export interface EditorFeedbackService {
  confirm(options: ConfirmDialogOptions): Promise<ConfirmDialogResult>;
  alert(options: AlertDialogOptions): Promise<void>;
  prompt(options: PromptDialogOptions): Promise<string | null>;
  toast(type: 'success' | 'info' | 'warning' | 'error', content: string): void;
}

export type SessionActivityKind = 'assistant' | 'tool' | 'text';

export interface SessionActivityItem {
  id: string;
  timestamp: number;
  kind: SessionActivityKind;
  text: string;
  sessionId: string | null;
  provider: string | null;
  requestId: string | null;
}

export interface SessionActivityTarget {
  sessionId?: string | null;
  provider?: string | null;
  requestId?: string | null;
}

export interface AgentProviderAvailability {
  provider: string;
  installed: boolean;
  installHint?: string;
  checkedAt: number | null;
  checking: boolean;
}

export type SessionActivityListener = (item: SessionActivityItem) => void;

export interface PersistedConversationTask {
  commentId: string;
  provider: string;
  sessionId: string;
  requestId: string;
}

export interface ConversationTaskTerminalTransition extends PersistedConversationTask {
  state: 'completed' | 'error';
  error?: string | null;
  code?: string | null;
}

export type MoveSummary = {
  label: string;
  locator: ElementLocator;
  selectorPath: string;
  from: {
    parentLocator: ElementLocator;
    insertIndex: number;
    anchorLocator?: ElementLocator;
    anchorPosition?: 'before' | 'after';
  };
  to: {
    parentLocator: ElementLocator;
    insertIndex: number;
    anchorLocator?: ElementLocator;
    anchorPosition?: 'before' | 'after';
  };
  updatedAt: number;
};

export interface EditorSummariesService {
  resolveTargetPath(): string | null;
  resolveCurrentFilePath(): string;
  resolvePrototypeFilePath(): string;
  resolveResourceContext(): CommentaryHostResource | null;
  formatSelectorPath(locator: ElementLocator | null | undefined): string;
  formatElementLabelFromLocator(locator: ElementLocator): string;
  collectTextChanges(): CommentaryTextChange[];
  collectTargetedTextChanges(): CommentaryTargetedTextChange[];
  collectModifiedElementSummaries(): CommentaryModifiedElementSummary[];
  collectStyleCss(): string;
  collectStyleChanges(): CommentaryStyleChangeSet;
  collectMoveSummaries(transactions: readonly Transaction[]): MoveSummary[];
  buildSaveRunPrompt(): string;
  buildAppendSaveRunPrompt(): string;
  buildSaveRunPromptForElement(element: Element | null): string;
  buildSaveRunPromptForElementKey(elementKey: string | null | undefined): string;
  buildAppendSaveRunPromptForElement(element: Element | null): string;
  buildCopyPrompt(): string;
  getCopyPromptContext(): CommentaryCopyPromptContext | null;
  getCopyPromptFilteredNotice(): string | undefined;
  getCopyPromptBlockReason(): string | undefined;
  getSaveRunPromptBlockReason(): string | undefined;
  getSaveRunPromptForElementBlockReason(element: Element | null): string | undefined;
}

export interface EditorChangesService {
  normalizeNote(value: string): string;
  getOrCreateEditMeta(
    elementKey: WebEditorElementKey,
    locator: ElementLocator,
    label: string,
  ): import('./state').ElementEditMeta;
  getMetaForElement(element: Element | null): import('./state').ElementEditMeta | null;
  rememberSelectionAnchor(
    element: Element,
    selectionAnchor?: { clientX: number; clientY: number },
  ): void;
  clearPendingSelectionAnchor(): void;
  renderChangeMarkers(): void;
  syncEditMetaWithTransactions(): void;
  setNoteForElement(
    element: Element | null,
    note: string,
    options?: {
      skillIds?: readonly string[];
      voiceCreateOperationId?: string;
      voiceTargetRef?: string;
      voiceTarget?: import('../../web-editor-types').CommentaryPageElementSummary;
      anchorPlacement?: 'target';
    },
  ): string | null;
  getImagesForElement(element: Element | null): PromptImageAttachment[];
  setImagesForElement(element: Element | null, images: readonly PromptImageAttachment[]): void;
  recordTweakValuesForElement(
    element: Element | null,
    payload: {
      schema: CommentaryTweakSchema | null;
      beforeValues: CommentaryTweakValues | null;
      afterValues: CommentaryTweakValues | null;
    },
  ): void;
  clearRecordedTweakForElement(element: Element | null): void;
  revertRecordedTweakForElement(element: Element | null): Promise<boolean>;
  revertAllRecordedTweaks(): Promise<void>;
  markElementEditsHandled(element: Element): void;
  markElementEditsHandledByKey(target: ExternalEditingElementTarget): void;
  clearElementEditMeta(element: Element | null): void;
  clearAllEditMeta(): void;
  getSelectedElementNote(): string;
  setChangeMarkersVisible(visible: boolean, options?: { persist?: boolean }): void;
  buildCommentCommentsContext(element?: Element | null): Array<{
    elementKey: WebEditorElementKey;
    selector: string;
    label: string;
    note: string;
    elementType: string;
  }>;
  buildModifiedElementsContext(): Array<{
    selector: string;
    label: string;
    note: string;
    changeKinds: import('./state').EditChangeKind[];
    marker: {
      index: number;
      clientX: number;
      clientY: number;
      documentX: number;
      documentY: number;
      isFixed: boolean;
    } | null;
  }>;
}

export interface EditorPersistenceService {
  readMarkerVisibility(): boolean;
  setMarkerVisibility(visible: boolean): void;
  readCommentShortcutSettings(): CommentShortcutSettings;
  setCommentShortcutSettings(settings: CommentShortcutSettings): void;
  readUiSettings(): WebEditorUiSettings;
  setUiSettings(settings: WebEditorUiSettings): void;
  readAgentConversationState(scopeKey: string): PageAgentConversationState | null;
  writeAgentConversationState(scopeKey: string, conversation: PageAgentConversationState): void;
  clearAgentConversationState(scopeKey: string): void;
  readAgentTaskStates(scopeKey: string): PersistedElementAgentTaskState[];
  writeAgentTaskStates(scopeKey: string, tasks: PersistedElementAgentTaskState[]): void;
  discardAgentTaskStates(
    scopeKeys: readonly string[],
    elementKeys: readonly WebEditorElementKey[],
  ): void;
  pruneExpiredAgentTaskStates(scopeKey: string): void;
  recordCommentTaskState?(
    elementKey: WebEditorElementKey,
    state: PrototypeEditCommentStatus,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): void;
  getCommentTaskState?(
    elementKey: WebEditorElementKey,
  ): PrototypeEditCommentStatus | null;
  resetTerminalCommentStateForElement(elementKey: WebEditorElementKey): boolean;
  waitForPendingWrites(): Promise<void>;
  getSaveStatus(): CommentaryAnnotationSaveStatus;
  listEditingConversationTasks(): PersistedConversationTask[];
  transitionConversationTaskTerminal(
    input: ConversationTaskTerminalTransition,
  ): Promise<boolean>;
  clearCommentRecord?(elementKey: WebEditorElementKey): void;
  scheduleWrite(): void;
  persistFromTransactions(): void;
  flushPendingWrite(reason?: PrototypeEditCommentsWriteReason): void;
  restoreCachedChanges(): Promise<WebEditorElementKey[]>;
  getPersistedPrototypeCommentsDocument(): PrototypeEditCommentsDocument | null;
  clearCachedChanges(kind: 'text' | 'style'): void;
  clearStorage(
    scope?: CommentaryClearEditsOptions['scope'],
    target?: CommentaryClearEditsTarget,
  ): void | Promise<void>;
}

export interface EditorTextSessionService {
  isEditable(element: Element | null): element is HTMLElement;
  normalizeText(value: string): string;
  getText(element: Element | null): string;
  commitText(element: Element, value: string, previousValue?: string): boolean;
}

export interface EditorInteractionService {
  handleHover(element: Element | null): void;
  activatePageTarget(
    element: Element,
    selectionAnchor?: { clientX: number; clientY: number },
  ): boolean;
  handleSelect(
    element: Element,
    modifiers: EventModifiers,
    selectionAnchor?: { clientX: number; clientY: number },
    initialSelectionElement?: Element,
  ): Promise<void>;
  handleDeselect(): void;
  handlePositionUpdate(rects: TrackedRects): void;
  handleTransactionChange(event: TransactionChangeEvent): void;
  enterCommentInput(mode?: CommentEntryMode): void;
  enterCommentFromTrigger(selectionAnchor?: { clientX: number; clientY: number }): boolean;
  enterTextComment(
    comment: TextComment,
    anchor: { clientX: number; clientY: number },
  ): void;
  clearSelection(): void;
  revertElement(elementKey: WebEditorElementKey): Promise<WebEditorRevertElementResponse>;
}

export interface ExternalEditingElementTarget {
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
  label: string;
}

export interface EditorAgentBridgeService {
  start(): void;
  stop(): void;
  requestWake(): Promise<boolean>;
  isConnected(): boolean;
  isAvailable(): boolean;
  getDebugInfo?(): {
    apiBaseUrl: string;
    integrationChannel: string;
    targetClientId: string;
    provider: string;
  };
  getCurrentConversationState(): PageAgentConversationState | null;
  subscribeSessionActivity(
    target: SessionActivityTarget,
    listener: SessionActivityListener,
  ): () => void;
  hasReusableConversation(): boolean;
  canReuseConversationForElement?(element: Element | null): boolean;
  invalidateCurrentConversation?(): void;
  getElementTaskState(element: Element | null): ElementAgentTaskState | null;
  getVisibleTaskStates(): ElementAgentTaskState[];
  getProviderAvailability(provider: string): AgentProviderAvailability | null;
  getProviderAvailabilities(): AgentProviderAvailability[];
  refreshProviderAvailabilities(providers?: readonly string[]): Promise<void>;
  getTaskStateByElementKey?(elementKey: WebEditorElementKey | null | undefined): ElementAgentTaskState | null;
  resolveSelectableElement(element: Element | null): Element | null;
  isElementInteractionLocked(element: Element | null): boolean;
  dismissElementTaskState(
    element: Element,
    options?: {
      includeRunning?: boolean;
    },
  ): void;
  setExternalEditingState?(
    element: Element,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null;
  setExternalEditingStateByElementKey?(
    target: ExternalEditingElementTarget,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null;
  clearExternalEditingState?(
    element: Element,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): boolean;
  clearExternalEditingStateByElementKey?(
    elementKey: WebEditorElementKey,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): boolean;
  setExternalEditingTerminalState?(
    element: Element,
    terminalState: 'completed' | 'error',
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null;
  setExternalEditingTerminalStateByElementKey?(
    target: ExternalEditingElementTarget,
    terminalState: 'completed' | 'error',
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null;
  canInterruptElementTask(element: Element | null): boolean;
  canInterruptVisibleTasks?(): boolean;
  interruptElementTask(element: Element): Promise<void>;
  interruptVisibleTasks?(): Promise<void>;
  handleSendSelectionToAgent(element: Element): Promise<void>;
  handleSyncCommentContextToAgent(
    element: Element | null,
    mode: 'append' | 'replace',
  ): Promise<void>;
  handleSendPromptToAgentForElements(
    elements: Element[],
    prompt: string | ((element: Element) => string),
  ): Promise<void>;
  handleSendPromptToAgentForElement(element: Element, prompt: string): Promise<void>;
  discardDeletedElementStates?(elementKeys: readonly WebEditorElementKey[]): void;
  rehydratePersistedAgentState(): void;
}

export type IntegrationWsConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface EditorIntegrationWsService {
  start(): void;
  stop(): void;
  getConnectionStatus(): IntegrationWsConnectionStatus;
  getDebugState(): {
    status: IntegrationWsConnectionStatus;
    url: string | null;
    lastError: string | null;
  };
}

export interface EditorLocalActionsService {
  handleCopyPrompt(): Promise<void>;
  handleClearEdits(
    options?: CommentaryClearEditsOptions,
  ): Promise<CommentaryClearEditsTarget | null>;
  handleClearElementEdits(element: Element): Promise<boolean>;
}

export interface EditorConversationTaskMonitor {
  reconcile(): void;
  stop(): void;
}

export interface EditorServices {
  feedback: EditorFeedbackService;
  summaries: EditorSummariesService;
  changes: EditorChangesService;
  persistence: EditorPersistenceService;
  textSession: EditorTextSessionService;
  interaction: EditorInteractionService;
  agentBridge: EditorAgentBridgeService;
  integrationWs?: EditorIntegrationWsService;
  conversationTaskMonitor?: EditorConversationTaskMonitor;
  localActions: EditorLocalActionsService;
}

export interface EditorLifecycleDeps {
  state: EditorRuntimeState;
  options: import('./state').ResolvedWebEditorOptions;
  services: EditorServices;
  onStatusChange?: () => void;
}
