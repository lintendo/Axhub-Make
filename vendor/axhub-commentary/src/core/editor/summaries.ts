import type {
  ElementLocator,
  CommentaryCopyPromptContext,
  CommentaryHostResource,
  CommentaryModifiedElementSummary,
  CommentarySkillOption,
  CommentaryStyleChangeSet,
  CommentaryTargetedTextChange,
  CommentaryTextChange,
  PrototypeEditCommentEntry,
  PrototypeEditCommentImageEntry,
  PrototypeEditCommentsDocument,
  PrototypeEditCommentsPersistenceScope,
  Transaction,
} from '../../web-editor-types';
import { aggregateTransactionsByElement } from '../transaction-aggregator';
import { createElementLocator, locateElement, locatorKey } from '../locator';
import { generateFullElementLabel, generateStableElementKey } from '../element-key';
import type {
  EditorRuntimeState,
  PromptImageAttachment,
  WebEditorV2PromptContextOptions,
} from './state';
import { resolveTextCommentElementMeta } from './text-comment-target';
import { filterUnprocessedTransactions } from './state';
import type { EditorSummariesService, MoveSummary } from './contracts';
import type { TextComment } from '../../selection/text-comment-manager';
import {
  deserializePromptCardSkillSelection,
  mergePromptCardSkillsIntoPromptNote,
} from '../../ui/runtime/prompt-card-skills';
import {
  ANNOTATION_PANEL_NODE_ID_ATTR,
  ANNOTATION_PANEL_TARGET_ATTR,
  readAnnotationSourceNodes,
  resolveAnnotationElementIdentity,
  resolveAnnotationNodeIdFromLocator,
} from './annotation-target';
import { resolveCommentaryDiagramTarget } from '../../review/diagram-target';

type ResolvedPromptContext = {
  workspacePaths: string[];
  relatedFiles: string[];
  extraContext: string[];
};

type SaveRunCommentMeta = {
  elementKey: string;
  label: string;
  locator: ElementLocator;
  note: string;
  skillIds?: string[];
  actions: string[];
  imageCount: number;
  imageAssetPaths: string[];
  targetScreenshotAssetPath: string;
  dirtySince: number;
};

type CopyPromptPersistedCommentMeta = {
  elementKey: string;
  label: string;
  locator: ElementLocator;
  pageScope: string;
  note: string;
  skillIds?: string[];
  actions: string[];
  imageAssetPaths: string[];
  targetScreenshotAssetPath: string;
};

type ElementSnapshot = {
  tagName: string;
  currentText: string;
};

type InternalMoveSummary = MoveSummary & {
  elementKey: string;
};

type AnnotationPromptControl = {
  attributeId?: unknown;
  displayName?: unknown;
  initialValue?: unknown;
  options?: unknown;
};

type AnnotationPromptNode = {
  id?: unknown;
  index?: unknown;
  locator?: unknown;
  aiPrompt?: unknown;
  annotationText?: unknown;
  controls?: unknown;
};

type AnnotationPromptContext = {
  nodeId: string;
  node: AnnotationPromptNode | null;
};

type AnnotationProtoDevRuntime = {
  getState?: unknown;
};

const ANNOTATION_PROTO_DEV_KEY = '__AXHUB_PROTO_DEV__';
const ANNOTATION_TEXT_MAX_LENGTH = 280;

function normalizeNote(value: string): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function buildPromptNoteWithSkills(
  note: string,
  payload: { skillIds?: readonly unknown[] | null } | null | undefined,
  skillOptions: readonly CommentarySkillOption[] = [],
): string {
  return mergePromptCardSkillsIntoPromptNote(
    normalizeNote(note),
    deserializePromptCardSkillSelection(payload, undefined, skillOptions),
  );
}

function normalizeInlineText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePathValue(value: unknown): string {
  return String(value ?? '').trim();
}

function inferImageExtension(mimeType: unknown, fileName: unknown): string {
  const extMatch = normalizePathValue(fileName).match(/\.([a-z0-9+.-]+)$/iu);
  if (extMatch?.[1]) {
    const ext = extMatch[1].toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  }

  const normalized = normalizePathValue(mimeType).toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized.startsWith('image/')) {
    const ext = normalized.slice('image/'.length).replace(/[^a-z0-9+.-]/gu, '');
    return ext || 'png';
  }
  return 'png';
}

function sanitizeAssetBaseName(value: unknown, fallback: string): string {
  const normalized = normalizePathValue(value).replace(/\.[a-z0-9+.-]+$/iu, '');
  const safe = normalized
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  return safe || fallback;
}

function inferPromptImageAssetPath(
  image: Pick<PromptImageAttachment, 'id' | 'name' | 'mimeType'> & {
    assetPath?: string;
  },
  index: number,
): string {
  const assetPath = normalizePathValue(image.assetPath).replace(/\\/g, '/').replace(/^\/+/u, '');
  if (assetPath) return assetPath;

  const id = sanitizeAssetBaseName(image.id, `image-${index + 1}`);
  const extension = inferImageExtension(image.mimeType, image.name);
  return `prototype-comment-assets/${id}.${extension}`;
}

function collectPromptImageAssetPaths(
  images:
    | readonly (Pick<PromptImageAttachment, 'id' | 'name' | 'mimeType' | 'source'> & {
        assetPath?: string;
      })[]
    | null
    | undefined,
): string[] {
  return dedupeStrings(
    (images ?? [])
      .filter((image) => image.source !== 'target-screenshot')
      .map((image, index) => inferPromptImageAssetPath(image, index)),
  );
}

function collectPromptTargetScreenshotAssetPath(
  images:
    | readonly (Pick<PromptImageAttachment, 'id' | 'name' | 'mimeType' | 'source'> & {
        assetPath?: string;
      })[]
    | null
    | undefined,
): string {
  const entries = images ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const image = entries[index];
    if (image.source === 'target-screenshot') {
      return inferPromptImageAssetPath(image, 0);
    }
  }
  return '';
}

function collectPersistedImageAssetPathsForComment(
  images: readonly PrototypeEditCommentImageEntry[],
  comment: Pick<PrototypeEditCommentEntry, 'id' | 'pageScope'>,
): string[] {
  const commentId = normalizePathValue(comment.id);
  const pageScope = normalizePathValue(comment.pageScope);
  if (!commentId) return [];

  return dedupeStrings(
    images
      .filter((image) => {
        if (normalizePathValue(image.commentId) !== commentId) return false;
        if (image.source === 'target-screenshot') return false;
        const imagePageScope = normalizePathValue(image.pageScope);
        return !pageScope || !imagePageScope || imagePageScope === pageScope;
      })
      .map(
        (image, index) =>
          normalizePathValue(image.assetPath) ||
          inferPromptImageAssetPath(
            {
              id: normalizePathValue(image.id),
              name: normalizePathValue(image.name),
              mimeType: normalizePathValue(image.mimeType),
            },
            index,
          ),
      ),
  );
}

function collectPersistedTargetScreenshotAssetPathForComment(
  images: readonly PrototypeEditCommentImageEntry[],
  comment: Pick<PrototypeEditCommentEntry, 'id' | 'pageScope'>,
): string {
  const commentId = normalizePathValue(comment.id);
  const pageScope = normalizePathValue(comment.pageScope);
  if (!commentId) return '';
  let target: PrototypeEditCommentImageEntry | undefined;
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index];
    if (image.source !== 'target-screenshot') continue;
    if (normalizePathValue(image.commentId) !== commentId) continue;
    const imagePageScope = normalizePathValue(image.pageScope);
    if (!pageScope || !imagePageScope || imagePageScope === pageScope) {
      target = image;
      break;
    }
  }
  if (!target) return '';
  return normalizePathValue(target.assetPath) || inferPromptImageAssetPath({
    id: normalizePathValue(target.id),
    name: normalizePathValue(target.name),
    mimeType: normalizePathValue(target.mimeType),
  }, 0);
}

