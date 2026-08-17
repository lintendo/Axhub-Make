import type { SnapdomOptions } from '@zumer/snapdom';

export interface CaptureSameOriginIframeScreenshotParams {
    iframe: HTMLIFrameElement;
    width: number;
    height: number;
    captureFullContent?: boolean;
}

export interface CaptureSameOriginIframeScreenshotResult {
    dataUrl: string;
    width: number;
    height: number;
}

type SnapdomToPng = (element: Element, options?: SnapdomOptions) => Promise<HTMLImageElement>;
type ParentScreenshotTestGlobal = typeof globalThis & {
    __AXHUB_PARENT_SCREENSHOT_TEST_SNAPDOM_TO_PNG__?: SnapdomToPng | null;
};
type CaptureLayoutStyleSnapshot = {
    width: string;
    height: string;
    minHeight: string;
    overflow: string;
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
    display: string;
    alignItems: string;
    justifyContent: string;
    placeItems: string;
};
type CaptureScrollSnapshot = {
    element: HTMLElement;
    scrollLeft: number;
    scrollTop: number;
};

const PARENT_SCREENSHOT_SETTLE_DELAY_MS = 80;
const BLANK_SCREENSHOT_SAMPLE_SIZE = 24;

function normalizeCaptureSize(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1;
}

function getSameOriginIframeDocument(iframe: HTMLIFrameElement): Document {
    try {
        const doc = iframe.contentDocument;
        if (!doc) {
            throw new Error('missing contentDocument');
        }
        return doc;
    } catch (error) {
        throw new Error(`Cannot capture screenshot: same-origin iframe is required (${String(error)})`);
    }
}

function normalizeComparableIframeUrl(value: string): string {
    if (!value || value === 'about:blank') {
        return value;
    }
    try {
        const baseUrl = typeof window !== 'undefined' && window.location?.href
            ? window.location.href
            : 'http://localhost/';
        const url = new URL(value, baseUrl);
        url.pathname = url.pathname.replace(/\/+$/u, '');
        return url.toString();
    } catch {
        return value;
    }
}

function getIframeCurrentUrl(iframe: HTMLIFrameElement, doc: Document): string {
    try {
        return iframe.contentWindow?.location.href || doc.location?.href || '';
    } catch {
        return doc.location?.href || '';
    }
}

function hasIframeReachedRequestedUrl(iframe: HTMLIFrameElement, doc: Document): boolean {
    const requestedUrl = iframe.getAttribute('src') || iframe.src || '';
    if (!requestedUrl || requestedUrl === 'about:blank') {
        return true;
    }
    return normalizeComparableIframeUrl(getIframeCurrentUrl(iframe, doc)) === normalizeComparableIframeUrl(requestedUrl);
}

function waitForNextIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
    return new Promise((resolve) => {
        const handleLoad = () => {
            iframe.removeEventListener('load', handleLoad);
            resolve();
        };
        iframe.addEventListener('load', handleLoad);
    });
}

