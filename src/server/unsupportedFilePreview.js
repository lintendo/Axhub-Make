import fs from 'node:fs';
import path from 'node:path';
import { getRequestUrl, sendText } from './http.ts';
const TEXT_EXTENSIONS = new Set(['.md', '.csv', '.json', '.yaml', '.yml', '.txt', '.html', '.htm', '.xml', '.svg']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif']);
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function formatFileSize(size) {
    if (!Number.isFinite(size) || size < 0) {
        return '';
    }
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function isInlinePreviewableExtension(ext) {
    return TEXT_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
}
function isBrowserFilePreviewRequest(req) {
    const destination = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
    if (destination === 'document' || destination === 'iframe') {
        return true;
    }
    const accept = String(req.headers.accept || '').toLowerCase();
    return accept.includes('text/html') || accept.includes('application/xhtml+xml');
}
function shouldRenderUnsupportedFilePreview(req, filePath) {
    const url = getRequestUrl(req);
    if (url.searchParams.get('download') === '1') {
        return false;
    }
    const ext = path.extname(filePath).toLowerCase();
    return !isInlinePreviewableExtension(ext) && isBrowserFilePreviewRequest(req);
}
function renderUnsupportedFilePreviewHtml(params) {
    const ext = path.extname(params.docName || params.filePath).toLowerCase();
    const fileName = path.basename(params.docName || params.filePath);
    const displayName = ext ? fileName.slice(0, -ext.length) || fileName : fileName;
    let formattedSize = '';
    try {
        formattedSize = formatFileSize(fs.statSync(params.filePath).size);
    }
    catch {
        formattedSize = '';
    }
    const configJson = JSON.stringify({
        docName: params.docName,
        openEndpoint: params.openEndpoint,
        resourceType: params.resourceType,
    }).replace(/</g, '\\u003c');
    const metaParts = [
        ext ? `<span class="badge">${escapeHtml(ext.toUpperCase())}</span>` : '',
        formattedSize ? `<span>${escapeHtml(formattedSize)}</span>` : '',
    ].filter(Boolean).join('');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(displayName || fileName || '文件')}</title>
  <style>
    :root {
      color-scheme: light;
      --background: #ffffff;
      --foreground: #0f172a;
      --muted: #f1f5f9;
      --muted-foreground: #64748b;
      --border: #dbe3ee;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 24px;
      background: var(--background);
      color: var(--foreground);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      display: flex;
      width: min(320px, 100%);
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
    }
    .file-icon {
      display: grid;
      width: 80px;
      height: 80px;
      place-items: center;
      border-radius: 16px;
      background: rgba(241, 245, 249, 0.6);
      color: #94a3b8;
    }
    h1 {
      width: 100%;
      max-width: 240px;
      margin: 0 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      letter-spacing: 0;
    }
    .title-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      width: 100%;
    }
    .meta {
      display: flex;
      min-height: 20px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--muted-foreground);
      font-size: 12px;
      line-height: 16px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 4px;
      background: rgba(241, 245, 249, 0.8);
      padding: 2px 6px;
      color: #64748b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 16px;
    }
    button {
      display: inline-flex;
      height: 36px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #ffffff;
      color: var(--foreground);
      padding: 0 12px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    button:hover { border-color: #cbd5e1; background: #f8fafc; }
    button:disabled { cursor: default; opacity: 0.7; }
    .status {
      min-height: 18px;
      color: var(--muted-foreground);
      font-size: 12px;
      line-height: 18px;
    }
  </style>
</head>
<body>
  <main>
    <div class="file-icon" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8l-6-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M14 2v5a1 1 0 0 0 1 1h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="title-group">
      <h1 title="${escapeHtml(fileName)}">${escapeHtml(displayName || fileName || '文件')}</h1>
      <div class="meta">${metaParts}</div>
    </div>
    <button type="button" id="open-system">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 14 21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      用系统应用打开
    </button>
    <div class="status" id="status"></div>
  </main>
  <script>
    const config = ${configJson};
    const button = document.getElementById('open-system');
    const status = document.getElementById('status');
    button?.addEventListener('click', async () => {
      if (!button) return;
      button.disabled = true;
      status.textContent = '正在打开...';
      try {
        const response = await fetch(config.openEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docName: config.docName, type: config.resourceType }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || '打开失败');
        }
        status.textContent = '已交给系统应用打开';
      } catch (error) {
        status.textContent = error?.message || '打开失败';
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
export function sendUnsupportedFilePreview(params) {
    try {
        if (!fs.statSync(params.filePath).isFile()) {
            return false;
        }
    }
    catch {
        return false;
    }
    if (!shouldRenderUnsupportedFilePreview(params.req, params.filePath)) {
        return false;
    }
    params.res.setHeader('Cache-Control', 'no-store');
    params.res.setHeader('X-Axhub-Preview-Fallback', 'unsupported-file');
    sendText(params.res, renderUnsupportedFilePreviewHtml({
        docName: params.docName,
        filePath: params.filePath,
        openEndpoint: params.openEndpoint,
        resourceType: params.resourceType || 'docs',
    }), 'text/html; charset=utf-8');
    return true;
}
