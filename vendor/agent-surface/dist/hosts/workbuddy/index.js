import { createAdapter } from "../common.js";
const definition = {
    id: "workbuddy",
    defaultCdpPort: 9232,
    support: "supported",
    verified: true,
    candidates: {
        darwin: ["/Applications/WorkBuddy.app/Contents/MacOS/Electron"],
        win32: ["%LOCALAPPDATA%/Programs/WorkBuddy/WorkBuddy.exe"],
    },
    targetPredicate: (target) => target.title?.toLowerCase().includes("workbuddy") === true,
    domProfile: {
        sidebarSlotSelector: ".conversation-list-tabs",
        referenceSelector: ".conversation-list-tab-button",
        contentRootSelector: ".teams-content-wrapper",
        surfaceRootSelector: ".teams-content-wrapper",
        surfaceHeaderHeight: 56,
        observeMutations: true,
        observeResize: false,
        sidebarExpandControlSelector: ".workbuddy-topbar--collapsed .workbuddy-topbar-title > button:first-child",
        sidebarCollapsedSelector: ".teams-container.sidebar-collapsed",
        macosCollapsedHeaderLeftInset: 88,
        selectedClassName: "active",
        nativeSelectionSelector: '.conversation-list-tab-button, .conversation-list-tab-row, .conversation-agent-card[role="button"]',
        nativeNavigationSelector: '.conversation-list-tab-button, .conversation-agent-card[role="button"], .user-menu-trigger',
    },
};
export const workbuddyAdapter = createAdapter(definition);
//# sourceMappingURL=index.js.map