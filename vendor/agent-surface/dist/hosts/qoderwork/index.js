import { readFileSync } from "node:fs";
import { posix, win32 } from "node:path";
import { createAdapter } from "../common.js";
function qoderWorkDataDirectoryName(appPath) {
    return /qoderwork cn/iu.test(appPath ?? "") ? "QoderWork CN" : "QoderWork";
}
function macApplicationBundle(appPath) {
    const marker = appPath.indexOf(".app/");
    if (marker >= 0)
        return appPath.slice(0, marker + ".app".length);
    return appPath.endsWith(".app") ? appPath : undefined;
}
export function buildQoderWorkLaunchSpec(appPath, platform) {
    if (platform !== "darwin")
        return { executable: appPath, args: [] };
    const application = macApplicationBundle(appPath);
    if (!application) {
        throw new Error("QoderWork appPath must point to a macOS .app bundle.");
    }
    return { executable: "open", args: ["-a", application] };
}
export function qoderWorkDevToolsActivePortPaths(platform, appPath, environment = { HOME: process.env.HOME, APPDATA: process.env.APPDATA }) {
    const directoryName = qoderWorkDataDirectoryName(appPath);
    if (platform === "darwin" && environment.HOME) {
        return [posix.join(environment.HOME, "Library", "Application Support", directoryName, "DevToolsActivePort")];
    }
    if (platform === "win32" && environment.APPDATA) {
        return [win32.join(environment.APPDATA, directoryName, "DevToolsActivePort")];
    }
    return [];
}
export function parseQoderWorkDevToolsActivePort(value) {
    const port = Number(value.split(/\r?\n/u, 1)[0]);
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined;
}
export function readQoderWorkDevToolsActivePort(platform, appPath, environment = { HOME: process.env.HOME, APPDATA: process.env.APPDATA }, readFile = readFileSync) {
    for (const path of qoderWorkDevToolsActivePortPaths(platform, appPath, environment)) {
        try {
            const port = parseQoderWorkDevToolsActivePort(readFile(path, "utf8"));
            if (port)
                return port;
        }
        catch {
            // The file is created only after QoderWork has enabled its random CDP port.
        }
    }
    return undefined;
}
const definition = {
    id: "qoderwork",
    defaultCdpPort: 9234,
    support: "supported",
    verified: true,
    preferFirstCandidate: true,
    candidates: {
        darwin: [
            "/Applications/QoderWork.app/Contents/MacOS/QoderWork",
            "/Applications/QoderWork CN.app/Contents/MacOS/QoderWork CN",
        ],
        win32: [
            "%LOCALAPPDATA%/Programs/QoderWork/QoderWork.exe",
            "C:/Program Files/QoderWork/QoderWork.exe",
            "%LOCALAPPDATA%/Programs/QoderWork CN/QoderWork CN.exe",
            "C:/Program Files/QoderWork CN/QoderWork CN.exe",
        ],
    },
    targetPredicate: (target) => target.title?.toLowerCase() === "qoderwork"
        && target.url.startsWith("file://")
        && target.url.includes("/out/renderer/index.html"),
    domProfile: {
        sidebarSlotSelector: ".agents-sidebar [data-sidebar-content=true]",
        referenceSelector: '.agents-sidebar [data-sidebar-content=true] [role="button"]',
        contentRootSelector: ".agents-content-area",
        surfaceRootSelector: ".agents-content-area",
        surfaceHeaderHeight: 56,
        observeMutations: true,
        observeResize: false,
        sidebarExpandControlSelector: '[data-sidebar-collapse-button="true"] button',
        sidebarCollapsedSelector: '.agents-sidebar[data-open="false"]',
        macosCollapsedHeaderLeftInset: 88,
        entryLabelSelector: ".flex-1.min-w-0 > span",
        entryIconSelector: ".flex-shrink-0.size-4",
        entryCleanupSelector: "span.text-xs.text-text-quaternary",
        selectedClassName: "bg-fill-secondary",
        nativeSelectionSelector: '.agents-sidebar [data-sidebar-content=true] [role="button"]:not([data-axhub-agent-surface-entry])',
        nativeNavigationSelector: '.agents-sidebar [data-sidebar-content=true] [role="button"]',
    },
};
const baseAdapter = createAdapter(definition);
function contextWithActivePort(context) {
    const appPath = baseAdapter.resolveApplicationPath(context.platform, context.config);
    const activePort = readQoderWorkDevToolsActivePort(context.platform, appPath);
    const config = {
        ...context.config,
        ...(appPath ? { appPath } : {}),
        cdpPort: activePort ?? context.config?.cdpPort ?? definition.defaultCdpPort,
    };
    return { ...context, config };
}
export const qoderworkAdapter = {
    ...baseAdapter,
    launchSpec(appPath, _port, platform) {
        return buildQoderWorkLaunchSpec(appPath, platform);
    },
    inspect(context) {
        return baseAdapter.inspect(contextWithActivePort(context));
    },
    doctor(context) {
        return baseAdapter.doctor(contextWithActivePort(context));
    },
};
//# sourceMappingURL=index.js.map