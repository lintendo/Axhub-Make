/**
 * Floating Drag Utility
 *
 * A helper for making Shadow DOM floating UI draggable via a dedicated handle.
 *
 * Features:
 * - Pointer capture for robust tracking across the viewport
 * - Viewport clamping with a configurable margin
 * - Movement-threshold activation for click-vs-drag interactions
 * - RAF-smoothed movement and eased settle on release
 * - Escape key cancels the active drag and restores the start position
 */

export interface FloatingPosition {
  left: number;
  top: number;
}

export interface FloatingDragMetrics {
  velocityX: number;
  velocityY: number;
}

export const FLOATING_DRAG_POINTER_RELAY_EVENT = 'axhub-floating-drag-pointer-relay';

type FloatingDragPointerRelayDetail = {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export interface FloatingDragOptions {
  /** Element that triggers the drag (handle) */
  handleEl: HTMLElement;
  /** Element to be moved */
  targetEl: HTMLElement;
  /** Called when position changes during or after drag */
  onPositionChange: (position: FloatingPosition) => void;
  /** Margin from viewport edges in pixels */
  clampMargin: number;
  /**
   * Movement threshold (px) that activates drag.
   * Pointer sequences that end below this threshold preserve native click/tap behavior.
   * @default 3
   */
  moveThresholdPx?: number;
  /** Optional callback for drag activation state. */
  onDragStateChange?: (active: boolean) => void;
  /** Optional callback for drag velocity updates. */
  onDragMetricsChange?: (metrics: FloatingDragMetrics) => void;
  /** Optional release settle duration in milliseconds. */
  settleDurationMs?: number;
  /**
   * When enabled, pointer sequences that start from interactive descendants
   * of the handle preserve native control behavior instead of entering drag.
   */
  ignoreInteractiveChildren?: boolean;
}

type DragPhase = 'pending' | 'dragging' | 'settling';

interface DragSession {
  pointerId: number;
  startPosition: FloatingPosition;
  currentPosition: FloatingPosition;
  targetPosition: FloatingPosition;
  offsetX: number;
  offsetY: number;
  targetWidth: number;
  targetHeight: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  lastMoveTime: number;
  velocityX: number;
  velocityY: number;
  activated: boolean;
  phase: DragPhase;
  rafId: number | null;
  settleStartedAt: number | null;
  settleFrom: FloatingPosition | null;
  settleTo: FloatingPosition | null;
}

interface CursorSnapshot {
  documentCursor: string;
  bodyCursor: string;
}

const WINDOW_CAPTURE: AddEventListenerOptions = { capture: true, passive: false };
const SETTLE_DISTANCE_FACTOR = 0.12;
const DEFAULT_SETTLE_DURATION_MS = 220;
const HANDLE_POINTER_DOWN_CAPTURE: AddEventListenerOptions = { capture: true };
const INTERACTIVE_DESCENDANT_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'a[href]',
  '[role="button"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[data-we-no-drag="true"]',
  '.ant-btn',
  '.ant-switch',
  '.ant-select',
  '.ant-input',
  '.ant-input-affix-wrapper',
].join(', ');

function blockEvent(event: Event): void {
  if (event.cancelable) {
    event.preventDefault();
  }
  event.stopImmediatePropagation();
  event.stopPropagation();
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, value));
}

function clampPosition(
  position: FloatingPosition,
  size: { width: number; height: number },
  clampMargin: number,
  viewport: { width: number; height: number },
): FloatingPosition {
  const margin = Number.isFinite(clampMargin) ? Math.max(0, clampMargin) : 0;
  const maxLeft = Math.max(margin, viewport.width - margin - size.width);
  const maxTop = Math.max(margin, viewport.height - margin - size.height);

  return {
    left: clampNumber(position.left, margin, maxLeft),
    top: clampNumber(position.top, margin, maxTop),
  };
}

