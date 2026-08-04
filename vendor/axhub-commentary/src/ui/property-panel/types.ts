/**
 * Property Panel Types
 *
 * Type definitions for the property panel component.
 * The panel displays design tools for the selected element.
 */

import type { TransactionManager } from '../../core/transaction-manager';
import type { DesignTokensService } from '../../core/design-tokens';
import type { FloatingPosition } from '../floating-drag';
import type { CommentEntryMode } from '../selection-ui-mode';
import type { CommentShortcutSettings } from '../../core/editor/comment-shortcut-settings';
import type {
  ElementAgentTaskState,
  PageAgentConversationState,
  PromptImageAttachment,
} from '../../core/editor/state';
import type {
  AgentProviderAvailability,
  SessionActivityListener,
  SessionActivityTarget,
} from '../../core/editor/contracts';
import type {
  CommentaryTweakEntry,
  CommentaryTweakSchema,
  CommentaryTweakValues,
} from '../../tweak/protocol';
import type {
  WebEditorInteractionProfile,
  WebEditorDesignAdjustmentTool,
  WebEditorUiSettings,
} from '../../core/editor/ui-settings';
import type {
  CommentaryClearEditsOptions,
  CommentaryClearEditsTarget,
  CommentaryHostSurfaceVisibilityControl,
  CommentarySkillOption,
  CommentaryHostToolbarAction,
  CommentaryHostToolbarActionResult,
  CommentaryHostToolbarState,
  CommentaryHostToolbarStateListener,
  CommentaryToolbarMode,
} from '../../web-editor-types';

// =============================================================================
// Tab Types
// =============================================================================

/** Property panel tab identifiers */
export type PropertyPanelTab = 'tweak' | 'design';
export type { WebEditorUiSettings } from '../../core/editor/ui-settings';

// =============================================================================
// Options Types
// =============================================================================

/** Options for creating the property panel */
export interface PropertyPanelOptions {
  /** Shadow UI container element (elements.uiRoot from shadow-host) */
  container: HTMLElement;

  /** Transaction manager for applying style changes with undo/redo support */
  transactionManager: TransactionManager;

  /**
   * Callback when user toggles selection mode.
   * enabled=true: normal selection mode
   * enabled=false: interaction mode (selection disabled)
   */
  onToggleSelectionMode?: (enabled: boolean, options?: { allowPageInteraction?: boolean }) => void;

  /** Undo action */
  onUndo?: () => void;
  /** Redo action */
  onRedo?: () => void;
  /** Copy prompt action */
  onCopyPrompt?: () => void | Promise<void>;
  /** Send the generated prompt to Agent, routing to the active page or a new session */
  onSendPromptToAgent?: (element?: Element | null) => void | Promise<void>;
  /** Send the current element's prompt to Agent without including other elements */
  onSendCurrentElementPromptToAgent?: (element: Element) => void | Promise<void>;
  /** Interrupt the active Agent execution for the current element */
  onAbortAgentPrompt?: (element?: Element | null) => void | Promise<void>;
  /** Wake Agent after the host confirms the backend is ready */
  onWakeAgent?: () => boolean | Promise<boolean>;
  /** Clear current edits + cache */
  onClearEdits?: (
    options?: CommentaryClearEditsOptions,
  ) => CommentaryClearEditsTarget | null | void | Promise<CommentaryClearEditsTarget | null | void>;
  /** Whether the current prototype has persisted comments in any page scope. */
  hasPrototypeComments?: () => boolean;
  /** Clear the current element's related edits, note, and local modifications */
  onClearCurrentElementEdits?: (element: Element) => boolean | Promise<boolean>;
  /** Delete the current annotation node and its runtime marker. */
  onDeleteCurrentAnnotationNode?: (element: Element) => void | Promise<void>;

