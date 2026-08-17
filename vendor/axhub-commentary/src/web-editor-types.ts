import type { WebEditorAgentProvider } from './core/editor/ui-settings';
import type { CommentaryTweakValues } from './tweak/protocol';
import type { AcpRuntimeEventStatus } from './acp-runtime-events';

/**
 * Web Editor V2 - Shared Type Definitions
 *
 * This module defines types shared between:
 * - Background script (injection control)
 * - Inject script (web-editor-v2.ts)
 * - Future: UI panels
 */

// =============================================================================
// Editor State
// =============================================================================

/** Current state of the web editor */
export interface WebEditorState {
  /** Whether the editor is currently active */
  active: boolean;
  /** Whether the editor is in property-panel-only mode (no interaction) */
  panelOnlyMode?: boolean;
  /** Editor version for compatibility checks */
  version: 2;
}

// =============================================================================
// Message Protocol (Background <-> Inject Script)
// =============================================================================

/**
 * Action types for web editor V2 messages
 *
 * IMPORTANT: V2 uses versioned action names (suffix _v2) to avoid
 * conflicts with V1 when both scripts might be injected in the same tab.
 * This prevents double-response race conditions.
 *
 * V1 uses: web_editor_ping, web_editor_toggle, etc.
 * V2 uses: web_editor_ping_v2, web_editor_toggle_v2, etc.
 */
export const WEB_EDITOR_V2_ACTIONS = {
  /** Check if V2 editor is injected and get status */
  PING: 'web_editor_ping_v2',
  /** Toggle V2 editor on/off */
  TOGGLE: 'web_editor_toggle_v2',
  /** Start V2 editor */
  START: 'web_editor_start_v2',
  /** Stop V2 editor */
  STOP: 'web_editor_stop_v2',
  /** Highlight an element (from sidepanel hover) */
  HIGHLIGHT_ELEMENT: 'web_editor_highlight_element_v2',
  /** Revert an element to its original state (Phase 2 - Selective Undo) */
  REVERT_ELEMENT: 'web_editor_revert_element_v2',
  /** Clear selection (from sidepanel after send) */
  CLEAR_SELECTION: 'web_editor_clear_selection_v2',
} as const;

/**
 * Legacy V1 action types (for reference and background compatibility)
 * These are used when USE_WEB_EDITOR_V2 is false
 */
export const WEB_EDITOR_V1_ACTIONS = {
  PING: 'web_editor_ping',
  TOGGLE: 'web_editor_toggle',
  START: 'web_editor_start',
  STOP: 'web_editor_stop',
  APPLY: 'web_editor_apply',
} as const;

export type WebEditorV2Action = (typeof WEB_EDITOR_V2_ACTIONS)[keyof typeof WEB_EDITOR_V2_ACTIONS];
export type WebEditorV1Action = (typeof WEB_EDITOR_V1_ACTIONS)[keyof typeof WEB_EDITOR_V1_ACTIONS];

/** Editor version literal type */
export type WebEditorVersion = 1 | 2;

/** Ping request (V2) */
export interface WebEditorV2PingRequest {
  action: typeof WEB_EDITOR_V2_ACTIONS.PING;
}

/** Ping response (V2) */
export interface WebEditorV2PingResponse {
  status: 'pong';
  active: boolean;
  version: 2;
}

/** Toggle request (V2) */
export interface WebEditorV2ToggleRequest {
  action: typeof WEB_EDITOR_V2_ACTIONS.TOGGLE;
}

/** Toggle response (V2) */
export interface WebEditorV2ToggleResponse {
  active: boolean;
}

/** Start request (V2) */
export interface WebEditorV2StartRequest {
  action: typeof WEB_EDITOR_V2_ACTIONS.START;
}

/** Start response (V2) */
export interface WebEditorV2StartResponse {
  active: boolean;
}

/** Stop request (V2) */
export interface WebEditorV2StopRequest {
  action: typeof WEB_EDITOR_V2_ACTIONS.STOP;
}

/** Stop response (V2) */
export interface WebEditorV2StopResponse {
  active: boolean;
}

/** Union types for V2 type-safe message handling */
export type WebEditorV2Request =
  | WebEditorV2PingRequest
  | WebEditorV2ToggleRequest
  | WebEditorV2StartRequest
  | WebEditorV2StopRequest;

export type WebEditorV2Response =
  | WebEditorV2PingResponse
  | WebEditorV2ToggleResponse
  | WebEditorV2StartResponse
  | WebEditorV2StopResponse;

// =============================================================================
// Element Locator (Phase 1 - Basic Structure)
// =============================================================================

/**
 * Framework debug source information
 * Extracted from React Fiber or Vue component instance
 */
export interface DebugSource {
  /** Source file path */
  file: string;
  /** Line number (1-based) */
  line?: number;
  /** Column number (1-based) */
  column?: number;
  /** Component name (if available) */
  componentName?: string;
}

/**
 * Element Locator - Primary key for element identification
 *
 * Uses multiple strategies to locate elements, supporting:
 * - HMR/DOM changes recovery
 * - Cross-session persistence
 * - Framework-agnostic identification
 */