function roundPosition(position: FloatingPosition): FloatingPosition {
  return {
    left: Math.round(position.left),
    top: Math.round(position.top),
  };
}

function easeOutCubic(progress: number): number {
  const clamped = clampNumber(progress, 0, 1);
  return 1 - (1 - clamped) ** 3;
}

function positionsEqual(a: FloatingPosition, b: FloatingPosition): boolean {
  return Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top);
}

function shouldIgnoreInteractiveTarget(
  eventTarget: EventTarget | null,
  handleEl: HTMLElement,
  enabled: boolean,
): boolean {
  if (!enabled || !(eventTarget instanceof Element) || eventTarget === handleEl) {
    return false;
  }
  const interactiveAncestor = eventTarget.closest(INTERACTIVE_DESCENDANT_SELECTOR);
  if (!interactiveAncestor) return false;
  if (typeof handleEl.contains === 'function') {
    return handleEl.contains(interactiveAncestor);
  }
  return true;
}

function parsePointerRelayDetail(value: unknown): FloatingDragPointerRelayDetail | null {
  if (!value || typeof value !== 'object') return null;
  const detail = value as Partial<FloatingDragPointerRelayDetail>;
  if (
    !['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].includes(detail.type ?? '')
    || !Number.isInteger(detail.pointerId)
    || !Number.isFinite(detail.clientX)
    || !Number.isFinite(detail.clientY)
  ) {
    return null;
  }
  return {
    type: detail.type as FloatingDragPointerRelayDetail['type'],
    pointerId: detail.pointerId as number,
    pointerType: typeof detail.pointerType === 'string' ? detail.pointerType : 'mouse',
    isPrimary: detail.isPrimary !== false,
    button: Number.isFinite(detail.button) ? Number(detail.button) : 0,
    buttons: Number.isFinite(detail.buttons) ? Number(detail.buttons) : 0,
    clientX: Number(detail.clientX),
    clientY: Number(detail.clientY),
    altKey: detail.altKey === true,
    ctrlKey: detail.ctrlKey === true,
    metaKey: detail.metaKey === true,
    shiftKey: detail.shiftKey === true,
  };
}

export function installFloatingDrag(options: FloatingDragOptions): () => void {
  const { handleEl, targetEl, onPositionChange, clampMargin } = options;
  const moveThresholdPx = Math.max(0, options.moveThresholdPx ?? 3);
  const moveThresholdSq = moveThresholdPx * moveThresholdPx;
  const settleDurationMs = Math.max(80, options.settleDurationMs ?? DEFAULT_SETTLE_DURATION_MS);

  let session: DragSession | null = null;
  let disposed = false;
  let cursorSnapshot: CursorSnapshot | null = null;
  let emittedPosition: FloatingPosition | null = null;
  let dragState = false;

  function emitDragState(active: boolean): void {
    if (dragState === active) return;
    dragState = active;
    options.onDragStateChange?.(active);
  }

  function emitDragMetrics(metrics: FloatingDragMetrics): void {
    options.onDragMetricsChange?.(metrics);
  }

  function setGlobalDraggingCursor(enabled: boolean): void {
    const rootEl = document.documentElement;
    const bodyEl = document.body;

    if (enabled) {
      if (!cursorSnapshot) {
        cursorSnapshot = {
          documentCursor: rootEl.style.cursor,
          bodyCursor: bodyEl.style.cursor,
        };
      }
      rootEl.style.cursor = 'grabbing';
      bodyEl.style.cursor = 'grabbing';
      return;
    }

    if (!cursorSnapshot) return;
    rootEl.style.cursor = cursorSnapshot.documentCursor;
    bodyEl.style.cursor = cursorSnapshot.bodyCursor;
    cursorSnapshot = null;
  }

  function removeWindowListeners(): void {
    window.removeEventListener('pointermove', onWindowPointerMove, WINDOW_CAPTURE);
    window.removeEventListener('pointerup', onWindowPointerUp, WINDOW_CAPTURE);
    window.removeEventListener('pointercancel', onWindowPointerCancel, WINDOW_CAPTURE);
    window.removeEventListener('keydown', onWindowKeyDown, WINDOW_CAPTURE);
    window.removeEventListener('blur', onWindowBlur, WINDOW_CAPTURE);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function cancelAnimationLoop(): void {
    if (!session || session.rafId === null) return;
    window.cancelAnimationFrame(session.rafId);
    session.rafId = null;
  }

  function cleanupCapture(pointerId: number): void {
    try {
      handleEl.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may be unavailable or already released.
    }
  }

  function getViewportSize(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function getTargetSize(currentSession: DragSession): { width: number; height: number } {
    return {
      width: currentSession.targetWidth,
      height: currentSession.targetHeight,
    };
  }

  function clampSessionPosition(
    currentSession: DragSession,
    position: FloatingPosition,
  ): FloatingPosition {
    return clampPosition(position, getTargetSize(currentSession), clampMargin, getViewportSize());
  }

  function emitPosition(position: FloatingPosition): void {
    const rounded = roundPosition(position);
    if (emittedPosition && positionsEqual(emittedPosition, rounded)) return;
    emittedPosition = rounded;
    onPositionChange(rounded);
  }

  function finishSession(resetMetrics = true): void {
    if (!session) return;
    cancelAnimationLoop();
    cleanupCapture(session.pointerId);
    handleEl.dataset.dragging = 'false';
    setGlobalDraggingCursor(false);
    emitDragState(false);
    if (resetMetrics) {
      emitDragMetrics({ velocityX: 0, velocityY: 0 });
    }
    session = null;
  }

  function ensureAnimationLoop(): void {
    if (!session || session.rafId !== null) return;
    session.rafId = window.requestAnimationFrame(onAnimationFrame);
  }

  function applyCurrentPointerPosition(clientX: number, clientY: number): void {
    const currentSession = session;
    if (!currentSession) return;

    currentSession.targetPosition = clampSessionPosition(currentSession, {
      left: clientX - currentSession.offsetX,
      top: clientY - currentSession.offsetY,
    });
    ensureAnimationLoop();
  }

  function startSettling(currentSession: DragSession): void {
    currentSession.phase = 'settling';
    currentSession.settleStartedAt = performance.now();
    currentSession.settleFrom = { ...currentSession.currentPosition };
    currentSession.settleTo = clampSessionPosition(currentSession, {
      left: currentSession.currentPosition.left + currentSession.velocityX * SETTLE_DISTANCE_FACTOR,
      top: currentSession.currentPosition.top + currentSession.velocityY * SETTLE_DISTANCE_FACTOR,
    });
    if (positionsEqual(currentSession.settleFrom, currentSession.settleTo)) {
      emitPosition(currentSession.settleTo);
      finishSession();
      return;
    }
    ensureAnimationLoop();
  }

  function cancelDrag(): void {
    const currentSession = session;
    if (!currentSession) return;
    cancelAnimationLoop();
    emitPosition(currentSession.startPosition);
    finishSession();
  }

  function suppressClickOnce(): void {
    const onClick = (event: MouseEvent) => {
      blockEvent(event);
    };
    handleEl.addEventListener('click', onClick, { capture: true, once: true });
    window.setTimeout(() => {
      handleEl.removeEventListener('click', onClick, { capture: true });
    }, 300);
  }

  function activateDrag(pointerId: number): void {
    const currentSession = session;
    if (!currentSession || currentSession.pointerId !== pointerId || currentSession.activated) return;

    currentSession.activated = true;
    currentSession.phase = 'dragging';
    handleEl.dataset.dragging = 'true';
    emitDragState(true);
    setGlobalDraggingCursor(true);

    ensureAnimationLoop();
  }

  function onAnimationFrame(timestamp: number): void {
    const currentSession = session;
    if (!currentSession) return;
    currentSession.rafId = null;

    if (currentSession.phase === 'dragging') {
      currentSession.currentPosition = { ...currentSession.targetPosition };
      emitPosition(currentSession.currentPosition);
      return;
    }

    if (
      currentSession.phase === 'settling'
      && currentSession.settleStartedAt !== null
      && currentSession.settleFrom
      && currentSession.settleTo
    ) {
      const progress = (timestamp - currentSession.settleStartedAt) / settleDurationMs;
      const eased = easeOutCubic(progress);
      currentSession.currentPosition = {
        left:
          currentSession.settleFrom.left
          + (currentSession.settleTo.left - currentSession.settleFrom.left) * eased,
        top:
          currentSession.settleFrom.top
          + (currentSession.settleTo.top - currentSession.settleFrom.top) * eased,
      };
      emitPosition(currentSession.currentPosition);

      if (progress < 1) {
        ensureAnimationLoop();
      } else {
        emitPosition(currentSession.settleTo);
        finishSession();
      }
    }
  }

  function onWindowPointerMove(event: PointerEvent): void {
    const currentSession = session;
    if (
      !currentSession
      || currentSession.phase === 'settling'
      || event.pointerId !== currentSession.pointerId
    ) {
      return;
    }

    if (!currentSession.activated) {
      const dx = event.clientX - currentSession.startClientX;
      const dy = event.clientY - currentSession.startClientY;
      if (dx * dx + dy * dy < moveThresholdSq) return;
      activateDrag(event.pointerId);
    }

    if (!currentSession.activated) return;

    blockEvent(event);

    const now = performance.now();
    const elapsed = Math.max(8, now - currentSession.lastMoveTime);
    const instantVelocityX = ((event.clientX - currentSession.lastClientX) / elapsed) * 1000;
    const instantVelocityY = ((event.clientY - currentSession.lastClientY) / elapsed) * 1000;

    currentSession.velocityX = currentSession.velocityX * 0.65 + instantVelocityX * 0.35;
    currentSession.velocityY = currentSession.velocityY * 0.65 + instantVelocityY * 0.35;
    currentSession.lastClientX = event.clientX;
    currentSession.lastClientY = event.clientY;
    currentSession.lastMoveTime = now;

    emitDragMetrics({
      velocityX: currentSession.velocityX,
      velocityY: currentSession.velocityY,
    });

    applyCurrentPointerPosition(event.clientX, event.clientY);
  }

  function onWindowPointerUp(event: PointerEvent): void {
    const currentSession = session;
    if (
      !currentSession
      || currentSession.phase === 'settling'
      || event.pointerId !== currentSession.pointerId
    ) {
      return;
    }

    if (!currentSession.activated) {
      finishSession();
      return;
    }

    blockEvent(event);
    suppressClickOnce();
    cleanupCapture(event.pointerId);
    handleEl.dataset.dragging = 'false';
    setGlobalDraggingCursor(false);
    emitDragState(false);
    startSettling(currentSession);
  }

  function onWindowPointerCancel(event: PointerEvent): void {
    const currentSession = session;
    if (
      !currentSession
      || currentSession.phase === 'settling'
      || event.pointerId !== currentSession.pointerId
    ) {
      return;
    }

    if (currentSession.activated) {
      blockEvent(event);
      cancelDrag();
    } else {
      finishSession();
    }
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !session || session.phase === 'settling') return;

    if (session.activated) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      cancelDrag();
    } else {
      finishSession();
    }
  }

  function onWindowBlur(): void {
    if (!session || session.phase === 'settling') return;
    if (session.activated) {
      cancelDrag();
    } else {
      finishSession();
    }
  }

  function onVisibilityChange(): void {
    if (!session || session.phase === 'settling' || document.visibilityState !== 'hidden') return;
    if (session.activated) {
      cancelDrag();
    } else {
      finishSession();
    }
  }

  function onHandlePointerDown(event: PointerEvent): boolean {
    if (disposed || !targetEl.isConnected || session) return false;
    if (event.button !== 0 || !event.isPrimary) return false;
    if (shouldIgnoreInteractiveTarget(event.target, handleEl, Boolean(options.ignoreInteractiveChildren))) {
      return false;
    }

    const rect = targetEl.getBoundingClientRect();
    const startPosition = roundPosition({ left: rect.left, top: rect.top });
    const now = performance.now();

    session = {
      pointerId: event.pointerId,
      startPosition,
      currentPosition: startPosition,
      targetPosition: startPosition,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      targetWidth: rect.width,
      targetHeight: rect.height,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastMoveTime: now,
      velocityX: 0,
      velocityY: 0,
      activated: false,
      phase: moveThresholdSq > 0 ? 'pending' : 'dragging',
      rafId: null,
      settleStartedAt: null,
      settleFrom: null,
      settleTo: null,
    };

    emitDragMetrics({ velocityX: 0, velocityY: 0 });
    handleEl.dataset.dragging = 'false';

    // Capture immediately instead of waiting for the movement threshold.
    // Canvas hosts such as Figma can otherwise claim the first pointermove,
    // preventing this pending drag from ever becoming active. A captured
    // click still follows the normal below-threshold path and is not blocked.
    try {
      handleEl.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may fail on some elements/browsers.
    }

    if (moveThresholdSq === 0) {
      activateDrag(event.pointerId);
    }
    return true;
  }

  function onRelayedPointerEvent(event: Event): void {
    if (!(event instanceof CustomEvent)) return;
    const detail = parsePointerRelayDetail(event.detail);
    if (!detail) return;

    const pointerEvent = {
      ...detail,
      target: handleEl,
      cancelable: event.cancelable,
      preventDefault: () => event.preventDefault(),
      stopImmediatePropagation: () => event.stopImmediatePropagation(),
      stopPropagation: () => event.stopPropagation(),
    } as unknown as PointerEvent;

    if (detail.type === 'pointerdown') {
      if (!onHandlePointerDown(pointerEvent)) return;
      event.preventDefault();
      return;
    }

    const currentSession = session;
    if (
      !currentSession
      || currentSession.phase === 'settling'
      || currentSession.pointerId !== detail.pointerId
    ) {
      return;
    }

    event.preventDefault();
    if (detail.type === 'pointermove') onWindowPointerMove(pointerEvent);
    else if (detail.type === 'pointerup') onWindowPointerUp(pointerEvent);
    else onWindowPointerCancel(pointerEvent);
  }

  handleEl.dataset.dragging = 'false';
  handleEl.addEventListener('pointerdown', onHandlePointerDown, HANDLE_POINTER_DOWN_CAPTURE);
  handleEl.addEventListener(FLOATING_DRAG_POINTER_RELAY_EVENT, onRelayedPointerEvent);
  // Keep these listeners installed for the lifetime of the draggable instance.
  // Canvas hosts such as Figma register per-gesture capture listeners during
  // pointerdown. Registering ours only after pointerdown lets those listeners
  // run first and stop the move before this drag session can activate.
  window.addEventListener('pointermove', onWindowPointerMove, WINDOW_CAPTURE);
  window.addEventListener('pointerup', onWindowPointerUp, WINDOW_CAPTURE);
  window.addEventListener('pointercancel', onWindowPointerCancel, WINDOW_CAPTURE);
  window.addEventListener('keydown', onWindowKeyDown, WINDOW_CAPTURE);
  window.addEventListener('blur', onWindowBlur, WINDOW_CAPTURE);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    disposed = true;
    handleEl.removeEventListener('pointerdown', onHandlePointerDown, HANDLE_POINTER_DOWN_CAPTURE);
    handleEl.removeEventListener(FLOATING_DRAG_POINTER_RELAY_EVENT, onRelayedPointerEvent);
    finishSession();
    removeWindowListeners();
  };
}
