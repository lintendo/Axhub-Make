/**
 * Offline HTML export archive builder.
 *
 * Produces a self-contained ZIP that can be opened directly in a browser
 * without any dev server.  Each entry gets its own `index.html` that
 * loads React/ReactDOM from local vendor scripts and renders the
 * component produced by an on-demand Vite build.
 */

import type { ServerResponse } from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

import { buildOnDemand } from './onDemandBuild.ts';
import { isPathInside } from './projectCore/index.ts';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OFFLINE_REACT_FILE = 'react.production.min.js';
const OFFLINE_REACT_DOM_FILE = 'react-dom.production.min.js';
const OFFLINE_BOOTSTRAP_FILE = 'export-html-bootstrap.js';
const requireFromCurrentModule = createRequire(import.meta.url);
const currentModuleDir = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findNodeModuleFileFrom(startDir: string, relativePath: string): string | null {
  let currentDir = startDir;
  while (true) {
    const candidate = path.join(currentDir, 'node_modules', relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

function resolveNodeModuleFile(projectRoot: string, relativePath: string): string {
  const searchRoots = [projectRoot, process.cwd(), currentModuleDir];

  for (const searchRoot of searchRoots) {
    const found = findNodeModuleFileFrom(searchRoot, relativePath);
    if (found) {
      return found;
    }
  }

  try {
    return requireFromCurrentModule.resolve(relativePath.split(path.sep).join('/'));
  } catch {
    // Package exports often hide UMD files; resolve the package root instead.
  }

  const [packageName, ...subPath] = relativePath.split(path.sep);
  if (packageName && subPath.length > 0) {
    try {
      const packageEntry = requireFromCurrentModule.resolve(packageName);
      const candidate = path.join(path.dirname(packageEntry), ...subPath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Fall through to the localized error below.
    }
  }

  throw new Error(`缺少离线导出依赖资源: ${relativePath}`);
}

function sanitizeZipName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/* ------------------------------------------------------------------ */
/*  Offline bootstrap script                                           */
/* ------------------------------------------------------------------ */

function getOfflineBootstrapScript(): string {
  return `;(function () {
  function applyRootSizing() {
    var urlParams = new URLSearchParams(window.location.search);
    var scale = urlParams.get('scale');
    var width = urlParams.get('width');
    var height = urlParams.get('height');
    var rootElement = document.getElementById('root');

    if (!rootElement) {
      return;
    }

    if (scale) {
      var scaleValue = parseFloat(scale);
      if (!Number.isNaN(scaleValue) && scaleValue > 0) {
        rootElement.style.transform = 'scale(' + scaleValue + ')';
        rootElement.style.transformOrigin = 'top left';
      }
    }

    if (width) {
      var widthValue = parseInt(width, 10);
      if (!Number.isNaN(widthValue) && widthValue > 0) {
        rootElement.style.width = widthValue + 'px';
      }
    }

    if (height) {
      var heightValue = parseInt(height, 10);
      if (!Number.isNaN(heightValue) && heightValue > 0) {
        rootElement.style.height = heightValue + 'px';
      }
    }
  }

  function renderComponent(Component, props) {
    var rootElement = document.getElementById('root');
    if (!rootElement) {
      console.error('[Html Template] 找不到 #root 元素');
      return;
    }

    if (!window.React || !window.ReactDOM) {
      console.error('[Html Template] React 或 ReactDOM 未加载');
      return;
    }

    var finalProps = props || {
      container: rootElement,
      config: {},
      data: {},
      events: {},
    };

    try {
      if (typeof window.ReactDOM.createRoot === 'function') {
        window.ReactDOM.createRoot(rootElement).render(window.React.createElement(Component, finalProps));
        return;
      }

      if (typeof window.ReactDOM.render === 'function') {
        window.ReactDOM.render(window.React.createElement(Component, finalProps), rootElement);
        return;
      }

      throw new Error('当前 ReactDOM 版本不支持 createRoot/render');
    } catch (error) {
      console.error('[Html Template] 渲染失败:', error);
    }
  }

  applyRootSizing();

  window.__AXHUB_DEFINE_COMPONENT__ = function (Component) {
    window.UserComponent = Component;
    return Component;
  };

  window.HtmlTemplateBootstrap = {
    renderComponent: renderComponent,
    React: window.React,
    ReactDOM: window.ReactDOM,
  };
})();`;
}

/* ------------------------------------------------------------------ */
/*  HTML generation                                                    */
/* ------------------------------------------------------------------ */

function generateOfflineHtml(options: {
  title: string;
  group: string;
  entryScriptPath: string;
  reactPath: string;
  reactDomPath: string;
  bootstrapPath: string;
  cssText?: string;
  cssPath?: string;
  sourceReferenceScript?: string;
}): string {
  const cssBlock = options.cssText?.trim()
    ? `\n  <style>\n${options.cssText}\n  </style>`
    : '';
  const cssLink = options.cssPath
    ? `\n  <link rel="stylesheet" href="${options.cssPath}">`
    : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(options.title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body {
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: 0;
      min-height: 100%;
      height: 100%;
      overflow-x: hidden;
      overflow-y: auto;
    }
    #root {
      width: 100%;
      margin-left: auto;
      margin-right: auto;
      height: 100%;
      min-height: 100vh;
      overflow: visible;
    }
    body.is-element-page #root {
      width: 100vw;
      height: 100vh;
    }
  </style>${cssBlock}${cssLink}
</head>
<body>

  <script>
    (function () {
      var isComponent = ${JSON.stringify(options.group === 'components')};
      if (document.body && (isComponent || window.location.pathname.includes('/components/'))) {
        document.body.classList.add('is-element-page');
      }
    })();
  </script>

  <div id="root"></div>

  ${options.sourceReferenceScript ? `<script>${options.sourceReferenceScript}</script>\n` : ''}
  <script src="${options.reactPath}"></script>
  <script src="${options.reactDomPath}"></script>
  <script src="${options.bootstrapPath}"></script>

  <script>
    function waitForBootstrap(timeoutMs) {
      timeoutMs = timeoutMs || 10000;
      return new Promise(function (resolve, reject) {
        var startedAt = Date.now();
        function check() {
          if (window.HtmlTemplateBootstrap) {
            resolve(window.HtmlTemplateBootstrap);
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error('[Html Template] Bootstrap 初始化超时'));
            return;
          }
          setTimeout(check, 10);
        }
        check();
      });
    }

    function loadEntryScript(src) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = function () { resolve(); };
        script.onerror = function () { reject(new Error('[Html Template] 入口脚本加载失败: ' + src)); };
        document.body.appendChild(script);
      });
    }

    async function bootstrapAndRender() {
      try {
        var bootstrap = await waitForBootstrap();
        var renderComponent = bootstrap.renderComponent;
        window.React = bootstrap.React;
        window.ReactDOM = bootstrap.ReactDOM;

        await loadEntryScript('${options.entryScriptPath}');
        ${options.sourceReferenceScript ? options.sourceReferenceScript : ''}

        var Component = window.UserComponent && (window.UserComponent.Component || window.UserComponent.default || window.UserComponent);
        if (!Component) {
          throw new Error('[Html Template] 入口脚本未暴露 UserComponent');
        }

        renderComponent(Component);
      } catch (error) {
        console.error('[Html Template] 页面初始化失败:', error);
      }
    }

    bootstrapAndRender();
  </script>

