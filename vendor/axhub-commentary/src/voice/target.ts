import { generateFullElementLabel, generateStableElementKey } from '../core/element-key';
import { createElementLocator } from '../core/locator';
import type { CommentaryVoiceTarget, ElementLocator } from '../web-editor-types';

const MAX_ATTRIBUTES = 20;
const MAX_LABEL_LENGTH = 256;
const MAX_LOCATOR_PATH = 32;
const MAX_LOCATOR_SELECTORS = 5;
const MAX_TEXT_LENGTH = 512;
const SENSITIVE_ATTRIBUTE_NAME =
  /(?:password|passcode|secret|token|authorization|cookie|api[-_]?key|access[-_]?key|private[-_]?key)/i;

type CommentaryVoiceTargetCandidate = CommentaryVoiceTarget & {
  connected?: boolean;
};

export function resolveCommentaryVoiceTargetElement(
  selectedElement: Element | null | undefined,
  getHoveredElement: () => Element | null | undefined,
): { element: Element; source: CommentaryVoiceTarget['source'] } | null {
  if (selectedElement?.isConnected) {
    return { element: selectedElement, source: 'selected' };
  }
  let hoveredElement: Element | null | undefined;
  try {
    hoveredElement = getHoveredElement();
  } catch {
    hoveredElement = null;
  }
  return hoveredElement?.isConnected
    ? { element: hoveredElement, source: 'hovered' }
    : null;
}

function boundedText(value: unknown, maxLength: number): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(attributes).slice(0, MAX_ATTRIBUTES)) {
    const normalizedName = boundedText(name, 128);
    if (!normalizedName) continue;
    result[normalizedName] = SENSITIVE_ATTRIBUTE_NAME.test(normalizedName)
      ? '[REDACTED]'
      : boundedText(value, MAX_LABEL_LENGTH);
  }
  return result;
}

function sanitizeLocator(locator: ElementLocator): ElementLocator {
  const selectors = Array.isArray(locator.selectors)
    ? locator.selectors
      .slice(0, MAX_LOCATOR_SELECTORS)
      .map((selector) => boundedText(selector, MAX_LABEL_LENGTH))
      .filter(Boolean)
    : [];
  const path = Array.isArray(locator.path)
    ? locator.path.slice(0, MAX_LOCATOR_PATH).filter((value) => Number.isInteger(value))
    : [];
  const sanitizeStringList = (value: readonly string[] | undefined) =>
    Array.isArray(value)
      ? value.slice(0, MAX_LOCATOR_SELECTORS).map((entry) => boundedText(entry, MAX_LABEL_LENGTH))
      : undefined;

  return {
    fingerprint: boundedText(locator.fingerprint, MAX_LABEL_LENGTH),
    path,
    selectors,
    ...(locator.debugSource
      ? {
          debugSource: {
            componentName: locator.debugSource.componentName
              ? boundedText(locator.debugSource.componentName, MAX_LABEL_LENGTH)
              : undefined,
            file: boundedText(locator.debugSource.file, MAX_LABEL_LENGTH),
            ...(typeof locator.debugSource.line === 'number'
              ? { line: locator.debugSource.line }
              : {}),
            ...(typeof locator.debugSource.column === 'number'
              ? { column: locator.debugSource.column }
              : {}),
          },
        }
      : {}),
    ...(locator.frameChain ? { frameChain: sanitizeStringList(locator.frameChain) } : {}),
    ...(locator.shadowHostChain
      ? { shadowHostChain: sanitizeStringList(locator.shadowHostChain) }
      : {}),
  };
}

function readAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes ?? []).slice(0, MAX_ATTRIBUTES)) {
    attributes[attribute.name] = attribute.value;
  }
  return attributes;
}

export function sanitizeCommentaryVoiceTarget(
  candidate: CommentaryVoiceTargetCandidate | null | undefined,
): CommentaryVoiceTarget | null {
  if (!candidate || candidate.connected === false) return null;
  return {
    attributes: sanitizeAttributes(candidate.attributes),
    elementKey: boundedText(candidate.elementKey, MAX_LABEL_LENGTH),
    fullLabel: boundedText(candidate.fullLabel, MAX_LABEL_LENGTH),
    label: boundedText(candidate.label, MAX_LABEL_LENGTH),
    locator: sanitizeLocator(candidate.locator),
    source: candidate.source,
    tagName: boundedText(candidate.tagName, 64).toLowerCase() || 'unknown',
    text: boundedText(candidate.text, MAX_TEXT_LENGTH),
    updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : Date.now(),
  };
}

export function createCommentaryVoiceTarget(
  element: Element | null | undefined,
  source: CommentaryVoiceTarget['source'],
): CommentaryVoiceTarget | null {
  if (!element?.isConnected) return null;
  const locator = createElementLocator(element);
  const tagName = boundedText(element.tagName, 64).toLowerCase() || 'unknown';
  const label = element.id ? `${tagName}#${element.id}` : tagName;

  return sanitizeCommentaryVoiceTarget({
    attributes: readAttributes(element),
    elementKey: generateStableElementKey(element, locator.shadowHostChain),
    fullLabel: generateFullElementLabel(element, locator.shadowHostChain),
    label,
    locator,
    source,
    tagName,
    text: element.textContent ?? '',
    updatedAt: Date.now(),
  });
}
