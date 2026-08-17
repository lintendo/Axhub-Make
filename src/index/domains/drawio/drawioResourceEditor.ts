import { extractEditableDrawioXmlFromImageFile } from './canvasDrawio';

type DrawioResourceKind = 'doc' | 'template';

interface DrawioResourceLike {
  name?: string;
  resourceId?: string;
  projectId: string;
  specUrl?: string;
  previewUrl?: string;
  filePath?: string;
  absoluteFilePath?: string;
}

type DrawioResourceCandidate = Omit<DrawioResourceLike, 'projectId'> & { projectId?: string };

interface DrawioMessageApi {
  success?: (content: string) => void;
  info?: (content: string) => void;
  warning?: (content: string) => void;
  error?: (content: string) => void;
}

interface OpenDrawioResourceEditorOptions {
  resource: DrawioResourceLike | null | undefined;
  kind: DrawioResourceKind;
  popupWindow?: Window | null;
  messageApi?: DrawioMessageApi;
  onSaved?: () => void | Promise<void>;
}

const DRAWIO_EMBED_URL = 'https://embed.diagrams.net/?embed=1&ui=min&proto=json&spin=1&libraries=1&lang=zh';
const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
const DRAWIO_WINDOW_TARGET = 'axhub-drawio-editor';
const DRAWIO_RESOURCE_RE = /\.drawio(?:\.svg)?(?:$|[?#])/iu;

function notify(messageApi: DrawioMessageApi | undefined, level: keyof DrawioMessageApi, content: string) {
  const handler = messageApi?.[level];
  if (typeof handler === 'function') {
    handler(content);
  }
}

function normalizeResourceName(value: unknown): string {
  return String(value || '').trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
}

function hasDrawioExtension(value: unknown): boolean {
  const normalized = normalizeResourceName(value);
  if (!normalized) return false;
  try {
    return DRAWIO_RESOURCE_RE.test(decodeURIComponent(normalized));
  } catch {
    return DRAWIO_RESOURCE_RE.test(normalized);
  }
}

function addQueryParam(url: string, key: string, value: string): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function removeQueryParam(url: string, key: string): string {
  const [path, query = ''] = url.split('?');
  if (!query) return path;
  const params = new URLSearchParams(query);
  params.delete(key);
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function getApiResourceNameFromUrl(value: unknown, kind: DrawioResourceKind): string {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, 'http://axhub.local');
    const pathname = decodeURIComponent(parsed.pathname);
    const prefix = kind === 'template' ? '/api/docs/templates/' : '/api/docs/';
    if (!pathname.startsWith(prefix)) return '';
    return normalizeResourceName(pathname.slice(prefix.length));
  } catch {
    return '';
  }
}

function getApiResourceUrlFromValue(value: unknown, kind: DrawioResourceKind): string {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, 'http://axhub.local');
    const prefix = kind === 'template' ? '/api/docs/templates/' : '/api/docs/';
    if (!decodeURIComponent(parsed.pathname).startsWith(prefix)) return '';
    parsed.searchParams.delete('download');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '';
  }
}

function resolveDrawioResourceName(resource: DrawioResourceLike | null | undefined, kind: DrawioResourceKind): string {
  if (!resource) return '';
  return normalizeResourceName(resource.name)
    || normalizeResourceName(resource.resourceId)
    || getApiResourceNameFromUrl(resource.specUrl, kind)
    || getApiResourceNameFromUrl(resource.previewUrl, kind);
}

function getDrawioResourceFormat(resource: DrawioResourceLike | null | undefined, kind: DrawioResourceKind): 'xml' | 'svg' {
  const candidates = [
    resolveDrawioResourceName(resource, kind),
    resource?.specUrl,
    resource?.previewUrl,
    resource?.filePath,
    resource?.absoluteFilePath,
  ];
  return candidates.some((value) => /\.drawio\.svg(?:$|[?#])/iu.test(String(value || ''))) ? 'svg' : 'xml';
}

function encodeBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  return (globalThis as any).Buffer.from(value, 'utf8').toString('base64');
}

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(value)));
  }
  return (globalThis as any).Buffer.from(value, 'base64').toString('utf8');
}