async function waitForIframeReady(iframe: HTMLIFrameElement): Promise<Document> {
    let doc = getSameOriginIframeDocument(iframe);
    while (doc.readyState !== 'complete' || !hasIframeReachedRequestedUrl(iframe, doc)) {
        await waitForNextIframeLoad(iframe);
        doc = getSameOriginIframeDocument(iframe);
    }
    return doc;
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

async function settleIframeLayout(doc: Document): Promise<void> {
    await Promise.resolve(doc.fonts?.ready);
    await waitForScreenshotFrame();
    await waitForScreenshotFrame();
    await new Promise(resolve => window.setTimeout(resolve, PARENT_SCREENSHOT_SETTLE_DELAY_MS));
}

function dispatchIframeResize(iframe: HTMLIFrameElement, doc: Document) {
    try {
        const eventCtor = iframe.contentWindow?.Event || Event;
        iframe.contentWindow?.dispatchEvent(new eventCtor('resize'));
        return;
    } catch { /* ignore */ }

    try {
        const eventCtor = doc.defaultView?.Event || Event;
        doc.defaultView?.dispatchEvent(new eventCtor('resize'));
    } catch { /* ignore */ }
}

function snapshotCaptureLayoutStyle(element: HTMLElement): CaptureLayoutStyleSnapshot {
    return {
        width: element.style.width,
        height: element.style.height,
        minHeight: element.style.minHeight,
        overflow: element.style.overflow,
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
        display: element.style.display,
        alignItems: element.style.alignItems,
        justifyContent: element.style.justifyContent,
        placeItems: element.style.placeItems,
    };
}

function restoreCaptureLayoutStyle(element: HTMLElement, snapshot: CaptureLayoutStyleSnapshot): void {
    element.style.width = snapshot.width;
    element.style.height = snapshot.height;
    element.style.minHeight = snapshot.minHeight;
    element.style.overflow = snapshot.overflow;
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
    element.style.display = snapshot.display;
    element.style.alignItems = snapshot.alignItems;
    element.style.justifyContent = snapshot.justifyContent;
    element.style.placeItems = snapshot.placeItems;
}

function flattenCaptureAlignmentStyle(element: HTMLElement): void {
    element.style.margin = '0';
    element.style.marginTop = '0';
    element.style.marginRight = '0';
    element.style.marginBottom = '0';
    element.style.marginLeft = '0';
    element.style.alignItems = 'initial';
    element.style.justifyContent = 'initial';
    element.style.placeItems = 'initial';
}

function flattenCapturePageStyle(element: HTMLElement): void {
    flattenCaptureAlignmentStyle(element);
    element.style.padding = '0';
    element.style.paddingTop = '0';
    element.style.paddingRight = '0';
    element.style.paddingBottom = '0';
    element.style.paddingLeft = '0';
}

function isCaptureHTMLElement(value: unknown): value is HTMLElement {
    return Boolean(value && typeof (value as HTMLElement).style === 'object');
}

function setElementScrollPosition(element: HTMLElement, left: number, top: number): void {
    try {
        element.scrollLeft = left;
    } catch { /* ignore readonly scroll containers */ }
    try {
        element.scrollTop = top;
    } catch { /* ignore readonly scroll containers */ }
}

function installIframeScrollOrigin(iframe: HTMLIFrameElement, doc: Document, rootElement: HTMLElement | null): () => void {
    const frameWindow = iframe.contentWindow || doc.defaultView;
    const windowScrollLeft = Number(frameWindow?.scrollX ?? frameWindow?.pageXOffset ?? 0) || 0;
    const windowScrollTop = Number(frameWindow?.scrollY ?? frameWindow?.pageYOffset ?? 0) || 0;
    const candidates = [
        isCaptureHTMLElement(doc.documentElement) ? doc.documentElement : null,
        isCaptureHTMLElement(doc.body) ? doc.body : null,
        isCaptureHTMLElement(rootElement) ? rootElement : null,
    ];
    const elementSnapshots: CaptureScrollSnapshot[] = candidates
        .filter((element, index): element is HTMLElement => (
            isCaptureHTMLElement(element) && candidates.indexOf(element) === index
        ))
        .map(element => ({
            element,
            scrollLeft: Number(element.scrollLeft || 0),
            scrollTop: Number(element.scrollTop || 0),
        }));

    try {
        frameWindow?.scrollTo?.(0, 0);
    } catch { /* ignore unsupported iframe scroll APIs */ }
    elementSnapshots.forEach(({ element }) => setElementScrollPosition(element, 0, 0));

    return () => {
        try {
            frameWindow?.scrollTo?.(windowScrollLeft, windowScrollTop);
        } catch { /* ignore unsupported iframe scroll APIs */ }
        elementSnapshots.forEach(({ element, scrollLeft, scrollTop }) => {
            setElementScrollPosition(element, scrollLeft, scrollTop);
        });
    };
}

function readCaptureElementSize(element: HTMLElement | null | undefined): { width: number; height: number } {
    if (!element) {
        return { width: 0, height: 0 };
    }
    const rect = typeof element.getBoundingClientRect === 'function'
        ? element.getBoundingClientRect()
        : { width: 0, height: 0 };
    return {
        width: Math.max(
            0,
            Math.round(Number(rect.width || 0)),
            Math.round(Number(element.scrollWidth || 0)),
            Math.round(Number(element.clientWidth || 0)),
            Math.round(Number(element.offsetWidth || 0)),
        ),
        height: Math.max(
            0,
            Math.round(Number(rect.height || 0)),
            Math.round(Number(element.scrollHeight || 0)),
            Math.round(Number(element.clientHeight || 0)),
            Math.round(Number(element.offsetHeight || 0)),
        ),
    };
}

function collectIframeCaptureSize(doc: Document, rootElement: HTMLElement | null, fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
    const sizes = [
        readCaptureElementSize(rootElement),
        readCaptureElementSize(isCaptureHTMLElement(doc.documentElement) ? doc.documentElement : null),
        readCaptureElementSize(isCaptureHTMLElement(doc.body) ? doc.body : null),
    ];
    return {
        width: Math.max(1, fallbackWidth, ...sizes.map(size => size.width)),
        height: Math.max(1, fallbackHeight, ...sizes.map(size => size.height)),
    };
}

function applyCaptureBoxSize(doc: Document, rootElement: HTMLElement | null, width: number, height: number): void {
    const widthValue = `${width}px`;
    const heightValue = `${height}px`;
    if (isCaptureHTMLElement(doc.documentElement)) {
        doc.documentElement.style.width = widthValue;
        doc.documentElement.style.height = heightValue;
        doc.documentElement.style.minHeight = heightValue;
        doc.documentElement.style.overflow = 'hidden';
    }
    if (isCaptureHTMLElement(doc.body)) {
        doc.body.style.width = widthValue;
        doc.body.style.height = heightValue;
        doc.body.style.minHeight = heightValue;
        doc.body.style.overflow = 'hidden';
    }
    if (isCaptureHTMLElement(rootElement)) {
        rootElement.style.width = widthValue;
        rootElement.style.height = heightValue;
        rootElement.style.minHeight = heightValue;
        rootElement.style.overflow = 'hidden';
    }
}

function setCaptureSize(iframe: HTMLIFrameElement, doc: Document, width: number, height: number): () => void {
    const rootElement = typeof doc.getElementById === 'function'
        ? doc.getElementById('root') as HTMLElement | null
        : null;
    const documentSnapshot = snapshotCaptureLayoutStyle(doc.documentElement);
    const bodySnapshot = doc.body ? snapshotCaptureLayoutStyle(doc.body) : null;
    const rootSnapshot = rootElement ? snapshotCaptureLayoutStyle(rootElement) : null;
    const original = {
        iframeWidth: iframe.style.width,
        iframeHeight: iframe.style.height,
        iframeTransform: iframe.style.transform,
        iframeTransformOrigin: iframe.style.transformOrigin,
    };

    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    iframe.style.transform = 'none';
    iframe.style.transformOrigin = 'top left';
    flattenCapturePageStyle(doc.documentElement);
    doc.documentElement.style.width = `${width}px`;
    doc.documentElement.style.height = `${height}px`;
    doc.documentElement.style.minHeight = `${height}px`;
    doc.documentElement.style.overflow = 'hidden';
    if (doc.body) {
        flattenCapturePageStyle(doc.body);
        doc.body.style.display = 'block';
        doc.body.style.width = `${width}px`;
        doc.body.style.height = `${height}px`;
        doc.body.style.minHeight = `${height}px`;
        doc.body.style.overflow = 'hidden';
    }
    if (rootElement) {
        flattenCaptureAlignmentStyle(rootElement);
        rootElement.style.width = `${width}px`;
        rootElement.style.height = `${height}px`;
        rootElement.style.minHeight = `${height}px`;
        rootElement.style.overflow = 'hidden';
    }
    const restoreScrollOrigin = installIframeScrollOrigin(iframe, doc, rootElement);
    dispatchIframeResize(iframe, doc);

    return () => {
        iframe.style.width = original.iframeWidth;
        iframe.style.height = original.iframeHeight;
        iframe.style.transform = original.iframeTransform;
        iframe.style.transformOrigin = original.iframeTransformOrigin;
        restoreCaptureLayoutStyle(doc.documentElement, documentSnapshot);
        if (doc.body && bodySnapshot) {
            restoreCaptureLayoutStyle(doc.body, bodySnapshot);
        }
        if (rootElement && rootSnapshot) {
            restoreCaptureLayoutStyle(rootElement, rootSnapshot);
        }
        restoreScrollOrigin();
        dispatchIframeResize(iframe, doc);
    };
}

function getImageIntrinsicSize(image: HTMLImageElement): { width: number; height: number } {
    const width = Number(image.naturalWidth || image.width || 0);
    const height = Number(image.naturalHeight || image.height || 0);
    return {
        width: Number.isFinite(width) ? Math.round(width) : 0,
        height: Number.isFinite(height) ? Math.round(height) : 0,
    };
}

function normalizeSnapdomPngToViewport(
    doc: Document,
    image: HTMLImageElement,
    dataUrl: string,
    width: number,
    height: number,
): string {
    const imageSize = getImageIntrinsicSize(image);
    if (imageSize.width === width && imageSize.height === height) {
        return dataUrl;
    }
    if (imageSize.width <= 0 || imageSize.height <= 0 || typeof doc.createElement !== 'function') {
        return dataUrl;
    }

    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        return dataUrl;
    }

    const sourceScale = Math.max(1, imageSize.width / width);
    const sourceWidth = Math.min(imageSize.width, Math.round(width * sourceScale));
    const sourceHeight = Math.min(imageSize.height, Math.round(height * sourceScale));
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    const normalizedDataUrl = canvas.toDataURL('image/png');
    return normalizedDataUrl || dataUrl;
}

