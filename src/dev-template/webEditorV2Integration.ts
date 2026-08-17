import type {
  CommentaryDebugState,
  CommentaryEditedSnapshot,
  CommentaryExternalEditingState,
  CommentaryExternalEditingTaskRef,
  CommentaryExternalEditingStateResult,
  CommentaryExternalEditingTargetRef,
  CommentaryHostToolbarAction,
  CommentaryHostToolbarState,
  CommentaryHostResource,
  CommentaryPageElementActivationResult,
  CommentaryPageElementSearchQuery,
  CommentaryPageElementSearchResult,
  CommentaryPageElementStructureQuery,
  CommentaryPageElementStructureResult,
  CommentaryToolbarMode,
  CommentaryVoiceCommentOptions,
  CommentaryVoiceCommentResult,
  CommentaryVoiceTargets,
  CommentaryVoiceTargetsListener,
  WebEditorV2Api,
} from '@/common/web-editor-types';
export { buildInternalPrototypeCommentPageScope } from '../common/prototypeCommentPageScope';
import { buildInternalPrototypeCommentPageScope } from '../common/prototypeCommentPageScope';
import {
  createCommentary,
  getGlobalCommentaryTweakProtocol,
  subscribeAcpRuntimeStatuses,
  type CommentaryConversationTaskTransport,
  type PrototypeEditCommentsDocument,
  type PrototypeEditCommentsPersistenceAdapter,
  type PrototypeEditCommentsPersistenceScope,
  type WebEditorV2InitOptions,
} from '@axhub/commentary';
import { getImperativeAppDialog } from '../index/components/dialogs/AppDialogProvider';
import { buildHostCopyPrompt } from '../common/hostPromptBuilder';
import {
  buildQuickEditSaveConfirmation,
  mergeQuickEditSaveDrafts,
  type QuickEditSaveAction,
  type QuickEditSaveCommitResult,
  type QuickEditSaveDraft,
  type QuickEditSavePreflight,
} from '../common/quickEditSave';
import { buildMakeServerApiUrl, normalizeMakeServerOrigin } from '../common/makeServerOrigin';
import { normalizeSkillSource } from '../index/utils/skillPath';

const MARKDOWN_DOCS_BROADCAST_CHANNEL = 'axhub-markdown-docs';

export type WebEditorV2Status = {
  active: boolean;
  undoCount: number;
  redoCount: number;
};

export interface WebEditorV2Controller {
  enable: (options?: WebEditorV2EnableOptions) => Promise<void> | void;
  disable: () => void;
  isEnabled: () => boolean;
  getStatus: () => WebEditorV2Status;
  getDebugState: () => CommentaryDebugState | null;
  getHostToolbarState: () => CommentaryHostToolbarState;
  subscribeHostToolbarState: (listener: (state: CommentaryHostToolbarState) => void) => () => void;
  runHostToolbarAction: (action: CommentaryHostToolbarAction) => Promise<boolean>;
  getEditedSnapshot: () => CommentaryEditedSnapshot | null;
  getVoiceTarget: () => unknown | null;
  getVoiceTargets: () => CommentaryVoiceTargets;
  subscribeVoiceTargets: (listener: CommentaryVoiceTargetsListener) => () => void;
  findVoiceElements: (query: CommentaryPageElementSearchQuery) => CommentaryPageElementSearchResult;
  getVoiceElementStructure: (
    query: CommentaryPageElementStructureQuery,
  ) => CommentaryPageElementStructureResult;
  activateVoiceElement: (targetRef: string) => Promise<CommentaryPageElementActivationResult>;
  createVoiceComment: (
    targetRef: string,
    content: string,
    options: CommentaryVoiceCommentOptions,
  ) => Promise<CommentaryVoiceCommentResult>;
  validateExternalEditingTarget: (
    elementKey: string,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ) => Promise<boolean>;
  refreshPersistedComments: (deletedCommentIds?: readonly string[]) => Promise<void>;
  setNodeEditingState: (
    elementKey: string,
    nextState: CommentaryExternalEditingState,
    taskRef: Partial<CommentaryExternalEditingTaskRef> | null,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ) => Promise<CommentaryExternalEditingStateResult>;
  saveTextChanges: () => Promise<void>;
  saveStyleChanges: () => Promise<void>;
  clearForcedStyles: () => Promise<void>;
  prepareQuickEditSave: (action: QuickEditSaveAction) => Promise<QuickEditSaveDraft | null>;
  preflightQuickEditSave: (draft: QuickEditSaveDraft) => Promise<QuickEditSavePreflight>;
  commitQuickEditSave: (draft: QuickEditSaveDraft) => Promise<QuickEditSaveCommitResult>;
  enablePanelOnly: (options?: WebEditorV2EnableOptions) => Promise<void> | void;
  disablePanelOnly: () => void;
  isPanelOnlyMode: () => boolean;
  getCopyPromptText?: () => string;
  getElementPromptText?: (elementKey: string) => string;
  getDecisionDataCount: () => number;
}

