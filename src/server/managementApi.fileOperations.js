import fs from 'node:fs';
import path from 'node:path';
import { createSidebarTreeStore, isPathInside, resolveProjectPath, } from './projectCore/index.ts';
import { readJsonBody, sendJson } from './http.ts';
/**
 * After a file/directory is deleted, check whether it corresponds to a
 * prototype, doc, or other tracked resource and remove it from the project
 * metadata so that subsequent API reads return consistent data.
 */
function removeDeletedResourceFromMetadata(metadataStore, projectRoot, deletedPath) {
    if (!metadataStore)
        return;
    const metadata = metadataStore.getMetadata();
    const relativePath = path.relative(projectRoot, deletedPath).split(path.sep).join('/');
    // --- Prototypes ---
    // A prototype lives under src/prototypes/<name>/ (a directory) or is
    // referenced by its id/name in metadata.resources.prototypes.
    const prototypesDirPrefix = 'src/prototypes/';
    if (relativePath.startsWith(prototypesDirPrefix)) {
        // e.g. "src/prototypes/my-app" → prototypeId = "my-app"
        const rest = relativePath.slice(prototypesDirPrefix.length);
        const prototypeId = rest.split('/')[0]; // top-level folder name
        if (prototypeId) {
            const beforeCount = metadata.resources.prototypes.length;
            const nextPrototypes = metadata.resources.prototypes.filter((p) => p.id !== prototypeId && p.name !== prototypeId);
            if (nextPrototypes.length < beforeCount) {
                metadataStore.saveMetadata({
                    ...metadata,
                    resources: {
                        ...metadata.resources,
                        prototypes: nextPrototypes,
                    },
                    navigation: {
                        ...metadata.navigation,
                        prototypes: metadata.navigation.prototypes.filter((id) => id !== prototypeId),
                    },
                });
            }
        }
    }
}
function decodePathSegment(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return '';
    }
}
function normalizeProjectRelativePath(projectRoot, absolutePath) {
    return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}