export interface ElementLocator {
  /** CSS selector candidates (ordered by specificity) */
  selectors: string[];
  /** Structural fingerprint for similarity matching */
  fingerprint: string;
  /** Framework debug information (React/Vue) */
  debugSource?: DebugSource;
  /** DOM tree path (child indices from root) */
  path: number[];
  /** iframe selector chain (from top to target frame) - Phase 4 */
  frameChain?: string[];
  /** Shadow DOM host selector chain - Phase 2 */
  shadowHostChain?: string[];
  /** Direct text-node fragment inside the located parent element. */
  textFragment?: TextFragmentLocator;
}

/** Stable address for a direct text node edited as its own inline fragment. */
export interface TextFragmentLocator {
  /** Index in parent.childNodes; unchanged when the text node is replaced by its wrapper. */
  childNodeIndex: number;
}

// =============================================================================
// Transaction System (Phase 1 - Basic Structure, Low Priority)
// =============================================================================

/** Transaction operation types */
export type TransactionType = 'style' | 'text' | 'class' | 'move' | 'structure';

/**
 * Transaction snapshot for undo/redo
 * Captures element state before/after changes
 */
export interface TransactionSnapshot {
  /** Element locator for re-identification */
  locator: ElementLocator;
  /** innerHTML snapshot (for structure changes) */
  html?: string;
  /** Changed style properties */
  styles?: Record<string, string>;
  /** Computed style values before change (for prompt display) */
  computedStyles?: Record<string, string>;
  /** Class list tokens (from `class` attribute) */
  classes?: string[];
  /** Text content */
  text?: string;
}

/**
 * Move position data
 * Captures a concrete insertion point under a parent element
 */
export interface MoveOperationData {
  /** Target parent element locator */
  parentLocator: ElementLocator;
  /** Insert position index (among element children) */
  insertIndex: number;
  /** Anchor sibling element locator (for stable positioning) */
  anchorLocator?: ElementLocator;
  /** Position relative to anchor */
  anchorPosition: 'before' | 'after';
}

/**
 * Move transaction data
 * Captures both source and destination for undo/redo
 */
export interface MoveTransactionData {
  /** Original location before move */
  from: MoveOperationData;
  /** Target location after move */
  to: MoveOperationData;
}

/**
 * Structure operation data
 * For wrap/unwrap/delete/duplicate operations (Phase 5.5)
 */
export interface StructureOperationData {
  /** Structure action type */
  action: 'wrap' | 'unwrap' | 'delete' | 'duplicate';
  /** Wrapper tag for wrap/unwrap actions */
  wrapperTag?: string;
  /** Wrapper inline styles for wrap/unwrap actions */
  wrapperStyles?: Record<string, string>;
  /**
   * Deterministic insertion position for undo/redo.
   * Required for delete (restore) and duplicate (re-create).
   */
  position?: MoveOperationData;
  /**
   * Serialized element HTML for undo/redo.
   * Must be a single-root element outerHTML string.
   * Used by delete (restore original) and duplicate (re-create clone).
   */
  html?: string;
}

/**
 * Transaction record for undo/redo system
 */
export interface Transaction {
  /** Unique transaction ID */
  id: string;
  /** Operation type */
  type: TransactionType;
  /** Target element locator */
  targetLocator: ElementLocator;
  /**
   * Stable element identifier for cross-transaction grouping.
   * Used by AgentChat integration for element chips aggregation.
   * Optional for backward compatibility with existing transactions.
   */
  elementKey?: string;
  /** State before change */
  before: TransactionSnapshot;
  /** State after change */
  after: TransactionSnapshot;
  /** Move-specific data */
  moveData?: MoveTransactionData;
  /** Structure-specific data */
  structureData?: StructureOperationData;
  /** Timestamp */
  timestamp: number;
  /** Whether merged with previous transaction */
  merged: boolean;
}

// =============================================================================
// AgentChat Integration Types (Phase 1.1)
// =============================================================================

/** Stable element identifier for aggregating transactions across UI contexts */
export type WebEditorElementKey = string;

/**
 * Net effect payload for a single element aggregated from the undo stack.
 * Designed to be directly consumable by prompt builders.
 */
export interface NetEffectPayload {
  /** Stable element key */
  elementKey: WebEditorElementKey;
  /** Locator snapshot for element re-identification */
  locator: ElementLocator;
  /**
   * Aggregated style changes (first before -> last after).
   * Contains ONLY the affected properties, not a full style snapshot.
   * Empty string value means the property was removed/unset.
   */
  styleChanges?: {
    before: Record<string, string>;
    after: Record<string, string>;
  };
  /** Aggregated text change (first before -> last after) */
  textChange?: {
    before: string;
    after: string;
  };
  /** Aggregated class changes (first before -> last after) */
  classChanges?: {
    before: string[];
    after: string[];
  };
}

/** High-level change category for UI display */
export type ElementChangeType = 'style' | 'text' | 'class' | 'mixed';

/**
 * Element change summary for Chips rendering in AgentChat.
 * Aggregates multiple transactions for the same element.
 */
