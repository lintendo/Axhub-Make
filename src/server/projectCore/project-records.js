import fs from 'node:fs';
import path from 'node:path';
import { getProjectEditHistoryDir, getProjectExportsDir, getProjectSessionsDir, resolveProjectRoot, } from './paths.ts';
export { getProjectEditHistoryDir, getProjectExportsDir, getProjectSessionsDir, } from './paths.ts';
function nowIso() {
    return new Date().toISOString();
}
function safeSegment(input, fallback) {
    const normalized = String(input || '')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return normalized || fallback;
}
function createRecordId(prefix, timestamp) {
    const timeSegment = timestamp.replace(/[:.]/g, '-');
    const randomSegment = Math.random().toString(36).slice(2, 8);
    return `${safeSegment(prefix, 'record')}-${timeSegment}-${randomSegment}`;
}
function writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function createBaseRecord(input, prefix) {
    const timestamp = nonEmptyString(input.timestamp) || nowIso();
    return {
        schemaVersion: 1,
        id: createRecordId(prefix, timestamp),
        projectId: nonEmptyString(input.projectId) || 'unknown-project',
        ...(nonEmptyString(input.resourceId) ? { resourceId: nonEmptyString(input.resourceId) } : {}),
        ...(nonEmptyString(input.resourceType) ? { resourceType: nonEmptyString(input.resourceType) } : {}),
        status: nonEmptyString(input.status) || 'pending',
        errorMessage: nonEmptyString(input.errorMessage) || '',
        createdAt: timestamp,
    };
}
function writeRecord(dir, kind, record) {
    const filePath = path.join(dir, `${record.id}.json`);
    writeJsonAtomic(filePath, record);
    return { kind, record, filePath };
}
function hasResourceIdentity(input) {
    return Boolean(nonEmptyString(input.projectId) && nonEmptyString(input.resourceId) && nonEmptyString(input.resourceType));
}
export function createProjectCommunicationStore(projectRoot) {
    const resolvedProjectRoot = resolveProjectRoot(projectRoot);
    const sessionsDir = getProjectSessionsDir(resolvedProjectRoot);
    const exportsDir = getProjectExportsDir(resolvedProjectRoot);
    const editHistoryDir = getProjectEditHistoryDir(resolvedProjectRoot);
    return {
        ensureDirectories() {
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(exportsDir, { recursive: true });
            fs.mkdirSync(editHistoryDir, { recursive: true });
        },
        appendSessionRecord(input) {
            const record = {
                ...createBaseRecord(input, input.messageType || 'session'),
                ...(nonEmptyString(input.clientUrlOrigin) ? { clientUrlOrigin: nonEmptyString(input.clientUrlOrigin) } : {}),
                ...(nonEmptyString(input.runtimeVersion) ? { runtimeVersion: nonEmptyString(input.runtimeVersion) } : {}),
                ...(nonEmptyString(input.messageType) ? { messageType: nonEmptyString(input.messageType) } : {}),
                ...(input.diagnosticOnly ? { diagnosticOnly: true } : {}),
            };
            return writeRecord(sessionsDir, 'session', record);
        },
        appendExportRecord(input) {
            const operationType = nonEmptyString(input.operationType) || 'export';
            const record = {
                ...createBaseRecord(input, operationType),
                operationType,
                ...(input.metadata && typeof input.metadata === 'object' ? { metadata: input.metadata } : {}),
            };
            return writeRecord(exportsDir, 'export', record);
        },
        appendEditHistoryRecord(input) {
            const operationType = nonEmptyString(input.operationType) || 'quickEdit';
            const record = {
                ...createBaseRecord(input, operationType),
                operationType,
                ...(input.metadata && typeof input.metadata === 'object' ? { metadata: input.metadata } : {}),
            };
            return writeRecord(editHistoryDir, 'edit-history', record);
        },
        appendRuntimeMessageRecord(input) {
            if (!hasResourceIdentity(input)) {
                return this.appendSessionRecord({
                    ...input,
                    diagnosticOnly: true,
                });
            }
            return this.appendEditHistoryRecord({
                ...input,
                operationType: input.messageType,
            });
        },
    };
}
