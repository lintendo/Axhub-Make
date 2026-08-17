import fs from 'node:fs';
import path from 'node:path';
import { isPathInside } from './projectCore/index.ts';
const IMAGE_EXTENSIONS = new Set([
    '.avif',
    '.gif',
    '.jpeg',
    '.jpg',
    '.png',
    '.svg',
    '.webp',
]);
export function getResourcesDir(projectRoot) {
    return path.join(projectRoot, 'src/resources');
}
export function normalizeResourceRelativePath(value) {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    if (!raw || raw.includes('\0') || raw.startsWith('/') || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
        return '';
    }
    const withoutResourcesPrefix = raw.replace(/^src\/resources\/+/u, '');
    const normalized = path.posix.normalize(withoutResourcesPrefix).replace(/^\.\/+/u, '').replace(/\/+$/u, '');
    if (!normalized || normalized === '.') {
        return '';
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
        return '';
    }
    return normalized;
}
export function normalizeResourceAssetRelativePath(value) {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    if (!raw || raw.includes('\0') || raw.startsWith('/') || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
        return '';
    }
    const withoutResourcesPrefix = raw.replace(/^src\/resources\/+/u, '');
    const normalized = path.posix.normalize(withoutResourcesPrefix).replace(/^\.\/+/u, '').replace(/\/+$/u, '');
    if (!normalized || normalized === '.') {
        return '';
    }
    const segments = normalized.split('/');
    if (segments[0] !== '.assets'
        || segments.length < 2
        || segments.some((segment, index) => !segment || segment === '.' || segment === '..' || (index > 0 && segment.startsWith('.')))) {
        return '';
    }
    return normalized;
}
export function isIgnoredResourceRelativePath(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized)
        return true;
    const lower = normalized.toLowerCase();
    if (lower === 'readme' || lower === 'readme.md')
        return true;
    return normalized.split('/').some((segment) => segment.startsWith('.'));
}
export function isResourceAssetSidecarDirectoryName(name) {
    return String(name || '').endsWith('.assets');
}
export function getResourceAssetRelativePath(resourcePath) {
    const relativePath = normalizeResourceRelativePath(resourcePath);
    return relativePath ? `.assets/${relativePath}` : '';
}
export function getResourceAssetDirectory(resourcesDir, resourcePath) {
    const assetRelativePath = getResourceAssetRelativePath(resourcePath);
    if (!assetRelativePath) {
        return null;
    }
    const assetDirectory = path.resolve(resourcesDir, ...assetRelativePath.split('/'));
    return isPathInside(resourcesDir, assetDirectory) ? assetDirectory : null;
}
export function getResourceFileExt(fileName) {
    const lowerName = String(fileName || '').toLowerCase();
    if (lowerName.endsWith('.drawio.svg')) {
        return '.drawio.svg';
    }
    return path.extname(lowerName);
}
export function getResourceOpenMode(fileName) {
    const ext = getResourceFileExt(fileName);
    if (ext === '.md')
        return 'document';
    if (ext === '.excalidraw')
        return 'canvas';
    if (ext === '.drawio' || ext === '.drawio.svg')
        return 'drawio';
    if (IMAGE_EXTENSIONS.has(ext))
        return 'image';
    return 'file';
}
function readMarkdownTitle(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
    }
    catch {
        return '';
    }
}
function readMarkdownDescription(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith('#')) || '';
    }
    catch {
        return '';
    }
}
function getResourceTitleFromRelativePath(relativePath, ext) {
    const fileName = relativePath.split('/').filter(Boolean).pop() || relativePath;
    if (ext && fileName.toLowerCase().endsWith(ext.toLowerCase())) {
        return fileName.slice(0, fileName.length - ext.length);
    }
    return fileName.replace(/\.[^.]+$/u, '');
}
export function scanResourceFiles(projectRoot) {
    const resourcesDir = getResourcesDir(projectRoot);
    if (!fs.existsSync(resourcesDir)) {
        return [];
    }
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.'))
                continue;
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(resourcesDir, fullPath).split(path.sep).join('/');
            if (isIgnoredResourceRelativePath(relativePath))
                continue;
            if (entry.isDirectory()) {
                if (isResourceAssetSidecarDirectoryName(entry.name)) {
                    continue;
                }
                walk(fullPath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            let stats;
            try {
                stats = fs.statSync(fullPath);
            }
            catch {
                continue;
            }
            const ext = getResourceFileExt(entry.name);
            const openMode = getResourceOpenMode(entry.name);
            const fallbackTitle = getResourceTitleFromRelativePath(relativePath, ext);
            const title = ext === '.md'
                ? readMarkdownTitle(fullPath) || fallbackTitle
                : fallbackTitle;
            const id = ext === '.md' ? relativePath.replace(/\.[^.]+$/u, '') : relativePath;
            files.push({
                id,
                name: id,
                title,
                path: relativePath,
                filePath: `src/resources/${relativePath}`,
                ext,
                size: stats.size,
                fileSize: stats.size,
                updatedAt: stats.mtime.toISOString(),
                absoluteFilePath: fullPath,
                description: ext === '.md' ? readMarkdownDescription(fullPath) : '',
                openMode,
            });
        }
    };
    walk(resourcesDir);
    return files.sort((a, b) => a.path.localeCompare(b.path));
}
export function resolveResourceFilePath(projectRoot, resourcePath, options) {
    const standardRelativePath = normalizeResourceRelativePath(resourcePath);
    const assetRelativePath = options?.allowAssetPath
        ? normalizeResourceAssetRelativePath(resourcePath)
        : '';
    const relativePath = standardRelativePath || assetRelativePath;
    if (!relativePath || (!assetRelativePath && isIgnoredResourceRelativePath(relativePath))) {
        return null;
    }
    const resourcesDir = getResourcesDir(projectRoot);
    const absolutePath = path.resolve(resourcesDir, relativePath);
    if (!isPathInside(resourcesDir, absolutePath) || !isPathInside(projectRoot, absolutePath)) {
        return null;
    }
    return { relativePath, absolutePath, resourcesDir };
}