export interface ElementChangeSummary {
  /** Stable element identifier */
  elementKey: WebEditorElementKey;
  /** Short label for Chips display (e.g., "button#submit") */
  label: string;
  /** Full label for tooltips with more context */
  fullLabel: string;
  /** Locator snapshot for highlighting and element recovery */
  locator: ElementLocator;
  /** High-level change category */
  type: ElementChangeType;
  /** Detailed change statistics for UI tooltips */
  changes: {
    style?: {
      /** Number of new style properties added */
      added: number;
      /** Number of style properties removed */
      removed: number;
      /** Number of style properties modified */
      modified: number;
      /** List of affected style property names */
      details: string[];
    };
    text?: {
      /** Truncated preview of original text */
      beforePreview: string;
      /** Truncated preview of new text */
      afterPreview: string;
    };
    class?: {
      /** Classes added */
      added: string[];
      /** Classes removed */
      removed: string[];
    };
  };
  /** Contributing transaction IDs in chronological order */
  transactionIds: string[];
  /** Net effect payload for batch Apply */
  netEffect: NetEffectPayload;
  /** Timestamp of the most recent transaction */
  updatedAt: number;
  /** Debug source information if available */
  debugSource?: DebugSource;
}

/** Action types for TX change events */
export type WebEditorTxChangeAction = 'push' | 'merge' | 'undo' | 'redo' | 'clear' | 'rollback';

/**
 * TX change broadcast payload sent to Sidepanel/AgentChat.
 * Emitted when the undo stack changes (push, undo, redo, clear).
 */
export interface WebEditorTxChangedPayload {
  /** Source tab ID for multi-tab isolation */
  tabId: number;
  /** Action that triggered this change (for UI animations/incremental updates) */
  action: WebEditorTxChangeAction;
  /** Aggregated element-level summaries from the current undo stack */
  elements: ElementChangeSummary[];
  /** Current undo stack size */
  undoCount: number;
  /** Current redo stack size */
  redoCount: number;
  /** Whether there are applicable changes (style/text/class) */
  hasApplicableChanges: boolean;
  /** Page URL for context */
  pageUrl?: string;
}

/**
 * Batch Apply payload sent from web-editor to background.
 */
export interface WebEditorApplyBatchPayload {
  /** Source tab ID */
  tabId: number;
  /** Element changes to apply */
  elements: ElementChangeSummary[];
  /** Element keys excluded by user */
  excludedKeys: WebEditorElementKey[];
  /** Page URL for context */
  pageUrl?: string;
}

/**
 * Highlight element request sent from AgentChat to the active tab.
 */
export interface WebEditorHighlightElementPayload {
  /** Target tab ID */
  tabId: number;
  /** Element key to highlight */
  elementKey: WebEditorElementKey;
  /** Locator for element identification */
  locator: ElementLocator;
  /** Highlight mode: 'hover' to show, 'clear' to hide */
  mode: 'hover' | 'clear';
}

/**
 * Revert element request sent from AgentChat to the active tab.
 * Used for Phase 2 - Selective Undo (reverting individual element changes).
 */
export interface WebEditorRevertElementPayload {
  /** Target tab ID */
  tabId: number;
  /** Element key to revert */
  elementKey: WebEditorElementKey;
}

/**
 * Revert element response from content script.
 */
export interface WebEditorRevertElementResponse {
  /** Whether the revert was successful */
  success: boolean;
  /** What was reverted (for UI feedback) */
  reverted?: {
    style?: boolean;
    text?: boolean;
    class?: boolean;
  };
  /** Error message if revert failed */
  error?: string;
}

export interface CommentaryHostResource {
  kind: string;
  id?: string;
  path?: string;
  url?: string;
  /**
   * Extensible metadata bag. The following keys are recognized by the prompt builder:
   *
   * - `filePath` — Real file path of the current page (e.g. `src/components/Button/index.tsx`).
   *   Legacy alias: `currentFilePath` (still supported for backward compatibility).
   * - `docPath` — Alias for `filePath` when the resource is a document.
   * - `prototypeFilePath` — Path to the corresponding prototype/spec file.
   * - `targetPath` — Relative project path segment (e.g. `components/Button`).
   * - `projectPath` — Absolute or relative project root path.
   * - `title` — Human-readable page title.
   * - `storageScope` — Override key for localStorage isolation.
   */
  meta?: Record<string, unknown>;
}

export type PrototypeEditCommentStatus = 'idle' | 'editing' | 'completed' | 'error';
export type CommentaryExternalEditingState = PrototypeEditCommentStatus;

export interface CommentaryExternalEditingTaskRef {
  provider: string | null;
  sessionId: string | null;
  requestId: string | null;
  error?: string | null;
  code?: string | null;
  output?: string | null;
  chunk?: unknown;
  details?: unknown;
}

export interface CommentaryExternalEditingTargetRef {
  locator?: ElementLocator | null;
  label?: string | null;
}

export interface CommentaryExternalEditingStateResult {
  elementKey: WebEditorElementKey;
  state: CommentaryExternalEditingState;
  applied: boolean;
  taskRef?: CommentaryExternalEditingTaskRef | null;
}

export type CommentaryClearEditsScope = 'page' | 'prototype';
export type CommentaryClearEditsTarget = 'completed' | 'all';

