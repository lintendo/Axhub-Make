import React, { useState, useRef, useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import {
    AXHUB_EMBED_ACTIVE_PREVIEW_CHANGED_EVENT,
    AXHUB_EMBED_EXIT_PREVIEW_EVENT,
    resolveScreenshotCompletionAction,
} from './embedPreviewSession';
import {
    getScaledEmbedViewportSize,
    isEmbedScreenshotUsable,
    normalizeEmbedContentScale,
    shouldRequestEmbedScreenshot,
    type EmbedContentScale,
} from './embedContentScale';
import { captureSameOriginIframeScreenshot } from './parentScreenshotCapture';

interface AxhubWebEmbedProps {
    url: string;
    title?: string;
    width: number;
    height: number;
    elementId: string;
    screenshotUrl?: string;
    screenshotWidth?: number;
    screenshotHeight?: number;
    screenshotContentScale?: number;
    contentScale?: number;
    captureScreenshotOnMount?: boolean;
}

type ScreenshotFinishStatus = 'captured' | 'failed' | 'timeout' | 'skip-no-iframe';

const EMBED_SCROLLBAR_HIDING_STYLE_ID = 'axhub-embed-hide-scrollbars';
const EMBED_SCROLLBAR_HIDING_MESSAGE_TYPE = 'AXHUB_HIDE_NATIVE_SCROLLBARS';
const EMBED_SCROLLBAR_HIDING_CSS = `
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

html::-webkit-scrollbar-track,
html::-webkit-scrollbar-thumb,
body::-webkit-scrollbar-track,
body::-webkit-scrollbar-thumb,
#root::-webkit-scrollbar-track,
#root::-webkit-scrollbar-thumb,
*::-webkit-scrollbar-track,
*::-webkit-scrollbar-thumb {
    background: transparent !important;
}
`;

function applyScrollbarCSSToSameOriginIframe(iframe: HTMLIFrameElement) {
    try {
        const doc = iframe.contentDocument;
        if (!doc || doc.getElementById(EMBED_SCROLLBAR_HIDING_STYLE_ID)) return;

        const style = doc.createElement('style');
        style.id = EMBED_SCROLLBAR_HIDING_STYLE_ID;
        style.textContent = EMBED_SCROLLBAR_HIDING_CSS;
        doc.head.appendChild(style);
    } catch { /* cross-origin: ignore */ }
}

/** Ask same-origin or cooperating cross-origin iframe content to hide native scrollbars. */
function requestScrollbarHiding(iframe: HTMLIFrameElement) {
    applyScrollbarCSSToSameOriginIframe(iframe);
    try {
        iframe.contentWindow?.postMessage({
            type: EMBED_SCROLLBAR_HIDING_MESSAGE_TYPE,
        }, '*');
    } catch { /* iframe not ready: ignore */ }
}

function injectScrollbarCSS(iframe: HTMLIFrameElement) {
    iframe.addEventListener('load', () => requestScrollbarHiding(iframe));
}

export function logEmbedDebug(kind: 'web' | 'doc' | 'theme', event: string, details: Record<string, unknown> = {}) {
    console.info('[Axhub Canvas Embed]', kind, event, {
        at: new Date().toISOString(),
        ...details,
    });
}

/* ── Screenshot debounce config ─────────────────────────────── */
const SCREENSHOT_DEBOUNCE_MS = 800;
const SCREENSHOT_HMR_DEBOUNCE_MS = 1200;
const SCREENSHOT_INITIAL_DELAY_MS = 600;
const SCREENSHOT_DESELECT_DELAY_MS = 120;
const SCREENSHOT_TIMEOUT_MS = 10_000;

function createScreenshotRequestId(elementId: string, sequence: number): string {
    return `${elementId}:${Date.now()}:${sequence}`;
}

function normalizeTargetSize(value: number): number | undefined {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.max(1, Math.round(value));
}

function shouldForceScreenshotRequest(reason: string): boolean {
    return reason === 'manual'
        || reason === 'refresh'
        || reason.startsWith('preview-updated');
}

/**
 * AxhubWebEmbed — Selection-driven dual-mode component.
 *
 * - When NOT selected: shows a static screenshot image (or placeholder).
 *   The iframe is destroyed after a final screenshot attempt to save performance.
 * - When selected: creates an iframe showing the live web page.
 *   Captures a screenshot when leaving live preview and notifies
 *   the parent canvas to persist the screenshot data.
 *
 * Communication is done via window custom events because the
 * renderEmbeddable callback must have [] deps (stable reference).
 */
function AxhubWebEmbedInner({
    url,
    title,
    width,
    height,
    elementId,
    screenshotUrl,
    screenshotWidth,
    screenshotHeight,
    screenshotContentScale,
    contentScale: rawContentScale,
    captureScreenshotOnMount,
}: AxhubWebEmbedProps) {
    const contentScale = normalizeEmbedContentScale(rawContentScale);
    const scaledViewportSize = getScaledEmbedViewportSize({ width, height, contentScale });
    const [activated, setActivated] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureOnly, setCaptureOnly] = useState(false);
    const [exitCaptureInProgress, setExitCaptureInProgress] = useState(false);

    const latestContextRef = useRef({
        url,
        title,
        width,
        height,
        elementId,
        contentScale,
        viewportWidth: scaledViewportSize.width,
        viewportHeight: scaledViewportSize.height,
        screenshotWidth,
        screenshotHeight,
        screenshotContentScale,
    });
    latestContextRef.current = {
        url,
        title,
        width,
        height,
        elementId,
        contentScale,
        viewportWidth: scaledViewportSize.width,
        viewportHeight: scaledViewportSize.height,
        screenshotWidth,
        screenshotHeight,
        screenshotContentScale,
    };

    const normalizedScreenshotContentScale = screenshotContentScale === undefined
        ? undefined
        : normalizeEmbedContentScale(screenshotContentScale);

    const iframeContainerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const activatedRef = useRef(activated);
    const captureOnlyRef = useRef(captureOnly);
    const iframeLoadCountRef = useRef(0);
    const iframeUrlRef = useRef<string | null>(null);
    const screenshotDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeScreenshotRequestIdRef = useRef<string | null>(null);
    const screenshotSequenceRef = useRef(0);
    const isCapturingRef = useRef(false);
    const needsRecaptureRef = useRef(false);
    const pendingRecaptureReasonRef = useRef<string | null>(null);
    const pendingIframeTeardownRef = useRef(false);
    const prevSizeRef = useRef({ width, height, contentScale });
    const lastCapturedViewportRef = useRef<{
        width: number;
        height: number;
        contentScale: EmbedContentScale;
    } | null>(null);
    if (
        lastCapturedViewportRef.current === null
        && typeof screenshotWidth === 'number'
        && typeof screenshotHeight === 'number'
        && normalizedScreenshotContentScale !== undefined
    ) {
        lastCapturedViewportRef.current = {
            width: screenshotWidth,
            height: screenshotHeight,
            contentScale: normalizedScreenshotContentScale,
        };
    }
    const requestScreenshotRef = useRef<(delayMs?: number, reason?: string) => void>(() => undefined);
    const completeCaptureRef = useRef<(status: ScreenshotFinishStatus, allowRecapture?: boolean) => void>(() => undefined);
    const removeIframeRef = useRef<() => void>(() => undefined);
    const deactivatePreviewRef = useRef<(reason: string) => void>(() => undefined);
    const selectionHandlerRef = useRef<(event: Event) => void>(() => undefined);
    const resizeHandlerRef = useRef<(event: Event) => void>(() => undefined);
    const exitPreviewHandlerRef = useRef<(event: Event) => void>(() => undefined);

    activatedRef.current = activated;
    captureOnlyRef.current = captureOnly;

    function syncIframeRootSize(iframe: HTMLIFrameElement | null = iframeRef.current) {
        const latest = latestContextRef.current;
        if (!iframe?.contentWindow) return;

        try {
            iframe.contentWindow.postMessage({
                type: 'WEB_EDITOR_SET_ROOT_SIZE',
                width: normalizeTargetSize(latest.viewportWidth),
                height: normalizeTargetSize(latest.viewportHeight),
            }, '*');
        } catch (err) {
            logEmbedDebug('web', 'iframe:root-size-sync-error', {
                elementId: latest.elementId,
                url: latest.url,
                error: String(err),
            });
        }
    }

    function syncIframeViewportSize(iframe: HTMLIFrameElement | null = iframeRef.current) {
        const latest = latestContextRef.current;
        if (!iframe) return;

        iframe.style.width = `${latest.viewportWidth}px`;
        iframe.style.height = `${latest.viewportHeight}px`;
        iframe.style.transform = latest.contentScale === 1 ? '' : `scale(${latest.contentScale})`;
    }

    const persistedScreenshotUsable = isEmbedScreenshotUsable({
        screenshotUrl: screenshotUrl && !imgError ? screenshotUrl : '',
        viewportWidth: scaledViewportSize.width,
        viewportHeight: scaledViewportSize.height,
        contentScale,
        screenshotWidth,
        screenshotHeight,
        screenshotContentScale,
    });
    const inMemoryScreenshotUsable = Boolean(screenshotDataUrl && lastCapturedViewportRef.current)
        && isEmbedScreenshotUsable({
            screenshotUrl: screenshotDataUrl || '',
            viewportWidth: scaledViewportSize.width,
            viewportHeight: scaledViewportSize.height,
            contentScale,
            screenshotWidth: lastCapturedViewportRef.current?.width,
            screenshotHeight: lastCapturedViewportRef.current?.height,
            screenshotContentScale: lastCapturedViewportRef.current?.contentScale,
        });
    const preferredScreenshot = persistedScreenshotUsable
        ? screenshotUrl
        : inMemoryScreenshotUsable ? screenshotDataUrl : null;
    const staleScreenshot = !imgError ? (screenshotUrl || screenshotDataUrl) : screenshotDataUrl;
    const effectiveScreenshot = preferredScreenshot || staleScreenshot || null;
    const isScreenshotPlaceholderCapturing = Boolean(!effectiveScreenshot && isCapturing);
    const isLiveIframeVisible = activated || exitCaptureInProgress;

    useEffect(() => {
        setImgError(false);
        if (
            typeof screenshotWidth === 'number'
            && typeof screenshotHeight === 'number'
            && normalizedScreenshotContentScale !== undefined
        ) {
            lastCapturedViewportRef.current = {
                width: screenshotWidth,
                height: screenshotHeight,
                contentScale: normalizedScreenshotContentScale,
            };
        }
    }, [normalizedScreenshotContentScale, screenshotHeight, screenshotUrl, screenshotWidth]);

    removeIframeRef.current = () => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const ctx = latestContextRef.current;
        logEmbedDebug('web', 'iframe:destroy', { url: ctx.url, title: ctx.title, elementId: ctx.elementId });
        iframe.remove();
        iframeRef.current = null;
        iframeUrlRef.current = null;
        iframeLoadCountRef.current = 0;
    };

    deactivatePreviewRef.current = (reason: string) => {
        const ctx = latestContextRef.current;
        logEmbedDebug('web', 'selection:deactivated', {
            elementId: ctx.elementId,
            url: ctx.url,
            title: ctx.title,
            reason,
        });
        if (iframeRef.current?.contentWindow) {
            pendingIframeTeardownRef.current = true;
            setExitCaptureInProgress(true);
            setActivated(false);
            requestScreenshotRef.current(SCREENSHOT_DESELECT_DELAY_MS, reason);
        } else {
            setExitCaptureInProgress(false);
            setActivated(false);
            removeIframeRef.current();
        }
    };

    completeCaptureRef.current = (status: ScreenshotFinishStatus, allowRecapture = true) => {
        if (screenshotTimeoutRef.current) {
            clearTimeout(screenshotTimeoutRef.current);
            screenshotTimeoutRef.current = null;
        }

        activeScreenshotRequestIdRef.current = null;
        isCapturingRef.current = false;
        setIsCapturing(false);
        setExitCaptureInProgress(false);
        if (status === 'captured') {
            const latest = latestContextRef.current;
            lastCapturedViewportRef.current = {
                width: latest.viewportWidth,
                height: latest.viewportHeight,
                contentScale: latest.contentScale,
            };
        }

        const completionAction = resolveScreenshotCompletionAction({
            allowRecapture,
            pendingIframeTeardown: pendingIframeTeardownRef.current,
            needsRecapture: needsRecaptureRef.current,
            hasIframe: Boolean(iframeRef.current?.contentWindow),
        });

        if (completionAction === 'recapture') {
            needsRecaptureRef.current = false;
            const reason = pendingRecaptureReasonRef.current || `deferred:${status}`;
            pendingRecaptureReasonRef.current = null;
            requestScreenshotRef.current(SCREENSHOT_DEBOUNCE_MS, reason);
            return;
        }

        needsRecaptureRef.current = false;
        pendingRecaptureReasonRef.current = null;
        if (completionAction === 'teardown') {
            pendingIframeTeardownRef.current = false;
            removeIframeRef.current();
        } else if (captureOnlyRef.current) {
            setCaptureOnly(false);
            removeIframeRef.current();
        }
    };

    requestScreenshotRef.current = (delayMs: number = SCREENSHOT_DEBOUNCE_MS, reason = 'manual') => {
        const ctx = latestContextRef.current;
        const lastCaptured = lastCapturedViewportRef.current;
        if (screenshotDebounceRef.current) {
            clearTimeout(screenshotDebounceRef.current);
            screenshotDebounceRef.current = null;
        }

        if (activatedRef.current && !pendingIframeTeardownRef.current) {
            logEmbedDebug('web', 'screenshot:skip-live-preview', {
                url: ctx.url,
                elementId: ctx.elementId,
                reason,
                width: ctx.viewportWidth,
                height: ctx.viewportHeight,
                contentScale: ctx.contentScale,
            });
            return;
        }

        const canSkipUnchangedScreenshot = !pendingIframeTeardownRef.current;
        if (canSkipUnchangedScreenshot && !shouldForceScreenshotRequest(reason) && !shouldRequestEmbedScreenshot({
            viewportWidth: ctx.viewportWidth,
            viewportHeight: ctx.viewportHeight,
            contentScale: ctx.contentScale,
            capturedViewportWidth: lastCaptured?.width,
            capturedViewportHeight: lastCaptured?.height,
            capturedContentScale: lastCaptured?.contentScale,
        })) {
            logEmbedDebug('web', 'screenshot:skip-unchanged', {
                url: ctx.url,
                elementId: ctx.elementId,
                reason,
                width: ctx.viewportWidth,
                height: ctx.viewportHeight,
                contentScale: ctx.contentScale,
            });
            return;
        }

        if (isCapturingRef.current) {
            needsRecaptureRef.current = true;
            pendingRecaptureReasonRef.current = reason;
            logEmbedDebug('web', 'screenshot:deferred', {
                url: ctx.url,
                elementId: ctx.elementId,
                reason,
            });
            return;
        }

        if (!activatedRef.current && !iframeRef.current?.contentWindow) {
            pendingRecaptureReasonRef.current = reason;
            setCaptureOnly(true);
            return;
        }

        screenshotDebounceRef.current = setTimeout(() => {
            screenshotDebounceRef.current = null;
            const latest = latestContextRef.current;
            const iframe = iframeRef.current;
            if (!iframe?.contentWindow) {
                pendingRecaptureReasonRef.current = reason;
                logEmbedDebug('web', 'screenshot:skip-no-iframe', {
                    url: latest.url,
                    elementId: latest.elementId,
                    reason,
                });
                completeCaptureRef.current('skip-no-iframe', false);
                return;
            }

            const requestId = createScreenshotRequestId(latest.elementId, screenshotSequenceRef.current += 1);
            activeScreenshotRequestIdRef.current = requestId;
            isCapturingRef.current = true;
            setIsCapturing(true);
            logEmbedDebug('web', 'screenshot:request', {
                url: latest.url,
                elementId: latest.elementId,
                requestId,
                reason,
                width: latest.viewportWidth,
                height: latest.viewportHeight,
                contentScale: latest.contentScale,
            });

            screenshotTimeoutRef.current = setTimeout(() => {
                if (!isCapturingRef.current) return;
                const timeoutCtx = latestContextRef.current;
                logEmbedDebug('web', 'screenshot:timeout', {
                    url: timeoutCtx.url,
                    elementId: timeoutCtx.elementId,
                    requestId,
                });
                completeCaptureRef.current('timeout');
            }, SCREENSHOT_TIMEOUT_MS);

            void (async () => {
                try {
                    requestScrollbarHiding(iframe);
                    syncIframeViewportSize(iframe);
                    syncIframeRootSize(iframe);
                    const screenshot = await captureSameOriginIframeScreenshot({
                        iframe,
                        width: normalizeTargetSize(latest.viewportWidth) || latest.viewportWidth,
                        height: normalizeTargetSize(latest.viewportHeight) || latest.viewportHeight,
                    });
                    if (activeScreenshotRequestIdRef.current !== requestId || !isCapturingRef.current) {
                        return;
                    }

                    logEmbedDebug('web', 'screenshot:captured', {
                        elementId: latest.elementId,
                        url: latest.url,
                        requestId,
                        width: screenshot.width,
                        height: screenshot.height,
                        dataUrlLength: screenshot.dataUrl.length,
                    });

                    setScreenshotDataUrl(screenshot.dataUrl);
                    window.dispatchEvent(new CustomEvent('axhub:embedScreenshotReady', {
                        detail: {
                            elementId: latest.elementId,
                            dataUrl: screenshot.dataUrl,
                            width: screenshot.width,
                            height: screenshot.height,
                            contentScale: latest.contentScale,
                            requestId,
                        },
                    }));
                    completeCaptureRef.current('captured');
                } catch (err) {
                    if (activeScreenshotRequestIdRef.current !== requestId || !isCapturingRef.current) {
                        return;
                    }
                    logEmbedDebug('web', 'screenshot:failed', {
                        url: latest.url,
                        elementId: latest.elementId,
                        requestId,
                        error: String(err),
                    });
                    completeCaptureRef.current('failed');
                }
            })();
        }, delayMs);
    };

    selectionHandlerRef.current = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        const ctx = latestContextRef.current;
        if (!detail || detail.elementId !== ctx.elementId) return;

        if (detail.isSelected) {
            if (detail.activationMode !== 'activate') {
                logEmbedDebug('web', 'selection:select-only', { elementId: ctx.elementId, url: ctx.url, title: ctx.title });
                return;
            }
            logEmbedDebug('web', 'selection:activated', { elementId: ctx.elementId, url: ctx.url, title: ctx.title });
            pendingIframeTeardownRef.current = false;
            setExitCaptureInProgress(false);
            setActivated(true);
            return;
        }

        deactivatePreviewRef.current('deselect');
    };

    exitPreviewHandlerRef.current = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        const ctx = latestContextRef.current;
        if (!detail || detail.elementId !== ctx.elementId) return;

        deactivatePreviewRef.current(detail.reason || 'exit-preview');
    };

    resizeHandlerRef.current = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        const ctx = latestContextRef.current;
        if (!detail || detail.elementId !== ctx.elementId) return;

        logEmbedDebug('web', 'resize:detected', {
            elementId: ctx.elementId,
            width: detail.width,
            height: detail.height,
        });

        requestScreenshotRef.current(SCREENSHOT_DEBOUNCE_MS, 'resize');
    };

    /* ── Listen for selection changes from EmbedFloatingToolbar ── */
    useEffect(() => {
        const handler = (event: Event) => selectionHandlerRef.current(event);
        window.addEventListener('axhub:embedSelectionChanged', handler);
        return () => window.removeEventListener('axhub:embedSelectionChanged', handler);
    }, []);

    useEffect(() => {
        const handler = (event: Event) => exitPreviewHandlerRef.current(event);
        window.addEventListener(AXHUB_EMBED_EXIT_PREVIEW_EVENT, handler);
        return () => window.removeEventListener(AXHUB_EMBED_EXIT_PREVIEW_EVENT, handler);
    }, []);

    useEffect(() => {
        if (activated) {
            window.dispatchEvent(new CustomEvent(AXHUB_EMBED_ACTIVE_PREVIEW_CHANGED_EVENT, {
                detail: { elementId, active: true },
            }));
        }

        return () => {
            if (activated) {
                window.dispatchEvent(new CustomEvent(AXHUB_EMBED_ACTIVE_PREVIEW_CHANGED_EVENT, {
                    detail: { elementId, active: false },
                }));
            }
        };
    }, [activated, elementId]);

    /* ── Create iframe when activated ───────────────────────────── */
    useEffect(() => {
        if ((!activated && !captureOnly) || !iframeContainerRef.current) return;

        pendingIframeTeardownRef.current = false;

        if (iframeRef.current && iframeContainerRef.current.contains(iframeRef.current)) {
            if (iframeUrlRef.current !== url) {
                iframeLoadCountRef.current = 0;
                iframeUrlRef.current = url;
                iframeRef.current.src = url;
            }
            return;
        }

        const ctx = latestContextRef.current;
        logEmbedDebug('web', 'iframe:create', { url: ctx.url, title: ctx.title, elementId: ctx.elementId });
        const iframe = document.createElement('iframe');
        iframe.src = ctx.url;
        iframe.title = ctx.title || ctx.url;
        iframe.dataset.axhubEmbedId = ctx.elementId;
        iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups');
        iframe.style.cssText = 'border:none;background:#fff;display:block;transform-origin:top left;';
        syncIframeViewportSize(iframe);
        injectScrollbarCSS(iframe);

        iframe.addEventListener('load', () => {
            iframeLoadCountRef.current += 1;
            const loadCount = iframeLoadCountRef.current;
            const latest = latestContextRef.current;
            logEmbedDebug('web', 'iframe:load', { url: latest.url, title: latest.title, loadCount });
            requestScrollbarHiding(iframe);
            syncIframeViewportSize(iframe);
            syncIframeRootSize(iframe);

            const pendingReason = pendingRecaptureReasonRef.current;
            if (captureOnlyRef.current || pendingIframeTeardownRef.current) {
                if (loadCount === 1) {
                    requestScreenshotRef.current(SCREENSHOT_INITIAL_DELAY_MS, pendingReason || 'initial-load');
                } else {
                    requestScreenshotRef.current(SCREENSHOT_HMR_DEBOUNCE_MS, pendingReason || 'iframe-load');
                }
            }
        });

        iframeContainerRef.current.appendChild(iframe);
        iframeRef.current = iframe;
        iframeUrlRef.current = ctx.url;
    }, [activated, captureOnly, url]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        syncIframeViewportSize(iframe);
        syncIframeRootSize(iframe);
    }, [contentScale, scaledViewportSize.height, scaledViewportSize.width]);

    /* ── Listen for resize events ─────────────────────────────── */
    useEffect(() => {
        const handler = (event: Event) => resizeHandlerRef.current(event);
        window.addEventListener('axhub:embedResized', handler);
        return () => window.removeEventListener('axhub:embedResized', handler);
    }, []);

    useEffect(() => {
        const previousSize = prevSizeRef.current;
        prevSizeRef.current = { width, height, contentScale };
        if (
            previousSize.width === width
            && previousSize.height === height
            && previousSize.contentScale === contentScale
        ) {
            return;
        }
        requestScreenshotRef.current(SCREENSHOT_DEBOUNCE_MS, previousSize.contentScale === contentScale ? 'prop-size-change' : 'content-scale-change');
    }, [contentScale, width, height]);

    useEffect(() => {
        if (!captureScreenshotOnMount) return;
        window.dispatchEvent(new CustomEvent('axhub:embedInitialScreenshotAttempted', {
            detail: { elementId },
        }));
        requestScreenshotRef.current(SCREENSHOT_INITIAL_DELAY_MS, 'initial-mount');
    }, [captureScreenshotOnMount, elementId]);

    /* ── Cleanup on unmount ─────────────────────────────────────── */
    useEffect(() => {
        return () => {
            if (screenshotDebounceRef.current) {
                clearTimeout(screenshotDebounceRef.current);
                screenshotDebounceRef.current = null;
            }
            if (screenshotTimeoutRef.current) {
                clearTimeout(screenshotTimeoutRef.current);
                screenshotTimeoutRef.current = null;
            }
            pendingIframeTeardownRef.current = false;
            setExitCaptureInProgress(false);
            removeIframeRef.current();
        };
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#fff' }}>
            {/* Screenshot / placeholder layer (visible when NOT activated) */}
            {!isLiveIframeVisible && (
                <div
                    style={{
                        position: 'absolute', inset: 0,
                        display: effectiveScreenshot ? 'block' : 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer', background: '#f8fafc', zIndex: 2,
                    }}
                >
                    {effectiveScreenshot ? (
                        <img
                            src={effectiveScreenshot}
                            alt={title || '原型预览'}
                            onError={() => setImgError(true)}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: scaledViewportSize.width,
                                height: scaledViewportSize.height,
                                maxWidth: 'none',
                                maxHeight: 'none',
                                objectFit: 'fill',
                                objectPosition: 'top left',
                                pointerEvents: 'none',
                                transform: contentScale === 1 ? undefined : `scale(${contentScale})`,
                                transformOrigin: 'top left',
                            }}
                            draggable={false}
                        />
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 8,
                            color: '#94a3b8',
                            fontSize: 12,
                            userSelect: 'none',
                            maxWidth: '82%',
                            textAlign: 'center',
                            lineHeight: 1.35,
                        }}>
                            <ImageOff style={{ width: 32, height: 32, opacity: 0.5 }} />
                            <span>{isScreenshotPlaceholderCapturing ? '正在截图' : '暂无预览截图'}</span>
                            {title && !isScreenshotPlaceholderCapturing ? (
                                <span style={{ fontSize: 11, color: '#cbd5e1', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {title}
                                </span>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {/* Capturing indicator (shown over iframe during screenshot) */}
            {isLiveIframeVisible && isCapturing && (
                <div style={{
                    position: 'absolute', bottom: 8, right: 8, zIndex: 10,
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.5)', color: '#fff',
                    fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
                    backdropFilter: 'blur(4px)',
                }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                    截图中...
                </div>
            )}

            {/* Iframe container (DOM-managed) */}
            <div
                ref={iframeContainerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    pointerEvents: activated ? 'auto' : 'none',
                }}
            />
        </div>
    );
}

const AxhubWebEmbed = React.memo(AxhubWebEmbedInner, (prev, next) => {
    return prev.url === next.url
        && prev.title === next.title
        && prev.width === next.width
        && prev.height === next.height
        && prev.screenshotUrl === next.screenshotUrl
        && prev.screenshotWidth === next.screenshotWidth
        && prev.screenshotHeight === next.screenshotHeight
        && normalizeEmbedContentScale(prev.screenshotContentScale) === normalizeEmbedContentScale(next.screenshotContentScale)
        && prev.elementId === next.elementId
        && normalizeEmbedContentScale(prev.contentScale) === normalizeEmbedContentScale(next.contentScale)
        && Boolean(prev.captureScreenshotOnMount) === Boolean(next.captureScreenshotOnMount);
});

export default AxhubWebEmbed;
