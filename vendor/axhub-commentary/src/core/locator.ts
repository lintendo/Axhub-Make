/**
 * Element Locator Utilities
 *
 * Generates and resolves CSS-based element locators for the Transaction System.
 *
 * Design goals:
 * - Generate stable, unique CSS selectors for DOM elements
 * - Support Shadow DOM boundaries with host chain traversal
 * - Provide fallback strategies when primary selector fails
 * - Compute structural fingerprints for fuzzy matching
 */

import type { ElementLocator } from '../web-editor-types';
import { findDebugSource } from './debug-source';
import {
  getEditableTextFragmentLocator,
  resolveEditableTextFragment,
} from './text-fragment';

// =============================================================================
// Types
// =============================================================================

/** Options for CSS selector generation */
export interface SelectorGenerationOptions {
  /** Root node for uniqueness checking (defaults to element's root) */
  root?: Document | ShadowRoot;
  /** Maximum number of selector candidates to generate */
  maxCandidates?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum candidate selectors to generate */
const DEFAULT_MAX_CANDIDATES = 5;

/** Maximum text length for fingerprint */
const FINGERPRINT_TEXT_MAX_LENGTH = 32;

/** Maximum classes to include in fingerprint */
const FINGERPRINT_MAX_CLASSES = 8;

/** Priority ordered data attributes for unique identification */
const UNIQUE_DATA_ATTRS = [
  'data-axhub-annotation-comment-target-id',
  'data-axhub-annotation-panel-node-id',
  'data-testid',
  'data-test-id',
  'data-test',
  'data-qa',
  'data-cy',
  'name',
  'title',
  'alt',
  'aria-label', // Phase 2.9: added for better accessibility-based matching
] as const;

/** Maximum class combinations to try for uniqueness */
const MAX_CLASS_COMBO_DEPTH = 3;

/** Data attributes eligible for ancestor anchors (Phase 2.9) */
const ANCHOR_DATA_ATTRS = [
  'data-axhub-annotation-comment-target-id',
  'data-axhub-annotation-panel-node-id',
  'data-testid',
  'data-test-id',
  'data-test',
  'data-qa',
  'data-cy',
] as const;

/** Maximum number of class names to consider for selector generation */
const MAX_SELECTOR_CLASS_COUNT = 24;

/** Maximum ancestor depth to search for an anchor selector */
const MAX_ANCHOR_DEPTH = 20;

// =============================================================================
// CSS Escape Utility
// =============================================================================

/**
 * Escape a string for use in CSS selector.
 * Uses native CSS.escape if available, otherwise a spec-compliant polyfill.
 */
function cssEscape(value: string): string {
  // Try native CSS.escape
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  // Polyfill based on CSSOM spec
  const str = String(value);
  const len = str.length;
  if (len === 0) return '';

  let result = '';
  const firstCodeUnit = str.charCodeAt(0);

  for (let i = 0; i < len; i++) {
    const codeUnit = str.charCodeAt(i);

    // Null character -> replacement character
    if (codeUnit === 0x0000) {
      result += '\uFFFD';
      continue;
    }

    // Control characters and special numeric positions
    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      (i === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (i === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
    ) {
      result += `\\${codeUnit.toString(16)} `;
      continue;
    }

    // Single hyphen at start
    if (i === 0 && len === 1 && codeUnit === 0x002d) {
      result += `\\${str.charAt(i)}`;
      continue;
    }

    // Safe ASCII characters (alphanumeric, hyphen, underscore)
    const isAsciiAlnum =
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) || // 0-9
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) || // A-Z
      (codeUnit >= 0x0061 && codeUnit <= 0x007a); // a-z
    const isSafe = isAsciiAlnum || codeUnit === 0x002d || codeUnit === 0x005f;

    if (isSafe) {
      result += str.charAt(i);
    } else {
      result += `\\${str.charAt(i)}`;
    }
  }

