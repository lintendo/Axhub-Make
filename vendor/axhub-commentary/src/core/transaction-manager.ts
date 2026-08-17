/**
 * Transaction Manager
 *
 * Locator-based undo/redo system for inline style edits.
 *
 * Design principles:
 * - Uses CSS selectors (not DOM references) for element identification
 * - Supports transaction merging for continuous edits (e.g., slider drag)
 * - Provides handle-based API for batched operations
 * - Emits change events for UI synchronization
 */

import type {
  ElementLocator,
  MoveOperationData,
  MoveTransactionData,
  StructureOperationData,
  Transaction,
  TransactionSnapshot,
  WebEditorElementKey,
} from '../web-editor-types';
import { Disposer } from '../utils/disposables';
import { generateStableElementKey } from './element-key';
import { createElementLocator, locateElement, locatorKey } from './locator';
import { writeEditableText } from './text-content';

// =============================================================================
// Types
// =============================================================================

/** Change event action types */
export type TransactionChangeAction =
  | 'push'
  | 'merge'
  | 'undo'
  | 'redo'
  | 'restore'
  | 'clear'
  | 'rollback';

/** Change event emitted when transaction state changes */
export interface TransactionChangeEvent {
  action: TransactionChangeAction;
  transaction: Transaction | null;
  undoCount: number;
  redoCount: number;
}

/** Options for creating the Transaction Manager */
export interface TransactionManagerOptions {
  /** Maximum transactions to keep in history (oldest dropped) */
  maxHistory?: number;
  /** Time window (ms) for merging consecutive edits to same property */
  mergeWindowMs?: number;
  /** Enable Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z keyboard shortcuts */
  enableKeyBindings?: boolean;
  /** Check if event is from editor UI (to ignore keybindings) */
  isEventFromEditorUi?: (event: Event) => boolean;
  /** Custom time source (for testing) */
  now?: () => number;
  /** Called when transaction state changes */
  onChange?: (event: TransactionChangeEvent) => void;
  /** Called when applying a transaction fails */
  onApplyError?: (error: unknown) => void;
}

/** Handle for an in-progress style transaction (for batching) */
export interface StyleTransactionHandle {
  /** Unique handle ID */
  readonly id: string;
  /** CSS property being edited */
  readonly property: string;
  /** Target element locator */
  readonly targetLocator: ElementLocator;
  /** Update the style value (live preview) */
  set(value: string): void;
  /** Commit the transaction and record to history */
  commit(options?: { merge?: boolean }): Transaction | null;
  /** Rollback to original value without recording */
  rollback(): void;
}

/**
 * Handle for an in-progress multi-style transaction (Phase 4.9)
 *
 * Used for operations that modify multiple CSS properties atomically,
 * such as resize handles (width + height) or position handles (top + left).
 */
export interface MultiStyleTransactionHandle {
  /** Unique handle ID */
  readonly id: string;
  /** CSS properties being edited (normalized, unique) */
  readonly properties: readonly string[];
  /** Target element locator */
  readonly targetLocator: ElementLocator;
  /**
   * Update one or more style values (live preview).
   * Keys outside the declared `properties` are ignored.
   */
  set(values: Record<string, string>): void;
  /** Commit the transaction and record to history */
  commit(options?: { merge?: boolean }): Transaction | null;
  /** Rollback all tracked properties to original values without recording */
  rollback(): void;
}

/** Handle for an in-progress move transaction (Phase 2.4-2.6) */
export interface MoveTransactionHandle {
  /** Unique handle ID */
  readonly id: string;
  /** Locator for the dragged element at drag start */
  readonly beforeLocator: ElementLocator;
  /** Original location */
  readonly from: MoveOperationData;
  /** Commit the move and record to history (call after DOM move) */
  commit(targetAfterMove: Element): Transaction | null;
  /** Cancel the move session without recording */
  cancel(): void;
}

/** Transaction Manager public interface */
export interface TransactionManager {
  /** Begin an interactive style edit (returns handle for batching) */
  beginStyle(target: Element, property: string): StyleTransactionHandle | null;
  /**
   * Begin an interactive multi-style edit (Phase 4.9)
   *
   * For operations that modify multiple CSS properties atomically.
   * Returns null if element doesn't support inline styles or properties list is empty.
   */
  beginMultiStyle(target: Element, properties: string[]): MultiStyleTransactionHandle | null;
  /** Begin a drag move transaction (records before state at drag start) */
  beginMove(target: Element): MoveTransactionHandle | null;
  /** Apply a style change immediately and record transaction */
  applyStyle(
    target: Element,
    property: string,
    value: string,
    options?: { merge?: boolean },
  ): Transaction | null;
  /** Record a style transaction without applying (for external changes) */
  recordStyle(
    locator: ElementLocator,
    property: string,
    beforeValue: string,
    afterValue: string,
    options?: { merge?: boolean },
  ): Transaction | null;
  /** Record a text transaction for contentEditable edit (Phase 2.7) */
  recordText(target: Element, beforeText: string, afterText: string): Transaction | null;
  /** Record a class list change and create transaction (Phase 4.7) */
  recordClass(target: Element, beforeClasses: string[], afterClasses: string[]): Transaction | null;
  /** Apply a structure operation and record transaction (Phase 5.5) */
  applyStructure(target: Element, data: StructureOperationData): Transaction | null;
  /** Undo the last transaction */
  undo(): Transaction | null;
  /** Redo the last undone transaction */
  redo(): Transaction | null;
  /** Restore and permanently discard a tracked element-delete transaction. */
  restoreDeletedElement(transactionId: string): Transaction | null;
  /** Check if undo is available */
  canUndo(): boolean;
  /** Check if redo is available */
  canRedo(): boolean;
  /** Get current undo stack (readonly) */
  getUndoStack(): readonly Transaction[];
  /** Get current redo stack (readonly) */
  getRedoStack(): readonly Transaction[];
  /** Clear all transaction history */
  clear(): void;
  /** Cleanup resources */
  dispose(): void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_HISTORY = 100;
const DEFAULT_MERGE_WINDOW_MS = 800;

const KEYBIND_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: false,
};

// =============================================================================
// Style Helpers
// =============================================================================

/**
 * Normalize CSS property name to kebab-case.
 * Preserves custom properties (--var-name).
 */
function normalizePropertyName(property: string): string {
  const p = property.trim();
  if (!p) return '';

  // Preserve custom properties
  if (p.startsWith('--')) return p;

  // Already kebab-case
  if (p.includes('-')) return p.toLowerCase();

  // Convert camelCase to kebab-case
  return p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).toLowerCase();
}

/**
 * Safely get CSSStyleDeclaration from element
 */