export interface WebEditorV2EnableOptions {
  toolbarMode?: CommentaryToolbarMode;
  interactionProfile?: WebEditorV2InitOptions['interactionProfile'];
  initialDarkMode?: boolean;
  mobileMode?: boolean;
  assistantPanelOpen?: boolean;
  commentPageScope?: string;
  makeServerOrigin?: string;
  /** @deprecated Use makeServerOrigin. Kept for one client release. */
  annotationApiBaseUrl?: string;
  annotationProjectId?: string;
  agentRunConcurrency?: number;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readAnnotationInteractionProfileFromSearch(
  search: string,
): WebEditorV2InitOptions['interactionProfile'] | undefined {
  const params = new URLSearchParams(search);
  return params.get('annotationSession') === '1' ? 'annotation' : undefined;
}

const ANNOTATION_PAGE_CONTEXT_MISMATCH_MESSAGE =
  '无法准确定位标注位置，该标注需要由 AI 生成';

function buildAcpRuntimeEventsProxyUrl(projectId: string, targetPath: string): string {
  const params = new URLSearchParams();
  const normalizedProjectId = normalizeString(projectId);
  if (normalizedProjectId) params.set('projectId', normalizedProjectId);
  const normalizedTargetPath = normalizeString(targetPath);
  if (normalizedTargetPath) params.set('targetPath', normalizedTargetPath);
  const query = params.toString();
  return `/api/acp/conversations/runtime/events${query ? `?${query}` : ''}`;
}

function buildAcpRuntimeStatusProxyUrl(
  projectId: string,
  targetPath: string,
  threadId: string,
): string {
  const params = new URLSearchParams();
  const normalizedProjectId = normalizeString(projectId);
  if (normalizedProjectId) params.set('projectId', normalizedProjectId);
  const normalizedTargetPath = normalizeString(targetPath);
  if (normalizedTargetPath) params.set('targetPath', normalizedTargetPath);
  const normalizedThreadId = normalizeString(threadId);
  if (normalizedThreadId) params.set('threadId', normalizedThreadId);
  const query = params.toString();
  return `/api/acp/conversations/runtime/status${query ? `?${query}` : ''}`;
}

function resolveMakeServerApiPath(origin: string, path: string): string {
  const normalizedOrigin = normalizeMakeServerOrigin(origin);
  if (!normalizedOrigin || !path.startsWith('/')) return '';
  if (
    typeof window !== 'undefined'
    && normalizeMakeServerOrigin(
      window.location.origin || window.location.href,
    ) === normalizedOrigin
  ) {
    return path;
  }
  try {
    const url = new URL(path, normalizedOrigin);
    return buildMakeServerApiUrl(normalizedOrigin, url.pathname, url.searchParams);
  } catch {
    return '';
  }
}

function createMakeConversationTaskTransport(
  getMakeServerOrigin: () => string,
  getProjectId: () => string,
  getTargetPath: () => string,
): CommentaryConversationTaskTransport {
  return {
    watch(query, observer) {
      const makeServerOrigin = getMakeServerOrigin();
      if (!normalizeMakeServerOrigin(makeServerOrigin)) {
        return {
          done: Promise.resolve(),
          abort: () => undefined,
        };
      }
      const projectId = getProjectId();
      const targetPath = getTargetPath();
      const subscription = subscribeAcpRuntimeStatuses({
        eventsUrl: resolveMakeServerApiPath(
          makeServerOrigin,
          buildAcpRuntimeEventsProxyUrl(projectId, targetPath),
        ),
        runtimeUrl: resolveMakeServerApiPath(
          makeServerOrigin,
          buildAcpRuntimeStatusProxyUrl(projectId, targetPath, query.threadId),
        ),
        threadId: query.threadId,
        provider: query.provider,
      }, observer.next);
      return {
        done: subscription.done.then(() => undefined),
        abort: () => subscription.abort(),
      };
    },
  };
}

function normalizeBooleanFlag(value: unknown): boolean | undefined {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function isDebugTitleEnabled(search: string): boolean {
  const params = new URLSearchParams(search);
  const normalized = normalizeString(params.get('editorDebugTitle')).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function buildEditorDebugTitle(debugState: CommentaryDebugState | null): string {
  if (!debugState) {
    return '[EditorDebug] unavailable';
  }

  const conversation = debugState.currentConversation;
  const currentTask = debugState.currentElementTask;
  const taskSummary = debugState.visibleTasks
    .map((task) => `${task.elementKey}:${task.status}:${task.sessionId ?? '-'}`)
    .join(',');

  return [
    '[EditorDebug]',
    `connected=${debugState.connected ? 1 : 0}`,
    `available=${debugState.available ? 1 : 0}`,
    `reusable=${debugState.hasReusableConversation ? 1 : 0}`,
    `channel=${debugState.bridgeConfig?.integrationChannel ?? '-'}`,
    `target=${debugState.bridgeConfig?.targetClientId ?? '-'}`,
    `agent=${debugState.bridgeConfig?.provider ?? '-'}`,
    `selected=${debugState.selectedElementKey ?? '-'}`,
    `session=${conversation?.sessionId ?? '-'}`,
    `provider=${conversation?.provider ?? '-'}`,
    `current=${currentTask ? `${currentTask.elementKey}:${currentTask.status}:${currentTask.sessionId ?? '-'}` : '-'}`,
    `tasks=${taskSummary || '-'}`,
  ].join(' ');
}

function resolveTargetPathFromResource(resource: CommentaryHostResource | null): string {
  return normalizeString(resource?.path);
}

function resolvePrototypeCommentsTargetPath(scope: PrototypeEditCommentsPersistenceScope): string {
  const scopedTargetPath = normalizeString(scope.targetPath);
  if (scopedTargetPath.startsWith('prototypes/')) {
    return scopedTargetPath;
  }
  const resourceTargetPath = resolveTargetPathFromResource(scope.resource);
  return resourceTargetPath.startsWith('prototypes/') ? resourceTargetPath : '';
}

function buildPrototypeCommentsUrl(
  scope: PrototypeEditCommentsPersistenceScope,
  extraSearchParams: Record<string, string> = {},
): string {
  const targetPath = resolvePrototypeCommentsTargetPath(scope);
  if (!targetPath) return '';
  const params = new URLSearchParams({ targetPath, ...extraSearchParams });
  return `/api/prototype-comments?${params.toString()}`;
}

function appendPrototypeAnnotationProjectId(
  path: string,
  projectId: string,
): string {
  if (!path || !projectId) return path;
  try {
    const url = new URL(path, 'http://localhost');
    url.searchParams.set('projectId', projectId);
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

function buildPrototypeAnnotationUrl(targetPath: string, projectId = ''): string {
  if (!targetPath) return '';
  const params = new URLSearchParams({ targetPath });
  if (projectId) {
    params.set('projectId', projectId);
  }
  return `/api/prototype-annotation?${params.toString()}`;
}

const STANDALONE_COMMENTS_ERROR =
  'Make server origin is unavailable; standalone previews do not support comments.';

function createElementAnnotationLocator(element: Element): {
  selectors: string[];
  fingerprint: string;
  path: Array<{ tag: string; index: number }>;
} {
  const selectors: string[] = [];
  const pushSelector = (candidate: string): void => {
    const selector = candidate.trim();
    if (
      !selector
      || selectors.includes(selector)
      || !selectorUniquelyTargetsElement(element, selector)
    ) {
      return;
    }
    selectors.push(selector);
  };
  const annotationId = element.getAttribute('data-annotation-id');
  if (annotationId) {
    pushSelector(`[data-annotation-id="${annotationId.replace(/["\\]/g, '\\$&')}"]`);
  }
  if (element.id) {
    pushSelector(`#${escapeCssIdentifier(element.id)}`);
  }
  for (const className of readElementClassNames(element)) {
    pushSelector(`.${escapeCssIdentifier(className)}`);
  }
  const panelNodeId = element.getAttribute('data-axhub-annotation-panel-node-id');
  if (panelNodeId) {
    pushSelector(`[data-axhub-annotation-panel-node-id="${panelNodeId.replace(/["\\]/g, '\\$&')}"]`);
  }
  if (selectors.length === 0) {
    pushSelector(element.tagName.toLowerCase());
  }
  const pathParts: Array<{ tag: string; index: number }> = [];
  const structuralSelectorParts: string[] = [];
  let current: Element | null = element;
  while (current && current.tagName && current.tagName.toLowerCase() !== 'body') {
    const parentElement: Element | null = current.parentElement;
    const currentTagName = current.tagName;
    const currentTag = current.tagName.toLowerCase();
    const siblings = parentElement
      ? Array.from(parentElement.children).filter((child) => child.tagName === currentTagName)
      : [];
    const siblingIndex = Math.max(0, siblings.indexOf(current));
    pathParts.unshift({
      tag: currentTag,
      index: siblingIndex,
    });
    structuralSelectorParts.unshift(
      siblings.length > 1 ? `${currentTag}:nth-of-type(${siblingIndex + 1})` : currentTag,
    );
    current = parentElement;
  }
  if (structuralSelectorParts.length > 0) {
    pushSelector(structuralSelectorParts.join(' > '));
  }
  return {
    selectors: Array.from(new Set(selectors)),
    fingerprint: `${element.tagName.toLowerCase()}${element.id ? `|id=${element.id}` : ''}`,
    path: pathParts,
  };
}

function selectorUniquelyTargetsElement(element: Element, selector: string): boolean {
  const root = element.getRootNode?.();
  const queryRoot = root && typeof (root as ParentNode).querySelectorAll === 'function'
    ? root as ParentNode
    : element.ownerDocument
      ?? (typeof document !== 'undefined' ? document : null);
  if (!queryRoot) return false;

  try {
    const matches = queryRoot.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/gu, '\\$1');
}

function readElementClassNames(element: Element): string[] {
  const classAttribute = readElementAttribute(element, 'class');
  if (!classAttribute) return [];
  return classAttribute
    .split(/\s+/u)
    .map((className) => className.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function getAnnotationPanelNodeId(element: Element | null): string {
  if (!element) return '';
  const direct = readElementAttribute(element, 'data-axhub-annotation-panel-node-id');
  if (direct) return direct;
  const closest = element.closest?.('[data-axhub-annotation-panel-node-id]');
  return readElementAttribute(closest ?? null, 'data-axhub-annotation-panel-node-id');
}

function getAnnotationMarkerNodeId(element: Element | null): string {
  if (!element) return '';
  const direct = readElementAttribute(element, 'data-axhub-annotation-node-id');
  if (direct) return direct;
  const closest = element.closest?.('[data-axhub-annotation-node-id]');
  return readElementAttribute(closest ?? null, 'data-axhub-annotation-node-id');
}

function getCurrentAnnotationNodeId(element: Element | null): string {
  return getAnnotationPanelNodeId(element) || getAnnotationMarkerNodeId(element);
}

function readElementAttribute(element: Element | null, name: string): string {
  if (!element || typeof element.getAttribute !== 'function') return '';
  try {
    return element.getAttribute(name) ?? '';
  } catch {
    return '';
  }
}

function isAnnotationBubblePanelTarget(element: Element | null): boolean {
  if (!element) return false;
  if (readElementAttribute(element, 'data-axhub-annotation-panel-target') === 'true') {
    return true;
  }
  return Boolean(element.closest?.('[data-axhub-annotation-panel-target="true"]'));
}

function isAnnotationRuntimeCommentTarget(element: Element | null): boolean {
  if (!element) return false;
  if (readElementAttribute(element, 'data-axhub-annotation-comment-target') === 'true') {
    return true;
  }
  return Boolean(element.closest?.('[data-axhub-annotation-comment-target="true"]'));
}

function getDirectoryMarkdownNodeId(element: Element | null): string {
  if (!element) return '';
  const block = element.closest?.('[data-axhub-annotation-directory-markdown-block="true"]');
  return readElementAttribute(block ?? null, 'data-axhub-annotation-directory-markdown-id');
}

function canEditLocalAnnotationMarkdown(element: Element | null): boolean {
  if (!element) return false;
  if (isAnnotationBubblePanelTarget(element)) return true;
  return !isAnnotationRuntimeCommentTarget(element);
}

async function replaceRuntimeAnnotationSource(source: AnnotationSourceDocument): Promise<void> {
  type AnnotationRuntimeRef = {
    replaceSource?: (source: AnnotationSourceDocument) => void | Promise<void>;
    refresh?: () => void | Promise<void>;
  };
  const runtime = typeof window !== 'undefined'
    ? (window as Window & {
        __AXHUB_MAKE_ANNOTATION_RUNTIME__?: AnnotationRuntimeRef;
        __AXHUB_ANNOTATION_RUNTIME__?: AnnotationRuntimeRef;
      }).__AXHUB_MAKE_ANNOTATION_RUNTIME__
      ?? (window as Window & {
        __AXHUB_ANNOTATION_RUNTIME__?: AnnotationRuntimeRef;
      }).__AXHUB_ANNOTATION_RUNTIME__
    : null;

  const refreshRuntime = () => {
    void runtime?.refresh?.();
  };
  const scheduleRefresh = () => {
    refreshRuntime();
    const scheduleTimeout = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : typeof globalThis.setTimeout === 'function'
        ? globalThis.setTimeout.bind(globalThis)
        : null;
    if (!scheduleTimeout) return;
    [120, 360].forEach((delay) => {
      scheduleTimeout(refreshRuntime, delay);
    });
  };
  const result = runtime?.replaceSource?.(source);
  if (result && typeof (result as PromiseLike<void>).then === 'function') {
    try {
      await result;
    } catch {
      // Runtime refresh below re-reads the mounted source; a failed local replace should not
      // turn an already persisted annotation write into a save failure.
    } finally {
      scheduleRefresh();
    }
    return;
  }
  scheduleRefresh();
}

function safeDecodePathSegmentValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-z]:[\\/]/iu.test(value);
}

function normalizeDirectoryMarkdownPath(markdownPath: unknown): string {
  const rawPath = normalizeString(markdownPath);
  const decodedPath = safeDecodePathSegmentValue(rawPath);
  if (
    !rawPath
    || !decodedPath
    || rawPath.includes('\0')
    || decodedPath.includes('\0')
    || rawPath.startsWith('/')
    || decodedPath.startsWith('/')
    || isWindowsAbsolutePath(rawPath)
    || isWindowsAbsolutePath(decodedPath)
    || rawPath.includes('\\')
    || decodedPath.includes('\\')
  ) {
    return '';
  }

  const segments = [...rawPath.split('/'), ...decodedPath.split('/')];
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return '';
  }
  return decodedPath;
}

function resolvePrototypeIdFromTargetPath(targetPath: string): string {
  const match = normalizeString(targetPath).match(/^prototypes\/([^/]+)$/u);
  const prototypeId = match?.[1] || '';
  return isSafePrototypeResourceName(prototypeId) ? prototypeId : '';
}

function buildDirectoryMarkdownProjectRelativePath(
  targetPath: string,
  markdownPath: unknown,
): string {
  const prototypeId = resolvePrototypeIdFromTargetPath(targetPath);
  const normalizedMarkdownPath = normalizeDirectoryMarkdownPath(markdownPath);
  return prototypeId && normalizedMarkdownPath
    ? `src/prototypes/${prototypeId}/${normalizedMarkdownPath}`
    : '';
}

function buildDirectoryMarkdownEditUrl(
  projectRelativeMarkdownPath: string,
  options: { origin?: string; projectId?: string } = {},
): string {
  const params = new URLSearchParams();
  const projectId = normalizeString(options.projectId);
  if (projectId) {
    params.set('projectId', projectId);
  }
  params.set('docPath', projectRelativeMarkdownPath);
  const editUrl = `/?${params.toString()}`;
  const origin = normalizeMakeServerOrigin(options.origin);
  return origin ? new URL(editUrl, origin).toString() : editUrl;
}

function findDirectoryMarkdownNodeById(
  source: AnnotationSourceDocument | null,
  nodeId: string,
): AnnotationDirectoryNode | null {
  const nodes = source?.directory?.nodes;
  if (!Array.isArray(nodes)) return null;
  const walk = (items: readonly AnnotationDirectoryNode[]): AnnotationDirectoryNode | null => {
    for (const node of items) {
      if (!node || typeof node !== 'object') continue;
      if (node.type === 'folder' && Array.isArray(node.children)) {
        const found = walk(node.children);
        if (found) return found;
      }
      if (node.type === 'markdown' && normalizeString(node.id) === nodeId) {
        return node;
      }
    }
    return null;
  };
  return walk(nodes);
}

function resolveDirectoryMarkdownEditUrl(
  source: AnnotationSourceDocument | null,
  targetPath: string,
  nodeId: string,
  options: { origin?: string; projectId?: string } = {},
): string {
  const node = findDirectoryMarkdownNodeById(source, nodeId);
  if (!node) return '';
  const projectRelativePath = buildDirectoryMarkdownProjectRelativePath(targetPath, node.markdownPath);
  return projectRelativePath ? buildDirectoryMarkdownEditUrl(projectRelativePath, options) : '';
}

function collectDirectoryMarkdownProjectRelativePaths(
  source: AnnotationSourceDocument | null,
  targetPath: string,
): string[] {
  const nodes = source?.directory?.nodes;
  if (!Array.isArray(nodes)) return [];
  const paths: string[] = [];
  const walk = (items: readonly AnnotationDirectoryNode[]) => {
    for (const node of items) {
      if (!node || typeof node !== 'object') continue;
      if (node.type === 'folder' && Array.isArray(node.children)) {
        walk(node.children);
        continue;
      }
      if (node.type !== 'markdown') continue;
      const projectRelativePath = buildDirectoryMarkdownProjectRelativePath(targetPath, node.markdownPath);
      if (projectRelativePath) {
        paths.push(projectRelativePath);
      }
    }
  };
  walk(nodes);
  return paths;
}

function normalizeMarkdownDocsBroadcastPath(pathValue: unknown): string {
  return normalizeString(pathValue).replace(/\\/gu, '/');
}

function readMountedAnnotationSourceDocument(): AnnotationSourceDocument | null {
  if (typeof window === 'undefined') return null;
  const source = (window as Window & {
    __AXHUB_ANNOTATION_SOURCE_DOCUMENT__?: AnnotationSourceDocument;
  }).__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
  return source && typeof source === 'object' && source.data && Array.isArray(source.data.nodes)
    ? source
    : null;
}

function hasMountedAnnotationRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as Window & {
    __AXHUB_MAKE_ANNOTATION_RUNTIME__?: unknown;
    __AXHUB_ANNOTATION_RUNTIME__?: unknown;
  };
  const runtime = runtimeWindow.__AXHUB_ANNOTATION_RUNTIME__
    ?? runtimeWindow.__AXHUB_MAKE_ANNOTATION_RUNTIME__;
  return Boolean(runtime && typeof runtime === 'object');
}

function readMountedAnnotationRuntimeCurrentPageId(): string {
  if (typeof window === 'undefined') return '';
  type AnnotationRuntimeMetadataRef = {
    getMetadata?: () => { currentPageId?: unknown } | null | undefined;
  };
  const runtimeWindow = window as Window & {
    __AXHUB_MAKE_ANNOTATION_RUNTIME__?: AnnotationRuntimeMetadataRef;
    __AXHUB_ANNOTATION_RUNTIME__?: AnnotationRuntimeMetadataRef;
  };
  const runtime = runtimeWindow.__AXHUB_ANNOTATION_RUNTIME__
    ?? runtimeWindow.__AXHUB_MAKE_ANNOTATION_RUNTIME__;
  try {
    return normalizeString(runtime?.getMetadata?.()?.currentPageId);
  } catch {
    return '';
  }
}

function getLocalAnnotationCreateBlockReason(annotationPageId: unknown): string | undefined {
  if (typeof window === 'undefined') return undefined;
  let locationPageId = '';
  try {
    locationPageId = readInternalPrototypePageIdFromLocationUrl(
      new URL(window.location.href, 'http://localhost'),
    );
  } catch {
    return undefined;
  }
  const configuredPageId = normalizeString(annotationPageId);
  if (!locationPageId || !configuredPageId || locationPageId === configuredPageId) {
    return undefined;
  }
  return ANNOTATION_PAGE_CONTEXT_MISMATCH_MESSAGE;
}

function hasMountedAnnotationRuntimeSource(): boolean {
  if (!hasMountedAnnotationRuntime()) return false;
  const sourceDocument = (window as Window & {
    __AXHUB_ANNOTATION_SOURCE_DOCUMENT__?: unknown;
  }).__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
  if (sourceDocument && typeof sourceDocument === 'object') {
    return true;
  }
  const sourceSnapshot = (window as Window & {
    __AXHUB_ANNOTATION_SOURCE__?: {
      nodes?: unknown;
      directory?: unknown;
    };
  }).__AXHUB_ANNOTATION_SOURCE__;
  return Array.isArray(sourceSnapshot?.nodes);
}

function findMountedAnnotationSnapshotText(nodeId: string): string {
  if (!nodeId || typeof window === 'undefined') return '';
  const sourceSnapshot = (window as Window & {
    __AXHUB_ANNOTATION_SOURCE__?: {
      nodes?: Array<{ id?: unknown; annotationText?: unknown }>;
    };
  }).__AXHUB_ANNOTATION_SOURCE__;
  const node = Array.isArray(sourceSnapshot?.nodes)
    ? sourceSnapshot.nodes.find((item) => item.id === nodeId)
    : null;
  return typeof node?.annotationText === 'string' ? node.annotationText : '';
}

function readLocatorSelectors(locator: unknown): string[] {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return [];
  const selectors = (locator as { selectors?: unknown }).selectors;
  if (!Array.isArray(selectors)) return [];
  return selectors
    .map((selector) => normalizeString(selector))
    .filter(Boolean);
}

function findAnnotationNodeByLocator(
  source: AnnotationSourceDocument,
  locator: unknown,
): { id?: unknown; locator?: unknown } | null {
  const serializedLocator = JSON.stringify(locator ?? null);
  const exactMatch = source.data.nodes.find((item) => JSON.stringify(item.locator ?? null) === serializedLocator);
  if (exactMatch) return exactMatch;

  const selectorSet = new Set(readLocatorSelectors(locator));
  if (selectorSet.size === 0) return null;
  return source.data.nodes.find((item) => (
    readLocatorSelectors(item.locator).some((selector) => selectorSet.has(selector))
  )) ?? null;
}

function createPrototypeAnnotationClient() {
  let cachedTargetPath = '';
  let cachedSource: AnnotationSourceDocument | null = null;
  let cachedApiSourcePageId = '';
  let cachedEnabled = false;
  let enableLoading = false;
  let configuredMakeServerOrigin = '';
  let configuredProjectId = '';

  const resolveAnnotationMakeServerOrigin = (): string => {
    if (configuredMakeServerOrigin) return configuredMakeServerOrigin;
    if (typeof window === 'undefined') return '';
    try {
      const origin = new URL(window.location.href).origin;
      return new URL(origin).port === '53817' ? normalizeMakeServerOrigin(origin) : '';
    } catch {
      return '';
    }
  };

  const resolveRequestUrl = async (path: string): Promise<string> => {
    if (!path) return '';
    return resolveMakeServerApiPath(resolveAnnotationMakeServerOrigin(), path);
  };

  const resolveTargetPath = (): string => {
    const resource = typeof window !== 'undefined'
      ? resolveHostResourceContextFromLocation(window.location.pathname, window.location.href)
      : null;
    const targetPath = resolveTargetPathFromResource(resource);
    return targetPath.startsWith('prototypes/') ? targetPath : '';
  };

  const resolveCurrentPageId = (): string => {
    if (typeof window === 'undefined') return '';
    try {
      return readInternalPrototypePageIdFromLocationUrl(new URL(window.location.href, 'http://localhost'));
    } catch {
      return '';
    }
  };

  const readStatus = async (): Promise<{ enabled: boolean; source: AnnotationSourceDocument | null }> => {
    const targetPath = resolveTargetPath();
    cachedTargetPath = targetPath;
    if (!targetPath) {
      cachedEnabled = false;
      cachedSource = null;
      cachedApiSourcePageId = '';
      return { enabled: false, source: null };
    }
    const url = await resolveRequestUrl(buildPrototypeAnnotationUrl(targetPath, configuredProjectId));
    if (!url) {
      cachedEnabled = hasMountedAnnotationRuntime();
      cachedSource = readMountedAnnotationSourceDocument() ?? null;
      cachedApiSourcePageId = normalizeString(cachedSource?.data?.pageId);
      return { enabled: cachedEnabled, source: cachedSource };
    }
    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        cachedEnabled = false;
        cachedSource = null;
        cachedApiSourcePageId = '';
        return { enabled: false, source: null };
      }
      const payload = await response.json().catch(() => null) as {
        enabled?: boolean;
        source?: AnnotationSourceDocument | null;
      } | null;
      cachedEnabled = payload?.enabled === true || hasMountedAnnotationRuntime();
      cachedApiSourcePageId = normalizeString(payload?.source?.data?.pageId);
      cachedSource = payload?.source ?? readMountedAnnotationSourceDocument() ?? null;
      return { enabled: cachedEnabled, source: cachedSource };
    } catch (error) {
      cachedEnabled = false;
      cachedSource = null;
      cachedApiSourcePageId = '';
      throw error;
    }
  };

  const refreshSource = async (): Promise<AnnotationSourceDocument | null> => {
    const status = await readStatus();
    if (status.source) {
      replaceRuntimeAnnotationSource(status.source);
    }
    return status.source;
  };

  const getDirectoryMarkdownProjectRelativePaths = (): string[] => (
    collectDirectoryMarkdownProjectRelativePaths(cachedSource, cachedTargetPath || resolveTargetPath())
  );

  const getCurrentPageId = (): string => (
    readMountedAnnotationRuntimeCurrentPageId()
    || cachedApiSourcePageId
    || normalizeString(readMountedAnnotationSourceDocument()?.data?.pageId)
  );

  const getDocumentEditUrl = (element: Element | null): string => {
    if (!cachedEnabled && !hasMountedAnnotationRuntimeSource()) return '';
    const nodeId = getDirectoryMarkdownNodeId(element);
    if (!nodeId) return '';
    const source = cachedSource ?? readMountedAnnotationSourceDocument();
    return resolveDirectoryMarkdownEditUrl(source, cachedTargetPath || resolveTargetPath(), nodeId, {
      origin: resolveAnnotationMakeServerOrigin(),
      projectId: configuredProjectId,
    });
  };

  const enable = async (): Promise<boolean> => {
    if (cachedEnabled) return true;
    const targetPath = cachedTargetPath || resolveTargetPath();
    if (!targetPath || enableLoading) return false;
    enableLoading = true;
    try {
      const url = await resolveRequestUrl(appendPrototypeAnnotationProjectId(
        '/api/prototype-annotation/enable',
        configuredProjectId,
      ));
      if (!url) throw new Error(STANDALONE_COMMENTS_ERROR);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath,
          ...(configuredProjectId ? { projectId: configuredProjectId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as {
        enabled?: boolean;
        source?: AnnotationSourceDocument | null;
        changedIndex?: boolean;
        error?: string;
      } | null;
      if (!response.ok || payload?.enabled !== true) {
        throw new Error(payload?.error || '开启需求标注失败');
      }
      cachedSource = payload.source ?? cachedSource;
      if (payload.source) {
        cachedApiSourcePageId = normalizeString(payload.source.data?.pageId);
      }
      const runtimeMounted = hasMountedAnnotationRuntime();
      if (runtimeMounted && payload.source) {
        replaceRuntimeAnnotationSource(payload.source);
      }
      cachedEnabled = true;
      return true;
    } finally {
      enableLoading = false;
    }
  };

  const getMarkdown = async (element: Element | null): Promise<string> => {
    const annotationNodeId = getCurrentAnnotationNodeId(element);
    const source = cachedSource
      ?? readMountedAnnotationSourceDocument()
      ?? (await readStatus()).source
      ?? readMountedAnnotationSourceDocument();
    if (!source) return annotationNodeId ? findMountedAnnotationSnapshotText(annotationNodeId) : '';
    const node = annotationNodeId
      ? source.data.nodes.find((item) => item.id === annotationNodeId)
      : findAnnotationNodeByLocator(source, element ? createElementAnnotationLocator(element) : null);
    if (!node?.id) return '';
    const markdown = source.markdownMap?.[node.id];
    return typeof markdown === 'string' ? markdown : findMountedAnnotationSnapshotText(node.id);
  };

  const writeMarkdown = async (element: Element, markdown: string): Promise<void> => {
    const targetPath = cachedTargetPath || resolveTargetPath();
    if (!targetPath) return;
    const locator = createElementAnnotationLocator(element);
    const source = cachedSource ?? readMountedAnnotationSourceDocument();
    const matchedAnnotationNodeId = source
      ? normalizeString(findAnnotationNodeByLocator(source, locator)?.id)
      : '';
    const annotationNodeId = getCurrentAnnotationNodeId(element) || matchedAnnotationNodeId;
    const pageId = annotationNodeId ? '' : resolveCurrentPageId();
    const url = await resolveRequestUrl(appendPrototypeAnnotationProjectId(
      '/api/prototype-annotation/node',
      configuredProjectId,
    ));
    if (!url) throw new Error(STANDALONE_COMMENTS_ERROR);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPath,
        ...(configuredProjectId ? { projectId: configuredProjectId } : {}),
        ...(annotationNodeId ? { nodeId: annotationNodeId } : { locator, ...(pageId ? { pageId } : {}) }),
        markdown,
      }),
    });
    const payload = await response.json().catch(() => null) as {
      source?: AnnotationSourceDocument;
      error?: string;
    } | null;
    if (!response.ok || !payload?.source) {
      throw new Error(payload?.error || '保存需求标注失败');
    }
    cachedEnabled = true;
    cachedSource = payload.source;
    cachedApiSourcePageId = normalizeString(payload.source.data?.pageId);
    await replaceRuntimeAnnotationSource(payload.source);
  };

  return {
    configure: (config: { makeServerOrigin?: unknown; apiBaseUrl?: unknown; projectId?: unknown }) => {
      const nextMakeServerOrigin = normalizeMakeServerOrigin(
        config.makeServerOrigin ?? config.apiBaseUrl,
      );
      const nextProjectId = normalizeString(config.projectId);
      const changed = (
        nextMakeServerOrigin !== configuredMakeServerOrigin
        || nextProjectId !== configuredProjectId
      );
      if (nextMakeServerOrigin !== configuredMakeServerOrigin) {
        configuredMakeServerOrigin = nextMakeServerOrigin;
      }
      if (nextProjectId !== configuredProjectId) {
        configuredProjectId = nextProjectId;
      }
      if (changed) {
        cachedTargetPath = '';
        cachedSource = null;
        cachedApiSourcePageId = '';
        cachedEnabled = hasMountedAnnotationRuntimeSource();
      }
    },
    readStatus,
    refreshSource,
    enable,
    getDocumentEditUrl,
    getDirectoryMarkdownProjectRelativePaths,
    getCurrentPageId,
    getMarkdown,
    writeMarkdown,
    isEnabled: () => cachedEnabled || hasMountedAnnotationRuntime(),
    isAvailable: () => Boolean(cachedTargetPath || resolveTargetPath()),
    isLoading: () => enableLoading,
  };
}