  /** Pre-flight check to block Copy Prompt */
  getCopyPromptBlockReason?: () => string | undefined;
  /** Whether the floating toolbar should render the Copy Prompt action */
  showCopyPromptAction?: boolean;
  /** Whether toolbar chrome is rendered inline or delegated to the host */
  toolbarMode?: CommentaryToolbarMode;
  /** Hide UI affordances that directly execute Agent/agent tasks. */
  hideExecutionControls?: boolean;
  /** Hide the current-element send action in the prompt bubble. */
  hideCurrentElementExecutionAction?: boolean;
  /** Replace the execution slot with a host-owned surface visibility toggle. */
  hostSurfaceVisibilityControl?: CommentaryHostSurfaceVisibilityControl | null;
  /** Single-line summary for the host-managed AI execution settings. */
  aiExecutionConfigSummary?: string;
  /** Whether the host-managed AI execution settings are complete enough to run. */
  aiExecutionConfigConfigured?: boolean;
  /** Selected ACP provider for page-inline AI execution. */
  aiExecutionProvider?: string;
  /** Project/workspace path for page-inline AI execution. */
  aiExecutionWorkspacePath?: string;
  /** Maximum concurrent page-inline AI execution runs. */
  aiExecutionRunConcurrency?: number;
  /** Provider options surfaced by the host runtime. */
  aiExecutionProviderOptions?: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
  /** Show host-managed direct-save actions for the current HTML source file. */
  htmlFileSaveEnabled?: boolean;
  /** Whether the host's ACP UI service is currently connected. */
  getAcpUiConnected?: () => boolean;
  /** Execute a host toolbar action from the inline toolbar/settings surface. */
  onHostToolbarAction?: (
    action: CommentaryHostToolbarAction,
  ) => CommentaryHostToolbarActionResult | Promise<CommentaryHostToolbarActionResult>;
  /** Notify host toolbar consumers whenever the runtime toolbar state changes */
  onHostToolbarStateChange?: (state: CommentaryHostToolbarState) => void;
  /** Enable local annotation injection through the host runtime. */
  onEnableAnnotation?: () => boolean | Promise<boolean>;
  /** Whether local annotation injection is currently enabled. */
  getAnnotationEnabled?: () => boolean;
  /** Whether the local annotation injection action is available. */
  getAnnotationEnableAvailable?: () => boolean;
  /** Whether the local annotation injection action is busy. */
  getAnnotationEnableLoading?: () => boolean;
  /** Whether the floating toolbar may show the Markdown full-source editor switch. */
  markdownSourceEditorAvailable?: boolean;
  /** Read whether the Markdown source pane is currently visible. */
  getMarkdownSourceEditorOpen?: () => boolean;
  /** Show or hide the Markdown source pane, returning the resulting state. */
  onMarkdownSourceEditorOpenChange?: (open: boolean) => boolean | Promise<boolean>;
  /** Optional extension-specific single-line hint for running external editing tasks */
  externalEditingStatusDescription?: string;
  /** Optional skill document source used when copying the Agent skill install prompt */
  skillInstallSource?: string;
  /** Optional Chrome-provided skill list shown in the inline settings dialog. */
  commentarySkillOptions?: CommentarySkillOption[];
  /** Initial selected Chrome commentary skill IDs. */
  commentarySelectedSkillIds?: string[];
  /** Whether the host has persisted a skill selection, including an empty one. */
  commentarySkillSettingsConfigured?: boolean;
  /** Whether the Agent bridge is currently online */
  getAgentBridgeAvailable?: () => boolean;
  /** Whether the Agent bridge websocket is connected and ready */
  getAgentBridgeConnected?: () => boolean;
  /** Whether the current Agent execution can be interrupted */
  getCanAbortAgentPrompt?: (element?: Element | null) => boolean;
  /** Whether the current page already has a reusable Agent conversation */
  getHasReusableAgentConversation?: () => boolean;
  /** Read the current page-level Agent conversation */
  getCurrentAgentConversationState?: () => PageAgentConversationState | null;
  /** Read the current Agent task state for an element */
  getElementAgentTaskState?: (element: Element | null) => ElementAgentTaskState | null;
  /** Read all visible Agent task states */
  getVisibleElementAgentTaskStates?: () => ElementAgentTaskState[];
  /** Read Agent provider availability for a single provider */
  getAgentProviderAvailability?: (provider: string) => AgentProviderAvailability | null;
  /** Read Agent provider availability for all supported providers */
  getAgentProviderAvailabilities?: () => AgentProviderAvailability[];
  /** Refresh Agent provider availability snapshots */
  refreshAgentProviderAvailabilities?: (providers?: readonly string[]) => Promise<void>;
  /** Subscribe to the current page Agent session activity stream */
  subscribeSessionActivity?: (
    target: SessionActivityTarget,
    listener: SessionActivityListener,
  ) => () => void;
  /** Dismiss the current Agent task terminal state for an element */
  dismissElementAgentTaskState?: (element: Element) => void;
  /** Dismiss all currently visible Agent task terminal states */
  dismissVisibleElementAgentTaskStates?: () => void;
  /** Pre-flight check to block prompt push into Agent */
  getSendPromptToAgentBlockReason?: (element?: Element | null) => string | undefined;
  /** Pre-flight check to block sending only the current element prompt into Agent */
  getSendCurrentElementPromptToAgentBlockReason?: (element: Element | null) => string | undefined;
  /** Optional design-tool export support for the selected element */
  canExportSelectionToDesignTool?: (
    tool: WebEditorDesignAdjustmentTool,
    element?: Element | null,
  ) => boolean;
  /** Export the current selection to the configured design tool */
  onExportSelectionToDesignTool?: (
    tool: WebEditorDesignAdjustmentTool,
    element?: Element | null,
  ) => void | Promise<void>;
  /** Pre-flight check to block design-tool export */
  getExportSelectionToDesignToolBlockReason?: (
    tool: WebEditorDesignAdjustmentTool,
    element?: Element | null,
  ) => string | undefined;

