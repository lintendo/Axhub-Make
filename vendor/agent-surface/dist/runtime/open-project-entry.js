import { openEntry } from "./open-entry.js";
import { openProject, validateProjectOpenOptions } from "./open-project.js";
import { getHostAdapter } from "../hosts/registry.js";
const providerHosts = {
    codex: "codex",
    cursor: "cursor",
    workbuddy: "workbuddy",
    traework: "traework",
    qoderwork: "qoderwork",
};
const locks = new Map();
const PROJECT_RENDERER_SETTLE_ATTEMPTS = 20;
const PROJECT_RENDERER_CANDIDATE_STABLE_SAMPLES = 2;
async function withProviderLock(provider, task) {
    const previous = locks.get(provider) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    locks.set(provider, current);
    try {
        return await current;
    }
    finally {
        if (locks.get(provider) === current)
            locks.delete(provider);
    }
}
async function inspectTargetId(adapter, context) {
    try {
        return (await adapter.inspect(context)).target?.id;
    }
    catch {
        return undefined;
    }
}
async function waitForProjectRenderer(adapter, context, previousTargetId, options) {
    const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const intervalMs = Math.max(1, options.intervalMs ?? 150);
    let candidateTargetId;
    let stableSamples = 0;
    for (let attempt = 0; attempt < PROJECT_RENDERER_SETTLE_ATTEMPTS; attempt += 1) {
        const targetId = await inspectTargetId(adapter, context);
        if (targetId) {
            stableSamples = targetId === candidateTargetId ? stableSamples + 1 : 1;
            candidateTargetId = targetId;
            if (targetId !== previousTargetId
                && stableSamples >= PROJECT_RENDERER_CANDIDATE_STABLE_SAMPLES)
                return true;
        }
        else {
            candidateTargetId = undefined;
            stableSamples = 0;
        }
        if (attempt + 1 < PROJECT_RENDERER_SETTLE_ATTEMPTS)
            await delay(intervalMs);
    }
    return Boolean(previousTargetId
        && candidateTargetId === previousTargetId
        && stableSamples >= PROJECT_RENDERER_CANDIDATE_STABLE_SAMPLES);
}
export async function openProjectAndEntry(options, dependencies = {}) {
    return withProviderLock(options.provider, async () => {
        const openEntryImpl = dependencies.openEntryImpl ?? openEntry;
        const openProjectImpl = dependencies.openProjectImpl ?? openProject;
        const validation = validateProjectOpenOptions(options);
        if (validation)
            return validation;
        if (options.provider === "opencode") {
            if (options.surface) {
                return {
                    ok: false,
                    code: "surface-unsupported",
                    message: "OpenCode project opening does not support Agent Surface injection.",
                    provider: options.provider,
                    targetPath: options.targetPath,
                    ...(options.appPath ? { appPath: options.appPath } : {}),
                };
            }
            return openProjectImpl(options);
        }
        const host = providerHosts[options.provider];
        const requestedHost = options.surface?.host;
        if (requestedHost !== undefined && requestedHost !== host) {
            return {
                ok: false,
                code: "surface-host-mismatch",
                message: `${options.provider} project opening can only inject into the ${host} host.`,
                provider: options.provider,
                targetPath: options.targetPath,
                ...(options.appPath ? { appPath: options.appPath } : {}),
            };
        }
        const baseConfig = options.surface?.config;
        if (!baseConfig || !options.surface) {
            return openProjectImpl(options);
        }
        const config = {
            ...baseConfig,
            hosts: {
                ...baseConfig.hosts,
                [host]: {
                    ...baseConfig.hosts?.[host],
                    ...(options.appPath ? { appPath: options.appPath } : {}),
                },
            },
        };
        const adapter = (dependencies.getAdapterImpl ?? getHostAdapter)(host);
        const hostContext = {
            platform: options.platform ?? process.platform,
            config: config.hosts?.[host],
            fetchImpl: options.surface.hostFetchImpl ?? options.surface.fetchImpl,
        };
        const preflight = await openEntryImpl({
            host,
            entryId: options.surface.entryId,
            config,
            activate: false,
            configDir: options.surface.configDir,
            platform: options.platform,
            fetchImpl: options.surface.fetchImpl,
            hostFetchImpl: options.surface.hostFetchImpl,
            WebSocketImpl: options.surface.WebSocketImpl,
            now: options.surface.now,
            delay: options.surface.delay,
            intervalMs: options.surface.intervalMs,
            spawnImpl: options.spawnImpl,
        });
        if (!preflight.ok)
            return { ok: false, code: preflight.code, message: preflight.message, provider: options.provider, targetPath: options.targetPath, project: undefined, surface: preflight };
        const previousTargetId = await inspectTargetId(adapter, hostContext);
        const project = await openProjectImpl(options);
        if (!project.ok)
            return { ...project, surface: preflight };
        const rendererReady = await waitForProjectRenderer(adapter, hostContext, previousTargetId, options.surface);
        if (!rendererReady) {
            return {
                ...project,
                ok: false,
                code: "project-renderer-timeout",
                message: `The ${options.provider} project opened, but its compatible renderer did not become ready.`,
                project,
                surface: preflight,
            };
        }
        const surface = await openEntryImpl({
            host,
            entryId: options.surface.entryId,
            config,
            activate: options.surface.activate,
            configDir: options.surface.configDir,
            platform: options.platform,
            fetchImpl: options.surface.fetchImpl,
            hostFetchImpl: options.surface.hostFetchImpl,
            WebSocketImpl: options.surface.WebSocketImpl,
            now: options.surface.now,
            delay: options.surface.delay,
            intervalMs: options.surface.intervalMs,
            spawnImpl: options.spawnImpl,
        });
        return {
            ...project,
            project,
            surface,
            ok: surface.ok,
            code: surface.ok ? "project-and-surface-opened" : surface.code,
            message: surface.ok ? `${project.message} ${surface.message}` : surface.message,
        };
    });
}
//# sourceMappingURL=open-project-entry.js.map