export interface CommentaryClearEditsOptions {
  skipConfirm?: boolean;
  scope?: CommentaryClearEditsScope;
  target?: CommentaryClearEditsTarget;
}

export interface PrototypeEditCommentTweakEntry {
  summaryLines?: string[];
  baselineValues?: CommentaryTweakValues | null;
  currentValues?: CommentaryTweakValues | null;
}

export interface PrototypeEditCommentMarkerEntry {
  clientX: number;
  clientY: number;
  documentX: number;
  documentY: number;
  xPercent: number;
  y: number;
  isFixed: boolean;
  offsetX?: number;
  offsetY?: number;
  dirtySince?: number | null;
}

export interface PrototypeEditCommentEntry {
  id: string;
  deletedAt?: number | null;
  pageScope?: string;
  state: PrototypeEditCommentStatus;
  provider?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  updatedAt?: number | null;
  message?: string | null;
  code?: string | null;
  label?: string;
  locator: ElementLocator;
  textChange?: { before: string; after: string };
  styleChanges?: {
    before: Record<string, string>;
    after: Record<string, string>;
  };
  tweak?: PrototypeEditCommentTweakEntry;
  comment?: string;
  skillIds?: string[];
  marker?: PrototypeEditCommentMarkerEntry | null;
  /** Host-only idempotency key for a voice-created comment. */
  voiceCreateOperationId?: string;
  voiceExecuteOperationId?: string;
  voiceExecutionPreparedAt?: number;
  voiceCancelOperationId?: string;
  voiceCancelPreparedOperationId?: string;
  voiceStatus?: string;
  linkedAnnotationId?: string;
  latestExecution?: {
    executionId: string;
    status: string;
    phase?: string;
    updatedAt?: number | null;
  };
  voiceElementKey?: string;
  voiceTargetRef?: string;
  voiceTarget?: CommentaryPageElementSummary;
  anchorPlacement?: 'target';
}

export interface PrototypeEditCommentImageEntry {
  id: string;
  commentId: string;
  source?: CommentaryImageSource;
  deletedAt?: number | null;
  pageScope?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  createdAt?: number;
  assetPath?: string;
  data?: string;
}

export type CommentaryImageSource = 'user' | 'target-screenshot';

export interface PrototypeEditCommentsDocument {
  schemaVersion: 3;
  kind: 'prototype-edit-comments' | 'document-edit-comments';
  resource: {
    id: string;
    targetPath: string;
    filePath: string;
  };
  comments: PrototypeEditCommentEntry[];
  images: PrototypeEditCommentImageEntry[];
}

export interface PrototypeEditCommentsPersistenceScope {
  targetPath: string;
  storageScope: string;
  prototypeId: string;
  filePath: string;
  resource: CommentaryHostResource | null;
  /** Identifies document-backed comments; omitted for prototype comments. */
  documentKind?: 'prototype' | 'document';
}

export type PrototypeEditCommentsWriteReason = 'changes' | 'restore' | 'clear' | 'state';

interface PrototypeEditCommentTombstoneBase {
  commentId: string;
  deletedAt: number;
}

export interface PrototypeEditCommentEntryTombstone extends PrototypeEditCommentTombstoneBase {
  kind: 'comment';
}

export interface PrototypeEditCommentImageTombstone extends PrototypeEditCommentTombstoneBase {
  kind: 'image';
  id: string;
}

export type PrototypeEditCommentTombstone =
  | PrototypeEditCommentEntryTombstone
  | PrototypeEditCommentImageTombstone;

export interface PrototypeEditCommentsWriteContext {
  observedTombstones?: PrototypeEditCommentTombstone[];
}

export interface PrototypeEditCommentsPersistenceAdapter {
  read(
    scope: PrototypeEditCommentsPersistenceScope,
  ): PrototypeEditCommentsDocument | null | Promise<PrototypeEditCommentsDocument | null>;
  write(
    scope: PrototypeEditCommentsPersistenceScope,
    document: PrototypeEditCommentsDocument,
    reason: PrototypeEditCommentsWriteReason,
    context?: PrototypeEditCommentsWriteContext,
  ): void | Promise<void>;
}

export interface CommentaryModifiedElementSummary {
  /** Stable persisted comment identity used by host-managed execution. */
  commentId?: string;
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
  label: string;
  note: string;
  skillIds?: string[];
  imageCount: number;
  changeKinds: Array<'text' | 'tweak' | 'style' | 'class'>;
}

export interface CommentaryTextChange {
  before: string;
  after: string;
}

export interface CommentaryTargetedTextChange extends CommentaryTextChange {
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
}

export interface CommentaryStyleChangeSet {
  cssText: string;
}

export interface CommentaryEditedSnapshot {
  resource: CommentaryHostResource | null;
  selectedElement: SelectedElementSummary | null;
  modifiedElements: CommentaryModifiedElementSummary[];
  textChanges: CommentaryTextChange[];
  targetedTextChanges?: CommentaryTargetedTextChange[];
  styleChanges: CommentaryStyleChangeSet;
}

export type CommentaryToolbarMode = 'inline' | 'host';

export interface CommentaryHostToolbarAgentOption {
  value: WebEditorAgentProvider | null;
  label: string;
  disabled?: boolean;
}