function isInvalidFileOperationName(name) {
    return !name || name === '.' || name === '..' || /[/\\:*?"<>|]/.test(name);
}
function updatePrototypeDisplayName(metadataStore, prototypeId, displayName) {
    if (!metadataStore) {
        return { ok: false, status: 424, error: 'Project metadata is required' };
    }
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
        return { ok: false, status: 400, error: 'Missing displayName' };
    }
    const metadata = metadataStore.getMetadata();
    let found = false;
    const nextPrototypes = metadata.resources.prototypes.map((prototype) => {
        if (prototype.id !== prototypeId && prototype.name !== prototypeId) {
            return prototype;
        }
        found = true;
        return {
            ...prototype,
            title: trimmedDisplayName,
        };
    });
    if (!found) {
        return { ok: false, status: 404, error: 'Prototype not found' };
    }
    metadataStore.saveMetadata({
        ...metadata,
        resources: {
            ...metadata.resources,
            prototypes: nextPrototypes,
        },
    });
    return { ok: true };
}
function replacePrototypeSidebarTreeTitle(nodes, itemKey, title) {
    let changed = false;
    const walk = (list) => list.map((node) => {
        if (node.kind === 'folder') {
            return {
                ...node,
                children: Array.isArray(node.children) ? walk(node.children) : node.children,
            };
        }
        if (node.itemKey !== itemKey || node.title === title) {
            return node;
        }
        changed = true;
        return {
            ...node,
            title,
        };
    });
    return {
        tree: walk(nodes),
        changed,
    };
}
function updatePrototypeSidebarTreeTitle(projectRoot, prototypeId, displayName) {
    const sidebarTreeStore = createSidebarTreeStore(projectRoot);
    const itemKey = `prototypes/${prototypeId}`;
    const result = replacePrototypeSidebarTreeTitle(sidebarTreeStore.getTree('prototypes'), itemKey, displayName);
    if (result.changed) {
        sidebarTreeStore.setTree('prototypes', result.tree);
    }
}
export function handleFileOperationsApi(req, res, projectRoot, pathname, metadataStore) {
    const prototypeDisplayNameMatch = pathname.match(/^\/api\/prototypes\/([^/]+)$/u);
    if (prototypeDisplayNameMatch) {
        if (req.method !== 'POST' && req.method !== 'PUT') {
            sendJson(res, { error: 'Method not allowed' }, { status: 405 });
            return true;
        }
        const prototypeId = decodePathSegment(prototypeDisplayNameMatch[1]).trim();
        if (!prototypeId || prototypeId.includes('/') || prototypeId.includes('\\')) {
            sendJson(res, { error: 'Invalid prototype name' }, { status: 400 });
            return true;
        }
        readJsonBody(req).then((body) => {
            const displayName = String(body?.displayName || body?.title || '').trim();
            const result = updatePrototypeDisplayName(metadataStore ?? null, prototypeId, displayName);
            if (result.ok === false) {
                sendJson(res, { error: result.error }, { status: result.status });
                return;
            }
            updatePrototypeSidebarTreeTitle(projectRoot, prototypeId, displayName);
            sendJson(res, { success: true, name: prototypeId, displayName });
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname !== '/api/delete' && pathname !== '/api/rename' && pathname !== '/api/copy') {
        return false;
    }
    if (req.method !== 'POST') {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
    }
    readJsonBody(req).then((body) => {
        const rawPath = String(body?.path || body?.sourcePath || '').trim();
        if (!rawPath) {
            sendJson(res, { error: 'Missing path' }, { status: 400 });
            return;
        }
        const targetPath = resolveProjectPath(projectRoot, rawPath);
        if (path.resolve(targetPath) === path.resolve(projectRoot)) {
            sendJson(res, {
                error: 'Refusing to operate on the project root',
                code: 'PROJECT_ROOT_OPERATION_FORBIDDEN',
            }, { status: 403 });
            return;
        }
        if (pathname === '/api/delete') {
            if (!fs.existsSync(targetPath)) {
                sendJson(res, {
                    error: 'Target path not found',
                    code: 'FILE_OPERATION_TARGET_NOT_FOUND',
                }, { status: 404 });
                return;
            }
            fs.rmSync(targetPath, { recursive: true, force: true });
            removeDeletedResourceFromMetadata(metadataStore ?? null, projectRoot, targetPath);
            sendJson(res, { success: true });
            return;
        }
        const explicitTargetPath = pathname === '/api/copy' ? String(body?.targetPath || '').trim() : '';
        const newName = String(body?.newName || body?.targetName || '').trim();
        if (!explicitTargetPath && isInvalidFileOperationName(newName)) {
            sendJson(res, { error: 'Invalid newName' }, { status: 400 });
            return;
        }
        const nextPath = explicitTargetPath
            ? resolveProjectPath(projectRoot, explicitTargetPath)
            : path.join(path.dirname(targetPath), newName);
        if (explicitTargetPath) {
            const nextName = path.basename(nextPath);
            if (path.resolve(nextPath) === path.resolve(projectRoot) || isInvalidFileOperationName(nextName)) {
                sendJson(res, { error: 'Invalid targetPath' }, { status: 400 });
                return;
            }
        }
        if (!isPathInside(projectRoot, nextPath)) {
            sendJson(res, { error: 'Forbidden' }, { status: 403 });
            return;
        }
        if (pathname === '/api/rename') {
            fs.renameSync(targetPath, nextPath);
            sendJson(res, { success: true, path: normalizeProjectRelativePath(projectRoot, nextPath) });
            return;
        }
        if (fs.statSync(targetPath).isDirectory()) {
            fs.cpSync(targetPath, nextPath, { recursive: true });
        }
        else {
            fs.copyFileSync(targetPath, nextPath);
        }
        sendJson(res, { success: true, path: normalizeProjectRelativePath(projectRoot, nextPath) });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
}
