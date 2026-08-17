import { attachTarget } from "../cdp/targets.js";
import { evaluateFrameRuntime, frameRuntimeStatusExpression } from "../cdp/frame-runtime.js";
import { buildEntryInjection, toInjectionEntry } from "../cdp/injection.js";
import { entriesForHost, validateConfig } from "../config/validate.js";
import { hydrateEntryIcons } from "../config/icons.js";
import { resolve } from "node:path";
import { getHostAdapter } from "../hosts/registry.js";
export async function injectEntries(options, dependencies = {}) {
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
    let entries;
    try {
        entries = await hydrateEntryIcons(entriesForHost(config, options.host).map((entry) => (entry.icon?.type === "path"
            ? { ...entry, icon: { ...entry.icon, value: resolve(options.configDir ?? process.cwd(), entry.icon.value) } }
            : entry)));
    }
    catch (error) {
        return { ok: false, code: "invalid-icon", message: error instanceof Error ? error.message : String(error), host: options.host };
    }
    if (entries.length === 0)
        return { ok: false, code: "entry-not-found", message: `No entries are configured for ${options.host}.`, host: options.host };
    const adapter = (dependencies.getAdapter ?? getHostAdapter)(options.host);
    if (!adapter.verified)
        return { ok: false, code: "adapter-not-qualified", message: `${options.host} is not qualified.`, host: options.host };
    const context = {
        platform,
        config: config.hosts?.[options.host],
        fetchImpl: options.hostFetchImpl ?? options.fetchImpl,
    };
    let inspection;
    try {
        inspection = await adapter.inspect(context);
    }
    catch (error) {
        return { ok: false, code: "host-inspection-failed", message: error instanceof Error ? error.message : String(error), host: options.host };
    }
    if (!inspection.target)
        return { ok: false, code: inspection.code, message: inspection.message, host: options.host };
    let session;
    try {
        session = await (dependencies.attachImpl ?? attachTarget)(inspection.target, {
            source: buildEntryInjection(entries.map((entry) => toInjectionEntry(entry, entry.icon?.type === "data-url" ? entry.icon.value : undefined)), adapter.domProfile()),
            WebSocketImpl: options.WebSocketImpl,
        });
        const status = await evaluateFrameRuntime(session, frameRuntimeStatusExpression());
        if (!status.ok) {
            return {
                ok: false,
                code: status.code,
                message: status.message ?? "The iframe surface could not be injected.",
                host: options.host,
            };
        }
    }
    catch (error) {
        return { ok: false, code: "injection-failed", message: error instanceof Error ? error.message : String(error), host: options.host };
    }
    finally {
        session?.close();
    }
    return {
        ok: true,
        code: "injected",
        message: `Injected ${entries.length} entr${entries.length === 1 ? "y" : "ies"} into ${options.host}.`,
        host: options.host,
        injectedEntryIds: entries.map((entry) => entry.id),
    };
}
//# sourceMappingURL=inject-entries.js.map