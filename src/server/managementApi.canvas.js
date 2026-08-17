import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isPathInside } from './projectCore/index.ts';
import { getCanvasBridgeHub } from './canvasBridge.ts';
import { readJsonBody, sendFile, sendJson } from './http.ts';
import { getResourceAssetDirectory, getResourceAssetRelativePath, resolveResourceFilePath, } from './resourceFiles.ts';
const CANVAS_EXT = '.excalidraw';
const DEFAULT_CANVAS_SOURCE = '@axhub/make';
const CANVAS_IMAGE_ASSETS_DIR = 'images';
const CANVAS_SCREENSHOT_FILE = 'screenshot.png';
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const MAX_CANVAS_IMAGE_BYTES = 12 * 1024 * 1024;
const SAFE_SCREENSHOT_FILE_PATTERN = /^[a-z0-9][a-z0-9._-]*\.png$/iu;
const SAFE_CANVAS_PAGE_ID_PATTERN = /^[a-z0-9-]+$/u;
const CANVAS_IMAGE_MIME_EXTENSIONS = {
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};
export function createDefaultCanvasData() {
    return {
        type: 'excalidraw',
        version: 2,
        source: DEFAULT_CANVAS_SOURCE,
        elements: [],
        appState: {
            viewBackgroundColor: '#ffffff',
        },
        files: {},
    };
}
function parseEncodedSegment(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return null;
    }
}
function createResourceCanvasAssetStorageOptions(resourcesDir, resourcePath) {
    const assetRelativePath = getResourceAssetRelativePath(resourcePath) || `${resourcePath}.assets`;
    const assetDirectory = getResourceAssetDirectory(resourcesDir, resourcePath)
        || path.resolve(resourcesDir, ...assetRelativePath.split('/'));
    if (!assetDirectory || !assetRelativePath) {
        throw new Error('Invalid resource canvas asset path');
    }
    return {
        assetBaseDir: resourcesDir,
        imageAssetDir: path.resolve(assetDirectory, CANVAS_IMAGE_ASSETS_DIR),
        imagePathPrefix: `${assetRelativePath}/${CANVAS_IMAGE_ASSETS_DIR}`,
    };
}
function decodePngDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') {
        return null;
    }
    const match = dataUrl.match(/^data:image\/png;base64,([a-z0-9+/=\s]+)$/iu);
    if (!match) {
        return null;
    }
    const buffer = Buffer.from(match[1].replace(/\s+/gu, ''), 'base64');
    if (buffer.length === 0 || buffer.length > MAX_SCREENSHOT_BYTES) {
        return null;
    }
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
        return null;
    }
    return buffer;
}
function hasValidCanvasImageSignature(buffer, mimeType) {
    if (mimeType === 'image/png') {
        return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/gif') {
        const header = buffer.subarray(0, 6).toString('ascii');
        return header === 'GIF87a' || header === 'GIF89a';
    }
    if (mimeType === 'image/webp') {
        return (buffer.length >= 12
            && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
            && buffer.subarray(8, 12).toString('ascii') === 'WEBP');
    }
    return false;
}
function decodeCanvasImageDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') {
        return null;
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/iu);
    if (!match) {
        return null;
    }
    const mimeType = match[1].toLowerCase();
    const ext = CANVAS_IMAGE_MIME_EXTENSIONS[mimeType];
    if (!ext) {
        return null;
    }
    const buffer = Buffer.from(match[2].replace(/\s+/gu, ''), 'base64');
    if (buffer.length === 0 || buffer.length > MAX_CANVAS_IMAGE_BYTES) {
        return null;
    }
    if (!hasValidCanvasImageSignature(buffer, mimeType)) {
        return null;
    }
    return { buffer, mimeType, ext };
}
function isSupportedCanvasImageDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') {
        return false;
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,/iu);
    if (!match) {
        return false;
    }
    return Boolean(CANVAS_IMAGE_MIME_EXTENSIONS[match[1].toLowerCase()]);
}
function toSafeCanvasAssetFileBase(value) {
    const rawValue = typeof value === 'string' && value.trim() ? value.trim() : 'image';
    const normalized = rawValue
        .replace(/[^a-z0-9._-]+/giu, '-')
        .replace(/-+/gu, '-')
        .replace(/^-|-$/gu, '')
        .toLowerCase();
    if (normalized) {
        return normalized;
    }
    return createHash('sha1').update(rawValue).digest('hex').slice(0, 12);
}
function writeBinaryFileIfChanged(filePath, nextContent) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const currentContent = fs.readFileSync(filePath);
        if (currentContent.equals(nextContent)) {
            return false;
        }
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, nextContent);
    return true;
}
function normalizeScreenshotDimension(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }
    return Math.round(value);
}
function toSafeScreenshotFileBase(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value
        .trim()
        .replace(/[^a-z0-9]+/giu, '-')
        .replace(/-+/gu, '-')
        .replace(/^-|-$/gu, '')
        .toLowerCase();
    return normalized || null;
}
function getRequestedScreenshotFileName(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!SAFE_SCREENSHOT_FILE_PATTERN.test(trimmed) || trimmed.includes('/') || trimmed.includes('\\')) {
        return null;
    }
    return trimmed;
}
function getCanvasPageScreenshotFileName(pageId) {
    if (typeof pageId !== 'string') {
        return null;
    }
    const trimmed = pageId.trim();
    return SAFE_CANVAS_PAGE_ID_PATTERN.test(trimmed) ? `page-${trimmed}.png` : null;
}
function getScreenshotFileName(body) {
    const requestedFileName = getRequestedScreenshotFileName(body?.fileName);
    if (requestedFileName) {
        return requestedFileName;
    }
    const pageScreenshotFileName = getCanvasPageScreenshotFileName(body?.pageId);
    if (pageScreenshotFileName) {
        return pageScreenshotFileName;
    }
    const safeElementId = toSafeScreenshotFileBase(body?.elementId);
    return safeElementId ? `embed-${safeElementId}.png` : CANVAS_SCREENSHOT_FILE;
}
function hydrateStoredCanvasImageFiles(data, options) {
    if (!options || !data || typeof data !== 'object' || !data.files || typeof data.files !== 'object') {
        return data;
    }
    for (const file of Object.values(data.files)) {
        if (!file || typeof file !== 'object' || typeof file.dataURL === 'string') {
            continue;
        }
        const storedPath = typeof file.path === 'string' ? file.path : '';
        const ext = CANVAS_IMAGE_MIME_EXTENSIONS[String(file.mimeType || '').toLowerCase()];
        if (!storedPath || !ext) {
            continue;
        }
        const imagePath = path.resolve(options.assetBaseDir, storedPath);
        if (!isPathInside(options.assetBaseDir, imagePath)) {
            continue;
        }
        try {
            const stats = fs.statSync(imagePath);
            if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_CANVAS_IMAGE_BYTES) {
                continue;
            }
            const content = fs.readFileSync(imagePath);
            if (!hasValidCanvasImageSignature(content, String(file.mimeType).toLowerCase())) {
                continue;
            }
            file.dataURL = `data:${String(file.mimeType).toLowerCase()};base64,${content.toString('base64')}`;
        }
        catch {
            // Keep the lightweight path-only file record if the local asset is missing.
        }
    }
    return data;
}
function sendCanvasJsonFile(res, filePath, options) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const content = fs.readFileSync(filePath, 'utf8');
    if (!options) {
        res.end(content);
        return true;
    }
    try {
        const data = hydrateStoredCanvasImageFiles(JSON.parse(content), options);
        res.end(JSON.stringify(data, null, 2));
    }
    catch {
        res.end(content);
    }
    return true;
}
function stripPersistedElementScreenshotDataUrls(data) {
    if (!Array.isArray(data?.elements)) {
        return data;
    }
    for (const element of data.elements) {
        const customData = element?.customData;
        if (customData
            && typeof customData.screenshotUrl === 'string'
            && customData.screenshotUrl.trim()
            && Object.prototype.hasOwnProperty.call(customData, 'screenshotDataUrl')) {
            delete customData.screenshotDataUrl;
        }
    }
    return data;
}
function localizeCanvasImageFiles(data, options) {
    if (!options || !data || typeof data !== 'object' || !data.files || typeof data.files !== 'object') {
        return data;
    }
    for (const [fileKey, file] of Object.entries(data.files)) {
        if (!file || typeof file !== 'object') {
            continue;
        }
        const decoded = decodeCanvasImageDataUrl(file.dataURL);
        if (!decoded && typeof file.dataURL === 'string') {
            if (!isSupportedCanvasImageDataUrl(file.dataURL)) {
                continue;
            }
            throw new Error(`Unsupported or invalid canvas image data URL for file ${fileKey}`);
        }
        if (!decoded) {
            continue;
        }
        const fileId = typeof file.id === 'string' && file.id.trim() ? file.id.trim() : fileKey;
        const fileName = `${toSafeCanvasAssetFileBase(fileId)}${decoded.ext}`;
        const imagePath = path.resolve(options.imageAssetDir, fileName);
        if (!isPathInside(options.assetBaseDir, imagePath) || !isPathInside(options.imageAssetDir, imagePath)) {
            continue;
        }
        writeBinaryFileIfChanged(imagePath, decoded.buffer);
        const { dataURL: _dataURL, ...rest } = file;
        data.files[fileKey] = {
            ...rest,
            mimeType: decoded.mimeType,
            id: fileId,
            path: `${options.imagePathPrefix}/${fileName}`,
        };
    }
    return data;
}
function normalizeCanvasContent(body, assetOptions) {
    const content = body?.content;
    const data = typeof content === 'string' ? JSON.parse(content) : (content ?? body);
    return JSON.stringify(localizeCanvasImageFiles(stripPersistedElementScreenshotDataUrls(data), assetOptions), null, 2);
}
function hasSameCanvasContent(filePath, nextContent) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }
    const currentContent = fs.readFileSync(filePath, 'utf8');
    if (currentContent === nextContent) {
        return true;
    }
    try {
        return JSON.stringify(JSON.parse(currentContent), null, 2) === nextContent;
    }
    catch {
        return false;
    }
}
function writeCanvasContentIfChanged(filePath, nextContent) {
    if (hasSameCanvasContent(filePath, nextContent)) {
        return false;
    }
    fs.writeFileSync(filePath, nextContent, 'utf8');
    return true;
}
function saveCanvasContent(filePath, body, assetOptions) {
    const nextContent = normalizeCanvasContent(body, assetOptions);
    const changed = writeCanvasContentIfChanged(filePath, nextContent);
    if (changed) {
        getCanvasBridgeHub().recordCanvasSave(filePath, nextContent, {
            sourceClientId: typeof body?.canvasBridgeClientId === 'string' ? body.canvasBridgeClientId : null,
        });
    }
    return { changed };
}
function writeScreenshotIfChanged(filePath, nextContent) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const currentContent = fs.readFileSync(filePath);
        if (currentContent.equals(nextContent)) {
            return false;
        }
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, nextContent);
    return true;
}
function encodeCanvasApiPath(canvasPath) {
    return canvasPath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
}
function createResourceScreenshotResponse(projectRoot, projectId, resourcePath, screenshotPath, params) {
    const updatedAt = Date.now();
    const fileName = path.basename(screenshotPath);
    const relativeScreenshotPath = path.relative(projectRoot, screenshotPath).split(path.sep).join('/');
    const latestPath = params.latestPath ? path.relative(projectRoot, params.latestPath).split(path.sep).join('/') : undefined;
    const query = new URLSearchParams({ v: String(updatedAt), projectId });
    const apiScreenshotUrl = `/api/canvas/resources/${encodeCanvasApiPath(resourcePath)}/asset/${encodeURIComponent(fileName)}?${query.toString()}`;
    return {
        success: true,
        changed: params.changed,
        resourcePath,
        fileName,
        name: `${resourcePath}/${fileName}`,
        path: relativeScreenshotPath,
        latestPath,
        absoluteFilePath: screenshotPath,
        screenshotUrl: apiScreenshotUrl,
        apiScreenshotUrl,
        width: params.width,
        height: params.height,
        updatedAt,
    };
}
function resolveResourceScreenshotReadPath(assetsDir, requestedAssetPath) {
    const normalized = requestedAssetPath.replace(/\\/gu, '/');
    if (!normalized.startsWith('asset/')) {
        return null;
    }
    const fileName = normalized.slice('asset/'.length);
    if (!getRequestedScreenshotFileName(fileName)) {
        return null;
    }
    const requestedPath = path.resolve(assetsDir, fileName);
    return isPathInside(assetsDir, requestedPath) ? requestedPath : null;
}
function handleResourceCanvasScreenshotApi(req, res, projectRoot, pathname, projectId) {
    const match = pathname.match(/^\/api\/canvas\/resources\/(.+?\.excalidraw)\/(screenshot|[^?]+\.png)$/iu);
    if (!match) {
        return false;
    }
    const decodedCanvasPath = parseEncodedSegment(match[1]);
    const action = parseEncodedSegment(match[2]);
    if (!decodedCanvasPath || !action) {
        sendJson(res, { error: 'Invalid resource canvas path' }, { status: 400 });
        return true;
    }
    const resolved = resolveResourceFilePath(projectRoot, decodedCanvasPath, { allowAssetPath: true });
    if (!resolved) {
        sendJson(res, { error: 'Invalid resource canvas path' }, { status: 403 });
        return true;
    }
    if (!fs.existsSync(resolved.absolutePath)) {
        sendJson(res, { error: 'Canvas not found' }, { status: 404 });
        return true;
    }
    const assetsDir = getResourceAssetDirectory(resolved.resourcesDir, resolved.relativePath)
        || path.resolve(resolved.resourcesDir, `${resolved.relativePath}.assets`);
    if (!assetsDir) {
        sendJson(res, { error: 'Invalid resource canvas asset path' }, { status: 403 });
        return true;
    }
    const latestScreenshotPath = path.resolve(assetsDir, CANVAS_SCREENSHOT_FILE);
    if (action.endsWith('.png')) {
        if (req.method !== 'GET') {
            sendJson(res, { error: 'Method not allowed' }, { status: 405 });
            return true;
        }
        const requestedPath = resolveResourceScreenshotReadPath(assetsDir, action);
        if (!requestedPath) {
            sendJson(res, { error: 'Invalid screenshot path' }, { status: 403 });
            return true;
        }
        if (!sendFile(res, requestedPath)) {
            sendJson(res, { error: 'Screenshot not found' }, { status: 404 });
        }
        return true;
    }
    if (req.method !== 'POST') {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
    }
    readJsonBody(req).then((body) => {
        const png = decodePngDataUrl(body?.dataUrl);
        if (!png) {
            sendJson(res, { error: 'Expected PNG data URL' }, { status: 400 });
            return;
        }
        if (body?.pageId !== undefined && !getCanvasPageScreenshotFileName(body.pageId)) {
            sendJson(res, { error: 'Invalid screenshot path' }, { status: 403 });
            return;
        }
        const screenshotFileName = getScreenshotFileName(body);
        const screenshotPath = path.resolve(assetsDir, screenshotFileName);
        if (!isPathInside(assetsDir, screenshotPath) || !isPathInside(projectRoot, screenshotPath)) {
            sendJson(res, { error: 'Invalid screenshot path' }, { status: 403 });
            return;
        }
        const changed = writeScreenshotIfChanged(screenshotPath, png);
        const latestChanged = screenshotPath === latestScreenshotPath
            ? changed
            : writeScreenshotIfChanged(latestScreenshotPath, png);
        sendJson(res, createResourceScreenshotResponse(projectRoot, projectId, resolved.relativePath, screenshotPath, {
            changed: changed || latestChanged,
            latestPath: screenshotPath === latestScreenshotPath ? undefined : latestScreenshotPath,
            width: normalizeScreenshotDimension(body?.width),
            height: normalizeScreenshotDimension(body?.height),
        }), { status: changed || latestChanged ? 201 : 200 });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
}
function createResourceCanvasResponse(projectRoot, relativePath, canvasPath, created = false) {
    return {
        success: true,
        created,
        name: relativePath,
        displayName: path.basename(relativePath, CANVAS_EXT),
        path: path.relative(projectRoot, canvasPath).split(path.sep).join('/'),
        absoluteFilePath: canvasPath,
    };
}
function handleResourceCanvasApi(req, res, projectRoot, pathname) {
    const match = pathname.match(/^\/api\/canvas\/resources\/(.+)$/u);
    if (!match) {
        return false;
    }
    const decodedPath = parseEncodedSegment(match[1]);
    if (!decodedPath) {
        sendJson(res, { error: 'Invalid resource canvas path' }, { status: 400 });
        return true;
    }
    if (path.extname(decodedPath).toLowerCase() !== CANVAS_EXT) {
        sendJson(res, { error: 'Canvas not found' }, { status: 404 });
        return true;
    }
    const resolved = resolveResourceFilePath(projectRoot, decodedPath, { allowAssetPath: true });
    if (!resolved) {
        sendJson(res, { error: 'Invalid resource canvas path' }, { status: 403 });
        return true;
    }
    const assetOptions = createResourceCanvasAssetStorageOptions(resolved.resourcesDir, resolved.relativePath);
    if (req.method === 'GET') {
        if (!sendCanvasJsonFile(res, resolved.absolutePath, assetOptions)) {
            sendJson(res, { error: 'Canvas not found' }, { status: 404 });
        }
        return true;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
        readJsonBody(req).then((body) => {
            if (req.method === 'POST'
                && typeof body?.content !== 'string'
                && typeof body?.content !== 'object') {
                sendJson(res, { error: 'Expected canvas content' }, { status: 400 });
                return;
            }
            fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
            const existedBefore = fs.existsSync(resolved.absolutePath);
            const { changed } = saveCanvasContent(resolved.absolutePath, body, assetOptions);
            sendJson(res, {
                ...createResourceCanvasResponse(projectRoot, resolved.relativePath, resolved.absolutePath, !existedBefore),
                changed,
            }, { status: !existedBefore ? 201 : 200 });
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
}
export function handleCanvasApi(req, res, projectRoot, pathname, context = {}) {
    if (!pathname.startsWith('/api/canvas')) {
        return false;
    }
    if (handleResourceCanvasScreenshotApi(req, res, projectRoot, pathname, String(context.projectId || ''))) {
        return true;
    }
    if (handleResourceCanvasApi(req, res, projectRoot, pathname)) {
        return true;
    }
    void context;
    sendJson(res, { error: 'Canvas not found' }, { status: 404 });
    return true;
}