export interface CommentaryHostSurfaceVisibilityControl {
  initialVisible?: boolean;
  showTitle?: string;
  hideTitle?: string;
}

export interface CommentaryAiExecutionProviderOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CommentarySkillOption {
  id: string;
  label: string;
  description?: string;
  sourceUrl?: string;
  prompt?: string;
  custom?: boolean;
}

export interface CommentarySkillSettingsSnapshot {
  selectedSkillIds: string[];
  skillOptions: CommentarySkillOption[];
}

export type CommentaryAnnotationSaveStatus = 'saving' | 'saved' | 'unsaved';

export interface CommentaryHostToolbarState {
  toolbarMode: CommentaryToolbarMode;
  visible: boolean;
  robotState: 'sleeping' | 'waking' | 'awake' | 'working';
  robotTitle: string;
  robotDisabled: boolean;
  robotLoading: boolean;
  sendVisible: boolean;
  sendTitle: string;
  sendDisabled: boolean;
  sendLoading: boolean;
  interruptVisible: boolean;
  interruptTitle: string;
  interruptDisabled: boolean;
  interruptLoading: boolean;
  copyPromptVisible: boolean;
  copyPromptTitle: string;
  copyPromptDisabled: boolean;
  clearEditsTitle: string;
  clearEditsDisabled: boolean;
  propertyPanelVisible: boolean;
  propertyPanelOpen: boolean;
  propertyPanelTitle: string;
  modifiedCount: number;
  terminalTaskCount: number;
  annotationSaveStatus?: CommentaryAnnotationSaveStatus;
  selectedAgent: WebEditorAgentProvider | null;
  agentOptions: CommentaryHostToolbarAgentOption[];
  aiExecutionConfigSummary: string;
  aiExecutionConfigConfigured: boolean;
  aiExecutionProvider: string;
  aiExecutionWorkspacePath: string;
  aiExecutionRunConcurrency: number;
  aiExecutionProviderOptions: CommentaryAiExecutionProviderOption[];
  darkMode: boolean;
  disablePageAnimations: boolean;
  captureTargetScreenshotAvailable: boolean;
  captureTargetScreenshot: boolean;
  pageZoomEnabled: boolean;
  copySkillInstallPromptDisabled: boolean;
  selectionModeActive: boolean;
  fullExitAvailable: boolean;
  annotationEnabled: boolean;
  annotationEnableAvailable: boolean;
  annotationEnableLoading: boolean;
  annotationEnableDisabled: boolean;
  annotationEnableTitle: string;
}

export type CommentaryHostToolbarAction =
  | { type: 'wake-agent' }
  | ({
      type: 'send-to-agent';
      /** Real persisted comment identity; execution hosts must not infer a prompt-only task. */
      commentId?: string;
      elementKey?: WebEditorElementKey;
      pane?: 'primary' | 'secondary';
      promptText?: string;
    } & CommentaryExternalEditingTargetRef)
  | { type: 'interrupt-agent' }
  | { type: 'copy-prompt'; clipboard?: 'host' }
  | ({ type: 'clear-edits' } & CommentaryClearEditsOptions)
  | { type: 'toggle-property-panel'; open?: boolean }
  | { type: 'set-active-agent'; agent: WebEditorAgentProvider | null }
  | { type: 'get-ai-execution-config'; preferAcpDefaultWorkspace?: boolean }
  | {
      type: 'set-ai-execution-config';
      provider?: string;
      workspacePath?: string;
      runConcurrency?: number;
    }
  | { type: 'browse-ai-execution-directories'; path?: string }
  | { type: 'list-ai-execution-recent-workspaces' }
  | { type: 'record-ai-execution-recent-workspace'; path: string }
  | { type: 'remove-ai-execution-recent-workspace'; path: string }
  | { type: 'get-acp-ui-status' }
  | { type: 'play-notification-sound'; sound: 'reminder' | 'completion' }
  | { type: 'save-html-all' }
  | { type: 'save-html-text' }
  | { type: 'save-html-style' }
  | { type: 'clear-html-style' }
  | { type: 'disconnect-agent' }
  | { type: 'copy-skill-install-prompt' }
  | { type: 'copy-global-panel-prompt' }
  | { type: 'toggle-dark-mode'; darkMode?: boolean }
  | { type: 'toggle-page-animations' }
  | { type: 'toggle-target-screenshot'; enabled?: boolean }
  | { type: 'toggle-page-zoom' }
  | { type: 'toggle-selection-mode'; active?: boolean }
  | { type: 'set-host-surface-visibility'; visible: boolean }
  | { type: 'enable-annotation' }
  | { type: 'open-keyboard-shortcuts' }
  | { type: 'full-exit' };

export type CommentaryHostToolbarActionResult = boolean | Record<string, unknown>;

export type CommentaryHostToolbarStateListener = (state: CommentaryHostToolbarState) => void;

/**
 * Structured context passed to the host's `buildCopyPrompt` callback.
 * Includes all data the host needs to build a fully customized prompt.
 */
