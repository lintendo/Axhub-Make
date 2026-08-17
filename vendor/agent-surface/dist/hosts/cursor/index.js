import { createAdapter } from "../common.js";
const definition = {
    id: "cursor",
    defaultCdpPort: 9230,
    support: "supported",
    verified: true,
    candidates: {
        darwin: ["/Applications/Cursor.app/Contents/MacOS/Cursor"],
        win32: ["%LOCALAPPDATA%/Programs/Cursor/Cursor.exe", "%LOCALAPPDATA%/Cursor/Cursor.exe"],
    },
    targetPredicate: (target) => target.title === "Cursor Agents"
        && target.url.startsWith("vscode-file://vscode-app/")
        && target.url.includes("/workbench/workbench.html"),
    domProfile: {
        sidebarSlotSelector: "[data-sidebar-header-actions-stack]",
        referenceSelector: "[data-action-id=marketplace]",
        contentRootSelector: "[data-component=agent-panel]",
        surfaceRootSelector: "[data-component=agent-panel]",
        contentTopInset: 0,
        surfaceHeaderHeight: 36,
        observeMutations: true,
        observeResize: false,
        sidebarExpandControlSelector: '[aria-label="Show Sidebar" i], [aria-label="显示侧边栏"]',
        sidebarCollapsedSelector: '[aria-label="Show Sidebar" i], [aria-label="显示侧边栏"]',
        macosCollapsedHeaderLeftInset: 88,
        entryIconSelector: ".ui-sidebar-menu-button-icon-wrapper",
        entryIconTextGap: 10,
        nativeNavigationSelector: "[data-sidebar-menu-button], [data-sidebar-workspace-section-root]",
    },
};
const baseCursorAdapter = createAdapter(definition);
export const cursorAdapter = {
    ...baseCursorAdapter,
    launchSpec(appPath, port, platform) {
        const spec = baseCursorAdapter.launchSpec(appPath, port, platform);
        return { ...spec, args: [...spec.args, "--chat"] };
    },
};
//# sourceMappingURL=index.js.map