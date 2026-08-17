import type {
  ElementLocator,
  Transaction,
  WebEditorElementKey,
  CommentaryApi,
  CommentaryHostOptions,
  CommentaryHostSurfaceVisibilityControl,
  CommentaryHostToolbarAction,
  CommentaryHostToolbarActionResult,
  CommentarySkillOption,
  WebEditorRevertElementResponse,
  CommentaryState,
  CommentaryToolbarMode,
  CommentaryImageSource,
  CommentaryPageElementSummary,
} from '../../web-editor-types';
import type { WebEditorAgentProvider } from '../../agent-bridge';
import type { ShadowHostManager } from '../../ui/shadow-host';
import type { Breadcrumbs } from '../../ui/breadcrumbs';
import type { PropertyPanel } from '../../ui/property-panel';
import type { CommentEntryMode } from '../../ui/selection-ui-mode';
import type { CanvasOverlay } from '../../overlay/canvas-overlay';
import type { HandlesController } from '../../overlay/handles-controller';
import type { ParentSelectCornerController } from '../../overlay/parent-select-corner';
import type { DragReorderController } from '../../drag/drag-reorder-controller';
import type { EventController } from '../event-controller';
import type { PositionTracker } from '../position-tracker';
import type { SelectionEngine } from '../../selection/selection-engine';
import type { TextCommentManager, TextComment } from '../../selection/text-comment-manager';
import type { TransactionManager } from '../transaction-manager';
import type { DesignTokensService } from '../design-tokens';
import type { PerfMonitor } from '../perf-monitor';
import { locatorKey } from '../locator';
import type { CommentShortcutSettings } from './comment-shortcut-settings';
import { DEFAULT_COMMENT_SHORTCUT_SETTINGS } from './comment-shortcut-settings';
import type {
  WebEditorInteractionProfile,
  WebEditorUiSettings,
} from '../../core/editor/ui-settings';
import { DEFAULT_WEB_EDITOR_UI_SETTINGS } from './ui-settings';
import type { CommentaryTweakValues } from '../../tweak/protocol';
import type { AnnotationBridgeSelection } from '../../utils/annotation-comment-bridge';

export interface WebEditorV2UiOptions {
  breadcrumbs?: boolean;
  propertyPanel?: boolean;
  toolbarMode?: CommentaryToolbarMode;
  enableImageAttachments?: boolean;
  onPrepareImageAttachments?: (
    element: Element,
    images: readonly PromptImageAttachment[],
  ) => readonly PromptImageAttachment[] | Promise<readonly PromptImageAttachment[]>;
  initialSelectionModeActive?: boolean;
  initialDarkMode?: boolean;
  showCopyPromptAction?: boolean;
  hideExecutionControls?: boolean;
  /** Hide the current-element send action in the prompt bubble. */
  hideCurrentElementExecutionAction?: boolean;
  /** Replace the execution slot with a host-owned surface visibility toggle. */
  hostSurfaceVisibilityControl?: CommentaryHostSurfaceVisibilityControl | null;
  aiExecutionConfigSummary?: string;
  aiExecutionConfigConfigured?: boolean;
  aiExecutionProvider?: string;
  aiExecutionWorkspacePath?: string;
  aiExecutionRunConcurrency?: number;
  aiExecutionProviderOptions?: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
  /** Show host-managed direct-save actions for a resolved local HTML file. */
  htmlFileSaveEnabled?: boolean;
  /** Whether page-editing settings are relevant to the current host surface. */
  pageEditingSettingsAvailable?: boolean;
  /** Read whether the host's ACP UI service is currently connected. */
  getAcpUiConnected?: () => boolean;
  getAssistantPanelOpen?: () => boolean;
  onHostToolbarAction?: (
    action: CommentaryHostToolbarAction,
  ) => CommentaryHostToolbarActionResult | Promise<CommentaryHostToolbarActionResult>;
  onEnableAnnotation?: () => boolean | Promise<boolean>;
  getAnnotationEnabled?: () => boolean;
  getAnnotationEnableAvailable?: () => boolean;
  getAnnotationEnableLoading?: () => boolean;
  /** Show a host-managed Markdown source pane beside the document body. */
  markdownSourceEditorAvailable?: boolean;
  /** Read whether the Markdown source pane is currently visible. */
  getMarkdownSourceEditorOpen?: () => boolean;
  /** Show or hide the Markdown source pane, returning the resulting state. */
  onMarkdownSourceEditorOpenChange?: (open: boolean) => boolean | Promise<boolean>;
  externalEditingStatusDescription?: string;
  skillInstallSource?: string;
  commentarySkillOptions?: CommentarySkillOption[];
  commentarySelectedSkillIds?: string[];
  commentarySkillSettingsConfigured?: boolean;
  onRequestFullExit?: () => void | Promise<void>;
}
export type CommentaryUiOptions = WebEditorV2UiOptions;

