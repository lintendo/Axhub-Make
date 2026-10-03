import { resolve } from "node:path";
import { ensureDraftResult, HostBridgeOperationError, invokeApi, requirePath, requireTaskId, } from "../bridge-contract.js";
function capabilities(api) {
    return {
        host: "workbuddy",
        ...(api.appVersion ? { appVersion: api.appVersion } : {}),
        projects: {
            list: Boolean(api.listWorkspaces),
            has: Boolean(api.hasWorkspace || api.pathExists),
            ensure: Boolean(api.ensureWorkspace && api.pathExists),
        },
        tasks: {
            list: Boolean(api.listTasks),
            refresh: Boolean(api.refreshConversations),
            open: Boolean(api.openSession),
            openNew: Boolean(api.openNewTask),
            prefillPrompt: Boolean(api.openNewTask),
        },
        taskCreation: "external",
        privateApi: true,
    };
}
export function createWorkBuddyHostBridge(api) {
    const hostCapabilities = capabilities(api);
    return {
        capabilities: hostCapabilities,
        async handle(method, params) {
            switch (method) {
                case "capabilities.get":
                    return hostCapabilities;
                case "projects.list":
                    return invokeApi(api.listWorkspaces, "WorkBuddy workspace listing is unsupported.");
                case "projects.has": {
                    const path = resolve(requirePath(params));
                    const exists = api.pathExists ? await invokeApi(() => api.pathExists(path), "WorkBuddy path checks are unsupported.") : true;
                    const managed = exists && api.hasWorkspace
                        ? await invokeApi(() => api.hasWorkspace(path), "WorkBuddy workspace checks are unsupported.")
                        : false;
                    return { path, exists, managed };
                }
                case "projects.ensure": {
                    const path = resolve(requirePath(params));
                    const exists = await invokeApi(api.pathExists ? () => api.pathExists(path) : undefined, "WorkBuddy path checks are unsupported.");
                    if (!exists)
                        throw new HostBridgeOperationError("not-found", "The project directory does not exist.");
                    await invokeApi(api.ensureWorkspace ? () => api.ensureWorkspace(path) : undefined, "WorkBuddy workspace registration is unsupported.");
                    return { path, ensured: true };
                }
                case "tasks.list": {
                    const tasks = await invokeApi(api.listTasks, "WorkBuddy task listing is unsupported.");
                    return { tasks: Array.isArray(tasks) ? tasks : [] };
                }
                case "tasks.refresh":
                    await invokeApi(api.refreshConversations ? () => api.refreshConversations({ silent: true }) : undefined, "WorkBuddy conversation refresh is unsupported.");
                    return { refreshed: true, silent: true };
                case "tasks.open": {
                    const id = requireTaskId(params);
                    const opened = await invokeApi(api.openSession ? () => api.openSession(id) : undefined, "WorkBuddy session routing is unsupported.");
                    if (!opened)
                        throw new HostBridgeOperationError("not-found", "The WorkBuddy session was not found.");
                    return { opened: true, id };
                }
                case "tasks.openNew": {
                    const input = {
                        ...(typeof params?.projectPath === "string" ? { projectPath: resolve(params.projectPath) } : {}),
                        ...(typeof params?.prompt === "string" ? { prompt: params.prompt } : {}),
                        ...(typeof params?.activate === "boolean" ? { activate: params.activate } : {}),
                    };
                    const output = await invokeApi(api.openNewTask ? () => api.openNewTask(input) : undefined, "WorkBuddy new task routing is unsupported.");
                    return ensureDraftResult(output);
                }
            }
        },
    };
}
//# sourceMappingURL=bridge.js.map