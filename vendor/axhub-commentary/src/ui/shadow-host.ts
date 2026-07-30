/**
 * Shadow DOM Host
 *
 * Creates an isolated container for the Web Editor UI using Shadow DOM.
 * Provides:
 * - Style isolation (no CSS bleed in/out)
 * - Event isolation (UI events don't bubble to page)
 * - Overlay container for Canvas/visual feedback
 * - UI container for panels/controls
 */

import {
  WEB_EDITOR_V2_COLORS,
  WEB_EDITOR_V2_HOST_ID,
  WEB_EDITOR_V2_OVERLAY_ID,
  WEB_EDITOR_V2_UI_ID,
  WEB_EDITOR_V2_Z_INDEX,
} from '../constants';
import { isMobileDevice } from '../utils/mobile-detect';
import { Disposer } from '../utils/disposables';

// =============================================================================
// Types
// =============================================================================

/** Elements exposed by the shadow host */
export interface ShadowHostElements {
  /** The host element attached to the document */
  host: HTMLDivElement;
  /** The shadow root */
  shadowRoot: ShadowRoot;
  /** Container for overlay elements (Canvas, guides, etc.) */
  overlayRoot: HTMLDivElement;
  /** Container for UI elements (panels, toolbar, etc.) */
  uiRoot: HTMLDivElement;
}

/** Options for mounting the shadow host (placeholder for future extension) */
export type ShadowHostOptions = Record<string, never>;

/** Interface for the shadow host manager */
export interface ShadowHostManager {
  /** Get the shadow host elements (null if not mounted) */
  getElements(): ShadowHostElements | null;
  /**
   * Re-parent the host into the current focus trap container, if any.
   * This keeps document.activeElement inside modal/dialog wrappers when the
   * focused control lives in the editor Shadow DOM.
   */
  setMountContainer?(anchorElement: Element | null): void;
  /** Check if a node is part of the editor overlay */
  isOverlayElement(node: unknown): boolean;
  /** Check if an event originated from the editor UI */
  isEventFromUi(event: Event): boolean;
  /** Dispose and unmount the shadow host */
  dispose(): void;
}

const SHADOW_HOST_FOCUS_TRAP_SELECTORS = [
  '.ant-modal-wrap',
  '[role="dialog"][aria-modal="true"]',
  '[aria-modal="true"]',
  'dialog[open]',
].join(', ');

function getDefaultMountPoint(): HTMLElement {
  return (document.documentElement ?? document.body) as HTMLElement;
}

export function resolveShadowHostMountContainer(anchorElement: Element | null): HTMLElement | null {
  if (!(anchorElement instanceof Element) || !anchorElement.isConnected) return null;
  const container = anchorElement.closest(SHADOW_HOST_FOCUS_TRAP_SELECTORS);
  return container instanceof HTMLElement ? container : null;
}

// =============================================================================
// Styles
// =============================================================================

