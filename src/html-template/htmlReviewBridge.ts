import type {
  CommentaryDiagramTarget,
  CommentaryElementTool,
  CommentaryReviewCommentProtocol,
} from '@axhub/commentary';

interface HtmlReviewDiagramDescriptor {
  key: string;
  kind: 'mermaid' | 'drawio';
  documentIndex: number;
  source: string;
  sourceHash: string;
  sourcePath: string;
  previewPath: string;
}

interface HtmlReviewDraftSession {
  sessionId: string;
  diagramKey: string;
  kind: 'mermaid' | 'drawio';
  sourceHash: string;
  sourcePath: string;
  previewPath: string;
  summary: string[];
  stale: boolean;
  artifactMtimeMs?: number;
  updatedAt: string;
}

type PopupWindow = Pick<Window, 'close' | 'focus'> & { location: { href: string } };

export interface HtmlReviewBridgeDeps {
  documentPath: string;
  projectId?: string;
  fetchImpl?: typeof fetch;
  openWindow?: (url?: string | URL, target?: string, features?: string) => Window | null;
  resolveDiagramTarget?: (element: Element | null | undefined) => CommentaryDiagramTarget | null;
  convertMermaid?: (source: string) => Promise<Record<string, unknown>>;
  openDrawioEditor?: (options: {
    resource: {
      name: string;
      projectId?: string;
      filePath?: string;
    };
    kind: 'doc';
    popupWindow: Window;
    messageApi?: { error?: (content: string) => void };
    onSaved?: () => void | Promise<void>;
  }) => Promise<boolean>;
  reviewProtocol?: CommentaryReviewCommentProtocol;
  storage?: Storage | null;
  documentRef?: Document | null;
  setIntervalImpl?: (handler: () => void, timeout: number) => number;
  clearIntervalImpl?: (id: number) => void;
}

export interface HtmlReviewBridge {
  getElementTools(element: Element | null): CommentaryElementTool[];
  onElementToolAction(tool: CommentaryElementTool, element: Element): Promise<void>;
  refreshDrafts(): Promise<void>;
  dispose(): void;
}

const DRAFT_STORAGE_PREFIX = 'axhub-html-review-drafts:';
const HTML_REVIEW_CONTROL_SELECTOR = [
  'input:not([type="file"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'select',
  'textarea',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[data-axhub-review-interactive]',
].join(', ');

interface HtmlReviewEventElement {
  matches(selector: string): boolean;
  getAttribute?(name: string): string | null;
  closest?(selector: string): Element | null;
  querySelector?(selector: string): Element | null;
  control?: Element | null;
}

function isHtmlReviewEventElement(value: unknown): value is HtmlReviewEventElement {
  return Boolean(value && typeof (value as HtmlReviewEventElement).matches === 'function');
}

function isNonSubmittingButton(element: HtmlReviewEventElement): boolean {
  if (!element.matches('button')) return false;
  const explicitType = element.getAttribute?.('type')?.trim().toLowerCase();
  if (explicitType === 'submit' || explicitType === 'reset') return false;
  if (explicitType === 'button') return true;
  return !element.closest?.('form');
}

function isHtmlReviewControl(element: HtmlReviewEventElement): boolean {
  return element.matches(HTML_REVIEW_CONTROL_SELECTOR) || isNonSubmittingButton(element);
}

function isLabelForHtmlReviewControl(element: HtmlReviewEventElement): boolean {
  if (!element.matches('label')) return false;
  const control = element.control;
  if (isHtmlReviewEventElement(control) && isHtmlReviewControl(control)) return true;
  return Boolean(element.querySelector?.(HTML_REVIEW_CONTROL_SELECTOR));
}

/**
 * Keep review answers usable while Commentary owns ordinary page interactions.
 * Native form controls need no extra protocol; custom widgets opt in with
 * data-axhub-review-interactive on the widget or one of its event-path ancestors.
 */