export interface WebEditorV2PromptContextOptions {
  workspacePaths?: string[];
  relatedFiles?: string[];
  extraContext?: string[];
}
export type CommentaryPromptContextOptions = WebEditorV2PromptContextOptions;

export interface WebEditorV2IntegrationWsOptions {
  enabled?: boolean;
  apiBaseUrl?: string;
  channel?: string;
  clientId?: string;
  sessionId?: string;
  pageUrl?: string;
  apiKey?: string;
  source?: string;
}
export type CommentaryIntegrationWsOptions = WebEditorV2IntegrationWsOptions;

export interface WebEditorV2AgentBridgeOptions {
  enabled?: boolean;
  autoStartOnLaunch?: boolean;
  allowWake?: boolean;
  enableContextAppend?: boolean;
  targetOrigin?: string;
  preferCurrentSession?: boolean;
  apiBaseUrl?: string;
  integrationChannel?: string;
  targetClientId?: string;
  externalClientId?: string;
  apiKey?: string;
  probeOnStart?: boolean;
  probeTimeoutMs?: number;
  projectPath?: string;
  provider?: WebEditorAgentProvider;
  onRequestWake?: () => void | Promise<void>;
}
export type CommentaryAgentBridgeOptions = WebEditorV2AgentBridgeOptions;

export interface WebEditorV2InitOptions {
  ui?: WebEditorV2UiOptions;
  host?: CommentaryHostOptions;
  agentBridge?: WebEditorV2AgentBridgeOptions;
  promptContext?: WebEditorV2PromptContextOptions;
  integrationWs?: WebEditorV2IntegrationWsOptions;
  interactionProfile?: WebEditorInteractionProfile;
  mobileMode?: boolean;
}
export type CommentaryInitOptions = WebEditorV2InitOptions;

export interface ResolvedWebEditorOptions {
  ui: Required<Omit<WebEditorV2UiOptions, 'getAcpUiConnected'>> &
    Pick<WebEditorV2UiOptions, 'getAcpUiConnected'>;
  host: Required<Pick<CommentaryHostOptions, 'getResourceContext'>> &
    Pick<
      CommentaryHostOptions,
      | 'buildCopyPrompt'
      | 'getCurrentHoveredElement'
      | 'getElementTools'
      | 'onElementToolAction'
      | 'shouldAllowPageEvent'
      | 'getPersistenceScope'
      | 'persistenceAdapter'
      | 'conversationTaskTransport'
      | 'commentPersistenceMode'
      | 'canEditAnnotationMarkdown'
      | 'showAnnotationMarkdownEditor'
      | 'getCreateAnnotationBlockReason'
      | 'annotationMarkdownEditorKind'
      | 'getAnnotationDocumentEditUrl'
      | 'getAnnotationMarkdown'
      | 'onAnnotationMarkdownChange'
      | 'onDeleteAnnotationNode'
    >;
  agentBridge: Required<WebEditorV2AgentBridgeOptions>;
  promptContext: Required<WebEditorV2PromptContextOptions>;
  integrationWs: Required<WebEditorV2IntegrationWsOptions>;
  interactionProfile: WebEditorInteractionProfile;
  mobileMode: boolean | undefined;
}

export type EditChangeKind = 'text' | 'tweak' | 'style' | 'class';
export type ElementAgentTaskStatus = 'pending' | 'created' | 'completed' | 'error';
export type ElementAgentTaskRecovery = 'live' | 'snapshot' | 'storage';
export type ElementAgentTaskOrigin = 'agent-run' | 'external-editing';

