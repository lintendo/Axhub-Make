import fs from 'node:fs';
import path from 'node:path';
import { isPathInside } from './projectCore/index.ts';
import { getRequestUrl, readJsonBody, sendFile, sendJson } from './http.ts';
function normalizeMediaRelativePath(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .join('/');
}
function getMediaDir(projectRoot, mediaRoot) {
    return mediaRoot ? path.resolve(mediaRoot) : path.join(projectRoot, 'assets', 'media');
}
function resolveMediaPath(projectRoot, relativePath, options) {
    const mediaDir = getMediaDir(projectRoot, options?.mediaRoot);
    const normalizedRelativePath = normalizeMediaRelativePath(relativePath);
    const resolvedMediaDir = path.resolve(mediaDir);
    const resolvedTargetPath = normalizedRelativePath
        ? path.resolve(resolvedMediaDir, normalizedRelativePath)
        : resolvedMediaDir;
    if (resolvedTargetPath === resolvedMediaDir) {
        return options?.allowRoot === true ? resolvedTargetPath : null;
    }
    return isPathInside(resolvedMediaDir, resolvedTargetPath) ? resolvedTargetPath : null;
}
function toMediaRelativePath(projectRoot, absolutePath, mediaRoot) {
    return path.relative(getMediaDir(projectRoot, mediaRoot), absolutePath).split(path.sep).join('/');
}
function isSafeMediaName(value) {
    return Boolean(value && value.trim() && !value.includes('..') && !/[\\/]/.test(value));
}
function getAssetType(filePath, isDirectory) {
    if (isDirectory)
        return 'folder';
    const ext = path.extname(filePath).toLowerCase();
    const mediaTypes = {
        '.jpg': 'image',
        '.jpeg': 'image',
        '.png': 'image',
        '.gif': 'image',
        '.webp': 'image',
        '.svg': 'image',
        '.mp3': 'audio',
        '.wav': 'audio',
        '.ogg': 'audio',
        '.m4a': 'audio',
        '.json': 'animation',
    };
    return mediaTypes[ext] || 'image';
}
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.json': 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}
function scanDirectory(dirPath, relativePath = '') {
    if (!fs.existsSync(dirPath)) {
        return [];
    }
    return fs.readdirSync(dirPath)
        .filter((item) => !item.startsWith('.'))
        .map((item) => {
        const fullPath = path.join(dirPath, item);
        const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
        const stats = fs.statSync(fullPath);
        const asset = {
            id: itemRelativePath,
            name: item,
            path: itemRelativePath,
            type: getAssetType(fullPath, stats.isDirectory()),
            createdAt: stats.birthtime.toISOString(),
            parentPath: relativePath || undefined,
        };
        if (!stats.isDirectory()) {
            asset.size = stats.size;
            asset.mimeType = getMimeType(fullPath);
        }
        return asset;
    });
}
export function handleMediaApi(req, res, projectRoot, options = {}) {
    const url = getRequestUrl(req);
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith('/api/media')) {
        return false;
    }
    const mediaDir = getMediaDir(projectRoot, options.mediaRoot);
    fs.mkdirSync(mediaDir, { recursive: true });
    if ((pathname === '/api/media' || pathname === '/api/media/') && req.method === 'GET') {
        const requestedPath = url.searchParams.get('path') || '';
        const targetDir = resolveMediaPath(projectRoot, requestedPath, { allowRoot: true, mediaRoot: options.mediaRoot });
        if (!targetDir) {
            sendJson(res, { error: 'Invalid media path', timestamp: new Date().toISOString() }, { status: 403 });
            return true;
        }
        if (!fs.existsSync(targetDir)) {
            sendJson(res, { error: 'Directory not found', timestamp: new Date().toISOString() }, { status: 404 });
            return true;
        }
        sendJson(res, scanDirectory(targetDir, normalizeMediaRelativePath(requestedPath)));
        return true;
    }
    if (pathname === '/api/media/folder' && req.method === 'POST') {
        readJsonBody(req).then((body) => {
            const folderName = String(body?.name || '').trim();
            if (!isSafeMediaName(folderName)) {
                sendJson(res, { error: 'Invalid folder name', timestamp: new Date().toISOString() }, { status: 400 });
                return;
            }
            const parentDir = resolveMediaPath(projectRoot, String(body?.parentPath || ''), { allowRoot: true, mediaRoot: options.mediaRoot });
            if (!parentDir) {
                sendJson(res, { error: 'Invalid parent path', timestamp: new Date().toISOString() }, { status: 403 });
                return;
            }
            const targetDir = path.join(parentDir, folderName);
            if (!isPathInside(mediaDir, targetDir)) {
                sendJson(res, { error: 'Invalid parent path', timestamp: new Date().toISOString() }, { status: 403 });
                return;
            }
            if (fs.existsSync(targetDir)) {
                sendJson(res, { error: 'Folder already exists', timestamp: new Date().toISOString() }, { status: 400 });
                return;
            }
            fs.mkdirSync(targetDir, { recursive: true });
            sendJson(res, {
                message: 'Folder created successfully',
                path: toMediaRelativePath(projectRoot, targetDir, options.mediaRoot),
            });
        }).catch((error) => sendJson(res, { error: `Invalid request: ${error.message}`, timestamp: new Date().toISOString() }, { status: 400 }));
        return true;
    }
    if (pathname.startsWith('/api/media/file/') && req.method === 'GET') {
        const assetPath = pathname.slice('/api/media/file/'.length);
        const fullPath = resolveMediaPath(projectRoot, assetPath, { mediaRoot: options.mediaRoot });
        if (!fullPath) {
            sendJson(res, { error: 'Invalid asset path', timestamp: new Date().toISOString() }, { status: 403 });
            return true;
        }
        if (!sendFile(res, fullPath)) {
            sendJson(res, { error: 'File not found', timestamp: new Date().toISOString() }, { status: 404 });
            return true;
        }
        return true;
    }
    if (pathname.startsWith('/api/media/') && req.method === 'DELETE') {
        const assetPath = pathname.slice('/api/media/'.length);
        const fullPath = resolveMediaPath(projectRoot, assetPath, { mediaRoot: options.mediaRoot });
        if (!fullPath) {
            sendJson(res, { error: 'Invalid asset path', timestamp: new Date().toISOString() }, { status: 403 });
            return true;
        }
        if (!fs.existsSync(fullPath)) {
            sendJson(res, { error: 'Asset not found', timestamp: new Date().toISOString() }, { status: 404 });
            return true;
        }
        fs.rmSync(fullPath, { recursive: true, force: true });
        sendJson(res, { message: 'Asset deleted successfully' });
        return true;
    }
    return false;
}
