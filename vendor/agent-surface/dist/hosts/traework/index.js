import { createAdapter } from "../common.js";
const definition = {
    id: "traework",
    defaultCdpPort: 9233,
    support: "supported",
    verified: true,
    preferFirstCandidate: true,
    candidates: {
        darwin: [
            "/Applications/TRAE SOLO.app/Contents/MacOS/Electron",
            "/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron",
        ],
        win32: [
            "%LOCALAPPDATA%/Programs/TRAE SOLO/TRAE SOLO.exe",
            "C:/Program Files/TRAE SOLO/TRAE SOLO.exe",
            "%LOCALAPPDATA%/Programs/TRAE SOLO CN/TRAE SOLO CN.exe",
            "C:/Program Files/TRAE SOLO CN/TRAE SOLO CN.exe",
        ],
    },
    targetPredicate: (target) => {
        const title = target.title?.toLowerCase() ?? "";
        const soloLite = title === "traework"
            && target.url.startsWith("vscode-file://vscode-app/")
            && target.url.includes("/solo/solo-lite.html");
        const legacyWorkbench = title.includes("trae solo")
            && target.url.startsWith("vscode-file://vscode-app/")
            && target.url.includes("/workbench/workbench.html");
        return soloLite || legacyWorkbench;
    },
    domProfile: {
        sidebarSlotSelector: ".task-panel-entry-buttons",
        referenceSelector: ".task-list-new-task-item",
        contentRootSelector: ".panel-container",
        surfaceRootSelector: ".panel-container",
        surfaceHeaderHeight: 56,
        observeMutations: true,
        observeResize: false,
        sidebarExpandControlSelector: 'div[class*="expandButtonWrapper"].visible button.solo-header-btn',
        sidebarCollapsedSelector: ".task-list-panel-hidden",
        macosCollapsedHeaderLeftInset: 88,
        selectedClassName: "active",
        inactiveClassName: "task-list-skills-item",
        hideShortcutHint: true,
        nativeSelectionSelector: ".task-list-new-task-item",
        nativeNavigationSelector: ".task-list-new-task-item, .task-list [role=button], [role=tab]",
    },
};
export const traeworkAdapter = createAdapter(definition);
//# sourceMappingURL=index.js.map