import type { Options as HtmlToImageOptions } from 'html-to-image/lib/types';
import {
  WEB_EDITOR_V2_COLORS,
  WEB_EDITOR_V2_SELECTION_LINE_WIDTH,
} from '../../constants';

const SCREENSHOT_IMAGE_PROXY_PATH = '/api/export/image-proxy';
const SCREENSHOT_SETTLE_DELAY_MS = 80;

function roundDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function sanitizeFileName(value: string): string {
  const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized || 'element';
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForPaint(frames = 2): Promise<void> {
  const total = Math.max(1, Math.floor(frames));
  for (let index = 0; index < total; index += 1) {
    await waitForAnimationFrame();
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
    return `${window.location.origin}${SCREENSHOT_IMAGE_PROXY_PATH}?url=${encodeURIComponent(absoluteUrl)}`;
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

function resolveAbsoluteUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl, document.baseURI).href;
  } catch {
    return null;
  }
}

function isTransparentColor(value: string): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'transparent') return true;
  if (normalized === 'rgba(0, 0, 0, 0)' || normalized === 'rgba(0,0,0,0)') return true;
  if (normalized === 'hsla(0, 0%, 0%, 0)' || normalized === 'hsla(0,0%,0%,0)') return true;

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length === 4) {
      return hex[3] === '0';
    }
    if (hex.length === 8) {
      return hex.slice(6) === '00';
    }
    return false;
  }

  const alphaMatch = normalized.match(/^[a-z]+\((.+)\)$/);
  if (!alphaMatch) return false;

  const parts = alphaMatch[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 4) return false;

  const alphaValue = Number.parseFloat(parts[3].replace('%', ''));
  if (!Number.isFinite(alphaValue)) return false;
  return parts[3].includes('%') ? alphaValue <= 0 : alphaValue <= 0;
}

function resolveScreenshotBackgroundColor(element: Element): string | undefined {
  let current: Element | null = element;
  while (current) {
    const computed = window.getComputedStyle(current);
    if (!isTransparentColor(computed.backgroundColor)) {
      return computed.backgroundColor;
    }
    current = current.parentElement;
  }
  return undefined;
}

function collectRenderDimensions(element: Element): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  let width = rect.width;
  let height = rect.height;

  if (element instanceof HTMLElement) {
    width = Math.max(width, element.scrollWidth, element.clientWidth, element.offsetWidth);
    height = Math.max(height, element.scrollHeight, element.clientHeight, element.offsetHeight);
  }

  return {
    width: roundDimension(width),
    height: roundDimension(height),
  };
}

function rewriteElementImageUrlsForScreenshot(rootElement: Element): () => void {
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

function waitForImageDecode(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') {
    return image.decode().catch(() => undefined);
  }
  return Promise.resolve();
}

async function waitForElementImages(rootElement: Element): Promise<void> {
  const images = [rootElement, ...Array.from(rootElement.querySelectorAll('img'))]
    .filter((node): node is HTMLImageElement => node instanceof HTMLImageElement);

  await Promise.all(
    images.map(async (image) => {
      if (image.complete) {
        if (image.naturalWidth > 0) {
          await waitForImageDecode(image);
        }
        return;
      }

      await new Promise<void>((resolve) => {
        const cleanup = () => {
          image.removeEventListener('load', handleDone);
          image.removeEventListener('error', handleDone);
        };
        const handleDone = () => {
          cleanup();
          resolve();
        };

        image.addEventListener('load', handleDone, { once: true });
        image.addEventListener('error', handleDone, { once: true });
      });
      await waitForImageDecode(image);
    }),
  );
}

async function preloadImageUrl(url: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
    };

    const handleDone = () => {
      cleanup();
      resolve();
    };

    image.onload = handleDone;
    image.onerror = handleDone;
    image.src = url;

    if (image.complete) {
      handleDone();
    }
  });
}

async function preloadBackgroundImages(rootElement: Element): Promise<void> {
  const uniqueUrls = new Set<string>();
  const elements = [rootElement, ...Array.from(rootElement.querySelectorAll('*'))];

  elements.forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    const backgroundImage = window.getComputedStyle(node).backgroundImage;
    extractBackgroundUrls(backgroundImage).forEach((rawUrl) => {
      const finalUrl =
        buildScreenshotProxyUrl(rawUrl) ??
        resolveAbsoluteUrl(rawUrl);
      if (finalUrl) {
        uniqueUrls.add(finalUrl);
      }
    });
  });

  await Promise.all(Array.from(uniqueUrls).map((url) => preloadImageUrl(url)));
}

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }

  try {
    await document.fonts.ready;
  } catch {
    // noop
  }
}

async function prepareElementForScreenshot(rootElement: Element): Promise<void> {
  await Promise.all([
    waitForFonts(),
    waitForElementImages(rootElement),
    preloadBackgroundImages(rootElement),
  ]);
  await waitForPaint(2);
  await new Promise((resolve) => window.setTimeout(resolve, SCREENSHOT_SETTLE_DELAY_MS));
}

export interface EditorElementScreenshot {
  name: string;
  data: string;
  width: number;
  height: number;
}

export interface TargetScreenshotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TargetScreenshotBounds {
  captureRect: TargetScreenshotRect;
  targetRect: TargetScreenshotRect;
}

