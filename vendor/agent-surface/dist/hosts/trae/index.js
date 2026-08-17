import { createAdapter } from "../common.js";
const definition = {
    id: "trae",
    defaultCdpPort: 9235,
    support: "experimental",
    verified: false,
    preferFirstCandidate: true,
    candidates: {
        darwin: [
            "/Applications/Trae.app/Contents/MacOS/Electron",
            "/Applications/Trae CN.app/Contents/MacOS/Electron",
        ],
        win32: [
            "%LOCALAPPDATA%/Programs/Trae/Trae.exe",
            "C:/Program Files/Trae/Trae.exe",
            "%LOCALAPPDATA%/Programs/Trae CN/Trae CN.exe",
            "C:/Program Files/Trae CN/Trae CN.exe",
        ],
    },
    targetPredicate: (target) => target.title?.toLowerCase() === "trae"
        && target.url.startsWith("vscode-file://vscode-app/")
        && target.url.includes("/workbench/workbench.html"),
    domProfile: {
        sidebarSlotSelector: ".monaco-workbench .activitybar .content",
        referenceSelector: '.monaco-workbench .activitybar .action-item[role="tab"]',
        contentRootSelector: ".monaco-workbench .part.editor",
        surfaceRootSelector: ".monaco-workbench .part.editor",
        surfaceHeaderHeight: 56,
        observeMutations: true,
        observeResize: false,
        selectedClassName: "checked",
        nativeSelectionSelector: '.monaco-workbench .activitybar .action-item[role="tab"]',
        nativeNavigationSelector: '.monaco-workbench .activitybar .action-item[role="tab"]',
    },
};
export const traeAdapter = createAdapter(definition);
//# sourceMappingURL=index.js.map