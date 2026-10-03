export const HOST_BRIDGE_CHANNEL = "axhub-agent-surface:host-bridge";
const methods = new Set([
    "capabilities.get",
    "projects.list",
    "projects.has",
    "projects.ensure",
    "tasks.list",
    "tasks.refresh",
    "tasks.open",
    "tasks.openNew",
]);
const errorCodes = new Set([
    "invalid-request",
    "forbidden-origin",
    "unsupported",
    "host-not-found",
    "ambiguous",
    "not-found",
    "timeout",
    "host-api-error",
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnly(record, keys) {
    return Object.keys(record).every((key) => keys.includes(key));
}
function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function validParams(method, params) {
    if (params === undefined) {
        return method === "capabilities.get"
            || method === "projects.list"
            || method === "tasks.list"
            || method === "tasks.refresh"
            || method === "tasks.openNew";
    }
    if (!isRecord(params))
        return false;
    switch (method) {
        case "capabilities.get":
        case "tasks.list":
        case "tasks.refresh":
            return false;
        case "projects.list":
            return hasOnly(params, ["path"]) && (params.path === undefined || nonEmptyString(params.path));
        case "projects.has":
        case "projects.ensure":
            return hasOnly(params, ["path"]) && nonEmptyString(params.path);
        case "tasks.open":
            return hasOnly(params, ["id", "kind"])
                && nonEmptyString(params.id)
                && (params.kind === undefined || nonEmptyString(params.kind));
        case "tasks.openNew":
            return hasOnly(params, ["projectPath", "prompt", "activate"])
                && (params.projectPath === undefined || nonEmptyString(params.projectPath))
                && (params.prompt === undefined || typeof params.prompt === "string")
                && (params.activate === undefined || typeof params.activate === "boolean");
    }
}
export function isHostBridgeMethod(value) {
    return typeof value === "string" && methods.has(value);
}
export function isHostBridgeErrorCode(value) {
    return typeof value === "string" && errorCodes.has(value);
}
export function isHostBridgeRequest(value) {
    if (!isRecord(value)
        || !hasOnly(value, ["channel", "type", "requestId", "method", "params"])
        || value.channel !== HOST_BRIDGE_CHANNEL
        || value.type !== "request"
        || !nonEmptyString(value.requestId)
        || !isHostBridgeMethod(value.method)) {
        return false;
    }
    return validParams(value.method, value.params);
}
export function isHostBridgeResponse(value) {
    if (!isRecord(value)
        || !hasOnly(value, ["channel", "type", "requestId", "ok", "result", "error"])
        || value.channel !== HOST_BRIDGE_CHANNEL
        || value.type !== "response"
        || !nonEmptyString(value.requestId)
        || typeof value.ok !== "boolean") {
        return false;
    }
    if (value.ok)
        return value.error === undefined;
    if (!isRecord(value.error) || !isHostBridgeErrorCode(value.error.code) || !nonEmptyString(value.error.message))
        return false;
    return value.result === undefined;
}
export function validateHostBridgeRequest(value) {
    if (!isHostBridgeRequest(value))
        throw new TypeError("Invalid host bridge request.");
}
export function validateHostBridgeResponse(value) {
    if (!isHostBridgeResponse(value))
        throw new TypeError("Invalid host bridge response.");
}
//# sourceMappingURL=types.js.map