function isNearBlankScreenshot(doc: Document, image: HTMLImageElement): boolean {
    if (typeof doc.createElement !== 'function') {
        return false;
    }
    const imageSize = getImageIntrinsicSize(image);
    if (imageSize.width <= 0 || imageSize.height <= 0) {
        return true;
    }

    const canvas = doc.createElement('canvas');
    canvas.width = BLANK_SCREENSHOT_SAMPLE_SIZE;
    canvas.height = BLANK_SCREENSHOT_SAMPLE_SIZE;
    const context = canvas.getContext('2d');
    if (!context || typeof context.getImageData !== 'function') {
        return false;
    }

    try {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sampled = 0;
        let nearWhiteOrTransparent = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            sampled += 1;
            const red = pixels[index] ?? 255;
            const green = pixels[index + 1] ?? 255;
            const blue = pixels[index + 2] ?? 255;
            const alpha = pixels[index + 3] ?? 255;
            if (alpha <= 8 || (red >= 248 && green >= 248 && blue >= 248)) {
                nearWhiteOrTransparent += 1;
            }
        }
        return sampled > 0 && nearWhiteOrTransparent === sampled;
    } catch {
        return false;
    }
}

async function captureIframeWithSnapdom(doc: Document, iframe: HTMLIFrameElement, width: number, height: number): Promise<string> {
    const testSnapdomToPng = (globalThis as ParentScreenshotTestGlobal).__AXHUB_PARENT_SCREENSHOT_TEST_SNAPDOM_TO_PNG__;
    const snapdomToPng = testSnapdomToPng ?? (await import('@zumer/snapdom')).snapdom.toPng;
    const captureElement = doc.getElementById('root') || doc.body || doc.documentElement;
    const image = await snapdomToPng(captureElement, {
        width,
        height,
        dpr: 1,
        fast: true,
        embedFonts: true,
        cache: 'soft',
        placeholders: false,
        outerTransforms: false,
        outerShadows: false,
        backgroundColor: '#fff',
    });
    const dataUrl = image.src || image.getAttribute('src') || '';
    if (!dataUrl) {
        throw new Error('snapDOM returned an empty screenshot');
    }
    if (!dataUrl.startsWith('data:image/png')) {
        throw new Error('snapDOM returned a non-PNG screenshot');
    }
    if (isNearBlankScreenshot(doc, image)) {
        throw new Error('snapDOM returned a blank screenshot');
    }
    return normalizeSnapdomPngToViewport(doc, image, dataUrl, width, height);
}

export async function captureSameOriginIframeScreenshot({
    iframe,
    width,
    height,
    captureFullContent = true,
}: CaptureSameOriginIframeScreenshotParams): Promise<CaptureSameOriginIframeScreenshotResult> {
    const captureWidth = normalizeCaptureSize(width);
    const captureHeight = normalizeCaptureSize(height);
    const doc = await waitForIframeReady(iframe);
    const restoreSize = setCaptureSize(iframe, doc, captureWidth, captureHeight);
    try {
        await settleIframeLayout(doc);
        const rootElement = typeof doc.getElementById === 'function'
            ? doc.getElementById('root') as HTMLElement | null
            : null;
        const outputSize = captureFullContent
            ? collectIframeCaptureSize(doc, rootElement, captureWidth, captureHeight)
            : { width: captureWidth, height: captureHeight };
        if (captureFullContent) {
            applyCaptureBoxSize(doc, rootElement, outputSize.width, outputSize.height);
            await settleIframeLayout(doc);
        }
        const dataUrl = await captureIframeWithSnapdom(doc, iframe, outputSize.width, outputSize.height);
        return {
            dataUrl,
            width: outputSize.width,
            height: outputSize.height,
        };
    } finally {
        restoreSize();
    }
}