export interface ExternalEditingTaskRef {
  provider: string | null;
  sessionId: string | null;
  requestId: string | null;
  error?: string | null;
  code?: string | null;
  output?: string | null;
  chunk?: unknown;
  details?: unknown;
}

export interface PromptImageAttachment {
  id: string;
  name: string;
  data: string;
  mimeType: string;
  size: number;
  createdAt: number;
  source?: CommentaryImageSource;
  assetPath?: string;
}

export interface PageAgentConversationState {
  scopeKey: string;
  sessionId: string;
  provider: string | null;
  projectPath: string | null;
  createdAt: number;
  lastUsedAt: number;
  sentCount: number;
  expiresAt: number;
  invalidated: boolean;
  sessionPath: string | null;
  sessionUrl: string | null;
}

export interface ElementAgentTaskState {
  scopeKey: string;
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
  label: string;
  requestId: string;
  sessionId: string | null;
  sessionPath: string | null;
  sessionUrl: string | null;
  provider: string | null;
  status: ElementAgentTaskStatus;
  message: string;
  startedAt: number;
  updatedAt: number;
  dismissed: boolean;
  recovery: ElementAgentTaskRecovery;
  recoveryPending: boolean;
  lastEventAt: number;
  errorCode: string | null;
  origin?: ElementAgentTaskOrigin;
  taskRef?: ExternalEditingTaskRef | null;
}

export type PersistedElementAgentTaskState = Pick<
  ElementAgentTaskState,
  | 'scopeKey'
  | 'elementKey'
  | 'locator'
  | 'label'
  | 'requestId'
  | 'sessionId'
  | 'sessionPath'
  | 'sessionUrl'
  | 'provider'
  | 'status'
  | 'message'
  | 'startedAt'
  | 'updatedAt'
  | 'dismissed'
  | 'recoveryPending'
  | 'lastEventAt'
  | 'errorCode'
> & {
  origin?: ElementAgentTaskOrigin;
};

export interface MarkerAnchor {
  clientX: number;
  clientY: number;
  documentX: number;
  documentY: number;
  xPercent: number;
  y: number;
  isFixed: boolean;
  offsetX?: number;
  offsetY?: number;
}

export interface ElementEditMeta {
  commentId: string | null;
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
  label: string;
  note: string;
  skillIds?: string[];
  images: PromptImageAttachment[];
  anchor: MarkerAnchor | null;
  dirtySince: number | null;
  changeKinds: EditChangeKind[];
  tweakSummaryLines?: string[];
  tweakBaselineValues?: CommentaryTweakValues | null;
  tweakCurrentValues?: CommentaryTweakValues | null;
  styleSummaryLines: string[];
  textSummary: string | null;
  classSummaryLines: string[];
  voiceCreateOperationId?: string;
  voiceElementKey?: string;
  voiceTargetRef?: string;
  voiceTarget?: CommentaryPageElementSummary;
  anchorPlacement?: 'target';
}

export interface DeleteElementAnnotationLink {
  transactionId: string;
  transactionElementKey: WebEditorElementKey;
  parentElementKey: WebEditorElementKey;
  parentElement: Element;
  parentLocator: ElementLocator;
  baseNote: string;
  annotationNote: string;
  createdAt: number;
  active: boolean;
}

function generateCommentId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10).join(''),
    ].join('-');
  }

  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function ensureElementEditCommentId(meta: ElementEditMeta): string {
  meta.commentId ??= generateCommentId();
  return meta.commentId;
}

