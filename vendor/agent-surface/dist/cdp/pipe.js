import { installTargetSource } from "./targets.js";
class CdpEventChannel {
    closed = false;
    #handlers = new Map();
    on(method, handler) {
        const handlers = this.#handlers.get(method) ?? new Set();
        handlers.add(handler);
        this.#handlers.set(method, handlers);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0)
                this.#handlers.delete(method);
        };
    }
    waitFor(method, timeoutMs) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let removeEvent = () => { };
            let removeClose = () => { };
            const finish = (callback) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timeout);
                removeEvent();
                removeClose();
                callback();
            };
            const timeout = setTimeout(() => finish(() => reject(new Error(`CDP event ${method} timed out`))), timeoutMs);
            removeEvent = this.on(method, (params) => finish(() => resolve(params)));
            removeClose = this.on("close", () => finish(() => reject(new Error(`CDP session closed before ${method}`))));
        });
    }
    dispatch(method, params = {}) {
        this.#handlers.get(method)?.forEach((handler) => {
            Promise.resolve(handler(params)).catch(() => { });
        });
    }
    markClosed() {
        if (this.closed)
            return;
        this.closed = true;
        this.dispatch("close");
        this.#handlers.clear();
    }
}
export class CdpPipeSession extends CdpEventChannel {
    #browser;
    #sessionId;
    constructor(browser, sessionId) {
        super();
        this.#browser = browser;
        this.#sessionId = sessionId;
    }
    command(method, params = {}, timeoutMs) {
        if (this.closed)
            return Promise.reject(new Error("CDP session is closed"));
        return this.#browser.command(method, params, this.#sessionId, timeoutMs);
    }
    receive(method, params) {
        this.dispatch(method, params);
    }
    fail() {
        this.markClosed();
    }
    close() {
        if (this.closed)
            return;
        this.#browser.detach(this.#sessionId);
    }
}
export async function attachPipeTarget(browser, targetId, options) {
    const session = await browser.connect(targetId);
    try {
        return await installTargetSource(session, options);
    }
    catch (error) {
        session.close();
        throw error;
    }
}
export class CdpPipeBrowser extends CdpEventChannel {
    #commandTimeoutMs;
    #input;
    #output;
    #buffer = Buffer.alloc(0);
    #nextId = 0;
    #pending = new Map();
    #sessions = new Map();
    constructor(child, { commandTimeoutMs = 30_000 } = {}) {
        super();
        const input = child.stdio[3];
        const output = child.stdio[4];
        if (!input || typeof input.write !== "function" || !output || typeof output.on !== "function") {
            throw new Error("CDP pipe requires writable fd 3 and readable fd 4");
        }
        this.#input = input;
        this.#output = output;
        this.#commandTimeoutMs = commandTimeoutMs;
        output.on("data", (chunk) => this.#receive(Buffer.from(chunk)));
        output.once("error", (error) => this.#fail(error));
        output.once("end", () => this.#fail(new Error("CDP pipe ended")));
        input.once("error", (error) => this.#fail(error));
        child.once("exit", (code, signal) => this.#fail(new Error(`Host exited (${signal ?? code ?? "unknown"})`)));
    }
    get isClosed() {
        return this.closed;
    }
    async open() {
        await this.command("Browser.getVersion");
        await this.command("Target.setDiscoverTargets", { discover: true });
    }
    command(method, params = {}, sessionId, timeoutMs = this.#commandTimeoutMs) {
        if (this.closed)
            return Promise.reject(new Error("CDP pipe is closed"));
        const id = ++this.#nextId;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pending.delete(id);
                reject(new Error(`CDP command ${method} timed out`));
            }, timeoutMs);
            this.#pending.set(id, {
                method,
                resolve: resolve,
                reject,
                timeout,
            });
            const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
            this.#input.write(`${JSON.stringify(message)}\0`, (error) => {
                if (error)
                    this.#fail(error);
            });
        });
    }
    async targets() {
        const result = await this.command("Target.getTargets");
        return Array.isArray(result.targetInfos) ? result.targetInfos : [];
    }
    async connect(targetId) {
        const result = await this.command("Target.attachToTarget", {
            targetId,
            flatten: true,
        });
        if (!result.sessionId)
            throw new Error("CDP pipe did not return a target session id");
        const session = new CdpPipeSession(this, result.sessionId);
        this.#sessions.set(result.sessionId, session);
        return session;
    }
    detach(sessionId) {
        const session = this.#sessions.get(sessionId);
        this.#sessions.delete(sessionId);
        session?.fail();
        if (!this.closed)
            void this.command("Target.detachFromTarget", { sessionId }).catch(() => { });
    }
    close() {
        if (this.closed)
            return;
        this.#input.destroy();
        this.#output.destroy();
        this.#fail(new Error("CDP pipe closed"));
    }
    #receive(chunk) {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);
        for (let boundary = this.#buffer.indexOf(0); boundary !== -1; boundary = this.#buffer.indexOf(0)) {
            const source = this.#buffer.subarray(0, boundary).toString("utf8");
            this.#buffer = this.#buffer.subarray(boundary + 1);
            if (!source)
                continue;
            let message;
            try {
                message = JSON.parse(source);
            }
            catch {
                this.#fail(new Error("CDP pipe returned malformed JSON"));
                return;
            }
            if (Number.isInteger(message.id)) {
                const id = message.id;
                const pending = this.#pending.get(id);
                if (!pending)
                    continue;
                this.#pending.delete(id);
                clearTimeout(pending.timeout);
                const error = message.error;
                if (error)
                    pending.reject(new Error(`CDP command ${pending.method} failed: ${String(error.message ?? "unknown error")}`));
                else
                    pending.resolve(message.result);
                continue;
            }
            if (typeof message.sessionId === "string" && typeof message.method === "string") {
                this.#sessions.get(message.sessionId)?.receive(message.method, (message.params ?? {}));
                continue;
            }
            if (message.method === "Target.detachedFromTarget") {
                const sessionId = message.params?.sessionId;
                if (typeof sessionId === "string") {
                    this.#sessions.get(sessionId)?.fail();
                    this.#sessions.delete(sessionId);
                }
            }
            if (typeof message.method === "string") {
                this.dispatch(message.method, (message.params ?? {}));
            }
        }
    }
    #fail(error) {
        if (this.closed)
            return;
        for (const pending of this.#pending.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.#pending.clear();
        for (const session of this.#sessions.values())
            session.fail();
        this.#sessions.clear();
        this.markClosed();
    }
}
//# sourceMappingURL=pipe.js.map