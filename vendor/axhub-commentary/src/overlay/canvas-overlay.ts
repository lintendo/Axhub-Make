/**
 * Canvas Overlay
 *
 * High-performance overlay renderer for visual feedback (hover, selection, guides).
 *
 * Features:
 * - DPR-aware rendering for crisp visuals on HiDPI displays
 * - rAF-coalesced rendering via markDirty() pattern
 * - ResizeObserver-backed automatic sizing
 * - Separate layers for hover, selection, and future guides
 *
 * Performance considerations:
 * - Uses `desynchronized: true` for lower latency
 * - Batches all drawing to single rAF
 * - Only redraws when dirty flag is set
 * - Pixel-aligned strokes for crisp lines
 */

import {
  WEB_EDITOR_V2_COLORS,
  WEB_EDITOR_V2_DISTANCE_LABEL_FONT,
  WEB_EDITOR_V2_DISTANCE_LABEL_OFFSET,
  WEB_EDITOR_V2_DISTANCE_LABEL_PADDING_X,
  WEB_EDITOR_V2_DISTANCE_LABEL_PADDING_Y,
  WEB_EDITOR_V2_DISTANCE_LABEL_RADIUS,
  WEB_EDITOR_V2_DISTANCE_LINE_WIDTH,
  WEB_EDITOR_V2_DISTANCE_TICK_SIZE,
  WEB_EDITOR_V2_GUIDE_LINE_WIDTH,
  WEB_EDITOR_V2_INSERTION_LINE_WIDTH,
  WEB_EDITOR_V2_LOG_PREFIX,
  WEB_EDITOR_V2_SELECTION_LINE_WIDTH,
} from '../constants';
import { Disposer } from '../utils/disposables';

// =============================================================================
// Types
// =============================================================================

/** Rectangle in viewport coordinates */
export type ViewportRect = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;

/** Line segment in viewport coordinates */
export interface ViewportLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Distance label kind (Phase 4.3) */
export type DistanceLabelKind = 'sibling' | 'viewport';

/** Axis of the measured distance (Phase 4.3) */
export type DistanceLabelAxis = 'x' | 'y';

/** Distance label rendered on overlay (Phase 4.3) */
export interface DistanceLabel {
  /** Source of this measurement */
  readonly kind: DistanceLabelKind;
  /** 'x' => horizontal distance, 'y' => vertical distance */
  readonly axis: DistanceLabelAxis;
  /** Rounded px value */
  readonly value: number;
  /** Display text (e.g. "12px") */
  readonly text: string;
  /** Measurement line segment */
  readonly line: ViewportLine;
}

/** Box style configuration */
export interface BoxStyle {
  /** Stroke color */
  strokeColor: string;
  /** Fill color (with alpha for transparency) */
  fillColor: string;
  /** Line width in CSS pixels */
  lineWidth: number;
  /** Dash pattern (empty array for solid line) */
  dashPattern: number[];
}

/** Canvas overlay interface */
export interface CanvasOverlay {
  /** The underlying canvas element */
  canvas: HTMLCanvasElement;
  /** Mark state as dirty and schedule a render on next animation frame */
  markDirty(): void;
  /** Render immediately if dirty (called by RAF engine) */
  render(): void;
  /** Clear all visual elements */
  clear(): void;
  /** Update hover highlight (with optional transition animation) */
  setHoverRect(rect: ViewportRect | null, options?: { animate?: boolean }): void;
  /** Update selection highlight */
  setSelectionRect(rect: ViewportRect | null): void;
  /** Update selection effect mode */
  setSelectionEffect(effect: 'default' | 'ai-editing' | 'inline-editing'): void;
  /** Update additional editing highlight rects */
  setEditingRects(rects: readonly ViewportRect[] | null): void;
  /** Update text comment highlight rects (multiple per-line rects) */
  setTextHighlightRects(rects: readonly ViewportRect[] | null): void;
  /** Update drag ghost highlight (Phase 2.4) */
  setDragGhostRect(rect: ViewportRect | null): void;
  /** Update insertion indicator line (Phase 2.4) */
  setInsertionLine(line: ViewportLine | null): void;
  /** Update alignment guide lines (Phase 4.2) */
  setGuideLines(lines: readonly ViewportLine[] | null): void;
  /** Update distance labels (Phase 4.3) */
  setDistanceLabels(labels: readonly DistanceLabel[] | null): void;
  /** Dispose and cleanup */
  dispose(): void;
}

