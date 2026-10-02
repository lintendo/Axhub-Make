export const DEFAULT_OPERATION_TIMEOUT_MS = 90_000;
export const DEFAULT_PROJECT_AND_ENTRY_TIMEOUT_MS = 120_000;
export function resolveOperationTimeoutMs(timeoutMs) {
    return timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
}
//# sourceMappingURL=timeout.js.map