export const CLI_AGENT_OPTIONS = [
    { value: 'codex', label: 'Codex' },
    { value: 'claudecode', label: 'Claude Code' },
    { value: 'opencode', label: 'OpenCode' },
];
export const WEB_AGENT_OPTIONS = [
    { value: 'opencode', label: 'OpenCode' },
    { value: 'acp', label: 'ACP UI' },
];
export const LOCAL_APP_AGENT_OPTIONS = [
    { value: 'codex', label: 'ChatGPT' },
    { value: 'opencode', label: 'OpenCode' },
    { value: 'workbuddy', label: 'WorkBuddy' },
    { value: 'traework', label: 'TRAEWORK' },
    { value: 'qoderwork', label: 'QoderWork' },
    { value: 'trae', label: 'TRAE' },
];
export const CLI_AGENT_VALUES = CLI_AGENT_OPTIONS.map((option) => option.value);
export const WEB_AGENT_VALUES = WEB_AGENT_OPTIONS.map((option) => option.value);
export const LOCAL_APP_AGENT_VALUES = LOCAL_APP_AGENT_OPTIONS.map((option) => option.value);
export const CLI_AGENT_APP_NAMES = {
    codex: 'Codex',
    claudecode: 'Claude Code',
    opencode: 'OpenCode',
};
export const WEB_AGENT_APP_NAMES = {
    opencode: 'OpenCode',
    acp: 'ACP UI',
};
export const LOCAL_APP_AGENT_APP_NAMES = {
    codex: 'ChatGPT',
    opencode: 'OpenCode',
    workbuddy: 'WorkBuddy',
    traework: 'TRAEWORK',
    qoderwork: 'QoderWork',
    trae: 'TRAE',
};
export function isAgentMissing(agent, availability) {
    return availability?.[agent]?.status === 'missing';
}
export function getVisibleAgentOptions(options, availability) {
    return options.filter((option) => !isAgentMissing(option.value, availability));
}
export function normalizeCLIAgent(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase().replace(/[-_\s]+/gu, '');
    if (normalized === 'claude' || normalized === 'claudecode') {
        return 'claudecode';
    }
    return CLI_AGENT_VALUES.includes(normalized) ? normalized : null;
}
export function normalizeWebAgent(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase().replace(/[-_\s]+/gu, '');
    return WEB_AGENT_VALUES.includes(normalized) ? normalized : null;
}
export function normalizeLocalAppAgent(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase().replace(/[-_\s]+/gu, '');
    return LOCAL_APP_AGENT_VALUES.includes(normalized) ? normalized : null;
}