  /**
   * Initial floating position (viewport coordinates).
   * When provided, the panel uses left/top positioning and becomes draggable.
   */
  initialPosition?: FloatingPosition | null;

  /**
   * Called whenever the floating position changes.
   * Use null to indicate the panel is in its default anchored position.
   */
  onPositionChange?: (position: FloatingPosition | null) => void;

  /** Optional: Design tokens service for TokenPill/TokenPicker integration (Phase 5.3) */
  tokensService?: DesignTokensService;

  /** Whether the selected element supports direct text editing */
  canEditText?: (element: Element | null) => boolean;

  /** Read the current normalized text value for the selected element */
  getTextValue?: (element: Element | null) => string;

  /** Commit a new normalized text value for the selected element */
  onTextValueChange?: (
    element: Element,
    value: string,
    previousValue?: string,
  ) => void | Promise<void>;

  /** Notify the core runtime which page element is currently in inline text-edit mode */
  onInlineTextEditingElementChange?: (element: HTMLElement | null) => void;

  /** Read the tweak schema bound to the selected element */
  getTweakSchema?: (element: Element | null) => CommentaryTweakSchema | null;

  /** Read the current tweak values bound to the selected element */
  getTweakValues?: (element: Element | null) => CommentaryTweakValues | null;

  /** Commit tweak changes for the selected element */
  onUpdateTweakValues?: (element: Element, patch: CommentaryTweakValues) => void | Promise<void>;

  /** Subscribe to tweak changes emitted by the active runtime adapter */
  subscribeTweak?: (listener: () => void) => () => void;

  /** Read every tweak-capable node on the current page for page-level aggregation */
  getPageTweakEntries?: () => CommentaryTweakEntry[];

  /** Read the saved AI note for the current element */
  getAiNote?: (element: Element | null) => string;

  /** Read prompt-card skill metadata for the current element */
  getAiNoteSkillIds?: (element: Element | null) => string[];

  /** Read the saved AI note images for the current element */
  getAiNoteImages?: (element: Element | null) => PromptImageAttachment[];
  /** Whether prompt/note image attachments are enabled for this host. */
  enableImageAttachments?: boolean;

  /** Let the host validate or persist incoming images before they are attached. */
  onPrepareAiNoteImages?: (
    element: Element,
    images: readonly PromptImageAttachment[],
  ) => readonly PromptImageAttachment[] | Promise<readonly PromptImageAttachment[]>;

  /** Whether local annotation markdown editing is available for the selected element */
  canEditAnnotationMarkdown?: (element: Element | null) => boolean;

  /** Resolve synthetic editor targets to the host element used by annotation checks */
  resolveAnnotationTarget?: (element: Element | null) => Element | null;

  /** Return a host-specific reason that prevents creating an annotation for the selected element */
  getCreateAnnotationBlockReason?: (element: Element | null) => string | undefined;

  /** Select whether the Markdown composer edits annotation metadata or document source */
  annotationMarkdownEditorKind?: 'annotation' | 'document-source';

  /** Return an edit URL for the selected annotation document, or an empty value to hide the document edit entry */
  getAnnotationDocumentEditUrl?: (element: Element | null) => string | null | undefined;

  /** Read the local annotation markdown bound to the selected element */
  getAnnotationMarkdown?: (element: Element | null) => string | Promise<string>;

  /** Persist local annotation markdown for the selected element */
  onAnnotationMarkdownChange?: (element: Element, markdown: string) => void | Promise<void>;

  /** Read the current hover target when selection mode is active */
  getHoveredElement?: () => Element | null;

  /** Persist a marker anchor for the target element using viewport coordinates */
  onRememberSelectionAnchor?: (
    element: Element,
    selectionAnchor?: { clientX: number; clientY: number },
  ) => void;

  /** Update the saved AI note for the current element or current page */
  onAiNoteChange?: (
    element: Element | null,
    note: string,
    options?: { skillIds?: readonly string[] },
  ) => void | Promise<void>;

  /** Update the saved AI note images for the current element */
  onAiNoteImagesChange?: (
    element: Element,
    images: readonly PromptImageAttachment[],
  ) => void | Promise<void>;

  /** Collapse the whole comment/editor tool */
  onRequestClose?: () => void;
  /** Fully stop Agent editor and release the current page session */
  onRequestFullExit?: () => void | Promise<void>;
  /** Clear current selection and close transient prompt UI */
  onDismissSelection?: () => void;

