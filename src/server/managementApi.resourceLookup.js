import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from './projectCore/index.ts';
const SOURCE_RESOURCE_GROUPS = new Set(['prototypes', 'themes']);
const SOURCE_INDEX_CANDIDATES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];
function normalizeSlashPath(value) {
    return String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}
function stripIndexEntryPath(value) {
    return value.replace(/\/index\.(t|j)sx?$/iu, '').replace(/\/+$/, '');
}
function sourceResourcePathFromGroupAndName(group, name) {
    const normalizedName = stripIndexEntryPath(normalizeSlashPath(name));
    return normalizedName ? `src/${group}/${normalizedName}` : '';
}
function normalizeResourcePathCandidate(value) {
    const normalized = stripIndexEntryPath(normalizeSlashPath(value));
    const [, group = '', resourceName = ''] = normalized.match(/(?:^|\/)(?:src\/)?(prototypes|themes)\/(.+)$/u) || [];
    if (SOURCE_RESOURCE_GROUPS.has(group) && resourceName) {
        return sourceResourcePathFromGroupAndName(group, resourceName);
    }
    return normalized;
}
function getResourceGroupFromCollection(metadata, resource) {
    if (metadata.resources.prototypes.includes(resource)) {
        return 'prototypes';
    }
    if (metadata.resources.themes.includes(resource)) {
        return 'themes';
    }
    return '';
}
function getResourceSourceCandidates(resource) {
    return [
        resource?.absoluteFilePath,
        resource?.filePath,
        resource?.sourcePath,
        resource?.path,
    ]
        .map(normalizeSlashPath)
        .filter(Boolean);
}
export function normalizeProjectResourcePath(metadata, rawPath) {
    const resource = findProjectResourceByPath(metadata, rawPath);
    if (resource) {
        const group = getResourceGroupFromCollection(metadata, resource);
        if (SOURCE_RESOURCE_GROUPS.has(group)) {
            const sourcePath = getResourceSourceCandidates(resource)
                .map(normalizeResourcePathCandidate)
                .find((candidate) => candidate.startsWith(`src/${group}/`));
            return sourcePath || sourceResourcePathFromGroupAndName(group, resource.id || resource.name || rawPath);
        }
    }
    return normalizeResourcePathCandidate(rawPath);
}
export function findProjectResourceByPath(metadata, rawPath) {
    const normalizedPath = normalizeSlashPath(rawPath);
    const normalizedCandidate = normalizeResourcePathCandidate(rawPath);
    const [, resourceName = ''] = normalizedPath.match(/^(?:src\/)?(?:prototypes|themes)\/(.+)$/u) || [];
    const normalizedResourceName = stripIndexEntryPath(resourceName);
    const allResources = [
        ...metadata.resources.prototypes,
        ...metadata.resources.themes,
    ];
    return allResources.find((resource) => {
        const id = String(resource.id || '').trim();
        const name = String(resource.name || '').trim();
        const resourcePathCandidates = getResourceSourceCandidates(resource).map(normalizeResourcePathCandidate);
        return id === normalizedPath
            || name === normalizedPath
            || id === normalizedResourceName
            || name === normalizedResourceName
            || `${id}/index.tsx` === normalizedResourceName
            || `${name}/index.tsx` === normalizedResourceName
            || resourcePathCandidates.includes(normalizedCandidate);
    });
}
function resolveDirectoryIndexFile(sourcePath) {
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
        return null;
    }
    for (const fileName of SOURCE_INDEX_CANDIDATES) {
        const candidate = path.join(sourcePath, fileName);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }
    return null;
}
export function resolveSourceFileFromMetadata(context, rawPath) {
    const resource = findProjectResourceByPath(context.metadata, rawPath);
    const sourceCandidate = String(resource?.absoluteFilePath || resource?.filePath || resource?.sourcePath || resource?.path || '').trim();
    const directCandidate = sourceCandidate || rawPath;
    try {
        const sourcePath = resolveProjectPath(context.project.root, directCandidate);
        if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()) {
            return sourcePath;
        }
        return resolveDirectoryIndexFile(sourcePath);
    }
    catch {
        return null;
    }
}
export function resolveProjectFileIfPresent(context, rawPath) {
    const candidate = String(rawPath || '').trim();
    if (!candidate) {
        return null;
    }
    try {
        const filePath = resolveProjectPath(context.project.root, candidate);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return filePath;
        }
    }
    catch {
        return null;
    }
    return null;
}
export function getAxureArtifactPaths(context, rawPath) {
    const resource = findProjectResourceByPath(context.metadata, rawPath);
    const runtime = resource?.artifacts && typeof resource.artifacts === 'object'
        ? resource.artifacts.runtime
        : null;
    const axure = resource?.artifacts && typeof resource.artifacts === 'object'
        ? resource.artifacts.axure
        : null;
    return {
        resource,
        runtimeBuiltJsPath: resolveProjectFileIfPresent(context, runtime?.builtJsPath),
        runtimeBuiltJsRelativePath: typeof runtime?.builtJsPath === 'string' ? runtime.builtJsPath.trim() : '',
        indexBundlePath: resolveProjectFileIfPresent(context, axure?.indexBundlePath),
    };
}