export interface CommentaryCopyPromptContext {
  /** Current page resource context */
  resource: CommentaryHostResource | null;
  /** Modified element summaries */
  modifiedElements: CommentaryModifiedElementSummary[];
  /** Aggregated text changes */
  textChanges: CommentaryTextChange[];
  /** Aggregated style changes */
  styleChanges: CommentaryStyleChangeSet;
  /** Task context for prompt generation */
  taskContext: {
    pageUrl: string;
    targetPath: string;
    /**
     * Real file path of the current page.
     * Renamed from `currentFilePath` in v2026-04-06.
     */
    filePath: string;
    prototypeFilePath: string;
    /**
     * @deprecated Use `filePath` instead. Kept for backward compatibility.
     */
    currentFilePath?: string;
  };
  /** The default prompt generated by the editor's built-in logic */
  defaultPrompt: string;
}

export interface CommentaryElementTool {
  id: string;
  label: string;
  icon?: 'diagram' | 'document' | 'external';
  disabled?: boolean;
}

export type { AcpRuntimeEventStatus } from './acp-runtime-events';

export interface CommentaryConversationTaskQuery {
  commentId: string;
  provider: string;
  threadId: string;
  requestId: string;
}

export interface CommentaryConversationTaskTransport {
  watch(
    task: CommentaryConversationTaskQuery,
    observer: {
      next(status: AcpRuntimeEventStatus): void | Promise<void>;
    },
  ): {
    done: Promise<void>;
    abort(): void;
  };
}

export interface CommentaryHostOptions {
  getResourceContext?: () => CommentaryHostResource | null;
  /** Return the host page element currently under the pointer for voice context. */
  getCurrentHoveredElement?: () => Element | null;
  /** Optional host-owned scope for external persistence. Local storage remains host-independent. */
  getPersistenceScope?: () => PrototypeEditCommentsPersistenceScope | null;
  persistenceAdapter?: PrototypeEditCommentsPersistenceAdapter;
  conversationTaskTransport?: CommentaryConversationTaskTransport;
  /** Disable the browser comment cache when the adapter is the shared source of truth. */
  commentPersistenceMode?: 'local' | 'adapter-only';
  /**
   * Optional host-specific escape hatch for page controls that must remain
   * interactive while the editor is active.
   */
  shouldAllowPageEvent?: (event: Event) => boolean;
  /**
   * Optional callback to customize the "Copy Prompt" content.
   * If provided, the editor calls this with structured context and uses
   * the returned string as the clipboard content.
   * If omitted, the editor falls back to its built-in prompt builder.
   */
  buildCopyPrompt?: (context: CommentaryCopyPromptContext) => string;
  /** Return optional host-owned actions for the selected element card. */
  getElementTools?: (element: Element | null) => CommentaryElementTool[];
  /** Run a host-owned selected-element action. */
  onElementToolAction?: (tool: CommentaryElementTool, element: Element) => void | Promise<void>;
  /** Whether local annotation markdown editing is available for the selected element. */
  canEditAnnotationMarkdown?: (element: Element | null) => boolean;
  /** Whether the selected-element card may show its inline annotation Markdown editor. */
  showAnnotationMarkdownEditor?: boolean;
  /** Return a host-specific reason that prevents creating an annotation for the selected element. */
  getCreateAnnotationBlockReason?: (element: Element | null) => string | undefined;
  /** Select whether the Markdown composer edits annotation metadata or document source. */
  annotationMarkdownEditorKind?: 'annotation' | 'document-source';
  /** Return an edit URL for the selected annotation document, or an empty value to hide the document edit entry. */
  getAnnotationDocumentEditUrl?: (element: Element | null) => string | null | undefined;
  /** Read the local annotation markdown bound to the selected element. */
  getAnnotationMarkdown?: (element: Element | null) => string | Promise<string>;
  /** Persist local annotation markdown for the selected element. */
  onAnnotationMarkdownChange?: (element: Element, markdown: string) => void | Promise<void>;
  /** Delete the selected local annotation node, including its runtime marker. */
  onDeleteAnnotationNode?: (element: Element) => void | Promise<void>;
}

// =============================================================================
// Selection Sync Types
// =============================================================================

/**
 * Summary of currently selected element.
 * Lightweight payload for selection sync (no transaction data).
 */
export interface SelectedElementSummary {
  /** Stable element identifier */
  elementKey: WebEditorElementKey;
  /** Locator for element identification and highlighting */
  locator: ElementLocator;
  /** Short display label (e.g., "div#app") */
  label: string;
  /** Full label with context (e.g., "body > div#app") */
  fullLabel: string;
  /** Tag name of the element */
  tagName: string;
  /** Timestamp for deduplication */
  updatedAt: number;
}

/** Serializable target context used by host-provided voice tools. */
export interface CommentaryVoiceTarget {
  source: 'selected' | 'hovered';
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
  label: string;
  fullLabel: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  updatedAt: number;
}

/** Bounded, serializable page element description for Commentary voice tools. */
export interface CommentaryPageElementSummary {
  /** Short-lived opaque reference, valid only for the current page revision. */
  targetRef: string;
  /** Human-readable element name. */
  label: string;
  /** Visible text, bounded to 120 characters. */
  textExcerpt: string;
  /** Lowercase DOM tag name. */
  tagName: string;
  /** Explicit or inferred semantic role when available. */
  role: string | null;
  /** Compact structural path with tag names only. */
  path: string;
  /** Number of visible, included direct children. */
  childCount: number;
}