function getInlineStyle(element: Element): CSSStyleDeclaration | null {
  const htmlElement = element as HTMLElement;
  const style = htmlElement.style;

  if (!style) return null;
  if (typeof style.getPropertyValue !== 'function') return null;
  if (typeof style.setProperty !== 'function') return null;
  if (typeof style.removeProperty !== 'function') return null;

  return style;
}

/**
 * Read inline style property value
 */
function readStyleValue(style: CSSStyleDeclaration, property: string): string {
  const prop = normalizePropertyName(property);
  if (!prop) return '';
  return style.getPropertyValue(prop).trim();
}

/**
 * Read computed style property value
 */
function readComputedStyleValue(element: Element, property: string): string {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return '';
  }
  const prop = normalizePropertyName(property);
  if (!prop) return '';
  try {
    const computed = window.getComputedStyle(element as Element);
    return computed.getPropertyValue(prop).trim();
  } catch {
    return '';
  }
}

/**
 * Write inline style property value
 */
function writeStyleValue(style: CSSStyleDeclaration, property: string, value: string): void {
  const prop = normalizePropertyName(property);
  if (!prop) return;

  const v = value.trim();
  if (!v) {
    style.removeProperty(prop);
  } else {
    style.setProperty(prop, v);
  }
}

/**
 * Apply a styles snapshot to an element
 */
function applyStylesSnapshot(element: Element, styles: Record<string, string> | undefined): void {
  if (!styles) return;

  const inlineStyle = getInlineStyle(element);
  if (!inlineStyle) return;

  for (const [property, value] of Object.entries(styles)) {
    writeStyleValue(inlineStyle, property, value);
  }
}

// =============================================================================
// Class Helpers (Phase 4.7)
// =============================================================================

/**
 * Normalize class list: deduplicate, trim, remove empty tokens
 */
function normalizeClassList(input: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of input ?? []) {
    const token = String(raw ?? '').trim();
    if (!token) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }

  return out;
}

/**
 * Check if two string arrays are equal (order-sensitive)
 */
function isSameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Read class list from element (compatible with SVG elements)
 */
