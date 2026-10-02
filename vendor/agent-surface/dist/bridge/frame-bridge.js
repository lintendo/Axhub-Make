import { HOST_BRIDGE_CHANNEL, isHostBridgeRequest, isHostBridgeResponse, } from "./types.js";
export class HostBridgeRequestError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = "HostBridgeRequestError";
        this.code = code;
        this.details = details;
    }
}
function randomRequestId() {
    const random = globalThis.crypto?.randomUUID?.();
    return random ?? `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function serializedSize(value) {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    }
    catch {
        return Number.POSITIVE_INFINITY;
    }
}
export class HostBridgeClient {
    #sourceWindow;
    #targetWindow;
    #targetOrigin;
    #timeoutMs;
    #maxMessageBytes;
    #pending = new Map();
    #onMessage = (event) => this.#handleMessage(event);
    #disposed = false;
    constructor(options) {
        let targetOrigin;
        try {
            targetOrigin = new URL(options.targetOrigin);
        }
        catch {
            throw new HostBridgeRequestError("forbidden-origin", "A specific target origin is required.");
        }
        const isWebOrigin = ["http:", "https:"].includes(targetOrigin.protocol)
            && targetOrigin.origin === options.targetOrigin;
        const isFileRootOrigin = options.targetOrigin === "file://";
        const normalizedTargetOrigin = options.targetOrigin.replace(/\/$/, "");
        const normalizedParsedOrigin = targetOrigin.href.replace(/\/$/, "");
        const isDesktopOrigin = !["http:", "https:", "file:"].includes(targetOrigin.protocol)
            && !targetOrigin.username
            && !targetOrigin.password
            && !targetOrigin.search
            && !targetOrigin.hash
            && (targetOrigin.pathname === "" || targetOrigin.pathname === "/")
            && normalizedParsedOrigin === normalizedTargetOrigin;
        if (!options.targetOrigin
            || options.targetOrigin === "*"
            || (!isWebOrigin && !isFileRootOrigin && !isDesktopOrigin)) {
            throw new HostBridgeRequestError("forbidden-origin", "A specific target origin is required.");
        }
        this.#sourceWindow = options.sourceWindow ?? globalThis.window;
        this.#targetWindow = options.targetWindow ?? this.#sourceWindow.parent;
        this.#targetOrigin = options.targetOrigin;
        this.#timeoutMs = Math.max(1, options.timeoutMs ?? 10_000);
        this.#maxMessageBytes = Math.max(1, options.maxMessageBytes ?? 64 * 1024);
        this.#sourceWindow.addEventListener("message", this.#onMessage);
    }
    request(method, params) {
        if (this.#disposed) {
            return Promise.reject(new HostBridgeRequestError("timeout", "The Host Bridge client is disposed."));
        }
        const request = {
            channel: HOST_BRIDGE_CHANNEL,
            type: "request",
            requestId: randomRequestId(),
            method,
            ...(params === undefined ? {} : { params }),
        };
        if (!isHostBridgeRequest(request)) {
            return Promise.reject(new HostBridgeRequestError("invalid-request", "The Host Bridge request is invalid."));
        }
        if (serializedSize(request) > this.#maxMessageBytes) {
            return Promise.reject(new HostBridgeRequestError("invalid-request", "The Host Bridge request is too large."));
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pending.delete(request.requestId);
                reject(new HostBridgeRequestError("timeout", `Host Bridge request ${request.requestId} timed out.`));
            }, this.#timeoutMs);
            this.#pending.set(request.requestId, { resolve, reject, timeout });
            try {
                this.#targetWindow.postMessage(request, this.#targetOrigin);
            }
            catch (error) {
                clearTimeout(timeout);
                this.#pending.delete(request.requestId);
                reject(new HostBridgeRequestError("host-api-error", error instanceof Error ? error.message : String(error)));
            }
        });
    }
    dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        this.#sourceWindow.removeEventListener("message", this.#onMessage);
        for (const [requestId, pending] of this.#pending) {
            clearTimeout(pending.timeout);
            pending.reject(new HostBridgeRequestError("timeout", `Host Bridge request ${requestId} was disposed.`));
        }
        this.#pending.clear();
    }
    #handleMessage(event) {
        if (this.#disposed || event.source !== this.#targetWindow || event.origin !== this.#targetOrigin)
            return;
        if (serializedSize(event.data) > this.#maxMessageBytes || !isHostBridgeResponse(event.data))
            return;
        const response = event.data;
        const pending = this.#pending.get(response.requestId);
        if (!pending)
            return;
        this.#pending.delete(response.requestId);
        clearTimeout(pending.timeout);
        if (response.ok)
            pending.resolve(response.result);
        else
            pending.reject(new HostBridgeRequestError(response.error.code, response.error.message, response.error.details));
    }
}
//# sourceMappingURL=frame-bridge.js.map