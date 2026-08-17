/**
 * Event Controller
 *
 * Capture-phase event interceptor for Web Editor V2.
 *
 * Responsibilities:
 * - Intercept document-level pointer/mouse/keyboard events in capture phase
 * - Allow editor UI events (Shadow DOM) to pass through unmodified
 * - Block page interactions while editor is active
 * - Provide hover/selecting mode state machine
 * - Trigger callbacks for element hover, selection, and deselection
 *
 * Performance considerations:
 * - Uses rAF throttling for hover updates (elementFromPoint is expensive)
 * - Supports both PointerEvents (modern) and MouseEvents (fallback)
 * - Events are blocked via stopImmediatePropagation for complete isolation
 */

import { WEB_EDITOR_V2_DRAG_THRESHOLD_PX } from '../constants';
import {
  getAxhubAnnotationShadowHitElementAtPoint,
  isAxhubAnnotationDirectActionEvent,
} from '../utils/annotation-shadow-hit-test';
import { Disposer } from '../utils/disposables';

// =============================================================================
// Types
// =============================================================================

/** Mode of the event controller state machine */
export type EventControllerMode = 'hover' | 'selecting' | 'dragging' | 'interaction';

/** Keyboard modifiers state */
export interface EventModifiers {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

/** Selection event data */
export interface SelectEvent {
  element: Element;
  /** The innermost page element hit by the pointer before target resolution. */
  initialElement?: Element;
  modifiers: EventModifiers;
  clientX: number;
  clientY: number;
}

/** Double-click event data for selected elements */
export interface DoubleClickSelectedEvent {
  element: Element;
  /** Raw page element path ordered from the innermost hit to outer ancestors. */
  pathElements: readonly Element[];
  modifiers: EventModifiers;
  clientX: number;
  clientY: number;
}

/** Drag cancel reasons */
export type DragCancelReason =
  | 'escape'
  | 'pointercancel'
  | 'mode_change'
  | 'dispose'
  | 'blur'
  | 'visibilitychange';

/** Drag start event data */
export interface DragStartEvent {
  pointerId: number;
  draggedElement: Element;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  modifiers: EventModifiers;
}

/** Drag move event data */
export interface DragMoveEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/** Drag end event data */
export type DragEndEvent = DragMoveEvent;

/** Drag cancel event data */
export interface DragCancelEvent {
  reason: DragCancelReason;
}

/** Options for creating the event controller */
export interface EventControllerOptions {
  /** Check if a DOM node belongs to the editor overlay */
  isOverlayElement: (node: unknown) => boolean;
  /**
   * Allow specific host page events to bypass editor interception.
   * Useful for host-specific controls that should stay clickable while
   * the editor remains active.
   */
  shouldAllowPageEvent?: (event: Event) => boolean;
  /** Called when hovering over an element (null when hovering over nothing) */
  onHover: (element: Element | null) => void;
  /** Called when an element is selected via click */
  onSelect: (event: SelectEvent) => void;
  /** Called when the current selected element is double-clicked */
  onDoubleClickSelected?: (event: DoubleClickSelectedEvent) => void;
  /** Called when selection is cancelled (ESC key or mode change) */
  onDeselect: () => void;
  /** Optional fast-path hover target normalizer, e.g. redirect descendants to a task root. */
  resolveTargetForHover?: (element: Element | null) => Element | null;
  /**
   * Optional custom target finder for selection (click).
   * If not provided, uses simple elementFromPoint.
   * Only used for selection, not hover (for performance).
   *
   * The event parameter enables Shadow DOM-aware selection via composedPath().
   */
  findTargetForSelect?: (
    x: number,
    y: number,
    modifiers: EventModifiers,
    event: PointerEvent | MouseEvent,
  ) => Element | null;
  /**
   * Get the currently selected element (used to gate drag start in selecting mode).
   */
  getSelectedElement?: () => Element | null;
  /** Whether the target element should be ignored because its interaction is locked */
  isElementInteractionLocked?: (element: Element | null) => boolean;
  /**
   * When true, allow native browser text selection (no pointer/mouse blocking).
   * Used by the `text-comment` profile so users can drag-select text normally.
   * Keyboard events (Escape) are still intercepted.
   */
  allowNativeTextSelection?: boolean;
  /**
   * Called when drag starts (after movement threshold is exceeded).
   * Return true to enter `dragging` mode.
   */
  onStartDrag?: (event: DragStartEvent) => boolean;
  /** Called for pointer moves while dragging */
  onDragMove?: (event: DragMoveEvent) => void;
  /** Called when drag ends (pointerup) */
  onDragEnd?: (event: DragEndEvent) => void;
  /** Called when drag is cancelled (ESC/pointercancel/dispose) */
  onDragCancel?: (event: DragCancelEvent) => void;
}

/** Event controller public interface */
export interface EventController {
  /** Get current interaction mode */
  getMode(): EventControllerMode;
  /** Set interaction mode programmatically */
  setMode(mode: EventControllerMode, options?: { allowPageInteraction?: boolean }): void;
  /** Pin a hover target until pointer tracking resumes on the page */
  setProgrammaticHoverElement(element: Element | null): void;
  /** Cleanup all event listeners */
  dispose(): void;
}

// =============================================================================
// Constants
// =============================================================================

/** Common capture-phase listener options */
const CAPTURE_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: false,
};

