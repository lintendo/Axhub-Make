import type { WebEditorElementKey, WebEditorRevertElementResponse, ElementLocator } from '../../web-editor-types';
import { createElementLocator, locateElement } from '../locator';
import { aggregateTransactionsByElement } from '../transaction-aggregator';
import type { EventModifiers } from '../event-controller';
import type { TrackedRects } from '../position-tracker';
import type { ViewportRect } from '../../overlay/canvas-overlay';
import { resolveMarkerAnchorRect } from './marker-anchor';
import type {
  EditorChangesService,
  EditorAgentBridgeService,
  EditorInteractionService,
  EditorPersistenceService,
  EditorTextSessionService,
} from './contracts';
import type { EditorRuntimeState } from './state';
import { DEFAULT_MODIFIERS, filterUnprocessedTransactions } from './state';
import type { CommentEntryMode } from '../../ui/selection-ui-mode';
import type { TextComment } from '../../selection/text-comment-manager';
import { createMarkerAnchor } from './marker-anchor';
import { formatTextCommentLabel } from './text-comment-target';
import {
  isAnnotationMarkerElement,
  openAnnotationMarkerCommentTarget,
} from '../../utils/annotation-comment-bridge';

export function createInteractionService(options: {
  state: EditorRuntimeState;
  changes: EditorChangesService;
  persistence: EditorPersistenceService;
  textSession: EditorTextSessionService;
  agentBridge: EditorAgentBridgeService;
  logPrefix: string;
  onStatusChange?: () => void;
  onSelectionChange?: () => void;
  onHoverChange?: () => void;
}): EditorInteractionService {
  const { state, agentBridge } = options;

  function syncShadowHostMount(anchorElement: Element | null): void {
    state.shadowHost?.setMountContainer?.(anchorElement);
  }

  function resolveSelectionAnchorViewportRect(): ViewportRect | null {
    const anchor = state.selectionAnchor;
    if (!anchor) return null;

    const selected = state.selectedElement;
    const textCommentSource = state.activeTextComment?.sourceElement;
    const liveAnchorElement = (
      selected && selected.isConnected
        ? selected
        : textCommentSource && textCommentSource.isConnected
          ? textCommentSource
          : null
    );
    const liveRect =
      liveAnchorElement instanceof HTMLElement
        ? liveAnchorElement.getBoundingClientRect()
        : null;
    return resolveMarkerAnchorRect(anchor, {
      liveRect,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
    });
  }

  function getSelectionAnchorRect(): ViewportRect | null {
    return resolveSelectionAnchorViewportRect();
  }

  function handleHover(element: Element | null): void {
    if (element && agentBridge.isElementInteractionLocked(element)) {
      element = null;
    }
    const prevElement = state.hoveredElement;
    state.hoveredElement = element;

    const shouldAnimate = prevElement !== null && element !== null && prevElement !== element;
    state.pendingHoverTransition = shouldAnimate;

    state.positionTracker?.setHoverElement(element);
    state.positionTracker?.forceUpdate();
    if (prevElement !== element) options.onHoverChange?.();
  }

  function closeAnnotationBridgeSelection(nextTarget: Element | null): void {
    const selection = state.annotationBridgeSelection;
    if (!selection) return;
    if (
      nextTarget &&
      (
        nextTarget === selection.target ||
        (typeof selection.target.contains === 'function' && selection.target.contains(nextTarget))
      )
    ) {
      return;
    }

    selection.bridge.closeTarget(selection.target);
    state.annotationBridgeSelection = null;
  }

  function selectResolvedElement(
    element: Element,
    modifiers: EventModifiers,
    selectionAnchor?: { clientX: number; clientY: number },
    initialSelectionElement?: Element,
  ): boolean {
    if (!element.isConnected || agentBridge.isElementInteractionLocked(element)) {
      return false;
    }
    if (state.activeTextComment) {
      state.activeTextComment = null;
      state.canvasOverlay?.setTextHighlightRects(null);
      state.textCommentManager?.clearActiveHighlight();
      if (state.textCommentTargetElement) {
        delete state.textCommentTargetElement.dataset.weTextCommentId;
      }
      state.breadcrumbs?.setAnchorRect(null);
    }
    options.changes.rememberSelectionAnchor(element, selectionAnchor);

    state.selectedElement = element;
    state.initialSelectionElement = initialSelectionElement ?? element;
    state.hoveredElement = null;

    state.positionTracker?.setHoverElement(null);
    state.positionTracker?.setSelectionElement(element);
    state.positionTracker?.forceUpdate();

    syncShadowHostMount(element);
    state.breadcrumbs?.setTarget(element);
    state.propertyPanel?.setTarget(element);
    state.handlesController?.setTarget(element);
    state.parentSelectController?.setTarget(element);
    options.onStatusChange?.();
    options.onSelectionChange?.();

    const modInfo = modifiers.alt ? ' (Alt: drill-up)' : '';
    console.log(`${options.logPrefix} Selected${modInfo}:`, element.tagName, element);
    return true;
  }

  function activatePageTarget(
    element: Element,
    selectionAnchor?: { clientX: number; clientY: number },
  ): boolean {
    if (!element.isConnected || agentBridge.isElementInteractionLocked(element)) return false;
    closeAnnotationBridgeSelection(element);
    return selectResolvedElement(element, DEFAULT_MODIFIERS, selectionAnchor);
  }

  async function handleSelect(
    element: Element,
    modifiers: EventModifiers,
    selectionAnchor?: { clientX: number; clientY: number },
    initialSelectionElement?: Element,
  ): Promise<void> {
    if (agentBridge.isElementInteractionLocked(element)) {
      return;
    }

    if (isAnnotationMarkerElement(element)) {
      const bridgeSelection = await openAnnotationMarkerCommentTarget(element);
      if (!bridgeSelection) return;
      closeAnnotationBridgeSelection(bridgeSelection.target);
      state.annotationBridgeSelection = bridgeSelection;
      selectResolvedElement(
        bridgeSelection.target,
        modifiers,
        undefined,
        initialSelectionElement,
      );
      return;
    }

    closeAnnotationBridgeSelection(element);
    selectResolvedElement(element, modifiers, selectionAnchor, initialSelectionElement);
  }

  function handleDeselect(): void {
    closeAnnotationBridgeSelection(null);

    if (!state.selectedElement && state.activeTextComment) {
      options.changes.clearPendingSelectionAnchor();
      state.selectionAnchor = null;
      state.activeTextComment = null;
      state.canvasOverlay?.setTextHighlightRects(null);
      state.textCommentManager?.clearActiveHighlight();
      if (state.textCommentTargetElement) {
        delete state.textCommentTargetElement.dataset.weTextCommentId;
      }
      state.positionTracker?.setSelectionElement(null);
      state.positionTracker?.forceUpdate();
      state.breadcrumbs?.setTarget(null);
      state.breadcrumbs?.setAnchorRect(null);
      state.propertyPanel?.setTarget(null);
      state.propertyPanel?.refresh();
      state.handlesController?.setTarget(null);
      state.parentSelectController?.setTarget(null);
      options.onStatusChange?.();
      options.onSelectionChange?.();

      console.log(`${options.logPrefix} Deselected`);
      return;
    }

    state.selectedElement = null;
    state.initialSelectionElement = null;
    options.changes.clearPendingSelectionAnchor();

    state.positionTracker?.setSelectionElement(null);
    state.positionTracker?.forceUpdate();

    syncShadowHostMount(null);
    state.breadcrumbs?.setTarget(null);
    state.propertyPanel?.setTarget(null);
    state.handlesController?.setTarget(null);
    state.parentSelectController?.setTarget(null);
    options.onStatusChange?.();
    options.onSelectionChange?.();

    console.log(`${options.logPrefix} Deselected`);
  }

  function handlePositionUpdate(rects: TrackedRects): void {
    const selectionAnchorRect = getSelectionAnchorRect();
    const textCommentActive = Boolean(state.activeTextComment);
    state.breadcrumbs?.setAnchorRect(
      textCommentActive ? selectionAnchorRect : (rects.selection ?? selectionAnchorRect),
    );

    const animateHover = state.pendingHoverTransition;
    state.pendingHoverTransition = false;

    if (!state.canvasOverlay) return;

    const suppressHover =
      !!state.selectedElement && state.hoveredElement === state.selectedElement;
    const hideChrome = !state.selectionChromeVisible;
    const hoverRect = hideChrome ? null : suppressHover ? null : rects.hover;
    const selectionRect = hideChrome || textCommentActive ? null : rects.selection;
    const selectionLocked = agentBridge.isElementInteractionLocked(state.selectedElement);
    const inlineTextEditing = Boolean(state.inlineTextEditingActive);
    const selectionEffect =
      !hideChrome && !!selectionRect
        ? inlineTextEditing
          ? 'inline-editing'
          : selectionLocked
            ? 'ai-editing'
            : 'default'
        : 'default';
    const handlesRect =
      hideChrome || state.commentEntryMode === 'bubble-card' || selectionLocked || inlineTextEditing
        ? null
        : rects.selection;
    state.canvasOverlay.setHoverRect(hoverRect, { animate: animateHover });
    state.canvasOverlay.setSelectionEffect(selectionEffect);
    state.canvasOverlay.setSelectionRect(selectionRect);
    state.canvasOverlay.setEditingRects(null);
    state.handlesController?.setSelectionRect(handlesRect);
    state.parentSelectController?.setSelectionRect(selectionRect);
    options.changes.renderChangeMarkers();
    state.canvasOverlay.render();
  }

  function handleTransactionChange(event: import('../transaction-manager').TransactionChangeEvent): void {
    const { action, undoCount, redoCount } = event;
    console.log(
      `${options.logPrefix} Transaction: ${action} (undo: ${undoCount}, redo: ${redoCount})`,
    );

    options.changes.syncEditMetaWithTransactions();
    state.propertyPanel?.setHistory(undoCount, redoCount);
    state.breadcrumbs?.refresh();

    if (action === 'undo' || action === 'redo' || action === 'restore') {
      state.propertyPanel?.refresh();
    }

    state.positionTracker?.forceUpdate(true);
    options.persistence.scheduleWrite();
    options.onStatusChange?.();
  }

  function enterCommentInput(mode: CommentEntryMode = 'bubble-card'): void {
    state.commentEntryMode = mode;
    state.propertyPanel?.enterCommentInput?.(mode);
  }

  function enterCommentFromTrigger(
    selectionAnchor?: { clientX: number; clientY: number },
  ): boolean {
    const selected = state.selectedElement;
    let target = selected && selected.isConnected ? selected : null;

    if (!target && selectionAnchor) {
      target =
        state.selectionEngine?.findBestTarget(
          selectionAnchor.clientX,
          selectionAnchor.clientY,
          DEFAULT_MODIFIERS,
        ) ?? null;
    }

    target = agentBridge.resolveSelectableElement(target);

    if (!target || !target.isConnected) return false;

    if (state.selectedElement !== target) {
      void handleSelect(target, DEFAULT_MODIFIERS, selectionAnchor);
    }

    enterCommentInput('bubble-card');
    return true;
  }

  function clearSelection(): void {
    const hadElementSelection = Boolean(state.selectedElement);
    const hadTextCommentSelection = Boolean(state.activeTextComment);
    if (!hadElementSelection && !hadTextCommentSelection && !state.selectionAnchor) return;

    const clearIdleTextCommentMeta = () => {
      if (
        typeof options.changes.getMetaForElement !== 'function' ||
        typeof options.changes.normalizeNote !== 'function' ||
        typeof options.changes.setNoteForElement !== 'function'
      ) {
        return;
      }
      const textCommentTarget = state.textCommentTargetElement ?? null;
      const textCommentMeta = options.changes.getMetaForElement(textCommentTarget);
      const hasCommittedTextCommentContent = Boolean(
        textCommentMeta &&
        (
          options.changes.normalizeNote(textCommentMeta.note).trim() ||
          textCommentMeta.images.length > 0 ||
          textCommentMeta.changeKinds.length > 0
        )
      );
      if (textCommentTarget && !hasCommittedTextCommentContent) {
        options.changes.setNoteForElement(textCommentTarget, '');
      }
    };

    if (state.eventController) {
      state.eventController.setMode('hover');
      if (state.selectedElement) {
        handleDeselect();
      } else {
        clearIdleTextCommentMeta();
        options.changes.clearPendingSelectionAnchor();
        state.selectionAnchor = null;
        state.activeTextComment = null;
        state.canvasOverlay?.setTextHighlightRects(null);
        state.textCommentManager?.clearActiveHighlight();
        if (state.textCommentTargetElement) {
          delete state.textCommentTargetElement.dataset.weTextCommentId;
        }
        syncShadowHostMount(null);
        state.breadcrumbs?.setTarget(null);
        state.breadcrumbs?.setAnchorRect(null);
        state.propertyPanel?.setTarget(null);
        state.propertyPanel?.refresh();
        state.handlesController?.setTarget(null);
        state.parentSelectController?.setTarget(null);
        options.onStatusChange?.();
      }
    } else {
      if (state.selectedElement) {
        handleDeselect();
      } else {
        clearIdleTextCommentMeta();
        options.changes.clearPendingSelectionAnchor();
        state.selectionAnchor = null;
        state.activeTextComment = null;
        state.canvasOverlay?.setTextHighlightRects(null);
        state.textCommentManager?.clearActiveHighlight();
        if (state.textCommentTargetElement) {
          delete state.textCommentTargetElement.dataset.weTextCommentId;
        }
        syncShadowHostMount(null);
        state.breadcrumbs?.setTarget(null);
        state.breadcrumbs?.setAnchorRect(null);
        state.propertyPanel?.setTarget(null);
        state.propertyPanel?.refresh();
        state.handlesController?.setTarget(null);
        state.parentSelectController?.setTarget(null);
        options.onStatusChange?.();
      }
    }

    console.log(`${options.logPrefix} Selection cleared`);
  }

  async function revertElement(
    elementKey: WebEditorElementKey,
  ): Promise<WebEditorRevertElementResponse> {
    const key = String(elementKey ?? '').trim();
    if (!key) {
      return { success: false, error: 'elementKey is required' };
    }

    const tm = state.transactionManager;
    if (!tm) {
      return { success: false, error: 'Transaction manager not ready' };
    }

    try {
      const undoStack = filterUnprocessedTransactions(state, tm.getUndoStack());
      const summaries = aggregateTransactionsByElement(undoStack);
      const summary = summaries.find((item) => item.elementKey === key);

      if (!summary) {
        return { success: false, error: 'Element not found in current changes' };
      }

      const element = locateElement(summary.locator);
      if (!element || !element.isConnected) {
        return { success: false, error: 'Failed to locate element for revert' };
      }

      const reverted: NonNullable<WebEditorRevertElementResponse['reverted']> = {};
      let didRevert = false;

      const classChanges = summary.netEffect.classChanges;
      if (classChanges) {
        const baselineClasses = Array.isArray(classChanges.before) ? classChanges.before : [];
        const beforeClasses = (() => {
          try {
            const list = (element as HTMLElement).classList;
            if (list && typeof list[Symbol.iterator] === 'function') {
              return Array.from(list).filter(Boolean);
            }
          } catch {
            // Fallback below.
          }

          const raw = element.getAttribute('class') ?? '';
          return raw
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean);
        })();

        const tx = tm.recordClass(element, beforeClasses, baselineClasses);
        if (tx) {
          reverted.class = true;
          didRevert = true;
        }
      }

      const textChange = summary.netEffect.textChange;
      if (textChange) {
        const baselineText = String(textChange.before ?? '');
        const beforeText = element.textContent ?? '';

        if (beforeText !== baselineText) {
          element.textContent = baselineText;
          const tx = tm.recordText(element, beforeText, baselineText);
          if (tx) {
            reverted.text = true;
            didRevert = true;
          }
        }
      }

      const styleChanges = summary.netEffect.styleChanges;
      if (styleChanges) {
        const before = styleChanges.before ?? {};
        const after = styleChanges.after ?? {};
        const properties = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
          .map((prop) => String(prop ?? '').trim())
          .filter(Boolean);

        if (properties.length > 0) {
          const handle = tm.beginMultiStyle(element, properties);
          if (handle) {
            handle.set(before);
            const tx = handle.commit({ merge: false });
            if (tx) {
              reverted.style = true;
              didRevert = true;
            }
          }
        }
      }

      if (!didRevert) {
        return { success: false, error: 'No changes were reverted' };
      }

      state.propertyPanel?.refresh();
      options.onStatusChange?.();
      return { success: true, reverted };
    } catch (error) {
      console.error(`${options.logPrefix} Revert element failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Enter text comment flow: create an editMeta entry from a TextComment
   * and trigger the bubble card UI.
   */
  function enterTextComment(
    comment: TextComment,
    anchor: { clientX: number; clientY: number },
  ): void {
    const elementKey = comment.id as WebEditorElementKey;
    const sourceElement = comment.sourceElement?.isConnected ? comment.sourceElement : null;
    const selectionRect = comment.boundingRect;
    const hasFiniteSelectionRect = (
      Number.isFinite(selectionRect.left) &&
      Number.isFinite(selectionRect.top) &&
      Number.isFinite(selectionRect.width) &&
      Number.isFinite(selectionRect.height)
    );
    const anchorClientX = hasFiniteSelectionRect
      ? selectionRect.left + selectionRect.width / 2
      : anchor.clientX;
    const anchorClientY = hasFiniteSelectionRect
      ? selectionRect.top + selectionRect.height / 2
      : anchor.clientY;
    const sourceRect = (
      sourceElement &&
      'getBoundingClientRect' in sourceElement &&
      typeof sourceElement.getBoundingClientRect === 'function'
    )
      ? sourceElement.getBoundingClientRect()
      : null;
    const offsetX = (
      sourceRect &&
      Number.isFinite(sourceRect.left) &&
      Number.isFinite(sourceRect.width)
    )
      ? anchorClientX - sourceRect.left
      : undefined;
    const offsetY = (
      sourceRect &&
      Number.isFinite(sourceRect.top) &&
      Number.isFinite(sourceRect.height)
    )
      ? anchorClientY - sourceRect.top
      : undefined;

    // Build a synthetic ElementLocator so the rest of the system
    // (persistence, summaries, etc.) can reference this comment
    const locator: ElementLocator = sourceElement
      ? createElementLocator(sourceElement)
      : {
          selectors: [],
          fingerprint: comment.selectedText.slice(0, 80),
          path: [],
        };

    // Build a label from the selected text (first 30 chars)
    const label = formatTextCommentLabel(comment.selectedText);

    // Create/get editMeta
    const meta = options.changes.getOrCreateEditMeta(elementKey, locator, label);

    // Anchor to the selected text rect itself instead of the mouse-up point.
    const markerAnchor = createMarkerAnchor({
      clientX: anchorClientX,
      clientY: anchorClientY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      isFixed: false,
      offsetX,
      offsetY,
    });

    // Since text comments don't have a real target element,
    // we keep DOM selection empty and use a synthetic target node for UI plumbing.
    state.selectedElement = null;
    state.initialSelectionElement = null;
    state.selectionAnchor = markerAnchor;
    state.hoveredElement = null;
    state.activeTextComment = comment;
    state.positionTracker?.setHoverElement(null);
    state.positionTracker?.setSelectionElement(sourceElement);
    meta.anchor = markerAnchor;
    syncShadowHostMount(sourceElement);

    const textCommentTargetElement = state.textCommentTargetElement;
    if (textCommentTargetElement) {
      textCommentTargetElement.dataset.weTextCommentId = comment.id;
      textCommentTargetElement.style.left = `${Math.round(anchorClientX)}px`;
      textCommentTargetElement.style.top = `${Math.round(anchorClientY)}px`;
      state.breadcrumbs?.setTarget(null);
      state.propertyPanel?.setTarget(null);
      state.breadcrumbs?.setTarget(textCommentTargetElement);
      state.propertyPanel?.setTarget(textCommentTargetElement);
    } else {
      state.breadcrumbs?.setTarget(null);
      state.propertyPanel?.setTarget(null);
    }
    state.breadcrumbs?.setAnchorRect(comment.boundingRect);
    state.handlesController?.setTarget(null);
    state.parentSelectController?.setTarget(null);

    // Enter bubble card mode
    enterCommentInput('bubble-card');
    state.propertyPanel?.refresh();

    options.onStatusChange?.();
    console.log(`${options.logPrefix} Text comment:`, comment.selectedText.slice(0, 50));
  }

  return {
    handleHover,
    activatePageTarget,
    handleSelect,
    handleDeselect,
    handlePositionUpdate,
    handleTransactionChange,
    enterCommentInput,
    enterCommentFromTrigger,
    enterTextComment,
    clearSelection,
    revertElement,
  };
}