/** Options for creating canvas overlay */
export interface CanvasOverlayOptions {
  /** Container element (should be overlayRoot from ShadowHost) */
  container: HTMLElement;
}

// =============================================================================
// Constants
// =============================================================================

const CANVAS_ATTR = 'data-mcp-canvas';
const CANVAS_ATTR_VALUE = 'overlay';

/** Duration of hover rect transition animation in milliseconds */
const HOVER_ANIMATION_DURATION_MS = 100;
const AI_SELECTION_SCAN_DURATION_MS = 2_600;

/** Default styles for different box types */
export const OVERLAY_BOX_STYLES = {
  hover: {
    strokeColor: WEB_EDITOR_V2_COLORS.hover,
    fillColor: 'transparent',
    lineWidth: 1,
    dashPattern: [6, 4],
  },
  selection: {
    strokeColor: WEB_EDITOR_V2_COLORS.selected,
    fillColor: 'transparent',
    lineWidth: WEB_EDITOR_V2_SELECTION_LINE_WIDTH,
    dashPattern: [],
  },
  inlineEditing: {
    strokeColor: '#0B8A60',
    fillColor: 'rgba(0, 143, 93, 0.08)',
    lineWidth: 2.5,
    dashPattern: [5, 3],
  },
  dragGhost: {
    strokeColor: WEB_EDITOR_V2_COLORS.selectionBorder,
    fillColor: WEB_EDITOR_V2_COLORS.dragGhost,
    lineWidth: 2,
    dashPattern: [8, 6],
  },
} satisfies Record<string, BoxStyle>;

// =============================================================================
// Helpers
// =============================================================================

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidRect(rect: ViewportRect | null): rect is ViewportRect {
  if (!rect) return false;
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    isFinitePositive(rect.width) &&
    isFinitePositive(rect.height)
  );
}