export interface EditorRuntimeState {
  active: boolean;
  /** When true the editor is running in property-panel-only mode (no interaction). */
  panelOnlyMode: boolean;
  shadowHost: ShadowHostManager | null;
  canvasOverlay: CanvasOverlay | null;
  handlesController: HandlesController | null;
  parentSelectController: ParentSelectCornerController | null;
  eventController: EventController | null;
  positionTracker: PositionTracker | null;
  selectionEngine: SelectionEngine | null;
  dragReorderController: DragReorderController | null;
  transactionManager: TransactionManager | null;
  breadcrumbs: Breadcrumbs | null;
  propertyPanel: PropertyPanel | null;
  tokensService: DesignTokensService | null;
  perfMonitor: PerfMonitor | null;
  perfHotkeyCleanup: (() => void) | null;
  deleteElementHotkeyCleanup: (() => void) | null;
  selectionModeHotkeyCleanup: (() => void) | null;
  parentSelectHotkeyCleanup: (() => void) | null;
  commentShortcutCleanup: (() => void) | null;
  hoveredElement: Element | null;
  pendingHoverTransition: boolean;
  selectedElement: Element | null;
  initialSelectionElement: Element | null;
  selectionAnchor: MarkerAnchor | null;
  commentEntryMode: CommentEntryMode;
  commentShortcutSettings: CommentShortcutSettings;
  commentShortcutDialogOpen: boolean;
  propertyPanelPosition: { left: number; top: number } | null;
  uiResizeCleanup: (() => void) | null;
  editMetaByKey: Map<WebEditorElementKey, ElementEditMeta>;
  deleteElementAnnotationsByTransactionId: Map<string, DeleteElementAnnotationLink>;
  processedEditTimestampsByKey: Map<WebEditorElementKey, number>;
  pendingMarkerAnchors: Map<WebEditorElementKey, MarkerAnchor>;
  markerLayer: HTMLElement | null;
  changeMarkersVisible: boolean;
  selectionChromeVisible: boolean;
  inlineTextEditingActive: boolean;
  promptCardVisible: boolean;
  uiSettings: WebEditorUiSettings;
  agentConversationByScopeKey: Map<string, PageAgentConversationState>;
  agentTaskByElementKey: Map<WebEditorElementKey, ElementAgentTaskState>;
  agentTaskByRequestId: Map<string, ElementAgentTaskState>;
  externalEditingTaskByElementKey: Map<WebEditorElementKey, ElementAgentTaskState>;
  textCommentManager: TextCommentManager | null;
  textCommentTargetElement: HTMLElement | null;
  activeTextComment: TextComment | null;
  annotationBridgeSelection: AnnotationBridgeSelection | null;
}

export const DEFAULT_MODIFIERS = {
  alt: false,
  shift: false,
  ctrl: false,
  meta: false,
} as const;

export const DEFAULT_AGENT_PROBE_TIMEOUT_MS = 5_000;

