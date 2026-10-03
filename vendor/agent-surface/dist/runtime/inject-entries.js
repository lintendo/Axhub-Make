import { evaluateFrameRuntime, frameRuntimeStatusExpression } from "../cdp/frame-runtime.js";
import { buildEntryInjection, toInjectionEntry } from "../cdp/injection.js";
import { entriesForHost, validateConfig } from "../config/validate.js";
import { hydrateEntryIcons } from "../config/icons.js";
import { resolve } from "node:path";
import { getHostAdapter } from "../hosts/registry.js";
import { resolveHost } from "../bridge/host-selection.js";
import { acquireHostClient, } from "./host-client.js";
import { createHostBridgeOptions } from "./host-bridge.js";
import { DEFAULT_OPERATION_TIMEOUT_MS, resolveOperationTimeoutMs } from "./timeout.js";
const TRANSIENT_HOST_DOM_CODES = new Set([
    "sidebar-slot-not-found",
    "sidebar-entry-not-visible",
    "content-root-not-found",
]);
async function waitForInjectedRuntime(session, options, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {
    const now = options.now ?? Date.now;
    const delay = options.delay ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const deadline = now() + timeoutMs;
    while (true) {
        const status = await evaluateFrameRuntime(session, frameRuntimeStatusExpression());
        if (status.ok || !TRANSIENT_HOST_DOM_CODES.has(status.code))
            return status;
        const remaining = deadline - now();
        if (remaining <= 0)
            return status;
        await delay(Math.min(Math.max(1, options.intervalMs ?? 100), remaining));
    }
}
export async function injectEntries(options, dependencies = {}) {
    const timeoutMs = resolveOperationTimeoutMs(options.timeoutMs);
    const platform = options.platform ?? process.platform;
    if (platform !== "darwin" && platform !== "win32") {
        return { ok: false, code: "unsupported-platform", message: "Agent Surface supports macOS and Windows only.", host: options.host };
    }
    let config;
    try {
        config = validateConfig(options.config);
    }
    catch (error) {
        return { ok: false, code: "invalid-config", message: error instanceof Error ? error.message : String(error), host: options.host };
    }
    const selected = options.host === "auto"
        ? await (dependencies.resolveHostImpl ?? resolveHost)({
            host: options.host,
            preferredHosts: options.preferredHosts,
            platform,
            hostConfigs: config.hosts,
            fetchImpl: options.hostFetchImpl ?? options.fetchImpl,
        })
        : { selectedHost: options.host };
    if (!selected.selectedHost) {
        return { ok: false, code: selected.code ?? "host-not-found", message: selected.message ?? "No supported host was selected.", host: options.host };
    }
    const hostId = selected.selectedHost;
    let entries;
    try {
        entries = await hydrateEntryIcons(entriesForHost(config, hostId).map((entry) => (entry.icon?.type === "path"
            ? { ...entry, icon: { ...entry.icon, value: resolve(options.configDir ?? process.cwd(), entry.icon.value) } }
            : entry)));
    }
    catch (error) {
        return { ok: false, code: "invalid-icon", message: error instanceof Error ? error.message : String(error), host: options.host };
    }
    if (entries.length === 0)
        return { ok: false, code: "entry-not-found", message: `No entries are configured for ${hostId}.`, host: hostId };
    const adapter = (dependencies.getAdapter ?? getHostAdapter)(hostId);
    if (!adapter.verified)
        return { ok: false, code: "adapter-not-qualified", message: `${hostId} is not qualified.`, host: hostId };
    const configuredHost = config.hosts?.[hostId];
    const context = {
        platform,
        config: configuredHost?.appPath
            ? { ...configuredHost, appPath: resolve(options.configDir ?? process.cwd(), configuredHost.appPath) }
            : configuredHost,
        fetchImpl: options.hostFetchImpl ?? options.fetchImpl,
    };
    const inspection = await acquireHostClient({
        adapter,
        context,
        platform,
        newClient: options.newClient,
        timeoutMs,
        spawnImpl: options.spawnImpl,
        now: options.now,
        delay: dependencies.delay ?? options.delay,
        WebSocketImpl: options.WebSocketImpl,
    }, dependencies);
    if (!inspection.target) {
        return { ok: false, code: inspection.code, message: inspection.message, host: hostId };
    }
    let session;
    try {
        session = await inspection.attachTarget(inspection.target, {
            source: buildEntryInjection(entries.map((entry) => toInjectionEntry(entry, entry.icon?.type === "data-url" ? entry.icon.value : undefined)), adapter.domProfile(), createHostBridgeOptions(hostId, entries.map((entry) => new URL(entry.url).origin))),
            WebSocketImpl: options.WebSocketImpl,
            ...adapter.injectionPolicy?.(),
            connectTimeoutMs: timeoutMs,
            commandTimeoutMs: timeoutMs,
        });
        const status = await waitForInjectedRuntime(session, {
            now: dependencies.now ?? options.now,
            delay: dependencies.delay ?? options.delay,
            intervalMs: dependencies.intervalMs ?? options.intervalMs,
        }, timeoutMs);
        if (!status.ok) {
            return {
                ok: false,
                code: status.code,
                message: status.message ?? "The iframe surface could not be injected.",
                host: hostId,
            };
        }
    }
    catch (error) {
        return { ok: false, code: "injection-failed", message: error instanceof Error ? error.message : String(error), host: hostId };
    }
    finally {
        session?.close();
    }
    return {
        ok: true,
        code: "injected",
        message: `Injected ${entries.length} entr${entries.length === 1 ? "y" : "ies"} into ${hostId}.`,
        host: hostId,
        injectedEntryIds: entries.map((entry) => entry.id),
        reusedHost: inspection.reusedHost,
        startedClient: inspection.startedClient,
        cdpPort: inspection.cdpPort,
    };
}
//# sourceMappingURL=inject-entries.js.map