</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface ExportHtmlOptions {
  projectRoot: string;
  sourceFile: string;
  entryName: string;
  displayName: string;
  group: string;
  includeSource?: boolean;
  mediaRoot?: string;
  reviewSubmit?: ExportHtmlReviewSubmitOptions;
}

export interface ExportHtmlReviewSubmitOptions {
  url: string;
  existsUrl: string;
  projectId: string;
  prototypeId: string;
}

export interface ExportHtmlStaticFile {
  path: string;
  contentType: string;
  body: Buffer;
}

const INLINE_HTML_CSS_MAX_BYTES = 512 * 1024;
const CSS_DATA_URI_EXTRACT_MIN_BYTES = 1024 * 1024;

function toStaticFile(filePath: string, contentType: string, content: string | Buffer): ExportHtmlStaticFile {
  return {
    path: filePath.split(path.sep).join('/'),
    contentType,
    body: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
  };
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') return 'text/plain; charset=utf-8';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  if (ext === '.ttf') return 'font/ttf';
  return 'application/octet-stream';
}

function contentTypeToExtension(contentType: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (normalized === 'font/ttf' || normalized === 'application/x-font-ttf') return 'ttf';
  if (normalized === 'font/woff') return 'woff';
  if (normalized === 'font/woff2') return 'woff2';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'text/plain') return 'txt';
  return 'bin';
}

function normalizeDataUriBase64(value: string): string {
  return value.replace(/\s+/gu, '');
}