export function shouldAllowHtmlReviewPageEvent(event: Event): boolean {
  let path: EventTarget[] = [];
  try {
    path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  } catch {
    path = [];
  }
  if (event.target && !path.includes(event.target)) {
    path.push(event.target);
  }

  return path.some((candidate) => (
    isHtmlReviewEventElement(candidate)
    && (isHtmlReviewControl(candidate) || isLabelForHtmlReviewControl(candidate))
  ));
}

export function normalizeHtmlReviewDocumentPath(value: unknown): string {
  let raw = String(value || '').trim();
  if (!raw || raw.includes('\0')) return '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep the original string when it is not URI encoded.
  }
  raw = raw.replace(/\\/gu, '/').split(/[?#]/u, 1)[0].replace(/\/{2,}/gu, '/');
  const resourcesMarker = '/src/resources/';
  const markerIndex = raw.toLowerCase().lastIndexOf(resourcesMarker);
  if (markerIndex >= 0) {
    raw = raw.slice(markerIndex + 1);
  } else {
    raw = raw.replace(/^\.\//u, '');
  }
  if (/^(?:src\/(?:resources|prototypes|themes)\/|docs\/|templates\/)/u.test(raw)) {
    // Already project-relative.
  } else if (!raw.startsWith('/') && !/^[a-z]:\//iu.test(raw)) {
    raw = `src/resources/${raw}`;
  } else {
    return '';
  }
  const segments = raw.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
    || !/\.html?$/iu.test(raw)
  ) {
    return '';
  }
  return raw;
}

async function defaultConvertMermaid(source: string): Promise<Record<string, unknown>> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import('@excalidraw/mermaid-to-excalidraw'),
    import('@axhub/excalidraw'),
  ]);
  const result = await parseMermaidToExcalidraw(source);
  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://axhub.im',
    elements: convertToExcalidrawElements(result.elements as any, { regenerateIds: true }),
    appState: {},
    files: result.files ?? {},
  };
}

function readStoredSessionIds(storage: Storage | null, documentPath: string): string[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(`${DRAFT_STORAGE_PREFIX}${documentPath}`) || '[]');
    return Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter((item) => /^[a-z0-9-]+$/u.test(item))
      : [];
  } catch {
    return [];
  }
}

