import { HOST_IDS, validateConfig } from "../config/validate.js";
import { getHostAdapter } from "../hosts/registry.js";
import { detectHost } from "../bridge/host-selection.js";
import { createUnsupportedHostBridgeCapabilities, HOST_BRIDGE_RUNTIME_VERSION, } from "./host-bridge.js";
const BRIDGE_HOSTS = new Set(["codex", "cursor", "workbuddy"]);
export async function doctor(options) {
    const platform = options.platform ?? process.platform;
    const config = options.config ? validateConfig(options.config) : undefined;
    const hosts = options.hosts.length > 0 ? options.hosts : [...HOST_IDS];
    const reports = await Promise.all(hosts.map(async (host) => {
        try {
            return await getHostAdapter(host).doctor({
                platform,
                config: options.hostConfigs?.[host] ?? config?.hosts?.[host],
                fetchImpl: options.fetchImpl,
            });
        }
        catch (error) {
            return {
                host,
                status: "unavailable",
                code: "doctor-failed",
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }));
    const hostDetection = await detectHost({
        hosts,
        hostConfigs: options.hostConfigs ?? config?.hosts,
        platform,
        fetchImpl: options.fetchImpl,
    });
    return {
        ok: reports.every((report) => report.status === "supported"),
        hosts: reports,
        hostDetection,
        hostBridge: {
            runtimeVersion: HOST_BRIDGE_RUNTIME_VERSION,
            capabilities: hosts
                .filter((host) => BRIDGE_HOSTS.has(host))
                .map(createUnsupportedHostBridgeCapabilities),
        },
    };
}
//# sourceMappingURL=doctor.js.map