/** Selected and hovered page targets exposed to voice-tool consumers. */
export interface CommentaryVoiceTargets {
  selected: CommentaryPageElementSummary | null;
  hovered: CommentaryPageElementSummary | null;
  preferred: CommentaryPageElementSummary | null;
}

export type CommentaryVoiceTargetsListener = (targets: CommentaryVoiceTargets) => void;

/** Bounded criteria for discovering visible page elements. */
export interface CommentaryPageElementSearchQuery {
  text?: string;
  role?: string;
  tagName?: string;
  parentTargetRef?: string;
  limit?: number;
  cursor?: string;
}

/** Bounded criteria for reading a compact page-element tree. */
export interface CommentaryPageElementStructureQuery {
  targetRef?: string;
  depth?: number;
  limit?: number;
  cursor?: string;
}

export interface CommentaryPageElementSearchResult {
  elements: CommentaryPageElementSummary[];
  nextCursor: string | null;
}

export interface CommentaryPageElementStructureResult {
  elements: CommentaryPageElementSummary[];
  nextCursor: string | null;
}

export type CommentaryPageElementActivationResult =
  | { activated: true; targetRef: string }
  | { activated: false; targetRef: string; error: string };

export type CommentaryVoiceCommentResult =
  | {
      applied: true;
      targetRef: string;
      commentId: string;
      target: CommentaryPageElementSummary;
    }
  | { applied: false; targetRef: string; error: string };

export interface CommentaryVoiceCommentOptions {
  anchorPlacement: 'target';
  /** Host-owned idempotency key; persisted but never exposed in model DTOs. */
  operationId?: string;
}

/**
 * Selection change broadcast payload.
 * Sent immediately when user selects/deselects elements (no debounce).
 */
export interface WebEditorSelectionChangedPayload {
  /** Source tab ID (filled by background from sender.tab.id) */
  tabId: number;
  /** Currently selected element, or null if deselected */
  selected: SelectedElementSummary | null;
  /** Page URL for context */
  pageUrl?: string;
}

// =============================================================================
// Execution Cancel Types
// =============================================================================

/**
 * Payload for canceling an ongoing Apply execution.
 * Sent from web-editor toolbar or sidepanel to background.
 */
export interface WebEditorCancelExecutionPayload {
  /** Session ID of the execution to cancel */
  sessionId: string;
  /** Request ID of the execution to cancel */
  requestId: string;
}

/**
 * Response from cancel execution request.
 */
export interface WebEditorCancelExecutionResponse {
  /** Whether the cancel request was successful */
  success: boolean;
  /** Error message if cancellation failed */
  error?: string;
}

// =============================================================================
// Public API Interface
// =============================================================================

/**
 * Commentary public lifecycle state.
 */
export interface CommentaryState extends WebEditorState {}

export interface CommentaryStatus {
  active: boolean;
  hasSelection: boolean;
  selectedElement: SelectedElementSummary | null;
  undoCount: number;
  redoCount: number;
  modifiedCount: number;
  clearableCount: number;
  hasTextChanges: boolean;
  hasStyleChanges: boolean;
  hasModifiedElements: boolean;
  hasClearableElements: boolean;
}

export type CommentaryStatusListener = (status: CommentaryStatus) => void;

export interface CommentaryDebugState {
  available: boolean;
  connected: boolean;
  integrationWsStatus?: 'connected' | 'disconnected' | 'reconnecting';
  integrationWsUrl?: string | null;
  integrationWsLastError?: string | null;
  bridgeConfig: {
    apiBaseUrl: string;
    integrationChannel: string;
    targetClientId: string;
    provider: string;
  } | null;
  selectedElementKey: string | null;
  currentConversation: {
    scopeKey: string;
    sessionId: string;
    provider: string | null;
    invalidated: boolean;
    sentCount: number;
    expiresAt: number;
    sessionUrl: string | null;
  } | null;
  hasReusableConversation: boolean;
  currentElementTask: {
    elementKey: string;
    status: string;
    sessionId: string | null;
    provider: string | null;
    message: string;
    updatedAt: number;
  } | null;
  visibleTasks: Array<{
    elementKey: string;
    status: string;
    sessionId: string | null;
    requestId: string;
    provider: string | null;
    message: string;
    updatedAt: number;
  }>;
}

/**
 * Commentary public API.
 * Legacy global access remains available on `window.__MCP_WEB_EDITOR_V2__`.
 */
