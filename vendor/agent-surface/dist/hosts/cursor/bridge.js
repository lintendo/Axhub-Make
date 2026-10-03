import { resolve } from "node:path";
import { ensureDraftResult, HostBridgeOperationError, invokeApi, requirePath, requireTaskId, } from "../bridge-contract.js";
function capabilities(api) {
    return {
        host: "cursor",
        ...(api.appVersion ? { appVersion: api.appVersion } : {}),
        projects: {
            list: Boolean(api.listWorkspaceFolders),
            has: Boolean(api.hasWorkspaceFolder || api.pathExists),
            ensure: Boolean(api.ensureWorkspaceFolder && api.pathExists),
        },
        tasks: {
            list: false,
            refresh: Boolean(api.refreshComposers),
            open: Boolean(api.openComposer),
            openNew: Boolean(api.openNewComposer),
            prefillPrompt: Boolean(api.prefillPrompt),
        },
        taskCreation: "external",
        privateApi: true,
    };
}
export function createCursorHostBridge(api) {
    const hostCapabilities = capabilities(api);
    return {
        capabilities: hostCapabilities,
        async handle(method, params) {
            switch (method) {
                case "capabilities.get":
                    return hostCapabilities;
                case "projects.list":
                    return invokeApi(api.listWorkspaceFolders, "Cursor workspace folder listing is unsupported.");
                case "projects.has": {
                    const path = resolve(requirePath(params));
                    const exists = api.pathExists ? await invokeApi(() => api.pathExists(path), "Cursor path checks are unsupported.") : true;
                    const managed = exists && api.hasWorkspaceFolder
                        ? await invokeApi(() => api.hasWorkspaceFolder(path), "Cursor workspace folder checks are unsupported.")
                        : false;
                    return { path, exists, managed };
                }
                case "projects.ensure": {
                    const path = resolve(requirePath(params));
                    const exists = await invokeApi(api.pathExists ? () => api.pathExists(path) : undefined, "Cursor path checks are unsupported.");
                    if (!exists)
                        throw new HostBridgeOperationError("not-found", "The project directory does not exist.");
                    await invokeApi(api.ensureWorkspaceFolder ? () => api.ensureWorkspaceFolder(path) : undefined, "Cursor workspace folder registration is unsupported.");
                    return { path, ensured: true };
                }
                case "tasks.list":
                    throw new HostBridgeOperationError("unsupported", "Cursor task listing is unsupported.");
                case "tasks.refresh":
                    await invokeApi(api.refreshComposers, "Cursor composer refresh is unsupported.");
                    return { refreshed: true };
                case "tasks.open": {
                    const id = requireTaskId(params);
                    const opened = await invokeApi(api.openComposer
                        ? () => api.openComposer(id, typeof params?.kind === "string" ? params.kind : undefined)
                        : undefined, "Cursor composer routing is unsupported.");
                    if (!opened)
                        throw new HostBridgeOperationError("not-found", "The Cursor composer was not found.");
                    return {
                        opened: true,
                        id,
                        sidebarSynchronized: api.sidebarSynchronizationGuaranteed === true,
                    };
                }
                case "tasks.openNew": {
                    const input = {
                        ...(typeof params?.projectPath === "string" ? { projectPath: resolve(params.projectPath) } : {}),
                        ...(typeof params?.activate === "boolean" ? { activate: params.activate } : {}),
                    };
                    const output = await invokeApi(api.openNewComposer ? () => api.openNewComposer(input) : undefined, "Cursor new composer routing is unsupported.");
                    const promptApplied = typeof params?.prompt === "string" && api.prefillPrompt
                        ? await invokeApi(() => api.prefillPrompt(params.prompt), "Cursor prompt prefill is unsupported.")
                        : false;
                    return ensureDraftResult(output, promptApplied);
                }
            }
        },
    };
}
//# sourceMappingURL=bridge.js.map