function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${encodeBase64(svg)}`;
}

function readSvgDataUrlText(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/svg\+xml((?:;[^,]+)*),(.*)$/u);
  if (!match) return '';
  const payload = match[2] || '';
  if ((match[1] || '').split(';').includes('base64')) {
    return decodeBase64(payload);
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function normalizeDrawioXml(value: string): string | null {
  const content = String(value || '').trim();
  if (!content) return null;
  if (/<mxfile\b/iu.test(content)) return content;
  const graphModelMatch = content.match(/<mxGraphModel\b[\s\S]*?<\/mxGraphModel>/u);
  if (!graphModelMatch?.[0]) return null;
  return `<mxfile host="embed.diagrams.net"><diagram id="axhub-drawio-resource" name="Page-1">${graphModelMatch[0]}</diagram></mxfile>`;
}

function extractEditableDrawioXmlFromResourceContent(content: string, format: 'xml' | 'svg'): string | null {
  if (format === 'svg') {
    const svgXml = extractEditableDrawioXmlFromImageFile({ dataURL: createSvgDataUrl(content) });
    if (svgXml) return svgXml;
  }
  return normalizeDrawioXml(content);
}

function parseDrawioMessage(data: unknown): any {
  if (!data || typeof data !== 'string') return null;
  if (data === 'ready') return { event: 'ready' };
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function readResponseMessage(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json();
    return String(payload?.error || payload?.message || '');
  } catch {
    try {
      return (await response.text()).trim();
    } catch {
      return '';
    }
  }
}

export function isDrawioResource(resource: DrawioResourceCandidate | null | undefined): boolean {
  if (!resource) return false;
  return [
    resource.name,
    resource.resourceId,
    resource.specUrl,
    resource.previewUrl,
    resource.filePath,
    resource.absoluteFilePath,
  ].some(hasDrawioExtension);
}

export function buildDrawioResourceApiUrl(resource: DrawioResourceLike | null | undefined, kind: DrawioResourceKind): string {
  if (!resource) return '';
  const existingApiUrl = getApiResourceUrlFromValue(resource.specUrl, kind)
    || getApiResourceUrlFromValue(resource.previewUrl, kind);
  if (existingApiUrl) {
    return addQueryParam(existingApiUrl, 'projectId', resource.projectId);
  }

  const name = resolveDrawioResourceName(resource, kind);
  if (!name) return '';
  const baseUrl = kind === 'template'
    ? `/api/docs/templates/${encodeURIComponent(name)}`
    : `/api/docs/${encodeURIComponent(name)}`;
  return addQueryParam(baseUrl, 'projectId', resource.projectId);
}

export function buildDrawioResourceRawUrl(resource: DrawioResourceLike | null | undefined, kind: DrawioResourceKind): string {
  const apiUrl = buildDrawioResourceApiUrl(resource, kind);
  return apiUrl ? addQueryParam(removeQueryParam(apiUrl, 'download'), 'download', '1') : '';
}

export async function openDrawioResourceEditor({
  resource,
  kind,
  popupWindow,
  messageApi,
  onSaved,
}: OpenDrawioResourceEditorOptions): Promise<boolean> {
  if (!resource || !isDrawioResource(resource)) {
    notify(messageApi, 'warning', '请先选择 Draw.io 资源');
    return false;
  }

  const apiUrl = buildDrawioResourceApiUrl(resource, kind);
  const rawUrl = buildDrawioResourceRawUrl(resource, kind);
  if (!apiUrl || !rawUrl) {
    notify(messageApi, 'error', 'Draw.io 资源路径不可用');
    return false;
  }

  let rawContent = '';
  try {
    const response = await fetch(rawUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(await readResponseMessage(response) || `读取失败：${response.status}`);
    }
    rawContent = await response.text();
  } catch (error: any) {
    notify(messageApi, 'error', error?.message || '读取 Draw.io 资源失败');
    return false;
  }

  const format = getDrawioResourceFormat(resource, kind);
  const editableXml = extractEditableDrawioXmlFromResourceContent(rawContent, format);
  if (!editableXml) {
    notify(messageApi, 'error', '这个 Draw.io 资源缺少可编辑源，请重新生成后再编辑');
    return false;
  }

  const popup = popupWindow ?? window.open(DRAWIO_EMBED_URL, DRAWIO_WINDOW_TARGET);
  if (!popup) {
    notify(messageApi, 'error', '无法打开 Draw.io 新标签页，请检查浏览器弹窗拦截设置');
    return false;
  }

  if (popupWindow) {
    popup.location.href = DRAWIO_EMBED_URL;
  }
  popup.focus?.();

  let currentXml = editableXml;
  let savedXml = editableXml;
  let dirty = false;
  let saving = false;
  let closedTimer = 0;

  const cleanup = () => {
    if (closedTimer) {
      window.clearInterval(closedTimer);
      closedTimer = 0;
    }
    window.removeEventListener('message', handleMessage);
    popup.close?.();
  };
  const postDrawioMessage = (message: Record<string, unknown>) => {
    popup.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
  };
  const saveResourceContent = async (content: string) => {
    if (saving) return;
    saving = true;
    try {
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(await readResponseMessage(response) || `保存失败：${response.status}`);
      }
      savedXml = currentXml;
      dirty = false;
      notify(messageApi, 'success', 'Draw.io 图表已保存');
      cleanup();
      await onSaved?.();
    } catch (error: any) {
      saving = false;
      notify(messageApi, 'error', error?.message || '保存 Draw.io 图表失败');
    }
  };

  function handleMessage(event: MessageEvent) {
    if (event.origin !== DRAWIO_ORIGIN || event.source !== popup) return;
    if (event.data === 'ready') {
      postDrawioMessage({
        action: 'load',
        xml: currentXml,
        autosave: 1,
      });
      return;
    }

    const message = parseDrawioMessage(event.data);
    if (!message) return;
    if (message.event === 'init') {
      postDrawioMessage({
        action: 'load',
        xml: currentXml,
        autosave: 1,
      });
      return;
    }
    if (message.event === 'autosave') {
      const xml = typeof message.xml === 'string' ? message.xml : currentXml;
      currentXml = xml;
      dirty = xml !== savedXml;
      return;
    }
    if (message.event === 'save') {
      const xml = typeof message.xml === 'string' ? message.xml : currentXml;
      currentXml = xml;
      dirty = xml !== savedXml;
      if (format === 'svg') {
        postDrawioMessage({
          action: 'export',
          format: 'xmlsvg',
          xml: currentXml,
          spin: '保存图表...',
        });
        return;
      }
      void saveResourceContent(currentXml);
      return;
    }
    if (message.event === 'exit') {
      const hasEditorReportedUnsavedChanges = message.modified === true || message.modified === 'true';
      if (
        (hasEditorReportedUnsavedChanges || dirty)
        && !window.confirm('当前 Draw.io 图表有未保存修改，确定退出并放弃这些修改吗？')
      ) {
        return;
      }
      cleanup();
      return;
    }
    if (message.event === 'export') {
      const dataUrl = String(message.data || '');
      if (!dataUrl.startsWith('data:image/svg+xml')) {
        notify(messageApi, 'error', 'Draw.io 导出失败');
        return;
      }
      const svgContent = readSvgDataUrlText(dataUrl);
      if (!svgContent.trim()) {
        notify(messageApi, 'error', 'Draw.io 导出内容为空');
        return;
      }
      void saveResourceContent(svgContent);
    }
  }

  window.addEventListener('message', handleMessage);
  closedTimer = window.setInterval(() => {
    if (popup.closed) {
      cleanup();
    }
  }, 1000);
  return true;
}