  return result;
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get the query root for an element (Document or ShadowRoot)
 */
function getQueryRoot(element: Element): Document | ShadowRoot {
  const root = element.getRootNode?.();
  return root instanceof ShadowRoot ? root : document;
}

/**
 * Safely execute querySelector, returning null on invalid selectors
 */
function safeQuerySelector(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * Check if a selector matches exactly one element in the root
 */
function isUnique(root: ParentNode, selector: string): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

// =============================================================================
// Selector Generation Strategies
// =============================================================================

/**
 * Try to build a unique ID-based selector
 */
function tryIdSelector(element: Element, root: ParentNode): string | null {
  const id = element.id?.trim();
  if (!id) return null;

  const selector = `#${cssEscape(id)}`;
  return isUnique(root, selector) ? selector : null;
}

/**
 * Collect unique data-attribute selector candidates (ordered by priority).
 * Phase 2.9: Returns multiple candidates instead of just the first.
 */
function collectDataAttrSelectors(element: Element, root: ParentNode, max: number): string[] {
  const out: string[] = [];
  if (max <= 0) return out;

  const tag = element.tagName.toLowerCase();

  for (const attr of UNIQUE_DATA_ATTRS) {
    if (out.length >= max) break;
    const value = element.getAttribute(attr)?.trim();
    if (!value) continue;

    // Try attribute alone
    const attrOnly = `[${attr}="${cssEscape(value)}"]`;
    if (isUnique(root, attrOnly)) {
      out.push(attrOnly);
      continue;
    }

    // Try with tag prefix
    const withTag = `${tag}${attrOnly}`;
    if (isUnique(root, withTag)) {
      out.push(withTag);
    }
  }

  return out;
}

/**
 * Collect unique class-based selector candidates.
 * Phase 2.9: Produces multiple variants (single class, tag+class, combinations) with early stop.
 */
function collectClassSelectors(element: Element, root: ParentNode, max: number): string[] {
  const out: string[] = [];
  if (max <= 0) return out;

  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList)
    .filter((c) => c && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(c))
    .slice(0, MAX_SELECTOR_CLASS_COUNT);

  if (classes.length === 0) return out;

  const uniqueSingle = new Map<string, boolean>();

  // Try single class
  for (const cls of classes) {
    if (out.length >= max) return out;
    const sel = `.${cssEscape(cls)}`;
    const unique = isUnique(root, sel);
    uniqueSingle.set(cls, unique);
    if (unique) out.push(sel);
  }

  // Try tag + single class (only when the class alone isn't unique)
  for (const cls of classes) {
    if (out.length >= max) return out;
    if (uniqueSingle.get(cls) === true) continue;
    const sel = `${tag}.${cssEscape(cls)}`;
    if (isUnique(root, sel)) out.push(sel);
  }

  // Try class combinations (pairs and triple) among the first few classes
  const limit = Math.min(classes.length, MAX_CLASS_COMBO_DEPTH);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      if (out.length >= max) return out;
      const a = classes[i];
      const b = classes[j];
      const pair = `.${cssEscape(a)}.${cssEscape(b)}`;
      if (isUnique(root, pair)) {
        out.push(pair);
        continue;
      }
      const withTag = `${tag}${pair}`;
      if (isUnique(root, withTag)) out.push(withTag);
    }
  }

  // Try triple combination if we have enough classes and room
  if (limit >= 3 && out.length < max) {
    const triple = `.${cssEscape(classes[0])}.${cssEscape(classes[1])}.${cssEscape(classes[2])}`;
    if (isUnique(root, triple)) {
      out.push(triple);
    } else {
      const withTag = `${tag}${triple}`;
      if (out.length < max && isUnique(root, withTag)) out.push(withTag);
    }
  }

  return out;
}

/**
 * Build a structural path selector using nth-of-type
 */
function buildPathSelector(element: Element, root: Document | ShadowRoot): string {
  const segments: string[] = [];
  let current: Element | null = element;

  // Determine stop condition based on root type
  const isDocument = root instanceof Document;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();

    // Stop at body for document, or at shadow root boundary
    if (isDocument && tag === 'body') break;

    let selector = tag;

    // Find parent context
    const parent: Element | null = current.parentElement;
    const parentNode = current.parentNode;

    // Get siblings from appropriate parent
    let siblings: Element[];
    if (parent) {
      siblings = Array.from(parent.children);
    } else if (parentNode instanceof ShadowRoot || parentNode instanceof Document) {
      siblings = Array.from(parentNode.children);
    } else {
      siblings = [];
    }

    // Add nth-of-type if there are siblings with same tag
    const sameTagSiblings = siblings.filter((s) => s.tagName === current!.tagName);
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    segments.unshift(selector);
    current = parent;

    // Stop if we've reached the root's direct children
    if (!parent && parentNode === root) break;
  }

  const path = segments.join(' > ');
  return isDocument ? `body > ${path}` : path || '*';
}