function resourceIdFromProjectPath(value: string): string {
  return String(value || '').replace(/\\/gu, '/').replace(/^src\/resources\//u, '');
}

function refreshLinkedDrawioOwner(
  owner: Element | null,
  session: HtmlReviewDraftSession,
  projectId: string,
): boolean {
  if (!owner || session.kind !== 'drawio') return false;
  const tagName = String(owner.tagName || '').toUpperCase();
  const attribute = tagName === 'IMG' ? 'src' : tagName === 'OBJECT' ? 'data' : tagName === 'A' ? 'href' : '';
  if (!attribute) return false;
  const resourceId = resourceIdFromProjectPath(session.sourcePath);
  if (!resourceId) return false;

  const searchParams = new URLSearchParams();
  if (projectId) searchParams.set('projectId', projectId);
  searchParams.set(
    'axhubReviewVersion',
    String(session.artifactMtimeMs || Date.parse(session.updatedAt) || session.updatedAt),
  );
  owner.setAttribute(attribute, `/api/docs/${encodeURIComponent(resourceId)}?${searchParams.toString()}`);
  return true;
}

function storeSessionIds(storage: Storage | null, documentPath: string, sessionIds: Set<string>): void {
  if (!storage) return;
  try {
    storage.setItem(`${DRAFT_STORAGE_PREFIX}${documentPath}`, JSON.stringify([...sessionIds]));
  } catch {
    // Session recovery remains available for the current page lifetime.
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return payload;
}

function normalizeReviewReferencePath(value: unknown): string {
  const normalized = String(value ?? '').trim().replace(/\\/gu, '/');
  if (
    !normalized
    || normalized.startsWith('/')
    || /^[a-z]:\//iu.test(normalized)
    || /^[a-z][a-z0-9+.-]*:/iu.test(normalized)
    || normalized.split('/').some((segment) => segment === '..')
  ) {
    return '';
  }
  return normalized;
}

function buildDiagramReviewComment(session: HtmlReviewDraftSession): string {
  const summary = (Array.isArray(session.summary) ? session.summary : [])
    .map((line) => String(line ?? '').replace(/\s+/gu, ' ').trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 12);
  const sourcePath = normalizeReviewReferencePath(session.sourcePath);
  const previewPath = normalizeReviewReferencePath(session.previewPath);
  const sourceHash = String(session.sourceHash ?? '').trim().slice(0, 160);
  const lines = [
    `图表修改：${String(session.diagramKey ?? '').trim().slice(0, 240)}`,
    `状态：${session.stale ? '已更新（原 HTML 图表源已变化）' : '已更新'}`,
    ...(summary.length > 0 ? [`修改概览：${summary.join('；')}`] : []),
    ...(sourcePath ? [`源文件：${sourcePath}`] : []),
    ...(previewPath ? [`预览文件：${previewPath}`] : []),
    ...(sourceHash ? [`源版本：${sourceHash}`] : []),
  ];
  return lines.join('\n').slice(0, 4_000);
}

export function createHtmlReviewBridge(deps: HtmlReviewBridgeDeps): HtmlReviewBridge {
  const documentPath = normalizeHtmlReviewDocumentPath(deps.documentPath);
  const projectId = String(deps.projectId || '').trim();
  const fetchImpl = deps.fetchImpl ?? fetch.bind(globalThis);
  const openWindow = deps.openWindow ?? window.open.bind(window);
  const resolveDiagramTarget = deps.resolveDiagramTarget ?? (() => null);
  const convertMermaid = deps.convertMermaid ?? defaultConvertMermaid;
  const openDrawioEditor = deps.openDrawioEditor ?? (async (options) => {
    const { openDrawioResourceEditor } = await import('../index/domains/drawio/drawioResourceEditor');
    return openDrawioResourceEditor(options);
  });
  const storage = deps.storage === undefined
    ? (typeof window !== 'undefined' ? window.localStorage : null)
    : deps.storage;
  const documentRef = deps.documentRef === undefined
    ? (typeof document !== 'undefined' ? document : null)
    : deps.documentRef;
  const getReviewProtocol = () => deps.reviewProtocol
    ?? (typeof window !== 'undefined' ? window.axhubReview : undefined);
  const sessionIds = new Set(readStoredSessionIds(storage, documentPath));
  const sessionOwners = new Map<string, Element>();
  const appliedDrawioPreviewByDiagramKey = new Map<string, string>();
  const sessionIdByDiagramKey = new Map<string, string>();
  const appliedDraftFingerprintByDiagramKey = new Map<string, string>();
  let descriptorsPromise: Promise<HtmlReviewDiagramDescriptor[]> | null = null;
  let disposed = false;
  let refreshGeneration = 0;

  const withProject = (pathname: string) => {
    const url = new URL(pathname, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (projectId) url.searchParams.set('projectId', projectId);
    return `${url.pathname}${url.search}`;
  };

  const loadDescriptors = () => {
    if (!descriptorsPromise) {
      const url = new URL('/api/html-review/diagrams', 'http://localhost');
      url.searchParams.set('path', documentPath);
      if (projectId) url.searchParams.set('projectId', projectId);
      descriptorsPromise = fetchImpl(`${url.pathname}${url.search}`, { cache: 'no-store' })
        .then((response) => readJsonResponse<{ diagrams: HtmlReviewDiagramDescriptor[] }>(response))
        .then((payload) => payload.diagrams ?? [])
        .catch((error) => {
          descriptorsPromise = null;
          throw error;
        });
    }
    return descriptorsPromise;
  };

  const resolveDescriptor = async (target: CommentaryDiagramTarget) => {
    const descriptors = await loadDescriptors();
    return descriptors.find((descriptor) => (
      descriptor.kind === target.kind && descriptor.documentIndex === target.documentIndex
    )) ?? null;
  };

  const findOwner = async (session: HtmlReviewDraftSession): Promise<Element | null> => {
    const known = sessionOwners.get(session.diagramKey);
    if (known && known.isConnected !== false) return known;
    if (!documentRef) return null;
    let descriptor: HtmlReviewDiagramDescriptor | null = null;
    try {
      descriptor = (await loadDescriptors()).find((candidate) => (
        candidate.key === session.diagramKey && candidate.kind === session.kind
      )) ?? null;
    } catch {
      return null;
    }
    if (!descriptor) return null;
    for (const candidate of Array.from(documentRef.querySelectorAll('.mermaid, svg, img, object, a'))) {
      const target = resolveDiagramTarget(candidate);
      if (!target || target.kind !== session.kind) continue;
      if (target.documentIndex === descriptor.documentIndex) return target.owner;
    }
    return null;
  };

  const recordSession = (session: HtmlReviewDraftSession, owner: Element) => {
    const previousSessionId = sessionIdByDiagramKey.get(session.diagramKey);
    if (previousSessionId && previousSessionId !== session.sessionId) {
      sessionIds.delete(previousSessionId);
    }
    sessionIds.add(session.sessionId);
    sessionIdByDiagramKey.set(session.diagramKey, session.sessionId);
    sessionOwners.set(session.diagramKey, owner);
    storeSessionIds(storage, documentPath, sessionIds);
  };

  const buildEditorUrl = (session: HtmlReviewDraftSession): string => {
    const url = new URL('/', typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (projectId) url.searchParams.set('projectId', projectId);
    url.searchParams.set('docPath', session.sourcePath);
    url.searchParams.set('reviewSession', session.sessionId);
    if (session.kind === 'mermaid') {
      url.searchParams.set('view', 'canvas');
    } else {
      url.searchParams.set('openDrawio', '1');
    }
    return url.toString();
  };

  const getElementTools = (element: Element | null): CommentaryElementTool[] => {
    const target = resolveDiagramTarget(element);
    if (!target?.editable) return [];
    return [{
      id: 'open-diagram',
      label: target.kind === 'mermaid' ? '在画布中打开' : '在 Draw.io 中打开',
      icon: 'diagram',
    }];
  };

  const onElementToolAction = async (tool: CommentaryElementTool, element: Element) => {
    if (tool.id !== 'open-diagram') return;
    const target = resolveDiagramTarget(element);
    if (!target?.editable) throw new Error('当前元素不是可编辑图表');

    const popup = openWindow('about:blank', '_blank') as PopupWindow | null;
    if (!popup) throw new Error('浏览器阻止了新窗口，请允许弹窗后重试');

    try {
      const descriptor = await resolveDescriptor(target);
      if (!descriptor) throw new Error('无法在 HTML 源文件中定位这个图表');
      const body: Record<string, unknown> = {
        path: documentPath,
        diagramKey: descriptor.key,
      };
      if (descriptor.kind === 'mermaid') {
        body.excalidraw = await convertMermaid(descriptor.source);
      }
      const response = await fetchImpl(withProject('/api/html-review/diagram-drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const session = await readJsonResponse<HtmlReviewDraftSession>(response);
      recordSession(session, target.owner);
      if (session.kind === 'drawio') {
        let editorError = '';
        const opened = await openDrawioEditor({
          resource: {
            name: resourceIdFromProjectPath(session.sourcePath),
            projectId,
            filePath: session.sourcePath,
          },
          kind: 'doc',
          popupWindow: popup as Window,
          messageApi: {
            error(content) {
              editorError = String(content || '').trim();
            },
          },
          onSaved: refreshDrafts,
        });
        if (!opened) throw new Error(editorError || '无法打开 Draw.io 编辑器');
        popup.focus?.();
        return;
      }
      popup.location.href = buildEditorUrl(session);
      popup.focus?.();
    } catch (error) {
      popup.close?.();
      throw error;
    }
  };

  const refreshDrafts = async () => {
    if (disposed || sessionIds.size === 0) return;
    const generation = ++refreshGeneration;
    const results = await Promise.all([...sessionIds].map(async (sessionId) => {
      try {
        const response = await fetchImpl(withProject(`/api/html-review/diagram-drafts/${sessionId}`), {
          cache: 'no-store',
        });
        if (disposed || generation !== refreshGeneration) return null;
        if (response.status === 404) {
          return { sessionId, missing: true as const, session: null };
        }
        const session = await readJsonResponse<HtmlReviewDraftSession>(response);
        if (disposed || generation !== refreshGeneration) return null;
        return { sessionId, missing: false as const, session };
      } catch {
        // A temporary server or network error is retried by the next poll.
        return null;
      }
    }));
    if (disposed || generation !== refreshGeneration) return;

    let sessionSetChanged = false;
    const latestByDiagramKey = new Map<string, HtmlReviewDraftSession>();
    for (const result of results) {
      if (!result) continue;
      if (result.missing) {
        sessionSetChanged = sessionIds.delete(result.sessionId) || sessionSetChanged;
        continue;
      }
      const session = result.session;
      const previous = latestByDiagramKey.get(session.diagramKey);
      if (
        !previous
        || String(session.updatedAt).localeCompare(String(previous.updatedAt)) > 0
        || (
          session.updatedAt === previous.updatedAt
          && session.sessionId.localeCompare(previous.sessionId) > 0
        )
      ) {
        latestByDiagramKey.set(session.diagramKey, session);
      }
    }

    for (const result of results) {
      const session = result?.session;
      if (!session) continue;
      const latest = latestByDiagramKey.get(session.diagramKey);
      if (latest?.sessionId !== session.sessionId) {
        sessionSetChanged = sessionIds.delete(session.sessionId) || sessionSetChanged;
      }
    }
    for (const session of latestByDiagramKey.values()) {
      sessionIdByDiagramKey.set(session.diagramKey, session.sessionId);
    }
    if (sessionSetChanged) {
      storeSessionIds(storage, documentPath, sessionIds);
    }

    for (const session of latestByDiagramKey.values()) {
      if (disposed || generation !== refreshGeneration) return;
      if (!Array.isArray(session.summary) || session.summary.length === 0) continue;
      const owner = await findOwner(session);
      if (disposed || generation !== refreshGeneration) return;
      if (session.kind === 'drawio') {
        const previewFingerprint = `${session.sourcePath}\u0000${session.artifactMtimeMs ?? ''}\u0000${session.updatedAt}`;
        if (appliedDrawioPreviewByDiagramKey.get(session.diagramKey) !== previewFingerprint) {
          if (refreshLinkedDrawioOwner(owner, session, projectId)) {
            appliedDrawioPreviewByDiagramKey.set(session.diagramKey, previewFingerprint);
          }
        }
      }
      const comment = buildDiagramReviewComment(session);
      const fingerprint = `${session.sessionId}\u0000${session.updatedAt}\u0000${comment}`;
      if (appliedDraftFingerprintByDiagramKey.get(session.diagramKey) === fingerprint) continue;
      const protocol = getReviewProtocol();
      if (!protocol) continue;
      const applied = protocol.setComment({ element: owner, comment });
      if (applied !== false) {
        appliedDraftFingerprintByDiagramKey.set(session.diagramKey, fingerprint);
      }
    }
  };

  const setIntervalImpl = deps.setIntervalImpl
    ?? ((handler, timeout) => window.setInterval(handler, timeout));
  const clearIntervalImpl = deps.clearIntervalImpl
    ?? ((id) => window.clearInterval(id));
  const intervalId = setIntervalImpl(() => {
    void refreshDrafts();
  }, 1_500);
  void refreshDrafts();

  return {
    getElementTools,
    onElementToolAction,
    refreshDrafts,
    dispose() {
      disposed = true;
      refreshGeneration += 1;
      clearIntervalImpl(intervalId);
    },
  };
}
