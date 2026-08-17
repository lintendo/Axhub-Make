/**
 * Text Comment Manager
 *
 * Manages text-based comments for the `text-comment` interaction profile.
 *
 * Responsibilities:
 * - Detect text selections from `window.getSelection()` after `mouseup`
 * - Extract rich context from selected text: tag paths, surrounding text, segments
 * - Compute viewport rectangles for overlay highlighting
 * - Generate stable comment IDs for editMetaByKey integration
 * - Lifetime management (create, remove, clear, dispose)
 *
 * Design principles:
 * - **Non-destructive**: Never modifies the page DOM — all visual feedback is
 *   delegated to the canvas overlay layer.
 * - **Cross-element safe**: Handles selections spanning multiple inline/block elements
 *   by iterating text nodes within the Range.
 */

// =============================================================================
// Types
// =============================================================================

/** A single text segment within a selection, with its tag ancestry */
export interface TextCommentSegment {
  /** The text content of this segment */
  text: string;
  /** Tag path from the closest block ancestor, e.g. ["p", "strong"] */
  tags: string[];
}

/** A complete text comment produced from a user selection */
export interface TextComment {
  /** Unique identifier: `text-comment::{hash}` */
  id: string;
  /** The full selected text (concatenated, trimmed) */
  selectedText: string;

  /** Context before the selection (~50 chars) for source-file search */
  contextBefore: string;
  /** Context after the selection (~50 chars) */
  contextAfter: string;
  /** Outermost tag path of the selection container */
  tagPath: string[];
  /** Per-segment tag info for cross-element selections */
  segments: TextCommentSegment[];

  /** Selection bounding rect (viewport coordinates) */
  boundingRect: { left: number; top: number; width: number; height: number };
  /** Per-line rects for overlay highlight rendering */
  clientRects: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  /** Snapshot of the selected DOM range */
  range: Range;
  /** Closest live element that contains the selection */
  sourceElement: Element | null;
}

export interface TextCommentManager {
  /**
   * Inspect the current browser text selection and, if valid, produce a
   * `TextComment` with full context.  Returns `null` when the selection
   * is collapsed, empty, or originates from the editor overlay.
   */
  commitSelection(): TextComment | null;

  /** All comments created so far (keyed by id) */
  getComments(): ReadonlyMap<string, TextComment>;

  /** Remove a single comment */
  removeComment(id: string): void;

  /** Remove all comments */
  clearAll(): void;

  /** Apply the active visual highlight for an comment selection */
  setActiveHighlight(comment: TextComment | null): boolean;

  /** Remove the active visual highlight */
  clearActiveHighlight(): void;

  /** Release any resources */
  dispose(): void;
}

export interface TextCommentManagerOptions {
  /** Predicate to exclude selection events originating from the editor overlay */
  isOverlayElement: (node: unknown) => boolean;
}

// =============================================================================
// Constants
// =============================================================================

const CONTEXT_CHARS = 50;
const TEXT_COMMENT_HIGHLIGHT_NAME = 'axhub-web-editor-text-comment';
const TEXT_COMMENT_HIGHLIGHT_STYLE_ID = 'axhub-web-editor-text-comment-style';
const TEXT_COMMENT_DISABLED_SELECTOR = '[data-we-text-comment-disabled="true"]';

// =============================================================================
// Helpers
// =============================================================================

/** FNV-1a 32-bit hash → hex string (fast, deterministic, no crypto) */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateCommentId(selectedText: string, contextBefore: string): string {
  return `text-comment::${fnv1aHash(selectedText + '||' + contextBefore)}`;
}

/**
 * Build a tag-path array from a node up to the nearest block-level ancestor
 * (or the `<body>`).
 */
function buildTagPath(node: Node): string[] {
  const tags: string[] = [];
  let current: Node | null = node instanceof Element ? node : node.parentElement;
  while (current && current !== document.body) {
    if (current instanceof Element) {
      tags.unshift(current.tagName.toLowerCase());
      // Stop at block-level elements to keep paths concise
      const display = maybeGetComputedDisplay(current);
      if (display && display !== 'inline' && display !== 'inline-block') {
        break;
      }
    }
    current = current.parentNode;
  }
  return tags;
}

function maybeGetComputedDisplay(el: Element): string | null {
  try {
    return window.getComputedStyle(el).display;
  } catch {
    return null;
  }
}

/**
 * Collect all text nodes (or partial text) within a Range, together with
 * per-segment tag info.
 */
function collectSegments(range: Range): TextCommentSegment[] {
  const segments: TextCommentSegment[] = [];
  const appendSegmentFromTextNode = (textNode: Text) => {
    let text = textNode.textContent ?? '';

    // Trim to range boundaries for start/end text nodes
    if (textNode === range.startContainer) {
      text = text.slice(range.startOffset);
    }
    if (textNode === range.endContainer) {
      const endSlice =
        textNode === range.startContainer ? range.endOffset - range.startOffset : range.endOffset;
      text = text.slice(0, endSlice);
    }

    text = text.replace(/\s+/g, ' ');
    if (!text) return;

    segments.push({
      text,
      tags: buildTagPath(textNode),
    });
  };

  if (range.commonAncestorContainer instanceof Text) {
    appendSegmentFromTextNode(range.commonAncestorContainer);
    return segments;
  }

  // Walk all text nodes inside the range
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Only include text nodes that intersect the range
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current: Node | null = walker.nextNode();
  while (current) {
    appendSegmentFromTextNode(current as Text);
    current = walker.nextNode();
  }

  return segments;
}