// =============================================================================
// Anchor + Relative Path (Phase 2.9)
// =============================================================================

/**
 * Build a relative path selector from an ancestor to a target within the same root.
 */
function buildRelativePathSelector(
  ancestor: Element,
  target: Element,
  root: Document | ShadowRoot,
): string | null {
  const segments: string[] = [];
  let current: Element | null = target;

  for (let depth = 0; current && current !== ancestor && depth < MAX_ANCHOR_DEPTH; depth++) {
    const tag = current.tagName.toLowerCase();
    let selector = tag;

    const parent: Element | null = current.parentElement;
    const parentNode = current.parentNode;

    let siblings: Element[];
    if (parent) {
      siblings = Array.from(parent.children);
    } else if (parentNode instanceof ShadowRoot || parentNode instanceof Document) {
      siblings = Array.from(parentNode.children);
    } else {
      siblings = [];
    }

    const sameTagSiblings = siblings.filter((s) => s.tagName === current!.tagName);
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    segments.unshift(selector);

    if (!parent) {
      // Reached the root boundary without finding the ancestor
      if (parentNode === root) break;
      break;
    }

    current = parent;
  }

  if (current !== ancestor) return null;
  return segments.join(' > ') || null;
}

/**
 * Try to build a unique anchor selector for an ancestor (id or stable data-* only).
 */
function tryAnchorSelector(element: Element, root: ParentNode): string | null {
  const idSel = tryIdSelector(element, root);
  if (idSel) return idSel;

  const tag = element.tagName.toLowerCase();

  for (const attr of ANCHOR_DATA_ATTRS) {
    const value = element.getAttribute(attr)?.trim();
    if (!value) continue;

    const attrOnly = `[${attr}="${cssEscape(value)}"]`;
    if (isUnique(root, attrOnly)) return attrOnly;

    const withTag = `${tag}${attrOnly}`;
    if (isUnique(root, withTag)) return withTag;
  }

  return null;
}

/**
 * Build an "anchor + relative path" selector candidate.
 * Finds a unique ancestor (id or stable data-*) and appends a relative path from there.
 * This improves matching when the target itself doesn't have unique attributes.
 */
function buildAnchorRelPathSelector(element: Element, root: Document | ShadowRoot): string | null {
  let current: Element | null = element.parentElement;

  for (let depth = 0; current && depth < MAX_ANCHOR_DEPTH; depth++) {
    const tag = current.tagName.toUpperCase();
    if (tag === 'HTML' || tag === 'BODY') break;

    const anchor = tryAnchorSelector(current, root);
    if (anchor) {
      const rel = buildRelativePathSelector(current, element, root);
      if (!rel) {
        current = current.parentElement;
        continue;
      }

      const composed = `${anchor} ${rel}`;
      if (!isUnique(root, composed)) {
        current = current.parentElement;
        continue;
      }

      // Final verification: ensure the composed selector finds the exact element
      const found = safeQuerySelector(root, composed);
      if (found === element) return composed;
    }

    current = current.parentElement;
  }

  return null;
}

// =============================================================================
// Shadow DOM Utilities
// =============================================================================

/**
 * Get selector chain for shadow host ancestors (from outer to inner)
 */
export function getShadowHostChain(element: Element): string[] | undefined {
  const chain: string[] = [];
  let current: Element = element;

  while (true) {
    const root = current.getRootNode?.();
    if (!(root instanceof ShadowRoot)) break;

    const host = root.host;
    if (!(host instanceof Element)) break;

    const hostRoot = getQueryRoot(host);
    const hostSelector = generateCssSelector(host, { root: hostRoot });
    if (!hostSelector) break;

    chain.unshift(hostSelector);
    current = host;
  }

  return chain.length > 0 ? chain : undefined;
}

