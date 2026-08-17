import type { ViewportRect } from '../overlay/canvas-overlay';
import { isMobileDevice } from '../utils/mobile-detect';

export interface PromptCardPosition {
  left: number;
  top: number;
}

export interface ComputePromptCardPositionOptions {
  anchorRect: ViewportRect;
  cardWidth: number;
  cardHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  propertyPanelEnabled: boolean;
  safePaddingPx?: number;
  propertyPanelWidth?: number;
  propertyPanelRight?: number;
  anchorGapPx?: number;
}

/**
 * Get the effective viewport height, accounting for mobile virtual keyboards.
 * Uses the VisualViewport API when available to detect the actual visible area.
 */
function getVisualViewportHeight(): number {
  if (
    typeof window !== 'undefined' &&
    window.visualViewport &&
    Number.isFinite(window.visualViewport.height)
  ) {
    return window.visualViewport.height;
  }
  return typeof window !== 'undefined' ? window.innerHeight : 0;
}

export function computePromptCardPosition(options: ComputePromptCardPositionOptions): PromptCardPosition {
  const {
    anchorRect,
    cardWidth,
    cardHeight,
    viewportWidth,
    viewportHeight,
    propertyPanelEnabled,
    safePaddingPx = 12,
    propertyPanelWidth = 268,
    propertyPanelRight = 16,
    anchorGapPx = 12,
  } = options;

  // ── Mobile: fixed to bottom of visible viewport, full width ──────────
  if (isMobileDevice()) {
    const visualHeight = getVisualViewportHeight();
    const mobileCardPadding = 8;
    const left = mobileCardPadding;
    // Position card at the bottom of the *visible* viewport (above keyboard)
    const top = Math.max(
      mobileCardPadding,
      visualHeight - cardHeight - mobileCardPadding,
    );
    return { left: Math.round(left), top: Math.round(top) };
  }

  // ── Desktop: existing behavior (unchanged) ──────────────────────────
  const safeRightX = propertyPanelEnabled
    ? viewportWidth - (propertyPanelWidth + propertyPanelRight + safePaddingPx)
    : viewportWidth - safePaddingPx;
  const viewportMaxLeft = Math.max(
    safePaddingPx,
    viewportWidth - safePaddingPx - cardWidth,
  );
  const propertyPanelMaxLeft = safeRightX - cardWidth;
  const maxLeft = propertyPanelEnabled && propertyPanelMaxLeft >= safePaddingPx
    ? Math.min(viewportMaxLeft, propertyPanelMaxLeft)
    : viewportMaxLeft;
  const preferredRightLeft = anchorRect.left + anchorRect.width + anchorGapPx;
  const preferredLeftLeft = anchorRect.left - anchorGapPx - cardWidth;
  const fitsRight = preferredRightLeft >= safePaddingPx && preferredRightLeft <= maxLeft;
  const fitsLeft = preferredLeftLeft >= safePaddingPx && preferredLeftLeft <= maxLeft;
  const left = fitsRight
    ? preferredRightLeft
    : fitsLeft
      ? preferredLeftLeft
      : Math.min(maxLeft, Math.max(safePaddingPx, preferredRightLeft));

  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const centeredTop = anchorCenterY - cardHeight / 2;
  const top = Math.min(
    viewportHeight - safePaddingPx - cardHeight,
    Math.max(safePaddingPx, centeredTop),
  );

  return { left: Math.round(left), top: Math.round(top) };
}
