import { getHostAdapter, listHostAdapters } from "../hosts/registry.js";
const BRIDGE_HOSTS = new Set(["codex", "cursor", "workbuddy"]);
function bridgeAdapters(adapters) {
    return (adapters ?? listHostAdapters()).filter((adapter) => BRIDGE_HOSTS.has(adapter.id));
}
function candidateFromInspection(adapter, inspection) {
    return {
        host: adapter.id,
        running: Boolean(inspection.target || inspection.processRunning),
        connectable: Boolean(inspection.target),
        ...(inspection.appPath ? { appPath: inspection.appPath } : {}),
        ...(inspection.cdpPort ? { cdpPort: inspection.cdpPort } : {}),
    };
}
function result(candidates, selectedHost, selectionReason, selected, code = selectedHost ? "ready" : "host-not-found", message) {
    return {
        candidates,
        ...(selectedHost ? { selectedHost } : {}),
        selectionReason,
        running: selected?.running ?? false,
        ...(code ? { code } : {}),
        ...(message ? { message } : {}),
    };
}
function selectOne(candidates, preferredHosts, kind) {
    const eligible = kind === "running"
        ? candidates.filter((candidate) => candidate.connectable === true)
        : candidates.filter((candidate) => candidate.appPath && !candidate.running);
    if (eligible.length === 1)
        return { candidate: eligible[0], reason: kind };
    if (eligible.length === 0)
        return { reason: "ambiguous" };
    const preferred = eligible.filter((candidate) => preferredHosts?.includes(candidate.host));
    if (preferred.length === 1)
        return { candidate: preferred[0], reason: "preferred" };
    return { reason: "ambiguous" };
}
async function inspectAdapter(adapter, platform, hostConfigs, fetchImpl) {
    try {
        const inspection = await adapter.inspect({ platform, config: hostConfigs?.[adapter.id], fetchImpl });
        return { candidate: candidateFromInspection(adapter, inspection), inspection };
    }
    catch (error) {
        return { candidate: { host: adapter.id, running: false }, error };
    }
}
export async function detectHost(options = {}) {
    const platform = options.platform ?? process.platform;
    const adapters = bridgeAdapters(options.adapters)
        .filter((adapter) => !options.hosts || options.hosts.includes(adapter.id));
    const inspected = await Promise.all(adapters.map((adapter) => inspectAdapter(adapter, platform, options.hostConfigs, options.fetchImpl)));
    const candidates = inspected.map(({ candidate }) => candidate);
    const running = selectOne(candidates, options.preferredHosts, "running");
    if (running.candidate)
        return result(candidates, running.candidate.host, running.reason, running.candidate);
    if (running.reason === "ambiguous") {
        const runningEligible = candidates.filter((candidate) => candidate.connectable === true);
        if (runningEligible.length > 1) {
            return result(candidates, undefined, "ambiguous", undefined, "ambiguous", "Multiple running hosts are connectable; specify host or preferredHosts.");
        }
    }
    const installed = selectOne(candidates, options.preferredHosts, "installed");
    if (installed.candidate)
        return result(candidates, installed.candidate.host, installed.reason, installed.candidate);
    const installedEligible = candidates.filter((candidate) => candidate.appPath && !candidate.running);
    if (installedEligible.length > 1) {
        return result(candidates, undefined, "ambiguous", undefined, "ambiguous", "Multiple installed hosts are available; specify host or preferredHosts.");
    }
    return result(candidates, undefined, "host-not-found", undefined, "host-not-found", "No supported running or installed host was found.");
}
export async function resolveHost(options) {
    if (options.host === "auto")
        return detectHost(options);
    const adapter = (options.adapters ?? listHostAdapters()).find((candidate) => candidate.id === options.host)
        ?? getHostAdapter(options.host);
    const inspected = await inspectAdapter(adapter, options.platform ?? process.platform, options.hostConfigs, options.fetchImpl);
    if (inspected.error) {
        return result([inspected.candidate], undefined, "host-not-found", undefined, "host-api-error", "The selected host could not be inspected.");
    }
    return result([inspected.candidate], adapter.id, "explicit", inspected.candidate);
}
export function isHostSelector(value) {
    return value === "auto" || value === "codex" || value === "cursor" || value === "workbuddy"
        || value === "traework" || value === "qoderwork" || value === "trae";
}
//# sourceMappingURL=host-selection.js.map