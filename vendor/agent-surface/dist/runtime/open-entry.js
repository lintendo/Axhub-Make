import { resolve } from "node:path";
import { activateFrameEntryExpression, deactivateFrameEntryExpression, evaluateFrameRuntime, } from "../cdp/frame-runtime.js";
import { waitForFrameNavigation } from "../cdp/frame-navigation.js";
import { buildEntryInjection, toInjectionEntry } from "../cdp/injection.js";
import { entriesForHost, findEntry, resolveHealthUrl, validateConfig } from "../config/validate.js";
import { hydrateEntryIcons } from "../config/icons.js";
import { inspectFramePolicy } from "../core/frame-policy.js";
import { probeHealth } from "../core/health.js";
import { startCommand } from "../core/start-command.js";
import { getHostAdapter } from "../hosts/registry.js";
import { resolveHost } from "../bridge/host-selection.js";
import { acquireHostClient, } from "./host-client.js";
import { createHostBridgeOptions } from "./host-bridge.js";
import { DEFAULT_OPERATION_TIMEOUT_MS, resolveOperationTimeoutMs } from "./timeout.js";
function failure(options, code, message, extra = {}) {
    return { ok: false, code, message, host: options.host, entryId: options.entryId, ...extra };
}
function normalizeConfigPaths(config, configDir) {
    return {
        ...config,
        entries: config.entries.map((entry) => ({
            ...entry,
            ...(entry.icon?.type === "path" ? { icon: { ...entry.icon, value: resolve(configDir, entry.icon.value) } } : {}),
            ...(entry.start ? {
                start: {
                    ...entry.start,
                    ...(entry.start.cwd ? { cwd: resolve(configDir, entry.start.cwd) } : {}),
                },
            } : {}),
        })),
        ...(config.hosts ? {
            hosts: Object.fromEntries(Object.entries(config.hosts).map(([host, hostConfig]) => [host, {
                    ...hostConfig,
                    ...(hostConfig?.appPath ? { appPath: resolve(configDir, hostConfig.appPath) } : {}),
                }])),
        } : {}),
    };
}
const TRANSIENT_HOST_DOM_CODES = new Set([
    "sidebar-slot-not-found",
    "sidebar-entry-not-visible",
    "content-root-not-found",
]);
async function waitForFrameRuntime(session, expression, options, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {
    const now = options.now ?? Date.now;
    const delay = options.delay ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const deadline = now() + timeoutMs;
    while (true) {
        const result = await evaluateFrameRuntime(session, expression);
        if (result.ok || !TRANSIENT_HOST_DOM_CODES.has(result.code))
            return result;
        const remaining = deadline - now();
        if (remaining <= 0)
            return result;
        await delay(Math.min(Math.max(1, options.intervalMs ?? 100), remaining));
    }
}
async function waitForService(url, child, options, timeoutMs) {
    const now = options.now ?? Date.now;
    const delay = options.delay ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const startedAt = now();
    const deadline = startedAt + Math.min(Math.max(1, timeoutMs), 30_000);
    let exit;
    const exitPromise = child.exited.then((value) => { exit = value; });
    while (true) {
        if (exit?.error || (exit?.code !== undefined && exit.code !== null && exit.code !== 0)) {
            return {
                ok: false,
                code: "service-start-failed",
                message: exit.error?.message ?? `The start command exited with code ${exit.code}.`,
                elapsedMs: Math.max(0, now() - startedAt),
            };
        }
        const remaining = deadline - now();
        if (remaining <= 0) {
            return {
                ok: false,
                code: "service-start-timeout",
                message: "The start command was issued, but the service did not become healthy within 30 seconds.",
                elapsedMs: Math.max(0, now() - startedAt),
            };
        }
        const health = await probeHealth(url, {
            fetchImpl: options.fetchImpl,
            timeoutMs: Math.min(1500, remaining),
            now,
        });
        if (health.ok) {
            return {
                ok: true,
                code: "ready",
                message: "The service is healthy.",
                elapsedMs: Math.max(0, now() - startedAt),
                headers: health.headers,
            };
        }
        const waitMs = Math.min(options.intervalMs ?? 250, Math.max(1, deadline - now()));
        if (exit === undefined)
            await Promise.race([delay(waitMs), exitPromise]);
        else
            await delay(waitMs);
    }
}
export async function openEntry(options, dependencies = {}) {
    const timeoutMs = resolveOperationTimeoutMs(options.timeoutMs);
    const platform = options.platform ?? process.platform;
    if (platform !== "darwin" && platform !== "win32") {
        return failure(options, "unsupported-platform", "Agent Surface supports macOS and Windows only.");
    }
    let config;
    try {
        config = normalizeConfigPaths(validateConfig(options.config), options.configDir ?? process.cwd());
    }
    catch (error) {
        return failure(options, "invalid-config", error instanceof Error ? error.message : String(error));
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
        return failure(options, selected.code ?? "host-not-found", selected.message ?? "No supported host was selected.");
    }
    const hostOptions = { ...options, host: selected.selectedHost };
    let entry;
    try {
        entry = findEntry(config, hostOptions.host, hostOptions.entryId);
    }
    catch (error) {
        return failure(hostOptions, "entry-not-found", error instanceof Error ? error.message : String(error));
    }
    const adapter = (dependencies.getAdapter ?? getHostAdapter)(hostOptions.host);
    if (!adapter.verified) {
        return failure(hostOptions, "adapter-not-qualified", `${hostOptions.host} has not passed its iframe surface smoke check.`);
    }
    const context = {
        platform,
        config: config.hosts?.[hostOptions.host],
        fetchImpl: hostOptions.hostFetchImpl ?? hostOptions.fetchImpl,
    };
    let preflight;
    if (!options.client && options.newClient === false) {
        try {
            preflight = await adapter.inspect(context);
        }
        catch (error) {
            return failure(options, "host-inspection-failed", error instanceof Error ? error.message : String(error));
        }
        if (!preflight.target && !preflight.canLaunch) {
            return failure(options, preflight.code, preflight.message);
        }
    }
    else if (!options.client && !adapter.resolveApplicationPath(platform, context.config)) {
        return failure(options, "app-not-found", "The desktop client was not found; provide hosts.<host>.appPath.");
    }
    let startedCommand = false;
    let readinessWaitMs = 0;
    const initialHealth = await probeHealth(resolveHealthUrl(entry), {
        fetchImpl: hostOptions.fetchImpl,
        timeoutMs: Math.min(entry.startupTimeoutMs ?? 30_000, 1500),
        now: options.now,
    });
    let frameHeaders = resolveHealthUrl(entry) === entry.url && initialHealth.ok
        ? initialHealth.headers
        : undefined;
    if (!initialHealth.ok) {
        if (!entry.start)
            return failure(options, "service-unavailable", "The service is unhealthy and no start command is configured.");
        const startImpl = dependencies.startImpl ?? startCommand;
        let child;
        try {
            child = startImpl(entry.start, {
                platform,
                spawnImpl: options.spawnImpl,
                cwd: options.configDir,
            });
        }
        catch (error) {
            return failure(options, "service-start-failed", error instanceof Error ? error.message : String(error));
        }
        startedCommand = true;
        const readiness = await waitForService(resolveHealthUrl(entry), child, options, entry.startupTimeoutMs ?? 30_000);
        readinessWaitMs = readiness.elapsedMs;
        if (!readiness.ok)
            return failure(options, readiness.code, readiness.message, { startedCommand, readinessWaitMs });
        if (resolveHealthUrl(entry) === entry.url)
            frameHeaders = readiness.headers;
    }
    if (!frameHeaders) {
        const frameProbe = await probeHealth(entry.url, {
            fetchImpl: hostOptions.fetchImpl,
            timeoutMs: Math.min(entry.startupTimeoutMs ?? 30_000, 1500),
            now: options.now,
        });
        if (!frameProbe.ok) {
            return failure(options, "service-unavailable", "The iframe page is unavailable.", { startedCommand, readinessWaitMs });
        }
        frameHeaders = frameProbe.headers;
    }
    const framePolicy = inspectFramePolicy(frameHeaders ?? new Headers());
    if (!framePolicy.ok) {
        return failure(options, framePolicy.code, framePolicy.message ?? "The iframe page policy blocks embedding.", { startedCommand, readinessWaitMs });
    }
    const host = await acquireHostClient({
        adapter,
        context,
        platform,
        newClient: options.newClient,
        client: options.client,
        initialInspection: preflight,
        timeoutMs,
        spawnImpl: options.spawnImpl,
        now: options.now,
        delay: options.delay,
        WebSocketImpl: options.WebSocketImpl,
    }, dependencies);
    if (!host.target)
        return failure(hostOptions, host.code, host.message, { startedCommand, readinessWaitMs });
    let injectionEntries;
    try {
        injectionEntries = await hydrateEntryIcons(entriesForHost(config, hostOptions.host));
    }
    catch (error) {
        return failure(hostOptions, "invalid-icon", error instanceof Error ? error.message : String(error), { startedCommand, readinessWaitMs });
    }
    const source = buildEntryInjection(injectionEntries.map((candidate) => toInjectionEntry(candidate, candidate.icon?.type === "data-url" ? candidate.icon.value : undefined)), adapter.domProfile(), createHostBridgeOptions(hostOptions.host, injectionEntries.map((candidate) => new URL(candidate.url).origin)));
    let session;
    try {
        session = await host.attachTarget(host.target, {
            source,
            WebSocketImpl: options.WebSocketImpl,
            ...adapter.injectionPolicy?.(),
            connectTimeoutMs: timeoutMs,
            commandTimeoutMs: timeoutMs,
        });
        const runtimeExpression = options.activate === false
            ? deactivateFrameEntryExpression()
            : activateFrameEntryExpression(entry.id);
        const activation = await waitForFrameRuntime(session, runtimeExpression, options, timeoutMs);
        if (!activation.ok) {
            return failure(hostOptions, activation.code, activation.message ?? "The iframe surface could not be activated.", { startedCommand, readinessWaitMs });
        }
        if (options.activate !== false) {
            const navigation = await waitForFrameNavigation(session, entry.id, {
                expectedUrl: entry.url,
                now: options.now,
                delay: options.delay,
                intervalMs: options.intervalMs,
                timeoutMs,
            });
            if (!navigation.ok) {
                try {
                    await evaluateFrameRuntime(session, deactivateFrameEntryExpression());
                }
                catch (error) {
                    return failure(hostOptions, "frame-rollback-failed", `${navigation.message} Native host restoration also failed: ${error instanceof Error ? error.message : String(error)}`, { startedCommand, readinessWaitMs });
                }
                return failure(hostOptions, navigation.code, navigation.message, { startedCommand, readinessWaitMs });
            }
        }
    }
    catch (error) {
        return failure(hostOptions, "injection-failed", error instanceof Error ? error.message : String(error), { startedCommand, readinessWaitMs });
    }
    finally {
        session?.close();
    }
    return {
        ok: true,
        code: options.activate === false ? "injected" : "surface-activated",
        message: options.activate === false
            ? `Injected ${entry.name} into ${hostOptions.host}.`
            : `Opened ${entry.name} in ${hostOptions.host}.`,
        host: hostOptions.host,
        entryId: entry.id,
        reusedHost: host.reusedHost,
        startedClient: host.startedClient,
        cdpPort: host.cdpPort,
        ...(host.appPath ? {
            client: {
                appPath: host.appPath,
                cdpPort: host.cdpPort,
                ...(host.userDataDir ? { userDataDir: host.userDataDir } : {}),
                startedClient: host.startedClient,
                ...(host.transport ? { transport: host.transport } : {}),
                ...(host.pipeClientId ? { pipeClientId: host.pipeClientId } : {}),
            },
        } : {}),
        startedCommand,
        readinessWaitMs,
    };
}
//# sourceMappingURL=open-entry.js.map