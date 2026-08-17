import fs from 'node:fs';
import path from 'node:path';
import { getMakeClientMarkerPath, resolveProjectRoot } from './paths.ts';
export const MAKE_CLIENT_MARKER_KIND = 'axhub-make-client';
export const DEFAULT_MAKE_CLIENT_REPOSITORY = 'https://github.com/lintendo/Axhub-Make/tree/main/client';
export const DEFAULT_MAKE_CLIENT_PROJECT_ID = 'make-project';
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isSafeProjectId(value) {
    return Boolean(value.trim())
        && value !== '.'
        && value !== '..'
        && value.length <= 120
        && !/[/?#\u0000-\u001f]/u.test(value);
}
function isLegacyOfficialProjectName(projectId, name) {
    return projectId === DEFAULT_MAKE_CLIENT_PROJECT_ID && (name === 'Axhub Make' || name === 'Axhub-Make');
}
export function normalizeMakeClientProjectName(projectId, name) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    return isLegacyOfficialProjectName(projectId, normalizedName) ? '' : normalizedName;
}
export function normalizeMakeClientMarker(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const project = raw.project && typeof raw.project === 'object' && !Array.isArray(raw.project)
        ? raw.project
        : {};
    const kind = stringValue(raw.kind);
    const id = stringValue(project.id);
    const name = normalizeMakeClientProjectName(id, project.name);
    const repository = stringValue(raw.repository) || DEFAULT_MAKE_CLIENT_REPOSITORY;
    const templateUrl = stringValue(raw.templateUrl);
    const templateVersion = stringValue(raw.templateVersion);
    if (raw.schemaVersion !== 1 || kind !== MAKE_CLIENT_MARKER_KIND || !id) {
        return null;
    }
    if (!isSafeProjectId(id)) {
        throw new Error(`Invalid make client project id: ${id}`);
    }
    return {
        schemaVersion: 1,
        kind: MAKE_CLIENT_MARKER_KIND,
        repository,
        ...(templateUrl ? { templateUrl } : {}),
        ...(templateVersion ? { templateVersion } : {}),
        project: {
            id,
            name,
        },
    };
}
export function readMakeClientMarker(projectRoot) {
    const markerPath = getMakeClientMarkerPath(projectRoot);
    return normalizeMakeClientMarker(readJsonFile(markerPath));
}
export function writeMakeClientMarker(projectRoot, marker) {
    const normalized = normalizeMakeClientMarker(marker);
    if (!normalized) {
        throw new Error('Invalid make client marker');
    }
    const root = resolveProjectRoot(projectRoot);
    writeJsonAtomic(getMakeClientMarkerPath(root), normalized);
    return normalized;
}
export function validateMakeClientProject(projectRoot) {
    const marker = readMakeClientMarker(projectRoot);
    if (!marker) {
        throw new Error('NOT_MAKE_CLIENT_PROJECT');
    }
    return marker;
}
