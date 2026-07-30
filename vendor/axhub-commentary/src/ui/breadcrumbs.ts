/**
 * Breadcrumbs UI (Phase 2.2)
 *
 * Displays the composed ancestor chain for the currently selected element.
 * Supports Shadow DOM boundaries by walking getRootNode() and shadowRoot.host.
 *
 * Design:
 * - Anchored to the selected element's bounding box (above-left preferred)
 * - Uses CSS classes defined in shadow-host.ts
 * - Buttons select ancestor elements
 * - "⬡" separator marks Shadow DOM boundaries
 */

import type { ViewportRect } from '../overlay/canvas-overlay';
import { createSparkleIcon } from './icons';
import { Disposer } from '../utils/disposables';
import type { ElementAgentTaskState } from '../core/editor/state';
import type { CommentShortcutSettings } from '../core/editor/comment-shortcut-settings';
import type { CommentaryElementTool } from '../web-editor-types';

// =============================================================================
// Types
// =============================================================================

/** Position of the breadcrumbs bar */
export type BreadcrumbsDock = 'top' | 'bottom';

/** Options for creating the breadcrumbs component */
export interface BreadcrumbsOptions {
  /** Container element to append breadcrumbs to */
  container: HTMLElement;
  /** Position of the breadcrumbs bar */
  dock?: BreadcrumbsDock;
  /** Callback when a breadcrumb item is clicked */
  onSelect: (element: Element) => void;
  /** Optional: add current selection into host assistant conversation context */
  onAppendElementToAgentContext?: (element: Element) => void | Promise<void>;
  /** Whether the host assistant panel is open and can receive context chips */
  getAssistantPanelOpen?: () => boolean;
  /** Whether Agent is currently online and ready to receive context */
  getAgentBridgeAvailable?: () => boolean;
  /** Hide UI affordances that directly execute Agent/agent tasks. */
  hideExecutionControls?: boolean;
  /** Read the current Agent task state for an element */
  getElementAgentTaskState?: (element: Element | null) => ElementAgentTaskState | null;
  /** Read all visible Agent task states */
  getVisibleElementAgentTaskStates?: () => ElementAgentTaskState[];
  /** Dismiss the current Agent task terminal state for an element */
  dismissElementAgentTaskState?: (element: Element) => void;
  /** Optional extension-specific single-line hint for running external editing tasks */
  externalEditingStatusDescription?: string;
  /** Read the current style edit summary lines for the selected element */
  getElementStyleSummaryLines?: (element: Element | null) => string[];
  /** Read current comment shortcut settings for tooltip/help rendering */
  getCommentShortcutSettings?: () => CommentShortcutSettings;
  /** Optional host-owned actions shown for the selected element. */
  getElementTools?: (element: Element | null) => CommentaryElementTool[];
  /** Execute a host-owned action for the selected element. */
  onElementToolAction?: (tool: CommentaryElementTool, element: Element) => void | Promise<void>;
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
  /** Delete the selected local annotation node, including its runtime marker */
  onDeleteCurrentAnnotationNode?: (element: Element) => void | Promise<void>;
  /** Callback when selecting the parent candidate */
  onSelectParent?: (element: Element) => void;
}

/** Breadcrumbs public interface */
export interface Breadcrumbs {
  /** Set the target element to show breadcrumbs for */
  setTarget(element: Element | null): void;
  /** Set the anchor rectangle (viewport coordinates) for positioning */
  setAnchorRect(rect: ViewportRect | null): void;
  /** Force a re-render when external UI dependencies change */
  refresh(): void;
  /** Legacy no-op retained for older host integrations. */
  enterInlineTextEdit?(): void;
  /** Cleanup */
  dispose(): void;
}