// =============================================================================
// Fingerprint Generation
// =============================================================================

/**
 * Normalize text content for fingerprinting
 */
function normalizeText(text: string, maxLength: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Compute a structural fingerprint for fuzzy element matching
 */
export function computeFingerprint(element: Element): string {
  const parts: string[] = [];

  // Tag name
  const tag = element.tagName?.toLowerCase() ?? 'unknown';
  parts.push(tag);

  // ID if present
  const id = element.id?.trim();
  if (id) {
    parts.push(`id=${id}`);
  }

  // Class names (limited)
  const classes = Array.from(element.classList).slice(0, FINGERPRINT_MAX_CLASSES);
  if (classes.length > 0) {
    parts.push(`class=${classes.join('.')}`);
  }

  // Text content hint
  const text = normalizeText(element.textContent ?? '', FINGERPRINT_TEXT_MAX_LENGTH);
  if (text) {
    parts.push(`text=${text}`);
  }

  return parts.join('|');
}

// =============================================================================
// DOM Path Computation
// =============================================================================

/**
 * Compute the DOM tree path as child indices from root
 */
export function computeDomPath(element: Element): number[] {
  const path: number[] = [];
  let current: Element | null = element;

  while (current) {
    const parent: Element | null = current.parentElement;

    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current);
      if (index >= 0) path.unshift(index);
      current = parent;
      continue;
    }

    // Check for shadow root or document as parent
    const parentNode = current.parentNode;
    if (parentNode instanceof ShadowRoot || parentNode instanceof Document) {
      const children = Array.from(parentNode.children);
      const index = children.indexOf(current);
      if (index >= 0) path.unshift(index);
    }

    break;
  }

  return path;
}

// =============================================================================
// Public API - Selector Generation
// =============================================================================

/**
 * Generate multiple CSS selector candidates for an element.
 * Phase 2.9 enhanced: Collects multiple candidates from each strategy.
 *
 * Candidates are ordered by preference: ID > data-attrs > classes > path > anchor+relPath
 */
export function generateSelectorCandidates(
  element: Element,
  options: SelectorGenerationOptions = {},
): string[] {
  const root = options.root ?? getQueryRoot(element);
  const maxCandidates = Math.max(1, options.maxCandidates ?? DEFAULT_MAX_CANDIDATES);

  const candidates: string[] = [];

  const push = (selector: string | null, limit = maxCandidates): void => {
    if (!selector) return;
    if (candidates.length >= limit) return;
    const s = selector.trim();
    if (!s || candidates.includes(s)) return;
    candidates.push(s);
  };

  // Pre-compute anchor+relPath candidate (intended as last fallback)
  // Only compute if we have room for it (maxCandidates >= 5)
  const anchorCandidate =
    maxCandidates >= DEFAULT_MAX_CANDIDATES ? buildAnchorRelPathSelector(element, root) : null;

  // Reserve space for path selector + optional anchor candidate
  // But ensure headLimit is at least 1 to allow ID/attr/class to compete with path
  const tailReserved = 1 + (anchorCandidate ? 1 : 0);
  const headLimit = Math.max(1, maxCandidates - tailReserved);

  // 1) ID selector (unique, highest priority)
  push(tryIdSelector(element, root), headLimit);

  // 2) Data attribute selectors (multiple candidates in priority order)
  for (const sel of collectDataAttrSelectors(element, root, headLimit - candidates.length)) {
    push(sel, headLimit);
  }

  // 3) Class selectors (multiple candidates with combinations)
  for (const sel of collectClassSelectors(element, root, headLimit - candidates.length)) {
    push(sel, headLimit);
  }

  // 4) Structural path selector (always included as fallback)
  push(buildPathSelector(element, root));

  // 5) Anchor + relative path selector (when available, last candidate)
  push(anchorCandidate);

  return candidates.slice(0, maxCandidates);
}

/**
 * Generate a single best CSS selector for an element
 */
export function generateCssSelector(
  element: Element,
  options: SelectorGenerationOptions = {},
): string {
  return generateSelectorCandidates(element, options)[0] ?? '';
}

