import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonBody, sendFile, sendJson } from './http.ts';
import { isPathInside, resolveProjectPath } from './projectCore/index.ts';
import { classifyAiArtifact } from '../common/aiArtifactClassification.ts';
const HISTORY_FILE_NAME = 'generation-artifacts.json';
const HISTORY_KIND = 'generation-artifacts';
const TASK_HISTORY_FILE_NAME = 'generation-tasks.json';
const TASK_HISTORY_KIND = 'generation-tasks';
const ASSET_DIR_NAME = 'generation-assets';
const IMAGE_ASSET_DIR_NAME = 'images';
const HISTORY_LIMIT = 200;
const historyWriteQueues = new Map();
function safeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function hasRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function numericTime(value, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}
function sanitizeFileName(value) {
    return value
        .replace(/[^a-z0-9._-]+/giu, '-')
        .replace(/^-+|-+$/gu, '')
        .toLowerCase() || `artifact-${Date.now()}`;
}
function inferImageExtension(mimeType) {
    const normalized = mimeType.toLowerCase();
    if (normalized === 'image/jpeg')
        return 'jpg';
    if (normalized === 'image/webp')
        return 'webp';
    if (normalized === 'image/gif')
        return 'gif';
    if (normalized === 'image/svg+xml')
        return 'svg';
    return 'png';
}
function parseImageDataUrl(dataUrl) {
    const raw = safeText(dataUrl);
    const match = raw.match(/^data:(image\/[a-z0-9+.-]+);base64,([a-z0-9+/=\s]+)$/iu);
    if (!match)
        return null;
    const buffer = Buffer.from(match[2].replace(/\s+/gu, ''), 'base64');
    return {
        mimeType: match[1].toLowerCase(),
        buffer,
        hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
}
function normalizeRelativeAssetPath(value) {
    const normalized = safeText(value).replace(/\\/g, '/').replace(/^\/+/u, '');
    if (!normalized || normalized.includes('\0') || normalized.split('/').some((segment) => segment === '..')) {
        return '';
    }
    return normalized;
}
function normalizeGenerationArtifactTargetPath(rawValue) {
    const raw = String(rawValue ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!raw) {
        return { ok: false, status: 400, error: 'Missing targetPath' };
    }
    if (raw.includes('..')) {
        return { ok: false, status: 403, error: 'Invalid targetPath' };
    }
    const segments = raw.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'prototypes') {
        return { ok: false, status: 400, error: 'targetPath must be prototypes/<id>' };
    }
    const prototypeId = segments[1];
    if (!prototypeId || prototypeId.startsWith('.') || prototypeId.includes('\0')) {
        return { ok: false, status: 400, error: 'Invalid prototype id' };
    }
    return { ok: true, id: prototypeId };
}
function getDeclaredPrototypeWriteDir(context) {
    const target = context.metadata.resourceWriteTargets?.prototypes;
    if (!target || target.type !== 'project-relative-path' || !target.path) {
        return null;
    }
    try {
        return resolveProjectPath(context.project.root, target.path);
    }
    catch {
        return null;
    }
}
function resolveHistory(context, rawTargetPath) {
    const normalized = normalizeGenerationArtifactTargetPath(rawTargetPath);
    if (normalized.ok === false)
        return normalized;
    const prototypesDir = getDeclaredPrototypeWriteDir(context);
    if (!prototypesDir) {
        return { ok: false, status: 424, error: 'Generation artifact history requires declared prototype write target' };
    }
    const defaultPrototypesDir = path.join(context.project.root, 'src', 'prototypes');
    if (path.resolve(prototypesDir) !== path.resolve(defaultPrototypesDir)) {
        return { ok: false, status: 403, error: 'Generation artifact history is limited to src/prototypes' };
    }
    const prototypeDir = path.resolve(prototypesDir, normalized.id);
    const specDir = path.join(prototypeDir, '.spec');
    const artifactHistoryPath = path.join(specDir, HISTORY_FILE_NAME);
    const taskHistoryPath = path.join(specDir, TASK_HISTORY_FILE_NAME);
    const artifactAssetDir = path.join(specDir, ASSET_DIR_NAME);
    const artifactImageAssetDir = path.join(artifactAssetDir, IMAGE_ASSET_DIR_NAME);
    if (!isPathInside(context.project.root, prototypeDir)
        || !isPathInside(prototypesDir, prototypeDir)
        || !isPathInside(prototypeDir, specDir)
        || !isPathInside(specDir, artifactHistoryPath)
        || !isPathInside(specDir, taskHistoryPath)
        || !isPathInside(specDir, artifactAssetDir)
        || !isPathInside(artifactAssetDir, artifactImageAssetDir)) {
        return { ok: false, status: 403, error: 'Invalid targetPath' };
    }
    return {
        ok: true,
        projectId: context.project.id,
        prototypeId: normalized.id,
        prototypeDir,
        specDir,
        artifactHistoryPath,
        taskHistoryPath,
        artifactAssetDir,
        artifactImageAssetDir,
    };
}
function atomicWriteJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    catch (error) {
        fs.rmSync(tempPath, { force: true });
        throw error;
    }
}
function enqueueHistoryWrite(filePath, operation) {
    const previous = historyWriteQueues.get(filePath) || Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(operation);
    historyWriteQueues.set(filePath, next.finally(() => {
        if (historyWriteQueues.get(filePath) === next) {
            historyWriteQueues.delete(filePath);
        }
    }));
    return next;
}
function isDeletedRecord(value) {
    return Number(value.deletedAt || 0) > 0;
}
function visibleArtifacts(artifacts) {
    return artifacts.filter((artifact) => !isDeletedRecord(artifact));
}
function visibleTasks(tasks) {
    return tasks.filter((task) => !isDeletedRecord(task));
}
function resolveKindFromPathAndMime(params) {
    return classifyAiArtifact({
        path: params.target.path,
        uri: params.target.uri,
        url: params.target.url,
        href: params.target.href,
        title: params.metadata.title,
        name: params.metadata.name,
        fileName: params.metadata.fileName,
        mimeType: params.metadata.mimeType,
        mediaType: params.metadata.mediaType,
        fallbackKind: params.kind,
    });
}
function resolveTitle(params) {
    const explicit = safeText(params.title)
        || safeText(params.metadata.title)
        || safeText(params.metadata.name)
        || safeText(params.metadata.fileName);
    if (explicit)
        return explicit;
    const pathValue = safeText(params.target.path) || safeText(params.target.uri) || safeText(params.target.url);
    const base = pathValue ? path.basename(pathValue.split(/[?#]/u)[0] || pathValue) : '';
    return base || (params.kind === 'image' ? '生成图片' : 'AI 生成产物');
}
function isImageDataText(value) {
    return typeof value === 'string' && /^data:image\/[a-z0-9+.-]+;base64,/iu.test(value.trim());
}
function sanitizeMetadata(value) {
    const output = {};
    for (const [key, rawValue] of Object.entries(value)) {
        if (isImageDataText(rawValue))
            continue;
        if (key === 'dataUrl'
            || key === 'dataURL'
            || key === 'base64'
            || key === 'b64_json'
            || key === 'data')
            continue;
        output[key] = rawValue;
    }
    return output;
}
function createAssetUrl(projectId, targetPath, assetPath) {
    const params = new URLSearchParams({ projectId, targetPath, assetPath });
    return `/api/ai/artifact-history/assets?${params.toString()}`;
}
function persistArtifactImageAsset(artifact, resolved) {
    const parsed = parseImageDataUrl(artifact.dataUrl);
    if (!parsed) {
        const existingAssetPath = normalizeRelativeAssetPath(artifact.assetRef?.assetPath);
        if (!existingAssetPath)
            return artifact.assetRef;
        return {
            ...(hasRecord(artifact.assetRef) ? artifact.assetRef : {}),
            assetPath: existingAssetPath,
            url: createAssetUrl(resolved.projectId, `prototypes/${resolved.prototypeId}`, existingAssetPath),
        };
    }
    const metadata = hasRecord(artifact.metadata)
        ? artifact.metadata
        : {};
    const fileNameBase = sanitizeFileName(safeText(metadata.fileName)
        || safeText(metadata.name)
        || safeText(artifact.id)
        || parsed.hash.slice(0, 16));
    const fileName = `${path.basename(fileNameBase, path.extname(fileNameBase))}-${parsed.hash.slice(0, 12)}.${inferImageExtension(parsed.mimeType)}`;
    const assetFilePath = path.join(resolved.artifactImageAssetDir, fileName);
    if (!isPathInside(resolved.artifactImageAssetDir, assetFilePath)) {
        throw new Error('Invalid artifact image asset path');
    }
    fs.mkdirSync(resolved.artifactImageAssetDir, { recursive: true });
    fs.writeFileSync(assetFilePath, parsed.buffer);
    const assetPath = `${ASSET_DIR_NAME}/${IMAGE_ASSET_DIR_NAME}/${fileName}`;
    return {
        assetPath,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.buffer.byteLength,
        hash: parsed.hash,
        url: createAssetUrl(resolved.projectId, `prototypes/${resolved.prototypeId}`, assetPath),
    };
}
function normalizeArtifactRecord(input, resolved, defaults = {}) {
    if (!hasRecord(input))
        return null;
    const now = defaults.now || Date.now();
    const target = hasRecord(input.target) ? input.target : {};
    const source = hasRecord(input.source) ? input.source : {};
    const metadata = sanitizeMetadata(hasRecord(input.metadata) ? input.metadata : {});
    const kind = resolveKindFromPathAndMime({ kind: input.kind, target, metadata });
    const id = safeText(input.id)
        || crypto.createHash('sha1').update(JSON.stringify({ kind, source, target, metadata })).digest('hex').slice(0, 16);
    const operation = input.operation === 'updated' ? 'updated' : 'created';
    const createdAt = numericTime(input.createdAt, now);
    const updatedAt = numericTime(input.updatedAt, createdAt);
    const status = input.status === 'running' || input.status === 'error' || input.status === 'done'
        ? input.status
        : defaults.status || 'done';
    const deletedAt = numericTime(input.deletedAt, 0);
    const assetRef = kind === 'image'
        ? persistArtifactImageAsset(input, resolved)
        : hasRecord(input.assetRef)
            ? input.assetRef
            : undefined;
    return {
        id,
        artifactId: safeText(input.artifactId) || id,
        ...(safeText(input.taskId) || defaults.taskId ? { taskId: safeText(input.taskId) || defaults.taskId } : {}),
        ...(safeText(input.conversationId) || defaults.conversationId ? { conversationId: safeText(input.conversationId) || defaults.conversationId } : {}),
        kind,
        operation,
        title: resolveTitle({ title: input.title, target, metadata, kind }),
        source,
        target,
        ...(assetRef ? { assetRef } : {}),
        ...(safeText(input.runId) || defaults.runId ? { runId: safeText(input.runId) || defaults.runId } : {}),
        ...(safeText(input.threadId) || defaults.threadId ? { threadId: safeText(input.threadId) || defaults.threadId } : {}),
        createdAt,
        updatedAt,
        ...(deletedAt ? { deletedAt } : {}),
        status,
        metadata,
    };
}
function normalizeTaskRecord(input, resolved, defaults = {}) {
    if (!hasRecord(input))
        return null;
    const now = defaults.now || Date.now();
    const taskId = safeText(input.taskId) || safeText(input.id) || defaults.taskId;
    if (!taskId)
        return null;
    const createdAt = numericTime(input.createdAt, now);
    const updatedAt = numericTime(input.updatedAt, createdAt);
    const status = input.status === 'running' || input.status === 'error' || input.status === 'done'
        ? input.status
        : defaults.status || 'running';
    const deletedAt = numericTime(input.deletedAt, 0);
    const artifactIds = Array.isArray(input.artifactIds)
        ? Array.from(new Set(input.artifactIds.map((value) => safeText(value)).filter(Boolean)))
        : [];
    return {
        id: taskId,
        taskId,
        ...(safeText(input.conversationId) || defaults.conversationId ? { conversationId: safeText(input.conversationId) || defaults.conversationId } : {}),
        ...(safeText(input.runId) || defaults.runId ? { runId: safeText(input.runId) || defaults.runId } : {}),
        ...(safeText(input.threadId) || defaults.threadId ? { threadId: safeText(input.threadId) || defaults.threadId } : {}),
        ...(safeText(input.scene) || defaults.scene ? { scene: safeText(input.scene) || defaults.scene } : {}),
        prompt: safeText(input.prompt) || defaults.prompt || '',
        ...(safeText(input.sourcePrompt) ? { sourcePrompt: safeText(input.sourcePrompt) } : {}),
        params: hasRecord(input.params) ? input.params : {},
        context: hasRecord(input.context) ? input.context : {},
        ...(safeText(input.targetPath) || defaults.targetPath ? { targetPath: safeText(input.targetPath) || defaults.targetPath } : {}),
        ...(safeText(input.generatorElementId) || defaults.generatorElementId ? { generatorElementId: safeText(input.generatorElementId) || defaults.generatorElementId } : {}),
        status,
        ...(input.error === null || safeText(input.error) ? { error: input.error === null ? null : safeText(input.error) } : {}),
        ...(safeText(input.output) ? { output: safeText(input.output) } : {}),
        artifactIds,
        createdAt,
        updatedAt,
        ...(numericTime(input.finishedAt, 0) ? { finishedAt: numericTime(input.finishedAt, 0) } : {}),
        ...(deletedAt ? { deletedAt } : {}),
        metadata: sanitizeMetadata(hasRecord(input.metadata) ? input.metadata : {}),
    };
}
function sortArtifacts(artifacts) {
    return [...artifacts]
        .sort((left, right) => Number(right.updatedAt || right.deletedAt || right.createdAt || 0) - Number(left.updatedAt || left.deletedAt || left.createdAt || 0))
        .slice(0, HISTORY_LIMIT);
}
function sortTasks(tasks) {
    return [...tasks]
        .sort((left, right) => Number(right.updatedAt || right.deletedAt || right.createdAt || 0) - Number(left.updatedAt || left.deletedAt || left.createdAt || 0))
        .slice(0, HISTORY_LIMIT);
}
function readArtifactHistoryFile(resolved) {
    if (!fs.existsSync(resolved.artifactHistoryPath)) {
        return {
            schemaVersion: 1,
            kind: HISTORY_KIND,
            targetPath: `prototypes/${resolved.prototypeId}`,
            limit: HISTORY_LIMIT,
            artifacts: [],
        };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved.artifactHistoryPath, 'utf8'));
        const artifacts = Array.isArray(raw?.artifacts)
            ? raw.artifacts
                .map((artifact) => normalizeArtifactRecord(artifact, resolved))
                .filter((artifact) => Boolean(artifact))
            : [];
        return {
            schemaVersion: 1,
            kind: HISTORY_KIND,
            targetPath: `prototypes/${resolved.prototypeId}`,
            limit: HISTORY_LIMIT,
            artifacts: sortArtifacts(artifacts),
        };
    }
    catch {
        return {
            schemaVersion: 1,
            kind: HISTORY_KIND,
            targetPath: `prototypes/${resolved.prototypeId}`,
            limit: HISTORY_LIMIT,
            artifacts: [],
        };
    }
}
function readTaskHistoryFile(resolved) {
    if (!fs.existsSync(resolved.taskHistoryPath)) {
        return {
            schemaVersion: 1,
            kind: TASK_HISTORY_KIND,
            targetPath: `prototypes/${resolved.prototypeId}`,
            limit: HISTORY_LIMIT,
            tasks: [],
        };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved.taskHistoryPath, 'utf8'));
        const tasks = Array.isArray(raw?.tasks)
            ? raw.tasks
                .map((task) => normalizeTaskRecord(task, resolved))
                .filter((task) => Boolean(task))
            : [];
        return {
            schemaVersion: 1,
            kind: TASK_HISTORY_KIND,
            targetPath: `prototypes/${resolved.prototypeId}`,
            limit: HISTORY_LIMIT,
            tasks: sortTasks(tasks),
        };
    }
    catch {
        return {
            schemaVersion: 1,
            kind: TASK_HISTORY_KIND,
            targetPath: `prototypes/${resolved.prototypeId}`,
            limit: HISTORY_LIMIT,
            tasks: [],
        };
    }
}
function writeArtifactHistoryFile(resolved, artifacts) {
    const document = {
        schemaVersion: 1,
        kind: HISTORY_KIND,
        targetPath: `prototypes/${resolved.prototypeId}`,
        limit: HISTORY_LIMIT,
        artifacts: sortArtifacts(artifacts),
    };
    atomicWriteJson(resolved.artifactHistoryPath, document);
    return document;
}
function writeTaskHistoryFile(resolved, tasks) {
    const document = {
        schemaVersion: 1,
        kind: TASK_HISTORY_KIND,
        targetPath: `prototypes/${resolved.prototypeId}`,
        limit: HISTORY_LIMIT,
        tasks: sortTasks(tasks),
    };
    atomicWriteJson(resolved.taskHistoryPath, document);
    return document;
}
function upsertArtifacts(existing, next) {
    const byId = new Map();
    for (const artifact of existing) {
        byId.set(artifact.id, artifact);
    }
    for (const artifact of next) {
        const previous = byId.get(artifact.id);
        byId.set(artifact.id, {
            ...previous,
            ...artifact,
            createdAt: previous?.createdAt || artifact.createdAt,
            deletedAt: artifact.deletedAt,
        });
    }
    return sortArtifacts([...byId.values()]);
}
function upsertTasks(existing, next) {
    const byId = new Map();
    for (const task of existing) {
        byId.set(task.id, task);
    }
    for (const task of next) {
        const previous = byId.get(task.id);
        if (isDeletedRecord(previous || {})) {
            continue;
        }
        byId.set(task.id, {
            ...previous,
            ...task,
            artifactIds: Array.from(new Set([...(previous?.artifactIds || []), ...task.artifactIds])),
            createdAt: previous?.createdAt || task.createdAt,
        });
    }
    return sortTasks([...byId.values()]);
}
function createDeletedArtifact(id, now) {
    return {
        id,
        artifactId: id,
        kind: 'file',
        operation: 'updated',
        title: id,
        source: {},
        target: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        status: 'done',
        metadata: {},
    };
}
function createDeletedTask(id, now) {
    return {
        id,
        taskId: id,
        prompt: '',
        params: {},
        context: {},
        status: 'done',
        artifactIds: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        metadata: {},
    };
}
async function upsertArtifactHistory(resolved, artifacts) {
    return enqueueHistoryWrite(resolved.artifactHistoryPath, () => {
        const existing = readArtifactHistoryFile(resolved);
        return writeArtifactHistoryFile(resolved, upsertArtifacts(existing.artifacts, artifacts));
    });
}
async function deleteArtifactHistory(resolved, ids) {
    return enqueueHistoryWrite(resolved.artifactHistoryPath, () => {
        const existing = readArtifactHistoryFile(resolved);
        const now = Date.now();
        const byId = new Map(existing.artifacts.map((artifact) => [artifact.id, artifact]));
        for (const id of ids) {
            const previous = byId.get(id) || createDeletedArtifact(id, now);
            byId.set(id, {
                ...previous,
                updatedAt: Math.max(Number(previous.updatedAt || 0), now),
                deletedAt: previous.deletedAt || now,
            });
        }
        return writeArtifactHistoryFile(resolved, sortArtifacts([...byId.values()]));
    });
}
async function upsertTaskHistory(resolved, tasks) {
    return enqueueHistoryWrite(resolved.taskHistoryPath, () => {
        const existing = readTaskHistoryFile(resolved);
        return writeTaskHistoryFile(resolved, upsertTasks(existing.tasks, tasks));
    });
}
async function deleteTaskHistory(resolved, ids) {
    return enqueueHistoryWrite(resolved.taskHistoryPath, () => {
        const existing = readTaskHistoryFile(resolved);
        const now = Date.now();
        const byId = new Map(existing.tasks.map((task) => [task.id, task]));
        for (const id of ids) {
            const previous = byId.get(id) || createDeletedTask(id, now);
            byId.set(id, {
                ...previous,
                updatedAt: Math.max(Number(previous.updatedAt || 0), now),
                deletedAt: previous.deletedAt || now,
            });
        }
        return writeTaskHistoryFile(resolved, sortTasks([...byId.values()]));
    });
}
export async function appendAiRunArtifactsToHistory(params) {
    if (!params.artifacts.length)
        return null;
    const resolved = resolveHistory(params.context, safeText(params.targetPath) || null);
    if (resolved.ok === false)
        return null;
    const now = Date.now();
    const next = params.artifacts
        .map((artifact) => normalizeArtifactRecord(artifact, resolved, {
        taskId: params.taskId,
        conversationId: params.conversationId,
        runId: params.runId,
        threadId: params.threadId,
        status: params.status || 'done',
        now,
    }))
        .filter((artifact) => Boolean(artifact));
    if (!next.length)
        return readArtifactHistoryFile(resolved);
    return upsertArtifactHistory(resolved, next);
}
export async function upsertAiRunTaskToHistory(params) {
    const resolved = resolveHistory(params.context, safeText(params.targetPath) || null);
    if (resolved.ok === false)
        return null;
    const normalized = normalizeTaskRecord(params.task, resolved, {
        taskId: params.taskId,
        conversationId: params.conversationId,
        runId: params.runId,
        threadId: params.threadId,
        scene: params.scene,
        prompt: params.prompt,
        targetPath: safeText(params.targetPath),
        generatorElementId: params.generatorElementId,
        status: params.status || 'running',
        now: Date.now(),
    });
    if (!normalized)
        return readTaskHistoryFile(resolved);
    return upsertTaskHistory(resolved, [normalized]);
}
function handleAssetRequest(req, res, context) {
    if (req.method !== 'GET') {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    const resolved = resolveHistory(context, url.searchParams.get('targetPath'));
    if (resolved.ok === false) {
        sendJson(res, { error: resolved.error }, { status: resolved.status });
        return true;
    }
    const assetPath = normalizeRelativeAssetPath(url.searchParams.get('assetPath'));
    if (!assetPath || !assetPath.startsWith(`${ASSET_DIR_NAME}/`)) {
        sendJson(res, { error: 'Invalid assetPath' }, { status: 400 });
        return true;
    }
    const filePath = path.resolve(resolved.specDir, assetPath);
    if (!isPathInside(resolved.artifactAssetDir, filePath) || !sendFile(res, filePath, { cacheControl: 'no-store' })) {
        sendJson(res, { error: 'Asset not found' }, { status: 404 });
    }
    return true;
}
function extractRecordList(body, singularKey, pluralKey) {
    if (!hasRecord(body))
        return [];
    const singular = body[singularKey];
    const plural = body[pluralKey];
    if (Array.isArray(plural))
        return plural;
    if (singular !== undefined)
        return [singular];
    return [];
}
function extractDeleteIds(body, singularKeys, pluralKeys) {
    if (!hasRecord(body))
        return [];
    const ids = new Set();
    for (const key of singularKeys) {
        const id = safeText(body[key]);
        if (id)
            ids.add(id);
    }
    for (const key of pluralKeys) {
        const value = body[key];
        if (!Array.isArray(value))
            continue;
        for (const item of value) {
            const id = safeText(item);
            if (id)
                ids.add(id);
        }
    }
    return [...ids];
}
function visibleArtifactHistory(history) {
    return {
        ...history,
        artifacts: visibleArtifacts(history.artifacts),
    };
}
function visibleTaskHistory(history) {
    return {
        ...history,
        tasks: visibleTasks(history.tasks),
    };
}
function handleGenerationTasksApi(req, res, context) {
    const url = new URL(req.url || '/api/ai/generation-tasks', 'http://localhost');
    const resolved = resolveHistory(context, url.searchParams.get('targetPath'));
    if (resolved.ok === false) {
        sendJson(res, { error: resolved.error }, { status: resolved.status });
        return true;
    }
    if (req.method === 'GET') {
        sendJson(res, visibleTaskHistory(readTaskHistoryFile(resolved)));
        return true;
    }
    if (req.method === 'POST' || req.method === 'PATCH') {
        readJsonBody(req)
            .then(async (body) => {
            const tasks = extractRecordList(body, 'task', 'tasks')
                .map((task) => normalizeTaskRecord(task, resolved))
                .filter((task) => Boolean(task));
            sendJson(res, visibleTaskHistory(await upsertTaskHistory(resolved, tasks)));
        })
            .catch((error) => sendJson(res, { error: error?.message || 'Failed to write generation tasks' }, { status: 400 }));
        return true;
    }
    if (req.method === 'DELETE') {
        readJsonBody(req)
            .then(async (body) => {
            const ids = extractDeleteIds(body, ['id', 'taskId'], ['ids', 'taskIds']);
            sendJson(res, visibleTaskHistory(await deleteTaskHistory(resolved, ids)));
        })
            .catch((error) => sendJson(res, { error: error?.message || 'Failed to delete generation tasks' }, { status: 400 }));
        return true;
    }
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
}
export function handleAiArtifactHistoryApi(req, res, context, pathname) {
    if (pathname === '/api/ai/artifact-history/assets') {
        return handleAssetRequest(req, res, context);
    }
    if (pathname === '/api/ai/generation-tasks') {
        return handleGenerationTasksApi(req, res, context);
    }
    if (pathname !== '/api/ai/artifact-history') {
        return false;
    }
    const url = new URL(req.url || pathname, 'http://localhost');
    const resolved = resolveHistory(context, url.searchParams.get('targetPath'));
    if (resolved.ok === false) {
        sendJson(res, { error: resolved.error }, { status: resolved.status });
        return true;
    }
    if (req.method === 'GET') {
        sendJson(res, visibleArtifactHistory(readArtifactHistoryFile(resolved)));
        return true;
    }
    if (req.method === 'POST' || req.method === 'PATCH') {
        readJsonBody(req)
            .then(async (body) => {
            const artifacts = extractRecordList(body, 'artifact', 'artifacts')
                .map((artifact) => normalizeArtifactRecord(artifact, resolved))
                .filter((artifact) => Boolean(artifact));
            sendJson(res, visibleArtifactHistory(await upsertArtifactHistory(resolved, artifacts)));
        })
            .catch((error) => sendJson(res, { error: error?.message || 'Failed to write artifact history' }, { status: 400 }));
        return true;
    }
    if (req.method === 'DELETE') {
        readJsonBody(req)
            .then(async (body) => {
            const ids = extractDeleteIds(body, ['id', 'artifactId'], ['ids', 'artifactIds']);
            sendJson(res, visibleArtifactHistory(await deleteArtifactHistory(resolved, ids)));
        })
            .catch((error) => sendJson(res, { error: error?.message || 'Failed to delete artifact history' }, { status: 400 }));
        return true;
    }
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
}
