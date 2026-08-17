import { createAdapter } from "../common.js";
const definition = {
    id: "codex",
    defaultCdpPort: 9229,
    support: "supported",
    verified: true,
    candidates: {
        darwin: [
            "/Applications/Codex.app/Contents/MacOS/Codex",
            "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
        ],
        win32: [
            "%LOCALAPPDATA%/Programs/Codex/Codex.exe",
            "%LOCALAPPDATA%/Programs/ChatGPT/ChatGPT.exe",
        ],
    },
    targetPredicate: (target) => target.url.startsWith("app://"),
    domProfile: {
        sidebarSlotSelector: "[data-app-action-sidebar-scroll], aside nav, aside",
        referenceSelector: 'button[aria-label="Plugins"], button[aria-label="插件"]',
        contentRootSelector: "main, [data-testid=main-content]",
        surfaceRootSelector: "main, [data-testid=main-content]",
        surfaceHeaderHeight: 56,
        observeMutations: true,
        observeResize: false,
        sidebarExpandControlSelector: 'button[aria-label="Toggle Sidebar" i], button[title="Toggle Sidebar" i], button[aria-label="切换侧边栏"], button[title="切换侧边栏"]',
        macosCollapsedHeaderLeftInset: 88,
        nativeNavigationSelector: "[data-app-action-sidebar-scroll] button, aside nav button",
    },
};
export const codexAdapter = createAdapter(definition);
//# sourceMappingURL=index.js.map