// =============================================================================
// Public API - Locator Creation & Resolution
// =============================================================================

/**
 * Create a complete ElementLocator for an element.
 * The locator contains multiple strategies for re-identification.
 */
export function createElementLocator(element: Element): ElementLocator {
  const textFragment = getEditableTextFragmentLocator(element);
  if (textFragment) {
    return {
      ...createElementLocator(textFragment.parent),
      textFragment: textFragment.fragment,
    };
  }

  const root = getQueryRoot(element);

  // Extract debug source (React/Vue component file path)
  // This is best-effort and returns undefined if not available
  const debugSource = findDebugSource(element) ?? undefined;

  return {
    selectors: generateSelectorCandidates(element, { root, maxCandidates: DEFAULT_MAX_CANDIDATES }),
    fingerprint: computeFingerprint(element),
    path: computeDomPath(element),
    shadowHostChain: getShadowHostChain(element),
    debugSource,
  };
}

/**
 * Safely check if a selector matches exactly one element
 */
function isSelectorUnique(root: ParentNode, selector: string): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * Verify element matches the stored fingerprint
 */
function verifyFingerprint(element: Element, fingerprint: string): boolean {
  const currentFingerprint = computeFingerprint(element);
  // Simple check: verify tag and id match at minimum
  const storedParts = fingerprint.split('|');
  const currentParts = currentFingerprint.split('|');

  // At minimum, tag should match
  if (storedParts[0] !== currentParts[0]) return false;

  // If stored has id, current should have same id
  const storedId = storedParts.find((p) => p.startsWith('id='));
  const currentId = currentParts.find((p) => p.startsWith('id='));
  if (storedId && storedId !== currentId) return false;

  return true;
}

/**
 * Resolve an ElementLocator to a DOM element.
 * Traverses Shadow DOM boundaries and tries multiple selector candidates.
 * Includes uniqueness verification to avoid misidentification.
 */
export function locateElement(
  locator: ElementLocator,
  rootDocument: Document = document,
): Element | null {
  let doc: Document = rootDocument;

  // Traverse iframe chain (Phase 4 - not implemented yet)
  if (locator.frameChain?.length) {
    for (const frameSelector of locator.frameChain) {
      const frame = safeQuerySelector(doc, frameSelector);
      if (!(frame instanceof HTMLIFrameElement)) return null;
      const contentDoc = frame.contentDocument;
      if (!contentDoc) return null;
      doc = contentDoc;
    }
  }

  // Start with document as query root
  let queryRoot: Document | ShadowRoot = doc;

  // Traverse Shadow DOM host chain
  if (locator.shadowHostChain?.length) {
    for (const hostSelector of locator.shadowHostChain) {
      // Verify host selector is unique
      if (!isSelectorUnique(queryRoot, hostSelector)) return null;

      const host = safeQuerySelector(queryRoot, hostSelector);
      if (!host) return null;

      const shadowRoot = (host as HTMLElement).shadowRoot;
      if (!shadowRoot) return null;

      queryRoot = shadowRoot;
    }
  }

  // Try each selector candidate with uniqueness and fingerprint verification
  for (const selector of locator.selectors) {
    // Check if selector still matches exactly one element
    if (!isSelectorUnique(queryRoot, selector)) continue;

    const element = safeQuerySelector(queryRoot, selector);
    if (!element) continue;

    // Verify fingerprint matches to catch "same selector, different element" cases
    if (locator.fingerprint && !verifyFingerprint(element, locator.fingerprint)) {
      continue;
    }

    return locator.textFragment
      ? resolveEditableTextFragment(element, locator.textFragment)
      : element;
  }

  return null;
}

/**
 * Generate a unique key for an ElementLocator (for comparison/caching)
 */
export function locatorKey(locator: ElementLocator): string {
  const selectors = locator.selectors.join('|');
  const shadow = locator.shadowHostChain?.join('>') ?? '';
  const frame = locator.frameChain?.join('>') ?? '';
  const textFragment = locator.textFragment
    ? `|text:${locator.textFragment.childNodeIndex}`
    : '';
  return `frame:${frame}|shadow:${shadow}|sel:${selectors}${textFragment}`;
}
