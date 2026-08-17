export const MAIN_IDE_OPTIONS = [
    { value: 'cursor', label: 'Cursor' },
    { value: 'trae', label: 'TRAE' },
    { value: 'vscode', label: 'VS Code' },
    { value: 'trae_cn', label: 'TRAE CN' },
    { value: 'windsurf', label: 'Windsurf' },
    { value: 'qoder', label: 'Qoder' },
    { value: 'antigravity', label: 'Antigravity' },
] as const;

export type MainIDE = typeof MAIN_IDE_OPTIONS[number]['value'];
export type MainIDEPreference = MainIDE | null;

export const MAIN_IDE_VALUES = MAIN_IDE_OPTIONS.map((option) => option.value) as MainIDE[];

export const MAIN_IDE_APP_NAMES: Record<MainIDE, string> = {
    cursor: 'Cursor',
    trae: 'TRAE',
    vscode: 'VS Code',
    trae_cn: 'TRAE CN',
    windsurf: 'Windsurf',
    qoder: 'Qoder',
    antigravity: 'Antigravity',
};

export const WS_SUPPORTED_CLIENT_TYPES = ['vscode', 'cursor'] as const;
export type WSSupportedClientType = typeof WS_SUPPORTED_CLIENT_TYPES[number];

export type IDEAvailabilityStatus = 'installed' | 'missing' | 'unknown';
export type IDEAvailabilityConfidence = 'high' | 'low';

export interface IDEAvailabilityInfo {
    status: IDEAvailabilityStatus;
    confidence: IDEAvailabilityConfidence;
    checkedAt: string;
    source?: string;
    path?: string;
    reason?: string;
}

export type IDEAvailabilityMap = Partial<Record<MainIDE, IDEAvailabilityInfo>>;

export function isIDEMissing(ide: MainIDE, availability?: IDEAvailabilityMap | null): boolean {
    return availability?.[ide]?.status === 'missing';
}

export function getVisibleIDEOptions(_availability?: IDEAvailabilityMap | null) {
    return MAIN_IDE_OPTIONS;
}

export function resolveVisibleIDEPreference(
    preferredIDE: MainIDEPreference,
    _availability?: IDEAvailabilityMap | null,
): MainIDEPreference {
    if (preferredIDE && MAIN_IDE_VALUES.includes(preferredIDE)) {
        return preferredIDE;
    }
    return MAIN_IDE_OPTIONS[0]?.value ?? null;
}

export type OpenMethodType = 'ide' | 'cli' | 'web' | 'local-app';

export interface OpenMethod {
    type: OpenMethodType;
    value: string;
}

/**
 * Parse a stored defaultIDE value into an OpenMethod.
 * Supports prefixed format (`local-app:codex`, `web:opencode`, `cli:claudecode`) and plain IDE values (`cursor`).
 */
export function parseOpenMethod(raw: string | null | undefined): OpenMethod | null {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
        return null;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
        const prefix = trimmed.slice(0, colonIndex) as OpenMethodType;
        const value = trimmed.slice(colonIndex + 1).trim();
        if ((prefix === 'ide' || prefix === 'cli' || prefix === 'web' || prefix === 'local-app') && value) {
            return { type: prefix, value };
        }
    }

    // Backward compat: plain string is treated as IDE
    return { type: 'ide', value: trimmed };
}

/**
 * Serialize an OpenMethod back to the string format stored in config.
 * IDE values are stored without prefix for backward compat; local app/CLI/Web use prefixed storage.
 */
export function serializeOpenMethod(method: OpenMethod): string {
    if (method.type === 'ide') {
        return method.value;
    }
    return `${method.type}:${method.value}`;
}
