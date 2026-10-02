export class HostBridgeOperationError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = "HostBridgeOperationError";
        this.code = code;
        this.details = details;
    }
}
export function requirePath(params) {
    const path = params?.path;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new HostBridgeOperationError("invalid-request", "A non-empty project path is required.");
    }
    return path;
}
export function requireTaskId(params) {
    const id = params?.id;
    if (typeof id !== "string" || id.trim().length === 0) {
        throw new HostBridgeOperationError("invalid-request", "A non-empty task id is required.");
    }
    return id;
}
export function ensureDraftResult(output, promptApplied = false) {
    return {
        opened: true,
        draftOnly: true,
        promptApplied: typeof output === "object"
            && output !== null
            && output.promptApplied === true
            ? true
            : promptApplied,
    };
}
export async function invokeApi(operation, missingMessage) {
    if (!operation)
        throw new HostBridgeOperationError("unsupported", missingMessage);
    try {
        return await operation();
    }
    catch (error) {
        if (error instanceof HostBridgeOperationError)
            throw error;
        throw new HostBridgeOperationError("host-api-error", error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=bridge-contract.js.map