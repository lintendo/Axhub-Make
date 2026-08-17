import {
    captureSameOriginIframeScreenshot,
    type CaptureSameOriginIframeScreenshotResult,
} from './canvas-embeds/parentScreenshotCapture';

export type MultiPageScreenshot = CaptureSameOriginIframeScreenshotResult;

export interface CaptureMultiPageScreenshotParams {
    iframe: HTMLIFrameElement | null | undefined;
    width: number;
    height: number;
}

export async function captureMultiPageScreenshot({
    iframe,
    width,
    height,
}: CaptureMultiPageScreenshotParams): Promise<CaptureSameOriginIframeScreenshotResult | null> {
    if (!iframe?.contentWindow) {
        return null;
    }

    try {
        return await captureSameOriginIframeScreenshot({
            iframe,
            width,
            height,
            captureFullContent: false,
        });
    } catch {
        return null;
    }
}