function isValidLine(line: ViewportLine | null): line is ViewportLine {
  if (!line) return false;
  return (
    Number.isFinite(line.x1) &&
    Number.isFinite(line.y1) &&
    Number.isFinite(line.x2) &&
    Number.isFinite(line.y2)
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// =============================================================================
// Animation Helpers
// =============================================================================

/** Cubic ease-out curve: fast start, slow end (matches CSS ease-out approximately) */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Linear interpolation between two values */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate between two rectangles */
function lerpRect(from: ViewportRect, to: ViewportRect, t: number): ViewportRect {
  return {
    left: lerp(from.left, to.left, t),
    top: lerp(from.top, to.top, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  };
}

/**
 * Build a rounded rectangle path (without beginning a new path)
 */
function buildRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a canvas overlay for rendering visual feedback.
 */
export function createCanvasOverlay(options: CanvasOverlayOptions): CanvasOverlay {
  const { container } = options;
  const disposer = new Disposer();

  // Cleanup any existing canvas from previous instance
  const existing = container.querySelector<HTMLCanvasElement>(
    `canvas[${CANVAS_ATTR}="${CANVAS_ATTR_VALUE}"]`,
  );
  if (existing) {
    existing.remove();
  }

  // Create canvas element
  const canvas = document.createElement('canvas');
  canvas.setAttribute(CANVAS_ATTR, CANVAS_ATTR_VALUE);
  canvas.setAttribute('aria-hidden', 'true');

  // Style for fullscreen coverage
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    display: 'block',
  });

  container.append(canvas);
  disposer.add(() => canvas.remove());

  // Get 2D context with performance options
  const ctxOrNull = canvas.getContext('2d', {
    alpha: true,
    desynchronized: true, // Lower latency on supported browsers
  });

  if (!ctxOrNull) {
    disposer.dispose();
    throw new Error(`${WEB_EDITOR_V2_LOG_PREFIX} Failed to get canvas 2D context`);
  }

  // Capture as non-null after guard (TypeScript needs explicit assignment)
  const ctx: CanvasRenderingContext2D = ctxOrNull;

  // ==========================================================================
  // State
  // ==========================================================================

  let hoverRect: ViewportRect | null = null;

  // Hover animation state: tracks in-progress transition between two rect positions
  interface HoverAnimation {
    /** Starting rectangle (from position) */
    start: ViewportRect;
    /** Ending rectangle (to position) */
    end: ViewportRect;
    /** Animation start timestamp (performance.now()) */
    startTime: number;
    /** Animation duration in milliseconds */
    durationMs: number;
  }
  let hoverAnimation: HoverAnimation | null = null;

  let selectionRect: ViewportRect | null = null;
  let selectionEffect: 'default' | 'ai-editing' | 'inline-editing' = 'default';
  let editingRects: readonly ViewportRect[] | null = null;
  let dragGhostRect: ViewportRect | null = null;
  let insertionLine: ViewportLine | null = null;
  let guideLines: readonly ViewportLine[] | null = null;
  let distanceLabels: readonly DistanceLabel[] | null = null;
  let textHighlightRects: readonly ViewportRect[] | null = null;

  let viewportWidth = 1;
  let viewportHeight = 1;
  let devicePixelRatio = 1;

  let dirty = true;
  let rafId: number | null = null;

  type AiEditingEffectNode = {
    root: HTMLDivElement;
    sweep: HTMLDivElement;
    animation: Animation | null;
    animationKey: string;
  };

  function createAiEditingEffectNode(): AiEditingEffectNode {
    const root = document.createElement('div');
    root.setAttribute('data-we-ai-selection-effect', 'true');
    Object.assign(root.style, {
      position: 'absolute',
      pointerEvents: 'none',
      display: 'none',
      overflow: 'hidden',
      borderRadius: '0',
      border: `2px solid ${WEB_EDITOR_V2_COLORS.selected}`,
      boxShadow: 'none',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      background: 'rgba(255, 255, 255, 0.22)',
      zIndex: '1',
    });

    const sweep = document.createElement('div');
    Object.assign(sweep.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '72px',
      background:
        'linear-gradient(to bottom, rgba(0, 143, 93, 0), rgba(0, 143, 93, 0.08) 28%, rgba(0, 143, 93, 0.18) 50%, rgba(0, 143, 93, 0.08) 72%, rgba(0, 143, 93, 0))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      willChange: 'transform',
    });

    const sweepLine = document.createElement('div');
    Object.assign(sweepLine.style, {
      width: '100%',
      height: '1px',
      background: 'rgba(0, 143, 93, 0.62)',
      boxShadow: '0 0 12px rgba(0, 143, 93, 0.58)',
    });

    sweep.append(sweepLine);
    root.append(sweep);
    container.append(root);

    return {
      root,
      sweep,
      animation: null,
      animationKey: '',
    };
  }

  const aiEditingEffectNodes: AiEditingEffectNode[] = [];
  disposer.add(() => {
    for (const node of aiEditingEffectNodes) {
      node.animation?.cancel();
      node.root.remove();
    }
  });

  function ensureAiEditingEffectNodes(count: number): void {
    while (aiEditingEffectNodes.length < count) {
      aiEditingEffectNodes.push(createAiEditingEffectNode());
    }

    while (aiEditingEffectNodes.length > count) {
      const node = aiEditingEffectNodes.pop();
      if (!node) break;
      node.animation?.cancel();
      node.root.remove();
    }
  }

  // ==========================================================================
  // RAF Management
  // ==========================================================================

  function cancelRaf(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  disposer.add(cancelRaf);

  function scheduleRaf(): void {
    if (rafId !== null || disposer.isDisposed) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      render();
    });
  }

  // ==========================================================================
  // Canvas Sizing (DPR-aware)
  // ==========================================================================

  function updateCanvasSize(): boolean {
    const nextDpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(1, viewportWidth);
    const cssHeight = Math.max(1, viewportHeight);

    const pixelWidth = Math.round(cssWidth * nextDpr);
    const pixelHeight = Math.round(cssHeight * nextDpr);

    const needsResize =
      canvas.width !== pixelWidth ||
      canvas.height !== pixelHeight ||
      Math.abs(devicePixelRatio - nextDpr) > 0.001;

    if (!needsResize) return false;

    devicePixelRatio = nextDpr;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    // Reset transform after resize (canvas state is cleared)
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    return true;
  }

  // ==========================================================================
  // Drawing Functions
  // ==========================================================================

  function clearCanvas(): void {
    updateCanvasSize();
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  }

  function drawBox(rect: ViewportRect | null, style: BoxStyle): void {
    if (!isValidRect(rect)) return;

    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;

    // Pixel-align for crisp strokes (add 0.5 for even line widths)
    const x = Math.round(rect.left) + 0.5;
    const y = Math.round(rect.top) + 0.5;

    ctx.save();

    // Configure stroke
    ctx.lineWidth = style.lineWidth;
    ctx.strokeStyle = style.strokeColor;
    ctx.fillStyle = style.fillColor;
    ctx.setLineDash(style.dashPattern);

    // Draw rectangle
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function syncAiSelectionEffect(): void {
    const nextRects: ViewportRect[] = [];
    if (selectionEffect === 'ai-editing' && isValidRect(selectionRect)) {
      nextRects.push(selectionRect);
    }
    if (editingRects?.length) {
      for (const rect of editingRects) {
        if (isValidRect(rect)) {
          nextRects.push(rect);
        }
      }
    }

    ensureAiEditingEffectNodes(nextRects.length);
    if (nextRects.length === 0) {
      for (const node of aiEditingEffectNodes) {
        node.root.style.display = 'none';
        node.animation?.pause();
      }
      return;
    }

    nextRects.forEach((rect, index) => {
      const node = aiEditingEffectNodes[index];
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const scanSize = Math.max(48, Math.min(88, Math.round(height * 0.28)));

      node.root.style.display = 'block';
      node.root.style.left = `${Math.round(rect.left)}px`;
      node.root.style.top = `${Math.round(rect.top)}px`;
      node.root.style.width = `${width}px`;
      node.root.style.height = `${height}px`;
      node.sweep.style.height = `${scanSize}px`;

      const animationKey = `${height}:${scanSize}`;
      if (node.animationKey !== animationKey || !node.animation) {
        node.animation?.cancel();
        node.animationKey = animationKey;
        node.animation = node.sweep.animate(
          [
            { transform: `translateY(-${scanSize}px)` },
            { transform: `translateY(${height}px)` },
          ],
          {
            duration: AI_SELECTION_SCAN_DURATION_MS,
            iterations: Infinity,
            easing: 'linear',
          },
        );
      }
      node.animation.play();
    });
  }

  /**
   * Draw an insertion indicator line (horizontal)
   */
  function drawInsertionLine(line: ViewportLine | null): void {
    if (!isValidLine(line)) return;

    ctx.save();

    ctx.lineWidth = WEB_EDITOR_V2_INSERTION_LINE_WIDTH;
    ctx.strokeStyle = WEB_EDITOR_V2_COLORS.insertionLine;
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    // Pixel-align for crisp strokes
    const x1 = Math.round(line.x1) + 0.5;
    const y1 = Math.round(line.y1) + 0.5;
    const x2 = Math.round(line.x2) + 0.5;
    const y2 = Math.round(line.y2) + 0.5;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw alignment guide lines (Phase 4.2)
   *
   * Guide lines indicate snap alignments during resize operations.
   * Multiple lines may be drawn simultaneously (one per axis).
   */
  function drawGuideLines(lines: readonly ViewportLine[] | null): void {
    if (!lines || lines.length === 0) return;

    ctx.save();

    ctx.lineWidth = WEB_EDITOR_V2_GUIDE_LINE_WIDTH;
    ctx.strokeStyle = WEB_EDITOR_V2_COLORS.guideLine;
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    // Batch all lines into single path for performance
    ctx.beginPath();
    for (const line of lines) {
      if (!isValidLine(line)) continue;

      // Pixel-align for crisp strokes
      const x1 = Math.round(line.x1) + 0.5;
      const y1 = Math.round(line.y1) + 0.5;
      const x2 = Math.round(line.x2) + 0.5;
      const y2 = Math.round(line.y2) + 0.5;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw distance labels (Phase 4.3)
   *
   * Renders:
   * - Measurement line (pink, matches guide line color)
   * - End ticks (perpendicular marks at each end)
   * - Text pill (dark translucent background with white text)
   */
  function drawDistanceLabels(labels: readonly DistanceLabel[] | null): void {
    if (!labels || labels.length === 0) return;

    ctx.save();

    // Draw measurement lines and ticks first (batched for performance)
    ctx.lineWidth = WEB_EDITOR_V2_DISTANCE_LINE_WIDTH;
    ctx.strokeStyle = WEB_EDITOR_V2_COLORS.guideLine;
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    const tick = WEB_EDITOR_V2_DISTANCE_TICK_SIZE;

    ctx.beginPath();
    for (const label of labels) {
      const line = label.line;
      if (!isValidLine(line)) continue;

      // Pixel-align for crisp 1px strokes
      const x1 = Math.round(line.x1) + 0.5;
      const y1 = Math.round(line.y1) + 0.5;
      const x2 = Math.round(line.x2) + 0.5;
      const y2 = Math.round(line.y2) + 0.5;

      // Draw measurement line
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      // Draw end ticks (perpendicular to measurement direction)
      if (label.axis === 'x') {
        // Horizontal distance: vertical ticks at each end
        ctx.moveTo(x1, y1 - tick);
        ctx.lineTo(x1, y1 + tick);
        ctx.moveTo(x2, y2 - tick);
        ctx.lineTo(x2, y2 + tick);
      } else {
        // Vertical distance: horizontal ticks at each end
        ctx.moveTo(x1 - tick, y1);
        ctx.lineTo(x1 + tick, y1);
        ctx.moveTo(x2 - tick, y2);
        ctx.lineTo(x2 + tick, y2);
      }
    }
    ctx.stroke();

    // Draw text pills (each label gets its own pill)
    ctx.font = WEB_EDITOR_V2_DISTANCE_LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const label of labels) {
      const line = label.line;
      if (!isValidLine(line)) continue;

      // Measure text dimensions
      const metrics = ctx.measureText(label.text);
      const textWidth = metrics.width;
      // Use actualBoundingBox if available, fallback to estimated values
      const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent
        : 8;
      const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent
        : 3;
      const textHeight = ascent + descent;

      // Calculate pill dimensions
      const pillWidth = Math.ceil(textWidth + WEB_EDITOR_V2_DISTANCE_LABEL_PADDING_X * 2);
      const pillHeight = Math.ceil(textHeight + WEB_EDITOR_V2_DISTANCE_LABEL_PADDING_Y * 2);

      // Position pill at midpoint of measurement line with offset
      const midX = (line.x1 + line.x2) / 2;
      const midY = (line.y1 + line.y2) / 2;
      const offset = WEB_EDITOR_V2_DISTANCE_LABEL_OFFSET;

      let pillX = midX - pillWidth / 2;
      let pillY = midY - pillHeight / 2;

      // Position based on axis with auto-flip if out of viewport
      if (label.axis === 'x') {
        // Horizontal distance: prefer above the line
        pillY = midY - pillHeight / 2 - offset;
        if (pillY < 0) {
          pillY = midY + offset - pillHeight / 2;
        }
      } else {
        // Vertical distance: prefer right of the line
        pillX = midX + offset - pillWidth / 2;
        if (pillX + pillWidth > viewportWidth) {
          pillX = midX - offset - pillWidth / 2;
        }
      }

      // Clamp within viewport bounds (handle edge case where pill > viewport)
      const maxPillX = Math.max(2, viewportWidth - pillWidth - 2);
      const maxPillY = Math.max(2, viewportHeight - pillHeight - 2);
      pillX = clamp(pillX, 2, maxPillX);
      pillY = clamp(pillY, 2, maxPillY);

      // Draw pill background
      ctx.save();
      ctx.fillStyle = WEB_EDITOR_V2_COLORS.distanceLabelBg;
      ctx.strokeStyle = WEB_EDITOR_V2_COLORS.distanceLabelBorder;
      ctx.lineWidth = 1;

      ctx.beginPath();
      buildRoundedRectPath(
        ctx,
        pillX,
        pillY,
        pillWidth,
        pillHeight,
        WEB_EDITOR_V2_DISTANCE_LABEL_RADIUS,
      );
      ctx.fill();
      ctx.stroke();

      // Draw text
      ctx.fillStyle = WEB_EDITOR_V2_COLORS.distanceLabelText;
      ctx.fillText(label.text, pillX + pillWidth / 2, pillY + pillHeight / 2);
      ctx.restore();
    }

    ctx.restore();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Draw text comment highlight rectangles.
   * Renders semi-transparent highlight fills for each per-line rect.
   */
  function drawTextHighlightRects(rects: readonly ViewportRect[] | null): void {
    if (!rects || rects.length === 0) return;

    ctx.save();
    ctx.fillStyle = `${WEB_EDITOR_V2_COLORS.selected}25`; // ~15% opacity
    ctx.strokeStyle = 'transparent';

    for (const rect of rects) {
      if (!isValidRect(rect)) continue;
      const x = Math.round(rect.left);
      const y = Math.round(rect.top);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      ctx.beginPath();
      buildRoundedRectPath(ctx, x, y, w, h, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function markDirty(): void {
    if (disposer.isDisposed) return;
    dirty = true;
    scheduleRaf();
  }

  function render(): void {
    if (disposer.isDisposed || !dirty) return;

    // Cancel any pending RAF (in case render() is called manually)
    cancelRaf();

    // Reset dirty flag before drawing
    dirty = false;

    // Calculate hover rect to render (may be animated)
    const now = performance.now();
    let hoverRectToRender = hoverRect;

    if (hoverAnimation) {
      const elapsed = now - hoverAnimation.startTime;
      const progress = clamp(elapsed / hoverAnimation.durationMs, 0, 1);
      const easedProgress = easeOutCubic(progress);
      hoverRectToRender = lerpRect(hoverAnimation.start, hoverAnimation.end, easedProgress);

      if (progress >= 1) {
        // Animation complete, clear state
        hoverAnimation = null;
      } else {
        // Animation in progress, schedule next frame
        dirty = true;
      }
    }

    // Clear and redraw
    clearCanvas();
    drawTextHighlightRects(textHighlightRects);
    drawBox(hoverRectToRender, OVERLAY_BOX_STYLES.hover);
    if (selectionEffect !== 'ai-editing') {
      drawBox(
        selectionRect,
        selectionEffect === 'inline-editing'
          ? OVERLAY_BOX_STYLES.inlineEditing
          : OVERLAY_BOX_STYLES.selection,
      );
    }
    drawBox(dragGhostRect, OVERLAY_BOX_STYLES.dragGhost);
    drawInsertionLine(insertionLine);
    drawGuideLines(guideLines);
    drawDistanceLabels(distanceLabels);
    syncAiSelectionEffect();

    // If something marked dirty during render, schedule another frame
    if (dirty) {
      scheduleRaf();
    }
  }

  function setHoverRect(rect: ViewportRect | null, options?: { animate?: boolean }): void {
    const shouldAnimate = options?.animate === true;

    // Fast path: no animation requested (snap immediately)
    if (!shouldAnimate) {
      hoverAnimation = null;
      hoverRect = rect;
      markDirty();
      return;
    }

    // Animation requested: calculate starting position
    const now = performance.now();
    let fromRect: ViewportRect | null = hoverRect;

    // If animation is in progress, start from current interpolated position
    // This ensures smooth transition when target changes mid-animation
    if (hoverAnimation) {
      const elapsed = now - hoverAnimation.startTime;
      const progress = clamp(elapsed / hoverAnimation.durationMs, 0, 1);
      const easedProgress = easeOutCubic(progress);
      fromRect = lerpRect(hoverAnimation.start, hoverAnimation.end, easedProgress);
    }

    // Cannot animate if source or target rect is invalid
    if (!isValidRect(fromRect) || !isValidRect(rect)) {
      hoverAnimation = null;
      hoverRect = rect;
      markDirty();
      return;
    }

    // Start animation from current position to target
    hoverAnimation = {
      start: { ...fromRect },
      end: { ...rect },
      startTime: now,
      durationMs: HOVER_ANIMATION_DURATION_MS,
    };
    hoverRect = rect;
    markDirty();
  }

  function setSelectionRect(rect: ViewportRect | null): void {
    selectionRect = rect;
    syncAiSelectionEffect();
    markDirty();
  }

  function setSelectionEffect(effect: 'default' | 'ai-editing' | 'inline-editing'): void {
    if (selectionEffect === effect) return;
    selectionEffect = effect;
    syncAiSelectionEffect();
    markDirty();
  }

  function setEditingRects(rects: readonly ViewportRect[] | null): void {
    editingRects = rects && rects.length > 0 ? rects : null;
    syncAiSelectionEffect();
    markDirty();
  }

  function setDragGhostRect(rect: ViewportRect | null): void {
    dragGhostRect = rect;
    markDirty();
  }

  function setInsertionLine(line: ViewportLine | null): void {
    insertionLine = line;
    markDirty();
  }

  function setGuideLines(lines: readonly ViewportLine[] | null): void {
    guideLines = lines && lines.length > 0 ? lines : null;
    markDirty();
  }

  function setDistanceLabels(labels: readonly DistanceLabel[] | null): void {
    distanceLabels = labels && labels.length > 0 ? labels : null;
    markDirty();
  }

  function setTextHighlightRects(rects: readonly ViewportRect[] | null): void {
    textHighlightRects = rects && rects.length > 0 ? rects : null;
    markDirty();
  }

  function clear(): void {
    hoverRect = null;
    hoverAnimation = null;
    selectionRect = null;
    selectionEffect = 'default';
    editingRects = null;
    textHighlightRects = null;
    syncAiSelectionEffect();
    dragGhostRect = null;
    insertionLine = null;
    guideLines = null;
    distanceLabels = null;
    markDirty();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  // Initial size measurement
  try {
    const rect = container.getBoundingClientRect();
    viewportWidth = Math.max(1, rect.width);
    viewportHeight = Math.max(1, rect.height);
  } catch (error) {
    console.warn(`${WEB_EDITOR_V2_LOG_PREFIX} Initial size measurement failed:`, error);
  }

  // Setup ResizeObserver for automatic sizing
  disposer.observeResize(container, (entries) => {
    const entry = entries[0];
    const rect = entry?.contentRect;
    if (!rect) return;

    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);

    // Skip if size hasn't changed significantly
    if (Math.abs(nextWidth - viewportWidth) < 0.5 && Math.abs(nextHeight - viewportHeight) < 0.5) {
      return;
    }

    viewportWidth = nextWidth;
    viewportHeight = nextHeight;
    markDirty();
  });

  // Initial render
  markDirty();

  return {
    canvas,
    markDirty,
    render,
    clear,
    setHoverRect,
    setSelectionRect,
    setSelectionEffect,
    setEditingRects,
    setTextHighlightRects,
    setDragGhostRect,
    setInsertionLine,
    setGuideLines,
    setDistanceLabels,
    dispose: () => disposer.dispose(),
  };
}
