/**
 * Web Editor V2 Constants
 *
 * Centralized configuration values for the visual editor.
 * All magic strings/numbers should be defined here.
 */

/** Editor version number */
export const WEB_EDITOR_V2_VERSION = 2 as const;

/** Log prefix for console messages */
export const WEB_EDITOR_V2_LOG_PREFIX = '[WebEditorV2]' as const;

// =============================================================================
// DOM Element IDs
// =============================================================================

/** Shadow host element ID */
export const WEB_EDITOR_V2_HOST_ID = '__mcp_web_editor_v2_host__';

/** Overlay container ID (for Canvas and visual feedback) */
export const WEB_EDITOR_V2_OVERLAY_ID = '__mcp_web_editor_v2_overlay__';

/** UI container ID (for panels and controls) */
export const WEB_EDITOR_V2_UI_ID = '__mcp_web_editor_v2_ui__';

// =============================================================================
// Styling
// =============================================================================

/** Maximum z-index to ensure editor is always on top */
export const WEB_EDITOR_V2_Z_INDEX = 2147483647;

/** Default panel width */
export const WEB_EDITOR_V2_PANEL_WIDTH = 320;
export const WEB_EDITOR_V2_SELECTION_LINE_WIDTH = 2;

// =============================================================================
// Colors (Design System)
// =============================================================================

export const WEB_EDITOR_V2_COLORS = {
  /** Hover highlight color */
  hover: '#008F5D',
  /** Selected element color */
  selected: '#008F5D',
  /** Selection box border */
  selectionBorder: '#008F5D',
  /** Drag ghost color */
  dragGhost: 'rgba(0, 143, 93, 0.22)',
  /** Insertion line color */
  insertionLine: '#008F5D',
  /** Alignment guide line color (snap guides) */
  guideLine: 'rgba(0, 143, 93, 0.72)',
  /** Distance label background (Phase 4.3) */
  distanceLabelBg: 'rgba(18, 18, 18, 0.94)',
  /** Distance label border (Phase 4.3) */
  distanceLabelBorder: 'rgba(0, 143, 93, 0.24)',
  /** Distance label text (Phase 4.3) */
  distanceLabelText: 'rgba(255, 255, 255, 0.98)',
} as const;

// =============================================================================
// Drag Reorder (Phase 2.4-2.6)
// =============================================================================

/** Minimum pointer movement (px) to start dragging */
export const WEB_EDITOR_V2_DRAG_THRESHOLD_PX = 5;

/** Hysteresis (px) for stable before/after decision to avoid flip-flop */
export const WEB_EDITOR_V2_DRAG_HYSTERESIS_PX = 6;

/** Max elements to inspect per hit-test (elementsFromPoint) */
export const WEB_EDITOR_V2_DRAG_MAX_HIT_ELEMENTS = 8;

/** Insertion indicator line width in CSS pixels */
export const WEB_EDITOR_V2_INSERTION_LINE_WIDTH = 3;

// =============================================================================
// Snapping & Alignment Guides (Phase 4.2)
// =============================================================================

/** Snap threshold in CSS pixels - distance at which snapping activates */
export const WEB_EDITOR_V2_SNAP_THRESHOLD_PX = 6;

/** Hysteresis in CSS pixels - keeps snap stable near boundary to prevent flicker */
export const WEB_EDITOR_V2_SNAP_HYSTERESIS_PX = 2;

/** Maximum sibling elements to consider for snapping (nearest first) */
export const WEB_EDITOR_V2_SNAP_MAX_ANCHOR_ELEMENTS = 30;

/** Maximum siblings to scan before applying distance filter */
export const WEB_EDITOR_V2_SNAP_MAX_SIBLINGS_SCAN = 300;

/** Alignment guide line width in CSS pixels */
export const WEB_EDITOR_V2_GUIDE_LINE_WIDTH = 1;

// =============================================================================
// Distance Labels (Phase 4.3)
// =============================================================================

/** Minimum distance (px) to display a label - hides 0 and sub-pixel gaps */
export const WEB_EDITOR_V2_DISTANCE_LABEL_MIN_PX = 1;

/** Measurement line width in CSS pixels */
export const WEB_EDITOR_V2_DISTANCE_LINE_WIDTH = 1;

/** Tick size at the ends of measurement lines (CSS pixels) */
export const WEB_EDITOR_V2_DISTANCE_TICK_SIZE = 4;

/** Font used for distance label pills */
export const WEB_EDITOR_V2_DISTANCE_LABEL_FONT =
  '600 11px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Horizontal padding inside distance label pill (CSS pixels) */
export const WEB_EDITOR_V2_DISTANCE_LABEL_PADDING_X = 6;

/** Vertical padding inside distance label pill (CSS pixels) */
export const WEB_EDITOR_V2_DISTANCE_LABEL_PADDING_Y = 3;

/** Border radius for distance label pill (CSS pixels) */
export const WEB_EDITOR_V2_DISTANCE_LABEL_RADIUS = 4;

/** Offset from the measurement line to place the pill (CSS pixels) */
export const WEB_EDITOR_V2_DISTANCE_LABEL_OFFSET = 8;
