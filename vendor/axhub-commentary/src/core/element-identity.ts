import type { ElementLocator, WebEditorElementKey } from '../web-editor-types';
import { generateStableElementKey } from './element-key';
import { locateElement } from './locator';

export interface CommentaryElementIdentity {
  element: Element;
  elementKey: WebEditorElementKey;
}

/** Resolve persisted node metadata to the current page-lifecycle identity. */
export function resolveCommentaryElementIdentity(
  locator: ElementLocator,
  rootDocument?: Document,
): CommentaryElementIdentity | null {
  try {
    const element = rootDocument
      ? locateElement(locator, rootDocument)
      : locateElement(locator);
    if (!element?.isConnected) return null;
    return {
      element,
      elementKey: generateStableElementKey(element, locator.shadowHostChain),
    };
  } catch {
    return null;
  }
}
