import { WEB_EDITOR_POPUP_ROOT_ATTR } from './theme';

const SELECTION_LOCK_ROOT_SELECTOR = '[data-we-selection-lock-root="true"]';
const POPUP_ROOT_SELECTOR = `[${WEB_EDITOR_POPUP_ROOT_ATTR}="true"]`;
const SHADOW_HOST_SELECTOR = '[data-mcp-web-editor]';

function isDomElement(value: unknown): value is HTMLElement {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { nodeType?: unknown }).nodeType === 1
      && typeof (value as { appendChild?: unknown }).appendChild === 'function',
  );
}

function queryPopupRoot(node: unknown): HTMLElement | null {
  if (
    !node
    || typeof node !== 'object'
    || typeof (node as { querySelector?: unknown }).querySelector !== 'function'
  ) {
    return null;
  }

  const popupRoot = (node as ParentNode).querySelector(POPUP_ROOT_SELECTOR) as unknown;
  // The extension UI can be observed through more than one DOM realm. An
  // element from the page realm is not guaranteed to pass this realm's
  // `instanceof HTMLElement` check, even though it is a valid container.
  return isDomElement(popupRoot) ? popupRoot : null;
}

function queryIsolatedPopupRoot(ownerDocument: Document): HTMLElement | null {
  if (typeof ownerDocument.querySelectorAll !== 'function') {
    return null;
  }

  for (const host of Array.from(ownerDocument.querySelectorAll(SHADOW_HOST_SELECTOR))) {
    const shadowRoot = (host as HTMLElement).shadowRoot;
    const popupRoot = queryPopupRoot(shadowRoot);
    if (popupRoot) return popupRoot;
    const fallbackRoot = shadowRoot?.firstElementChild;
    if (isDomElement(fallbackRoot)) return fallbackRoot;
  }

  return null;
}

function isShadowRootNode(node: unknown): node is ShadowRoot {
  return Boolean(
    node
      && typeof node === 'object'
      && (node as { nodeType?: unknown }).nodeType === 11
      && 'host' in node,
  );
}

export function resolveRuntimePopupContainer(trigger?: HTMLElement): HTMLElement {
  const ownerDocument =
    trigger?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);

  if (!ownerDocument) {
    if (trigger) return trigger;
    throw new Error('No isolated popup container available');
  }

  if (!trigger) {
    const isolatedPopupRoot = queryIsolatedPopupRoot(ownerDocument);
    if (isolatedPopupRoot) return isolatedPopupRoot;
    if (typeof ownerDocument.createElement === 'function') {
      return ownerDocument.createElement('div');
    }
    throw new Error('No isolated popup container available');
  }

  const rootNode = typeof trigger.getRootNode === 'function' ? trigger.getRootNode() : null;
  const popupRoot = (trigger.closest(POPUP_ROOT_SELECTOR) as unknown as HTMLElement | null)
    ?? queryPopupRoot(rootNode)
    // Never borrow a popup root from the host document when the trigger lives
    // in a ShadowRoot. That would re-enter the page CSS cascade.
    ?? (isShadowRootNode(rootNode) ? null : queryPopupRoot(ownerDocument));

  if (popupRoot) {
    return popupRoot;
  }

  // A missing popup ref is a transient render state. Keep the fallback in
  // the trigger's ShadowRoot instead of leaking a page-level popup into body.
  if (isShadowRootNode(rootNode)) {
    return (trigger.parentElement ?? trigger) as HTMLElement;
  }

  const isolatedPopupRoot = queryIsolatedPopupRoot(ownerDocument);
  if (isolatedPopupRoot) return isolatedPopupRoot;

  const localContainer = trigger.closest(SELECTION_LOCK_ROOT_SELECTOR)
    ?? trigger.parentElement;
  if (localContainer) return localContainer as HTMLElement;

  // This path is only a pre-mount/transient fallback. Keep the container
  // detached instead of allowing an accidental page-level body portal.
  if (typeof ownerDocument.createElement === 'function') {
    return ownerDocument.createElement('div');
  }

  return trigger;
}

export function resolveRuntimePopupContainerFromTrigger(
  trigger: HTMLElement | undefined,
  fallbackContainer: HTMLElement,
): HTMLElement {
  if (trigger) {
    return resolveRuntimePopupContainer(trigger);
  }

  const rootNode = typeof fallbackContainer.getRootNode === 'function'
    ? fallbackContainer.getRootNode()
    : null;
  return (
    queryPopupRoot(fallbackContainer)
    ?? queryPopupRoot(rootNode)
    // Keep ConfigProvider's trigger-less fallback inside its own shadow tree.
    ?? (isShadowRootNode(rootNode) ? null : queryPopupRoot(fallbackContainer.ownerDocument))
    ?? fallbackContainer
  );
}
