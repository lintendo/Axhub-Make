export const DESKTOP_INTEGRATION_PROVIDERS = ['chatgpt', 'cursor', 'workbuddy', 'traework', 'qoderwork'];
export const DESKTOP_INTEGRATION_OPEN_ACTIONS = ['prepare', 'restart', 'normal'];
export function normalizeDesktopIntegrationProvider(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase();
    return DESKTOP_INTEGRATION_PROVIDERS.includes(normalized)
        ? normalized
        : null;
}
export function normalizeDesktopIntegrationOpenAction(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase();
    return DESKTOP_INTEGRATION_OPEN_ACTIONS.includes(normalized)
        ? normalized
        : null;
}
function missingClientMessage(provider) {
    const labels = {
        chatgpt: 'ChatGPT',
        cursor: 'Cursor',
        workbuddy: 'WorkBuddy',
        traework: 'TRAEWORK',
        qoderwork: 'QoderWork',
    };
    return `${labels[provider]} was not found in a supported installation location.`;
}
function missingIntegrationMessage(provider) {
    if (provider !== 'chatgpt') {
        return `${provider} integration is not available.`;
    }
    return 'The Axhub ChatGPT integration is not installed. Run codex install first.';
}
export async function coordinateDesktopIntegrationOpen(input, adapters) {
    if (input.action === 'normal') {
        const operation = await adapters.open('normal');
        return {
            provider: input.provider,
            status: 'opened',
            mode: 'normal',
            ...operation,
        };
    }
    const state = await adapters.inspect();
    if (!state.installed && !state.ready) {
        throw new Error(missingClientMessage(input.provider));
    }
    if (input.provider !== 'cursor' && !state.integrationInstalled && !state.ready) {
        throw new Error(missingIntegrationMessage(input.provider));
    }
    const requiresRestart = state.running && !state.ready && !state.recoverable;
    if (requiresRestart && input.action === 'prepare') {
        return {
            provider: input.provider,
            status: 'restart-required',
        };
    }
    if (requiresRestart) {
        await adapters.close();
    }
    const launch = state.ready
        ? { launched: false, reused: true }
        : await adapters.launch();
    const operation = await adapters.open('integrated');
    return {
        provider: input.provider,
        status: 'opened',
        mode: 'integrated',
        ...launch,
        ...operation,
    };
}
