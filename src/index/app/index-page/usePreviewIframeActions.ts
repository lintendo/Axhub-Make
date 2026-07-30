import { useCallback, useRef, type MutableRefObject, type RefObject } from 'react';
import type { PreviewConfig } from '../../domains/device/preview-layout';
import type { PreviewPane } from './previewActions.helpers';

type UsePreviewIframeActionsParams = {
    previewMode: PreviewConfig['previewMode'];
    messageApi: {
        warning: (content: string) => void;
    };
};

type PreviewIframeActions = {
    containerRef: RefObject<HTMLDivElement>;
    previewIframeRef: MutableRefObject<HTMLIFrameElement | null>;
    secondaryPreviewIframeRef: MutableRefObject<HTMLIFrameElement | null>;
    getPrimaryPreviewIframe: () => HTMLIFrameElement | null;
    getSecondaryPreviewIframe: () => HTMLIFrameElement | null;
    getPreviewIframe: (pane?: PreviewPane) => HTMLIFrameElement | null;
    getPreviewIframes: () => HTMLIFrameElement[];
    markPreviewIframeLoaded: (iframe: HTMLIFrameElement | null | undefined) => void;
    getPreviewIframeGeneration: (iframe: HTMLIFrameElement | null | undefined) => number;
    getIframeOrigin: (iframe?: HTMLIFrameElement | null) => string;
    postToPreview: (payload: unknown, iframe?: HTMLIFrameElement | null) => boolean;
};

type PreviewIframeGenerationTracker = {
    markLoaded: (iframe: HTMLIFrameElement | null | undefined) => void;
    getGeneration: (iframe: HTMLIFrameElement | null | undefined) => number;
};

export function createPreviewIframeGenerationTracker(): PreviewIframeGenerationTracker {
    const generations = new WeakMap<HTMLIFrameElement, number>();
    return {
        markLoaded(iframe) {
            if (!iframe) return;
            generations.set(iframe, (generations.get(iframe) ?? 0) + 1);
        },
        getGeneration(iframe) {
            return iframe ? generations.get(iframe) ?? 0 : 0;
        },
    };
}

export function resolveCurrentPreviewIframe(
    referencedIframe: HTMLIFrameElement | null | undefined,
    container: HTMLDivElement | null | undefined,
): HTMLIFrameElement | null {
    if (referencedIframe?.isConnected && (!container || container.contains(referencedIframe))) {
        return referencedIframe;
    }
    return container?.querySelector('iframe') ?? null;
}

export function usePreviewIframeActions({
    previewMode,
    messageApi,
}: UsePreviewIframeActionsParams): PreviewIframeActions {
    const containerRef = useRef<HTMLDivElement>(null);
    const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
    const secondaryPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
    const previewIframeGenerationTrackerRef = useRef<PreviewIframeGenerationTracker | null>(null);
    if (!previewIframeGenerationTrackerRef.current) {
        previewIframeGenerationTrackerRef.current = createPreviewIframeGenerationTracker();
    }

    const getPrimaryPreviewIframe = useCallback(() => resolveCurrentPreviewIframe(
        previewIframeRef.current,
        containerRef.current,
    ), []);

    const getSecondaryPreviewIframe = useCallback(() => secondaryPreviewIframeRef.current, []);

    const getPreviewIframe = useCallback((pane: PreviewPane = 'primary') => (
        pane === 'secondary' ? getSecondaryPreviewIframe() : getPrimaryPreviewIframe()
    ), [getPrimaryPreviewIframe, getSecondaryPreviewIframe]);

    const getPreviewIframes = useCallback(() => {
        const iframes = [getPrimaryPreviewIframe()];
        if (previewMode === 'split') {
            iframes.push(getSecondaryPreviewIframe());
        }
        return iframes.filter(Boolean) as HTMLIFrameElement[];
    }, [getPrimaryPreviewIframe, getSecondaryPreviewIframe, previewMode]);

    const markPreviewIframeLoaded = useCallback((iframe: HTMLIFrameElement | null | undefined) => {
        previewIframeGenerationTrackerRef.current?.markLoaded(iframe);
    }, []);

    const getPreviewIframeGeneration = useCallback((iframe: HTMLIFrameElement | null | undefined) => (
        previewIframeGenerationTrackerRef.current?.getGeneration(iframe) ?? 0
    ), []);

    const getIframeOrigin = useCallback((iframe?: HTMLIFrameElement | null) => {
        const targetIframe = iframe ?? getPrimaryPreviewIframe();
        if (!targetIframe) return window.location.origin;
        const src = targetIframe.getAttribute('src') || targetIframe.src;
        if (!src) return window.location.origin;
        try {
            return new URL(src, window.location.origin).origin;
        } catch {
            return window.location.origin;
        }
    }, [getPrimaryPreviewIframe]);

    const postToPreview = useCallback((payload: unknown, iframe?: HTMLIFrameElement | null) => {
        const targetIframe = iframe ?? getPrimaryPreviewIframe();
        if (!targetIframe || !targetIframe.contentWindow) {
            messageApi.warning('未找到可操作的预览窗口');
            return false;
        }
        targetIframe.contentWindow.postMessage(payload, getIframeOrigin(targetIframe));
        return true;
    }, [getIframeOrigin, getPrimaryPreviewIframe, messageApi]);

    return {
        containerRef,
        previewIframeRef,
        secondaryPreviewIframeRef,
        getPrimaryPreviewIframe,
        getSecondaryPreviewIframe,
        getPreviewIframe,
        getPreviewIframes,
        markPreviewIframeLoaded,
        getPreviewIframeGeneration,
        getIframeOrigin,
        postToPreview,
    };
}