const SHADOW_HOST_STYLES = /* css */ `
  :host {
    all: initial;

    /* Shared overlay tokens */
    --we-surface-bg: #0a0a0a;

    /* Border colors */
    --we-border-subtle: rgba(255, 255, 255, 0.08);

    /* Text colors */
    --we-text-primary: rgba(255, 255, 255, 0.94);
    --we-text-secondary: rgba(255, 255, 255, 0.72);
    --we-text-muted: #a1a1aa;

    /* Shared chrome */
    --we-shadow-panel: 0 20px 54px rgba(0, 0, 0, 0.42), 0 6px 20px rgba(0, 0, 0, 0.28);
    --we-shadow-glow: 0 0 22px rgba(0, 143, 93, 0.18);
    --we-editor-surface-dark: #121212;
    --we-editor-surface-elevated-dark: #161616;
    --we-editor-surface-muted-dark: #18181b;
    --we-editor-surface-interactive-dark: #1d1d1f;
    --we-editor-border-dark: rgba(255, 255, 255, 0.08);
    --we-editor-border-strong-dark: rgba(255, 255, 255, 0.12);
    --we-editor-text-primary-dark: rgba(255, 255, 255, 0.94);
    --we-editor-text-secondary-dark: rgba(255, 255, 255, 0.72);
    --we-editor-text-muted-dark: #a1a1aa;
    --we-brand-primary: #008f5d;
    --we-brand-accent: #00d68f;
    --we-brand-sleeping: #71717a;

    --we-radius-panel: 16px;
    --we-radius-control: 12px;
    --we-radius-pill: 999px;

    /* Focus ring */
    --we-focus-ring: rgba(0, 214, 143, 0.24);
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  /* Overlay container - for Canvas and visual feedback */
  #${WEB_EDITOR_V2_OVERLAY_ID} {
    position: fixed;
    inset: 0;
    pointer-events: none;
    contain: layout style;
  }

  /* ==========================================================================
   * Resize Handles (Phase 4.9)
   * ========================================================================== */

  /* Handles layer - covers viewport, pass-through by default */
  .we-handles-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    contain: layout style paint;
  }

  /* Selection frame - positioned by selection rect */
  .we-selection-frame {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    transform: translate3d(0, 0, 0);
    pointer-events: none;
    will-change: transform, width, height;
  }

  .we-parent-corner {
    position: absolute;
    width: 7px;
    height: 7px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    pointer-events: auto;
    display: block;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
    z-index: 7;
  }

  .we-parent-corner[data-hidden="true"] {
    display: none;
  }

  .we-parent-corner:focus-visible {
    outline: none;
  }

  .we-parent-corner__chrome {
    width: 100%;
    height: 100%;
    border-radius: 2px;
    display: block;
    opacity: 0.82;
    transition: opacity 140ms ease, box-shadow 140ms ease;
  }

  /* Individual resize handle */
  .we-resize-handle {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: #ffffff;
    border: 1px solid ${WEB_EDITOR_V2_COLORS.selectionBorder};
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 0 2px rgba(0, 214, 143, 0.18),
      0 8px 20px rgba(0, 0, 0, 0.18);
    pointer-events: auto;
    touch-action: none;
    user-select: none;
    transition: background-color 0.1s ease, border-color 0.1s ease, transform 0.1s ease,
      box-shadow 0.1s ease;
  }

  .we-resize-handle:hover {
    background: #ffffff;
    border-color: ${WEB_EDITOR_V2_COLORS.selectionBorder};
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.98), 0 0 0 3px rgba(0, 214, 143, 0.22),
      0 10px 24px rgba(0, 0, 0, 0.2);
    transform: translate(-50%, -50%) scale(1.15);
  }

  .we-resize-handle:active {
    transform: translate(-50%, -50%) scale(1.0);
  }

  /* Handle positions - all use translate(-50%, -50%) as base */
  .we-resize-handle[data-dir="n"]  { left: 50%; top: 0; transform: translate(-50%, -50%); cursor: ns-resize; }
  .we-resize-handle[data-dir="s"]  { left: 50%; top: 100%; transform: translate(-50%, -50%); cursor: ns-resize; }
  .we-resize-handle[data-dir="e"]  { left: 100%; top: 50%; transform: translate(-50%, -50%); cursor: ew-resize; }
  .we-resize-handle[data-dir="w"]  { left: 0; top: 50%; transform: translate(-50%, -50%); cursor: ew-resize; }
  .we-resize-handle[data-dir="nw"] { left: 0; top: 0; transform: translate(-50%, -50%); cursor: nwse-resize; }
  .we-resize-handle[data-dir="ne"] { left: 100%; top: 0; transform: translate(-50%, -50%); cursor: nesw-resize; }
  .we-resize-handle[data-dir="sw"] { left: 0; top: 100%; transform: translate(-50%, -50%); cursor: nesw-resize; }
  .we-resize-handle[data-dir="se"] { left: 100%; top: 100%; transform: translate(-50%, -50%); cursor: nwse-resize; }

  /* Size HUD - shows W×H while resizing */
  .we-size-hud {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translate(-50%, calc(-100% - 8px));
    padding: 3px 8px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.98);
    background: rgba(18, 18, 18, 0.94);
    border: 1px solid rgba(0, 214, 143, 0.2);
    border-radius: 999px;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
    box-shadow: var(--we-shadow-glow), 0 8px 20px rgba(0, 0, 0, 0.24);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  /* ==========================================================================
   * Performance HUD (Phase 5.3)
   * ========================================================================== */

  .we-perf-hud {
    position: fixed;
    left: 12px;
    bottom: 12px;
    padding: 8px 10px;
    border-radius: 16px;
    background: rgba(18, 18, 18, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.96);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 12px;
    line-height: 1.25;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
    z-index: 10;
    box-shadow: var(--we-shadow-panel);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    font-variant-numeric: tabular-nums;
  }

  .we-perf-hud-line + .we-perf-hud-line {
    margin-top: 4px;
  }

  /* UI container - for panels and controls */
  /* Position below toolbar: 16px (toolbar top) + 40px (toolbar height) + 8px (gap) = 64px */
  #${WEB_EDITOR_V2_UI_ID} {
    position: fixed;
    inset: 0;
    top: 32px;
    right: 16px;
    pointer-events: none;
    z-index: 10020;
    font-family: "Inter", "SF Pro Display", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: var(--we-text-primary);
    -webkit-font-smoothing: antialiased;
  }

  /* ==========================================================================
     Breadcrumbs (Phase 2.2) - Anchored to selection element
     ========================================================================== */
  .we-breadcrumbs {
    position: fixed;
    /* left/top set dynamically via JS based on selection rect */
    left: 16px;
    top: 72px;
    width: auto;
    max-width: min(600px, calc(100vw - 400px));
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: var(--we-surface-bg);
    border: 1px solid var(--we-border-subtle);
    border-radius: var(--we-radius-panel);
    box-shadow: var(--we-shadow-panel);
    pointer-events: auto;
    user-select: none;
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: none;
    z-index: 5;
    color: var(--we-text-primary);
  }

  .we-breadcrumbs[data-hidden="true"] {
    display: none;
  }

  .we-breadcrumbs[data-position="bottom"] {
    top: auto;
    bottom: 72px;
  }

  .we-breadcrumbs::-webkit-scrollbar {
    display: none;
  }

  .we-crumb {
    display: inline-flex;
    align-items: center;
    max-width: 220px;
    padding: 4px 8px;
    border-radius: var(--we-radius-control);
    border: none;
    background: transparent;
    color: var(--we-text-secondary);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.15s ease;
  }

  .we-crumb-send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--we-radius-control);
    background: rgba(0, 143, 93, 0.1);
    color: #008F5D;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
    flex: 0 0 auto;
  }

  .we-crumb-send-btn svg {
    width: 14px;
    height: 14px;
    display: block;
  }

  .we-crumb-send-btn:hover {
    background: rgba(0, 143, 93, 0.16);
    transform: translateY(-1px);
  }

  .we-crumb-send-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--we-focus-ring);
  }

  .we-crumb:hover {
    background: rgba(0, 143, 93, 0.08);
    color: var(--we-text-primary);
  }

  .we-crumb:active {
    background: rgba(0, 143, 93, 0.12);
  }

  .we-crumb:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--we-focus-ring);
  }

  .we-crumb--current {
    background: rgba(0, 143, 93, 0.1);
    color: #008F5D;
    font-weight: 600;
  }

  .we-crumb-sep {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    flex: 0 0 auto;
    color: var(--we-text-muted);
    font-size: 12px;
  }

  .we-crumb-sep--shadow {
    color: var(--we-text-secondary);
  }

  .we-change-markers {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9996;
  }

  @keyframes we-change-marker-task-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .we-change-marker {
    position: fixed;
    transform: translate(-50%, -50%);
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #1C2736;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0;
    box-shadow:
      0 5px 12px rgba(22, 30, 42, 0.2),
      0 0 0 2px #FFFFFF;
    pointer-events: auto;
    cursor: pointer;
    transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
    isolation: isolate;
    --we-change-marker-task-accent: #778290;
    --we-change-marker-task-ring: rgba(119, 130, 144, 0.5);
    --we-change-marker-task-ring-hover: rgba(119, 130, 144, 0.58);
  }

  .we-change-marker::before {
    content: "";
    position: absolute;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
  }

  .we-change-marker::after {
    content: "";
    position: absolute;
    z-index: 1;
    inset: -8px;
    border-radius: inherit;
  }

  .we-change-marker:hover,
  .we-change-marker:focus-visible {
    transform: translate(-50%, -50%);
    box-shadow:
      0 7px 16px rgba(22, 30, 42, 0.24),
      0 0 0 2px #FFFFFF,
      0 0 0 5px var(--we-change-marker-task-ring-hover);
    outline: none;
  }

  .we-change-marker--annotation-note {
    transform: translate(8px, -50%);
  }

  .we-change-marker--annotation-note:hover,
  .we-change-marker--annotation-note:focus-visible {
    transform: translate(8px, -50%);
  }

  .we-change-marker--task-editing {
    --we-change-marker-task-accent: #14815F;
    --we-change-marker-task-ring: rgba(20, 129, 95, 0.5);
    --we-change-marker-task-ring-hover: rgba(20, 129, 95, 0.58);
    cursor: progress;
    box-shadow:
      0 5px 12px rgba(22, 30, 42, 0.2),
      0 0 0 2px #FFFFFF;
  }

  .we-change-marker--task-editing::before {
    inset: -6px;
    z-index: -1;
    opacity: 1;
    background: conic-gradient(
      from 10deg,
      transparent 0 42%,
      #14815F 44% 76%,
      transparent 78%
    );
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0);
    mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0);
    animation: we-change-marker-task-spin 1.4s linear infinite;
  }

  .we-change-marker--task-error {
    --we-change-marker-task-accent: #D04444;
    --we-change-marker-task-ring: rgba(208, 68, 68, 0.5);
    --we-change-marker-task-ring-hover: rgba(208, 68, 68, 0.58);
    box-shadow:
      0 5px 12px rgba(22, 30, 42, 0.2),
      0 0 0 2px #FFFFFF,
      0 0 0 4px var(--we-change-marker-task-ring);
  }

  .we-change-marker--task-idle {
    --we-change-marker-task-accent: #7A8592;
    --we-change-marker-task-ring: rgba(122, 133, 146, 0.5);
    --we-change-marker-task-ring-hover: rgba(122, 133, 146, 0.58);
    box-shadow:
      0 5px 12px rgba(22, 30, 42, 0.2),
      0 0 0 2px #FFFFFF,
      0 0 0 4px var(--we-change-marker-task-ring);
  }

  .we-change-marker--task-completed {
    --we-change-marker-task-accent: #248A58;
    --we-change-marker-task-ring: rgba(36, 138, 88, 0.5);
    --we-change-marker-task-ring-hover: rgba(36, 138, 88, 0.58);
    box-shadow:
      0 5px 12px rgba(22, 30, 42, 0.2),
      0 0 0 2px #FFFFFF,
      0 0 0 4px var(--we-change-marker-task-ring);
  }

  .we-change-marker__body {
    display: block;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: 2;
  }

  .we-change-marker__task-status {
    position: absolute;
    z-index: 3;
    right: -5px;
    bottom: -5px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    display: none;
    align-items: center;
    justify-content: center;
    border: 1.5px solid #FFFFFF;
    background: var(--we-change-marker-task-accent);
    color: #FFFFFF;
    font-size: 8px;
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 2px 4px rgba(20, 28, 38, 0.2);
  }

  .we-change-marker--task-completed .we-change-marker__task-status,
  .we-change-marker--task-error .we-change-marker__task-status {
    display: inline-flex;
  }

  @media (prefers-reduced-motion: reduce) {
    .we-change-marker--task-editing::before {
      animation: none;
    }
  }

  .we-change-marker__tooltip {
    position: absolute;
    z-index: 10;
    left: 50%;
    top: calc(100% + 8px);
    transform: translateX(-50%);
    width: min(280px, calc(100vw - 32px));
    max-width: min(280px, calc(100vw - 32px));
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.96);
    color: rgba(255, 255, 255, 0.92);
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.22);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease;
  }

  .we-change-marker:hover .we-change-marker__tooltip,
  .we-change-marker:focus-visible .we-change-marker__tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .we-change-marker--annotation-note .we-change-marker__tooltip {
    left: 0;
    transform: translateY(-2px);
  }

  .we-change-marker--annotation-note:hover .we-change-marker__tooltip,
  .we-change-marker--annotation-note:focus-visible .we-change-marker__tooltip {
    transform: translateY(0);
  }

  .we-change-marker__details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .we-change-marker__label {
    display: block;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.58);
  }

  .we-change-marker__note {
    display: block;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.96);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ==========================================================================
   * Global Hidden Rule
   * Ensures [hidden] attribute always hides elements, even when they have
   * explicit display values (flex, inline-flex, etc.)
   * ========================================================================== */
  [hidden] {
    display: none !important;
  }
`;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Set a CSS property with !important flag
 */
