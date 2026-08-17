function blocked(message) {
    return { ok: false, code: "frame-policy-blocked", message };
}
export function inspectFramePolicy(headers) {
    const xFrameOptions = headers.get("x-frame-options")?.trim().toLowerCase();
    if (xFrameOptions) {
        const directives = xFrameOptions.split(",").map((value) => value.trim());
        if (directives.includes("deny")) {
            return blocked("The page sends X-Frame-Options: DENY.");
        }
        if (directives.includes("sameorigin")) {
            return blocked("The page sends X-Frame-Options: SAMEORIGIN and cannot load inside the desktop host origin.");
        }
        return {
            ok: true,
            code: "frame-policy-unknown",
            message: `The page sends an unrecognized X-Frame-Options policy: ${xFrameOptions}.`,
        };
    }
    const csp = headers.get("content-security-policy");
    if (!csp)
        return { ok: true, code: "frame-policy-allowed" };
    const frameAncestors = csp
        .split(";")
        .map((directive) => directive.trim())
        .find((directive) => /^frame-ancestors(?:\s|$)/iu.test(directive));
    if (!frameAncestors)
        return { ok: true, code: "frame-policy-allowed" };
    const sources = frameAncestors.split(/\s+/u).slice(1).map((source) => source.toLowerCase());
    if (sources.length === 0 || sources.includes("'none'")) {
        return blocked("The page CSP sets frame-ancestors 'none'.");
    }
    if (sources.length === 1 && sources[0] === "'self'") {
        return blocked("The page CSP only allows same-origin frame ancestors.");
    }
    if (sources.includes("*") || sources.includes("app:") || sources.includes("vscode-file:")) {
        return { ok: true, code: "frame-policy-allowed" };
    }
    return {
        ok: true,
        code: "frame-policy-unknown",
        message: `The page CSP frame-ancestors policy requires a host-specific check: ${frameAncestors}.`,
    };
}
//# sourceMappingURL=frame-policy.js.map