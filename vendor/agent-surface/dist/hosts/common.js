import { existsSync } from "node:fs";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";
import { listTargets } from "../cdp/targets.js";
function expandPath(path, platform) {
    if (platform === "win32") {
        return path
            .replace(/^%LOCALAPPDATA%/, process.env.LOCALAPPDATA ?? "%LOCALAPPDATA%")
            .replace(/^%APPDATA%/, process.env.APPDATA ?? "%APPDATA%");
    }
    return path.replace(/^~(?=\/|$)/, process.env.HOME ?? "~");
}
export function resolveApplicationPath(platform, config, candidates) {
    if (config?.appPath)
        return config.appPath;
    if (platform !== "darwin" && platform !== "win32")
        return undefined;
    return candidates[platform].map((candidate) => expandPath(candidate, platform)).find((candidate) => existsSync(candidate));
}
export function discoverApplicationPaths(platform, config, candidates) {
    if (config?.appPath)
        return existsSync(config.appPath) ? [config.appPath] : [];
    if (platform !== "darwin" && platform !== "win32")
        return [];
    let resolved = candidates[platform].map((candidate) => expandPath(candidate, platform)).filter((candidate) => existsSync(candidate));
    if (config?.variant) {
        const variant = config.variant.toLowerCase();
        resolved = resolved.filter((candidate) => candidate.toLowerCase().includes(variant));
    }
    return resolved;
}
export function resolveLaunchSpec(appPath, port) {
    return { executable: appPath, args: [`--remote-debugging-port=${port}`] };
}
export function isProcessRunning(appPath, platform) {
    const processName = basename(appPath);
    try {
        if (platform === "darwin") {
            const result = spawnSync("pgrep", ["-f", appPath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
            return result.status === 0 && Boolean(result.stdout?.trim());
        }
        if (platform === "win32") {
            const result = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"], {
                encoding: "utf8",
                windowsHide: true,
                stdio: ["ignore", "pipe", "ignore"],
            });
            const escapedName = processName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return result.status === 0 && new RegExp(`^\\s*"${escapedName}"`, "im").test(result.stdout ?? "");
        }
    }
    catch {
        return false;
    }
    return false;
}
export function validTargetSocket(target, port) {
    try {
        const url = new URL(target.webSocketDebuggerUrl);
        return url.protocol === "ws:"
            && url.hostname === "127.0.0.1"
            && url.port === String(port)
            && url.pathname.startsWith("/devtools/page/");
    }
    catch {
        return false;
    }
}
export async function inspectDefinition(definition, context) {
    const config = context.config;
    const discoveredPaths = discoverApplicationPaths(context.platform, config, definition.candidates);
    const appPath = definition.preferFirstCandidate
        ? discoveredPaths[0]
        : discoveredPaths.length === 1
            ? discoveredPaths[0]
            : undefined;
    const cdpPort = config?.cdpPort ?? definition.defaultCdpPort;
    let targets = [];
    try {
        targets = await listTargets(cdpPort, { fetchImpl: context.fetchImpl });
    }
    catch {
        targets = [];
    }
    const target = targets.find((candidate) => validTargetSocket(candidate, cdpPort) && definition.targetPredicate(candidate, cdpPort));
    if (target) {
        return {
            code: "ready",
            message: "A compatible CDP target is ready.",
            appPath,
            cdpPort,
            target,
            reusedHost: true,
            canLaunch: false,
            processRunning: true,
        };
    }
    if (discoveredPaths.length > 1 && !definition.preferFirstCandidate) {
        return {
            code: "configuration-required",
            message: "Multiple host variants were found; set hosts.<host>.appPath or hosts.<host>.variant.",
            cdpPort,
            reusedHost: false,
            canLaunch: false,
            processRunning: false,
        };
    }
    const processRunning = appPath ? isProcessRunning(appPath, context.platform) : false;
    if (!appPath) {
        return {
            code: "app-not-found",
            message: "The desktop host was not found; provide hosts.<host>.appPath.",
            cdpPort,
            reusedHost: false,
            canLaunch: false,
            processRunning,
        };
    }
    if (processRunning) {
        return {
            code: "restart-required",
            message: "The host is already running without the required CDP target; quit it and retry with the integrated launcher.",
            appPath,
            cdpPort,
            reusedHost: false,
            canLaunch: false,
            processRunning: true,
        };
    }
    return {
        code: "launchable",
        message: "The host application was found but no compatible CDP target is ready.",
        appPath,
        cdpPort,
        reusedHost: false,
        canLaunch: true,
        processRunning: false,
    };
}
export async function doctorDefinition(definition, context) {
    const inspection = await inspectDefinition(definition, context);
    if (!definition.verified) {
        if (inspection.code === "app-not-found" || inspection.code === "configuration-required") {
            return {
                host: definition.id,
                status: "unavailable",
                code: inspection.code,
                message: inspection.message,
                appPath: inspection.appPath,
                cdpPort: inspection.cdpPort,
            };
        }
        return {
            host: definition.id,
            status: "experimental",
            code: "adapter-not-qualified",
            message: "The installed build is detected, but this adapter has not passed its iframe surface smoke check.",
            appPath: inspection.appPath,
            cdpPort: inspection.cdpPort,
        };
    }
    if (inspection.code === "ready") {
        return {
            host: definition.id,
            status: "supported",
            code: "ready",
            message: inspection.message,
            appPath: inspection.appPath,
            cdpPort: inspection.cdpPort,
        };
    }
    if (inspection.code === "app-not-found") {
        return {
            host: definition.id,
            status: "unavailable",
            code: inspection.code,
            message: inspection.message,
            appPath: inspection.appPath,
            cdpPort: inspection.cdpPort,
        };
    }
    if (inspection.code === "restart-required" || inspection.code === "configuration-required") {
        return {
            host: definition.id,
            status: "unavailable",
            code: inspection.code,
            message: inspection.message,
            appPath: inspection.appPath,
            cdpPort: inspection.cdpPort,
        };
    }
    return {
        host: definition.id,
        status: "unavailable",
        code: "cdp-not-ready",
        message: "The host must be launched with its adapter CDP arguments; do not start a competing ordinary instance.",
        appPath: inspection.appPath,
        cdpPort: inspection.cdpPort,
    };
}
export function createAdapter(definition) {
    return {
        id: definition.id,
        defaultCdpPort: definition.defaultCdpPort,
        support: definition.support,
        verified: definition.verified,
        resolveApplicationPath(platform, config) {
            return resolveApplicationPath(platform, config, definition.candidates);
        },
        launchSpec: resolveLaunchSpec,
        matchesTarget(target, port) {
            return validTargetSocket(target, port) && definition.targetPredicate(target, port);
        },
        domProfile() {
            return definition.domProfile;
        },
        inspect(context) {
            return inspectDefinition(definition, context);
        },
        doctor(context) {
            return doctorDefinition(definition, context);
        },
    };
}
//# sourceMappingURL=common.js.map