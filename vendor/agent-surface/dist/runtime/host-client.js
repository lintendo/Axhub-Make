import { mkdtemp } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachPipeTarget, CdpPipeBrowser } from "../cdp/pipe.js";
import { CdpSession } from "../cdp/session.js";
import { attachTarget as attachWebSocketTarget, listTargets } from "../cdp/targets.js";
import { startCommand, startPipeCommand, terminateStartedCommand } from "../core/start-command.js";
import { resolveOperationTimeoutMs } from "./timeout.js";
const TARGET_READY_SLICE_MS = 1_500;
const pipeClients = new Map();
export async function reserveLoopbackPort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                server.close();
                reject(new Error("Could not reserve a loopback CDP port."));
                return;
            }
            server.close((error) => {
                if (error)
                    reject(error);
                else
                    resolve(address.port);
            });
        });
    });
}
export function createClientUserDataDir(host) {
    return mkdtemp(join(tmpdir(), `agent-surface-${host}-`));
}
export async function waitForTargetReady(target, adapter, options) {
    const deadline = options.now() + options.timeoutMs;
    const remaining = () => Math.max(1, deadline - options.now());
    const session = new CdpSession(target.webSocketDebuggerUrl, {
        WebSocketImpl: options.WebSocketImpl,
        connectTimeoutMs: remaining(),
        commandTimeoutMs: remaining(),
    });
    try {
        await session.connect();
        if (options.now() >= deadline)
            return false;
        await session.command("Runtime.enable", {}, remaining());
        const selector = adapter.domProfile().sidebarSlotSelector;
        while (options.now() < deadline) {
            const result = await session.command("Runtime.evaluate", {
                expression: `document.readyState !== "loading" && Boolean(document.querySelector(${JSON.stringify(selector)}))`,
                returnByValue: true,
            }, remaining());
            const ready = result && typeof result === "object"
                ? result.result?.value === true
                : false;
            if (ready)
                return true;
            await options.delay(Math.min(100, Math.max(1, deadline - options.now())));
        }
        return false;
    }
    catch {
        return false;
    }
    finally {
        session.close();
    }
}
function pipeTarget(record, target) {
    if (!target.targetId || target.type !== "page" || typeof target.url !== "string")
        return undefined;
    return {
        id: target.targetId,
        type: target.type,
        ...(target.title ? { title: target.title } : {}),
        url: target.url,
        webSocketDebuggerUrl: `pipe://${encodeURIComponent(record.id)}/${encodeURIComponent(target.targetId)}`,
        transport: "pipe",
    };
}
async function waitForPipeTargetReady(record, target, adapter, options) {
    const deadline = options.now() + options.timeoutMs;
    const remaining = () => Math.max(1, deadline - options.now());
    const session = await record.browser.connect(target.id);
    try {
        await session.command("Runtime.enable", {}, remaining());
        const selector = adapter.domProfile().sidebarSlotSelector;
        while (options.now() < deadline) {
            const result = await session.command("Runtime.evaluate", {
                expression: `document.readyState !== "loading" && Boolean(document.querySelector(${JSON.stringify(selector)}))`,
                returnByValue: true,
            }, remaining());
            const ready = result && typeof result === "object"
                ? result.result?.value === true
                : false;
            if (ready)
                return true;
            await options.delay(Math.min(100, Math.max(1, deadline - options.now())));
        }
        return false;
    }
    catch {
        return false;
    }
    finally {
        session.close();
    }
}
async function findReadyPipeTarget(record, adapter, deadline, now, delay) {
    const targets = (await record.browser.targets())
        .map((target) => pipeTarget(record, target))
        .filter((target) => Boolean(target))
        .filter((target) => adapter.matchesTarget(target, record.cdpPort));
    for (const target of targets) {
        const remaining = deadline - now();
        if (remaining <= 0)
            break;
        if (await waitForPipeTargetReady(record, target, adapter, {
            now,
            delay,
            timeoutMs: Math.min(TARGET_READY_SLICE_MS, remaining),
        }))
            return target;
    }
    return undefined;
}
function closePipeClient(record) {
    if (pipeClients.get(record.id) === record)
        pipeClients.delete(record.id);
    record.browser.close();
}
async function waitForPipeClient(record, adapter, options, dependencies, startedClient) {
    const now = options.now ?? Date.now;
    const delay = dependencies.delayImpl
        ?? options.delay
        ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const deadline = now() + resolveOperationTimeoutMs(options.timeoutMs);
    while (now() < deadline && !record.browser.isClosed) {
        try {
            const target = await findReadyPipeTarget(record, adapter, deadline, now, delay);
            if (target) {
                return {
                    code: "ready",
                    message: startedClient ? "A new compatible client is ready." : "The isolated client is ready.",
                    appPath: record.appPath,
                    cdpPort: record.cdpPort,
                    target,
                    reusedHost: !startedClient,
                    canLaunch: false,
                    processRunning: true,
                    startedClient,
                    userDataDir: record.userDataDir,
                    transport: "pipe",
                    pipeClientId: record.id,
                    attachTarget: (candidate, attachOptions) => attachPipeTarget(record.browser, candidate.id, attachOptions),
                    closeClient: () => closePipeClient(record),
                };
            }
        }
        catch {
            // The renderer may still be starting or replacing its target.
        }
        await delay(100);
    }
    return failure(adapter, "cdp-start-timeout", "The isolated client did not expose a compatible CDP pipe target in time.", {
        appPath: record.appPath,
        cdpPort: record.cdpPort,
        userDataDir: record.userDataDir,
        processRunning: !record.browser.isClosed,
        transport: "pipe",
        pipeClientId: record.id,
    });
}
function failure(adapter, code, message, extra = {}) {
    return {
        code,
        message,
        cdpPort: adapter.defaultCdpPort,
        reusedHost: false,
        canLaunch: false,
        processRunning: false,
        startedClient: false,
        ...extra,
    };
}
async function findReadyTarget(adapter, context, cdpPort, deadline, options, dependencies, now, delay) {
    const targets = await (dependencies.listTargetsImpl ?? listTargets)(cdpPort, {
        fetchImpl: context.fetchImpl,
    });
    const matchingTargets = targets.filter((candidate) => adapter.matchesTarget(candidate, cdpPort));
    for (const target of matchingTargets) {
        const remaining = deadline - now();
        if (remaining <= 0)
            break;
        const ready = await (dependencies.waitForTargetReadyImpl ?? waitForTargetReady)(target, adapter, {
            WebSocketImpl: options.WebSocketImpl,
            now,
            delay,
            timeoutMs: Math.min(TARGET_READY_SLICE_MS, remaining),
        });
        if (ready)
            return target;
    }
    return undefined;
}
async function waitForStartedClient(adapter, context, appPath, cdpPort, userDataDir, started, options, dependencies) {
    try {
        await started.spawned;
    }
    catch (error) {
        return failure(adapter, "host-launch-failed", error instanceof Error ? error.message : String(error), {
            appPath,
            cdpPort,
            userDataDir,
        });
    }
    const now = options.now ?? Date.now;
    const delay = dependencies.delayImpl
        ?? options.delay
        ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const deadline = now() + resolveOperationTimeoutMs(options.timeoutMs);
    let exit;
    void started.exited.then((value) => { exit = value; });
    await Promise.resolve();
    while (now() < deadline) {
        try {
            const target = await findReadyTarget(adapter, context, cdpPort, deadline, options, dependencies, now, delay);
            if (target) {
                return {
                    code: "ready",
                    message: "A new compatible client is ready.",
                    appPath,
                    cdpPort,
                    target,
                    reusedHost: false,
                    canLaunch: false,
                    processRunning: true,
                    startedClient: true,
                    userDataDir,
                };
            }
        }
        catch {
            // The new CDP endpoint is not ready yet.
        }
        // macOS launches app bundles through `open`; that launcher exits with code 0
        // before the managed ChatGPT process exposes its CDP target.
        const exitedWithFailure = exit?.code !== undefined
            && exit.code !== null
            && (exit.code !== 0 || context.platform !== "darwin");
        if (exit && (exit.error || exitedWithFailure || exit.signal)) {
            const message = exit.error?.message
                ?? (exit.code !== null && exit.code !== undefined
                    ? `The host exited with code ${exit.code}.`
                    : `The host exited with signal ${exit.signal}.`);
            return failure(adapter, "host-launch-failed", message, {
                appPath,
                cdpPort,
                userDataDir,
            });
        }
        await delay(100);
    }
    (dependencies.terminateStartedCommandImpl ?? terminateStartedCommand)(started, { platform: options.platform });
    return failure(adapter, "cdp-start-timeout", "The isolated client did not expose a compatible CDP target in time.", {
        appPath,
        cdpPort,
        userDataDir,
    });
}
async function reconnectClient(options, dependencies) {
    const { adapter, client, context } = options;
    if (client.transport === "pipe") {
        const record = client.pipeClientId ? pipeClients.get(client.pipeClientId) : undefined;
        if (!record || record.browser.isClosed) {
            return failure(adapter, "pipe-client-unavailable", "The managed CDP pipe client is no longer available.", {
                appPath: client.appPath,
                cdpPort: client.cdpPort,
                userDataDir: client.userDataDir,
                transport: "pipe",
                pipeClientId: client.pipeClientId,
            });
        }
        return waitForPipeClient(record, adapter, options, dependencies, client.startedClient);
    }
    const now = options.now ?? Date.now;
    const delay = dependencies.delayImpl
        ?? options.delay
        ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const deadline = now() + resolveOperationTimeoutMs(options.timeoutMs);
    while (now() < deadline) {
        try {
            const target = await findReadyTarget(adapter, context, client.cdpPort, deadline, options, dependencies, now, delay);
            if (target) {
                return {
                    code: "ready",
                    message: "The isolated client is ready.",
                    appPath: client.appPath,
                    cdpPort: client.cdpPort,
                    target,
                    reusedHost: !client.startedClient,
                    canLaunch: false,
                    processRunning: true,
                    startedClient: client.startedClient,
                    ...(client.userDataDir ? { userDataDir: client.userDataDir } : {}),
                };
            }
        }
        catch {
            // The renderer may be restarting while a project is being opened.
        }
        await delay(100);
    }
    return failure(adapter, "cdp-start-timeout", "The isolated client did not expose a compatible renderer in time.", {
        appPath: client.appPath,
        cdpPort: client.cdpPort,
        processRunning: true,
        startedClient: client.startedClient,
        ...(client.userDataDir ? { userDataDir: client.userDataDir } : {}),
    });
}
async function launchNewClient(options, dependencies) {
    const { adapter, context, platform } = options;
    const appPath = adapter.resolveApplicationPath(platform, context.config);
    if (!appPath) {
        return failure(adapter, "app-not-found", "The desktop client was not found; provide hosts.<host>.appPath.");
    }
    if (adapter.cdpTransport?.(platform) === "pipe") {
        const cdpPort = context.config?.cdpPort ?? adapter.defaultCdpPort;
        let userDataDir;
        let started;
        let browser;
        try {
            userDataDir = await (dependencies.createUserDataDirImpl ?? createClientUserDataDir)(adapter.id);
            await adapter.prepareUserDataDir?.(userDataDir, platform);
            const launchEnvironment = await adapter.prepareLaunchEnvironment?.(userDataDir, platform, process.env)
                ?? process.env;
            const launch = adapter.newClientLaunchSpec(appPath, cdpPort, platform, userDataDir);
            started = (dependencies.startPipeImpl ?? startPipeCommand)(launch, {
                platform,
                spawnImpl: options.spawnImpl,
                env: launchEnvironment,
            });
            browser = (dependencies.createPipeBrowserImpl ?? ((command, pipeOptions) => new CdpPipeBrowser(command.child, pipeOptions)))(started, { commandTimeoutMs: resolveOperationTimeoutMs(options.timeoutMs) });
            await started.spawned;
            await browser.open();
        }
        catch (error) {
            if (started) {
                (dependencies.terminateStartedCommandImpl ?? terminateStartedCommand)(started, { platform });
            }
            return failure(adapter, "host-launch-failed", error instanceof Error ? error.message : String(error), { appPath });
        }
        if (!started || !browser) {
            return failure(adapter, "host-launch-failed", "The CDP pipe client did not initialize.", { appPath });
        }
        const record = {
            id: randomUUID(),
            appPath,
            cdpPort,
            userDataDir,
            started,
            browser,
        };
        pipeClients.set(record.id, record);
        browser.on("close", () => {
            if (pipeClients.get(record.id) === record)
                pipeClients.delete(record.id);
        });
        void started.exited.then(() => {
            if (pipeClients.get(record.id) === record)
                pipeClients.delete(record.id);
        });
        const inspection = await waitForPipeClient(record, adapter, options, dependencies, true);
        if (!inspection.target) {
            closePipeClient(record);
            (dependencies.terminateStartedCommandImpl ?? terminateStartedCommand)(started, { platform });
        }
        return inspection;
    }
    let cdpPort;
    let userDataDir;
    let started;
    try {
        [cdpPort, userDataDir] = await Promise.all([
            (dependencies.reservePortImpl ?? reserveLoopbackPort)(),
            (dependencies.createUserDataDirImpl ?? createClientUserDataDir)(adapter.id),
        ]);
        await adapter.prepareUserDataDir?.(userDataDir, platform);
        const launch = adapter.newClientLaunchSpec(appPath, cdpPort, platform, userDataDir);
        started = (dependencies.startImpl ?? startCommand)(launch, {
            platform,
            spawnImpl: options.spawnImpl,
        });
    }
    catch (error) {
        return failure(adapter, "host-launch-failed", error instanceof Error ? error.message : String(error), { appPath });
    }
    return waitForStartedClient(adapter, context, appPath, cdpPort, userDataDir, started, options, dependencies);
}
async function reuseOrLaunchClient(options, dependencies) {
    const { adapter, context, platform } = options;
    let initial;
    try {
        initial = options.initialInspection ?? await adapter.inspect(context);
    }
    catch (error) {
        return failure(adapter, "host-inspection-failed", error instanceof Error ? error.message : String(error));
    }
    if (initial.target)
        return { ...initial, startedClient: false };
    if (!initial.canLaunch || !initial.appPath)
        return { ...initial, startedClient: false };
    let started;
    try {
        const launch = adapter.launchSpec(initial.appPath, initial.cdpPort, platform);
        started = (dependencies.startImpl ?? startCommand)(launch, {
            platform,
            spawnImpl: options.spawnImpl,
        });
    }
    catch (error) {
        return {
            ...initial,
            code: "host-launch-failed",
            message: error instanceof Error ? error.message : String(error),
            startedClient: false,
        };
    }
    try {
        await started.spawned;
    }
    catch (error) {
        return {
            ...initial,
            code: "host-launch-failed",
            message: error instanceof Error ? error.message : String(error),
            startedClient: false,
        };
    }
    const now = options.now ?? Date.now;
    const delay = dependencies.delayImpl
        ?? options.delay
        ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const deadline = now() + resolveOperationTimeoutMs(options.timeoutMs);
    let exit;
    void started.exited.then((value) => { exit = value; });
    while (now() < deadline) {
        const inspection = await adapter.inspect(context);
        if (inspection.target)
            return { ...inspection, reusedHost: false, startedClient: true };
        if (exit?.error || (exit?.code !== undefined && exit.code !== null && exit.code !== 0)) {
            return {
                ...inspection,
                code: "host-launch-failed",
                message: exit.error?.message ?? `The host exited with code ${exit.code}.`,
                startedClient: false,
            };
        }
        await delay(100);
    }
    return {
        ...initial,
        code: "cdp-start-timeout",
        message: "The host launched, but its CDP target did not become ready.",
        startedClient: false,
    };
}
export async function acquireHostClient(options, dependencies = {}) {
    const inspection = await (options.client
        ? reconnectClient(options, dependencies)
        : options.newClient === false
            ? reuseOrLaunchClient(options, dependencies)
            : launchNewClient(options, dependencies));
    if (!inspection.target || inspection.attachTarget)
        return inspection;
    const attachImpl = dependencies.attachImpl ?? attachWebSocketTarget;
    return {
        ...inspection,
        attachTarget: (target, attachOptions) => attachImpl(target, attachOptions),
    };
}
//# sourceMappingURL=host-client.js.map