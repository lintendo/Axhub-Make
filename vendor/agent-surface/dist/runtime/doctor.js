import { HOST_IDS, validateConfig } from "../config/validate.js";
import { getHostAdapter } from "../hosts/registry.js";
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
    return {
        ok: reports.every((report) => report.status === "supported"),
        hosts: reports,
    };
}
//# sourceMappingURL=doctor.js.map