import type { IncomingMessage, ServerResponse } from 'node:http';

import { sendText } from './http.ts';

export const QUICK_EDIT_RUNTIME_SCRIPT = String.raw`(() => {
  const protocolVersion = 1;
  const runtimeVersion = '0.3.0';
  const capabilities = ['handshake', 'dom-selection', 'patch', 'save', 'exit', 'figma-copy', 'axure-export', 'prototype-error-dialog'];
  const currentScript = document.currentScript;
  const runtimeScriptUrl = currentScript && currentScript.src ? currentScript.src : window.location.href;
  const runtimeOrigin = (() => {
    try {
      return new URL(runtimeScriptUrl, window.location.href).origin;
    } catch {
      return window.location.origin;
    }
  })();
  let hostRuntimeOrigin = '';
  const root = window.axhub || (window.axhub = {});
  const quickEdit = root.quickEdit || (root.quickEdit = {});
  const prototypeRuntime = root.prototypeRuntime || (root.prototypeRuntime = {});
  const selectableTagNames = new Set(['A', 'BUTTON', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'LI', 'P', 'SPAN', 'STRONG', 'EM', 'SMALL', 'DIV']);
  const patches = new Map();
  let exportCorePromise = null;
  let axureExportModulePromise = null;
  let active = false;
  let context = {};
  let selectedElement = null;
  let overlay = null;
  let errorDialog = null;
  let errorDialogSummary = null;
  let errorDialogDetails = null;
  let latestPrototypeError = null;
  const transientViteResourcePatterns = [
    '/@vite/client',
    'html-proxy&index=',
    '__axhub-preview-loader.js',
  ];
  const transientViteRetryKey = '__axhub_quick_edit_transient_vite_retry__';
  const transientViteRetryWindowMs = 10_000;
  const ignoredPrototypeErrorsKey = '__axhub_prototype_runtime_ignored_errors__';
  const ignoredPrototypeErrorLimit = 100;
  let transientViteRecoveryPromise = null;

  function buildResourcePayload(extra) {
    return {
      projectId: context.projectId,
      resourceId: context.resourceId,
      resourceType: context.resourceType || 'prototype',
      protocolVersion,
      runtimeVersion,
      href: window.location.href,
      ...extra,
    };
  }

  function post(type, extra) {
    window.parent?.postMessage({
      type,
      ...buildResourcePayload(extra || {}),
    }, '*');
  }

  function postError(message, extra) {
    post('axhub.quickEdit.error', {
      message: String(message || 'Quick Edit runtime error'),
      ...(extra || {}),
    });
  }

  function isPrototypePage() {
    try {
      return /^\/prototypes(?:\/|$)/u.test(window.location.pathname || new URL(window.location.href).pathname);
    } catch {
      return /\/prototypes\//u.test(String(window.location.href || ''));
    }
  }

	  function normalizeError(input, meta) {
	    const nextMeta = meta && typeof meta === 'object' ? meta : {};
	    const error = input && typeof input === 'object' ? input : null;
	    const componentStack = String(nextMeta.componentStack || '').replace(/^\s*\n/u, '');
    const message = String(
      nextMeta.message
      || (error && (error.message || error.reason))
      || input
      || 'Prototype runtime error',
    );
    return {
      type: String(nextMeta.type || 'runtime-error'),
      message,
      stack: String(nextMeta.stack || (error && error.stack) || ''),
      componentStack,
      sourceFile: String(nextMeta.sourceFile || nextMeta.filename || ''),
      line: nextMeta.line ?? nextMeta.lineno ?? '',
      column: nextMeta.column ?? nextMeta.colno ?? '',
      resourceType: String(nextMeta.resourceType || context.resourceType || 'prototype'),
      resourceId: String(nextMeta.resourceId || context.resourceId || ''),
      resourcePath: String(nextMeta.resourcePath || window.location.pathname || ''),
	      url: String(window.location.href || ''),
	      userAgent: String(navigator.userAgent || ''),
	      timestamp: new Date().toISOString(),
	      loaderFile: String(nextMeta.loaderFile || ''),
	      entryFile: String(nextMeta.entryFile || ''),
	      vitePlugin: String(nextMeta.vitePlugin || nextMeta.plugin || ''),
	      frame: String(nextMeta.frame || ''),
	      httpStatus: nextMeta.httpStatus ?? '',
	    };
	  }

  function formatLocation(errorInfo) {
    if (!errorInfo.sourceFile) return '';
    const line = errorInfo.line === '' || errorInfo.line === undefined ? '' : ':' + errorInfo.line;
    const column = errorInfo.column === '' || errorInfo.column === undefined ? '' : ':' + errorInfo.column;
    return errorInfo.sourceFile + line + column;
  }

  function createButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      minHeight: '34px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      background: '#ffffff',
      color: '#111827',
      font: 'inherit',
      padding: '0 12px',
      cursor: 'pointer',
    });
    return button;
  }

  function buildDiagnosticText(errorInfo) {
    const parts = [
      'Axhub prototype runtime error',
      'type: ' + errorInfo.type,
      'message: ' + errorInfo.message,
      'sourceFile: ' + errorInfo.sourceFile,
      'line: ' + errorInfo.line,
      'column: ' + errorInfo.column,
      'url: ' + errorInfo.url,
      'userAgent: ' + errorInfo.userAgent,
      'timestamp: ' + errorInfo.timestamp,
	      'resourceType: ' + errorInfo.resourceType,
	      'resourceId: ' + errorInfo.resourceId,
	      'resourcePath: ' + errorInfo.resourcePath,
	    ];
	    if (errorInfo.loaderFile) {
	      parts.push('loaderFile: ' + errorInfo.loaderFile);
	    }
	    if (errorInfo.entryFile) {
	      parts.push('entryFile: ' + errorInfo.entryFile);
	    }
	    if (errorInfo.vitePlugin) {
	      parts.push('vitePlugin: ' + errorInfo.vitePlugin);
	    }
	    if (errorInfo.httpStatus !== '' && errorInfo.httpStatus !== undefined) {
	      parts.push('httpStatus: ' + errorInfo.httpStatus);
	    }
	    if (errorInfo.frame) {
	      parts.push('frame:\n' + errorInfo.frame);
	    }
	    if (errorInfo.stack) {
	      parts.push('stack:\n' + errorInfo.stack);
	    }
    if (errorInfo.componentStack) {
      parts.push('componentStack:\n' + errorInfo.componentStack);
    }
    return parts.join('\n');
  }

  function getPrototypeErrorPageScope(errorInfo) {
    try {
      const url = new URL(errorInfo.url || window.location.href, window.location.href);
      return url.pathname + url.search + url.hash;
    } catch {
      return String(errorInfo.resourcePath || window.location.href || '');
    }
  }

  function getPrototypeErrorFingerprint(errorInfo) {
    return [
      String(errorInfo.resourceType || 'prototype'),
      String(errorInfo.resourceId || ''),
      getPrototypeErrorPageScope(errorInfo),
      String(errorInfo.type || ''),
      String(errorInfo.message || ''),
      String(errorInfo.sourceFile || ''),
      String(errorInfo.line ?? ''),
      String(errorInfo.column ?? ''),
      String(errorInfo.componentStack || '').slice(0, 500),
    ].join('\n');
  }

  function getIgnoredPrototypeErrors() {
    try {
      const rawValue = window.localStorage?.getItem(ignoredPrototypeErrorsKey);
      if (!rawValue) return [];
      const parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) return [];
      return parsedValue.filter((value) => typeof value === 'string');
    } catch {
      return [];
    }
  }

  function setIgnoredPrototypeErrors(values) {
    try {
      window.localStorage?.setItem(ignoredPrototypeErrorsKey, JSON.stringify(values.slice(0, ignoredPrototypeErrorLimit)));
    } catch {
      // Ignore storage failures; the dialog can still be closed manually.
    }
  }

  function isPrototypeErrorIgnored(errorInfo) {
    const fingerprint = getPrototypeErrorFingerprint(errorInfo);
    return getIgnoredPrototypeErrors().includes(fingerprint);
  }

  function ignorePrototypeError(errorInfo) {
    const fingerprint = getPrototypeErrorFingerprint(errorInfo);
    const existing = getIgnoredPrototypeErrors().filter((value) => value !== fingerprint);
    setIgnoredPrototypeErrors([fingerprint, ...existing]);
  }

  function writeTextWithCopyEvent(text) {
    if (typeof document.execCommand !== 'function') {
      return false;
    }

    let didWriteClipboardData = false;
    const activeElement = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    const textArea = document.createElement('textarea');
    const handleCopy = (event) => {
      if (!event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', text);
      didWriteClipboardData = true;
    };

    try {
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      Object.assign(textArea.style, {
        position: 'fixed',
        left: '-9999px',
        top: '0',
        opacity: '0',
        pointerEvents: 'none',
      });
      const container = document.body || document.documentElement;
      container.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.addEventListener('copy', handleCopy, true);
      const didCopy = document.execCommand('copy');
      return didCopy && didWriteClipboardData;
    } catch {
      return false;
    } finally {
      document.removeEventListener('copy', handleCopy, true);
      textArea.remove();
      activeElement?.focus?.();
    }
  }

  function canUseAsyncClipboardInCurrentFrame() {
    return window.parent === window
      && navigator.clipboard
      && typeof navigator.clipboard.writeText === 'function';
  }

  async function copyPrototypeError(button) {
    if (!latestPrototypeError) return;
    const text = buildDiagnosticText(latestPrototypeError);
    if (writeTextWithCopyEvent(text)) {
      if (button) button.textContent = '已复制';
      return;
    }
    if (!canUseAsyncClipboardInCurrentFrame()) {
      if (button) button.textContent = '复制失败';
      postError('复制错误诊断失败', { error: 'Clipboard write is unavailable in embedded prototype frame' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (button) button.textContent = '已复制';
    } catch (error) {
      if (button) button.textContent = '复制失败';
      postError('复制错误诊断失败', { error: String(error) });
    }
  }

  function renderPrototypeErrorDialog(errorInfo) {
    if (isPrototypeErrorIgnored(errorInfo)) {
      return null;
    }
    latestPrototypeError = errorInfo;
    if (errorDialog) {
      if (errorDialogSummary) {
        errorDialogSummary.textContent = errorInfo.message;
      }
      if (errorDialogDetails) {
        errorDialogDetails.textContent = [
          formatLocation(errorInfo),
          errorInfo.url,
        ].filter(Boolean).join('\n');
      }
      return errorDialog;
    }

    const dialog = document.createElement('div');
    dialog.setAttribute('data-axhub-prototype-error-dialog', '1');
    dialog.setAttribute('data-axhub-quick-edit-ignore', '1');
    Object.assign(dialog.style, {
      position: 'fixed',
      inset: 'auto 20px 20px auto',
      zIndex: '2147483647',
      width: 'min(420px, calc(100vw - 40px))',
      boxSizing: 'border-box',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      background: '#ffffff',
      color: '#111827',
      boxShadow: '0 18px 60px rgba(17, 24, 39, 0.22)',
      padding: '18px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
    });

    const title = document.createElement('div');
    title.textContent = '原型运行错误';
    Object.assign(title.style, {
      fontWeight: '700',
      fontSize: '16px',
      paddingRight: '30px',
      marginBottom: '8px',
    });

    const summary = document.createElement('div');
    summary.textContent = errorInfo.message;
    Object.assign(summary.style, {
      fontWeight: '600',
      overflowWrap: 'anywhere',
      marginBottom: '8px',
    });

    const details = document.createElement('div');
    details.textContent = [
      formatLocation(errorInfo),
      errorInfo.url,
    ].filter(Boolean).join('\n');
    Object.assign(details.style, {
      color: '#4b5563',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      marginBottom: '14px',
    });

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      justifyContent: 'flex-end',
    });

    const copyButton = createButton('复制错误给 AI');
    copyButton.style.background = '#111827';
    copyButton.style.borderColor = '#111827';
    copyButton.style.color = '#ffffff';
    copyButton.addEventListener('click', () => {
      void copyPrototypeError(copyButton);
    });

    const closeButton = createButton('×');
    closeButton.setAttribute('aria-label', '关闭');
    Object.assign(closeButton.style, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      width: '30px',
      minHeight: '30px',
      padding: '0',
      borderColor: 'transparent',
      borderRadius: '999px',
      background: 'transparent',
      color: '#4b5563',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px',
      lineHeight: '1',
    });
    closeButton.addEventListener('click', () => {
      dialog.remove();
      errorDialog = null;
      errorDialogSummary = null;
      errorDialogDetails = null;
    });

    const ignoreButton = createButton('忽略');
    ignoreButton.addEventListener('click', () => {
      ignorePrototypeError(latestPrototypeError || errorInfo);
      dialog.remove();
      errorDialog = null;
      errorDialogSummary = null;
      errorDialogDetails = null;
    });

    const reloadButton = createButton('刷新');
    reloadButton.addEventListener('click', () => {
      window.location.reload();
    });

    actions.appendChild(copyButton);
    actions.appendChild(ignoreButton);
    actions.appendChild(reloadButton);
    dialog.appendChild(title);
    dialog.appendChild(summary);
    dialog.appendChild(details);
    dialog.appendChild(actions);
    dialog.appendChild(closeButton);
    document.documentElement.appendChild(dialog);
    errorDialog = dialog;
    errorDialogSummary = summary;
    errorDialogDetails = details;
    return dialog;
  }

  function reportPrototypeError(error, meta) {
    const errorInfo = normalizeError(error, meta);
    renderPrototypeErrorDialog(errorInfo);
    return errorInfo;
  }

  function autoReportPrototypeError(error, meta) {
    const errorInfo = normalizeError(error, meta);
    if (isPrototypePage()) {
      renderPrototypeErrorDialog(errorInfo);
    }
    return errorInfo;
  }

  function getResourceLoadMeta(target) {
    if (!target || target === window) return null;
    const tagName = String(target.tagName || '').toUpperCase();
    if (!tagName || !['SCRIPT', 'LINK', 'IMG'].includes(tagName)) {
      return null;
    }
    const sourceFile = String(target.src || target.href || '');
    if (!sourceFile) {
      return null;
    }
    return {
      type: 'resource-load',
      message: '资源加载失败: ' + sourceFile,
      sourceFile,
      tagName,
    };
  }

  function isTransientViteResourceIssue(resourceUrl) {
    const normalizedText = String(resourceUrl || '');
    return transientViteResourcePatterns.some((pattern) => normalizedText.includes(pattern));
  }

	  function isHtmlProxyResourceIssue(resourceUrl) {
	    return String(resourceUrl || '').includes('html-proxy&index=');
	  }

	  function isPreviewLoaderResourceIssue(resourceUrl) {
	    return String(resourceUrl || '').includes('__axhub-preview-loader.js');
	  }

	  function toAbsoluteResourceUrl(resourceUrl) {
	    try {
	      return new URL(String(resourceUrl || ''), window.location.href).href;
	    } catch {
	      return String(resourceUrl || '');
	    }
	  }

	  function normalizeResponseStatus(response) {
	    const status = Number(response?.status || 0);
	    return status > 0 ? status : '';
	  }

	  function getFetchFunction() {
	    return typeof window.fetch === 'function'
	      ? window.fetch.bind(window)
	      : (typeof fetch === 'function' ? fetch : null);
	  }

	  function extractPreviewEntryFromLoader(loaderText, loaderUrl) {
	    const source = String(loaderText || '');
	    const importMatch = source.match(/import\s+PreviewComponent\s+from\s+["']([^"']+)["']/u);
	    const importPath = importMatch?.[1] || '';
	    if (importPath) {
	      try {
	        return new URL(importPath, loaderUrl || window.location.href).href;
	      } catch {
	        return importPath;
	      }
	    }
	    try {
	      const parsedUrl = new URL(loaderUrl, window.location.href);
	      parsedUrl.pathname = parsedUrl.pathname.replace(/\/__axhub-preview-loader\.js$/u, '/index.tsx');
	      parsedUrl.search = '';
	      parsedUrl.hash = '';
	      return parsedUrl.href;
	    } catch {
	      return String(loaderUrl || '').replace(/\/__axhub-preview-loader\.js(?:[?#].*)?$/u, '/index.tsx');
	    }
	  }

	  function decodeHtmlEntities(value) {
	    return String(value || '')
	      .replace(/&quot;/g, '"')
	      .replace(/&#34;/g, '"')
	      .replace(/&#x22;/gi, '"')
	      .replace(/&apos;/g, "'")
	      .replace(/&#39;/g, "'")
	      .replace(/&#x27;/gi, "'")
	      .replace(/&lt;/g, '<')
	      .replace(/&gt;/g, '>')
	      .replace(/&amp;/g, '&');
	  }

	  function extractJsonObjectAt(text, startIndex) {
	    let depth = 0;
	    let inString = false;
	    let quote = '';
	    let escaped = false;
	    for (let index = startIndex; index < text.length; index += 1) {
	      const char = text[index];
	      if (inString) {
	        if (escaped) {
	          escaped = false;
	        } else if (char === '\\') {
	          escaped = true;
	        } else if (char === quote) {
	          inString = false;
	          quote = '';
	        }
	        continue;
	      }
	      if (char === '"' || char === "'") {
	        inString = true;
	        quote = char;
	        continue;
	      }
	      if (char === '{') {
	        depth += 1;
	      } else if (char === '}') {
	        depth -= 1;
	        if (depth === 0) {
	          return text.slice(startIndex, index + 1);
	        }
	      }
	    }
	    return '';
	  }

	  function parseViteErrorPayload(htmlText) {
	    const html = String(htmlText || '');
	    const prefixMatch = /const\s+error\s*=/u.exec(html);
	    if (!prefixMatch || prefixMatch.index === undefined) {
	      return null;
	    }
	    const objectStart = html.indexOf('{', prefixMatch.index + prefixMatch[0].length);
	    if (objectStart < 0) {
	      return null;
	    }
	    const jsonText = extractJsonObjectAt(html, objectStart);
	    if (!jsonText) {
	      return null;
	    }
	    try {
	      return JSON.parse(decodeHtmlEntities(jsonText));
	    } catch {
	      return null;
	    }
	  }

	  function createViteTransformErrorMeta(viteError, loaderUrl, entryUrl, status) {
	    const loc = viteError && typeof viteError.loc === 'object' ? viteError.loc : {};
	    const sourceFile = String(loc?.file || viteError?.id || entryUrl || '');
	    return {
	      type: 'vite-transform-error',
	      message: '原型编译失败: ' + String(viteError?.message || 'Vite transform failed'),
	      sourceFile,
	      line: loc?.line ?? '',
	      column: loc?.column ?? '',
	      stack: String(viteError?.stack || ''),
	      loaderFile: loaderUrl,
	      entryFile: entryUrl,
	      vitePlugin: String(viteError?.plugin || ''),
	      frame: String(viteError?.frame || ''),
	      httpStatus: status,
	    };
	  }

	  async function diagnosePreviewLoaderFailure(loaderUrl) {
	    const fetcher = getFetchFunction();
	    const absoluteLoaderUrl = toAbsoluteResourceUrl(loaderUrl);
	    if (!fetcher) {
	      return {
	        type: 'preview-entry-load',
	        message: '原型入口模块加载失败: 无法获取预览加载器诊断信息',
	        sourceFile: absoluteLoaderUrl,
	        loaderFile: absoluteLoaderUrl,
	      };
	    }

	    let loaderResponse;
	    let loaderText = '';
	    try {
	      loaderResponse = await fetcher(absoluteLoaderUrl, { cache: 'no-store' });
	      loaderText = typeof loaderResponse?.text === 'function' ? await loaderResponse.text() : '';
	    } catch (error) {
	      return {
	        type: 'preview-loader-http-error',
	        message: '预览加载器加载失败: ' + absoluteLoaderUrl,
	        sourceFile: absoluteLoaderUrl,
	        loaderFile: absoluteLoaderUrl,
	        stack: String(error?.stack || error || ''),
	      };
	    }

	    const loaderStatus = normalizeResponseStatus(loaderResponse);
	    if (!loaderResponse?.ok) {
	      return {
	        type: 'preview-loader-http-error',
	        message: '预览加载器加载失败: HTTP ' + (loaderStatus || 'error'),
	        sourceFile: absoluteLoaderUrl,
	        loaderFile: absoluteLoaderUrl,
	        httpStatus: loaderStatus,
	      };
	    }

	    const entryUrl = extractPreviewEntryFromLoader(loaderText, absoluteLoaderUrl);
	    let entryResponse;
	    let entryText = '';
	    try {
	      entryResponse = await fetcher(entryUrl, { cache: 'no-store' });
	      entryText = typeof entryResponse?.text === 'function' ? await entryResponse.text() : '';
	    } catch (error) {
	      return {
	        type: 'preview-entry-http-error',
	        message: '原型入口模块加载失败: ' + entryUrl,
	        sourceFile: entryUrl,
	        loaderFile: absoluteLoaderUrl,
	        entryFile: entryUrl,
	        stack: String(error?.stack || error || ''),
	      };
	    }

	    const entryStatus = normalizeResponseStatus(entryResponse);
	    const viteError = parseViteErrorPayload(entryText);
	    if (viteError) {
	      return createViteTransformErrorMeta(viteError, absoluteLoaderUrl, entryUrl, entryStatus);
	    }
	    if (!entryResponse?.ok) {
	      return {
	        type: 'preview-entry-http-error',
	        message: '原型入口模块加载失败: HTTP ' + (entryStatus || 'error'),
	        sourceFile: entryUrl,
	        loaderFile: absoluteLoaderUrl,
	        entryFile: entryUrl,
	        httpStatus: entryStatus,
	      };
	    }

	    return {
	      type: 'preview-module-graph-load',
	      message: '原型模块依赖加载失败: 入口模块可访问，但其依赖加载或执行失败',
	      sourceFile: entryUrl,
	      loaderFile: absoluteLoaderUrl,
	      entryFile: entryUrl,
	    };
	  }

	  function diagnoseAndReportPreviewLoaderFailure(resourceMeta) {
	    diagnosePreviewLoaderFailure(resourceMeta.sourceFile)
	      .then((meta) => {
	        autoReportPrototypeError(meta.message, {
	          ...resourceMeta,
	          ...meta,
	        });
	      })
	      .catch(() => {
	        autoReportPrototypeError(resourceMeta.message, resourceMeta);
	      });
	  }

	  function getCurrentPathname() {
    try {
      return window.location.pathname || new URL(window.location.href).pathname;
    } catch {
      return String(window.location.href || '');
    }
  }

  function getTransientViteRetryToken() {
    try {
      return window.sessionStorage?.getItem(transientViteRetryKey) || '';
    } catch {
      return '';
    }
  }

  function getTransientViteResourceKey(resourceUrl) {
    const normalizedText = String(resourceUrl || '');
    let resourcePath = normalizedText;
    try {
      const parsed = new URL(normalizedText, window.location.href);
      resourcePath = parsed.pathname + parsed.search;
    } catch {
      // Keep the raw URL when parsing fails.
    }
    if (isHtmlProxyResourceIssue(resourceUrl)) {
      return 'html-proxy:' + resourcePath;
    }
    if (resourcePath.includes('__axhub-preview-loader.js')) {
      return 'preview-loader:' + resourcePath;
    }
    if (resourcePath.includes('/@vite/client')) {
      return 'vite-client';
    }
    return resourcePath;
  }

  function createTransientViteRetryToken(resourceUrl) {
    return getCurrentPathname() + '::' + getTransientViteResourceKey(resourceUrl);
  }

  function getActiveTransientViteRetryToken() {
    const rawValue = getTransientViteRetryToken();
    if (!rawValue) {
      return '';
    }
    try {
      const record = JSON.parse(rawValue);
      const token = typeof record?.token === 'string' ? record.token : '';
      const createdAt = Number(record?.createdAt || 0);
      if (token && createdAt > 0 && Date.now() - createdAt <= transientViteRetryWindowMs) {
        return token;
      }
    } catch {
      // Older builds stored only the page pathname. Treat that as stale.
    }
    clearTransientViteRetryToken();
    return '';
  }

  function setTransientViteRetryToken(value) {
    try {
      window.sessionStorage?.setItem(transientViteRetryKey, JSON.stringify({
        token: value,
        createdAt: Date.now(),
      }));
    } catch {
      // ignore storage failures
    }
  }

  function clearTransientViteRetryToken() {
    try {
      window.sessionStorage?.removeItem(transientViteRetryKey);
    } catch {
      // ignore storage failures
    }
  }

  async function fetchReady(resourceUrl) {
    const fetcher = typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) {
      return false;
    }
    try {
      const response = await fetcher(resourceUrl, { cache: 'no-store' });
      return Boolean(response && response.ok);
    } catch {
      return false;
    }
  }

  async function waitForViteClientReady() {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (await fetchReady('/@vite/client')) {
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    }
    return false;
  }

  function tryRecoverTransientViteResource(resourceUrl) {
    if (!isTransientViteResourceIssue(resourceUrl)) {
      return false;
    }

    const retryToken = createTransientViteRetryToken(resourceUrl);
    if (getActiveTransientViteRetryToken() === retryToken) {
      clearTransientViteRetryToken();
      return false;
    }

    if (transientViteRecoveryPromise) {
      return true;
    }

    transientViteRecoveryPromise = waitForViteClientReady()
      .then((isReady) => {
        if (!isReady) {
          clearTransientViteRetryToken();
          return false;
        }
        if (isHtmlProxyResourceIssue(resourceUrl)) {
          return true;
        }
        return fetchReady(resourceUrl);
      })
      .then((isReady) => {
        if (!isReady) {
          clearTransientViteRetryToken();
          return;
        }
        setTransientViteRetryToken(retryToken);
        window.location.reload();
      })
      .catch(() => {
        clearTransientViteRetryToken();
      })
      .finally(() => {
        transientViteRecoveryPromise = null;
      });

    return true;
  }

  function getRuntimeExportCoreUrl() {
    return (hostRuntimeOrigin || runtimeOrigin) + '/assets/runtime-export-core.js?v=' + encodeURIComponent(runtimeVersion);
  }

  function normalizeRuntimeOrigin(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return '';
    }
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return '';
      }
      return url.origin;
    } catch {
      return '';
    }
  }

  function updateHostRuntimeOrigin(data) {
    const nextOrigin = normalizeRuntimeOrigin(data && data.runtimeOrigin);
    if (nextOrigin) {
      hostRuntimeOrigin = nextOrigin;
    }
  }

  function isExportCoreLike(value) {
    return !!value && (
      typeof value.copyDocumentForFigmaNewOfficialClipboard === 'function'
      || typeof value.captureDocumentForFigmaNew === 'function'
      || typeof value.buildOfficialClipboardPayloadFromCapturedDocument === 'function'
      || typeof value.htmlToAxure === 'function'
      || typeof value.captureDocumentScreenshot === 'function'
    );
  }

  function getPreloadedExportCore() {
    if (isExportCoreLike(window.axhubExportCore)) {
      return window.axhubExportCore;
    }
    if (isExportCoreLike(window.AxhubExportCore)) {
      return window.AxhubExportCore;
    }
    return null;
  }

  async function loadExportCore() {
    const preloaded = getPreloadedExportCore();
    if (preloaded) {
      return preloaded;
    }
    if (!exportCorePromise) {
      exportCorePromise = import(getRuntimeExportCoreUrl()).then((mod) => {
        const nextCore = isExportCoreLike(mod) ? mod : null;
        if (!nextCore) {
          throw new Error('make-server export core missing design export functions');
        }
        return nextCore;
      });
    }
    return exportCorePromise;
  }

  function loadAxureExportModule(moduleUrl) {
    if (!axureExportModulePromise) {
      axureExportModulePromise = import(moduleUrl).then((mod) => {
        if (!mod || typeof mod.htmlToAxure !== 'function') {
          throw new Error('Axure export runtime missing htmlToAxure');
        }
        return mod;
      });
    }
    return axureExportModulePromise;
  }

  async function buildFigmaClipboardPayload(exportCore) {
    if (
      typeof exportCore.captureDocumentForFigmaNew !== 'function'
      || typeof exportCore.buildOfficialClipboardPayloadFromCapturedDocument !== 'function'
    ) {
      throw new Error('make-server export core missing Figma payload builders');
    }
    const capturedDoc = await exportCore.captureDocumentForFigmaNew('#root');
    return exportCore.buildOfficialClipboardPayloadFromCapturedDocument(capturedDoc);
  }

  function getElementSelector(element) {
    if (!element || element.nodeType !== 1) return '';
    if (element.id) return '#' + CSS.escape(element.id);
    const stableId = element.getAttribute('data-axhub-id') || element.getAttribute('data-testid');
    if (stableId) return '[' + (element.hasAttribute('data-axhub-id') ? 'data-axhub-id' : 'data-testid') + '="' + CSS.escape(stableId) + '"]';
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 5) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      parts.unshift(siblings.length > 1 ? tag + ':nth-of-type(' + index + ')' : tag);
      current = parent;
    }
    return parts.join(' > ');
  }

  function getElementText(element) {
    if (!element) return '';
    if ('value' in element && typeof element.value === 'string') return element.value;
    return element.textContent || '';
  }

  function setElementText(element, value) {
    if (!element) return;
    if ('value' in element && typeof element.value === 'string') {
      element.value = value;
      return;
    }
    element.textContent = value;
  }

  function isSelectableCandidate(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.closest('[data-axhub-quick-edit-ignore]')) return false;
    if (element.matches('input, textarea, select')) return true;
    if (!selectableTagNames.has(element.tagName)) return false;
    const text = (element.textContent || '').trim();
    if (!text) return false;
    return element.children.length <= 2;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.setAttribute('data-axhub-quick-edit-ignore', '1');
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '2147483646',
      pointerEvents: 'none',
      border: '2px solid #1677ff',
      boxShadow: '0 0 0 2px rgba(22,119,255,0.18)',
      borderRadius: '4px',
      display: 'none',
    });
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function paintSelection(element) {
    const box = ensureOverlay();
    if (!element) {
      box.style.display = 'none';
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }

  function selectElement(element) {
    if (!isSelectableCandidate(element)) return;
    selectedElement = element;
    paintSelection(element);
    const selector = getElementSelector(element);
    const text = getElementText(element);
    if (!patches.has(selector)) {
      patches.set(selector, { selector, before: text, after: text, rect: element.getBoundingClientRect().toJSON?.() });
    }
  }

  function syncPatch(element) {
    if (!element || !isSelectableCandidate(element)) return;
    const selector = getElementSelector(element);
    const previous = patches.get(selector) || { selector, before: getElementText(element), after: getElementText(element) };
    const after = getElementText(element);
    const patch = {
      ...previous,
      after,
      rect: element.getBoundingClientRect().toJSON?.(),
      updatedAt: new Date().toISOString(),
    };
    patches.set(selector, patch);
    post('axhub.quickEdit.patch', { patch });
  }

  function handlePointerMove(event) {
    if (!active) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (isSelectableCandidate(element)) {
      paintSelection(element);
    }
  }

  function handleClick(event) {
    if (!active) return;
    const target = event.target;
    if (!isSelectableCandidate(target)) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
  }

  function enter(nextContext) {
    context = nextContext && typeof nextContext === 'object' ? nextContext : {};
    if (active) return;
    active = true;
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('click', handleClick, true);
    document.documentElement.dataset.axhubQuickEdit = 'active';
    post('axhub.quickEdit.enter', { active: true, capabilities });
  }

  function exit() {
    if (!active) return;
    active = false;
    document.removeEventListener('pointermove', handlePointerMove, true);
    document.removeEventListener('click', handleClick, true);
    selectedElement = null;
    paintSelection(null);
    delete document.documentElement.dataset.axhubQuickEdit;
    post('axhub.quickEdit.exit', { active: false });
  }

  function save() {
    const changedPatches = Array.from(patches.values()).filter((patch) => patch.before !== patch.after);
    post('axhub.quickEdit.save', { patches: changedPatches });
    patches.clear();
  }

  async function copyToFigma(data) {
    const requestId = typeof data.requestId === 'string' ? data.requestId : '';
    const resultPayload = {
      requestId,
      projectId: data.projectId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      clientUrl: data.clientUrl,
    };
    try {
      const exportCore = await loadExportCore();
      const payloadText = await buildFigmaClipboardPayload(exportCore);
      post('axhub.quickEdit.export.copyToFigmaResult', {
        ...resultPayload,
        success: true,
        payloadText,
        payloadSizeKb: Math.round(payloadText.length / 1024),
      });
    } catch (error) {
      post('axhub.quickEdit.export.copyToFigmaResult', {
        ...resultPayload,
        success: false,
        error: String(error),
      });
    }
  }

  async function exportAxureJson(data) {
    const requestId = typeof data.requestId === 'string' ? data.requestId : '';
    const resultPayload = {
      requestId,
      projectId: data.projectId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      clientUrl: data.clientUrl,
    };
    try {
      window.focus?.();
      const exportCore = await loadAxureExportModule(data.axureExportModuleUrl);
      if (!exportCore || typeof exportCore.htmlToAxure !== 'function') {
        throw new Error('Axure export runtime missing htmlToAxure');
      }
      const payloadOptions = data && data.payload && typeof data.payload === 'object' ? data.payload : {};
      const options = { ...payloadOptions, ...data };
      const rootName = typeof options.rootName === 'string' && options.rootName.trim()
        ? options.rootName.trim()
        : document.title || 'Page';
      const payload = await exportCore.htmlToAxure('#root', {
        rootName,
        preserveHierarchy: !!options.preserveHierarchy,
        preserveSvgIcons: options.preserveSvgIcons !== false,
      });
      post('axhub.quickEdit.export.axureJsonResult', {
        ...resultPayload,
        success: true,
        payload,
      });
    } catch (error) {
      post('axhub.quickEdit.export.axureJsonResult', {
        ...resultPayload,
        success: false,
        error: String(error),
      });
    }
  }

  async function captureScreenshot(data) {
    const requestId = typeof data.requestId === 'string' ? data.requestId : '';
    const resultPayload = {
      requestId,
      projectId: data.projectId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      clientUrl: data.clientUrl,
    };
    try {
      window.focus?.();
      const exportCore = await loadExportCore();
      if (!exportCore || typeof exportCore.captureDocumentScreenshot !== 'function') {
        throw new Error('make-server export core missing captureDocumentScreenshot');
      }
      const payloadOptions = data && data.payload && typeof data.payload === 'object' ? data.payload : {};
      const options = { ...payloadOptions, ...data };
      const result = await exportCore.captureDocumentScreenshot('#root', {
        ...(options.scope === 'viewport' || options.scope === 'full-page' ? { scope: options.scope } : {}),
        targetWidth: options.targetWidth,
        targetHeight: options.targetHeight,
        ...(options.targetPixelRatio !== undefined ? { targetPixelRatio: options.targetPixelRatio } : {}),
        ...(options.format !== undefined ? { format: options.format } : {}),
        ...(options.quality !== undefined ? { quality: options.quality } : {}),
        ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
      });
      post('axhub.quickEdit.export.captureScreenshotResult', {
        ...resultPayload,
        success: true,
        dataUrl: result?.dataUrl,
        width: result?.width,
        height: result?.height,
      });
    } catch (error) {
      post('axhub.quickEdit.export.captureScreenshotResult', {
        ...resultPayload,
        success: false,
        error: String(error),
      });
    }
  }

  quickEdit.protocolVersion = protocolVersion;
  quickEdit.runtimeVersion = runtimeVersion;
  quickEdit.capabilities = capabilities.slice();
  quickEdit.enter = enter;
  quickEdit.exit = exit;
  quickEdit.save = save;
  quickEdit.patch = (selector, value) => {
    const element = selector ? document.querySelector(selector) : selectedElement;
    if (!element) {
      postError('无法找到要修改的元素', { selector });
      return false;
    }
    const before = getElementText(element);
    setElementText(element, String(value ?? ''));
    syncPatch(element);
    patches.set(selector || getElementSelector(element), {
      selector: selector || getElementSelector(element),
      before,
      after: getElementText(element),
      updatedAt: new Date().toISOString(),
    });
    return true;
  };
  quickEdit.copyToFigma = () => copyToFigma({
    requestId: 'manual-' + Date.now().toString(36),
  });
  quickEdit.postReady = () => {
    post('axhub.quickEdit.runtimeReady', { capabilities });
  };
  prototypeRuntime.reportError = reportPrototypeError;

  function handleWindowError(event) {
    const resourceMeta = getResourceLoadMeta(event.target);
    if (resourceMeta) {
      if (resourceMeta.tagName === 'SCRIPT' && tryRecoverTransientViteResource(resourceMeta.sourceFile)) {
        return;
      }
      if (resourceMeta.tagName === 'SCRIPT' && isPreviewLoaderResourceIssue(resourceMeta.sourceFile)) {
        diagnoseAndReportPreviewLoaderFailure(resourceMeta);
        return;
      }
      autoReportPrototypeError(event.error || resourceMeta.message, resourceMeta);
      return;
    }
    autoReportPrototypeError(event.error || event.message, {
      type: 'window-error',
      message: event.message,
      sourceFile: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  }

  function handleUnhandledRejection(event) {
    autoReportPrototypeError(event.reason || 'Unhandled promise rejection', {
      type: 'unhandledrejection',
    });
  }

  function replayEarlyRuntimeErrors() {
    const captureState = window.__AXHUB_EARLY_RUNTIME_ERROR_CAPTURE__;
    if (!captureState || !Array.isArray(captureState.queue)) {
      return;
    }
    const queuedEvents = captureState.queue.splice(0);
    try {
      captureState.stop?.();
    } catch {
      // Continue replaying captured failures even if early-listener cleanup fails.
    }
    for (const event of queuedEvents) {
      if (event?.eventType === 'unhandledrejection') {
        handleUnhandledRejection(event);
      } else {
        handleWindowError(event || {});
      }
    }
  }

  window.addEventListener('error', handleWindowError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
  replayEarlyRuntimeErrors();

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'axhub.quickEdit.requestRuntimeReady') {
      updateHostRuntimeOrigin(data);
      quickEdit.postReady();
      return;
    }
    if (data.type === 'axhub.quickEdit.enter') {
      updateHostRuntimeOrigin(data);
      enter(data);
      return;
    }
    if (data.type === 'axhub.quickEdit.save') {
      updateHostRuntimeOrigin(data);
      save();
      return;
    }
    if (data.type === 'axhub.quickEdit.exit') {
      updateHostRuntimeOrigin(data);
      exit();
      return;
    }
    if (data.type === 'axhub.quickEdit.export.copyToFigma') {
      updateHostRuntimeOrigin(data);
      void copyToFigma(data);
      return;
    }
    if (data.type === 'axhub.quickEdit.export.captureScreenshot') {
      updateHostRuntimeOrigin(data);
      void captureScreenshot(data);
      return;
    }
    if (data.type === 'axhub.quickEdit.export.axureJson') {
      void exportAxureJson(data);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', quickEdit.postReady, { once: true });
  }
  window.setTimeout(quickEdit.postReady, 0);
})();`;

export function handleQuickEditRuntimeApi(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  if (pathname !== '/runtime/quick-edit.js') {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    sendText(res, 'Method Not Allowed', 'text/plain; charset=utf-8', 405);
    return true;
  }

  sendText(res, QUICK_EDIT_RUNTIME_SCRIPT, 'application/javascript; charset=utf-8');
  return true;
}
