import path from 'node:path';
import { getProjectMetadataPath, } from './projectCore/index.ts';
import { readJsonBody, sendJson } from './http.ts';
import { applyMakeClientUpdate, cloneMakeClientProject, copyMakeClientProject, createBlankMakeClientProject, ensureMakeClientDevServer, getMakeClientUpdateStatus, getMakeClientDevStatus, makeClientErrorPayload, suggestMakeClientFolderName, stopMakeClientDevServer, validateExistingMakeClientProject, } from './makeClientProject.ts';
export function handleMakeClientProjectApi(req, res, options, pathname, registry, handlers, projectRoute) {
    if (pathname === '/api/projects/make/register-existing' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const root = path.resolve(String(body?.root || '').trim());
            if (!root) {
                sendJson(res, { error: 'Missing project root' }, { status: 400 });
                return;
            }
            try {
                const marker = validateExistingMakeClientProject(root);
                const previousActiveProjectId = registry.getRegistry?.().activeProjectId ?? null;
                const dev = body?.ensureDev
                    ? await ensureMakeClientDevServer(root, {
                        adminServerInfo: options.serverInfo,
                        serverInfoHomeDir: options.serverInfoHomeDir,
                        diagnosticLog: options.diagnosticLog,
                        ...(typeof body?.timeoutMs === 'number' ? { devTimeoutMs: body.timeoutMs } : {}),
                        ...(typeof body?.pollIntervalMs === 'number' ? { pollIntervalMs: body.pollIntervalMs } : {}),
                    })
                    : null;
                const project = handlers.addOrUpdateMakeClientRegistryProject({
                    id: marker.project.id,
                    name: marker.project.name,
                    root,
                    metadataPath: getProjectMetadataPath(root),
                });
                if (dev) {
                    registry.setActiveProject(project.id);
                }
                else if (previousActiveProjectId) {
                    registry.setActiveProject(previousActiveProjectId);
                }
                sendJson(res, {
                    success: true,
                    project: handlers.toProjectEntry(project),
                    marker,
                    ...(dev ? { reused: dev.reused, phase: dev.phase, runtime: dev.runtime } : {}),
                }, { status: project.createdAt === project.updatedAt ? 201 : 200 });
            }
            catch (error) {
                const status = Number(error?.status || 400);
                sendJson(res, makeClientErrorPayload(error, { root }), { status });
            }
        }).catch((error) => {
            const status = Number(error?.status || 400);
            sendJson(res, makeClientErrorPayload(error), { status });
        });
        return true;
    }
    if (pathname === '/api/projects/make/create' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const parentRoot = String(body?.parentRoot || '').trim();
            const folderName = String(body?.folderName || '').trim();
            if (!parentRoot || !folderName) {
                sendJson(res, {
                    error: 'Missing parentRoot or folderName',
                    code: 'INVALID_MAKE_PROJECT_FOLDER_NAME',
                }, { status: 400 });
                return;
            }
            const result = await createBlankMakeClientProject({
                parentRoot,
                folderName,
                projectName: typeof body?.projectName === 'string' ? body.projectName : undefined,
            }, {
                adminServerInfo: options.serverInfo,
                serverInfoHomeDir: options.serverInfoHomeDir,
                diagnosticLog: options.diagnosticLog,
            });
            const project = handlers.addOrUpdateMakeClientRegistryProject({
                id: result.marker.project.id,
                name: result.marker.project.name,
                root: result.projectRoot,
                metadataPath: getProjectMetadataPath(result.projectRoot),
            });
            registry.setActiveProject(project.id);
            sendJson(res, {
                success: true,
                phase: 'ready',
                project: handlers.toProjectEntry(project),
                marker: result.marker,
                runtime: result.dev.runtime,
                progress: result.progress,
            }, { status: 201 });
        }).catch((error) => {
            sendJson(res, makeClientErrorPayload(error), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (pathname === '/api/projects/make/folder-name-suggestion' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const parentRoot = String(body?.parentRoot || '').trim();
            const projectName = String(body?.projectName || '').trim();
            const folderName = suggestMakeClientFolderName({ parentRoot, projectName });
            sendJson(res, { folderName });
        }).catch((error) => {
            sendJson(res, makeClientErrorPayload(error), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (pathname === '/api/projects/make/clone' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const parentRoot = String(body?.parentRoot || '').trim();
            const folderName = String(body?.folderName || '').trim();
            const gitUrl = String(body?.gitUrl || '').trim();
            if (!parentRoot || !folderName || !gitUrl) {
                sendJson(res, {
                    error: 'Missing parentRoot, folderName, or gitUrl',
                    code: 'INVALID_MAKE_PROJECT_FOLDER_NAME',
                }, { status: 400 });
                return;
            }
            const result = await cloneMakeClientProject({
                parentRoot,
                folderName,
                gitUrl,
                projectName: typeof body?.projectName === 'string' ? body.projectName : undefined,
            }, {
                adminServerInfo: options.serverInfo,
                serverInfoHomeDir: options.serverInfoHomeDir,
                diagnosticLog: options.diagnosticLog,
            });
            const project = handlers.addOrUpdateMakeClientRegistryProject({
                id: result.marker.project.id,
                name: result.marker.project.name,
                root: result.projectRoot,
                metadataPath: getProjectMetadataPath(result.projectRoot),
            });
            registry.setActiveProject(project.id);
            sendJson(res, {
                success: true,
                phase: 'ready',
                project: handlers.toProjectEntry(project),
                marker: result.marker,
                runtime: result.dev.runtime,
                progress: result.progress,
            }, { status: 201 });
        }).catch((error) => {
            const details = error?.details && typeof error.details === 'object' ? error.details : {};
            sendJson(res, {
                ...makeClientErrorPayload(error),
                ...(typeof details.prompt === 'string' ? { prompt: details.prompt } : {}),
                ...(typeof details.promptScene === 'string' ? { promptScene: details.promptScene } : {}),
                ...(typeof details.gitUrl === 'string' ? { gitUrl: details.gitUrl } : {}),
                ...(typeof details.projectRoot === 'string' ? { projectRoot: details.projectRoot } : {}),
            }, { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (!projectRoute) {
        return false;
    }
    const { projectId, rest, project } = projectRoute;
    if (rest === 'make-client/copy' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const parentRoot = String(body?.parentRoot || '').trim();
            const folderName = String(body?.folderName || '').trim();
            if (!parentRoot || !folderName) {
                sendJson(res, {
                    error: 'Missing parentRoot or folderName',
                    code: 'INVALID_MAKE_PROJECT_FOLDER_NAME',
                }, { status: 400 });
                return;
            }
            const result = await copyMakeClientProject({
                sourceProjectRoot: project.root,
                parentRoot,
                folderName,
                projectName: typeof body?.projectName === 'string' ? body.projectName : undefined,
            }, {
                adminServerInfo: options.serverInfo,
                serverInfoHomeDir: options.serverInfoHomeDir,
                diagnosticLog: options.diagnosticLog,
            });
            const copiedProject = handlers.addOrUpdateMakeClientRegistryProject({
                id: result.marker.project.id,
                name: result.marker.project.name,
                root: result.projectRoot,
                metadataPath: getProjectMetadataPath(result.projectRoot),
            });
            registry.setActiveProject(copiedProject.id);
            sendJson(res, {
                success: true,
                phase: 'ready',
                project: handlers.toProjectEntry(copiedProject),
                marker: result.marker,
                runtime: result.dev.runtime,
                progress: result.progress,
                copiedDependencies: result.copiedDependencies,
                installMethod: result.installMethod,
            }, { status: 201 });
        }).catch((error) => {
            sendJson(res, makeClientErrorPayload(error, {
                projectId,
                sourceProjectRoot: project.root,
            }), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (rest === 'make-client/update/status' && req.method === 'GET') {
        getMakeClientUpdateStatus(projectId, project.root)
            .then((status) => sendJson(res, status))
            .catch((error) => {
            sendJson(res, makeClientErrorPayload(error, {
                projectId,
                projectRoot: project.root,
            }), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (rest === 'make-client/update/apply' && req.method === 'POST') {
        applyMakeClientUpdate(projectId, project.root)
            .then((result) => sendJson(res, result))
            .catch((error) => {
            sendJson(res, makeClientErrorPayload(error, {
                projectId,
                projectRoot: project.root,
                ...(error?.updateContext && typeof error.updateContext === 'object' ? error.updateContext : {}),
            }), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (rest === 'dev/ensure' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            return ensureMakeClientDevServer(project.root, {
                adminServerInfo: options.serverInfo,
                serverInfoHomeDir: options.serverInfoHomeDir,
                diagnosticLog: options.diagnosticLog,
                ...(typeof body?.timeoutMs === 'number' ? { devTimeoutMs: body.timeoutMs } : {}),
                ...(typeof body?.pollIntervalMs === 'number' ? { pollIntervalMs: body.pollIntervalMs } : {}),
            });
        }).then((result) => {
            sendJson(res, {
                success: true,
                projectId,
                reused: result.reused,
                phase: result.phase,
                runtime: result.runtime,
                ...(result.runtimePatched ? { runtimePatched: true } : {}),
            });
        }).catch((error) => {
            sendJson(res, makeClientErrorPayload(error, {
                projectId,
                projectRoot: project.root,
            }), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (rest === 'dev/status' && req.method === 'GET') {
        getMakeClientDevStatus(projectId, project.root)
            .then((status) => sendJson(res, status))
            .catch((error) => {
            sendJson(res, makeClientErrorPayload(error, {
                projectId,
                projectRoot: project.root,
            }), { status: Number(error?.status || 500) });
        });
        return true;
    }
    if (rest === 'dev/stop' && req.method === 'POST') {
        stopMakeClientDevServer(projectId, project.root)
            .then((result) => sendJson(res, result))
            .catch((error) => {
            sendJson(res, makeClientErrorPayload(error, {
                projectId,
                projectRoot: project.root,
            }), { status: Number(error?.status || 500) });
        });
        return true;
    }
    return false;
}