export function createPrototypeCommentsPersistenceAdapter(options: {
  getProjectId?: () => unknown;
  getMakeServerOrigin?: () => unknown;
} = {}): PrototypeEditCommentsPersistenceAdapter {
  const resolveRequestUrl = async (
    scope: PrototypeEditCommentsPersistenceScope,
    extraSearchParams: Record<string, string> = {},
  ): Promise<string> => {
    const projectId = normalizeString(options.getProjectId?.());
    const path = buildPrototypeCommentsUrl(scope, {
      ...extraSearchParams,
      ...(projectId ? { projectId } : {}),
    });
    if (!path) return '';
    return resolveMakeServerApiPath(
      normalizeMakeServerOrigin(options.getMakeServerOrigin?.()),
      path,
    );
  };

  return {
    async read(scope) {
      const url = await resolveRequestUrl(scope, { hydrateImages: '1' });
      if (!url) return null;
      try {
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
          console.warn('[MakeWebEditor] Failed to read prototype comments:', response.status);
          return null;
        }
        const payload = await response.json().catch(() => null) as {
          exists?: boolean;
          document?: PrototypeEditCommentsDocument | null;
        } | null;
        if (!payload?.exists || !payload.document) {
          return null;
        }
        return payload.document;
      } catch (error) {
        console.warn('[MakeWebEditor] Failed to read prototype comments:', error);
        return null;
      }
    },
    async write(scope, document, reason, context) {
      const url = await resolveRequestUrl(scope);
      if (!url) throw new Error(STANDALONE_COMMENTS_ERROR);
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document,
            reason,
            ...(context?.observedTombstones?.length
              ? { observedTombstones: context.observedTombstones }
              : {}),
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to write prototype comments: ${response.status}`);
        }
      } catch (error) {
        console.warn('[MakeWebEditor] Failed to write prototype comments:', error);
        throw error;
      }
    },
  };
}

type JsonPostResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

type PreviewDialogKind = 'confirm' | 'alert';

type PreviewDialogRequest = {
  type: 'WEB_EDITOR_DIALOG_REQUEST';
  requestId: string;
  kind: PreviewDialogKind;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'brand' | 'destructive';
  dismissible?: boolean;
};

type PreviewDialogResponse = {
  type: 'WEB_EDITOR_DIALOG_RESPONSE' | 'WEB_EDITOR_DIALOG_ACK';
  requestId: string;
  confirmed?: boolean;
};

type PrototypeEditorHostToolbarActionRequest = {
  type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST';
  requestId: string;
  action: CommentaryHostToolbarAction;
};

type PrototypeEditorHostToolbarActionResult = {
  type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT';
  requestId: string;
  handled?: boolean;
  error?: string;
};

const TEMPORARY_STYLE_HACK_COMMENT = `/*
 * AXHUB TEMPORARY STYLE HACK
 * 这是预览编辑产生的临时覆盖样式，不是最终实现。
 * 后续修改本原型时，应将规则合并到正式组件或样式文件，
 * 验证效果后删除已合并规则；文件为空后删除 hack.css。
 */`;

export function withTemporaryStyleHackComment(cssText: string): string {
  const content = String(cssText ?? '').trim();
  if (content.startsWith(TEMPORARY_STYLE_HACK_COMMENT)) return `${content}\n`;
  return `${TEMPORARY_STYLE_HACK_COMMENT}\n\n${content}\n`;
}

type AnnotationDirectoryNode = {
  type?: unknown;
  id?: unknown;
  markdownPath?: unknown;
  children?: AnnotationDirectoryNode[];
  [key: string]: unknown;
};

type AnnotationSourceDocument = {
  documentVersion: 1;
  format: 'axhub-annotation-source';
  data: {
    version: 2;
    prototypeName: string;
    pageId?: string;
    nodes: Array<{
      id: string;
      locator?: unknown;
      annotationText?: string;
      hasMarkdown?: boolean;
      controls?: unknown[];
      [key: string]: unknown;
    }>;
    updatedAt: number;
    [key: string]: unknown;
  };
  markdownMap?: Record<string, string>;
  assetMap?: Record<string, string>;
  directory?: {
    nodes?: AnnotationDirectoryNode[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

let previewDialogRequestSequence = 0;
let hostToolbarActionRequestSequence = 0;

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<JsonPostResult<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({} as T));
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function readResponseErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }
  }
  return fallback;
}

function nextPreviewDialogRequestId(): string {
  previewDialogRequestSequence += 1;
  return `web-editor-dialog-${previewDialogRequestSequence}`;
}

function nextHostToolbarActionRequestId(): string {
  hostToolbarActionRequestSequence += 1;
  return `prototype-editor-host-toolbar-action-${hostToolbarActionRequestSequence}`;
}

function canUseParentDialogBridge(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.parent && window.parent !== window);
}

function canUseParentHostToolbarBridge(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.parent && window.parent !== window);
}

async function requestParentDialog(request: Omit<PreviewDialogRequest, 'type' | 'requestId'>): Promise<boolean | null> {
  if (!canUseParentDialogBridge()) {
    return null;
  }

  const requestId = nextPreviewDialogRequestId();
  const payload: PreviewDialogRequest = {
    type: 'WEB_EDITOR_DIALOG_REQUEST',
    requestId,
    ...request,
  };

  return new Promise<boolean | null>((resolve) => {
    let settled = false;
    let parentAcknowledged = false;

    const cleanup = () => {
      if (typeof window === 'undefined') return;
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
    };

    const finish = (value: boolean | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as PreviewDialogResponse | undefined;
      if (!data) return;
      if (String(data.requestId || '') !== requestId) return;
      if (data.type === 'WEB_EDITOR_DIALOG_ACK') {
        parentAcknowledged = true;
        window.clearTimeout(timeoutId);
        return;
      }
      if (data.type !== 'WEB_EDITOR_DIALOG_RESPONSE') return;
      finish(data.confirmed ?? true);
    };

    const timeoutId = window.setTimeout(() => {
      if (parentAcknowledged) return;
      finish(false);
    }, 60_000);

    window.addEventListener('message', handleMessage);
    window.parent.postMessage(payload, '*');
  });
}

async function requestParentHostToolbarAction(action: CommentaryHostToolbarAction): Promise<boolean> {
  if (!canUseParentHostToolbarBridge()) {
    return false;
  }

  const requestId = nextHostToolbarActionRequestId();
  const payload: PrototypeEditorHostToolbarActionRequest = {
    type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST',
    requestId,
    action,
  };

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const cleanup = () => {
      if (typeof window === 'undefined') return;
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
    };

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as PrototypeEditorHostToolbarActionResult | undefined;
      if (!data || data.type !== 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT') return;
      if (String(data.requestId || '') !== requestId) return;
      if (event.source && event.source !== window.parent) return;
      finish(Boolean(data.handled));
    };

    const timeoutId = window.setTimeout(() => {
      finish(false);
    }, 60_000);

    window.addEventListener('message', handleMessage);
    window.parent.postMessage(payload, '*');
  });
}

async function confirmAction(message: string): Promise<boolean> {
  const parentResult = await requestParentDialog({
    kind: 'confirm',
    title: '确认操作',
    description: message,
    confirmText: '确定',
    cancelText: '取消',
    tone: 'brand',
    dismissible: false,
  });
  if (parentResult !== null) {
    return parentResult;
  }

  const dialog = getImperativeAppDialog();
  if (dialog) {
    return dialog.confirm({
      title: '确认操作',
      description: message,
      confirmText: '确定',
      cancelText: '取消',
      tone: 'brand',
      dismissible: false,
    });
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message);
  }
  return true;
}

async function confirmEnableAnnotation(): Promise<boolean> {
  const description = '开启需求标注功能后，你可以在当前原型里查看和编辑需求标注。这个入口开启后不能在这里关闭；如果之后需要关闭，请让 AI 帮你处理。';
  const parentResult = await requestParentDialog({
    kind: 'confirm',
    title: '开启需求标注',
    description,
    confirmText: '开启',
    cancelText: '取消',
    tone: 'brand',
    dismissible: false,
  });
  if (parentResult !== null) {
    return parentResult;
  }

  const dialog = getImperativeAppDialog();
  if (dialog) {
    return dialog.confirm({
      title: '开启需求标注',
      description,
      confirmText: '开启',
      cancelText: '取消',
      tone: 'brand',
      dismissible: false,
    });
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(description);
  }
  return true;
}

async function alertEnableAnnotationFailed(): Promise<void> {
  const description = '需求标注没有开启成功，请刷新页面后再试。如果仍然失败，请让 AI 帮你处理。';
  const parentResult = await requestParentDialog({
    kind: 'alert',
    title: '开启失败',
    description,
    confirmText: '知道了',
    tone: 'default',
    dismissible: true,
  });
  if (parentResult !== null) {
    return;
  }

  const dialog = getImperativeAppDialog();
  if (dialog) {
    await dialog.alert({
      title: '开启失败',
      description,
      confirmText: '知道了',
      tone: 'default',
      dismissible: true,
    });
    return;
  }

  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(description);
  }
}

function notifyPreview(
  level: 'info' | 'warning' | 'error' | 'success',
  message: string,
): void {
  const normalizedMessage = normalizeString(message);
  if (!normalizedMessage || typeof window === 'undefined') return;

  const logger =
    level === 'error'
      ? console.error
      : level === 'warning'
        ? console.warn
        : console.info;
  logger(`[Axhub] ${normalizedMessage}`);
}

function readEditorMobileModeFromSearch(search: string): boolean | undefined {
  const params = new URLSearchParams(search);
  return normalizeBooleanFlag(
    params.get('editorMobileMode') ?? params.get('mobileMode'),
  );
}

export function readHostToolbarModeFromSearch(
  search: string,
): CommentaryToolbarMode | undefined {
  const params = new URLSearchParams(search);
  return normalizeString(params.get('agentToolbar')).toLowerCase() === 'host'
    ? 'host'
    : undefined;
}

function buildFallbackHostToolbarState(toolbarMode: CommentaryToolbarMode = 'inline'): CommentaryHostToolbarState {
  return {
    toolbarMode,
    visible: false,
    robotState: 'sleeping',
    robotTitle: '打开 AI',
    robotDisabled: true,
    robotLoading: false,
    sendVisible: false,
    sendTitle: '发送给 AI',
    sendDisabled: true,
    sendLoading: false,
    interruptVisible: false,
    interruptTitle: '停止 AI 修改',
    interruptDisabled: true,
    interruptLoading: false,
    copyPromptVisible: false,
    copyPromptTitle: '复制 Prompt',
    copyPromptDisabled: true,
    clearEditsTitle: '清空全部编辑',
    clearEditsDisabled: true,
    propertyPanelOpen: false,
    propertyPanelTitle: '打开设计决策',
    modifiedCount: 0,
    terminalTaskCount: 0,
    selectedAgent: null,
    agentOptions: [{ value: null, label: '默认' }],
    darkMode: false,
    disablePageAnimations: false,
    captureTargetScreenshotAvailable: false,
    captureTargetScreenshot: false,
    pageZoomEnabled: false,
    copySkillInstallPromptDisabled: true,
    selectionModeActive: true,
    fullExitAvailable: false,
    annotationEnabled: false,
    annotationEnableAvailable: false,
    annotationEnableLoading: false,
    annotationEnableDisabled: true,
    annotationEnableTitle: '开启需求标注',
  };
}

function countPageDecisionData(): number {
  if (typeof document === 'undefined') {
    return 0;
  }
  try {
    return getGlobalCommentaryTweakProtocol()?.listEntries(document).length ?? 0;
  } catch {
    return 0;
  }
}

type HostResourceRoute = {
  group: 'prototypes' | 'themes';
  name: string;
  path: string;
  scopePathname: string;
  indexDeepLink: boolean;
};

function isSafePrototypeResourceName(value: string): boolean {
  return Boolean(
    value
      && !value.startsWith('.')
      && !value.includes('..')
      && !/[\\/]/u.test(value)
      && !value.includes('\0'),
  );
}

const INTERNAL_PROTOTYPE_PAGE_ID_RE = /^[a-z0-9-]+$/u;

function readInternalPrototypePageIdFromLocationUrl(url: URL | null): string {
  if (!url) {
    return '';
  }
  const hashPageId = normalizeString(new URLSearchParams(url.hash.replace(/^#/, '')).get('page'));
  if (INTERNAL_PROTOTYPE_PAGE_ID_RE.test(hashPageId)) {
    return hashPageId;
  }
  const searchPageId = normalizeString(url.searchParams.get('page'));
  return INTERNAL_PROTOTYPE_PAGE_ID_RE.test(searchPageId) ? searchPageId : '';
}

function resolveHostResourceRoute(
  pathname: string,
  url: URL | null,
): HostResourceRoute | null {
  const match = pathname.match(/^\/(prototypes|themes)\/(.+)$/u);
  if (match) {
    const group = match[1] as 'prototypes' | 'themes';
    let nameParts: string[];
    try {
      nameParts = match[2].split('/').map((part) => decodeURIComponent(part));
    } catch {
      return null;
    }
    if (nameParts.some((part) => !isSafePrototypeResourceName(part))) {
      return null;
    }
    const name = nameParts.join('/');
    const path = `${group}/${name}`;
    return {
      group,
      name,
      path,
      scopePathname: url?.pathname || `/${path}`,
      indexDeepLink: false,
    };
  }

  if (pathname !== '/' || !url || url.pathname !== '/') {
    return null;
  }

  const prototypeId = normalizeString(url.searchParams.get('p'));
  if (!isSafePrototypeResourceName(prototypeId)) {
    return null;
  }

  const path = `prototypes/${prototypeId}`;
  return {
    group: 'prototypes',
    name: prototypeId,
    path,
    scopePathname: `/${path}`,
    indexDeepLink: true,
  };
}

function buildCommentPageScope(
  url: URL,
  scopePathname: string,
  indexDeepLink: boolean,
): string {
  const scopeParams = new URLSearchParams(url.search);
  for (const key of ['editor', 'axhubPane', 'axhubQuickEditContext', 'agentToolbar']) {
    scopeParams.delete(key);
  }
  if (indexDeepLink) {
    for (const key of ['projectId', 'p', 'v', 'sidebar']) {
      scopeParams.delete(key);
    }
  }
  const sortedScopeParams = new URLSearchParams();
  Array.from(scopeParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .forEach(([key, value]) => sortedScopeParams.append(key, value));
  const scopeSearch = sortedScopeParams.toString();
  return `${scopePathname}${scopeSearch ? `?${scopeSearch}` : ''}${url.hash}`;
}

export function resolveHostResourceContextFromLocation(
  pathname: string,
  href: string,
  overrides: { commentPageScope?: string } = {},
): CommentaryHostResource | null {
  const normalizedPathname = normalizeString(pathname);
  const normalizedHref = normalizeString(href);
  let locationUrl: URL | null = null;

  if (normalizedHref) {
    try {
      locationUrl = new URL(normalizedHref, 'http://localhost');
    } catch {
      locationUrl = null;
    }
  }

  if (normalizedPathname === '/spec-template.html') {
    try {
      const outerUrl = locationUrl ?? new URL(normalizedPathname, 'http://localhost');
      const markdownUrlRaw = normalizeString(outerUrl.searchParams.get('url'));
      const markdownUrl = markdownUrlRaw
        ? new URL(markdownUrlRaw, outerUrl.origin)
        : null;
      const filePath = markdownUrl?.pathname === '/api/markdown-file'
        ? normalizeString(markdownUrl.searchParams.get('path'))
        : '';
      if (filePath) {
        return {
          kind: 'document',
          id: filePath,
          path: filePath,
          url: normalizedHref || undefined,
          meta: {
            filePath,
            route: normalizedPathname,
          },
        };
      }
    } catch {
      // Fall through to prototype/component detection.
    }
  }

  const resourceRoute = resolveHostResourceRoute(normalizedPathname, locationUrl);
  if (!resourceRoute) return null;

  const { group, name, path, scopePathname, indexDeepLink } = resourceRoute;
  let storageScope: string | undefined;
  let commentPageScope: string | undefined;

  if (locationUrl) {
    try {
      const isQuickEdit = locationUrl.searchParams.get('editor') === 'webEditorV2'
        || locationUrl.searchParams.get('axhubQuickEditContext') === '1';
      const pane = normalizeString(locationUrl.searchParams.get('axhubPane')).toLowerCase();
      if (isQuickEdit && (pane === 'primary' || pane === 'secondary')) {
        storageScope = `${path}::quick-edit::${pane}`;
      }
      commentPageScope = buildInternalPrototypeCommentPageScope(
        path,
        group === 'prototypes' ? readInternalPrototypePageIdFromLocationUrl(locationUrl) : '',
      ) || buildCommentPageScope(locationUrl, scopePathname, indexDeepLink);
    } catch {
      storageScope = undefined;
      commentPageScope = undefined;
    }
  }

  const explicitCommentPageScope = normalizeString(overrides.commentPageScope);

  return {
    kind: 'prototype-entry',
    id: path,
    path,
    url: normalizedHref || undefined,
    meta: {
      group,
      name,
      ...(storageScope ? { storageScope } : {}),
      commentPageScope: explicitCommentPageScope || commentPageScope || `/${path}`,
    },
  };
}

export const createWebEditorV2Controller = (
  options: WebEditorV2InitOptions = {},
): WebEditorV2Controller => {
  let editor: WebEditorV2Api | null = null;
  let editorInitPromise: Promise<WebEditorV2Api> | null = null;
  let runtimeToolbarMode: CommentaryToolbarMode | undefined;
  let runtimeInteractionProfile: WebEditorV2InitOptions['interactionProfile'] | undefined;
  let runtimeAssistantPanelOpen = false;
  let runtimeCommentPageScope = '';
  let runtimeMakeServerOrigin = '';
  let runtimeAnnotationProjectId = '';
  let debugTitleTimer: number | null = null;
  let baseDocumentTitle = '';
  const annotationClient = createPrototypeAnnotationClient();
  let annotationMarkdownDocsChannel: BroadcastChannel | null = null;
  let annotationMarkdownDocsRefreshInFlight: Promise<void> | null = null;
  let annotationMarkdownDocsFocusRefreshTimer: number | null = null;

  const refreshAnnotationStatus = async () => {
    try {
      await annotationClient.readStatus();
    } catch {
      // Standalone or third-party previews simply hide local annotation actions.
    }
  };

  const refreshDirectoryMarkdownSource = async (): Promise<void> => {
    if (annotationMarkdownDocsRefreshInFlight) {
      return annotationMarkdownDocsRefreshInFlight;
    }
    annotationMarkdownDocsRefreshInFlight = (async () => {
      try {
        await annotationClient.refreshSource();
        editor?.refresh?.();
      } catch {
        // Standalone previews may not have Make annotation APIs.
      } finally {
        annotationMarkdownDocsRefreshInFlight = null;
      }
    })();
    return annotationMarkdownDocsRefreshInFlight;
  };

  const handleMarkdownDocsWindowFocus = () => {
    if (typeof window === 'undefined') return;
    if (annotationClient.getDirectoryMarkdownProjectRelativePaths().length === 0) return;
    if (
      annotationMarkdownDocsFocusRefreshTimer !== null
      && typeof window.clearTimeout === 'function'
    ) {
      window.clearTimeout(annotationMarkdownDocsFocusRefreshTimer);
    }
    const setTimeoutFn = typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : typeof globalThis.setTimeout === 'function'
        ? globalThis.setTimeout.bind(globalThis)
        : null;
    if (!setTimeoutFn) {
      void refreshDirectoryMarkdownSource();
      return;
    }
    annotationMarkdownDocsFocusRefreshTimer = setTimeoutFn(() => {
      annotationMarkdownDocsFocusRefreshTimer = null;
      void refreshDirectoryMarkdownSource();
    }, 120);
  };

  const handleMarkdownDocsMessage = (event: MessageEvent) => {
    const knownPaths = annotationClient.getDirectoryMarkdownProjectRelativePaths();
    if (knownPaths.length === 0) return;
    const savedPath = normalizeMarkdownDocsBroadcastPath((event.data as { path?: unknown } | null)?.path);
    if (savedPath && !knownPaths.includes(savedPath)) return;
    void refreshDirectoryMarkdownSource();
  };

  const stopDirectoryMarkdownDocsSync = () => {
    if (typeof window !== 'undefined') {
      if (
        annotationMarkdownDocsFocusRefreshTimer !== null
        && typeof window.clearTimeout === 'function'
      ) {
        window.clearTimeout(annotationMarkdownDocsFocusRefreshTimer);
      }
      annotationMarkdownDocsFocusRefreshTimer = null;
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', handleMarkdownDocsWindowFocus);
      }
    }
    annotationMarkdownDocsChannel?.close();
    annotationMarkdownDocsChannel = null;
  };

  const startDirectoryMarkdownDocsSync = () => {
    stopDirectoryMarkdownDocsSync();
    if (typeof window === 'undefined') return;
    if (annotationClient.getDirectoryMarkdownProjectRelativePaths().length === 0) return;
    if (typeof BroadcastChannel !== 'undefined') {
      annotationMarkdownDocsChannel = new BroadcastChannel(MARKDOWN_DOCS_BROADCAST_CHANNEL);
      annotationMarkdownDocsChannel.addEventListener('message', handleMarkdownDocsMessage);
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('focus', handleMarkdownDocsWindowFocus);
    }
  };

  const createEditorInstance = (): WebEditorV2Api => {
    if (!editor) {
      const searchToolbarMode =
        typeof window !== 'undefined'
          ? readHostToolbarModeFromSearch(window.location.search)
          : undefined;
      const searchMobileMode =
        typeof window !== 'undefined'
          ? readEditorMobileModeFromSearch(window.location.search)
          : undefined;
      const searchInteractionProfile =
        typeof window !== 'undefined'
          ? readAnnotationInteractionProfileFromSearch(window.location.search)
          : undefined;
      const { skillInstallSource, ...restUiOptions } = options.ui ?? {};
      const normalizedSkillInstallSource =
        typeof skillInstallSource === 'string' ? normalizeSkillSource(skillInstallSource) : null;
      const resolvedToolbarMode = runtimeToolbarMode ?? searchToolbarMode ?? restUiOptions.toolbarMode;
      const resolvedInteractionProfile =
        runtimeInteractionProfile ?? searchInteractionProfile ?? options.interactionProfile;
      const resolvedUi = {
        breadcrumbs: true,
        propertyPanel: true,
        showCopyPromptAction: true,
        getAssistantPanelOpen: () => runtimeAssistantPanelOpen,
        ...(resolvedToolbarMode === 'host'
          ? {
              onHostToolbarAction: requestParentHostToolbarAction,
              onRequestFullExit: async () => {
                await requestParentHostToolbarAction({ type: 'full-exit' });
              },
            }
          : {}),
        onEnableAnnotation: async () => {
          if (annotationClient.isEnabled()) return true;
          if (resolvedToolbarMode === 'host') {
            const enabled = await requestParentHostToolbarAction({ type: 'enable-annotation' });
            if (enabled) {
              await annotationClient.refreshSource();
              editor?.refresh?.();
              startDirectoryMarkdownDocsSync();
              scheduleAnnotationToolbarRefresh();
            }
            return enabled;
          }
          if (!await confirmEnableAnnotation()) return false;
          try {
            const enabled = await annotationClient.enable();
            if (enabled && typeof window !== 'undefined') {
              editor?.refresh?.();
              startDirectoryMarkdownDocsSync();
              scheduleAnnotationToolbarRefresh();
            }
            return enabled;
          } catch (error) {
            notifyPreview('error', error instanceof Error ? error.message : '需求标注没有开启成功。');
            await alertEnableAnnotationFailed();
            return false;
          }
        },
        getAnnotationEnabled: annotationClient.isEnabled,
        getAnnotationEnableAvailable: annotationClient.isAvailable,
        getAnnotationEnableLoading: annotationClient.isLoading,
        ...restUiOptions,
        ...(searchToolbarMode ? { toolbarMode: searchToolbarMode } : {}),
        ...(runtimeToolbarMode ? { toolbarMode: runtimeToolbarMode } : {}),
        ...(normalizedSkillInstallSource
          ? { skillInstallSource: normalizedSkillInstallSource }
          : {}),
      };
      const resolvedMobileMode =
        typeof options.mobileMode === 'boolean'
          ? options.mobileMode
          : searchMobileMode;
      const {
        ui: _ignoredUi,
        mobileMode: _ignoredMobileMode,
        agentBridge: _ignoredAgentBridge,
        integrationWs: _ignoredIntegrationWs,
        ...editorOptions
      } = options as WebEditorV2InitOptions & {
        agentBridge?: unknown;
        integrationWs?: unknown;
      };

      editor = createCommentary({
        ...editorOptions,
        ...(resolvedInteractionProfile ? { interactionProfile: resolvedInteractionProfile } : {}),
        ...(typeof resolvedMobileMode === 'boolean' ? { mobileMode: resolvedMobileMode } : {}),
        ui: resolvedUi,
        host: {
          ...(options.host ?? {}),
          showAnnotationMarkdownEditor: resolvedInteractionProfile === 'annotation',
          getResourceContext:
            options.host?.getResourceContext
            ?? (() => {
              if (typeof window === 'undefined') return null;
              return resolveHostResourceContextFromLocation(
                window.location.pathname,
                window.location.href,
                { commentPageScope: runtimeCommentPageScope },
              );
            }),
          buildCopyPrompt:
            options.host?.buildCopyPrompt
            ?? buildHostCopyPrompt,
          persistenceAdapter:
            options.host?.persistenceAdapter
            ?? createPrototypeCommentsPersistenceAdapter({
              getProjectId: () => runtimeAnnotationProjectId,
              getMakeServerOrigin: () => runtimeMakeServerOrigin,
            }),
            conversationTaskTransport:
            options.host?.conversationTaskTransport
            ?? createMakeConversationTaskTransport(
              () => runtimeMakeServerOrigin,
              () => runtimeAnnotationProjectId,
              () => {
                const resource = options.host?.getResourceContext?.()
                  ?? (typeof window !== 'undefined'
                    ? resolveHostResourceContextFromLocation(
                        window.location.pathname,
                        window.location.href,
                        { commentPageScope: runtimeCommentPageScope },
                      )
                    : null);
                return normalizeString(resource?.path);
              },
            ),
          canEditAnnotationMarkdown: (element) => Boolean(
            annotationClient.isEnabled()
            && canEditLocalAnnotationMarkdown(element),
          ),
          getCreateAnnotationBlockReason: () => getLocalAnnotationCreateBlockReason(
            annotationClient.getCurrentPageId(),
          ),
          getAnnotationDocumentEditUrl: (element) => annotationClient.getDocumentEditUrl(element),
          getAnnotationMarkdown: (element) => annotationClient.getMarkdown(element),
          onAnnotationMarkdownChange: (element, markdown) => annotationClient.writeMarkdown(element, markdown),
          onDeleteAnnotationNode: (element) => annotationClient.writeMarkdown(element, ''),
        },
      });
    }
    return editor;
  };

  const ensureEditorReady = async (): Promise<WebEditorV2Api> => {
    if (editor) {
      return editor;
    }

    if (!editorInitPromise) {
      editorInitPromise = Promise.resolve(createEditorInstance()).finally(() => {
        editorInitPromise = null;
      });
    }

    return editorInitPromise;
  };

  const applyEnableOptions = (enableOptions?: WebEditorV2EnableOptions) => {
    const nextToolbarMode = enableOptions?.toolbarMode;
    const nextInteractionProfile = enableOptions?.interactionProfile;
    const nextInitialDarkMode = enableOptions?.initialDarkMode;
    const nextCommentPageScope = normalizeString(enableOptions?.commentPageScope);
    const hasExplicitCommentPageScope = typeof enableOptions?.commentPageScope === 'string';
    const nextMakeServerOrigin = normalizeMakeServerOrigin(
      enableOptions?.makeServerOrigin ?? enableOptions?.annotationApiBaseUrl,
    );
    const nextAnnotationProjectId = normalizeString(enableOptions?.annotationProjectId);
    const nextAgentRunConcurrency = Number(enableOptions?.agentRunConcurrency);
    let shouldRecreateInactiveEditor = false;
    let shouldRefreshActiveEditor = false;
    let shouldRefreshRouteState = false;

    if (
      nextMakeServerOrigin !== runtimeMakeServerOrigin
      || nextAnnotationProjectId !== runtimeAnnotationProjectId
    ) {
      runtimeMakeServerOrigin = nextMakeServerOrigin;
      runtimeAnnotationProjectId = nextAnnotationProjectId;
      annotationClient.configure({
        makeServerOrigin: runtimeMakeServerOrigin,
        projectId: runtimeAnnotationProjectId,
      });
    }

    if (nextToolbarMode && nextToolbarMode !== runtimeToolbarMode) {
      runtimeToolbarMode = nextToolbarMode;
      shouldRecreateInactiveEditor = true;
    }

    if (nextInteractionProfile && nextInteractionProfile !== runtimeInteractionProfile) {
      runtimeInteractionProfile = nextInteractionProfile;
      shouldRecreateInactiveEditor = true;
    }

    if (
      typeof nextInitialDarkMode === 'boolean'
      && options.ui?.initialDarkMode !== nextInitialDarkMode
    ) {
      options.ui = {
        ...(options.ui ?? {}),
        initialDarkMode: nextInitialDarkMode,
      };
      shouldRecreateInactiveEditor = true;
    }

    if (
      Number.isFinite(nextAgentRunConcurrency)
      && options.ui?.agentRunConcurrency !== nextAgentRunConcurrency
    ) {
      options.ui = {
        ...(options.ui ?? {}),
        agentRunConcurrency: nextAgentRunConcurrency,
      };
      shouldRecreateInactiveEditor = true;
    }

    if (
      typeof enableOptions?.mobileMode === 'boolean'
      && options.mobileMode !== enableOptions.mobileMode
    ) {
      options.mobileMode = enableOptions.mobileMode;
      shouldRecreateInactiveEditor = true;
    }

    if (
      typeof enableOptions?.assistantPanelOpen === 'boolean'
      && runtimeAssistantPanelOpen !== enableOptions.assistantPanelOpen
    ) {
      runtimeAssistantPanelOpen = enableOptions.assistantPanelOpen;
      shouldRefreshActiveEditor = true;
    }

    if (runtimeCommentPageScope !== nextCommentPageScope) {
      runtimeCommentPageScope = nextCommentPageScope;
      shouldRefreshActiveEditor = true;
      shouldRefreshRouteState = true;
    } else if (hasExplicitCommentPageScope && editor?.getState().active) {
      shouldRefreshActiveEditor = true;
      shouldRefreshRouteState = true;
    }

    if (editor && shouldRecreateInactiveEditor && !editor.getState().active) {
      editor.destroy?.();
      editor = null;
    }

    if (editor && shouldRefreshActiveEditor) {
      editor.refresh?.();
    }
    if (editor && shouldRefreshRouteState && editor.getState().active && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('axhub-web-editor-route-change'));
    }
  };

  const clearDebugTitleSync = () => {
    if (typeof window !== 'undefined' && debugTitleTimer !== null) {
      window.clearInterval(debugTitleTimer);
      debugTitleTimer = null;
    }
    if (typeof document !== 'undefined' && baseDocumentTitle) {
      document.title = baseDocumentTitle;
    }
  };

  const startDebugTitleSync = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!isDebugTitleEnabled(window.location.search)) return;
    if (debugTitleTimer !== null) return;
    if (!baseDocumentTitle) {
      baseDocumentTitle = document.title;
    }

    const updateTitle = () => {
      const debugState = editor?.getDebugState?.() ?? null;
      document.title = `${buildEditorDebugTitle(debugState)} | ${baseDocumentTitle}`;
    };

    updateTitle();
    debugTitleTimer = window.setInterval(updateTitle, 250);
  };

  const getCounts = () => {
    const status = editor?.getStatus?.();
    if (status) {
      return {
        undoCount: Number(status.undoCount ?? 0),
        redoCount: Number(status.redoCount ?? 0),
      };
    }
    const counts = editor?.getHistoryCounts?.();
    return {
      undoCount: counts?.undoCount ?? 0,
      redoCount: counts?.redoCount ?? 0,
    };
  };

  const scheduleAnnotationToolbarRefresh = () => {
    if (typeof window === 'undefined') return;
    const scheduleTimeout = typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : typeof globalThis.setTimeout === 'function'
        ? globalThis.setTimeout.bind(globalThis)
        : null;
    if (!scheduleTimeout) {
      editor?.refresh?.();
      return;
    }
    [0, 120, 360].forEach((delay) => {
      scheduleTimeout(() => {
        editor?.refresh?.();
      }, delay);
    });
  };

  const readCurrentSourceSaveContext = async () => {
    const currentEditor = await ensureEditorReady();
    const snapshot = currentEditor.getEditedSnapshot();
    const path = resolveTargetPathFromResource(snapshot.resource);
    if (!path) {
      throw new Error('当前页面路径无法识别，请刷新页面后再试。');
    }
    const projectId = normalizeString((snapshot.resource as { projectId?: unknown } | null)?.projectId);
    return { currentEditor, path, projectId };
  };

  const validateSourceDraft = async (draft: QuickEditSaveDraft) => {
    if (draft.resource.engine !== 'source') {
      throw new Error('当前保存草稿不属于 React 原型或主题。');
    }
    const context = await readCurrentSourceSaveContext();
    if (context.path !== draft.resource.path || context.projectId !== normalizeString(draft.resource.projectId)) {
      throw new Error('当前预览资源已发生变化，请刷新后重新保存。');
    }
    return context;
  };

  const prepareQuickEditSave = async (action: QuickEditSaveAction): Promise<QuickEditSaveDraft | null> => {
    const { currentEditor, path, projectId } = await readCurrentSourceSaveContext();
    const resource = { engine: 'source' as const, projectId, path };
    if (action === 'save-text') {
      const replacements = currentEditor.getTextChanges()
        .filter((change) => change.before.trim() && change.after.trim() && change.before !== change.after)
        .map(({ before, after }) => ({ before, after }));
      return replacements.length > 0
        ? { kind: 'source-text', action, resource, replacements }
        : null;
    }
    if (action === 'save-style') {
      const cssText = currentEditor.getStyleChanges().cssText.trim();
      return cssText ? { kind: 'style', action, resource, cssText } : null;
    }
    return { kind: 'clear-style', action, resource };
  };

  const preflightQuickEditSave = async (draft: QuickEditSaveDraft): Promise<QuickEditSavePreflight> => {
    await validateSourceDraft(draft);
    if (draft.kind === 'source-text') {
      const merged = mergeQuickEditSaveDrafts([draft]);
      if (!merged.ok || merged.draft.kind !== 'source-text') {
        throw new Error(merged.ok ? '文本保存草稿无效。' : merged.message);
      }
      const countResult = await postJson<{ totalCount?: number; error?: string }>('/api/text-replace/count', {
        path: draft.resource.path,
        replacements: merged.draft.replacements.map(({ before }) => ({ searchText: before })),
      });
      const totalCount = Number(countResult.data.totalCount ?? 0);
      if (!countResult.ok || !Number.isFinite(totalCount) || totalCount <= 0) {
        throw new Error(readResponseErrorMessage(
          countResult.data,
          '无法统计文本替换数量，未保存任何修改。',
        ));
      }
      return {
        action: 'save-text',
        changeCount: merged.draft.replacements.length,
        affectedCount: totalCount,
      };
    }
    if (draft.kind === 'style') {
      if (!draft.cssText.trim()) throw new Error('当前没有可保存的强制样式调整。');
      return { action: 'save-style', changeCount: 1, affectedCount: 1 };
    }
    if (draft.kind === 'clear-style') {
      return { action: 'clear-style', changeCount: 1, affectedCount: 1 };
    }
    throw new Error('当前保存草稿不属于 React 原型或主题。');
  };

  const commitQuickEditSave = async (draft: QuickEditSaveDraft): Promise<QuickEditSaveCommitResult> => {
    const { currentEditor } = await validateSourceDraft(draft);
    if (draft.kind === 'source-text') {
      const merged = mergeQuickEditSaveDrafts([draft]);
      if (!merged.ok || merged.draft.kind !== 'source-text') {
        throw new Error(merged.ok ? '文本保存草稿无效。' : merged.message);
      }
      const result = await postJson<{
        success?: boolean;
        changedFiles?: number;
        totalCount?: number;
        error?: string;
      }>('/api/text-replace/replace', {
        path: draft.resource.path,
        replacements: merged.draft.replacements.map(({ before, after }) => ({
          searchText: before,
          replaceText: after,
        })),
      });
      const changedFiles = Number(result.data?.changedFiles ?? 0);
      const replacedCount = Number(result.data?.totalCount ?? 0);
      if (!result.ok || result.data?.success !== true) {
        throw new Error(readResponseErrorMessage(result.data, '保存文本失败'));
      }
      if (
        !Number.isFinite(changedFiles)
        || changedFiles <= 0
        || !Number.isFinite(replacedCount)
        || replacedCount <= 0
      ) {
        throw new Error(readResponseErrorMessage(result.data, '原文本已发生变化，未保存任何修改。'));
      }
      currentEditor.acknowledgeSavedTextChanges?.();
      const message = `文本已保存，共替换 ${replacedCount} 处，更新 ${changedFiles} 个文件。`;
      notifyPreview('success', message);
      return { changed: true, changedCount: replacedCount, changedFiles, message };
    }
    if (draft.kind === 'style') {
      const result = await postJson<{ success?: boolean; error?: string }>('/api/hack-css/save', {
        path: draft.resource.path,
        content: withTemporaryStyleHackComment(draft.cssText),
      });
      if (!result.ok || result.data?.success !== true) {
        throw new Error(readResponseErrorMessage(result.data, '保存强制样式失败'));
      }
      currentEditor.acknowledgeSavedStyleChanges?.();
      const message = '强制样式已保存。';
      notifyPreview('success', message);
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
      return { changed: true, changedCount: 1, message };
    }
    if (draft.kind === 'clear-style') {
      const result = await postJson<{ success?: boolean; error?: string }>('/api/hack-css/clear', {
        path: draft.resource.path,
      });
      if (!result.ok || result.data?.success !== true) {
        throw new Error(readResponseErrorMessage(result.data, '清空强制样式失败'));
      }
      currentEditor.acknowledgeSavedStyleChanges?.();
      const message = '已清空自定义样式。';
      notifyPreview('success', message);
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
      return { changed: true, changedCount: 1, message };
    }
    throw new Error('当前保存草稿不属于 React 原型或主题。');
  };

  const runStandaloneQuickEditSave = async (action: QuickEditSaveAction): Promise<void> => {
    let draft: QuickEditSaveDraft | null;
    try {
      draft = await prepareQuickEditSave(action);
      if (!draft) {
        notifyPreview(
          'info',
          action === 'save-text' ? '当前没有可保存的文本修改。' : '当前没有可保存的强制样式调整。',
        );
        return;
      }
      const preflight = await preflightQuickEditSave(draft);
      if (!await confirmAction(buildQuickEditSaveConfirmation(preflight).description)) return;
      await commitQuickEditSave(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('被修改成不同内容')) {
        notifyPreview('warning', message);
        return;
      }
      if (message.includes('页面路径无法识别')) {
        notifyPreview('error', message);
        return;
      }
      throw error;
    }
  };

  return {
    enable: async (enableOptions) => {
      if (typeof window === 'undefined') return;
      applyEnableOptions(enableOptions);
      await refreshAnnotationStatus();
      (await ensureEditorReady()).start();
      startDirectoryMarkdownDocsSync();
      scheduleAnnotationToolbarRefresh();
      startDebugTitleSync();
    },
    disable: () => {
      stopDirectoryMarkdownDocsSync();
      editor?.stop();
      clearDebugTitleSync();
    },
    isEnabled: () => editor?.getState().active ?? false,
    getStatus: () => {
      const active = editor?.getState().active ?? false;
      return { active, ...getCounts() };
    },
    getDebugState: () => editor?.getDebugState?.() ?? null,
    getHostToolbarState: () => {
      const toolbarMode =
        runtimeToolbarMode
        ?? (typeof window !== 'undefined'
          ? readHostToolbarModeFromSearch(window.location.search)
          : undefined)
        ?? options.ui?.toolbarMode
        ?? 'inline';
      return editor?.getHostToolbarState?.() ?? buildFallbackHostToolbarState(toolbarMode);
    },
    subscribeHostToolbarState: (listener) => {
      const toolbarMode =
        runtimeToolbarMode
        ?? (typeof window !== 'undefined'
          ? readHostToolbarModeFromSearch(window.location.search)
          : undefined)
        ?? options.ui?.toolbarMode
        ?? 'inline';
      if (editor?.subscribeHostToolbarState) {
        return editor.subscribeHostToolbarState(listener);
      }
      listener(buildFallbackHostToolbarState(toolbarMode));
      return () => undefined;
    },
    runHostToolbarAction: async (action) => {
      const currentEditor = await ensureEditorReady();
      if (action.type === 'clear-edits' && action.skipConfirm === true) {
        await currentEditor.clearAllEdits({
          skipConfirm: true,
          scope: action.scope,
          target: action.target,
        });
        return true;
      }
      return currentEditor.runHostToolbarAction?.(action) ?? false;
    },
    getEditedSnapshot: () => editor?.getEditedSnapshot?.() ?? null,
    getVoiceTarget: () => editor?.getVoiceTarget?.() ?? null,
    getVoiceTargets: () => editor?.getVoiceTargets?.() ?? {
      selected: null,
      hovered: null,
      preferred: null,
    },
    subscribeVoiceTargets: (listener) => {
      if (editor?.subscribeVoiceTargets) {
        return editor.subscribeVoiceTargets(listener);
      }
      listener({ selected: null, hovered: null, preferred: null });
      return () => undefined;
    },
    findVoiceElements: (query) => editor?.findVoiceElements?.(query) ?? {
      elements: [],
      nextCursor: null,
    },
    getVoiceElementStructure: (query) => editor?.getVoiceElementStructure?.(query) ?? {
      elements: [],
      nextCursor: null,
    },
    activateVoiceElement: async (targetRef) => {
      const currentEditor = await ensureEditorReady();
      if (!currentEditor.activateVoiceElement) {
        return { activated: false, targetRef, error: '页面元素激活能力不可用' };
      }
      return currentEditor.activateVoiceElement(targetRef);
    },
    createVoiceComment: async (targetRef, content, commentOptions) => {
      const currentEditor = await ensureEditorReady();
      if (!currentEditor.createVoiceComment) {
        return { applied: false, targetRef, error: '页面批注能力不可用' };
      }
      return currentEditor.createVoiceComment(targetRef, content, commentOptions);
    },
    validateExternalEditingTarget: async (elementKey, targetRef) => {
      const currentEditor = await ensureEditorReady();
      return currentEditor.validateExternalEditingTarget?.(elementKey, targetRef ?? null) === true;
    },
    refreshPersistedComments: async (deletedCommentIds = []) => {
      await editor?.refreshPersistedComments?.(deletedCommentIds);
    },
    setNodeEditingState: async (elementKey, nextState, taskRef, targetRef) => {
      const currentEditor = await ensureEditorReady();
      if (!currentEditor.setNodeEditingState) {
        throw new Error('NOT_IMPLEMENTED: External editing state control is unavailable');
      }
      return currentEditor.setNodeEditingState(elementKey, nextState, taskRef, targetRef ?? null);
    },
    saveTextChanges: () => runStandaloneQuickEditSave('save-text'),
    saveStyleChanges: () => runStandaloneQuickEditSave('save-style'),
    clearForcedStyles: () => runStandaloneQuickEditSave('clear-style'),
    prepareQuickEditSave,
    preflightQuickEditSave,
    commitQuickEditSave,
    enablePanelOnly: async (enableOptions) => {
      if (typeof window === 'undefined') return;
      applyEnableOptions(enableOptions);
      (await ensureEditorReady()).startPanelOnly?.();
    },
    disablePanelOnly: () => {
      editor?.stopPanelOnly?.();
    },
    isPanelOnlyMode: () => editor?.getState().panelOnlyMode ?? false,
    getCopyPromptText: () => editor?.getCopyPromptText?.() ?? '',
    getElementPromptText: (elementKey) => editor?.getElementPromptText?.(elementKey) ?? '',
    getDecisionDataCount: () => countPageDecisionData(),
  };
};
