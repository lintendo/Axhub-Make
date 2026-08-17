import type {
  ElementLocator,
  CommentaryAnnotationSaveStatus,
  CommentaryClearEditsScope,
  CommentaryClearEditsTarget,
  CommentaryHostResource,
  PrototypeEditCommentEntry,
  PrototypeEditCommentImageEntry,
  PrototypeEditCommentTombstone,
  PrototypeEditCommentStatus,
  PrototypeEditCommentsDocument,
  PrototypeEditCommentsPersistenceAdapter,
  PrototypeEditCommentsPersistenceScope,
  PrototypeEditCommentsWriteReason,
  WebEditorElementKey,
} from '../../web-editor-types';
import { locateElement, locatorKey } from '../locator';
import { generateFullElementLabel, generateStableElementKey } from '../element-key';
import {
  DEFAULT_COMMENT_SHORTCUT_SETTINGS,
  sanitizeCommentShortcutSettings,
  type CommentShortcutSettings,
} from './comment-shortcut-settings';
import {
  DEFAULT_WEB_EDITOR_UI_SETTINGS,
  type WebEditorUiSettings,
} from './ui-settings';
import {
  preparePersistedWebEditorUiSettings,
  readPersistedWebEditorUiSettings,
} from './persisted-ui-settings';
import type {
  ConversationTaskTerminalTransition,
  EditorChangesService,
  EditorPersistenceService,
  PersistedConversationTask,
} from './contracts';
import {
  ensureElementEditCommentId,
  type EditorRuntimeState,
  type ExternalEditingTaskRef,
  type MarkerAnchor,
  type PageAgentConversationState,
  type PersistedElementAgentTaskState,
} from './state';
import { filterUnprocessedTransactions as filterTransactionsAfterProcessed } from './state';
import { normalizeMarkerAnchor } from './marker-anchor';
import type { CommentaryTweakValues } from '../../tweak/protocol';
import { normalizePromptCardSkillIds } from '../../ui/runtime/prompt-card-skills';
import {
  collectAnnotationSourceNodeIdsFromWindow,
  resolveAnnotationTargetIdentity,
} from './annotation-target';

type CachedTweakEntry = {
  summaryLines?: string[];
  baselineValues?: CommentaryTweakValues | null;
  currentValues?: CommentaryTweakValues | null;
};

type CachedMarkerEntry = MarkerAnchor & {
  dirtySince?: number | null;
};

type CachedChangeEntry = {
  commentId?: string;
  pageScope?: string;
  elementKey?: WebEditorElementKey;
  label?: string;
  locator: ElementLocator;
  textChange?: { before: string; after: string };
  styleChanges?: { before: Record<string, string>; after: Record<string, string> };
  tweak?: CachedTweakEntry;
  note?: string;
  skillIds?: string[];
  marker?: CachedMarkerEntry | null;
  state?: PrototypeEditCommentStatus;
  provider?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  updatedAt?: number | null;
  message?: string | null;
  code?: string | null;
  voiceCreateOperationId?: string;
  voiceElementKey?: string;
  voiceTargetRef?: string;
  voiceTarget?: import('../../web-editor-types').CommentaryPageElementSummary;
  anchorPlacement?: 'target';
};

type PrototypeCommentEntryDocumentShape = PrototypeEditCommentEntry;

type PrototypeEditCommentState = Pick<
  PrototypeEditCommentEntry,
  'state' | 'provider' | 'requestId' | 'sessionId' | 'updatedAt' | 'message' | 'code'
>;

type CachedChangePayload = {
  version: number;
  path: string;
  updatedAt: number;
  showMarkers?: boolean;
  entries: CachedChangeEntry[];
};

const CACHE_VERSION = 6;
const CACHE_KEY_PREFIX = 'web-editor-v2-cache:';
const MARKER_VISIBILITY_KEY_PREFIX = 'web-editor-v2-markers:';
const COMMENT_SHORTCUT_SETTINGS_KEY_PREFIX = 'web-editor-v2-comment-shortcuts:';
const UI_SETTINGS_KEY = 'web-editor-v2-ui-settings';
const AGENT_CONVERSATION_KEY_PREFIX = 'web-editor-v2-agent-conversation:';
const AGENT_TASKS_KEY_PREFIX = 'web-editor-v2-agent-tasks:';
const adapterWriteChainByStorageScope = new Map<string, Promise<void>>();

function trackAdapterWriteTail(storageScope: string, current: Promise<void>): Promise<void> {
  adapterWriteChainByStorageScope.set(storageScope, current);
  const removeSettledTail = () => {
    if (adapterWriteChainByStorageScope.get(storageScope) === current) {
      adapterWriteChainByStorageScope.delete(storageScope);
    }
  };
  void current.then(removeSettledTail, removeSettledTail);
  return current;
}

function enqueueAdapterWrite(
  scope: PrototypeEditCommentsPersistenceScope,
  write: () => void | Promise<void>,
): Promise<void> {
  const storageScope = String(scope.storageScope ?? '').trim();
  if (!storageScope) return Promise.resolve().then(write);

  const previous = adapterWriteChainByStorageScope.get(storageScope);
  if (!previous) {
    try {
      const result = write();
      if (!result || typeof result.then !== 'function') return Promise.resolve();
      return trackAdapterWriteTail(storageScope, Promise.resolve(result));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return trackAdapterWriteTail(
    storageScope,
    previous.catch(() => undefined).then(write),
  );
}

function stripLocatorDebugSource(locator: ElementLocator): ElementLocator {
  if (!locator.debugSource) return locator;
  const { debugSource: _debugSource, ...rest } = locator;
  return rest;
}

function isDeletedRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const deletedAt = Number((value as { deletedAt?: unknown }).deletedAt);
  return Number.isFinite(deletedAt) && deletedAt > 0;
}

function normalizeAnnotationPanelCacheIdentity(
  locator: ElementLocator,
): { elementKey: WebEditorElementKey; locator: ElementLocator } | null {
  const identity = resolveAnnotationTargetIdentity({
    locator,
    label: 'Annotation Panel',
  });
  if (!identity) return null;
  return {
    elementKey: identity.elementKey,
    locator: identity.locator,
  };
}

function cloneTweakValue(value: CommentaryTweakValues[string] | undefined) {
  return Array.isArray(value) ? value.slice() : value;
}

function cloneTweakValues(values: CommentaryTweakValues | null | undefined): CommentaryTweakValues | null {
  if (!values) return null;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, cloneTweakValue(value)]),
  );
}