function extractLargeCssDataUris(cssText: string): {
  cssText: string;
  files: ExportHtmlStaticFile[];
} {
  const files: ExportHtmlStaticFile[] = [];
  const dataUriPattern = /url\(\s*(["']?)(data:([^;,()]+)(?:;[^,()]*)?;base64,([A-Za-z0-9+/=\s]+))\1\s*\)/gu;
  const nextCssText = cssText.replace(dataUriPattern, (match, quote: string, _dataUri: string, contentType: string, base64: string) => {
    const normalizedBase64 = normalizeDataUriBase64(base64);
    const estimatedBytes = Math.floor(normalizedBase64.length * 3 / 4);
    if (estimatedBytes < CSS_DATA_URI_EXTRACT_MIN_BYTES) {
      return match;
    }
    const body = Buffer.from(normalizedBase64, 'base64');
    const extension = contentTypeToExtension(contentType);
    const digest = cryptoHash(body).slice(0, 12);
    const filePath = `assets/data-uri-${digest}.${extension}`;
    if (!files.some((file) => file.path === filePath)) {
      files.push(toStaticFile(filePath, contentType, body));
    }
    const wrappedPath = `${quote || '"'}./${filePath}${quote || '"'}`;
    return `url(${wrappedPath})`;
  });

  return {
    cssText: nextCssText,
    files,
  };
}

function cryptoHash(buffer: Buffer): string {
  let hash = 0x811c9dc5;
  for (const byte of buffer) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
}

const SOURCE_EXCLUDED_DIR_NAMES = new Set([
  '.spec',
  'node_modules',
  'dist',
  '.vite',
  'coverage',
]);

function listFilesRecursive(rootDir: string, baseDir = rootDir): string[] {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (SOURCE_EXCLUDED_DIR_NAMES.has(entry.name.toLowerCase())) {
        continue;
      }
      files.push(...listFilesRecursive(fullPath, baseDir));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const SOURCE_EXCLUDED_FILE_NAMES = new Set([
  'manifest.json',
]);

function shouldExcludeSourceFile(relativePath: string): boolean {
  const normalizedPath = relativePath.split(path.sep).join('/');
  const segments = normalizedPath.split('/').filter(Boolean);
  if (segments.some((segment) => SOURCE_EXCLUDED_DIR_NAMES.has(segment.toLowerCase()))) {
    return true;
  }

  const fileName = (segments[segments.length - 1] || '').toLowerCase();
  return SOURCE_EXCLUDED_FILE_NAMES.has(fileName) || /\.spec(?:\.|$)/iu.test(fileName);
}

function collectSourceStaticFiles(projectRoot: string, sourceFile: string): ExportHtmlStaticFile[] {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const sourceDir = path.dirname(path.resolve(sourceFile));
  if (!isPathInside(resolvedProjectRoot, sourceDir)) {
    throw new Error('源码目录不在项目根目录内，无法导出源码');
  }

  const sourceFiles = listFilesRecursive(sourceDir)
    .filter((relativePath) => !shouldExcludeSourceFile(relativePath))
    .map((relativePath) => {
      const normalizedPath = relativePath.split(path.sep).join('/');
      return toStaticFile(
        `source/${normalizedPath}`,
        getContentType(normalizedPath),
        fs.readFileSync(path.join(sourceDir, relativePath)),
      );
    });
  const entryPath = path.relative(sourceDir, path.resolve(sourceFile)).split(path.sep).join('/');
  const manifest = {
    version: 1,
    format: 'axhub-published-source',
    sourceRoot: 'source',
    entry: entryPath,
    files: sourceFiles
      .map((file) => file.path.replace(/^source\//u, ''))
      .sort((a, b) => a.localeCompare(b))
      .map((relativePath) => ({
        path: relativePath,
        kind: relativePath === entryPath ? 'entry' : 'source',
      })),
  };

  return [
    toStaticFile('source/manifest.json', 'application/json; charset=utf-8', `${JSON.stringify(manifest, null, 2)}\n`),
    ...sourceFiles,
  ];
}

function resolveMediaExportDir(projectRoot: string, mediaRoot?: string): string {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const mediaDir = mediaRoot ? path.resolve(mediaRoot) : path.join(resolvedProjectRoot, 'src', 'media');
  if (!isPathInside(resolvedProjectRoot, mediaDir)) {
    throw new Error('媒体资源目录不在项目根目录内，无法导出媒体资源');
  }
  return mediaDir;
}

function toOfflineMediaPath(mediaPath: string): string {
  const normalizedPath = mediaPath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');
  return normalizedPath ? `./media/${normalizedPath}` : './media';
}

function rewriteMediaUrlsForOffline(text: string): string {
  return text
    .replace(/(^|["'(\s=])\/api\/media\/file\/([^\s"'`)<>()]+)/gu, (_match, prefix: string, mediaPath: string) => (
      `${prefix}${toOfflineMediaPath(mediaPath)}`
    ))
    .replace(/(^|["'(\s=])\/media\/([^\s"'`)<>()]+)/gu, (_match, prefix: string, mediaPath: string) => (
      `${prefix}${toOfflineMediaPath(mediaPath)}`
    ));
}

function createReviewSubmitScript(reviewSubmit: ExportHtmlReviewSubmitOptions): string {
  return `window.__AXHUB_REVIEW_SUBMIT__=${JSON.stringify({
    url: reviewSubmit.url,
    existsUrl: reviewSubmit.existsUrl,
    projectId: reviewSubmit.projectId,
    prototypeId: reviewSubmit.prototypeId,
  })};`;
}

export async function buildExportHtmlStaticFiles(options: ExportHtmlOptions): Promise<ExportHtmlStaticFile[]> {
  const { projectRoot, sourceFile, displayName, entryName, group } = options;
  console.log(`\n📦 [导出 HTML] 开始构建: ${entryName}`);

  const buildResult = await buildOnDemand(projectRoot, sourceFile);
  const jsCode = rewriteMediaUrlsForOffline(buildResult.jsCode || '');
  const builtCssText = rewriteMediaUrlsForOffline(buildResult.cssText || '');
  console.log(`[导出 HTML] 构建完成，JS ${jsCode.length} bytes, CSS ${builtCssText.length} bytes`);

  const reactUmdPath = resolveNodeModuleFile(projectRoot, path.join('react', 'umd', OFFLINE_REACT_FILE));
  const reactDomUmdPath = resolveNodeModuleFile(projectRoot, path.join('react-dom', 'umd', OFFLINE_REACT_DOM_FILE));
  const extractedCss = extractLargeCssDataUris(builtCssText);
  const cssText = extractedCss.cssText;
  const shouldExternalizeCss = Buffer.byteLength(cssText, 'utf8') > INLINE_HTML_CSS_MAX_BYTES;
  const shouldInjectAnnotationSourceReference = options.includeSource === true
    && buildResult.metadata?.usesAnnotationRuntime === true;
  const runtimeGlobalScript = [
    options.reviewSubmit ? createReviewSubmitScript(options.reviewSubmit) : '',
    shouldInjectAnnotationSourceReference
      ? 'window.__AXHUB_ANNOTATION_SOURCE_REFERENCE__={root:"source",manifest:"source/manifest.json"};'
      : '',
  ].filter(Boolean).join('\n');

  const htmlContent = generateOfflineHtml({
    title: displayName || entryName,
    group,
    entryScriptPath: './index.js',
    reactPath: `./assets/${OFFLINE_REACT_FILE}`,
    reactDomPath: `./assets/${OFFLINE_REACT_DOM_FILE}`,
    bootstrapPath: `./assets/${OFFLINE_BOOTSTRAP_FILE}`,
    cssText: shouldExternalizeCss ? '' : cssText,
    cssPath: shouldExternalizeCss ? './index.css' : undefined,
    sourceReferenceScript: runtimeGlobalScript || undefined,
  });

  const files: ExportHtmlStaticFile[] = [
    toStaticFile('index.html', 'text/html; charset=utf-8', htmlContent),
    toStaticFile('index.js', 'application/javascript; charset=utf-8', jsCode),
    toStaticFile(`assets/${OFFLINE_REACT_FILE}`, 'application/javascript; charset=utf-8', fs.readFileSync(reactUmdPath)),
    toStaticFile(`assets/${OFFLINE_REACT_DOM_FILE}`, 'application/javascript; charset=utf-8', fs.readFileSync(reactDomUmdPath)),
    toStaticFile(`assets/${OFFLINE_BOOTSTRAP_FILE}`, 'application/javascript; charset=utf-8', getOfflineBootstrapScript()),
  ];
  if (shouldExternalizeCss) {
    files.push(toStaticFile('index.css', 'text/css; charset=utf-8', cssText));
  }
  files.push(...extractedCss.files);

  const mediaDir = resolveMediaExportDir(projectRoot, options.mediaRoot);
  for (const relativePath of listFilesRecursive(mediaDir)) {
    const normalizedPath = relativePath.split(path.sep).join('/');
    files.push(toStaticFile(`media/${normalizedPath}`, getContentType(normalizedPath), fs.readFileSync(path.join(mediaDir, relativePath))));
  }
  if (options.includeSource === true) {
    files.push(...collectSourceStaticFiles(projectRoot, sourceFile));
  }

  return files;
}

export async function streamExportHtmlArchive(
  res: ServerResponse,
  options: ExportHtmlOptions,
  buildContentDisposition: (fileName: string) => string,
): Promise<void> {
  const { entryName } = options;
  const staticFiles = await buildExportHtmlStaticFiles(options);

  const zipFileName = `${sanitizeZipName(entryName)}-html.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', buildContentDisposition(zipFileName));
  res.setHeader('Cache-Control', 'no-store');

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (warning: any) => {
    console.warn('[导出 HTML] ZIP warning:', warning);
  });

  archive.on('error', (error: any) => {
    console.error('[导出 HTML] ZIP error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: `ZIP 创建失败: ${error.message}` }));
    } else {
      res.end();
    }
  });

  archive.pipe(res);

  for (const file of staticFiles) {
    archive.append(file.body, { name: file.path });
  }

  await archive.finalize();
  console.log('[导出 HTML] ✅ ZIP 导出完成');
}
