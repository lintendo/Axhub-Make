interface HtmlResourceSaveLocator {
  selectors?: string[];
  fingerprint?: string;
}

interface HtmlResourceTargetedTextChange {
  elementKey: string;
  locator: HtmlResourceSaveLocator;
  before: string;
  after: string;
}

export interface HtmlResourceSaveEditor {
  getTargetedTextChanges(): HtmlResourceTargetedTextChange[];
  getStyleChanges(): { cssText: string };
  acknowledgeSavedTextChanges(): void;
  acknowledgeSavedStyleChanges(): void;
}

export interface HtmlResourceSaveContext {
  path: string;
  projectId: string;
}

export interface HtmlResourceSaveBridgeOptions {
  getEditor: () => HtmlResourceSaveEditor | null;
  getContext: () => HtmlResourceSaveContext;
  documentRef?: Document | null;
  fetchImpl?: typeof fetch;
  confirm?: (message: string) => boolean | Promise<boolean>;
  notify?: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  reload?: () => void;
}

export interface HtmlResourceSaveBridge {
  saveTextChanges(): Promise<void>;
  saveStyleChanges(): Promise<void>;
  clearForcedStyles(): Promise<void>;
}

type SaveResponse = {
  success?: boolean;
  changed?: boolean;
  changedCount?: number;
  revision?: string;
  error?: string;
  code?: string;
};

type ParentDialogResponse = {
  type?: string;
  requestId?: string;
  confirmed?: boolean;
};

let parentDialogSequence = 0;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getSaveErrorMessage(payload: SaveResponse): string {
  switch (payload.code) {
    case 'HTML_DOCUMENT_CHANGED':
      return '源文件已更新，请刷新后重新修改。';
    case 'HTML_TEXT_CHANGED':
      return '部分原文已经变化，未保存任何修改。请刷新后重试。';
    case 'HTML_TEXT_TARGET_MISSING':
      return '部分文本已无法定位，未保存任何修改。请刷新后重新编辑。';
    case 'HTML_EDIT_PAYLOAD_TOO_LARGE':
    case 'HTML_DOCUMENT_TOO_LARGE':
      return '本次修改内容过多，请减少修改后重试。';
    case 'INVALID_HTML_RESOURCE_PATH':
      return '当前 HTML 资源路径不可保存，请刷新后重试。';
    default:
      return normalizeString(payload.error) || 'HTML 资源保存失败，请稍后重试。';
  }
}

function canUseParentBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.parent && window.parent !== window);
}

function nextParentDialogRequestId(): string {
  parentDialogSequence += 1;
  return `html-resource-save-dialog-${parentDialogSequence}`;
}

async function requestParentConfirm(message: string): Promise<boolean | null> {
  if (!canUseParentBridge()) return null;
  const requestId = nextParentDialogRequestId();
  return await new Promise((resolve) => {
    let settled = false;
    let parentAcknowledged = false;
    const finish = (value: boolean | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as ParentDialogResponse | undefined;
      if (!payload || payload.requestId !== requestId) return;
      if (payload.type === 'WEB_EDITOR_DIALOG_ACK') {
        parentAcknowledged = true;
        window.clearTimeout(timeoutId);
        return;
      }
      if (payload.type !== 'WEB_EDITOR_DIALOG_RESPONSE') return;
      finish(payload.confirmed ?? true);
    };
    const timeoutId = window.setTimeout(() => {
      if (parentAcknowledged) return;
      finish(false);
    }, 60_000);
    window.addEventListener('message', handleMessage);
    window.parent.postMessage({
      type: 'WEB_EDITOR_DIALOG_REQUEST',
      requestId,
      kind: 'confirm',
      title: '确认操作',
      description: message,
      confirmText: '确定',
      cancelText: '取消',
      tone: 'brand',
      dismissible: false,
    }, '*');
  });
}

async function defaultConfirm(message: string): Promise<boolean> {
  const parentResult = await requestParentConfirm(message);
  if (parentResult !== null) return parentResult;
  return typeof window === 'undefined' || typeof window.confirm !== 'function'
    ? true
    : window.confirm(message);
}

function defaultNotify(
  level: 'info' | 'success' | 'warning' | 'error',
  message: string,
): void {
  if (canUseParentBridge()) {
    window.parent.postMessage({
      type: 'WEB_EDITOR_DIALOG_REQUEST',
      requestId: nextParentDialogRequestId(),
      kind: 'alert',
      title: level === 'error' ? '保存失败' : '提示',
      description: message,
      confirmText: '知道了',
      tone: level === 'error' ? 'destructive' : 'default',
      dismissible: true,
      level,
    }, '*');
    return;
  }
  const logger = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
  logger(`[Axhub] ${message}`);
}

function defaultReload(): void {
  if (typeof window !== 'undefined') window.location.reload();
}