/** Events to completely block on document (page interaction prevention) */
const BLOCKED_POINTER_EVENTS = [
  'pointerup',
  'pointercancel',
  'pointerover',
  'pointerout',
  'pointerenter',
  'pointerleave',
] as const;

const BLOCKED_MOUSE_EVENTS = [
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'mouseover',
  'mouseout',
  'mouseenter',
  'mouseleave',
] as const;

const BLOCKED_KEYBOARD_EVENTS = ['keyup', 'keypress'] as const;

import { isMobileDevice } from '../utils/mobile-detect';

const BLOCKED_TOUCH_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
const NON_PRIMARY_BUTTON_BYPASS_EVENTS = new Set([
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
]);

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create an event controller for managing editor interactions.
 *
 * The controller operates in four modes:
 * - `hover`: Mouse movement triggers onHover callbacks, click transitions to selecting
 * - `selecting`: An element is selected, ESC key returns to hover mode
 * - `dragging`: Drag reorder mode for the selected element (Phase 2.4-2.6)
 */
export function createEventController(options: EventControllerOptions): EventController {
  const {
    isOverlayElement,
    shouldAllowPageEvent,
    onHover,
    onSelect,
    onDoubleClickSelected,
    onDeselect,
    resolveTargetForHover,
    findTargetForSelect,
    getSelectedElement,
    isElementInteractionLocked,
    onStartDrag,
    onDragMove,
    onDragEnd,
    onDragCancel,
  } = options;
  const disposer = new Disposer();

  // Feature detection for PointerEvents
  const hasPointerEvents = typeof PointerEvent !== 'undefined';

  // ==========================================================================
  // State
  // ==========================================================================

  let mode: EventControllerMode = 'hover';
  let lastHoveredElement: Element | null = null;
  let programmaticHoverElement: Element | null = null;
  // ==========================================================================
  // Drag State (Phase 2.4-2.6)
  // ==========================================================================

  interface DragCandidate {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    modifiers: EventModifiers;
    selectedElement: Element;
    /** True if this candidate was created by a PointerEvent (not a fallback MouseEvent) */
    isPointerEventOrigin: boolean;
  }

  let dragCandidate: DragCandidate | null = null;
  let draggingPointerId: number | null = null;
  /** True if the current dragging session was initiated by PointerEvent */
  let draggingIsPointerOrigin = false;
  /** Flag to suppress mode_change cancel when we're intentionally leaving dragging */
  let suppressModeChangeDragCancel = false;

  // Pointer position tracking for rAF-throttled hover updates
  let hasPointerPosition = false;
  let lastClientX = 0;
  let lastClientY = 0;

  // Single rAF management (avoids Disposer array growth)
  let hoverRafId: number | null = null;
  let allowPageInteraction = false;
  let nativeTextSelectionClickTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeTextSelectionClickCandidate: {
    pointerId: number;
    target: Element;
    initialElement?: Element;
    modifiers: EventModifiers;
    startClientX: number;
    startClientY: number;
    isPointerEventOrigin: boolean;
  } | null = null;
  // On mobile, touch-originated pointerdown defers selection to pointerup.
  const TOUCH_TAP_THRESHOLD_PX = 15;
  let touchTapCandidate: {
    target: Element;
    initialElement?: Element;
    modifiers: EventModifiers;
    clientX: number;
    clientY: number;
    nextMode?: 'selecting';
  } | null = null;

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Check if an event originated from the editor UI (Shadow DOM safe)
   */
  function isEventFromEditorUi(event: Event): boolean {
    try {
      if (typeof event.composedPath === 'function') {
        return event.composedPath().some((node) => isOverlayElement(node));
      }
    } catch {
      // Fallback to target check
    }
    return isOverlayElement(event.target);
  }

  function getPageElementPath(event: Event, fallback: Element): Element[] {
    try {
      if (typeof event.composedPath === 'function') {
        const elements = event
          .composedPath()
          .filter(
            (node): node is Element =>
              node instanceof Element && node.isConnected && !isOverlayElement(node),
          );
        if (elements.length > 0) return elements;
      }
    } catch {
      // Fall back to the stable selected element below.
    }
    return [fallback];
  }

  function getInitialSelectionElement(event: Event, target: Element): Element | undefined {
    try {
      if (typeof event.composedPath === 'function') {
        const initialElement = event.composedPath().find(
          (node): node is Element =>
            node instanceof Element && node.isConnected && !isOverlayElement(node),
        );
        if (initialElement && initialElement !== target) return initialElement;
      }
    } catch {
      // Fall back to the resolved selection target below.
    }
    return undefined;
  }

  /**
   * Block an event from reaching the page.
   * In interaction mode or native-text-selection mode, let events pass through.
   */
  function blockPageEvent(event: Event): void {
    if (shouldEventBypassPageBlock(event)) {
      return;
    }

    // In interaction mode, do not block events so they reach the page
    if (mode === 'interaction' && allowPageInteraction) {
      return;
    }

    // In native text selection mode, allow pointer/mouse/touch events through
    // so the browser can handle text selection
    if (options.allowNativeTextSelection) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  function shouldEventBypassPageBlock(event: Event): boolean {
    if (event.type === 'contextmenu') {
      return true;
    }

    if (
      event instanceof MouseEvent &&
      NON_PRIMARY_BUTTON_BYPASS_EVENTS.has(event.type) &&
      event.button !== 0
    ) {
      return true;
    }

    if (isAxhubAnnotationDirectActionEvent(event)) {
      return true;
    }

    if (!shouldAllowPageEvent) {
      return false;
    }

    try {
      return shouldAllowPageEvent(event);
    } catch {
      return false;
    }
  }

  /**
   * Extract modifiers from an event
   */
  function extractModifiers(event: MouseEvent | KeyboardEvent): EventModifiers {
    return {
      alt: event.altKey,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
    };
  }

  /**
   * Get pointer ID from event (PointerEvent has pointerId, MouseEvent uses 0)
   */
  function getEventPointerId(event: PointerEvent | MouseEvent): number {
    return hasPointerEvents && event instanceof PointerEvent ? event.pointerId : 0;
  }

  /**
   * Check if we should process this event as the primary pointer.
   * On browsers with PointerEvents, mouse events fire after pointer events;
   * we use mouse listeners only for blocking, not for interaction logic.
   */
  function shouldProcessAsPrimaryPointer(event: PointerEvent | MouseEvent): boolean {
    if (hasPointerEvents && !(event instanceof PointerEvent)) return false;
    return true;
  }

  function reportHover(element: Element | null): void {
    lastHoveredElement = element;
    onHover(element);
  }

  /**
   * Check if an event originated from within a specific element (Shadow DOM safe)
   */
  function isEventWithinElement(event: Event, element: Element): boolean {
    try {
      if (typeof event.composedPath === 'function') {
        return event.composedPath().some((node) => node === element);
      }
    } catch {
      // Fallback
    }

    const target = event.target;
    return target instanceof Node && element.contains(target);
  }

  /**
   * Clear all drag-related state
   */
  function clearDragState(): void {
    dragCandidate = null;
    draggingPointerId = null;
    draggingIsPointerOrigin = false;
  }

  function clearNativeTextSelectionClickCandidate(): void {
    nativeTextSelectionClickCandidate = null;
    if (nativeTextSelectionClickTimer !== null) {
      clearTimeout(nativeTextSelectionClickTimer);
      nativeTextSelectionClickTimer = null;
    }
  }

  disposer.add(clearNativeTextSelectionClickCandidate);

  function hasNativeTextSelection(): boolean {
    try {
      const selection = window.getSelection?.();
      return Boolean(
        selection &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        selection.toString().trim(),
      );
    } catch {
      return false;
    }
  }

  function queueNativeTextSelectionClickCommit(event: PointerEvent | MouseEvent): void {
    const candidate = nativeTextSelectionClickCandidate;
    nativeTextSelectionClickCandidate = null;
    if (!candidate) return;

    const isPointerEvent = hasPointerEvents && event instanceof PointerEvent;
    if (candidate.isPointerEventOrigin !== isPointerEvent) return;
    if (candidate.pointerId !== getEventPointerId(event)) return;

    const dx = event.clientX - candidate.startClientX;
    const dy = event.clientY - candidate.startClientY;
    if (Math.hypot(dx, dy) >= WEB_EDITOR_V2_DRAG_THRESHOLD_PX) return;

    if (nativeTextSelectionClickTimer !== null) {
      clearTimeout(nativeTextSelectionClickTimer);
    }
    nativeTextSelectionClickTimer = setTimeout(() => {
      nativeTextSelectionClickTimer = null;
      if (disposer.isDisposed) return;
      if (!candidate.target.isConnected) return;
      if (isElementInteractionLocked?.(candidate.target) ?? false) return;
      if (hasNativeTextSelection()) return;

      setMode('selecting');
      onSelect({
        element: candidate.target,
        ...(candidate.initialElement ? { initialElement: candidate.initialElement } : {}),
        modifiers: candidate.modifiers,
        clientX: candidate.startClientX,
        clientY: candidate.startClientY,
      });
    }, 10);
  }

  /**
   * Cancel the current dragging session
   */
  function cancelDragging(reason: DragCancelReason): void {
    if (mode !== 'dragging') return;

    clearDragState();

    try {
      onDragCancel?.({ reason });
    } catch {
      // Best-effort
    }

    suppressModeChangeDragCancel = true;
    setMode('selecting');
  }

  /**
   * End the current dragging session (successful drop)
   */
  function endDragging(pointerId: number, clientX: number, clientY: number): void {
    if (mode !== 'dragging') return;
    if (draggingPointerId === null || draggingPointerId !== pointerId) return;

    clearDragState();

    try {
      onDragEnd?.({ pointerId, clientX, clientY });
    } catch {
      // Best-effort
    }

    suppressModeChangeDragCancel = true;
    setMode('selecting');
  }

  /**
   * Get the topmost element at a viewport coordinate (fast, for hover).
   * Uses simple elementFromPoint to maintain 60FPS hover performance.
   */
  function getTargetElementAtFast(clientX: number, clientY: number): Element | null {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }

    const element = getAxhubAnnotationShadowHitElementAtPoint(clientX, clientY)
      ?? document.elementFromPoint(clientX, clientY);
    if (!element) return null;

    // Skip if element is part of the editor overlay
    if (isOverlayElement(element)) return null;
    const resolved = resolveTargetForHover ? resolveTargetForHover(element) : element;
    if (!resolved || isOverlayElement(resolved)) return null;
    if (isElementInteractionLocked?.(resolved) ?? false) return null;

    return resolved;
  }

  /**
   * Get the best target element for selection (can be slower, uses intelligent picking).
   * Uses custom findTargetForSelect if provided, otherwise falls back to fast method.
   *
   * The event parameter is passed to enable Shadow DOM-aware selection via composedPath().
   */
  function getTargetElementForSelection(
    event: PointerEvent | MouseEvent,
    clientX: number,
    clientY: number,
    modifiers: EventModifiers,
  ): Element | null {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }

    // Use intelligent target finder if provided (e.g., SelectionEngine)
    if (findTargetForSelect) {
      const target = findTargetForSelect(clientX, clientY, modifiers, event);
      // Defensive check: ensure result is not an overlay element
      if (target && isOverlayElement(target)) return null;
      if (target && (isElementInteractionLocked?.(target) ?? false)) return null;
      return target;
    }

    // Fallback: simple elementFromPoint
    return getTargetElementAtFast(clientX, clientY);
  }

  // ==========================================================================
  // Hover Logic (rAF throttled)
  // ==========================================================================

  /**
   * Cancel any pending hover rAF
   */
  function cancelHoverRaf(): void {
    if (hoverRafId !== null) {
      cancelAnimationFrame(hoverRafId);
      hoverRafId = null;
    }
  }
  // Register cleanup for disposal
  disposer.add(cancelHoverRaf);

  /**
   * Commit the hover update by finding element at current pointer position
   * Allowed in both 'hover' and 'selecting' modes to show hover highlight while element is selected
   */
  function commitHoverUpdate(forceUpdate = false): void {
    hoverRafId = null;

    if (disposer.isDisposed) return;
    // Allow hover updates in both hover and selecting modes
    if (mode !== 'hover' && mode !== 'selecting') return;
    if (!hasPointerPosition) return;

    // Use fast method for hover (60FPS performance)
    const nextElement = getTargetElementAtFast(lastClientX, lastClientY);

    // Skip if same element (pointer identity check), unless forced
    if (!forceUpdate && nextElement === lastHoveredElement) return;

    reportHover(nextElement);
  }

  /**
   * Schedule a hover update on the next animation frame
   */
  function scheduleHoverUpdate(forceUpdate = false): void {
    // If already pending, don't schedule another
    if (hoverRafId !== null) return;
    if (disposer.isDisposed) return;

    // Use rAF to throttle elementFromPoint calls to once per frame
    // This prevents performance degradation from high-frequency pointer events
    hoverRafId = requestAnimationFrame(() => {
      commitHoverUpdate(forceUpdate);
    });
  }

  // ==========================================================================
  // Mode Management
  // ==========================================================================

  /**
   * Set the interaction mode.
   *
   * State cleanup invariants:
   * - Leaving `selecting`: clear dragCandidate
   * - Leaving `dragging`: clear all drag state (candidate + pointer + origin flag)
   * - Entering `hover`: trigger onDeselect and resume hover tracking
   * - Entering `interaction`: pause hover tracking but preserve the current selection
   */
  function setMode(
    nextMode: EventControllerMode,
    modeOptions: { allowPageInteraction?: boolean } = {},
  ): void {
    if (disposer.isDisposed) return;
    const nextAllowPageInteraction =
      nextMode === 'interaction' ? Boolean(modeOptions.allowPageInteraction) : false;
    if (mode === nextMode && allowPageInteraction === nextAllowPageInteraction) return;

    const prevMode = mode;
    const prevAllowPageInteraction = allowPageInteraction;
    mode = nextMode;
    allowPageInteraction = nextAllowPageInteraction;

    // Leaving selecting mode: clear drag candidate (but not full drag state)
    if (prevMode === 'selecting' && nextMode !== 'selecting') {
      dragCandidate = null;
    }

    // If entering interaction mode (disabled selection), pause hover updates
    // but keep the current selection so anchored UI can remain visible.
    if (
      nextMode === 'interaction' &&
      (prevMode !== 'interaction' || prevAllowPageInteraction !== nextAllowPageInteraction)
    ) {
      programmaticHoverElement = null;
      cancelHoverRaf();
      if (lastHoveredElement) {
        reportHover(null);
      }
    }

    // Leaving dragging mode: notify and reset all drag state
    if (prevMode === 'dragging' && nextMode !== 'dragging') {
      const shouldNotify = !suppressModeChangeDragCancel;
      suppressModeChangeDragCancel = false;
      clearDragState(); // Clears dragCandidate, draggingPointerId, draggingIsPointerOrigin
      if (shouldNotify) {
        try {
          onDragCancel?.({ reason: 'mode_change' });
        } catch {
          // Best-effort
        }
      }
    } else {
      suppressModeChangeDragCancel = false;
    }

    // Entering an interaction mode (selecting/dragging/interaction) from hover
    if (prevMode === 'hover' && nextMode !== 'hover') {
      programmaticHoverElement = null;
      cancelHoverRaf();
      if (lastHoveredElement) {
        reportHover(null);
      } else {
        lastHoveredElement = null;
      }
    }

    // Exiting interaction mode back to hover - notify and force resume hover tracking
    if (nextMode === 'hover' && prevMode !== 'hover') {
      // Reset lastHoveredElement to force onHover callback even if pointer is on same element
      lastHoveredElement = null;
      // Also ensure drag state is clean when returning to hover
      clearDragState();
      onDeselect();
      if (hasPointerPosition) {
        // Force update to re-highlight element under pointer
        scheduleHoverUpdate(true);
      }
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle pointer/mouse move for hover tracking
   */
  function handlePointerMove(event: PointerEvent | MouseEvent): void {
    // If event is from editor UI, clear hover highlight and return
    if (isEventFromEditorUi(event)) {
      if (programmaticHoverElement && (mode === 'hover' || mode === 'selecting')) {
        return;
      }
      if (mode === 'hover' && lastHoveredElement !== null) {
        reportHover(null);
      }
      return;
    }

    if (programmaticHoverElement) {
      programmaticHoverElement = null;
    }

    if (shouldEventBypassPageBlock(event)) {
      if ((mode === 'hover' || mode === 'selecting') && lastHoveredElement !== null) {
        reportHover(null);
      }
      return;
    }

    // Update tracked position
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    hasPointerPosition = true;

    // Native text-comment mode must leave page events untouched so browser text
    // selection still works, but it can still track the element under the pointer.
    if (options.allowNativeTextSelection) {
      if (mode === 'hover' || mode === 'selecting') {
        scheduleHoverUpdate();
      }
      return;
    }

    blockPageEvent(event);

    // Dragging: forward pointer moves (only from matching event type)
    if (mode === 'dragging' && shouldProcessAsPrimaryPointer(event)) {
      const pointerId = getEventPointerId(event);
      const isPointerEvent = hasPointerEvents && event instanceof PointerEvent;

      // Ensure event type matches the origin (prevent Pointer/Mouse conflict)
      if (draggingIsPointerOrigin !== isPointerEvent) return;

      if (draggingPointerId !== null && pointerId === draggingPointerId) {
        onDragMove?.({ pointerId, clientX: event.clientX, clientY: event.clientY });
      }
      return;
    }

    // Cancel deferred touch-tap candidate if the finger has moved too far (user is scrolling)
    if (touchTapCandidate && isMobileDevice()) {
      const dx = event.clientX - touchTapCandidate.clientX;
      const dy = event.clientY - touchTapCandidate.clientY;
      if (Math.hypot(dx, dy) >= TOUCH_TAP_THRESHOLD_PX) {
        touchTapCandidate = null;
      }
    }

    // Drag candidate: enter dragging when threshold is exceeded
    if (mode === 'selecting' && dragCandidate && shouldProcessAsPrimaryPointer(event)) {
      const pointerId = getEventPointerId(event);
      if (pointerId !== dragCandidate.pointerId) return;

      // Ensure event type matches the origin (prevent Pointer/Mouse conflict)
      const isPointerEvent = hasPointerEvents && event instanceof PointerEvent;
      if (dragCandidate.isPointerEventOrigin !== isPointerEvent) return;

      const dx = event.clientX - dragCandidate.startClientX;
      const dy = event.clientY - dragCandidate.startClientY;
      const mobileThreshold = isMobileDevice() ? 12 : WEB_EDITOR_V2_DRAG_THRESHOLD_PX;
      if (Math.hypot(dx, dy) < mobileThreshold) return;

      const startEvent: DragStartEvent = {
        pointerId,
        draggedElement: dragCandidate.selectedElement,
        startClientX: dragCandidate.startClientX,
        startClientY: dragCandidate.startClientY,
        clientX: event.clientX,
        clientY: event.clientY,
        modifiers: dragCandidate.modifiers,
      };

      const wasPointerOrigin = dragCandidate.isPointerEventOrigin;
      dragCandidate = null;

      const started = onStartDrag?.(startEvent) ?? false;
      if (!started) return;

      draggingPointerId = pointerId;
      draggingIsPointerOrigin = wasPointerOrigin;
      setMode('dragging');
      onDragMove?.({ pointerId, clientX: event.clientX, clientY: event.clientY });
      return;
    }

    // Process hover in both hover and selecting modes
    // This allows showing hover highlight on other elements while one is selected
    if (mode !== 'hover' && mode !== 'selecting') return;
    scheduleHoverUpdate();
  }

  /**
   * Handle pointer/mouse down for element selection
   */
  function isTouchPointerEvent(event: PointerEvent | MouseEvent): boolean {
    return isMobileDevice() && hasPointerEvents && event instanceof PointerEvent && event.pointerType === 'touch';
  }

  function handlePointerDown(event: PointerEvent | MouseEvent): void {
    if (isEventFromEditorUi(event)) return;
    if (shouldEventBypassPageBlock(event)) return;
    blockPageEvent(event);

    // Update tracked position
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    hasPointerPosition = true;

    // In native text selection mode, keep browser selection native, but remember
    // simple clicks so element-level comments can still open a bubble card.
    if (options.allowNativeTextSelection) {
      if (event.button !== 0) return;
      if (!shouldProcessAsPrimaryPointer(event)) return;

      nativeTextSelectionClickCandidate = null;
      const modifiers = extractModifiers(event);
      const target = getTargetElementForSelection(event, event.clientX, event.clientY, modifiers);
      if (!target) return;
      const initialElement = getInitialSelectionElement(event, target);

      nativeTextSelectionClickCandidate = {
        pointerId: getEventPointerId(event),
        target,
        ...(initialElement ? { initialElement } : {}),
        modifiers,
        startClientX: event.clientX,
        startClientY: event.clientY,
        isPointerEventOrigin: hasPointerEvents && event instanceof PointerEvent,
      };
      return;
    }

    // Left-click only
    if (event.button !== 0) return;

    // Extract modifiers for intelligent selection
    const modifiers = extractModifiers(event);
    const isTouch = isTouchPointerEvent(event);

    // In selecting mode: handle click for reselection or drag preparation
    if (mode === 'selecting') {
      if (!shouldProcessAsPrimaryPointer(event)) return;

      const selected = getSelectedElement?.() ?? null;

      // Always try to find the best target element first (enables child selection & drill-in/up)
      const target = getTargetElementForSelection(event, event.clientX, event.clientY, modifiers);

      // If target is different from current selection:
      // - Desktop: deselect first (go back to hover), user clicks again to select
      // - Mobile touch: defer reselection to pointerup for direct tap-to-switch
      if (target && target !== selected) {
        dragCandidate = null;
        if (isTouch) {
          // Mobile: keep direct reselection via deferred touch-tap
          const initialElement = getInitialSelectionElement(event, target);
          touchTapCandidate = {
            target,
            ...(initialElement ? { initialElement } : {}),
            modifiers,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          return;
        }
        // Desktop: deselect first — bubble card disappears, back to hover mode
        setMode('hover');
        return;
      }

      if (target && selected && target === selected && !onStartDrag) {
        if (isTouch) {
          const initialElement = getInitialSelectionElement(event, target);
          touchTapCandidate = {
            target,
            ...(initialElement ? { initialElement } : {}),
            modifiers,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          return;
        }
        const initialElement = getInitialSelectionElement(event, target);
        onSelect({
          element: target,
          ...(initialElement ? { initialElement } : {}),
          modifiers,
          clientX: event.clientX,
          clientY: event.clientY,
        });
        return;
      }

      // Target is the same as current selection (or no valid target):
      // prepare drag candidate if clicking within selection subtree
      if (
        onStartDrag &&
        selected &&
        selected.isConnected &&
        !(isElementInteractionLocked?.(selected) ?? false) &&
        isEventWithinElement(event, selected)
      ) {
        const isPointerOrigin = hasPointerEvents && event instanceof PointerEvent;

        dragCandidate = {
          pointerId: getEventPointerId(event),
          startClientX: event.clientX,
          startClientY: event.clientY,
          modifiers,
          selectedElement: selected,
          isPointerEventOrigin: isPointerOrigin,
        };
        return;
      }

      // Desktop: clicking blank space (no valid target, not within selected element) → deselect
      if (!isTouch && !target) {
        setMode('hover');
      }
      return;
    }

    // Ignore additional pointerdowns while dragging
    if (mode === 'dragging') {
      return;
    }

    // Only process in hover mode
    if (mode !== 'hover') return;

    // Use intelligent selection for click (can afford more computation)
    // Pass event to enable Shadow DOM-aware selection via composedPath()
    const target = getTargetElementForSelection(event, event.clientX, event.clientY, modifiers);
    if (!target) return;

    // On mobile touch, defer selection to pointerup to avoid selecting during scroll
    if (isTouch) {
      const initialElement = getInitialSelectionElement(event, target);
      touchTapCandidate = {
        target,
        ...(initialElement ? { initialElement } : {}),
        modifiers,
        clientX: event.clientX,
        clientY: event.clientY,
        nextMode: 'selecting',
      };
      return;
    }

    // Transition to selecting mode
    setMode('selecting');
    const initialElement = getInitialSelectionElement(event, target);
    onSelect({
      element: target,
      ...(initialElement ? { initialElement } : {}),
      modifiers,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  /**
   * Handle double click on the currently selected element.
   * This is opt-in so existing consumers keep the current behavior by default.
   */
  function handleDoubleClick(event: MouseEvent): void {
    if (isEventFromEditorUi(event)) return;
    if (shouldEventBypassPageBlock(event)) return;
    blockPageEvent(event);

    if (options.allowNativeTextSelection) return;
    if (mode !== 'selecting') return;
    if (event.button !== 0) return;
    if (!onDoubleClickSelected) return;

    const selected = getSelectedElement?.() ?? null;
    if (!selected || !selected.isConnected) return;
    if (isElementInteractionLocked?.(selected) ?? false) return;

    const modifiers = extractModifiers(event);
    const target = getTargetElementForSelection(event, event.clientX, event.clientY, modifiers);
    if (target !== selected) return;

    onDoubleClickSelected({
      element: selected,
      pathElements: getPageElementPath(event, selected),
      modifiers,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  /**
   * Handle keydown for ESC cancellation
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (isEventFromEditorUi(event)) return;
    if (shouldEventBypassPageBlock(event)) return;
    blockPageEvent(event);

    if (event.key === 'Escape') {
      // ESC cancels dragging first (but keeps selection)
      if (mode === 'dragging') {
        cancelDragging('escape');
        return;
      }

      // In text-comment mode: ESC dismisses the active comment
      if (options.allowNativeTextSelection) {
        window.getSelection()?.removeAllRanges();
        onDeselect();
        return;
      }

      // ESC key cancels selection
      if (mode === 'selecting') {
        dragCandidate = null;
        setMode('hover');
      }
    }
  }

  /**
   * Handle pointerup/mouseup for ending drag
   */
  function handlePointerUp(event: PointerEvent | MouseEvent): void {
    if (isEventFromEditorUi(event)) return;
    if (shouldEventBypassPageBlock(event)) return;
    blockPageEvent(event);

    if (!shouldProcessAsPrimaryPointer(event)) {
      return;
    }

    if (options.allowNativeTextSelection) {
      queueNativeTextSelectionClickCommit(event);
      return;
    }

    const pointerId = getEventPointerId(event);
    const isPointerEvent = hasPointerEvents && event instanceof PointerEvent;

    // ── Commit deferred touch-tap selection ──
    if (touchTapCandidate && isTouchPointerEvent(event)) {
      const tap = touchTapCandidate;
      touchTapCandidate = null;
      const dx = event.clientX - tap.clientX;
      const dy = event.clientY - tap.clientY;
      if (Math.hypot(dx, dy) < TOUCH_TAP_THRESHOLD_PX) {
        if (tap.nextMode) {
          setMode(tap.nextMode);
        }
        onSelect({
          element: tap.target,
          ...(tap.initialElement ? { initialElement: tap.initialElement } : {}),
          modifiers: tap.modifiers,
          clientX: tap.clientX,
          clientY: tap.clientY,
        });
      }
      return;
    }

    // Clear candidate on pointerup (only if event type matches)
    if (
      mode === 'selecting' &&
      dragCandidate &&
      dragCandidate.pointerId === pointerId &&
      dragCandidate.isPointerEventOrigin === isPointerEvent
    ) {
      dragCandidate = null;
    }

    // End dragging on pointerup (only if event type matches)
    if (mode === 'dragging' && draggingIsPointerOrigin === isPointerEvent) {
      endDragging(pointerId, event.clientX, event.clientY);
    }
  }

  /**
   * Handle pointercancel for cancelling drag.
   * Note: pointercancel is a PointerEvent-only event, so we only process
   * drag state that was initiated by PointerEvents.
   */
  function handlePointerCancel(event: PointerEvent): void {
    if (isEventFromEditorUi(event)) return;
    if (shouldEventBypassPageBlock(event)) return;
    blockPageEvent(event);

    const pointerId = event.pointerId;

    // Clear candidate on cancel (only if it was created by PointerEvent)
    if (
      dragCandidate &&
      dragCandidate.pointerId === pointerId &&
      dragCandidate.isPointerEventOrigin
    ) {
      dragCandidate = null;
    }
    if (
      nativeTextSelectionClickCandidate &&
      nativeTextSelectionClickCandidate.pointerId === pointerId &&
      nativeTextSelectionClickCandidate.isPointerEventOrigin
    ) {
      nativeTextSelectionClickCandidate = null;
    }

    if (mode !== 'dragging') return;
    // Only cancel if the dragging was initiated by PointerEvent
    if (!draggingIsPointerOrigin) return;
    if (draggingPointerId === null || draggingPointerId !== pointerId) return;

    cancelDragging('pointercancel');
  }

  /**
   * Generic blocker for events that should never reach the page
   */
  function handleBlockedEvent(event: Event): void {
    if (mode === 'interaction' && allowPageInteraction) return;
    if (isEventFromEditorUi(event)) return;
    if (shouldEventBypassPageBlock(event)) return;
    // Route pointerup/mouseup to end drag candidate / dragging session
    if (event.type === 'pointerup' || event.type === 'mouseup') {
      handlePointerUp(event as PointerEvent | MouseEvent);
      return;
    }

    // Route pointercancel to cancel dragging session
    if (event.type === 'pointercancel') {
      handlePointerCancel(event as PointerEvent);
      return;
    }

    // In native text selection mode, let all remaining events pass through.
    if (options.allowNativeTextSelection) return;

    if (event.type === 'dblclick') {
      handleDoubleClick(event as MouseEvent);
      return;
    }

    blockPageEvent(event);
  }

  // ==========================================================================
  // Event Registration
  // ==========================================================================

  // Register pointer events (modern browsers)
  if (hasPointerEvents) {
    disposer.listen(document, 'pointermove', handlePointerMove, CAPTURE_OPTIONS);
    disposer.listen(document, 'pointerdown', handlePointerDown, CAPTURE_OPTIONS);

    for (const eventType of BLOCKED_POINTER_EVENTS) {
      disposer.listen(document, eventType, handleBlockedEvent, CAPTURE_OPTIONS);
    }
  }

  // Register mouse events (fallback for older browsers, or when pointer events are unavailable)
  // Note: On modern browsers with PointerEvents, mouse events still fire after pointer events,
  // so we always register them to ensure complete blocking
  disposer.listen(document, 'mousemove', handlePointerMove, CAPTURE_OPTIONS);
  disposer.listen(document, 'mousedown', handlePointerDown, CAPTURE_OPTIONS);

  for (const eventType of BLOCKED_MOUSE_EVENTS) {
    disposer.listen(document, eventType, handleBlockedEvent, CAPTURE_OPTIONS);
  }

  // Register keyboard events
  disposer.listen(document, 'keydown', handleKeyDown, CAPTURE_OPTIONS);

  for (const eventType of BLOCKED_KEYBOARD_EVENTS) {
    disposer.listen(document, eventType, handleBlockedEvent, CAPTURE_OPTIONS);
  }

  // Register touch events – block on desktop to prevent touch fallback interference;
  // on mobile, let touch events through so scrolling works (PointerEvents handle selection)
  if (!isMobileDevice()) {
    for (const eventType of BLOCKED_TOUCH_EVENTS) {
      disposer.listen(document, eventType, handleBlockedEvent, CAPTURE_OPTIONS);
    }
  }

  // ==========================================================================
  // Window/Page Focus Events (cancel dragging on blur/visibility change)
  // ==========================================================================

  /**
   * Cancel dragging when window loses focus.
   * This prevents the UI from getting stuck with pointer-events: none
   * if the user switches to another application mid-drag.
   */
  function handleWindowBlur(): void {
    // Clear drag candidate in selecting mode
    if (mode === 'selecting' && dragCandidate) {
      dragCandidate = null;
    }
    // Cancel active dragging
    if (mode === 'dragging') {
      cancelDragging('blur');
    }
  }

  /**
   * Cancel dragging when page becomes hidden.
   * This handles cases like switching browser tabs.
   */
  function handleVisibilityChange(): void {
    if (document.visibilityState !== 'visible') {
      // Clear drag candidate in selecting mode
      if (mode === 'selecting' && dragCandidate) {
        dragCandidate = null;
      }
      // Cancel active dragging
      if (mode === 'dragging') {
        cancelDragging('visibilitychange');
      }
    }
  }

  disposer.listen(window, 'blur', handleWindowBlur);
  disposer.listen(document, 'visibilitychange', handleVisibilityChange);

  // ==========================================================================
  // Public API
  // ==========================================================================

  // Cleanup drag state on dispose
  disposer.add(() => {
    if (mode === 'dragging') {
      try {
        onDragCancel?.({ reason: 'dispose' });
      } catch {
        // Best-effort
      }
    }
    clearDragState();
  });

  return {
    getMode: () => mode,
    setMode,
    setProgrammaticHoverElement: (element) => {
      programmaticHoverElement = element && element.isConnected ? element : null;
      cancelHoverRaf();
      if (mode !== 'hover' && mode !== 'selecting') return;
      lastHoveredElement = programmaticHoverElement;
    },
    dispose: () => disposer.dispose(),
  };
}
