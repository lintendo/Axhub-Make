const PROJECT_OPEN_SUPPORT = {
    codex: "supported",
    cursor: "supported",
    opencode: "supported",
    workbuddy: "supported",
    traework: "unsupported",
    qoderwork: "supported",
};
export function getProjectOpenSupport(provider) {
    return PROJECT_OPEN_SUPPORT[provider];
}
export function projectOpenUnsupportedMessage(provider) {
    const label = provider === "traework" ? "TRAEWORK" : provider;
    return `${label} does not support automatic project-directory opening.`;
}
export function requireProjectOpenSupport(provider) {
    if (getProjectOpenSupport(provider) === "unsupported") {
        throw new Error(projectOpenUnsupportedMessage(provider));
    }
}
//# sourceMappingURL=capabilities.js.map