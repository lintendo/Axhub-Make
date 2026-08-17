import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AxhubWebEmbed source', () => {
    it('shows a concise capturing placeholder instead of stale screenshot copy', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain('const effectiveScreenshot = preferredScreenshot || staleScreenshot || null;');
        expect(source).toContain('const isScreenshotPlaceholderCapturing = Boolean(!effectiveScreenshot && isCapturing);');
        expect(source).toContain("{isScreenshotPlaceholderCapturing ? '正在截图' : '暂无预览截图'}");
        expect(source).toContain('{title && !isScreenshotPlaceholderCapturing ? (');
        expect(source).not.toContain('旧截图已隐藏');
        expect(source).not.toContain('预览尺寸已变化');
    });

    it('anchors scaled screenshots to the top-left of the embed container', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain("position: 'absolute'");
        expect(source).toContain('top: 0');
        expect(source).toContain('left: 0');
        expect(source).toContain("transformOrigin: 'top left'");
    });

    it('syncs iframe root size when the visible embed viewport changes', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain('function syncIframeRootSize');
        expect(source).toContain('function syncIframeViewportSize');
        expect(source).toContain('iframe.style.width = `${latest.viewportWidth}px`;');
        expect(source).toContain('iframe.style.height = `${latest.viewportHeight}px`;');
        expect(source).toContain("type: 'WEB_EDITOR_SET_ROOT_SIZE'");
        expect(source).toContain('width: normalizeTargetSize(latest.viewportWidth)');
        expect(source).toContain('height: normalizeTargetSize(latest.viewportHeight)');
        expect(source).toContain('syncIframeViewportSize(iframe);');
    });

    it('keeps live preview interactive during size changes and captures only after exit', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain("if (activatedRef.current && !pendingIframeTeardownRef.current) {");
        expect(source).toContain("logEmbedDebug('web', 'screenshot:skip-live-preview'");
        expect(source).toContain("requestScreenshotRef.current(SCREENSHOT_DESELECT_DELAY_MS, reason);");
        expect(source).toContain('if (captureOnlyRef.current || pendingIframeTeardownRef.current) {');
        expect(source).toContain("requestScreenshotRef.current(SCREENSHOT_INITIAL_DELAY_MS, pendingReason || 'initial-load');");
        expect(source).toContain("requestScreenshotRef.current(SCREENSHOT_HMR_DEBOUNCE_MS, pendingReason || 'iframe-load');");
    });

    it('keeps the live iframe visible while exit capture hands off to the screenshot layer', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain('const [exitCaptureInProgress, setExitCaptureInProgress] = useState(false);');
        expect(source).toContain('const isLiveIframeVisible = activated || exitCaptureInProgress;');
        expect(source).toContain('setExitCaptureInProgress(true);');
        expect(source).toContain('setExitCaptureInProgress(false);');
        expect(source).toContain('{!isLiveIframeVisible && (');
        expect(source).toContain('{isLiveIframeVisible && isCapturing && (');
    });

    it('waits for iframe root size sync and layout settle before requesting screenshots', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain("import { captureSameOriginIframeScreenshot } from './parentScreenshotCapture';");
        expect(source).toContain('syncIframeRootSize(iframe);');
        expect(source).toContain('await captureSameOriginIframeScreenshot({');
    });

    it('auto captures prototype preview embeds once without requiring user activation', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');
        const canvasSource = readFileSync(resolve(__dirname, '../ExcalidrawCanvas.tsx'), 'utf8');

        expect(source).toContain('captureScreenshotOnMount?: boolean;');
        expect(source).toContain('if (!captureScreenshotOnMount) return;');
        expect(source).toContain("window.dispatchEvent(new CustomEvent('axhub:embedInitialScreenshotAttempted'");
        expect(source).toContain("requestScreenshotRef.current(SCREENSHOT_INITIAL_DELAY_MS, 'initial-mount');");
        expect(canvasSource).toContain('const captureScreenshotOnMount = shouldCaptureInitialPrototypePreviewScreenshot({');
        expect(canvasSource).toContain('captureScreenshotOnMount={captureScreenshotOnMount}');
        expect(canvasSource).toContain("window.addEventListener('axhub:embedInitialScreenshotAttempted', handler);");
        expect(canvasSource).toContain('initialPreviewScreenshotAttemptedAt: new Date().toISOString()');
        expect(canvasSource).toContain('captureScreenshotOnMount: undefined');
    });

    it('does not skip the final exit capture when teardown is pending', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain('const canSkipUnchangedScreenshot = !pendingIframeTeardownRef.current');
        expect(source).toContain('if (canSkipUnchangedScreenshot && !shouldForceScreenshotRequest(reason) && !shouldRequestEmbedScreenshot({');
    });

    it('captures screenshots in the parent page and never sends CAPTURE_SCREENSHOT to the iframe', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain("import { captureSameOriginIframeScreenshot } from './parentScreenshotCapture';");
        expect(source).toContain('const screenshot = await captureSameOriginIframeScreenshot({');
        expect(source).toContain("window.dispatchEvent(new CustomEvent('axhub:embedScreenshotReady'");
        expect(source).toContain("completeCaptureRef.current('captured');");
        expect(source).toContain("completeCaptureRef.current('failed');");
        expect(source).not.toContain("type: 'CAPTURE_SCREENSHOT'");
        expect(source).not.toContain("event.data.type === 'SCREENSHOT_CAPTURED'");
        expect(source).not.toContain("event.data.type === 'SCREENSHOT_FAILED'");
    });

    it('keeps stale screenshots visible until a new capture succeeds', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).toContain('const staleScreenshot = !imgError ? (screenshotUrl || screenshotDataUrl) : screenshotDataUrl;');
        expect(source).toContain('const effectiveScreenshot = preferredScreenshot || staleScreenshot || null;');
        expect(source).not.toContain('setScreenshotDataUrl(null);');
    });

    it('does not activate the screenshot overlay from a single click', () => {
        const source = readFileSync(resolve(__dirname, './AxhubWebEmbed.tsx'), 'utf8');

        expect(source).not.toContain("import { shouldActivateEmbedOverlayClick } from './embedActivationIntent';");
        expect(source).not.toContain('handleOverlayPointerDown');
        expect(source).not.toContain('shouldActivateFromOverlayClickRef');
        expect(source).not.toContain('onClick={(e) => {');
    });
});