function matchesLocatorFingerprint(element: Element, fingerprintValue: unknown): boolean {
  const fingerprint = normalizeString(fingerprintValue);
  if (!fingerprint) return true;
  const parts = fingerprint.split('|');
  const storedTag = normalizeString(parts[0]).toLowerCase();
  if (storedTag && normalizeString(element.tagName).toLowerCase() !== storedTag) return false;
  const storedId = parts.find((part) => part.startsWith('id='))?.slice('id='.length) ?? '';
  return !storedId || normalizeString(element.id) === storedId;
}

export function createHtmlResourceSaveBridge(
  options: HtmlResourceSaveBridgeOptions,
): HtmlResourceSaveBridge {
  const documentRef = options.documentRef ?? (typeof document !== 'undefined' ? document : null);
  const fetchImpl = options.fetchImpl ?? fetch;
  const confirm = options.confirm ?? defaultConfirm;
  const notify = options.notify ?? defaultNotify;
  const reload = options.reload ?? defaultReload;
  let latestRevision = '';

  function getEditor(): HtmlResourceSaveEditor {
    const editor = options.getEditor();
    if (!editor) throw new Error('HTML 编辑器尚未准备好，请刷新后重试。');
    return editor;
  }

  function getContext(): HtmlResourceSaveContext {
    const context = options.getContext();
    const path = normalizeString(context.path);
    if (!path) throw new Error('当前 HTML 资源路径无法识别，请刷新后重试。');
    return { path, projectId: normalizeString(context.projectId) };
  }

  function readRevision(): string {
    if (latestRevision) return latestRevision;
    const revision = documentRef
      ?.querySelector('meta[name="axhub-html-revision"]')
      ?.getAttribute('content')
      ?.trim() ?? '';
    if (!revision) throw new Error('当前 HTML 版本无法识别，请刷新后重试。');
    return revision;
  }

  function buildUrl(pathname: string, projectId: string): string {
    return projectId ? `${pathname}?projectId=${encodeURIComponent(projectId)}` : pathname;
  }

  async function request(
    pathname: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: Record<string, unknown>,
  ): Promise<SaveResponse> {
    const context = getContext();
    const response = await fetchImpl(buildUrl(pathname, context.projectId), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as SaveResponse;
    if (!response.ok || payload.success !== true) {
      throw new Error(getSaveErrorMessage(payload));
    }
    latestRevision = normalizeString(payload.revision) || latestRevision;
    return payload;
  }

  function locateTextKey(change: HtmlResourceTargetedTextChange): string {
    for (const selector of change.locator.selectors ?? []) {
      try {
        const matches = documentRef?.querySelectorAll(selector);
        if (!matches || matches.length !== 1) continue;
        const element = matches[0];
        if (!matchesLocatorFingerprint(element, change.locator.fingerprint)) continue;
        const key = element.getAttribute('data-axhub-text-key')?.trim();
        if (key) return key;
      } catch {
        // Try the next locator selector.
      }
    }
    return '';
  }

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify('error', message);
      throw error;
    }
  }

  return {
    async saveTextChanges() {
      await run(async () => {
        const editor = getEditor();
        const changes = editor.getTargetedTextChanges();
        if (changes.length === 0) {
          notify('info', '当前没有可保存的文本修改。');
          return;
        }
        const edits = changes.map((change) => {
          const key = locateTextKey(change);
          if (!key) {
            throw new Error('部分文本无法精确定位，未保存任何修改。请刷新页面后重新编辑。');
          }
          return { key, before: change.before, after: change.after };
        });
        if (!await Promise.resolve(confirm(`将保存 ${edits.length} 处文本修改。保存后 HTML 文档会刷新，是否继续？`))) {
          return;
        }
        const context = getContext();
        const payload = await request('/api/html-review/text-edits', 'POST', {
          path: context.path,
          revision: readRevision(),
          edits,
        });
        editor.acknowledgeSavedTextChanges();
        notify('success', `文本已保存，共更新 ${Number(payload.changedCount ?? edits.length)} 处。`);
        reload();
      });
    },

    async saveStyleChanges() {
      await run(async () => {
        const editor = getEditor();
        const cssText = editor.getStyleChanges().cssText.trim();
        if (!cssText) {
          notify('info', '当前没有可保存的强制样式调整。');
          return;
        }
        if (!await Promise.resolve(confirm('将把当前样式调整保存为临时覆盖样式。后续修改资源时应将其合并到正式样式并清理临时 hack。'))) {
          return;
        }
        const context = getContext();
        await request('/api/html-review/style-hack', 'PUT', {
          path: context.path,
          revision: readRevision(),
          cssText,
        });
        editor.acknowledgeSavedStyleChanges();
        notify('success', '临时强制样式已保存。');
        reload();
      });
    },

    async clearForcedStyles() {
      await run(async () => {
        if (!await Promise.resolve(confirm('确定清空当前 HTML 文档的临时强制样式吗？'))) return;
        const editor = getEditor();
        const context = getContext();
        await request('/api/html-review/style-hack', 'DELETE', {
          path: context.path,
          revision: readRevision(),
        });
        editor.acknowledgeSavedStyleChanges();
        notify('success', '已清空临时强制样式。');
        reload();
      });
    },
  };
}
