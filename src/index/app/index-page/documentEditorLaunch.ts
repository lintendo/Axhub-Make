const DOCUMENT_PREVIEW_WAIT_MS = 10000;
const DOCUMENT_PREVIEW_POLL_MS = 50;

export function waitForDocumentPreviewReady(
    getIframe: () => HTMLIFrameElement | null,
    targetUrl: string,
    hostOrigin: string,
    signal?: AbortSignal,
): Promise<boolean> {
    if (!targetUrl || signal?.aborted) return Promise.resolve(false);

    let expectedUrl: string;
    try {
        expectedUrl = new URL(targetUrl, hostOrigin).href;
    } catch {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const startedAt = Date.now();
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (ready: boolean) => {
            if (timer !== null) clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            resolve(ready);
        };
        const onAbort = () => finish(false);
        const check = () => {
            if (signal?.aborted) {
                finish(false);
                return;
            }
            try {
                const iframe = getIframe();
                if (iframe?.contentDocument?.readyState === 'complete'
                    && iframe.contentWindow?.location.href === expectedUrl) {
                    finish(true);
                    return;
                }
            } catch {
                // The target document is not accessible yet.
            }
            if (Date.now() - startedAt >= DOCUMENT_PREVIEW_WAIT_MS) {
                finish(false);
                return;
            }
            timer = setTimeout(check, DOCUMENT_PREVIEW_POLL_MS);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        check();
    });
}