function readClassList(element: Element): string[] {
  try {
    // HTMLElement has classList, but SVG's className is SVGAnimatedString
    const list = (element as HTMLElement).classList;
    if (list && typeof list[Symbol.iterator] === 'function') {
      return Array.from(list).filter(Boolean);
    }
  } catch {
    // Fall back to attribute parsing
  }

  try {
    const raw = element.getAttribute('class') ?? '';
    return raw
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Apply class list to element (compatible with SVG elements)
 * Uses setAttribute for cross-browser SVG compatibility
 */
function applyClassListToElement(element: Element, classes: readonly string[]): void {
  const normalized = normalizeClassList(classes);
  const value = normalized.join(' ').trim();

  try {
    if (value) {
      element.setAttribute('class', value);
    } else {
      element.removeAttribute('class');
    }
  } catch {
    // Best-effort: element may be in an invalid state or disconnected
  }
}

// =============================================================================
// Structure Helpers (Phase 5.5)
// =============================================================================

/**
 * Read element's inline styles as a plain object.
 * Only includes explicitly set inline properties (not computed styles).
 */
function readInlineStyleMap(element: Element): Record<string, string> | undefined {
  const style = getInlineStyle(element);
  if (!style) return undefined;

  const result: Record<string, string> = {};
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i);
    if (!prop) continue;
    const value = style.getPropertyValue(prop).trim();
    if (value) {
      result[prop] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Parse HTML string into a single root element.
 * Returns null if parsing fails or yields multiple root elements.
 */
function parseSingleRootElement(html: string): Element | null {
  const trimmed = String(html ?? '').trim();
  if (!trimmed) return null;

  try {
    const template = document.createElement('template');
    template.innerHTML = trimmed;

    const firstChild = template.content.firstElementChild;
    if (!firstChild || template.content.childElementCount !== 1) {
      return null;
    }
    return firstChild;
  } catch {
    return null;
  }
}

/**
 * Remove id attributes from an element and all its descendants.
 * Used by duplicate to avoid creating duplicate IDs on the page.
 */
function stripIdsFromSubtree(root: Element): void {
  try {
    root.removeAttribute('id');
    const descendantsWithId = root.querySelectorAll('[id]');
    for (const el of Array.from(descendantsWithId)) {
      el.removeAttribute('id');
    }
  } catch {
    // Best-effort: ignore errors
  }
}

/**
 * Insert an element into a parent at a specific position.
 * Used for deterministic undo/redo of delete/duplicate operations.
 */
function insertElementAtPosition(
  parent: Element,
  element: Element,
  position: MoveOperationData,
): boolean {
  if (!parent.isConnected) return false;

  let reference: ChildNode | null = null;

  // Anchor-first resolution for stability
  if (position.anchorLocator) {
    const anchor = locateElement(position.anchorLocator);
    if (anchor && anchor.parentElement === parent) {
      reference = position.anchorPosition === 'before' ? anchor : anchor.nextSibling;
    }
  }

  // Fallback to index-based insertion
  if (!reference) {
    const children = Array.from(parent.children);
    const index = Math.max(0, Math.min(position.insertIndex, children.length));
    reference = children[index] ?? null;
  }

  try {
    parent.insertBefore(element, reference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap an element with a new container at the same DOM position.
 * Returns the wrapper element on success, null on failure.
 */
function wrapElementWithContainer(
  target: Element,
  wrapperTag: string,
  wrapperStyles?: Record<string, string>,
): Element | null {
  const parent = target.parentElement;
  if (!parent) return null;

  const tag = String(wrapperTag || 'div').toLowerCase();
  const wrapper = document.createElement(tag);

  // Apply wrapper styles
  if (wrapperStyles) {
    applyStylesSnapshot(wrapper, wrapperStyles);
  }

  try {
    parent.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    return wrapper;
  } catch {
    return null;
  }
}

/**
 * Unwrap a container that has exactly one element child.
 * Moves the child to the container's position and removes the container.
 * Returns the unwrapped child on success, null on failure.
 */
function unwrapSingleChildContainer(wrapper: Element): Element | null {
  const parent = wrapper.parentElement;
  if (!parent) return null;
  if (wrapper.childElementCount !== 1) return null;

  const child = wrapper.firstElementChild;
  if (!child) return null;

  try {
    parent.insertBefore(child, wrapper);
    wrapper.remove();
    return child;
  } catch {
    return null;
  }
}

/**
 * Build insertion position data for inserting after a target element.
 * Used by duplicate to record where the clone was inserted.
 */
function buildInsertAfterPosition(target: Element): MoveOperationData | null {
  const parent = target.parentElement;
  if (!parent) return null;

  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(target);
  if (index < 0) return null;

  return {
    parentLocator: createElementLocator(parent),
    insertIndex: index + 1,
    anchorLocator: createElementLocator(target),
    anchorPosition: 'after',
  };
}

// =============================================================================
// Transaction Helpers
// =============================================================================

let transactionSeq = 0;

/**
 * Generate unique transaction ID
 */
function generateTransactionId(timestamp: number): string {
  transactionSeq += 1;
  return `tx_${timestamp.toString(36)}_${transactionSeq.toString(36)}`;
}

/**
 * Create a style transaction record from style maps.
 * This is the core factory used by both single-style and multi-style APIs.
 *
 * @param id - Unique transaction identifier
 * @param locator - Target element locator
 * @param beforeStyles - Style values before the change
 * @param afterStyles - Style values after the change
 * @param timestamp - Transaction timestamp
 * @param elementKey - Optional stable element key for transaction grouping
 */
function createStyleTransactionFromStyles(
  id: string,
  locator: ElementLocator,
  beforeStyles: Record<string, string>,
  afterStyles: Record<string, string>,
  timestamp: number,
  elementKey?: WebEditorElementKey,
  computedBeforeStyles?: Record<string, string>,
): Transaction {
  const beforeSnapshot: TransactionSnapshot = {
    locator,
    styles: beforeStyles,
  };
  if (computedBeforeStyles && Object.keys(computedBeforeStyles).length > 0) {
    beforeSnapshot.computedStyles = computedBeforeStyles;
  }

  const afterSnapshot: TransactionSnapshot = {
    locator,
    styles: afterStyles,
  };

  return {
    id,
    type: 'style',
    targetLocator: locator,
    elementKey,
    before: beforeSnapshot,
    after: afterSnapshot,
    timestamp,
    merged: false,
  };
}

/**
 * Create a style transaction record for a single property.
 * Convenience wrapper around createStyleTransactionFromStyles.
 *
 * @param id - Unique transaction identifier
 * @param locator - Target element locator
 * @param property - CSS property name
 * @param beforeValue - Property value before the change
 * @param afterValue - Property value after the change
 * @param timestamp - Transaction timestamp
 * @param elementKey - Optional stable element key for transaction grouping
 */
function createStyleTransaction(
  id: string,
  locator: ElementLocator,
  property: string,
  beforeValue: string,
  afterValue: string,
  timestamp: number,
  elementKey?: WebEditorElementKey,
  computedBeforeValue?: string,
): Transaction {
  const prop = normalizePropertyName(property);
  const computed =
    computedBeforeValue && computedBeforeValue.trim()
      ? { [prop]: computedBeforeValue }
      : undefined;
  return createStyleTransactionFromStyles(
    id,
    locator,
    { [prop]: beforeValue },
    { [prop]: afterValue },
    timestamp,
    elementKey,
    computed,
  );
}

/**
 * Create a text transaction record (Phase 2.7)
 *
 * @param id - Unique transaction identifier
 * @param locator - Target element locator
 * @param beforeText - Text content before the change
 * @param afterText - Text content after the change
 * @param timestamp - Transaction timestamp
 * @param elementKey - Optional stable element key for transaction grouping
 */
function createTextTransaction(
  id: string,
  locator: ElementLocator,
  beforeText: string,
  afterText: string,
  timestamp: number,
  elementKey?: WebEditorElementKey,
): Transaction {
  const beforeSnapshot: TransactionSnapshot = {
    locator,
    text: beforeText,
  };

  const afterSnapshot: TransactionSnapshot = {
    locator,
    text: afterText,
  };

  return {
    id,
    type: 'text',
    targetLocator: locator,
    elementKey,
    before: beforeSnapshot,
    after: afterSnapshot,
    timestamp,
    merged: false,
  };
}

/**
 * Create a class transaction record (Phase 4.7)
 *
 * Uses separate before/after locators to improve undo/redo recovery
 * when CSS selectors include class-based matching.
 *
 * @param id - Unique transaction identifier
 * @param beforeLocator - Element locator before class change
 * @param afterLocator - Element locator after class change
 * @param beforeClasses - Class list before the change
 * @param afterClasses - Class list after the change
 * @param timestamp - Transaction timestamp
 * @param elementKey - Optional stable element key for transaction grouping
 */
function createClassTransaction(
  id: string,
  beforeLocator: ElementLocator,
  afterLocator: ElementLocator,
  beforeClasses: string[],
  afterClasses: string[],
  timestamp: number,
  elementKey?: WebEditorElementKey,
): Transaction {
  const beforeSnapshot: TransactionSnapshot = {
    locator: beforeLocator,
    classes: beforeClasses,
  };

  const afterSnapshot: TransactionSnapshot = {
    locator: afterLocator,
    classes: afterClasses,
  };

  return {
    id,
    type: 'class',
    targetLocator: afterLocator,
    elementKey,
    before: beforeSnapshot,
    after: afterSnapshot,
    timestamp,
    merged: false,
  };
}

/**
 * Create a move transaction record (Phase 2.4-2.6)
 *
 * @param id - Unique transaction identifier
 * @param beforeLocator - Element locator before move
 * @param afterLocator - Element locator after move
 * @param moveData - Move operation data (from/to positions)
 * @param timestamp - Transaction timestamp
 * @param elementKey - Optional stable element key for transaction grouping
 */
function createMoveTransaction(
  id: string,
  beforeLocator: ElementLocator,
  afterLocator: ElementLocator,
  moveData: MoveTransactionData,
  timestamp: number,
  elementKey?: WebEditorElementKey,
): Transaction {
  const beforeSnapshot: TransactionSnapshot = {
    locator: beforeLocator,
  };

  const afterSnapshot: TransactionSnapshot = {
    locator: afterLocator,
  };

  return {
    id,
    type: 'move',
    targetLocator: afterLocator,
    elementKey,
    before: beforeSnapshot,
    after: afterSnapshot,
    moveData,
    timestamp,
    merged: false,
  };
}

/**
 * Create a structure transaction record (Phase 5.5)
 *
 * Used for wrap/unwrap/delete/duplicate operations.
 * delete/duplicate store position + html for deterministic undo/redo.
 *
 * @param id - Unique transaction identifier
 * @param targetLocator - Primary target element locator
 * @param beforeLocator - Element locator before structure change
 * @param afterLocator - Element locator after structure change
 * @param structureData - Structure operation data
 * @param timestamp - Transaction timestamp
 * @param elementKey - Optional stable element key for transaction grouping
 */
function createStructureTransaction(
  id: string,
  targetLocator: ElementLocator,
  beforeLocator: ElementLocator,
  afterLocator: ElementLocator,
  structureData: StructureOperationData,
  timestamp: number,
  elementKey?: WebEditorElementKey,
): Transaction {
  const beforeSnapshot: TransactionSnapshot = { locator: beforeLocator };
  const afterSnapshot: TransactionSnapshot = { locator: afterLocator };

  return {
    id,
    type: 'structure',
    targetLocator,
    elementKey,
    before: beforeSnapshot,
    after: afterSnapshot,
    structureData,
    timestamp,
    merged: false,
  };
}

/**
 * Check if element is a disallowed target for structure operations (HTML/BODY/HEAD)
 * These elements should not be wrapped, deleted, duplicated, or unwrapped.
 */
function isDisallowedStructureTarget(element: Element): boolean {
  const tag = element.tagName?.toUpperCase();
  return tag === 'HTML' || tag === 'BODY' || tag === 'HEAD';
}

/**
 * Check if element is a disallowed parent container for structure operations (HTML/HEAD only)
 * BODY is allowed as a parent container (unlike as a target).
 */
function isDisallowedStructureContainer(element: Element): boolean {
  const tag = element.tagName?.toUpperCase();
  return tag === 'HTML' || tag === 'HEAD';
}

/**
 * Check if element is a disallowed move target (HTML/BODY/HEAD)
 */
function isDisallowedMoveElement(element: Element): boolean {
  const tag = element.tagName?.toUpperCase();
  return tag === 'HTML' || tag === 'BODY' || tag === 'HEAD';
}

/**
 * Build MoveOperationData from element's current DOM position
 */
function buildMoveOperationData(element: Element): MoveOperationData | null {
  const parent = element.parentElement;
  if (!parent) return null;

  const siblings = Array.from(parent.children);
  const insertIndex = siblings.indexOf(element);
  if (insertIndex < 0) return null;

  const parentLocator = createElementLocator(parent);

  // Prefer anchoring to next sibling (insertBefore semantics)
  const next = element.nextElementSibling;
  if (next) {
    return {
      parentLocator,
      insertIndex,
      anchorLocator: createElementLocator(next),
      anchorPosition: 'before',
    };
  }

  // Fallback to previous sibling
  const prev = element.previousElementSibling;
  if (prev) {
    return {
      parentLocator,
      insertIndex,
      anchorLocator: createElementLocator(prev),
      anchorPosition: 'after',
    };
  }

  // No siblings - index only
  return {
    parentLocator,
    insertIndex,
    anchorPosition: 'before',
  };
}

/**
 * Apply a move operation (for undo/redo)
 */
function applyMoveOperation(target: Element, op: MoveOperationData): boolean {
  if (!target.isConnected) return false;
  if (isDisallowedMoveElement(target)) return false;

  const parent = locateElement(op.parentLocator);
  if (!parent) return false;
  if (!parent.isConnected) return false;

  // Disallow cross-root moves
  const targetRoot = target.getRootNode?.();
  const parentRoot = parent.getRootNode?.();
  if (targetRoot && parentRoot && targetRoot !== parentRoot) return false;

  // Prevent cycles (moving into own descendant)
  if (target === parent || target.contains(parent)) return false;

  let reference: ChildNode | null = null;

  // Anchor-first resolution
  if (op.anchorLocator) {
    const anchor = locateElement(op.anchorLocator);
    if (anchor && anchor !== target && anchor.parentElement === parent) {
      reference = op.anchorPosition === 'before' ? anchor : anchor.nextSibling;
      // Skip if reference is the target itself
      if (reference === target) {
        reference = target.nextSibling;
      }
    }
  }

  // Fallback: index-based
  if (!reference) {
    const children = Array.from(parent.children);
    // Remove target from consideration if it's already in parent
    const existingIndex = children.indexOf(target);
    if (existingIndex !== -1) {
      children.splice(existingIndex, 1);
    }
    const index = Math.max(0, Math.min(op.insertIndex, children.length));
    reference = children[index] ?? null;
  }

  try {
    parent.insertBefore(target, reference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the single style property from a transaction (if applicable)
 */
function getSingleStyleProperty(tx: Transaction): string | null {
  const keys = new Set<string>();

  if (tx.before.styles) {
    for (const k of Object.keys(tx.before.styles)) keys.add(k);
  }
  if (tx.after.styles) {
    for (const k of Object.keys(tx.after.styles)) keys.add(k);
  }

  return keys.size === 1 ? Array.from(keys)[0]! : null;
}

/**
 * Check if two transactions can be merged
 */
function canMerge(prev: Transaction, next: Transaction, mergeWindowMs: number): boolean {
  // Only merge style transactions
  if (prev.type !== 'style' || next.type !== 'style') return false;

  // Check time window
  if (Math.abs(next.timestamp - prev.timestamp) > mergeWindowMs) return false;

  // Check same target element
  if (locatorKey(prev.targetLocator) !== locatorKey(next.targetLocator)) return false;

  // Check same property
  const prevProp = getSingleStyleProperty(prev);
  const nextProp = getSingleStyleProperty(next);
  if (!prevProp || !nextProp || prevProp !== nextProp) return false;

  return true;
}

/**
 * Merge next transaction into prev (mutates prev)
 */
function mergeInto(prev: Transaction, next: Transaction): boolean {
  const prop = getSingleStyleProperty(prev);
  if (!prop) return false;

  const nextValue = next.after.styles?.[prop];
  if (nextValue === undefined) return false;

  // Update prev's after state
  if (!prev.after.styles) prev.after.styles = {};
  prev.after.styles[prop] = nextValue;
  prev.timestamp = next.timestamp;
  prev.merged = true;

  return true;
}

/**
 * Apply a structure transaction (undo or redo) - Phase 5.5
 *
 * Structure operations may create/remove nodes, so delete/duplicate
 * store position + html to make redo/undo deterministic.
 */
function applyStructureTransaction(tx: Transaction, direction: 'undo' | 'redo'): boolean {
  const data = tx.structureData;
  if (!data) return false;

  const isRedo = direction === 'redo';

  switch (data.action) {
    case 'wrap': {
      if (isRedo) {
        // Redo wrap: find the target and wrap it
        const target =
          locateElement(tx.before.locator) ??
          locateElement(tx.targetLocator) ??
          locateElement(tx.after.locator);
        if (!target || !target.isConnected) return false;
        if (isDisallowedStructureTarget(target)) return false;

        const parent = target.parentElement;
        if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return false;

        const wrapper = wrapElementWithContainer(
          target,
          data.wrapperTag ?? 'div',
          data.wrapperStyles,
        );
        if (!wrapper || !wrapper.isConnected) return false;

        // Update locators for subsequent undo
        const wrapperLocator = createElementLocator(wrapper);
        tx.after.locator = wrapperLocator;
        tx.targetLocator = wrapperLocator;
        return true;
      }

      // Undo wrap: unwrap the wrapper
      const wrapper = locateElement(tx.after.locator) ?? locateElement(tx.targetLocator);
      if (!wrapper || !wrapper.isConnected) return false;
      if (isDisallowedStructureTarget(wrapper)) return false;

      const child = unwrapSingleChildContainer(wrapper);
      if (!child || !child.isConnected) return false;

      // Update before locator for subsequent redo
      tx.before.locator = createElementLocator(child);
      return true;
    }

    case 'unwrap': {
      if (isRedo) {
        // Redo unwrap: find the wrapper and unwrap it
        const wrapper =
          locateElement(tx.before.locator) ??
          locateElement(tx.after.locator)?.parentElement ??
          locateElement(tx.targetLocator)?.parentElement;
        if (!wrapper || !wrapper.isConnected) return false;
        if (isDisallowedStructureTarget(wrapper)) return false;

        const child = unwrapSingleChildContainer(wrapper);
        if (!child || !child.isConnected) return false;

        // Update locators for subsequent undo
        const childLocator = createElementLocator(child);
        tx.after.locator = childLocator;
        tx.targetLocator = childLocator;
        return true;
      }

      // Undo unwrap: rewrap the child
      const child = locateElement(tx.after.locator) ?? locateElement(tx.targetLocator);
      if (!child || !child.isConnected) return false;
      if (isDisallowedStructureTarget(child)) return false;

      const parent = child.parentElement;
      if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return false;

      const wrapper = wrapElementWithContainer(child, data.wrapperTag ?? 'div', data.wrapperStyles);
      if (!wrapper || !wrapper.isConnected) return false;

      // Update before locator for subsequent redo
      tx.before.locator = createElementLocator(wrapper);
      return true;
    }

    case 'delete': {
      if (isRedo) {
        // Redo delete: remove the element
        const target = locateElement(tx.before.locator) ?? locateElement(tx.targetLocator);
        if (!target || !target.isConnected) return false;
        if (isDisallowedStructureTarget(target)) return false;

        target.remove();
        return true;
      }

      // Undo delete: restore the element from html + position
      if (!data.position || !data.html) return false;

      const parent = locateElement(data.position.parentLocator);
      if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return false;

      const element = parseSingleRootElement(data.html);
      if (!element) return false;

      if (!insertElementAtPosition(parent, element, data.position)) return false;

      // Update locators for subsequent redo
      const locator = createElementLocator(element);
      tx.before.locator = locator;
      tx.targetLocator = locator;
      return true;
    }

    case 'duplicate': {
      if (isRedo) {
        // Redo duplicate: recreate the clone from html + position
        if (!data.position || !data.html) return false;

        const parent = locateElement(data.position.parentLocator);
        if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return false;

        const element = parseSingleRootElement(data.html);
        if (!element) return false;

        if (!insertElementAtPosition(parent, element, data.position)) return false;

        // Update locators for subsequent undo
        const locator = createElementLocator(element);
        tx.after.locator = locator;
        tx.targetLocator = locator;
        return true;
      }

      // Undo duplicate: remove the clone
      const clone = locateElement(tx.after.locator) ?? locateElement(tx.targetLocator);
      if (!clone || !clone.isConnected) return false;
      if (isDisallowedStructureTarget(clone)) return false;

      clone.remove();
      return true;
    }

    default:
      return false;
  }
}

/**
 * Apply a transaction (undo or redo)
 * Returns true on success, false on failure
 */
function applyTransaction(tx: Transaction, direction: 'undo' | 'redo'): boolean {
  // Phase 2.4-2.6: Apply move transactions
  if (tx.type === 'move') {
    const moveData = tx.moveData;
    if (!moveData) return false;

    // For undo: element is currently at after position, use after.locator to find it
    // For redo: element is currently at before position, use before.locator to find it
    const primaryLocator = direction === 'undo' ? tx.after.locator : tx.before.locator;
    const fallbackLocator = direction === 'undo' ? tx.before.locator : tx.after.locator;

    const target =
      locateElement(primaryLocator) ??
      locateElement(fallbackLocator) ??
      locateElement(tx.targetLocator);

    if (!target) return false;

    const op = direction === 'undo' ? moveData.from : moveData.to;
    return applyMoveOperation(target, op);
  }

  // Phase 4.7: Apply class transactions
  if (tx.type === 'class') {
    // For undo: element is currently at after state, use after.locator to find it
    // For redo: element is currently at before state, use before.locator to find it
    const primaryLocator = direction === 'undo' ? tx.after.locator : tx.before.locator;
    const fallbackLocator = direction === 'undo' ? tx.before.locator : tx.after.locator;

    const target =
      locateElement(primaryLocator) ??
      locateElement(fallbackLocator) ??
      locateElement(tx.targetLocator);

    if (!target) return false;

    const snapshot = direction === 'undo' ? tx.before : tx.after;
    const classes = Array.isArray(snapshot.classes) ? snapshot.classes : [];
    applyClassListToElement(target, classes);
    return true;
  }

  // Phase 5.5: Apply structure transactions
  if (tx.type === 'structure') {
    return applyStructureTransaction(tx, direction);
  }

  // Only handle style and text transactions (other types are no-op here)
  if (tx.type !== 'style' && tx.type !== 'text') return true;

  const target = locateElement(tx.targetLocator);
  if (!target) {
    return false;
  }

  const snapshot = direction === 'undo' ? tx.before : tx.after;

  if (tx.type === 'style') {
    applyStylesSnapshot(target, snapshot.styles);
    return true;
  }

  // Phase 2.7: Apply text content change
  if (tx.type === 'text') {
    writeEditableText(target, snapshot.text ?? '');
    return true;
  }

  return true;
}

// =============================================================================
// Transaction Manager Implementation
// =============================================================================

/**
 * Create a Transaction Manager instance
 */
export function createTransactionManager(
  options: TransactionManagerOptions = {},
): TransactionManager {
  const disposer = new Disposer();

  // Configuration
  const maxHistory = Math.max(1, options.maxHistory ?? DEFAULT_MAX_HISTORY);
  const mergeWindowMs = Math.max(0, options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS);
  const now = options.now ?? (() => Date.now());

  // State
  const undoStack: Transaction[] = [];
  const redoStack: Transaction[] = [];

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  function emit(action: TransactionChangeAction, transaction: Transaction | null): void {
    options.onChange?.({
      action,
      transaction,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
    });
  }

  // ==========================================================================
  // Stack Management
  // ==========================================================================

  function enforceMaxHistory(): void {
    if (undoStack.length > maxHistory) {
      undoStack.splice(0, undoStack.length - maxHistory);
    }
  }

  function pushTransaction(tx: Transaction, allowMerge: boolean): void {
    const hadRedo = redoStack.length > 0;

    // Clear redo stack on new action
    if (hadRedo) {
      redoStack.length = 0;
    }

    // Try to merge with previous transaction
    if (!hadRedo && allowMerge && undoStack.length > 0) {
      const last = undoStack[undoStack.length - 1]!;
      if (canMerge(last, tx, mergeWindowMs) && mergeInto(last, tx)) {
        emit('merge', last);
        return;
      }
    }

    undoStack.push(tx);
    enforceMaxHistory();
    emit('push', tx);
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  function recordStyle(
    locator: ElementLocator,
    property: string,
    beforeValue: string,
    afterValue: string,
    recordOptions?: { merge?: boolean },
  ): Transaction | null {
    if (disposer.isDisposed) return null;

    const prop = normalizePropertyName(property);
    if (!prop) return null;

    const before = beforeValue.trim();
    const after = afterValue.trim();
    if (before === after) return null;

    const id = generateTransactionId(now());
    const tx = createStyleTransaction(id, locator, prop, before, after, now());
    pushTransaction(tx, recordOptions?.merge !== false);

    return tx;
  }

  /**
   * Record a text transaction (Phase 2.7)
   */
  function recordText(target: Element, beforeText: string, afterText: string): Transaction | null {
    if (disposer.isDisposed) return null;

    const before = String(beforeText ?? '');
    const after = String(afterText ?? '');
    if (before === after) return null;

    const locator = createElementLocator(target);
    const timestamp = now();
    const id = generateTransactionId(timestamp);
    const elementKey = locator.textFragment
      ? locatorKey(locator)
      : generateStableElementKey(target, locator.shadowHostChain);
    const tx = createTextTransaction(id, locator, before, after, timestamp, elementKey);

    // No merge for text transactions in Phase 2
    pushTransaction(tx, false);
    return tx;
  }

  /**
   * Record a class list change and create transaction (Phase 4.7)
   *
   * Notes:
   * - Uses setAttribute/removeAttribute for SVG compatibility
   * - Captures before/after locators to improve redo/undo recovery
   *   when CSS selectors include class-based matching
   * - No merge support (class edits should be discrete undo steps)
   */
  function recordClass(
    target: Element,
    beforeClasses: string[],
    afterClasses: string[],
  ): Transaction | null {
    if (disposer.isDisposed) return null;
    if (!target.isConnected) return null;

    // Read current DOM state as ground truth
    const domClasses = normalizeClassList(readClassList(target));
    const beforeInput = normalizeClassList(beforeClasses);
    const after = normalizeClassList(afterClasses);

    // Prefer DOM as source of truth if caller-provided classes are stale
    const before = isSameStringList(beforeInput, domClasses) ? beforeInput : domClasses;
    if (isSameStringList(before, after)) return null;

    const timestamp = now();
    const id = generateTransactionId(timestamp);

    // Capture locator before applying change (class may affect selector matching)
    const beforeLocator = createElementLocator(target);

    // Generate stable element key BEFORE class mutation to ensure consistency
    const elementKey = generateStableElementKey(target, beforeLocator.shadowHostChain);

    // Apply the change
    applyClassListToElement(target, after);

    // Capture locator after applying change
    const afterLocator = createElementLocator(target);

    const tx = createClassTransaction(
      id,
      beforeLocator,
      afterLocator,
      before,
      after,
      timestamp,
      elementKey,
    );

    // No merge for class transactions (each add/remove is a discrete undo step)
    pushTransaction(tx, false);
    return tx;
  }

  /**
   * Apply a structure operation and record a transaction (Phase 5.5)
   *
   * Performs the DOM mutation immediately and records the transaction.
   * delete/duplicate store position + html for deterministic undo/redo.
   * unwrap is limited to single-child containers to keep the schema minimal.
   */
  function applyStructure(target: Element, input: StructureOperationData): Transaction | null {
    if (disposer.isDisposed) return null;
    if (!target.isConnected) return null;
    if (isDisallowedStructureTarget(target)) return null;

    const action = input?.action;
    const timestamp = now();
    const id = generateTransactionId(timestamp);

    // =========================================================================
    // Wrap: create a container around the target element
    // =========================================================================
    if (action === 'wrap') {
      const parent = target.parentElement;
      if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return null;

      const beforeLocator = createElementLocator(target);
      const wrapper = wrapElementWithContainer(
        target,
        input.wrapperTag ?? 'div',
        input.wrapperStyles,
      );
      if (!wrapper || !wrapper.isConnected) return null;

      const wrapperLocator = createElementLocator(wrapper);
      const elementKey = generateStableElementKey(wrapper, wrapperLocator.shadowHostChain);
      const structureData: StructureOperationData = {
        action: 'wrap',
        wrapperTag: input.wrapperTag ?? 'div',
        wrapperStyles: input.wrapperStyles,
      };

      const tx = createStructureTransaction(
        id,
        wrapperLocator,
        beforeLocator,
        wrapperLocator,
        structureData,
        timestamp,
        elementKey,
      );

      pushTransaction(tx, false);
      return tx;
    }

    // =========================================================================
    // Unwrap: remove the container and keep its single child
    // =========================================================================
    if (action === 'unwrap') {
      const wrapper = target;
      const parent = wrapper.parentElement;
      if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return null;

      // Only support unwrapping containers with exactly one element child
      if (wrapper.childElementCount !== 1) return null;

      const beforeLocator = createElementLocator(wrapper);
      const wrapperTag = wrapper.tagName.toLowerCase();
      const wrapperStyles = readInlineStyleMap(wrapper);

      const child = unwrapSingleChildContainer(wrapper);
      if (!child || !child.isConnected) return null;

      const childLocator = createElementLocator(child);
      const elementKey = generateStableElementKey(child, childLocator.shadowHostChain);
      const structureData: StructureOperationData = {
        action: 'unwrap',
        wrapperTag,
        wrapperStyles,
      };

      const tx = createStructureTransaction(
        id,
        childLocator,
        beforeLocator,
        childLocator,
        structureData,
        timestamp,
        elementKey,
      );

      pushTransaction(tx, false);
      return tx;
    }

    // =========================================================================
    // Delete: remove the element and store info for restoration
    // =========================================================================
    if (action === 'delete') {
      const position = buildMoveOperationData(target);
      if (!position) return null;

      // Store outerHTML for undo restoration
      const html = String((target as unknown as { outerHTML?: unknown }).outerHTML ?? '').trim();
      if (!html) return null;

      const beforeLocator = createElementLocator(target);
      // Generate stable key BEFORE removing element from DOM
      const elementKey = generateStableElementKey(target, beforeLocator.shadowHostChain);
      const afterLocator = position.parentLocator;

      try {
        target.remove();
      } catch {
        return null;
      }

      const structureData: StructureOperationData = {
        action: 'delete',
        position,
        html,
      };

      const tx = createStructureTransaction(
        id,
        beforeLocator,
        beforeLocator,
        afterLocator,
        structureData,
        timestamp,
        elementKey,
      );

      pushTransaction(tx, false);
      return tx;
    }

    // =========================================================================
    // Duplicate: clone the element and insert after it
    // =========================================================================
    if (action === 'duplicate') {
      const parent = target.parentElement;
      if (!parent || !parent.isConnected || isDisallowedStructureContainer(parent)) return null;

      const position = buildInsertAfterPosition(target);
      if (!position) return null;

      const beforeLocator = createElementLocator(target);

      // Clone the element and strip IDs to avoid duplicates
      const clone = target.cloneNode(true) as Element;
      stripIdsFromSubtree(clone);

      try {
        // Insert immediately after target
        parent.insertBefore(clone, target.nextSibling);
      } catch {
        return null;
      }

      // Store clone's outerHTML for redo restoration
      const html = String((clone as unknown as { outerHTML?: unknown }).outerHTML ?? '').trim();
      if (!html) return null;

      const cloneLocator = createElementLocator(clone);
      // Generate key for the NEW clone element (not the original target)
      const elementKey = generateStableElementKey(clone, cloneLocator.shadowHostChain);
      const structureData: StructureOperationData = {
        action: 'duplicate',
        position,
        html,
      };

      const tx = createStructureTransaction(
        id,
        cloneLocator,
        beforeLocator,
        cloneLocator,
        structureData,
        timestamp,
        elementKey,
      );

      pushTransaction(tx, false);
      return tx;
    }

    return null;
  }

  /**
   * Begin a move transaction for drag-reorder (Phase 2.4-2.6)
   *
   * Records the element's location at drag start. Call commit() after DOM move
   * to record the final location and create the transaction.
   */
  function beginMove(target: Element): MoveTransactionHandle | null {
    if (disposer.isDisposed) return null;
    if (!target.isConnected) return null;
    if (isDisallowedMoveElement(target)) return null;

    const from = buildMoveOperationData(target);
    if (!from) return null;

    const startedAt = now();
    const id = generateTransactionId(startedAt);
    const beforeLocator = createElementLocator(target);
    let completed = false;

    function commit(targetAfterMove: Element): Transaction | null {
      if (completed || disposer.isDisposed) return null;
      completed = true;

      if (!targetAfterMove.isConnected) return null;
      if (isDisallowedMoveElement(targetAfterMove)) return null;

      const to = buildMoveOperationData(targetAfterMove);
      if (!to) return null;

      // Skip no-op moves (same parent and same effective position)
      const sameParent = locatorKey(from!.parentLocator) === locatorKey(to.parentLocator);
      const sameIndex = from!.insertIndex === to.insertIndex;
      const sameAnchorPos = from!.anchorPosition === to.anchorPosition;
      const sameAnchor =
        (!from!.anchorLocator && !to.anchorLocator) ||
        (from!.anchorLocator &&
          to.anchorLocator &&
          locatorKey(from!.anchorLocator) === locatorKey(to.anchorLocator));

      if (sameParent && sameIndex && sameAnchor && sameAnchorPos) {
        return null;
      }

      const afterLocator = createElementLocator(targetAfterMove);
      const elementKey = generateStableElementKey(targetAfterMove, afterLocator.shadowHostChain);
      const moveData: MoveTransactionData = { from: from!, to };
      const tx = createMoveTransaction(
        id,
        beforeLocator,
        afterLocator,
        moveData,
        now(),
        elementKey,
      );

      // No merge for move transactions
      pushTransaction(tx, false);
      return tx;
    }

    function cancel(): void {
      if (completed || disposer.isDisposed) return;
      completed = true;
    }

    return {
      id,
      beforeLocator,
      from,
      commit,
      cancel,
    };
  }

  function beginStyle(target: Element, property: string): StyleTransactionHandle | null {
    if (disposer.isDisposed) return null;

    const inlineStyleOrNull = getInlineStyle(target);
    if (!inlineStyleOrNull) return null;

    // Capture as non-null after guard (TypeScript can't narrow across closures)
    const inlineStyle: CSSStyleDeclaration = inlineStyleOrNull;

    const prop = normalizePropertyName(property);
    if (!prop) return null;

    const locator = createElementLocator(target);
    const beforeValue = readStyleValue(inlineStyle, prop);
    const computedBefore = readComputedStyleValue(target, prop);
    const id = generateTransactionId(now());

    // Generate stable element key at the start (before any mutations)
    const elementKey = generateStableElementKey(target, locator.shadowHostChain);

    let completed = false;

    function set(value: string): void {
      if (completed || disposer.isDisposed) return;
      writeStyleValue(inlineStyle, prop, value);
    }

    function commit(commitOptions?: { merge?: boolean }): Transaction | null {
      if (completed || disposer.isDisposed) return null;
      completed = true;

      const afterValue = readStyleValue(inlineStyle, prop);
      if (afterValue === beforeValue) return null;

      const tx = createStyleTransaction(
        id,
        locator,
        prop,
        beforeValue,
        afterValue,
        now(),
        elementKey,
        computedBefore,
      );
      pushTransaction(tx, commitOptions?.merge !== false);
      return tx;
    }

    function rollback(): void {
      if (completed || disposer.isDisposed) return;
      completed = true;

      writeStyleValue(inlineStyle, prop, beforeValue);
      emit('rollback', null);
    }

    return {
      id,
      property: prop,
      targetLocator: locator,
      set,
      commit,
      rollback,
    };
  }

  /**
   * Begin an interactive multi-style edit (Phase 4.9)
   *
   * For operations that modify multiple CSS properties atomically,
   * such as resize handles (width + height) or position handles (top + left).
   *
   * Key differences from beginStyle:
   * - Tracks multiple properties at once
   * - Only records properties that actually changed
   * - Default merge is disabled to preserve gesture undo granularity
   */
  function beginMultiStyle(
    target: Element,
    properties: string[],
  ): MultiStyleTransactionHandle | null {
    if (disposer.isDisposed) return null;

    const inlineStyleOrNull = getInlineStyle(target);
    if (!inlineStyleOrNull) return null;
    const inlineStyle: CSSStyleDeclaration = inlineStyleOrNull;

    // Normalize and deduplicate properties
    const normalizedProps = Array.from(
      new Set(
        properties.map((p) => normalizePropertyName(String(p))).filter((p): p is string => !!p),
      ),
    );
    if (normalizedProps.length === 0) return null;

    const trackedProps = new Set(normalizedProps);
    const locator = createElementLocator(target);
    const startedAt = now();
    const id = generateTransactionId(startedAt);

    // Generate stable element key at the start (before any mutations)
    const elementKey = generateStableElementKey(target, locator.shadowHostChain);

    // Capture original values for all tracked properties
    const beforeValues: Record<string, string> = {};
    const computedBeforeValues: Record<string, string> = {};
    for (const prop of normalizedProps) {
      beforeValues[prop] = readStyleValue(inlineStyle, prop);
      computedBeforeValues[prop] = readComputedStyleValue(target, prop);
    }

    let completed = false;

    /**
     * Update one or more style values (live preview).
     * Only properties declared in the initial list are applied.
     */
    function set(values: Record<string, string>): void {
      if (completed || disposer.isDisposed) return;

      for (const [rawKey, rawVal] of Object.entries(values)) {
        const prop = normalizePropertyName(rawKey);
        if (!prop || !trackedProps.has(prop)) continue;
        writeStyleValue(inlineStyle, prop, String(rawVal ?? ''));
      }
    }

    /**
     * Commit the transaction and record to history.
     * Only properties that actually changed are included in the transaction.
     */
    function commit(commitOptions?: { merge?: boolean }): Transaction | null {
      if (completed || disposer.isDisposed) return null;
      completed = true;

      const beforeStyles: Record<string, string> = {};
      const afterStyles: Record<string, string> = {};
      const computedBeforeStyles: Record<string, string> = {};

      // Only include properties that actually changed
      for (const prop of normalizedProps) {
        const beforeVal = beforeValues[prop] ?? '';
        const afterVal = readStyleValue(inlineStyle, prop);
        if (afterVal === beforeVal) continue;
        beforeStyles[prop] = beforeVal;
        afterStyles[prop] = afterVal;
        const computedBefore = computedBeforeValues[prop] ?? '';
        if (computedBefore.trim()) {
          computedBeforeStyles[prop] = computedBefore;
        }
      }

      // No changes - don't create a transaction
      if (Object.keys(beforeStyles).length === 0) return null;

      const tx = createStyleTransactionFromStyles(
        id,
        locator,
        beforeStyles,
        afterStyles,
        now(),
        elementKey,
        computedBeforeStyles,
      );

      // Default to no-merge to preserve gesture undo granularity.
      // Multi-style edits (e.g., drag resize) should be single undo steps.
      pushTransaction(tx, commitOptions?.merge === true);
      return tx;
    }

    /**
     * Rollback all tracked properties to original values without recording.
     */
    function rollback(): void {
      if (completed || disposer.isDisposed) return;
      completed = true;

      for (const prop of normalizedProps) {
        writeStyleValue(inlineStyle, prop, beforeValues[prop] ?? '');
      }
      emit('rollback', null);
    }

    return {
      id,
      properties: normalizedProps,
      targetLocator: locator,
      set,
      commit,
      rollback,
    };
  }

  function applyStyle(
    target: Element,
    property: string,
    value: string,
    applyOptions?: { merge?: boolean },
  ): Transaction | null {
    const handle = beginStyle(target, property);
    if (!handle) return null;

    handle.set(value);
    return handle.commit(applyOptions);
  }

  function undo(): Transaction | null {
    if (disposer.isDisposed) return null;

    const tx = undoStack.pop();
    if (!tx) return null;

    // Try to apply the undo
    const success = applyTransaction(tx, 'undo');
    if (!success) {
      // Restore stack state on failure
      undoStack.push(tx);
      options.onApplyError?.(new Error(`Failed to locate element for undo: ${tx.id}`));
      return null;
    }

    redoStack.push(tx);
    emit('undo', tx);
    return tx;
  }

  function redo(): Transaction | null {
    if (disposer.isDisposed) return null;

    const tx = redoStack.pop();
    if (!tx) return null;

    // Try to apply the redo
    const success = applyTransaction(tx, 'redo');
    if (!success) {
      // Restore stack state on failure
      redoStack.push(tx);
      options.onApplyError?.(new Error(`Failed to locate element for redo: ${tx.id}`));
      return null;
    }

    undoStack.push(tx);
    enforceMaxHistory();
    emit('redo', tx);
    return tx;
  }

  function restoreDeletedElement(transactionId: string): Transaction | null {
    if (disposer.isDisposed) return null;

    const normalizedId = String(transactionId ?? '').trim();
    if (!normalizedId) return null;

    const transactionIndex = undoStack.findIndex((tx) => tx.id === normalizedId);
    if (transactionIndex < 0) return null;

    const tx = undoStack[transactionIndex];
    if (tx.type !== 'structure' || tx.structureData?.action !== 'delete') return null;
    if (!applyTransaction(tx, 'undo')) {
      options.onApplyError?.(new Error(`Failed to restore deleted element: ${tx.id}`));
      return null;
    }

    undoStack.splice(transactionIndex, 1);
    redoStack.length = 0;
    emit('restore', tx);
    return tx;
  }

  function canUndo(): boolean {
    return undoStack.length > 0;
  }

  function canRedo(): boolean {
    return redoStack.length > 0;
  }

  function getUndoStack(): readonly Transaction[] {
    return undoStack.slice();
  }

  function getRedoStack(): readonly Transaction[] {
    return redoStack.slice();
  }

  function clear(): void {
    undoStack.length = 0;
    redoStack.length = 0;
    emit('clear', null);
  }

  // ==========================================================================
  // Keyboard Bindings
  // ==========================================================================

  if (options.enableKeyBindings) {
    disposer.listen(
      window,
      'keydown',
      (event: KeyboardEvent) => {
        // Skip if event is from editor UI
        if (options.isEventFromEditorUi?.(event)) return;

        // Check for Ctrl/Cmd modifier
        const isMod = event.metaKey || event.ctrlKey;
        if (!isMod || event.altKey) return;

        const key = event.key.toLowerCase();

        // Ctrl/Cmd+Z: Undo, Ctrl/Cmd+Shift+Z: Redo, Ctrl/Cmd+Y: Redo
        if (key === 'z') {
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        } else if (key === 'y') {
          redo();
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      },
      KEYBIND_OPTIONS,
    );
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  function dispose(): void {
    undoStack.length = 0;
    redoStack.length = 0;
    disposer.dispose();
  }

  return {
    beginStyle,
    beginMultiStyle,
    beginMove,
    applyStyle,
    recordStyle,
    recordText,
    recordClass,
    applyStructure,
    undo,
    redo,
    restoreDeletedElement,
    canUndo,
    canRedo,
    getUndoStack,
    getRedoStack,
    clear,
    dispose,
  };
}