/** Internal representation of a breadcrumb item */
interface BreadcrumbItem {
  /** The actual DOM element */
  element: Element;
  /** Short display label */
  label: string;
  /** Full label for tooltip */
  fullLabel: string;
  /** True if there's a Shadow DOM boundary before this item */
  boundaryBefore: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Max depth to traverse the composed tree */
const MAX_COMPOSED_DEPTH = 64;

/** Max characters for a truncated label */
const MAX_LABEL_CHARS = 36;

/** Max class parts to include in label */
const MAX_CLASS_PARTS = 2;

/** Separator between normal parent-child relationships */
const NORMAL_SEPARATOR = '›';

/** Separator when crossing Shadow DOM boundary */
const SHADOW_SEPARATOR = '⬡';

/** Gap between anchor element and breadcrumbs bar */
const ANCHOR_GAP_PX = 10;

/** Padding from viewport edges */
const SAFE_PADDING_PX = 8;

/** Assumed property panel width for safe area calculation */
const PROPERTY_PANEL_WIDTH = 268;
// =============================================================================
// Helpers
// =============================================================================

/**
 * Truncate a label string with ellipsis
 */
function truncateLabel(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Format an element's display label (tag + id or classes)
 */
function formatElementLabel(element: Element): {
  label: string;
  fullLabel: string;
} {
  const tag = element.tagName.toLowerCase();
  const id = element.id?.trim();

  let suffix = '';
  if (id) {
    suffix = `#${id}`;
  } else {
    const classes = Array.from(element.classList ?? [])
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, MAX_CLASS_PARTS);
    if (classes.length > 0) {
      suffix = `.${classes.join('.')}`;
    }
  }

  const fullLabel = `${tag}${suffix}`;
  return { fullLabel, label: truncateLabel(fullLabel, MAX_LABEL_CHARS) };
}

/**
 * Build breadcrumb items from target element to composed tree root.
 * Returns items in outer-to-inner order (root first, target last).
 */
function buildComposedBreadcrumbs(target: Element): BreadcrumbItem[] {
  const raw: Array<{ element: Element; crossToParent: boolean }> = [];

  let current: Element | null = target;
  for (let i = 0; current && i < MAX_COMPOSED_DEPTH; i++) {
    const tag = current.tagName.toUpperCase();
    // Stop at document root elements
    if (tag === 'HTML' || tag === 'BODY') break;

    const parent: Element | null = current.parentElement;
    if (parent) {
      raw.push({ element: current, crossToParent: false });
      current = parent;
      continue;
    }

    // Check for Shadow DOM boundary
    const rootNode = current.getRootNode?.();
    if (rootNode instanceof ShadowRoot && rootNode.host instanceof Element) {
      // Mark that we're crossing a Shadow DOM boundary to reach parent
      raw.push({ element: current, crossToParent: true });
      current = rootNode.host;
      continue;
    }

    // Reached document root or a non-element root
    raw.push({ element: current, crossToParent: false });
    break;
  }

  // Reverse to get outer-to-inner order
  // crossToParent indicates we crossed a Shadow DOM boundary to reach the parent
  // After reverse, this means the edge FROM THIS ITEM to its visual predecessor
  // has a boundary, so we mark boundaryBefore on this item
  return raw.reverse().map(({ element, crossToParent }) => {
    const { label, fullLabel } = formatElementLabel(element);
    return {
      element,
      label,
      fullLabel,
      // boundaryBefore: true means there's a Shadow DOM boundary between this item
      // and the previous item in the breadcrumb list
      boundaryBefore: crossToParent,
    };
  });
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a breadcrumbs component for displaying element ancestry.
 */
export function createBreadcrumbs(options: BreadcrumbsOptions): Breadcrumbs {
  const disposer = new Disposer();
  const dock = options.dock ?? 'top';

  let currentTarget: Element | null = null;
  let items: BreadcrumbItem[] = [];
  let anchorRect: ViewportRect | null = null;

  // Cached bar dimensions (measured only after content changes)
  let barW = 0;
  let barH = 0;

  // Create root nav element
  const root = document.createElement('nav');
  root.className = 'we-breadcrumbs';
  root.dataset.position = dock;
  root.dataset.hidden = 'true';
  root.setAttribute('aria-label', '选择路径');

  options.container.append(root);
  disposer.add(() => root.remove());

  // ==========================================================================
  // Positioning Logic
  // ==========================================================================

  /**
   * Clamp a number between min and max
   */
  function clampNumber(value: number, min: number, max: number): number {
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Get the safe right boundary X (avoiding property panel)
   */
  function getSafeRightX(viewportW: number): number {
    // Reserve space for property panel on the right (16px margin + 320px panel + 16px gap)
    const panelReserved = 16 + PROPERTY_PANEL_WIDTH + 16;
    return viewportW - panelReserved;
  }

  /**
   * Measure bar dimensions after content change
   */
  function measureBarDimensions(): void {
    const rect = root.getBoundingClientRect();
    barW = rect.width;
    barH = rect.height;
  }

  /**
   * Update position based on anchor rect
   */
  function updatePosition(): void {
    if (!currentTarget) return;
    if (!anchorRect) return;
    if (!(barW > 0 && barH > 0)) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const safeRightX = getSafeRightX(viewportW);

    // Prefer placing at the anchor's left edge, but clamp within safe area
    const maxLeft = Math.min(viewportW - SAFE_PADDING_PX - barW, safeRightX - barW);
    const left = clampNumber(anchorRect.left, SAFE_PADDING_PX, maxLeft);

    // Prefer above-left; if not enough room, switch to below-left
    const aboveTop = anchorRect.top - ANCHOR_GAP_PX - barH;
    const belowTop = anchorRect.top + anchorRect.height + ANCHOR_GAP_PX;
    const preferredTop = aboveTop >= SAFE_PADDING_PX ? aboveTop : belowTop;
    const top = clampNumber(preferredTop, SAFE_PADDING_PX, viewportH - SAFE_PADDING_PX - barH);

    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  /**
   * Render breadcrumb items to DOM
   */
  function render(): void {
    root.textContent = '';

    if (!currentTarget) {
      root.dataset.hidden = 'true';
      return;
    }
    root.dataset.hidden = 'false';

    const frag = document.createDocumentFragment();

    const assistantPanelOpen = options.getAssistantPanelOpen?.();
    const contextAppendAvailable =
      typeof assistantPanelOpen === 'boolean'
        ? assistantPanelOpen
        : Boolean(options.getAgentBridgeAvailable?.() ?? false);

    if (currentTarget && options.onAppendElementToAgentContext && contextAppendAvailable) {
      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'we-crumb-send-btn';
      sendBtn.append(createSparkleIcon());
      sendBtn.setAttribute('aria-label', '添加到对话');
      sendBtn.dataset.action = 'send-to-agent';
      sendBtn.title = '添加到对话';
      frag.append(sendBtn);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Add separator before each item (except first)
      if (i > 0) {
        const sep = document.createElement('span');
        const isShadowBoundary = item.boundaryBefore;
        sep.className = isShadowBoundary ? 'we-crumb-sep we-crumb-sep--shadow' : 'we-crumb-sep';
        sep.textContent = isShadowBoundary ? SHADOW_SEPARATOR : NORMAL_SEPARATOR;
        sep.setAttribute('aria-hidden', 'true');
        frag.append(sep);
      }

      // Create button for this crumb
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'we-crumb';
      btn.dataset.index = String(i);
      btn.textContent = item.label;
      btn.title = item.fullLabel;

      // Mark current (last) item
      if (i === items.length - 1) {
        btn.classList.add('we-crumb--current');
        btn.setAttribute('aria-current', 'page');
      }

      frag.append(btn);
    }

    root.append(frag);

    // Measure bar dimensions after content change and update position
    measureBarDimensions();
    updatePosition();
  }

  // Event delegation for crumb clicks
  disposer.listen(root, 'click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const sendBtn = target.closest('button.we-crumb-send-btn');
    if (sendBtn instanceof HTMLButtonElement) {
      event.preventDefault();
      if (currentTarget?.isConnected) {
        void options.onAppendElementToAgentContext?.(currentTarget);
      }
      return;
    }

    const btn = target.closest('button.we-crumb');
    if (!(btn instanceof HTMLButtonElement)) return;

    event.preventDefault();

    const rawIndex = btn.dataset.index ?? '';
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) return;

    const item = items[index];
    if (!item) return;

    // Only select if element is still connected
    if (item.element.isConnected) {
      options.onSelect(item.element);
    }
  });

  /**
   * Set the target element to build breadcrumbs for
   */
  function setTarget(element: Element | null): void {
    if (disposer.isDisposed) return;

    currentTarget = element;
    items = element ? buildComposedBreadcrumbs(element) : [];
    render();
  }

  /**
   * Set the anchor rectangle for positioning (called by editor on position updates)
   */
  function setAnchorRect(rect: ViewportRect | null): void {
    if (disposer.isDisposed) return;
    anchorRect = rect;
    updatePosition();
  }

  function refresh(): void {
    if (disposer.isDisposed) return;
    render();
  }

  return {
    setTarget,
    setAnchorRect,
    refresh,
    dispose: () => disposer.dispose(),
  };
}
