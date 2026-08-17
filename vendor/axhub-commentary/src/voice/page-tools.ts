import { WEB_EDITOR_V2_HOST_ID, WEB_EDITOR_V2_OVERLAY_ID } from '../constants';
import { createElementLocator, locateElement } from '../core/locator';
import type {
  CommentaryPageElementSearchQuery,
  CommentaryPageElementStructureQuery,
  CommentaryPageElementSummary,
  CommentaryVoiceTargets,
  ElementLocator,
} from '../web-editor-types';

const MAX_TEXT_LENGTH = 120;
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_STRUCTURE_LIMIT = 30;
const MAX_LIMIT = 100;
const STALE_TARGET_ERROR = '页面已变化，请重新查找';

type PageToolsRoot = ParentNode & { children?: HTMLCollectionOf<Element> | Element[] };

function isPageElement(value: unknown): value is Element {
  return Boolean(value && typeof (value as Element).tagName === 'string');
}

export interface CommentaryVoicePageToolsOptions {
  root?: PageToolsRoot;
  getSelectedElement?: () => Element | null | undefined;
  getHoveredElement?: () => Element | null | undefined;
  createElementLocator?: (element: Element) => ElementLocator;
  locateElement?: (locator: ElementLocator) => Element | null;
}

export interface CommentaryPageElementSearchResult {
  elements: CommentaryPageElementSummary[];
  nextCursor: string | null;
}

export interface CommentaryPageElementStructureResult {
  elements: CommentaryPageElementSummary[];
  nextCursor: string | null;
}

export interface CommentaryVoicePageTools {
  getTargets(): CommentaryVoiceTargets;
  findElements(query: CommentaryPageElementSearchQuery): CommentaryPageElementSearchResult;
  getStructure(query: CommentaryPageElementStructureQuery): CommentaryPageElementStructureResult;
  resolveTarget(targetRef: string): Element;
  summarizeTarget(targetRef: string): CommentaryPageElementSummary;
  invalidate(): void;
  destroy(): void;
}

function createNonce(): string {
  const random = globalThis.crypto?.getRandomValues?.(new Uint32Array(2));
  if (random) return Array.from(random, (value) => value.toString(36)).join('');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function excerpt(value: string): string {
  const normalized = normalizeText(value);
  return normalized.slice(0, MAX_TEXT_LENGTH);
}

function getChildren(element: Element): Element[] {
  return Array.from(element.children ?? []);
}

function getVisibleText(element: Element): string {
  const nodes = Array.from(element.childNodes ?? []);
  if (nodes.length === 0) return String(element.textContent ?? '');

  return nodes
    .map((node) => {
      if (node.nodeType === 3) return node.textContent ?? '';
      if (node.nodeType !== 1) return '';
      const child = node as Element;
      return isIncludedElement(child) ? getVisibleText(child) : '';
    })
    .join('');
}

function getRole(element: Element): string | null {
  const explicitRole = element.getAttribute?.('role')?.trim();
  if (explicitRole) return explicitRole.toLowerCase();

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'button') return 'button';
  if (tagName === 'textarea') return 'textbox';
  if (tagName === 'select') return 'combobox';
  if (tagName === 'img') return 'img';
  if (tagName === 'nav') return 'navigation';
  if (tagName === 'main') return 'main';
  if (tagName === 'a' && element.getAttribute?.('href')) return 'link';
  if (/^h[1-6]$/.test(tagName)) return 'heading';
  if (tagName !== 'input') return null;

  const type = element.getAttribute?.('type')?.toLowerCase() ?? 'text';
  if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit') {
    return type;
  }
  return 'textbox';
}

function isOverlayElement(element: Element): boolean {
  const id = element.getAttribute?.('id') ?? '';
  return (
    id === WEB_EDITOR_V2_HOST_ID ||
    id === WEB_EDITOR_V2_OVERLAY_ID ||
    id.startsWith('__mcp_web_editor_v2_') ||
    element.getAttribute?.('data-axhub-commentary-overlay') === 'true'
  );
}

function isIncludedElement(element: Element): boolean {
  if (!element.isConnected) return false;
  if (isOverlayElement(element)) return false;
  if ((element as HTMLElement).hidden || element.getAttribute?.('hidden') !== null) return false;
  if (element.getAttribute?.('aria-hidden') === 'true') return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'script' || tagName === 'style') return false;

  const computedStyle = globalThis.getComputedStyle?.(element);
  return computedStyle?.display !== 'none' && computedStyle?.visibility !== 'hidden';
}

function elementPath(element: Element, root: PageToolsRoot): string {
  const parts: string[] = [];
  let current: Element | null = element;
  const rootElement = isPageElement(root) ? root : null;
  while (current) {
    parts.unshift(current.tagName.toLowerCase());
    if (current === rootElement) break;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function collectElements(root: PageToolsRoot): Element[] {
  const roots = isPageElement(root) ? [root] : Array.from(root.children ?? []);
  const elements: Element[] = [];
  const visit = (element: Element) => {
    if (!isIncludedElement(element)) return;
    elements.push(element);
    for (const child of getChildren(element)) visit(child);
  };
  roots.forEach(visit);
  return elements;
}

function boundedLimit(value: number | undefined, defaultValue: number): number {
  if (!Number.isFinite(value)) return defaultValue;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value as number)));
}

