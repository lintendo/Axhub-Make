const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5000;
export class CdpSession {
    #closed = false;
    #connectTimeoutMs;
    #commandTimeoutMs;
    #handlers = new Map();
    #nextId = 0;
    #pending = new Map();
    #socket = null;
    #url;
    #WebSocketImpl;
    constructor(url, { WebSocketImpl = globalThis.WebSocket, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, } = {}) {
        if (typeof WebSocketImpl !== "function")
            throw new Error("WebSocket is unavailable; Node.js 22 or newer is required");
        this.#url = url;
        this.#WebSocketImpl = WebSocketImpl;
        this.#connectTimeoutMs = connectTimeoutMs;
        this.#commandTimeoutMs = commandTimeoutMs;
    }
    async connect() {
        if (this.#socket && !this.#closed)
            return this;
        this.#closed = false;
        const socket = new this.#WebSocketImpl(this.#url);
        this.#socket = socket;
        try {
            await new Promise((resolve, reject) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    reject(new Error(`CDP connection timed out for ${this.#url}`));
                }, this.#connectTimeoutMs);
                socket.onopen = () => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    resolve();
                };
                socket.onerror = () => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error(`Unable to connect to CDP target ${this.#url}`));
                };
            });
        }
        catch (error) {
            if (socket.readyState < 2)
                socket.close();
            this.#socket = null;
            throw error;
        }
        socket.onmessage = (event) => this.#receive(event.data);
        socket.onclose = () => this.#handleClose();
        return this;
    }
    on(method, handler) {
        this.#handlers.set(method, handler);
    }
    command(method, params = {}) {
        if (!this.#socket || this.#socket.readyState !== 1 || this.#closed) {
            return Promise.reject(new Error("CDP session is not connected"));
        }
        const id = ++this.#nextId;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pending.delete(id);
                reject(new Error(`CDP command ${method} timed out`));
            }, this.#commandTimeoutMs);
            this.#pending.set(id, {
                method,
                resolve: resolve,
                reject,
                timeout,
            });
            this.#socket?.send(JSON.stringify({ id, method, params }));
        });
    }
    close() {
        if (this.#socket && this.#socket.readyState < 2)
            this.#socket.close();
        this.#handleClose();
        this.#socket = null;
    }
    #receive(raw) {
        let message;
        try {
            message = JSON.parse(String(raw));
        }
        catch {
            return;
        }
        if (Number.isInteger(message.id)) {
            const id = message.id;
            const pending = this.#pending.get(id);
            if (!pending)
                return;
            this.#pending.delete(id);
            clearTimeout(pending.timeout);
            if (message.error && typeof message.error === "object") {
                const error = message.error;
                pending.reject(new Error(`CDP command ${pending.method} failed: ${String(error.message ?? "unknown error")}`));
            }
            else {
                pending.resolve(message.result);
            }
            return;
        }
        if (typeof message.method !== "string")
            return;
        const handler = this.#handlers.get(message.method);
        if (handler)
            Promise.resolve(handler((message.params ?? {}))).catch(() => { });
    }
    #handleClose() {
        if (this.#closed)
            return;
        this.#closed = true;
        for (const pending of this.#pending.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`CDP session closed during ${pending.method}`));
        }
        this.#pending.clear();
        const handler = this.#handlers.get("close");
        if (handler)
            Promise.resolve(handler({})).catch(() => { });
    }
}
//# sourceMappingURL=session.js.map