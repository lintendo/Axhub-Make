import { CdpSession } from "./session.js";
export async function listTargets(port, { fetchImpl = globalThis.fetch, } = {}) {
    const response = await fetchImpl(`http://127.0.0.1:${port}/json`, {
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
    });
    if (!response.ok)
        throw new Error(`CDP target list returned HTTP ${response.status}`);
    const raw = await response.json();
    if (!Array.isArray(raw))
        throw new Error("CDP target list must be an array");
    return raw.filter((target) => (Boolean(target)
        && typeof target === "object"
        && target.type === "page"
        && typeof target.id === "string"
        && typeof target.url === "string"
        && typeof target.webSocketDebuggerUrl === "string"
        && target.webSocketDebuggerUrl.startsWith("ws://127.0.0.1:")));
}
export async function installTargetSource(session, { source, commandTimeoutMs, bypassCsp = false, reloadAfterInstall = false, }) {
    await session.command("Page.enable", {});
    if (bypassCsp)
        await session.command("Page.setBypassCSP", { enabled: true });
    await session.command("Runtime.enable", {});
    await session.command("Page.addScriptToEvaluateOnNewDocument", { source });
    if (reloadAfterInstall) {
        const loaded = session.waitFor("Page.loadEventFired", commandTimeoutMs);
        await Promise.all([
            session.command("Page.reload", { ignoreCache: false }),
            loaded,
        ]);
    }
    await session.command("Runtime.evaluate", { expression: source });
    return session;
}
export async function attachTarget(target, { source, WebSocketImpl, connectTimeoutMs, commandTimeoutMs, bypassCsp = false, reloadAfterInstall = false, }) {
    const session = new CdpSession(target.webSocketDebuggerUrl, {
        WebSocketImpl,
        connectTimeoutMs,
        commandTimeoutMs,
    });
    await session.connect();
    try {
        return await installTargetSource(session, {
            source,
            commandTimeoutMs,
            bypassCsp,
            reloadAfterInstall,
        });
    }
    catch (error) {
        session.close();
        throw error;
    }
}
//# sourceMappingURL=targets.js.map