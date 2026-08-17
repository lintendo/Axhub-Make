import type { TextFragmentLocator } from '../web-editor-types';

export const EDITABLE_TEXT_FRAGMENT_ATTRIBUTE = 'data-axhub-commentary-text-fragment';

function isNonEmptyTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3 && Boolean(node.textContent?.trim());
}

export function isEditableTextFragmentElement(element: Element | null): element is HTMLElement {
  return (
    typeof HTMLElement !== 'undefined' &&
    element instanceof HTMLElement &&
    element.hasAttribute(EDITABLE_TEXT_FRAGMENT_ATTRIBUTE)
  );
}

export function getEditableTextFragmentLocator(
  element: Element | null,
): { parent: HTMLElement; fragment: TextFragmentLocator } | null {
  if (!isEditableTextFragmentElement(element)) return null;

  const parent = element.parentElement;
  if (!parent) return null;

  const childNodeIndex = Array.prototype.indexOf.call(parent.childNodes, element) as number;
  if (childNodeIndex < 0) return null;

  return {
    parent,
    fragment: { childNodeIndex },
  };
}

export function wrapEditableTextFragment(textNode: Text): HTMLElement | null {
  if (!isNonEmptyTextNode(textNode)) return null;

  const parent = textNode.parentElement;
  if (!(parent instanceof HTMLElement)) return null;

  const wrapper = textNode.ownerDocument.createElement('span');
  wrapper.setAttribute(EDITABLE_TEXT_FRAGMENT_ATTRIBUTE, '');
  parent.replaceChild(wrapper, textNode);
  wrapper.appendChild(textNode);
  return wrapper;
}

export function resolveEditableTextFragment(
  parent: Element,
  fragment: TextFragmentLocator,
): HTMLElement | null {
  const childNodeIndex = Number(fragment.childNodeIndex);
  if (!Number.isSafeInteger(childNodeIndex) || childNodeIndex < 0) return null;

  const child = parent.childNodes.item(childNodeIndex);
  if (!child) return null;

  if (child instanceof HTMLElement && isEditableTextFragmentElement(child)) {
    return child;
  }

  return isNonEmptyTextNode(child) ? wrapEditableTextFragment(child) : null;
}

function resolveCaretNode(document: Document, clientX: number, clientY: number): Node | null {
  const caretPositionFromPoint = (
    document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node | null } | null;
    }
  ).caretPositionFromPoint;
  if (typeof caretPositionFromPoint === 'function') {
    const position = caretPositionFromPoint.call(document, clientX, clientY);
    if (position?.offsetNode) return position.offsetNode;
  }

  const caretRangeFromPoint = (
    document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint;
  if (typeof caretRangeFromPoint === 'function') {
    return caretRangeFromPoint.call(document, clientX, clientY)?.startContainer ?? null;
  }

  return null;
}

export function resolveEditableTextFragmentAtPoint(
  container: Element,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const caretNode = resolveCaretNode(container.ownerDocument, clientX, clientY);
  if (!caretNode || !container.contains(caretNode)) return null;

  if (isNonEmptyTextNode(caretNode)) {
    const parent = caretNode.parentElement;
    if (!(parent instanceof HTMLElement)) return null;

    if (parent.childElementCount === 0) {
      return parent;
    }

    return wrapEditableTextFragment(caretNode);
  }

  if (
    caretNode instanceof HTMLElement &&
    caretNode.childElementCount === 0 &&
    container.contains(caretNode)
  ) {
    return caretNode;
  }

  return null;
}
