import { resolve } from "node:path";
import { ensureDraftResult, HostBridgeOperationError, invokeApi, requirePath, requireTaskId, } from "../bridge-contract.js";
export const CODEX_REFRESH_ACTION = "refresh-recent-conversations-for-host";
function capabilities(api) {
    return {
        host: "codex",
        ...(api.appVersion ? { appVersion: api.appVersion } : {}),
        projects: {
            list: Boolean(api.listWorkspaceRoots),
            has: Boolean(api.hasWorkspaceRoot || api.pathExists),
            ensure: Boolean(api.ensureWorkspaceRoot && api.pathExists),
        },
        tasks: {
            list: false,
            refresh: Boolean(api.actions?.[CODEX_REFRESH_ACTION]),
            open: Boolean(api.openThread),
            openNew: Boolean(api.openNewTask),
            prefillPrompt: Boolean(api.prefillPrompt),
        },
        taskCreation: "external",
        privateApi: true,
    };
}
export function createCodexHostBridge(api) {
    const hostCapabilities = capabilities(api);
    return {
        capabilities: hostCapabilities,
        async handle(method, params) {
            switch (method) {
                case "capabilities.get":
                    return hostCapabilities;
                case "projects.list":
                    return invokeApi(api.listWorkspaceRoots, "Codex workspace root listing is unsupported.");
                case "projects.has": {
                    const path = resolve(requirePath(params));
                    const exists = api.pathExists ? await invokeApi(() => api.pathExists(path), "Codex path checks are unsupported.") : true;
                    const managed = exists && api.hasWorkspaceRoot
                        ? await invokeApi(() => api.hasWorkspaceRoot(path), "Codex workspace root checks are unsupported.")
                        : false;
                    return { path, exists, managed };
                }
                case "projects.ensure": {
                    const path = resolve(requirePath(params));
                    const exists = await invokeApi(api.pathExists ? () => api.pathExists(path) : undefined, "Codex path checks are unsupported.");
                    if (!exists)
                        throw new HostBridgeOperationError("not-found", "The project directory does not exist.");
                    await invokeApi(api.ensureWorkspaceRoot ? () => api.ensureWorkspaceRoot(path) : undefined, "Codex workspace root registration is unsupported.");
                    return { path, ensured: true };
                }
                case "tasks.list":
                    throw new HostBridgeOperationError("unsupported", "Codex task listing is unsupported.");
                case "tasks.refresh":
                    await invokeApi(api.actions?.[CODEX_REFRESH_ACTION]
                        ? () => api.actions[CODEX_REFRESH_ACTION]()
                        : undefined, "Codex recent conversation refresh is unsupported.");
                    return { refreshed: true };
                case "tasks.open": {
                    const id = requireTaskId(params);
                    const opened = await invokeApi(api.openThread
                        ? () => api.openThread(id, typeof params?.kind === "string" ? params.kind : undefined)
                        : undefined, "Codex thread routing is unsupported.");
                    if (!opened)
                        throw new HostBridgeOperationError("not-found", "The Codex thread was not found.");
                    return { opened: true, id };
                }
                case "tasks.openNew": {
                    const prompt = typeof params?.prompt === "string" ? params.prompt : undefined;
                    const input = {
                        ...(typeof params?.projectPath === "string" ? { projectPath: resolve(params.projectPath) } : {}),
                        ...(typeof params?.activate === "boolean" ? { activate: params.activate } : {}),
                    };
                    const output = await invokeApi(api.openNewTask ? () => api.openNewTask(input) : undefined, "Codex new task routing is unsupported.");
                    const promptApplied = prompt && api.prefillPrompt
                        ? await invokeApi(() => api.prefillPrompt(prompt), "Codex prompt prefill is unsupported.")
                        : false;
                    return ensureDraftResult(output, promptApplied);
                }
            }
        },
    };
}
//# sourceMappingURL=bridge.js.map