export interface CommentaryApi {
  /** Start the editor */
  start: () => void;
  /** Stop the editor */
  stop: () => void;
  /** Dispose the editor instance and release all listeners */
  destroy: () => void;
  /** Toggle editor on/off, returns new state */
  toggle: () => boolean;
  /** Get current state */
  getState: () => CommentaryState;
  /** Get current host-facing status snapshot */
  getStatus: () => CommentaryStatus;
  /** Subscribe to host-facing status changes */
  subscribeStatus: (listener: CommentaryStatusListener) => () => void;
  /** Refresh floating runtime UI from current host callbacks */
  refresh: () => void;
  /** Read the currently selected element summary */
  getSelectedElement: () => SelectedElementSummary | null;
  /** Read a safe selected-first, hover-fallback target snapshot for voice tools. */
  getVoiceTarget: () => CommentaryVoiceTarget | null;
  /** Read selected and hovered page targets together. */
  getVoiceTargets: () => CommentaryVoiceTargets;
  /** Subscribe to immediate selection and stable-hover target snapshots. */
  subscribeVoiceTargets: (listener: CommentaryVoiceTargetsListener) => () => void;
  /** Find visible page elements using bounded, structured criteria. */
  findVoiceElements: (
    query: CommentaryPageElementSearchQuery,
  ) => CommentaryPageElementSearchResult;
  /** Read a bounded page structure snapshot. */
  getVoiceElementStructure: (
    query: CommentaryPageElementStructureQuery,
  ) => CommentaryPageElementStructureResult;
  /** Scroll, select, and highlight an opaque target without opening comment input. */
  activateVoiceElement: (targetRef: string) => Promise<CommentaryPageElementActivationResult>;
  /** Apply an AI-created comment using an explicit target anchor. */
  createVoiceComment: (
    targetRef: string,
    content: string,
    options: CommentaryVoiceCommentOptions,
  ) => Promise<CommentaryVoiceCommentResult>;
  /** Validate a persisted host execution target without changing editor state. */
  validateExternalEditingTarget: (
    elementKey: WebEditorElementKey,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ) => boolean;
  /** Read the current modified element summaries */
  getModifiedElements: () => CommentaryModifiedElementSummary[];
  /** Read aggregated text changes */
  getTextChanges: () => CommentaryTextChange[];
  /** Read per-element text changes for host-managed precise persistence */
  getTargetedTextChanges: () => CommentaryTargetedTextChange[];
  /** Read aggregated style changes */
  getStyleChanges: () => CommentaryStyleChangeSet;
  /** Read the full edited snapshot for host consumption */
  getEditedSnapshot: () => CommentaryEditedSnapshot;
  /** Read the internal Agent/runtime debug state for diagnostics */
  getDebugState?: () => CommentaryDebugState;
  /** Get current undo/redo counts */
  getHistoryCounts?: () => { undoCount: number; redoCount: number };
  /**
   * Revert a specific element to its original state (Phase 2 - Selective Undo).
   * Creates a compensating transaction that can be undone.
   */
  revertElement: (elementKey: WebEditorElementKey) => Promise<WebEditorRevertElementResponse>;
  /**
   * Clear current selection (called from sidepanel after send).
   * Triggers deselect and broadcasts null selection.
   */
  clearSelection: () => void;
  /** Select a connected host proxy target and open the existing comment card. */
  openCommentTarget: (element: Element) => Promise<boolean>;
  /** Acknowledge that current text edits have been saved externally */
  acknowledgeSavedTextChanges: () => void;
  /** Acknowledge that current style edits have been saved or cleared externally */
  acknowledgeSavedStyleChanges: () => void;
  /** Clear the edits associated with a specific element */
  clearElementEdits: (elementKey: WebEditorElementKey) => Promise<boolean>;
  /** Clear all current edits and local cache */
  clearAllEdits: (options?: CommentaryClearEditsOptions) => Promise<void>;
  /** Reload host-persisted comments and discard runtime task state for deleted comment IDs. */
  refreshPersistedComments: (deletedCommentIds?: readonly string[]) => Promise<void>;
  /** Read the host toolbar state used when `ui.toolbarMode` is `host` */
  getHostToolbarState: () => CommentaryHostToolbarState;
  /** Subscribe to host toolbar state changes */
  subscribeHostToolbarState: (listener: CommentaryHostToolbarStateListener) => () => void;
  /** Execute a host toolbar action through the same runtime logic as the inline toolbar */
  runHostToolbarAction: (action: CommentaryHostToolbarAction) => Promise<boolean>;
  /** Update the external editing task state for an element controlled by a host/API run */
  setNodeEditingState: (
    elementKey: WebEditorElementKey,
    nextState: CommentaryExternalEditingState,
    taskRef: Partial<CommentaryExternalEditingTaskRef> | null,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ) => Promise<CommentaryExternalEditingStateResult>;
  /** Start the editor in property-panel-only mode (no selection/interaction) */
  startPanelOnly?: () => void;
  /** Stop the editor from property-panel-only mode */
  stopPanelOnly?: () => void;
  /** Get the copy prompt text without performing clipboard operations */
  getCopyPromptText?: () => string;
  /** Get the AI prompt for one edited element without including other nodes */
  getElementPromptText?: (elementKey: WebEditorElementKey) => string;
}

export type WebEditorV2Api = CommentaryApi;
export type WebEditorV2Status = CommentaryStatus;
export type WebEditorV2StatusListener = CommentaryStatusListener;
export type WebEditorV2HostOptions = CommentaryHostOptions;
export type WebEditorV2HostResource = CommentaryHostResource;

// =============================================================================
// Global Declaration
// =============================================================================

declare global {
  interface Window {
    __AXHUB_COMMENTARY__?: CommentaryApi;
    __MCP_WEB_EDITOR_V2__?: WebEditorV2Api;
  }
}
