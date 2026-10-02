import type { ElementLocator, WebEditorElementKey } from '../../web-editor-types';
import { createElementLocator, locatorKey } from '../locator';

export const ANNOTATION_MARKER_NODE_ID_ATTR = 'data-axhub-annotation-node-id';
export const ANNOTATION_HOST_ID = '__axhub_annotation_host__';
export const ANNOTATION_PANEL_TARGET_ATTR = 'data-axhub-annotation-panel-target';
export const ANNOTATION_PANEL_NODE_ID_ATTR = 'data-axhub-annotation-panel-node-id';
export const ANNOTATION_SOURCE_KEY = '__AXHUB_ANNOTATION_SOURCE__';
export const ANNOTATION_SOURCE_DOCUMENT_KEY = '__AXHUB_ANNOTATION_SOURCE_DOCUMENT__';

export interface AnnotationElementIdentity {
  elementKey: WebEditorElementKey;
  locator: ElementLocator;
  label: string;
  nodeId: string;
}

export type AnnotationSourceNode = {
  id: string;
  locator: ElementLocator | null;
  raw: Record<string, unknown>;
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isElementLocator(value: unknown): value is ElementLocator {
  if (!isPlainObject(value)) return false;
  return Array.isArray(value.selectors)
    && value.selectors.every((selector) => typeof selector === 'string')
    && typeof value.fingerprint === 'string'
    && Array.isArray(value.path);
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

function readElementAttribute(element: Element | null | undefined, attr: string): string {
  try {
    return normalizeText(element?.getAttribute?.(attr));
  } catch {
    return '';
  }
}

function readClosestElementAttribute(element: Element | null | undefined, attr: string): string {
  const direct = readElementAttribute(element, attr);
  if (direct) return direct;
  try {
    const closest = element?.closest?.(`[${attr}]`) ?? null;
    return readElementAttribute(closest, attr);
  } catch {
    return '';
  }
}

function getWindowRecord(): Record<string, unknown> | null {
  return typeof window === 'undefined' ? null : (window as unknown as Record<string, unknown>);
}

function readSourceNodesFromCandidate(candidate: unknown): AnnotationSourceNode[] {
  if (!isPlainObject(candidate) || !Array.isArray(candidate.nodes)) return [];
  return candidate.nodes
    .map((node): AnnotationSourceNode | null => {
      if (!isPlainObject(node)) return null;
      const id = normalizeText(node.id);
      if (!id) return null;
      return {
        id,
        locator: isElementLocator(node.locator) ? node.locator : null,
        raw: node,
      };
    })
    .filter((node): node is AnnotationSourceNode => Boolean(node));
}

export function readAnnotationSourceNodes(): AnnotationSourceNode[] {
  const record = getWindowRecord();
  if (!record) return [];

  const directNodes = readSourceNodesFromCandidate(record[ANNOTATION_SOURCE_KEY]);
  const documentValue = record[ANNOTATION_SOURCE_DOCUMENT_KEY];
  const documentNodes = isPlainObject(documentValue)
    ? readSourceNodesFromCandidate(documentValue.data)
    : [];

  const byId = new Map<string, AnnotationSourceNode>();
  for (const node of [...directNodes, ...documentNodes]) {
    if (!byId.has(node.id) || !byId.get(node.id)?.locator) {
      byId.set(node.id, node);
    }
  }
  return Array.from(byId.values());
}

export function collectAnnotationSourceNodeIdsFromWindow(): Set<string> | null {
  const nodes = readAnnotationSourceNodes();
  if (nodes.length === 0) return null;
  return new Set(nodes.map((node) => node.id));
}

export function extractAnnotationPanelNodeId(locator: ElementLocator | null | undefined): string {
  for (const selector of locator?.selectors ?? []) {
    const normalized = normalizeText(selector);
    if (!normalized) continue;
    const match = normalized.match(/\[data-axhub-annotation-panel-node-id=(?:"([^"]+)"|'([^']+)'|([^\]]+))\]/);
    const nodeId = normalizeText(match?.[1] ?? match?.[2] ?? match?.[3]);
    if (nodeId) return nodeId;
  }
  return '';
}

function locatorsMatch(left: ElementLocator, right: ElementLocator): boolean {
  if (left === right) return true;

  try {
    if (locatorKey(left) && locatorKey(left) === locatorKey(right)) return true;
  } catch {
    // Ignore malformed locators and continue with structural comparison.
  }

  const leftSelectors = (left.selectors ?? []).map(normalizeText).filter(Boolean);
  const rightSelectors = (right.selectors ?? []).map(normalizeText).filter(Boolean);
  if (
    leftSelectors.length > 0
    && rightSelectors.length > 0
    && leftSelectors.length === rightSelectors.length
    && leftSelectors.every((selector, index) => selector === rightSelectors[index])
  ) {
    return true;
  }

  const leftFingerprint = normalizeText(left.fingerprint);
  const rightFingerprint = normalizeText(right.fingerprint);
  const leftPath = (left.path ?? []).map(normalizeText).join('>');
  const rightPath = (right.path ?? []).map(normalizeText).join('>');
  return Boolean(
    leftFingerprint
    && leftFingerprint === rightFingerprint
    && leftPath
    && leftPath === rightPath,
  );
}

export function resolveAnnotationNodeIdFromLocator(
  locator: ElementLocator | null | undefined,
): string {
  if (!locator) return '';

  const panelNodeId = extractAnnotationPanelNodeId(locator);
  if (panelNodeId) return panelNodeId;

  for (const node of readAnnotationSourceNodes()) {
    if (node.locator && locatorsMatch(locator, node.locator)) {
      return node.id;
    }
  }
  return '';
}

export function readAnnotationPanelNodeId(element: Element | null | undefined): string {
  const panelNodeId = readClosestElementAttribute(element, ANNOTATION_PANEL_NODE_ID_ATTR);
  if (panelNodeId) return panelNodeId;

  return readClosestElementAttribute(element, ANNOTATION_MARKER_NODE_ID_ATTR);
}

function readActiveAnnotationPanelNodeId(): string {
  if (typeof document === 'undefined') return '';

  const selector = `[${ANNOTATION_PANEL_TARGET_ATTR}="true"][${ANNOTATION_PANEL_NODE_ID_ATTR}]`;
  try {
    const host = typeof document.getElementById === 'function'
      ? document.getElementById(ANNOTATION_HOST_ID)
      : null;
    const shadowRoot = (host as (Element & { shadowRoot?: ShadowRoot | null }) | null)?.shadowRoot ?? null;
    const shadowPanel = shadowRoot?.querySelector(selector) ?? null;
    const shadowNodeId = readElementAttribute(shadowPanel, ANNOTATION_PANEL_NODE_ID_ATTR);
    if (shadowNodeId) return shadowNodeId;

    const documentPanel = typeof document.querySelector === 'function'
      ? document.querySelector(selector)
      : null;
    return readElementAttribute(documentPanel, ANNOTATION_PANEL_NODE_ID_ATTR);
  } catch {
    return '';
  }
}

export function buildAnnotationPanelLocator(nodeId: string): ElementLocator {
  const normalizedNodeId = normalizeText(nodeId);
  return {
    selectors: [`[${ANNOTATION_PANEL_NODE_ID_ATTR}="${cssEscape(normalizedNodeId)}"]`],
    fingerprint: `annotation-panel:${normalizedNodeId}`,
    path: [],
    shadowHostChain: [],
  };
}

export function buildAnnotationPanelElementKey(nodeId: string): WebEditorElementKey {
  return `annotation-panel:${normalizeText(nodeId)}` as WebEditorElementKey;
}

export function resolveAnnotationElementIdentity(
  element: Element | null | undefined,
): AnnotationElementIdentity | null {
  if (!element) return null;

  const directNodeId = readAnnotationPanelNodeId(element);
  if (directNodeId) {
    return {
      elementKey: buildAnnotationPanelElementKey(directNodeId),
      locator: buildAnnotationPanelLocator(directNodeId),
      label: 'Annotation Panel',
      nodeId: directNodeId,
    };
  }

  const locator = createElementLocator(element);
  const sourceNodes = readAnnotationSourceNodes();
  const activePanelNodeId = readActiveAnnotationPanelNodeId();
  const activePanelNode = sourceNodes.find((node) => node.id === activePanelNodeId);
  const nodeId = activePanelNode?.locator && locatorsMatch(locator, activePanelNode.locator)
    ? activePanelNode.id
    : resolveAnnotationNodeIdFromLocator(locator);
  if (!nodeId) return null;

  return {
    elementKey: buildAnnotationPanelElementKey(nodeId),
    locator: buildAnnotationPanelLocator(nodeId),
    label: 'Annotation Panel',
    nodeId,
  };
}

export function resolveAnnotationTargetIdentity(
  target: {
    elementKey?: string | null;
    locator?: ElementLocator | null;
    label?: string | null;
  } | null | undefined,
): AnnotationElementIdentity | null {
  const locator = target?.locator ?? null;
  const nodeIdFromLocator = resolveAnnotationNodeIdFromLocator(locator);
  const nodeIdFromKey = normalizeText(target?.elementKey).startsWith('annotation-panel:')
    ? normalizeText(target?.elementKey).replace(/^annotation-panel:/, '')
    : '';
  const nodeId = nodeIdFromLocator || nodeIdFromKey;
  if (!nodeId) return null;
  return {
    elementKey: buildAnnotationPanelElementKey(nodeId),
    locator: buildAnnotationPanelLocator(nodeId),
    label: normalizeText(target?.label) || 'Annotation Panel',
    nodeId,
  };
}

export function findAnnotationMarkerByNodeId(nodeId: string): Element | null {
  const normalizedNodeId = normalizeText(nodeId);
  if (!normalizedNodeId || typeof document === 'undefined') {
    return null;
  }
  const selector = `[${ANNOTATION_MARKER_NODE_ID_ATTR}="${cssEscape(normalizedNodeId)}"]`;
  try {
    const host = typeof document.getElementById === 'function'
      ? document.getElementById(ANNOTATION_HOST_ID)
      : null;
    const shadowRoot = (host as (Element & { shadowRoot?: ShadowRoot | null }) | null)?.shadowRoot ?? null;
    const shadowMarker = shadowRoot?.querySelector(selector) ?? null;
    if (shadowMarker) return shadowMarker;
    return typeof document.querySelector === 'function' ? document.querySelector(selector) : null;
  } catch {
    return null;
  }
}
