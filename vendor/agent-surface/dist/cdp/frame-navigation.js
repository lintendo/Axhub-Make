function findNamedFrame(tree, name) {
    if (tree.frame.name === name)
        return tree.frame;
    for (const child of tree.childFrames ?? []) {
        const found = findNamedFrame(child, name);
        if (found)
            return found;
    }
    return undefined;
}
function normalizeExpectedUrl(value) {
    try {
        const url = new URL(value);
        // The injected runtime adds this transport-only parameter for desktop hosts.
        url.searchParams.delete("parentOrigin");
        return url.href;
    }
    catch {
        return value;
    }
}
export async function waitForFrameNavigation(session, entryId, options = {}) {
    const now = options.now ?? Date.now;
    const delay = options.delay ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const timeoutMs = Math.max(1, options.timeoutMs ?? 5_000);
    const intervalMs = Math.max(1, options.intervalMs ?? 50);
    const deadline = now() + timeoutMs;
    const frameName = `axhub-agent-surface:${entryId}`;
    while (true) {
        let response;
        let targets;
        try {
            [response, targets] = await Promise.all([
                session.command("Page.getFrameTree", {}),
                session.command("Target.getTargets", {}),
            ]);
        }
        catch (error) {
            return {
                ok: false,
                code: "frame-load-failed",
                message: error instanceof Error ? error.message : String(error),
            };
        }
        const frame = findNamedFrame(response.frameTree, frameName);
        if (frame) {
            if (frame.unreachableUrl || frame.url.startsWith("chrome-error://")) {
                const failedUrl = frame.unreachableUrl || frame.url;
                return {
                    ok: false,
                    code: "frame-load-failed",
                    message: `The injected surface frame could not load ${failedUrl}.`,
                };
            }
            if (frame.url && frame.url !== "about:blank")
                return { ok: true, url: frame.url };
        }
        const expectedUrl = options.expectedUrl ? normalizeExpectedUrl(options.expectedUrl) : "";
        const oopif = expectedUrl
            ? (targets.targetInfos ?? []).find((target) => (target.type === "iframe" && normalizeExpectedUrl(target.url) === expectedUrl))
            : undefined;
        if (oopif)
            return { ok: true, url: oopif.url };
        const remaining = deadline - now();
        if (remaining <= 0) {
            return {
                ok: false,
                code: "frame-load-timeout",
                message: `The injected surface frame did not finish loading within ${timeoutMs}ms.`,
            };
        }
        await delay(Math.min(intervalMs, remaining));
    }
}
//# sourceMappingURL=frame-navigation.js.map