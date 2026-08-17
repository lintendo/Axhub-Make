export const HOST_IDS = ["codex", "cursor", "workbuddy", "traework", "qoderwork", "trae"];
export const MAX_STARTUP_TIMEOUT_MS = 30_000;
export const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
export class ConfigValidationError extends Error {
    code = "invalid-config";
    constructor(message) {
        super(message);
        this.name = "ConfigValidationError";
    }
}
function assertString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ConfigValidationError(`${field} must be a non-empty string`);
    }
}
function assertEntryId(value, field) {
    assertString(value, field);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
        throw new ConfigValidationError(`${field} must use lowercase letters, numbers, and hyphens`);
    }
}
function assertUrl(value, field) {
    assertString(value, field);
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new ConfigValidationError(`${field} must be a valid URL`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ConfigValidationError(`${field} must use http or https`);
    }
}
function normalizeStartCommand(value, field) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== "object") {
        throw new ConfigValidationError(`${field} must be an object`);
    }
    const command = value;
    assertString(command.executable, `${field}.executable`);
    if (!Array.isArray(command.args) || command.args.some((arg) => typeof arg !== "string")) {
        throw new ConfigValidationError(`${field}.args must be an array of strings`);
    }
    if (command.cwd !== undefined)
        assertString(command.cwd, `${field}.cwd`);
    return {
        executable: command.executable,
        args: [...command.args],
        ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
    };
}
function normalizeEntryHeaderActions(value, field) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ConfigValidationError(`${field} must be an object`);
    }
    const actions = value;
    for (const action of ["refresh", "copyUrl"]) {
        if (actions[action] !== undefined && typeof actions[action] !== "boolean") {
            throw new ConfigValidationError(`${field}.${action} must be a boolean`);
        }
    }
    return {
        ...(actions.refresh === undefined ? {} : { refresh: actions.refresh }),
        ...(actions.copyUrl === undefined ? {} : { copyUrl: actions.copyUrl }),
    };
}
function normalizeEntry(value, index) {
    if (!value || typeof value !== "object") {
        throw new ConfigValidationError(`entries[${index}] must be an object`);
    }
    const raw = value;
    assertEntryId(raw.id, `entries[${index}].id`);
    assertString(raw.name, `entries[${index}].name`);
    assertUrl(raw.url, `entries[${index}].url`);
    if (!Array.isArray(raw.hosts) || raw.hosts.length === 0) {
        throw new ConfigValidationError(`entries[${index}].hosts must contain at least one host`);
    }
    const hosts = raw.hosts.map((host, hostIndex) => {
        if (typeof host !== "string" || !HOST_IDS.includes(host)) {
            throw new ConfigValidationError(`entries[${index}].hosts[${hostIndex}] is unsupported`);
        }
        return host;
    });
    if (new Set(hosts).size !== hosts.length) {
        throw new ConfigValidationError(`entries[${index}].hosts must not contain duplicates`);
    }
    if (raw.healthUrl !== undefined)
        assertUrl(raw.healthUrl, `entries[${index}].healthUrl`);
    if (raw.order !== undefined && (typeof raw.order !== "number" || !Number.isFinite(raw.order))) {
        throw new ConfigValidationError(`entries[${index}].order must be a finite number`);
    }
    if (raw.startupTimeoutMs !== undefined && (typeof raw.startupTimeoutMs !== "number"
        || !Number.isFinite(raw.startupTimeoutMs)
        || raw.startupTimeoutMs <= 0)) {
        throw new ConfigValidationError(`entries[${index}].startupTimeoutMs must be positive`);
    }
    const start = normalizeStartCommand(raw.start, `entries[${index}].start`);
    const headerActions = normalizeEntryHeaderActions(raw.headerActions, `entries[${index}].headerActions`);
    const icon = raw.icon === undefined ? undefined : raw.icon;
    if (icon !== undefined) {
        if (!icon || typeof icon !== "object")
            throw new ConfigValidationError(`entries[${index}].icon must be an object`);
        const iconValue = icon;
        if (iconValue.type !== "path" && iconValue.type !== "data-url") {
            throw new ConfigValidationError(`entries[${index}].icon.type must be path or data-url`);
        }
        assertString(iconValue.value, `entries[${index}].icon.value`);
    }
    return {
        id: raw.id,
        name: raw.name,
        hosts,
        url: raw.url,
        ...(icon === undefined ? {} : { icon: icon }),
        ...(headerActions === undefined ? {} : { headerActions }),
        ...(raw.order === undefined ? {} : { order: raw.order }),
        ...(raw.healthUrl === undefined ? {} : { healthUrl: raw.healthUrl }),
        ...(start === undefined ? {} : { start }),
        ...(raw.startupTimeoutMs === undefined ? {} : {
            startupTimeoutMs: Math.min(raw.startupTimeoutMs, MAX_STARTUP_TIMEOUT_MS),
        }),
    };
}
export function validateConfig(input) {
    if (!input || typeof input !== "object")
        throw new ConfigValidationError("config must be an object");
    const raw = input;
    if (raw.schemaVersion !== 1)
        throw new ConfigValidationError("schemaVersion must be 1");
    if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
        throw new ConfigValidationError("entries must contain at least one entry");
    }
    const entries = raw.entries.map(normalizeEntry);
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
        throw new ConfigValidationError("entry ids must be unique");
    }
    const hosts = {};
    if (raw.hosts !== undefined) {
        if (!raw.hosts || typeof raw.hosts !== "object")
            throw new ConfigValidationError("hosts must be an object");
        for (const [host, value] of Object.entries(raw.hosts)) {
            if (!HOST_IDS.includes(host))
                throw new ConfigValidationError(`hosts.${host} is unsupported`);
            if (!value || typeof value !== "object")
                throw new ConfigValidationError(`hosts.${host} must be an object`);
            const hostConfig = value;
            if (hostConfig.appPath !== undefined)
                assertString(hostConfig.appPath, `hosts.${host}.appPath`);
            if (hostConfig.variant !== undefined)
                assertString(hostConfig.variant, `hosts.${host}.variant`);
            if (hostConfig.cdpPort !== undefined && (typeof hostConfig.cdpPort !== "number"
                || !Number.isInteger(hostConfig.cdpPort)
                || hostConfig.cdpPort < 1
                || hostConfig.cdpPort > 65535))
                throw new ConfigValidationError(`hosts.${host}.cdpPort must be a valid port`);
            hosts[host] = {
                ...(hostConfig.appPath === undefined ? {} : { appPath: hostConfig.appPath }),
                ...(hostConfig.cdpPort === undefined ? {} : { cdpPort: hostConfig.cdpPort }),
                ...(hostConfig.variant === undefined ? {} : { variant: hostConfig.variant }),
            };
        }
    }
    return {
        schemaVersion: 1,
        entries,
        ...(Object.keys(hosts).length === 0 ? {} : { hosts }),
    };
}
export function findEntry(config, host, entryId) {
    const entry = config.entries.find((candidate) => candidate.id === entryId && candidate.hosts.includes(host));
    if (!entry)
        throw new ConfigValidationError(`entry ${entryId} is not configured for host ${host}`);
    return entry;
}
export function entriesForHost(config, host) {
    return config.entries
        .filter((entry) => entry.hosts.includes(host))
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
}
export function resolveHealthUrl(entry) {
    return entry.healthUrl ?? entry.url;
}
//# sourceMappingURL=validate.js.map