import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createAdapter } from "../common.js";
const CODEX_HOME_SEED_FILES = [
    "auth.json",
    "config.toml",
    "installation_id",
    ".codex-global-state.json",
];
async function copyCodexHomeSeed(source, destination) {
    await Promise.all(CODEX_HOME_SEED_FILES.map(async (name) => {
        try {
            await copyFile(join(source, name), join(destination, name));
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
    }));
}
export const codexApplicationCandidates = {
    darwin: [
        "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
        "/Applications/Codex.app/Contents/MacOS/Codex",
    ],
    win32: [
        "%LOCALAPPDATA%/Programs/ChatGPT/ChatGPT.exe",
        "%LOCALAPPDATA%/Programs/Codex/Codex.exe",
    ],
};
const definition = {
    id: "codex",
    defaultCdpPort: 9229,
    support: "supported",
    verified: true,
    preferFirstCandidate: true,
    candidates: codexApplicationCandidates,
    windowsApplicationDiscovery: {
        executableNames: ["Codex.exe", "ChatGPT.exe"],
        appxPackages: [{
                packageName: "OpenAI.Codex",
                relativeExecutablePaths: ["app/ChatGPT.exe"],
            }],
    },
    cdpTransports: { win32: "pipe" },
    targetPredicate: (target) => {
        try {
            const url = new URL(target.url);
            return url.protocol === "app:" && url.searchParams.get("initialRoute") !== "/avatar-overlay";
        }
        catch {
            return false;
        }
    },
    injectionPolicy: {
        bypassCsp: true,
        reloadAfterInstall: true,
    },
    domProfile: {
        sidebarSlotSelector: "[data-app-action-sidebar-scroll]",
        referenceSelector: 'button[aria-label="Plugins"], button[aria-label="插件"]',
        referenceLabels: ["Plugins", "插件"],
        contentRootSelector: ".app-shell-main-content-frame, [data-app-shell-main-content-layout]",
        surfaceRootSelector: "[data-app-shell-main-content-layout]",
        surfaceRootUseParent: true,
        surfaceRootZIndex: 31,
        surfaceHeaderHeight: 44,
        entryLabelSelector: ".text-fade-truncate",
        observeMutations: true,
        observeResize: false,
        sidebarExpandControlSelector: '[data-app-shell-sidebar-trigger="true"], button[aria-label="Toggle Sidebar" i], button[title="Toggle Sidebar" i], button[aria-label="切换侧边栏"], button[title="切换侧边栏"]',
        sidebarCollapsedSelector: '[data-app-shell-sidebar-trigger="true"][aria-label^="显示" i], [data-app-shell-sidebar-trigger="true"][aria-label^="Show " i]',
        macosCollapsedHeaderLeftInset: 88,
        nativeSelectionSelector: '[data-app-action-sidebar-scroll] [aria-current], aside nav[role="navigation"] [aria-current]',
        nativeNavigationSelector: '[data-app-action-sidebar-scroll] button, [data-app-action-sidebar-scroll] a, [data-app-action-sidebar-scroll] [role="button"], [data-app-action-sidebar-scroll] [role="link"], [data-app-action-sidebar-scroll] [data-app-action-sidebar-thread-id], [data-app-action-sidebar-scroll] [data-app-action-sidebar-project-id], aside nav[role="navigation"] button, aside nav[role="navigation"] a',
    },
};
export const codexAdapter = {
    ...createAdapter(definition),
    async prepareLaunchEnvironment(userDataDir, platform, environment) {
        if (platform !== "win32")
            return environment;
        const codexHome = join(userDataDir, "codex-home");
        await mkdir(codexHome, { recursive: true });
        const sourceCodexHome = environment.CODEX_HOME
            ?? (environment.USERPROFILE ? join(environment.USERPROFILE, ".codex") : undefined);
        if (sourceCodexHome)
            await copyCodexHomeSeed(sourceCodexHome, codexHome);
        return { ...environment, CODEX_HOME: codexHome };
    },
};
export { createCodexHostBridge, CODEX_REFRESH_ACTION } from "./bridge.js";
//# sourceMappingURL=index.js.map