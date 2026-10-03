const DEFAULT_REQUEST_TIMEOUT_MS = 1500;
const DEFAULT_POLL_INTERVAL_MS = 250;
export async function probeHealth(url, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, now = Date.now, } = {}) {
    const startedAt = now();
    try {
        const response = await fetchImpl(url, {
            method: "GET",
            cache: "no-store",
            signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
        });
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            headers: response.headers,
            ...(response.url ? { responseUrl: response.url } : {}),
            elapsedMs: Math.max(0, now() - startedAt),
        };
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            elapsedMs: Math.max(0, now() - startedAt),
        };
    }
}
export async function waitForHealth(url, { fetchImpl = globalThis.fetch, timeoutMs = 30_000, intervalMs = DEFAULT_POLL_INTERVAL_MS, delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), now = Date.now, } = {}) {
    const startedAt = now();
    const deadline = startedAt + Math.min(Math.max(1, timeoutMs), 30_000);
    let lastResult = { ok: false, elapsedMs: 0 };
    while (true) {
        const remaining = deadline - now();
        if (remaining < 0)
            return { ...lastResult, elapsedMs: Math.max(0, now() - startedAt) };
        lastResult = await probeHealth(url, {
            fetchImpl,
            timeoutMs: Math.min(DEFAULT_REQUEST_TIMEOUT_MS, Math.max(1, remaining)),
            now,
        });
        if (lastResult.ok)
            return { ...lastResult, elapsedMs: Math.max(0, now() - startedAt) };
        const afterRequest = deadline - now();
        if (afterRequest <= 0)
            return { ...lastResult, elapsedMs: Math.max(0, now() - startedAt) };
        await delay(Math.min(Math.max(1, intervalMs), afterRequest));
    }
}
//# sourceMappingURL=health.js.map