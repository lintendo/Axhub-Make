import fs from 'node:fs';
import path from 'node:path';
import { isPathInside, resolveProjectPath } from './projectCore/index.ts';
import { getRequestUrl, readJsonBody, sendFile, sendJson } from './http.ts';
import { sendHtmlDocumentPreview } from './htmlDocumentPreview.ts';
const PROTECTED_SPEC_DIRECTORIES = new Set([
    'acp',
    'generation-assets',
    'prototype-comment-assets',
    'reviews',
]);
const PROTECTED_SPEC_FILES = new Set([
    'ai-image-history.json',
    'generation-artifacts.json',
    'generation-tasks.json',
    'prototype-comments.json',
]);
function decodePathSegment(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return '';
    }
}
function resolvePrototypeSpec(context, prototypeId, apiBasePath) {
    const resource = context.metadata.resources.prototypes.find((item) => item.id === prototypeId);
    const filePath = String(resource?.filePath || '').trim();
    const specFilePath = String(resource?.specFilePath || '').trim();
    if (!resource || (!filePath && !specFilePath))
        return null;
    let sourcePath;
    let prototypeDir;
    let specDir;
    try {
        sourcePath = resolveProjectPath(context.project.root, filePath || specFilePath);
        if (filePath) {
            prototypeDir = path.dirname(sourcePath);
            specDir = path.join(prototypeDir, '.spec');
        }
        else {
            specDir = path.dirname(sourcePath);
            prototypeDir = path.dirname(specDir);
            if (path.basename(specDir) !== '.spec')
                return null;
        }
    }
    catch {
        return null;
    }
    if (!isPathInside(context.project.root, sourcePath))
        return null;
    if (!isPathInside(context.project.root, prototypeDir) || !isPathInside(prototypeDir, specDir))
        return null;
    if (specFilePath) {
        let declaredSpecPath;
        try {
            declaredSpecPath = resolveProjectPath(context.project.root, specFilePath);
        }
        catch {
            return null;
        }
        if (!isPathInside(specDir, declaredSpecPath))
            return null;
    }
    let realProjectRoot;
    let realPrototypeDir;
    try {
        realProjectRoot = fs.realpathSync(context.project.root);
        if (!fs.statSync(sourcePath).isFile())
            return null;
        const realSourcePath = fs.realpathSync(sourcePath);
        realPrototypeDir = fs.realpathSync(prototypeDir);
        if (!isPathInside(realProjectRoot, realPrototypeDir)
            || !isPathInside(realProjectRoot, realSourcePath)
            || !isPathInside(realPrototypeDir, realSourcePath))
            return null;
    }
    catch {
        return null;
    }
    if (fs.existsSync(specDir)) {
        try {
            const realSpecDir = fs.realpathSync(specDir);
            if (!isPathInside(realProjectRoot, realSpecDir) || !isPathInside(realPrototypeDir, realSpecDir))
                return null;
            for (const mainSpecName of ['spec.html', 'spec.md']) {
                const mainSpecPath = path.join(specDir, mainSpecName);
                try {
                    fs.lstatSync(mainSpecPath);
                }
                catch (error) {
                    if (error?.code === 'ENOENT')
                        continue;
                    return null;
                }
                const realMainSpecPath = fs.realpathSync(mainSpecPath);
                if (!isPathInside(realSpecDir, realMainSpecPath))
                    return null;
                const canonicalMainSpecPath = path.relative(realSpecDir, realMainSpecPath).split(path.sep).join('/');
                if (!normalizeSpecRelativePath(canonicalMainSpecPath))
                    return null;
            }
        }
        catch {
            return null;
        }
    }
    return { context, prototypeId, prototypeDir, specDir, apiBasePath };
}
function descriptor(resolved) {
    const isMainSpecFile = (name) => {
        try {
            return fs.statSync(path.join(resolved.specDir, name)).isFile();
        }
        catch {
            return false;
        }
    };
    const hasHtml = isMainSpecFile('spec.html');
    const hasMarkdown = isMainSpecFile('spec.md');
    const activePath = hasHtml ? 'spec.html' : hasMarkdown ? 'spec.md' : null;
    const format = activePath === 'spec.html' ? 'html' : activePath === 'spec.md' ? 'markdown' : null;
    return {
        exists: Boolean(activePath),
        format,
        activePath,
        hasHtml,
        hasMarkdown,
        previewUrl: activePath ? `${resolved.apiBasePath}/content` : null,
        editable: format === 'markdown',
    };
}
export function resolvePrototypeMainSpecStatus(context, prototypeId) {
    const resolved = resolvePrototypeSpec(context, prototypeId, '');
    if (!resolved)
        return { available: false, activePath: null, projectPath: null };
    const activePath = descriptor(resolved).activePath;
    return {
        available: true,
        activePath,
        projectPath: activePath
            ? path.relative(context.project.root, path.join(resolved.specDir, activePath)).split(path.sep).join('/')
            : null,
    };
}
function sendSpecError(res, status, code, error) {
    sendJson(res, { ok: false, code, error }, { status });
}
function normalizeSpecRelativePath(value) {
    const raw = String(value || '').trim().replace(/\\/gu, '/');
    if (!raw || raw.includes('\0') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw))
        return null;
    const segments = raw.split('/').filter(Boolean);
    if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.'))
        return null;
    if (PROTECTED_SPEC_DIRECTORIES.has(segments[0].toLowerCase()))
        return null;
    if (PROTECTED_SPEC_FILES.has(segments.at(-1)?.toLowerCase() || ''))
        return null;
    return segments.join('/');
}
function resolveSpecFile(resolved, value) {
    const relativePath = normalizeSpecRelativePath(value);
    if (!relativePath)
        return null;
    const targetPath = path.resolve(resolved.specDir, relativePath);
    if (!isPathInside(resolved.specDir, targetPath))
        return null;
    if (fs.existsSync(targetPath)) {
        try {
            const realSpecDir = fs.realpathSync(resolved.specDir);
            const realTargetPath = fs.realpathSync(targetPath);
            if (!isPathInside(realSpecDir, realTargetPath))
                return null;
            const canonicalRelativePath = path.relative(realSpecDir, realTargetPath).split(path.sep).join('/');
            if (!normalizeSpecRelativePath(canonicalRelativePath))
                return null;
        }
        catch {
            return null;
        }
    }
    return targetPath;
}
function resolveRequestedPath(resolved, requestedPath) {
    if (requestedPath)
        return normalizeSpecRelativePath(requestedPath);
    return descriptor(resolved).activePath;
}
function buildRelativeSpecUrl(resolved, currentPath, rawValue, attributeName) {
    const value = String(rawValue || '').trim();
    if (!value || value.startsWith('#') || value.startsWith('?') || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
        return { value: rawValue };
    }
    let parsed;
    try {
        parsed = new URL(value, `http://axhub.local/${path.posix.dirname(currentPath)}/`);
    }
    catch {
        return { value: rawValue };
    }
    const relativePath = normalizeSpecRelativePath(decodePathSegment(parsed.pathname.replace(/^\/+/, '')));
    if (!relativePath)
        return { value: rawValue };
    const params = new URLSearchParams();
    params.set('path', relativePath);
    const isDocument = attributeName === 'href' && /\.(?:html?|md)$/iu.test(relativePath);
    const nextUrl = isDocument
        ? `${resolved.apiBasePath}/content?${params.toString()}${parsed.hash}`
        : `${resolved.apiBasePath}/content/files/${relativePath.split('/').map(encodeURIComponent).join('/')}${parsed.search}${parsed.hash}`;
    return {
        value: nextUrl,
        ...(isDocument ? { documentPath: relativePath } : {}),
    };
}
function handleSpecContent(req, res, resolved, requestedPath) {
    const relativePath = resolveRequestedPath(resolved, requestedPath);
    if (!relativePath) {
        const code = requestedPath ? 'INVALID_SPEC_PATH' : 'PROTOTYPE_SPEC_NOT_FOUND';
        sendSpecError(res, requestedPath ? 403 : 404, code, requestedPath ? '规格路径无效' : '当前原型没有主规格');
        return;
    }
    const filePath = resolveSpecFile(resolved, relativePath);
    if (!filePath) {
        sendSpecError(res, 403, 'INVALID_SPEC_PATH', '规格路径无效');
        return;
    }
    if (req.method === 'PUT') {
        if (path.extname(filePath).toLowerCase() !== '.md') {
            sendSpecError(res, 405, 'SPEC_FORMAT_READ_ONLY', 'HTML 规格只支持批注');
            return;
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            sendSpecError(res, 404, 'PROTOTYPE_SPEC_NOT_FOUND', '规格文档不存在');
            return;
        }
        readJsonBody(req).then((body) => {
            fs.writeFileSync(filePath, String(body?.content ?? ''), 'utf8');
            sendJson(res, { ok: true, path: relativePath });
        }).catch((error) => sendSpecError(res, 400, 'INVALID_SPEC_REQUEST', error?.message || '保存规格失败'));
        return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendSpecError(res, 404, 'PROTOTYPE_SPEC_NOT_FOUND', '规格文档不存在');
        return;
    }
    if (sendHtmlDocumentPreview(req, res, filePath, {
        documentName: relativePath,
        rewriteRelativeUrl: (value, attributeName) => buildRelativeSpecUrl(resolved, relativePath, value, attributeName),
        extraBootstrap: `<script>document.addEventListener('click',function(event){var link=event.target&&event.target.closest?event.target.closest('a[data-axhub-prototype-spec-document-link]'):null;if(!link)return;event.preventDefault();window.parent.postMessage({type:'axhub-prototype-spec:navigate',path:link.getAttribute('data-axhub-prototype-spec-document-link')},'*');});</script>`,
    }))
        return;
    if (!sendFile(res, filePath)) {
        sendSpecError(res, 404, 'PROTOTYPE_SPEC_NOT_FOUND', '规格文档不存在');
    }
}
export function handlePrototypeSpecApi(req, res, options, pathname, handlers) {
    const match = pathname.match(/^\/api\/projects\/([^/]+)\/prototypes\/([^/]+)\/spec(?:\/(content)(?:\/files\/(.+))?)?$/u);
    if (!match)
        return false;
    const projectId = decodePathSegment(match[1]);
    const prototypeId = decodePathSegment(match[2]);
    if (!projectId || !prototypeId) {
        sendSpecError(res, 400, 'INVALID_SPEC_PATH', '项目或原型 ID 无效');
        return true;
    }
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', { projectId });
    if (!context)
        return true;
    const apiBasePath = `/api/projects/${encodeURIComponent(projectId)}/prototypes/${encodeURIComponent(prototypeId)}/spec`;
    const resolved = resolvePrototypeSpec(context, prototypeId, apiBasePath);
    if (!resolved) {
        sendSpecError(res, 424, 'PROTOTYPE_SPEC_UNAVAILABLE', '当前原型没有明确的本地源码路径');
        return true;
    }
    if (match[3] === 'content') {
        if (req.method !== 'GET' && req.method !== 'PUT')
            return false;
        let requestedPath = getRequestUrl(req).searchParams.get('path') || '';
        if (match[4]) {
            if (req.method !== 'GET')
                return false;
            try {
                requestedPath = match[4].split('/').map((segment) => decodeURIComponent(segment)).join('/');
            }
            catch {
                sendSpecError(res, 403, 'INVALID_SPEC_PATH', '规格路径无效');
                return true;
            }
        }
        handleSpecContent(req, res, resolved, requestedPath);
        return true;
    }
    if (req.method === 'GET') {
        sendJson(res, descriptor(resolved));
        return true;
    }
    return false;
}
