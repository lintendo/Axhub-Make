import {
  buildOfficialClipboardPayloadFromCapturedDocument as buildOfficialClipboardPayloadFromCapturedDocumentImpl,
  captureDocumentForFigmaNew as captureDocumentForFigmaNewImpl,
  copyDocumentForFigmaNewOfficialClipboard as copyDocumentForFigmaNewOfficialClipboardImpl,
  htmlToAxure as htmlToAxureImpl,
  type CapturedDocument,
} from 'axhub-export-core';
import { snapdom, type SnapdomOptions } from '@zumer/snapdom';

const SCREENSHOT_IMAGE_PROXY_PATH = '/api/export/image-proxy';
const SCREENSHOT_IMAGE_PLACEHOLDER_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>',
)}`;
const SCREENSHOT_SCROLLBAR_HIDING_STYLE_ID = 'axhub-runtime-export-hide-scrollbars';
const SCREENSHOT_SCROLLBAR_HIDING_CSS = `
html,
body,
#root,
* {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
#root::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
`;

export interface CaptureDocumentScreenshotOptions {
  scope?: 'viewport' | 'full-page';
  targetWidth?: number;
  targetHeight?: number;
  targetPixelRatio?: number;
  format?: 'png' | 'jpeg' | 'jpg';
  quality?: number;
  maxBytes?: number;
}

export interface CaptureDocumentScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

type SnapdomToPng = (element: Element, options?: SnapdomOptions) => Promise<HTMLImageElement>;
type SnapdomToJpg = (element: Element, options?: SnapdomOptions) => Promise<HTMLImageElement>;
type RuntimeExportCoreTestGlobal = typeof globalThis & {
  __AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_PNG__?: SnapdomToPng | null;
  __AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_JPG__?: SnapdomToJpg | null;
};

function getExportCoreOrigin(): string {
  try {
    return new URL(import.meta.url, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function buildScreenshotProxyUrl(rawUrl: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return null;
  }

  try {
    const absoluteUrl = new URL(rawUrl, document.baseURI).href;
    const parsedUrl = new URL(absoluteUrl);
    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      return null;
    }
    if (parsedUrl.origin === window.location.origin) {
      return null;
    }
    return `${getExportCoreOrigin()}${SCREENSHOT_IMAGE_PROXY_PATH}?url=${encodeURIComponent(absoluteUrl)}`;
  } catch {
    return null;
  }
}

function extractBackgroundUrls(backgroundImage: string): string[] {
  const result: string[] = [];
  if (!backgroundImage || backgroundImage === 'none') {
    return result;
  }

  const regex = /url\((['"]?)(.*?)\1\)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(backgroundImage)) !== null) {
    const url = String(match[2] || '').trim();
    if (url) {
      result.push(url);
    }
  }
  return result;
}

function rewriteElementImageUrlsForScreenshot(rootElement: HTMLElement): () => void {
  const restorers: Array<() => void> = [];
  const elements = [rootElement, ...Array.from(rootElement.querySelectorAll('*'))];

  elements.forEach((node) => {
    if (node instanceof HTMLImageElement) {
      const originalSrc = node.getAttribute('src');
      const displayedSrc = node.currentSrc || originalSrc;
      const proxySrc = displayedSrc ? buildScreenshotProxyUrl(displayedSrc) : null;
      if (!displayedSrc || !proxySrc) {
        return;
      }

      const originalSrcset = node.getAttribute('srcset');
      const originalSizes = node.getAttribute('sizes');
      node.setAttribute('src', proxySrc);
      node.removeAttribute('srcset');
      node.removeAttribute('sizes');

      restorers.push(() => {
        if (originalSrc !== null) {
          node.setAttribute('src', originalSrc);
        } else {
          node.removeAttribute('src');
        }
        if (originalSrcset !== null) {
          node.setAttribute('srcset', originalSrcset);
        } else {
          node.removeAttribute('srcset');
        }
        if (originalSizes !== null) {
          node.setAttribute('sizes', originalSizes);
        } else {
          node.removeAttribute('sizes');
        }
      });
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const inlineBackgroundImage = node.style.backgroundImage;
    const computedBackgroundImage = window.getComputedStyle(node).backgroundImage;
    const sourceBackgroundImage = inlineBackgroundImage || computedBackgroundImage;
    const backgroundUrls = extractBackgroundUrls(sourceBackgroundImage);
    if (backgroundUrls.length === 0) {
      return;
    }

    let nextBackgroundImage = sourceBackgroundImage;
    let changed = false;
    backgroundUrls.forEach((backgroundUrl) => {
      const proxyUrl = buildScreenshotProxyUrl(backgroundUrl);
      if (!proxyUrl) {
        return;
      }

      const replacement = `url("${proxyUrl}")`;
      nextBackgroundImage = nextBackgroundImage
        .replace(`url(${backgroundUrl})`, replacement)
        .replace(`url('${backgroundUrl}')`, replacement)
        .replace(`url("${backgroundUrl}")`, replacement);
      changed = true;
    });

    if (!changed || nextBackgroundImage === sourceBackgroundImage) {
      return;
    }

    const previousInlineValue = node.style.backgroundImage;
    node.style.setProperty('background-image', nextBackgroundImage, 'important');
    restorers.push(() => {
      if (previousInlineValue) {
        node.style.backgroundImage = previousInlineValue;
      } else {
        node.style.removeProperty('background-image');
      }
    });
  });

  return () => {
    for (let index = restorers.length - 1; index >= 0; index -= 1) {
      restorers[index]();
    }
  };
}

function resolveScreenshotElement(selector: string | Element): HTMLElement {
  const element = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;
  if (!(element instanceof HTMLElement)) {
    throw new Error('captureDocumentScreenshot: target element not found');
  }
  return element;
}

function positiveNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.round(numberValue)
    : undefined;
}

function positivePixelRatio(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.max(1, Math.min(2, numberValue))
    : undefined;
}

function collectScreenshotSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(Math.max(rect.width, element.scrollWidth, element.clientWidth, element.offsetWidth))),
    height: Math.max(1, Math.round(Math.max(rect.height, element.scrollHeight, element.clientHeight, element.offsetHeight))),
  };
}

type ScreenshotRootStyleSnapshot = {
  marginLeft: string;
  marginRight: string;
  marginTop: string;
  marginBottom: string;
  width: string;
  height: string;
  minHeight: string;
  overflow: string;
  display: string;
  alignItems: string;
  justifyContent: string;
  placeItems: string;
};

type ScreenshotPageStyleSnapshot = {
  width: string;
  height: string;
  minHeight: string;
  margin: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  padding: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  overflow: string;
  display: string;
  alignItems: string;
  justifyContent: string;
  placeItems: string;
};

type ScreenshotElementScrollSnapshot = {
  element: HTMLElement;
  scrollLeft: number;
  scrollTop: number;
};

function setElementScrollPosition(element: HTMLElement, left: number, top: number): void {
  try {
    element.scrollLeft = left;
  } catch { /* ignore readonly scroll containers */ }
  try {
    element.scrollTop = top;
  } catch { /* ignore readonly scroll containers */ }
}

function getScreenshotScrollElements(rootElement: HTMLElement): HTMLElement[] {
  const candidates = [
    document.documentElement instanceof HTMLElement ? document.documentElement : null,
    document.body instanceof HTMLElement ? document.body : null,
    rootElement,
  ];
  return candidates.filter((element, index): element is HTMLElement => (
    element instanceof HTMLElement && candidates.indexOf(element) === index
  ));
}

function installScreenshotScrollOrigin(rootElement: HTMLElement): () => void {
  const windowScrollLeft = Number(window.scrollX ?? window.pageXOffset ?? 0) || 0;
  const windowScrollTop = Number(window.scrollY ?? window.pageYOffset ?? 0) || 0;
  const elementSnapshots: ScreenshotElementScrollSnapshot[] = getScreenshotScrollElements(rootElement).map(element => ({
    element,
    scrollLeft: Number(element.scrollLeft || 0),
    scrollTop: Number(element.scrollTop || 0),
  }));

  try {
    window.scrollTo?.(0, 0);
  } catch { /* ignore unsupported test/browser scroll APIs */ }
  elementSnapshots.forEach(({ element }) => setElementScrollPosition(element, 0, 0));

  return () => {
    try {
      window.scrollTo?.(windowScrollLeft, windowScrollTop);
    } catch { /* ignore unsupported test/browser scroll APIs */ }
    elementSnapshots.forEach(({ element, scrollLeft, scrollTop }) => {
      setElementScrollPosition(element, scrollLeft, scrollTop);
    });
  };
}

function snapshotPageStyle(element: HTMLElement): ScreenshotPageStyleSnapshot {
  return {
    width: element.style.width,
    height: element.style.height,
    minHeight: element.style.minHeight,
    margin: element.style.margin,
    marginTop: element.style.marginTop,
    marginRight: element.style.marginRight,
    marginBottom: element.style.marginBottom,
    marginLeft: element.style.marginLeft,
    padding: element.style.padding,
    paddingTop: element.style.paddingTop,
    paddingRight: element.style.paddingRight,
    paddingBottom: element.style.paddingBottom,
    paddingLeft: element.style.paddingLeft,
    overflow: element.style.overflow,
    display: element.style.display,
    alignItems: element.style.alignItems,
    justifyContent: element.style.justifyContent,
    placeItems: element.style.placeItems,
  };
}

function restorePageStyle(element: HTMLElement, snapshot: ScreenshotPageStyleSnapshot): void {
  element.style.width = snapshot.width;
  element.style.height = snapshot.height;
  element.style.minHeight = snapshot.minHeight;
  element.style.margin = snapshot.margin;
  element.style.marginTop = snapshot.marginTop;
  element.style.marginRight = snapshot.marginRight;
  element.style.marginBottom = snapshot.marginBottom;
  element.style.marginLeft = snapshot.marginLeft;
  element.style.padding = snapshot.padding;
  element.style.paddingTop = snapshot.paddingTop;
  element.style.paddingRight = snapshot.paddingRight;
  element.style.paddingBottom = snapshot.paddingBottom;
  element.style.paddingLeft = snapshot.paddingLeft;
  element.style.overflow = snapshot.overflow;
  element.style.display = snapshot.display;
  element.style.alignItems = snapshot.alignItems;
  element.style.justifyContent = snapshot.justifyContent;
  element.style.placeItems = snapshot.placeItems;
}

function applyScreenshotBoxSize(
  rootElement: HTMLElement,
  documentElement: HTMLElement | null,
  body: HTMLElement | null,
  options: {
    width?: number;
    height?: number;
  },
): void {
  const width = options.width ? `${options.width}px` : undefined;
  const height = options.height ? `${options.height}px` : undefined;

  if (width) {
    rootElement.style.width = width;
  }
  if (height) {
    rootElement.style.height = height;
    rootElement.style.minHeight = height;
    rootElement.style.overflow = 'hidden';
  }

  if (documentElement) {
    if (width) {
      documentElement.style.width = width;
    }
    if (height) {
      documentElement.style.height = height;
      documentElement.style.minHeight = height;
      documentElement.style.overflow = 'hidden';
    }
  }

  if (body) {
    if (width) {
      body.style.width = width;
    }
    if (height) {
      body.style.height = height;
      body.style.minHeight = height;
      body.style.overflow = 'hidden';
    }
  }
}

function installScreenshotLayoutOverride(
  rootElement: HTMLElement,
  options: {
    targetWidth?: number;
    targetHeight?: number;
  },
): () => void {
  const documentElement = document.documentElement instanceof HTMLElement ? document.documentElement : null;
  const body = document.body instanceof HTMLElement ? document.body : null;
  const rootSnapshot: ScreenshotRootStyleSnapshot = {
    marginLeft: rootElement.style.marginLeft,
    marginRight: rootElement.style.marginRight,
    marginTop: rootElement.style.marginTop,
    marginBottom: rootElement.style.marginBottom,
    width: rootElement.style.width,
    height: rootElement.style.height,
    minHeight: rootElement.style.minHeight,
    overflow: rootElement.style.overflow,
    display: rootElement.style.display,
    alignItems: rootElement.style.alignItems,
    justifyContent: rootElement.style.justifyContent,
    placeItems: rootElement.style.placeItems,
  };
  const documentSnapshot = documentElement ? snapshotPageStyle(documentElement) : null;
  const bodySnapshot = body ? snapshotPageStyle(body) : null;

  rootElement.style.marginLeft = '0';
  rootElement.style.marginRight = '0';
  rootElement.style.marginTop = '0';
  rootElement.style.marginBottom = '0';
  rootElement.style.alignItems = 'initial';
  rootElement.style.justifyContent = 'initial';
  rootElement.style.placeItems = 'initial';

  if (documentElement) {
    documentElement.style.margin = '0';
    documentElement.style.marginTop = '0';
    documentElement.style.marginRight = '0';
    documentElement.style.marginBottom = '0';
    documentElement.style.marginLeft = '0';
    documentElement.style.padding = '0';
    documentElement.style.paddingTop = '0';
    documentElement.style.paddingRight = '0';
    documentElement.style.paddingBottom = '0';
    documentElement.style.paddingLeft = '0';
  }

  if (body) {
    body.style.margin = '0';
    body.style.marginTop = '0';
    body.style.marginRight = '0';
    body.style.marginBottom = '0';
    body.style.marginLeft = '0';
    body.style.padding = '0';
    body.style.paddingTop = '0';
    body.style.paddingRight = '0';
    body.style.paddingBottom = '0';
    body.style.paddingLeft = '0';
    body.style.display = 'block';
    body.style.alignItems = 'initial';
    body.style.justifyContent = 'initial';
    body.style.placeItems = 'initial';
  }

  applyScreenshotBoxSize(rootElement, documentElement, body, {
    width: options.targetWidth,
    height: options.targetHeight,
  });

  return () => {
    rootElement.style.marginLeft = rootSnapshot.marginLeft;
    rootElement.style.marginRight = rootSnapshot.marginRight;
    rootElement.style.marginTop = rootSnapshot.marginTop;
    rootElement.style.marginBottom = rootSnapshot.marginBottom;
    rootElement.style.width = rootSnapshot.width;
    rootElement.style.height = rootSnapshot.height;
    rootElement.style.minHeight = rootSnapshot.minHeight;
    rootElement.style.overflow = rootSnapshot.overflow;
    rootElement.style.display = rootSnapshot.display;
    rootElement.style.alignItems = rootSnapshot.alignItems;
    rootElement.style.justifyContent = rootSnapshot.justifyContent;
    rootElement.style.placeItems = rootSnapshot.placeItems;
    if (documentElement && documentSnapshot) {
      restorePageStyle(documentElement, documentSnapshot);
    }
    if (body && bodySnapshot) {
      restorePageStyle(body, bodySnapshot);
    }
  };
}

function waitForScreenshotFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 16);
  });
}

async function settleScreenshotLayout(): Promise<void> {
  window.dispatchEvent?.(new Event('resize'));
  await waitForScreenshotFrame();
  await waitForScreenshotFrame();
  await new Promise(resolve => window.setTimeout(resolve, 80));
}

function installScreenshotScrollbarHidingStyle(): () => void {
  if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') {
    return () => undefined;
  }
  if (document.getElementById?.(SCREENSHOT_SCROLLBAR_HIDING_STYLE_ID)) {
    return () => undefined;
  }

  const style = document.createElement('style');
  style.id = SCREENSHOT_SCROLLBAR_HIDING_STYLE_ID;
  style.textContent = SCREENSHOT_SCROLLBAR_HIDING_CSS;
  document.head.appendChild(style);
  return () => style.remove();
}

function getSnapdomDataUrl(image: HTMLImageElement, format: 'png' | 'jpeg'): string {
  const dataUrl = image.src || image.getAttribute('src') || '';
  if (!dataUrl) {
    throw new Error('snapdom returned an empty screenshot');
  }
  const acceptedPrefixes = format === 'jpeg'
    ? ['data:image/jpeg', 'data:image/jpg']
    : ['data:image/png'];
  if (!acceptedPrefixes.some((prefix) => dataUrl.startsWith(prefix))) {
    throw new Error(`snapdom returned a non-${format.toUpperCase()} screenshot`);
  }
  return dataUrl;
}

function getDataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return 0;
  const metadata = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  if (!metadata.includes(';base64')) {
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function normalizedQuality(value: unknown): number {
  const quality = Number(value);
  return Number.isFinite(quality) ? Math.max(0.1, Math.min(1, quality)) : 0.8;
}

function positiveByteLimit(value: unknown): number | undefined {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : undefined;
}

async function captureElementWithSnapdom(
  element: HTMLElement,
  options: {
    width: number;
    height: number;
    pixelRatio: number;
    format: 'png' | 'jpeg';
    quality: number;
    maxBytes?: number;
  },
): Promise<string> {
  const testGlobal = globalThis as RuntimeExportCoreTestGlobal;
  const testSnapdomToPng = testGlobal.__AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_PNG__;
  const snapdomToPng = testSnapdomToPng ?? snapdom.toPng;
  const baseOptions: SnapdomOptions = {
    width: options.width,
    height: options.height,
    dpr: options.pixelRatio,
    fast: true,
    backgroundColor: '#fff',
    embedFonts: true,
    fallbackURL: SCREENSHOT_IMAGE_PLACEHOLDER_DATA_URL,
    cache: 'soft',
    placeholders: false,
    outerTransforms: false,
    outerShadows: false,
  };

  if (options.format === 'png') {
    const image = await snapdomToPng(element, baseOptions);
    return getSnapdomDataUrl(image, 'png');
  }

  const testSnapdomToJpg = testGlobal.__AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_JPG__;
  const snapdomToJpg = testSnapdomToJpg ?? snapdom.toJpg;
  let quality = options.quality;
  let pixelRatio = options.pixelRatio;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const image = await snapdomToJpg(element, {
      ...baseOptions,
      dpr: pixelRatio,
      format: 'jpeg',
      quality,
    });
    const dataUrl = getSnapdomDataUrl(image, 'jpeg');
    const byteLength = getDataUrlByteLength(dataUrl);
    if (!options.maxBytes || byteLength <= options.maxBytes) {
      return dataUrl;
    }

    const sizeRatio = options.maxBytes / byteLength;
    if (quality > 0.35) {
      quality = Math.max(0.35, Math.min(quality - 0.05, quality * sizeRatio * 0.95));
    } else {
      pixelRatio = Math.max(0.1, pixelRatio * Math.min(0.9, Math.sqrt(sizeRatio) * 0.95));
    }
  }

  throw new Error(`snapdom could not compress screenshot below ${options.maxBytes} bytes`);
}

export function copyDocumentForFigmaNewOfficialClipboard(selector: string | Element = 'body') {
  return copyDocumentForFigmaNewOfficialClipboardImpl(selector);
}

export function captureDocumentForFigmaNew(selector: string | Element = 'body') {
  return captureDocumentForFigmaNewImpl(selector);
}

export function buildOfficialClipboardPayloadFromCapturedDocument(capturedDoc: CapturedDocument) {
  return buildOfficialClipboardPayloadFromCapturedDocumentImpl(capturedDoc);
}

export function htmlToAxure(selector: string | Element = 'body', options?: any) {
  return htmlToAxureImpl(selector, options);
}

export async function captureDocumentScreenshot(
  selector: string | Element = 'body',
  options: CaptureDocumentScreenshotOptions = {},
): Promise<CaptureDocumentScreenshotResult> {
  const element = resolveScreenshotElement(selector);
  const targetWidth = positiveNumber(options.targetWidth);
  const targetHeight = positiveNumber(options.targetHeight);
  const targetPixelRatio = positivePixelRatio(options.targetPixelRatio);
  const format = options.format === 'jpeg' || options.format === 'jpg' ? 'jpeg' : 'png';
  const quality = normalizedQuality(options.quality);
  const maxBytes = positiveByteLimit(options.maxBytes);
  const captureViewport = options.scope === 'viewport';
  const restoreScreenshotLayout = installScreenshotLayoutOverride(element, {
    targetWidth,
    targetHeight,
  });
  const restoreScrollOrigin = captureViewport ? () => undefined : installScreenshotScrollOrigin(element);
  if (targetWidth || targetHeight) {
    await settleScreenshotLayout();
  }

  const restoreScrollbarHidingStyle = installScreenshotScrollbarHidingStyle();
  const restoreImageUrls = rewriteElementImageUrlsForScreenshot(element);
  try {
    await settleScreenshotLayout();
    const measuredSize = collectScreenshotSize(element);
    const width = captureViewport ? targetWidth ?? Math.max(1, window.innerWidth) : measuredSize.width;
    const height = captureViewport ? targetHeight ?? Math.max(1, window.innerHeight) : measuredSize.height;
    applyScreenshotBoxSize(element, document.documentElement instanceof HTMLElement ? document.documentElement : null, document.body instanceof HTMLElement ? document.body : null, {
      width,
      height,
    });
    await settleScreenshotLayout();
    const pixelRatio = targetPixelRatio ?? Math.max(1, Math.min(2, window.devicePixelRatio || 2));
    const dataUrl = await captureElementWithSnapdom(element, {
      width,
      height,
      pixelRatio,
      format,
      quality,
      maxBytes,
    });

    return { dataUrl, width, height };
  } finally {
    restoreImageUrls();
    restoreScrollbarHidingStyle();
    restoreScreenshotLayout();
    restoreScrollOrigin();
  }
}