function generateExternalClientId(): string {
  const prefix = 'web-editor-v2';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function resolveWebEditorOptions(
  options: WebEditorV2InitOptions = {},
): ResolvedWebEditorOptions {
  return {
    ui: {
      breadcrumbs: true,
      propertyPanel: true,
      toolbarMode: 'inline',
      enableImageAttachments: true,
      onPrepareImageAttachments: async (_element, images) => images,
      initialSelectionModeActive: true,
      initialDarkMode: false,
      showCopyPromptAction: true,
      hideExecutionControls: false,
      hideCurrentElementExecutionAction: false,
      hostSurfaceVisibilityControl: null,
      aiExecutionConfigSummary: '',
      aiExecutionConfigConfigured: false,
      aiExecutionProvider: '',
      aiExecutionWorkspacePath: '',
      aiExecutionRunConcurrency: 5,
      aiExecutionProviderOptions: [],
      htmlFileSaveEnabled: false,
      pageEditingSettingsAvailable: true,
      getAcpUiConnected: undefined,
      getAssistantPanelOpen: () => false,
      onHostToolbarAction: async () => false,
      onEnableAnnotation: async () => false,
      getAnnotationEnabled: () => false,
      getAnnotationEnableAvailable: () => false,
      getAnnotationEnableLoading: () => false,
      markdownSourceEditorAvailable: false,
      getMarkdownSourceEditorOpen: () => false,
      onMarkdownSourceEditorOpenChange: async () => false,
      externalEditingStatusDescription: '',
      skillInstallSource: '',
      commentarySkillOptions: [],
      commentarySelectedSkillIds: [],
      commentarySkillSettingsConfigured: false,
      onRequestFullExit: async () => undefined,
      ...(options.ui ?? {}),
    },
    host: {
      getResourceContext: options.host?.getResourceContext ?? (() => null),
      buildCopyPrompt: options.host?.buildCopyPrompt ?? undefined,
      getCurrentHoveredElement: options.host?.getCurrentHoveredElement ?? undefined,
      getElementTools: options.host?.getElementTools ?? undefined,
      onElementToolAction: options.host?.onElementToolAction ?? undefined,
      shouldAllowPageEvent: options.host?.shouldAllowPageEvent ?? undefined,
      getPersistenceScope: options.host?.getPersistenceScope ?? undefined,
      persistenceAdapter: options.host?.persistenceAdapter ?? undefined,
      conversationTaskTransport: options.host?.conversationTaskTransport ?? undefined,
      commentPersistenceMode: options.host?.commentPersistenceMode ?? 'local',
      canEditAnnotationMarkdown: options.host?.canEditAnnotationMarkdown ?? undefined,
      showAnnotationMarkdownEditor: options.host?.showAnnotationMarkdownEditor ?? true,
      getCreateAnnotationBlockReason: options.host?.getCreateAnnotationBlockReason ?? undefined,
      annotationMarkdownEditorKind: options.host?.annotationMarkdownEditorKind ?? 'annotation',
      getAnnotationDocumentEditUrl: options.host?.getAnnotationDocumentEditUrl ?? undefined,
      getAnnotationMarkdown: options.host?.getAnnotationMarkdown ?? undefined,
      onAnnotationMarkdownChange: options.host?.onAnnotationMarkdownChange ?? undefined,
      onDeleteAnnotationNode: options.host?.onDeleteAnnotationNode ?? undefined,
    },
    agentBridge: {
      enabled: false,
      autoStartOnLaunch: true,
      allowWake: true,
      enableContextAppend: true,
      targetOrigin: '*',
      preferCurrentSession: false,
      apiBaseUrl: '',
      integrationChannel: '',
      targetClientId: '',
      externalClientId: generateExternalClientId(),
      apiKey: '',
      probeOnStart: true,
      probeTimeoutMs: DEFAULT_AGENT_PROBE_TIMEOUT_MS,
      projectPath: '',
      provider: 'codex',
      onRequestWake: async () => undefined,
      ...(options.agentBridge ?? {}),
    },
    promptContext: {
      workspacePaths: options.promptContext?.workspacePaths ?? [],
      relatedFiles: options.promptContext?.relatedFiles ?? [],
      extraContext: options.promptContext?.extraContext ?? [],
    },
    integrationWs: {
      enabled: false,
      apiBaseUrl: '',
      channel: '',
      clientId: '',
      sessionId: '',
      pageUrl: '',
      apiKey: '',
      source: '',
      ...(options.integrationWs ?? {}),
    },
    interactionProfile: options.interactionProfile ?? 'design',
    mobileMode: typeof options.mobileMode === 'boolean' ? options.mobileMode : undefined,
  };
}

export function createEditorRuntimeState(): EditorRuntimeState {
  return {
    active: false,
    panelOnlyMode: false,
    shadowHost: null,
    canvasOverlay: null,
    handlesController: null,
    parentSelectController: null,
    eventController: null,
    positionTracker: null,
    selectionEngine: null,
    dragReorderController: null,
    transactionManager: null,
    breadcrumbs: null,
    propertyPanel: null,
    tokensService: null,
    perfMonitor: null,
    perfHotkeyCleanup: null,
    deleteElementHotkeyCleanup: null,
    selectionModeHotkeyCleanup: null,
    parentSelectHotkeyCleanup: null,
    commentShortcutCleanup: null,
    hoveredElement: null,
    pendingHoverTransition: false,
    selectedElement: null,
    initialSelectionElement: null,
    selectionAnchor: null,
    commentEntryMode: 'bubble-card',
    commentShortcutSettings: { ...DEFAULT_COMMENT_SHORTCUT_SETTINGS },
    commentShortcutDialogOpen: false,
    propertyPanelPosition: null,
    uiResizeCleanup: null,
    editMetaByKey: new Map(),
    deleteElementAnnotationsByTransactionId: new Map(),
    processedEditTimestampsByKey: new Map(),
    pendingMarkerAnchors: new Map(),
    markerLayer: null,
    changeMarkersVisible: true,
    selectionChromeVisible: true,
    inlineTextEditingActive: false,
    promptCardVisible: false,
    uiSettings: { ...DEFAULT_WEB_EDITOR_UI_SETTINGS },
    agentConversationByScopeKey: new Map(),
    agentTaskByElementKey: new Map(),
    agentTaskByRequestId: new Map(),
    externalEditingTaskByElementKey: new Map(),
    textCommentManager: null,
    textCommentTargetElement: null,
    activeTextComment: null,
    annotationBridgeSelection: null,
  };
}

export function clearAnnotationBridgeSelection(state: EditorRuntimeState): void {
  const selection = state.annotationBridgeSelection;
  if (!selection) return;
  selection.bridge.closeTarget(selection.target);
  state.annotationBridgeSelection = null;
}

export function resetEditorTransientState(state: EditorRuntimeState): void {
  clearAnnotationBridgeSelection(state);
  state.editMetaByKey.clear();
  state.deleteElementAnnotationsByTransactionId.clear();
  state.processedEditTimestampsByKey.clear();
  state.pendingMarkerAnchors.clear();
  state.markerLayer = null;
  state.hoveredElement = null;
  state.selectedElement = null;
  state.initialSelectionElement = null;
  state.selectionAnchor = null;
  state.pendingHoverTransition = false;
  state.commentShortcutDialogOpen = false;
  state.inlineTextEditingActive = false;
  state.promptCardVisible = false;
  state.agentConversationByScopeKey.clear();
  state.agentTaskByElementKey.clear();
  state.agentTaskByRequestId.clear();
  state.externalEditingTaskByElementKey.clear();
  state.textCommentTargetElement = null;
  state.activeTextComment = null;
}

export function clearEditorRuntimeRefs(state: EditorRuntimeState): void {
  clearAnnotationBridgeSelection(state);
  state.shadowHost = null;
  state.canvasOverlay = null;
  state.handlesController = null;
  state.parentSelectController = null;
  state.eventController = null;
  state.positionTracker = null;
  state.selectionEngine = null;
  state.dragReorderController = null;
  state.transactionManager = null;
  state.breadcrumbs = null;
  state.propertyPanel = null;
  state.tokensService = null;
  state.perfMonitor = null;
  state.perfHotkeyCleanup = null;
  state.deleteElementHotkeyCleanup = null;
  state.selectionModeHotkeyCleanup = null;
  state.parentSelectHotkeyCleanup = null;
  state.commentShortcutCleanup = null;
  state.uiResizeCleanup = null;
  state.markerLayer = null;
  state.hoveredElement = null;
  state.selectedElement = null;
  state.initialSelectionElement = null;
  state.selectionAnchor = null;
  state.pendingHoverTransition = false;
  state.commentShortcutDialogOpen = false;
  state.promptCardVisible = false;
  state.agentConversationByScopeKey.clear();
  state.agentTaskByElementKey.clear();
  state.agentTaskByRequestId.clear();
  state.externalEditingTaskByElementKey.clear();
  state.textCommentManager = null;
  state.textCommentTargetElement = null;
  state.activeTextComment = null;
  state.pendingMarkerAnchors.clear();
  state.editMetaByKey.clear();
  state.deleteElementAnnotationsByTransactionId.clear();
  state.processedEditTimestampsByKey.clear();
}

export function getProcessedEditTimestamp(
  state: EditorRuntimeState,
  elementKey: WebEditorElementKey,
): number | null {
  const value = state.processedEditTimestampsByKey.get(elementKey);
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function shouldIgnoreProcessedEdit(
  state: EditorRuntimeState,
  elementKey: WebEditorElementKey,
  updatedAt: number | null | undefined,
): boolean {
  const processedAt = getProcessedEditTimestamp(state, elementKey);
  if (processedAt === null) return false;
  const nextUpdatedAt = Number(updatedAt ?? 0);
  return Number.isFinite(nextUpdatedAt) ? nextUpdatedAt <= processedAt : false;
}

export function filterUnprocessedTransactions(
  state: EditorRuntimeState,
  transactions: readonly Transaction[],
): Transaction[] {
  return transactions.filter((tx) => {
    const resolvedKey = String(tx.elementKey ?? locatorKey(tx.targetLocator)).trim();
    if (!resolvedKey) return true;
    return !shouldIgnoreProcessedEdit(state, resolvedKey, Number(tx.timestamp ?? 0));
  });
}

export type EditorApiFactory = (options?: CommentaryInitOptions) => CommentaryApi;
export type EditorStateGetter = () => CommentaryState;
export type EditorRevertHandler = (
  elementKey: WebEditorElementKey,
) => Promise<WebEditorRevertElementResponse>;
