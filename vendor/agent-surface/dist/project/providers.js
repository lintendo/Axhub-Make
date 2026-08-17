import { requireProjectOpenSupport } from "./capabilities.js";
function encodeLocalPath(value, platform) {
    if (platform === "win32")
        return encodeURIComponent(value);
    return value
        .split("/")
        .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
        .join("/");
}
function deeplink(provider, targetPath, platform) {
    const encoded = encodeLocalPath(targetPath, platform);
    if (provider === "codex")
        return `codex://threads/new?path=${encoded}`;
    if (provider === "opencode")
        return `opencode://open-project?directory=${encoded}`;
    return `workbuddy://task?action=start&prompt=%E4%BD%A0%E5%A5%BD&cwd=${encoded}`;
}
function macApplicationBundle(appPath) {
    const marker = appPath.indexOf(".app/");
    if (marker >= 0)
        return appPath.slice(0, marker + ".app".length);
    return appPath.endsWith(".app") ? appPath : undefined;
}
function requireAppPath(options) {
    const appPath = options.appPath?.trim();
    if (!appPath && options.platform === "win32") {
        throw new Error(`appPath is required for ${options.provider} project opening on Windows.`);
    }
    if (appPath)
        return appPath;
    const defaults = {
        cursor: "/Applications/Cursor.app/Contents/MacOS/Cursor",
        opencode: "/Applications/OpenCode.app/Contents/MacOS/OpenCode",
        workbuddy: "/Applications/WorkBuddy.app/Contents/MacOS/Electron",
        qoderwork: "/Applications/QoderWork.app/Contents/MacOS/QoderWork",
    };
    return options.provider === "codex" ? "codex" : defaults[options.provider];
}
function applicationUrlCommand(appPath, url, platform) {
    if (platform === "darwin") {
        const application = macApplicationBundle(appPath);
        if (application)
            return { executable: "open", args: ["-a", application, url], url };
        return { executable: "open", args: [url], url };
    }
    if (platform === "linux") {
        return { executable: "xdg-open", args: [url], url };
    }
    return { executable: appPath, args: [url], url };
}
function cursorRouter(appPath, platform) {
    if (platform !== "darwin")
        return appPath;
    const bundle = macApplicationBundle(appPath);
    return bundle ? `${bundle}/Contents/Resources/app/bin/cursor` : appPath;
}
export function buildProjectOpenCommands(options) {
    const provider = options.provider;
    requireProjectOpenSupport(provider);
    const platform = options.platform ?? process.platform;
    const supportsLinuxLegacyOpen = platform === "linux"
        && (provider === "codex" || provider === "opencode");
    if (platform !== "darwin" && platform !== "win32" && !supportsLinuxLegacyOpen) {
        throw new Error(`Project opening does not support ${platform}.`);
    }
    const targetPath = options.targetPath.trim();
    if (!targetPath)
        throw new Error("targetPath is required for project opening.");
    const appPath = requireAppPath({ ...options, provider, platform });
    if (provider === "cursor") {
        const executable = cursorRouter(appPath, platform);
        return [
            { executable, args: ["--chat"] },
            { executable, args: [targetPath] },
        ];
    }
    if (provider === "qoderwork") {
        if (platform === "darwin") {
            const application = macApplicationBundle(appPath);
            if (application)
                return [{ executable: "open", args: ["-a", application], cwd: targetPath }];
        }
        return [{ executable: appPath, args: [], cwd: targetPath }];
    }
    if (provider === "codex" && (platform === "darwin" || platform === "linux") && !macApplicationBundle(appPath) && !options.preferDeeplink) {
        return [{ executable: appPath, args: ["app", targetPath], cwd: targetPath }];
    }
    const url = deeplink(provider, targetPath, platform);
    if (provider === "opencode" && platform === "darwin") {
        return [{ executable: "open", args: [url], url }];
    }
    return [applicationUrlCommand(appPath, url, platform)];
}
//# sourceMappingURL=providers.js.map