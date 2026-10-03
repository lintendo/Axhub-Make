const AXHUB_ANNOTATION_HOST_ID = '__axhub_annotation_host__';
const AXHUB_ANNOTATION_SHELL_IDS = new Set([
  AXHUB_ANNOTATION_HOST_ID,
  '__axhub_annotation_overlay__',
  '__axhub_annotation_ui__',
]);
const AXHUB_ANNOTATION_COMMENT_TARGET_ATTR = 'data-axhub-annotation-comment-target';
export const AXHUB_ANNOTATION_DIRECT_ACTION_ATTR = 'data-axhub-annotation-direct-action';

type ShadowHitRoot = {
  elementsFromPoint?: (x: number, y: number) => Element[];
  elementFromPoint?: (x: number, y: number) => Element | null;
  querySelectorAll?: (selector: string) => ArrayLike<Element> | Iterable<Element>;
};

function isFinitePoint(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

function getAnnotationShadowRoot(): ShadowHitRoot | null {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
    return null;
  }

  const host = document.getElementById(AXHUB_ANNOTATION_HOST_ID);
  const shadowRoot = (host as (Element & { shadowRoot?: ShadowHitRoot | null }) | null)?.shadowRoot;
  if (!shadowRoot || typeof shadowRoot !== 'object') return null;

  return shadowRoot;
}

function isAnnotationShellElement(element: Element): boolean {
  const id = (element as Element & { id?: unknown }).id;
  return typeof id === 'string' && AXHUB_ANNOTATION_SHELL_IDS.has(id);
}

function isPointerPassthroughElement(element: Element): boolean {
  try {
    return window.getComputedStyle(element).pointerEvents === 'none';
  } catch {
    return false;
  }
}

function getAttributeValue(element: Element, name: string): string {
  try {
    return element.getAttribute(name) ?? '';
  } catch {
    return '';
  }
}

function readRect(element: Element): DOMRectReadOnly | null {
  try {
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    return rect;
  } catch {
    return null;
  }
}

function isNearFullViewportElement(element: Element): boolean {
  const rect = readRect(element);
  if (!rect) return false;

  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 1);
  const viewportArea = viewportWidth * viewportHeight;
  const area = rect.width * rect.height;
  if (!Number.isFinite(area) || area <= 0) return false;

  return area / viewportArea > 0.85
    && rect.width >= viewportWidth * 0.9
    && rect.height >= viewportHeight * 0.9;
}

function isAnnotationCommentTarget(element: Element): boolean {
  return getAttributeValue(element, AXHUB_ANNOTATION_COMMENT_TARGET_ATTR) === 'true';
}

export function isAxhubAnnotationDirectActionElement(element: Element): boolean {
  return getAttributeValue(element, AXHUB_ANNOTATION_DIRECT_ACTION_ATTR) === 'true';
}