export function createPersistenceService(options: {
  state: EditorRuntimeState;
  changes: EditorChangesService;
  getResourceContext?: () => CommentaryHostResource | null;
  getPersistenceScope?: () => PrototypeEditCommentsPersistenceScope | null;
  persistenceAdapter?: PrototypeEditCommentsPersistenceAdapter;
  commentPersistenceMode?: 'local' | 'adapter-only';
  interactionProfile?: 'design' | 'text-comment';
  getInteractionProfile?: () => 'design' | 'text-comment';
  onSaveStatusChange?: (status: CommentaryAnnotationSaveStatus) => void;
}): EditorPersistenceService {
  const { state, changes } = options;
  const getResourceContext = options.getResourceContext ?? (() => null);
  const getHostPersistenceScope = options.getPersistenceScope ?? null;
  const persistenceAdapter = options.persistenceAdapter ?? null;
  const commentPersistenceMode = options.commentPersistenceMode ?? 'local';
  const getInteractionProfile =
    options.getInteractionProfile ?? (() => options.interactionProfile ?? 'design');

  let cacheWriteTimer: number | null = null;
  let cacheRestoreInProgress = false;
  let currentAdapterDocument: PrototypeEditCommentsDocument | null = null;
  let lastAdapterDocument: PrototypeEditCommentsDocument | null = null;
  let preserveMissingCurrentScopeRecordsOnNextWrite = false;
  let saveStatus: CommentaryAnnotationSaveStatus = 'saved';
  let pendingAdapterWriteCount = 0;
  let adapterWriteSequence = 0;
  let latestSettledAdapterWriteSequence = 0;
  let latestSettledAdapterWriteSucceeded = true;
  const commentStateByCommentId = new Map<string, PrototypeEditCommentState>();
  const clearedCommentIds = new Set<string>();

  function setSaveStatus(nextStatus: CommentaryAnnotationSaveStatus): void {
    if (saveStatus === nextStatus) return;
    saveStatus = nextStatus;
    try {
      options.onSaveStatusChange?.(nextStatus);
    } catch {
      // Persistence state observers must never break the actual write.
    }
  }

  function beginAdapterWrite(): number {
    pendingAdapterWriteCount += 1;
    adapterWriteSequence += 1;
    setSaveStatus('saving');
    return adapterWriteSequence;
  }

  function finishAdapterWrite(sequence: number, succeeded: boolean): void {
    pendingAdapterWriteCount = Math.max(0, pendingAdapterWriteCount - 1);
    if (sequence >= latestSettledAdapterWriteSequence) {
      latestSettledAdapterWriteSequence = sequence;
      latestSettledAdapterWriteSucceeded = succeeded;
    }
    if (pendingAdapterWriteCount > 0) {
      setSaveStatus('saving');
      return;
    }
    setSaveStatus(latestSettledAdapterWriteSucceeded ? 'saved' : 'unsaved');
  }

  function getSaveStatus(): CommentaryAnnotationSaveStatus {
    return saveStatus;
  }

  async function enqueueTrackedAdapterWrite(
    scope: PrototypeEditCommentsPersistenceScope,
    write: () => void | Promise<void>,
  ): Promise<void> {
    const writeSequence = beginAdapterWrite();
    try {
      await enqueueAdapterWrite(scope, write);
      finishAdapterWrite(writeSequence, true);
    } catch (error) {
      finishAdapterWrite(writeSequence, false);
      throw error;
    }
  }

  function readResourceMetaString(key: string): string {
    try {
      const resource = getResourceContext();
      const value = resource?.meta?.[key];
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      return '';
    }
  }

  function inferTargetPathFromCurrentFilePath(currentFilePath: string): string {
    const normalized = String(currentFilePath ?? '').trim().replace(/\\/g, '/');
    const match = normalized.match(/^src\/(components|prototypes|themes)\/([^/]+)/);
    if (!match) return '';
    return `${match[1]}/${match[2]}`;
  }

  function resolveTargetPath(): string | null {
    try {
      const resource = getResourceContext();
      const resourcePath =
        String(resource?.path ?? '').trim() ||
        readResourceMetaString('targetPath') ||
        inferTargetPathFromCurrentFilePath(
          readResourceMetaString('filePath') || readResourceMetaString('currentFilePath'),
        );
      if (resourcePath) {
        return resourcePath;
      }
    } catch {
      // Fall back to location pathname.
    }

    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/\/(components|prototypes)\/([^/]+)/);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  }

  function resolveStorageScope(): string | null {
    const explicitScope =
      readResourceMetaString('storageScope') ||
      readResourceMetaString('filePath') ||
      readResourceMetaString('currentFilePath') ||
      readResourceMetaString('docPath') ||
      resolveTargetPath();
    if (explicitScope) {
      return explicitScope;
    }

    if (typeof window === 'undefined') return null;
    const path = String(window.location.pathname ?? '').trim();
    return path || null;
  }

  function resolvePrototypeIdFromTargetPath(targetPath: string | null | undefined): string {
    const normalized = String(targetPath ?? '').trim().replace(/\\/g, '/');
    const match = normalized.match(/^prototypes\/([^/]+)/);
    return match?.[1] ?? '';
  }

  function resolveCurrentFilePath(): string {
    return (
      readResourceMetaString('filePath') ||
      readResourceMetaString('currentFilePath') ||
      readResourceMetaString('docPath')
    );
  }

  function resolvePersistenceScope(): PrototypeEditCommentsPersistenceScope | null {
    if (getHostPersistenceScope) {
      try {
        const scope = getHostPersistenceScope();
        if (
          scope &&
          String(scope.targetPath ?? '').trim() &&
          String(scope.storageScope ?? '').trim() &&
          String(scope.prototypeId ?? '').trim() &&
          String(scope.filePath ?? '').trim()
        ) {
          return scope;
        }
      } catch {
        // Fall through to the existing prototype-derived scope.
      }
    }
    const targetPath = resolveTargetPath();
    if (!targetPath || !targetPath.startsWith('prototypes/')) {
      return null;
    }
    const storageScope = resolveStorageScope() ?? targetPath;
    const prototypeId = resolvePrototypeIdFromTargetPath(targetPath);
    if (!prototypeId) return null;
    let resource: CommentaryHostResource | null = null;
    try {
      resource = getResourceContext();
    } catch {
      resource = null;
    }

    return {
      targetPath,
      storageScope,
      prototypeId,
      filePath: resolveCurrentFilePath(),
      resource,
    };
  }

  function resolveCacheKey(): string | null {
    if (typeof window === 'undefined') return null;
    const path = resolveStorageScope() ?? '';
    const key = String(path ?? '').trim();
    if (!key) return null;
    return `${CACHE_KEY_PREFIX}${key}`;
  }

  function writeLocalCache(entries: CachedChangeEntry[], updatedAt = Date.now()): void {
    if (typeof window === 'undefined') return;
    const key = resolveCacheKey();
    if (!key) return;
    try {
      if (!entries || entries.length === 0) {
        window.localStorage.removeItem(key);
        return;
      }
      const payload: CachedChangePayload = {
        version: CACHE_VERSION,
        path: resolveStorageScope() ?? window.location.pathname ?? '',
        updatedAt,
        showMarkers: state.changeMarkersVisible,
        entries: entries.map((entry) => withCurrentPageScope(entry)),
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Best-effort only.
    }
  }

  function readCache(): CachedChangePayload | null {
    if (typeof window === 'undefined') return null;
    const key = resolveCacheKey();
    if (!key) return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedChangePayload;
      if (!parsed || Number(parsed.version ?? 0) !== CACHE_VERSION) return null;
      if (!Array.isArray(parsed.entries)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function resolveMarkerVisibilityKey(): string | null {
    if (typeof window === 'undefined') return null;
    const path = resolveStorageScope() ?? '';
    const key = String(path ?? '').trim();
    if (!key) return null;
    return `${MARKER_VISIBILITY_KEY_PREFIX}${key}`;
  }

  function readMarkerVisibility(): boolean {
    if (typeof window === 'undefined') return true;
    const cacheValue = readCache()?.showMarkers;
    if (typeof cacheValue === 'boolean') return cacheValue;

    const key = resolveMarkerVisibilityKey();
    if (!key) return true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === 'false') return false;
      if (raw === 'true') return true;
    } catch {
      // Best-effort only.
    }
    return true;
  }

  function resolveCommentShortcutSettingsKey(): string | null {
    if (typeof window === 'undefined') return null;
    const path = resolveStorageScope() ?? '';
    const key = String(path ?? '').trim();
    if (!key) return null;
    return `${COMMENT_SHORTCUT_SETTINGS_KEY_PREFIX}${key}`;
  }

  function readStorageJson<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  function writeStorageJson(key: string, value: unknown): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Best-effort only.
    }
  }

  function normalizeCommentStatus(status: string | null | undefined): PrototypeEditCommentStatus {
    if (status === 'pending' || status === 'created') return 'editing';
    if (status === 'completed') return 'completed';
    if (status === 'error') return 'error';
    return 'idle';
  }

  function isPrototypeEditCommentStatus(value: unknown): value is PrototypeEditCommentStatus {
    return value === 'idle' || value === 'editing' || value === 'completed' || value === 'error';
  }

  function normalizeNullableString(value: unknown): string | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  }

  function normalizePageScope(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeCommentId(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readDomPageScope(): string {
    if (typeof document === 'undefined') return '';
    try {
      const explicit =
        document.documentElement?.getAttribute?.('data-page-id') ||
        document.body?.getAttribute?.('data-page-id') ||
        '';
      return normalizePageScope(explicit);
    } catch {
      return '';
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
        .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
          leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
        )
        .forEach(([key, value]) => sortedParams.append(key, value));
      const search = sortedParams.toString();
      return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    } catch {
      return String(window.location.pathname ?? '').trim();
    }
  }

  function hasPageRouteSignal(pageScope: string): boolean {
    const scope = normalizePageScope(pageScope);
    if (!scope) return false;
    if (/^page[:=]/iu.test(scope)) return true;
    if (scope.includes('::page::')) return true;
    try {
      const url = new URL(scope, 'http://axhub.local');
      if (url.searchParams.has('page')) return true;
      return new URLSearchParams(url.hash.replace(/^#/, '')).has('page');
    } catch {
      return false;
    }
  }

  function isExplicitDomPageScope(pageScope: string): boolean {
    const scope = normalizePageScope(pageScope);
    return Boolean(scope && !scope.includes('/') && !scope.includes('\\') && !scope.includes('?') && !scope.includes('#'));
  }

  function shouldShowLegacyUnscopedRecords(): boolean {
    const currentPageScope = resolveCurrentPageScope();
    return !hasPageRouteSignal(currentPageScope) && !isExplicitDomPageScope(currentPageScope);
  }

  function hasPersistedStyleChanges(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const styleChanges = value as { before?: unknown; after?: unknown };
    const before = styleChanges.before && typeof styleChanges.before === 'object' && !Array.isArray(styleChanges.before)
      ? styleChanges.before as Record<string, unknown>
      : {};
    const after = styleChanges.after && typeof styleChanges.after === 'object' && !Array.isArray(styleChanges.after)
      ? styleChanges.after as Record<string, unknown>
      : {};
    const props = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const prop of props) {
      if (String(before[prop] ?? '').trim() !== String(after[prop] ?? '').trim()) {
        return true;
      }
    }
    return false;
  }

  function hasPersistedEditPayload(record: {
    textChange?: unknown;
    styleChanges?: unknown;
    tweak?: unknown;
  } | null | undefined): boolean {
    const textChange = record?.textChange as { before?: unknown; after?: unknown } | null | undefined;
    if (
      textChange &&
      typeof textChange === 'object' &&
      String(textChange.before ?? '') !== String(textChange.after ?? '')
    ) {
      return true;
    }
    if (hasPersistedStyleChanges(record?.styleChanges)) {
      return true;
    }
    const tweak = record?.tweak as { summaryLines?: unknown; baselineValues?: unknown; currentValues?: unknown } | null | undefined;
    return Boolean(
      tweak &&
      typeof tweak === 'object' &&
      (
        (Array.isArray(tweak.summaryLines) && tweak.summaryLines.length > 0) ||
        tweak.baselineValues ||
        tweak.currentValues
      ),
    );
  }

  function resolveCurrentPageScope(): string {
    return (
      readResourceMetaString('commentPageScope') ||
      readResourceMetaString('pageScope') ||
      readDomPageScope() ||
      resolvePageScopeFromLocation() ||
      resolveStorageScope() ||
      resolveTargetPath() ||
      ''
    );
  }

  function isCurrentPageScopedRecord(record: ({ pageScope?: unknown } & {
    locator?: ElementLocator;
    textChange?: unknown;
    styleChanges?: unknown;
    tweak?: unknown;
  }) | null | undefined): boolean {
    const pageScope = normalizePageScope(record?.pageScope);
    if (pageScope) return pageScope === resolveCurrentPageScope();
    if (shouldShowLegacyUnscopedRecords()) return true;
    return hasPersistedEditPayload(record) && hasConnectedLocator((record as { locator?: ElementLocator })?.locator);
  }

  function hasConnectedLocator(locator: ElementLocator | null | undefined): boolean {
    if (!locator) return false;
    try {
      return Boolean(locateElement(locator)?.isConnected);
    } catch {
      return false;
    }
  }

  function withCurrentPageScope<T extends object>(value: T): T {
    const pageScope = resolveCurrentPageScope();
    return pageScope ? ({ ...value, pageScope } as T) : value;
  }

  function normalizeElementRecordKey(value: unknown): WebEditorElementKey | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized as WebEditorElementKey : null;
  }

  function isExplicitlyClearedComment(commentId: unknown): boolean {
    const normalizedCommentId = normalizeCommentId(commentId);
    return Boolean(normalizedCommentId && clearedCommentIds.has(normalizedCommentId));
  }

  function normalizeCommentState(value: Partial<PrototypeEditCommentEntry>): PrototypeEditCommentState {
    const updatedAt = Number(value.updatedAt ?? 0);
    return {
      state: isPrototypeEditCommentStatus(value.state) ? value.state : 'idle',
      provider: normalizeNullableString(value.provider),
      requestId: normalizeNullableString(value.requestId),
      sessionId: normalizeNullableString(value.sessionId),
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : null,
      message: normalizeNullableString(value.message),
      code: normalizeNullableString(value.code),
    };
  }

  function buildCurrentCommentStates(): Map<string, PrototypeEditCommentState> {
    const commentStates = new Map(commentStateByCommentId);
    const runtimeTasks = [
      ...state.agentTaskByElementKey.values(),
      ...state.externalEditingTaskByElementKey.values(),
    ];
    for (const task of runtimeTasks) {
      if (!task?.elementKey) continue;
      const commentId = state.editMetaByKey.get(task.elementKey)?.commentId;
      if (!commentId) continue;
      commentStates.set(commentId, {
        state: normalizeCommentStatus(task.status),
        provider: task.provider,
        requestId: task.requestId,
        sessionId: task.sessionId,
        updatedAt: task.updatedAt,
        message: task.message,
        code: task.errorCode,
      });
    }
    return commentStates;
  }

  function applyCurrentCommentStates(
    comments: PrototypeEditCommentEntry[],
  ): PrototypeEditCommentEntry[] {
    const currentStates = buildCurrentCommentStates();
    return comments.map((comment) => {
      const commentId = normalizeCommentId(comment.id);
      const currentState = commentId && isCurrentPageScopedRecord(comment)
        ? currentStates.get(commentId)
        : null;
      return {
        ...comment,
        ...(currentState ?? normalizeCommentState(comment)),
      };
    });
  }

  function buildDocumentImages(): PrototypeEditCommentImageEntry[] {
    return Array.from(state.editMetaByKey.values()).flatMap((meta) =>
      meta.images.map((image) => {
        const commentId = ensureElementEditCommentId(meta);
        return withCurrentPageScope({
          id: image.id,
          commentId,
          name: image.name,
          mimeType: image.mimeType,
          size: image.size,
          createdAt: image.createdAt,
          ...(image.source ? { source: image.source } : {}),
          ...(image.data ? { data: image.data } : {}),
          ...('assetPath' in image && typeof image.assetPath === 'string'
            ? { assetPath: image.assetPath }
            : {}),
        });
      }),
    );
  }

  function cacheEntryToCommentEntry(entry: CachedChangeEntry): PrototypeCommentEntryDocumentShape {
    const { note, commentId, elementKey: _elementKey, ...rest } = entry;
    return {
      ...rest,
      id: normalizeCommentId(commentId),
      state: isPrototypeEditCommentStatus(entry.state) ? entry.state : 'idle',
      ...(note ? { comment: note } : {}),
    };
  }

  function commentEntryToCacheEntry(entry: PrototypeEditCommentEntry): CachedChangeEntry {
    const { comment, id, ...rest } = entry;
    return {
      ...(rest as CachedChangeEntry),
      commentId: id,
      ...(comment ? { note: comment } : {}),
    };
  }

  function buildAdapterDocument(
    entries: CachedChangeEntry[],
    reason: PrototypeEditCommentsWriteReason = 'changes',
    clearScope: CommentaryClearEditsScope = 'page',
    clearTarget: CommentaryClearEditsTarget = 'all',
  ): PrototypeEditCommentsDocument | null {
    const scope = resolvePersistenceScope();
    if (!scope) return null;
    const documentKind = scope.documentKind === 'document'
      ? 'document-edit-comments' as const
      : 'prototype-edit-comments' as const;
    if (reason === 'clear' && clearScope === 'prototype' && clearTarget === 'all') {
      return {
        schemaVersion: 3,
        kind: documentKind,
        resource: {
          id: scope.prototypeId,
          targetPath: scope.targetPath,
          filePath: scope.filePath || `src/${scope.targetPath}/.spec/prototype-comments.json`,
        },
        comments: [],
        images: [],
      };
    }
    const currentPageScope = resolveCurrentPageScope();
    const previousCommentsById = new Map(
      (lastAdapterDocument?.comments ?? []).map((entry) => [normalizeCommentId(entry.id), entry]),
    );
    const currentComments = entries.map((entry) => {
      const current = withCurrentPageScope(cacheEntryToCommentEntry(entry));
      const previous = previousCommentsById.get(normalizeCommentId(current.id));
      return previous ? { ...previous, ...current } : current;
    }).filter((entry) => Boolean(normalizeCommentId(entry.id)));
    const currentImages = buildDocumentImages();
    const currentCommentIds = new Set(currentComments.map((entry) => entry.id));
    const currentImageIds = new Set(currentImages.map((image) => image.id));
    const shouldDropMissingCurrentScopeRecords = reason === 'clear' && clearTarget === 'all';
    const shouldPreserveMissingCurrentScopeRecords =
      (preserveMissingCurrentScopeRecordsOnNextWrite && reason !== 'clear') ||
      (reason === 'clear' && clearTarget === 'completed');
    const preservedComments = (lastAdapterDocument?.comments ?? []).filter((entry) => {
      const entryScope = normalizePageScope(entry.pageScope);
      const commentId = normalizeCommentId(entry.id);
      if (!commentId || isExplicitlyClearedComment(commentId)) return false;
      if (currentCommentIds.has(commentId)) return false;
      if (entryScope) {
        if (entryScope !== currentPageScope) return true;
        if (shouldDropMissingCurrentScopeRecords) return false;
        if (shouldPreserveMissingCurrentScopeRecords && hasPersistedEditPayload(entry)) return true;
        return !hasConnectedLocator(entry.locator);
      }
      if (!hasPersistedEditPayload(entry)) return true;
      if (shouldDropMissingCurrentScopeRecords) return false;
      if (shouldPreserveMissingCurrentScopeRecords) return true;
      return !hasConnectedLocator(entry.locator);
    });
    const preservedCommentIds = new Set(preservedComments.map((entry) => entry.id));
    const preservedImages = (lastAdapterDocument?.images ?? []).filter((image) => {
      const imageScope = normalizePageScope(image.pageScope);
      const commentId = normalizeCommentId(image.commentId);
      if (!commentId || isExplicitlyClearedComment(commentId)) return false;
      if (currentImageIds.has(image.id)) return false;
      if (imageScope) {
        if (imageScope !== currentPageScope) return true;
        if (shouldDropMissingCurrentScopeRecords) return false;
        if (currentCommentIds.has(commentId)) return false;
        return shouldPreserveMissingCurrentScopeRecords || preservedCommentIds.has(commentId);
      }
      if (shouldDropMissingCurrentScopeRecords) return false;
      if (currentCommentIds.has(commentId)) return false;
      return shouldPreserveMissingCurrentScopeRecords || preservedCommentIds.has(commentId);
    });
    const document: PrototypeEditCommentsDocument = {
      schemaVersion: 3,
      kind: documentKind,
      resource: {
        id: scope.prototypeId,
        targetPath: scope.targetPath,
        filePath: scope.filePath || `src/${scope.targetPath}/.spec/prototype-comments.json`,
      },
      comments: applyCurrentCommentStates([...preservedComments, ...currentComments]),
      images: [...preservedImages, ...currentImages],
    };

    if (reason !== 'clear' || clearTarget !== 'completed') {
      return document;
    }

    const removedCommentIds = new Set(
      document.comments
        .filter(
          (comment) =>
            comment.state === 'completed' &&
            (clearScope === 'prototype' || isCurrentPageScopedRecord(comment)),
        )
        .map((comment) => comment.id),
    );

    return {
      ...document,
      comments: document.comments.filter(
        (comment) => !removedCommentIds.has(comment.id),
      ),
      images: document.images.filter(
        (image) => !removedCommentIds.has(image.commentId),
      ),
    };
  }

  function normalizeAdapterDocument(value: unknown): PrototypeEditCommentsDocument | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<PrototypeEditCommentsDocument>;
    const expectedKind = resolvePersistenceScope()?.documentKind === 'document'
      ? 'document-edit-comments'
      : 'prototype-edit-comments';
    if (record.schemaVersion !== 3 || record.kind !== expectedKind) return null;
    if (!Array.isArray(record.comments)) return null;
    const comments = record.comments as PrototypeEditCommentEntry[];
    const deletedCommentIds = new Set(
      comments
        .filter(isDeletedRecord)
        .map((entry) => normalizeCommentId(entry.id))
        .filter(Boolean),
    );
    const images = Array.isArray(record.images)
      ? (record.images as PrototypeEditCommentImageEntry[])
      : [];
    const normalizedImages = images.filter((image) => {
      const commentId = normalizeCommentId(image.commentId);
      if (!normalizeCommentId(image.id) || !commentId || isDeletedRecord(image)) return false;
      return !deletedCommentIds.has(commentId);
    });
    const commentIdsWithImages = new Set(
      normalizedImages.map((image) => normalizeCommentId(image.commentId)).filter(Boolean),
    );
    const normalizedComments = comments
      .filter((entry) => normalizeCommentId(entry.id) && !isDeletedRecord(entry))
      .filter((entry) => {
        const hasSkillSelection = Array.isArray(entry.skillIds)
          && entry.skillIds.some((skillId) => String(skillId ?? '').trim());
        if (!hasSkillSelection) return true;
        return Boolean(
          String(entry.comment ?? '').trim()
          || hasPersistedEditPayload(entry)
          || commentIdsWithImages.has(normalizeCommentId(entry.id)),
        );
      })
      .map((entry) => ({ ...entry, ...normalizeCommentState(entry) }));
    return {
      schemaVersion: 3,
      kind: expectedKind,
      resource: {
        id: String(record.resource?.id ?? '').trim(),
        targetPath: String(record.resource?.targetPath ?? '').trim(),
        filePath: String(record.resource?.filePath ?? '').trim(),
      },
      comments: normalizedComments,
      images: normalizedImages,
    };
  }

  function mergeAdapterCommentStates(document: PrototypeEditCommentsDocument): void {
    for (const comment of document.comments) {
      const commentId = normalizeCommentId(comment.id);
      if (!commentId) continue;
      if (!isCurrentPageScopedRecord(comment)) continue;
      commentStateByCommentId.set(commentId, normalizeCommentState(comment));
    }
  }

  async function persistAdapterDocument(
    entries: CachedChangeEntry[],
    reason: PrototypeEditCommentsWriteReason,
    clearScope: CommentaryClearEditsScope = 'page',
    clearTarget: CommentaryClearEditsTarget = 'all',
  ): Promise<void> {
    if (!persistenceAdapter?.write) return;
    const scope = resolvePersistenceScope();
    if (!scope) return;
    const document = buildAdapterDocument(entries, reason, clearScope, clearTarget);
    if (!document) return;
    lastAdapterDocument = document;
    preserveMissingCurrentScopeRecordsOnNextWrite = false;
    await enqueueTrackedAdapterWrite(
      scope,
      () => persistenceAdapter.write(scope, document, reason),
    );
  }

  function writeAdapterDocument(
    entries: CachedChangeEntry[],
    reason: PrototypeEditCommentsWriteReason,
    clearScope: CommentaryClearEditsScope = 'page',
    clearTarget: CommentaryClearEditsTarget = 'all',
  ): void {
    void persistAdapterDocument(entries, reason, clearScope, clearTarget).catch((error) => {
      console.warn('[Commentary] Failed to persist prototype comments:', error);
    });
  }

  function clearCurrentPageRuntimeState(): void {
    state.transactionManager?.clear?.();
    state.editMetaByKey.clear();
    state.pendingMarkerAnchors.clear();
    state.processedEditTimestampsByKey.clear();
    state.selectionAnchor = null;
    state.selectedElement = null;
    state.initialSelectionElement = null;
    commentStateByCommentId.clear();
  }

  function removeStorageKey(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best-effort only.
    }
  }

  function resolveAgentConversationKey(scopeKey: string): string {
    return `${AGENT_CONVERSATION_KEY_PREFIX}${scopeKey}`;
  }

  function resolveAgentTasksKey(scopeKey: string): string {
    return `${AGENT_TASKS_KEY_PREFIX}${scopeKey}`;
  }

  function sanitizePageAgentConversationState(
    value: unknown,
  ): PageAgentConversationState | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<PageAgentConversationState>;
    const scopeKey = String(record.scopeKey ?? '').trim();
    const sessionId = String(record.sessionId ?? '').trim();
    if (!scopeKey || !sessionId) return null;

    const createdAt = Number(record.createdAt ?? 0);
    const lastUsedAt = Number(record.lastUsedAt ?? createdAt);
    const sentCount = Math.max(0, Math.floor(Number(record.sentCount ?? 0)));
    const expiresAt = Number(record.expiresAt ?? createdAt);

    return {
      scopeKey,
      sessionId,
      provider: typeof record.provider === 'string' && record.provider.trim()
        ? record.provider.trim()
        : null,
      projectPath: typeof record.projectPath === 'string' && record.projectPath.trim()
        ? record.projectPath.trim()
        : null,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : Number.isFinite(createdAt) ? createdAt : 0,
      sentCount: Number.isFinite(sentCount) ? sentCount : 0,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      invalidated: Boolean(record.invalidated),
      sessionPath: typeof record.sessionPath === 'string' && record.sessionPath.trim()
        ? record.sessionPath.trim()
        : null,
      sessionUrl: typeof record.sessionUrl === 'string' && record.sessionUrl.trim()
        ? record.sessionUrl.trim()
        : null,
    };
  }

  function sanitizePersistedElementAgentTaskState(
    value: unknown,
  ): PersistedElementAgentTaskState | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<PersistedElementAgentTaskState>;
    const scopeKey = String(record.scopeKey ?? '').trim();
    const requestId = String(record.requestId ?? '').trim();
    if (!scopeKey || !requestId || !record.locator) return null;

    const status = record.status;
    if (status !== 'pending' && status !== 'created' && status !== 'completed' && status !== 'error') {
      return null;
    }

    const startedAt = Number(record.startedAt ?? 0);
    const updatedAt = Number(record.updatedAt ?? startedAt);
    const lastEventAt = Number(record.lastEventAt ?? updatedAt);

    // Preserve origin if valid
    const origin = record.origin === 'agent-run' || record.origin === 'external-editing'
      ? record.origin
      : undefined;

    return {
      scopeKey,
      elementKey: String(record.elementKey ?? '').trim() || locatorKey(record.locator),
      locator: record.locator,
      label: String(record.label ?? '').trim(),
      requestId,
      sessionId: typeof record.sessionId === 'string' && record.sessionId.trim()
        ? record.sessionId.trim()
        : null,
      sessionPath: typeof record.sessionPath === 'string' && record.sessionPath.trim()
        ? record.sessionPath.trim()
        : null,
      sessionUrl: typeof record.sessionUrl === 'string' && record.sessionUrl.trim()
        ? record.sessionUrl.trim()
        : null,
      provider: typeof record.provider === 'string' && record.provider.trim()
        ? record.provider.trim()
        : null,
      status,
      message: String(record.message ?? '').trim(),
      startedAt: Number.isFinite(startedAt) ? startedAt : 0,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Number.isFinite(startedAt) ? startedAt : 0,
      dismissed: Boolean(record.dismissed),
      recoveryPending: Boolean(record.recoveryPending),
      lastEventAt: Number.isFinite(lastEventAt) ? lastEventAt : Number.isFinite(updatedAt) ? updatedAt : 0,
      errorCode: typeof record.errorCode === 'string' && record.errorCode.trim()
        ? record.errorCode.trim()
        : null,
      origin,
    };
  }

  function setMarkerVisibility(visible: boolean): void {
    if (typeof window === 'undefined') return;
    const key = resolveMarkerVisibilityKey();
    if (!key) return;
    try {
      window.localStorage.setItem(key, visible ? 'true' : 'false');
    } catch {
      // Best-effort only.
    }
  }

  function readCommentShortcutSettings(): CommentShortcutSettings {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_COMMENT_SHORTCUT_SETTINGS };
    }

    const key = resolveCommentShortcutSettingsKey();
    if (!key) {
      return { ...DEFAULT_COMMENT_SHORTCUT_SETTINGS };
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return { ...DEFAULT_COMMENT_SHORTCUT_SETTINGS };
      }
      return sanitizeCommentShortcutSettings(JSON.parse(raw) as CommentShortcutSettings);
    } catch {
      return { ...DEFAULT_COMMENT_SHORTCUT_SETTINGS };
    }
  }

  function setCommentShortcutSettings(settings: CommentShortcutSettings): void {
    if (typeof window === 'undefined') return;
    const key = resolveCommentShortcutSettingsKey();
    if (!key) return;
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify(sanitizeCommentShortcutSettings(settings)),
      );
    } catch {
      // Best-effort only.
    }
  }

  function readUiSettings(): WebEditorUiSettings {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_WEB_EDITOR_UI_SETTINGS };
    }

    try {
      const raw = window.localStorage.getItem(UI_SETTINGS_KEY);
      if (!raw) {
        return { ...DEFAULT_WEB_EDITOR_UI_SETTINGS };
      }
      return readPersistedWebEditorUiSettings(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_WEB_EDITOR_UI_SETTINGS };
    }
  }

  function setUiSettings(settings: WebEditorUiSettings): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        UI_SETTINGS_KEY,
        JSON.stringify(preparePersistedWebEditorUiSettings(settings)),
      );
    } catch {
      // Best-effort only.
    }
  }

  function readAgentConversationState(scopeKey: string): PageAgentConversationState | null {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return null;
    return sanitizePageAgentConversationState(
      readStorageJson(resolveAgentConversationKey(normalizedScopeKey)),
    );
  }

  function writeAgentConversationState(
    scopeKey: string,
    conversation: PageAgentConversationState,
  ): void {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return;
    const sanitized = sanitizePageAgentConversationState(conversation);
    if (!sanitized) {
      removeStorageKey(resolveAgentConversationKey(normalizedScopeKey));
      return;
    }
    writeStorageJson(resolveAgentConversationKey(normalizedScopeKey), sanitized);
  }

  function clearAgentConversationState(scopeKey: string): void {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return;
    removeStorageKey(resolveAgentConversationKey(normalizedScopeKey));
  }

  function readAgentTaskStates(scopeKey: string): PersistedElementAgentTaskState[] {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return [];
    const raw = readStorageJson<unknown[]>(resolveAgentTasksKey(normalizedScopeKey));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => sanitizePersistedElementAgentTaskState(entry))
      .filter((entry): entry is PersistedElementAgentTaskState => {
        if (!entry || entry.dismissed) return false;
        if (entry.origin === 'external-editing') return false;
        // Standard agent tasks: require running status + session + provider
        return (
          (entry.status === 'pending' || entry.status === 'created') &&
          typeof entry.sessionId === 'string' &&
          entry.sessionId.trim().length > 0 &&
          typeof entry.provider === 'string' &&
          entry.provider.trim().length > 0
        );
      });
  }

  function writeAgentTaskStates(
    scopeKey: string,
    tasks: PersistedElementAgentTaskState[],
  ): void {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return;
    const sanitized = Array.isArray(tasks)
      ? tasks
          .map((entry) => sanitizePersistedElementAgentTaskState(entry))
          .filter((entry): entry is PersistedElementAgentTaskState => {
            if (!entry || entry.dismissed) return false;
            if (entry.origin === 'external-editing') return false;
            // Standard agent tasks: require running status + session + provider
            return (
              (entry.status === 'pending' || entry.status === 'created') &&
              typeof entry.sessionId === 'string' &&
              entry.sessionId.trim().length > 0 &&
              typeof entry.provider === 'string' &&
              entry.provider.trim().length > 0
            );
          })
      : [];
    if (sanitized.length === 0) {
      removeStorageKey(resolveAgentTasksKey(normalizedScopeKey));
      return;
    }
    writeStorageJson(resolveAgentTasksKey(normalizedScopeKey), sanitized);
  }

  function discardAgentTaskStates(
    scopeKeys: readonly string[],
    elementKeys: readonly WebEditorElementKey[],
  ): void {
    const deletedKeys = new Set(
      elementKeys.map((key) => String(key ?? '').trim()).filter(Boolean),
    );
    if (deletedKeys.size === 0) return;
    for (const scopeKey of scopeKeys) {
      const remaining = readAgentTaskStates(scopeKey).filter(
        (task) => !deletedKeys.has(String(task.elementKey ?? '').trim()),
      );
      writeAgentTaskStates(scopeKey, remaining);
    }
  }

  function recordCommentTaskState(
    elementKey: WebEditorElementKey,
    stateValue: PrototypeEditCommentStatus,
    taskRef: Partial<ExternalEditingTaskRef> | null = null,
  ): void {
    const normalizedElementKey = normalizeElementRecordKey(elementKey);
    if (!normalizedElementKey) return;
    const meta = state.editMetaByKey.get(normalizedElementKey);
    if (!meta) return;
    const commentId = ensureElementEditCommentId(meta);
    const provider = typeof taskRef?.provider === 'string' && taskRef.provider.trim()
      ? taskRef.provider.trim()
      : null;
    const requestId = typeof taskRef?.requestId === 'string' && taskRef.requestId.trim()
      ? taskRef.requestId.trim()
      : null;
    const sessionId = typeof taskRef?.sessionId === 'string' && taskRef.sessionId.trim()
      ? taskRef.sessionId.trim()
      : null;
    const code = stateValue === 'error' ? normalizeNullableString(taskRef?.code) : null;
    const existingTask = commentStateByCommentId.get(commentId);
    if (
      existingTask?.state === stateValue &&
      existingTask.provider === provider &&
      existingTask.requestId === requestId &&
      existingTask.sessionId === sessionId &&
      existingTask.code === code
    ) {
      return;
    }
    clearedCommentIds.delete(commentId);
    commentStateByCommentId.set(commentId, {
      state: stateValue,
      provider,
      requestId,
      sessionId,
      updatedAt: Date.now(),
      code,
      message: stateValue === 'completed'
        ? '修改完成'
        : stateValue === 'error'
          ? 'AI 修改失败'
          : stateValue === 'editing'
            ? 'AI 编辑中'
            : '待处理',
    });
    persistCommentStateDocument();
  }

  function getCommentTaskState(
    elementKey: WebEditorElementKey,
  ): PrototypeEditCommentStatus | null {
    const normalizedElementKey = normalizeElementRecordKey(elementKey);
    if (!normalizedElementKey) return null;
    const commentId = state.editMetaByKey.get(normalizedElementKey)?.commentId;
    return commentId ? commentStateByCommentId.get(commentId)?.state ?? null : null;
  }

  function resetTerminalCommentStateForElement(elementKey: WebEditorElementKey): boolean {
    const normalizedElementKey = normalizeElementRecordKey(elementKey);
    if (!normalizedElementKey) return false;
    const meta = state.editMetaByKey.get(normalizedElementKey);
    const commentId = normalizeCommentId(meta?.commentId);
    const commentState = commentId ? commentStateByCommentId.get(commentId)?.state : null;
    if (commentState !== 'completed' && commentState !== 'error') return false;
    recordCommentTaskState(normalizedElementKey, 'idle');
    return true;
  }

  async function waitForPendingWrites(): Promise<void> {
    const storageScope = String(resolvePersistenceScope()?.storageScope ?? '').trim();
    if (!storageScope) return;
    await (adapterWriteChainByStorageScope.get(storageScope) ?? Promise.resolve());
  }

  function listEditingConversationTasks(): PersistedConversationTask[] {
    const document = getPersistedPrototypeCommentsDocument();
    if (!document) return [];
    return document.comments.flatMap((comment) => {
      const commentId = normalizeCommentId(comment.id);
      const provider = normalizeNullableString(comment.provider);
      const sessionId = normalizeNullableString(comment.sessionId);
      const requestId = normalizeNullableString(comment.requestId);
      if (
        !commentId
        || isDeletedRecord(comment)
        || comment.state !== 'editing'
        || !provider
        || !sessionId
        || !requestId
      ) {
        return [];
      }
      return [{ commentId, provider, sessionId, requestId }];
    });
  }

  async function transitionConversationTaskTerminal(
    input: ConversationTaskTerminalTransition,
  ): Promise<boolean> {
    const commentId = normalizeCommentId(input.commentId);
    const provider = normalizeNullableString(input.provider);
    const sessionId = normalizeNullableString(input.sessionId);
    const requestId = normalizeNullableString(input.requestId);
    if (!commentId || !provider || !sessionId || !requestId) return false;

    await waitForPendingWrites();
    const scope = resolvePersistenceScope();
    const sourceDocument = getPersistedPrototypeCommentsDocument();
    if (!scope || !sourceDocument || !persistenceAdapter?.write) return false;
    const commentIndex = sourceDocument.comments.findIndex(
      (comment) => normalizeCommentId(comment.id) === commentId,
    );
    if (commentIndex < 0) return false;
    const current = sourceDocument.comments[commentIndex];
    if (
      !current
      || isDeletedRecord(current)
      || (current.state !== 'editing' && current.state !== input.state)
      || normalizeNullableString(current.provider) !== provider
      || normalizeNullableString(current.sessionId) !== sessionId
      || normalizeNullableString(current.requestId) !== requestId
    ) {
      return false;
    }

    const nextComment = {
      ...current,
      state: input.state,
      provider,
      sessionId,
      requestId,
      updatedAt: Date.now(),
      code: input.state === 'error' ? normalizeNullableString(input.code) : null,
      message: input.state === 'completed'
        ? '修改完成'
        : normalizeNullableString(input.error) || 'AI 修改失败',
    };
    const nextDocument: PrototypeEditCommentsDocument = {
      ...sourceDocument,
      comments: sourceDocument.comments.map((comment, index) =>
        index === commentIndex ? nextComment : comment),
    };

    commentStateByCommentId.set(commentId, normalizeCommentState(nextComment));
    lastAdapterDocument = nextDocument;
    currentAdapterDocument = nextDocument;
    await enqueueTrackedAdapterWrite(
      scope,
      () => persistenceAdapter.write(scope, nextDocument, 'state'),
    );
    return true;
  }

  function clearCommentRecord(elementKey: WebEditorElementKey): void {
    const normalizedElementKey = normalizeElementRecordKey(elementKey);
    if (!normalizedElementKey) return;
    const commentId = state.editMetaByKey.get(normalizedElementKey)?.commentId;
    if (!commentId) return;
    clearedCommentIds.add(commentId);
    commentStateByCommentId.delete(commentId);
  }

  function pruneExpiredAgentTaskStates(scopeKey: string): void {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return;
    writeAgentTaskStates(normalizedScopeKey, readAgentTaskStates(normalizedScopeKey));
  }

  function writeCache(
    entries: CachedChangeEntry[],
    reason: PrototypeEditCommentsWriteReason = 'changes',
    clearScope: CommentaryClearEditsScope = 'page',
  ): void {
    if (commentPersistenceMode !== 'adapter-only') {
      writeLocalCache(entries);
    }
    writeAdapterDocument(entries, reason, clearScope);
  }

  function buildCacheEntriesFromTransactions(): CachedChangeEntry[] {
    const tm = state.transactionManager;
    if (!tm) {
      return Array.from(state.editMetaByKey.values())
        .filter((meta) => meta.note || (meta.skillIds?.length ?? 0) > 0 || meta.anchor)
        .map((meta) => ({
          commentId: ensureElementEditCommentId(meta),
          elementKey: meta.elementKey,
          label: meta.label,
          locator: stripLocatorDebugSource(meta.locator),
          note: meta.note || undefined,
          skillIds: meta.skillIds?.slice(),
          marker: meta.anchor
            ? {
                ...meta.anchor,
                dirtySince: meta.dirtySince,
              }
            : null,
          voiceCreateOperationId: meta.voiceCreateOperationId,
          voiceElementKey: meta.voiceElementKey,
          voiceTargetRef: meta.voiceTargetRef,
          voiceTarget: meta.voiceTarget,
          anchorPlacement: meta.anchorPlacement,
        }));
    }

    const txs = filterTransactionsAfterProcessed(state, tm.getUndoStack()).slice();
    const indexed = txs.map((tx, index) => ({ tx, index }));
    indexed.sort((a, b) => {
      const at = Number(a.tx.timestamp ?? 0);
      const bt = Number(b.tx.timestamp ?? 0);
      if (at !== bt) return at - bt;
      return a.index - b.index;
    });

    type CacheGroup = {
      locator: ElementLocator;
      styleBefore: Record<string, string>;
      styleAfter: Record<string, string>;
      textBefore?: string;
      textAfter?: string;
    };

    const groups = new Map<string, CacheGroup>();

    for (const { tx } of indexed) {
      if (tx.type !== 'style' && tx.type !== 'text') continue;
      const key = tx.elementKey ? String(tx.elementKey) : locatorKey(tx.targetLocator);
      const existing = groups.get(key);
      const locator = (tx.after?.locator ?? tx.targetLocator) as ElementLocator;
      const group: CacheGroup =
        existing ?? {
          locator,
          styleBefore: {},
          styleAfter: {},
          textBefore: undefined,
          textAfter: undefined,
        };

      group.locator = locator;

      if (tx.type === 'style') {
        const beforeRaw = tx.before.styles ?? {};
        const afterRaw = tx.after.styles ?? {};
        const keys = new Set([...Object.keys(beforeRaw), ...Object.keys(afterRaw)]);
        for (const rawProp of keys) {
          const prop = String(rawProp ?? '').trim();
          if (!prop) continue;
          if (!(prop in group.styleBefore)) {
            group.styleBefore[prop] = String(beforeRaw[prop] ?? '').trim();
          }
          group.styleAfter[prop] = String(afterRaw[prop] ?? '').trim();
        }
      }

      if (tx.type === 'text') {
        if (group.textBefore === undefined) {
          group.textBefore = String(tx.before.text ?? '');
        }
        group.textAfter = String(tx.after.text ?? '');
      }

      if (!existing) {
        groups.set(key, group);
      }
    }

    const entries: CachedChangeEntry[] = [];
    const appendedKeys = new Set<WebEditorElementKey>();

    for (const group of groups.values()) {
      const entry: CachedChangeEntry = { locator: stripLocatorDebugSource(group.locator) };
      let elementKey: WebEditorElementKey | null;
      const liveElement = locateElement(group.locator);
      if (liveElement) {
        elementKey = generateStableElementKey(liveElement, group.locator.shadowHostChain);
      } else {
        elementKey = locatorKey(group.locator);
      }

      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      const allProps = new Set([
        ...Object.keys(group.styleBefore),
        ...Object.keys(group.styleAfter),
      ]);
      for (const prop of allProps) {
        const b = String(group.styleBefore[prop] ?? '').trim();
        const a = String(group.styleAfter[prop] ?? '').trim();
        if (b === a) continue;
        before[prop] = b;
        after[prop] = a;
      }
      if (Object.keys(before).length > 0 || Object.keys(after).length > 0) {
        entry.styleChanges = { before, after };
      }

      if (
        group.textBefore !== undefined &&
        group.textAfter !== undefined &&
        group.textBefore !== group.textAfter
      ) {
        entry.textChange = { before: group.textBefore, after: group.textAfter };
      }

      let meta = elementKey ? state.editMetaByKey.get(elementKey) : null;
      if (!meta && elementKey) {
        meta = changes.getOrCreateEditMeta(
          elementKey,
          group.locator,
          liveElement
            ? generateFullElementLabel(liveElement, group.locator.shadowHostChain)
            : elementKey,
        );
      }
      if (meta) entry.commentId = ensureElementEditCommentId(meta);
      if (meta?.elementKey) entry.elementKey = meta.elementKey;
      if (meta?.label) entry.label = meta.label;
      if ((meta?.tweakSummaryLines?.length ?? 0) > 0) {
        entry.tweak = {
          summaryLines: [...(meta?.tweakSummaryLines ?? [])],
          baselineValues: cloneTweakValues(meta?.tweakBaselineValues),
          currentValues: cloneTweakValues(meta?.tweakCurrentValues),
        };
      }
      if (meta?.note) entry.note = meta.note;
      if ((meta?.skillIds?.length ?? 0) > 0) entry.skillIds = meta?.skillIds?.slice();
      if (meta?.anchor) {
        entry.marker = {
          ...meta.anchor,
          dirtySince: meta.dirtySince,
        };
      }

      if (!entry.textChange && !entry.styleChanges && !entry.tweak && !entry.note && !(entry.skillIds?.length ?? 0)) continue;
      entries.push(entry);
      if (elementKey) {
        appendedKeys.add(elementKey);
      }
    }

    for (const meta of state.editMetaByKey.values()) {
      if (appendedKeys.has(meta.elementKey)) continue;
      const hasRecordedTweak = (meta.tweakSummaryLines?.length ?? 0) > 0;
      const hasImages = meta.images.length > 0;
      if (!meta.note && !hasRecordedTweak && !hasImages && !(meta.skillIds?.length ?? 0)) continue;
      entries.push({
        commentId: ensureElementEditCommentId(meta),
        elementKey: meta.elementKey,
        label: meta.label,
        locator: stripLocatorDebugSource(meta.locator),
        tweak: hasRecordedTweak
          ? {
              summaryLines: [...(meta.tweakSummaryLines ?? [])],
              baselineValues: cloneTweakValues(meta.tweakBaselineValues),
              currentValues: cloneTweakValues(meta.tweakCurrentValues),
            }
          : undefined,
        note: meta.note || undefined,
        skillIds: meta.skillIds?.slice(),
        marker: meta.anchor
          ? {
              ...meta.anchor,
              dirtySince: meta.dirtySince,
            }
          : null,
        voiceCreateOperationId: meta.voiceCreateOperationId,
        voiceElementKey: meta.voiceElementKey,
        voiceTargetRef: meta.voiceTargetRef,
        voiceTarget: meta.voiceTarget,
        anchorPlacement: meta.anchorPlacement,
      });
    }

    return entries;
  }

  function persistFromTransactions(): void {
    if (cacheRestoreInProgress) return;
    writeCache(buildCacheEntriesFromTransactions());
  }

  function persistCommentStateDocument(): void {
    if (cacheRestoreInProgress) return;
    writeAdapterDocument(buildCacheEntriesFromTransactions(), 'state');
  }

  function getPersistedPrototypeCommentsDocument(): PrototypeEditCommentsDocument | null {
    return buildAdapterDocument(buildCacheEntriesFromTransactions(), 'changes') ?? lastAdapterDocument;
  }

  function flushPendingWrite(reason: PrototypeEditCommentsWriteReason = 'changes'): void {
    if (cacheWriteTimer !== null) {
      window.clearTimeout(cacheWriteTimer);
      cacheWriteTimer = null;
    }
    if (cacheRestoreInProgress) return;
    writeCache(buildCacheEntriesFromTransactions(), reason);
  }

  function scheduleWrite(): void {
    if (cacheRestoreInProgress) return;
    if (cacheWriteTimer !== null) {
      window.clearTimeout(cacheWriteTimer);
    }
    cacheWriteTimer = window.setTimeout(() => {
      cacheWriteTimer = null;
      persistFromTransactions();
    }, 120);
  }

  function applyCachedEntries(entries: CachedChangeEntry[]): void {
    const tm = state.transactionManager;
    if (!tm) return;
    const annotationSourceNodeIds = collectAnnotationSourceNodeIdsFromWindow();

    for (const entry of entries) {
      if (!isCurrentPageScopedRecord(entry)) {
        continue;
      }
      const commentId = normalizeCommentId(entry.commentId);
      if (!commentId) continue;
      const entryNote = changes.normalizeNote(entry.note ?? '');
      const entrySkillIds = normalizePromptCardSkillIds(entry.skillIds ?? []);
      const documentImages = currentAdapterDocument?.images?.filter((image) =>
        image.commentId === commentId && isCurrentPageScopedRecord(image),
      ) ?? [];
      if (
        !entryNote.trim() &&
        entrySkillIds.length > 0 &&
        !hasPersistedEditPayload(entry) &&
        documentImages.length === 0
      ) {
        continue;
      }
      const entryElementKey = String(entry.elementKey ?? '').trim();
      const isLegacyTextCommentCacheEntry = (
        getInteractionProfile() === 'text-comment' &&
        !entryElementKey &&
        Boolean(entry.note) &&
        Boolean(entry.marker) &&
        !entry.textChange &&
        !entry.styleChanges
      );
      if (isLegacyTextCommentCacheEntry) {
        continue;
      }

      const annotationPanelIdentity = normalizeAnnotationPanelCacheIdentity(entry.locator);
      if (annotationPanelIdentity && annotationSourceNodeIds && !annotationSourceNodeIds.has(
        annotationPanelIdentity.elementKey.replace(/^annotation-panel:/, ''),
      )) {
        continue;
      }
      const entryLocator = annotationPanelIdentity?.locator ?? entry.locator;
      const element = locateElement(entryLocator);
      const canRestoreWithoutLiveElement = Boolean(annotationPanelIdentity) && Boolean(entry.marker);
      if ((!element || !element.isConnected) && !canRestoreWithoutLiveElement) continue;

      const resolvedElementKey = annotationPanelIdentity?.elementKey
        ?? (element
          ? generateStableElementKey(element, entryLocator.shadowHostChain)
          : locatorKey(entryLocator));
      const resolvedLabel = String(entry.label ?? '').trim() || (
        element
          ? generateFullElementLabel(element, entryLocator.shadowHostChain)
          : 'Annotation Panel'
      );
      const meta = changes.getOrCreateEditMeta(
        resolvedElementKey,
        entryLocator,
        resolvedLabel,
      );
      meta.commentId = commentId;
      meta.locator = entryLocator;
      meta.label = resolvedLabel;
      meta.note = changes.normalizeNote(entry.note ?? meta.note);
      if (meta.note.trim() && entrySkillIds.length > 0) {
        meta.skillIds = entrySkillIds;
      } else {
        delete meta.skillIds;
      }
      meta.anchor = entry.marker ? normalizeMarkerAnchor(entry.marker) ?? meta.anchor : meta.anchor;
      meta.voiceCreateOperationId = entry.voiceCreateOperationId;
      meta.voiceElementKey = entry.voiceElementKey;
      meta.voiceTargetRef = entry.voiceTargetRef;
      meta.voiceTarget = entry.voiceTarget;
      meta.anchorPlacement = entry.anchorPlacement;
      if (entry.marker && Number.isFinite(Number(entry.marker.dirtySince))) {
        meta.dirtySince = Number(entry.marker.dirtySince);
      }
      if (documentImages.length > 0) {
        const hydratedImages = documentImages
          .filter((image) => typeof image.data === 'string' && image.data.trim())
          .map((image) => ({
            id: String(image.id ?? '').trim() || `image-${meta.images.length + 1}`,
            name: String(image.name ?? '').trim() || 'comment-image.png',
            data: String(image.data ?? ''),
            mimeType: String(image.mimeType ?? '').trim() || 'image/png',
            size: Number(image.size ?? 0),
            createdAt: Number(image.createdAt ?? Date.now()),
            ...(image.source === 'user' || image.source === 'target-screenshot'
              ? { source: image.source }
              : {}),
            ...(typeof image.assetPath === 'string' && image.assetPath.trim()
              ? { assetPath: image.assetPath.trim() }
              : {}),
          }));
        if (hydratedImages.length > 0) {
          meta.images = hydratedImages;
        }
        if (hydratedImages.length > 0 && meta.dirtySince === null) {
          meta.dirtySince = Date.now();
        }
      }
      if ((entry.tweak?.summaryLines?.length ?? 0) > 0) {
        meta.tweakSummaryLines = [...(entry.tweak?.summaryLines ?? [])];
        meta.tweakBaselineValues = cloneTweakValues(entry.tweak?.baselineValues);
        meta.tweakCurrentValues = cloneTweakValues(entry.tweak?.currentValues);
        meta.changeKinds = ['tweak', ...meta.changeKinds.filter((kind) => kind !== 'tweak')];
        if (meta.dirtySince === null) {
          meta.dirtySince = Date.now();
        }
      }

      if (entry.styleChanges) {
        const afterStyles = entry.styleChanges.after ?? {};
        const beforeStyles = entry.styleChanges.before ?? {};
        for (const prop of Object.keys(afterStyles)) {
          const afterValue = String(afterStyles[prop] ?? '');
          const beforeValue = String(beforeStyles[prop] ?? '');
          if (!element) continue;
          const style = (element as HTMLElement).style;
          if (style) {
            if (afterValue.trim()) {
              style.setProperty(prop, afterValue.trim());
            } else {
              style.removeProperty(prop);
            }
          }
          tm.recordStyle(entryLocator, prop, beforeValue, afterValue, { merge: false });
        }
      }

      if (entry.textChange && element) {
        const before = String(entry.textChange.before ?? '');
        const after = String(entry.textChange.after ?? '');
        if (before !== after && element instanceof HTMLElement) {
          element.textContent = after;
          tm.recordText(element, before, after);
        }
      }
    }
  }

  async function readAdapterDocument(): Promise<{
    document: PrototypeEditCommentsDocument | null;
    deletedElementKeys: WebEditorElementKey[];
    observedTombstones: PrototypeEditCommentTombstone[];
  }> {
    if (!persistenceAdapter?.read) {
      return { document: null, deletedElementKeys: [], observedTombstones: [] };
    }
    const scope = resolvePersistenceScope();
    if (!scope) return { document: null, deletedElementKeys: [], observedTombstones: [] };
    try {
      const rawDocument = await Promise.resolve(persistenceAdapter.read(scope));
      const rawRecord = rawDocument as Partial<PrototypeEditCommentsDocument> | null;
      const rawComments = Array.isArray(rawRecord?.comments) ? rawRecord.comments : [];
      const rawImages = Array.isArray(rawRecord?.images) ? rawRecord.images : [];
      const observedCommentTombstones: PrototypeEditCommentTombstone[] = rawComments.flatMap((entry) => {
        const commentId = normalizeCommentId(entry.id);
        const deletedAt = Number(entry.deletedAt ?? 0);
        if (!commentId || !isDeletedRecord(entry)) return [];
        return [{
          kind: 'comment' as const,
          commentId,
          deletedAt,
        }];
      });
      const observedImageTombstones: PrototypeEditCommentTombstone[] = rawImages.flatMap((image) => {
        const id = String(image.id ?? '').trim();
        const commentId = normalizeCommentId(image.commentId);
        if (!id || !commentId || !isDeletedRecord(image)) return [];
        return [{
          kind: 'image' as const,
          id,
          commentId,
          deletedAt: Number(image.deletedAt),
        }];
      });
      const observedTombstones = [
        ...observedCommentTombstones,
        ...observedImageTombstones,
      ];
      const deletedElementKeys = Array.from(new Set(
        rawComments
          .filter((entry) => isDeletedRecord(entry) && isCurrentPageScopedRecord(entry))
          .flatMap((entry) => {
            const annotationIdentity = normalizeAnnotationPanelCacheIdentity(entry.locator);
            if (annotationIdentity) return [annotationIdentity.elementKey];
            const element = locateElement(entry.locator);
            return element?.isConnected
              ? [generateStableElementKey(element, entry.locator.shadowHostChain)]
              : [];
          }),
      ));
      return {
        document: normalizeAdapterDocument(rawDocument),
        deletedElementKeys,
        observedTombstones,
      };
    } catch (error) {
      console.warn('[Commentary] Failed to read prototype comments:', error);
      return { document: null, deletedElementKeys: [], observedTombstones: [] };
    }
  }

  async function restoreCachedChanges(): Promise<WebEditorElementKey[]> {
    if (typeof window === 'undefined') return [];
    const adapterResult = await readAdapterDocument();
    let adapterDocument = adapterResult.document;
    const deletedElementKeys = new Set(adapterResult.deletedElementKeys);
    if (adapterDocument) {
      lastAdapterDocument = adapterDocument;
    }
    if (adapterResult.observedTombstones.length > 0 && adapterDocument && persistenceAdapter?.write) {
      const scope = resolvePersistenceScope();
      if (scope) {
        try {
          const documentToCompact = adapterDocument;
          await enqueueTrackedAdapterWrite(
            scope,
            () => persistenceAdapter.write(scope, documentToCompact, 'restore', {
              observedTombstones: adapterResult.observedTombstones,
            }),
          );
          const refreshedResult = await readAdapterDocument();
          if (refreshedResult.document) {
            adapterDocument = refreshedResult.document;
            lastAdapterDocument = adapterDocument;
            refreshedResult.deletedElementKeys.forEach((elementKey) => {
              deletedElementKeys.add(elementKey);
            });
          }
        } catch (error) {
          console.warn('[Commentary] Failed to compact restored prototype comments:', error);
        }
      }
    }
    const resetCurrentPageRuntimeState = (): void => {
      clearCurrentPageRuntimeState();
      if (adapterDocument) {
        mergeAdapterCommentStates(adapterDocument);
      }
    };
    const payload: CachedChangePayload | null = adapterDocument
      ? {
          version: CACHE_VERSION,
          path: adapterDocument.resource.targetPath || resolveStorageScope() || '',
          updatedAt: Date.now(),
          showMarkers: state.changeMarkersVisible,
          entries: adapterDocument.comments
            .filter((entry) => isCurrentPageScopedRecord(entry))
            .map(commentEntryToCacheEntry),
        }
      : commentPersistenceMode === 'adapter-only'
        ? null
        : readCache();
    if (!payload) {
      resetCurrentPageRuntimeState();
      return Array.from(deletedElementKeys);
    }
    const scopedEntries = payload.entries.filter((entry) => isCurrentPageScopedRecord(entry));
    const annotationSourceNodeIds = collectAnnotationSourceNodeIdsFromWindow();
    const restorableEntries = annotationSourceNodeIds
      ? scopedEntries.filter((entry) => {
          const annotationPanelIdentity = normalizeAnnotationPanelCacheIdentity(entry.locator);
          if (!annotationPanelIdentity) return true;
          return annotationSourceNodeIds.has(annotationPanelIdentity.elementKey.replace(/^annotation-panel:/, ''));
        })
      : scopedEntries;
    if (restorableEntries.length !== scopedEntries.length && commentPersistenceMode !== 'adapter-only') {
      writeLocalCache(restorableEntries, payload.updatedAt);
    }
    if (scopedEntries.length === 0) {
      resetCurrentPageRuntimeState();
      if (adapterDocument) {
        if (commentPersistenceMode !== 'adapter-only') {
          writeLocalCache([], payload.updatedAt);
        }
      }
      return Array.from(deletedElementKeys);
    }
    if (restorableEntries.length === 0) {
      resetCurrentPageRuntimeState();
      return Array.from(deletedElementKeys);
    }
    cacheRestoreInProgress = true;
    currentAdapterDocument = adapterDocument;
    try {
      resetCurrentPageRuntimeState();
      if (typeof payload.showMarkers === 'boolean') {
        state.changeMarkersVisible = payload.showMarkers;
        setMarkerVisibility(payload.showMarkers);
      } else {
        state.changeMarkersVisible = readMarkerVisibility();
      }
      applyCachedEntries(restorableEntries);
    } finally {
      cacheRestoreInProgress = false;
      currentAdapterDocument = null;
    }
    state.propertyPanel?.refresh();
    changes.syncEditMetaWithTransactions();
    if (adapterDocument) {
      preserveMissingCurrentScopeRecordsOnNextWrite = true;
      if (commentPersistenceMode !== 'adapter-only') {
        writeLocalCache(buildCacheEntriesFromTransactions());
      }
      return Array.from(deletedElementKeys);
    }
    persistFromTransactions();
    return Array.from(deletedElementKeys);
  }

  function clearCachedChanges(kind: 'text' | 'style'): void {
    const entries = buildCacheEntriesFromTransactions();
    if (entries.length === 0) {
      writeCache([], 'clear');
      return;
    }

    const nextEntries: CachedChangeEntry[] = [];
    for (const entry of entries) {
      const next: CachedChangeEntry = { locator: entry.locator };
      if (entry.commentId) next.commentId = entry.commentId;
      if (entry.elementKey) next.elementKey = entry.elementKey;
      if (entry.label) next.label = entry.label;
      if (entry.tweak) next.tweak = entry.tweak;
      if (entry.note) next.note = entry.note;
      if (entry.skillIds) next.skillIds = entry.skillIds;
      if (entry.marker) next.marker = entry.marker;
      if (kind === 'text') {
        if (entry.styleChanges) next.styleChanges = entry.styleChanges;
      } else {
        if (entry.textChange) next.textChange = entry.textChange;
      }
      if (!next.textChange && !next.styleChanges && !next.tweak && !next.note && !(next.skillIds?.length ?? 0)) continue;
      nextEntries.push(next);
    }

    cacheRestoreInProgress = true;
    try {
      state.transactionManager?.clear();
      applyCachedEntries(nextEntries);
    } finally {
      cacheRestoreInProgress = false;
    }
    writeCache(nextEntries);
  }

  async function clearStorage(
    scope: CommentaryClearEditsScope = 'page',
    target: CommentaryClearEditsTarget = 'all',
  ): Promise<void> {
    const entries = buildCacheEntriesFromTransactions();
    const currentStates = buildCurrentCommentStates();
    const retainedEntries = target === 'completed'
      ? entries.filter((entry) => {
        const commentId = normalizeCommentId(entry.commentId);
        return (currentStates.get(commentId)?.state ?? entry.state) !== 'completed';
      })
      : [];
    if (commentPersistenceMode !== 'adapter-only') {
      writeLocalCache(retainedEntries);
    }
    await persistAdapterDocument(retainedEntries, 'clear', scope, target);
  }

  return {
    readMarkerVisibility,
    setMarkerVisibility,
    readCommentShortcutSettings,
    setCommentShortcutSettings,
    readUiSettings,
    setUiSettings,
    readAgentConversationState,
    writeAgentConversationState,
    clearAgentConversationState,
    readAgentTaskStates,
    discardAgentTaskStates,
    writeAgentTaskStates(scopeKey, tasks) {
      writeAgentTaskStates(scopeKey, tasks);
      persistCommentStateDocument();
    },
    pruneExpiredAgentTaskStates,
    recordCommentTaskState,
    getCommentTaskState,
    resetTerminalCommentStateForElement,
    waitForPendingWrites,
    getSaveStatus,
    listEditingConversationTasks,
    transitionConversationTaskTerminal,
    clearCommentRecord,
    scheduleWrite,
    persistFromTransactions,
    flushPendingWrite,
    restoreCachedChanges,
    getPersistedPrototypeCommentsDocument,
    clearCachedChanges,
    clearStorage,
  };
}