function readElementAttr(element: Element | null, attr: string): string {
  if (!element) return '';
  try {
    return element.getAttribute(attr)?.trim() ?? '';
  } catch {
    return '';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function truncateInlineText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatAnnotationLocator(locator: unknown): string {
  if (!isPlainObject(locator)) return '';

  const selectors = Array.isArray(locator.selectors)
    ? locator.selectors.map((selector) => normalizePathValue(selector)).filter(Boolean)
    : [];
  if (selectors.length > 0) return selectors.join(' | ');

  const path = Array.isArray(locator.path)
    ? locator.path.map((part) => normalizePathValue(part)).filter(Boolean)
    : [];
  if (path.length > 0) return path.join('>');

  return normalizePathValue(locator.fingerprint);
}

function formatAnnotationControlValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value).trim();
  }
}

function formatAnnotationControlOption(option: unknown): string {
  if (!isPlainObject(option)) return formatAnnotationControlValue(option);

  const label = normalizeInlineText(option.label);
  const value = formatAnnotationControlValue(option.value);
  if (label && value && label !== value) return `${label}=${value}`;
  return label || value;
}

function formatAnnotationControl(
  control: AnnotationPromptControl,
  runtimeState: Record<string, unknown> | null,
): string {
  const attributeId = normalizePathValue(control.attributeId);
  const displayName = normalizeInlineText(control.displayName) || attributeId || '控件';
  const label =
    attributeId && attributeId !== displayName ? `${displayName}(${attributeId})` : displayName;
  const details: string[] = [];

  const initialValue = formatAnnotationControlValue(control.initialValue);
  if (initialValue) details.push(`默认 ${initialValue}`);

  if (
    runtimeState &&
    attributeId &&
    Object.prototype.hasOwnProperty.call(runtimeState, attributeId)
  ) {
    const currentValue = formatAnnotationControlValue(runtimeState[attributeId]);
    if (currentValue) details.push(`当前 ${currentValue}`);
  }

  const options = Array.isArray(control.options)
    ? control.options.map(formatAnnotationControlOption).filter(Boolean)
    : [];
  if (options.length > 0) details.push(`选项 ${options.join(', ')}`);

  return details.length > 0 ? `${label}: ${details.join('；')}` : label;
}

function resolveAnnotationAvailablePanels(node: AnnotationPromptNode | null): string[] {
  const panels: string[] = [];
  const annotationText = normalizeInlineText(node?.annotationText);
  if (annotationText) {
    panels.push('内容');
  }
  if (Array.isArray(node?.controls) && node.controls.some(isPlainObject)) {
    panels.push('状态');
  }
  return panels;
}

function readAnnotationSourceNode(nodeId: string): AnnotationPromptNode | null {
  if (!nodeId) return null;

  const matched = readAnnotationSourceNodes().find((node) => node.id === nodeId);
  return matched?.raw && isPlainObject(matched.raw) ? (matched.raw as AnnotationPromptNode) : null;
}

function readAnnotationProtoDevState(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;

  const runtime = (window as unknown as Record<string, unknown>)[ANNOTATION_PROTO_DEV_KEY] as
    | AnnotationProtoDevRuntime
    | undefined;
  if (!runtime || typeof runtime !== 'object' || typeof runtime.getState !== 'function') {
    return null;
  }

  try {
    const state = runtime.getState();
    return isPlainObject(state) ? state : null;
  } catch {
    return null;
  }
}

function dedupeStrings(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizePathValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function readResourceMetaString(
  resource: CommentaryHostResource | null | undefined,
  key: string,
): string {
  const value = resource?.meta?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function inferTargetPathFromCurrentFilePath(currentFilePath: string): string {
  const normalizedPath = normalizePathValue(currentFilePath).replace(/\\/g, '/');
  const match = normalizedPath.match(/^src\/(components|prototypes|themes)\/([^/]+)/);
  if (!match) return '';
  return `${match[1]}/${match[2]}`;
}

function formatMoveLocation(
  op: {
    parentLocator: ElementLocator;
    insertIndex: number;
    anchorLocator?: ElementLocator;
    anchorPosition?: 'before' | 'after';
  },
  formatSelectorPath: (locator: ElementLocator | null | undefined) => string,
): string {
  const parentPath = formatSelectorPath(op.parentLocator) || 'unknown-parent';
  const anchorPath = op.anchorLocator ? formatSelectorPath(op.anchorLocator) : '';
  const anchor =
    op.anchorLocator && anchorPath
      ? `, anchor: ${anchorPath} (${op.anchorPosition ?? 'after'})`
      : '';
  return `${parentPath} @index ${op.insertIndex}${anchor}`;
}

function tryLocateElement(locator: ElementLocator | null | undefined): Element | null {
  if (!locator) return null;
  try {
    return locateElement(locator);
  } catch {
    return null;
  }
}

function inferTagName(locator: ElementLocator, fallbackLabel = ''): string {
  const element = tryLocateElement(locator);
  if (element) return element.tagName.toLowerCase();

  const fingerprintTag = normalizePathValue(locator.fingerprint).split('|')[0]?.trim();
  if (fingerprintTag) return fingerprintTag.toLowerCase();

  const selectorTag = (locator.selectors ?? [])
    .map((selector) => normalizePathValue(selector))
    .find(Boolean)
    ?.match(/^[a-zA-Z][\w-]*/)?.[0];
  if (selectorTag) return selectorTag.toLowerCase();

  const labelTag = normalizePathValue(fallbackLabel).match(/^[a-zA-Z][\w-]*/)?.[0];
  return labelTag ? labelTag.toLowerCase() : '';
}

function readElementText(element: Element | null): string {
  if (!element) return '';
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return normalizeInlineText(element.value);
  }
  return normalizeInlineText(element.textContent);
}

function formatStyleValue(value: unknown): string {
  const normalized = normalizePathValue(value);
  return normalized || '(unset)';
}

function formatTextValue(value: unknown): string {
  const normalized = normalizeInlineText(value);
  return normalized || '(empty)';
}

function formatClassValue(value: readonly string[] | null | undefined): string {
  const normalized = (value ?? [])
    .map((item) => normalizePathValue(item))
    .filter(Boolean)
    .join(' ');
  return normalized || '(empty)';
}

function formatDebugSource(
  debugSource:
    | {
        file: string;
        line?: number;
        column?: number;
        componentName?: string;
      }
    | null
    | undefined,
): string {
  if (!debugSource?.file) return '';
  const location = [debugSource.file, debugSource.line, debugSource.column]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(':');
  const component = debugSource.componentName ? ` (${debugSource.componentName})` : '';
  return `${location}${component}`;
}

function stripLocatorDebugSource(locator: ElementLocator): ElementLocator {
  if (!locator.debugSource) return locator;
  const { debugSource: _debugSource, ...rest } = locator;
  return rest;
}

function resolvePromptContext(
  promptContext: WebEditorV2PromptContextOptions | undefined,
  projectPath: string | undefined,
): ResolvedPromptContext {
  return {
    workspacePaths: dedupeStrings([projectPath ?? '', ...(promptContext?.workspacePaths ?? [])]),
    relatedFiles: dedupeStrings(promptContext?.relatedFiles ?? []),
    extraContext: dedupeStrings(promptContext?.extraContext ?? []),
  };
}

function appendListSection(lines: string[], title: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`- ${title}:`);
  for (const value of values) {
    lines.push(`  - ${value}`);
  }
}