function setImportantStyle(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, 'important');
}

// Note: Property panel UI is mounted by the React runtime.

/**
 * Mount the Shadow DOM host and return a manager interface
 */
export function mountShadowHost(_options: ShadowHostOptions = {}): ShadowHostManager {
  const disposer = new Disposer();
  let elements: ShadowHostElements | null = null;
  let currentMountParent: HTMLElement | null = null;

  // Clean up any existing host (from crash/reload)
  const existing = document.getElementById(WEB_EDITOR_V2_HOST_ID);
  if (existing) {
    try {
      existing.remove();
    } catch {
      // Best-effort cleanup
    }
  }

  // Create host element
  const host = document.createElement('div');
  host.id = WEB_EDITOR_V2_HOST_ID;
  // Figma's fullscreen canvas retargets events crossing the Shadow DOM boundary
  // to this host. Mark it like Figma's own draggable controls so the canvas does
  // not claim pointermove after a drag starts inside the commentary UI.
  host.classList.add('data-fullscreen-prevent-event-capture');
  host.setAttribute('data-mcp-web-editor', 'v2');

  // Apply host styles with !important to resist page CSS
  setImportantStyle(host, 'position', 'fixed');
  setImportantStyle(host, 'inset', '0');
  setImportantStyle(host, 'z-index', String(WEB_EDITOR_V2_Z_INDEX));
  setImportantStyle(host, 'pointer-events', 'none');
  setImportantStyle(host, 'background', 'transparent');
  // On mobile, skip `contain: paint` and `isolation: isolate` — these can cause
  // Android Chrome's compositor to create an opaque compositing layer over the page
  // content when the Shadow DOM repaints (e.g., selection chrome changes).
  if (isMobileDevice()) {
    setImportantStyle(host, 'contain', 'none');
  } else {
    setImportantStyle(host, 'contain', 'layout style paint');
    setImportantStyle(host, 'isolation', 'isolate');
  }

  // Create shadow root
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Add styles
  const styleEl = document.createElement('style');
  styleEl.textContent = SHADOW_HOST_STYLES;
  shadowRoot.append(styleEl);

  // Create overlay container (for Canvas)
  const overlayRoot = document.createElement('div');
  overlayRoot.id = WEB_EDITOR_V2_OVERLAY_ID;

  // Create UI container (for panels)
  // Note: Property Panel is now created separately by editor.ts (Phase 3)
  const uiRoot = document.createElement('div');
  uiRoot.id = WEB_EDITOR_V2_UI_ID;

  shadowRoot.append(overlayRoot, uiRoot);

  const ensureMountedAt = (anchorElement: Element | null): void => {
    const nextMountParent = resolveShadowHostMountContainer(anchorElement) ?? getDefaultMountPoint();
    if (currentMountParent === nextMountParent && host.parentElement === nextMountParent) {
      return;
    }
    nextMountParent.append(host);
    currentMountParent = nextMountParent;
  };

  // Mount to the document root by default. When a selection lives inside a
  // focus-trapping dialog (for example Ant Design Modal), the interaction
  // layer will move this host under that container.
  ensureMountedAt(null);
  disposer.add(() => host.remove());

  elements = { host, shadowRoot, overlayRoot, uiRoot };

  // Event isolation: prevent UI events from bubbling to page
  const blockedEvents = [
    'pointerdown',
    'pointerup',
    'pointermove',
    'pointerenter',
    'pointerleave',
    'mousedown',
    'mouseup',
    'mousemove',
    'mouseenter',
    'mouseleave',
    'click',
    'dblclick',
    'contextmenu',
    'keydown',
    'keyup',
    'keypress',
    'wheel',
    'touchstart',
    'touchmove',
    'touchend',
    'touchcancel',
    'focus',
    'blur',
    'input',
    'change',
  ];

  const stopPropagation = (event: Event) => {
    event.stopPropagation();
  };

  for (const eventType of blockedEvents) {
    disposer.listen(uiRoot, eventType, stopPropagation);
    // Also block overlay interactions (handles, guides) from bubbling to page
    // Note: capture-phase listeners on the page cannot be fully prevented
    disposer.listen(overlayRoot, eventType, stopPropagation);
  }

  // Helper: check if a node is part of the editor
  const isOverlayElement = (node: unknown): boolean => {
    if (!(node instanceof Node)) return false;
    if (node === host) return true;

    const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
    return root instanceof ShadowRoot && root.host === host;
  };

  // Helper: check if an event came from the editor UI
  const isEventFromUi = (event: Event): boolean => {
    try {
      if (typeof event.composedPath === 'function') {
        return event.composedPath().some((el) => isOverlayElement(el));
      }
    } catch {
      // Fallback to target
    }
    return isOverlayElement(event.target);
  };

  return {
    getElements: () => elements,
    setMountContainer: (anchorElement) => {
      ensureMountedAt(anchorElement);
    },
    isOverlayElement,
    isEventFromUi,
    dispose: () => {
      elements = null;
      disposer.dispose();
    },
  };
}