/**
 * Extract context text (before / after) from the DOM around a Range.
 */
function extractContext(range: Range, direction: 'before' | 'after'): string {
  try {
    const container = range.commonAncestorContainer;
    const element = container instanceof Element ? container : container.parentElement;
    if (!element) return '';

    const fullText = element.textContent ?? '';
    const selectedText = range.toString();
    const idx = fullText.indexOf(selectedText);
    if (idx < 0) return '';

    if (direction === 'before') {
      const start = Math.max(0, idx - CONTEXT_CHARS);
      return fullText.slice(start, idx).replace(/\s+/g, ' ').trim();
    } else {
      const end = idx + selectedText.length;
      return fullText
        .slice(end, end + CONTEXT_CHARS)
        .replace(/\s+/g, ' ')
        .trim();
    }
  } catch {
    return '';
  }
}

function toPlainRect(r: DOMRect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function dedupeRects(
  rects: DOMRectList,
): Array<{ left: number; top: number; width: number; height: number }> {
  const out: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.width <= 0 || r.height <= 0) continue;
    out.push(toPlainRect(r));
  }
  return out;
}

function resolveSelectionSourceElement(range: Range): Element | null {
  const commonAncestor = range.commonAncestorContainer;
  if (commonAncestor instanceof Element) return commonAncestor;
  return commonAncestor.parentElement;
}

function isTextCommentDisabledNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest(TEXT_COMMENT_DISABLED_SELECTOR));
}

function supportsCssHighlights(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === 'function'
  );
}

function ensureHighlightStyle(): void {
  if (document.getElementById(TEXT_COMMENT_HIGHLIGHT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = TEXT_COMMENT_HIGHLIGHT_STYLE_ID;
  style.textContent = `
    ::highlight(${TEXT_COMMENT_HIGHLIGHT_NAME}) {
      background: rgba(0, 143, 93, 0.18);
      color: inherit;
    }
  `;
  document.head.append(style);
}

function updateCssHighlight(range: Range | null): boolean {
  if (!supportsCssHighlights()) return false;

  ensureHighlightStyle();

  const highlightRegistry = (CSS as { highlights: Map<string, unknown> }).highlights;
  highlightRegistry.delete(TEXT_COMMENT_HIGHLIGHT_NAME);

  if (!range) return true;

  const HighlightCtor = (globalThis as { Highlight: new (...ranges: Range[]) => unknown })
    .Highlight;
  highlightRegistry.set(TEXT_COMMENT_HIGHLIGHT_NAME, new HighlightCtor(range.cloneRange()));
  return true;
}

// =============================================================================
// Factory
// =============================================================================

export function createTextCommentManager(options: TextCommentManagerOptions): TextCommentManager {
  const { isOverlayElement } = options;
  const comments = new Map<string, TextComment>();

  function commitSelection(): TextComment | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return null;

    // Reject selections that start inside the editor overlay
    if (isOverlayElement(range.startContainer) || isOverlayElement(range.endContainer)) {
      return null;
    }
    if (
      isTextCommentDisabledNode(range.startContainer) ||
      isTextCommentDisabledNode(range.endContainer)
    ) {
      return null;
    }

    const segments = collectSegments(range);
    if (segments.length === 0) return null;

    const contextBefore = extractContext(range, 'before');
    const contextAfter = extractContext(range, 'after');
    const tagPath = buildTagPath(range.commonAncestorContainer);
    const boundingRect = toPlainRect(range.getBoundingClientRect());
    const clientRects = dedupeRects(range.getClientRects());
    const sourceElement = resolveSelectionSourceElement(range);

    const id = generateCommentId(text, contextBefore);

    const comment: TextComment = {
      id,
      selectedText: text,
      contextBefore,
      contextAfter,
      tagPath,
      segments,
      boundingRect,
      clientRects,
      range: range.cloneRange(),
      sourceElement,
    };

    comments.set(id, comment);
    return comment;
  }

  function getComments(): ReadonlyMap<string, TextComment> {
    return comments;
  }

  function removeComment(id: string): void {
    comments.delete(id);
  }

  function clearAll(): void {
    comments.clear();
    clearActiveHighlight();
  }

  function setActiveHighlight(comment: TextComment | null): boolean {
    return updateCssHighlight(comment?.range ?? null);
  }

  function clearActiveHighlight(): void {
    updateCssHighlight(null);
  }

  function dispose(): void {
    comments.clear();
    clearActiveHighlight();
  }

  return {
    commitSelection,
    getComments,
    removeComment,
    clearAll,
    setActiveHighlight,
    clearActiveHighlight,
    dispose,
  };
}
