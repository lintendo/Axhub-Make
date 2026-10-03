export interface PublishedReviewShellOptions {
  shareId: string;
  projectId: string;
  runtimePath: string;
  runtimeOrigin?: string;
  makeServerOrigin?: string;
  previewPath?: string;
  commentable: boolean;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function normalizeHttpOrigin(value: unknown): string {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : '';
  } catch {
    return '';
  }
}

function buildRuntimeUrl(options: PublishedReviewShellOptions): string {
  let url: URL;
  try {
    url = new URL(String(options.previewPath || ''), 'http://localhost');
  } catch {
    url = new URL(options.runtimePath, 'http://localhost');
  }
  if (url.pathname !== options.runtimePath) {
    url = new URL(options.runtimePath, 'http://localhost');
  }
  // The published shell has no Make host toolbar. Always use Commentary's
  // existing inline toolbar even when an older preview URL persisted host mode.
  url.searchParams.delete('agentToolbar');
  url.searchParams.set('projectId', String(options.projectId || '').trim());
  const makeServerOrigin = normalizeHttpOrigin(options.makeServerOrigin);
  if (makeServerOrigin) {
    // The iframe now loads from the Make client directly. Keep annotation API
    // requests pointed at the published Make server rather than the client.
    url.searchParams.set('makeServerOrigin', makeServerOrigin);
  } else {
    url.searchParams.delete('makeServerOrigin');
  }
  if (options.commentable === true) {
    url.searchParams.set('annotationSession', '1');
  } else {
    url.searchParams.delete('annotationSession');
  }
  url.searchParams.set('publishedShareId', String(options.shareId || '').trim());
  const runtimeOrigin = normalizeHttpOrigin(options.runtimeOrigin);
  if (runtimeOrigin) {
    return new URL(`${url.pathname}${url.search}${url.hash}`, `${runtimeOrigin}/`).toString();
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildPublishedReviewShellHtml(options: PublishedReviewShellOptions): string {
  const runtimeUrl = buildRuntimeUrl(options);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>原型批注</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #fff; }
      iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    </style>
  </head>
  <body>
    <iframe title="发布原型" src="${escapeHtml(runtimeUrl)}"></iframe>
  </body>
</html>`;
}