export function createCommentaryVoicePageTools(
  options: CommentaryVoicePageToolsOptions = {},
): CommentaryVoicePageTools {
  const root = options.root ?? document;
  const createLocator = options.createElementLocator ?? createElementLocator;
  const locate = options.locateElement ?? locateElement;
  const nonce = createNonce();
  const locators = new Map<string, ElementLocator>();
  let nextTargetId = 0;
  let pageRevision = 0;
  let destroyed = false;

  function assertAvailable(): void {
    if (destroyed) throw new Error(STALE_TARGET_ERROR);
  }

  function makeTargetRef(): string {
    nextTargetId += 1;
    return `${nonce}.${pageRevision}.${nextTargetId}`;
  }

  function summarizeElement(
    element: Element,
    targetRef: string,
  ): CommentaryPageElementSummary {
    const tagName = element.tagName.toLowerCase();
    return {
      targetRef,
      label: tagName,
      textExcerpt: excerpt(getVisibleText(element)),
      tagName,
      role: getRole(element),
      path: elementPath(element, root),
      childCount: getChildren(element).filter(isIncludedElement).length,
    };
  }

  function createSummary(element: Element): CommentaryPageElementSummary {
    const targetRef = makeTargetRef();
    locators.set(targetRef, createLocator(element));
    return summarizeElement(element, targetRef);
  }

  function resolveTarget(targetRef: string): Element {
    assertAvailable();
    const [cursorNonce, revision] = String(targetRef).split('.', 3);
    const locator = locators.get(targetRef);
    if (cursorNonce !== nonce || Number(revision) !== pageRevision || !locator) {
      throw new Error(STALE_TARGET_ERROR);
    }
    const element = locate(locator);
    if (!element?.isConnected || !isIncludedElement(element)) throw new Error(STALE_TARGET_ERROR);
    return element;
  }

  function summarizeTarget(targetRef: string): CommentaryPageElementSummary {
    return summarizeElement(resolveTarget(targetRef), targetRef);
  }

  function createCursor(offset: number): string {
    return `${nonce}.${pageRevision}.${offset}`;
  }

  function parseCursor(cursor: string | undefined): number {
    if (!cursor) return 0;
    const [cursorNonce, revision, offset] = cursor.split('.', 3);
    if (cursorNonce !== nonce || Number(revision) !== pageRevision || !/^\d+$/.test(offset ?? '')) {
      throw new Error(STALE_TARGET_ERROR);
    }
    return Number(offset);
  }

  function getTargets(): CommentaryVoiceTargets {
    assertAvailable();
    const selected = options.getSelectedElement?.() ?? null;
    const hovered = options.getHoveredElement?.() ?? null;
    const selectedSummary = selected && isIncludedElement(selected) ? createSummary(selected) : null;
    const hoveredSummary = hovered && isIncludedElement(hovered) ? createSummary(hovered) : null;
    return {
      selected: selectedSummary,
      hovered: hoveredSummary,
      preferred: selectedSummary ?? hoveredSummary,
    };
  }

  function findElements(query: CommentaryPageElementSearchQuery): CommentaryPageElementSearchResult {
    assertAvailable();
    const parent = query.parentTargetRef ? resolveTarget(query.parentTargetRef) : null;
    const term = normalizeText(query.text ?? '').toLowerCase();
    const role = normalizeText(query.role ?? '').toLowerCase();
    const tagName = normalizeText(query.tagName ?? '').toLowerCase();
    const matches = collectElements(parent ?? root).filter((element) => {
      if (term && !normalizeText(getVisibleText(element)).toLowerCase().includes(term)) return false;
      if (role && getRole(element) !== role) return false;
      return !tagName || element.tagName.toLowerCase() === tagName;
    });
    const offset = parseCursor(query.cursor);
    const limit = boundedLimit(query.limit, DEFAULT_SEARCH_LIMIT);
    const page = matches.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      elements: page.map(createSummary),
      nextCursor: nextOffset < matches.length ? createCursor(nextOffset) : null,
    };
  }

  function getStructure(
    query: CommentaryPageElementStructureQuery,
  ): CommentaryPageElementStructureResult {
    assertAvailable();
    const structureRoot = query.targetRef ? resolveTarget(query.targetRef) : root;
    const maxDepth = Math.max(0, Math.floor(query.depth ?? 1));
    const elements: Element[] = [];
    const visit = (element: Element, depth: number) => {
      if (!isIncludedElement(element)) return;
      elements.push(element);
      if (depth >= maxDepth) return;
      getChildren(element).forEach((child) => visit(child, depth + 1));
    };
    if (isPageElement(structureRoot)) visit(structureRoot, 0);
    else Array.from(structureRoot.children ?? []).forEach((child) => visit(child, 0));

    const offset = parseCursor(query.cursor);
    const limit = boundedLimit(query.limit, DEFAULT_STRUCTURE_LIMIT);
    const page = elements.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      elements: page.map(createSummary),
      nextCursor: nextOffset < elements.length ? createCursor(nextOffset) : null,
    };
  }

  function invalidate(): void {
    if (destroyed) return;
    pageRevision += 1;
    locators.clear();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    locators.clear();
  }

  return {
    getTargets,
    findElements,
    getStructure,
    resolveTarget,
    summarizeTarget,
    invalidate,
    destroy,
  };
}