export interface TargetContextScreenshotOptions {
  isEditorUi?: (node: unknown) => boolean;
  render?: (
    node: HTMLElement,
    options: HtmlToImageOptions,
  ) => Promise<HTMLCanvasElement>;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function calculateTargetScreenshotBounds(
  targetRect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
): TargetScreenshotBounds | null {
  if (
    !isFinitePositive(targetRect.width)
    || !isFinitePositive(targetRect.height)
    || !isFinitePositive(viewportWidth)
    || !isFinitePositive(viewportHeight)
  ) {
    return null;
  }

  const visibleLeft = Math.max(0, targetRect.left);
  const visibleTop = Math.max(0, targetRect.top);
  const visibleRight = Math.min(viewportWidth, targetRect.right);
  const visibleBottom = Math.min(viewportHeight, targetRect.bottom);
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return null;

  const padding = Math.max(32, Math.min(targetRect.width, targetRect.height) * 0.08);
  const captureLeft = Math.max(0, targetRect.left - padding);
  const captureTop = Math.max(0, targetRect.top - padding);
  const captureRight = Math.min(viewportWidth, targetRect.right + padding);
  const captureBottom = Math.min(viewportHeight, targetRect.bottom + padding);

  return {
    captureRect: {
      left: captureLeft,
      top: captureTop,
      width: captureRight - captureLeft,
      height: captureBottom - captureTop,
    },
    targetRect: {
      left: visibleLeft - captureLeft,
      top: visibleTop - captureTop,
      width: visibleRight - visibleLeft,
      height: visibleBottom - visibleTop,
    },
  };
}

export async function captureTargetContextScreenshot(
  element: Element,
  options: TargetContextScreenshotOptions = {},
): Promise<EditorElementScreenshot> {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
    throw new Error('当前元素不支持截图。');
  }

  const rootElement = document.documentElement;
  if (!(rootElement instanceof HTMLElement)) {
    throw new Error('当前页面不支持截图。');
  }

  const bounds = calculateTargetScreenshotBounds(
    element.getBoundingClientRect(),
    window.innerWidth,
    window.innerHeight,
  );
  if (!bounds) {
    throw new Error('当前元素不在可截图区域内。');
  }

  const width = roundDimension(bounds.captureRect.width);
  const height = roundDimension(bounds.captureRect.height);
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 2));
  const backgroundColor = resolveScreenshotBackgroundColor(element);
  const restoreImageUrls = rewriteElementImageUrlsForScreenshot(rootElement);
  const render = options.render ?? (async (node, renderOptions) => {
    const htmlToImage = await import('html-to-image');
    return htmlToImage.toCanvas(node, renderOptions);
  });

  try {
    await prepareElementForScreenshot(rootElement);

    const canvas = await render(rootElement, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio,
      skipAutoScale: true,
      backgroundColor,
      skipFonts: false,
      cacheBust: false,
      includeQueryParams: true,
      filter: (node) => !options.isEditorUi?.(node),
      style: {
        width: `${Math.max(rootElement.scrollWidth, window.innerWidth)}px`,
        height: `${Math.max(rootElement.scrollHeight, window.innerHeight)}px`,
        transform: `translate(-${window.scrollX + bounds.captureRect.left}px, -${window.scrollY + bounds.captureRect.top}px)`,
        transformOrigin: 'top left',
        margin: '0',
      },
    });

    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法绘制目标元素选中框。');

    const lineWidth = WEB_EDITOR_V2_SELECTION_LINE_WIDTH;
    const inset = lineWidth / 2;
    context.save();
    context.scale(pixelRatio, pixelRatio);
    context.beginPath();
    context.strokeStyle = WEB_EDITOR_V2_COLORS.selected;
    context.lineWidth = lineWidth;
    context.setLineDash([]);
    context.strokeRect(
      bounds.targetRect.left + inset,
      bounds.targetRect.top + inset,
      Math.max(0, bounds.targetRect.width - lineWidth),
      Math.max(0, bounds.targetRect.height - lineWidth),
    );
    context.restore();

    return {
      name: 'target-screenshot.png',
      data: canvas.toDataURL('image/png'),
      width,
      height,
    };
  } finally {
    restoreImageUrls();
  }
}

export async function captureElementScreenshot(
  element: Element,
  fileNameHint: string,
): Promise<EditorElementScreenshot> {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
    throw new Error('当前元素不支持截图。');
  }

  const htmlToImage = await import('html-to-image');
  const { width, height } = collectRenderDimensions(element);
  const backgroundColor = resolveScreenshotBackgroundColor(element);
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 2));
  const restoreImageUrls = rewriteElementImageUrlsForScreenshot(element);
  const computedStyle = window.getComputedStyle(element);
  const captureStyle: Partial<CSSStyleDeclaration> = {
    boxSizing: computedStyle.boxSizing || 'border-box',
  };

  try {
    await prepareElementForScreenshot(element);

    const data = await htmlToImage.toPng(element as HTMLElement, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio,
      skipAutoScale: true,
      backgroundColor,
      skipFonts: false,
      cacheBust: false,
      includeQueryParams: true,
      style: captureStyle,
    });

    return {
      name: `${sanitizeFileName(fileNameHint)}.png`,
      data,
      width,
      height,
    };
  } finally {
    restoreImageUrls();
  }
}
