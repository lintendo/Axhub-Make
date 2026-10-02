import type { EventModifiers } from '../event-controller';
import type { EditorTextSessionService } from './contracts';
import type { EditorRuntimeState } from './state';
import { DEFAULT_MODIFIERS } from './state';
import {
  normalizeEditableText,
  normalizeEditableTextFragment,
  readEditableText,
  writeEditableText,
} from '../text-content';
import {
  isEditableTextFragmentElement,
  resolveEditableTextFragmentAtPoint,
} from '../text-fragment';

export function normalizeTextForEditorInput(value: string): string {
  return normalizeEditableText(value);
}

function normalizeTextForTarget(element: Element, value: string): string {
  return isEditableTextFragmentElement(element)
    ? normalizeEditableTextFragment(value)
    : normalizeTextForEditorInput(value);
}

function hasOnlyTextBreakChildren(element: HTMLElement): boolean {
  // A manual line break is text presentation, not nested content. Titles in
  // generated cards commonly use this exact shape: `text<br>text`.
  return Array.from(element.children).every((child) => child.tagName === 'BR');
}

const NON_TEXT_LEAF_TAG_NAMES = new Set([
  'AUDIO',
  'CANVAS',
  'EMBED',
  'HR',
  'IFRAME',
  'IMG',
  'OBJECT',
  'PICTURE',
  'SOURCE',
  'TRACK',
  'VIDEO',
  'WBR',
]);

export function isEditableTextTarget(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLInputElement) return false;
  if (element instanceof HTMLTextAreaElement) return false;
  if (NON_TEXT_LEAF_TAG_NAMES.has(element.tagName)) return false;
  if (element.childElementCount > 0 && !hasOnlyTextBreakChildren(element)) return false;
  if (
    !(element.textContent ?? '').trim()
    && (element.tagName === 'I'
      || element.getAttribute('aria-hidden') === 'true'
      || element.getAttribute('role') === 'img')
  ) {
    return false;
  }
  return true;
}

function getComposedParentElement(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;

  const rootNode: Node | null =
    typeof element.getRootNode === 'function' ? element.getRootNode() : null;
  if (
    typeof ShadowRoot !== 'undefined'
    && rootNode instanceof ShadowRoot
    && rootNode.host instanceof Element
  ) {
    return rootNode.host;
  }
  return null;
}

export function isElementWithinComposedSubtree(
  element: Element | null,
  ancestor: Element | null,
): boolean {
  if (!element || !ancestor) return false;

  let current: Element | null = element;
  while (current) {
    if (current === ancestor) return true;
    current = getComposedParentElement(current);
  }
  return false;
}

export function resolveInlineTextTarget(
  selectionTarget: Element | null,
  pathElements: readonly Element[],
  isEditable: (element: Element | null) => element is HTMLElement = isEditableTextTarget,
): HTMLElement | null {
  if (!selectionTarget?.isConnected) return null;

  for (const element of pathElements) {
    if (!element.isConnected) continue;
    if (!isElementWithinComposedSubtree(element, selectionTarget)) continue;
    if (isEditable(element)) return element;
    if (element === selectionTarget) return null;
  }

  return isEditable(selectionTarget) ? selectionTarget : null;
}

export function resolveInlineTextFragmentTargetAtPoint(
  selectionTarget: Element | null,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  if (!selectionTarget?.isConnected) return null;
  return resolveEditableTextFragmentAtPoint(selectionTarget, clientX, clientY);
}

export function createTextSessionService(options: {
  state: EditorRuntimeState;
  ensureSelected: (element: Element, modifiers: EventModifiers) => void;
  logPrefix: string;
}): EditorTextSessionService {
  const { state } = options;

  function commitText(element: Element, value: string, previousValue?: string): boolean {
    if (!isEditableTextTarget(element) || !element.isConnected) return false;

    const liveBeforeText = readEditableText(element);
    const beforeText = previousValue ?? liveBeforeText;
    const normalizedBefore = normalizeTextForTarget(element, beforeText);
    const nextText = normalizeTextForTarget(element, value);

    const selectedElement = state.selectedElement;
    const selectionOwnsTextTarget =
      Boolean(selectedElement?.isConnected)
      && isElementWithinComposedSubtree(element, selectedElement);
    if (!selectionOwnsTextTarget) {
      options.ensureSelected(element, DEFAULT_MODIFIERS as EventModifiers);
    }

    if (normalizedBefore === nextText) {
      return false;
    }

    if (liveBeforeText !== nextText || (nextText === '' && element.childElementCount > 0)) {
      writeEditableText(element, nextText);
    }
    state.transactionManager?.recordText(element, normalizedBefore, nextText);
    state.positionTracker?.forceUpdate(true);

    if (state.selectedElement === element) {
      state.breadcrumbs?.setTarget(element);
      state.propertyPanel?.refresh();
    }

    console.log(`${options.logPrefix} Text edit committed`);
    return true;
  }

  return {
    isEditable: isEditableTextTarget,
    normalizeText: normalizeTextForEditorInput,
    getText(element: Element | null): string {
      if (!isEditableTextTarget(element)) return '';
      return readEditableText(element);
    },
    commitText,
  };
}