export function createEditorSummariesService(options: {
  state: EditorRuntimeState;
  promptContext?: WebEditorV2PromptContextOptions;
  projectPath?: string;
  getResourceContext?: () => CommentaryHostResource | null;
  getPersistenceScope?: () => PrototypeEditCommentsPersistenceScope | null;
  getPersistedPrototypeCommentsDocument?: () => PrototypeEditCommentsDocument | null;
  buildCopyPromptOverride?: (context: CommentaryCopyPromptContext) => string;
  getCommentarySkillOptions?: () => readonly CommentarySkillOption[];
}): EditorSummariesService {
  const { state, buildCopyPromptOverride } = options;
  const promptContext = resolvePromptContext(options.promptContext, options.projectPath);
  const getResourceContext = options.getResourceContext ?? (() => null);
  const readPersistedPrototypeCommentsDocument =
    options.getPersistedPrototypeCommentsDocument ?? (() => null);
  const buildPromptNote = (
    note: string,
    payload: { skillIds?: readonly unknown[] | null } | null | undefined,
  ) => buildPromptNoteWithSkills(note, payload, options.getCommentarySkillOptions?.() ?? []);

  function resolvePromptPageUrl(): string {
    if (typeof window === 'undefined') return '';
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('editor');
      const nextSearch = url.searchParams.toString();
      url.search = nextSearch ? `?${nextSearch}` : '';
      return url.toString();
    } catch {
      return window.location.href
        .replace(/([?&])editor=webEditorV2(&)?/, (_match, prefix, suffix) => {
          if (prefix === '?' && suffix) return '?';
          return '';
        })
        .replace(/\?$/, '');
    }
  }

  function resolvePageScopeFromLocation(): string {
    if (typeof window === 'undefined') return '';
    try {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      for (const key of ['editor', 'axhubPane', 'axhubQuickEditContext', 'agentToolbar']) {
        params.delete(key);
      }
      const sortedParams = new URLSearchParams();
      Array.from(params.entries())
        .sort(
          ([leftKey, leftValue], [rightKey, rightValue]) =>
            leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
        )
        .forEach(([key, value]) => sortedParams.append(key, value));
      const search = sortedParams.toString();
      return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    } catch {
      return String(window.location.pathname ?? '').trim();
    }
  }

  function resolveCurrentPageScope(): string {
    const resource = resolveResourceContext();
    return (
      readResourceMetaString(resource, 'commentPageScope') ||
      readResourceMetaString(resource, 'pageScope') ||
      resolvePageScopeFromLocation() ||
      resolveTargetPath() ||
      ''
    );
  }

  function getUndoStack(): readonly Transaction[] {
    return state.transactionManager?.getUndoStack() ?? [];
  }

  function collectCurrentPageCompletedElementKeys(): Set<string> {
    const document = resolvePersistedPrototypeCommentsDocument();
    const currentPageScope = normalizePathValue(resolveCurrentPageScope());
    const completedElementKeys = new Set<string>();

    for (const comment of document?.comments ?? []) {
      if (comment.state !== 'completed') continue;
      const commentPageScope = normalizePathValue(comment.pageScope);
      if (commentPageScope && commentPageScope !== currentPageScope) continue;
      const runtimeMeta = Array.from(state.editMetaByKey.values()).find(
        (meta) => meta.commentId === comment.id,
      );
      const element = runtimeMeta ? null : locateElement(comment.locator);
      const elementKey = runtimeMeta?.elementKey || (element?.isConnected
        ? resolveElementKey(element)
        : locatorKey(comment.locator));
      if (elementKey) {
        completedElementKeys.add(elementKey);
      }
    }

    return completedElementKeys;
  }

  function isCompletedCurrentPageComment(elementKey: string): boolean {
    return collectCurrentPageCompletedElementKeys().has(String(elementKey ?? '').trim());
  }

  function getActiveTransactions(): readonly Transaction[] {
    const completedElementKeys = collectCurrentPageCompletedElementKeys();
    return filterUnprocessedTransactions(state, getUndoStack()).filter((transaction) => {
      const elementKey = String(
        transaction.elementKey ?? locatorKey(transaction.targetLocator),
      ).trim();
      return !completedElementKeys.has(elementKey);
    });
  }

  function resolveElementKey(element: Element | null): string {
    if (!element || !element.isConnected) return '';
    const textCommentMeta = resolveTextCommentElementMeta(state, element);
    if (textCommentMeta) {
      return textCommentMeta.elementKey;
    }
    const annotationIdentity = resolveAnnotationElementIdentity(element);
    if (annotationIdentity) return annotationIdentity.elementKey;
    const locator = createElementLocator(element);
    return generateStableElementKey(element, locator.shadowHostChain);
  }

  function resolveTargetPath(): string | null {
    const resource = resolveResourceContext();
    const resourcePath =
      normalizePathValue(resource?.path) ||
      readResourceMetaString(resource, 'targetPath') ||
      inferTargetPathFromCurrentFilePath(
        readResourceMetaString(resource, 'filePath') ||
          readResourceMetaString(resource, 'currentFilePath'),
      );
    if (resourcePath) return resourcePath;

    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/\/(components|prototypes)\/([^/]+)/);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  }

  function resolveCurrentFilePath(): string {
    const resource = resolveResourceContext();
    const resourceFilePath =
      readResourceMetaString(resource, 'filePath') ||
      readResourceMetaString(resource, 'currentFilePath') ||
      readResourceMetaString(resource, 'docPath');
    return resourceFilePath || '';
  }

  function hasExplicitHostFilePath(): boolean {
    const resource = resolveResourceContext();
    return Boolean(
      readResourceMetaString(resource, 'filePath') ||
        readResourceMetaString(resource, 'currentFilePath') ||
        readResourceMetaString(resource, 'docPath'),
    );
  }

  function resolvePrototypeFilePath(): string {
    const resource = resolveResourceContext();
    const resourcePrototypePath = readResourceMetaString(resource, 'prototypeFilePath');
    if (resourcePrototypePath) return resourcePrototypePath;

    const targetPath = resolveTargetPath();
    if (!targetPath || targetPath.startsWith('themes/')) return '';
    return `src/${targetPath}/index.tsx`;
  }

  function resolveResourceContext(): CommentaryHostResource | null {
    try {
      return getResourceContext() ?? null;
    } catch {
      return null;
    }
  }

  function formatSelectorPath(locator: ElementLocator | null | undefined): string {
    if (!locator) return '';
    const selectors = (locator.selectors ?? []).map((s) => String(s ?? '').trim()).filter(Boolean);
    if (selectors.length > 0) return selectors.join(' | ');
    if (locator.path?.length) return locator.path.join('>');
    return '';
  }

  function formatElementLabelFromLocator(locator: ElementLocator): string {
    const element = tryLocateElement(locator);
    if (element) {
      return generateFullElementLabel(element, locator.shadowHostChain);
    }
    const selectorPath = formatSelectorPath(locator);
    if (selectorPath) return selectorPath;
    return 'element';
  }

  function collectMoveSummariesWithKeys(
    transactions: readonly Transaction[],
  ): InternalMoveSummary[] {
    const indexed = transactions.map((tx, index) => ({ tx, index }));
    indexed.sort((a, b) => {
      const at = Number(a.tx.timestamp ?? 0);
      const bt = Number(b.tx.timestamp ?? 0);
      if (at !== bt) return at - bt;
      return a.index - b.index;
    });

    const groups = new Map<
      string,
      {
        locator: ElementLocator;
        from: NonNullable<Transaction['moveData']>['from'];
        to: NonNullable<Transaction['moveData']>['to'];
        updatedAt: number;
      }
    >();

    for (const { tx } of indexed) {
      if (tx.type !== 'move' || !tx.moveData) continue;
      const key = tx.elementKey ? String(tx.elementKey) : locatorKey(tx.targetLocator);
      const locator = (tx.after?.locator ?? tx.targetLocator) as ElementLocator;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          locator,
          from: tx.moveData.from,
          to: tx.moveData.to,
          updatedAt: Number(tx.timestamp ?? 0),
        });
      } else {
        existing.locator = locator;
        existing.to = tx.moveData.to;
        existing.updatedAt = Number(tx.timestamp ?? 0);
      }
    }

    const out = Array.from(groups.entries()).map(([elementKey, group]) => ({
      elementKey,
      label: formatElementLabelFromLocator(group.locator),
      locator: group.locator,
      selectorPath: formatSelectorPath(group.locator),
      from: group.from,
      to: group.to,
      updatedAt: group.updatedAt,
    }));

    out.sort((a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label));
    return out;
  }

  function collectMoveSummaries(transactions: readonly Transaction[]): MoveSummary[] {
    return collectMoveSummariesWithKeys(transactions).map(
      ({ elementKey: _elementKey, ...summary }) => summary,
    );
  }

  function collectTextChanges(): CommentaryTextChange[] {
    const tm = state.transactionManager;
    if (!tm) return [];

    const summaries = aggregateTransactionsByElement(getActiveTransactions());
    const out: CommentaryTextChange[] = [];
    const seen = new Set<string>();

    for (const summary of summaries) {
      const textChange = summary.netEffect.textChange;
      if (!textChange) continue;

      const before = normalizeInlineText(textChange.before);
      const after = normalizeInlineText(textChange.after);
      if (!before || !after || before === after) continue;

      const key = `${before}=>${after}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ before, after });
    }

    return out;
  }

  function collectTargetedTextChanges(): CommentaryTargetedTextChange[] {
    return aggregateTransactionsByElement(getActiveTransactions()).flatMap((summary) => {
      const textChange = summary.netEffect.textChange;
      if (!textChange) return [];

      const before = normalizeInlineText(textChange.before);
      const after = normalizeInlineText(textChange.after);
      if (before === after) return [];

      return [
        {
          elementKey: summary.elementKey,
          locator: summary.netEffect.locator,
          before,
          after,
        },
      ];
    });
  }

  function collectStyleCss(): string {
    const summaries = aggregateTransactionsByElement(getActiveTransactions());
    const rules: string[] = [];

    for (const summary of summaries) {
      const styleChanges = summary.netEffect.styleChanges;
      if (!styleChanges) continue;

      const selector =
        summary.netEffect.locator.selectors?.find((s) => String(s ?? '').trim())?.trim() ?? '';
      if (!selector) continue;

      const lines = Object.entries(styleChanges.after ?? {})
        .filter(([, value]) => String(value ?? '').trim() !== '')
        .map(([prop, value]) => `  ${prop}: ${String(value)};`);

      if (lines.length === 0) continue;
      rules.push(`${selector} {\n${lines.join('\n')}\n}`);
    }

    return rules.join('\n\n');
  }

  function collectStyleChanges(): CommentaryStyleChangeSet {
    return {
      cssText: collectStyleCss(),
    };
  }

  function collectNoteOnlyMetas(summarizedKeys: ReadonlySet<string>): Array<{
    elementKey: string;
    label: string;
    locator: ElementLocator;
    note: string;
    skillIds?: string[];
    actions: string[];
    imageAssetPaths: string[];
    targetScreenshotAssetPath: string;
    dirtySince: number;
  }> {
    return Array.from(state.editMetaByKey.values())
      .filter((meta) => !isCompletedCurrentPageComment(meta.elementKey))
      .map((meta) => ({
        elementKey: String(meta.elementKey),
        label: meta.label,
        locator: meta.locator,
        note: buildPromptNote(meta.note, meta),
        skillIds: meta.skillIds?.slice(),
        actions: buildMetaActionLines(meta),
        imageAssetPaths: collectPromptImageAssetPaths(meta.images),
        targetScreenshotAssetPath: collectPromptTargetScreenshotAssetPath(meta.images),
        dirtySince: Number(meta.dirtySince ?? 0),
      }))
      .filter(
        (meta) =>
          !summarizedKeys.has(meta.elementKey) &&
          (Boolean(meta.note) ||
            (meta.skillIds?.length ?? 0) > 0 ||
            meta.actions.length > 0 ||
            meta.imageAssetPaths.length > 0 ||
            Boolean(meta.targetScreenshotAssetPath)),
      )
      .sort((a, b) => b.dirtySince - a.dirtySince || a.label.localeCompare(b.label));
  }

  function collectSaveRunCommentOnlyMetas(summarizedKeys: ReadonlySet<string>): Array<{
    elementKey: string;
    label: string;
    locator: ElementLocator;
    note: string;
    skillIds?: string[];
    actions: string[];
    imageCount: number;
    imageAssetPaths: string[];
    targetScreenshotAssetPath: string;
    dirtySince: number;
  }> {
    return Array.from(state.editMetaByKey.values())
      .filter((meta) => !isCompletedCurrentPageComment(meta.elementKey))
      .map((meta) => ({
        elementKey: String(meta.elementKey),
        label: meta.label,
        locator: meta.locator,
        note: buildPromptNote(meta.note, meta),
        skillIds: meta.skillIds?.slice(),
        actions: buildMetaActionLines(meta),
        imageCount: Array.isArray(meta.images)
          ? meta.images.filter((image) => image.source !== 'target-screenshot').length
          : 0,
        imageAssetPaths: collectPromptImageAssetPaths(meta.images),
        targetScreenshotAssetPath: collectPromptTargetScreenshotAssetPath(meta.images),
        dirtySince: Number(meta.dirtySince ?? 0),
      }))
      .filter(
        (meta) =>
          !summarizedKeys.has(meta.elementKey) &&
          (Boolean(meta.note) ||
            (meta.skillIds?.length ?? 0) > 0 ||
            meta.imageCount > 0 ||
            Boolean(meta.targetScreenshotAssetPath) ||
            meta.actions.length > 0),
      )
      .sort((a, b) => b.dirtySince - a.dirtySince || a.label.localeCompare(b.label));
  }

  function readElementSnapshot(
    locator: ElementLocator,
    options: {
      fallbackLabel?: string;
      fallbackText?: string;
    } = {},
  ): ElementSnapshot {
    const element = tryLocateElement(locator);
    const isReferenceOnlyDiagram = (() => {
      try {
        return Boolean(resolveCommentaryDiagramTarget(element));
      } catch {
        return false;
      }
    })();
    const currentText = isReferenceOnlyDiagram
      ? ''
      : readElementText(element) || formatTextFallback(options.fallbackText);

    return {
      tagName: inferTagName(locator, options.fallbackLabel ?? ''),
      currentText,
    };
  }

  function formatTextFallback(value: unknown): string {
    const normalized = normalizeInlineText(value);
    return normalized;
  }

  function appendPromptContextSection(
    lines: string[],
    params: {
      includePageUrl: boolean;
      includeTargetPath?: boolean;
      currentFilePath: string;
      prototypeFilePath?: string;
    },
  ): void {
    const pageUrl = params.includePageUrl ? resolvePromptPageUrl() : '';
    const targetPath = params.includeTargetPath ? resolveTargetPath() : null;

    lines.push('任务上下文:');
    if (pageUrl) lines.push(`- 页面地址: ${pageUrl}`);
    if (targetPath) lines.push(`- 目标目录: ${targetPath}`);
    if (params.currentFilePath) lines.push(`- 当前实现文件: ${params.currentFilePath}`);
    if (params.prototypeFilePath) lines.push(`- 原型文件: ${params.prototypeFilePath}`);
    appendListSection(lines, '工作区路径', promptContext.workspacePaths);
    appendListSection(lines, '补充相关文件', promptContext.relatedFiles);
    appendListSection(lines, '补充上下文', promptContext.extraContext);
  }

  function appendGlobalConstraints(lines: string[]): void {
    lines.push('约束: 元素描述仅用于定位，只改动明确指出的内容，其余保持不动。');
  }

  function resolveAnnotationPromptContext(locator: ElementLocator): AnnotationPromptContext | null {
    const nodeId =
      resolveAnnotationNodeIdFromLocator(locator) ||
      (() => {
        const element = tryLocateElement(locator);
        if (readElementAttr(element, ANNOTATION_PANEL_TARGET_ATTR) !== 'true') return '';
        return readElementAttr(element, ANNOTATION_PANEL_NODE_ID_ATTR);
      })();
    if (!nodeId) return null;

    return {
      nodeId,
      node: readAnnotationSourceNode(nodeId),
    };
  }

  function appendAnnotationPromptContext(lines: string[], context: AnnotationPromptContext): void {
    const node = context.node;

    lines.push('  - 当前选择: @axhub/annotation 标注节点');
    lines.push(`  - 节点 ID: ${context.nodeId}`);

    const nodeIndex = normalizePathValue(node?.index);
    if (nodeIndex) lines.push(`  - 节点序号: ${nodeIndex}`);

    const nodeLocator = formatAnnotationLocator(node?.locator);
    if (nodeLocator) lines.push(`  - 节点定位: ${nodeLocator}`);

    const aiPrompt = normalizeInlineText(node?.aiPrompt);
    if (aiPrompt) lines.push(`  - 节点提示: ${aiPrompt}`);

    const availablePanels = resolveAnnotationAvailablePanels(node);
    if (availablePanels.length > 0) lines.push(`  - 可用面板: ${availablePanels.join(', ')}`);

    const annotationText = truncateInlineText(
      normalizeInlineText(node?.annotationText),
      ANNOTATION_TEXT_MAX_LENGTH,
    );
    if (annotationText) lines.push(`  - 节点内容: ${annotationText}`);

    const runtimeState = readAnnotationProtoDevState();
    const controls = Array.isArray(node?.controls)
      ? node.controls
          .filter(isPlainObject)
          .map((control) => formatAnnotationControl(control, runtimeState))
          .filter(Boolean)
      : [];
    if (controls.length > 0) {
      lines.push('  - 节点控件:');
      for (const control of controls) {
        lines.push(`    - ${control}`);
      }
    }

    lines.push(
      '  - 定位说明: 当前选中的是标注面板；请根据这个标注节点的 locator 定位真实原型元素，不要把标注面板本身当作修改对象。',
    );
  }

  function appendChangeItem(
    lines: string[],
    params: {
      index: number;
      locator: ElementLocator;
      fallbackLabel?: string;
      fallbackText?: string;
      debugFileHint?: string;
      pageScope?: string;
      imageAssetPaths?: readonly string[];
      targetScreenshotAssetPath?: string;
      actions: string[];
      note?: string;
    },
  ): void {
    const annotationContext = resolveAnnotationPromptContext(params.locator);
    const snapshot = readElementSnapshot(params.locator, {
      fallbackLabel: params.fallbackLabel,
      fallbackText: params.fallbackText,
    });
    const selectorPath = formatSelectorPath(params.locator);

    lines.push(`- 修改项 ${params.index}`);
    if (annotationContext) {
      appendAnnotationPromptContext(lines, annotationContext);
    } else {
      if (snapshot.tagName) lines.push(`  - 当前元素标签: ${snapshot.tagName}`);
      if (snapshot.currentText) lines.push(`  - 当前元素文本: ${snapshot.currentText}`);
      if (selectorPath) lines.push(`  - 元素定位: ${selectorPath}`);
    }
    if (params.pageScope) lines.push(`  - 页面范围: ${params.pageScope}`);
    if (params.debugFileHint) lines.push(`  - 可能相关文件: ${params.debugFileHint}`);
    const imageAssetPaths = dedupeStrings(params.imageAssetPaths ?? []);
    const targetScreenshotAssetPath = normalizePathValue(params.targetScreenshotAssetPath);
    if (targetScreenshotAssetPath) {
      lines.push(`  - 目标截图（用于精确定位当前批注元素）：${targetScreenshotAssetPath}`);
    }
    if (imageAssetPaths.length > 0) {
      lines.push(`  - 本地图片素材: ${imageAssetPaths.join(', ')}`);
    }
    const allActions = [...params.actions];
    if (
      imageAssetPaths.length > 0 &&
      !allActions.some((action) => String(action ?? '').includes('本地图片素材'))
    ) {
      allActions.push('请结合本地图片素材调整当前元素');
    }
    if (params.note) allActions.push(params.note);
    for (const action of allActions) {
      for (const line of String(action ?? '')
        .replace(/\r\n/g, '\n')
        .split('\n')) {
        const normalizedLine = line.trim();
        if (!normalizedLine) continue;
        lines.push(`  → ${normalizedLine}`);
      }
    }
  }

  /**
   * Format a text comment item with rich context for AI source-file location.
   */
  function appendTextCommentItem(
    lines: string[],
    params: {
      index: number;
      comment: TextComment;
      note?: string;
    },
  ): void {
    const { comment } = params;
    lines.push(`- 批注项 ${params.index}`);
    lines.push(`  - 批注文本: 「${comment.selectedText}」`);
    if (comment.contextBefore) lines.push(`  - 文本前文: "...${comment.contextBefore}"`);
    if (comment.contextAfter) lines.push(`  - 文本后文: "${comment.contextAfter}..."`);
    if (comment.tagPath.length > 0) lines.push(`  - 标签路径: ${comment.tagPath.join(' > ')}`);
    if (comment.segments.length > 1) {
      lines.push(`  - 跨标签片段:`);
      for (const seg of comment.segments) {
        lines.push(`    - [${seg.tags.join(' > ')}]: "${seg.text}"`);
      }
    }
    if (params.note) lines.push(`  → ${params.note}`);
  }

  /** Check if an elementKey belongs to a text comment */
  function isTextCommentKey(key: string): boolean {
    return key.startsWith('text-comment::');
  }

  /** Look up the TextComment for a text-comment:: key from state */
  function findTextComment(elementKey: string): TextComment | null {
    if (state.activeTextComment?.id === elementKey) return state.activeTextComment;
    return state.textCommentManager?.getComments().get(elementKey) ?? null;
  }

  function buildSummaryActionLines(
    summary: ReturnType<typeof aggregateTransactionsByElement>[number],
  ): string[] {
    const actionLines: string[] = [];

    const textChange = summary.netEffect.textChange;
    if (textChange) {
      actionLines.push(
        `文本内容 "${formatTextValue(textChange.before)}" -> "${formatTextValue(textChange.after)}"`,
      );
    }

    const classChanges = summary.netEffect.classChanges;
    if (classChanges) {
      actionLines.push(
        `class "${formatClassValue(classChanges.before)}" -> "${formatClassValue(classChanges.after)}"`,
      );
    }

    const styleChanges = summary.netEffect.styleChanges;
    if (styleChanges) {
      const keys = new Set<string>([
        ...Object.keys(styleChanges.before ?? {}),
        ...Object.keys(styleChanges.after ?? {}),
      ]);
      for (const prop of Array.from(keys).sort()) {
        const before = String((styleChanges.before ?? {})[prop] ?? '').trim();
        const after = String((styleChanges.after ?? {})[prop] ?? '').trim();
        if (before === after) continue;
        actionLines.push(
          `样式 ${prop}: "${formatStyleValue(before)}" -> "${formatStyleValue(after)}"`,
        );
      }
    }

    return actionLines;
  }

  function buildMetaActionLines(
    meta:
      | {
          tweakSummaryLines?: string[];
        }
      | null
      | undefined,
  ): string[] {
    if (!meta) return [];
    return [...(meta.tweakSummaryLines ?? [])];
  }

  function resolvePersistedPrototypeCommentsDocument(): PrototypeEditCommentsDocument | null {
    try {
      const document = readPersistedPrototypeCommentsDocument();
      if (
        !document ||
        document.kind !== 'prototype-edit-comments' ||
        !Array.isArray(document.comments)
      ) {
        return null;
      }
      return document;
    } catch {
      return null;
    }
  }

  function buildPersistedCommentActionLines(comment: PrototypeEditCommentEntry): string[] {
    const actionLines: string[] = [];

    const tweakLines = Array.isArray(comment.tweak?.summaryLines)
      ? comment.tweak.summaryLines.map((line) => normalizePathValue(line)).filter(Boolean)
      : [];
    actionLines.push(...tweakLines);

    const textChange = comment.textChange;
    if (textChange && String(textChange.before ?? '') !== String(textChange.after ?? '')) {
      actionLines.push(
        `文本内容 "${formatTextValue(textChange.before)}" -> "${formatTextValue(textChange.after)}"`,
      );
    }

    const styleChanges = comment.styleChanges;
    if (styleChanges) {
      const keys = new Set<string>([
        ...Object.keys(styleChanges.before ?? {}),
        ...Object.keys(styleChanges.after ?? {}),
      ]);
      for (const prop of Array.from(keys).sort()) {
        const before = String((styleChanges.before ?? {})[prop] ?? '').trim();
        const after = String((styleChanges.after ?? {})[prop] ?? '').trim();
        if (before === after) continue;
        actionLines.push(
          `样式 ${prop}: "${formatStyleValue(before)}" -> "${formatStyleValue(after)}"`,
        );
      }
    }

    return actionLines;
  }

  function collectPersistedPrototypeCommentMetas(): CopyPromptPersistedCommentMeta[] {
    const document = resolvePersistedPrototypeCommentsDocument();
    if (!document) return [];
    const images = Array.isArray(document.images) ? document.images : [];

    return document.comments
      .filter((comment) => comment.state !== 'completed')
      .map((comment) => {
        const runtimeMeta = Array.from(state.editMetaByKey.values()).find(
          (meta) => meta.commentId === comment.id,
        );
        const element = runtimeMeta ? null : locateElement(comment.locator);
        const elementKey = runtimeMeta?.elementKey || (element?.isConnected
          ? resolveElementKey(element)
          : locatorKey(comment.locator));
        return {
          elementKey,
          label:
            String(runtimeMeta?.label ?? '').trim() ||
            String(comment.label ?? '').trim() ||
            'element',
          locator: comment.locator,
          pageScope: String(comment.pageScope ?? '').trim(),
          note: buildPromptNote(comment.comment ?? '', comment),
          skillIds: comment.skillIds?.slice(),
          actions: buildPersistedCommentActionLines(comment),
          imageAssetPaths: collectPersistedImageAssetPathsForComment(images, comment),
          targetScreenshotAssetPath: collectPersistedTargetScreenshotAssetPathForComment(
            images,
            comment,
          ),
        };
      })
      .filter(
        (comment) =>
          Boolean(comment.locator) &&
          (Boolean(comment.note) ||
            (comment.skillIds?.length ?? 0) > 0 ||
            comment.actions.length > 0 ||
            comment.imageAssetPaths.length > 0 ||
            Boolean(comment.targetScreenshotAssetPath)),
      );
  }

  function isPersistedCurrentPageMeta(
    meta: Pick<CopyPromptPersistedCommentMeta, 'pageScope'>,
    currentPageScope: string,
  ): boolean {
    const normalizedPageScope = normalizePathValue(meta.pageScope);
    const normalizedCurrentPageScope = normalizePathValue(currentPageScope);
    if (!normalizedPageScope) return true;
    return Boolean(
      normalizedCurrentPageScope && normalizedPageScope === normalizedCurrentPageScope,
    );
  }

  function buildDefaultCopyPrompt(): string {
    const undoStack = getActiveTransactions();
    const summaries = aggregateTransactionsByElement(undoStack);
    const moveSummaries = collectMoveSummaries(undoStack);
    const persistedCommentMetas = collectPersistedPrototypeCommentMetas();
    const noteOnlyMetas = collectNoteOnlyMetas(
      new Set(summaries.map((summary) => String(summary.elementKey))),
    );
    const currentPageScope = resolveCurrentPageScope();
    const hasCurrentPageRuntimeItems =
      summaries.length > 0 || noteOnlyMetas.length > 0 || moveSummaries.length > 0;
    const effectivePersistedCommentMetas = hasCurrentPageRuntimeItems
      ? persistedCommentMetas.filter((meta) => !isPersistedCurrentPageMeta(meta, currentPageScope))
      : persistedCommentMetas;
    if (
      effectivePersistedCommentMetas.length === 0 &&
      summaries.length === 0 &&
      noteOnlyMetas.length === 0 &&
      moveSummaries.length === 0
    ) {
      return '';
    }

    const currentFilePath = resolveCurrentFilePath();
    const prototypeFilePath = resolvePrototypeFilePath();
    const includeDebugFileHint = !hasExplicitHostFilePath();
    const isDocComment =
      currentFilePath.toLowerCase().endsWith('.md') ||
      readResourceMetaString(resolveResourceContext(), 'docType') !== '';
    const lines: string[] = [];

    if (isDocComment) {
      lines.push('请根据以下 Markdown 文档预览上的批注，在代码库中完成对应更新。');
    } else {
      lines.push('请根据以下页面内容批注，在代码中实现对应改动。');
    }
    lines.push('');
    appendPromptContextSection(lines, {
      includePageUrl: true,
      currentFilePath,
    });
    lines.push('');
    if (isDocComment) {
      lines.push('全局约束:');
      lines.push('- 当前操作对象是 Markdown 文档预览，不是页面源码 DOM。');
      lines.push(`- 所有批注都要优先落实到文档文件 ${currentFilePath || '(unknown)'}。`);
      lines.push('- 未明确指出的内容不要擅自改写。');
      lines.push('');
      lines.push('批注列表:');
    } else {
      appendGlobalConstraints(lines);
      lines.push('');
      lines.push('修改列表:');
    }

    let itemIndex = 1;

    for (const meta of effectivePersistedCommentMetas) {
      appendChangeItem(lines, {
        index: itemIndex,
        locator: meta.locator,
        fallbackLabel: meta.label,
        actions: meta.actions,
        pageScope: meta.pageScope,
        imageAssetPaths: meta.imageAssetPaths,
        targetScreenshotAssetPath: meta.targetScreenshotAssetPath,
        note: meta.note,
      });
      itemIndex += 1;
    }

    for (const summary of summaries) {
      const meta = state.editMetaByKey.get(summary.elementKey);
      const note = buildPromptNote(meta?.note ?? '', meta);
      const actions = [...buildMetaActionLines(meta), ...buildSummaryActionLines(summary)];
      const imageAssetPaths = collectPromptImageAssetPaths(meta?.images);
      const targetScreenshotAssetPath = collectPromptTargetScreenshotAssetPath(meta?.images);

      appendChangeItem(lines, {
        index: itemIndex,
        locator: summary.netEffect.locator,
        fallbackLabel: summary.fullLabel || summary.label,
        fallbackText:
          summary.netEffect.textChange?.after ?? summary.netEffect.textChange?.before ?? '',
        debugFileHint: includeDebugFileHint ? formatDebugSource(summary.debugSource) : '',
        pageScope: currentPageScope,
        imageAssetPaths,
        targetScreenshotAssetPath,
        actions,
        note,
      });
      itemIndex += 1;
    }

    for (const meta of noteOnlyMetas) {
      const comment = isTextCommentKey(meta.elementKey) ? findTextComment(meta.elementKey) : null;

      if (comment) {
        appendTextCommentItem(lines, {
          index: itemIndex,
          comment,
          note: meta.note,
        });
      } else if (
        meta.note ||
        (meta.skillIds?.length ?? 0) > 0 ||
        meta.actions.length > 0 ||
        meta.imageAssetPaths.length > 0 ||
        Boolean(meta.targetScreenshotAssetPath)
      ) {
        appendChangeItem(lines, {
          index: itemIndex,
          locator: meta.locator,
          fallbackLabel: meta.label,
          actions: meta.actions,
          pageScope: currentPageScope,
          imageAssetPaths: meta.imageAssetPaths,
          targetScreenshotAssetPath: meta.targetScreenshotAssetPath,
          note: meta.note,
        });
      }
      itemIndex += 1;
    }

    if (moveSummaries.length > 0) {
      lines.push('');
      lines.push('结构移动列表:');
      for (const move of moveSummaries) {
        appendChangeItem(lines, {
          index: itemIndex,
          locator: move.locator,
          fallbackLabel: move.label,
          actions: [
            `结构位置: ${formatMoveLocation(move.from, formatSelectorPath)} -> ${formatMoveLocation(move.to, formatSelectorPath)}`,
          ],
        });
        itemIndex += 1;
      }
    }

    lines.push('');
    lines.push('输出要求:');
    if (isDocComment) {
      lines.push('- 优先说明修改了哪些文档文件；若同步了原型，也一并列出。');
      lines.push('- 给出关键改动摘要，以及仍需人工验证的差异点。');
    } else {
      lines.push('- 用简单易懂的话说明修改了什么。');
      lines.push('- 如果无法定位文件，请说明缺失了哪些关键信息。');
    }

    return lines.join('\n');
  }

  function collectModifiedElementSummaries(): CommentaryModifiedElementSummary[] {
    return Array.from(state.editMetaByKey.values())
      .filter(
        (meta) =>
          meta.dirtySince !== null && !isCompletedCurrentPageComment(meta.elementKey),
      )
      .map((meta) => ({
        ...(meta.commentId ? { commentId: meta.commentId } : {}),
        elementKey: meta.elementKey,
        locator: stripLocatorDebugSource(meta.locator),
        label: meta.label,
        note: buildPromptNote(meta.note, meta),
        skillIds: meta.skillIds?.slice(),
        imageCount: meta.images.filter((image) => image.source !== 'target-screenshot').length,
        changeKinds: meta.changeKinds.slice(),
      }));
  }

  function getCopyPromptContext(): CommentaryCopyPromptContext | null {
    const defaultPrompt = buildDefaultCopyPrompt();
    if (!defaultPrompt) return null;

    return {
      resource: resolveResourceContext(),
      modifiedElements: collectModifiedElementSummaries(),
      textChanges: collectTextChanges(),
      styleChanges: collectStyleChanges(),
      taskContext: {
        pageUrl: resolvePromptPageUrl(),
        targetPath: resolveTargetPath() ?? '',
        filePath: resolveCurrentFilePath(),
        prototypeFilePath: resolvePrototypeFilePath(),
        currentFilePath: resolveCurrentFilePath(),
      },
      defaultPrompt,
    };
  }

  function buildCopyPrompt(): string {
    const defaultPrompt = buildDefaultCopyPrompt();
    if (!defaultPrompt) return '';

    if (buildCopyPromptOverride) {
      try {
        const context = getCopyPromptContext();
        if (context) {
          return buildCopyPromptOverride(context);
        }
      } catch (error) {
        console.warn('[Commentary] Host buildCopyPrompt failed, falling back to default:', error);
      }
    }

    return defaultPrompt;
  }

  function getCopyPromptFilteredNotice(): string | undefined {
    return undefined;
  }

  function buildSaveRunPromptFromParts(params: {
    mode?: 'initial' | 'append';
    summaries: ReturnType<typeof aggregateTransactionsByElement>;
    commentOnlyMetas: SaveRunCommentMeta[];
    moveSummaries: readonly MoveSummary[];
  }): string {
    const { summaries, commentOnlyMetas, moveSummaries } = params;
    const mode = params.mode ?? 'initial';
    if (summaries.length === 0 && commentOnlyMetas.length === 0 && moveSummaries.length === 0)
      return '';

    const currentFilePath = resolveCurrentFilePath();
    const includeDebugFileHint = !hasExplicitHostFilePath();
    const lines: string[] = [];

    if (mode === 'append') {
      lines.push('继续修改。不要提问，直接执行。');
    } else {
      lines.push(
        '请直接执行以下代码修改。要求：尽快处理，简洁回复（只列改了什么文件和结果），不要和用户交互提问，不使用非必要的技能和 MCP。完成后回复完成即可，阻塞时简短说明。',
      );
    }
    lines.push('收到消息后，按以下格式立即回复：我开始修改 xxx 节点');
    lines.push('');
    appendPromptContextSection(lines, {
      includePageUrl: true,
      includeTargetPath: true,
      currentFilePath,
      prototypeFilePath: resolvePrototypeFilePath(),
    });
    lines.push('');
    if (mode !== 'append') {
      appendGlobalConstraints(lines);
      lines.push('');
    }
    lines.push('修改列表:');

    let itemIndex = 1;

    for (const summary of summaries) {
      const meta = state.editMetaByKey.get(summary.elementKey);
      const note = buildPromptNote(meta?.note ?? '', meta);
      const actions = [...buildMetaActionLines(meta), ...buildSummaryActionLines(summary)];
      const imageAssetPaths = collectPromptImageAssetPaths(meta?.images);
      const targetScreenshotAssetPath = collectPromptTargetScreenshotAssetPath(meta?.images);

      appendChangeItem(lines, {
        index: itemIndex,
        locator: summary.netEffect.locator,
        fallbackLabel: summary.fullLabel || summary.label,
        fallbackText:
          summary.netEffect.textChange?.after ?? summary.netEffect.textChange?.before ?? '',
        debugFileHint: includeDebugFileHint ? formatDebugSource(summary.debugSource) : '',
        imageAssetPaths,
        targetScreenshotAssetPath,
        actions,
        note,
      });
      itemIndex += 1;
    }

    for (const meta of commentOnlyMetas) {
      const comment = isTextCommentKey(meta.elementKey) ? findTextComment(meta.elementKey) : null;

      if (comment) {
        appendTextCommentItem(lines, {
          index: itemIndex,
          comment,
          note: meta.note,
        });
      } else {
        const actions = [...meta.actions];
        appendChangeItem(lines, {
          index: itemIndex,
          locator: meta.locator,
          fallbackLabel: meta.label,
          imageAssetPaths: meta.imageAssetPaths,
          targetScreenshotAssetPath: meta.targetScreenshotAssetPath,
          actions,
          note: meta.note,
        });
      }
      itemIndex += 1;
    }

    if (moveSummaries.length > 0) {
      lines.push('');
      lines.push('结构移动列表:');
      for (const move of moveSummaries) {
        appendChangeItem(lines, {
          index: itemIndex,
          locator: move.locator,
          fallbackLabel: move.label,
          actions: [
            `结构位置: ${formatMoveLocation(move.from, formatSelectorPath)} -> ${formatMoveLocation(move.to, formatSelectorPath)}`,
          ],
        });
        itemIndex += 1;
      }
    }

    return lines.join('\n');
  }

  function buildSaveRunPrompt(): string {
    const undoStack = getActiveTransactions();
    const summaries = aggregateTransactionsByElement(undoStack);
    const moveSummariesWithKeys = collectMoveSummariesWithKeys(undoStack);
    const moveSummaries = moveSummariesWithKeys.map(
      ({ elementKey: _elementKey, ...summary }) => summary,
    );
    const commentOnlyMetas = collectSaveRunCommentOnlyMetas(
      new Set(summaries.map((summary) => String(summary.elementKey))),
    );
    return buildSaveRunPromptFromParts({
      mode: 'initial',
      summaries,
      commentOnlyMetas,
      moveSummaries,
    });
  }

  function buildAppendSaveRunPrompt(): string {
    const undoStack = getActiveTransactions();
    const summaries = aggregateTransactionsByElement(undoStack);
    const moveSummariesWithKeys = collectMoveSummariesWithKeys(undoStack);
    const moveSummaries = moveSummariesWithKeys.map(
      ({ elementKey: _elementKey, ...summary }) => summary,
    );
    const commentOnlyMetas = collectSaveRunCommentOnlyMetas(
      new Set(summaries.map((summary) => String(summary.elementKey))),
    );
    return buildSaveRunPromptFromParts({
      mode: 'append',
      summaries,
      commentOnlyMetas,
      moveSummaries,
    });
  }

  function buildSaveRunPromptForElement(element: Element | null): string {
    const elementKey = resolveElementKey(element);
    return buildSaveRunPromptForElementKey(elementKey);
  }

  function buildSaveRunPromptForElementKey(elementKey: string | null | undefined): string {
    const normalizedElementKey = String(elementKey || '').trim();
    if (!normalizedElementKey) return '';

    const undoStack = getActiveTransactions();
    const summaries = aggregateTransactionsByElement(undoStack).filter(
      (summary) => String(summary.elementKey) === normalizedElementKey,
    );
    const commentOnlyMetas = collectSaveRunCommentOnlyMetas(
      new Set(summaries.map((summary) => String(summary.elementKey))),
    ).filter((meta) => meta.elementKey === normalizedElementKey);
    const moveSummaries = collectMoveSummariesWithKeys(undoStack)
      .filter((summary) => summary.elementKey === normalizedElementKey)
      .map(({ elementKey: _elementKey, ...summary }) => summary);
    return buildSaveRunPromptFromParts({
      mode: 'initial',
      summaries,
      commentOnlyMetas,
      moveSummaries,
    });
  }

  function buildAppendSaveRunPromptForElement(element: Element | null): string {
    const elementKey = resolveElementKey(element);
    if (!elementKey) return '';

    const undoStack = getActiveTransactions();
    const summaries = aggregateTransactionsByElement(undoStack).filter(
      (summary) => String(summary.elementKey) === elementKey,
    );
    const commentOnlyMetas = collectSaveRunCommentOnlyMetas(
      new Set(summaries.map((summary) => String(summary.elementKey))),
    ).filter((meta) => meta.elementKey === elementKey);
    const moveSummaries = collectMoveSummariesWithKeys(undoStack)
      .filter((summary) => summary.elementKey === elementKey)
      .map(({ elementKey: _elementKey, ...summary }) => summary);
    return buildSaveRunPromptFromParts({
      mode: 'append',
      summaries,
      commentOnlyMetas,
      moveSummaries,
    });
  }

  function getCopyPromptBlockReason(): string | undefined {
    const undoStack = getActiveTransactions();

    for (const tx of undoStack) {
      if (tx.type === 'structure') {
        return '暂不支持应用结构操作';
      }
      if (tx.type !== 'style' && tx.type !== 'text' && tx.type !== 'class' && tx.type !== 'move') {
        return `暂不支持应用 "${tx.type}" 事务`;
      }
    }

    if (!buildCopyPrompt()) return '没有可生成 prompt 的更改';

    return undefined;
  }

  function getSaveRunPromptBlockReason(): string | undefined {
    const undoStack = getActiveTransactions();

    for (const tx of undoStack) {
      if (tx.type === 'structure') {
        return '暂不支持执行结构操作';
      }
      if (tx.type !== 'style' && tx.type !== 'text' && tx.type !== 'class' && tx.type !== 'move') {
        return `暂不支持执行 "${tx.type}" 事务`;
      }
    }

    if (!buildSaveRunPrompt()) return '当前没有可发送给 AI 的编辑元素';

    return undefined;
  }

  function getSaveRunPromptForElementBlockReason(element: Element | null): string | undefined {
    if (!element || !element.isConnected) {
      return '当前元素已失效，请重新选择后再试。';
    }

    const elementKey = resolveElementKey(element);
    if (!elementKey) {
      return '当前元素已失效，请重新选择后再试。';
    }

    for (const tx of getActiveTransactions()) {
      const txElementKey = String(tx.elementKey ?? locatorKey(tx.targetLocator)).trim();
      if (txElementKey !== elementKey) continue;
      if (tx.type === 'structure') {
        return '暂不支持执行当前元素的结构操作';
      }
      if (tx.type !== 'style' && tx.type !== 'text' && tx.type !== 'class' && tx.type !== 'move') {
        return `暂不支持执行当前元素的 "${tx.type}" 事务`;
      }
    }

    if (!buildSaveRunPromptForElement(element)) {
      return '当前元素没有可发送给 AI 的编辑';
    }

    return undefined;
  }

  return {
    resolveTargetPath,
    resolveCurrentFilePath,
    resolvePrototypeFilePath,
    resolveResourceContext,
    formatSelectorPath,
    formatElementLabelFromLocator,
    collectTextChanges,
    collectTargetedTextChanges,
    collectModifiedElementSummaries,
    collectStyleCss,
    collectStyleChanges,
    collectMoveSummaries,
    buildSaveRunPrompt,
    buildAppendSaveRunPrompt,
    buildSaveRunPromptForElement,
    buildSaveRunPromptForElementKey,
    buildAppendSaveRunPromptForElement,
    buildCopyPrompt,
    getCopyPromptContext,
    getCopyPromptFilteredNotice,
    getCopyPromptBlockReason,
    getSaveRunPromptBlockReason,
    getSaveRunPromptForElementBlockReason,
  };
}