function closestAxhubAnnotationDirectActionElement(element: Element | null): Element | null {
  let current: Element | null = element;
  while (current) {
    if (isAxhubAnnotationDirectActionElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

export function isAxhubAnnotationDirectActionEvent(event: Event): boolean {
  try {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element && closestAxhubAnnotationDirectActionElement(node)) {
        return true;
      }
    }
  } catch {
    // Fall back to coordinate hit-testing below.
  }

  const point = event as MouseEvent;
  const x = typeof point.clientX === 'number' ? point.clientX : Number.NaN;
  const y = typeof point.clientY === 'number' ? point.clientY : Number.NaN;
  if (!isFinitePoint(x, y)) return false;

  return readAxhubAnnotationShadowHitElementsAtPoint(x, y)
    .some((element) => closestAxhubAnnotationDirectActionElement(element));
}

function resolveAnnotationCommentTarget(element: Element): Element | null {
  let current: Element | null = element;
  while (current) {
    if (isAnnotationCommentTarget(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function uniqueElements(elements: Element[]): Element[] {
  const seen = new Set<Element>();
  const result: Element[] = [];
  for (const element of elements) {
    if (seen.has(element)) continue;
    seen.add(element);
    result.push(element);
  }
  return result;
}

function containsElement(parent: Element, child: Element): boolean {
  if (parent === child) return false;
  try {
    return parent.contains(child);
  } catch {
    return false;
  }
}

function keepDeepestElements(elements: Element[]): Element[] {
  return elements.filter((candidate) => (
    !elements.some((other) => containsElement(candidate, other))
  ));
}

function readShadowElementsFromPoint(shadowRoot: ShadowHitRoot, x: number, y: number): Element[] {
  try {
    if (typeof shadowRoot.elementsFromPoint === 'function') {
      const elements = shadowRoot.elementsFromPoint(x, y);
      return Array.isArray(elements) ? elements : Array.from(elements ?? []);
    }
  } catch {
    // Fall back to elementFromPoint below.
  }

  try {
    if (typeof shadowRoot.elementFromPoint === 'function') {
      const element = shadowRoot.elementFromPoint(x, y);
      return element ? [element] : [];
    }
  } catch {
    // Ignore hit-test failures and let normal page hit-testing continue.
  }

  return [];
}

function containsPoint(element: Element, x: number, y: number): boolean {
  const rect = readRect(element);
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isAnnotationHostTopmostAtPoint(x: number, y: number): boolean {
  if (typeof document.elementFromPoint !== 'function') return true;

  try {
    const host = document.getElementById(AXHUB_ANNOTATION_HOST_ID);
    return Boolean(host && document.elementFromPoint(x, y) === host);
  } catch {
    return false;
  }
}

function readDeclaredShadowTargetsAtPoint(
  shadowRoot: ShadowHitRoot,
  x: number,
  y: number,
): Element[] {
  if (typeof shadowRoot.querySelectorAll !== 'function') return [];
  if (!isAnnotationHostTopmostAtPoint(x, y)) return [];

  try {
    const candidates = shadowRoot.querySelectorAll([
      `[${AXHUB_ANNOTATION_COMMENT_TARGET_ATTR}="true"]`,
      `[${AXHUB_ANNOTATION_DIRECT_ACTION_ATTR}="true"]`,
    ].join(', '));
    return Array.from(candidates).filter(
      (element) => !isPointerPassthroughElement(element) && containsPoint(element, x, y),
    );
  } catch {
    return [];
  }
}

function readAxhubAnnotationShadowHitElementsAtPoint(x: number, y: number): Element[] {
  if (!isFinitePoint(x, y)) return [];

  const shadowRoot = getAnnotationShadowRoot();
  if (!shadowRoot) return [];

  const pointHits = readShadowElementsFromPoint(shadowRoot, x, y).filter(
    (element) => !isAnnotationShellElement(element) && !isPointerPassthroughElement(element),
  );
  if (pointHits.length > 0) return pointHits;

  return readDeclaredShadowTargetsAtPoint(shadowRoot, x, y);
}

export function getAxhubAnnotationShadowHitElementsAtPoint(x: number, y: number): Element[] {
  const hitElements = readAxhubAnnotationShadowHitElementsAtPoint(x, y);
  if (hitElements.length === 0) return [];
  if (hitElements.some((element) => closestAxhubAnnotationDirectActionElement(element))) return [];

  const declaredTargets = uniqueElements(
    hitElements
      .map((element) => resolveAnnotationCommentTarget(element))
      .filter((element): element is Element => Boolean(element)),
  );

  return declaredTargets.length > 0 ? keepDeepestElements(declaredTargets) : hitElements;
}

export function getAxhubAnnotationShadowHitElementAtPoint(x: number, y: number): Element | null {
  const elements = getAxhubAnnotationShadowHitElementsAtPoint(x, y);
  return elements.find((element) => !isNearFullViewportElement(element)) ?? elements[0] ?? null;
}