  /** Get the current selection UI mode */
  getUiMode?: () => CommentEntryMode;

  /** Update the current selection UI mode */
  onUiModeChange?: (mode: CommentEntryMode) => void;

  /** Initial selection UI mode */
  initialUiMode?: CommentEntryMode;

  /** Read current comment shortcut settings */
  getCommentShortcutSettings?: () => CommentShortcutSettings;

  /** Persist comment shortcut settings */
  onCommentShortcutSettingsChange?: (settings: CommentShortcutSettings) => void;

  /** Read current runtime UI settings */
  getUiSettings?: () => WebEditorUiSettings;

  /** Interaction profile used to tailor the runtime UI */
  interactionProfile?: WebEditorInteractionProfile;

  /** Whether the settings menu may switch between design and document comment interactions. */
  documentCommentModeAvailable?: boolean;

  /** Whether page-editing settings are relevant to the current host surface. */
  pageEditingSettingsAvailable?: boolean;

  /** Persist runtime UI settings */
  onUiSettingsChange?: (settings: WebEditorUiSettings) => void;

  /** Notify whether shortcut settings dialog is open */
  onCommentShortcutDialogOpenChange?: (open: boolean) => void;

  /** Select the current element's parent candidate */
  onSelectParent?: (element: Element) => void;

  /** Locate and select a specific page element from the global property panel */
  onLocateElement?: (element: Element) => void;

  /** Get whether change markers are currently visible */
  getChangeMarkersVisible?: () => boolean;

  /** Toggle change marker visibility */
  onChangeMarkersVisible?: (visible: boolean, options?: { persist?: boolean }) => void;

  /** Get current modified/marked element count */
  getModifiedElementCount?: () => number;

  /** Toggle hover/selection visual chrome visibility */
  onSelectionChromeVisibleChange?: (visible: boolean) => void;

  onPromptCardVisibleChange?: (visible: boolean) => void;
}

// =============================================================================
// Panel Interface
// =============================================================================

/** Property panel public interface */
export interface PropertyPanel {
  /**
   * Update the panel to display properties for the given element.
   * Pass null to show empty state.
   */
  setTarget(element: Element | null): void;

  /** Switch to a specific tab */
  setTab(tab: PropertyPanelTab): void;

  /** Get the currently active tab */
  getTab(): PropertyPanelTab;

  /** Force refresh the current controls (e.g., after external style change) */
  refresh(): void;

  /** Update undo/redo counts */
  setHistory(undoCount: number, redoCount: number): void;

  /** Get current floating position (viewport coordinates), null when anchored */
  getPosition(): FloatingPosition | null;

  /** Set floating position (viewport coordinates), pass null to reset to anchored */
  setPosition(position: FloatingPosition | null): void;

  /** Focus note entry using the requested comment mode */
  enterCommentInput?(mode?: CommentEntryMode): void;

  /** Legacy no-op retained for older host integrations. */
  enterInlineTextEdit?(): void;

  /** Read the current host toolbar state */
  getHostToolbarState(): CommentaryHostToolbarState;

  /** Subscribe to host toolbar state updates */
  subscribeHostToolbarState(listener: CommentaryHostToolbarStateListener): () => void;

  /** Execute a toolbar action through the runtime panel implementation */
  runHostToolbarAction(action: CommentaryHostToolbarAction): Promise<boolean>;

  /** Cleanup and remove the panel */
  dispose(): void;
}

// =============================================================================
// Control Types
// =============================================================================

/** Common interface for design controls (Size, Spacing, Position, etc.) */
export interface DesignControl {
  /** Update the control to display values for the given element */
  setTarget(element: Element | null): void;

  /** Refresh control values from current element styles */
  refresh(): void;

  /** Cleanup the control */
  dispose(): void;
}

/** Factory function type for creating design controls */
export type DesignControlFactory = (options: {
  container: HTMLElement;
  transactionManager: TransactionManager;
}) => DesignControl;

// =============================================================================
// Group Types
// =============================================================================

/** State for a collapsible control group */
export interface ControlGroupState {
  /** Whether the group is collapsed */
  collapsed: boolean;
}

/** Collapsible control group interface */
export interface ControlGroup {
  /** The root element of the group */
  root: HTMLElement;

  /** The body container where controls are mounted */
  body: HTMLElement;

  /** Optional: Container for header action buttons (e.g., add button) */
  headerActions?: HTMLElement;

  /** Set collapsed state */
  setCollapsed(collapsed: boolean): void;

  /** Get current collapsed state */
  isCollapsed(): boolean;

  /** Toggle collapsed state */
  toggle(): void;
}
