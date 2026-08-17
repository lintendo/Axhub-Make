import fs from 'node:fs';
import path from 'node:path';
import { isPathInside, } from './projectCore/index.ts';
import { getRequestUrl, readJsonBody, sendFile, sendJson } from './http.ts';
import { sendHtmlDocumentPreview } from './htmlDocumentPreview.ts';
import { openPathInSystem } from './managementApi.workspace.ts';
import { getResourceAssetDirectory } from './resourceFiles.ts';
import { sendUnsupportedFilePreview } from './unsupportedFilePreview.ts';
function sanitizeDocBaseName(input) {
    return input
        .trim()
        .replace(/\.md$/i, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
function getDocsDir(projectRoot) {
    return path.join(projectRoot, 'src/resources');
}
function getTemplatesDir(projectRoot) {
    return path.join(projectRoot, 'src/resources/templates');
}
function getDocsDirForContext(context, handlers) {
    return getDocsDir(context.project.root);
}
function getTemplatesDirForContext(context, handlers) {
    return getTemplatesDir(context.project.root);
}
function hasWritableDocsDir(context, handlers) {
    return isPathInside(context.project.root, getDocsDir(context.project.root));
}
function normalizeUploadTargetFolder(targetFolder) {
    const rawValue = String(targetFolder || '').trim();
    if (path.isAbsolute(rawValue) || path.win32.isAbsolute(rawValue) || path.posix.isAbsolute(rawValue)) {
        return null;
    }
    const normalized = rawValue.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized) {
        return null;
    }
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
        return null;
    }
    if (segments.some((segment) => segment === '.' || segment === '..')) {
        return null;
    }
    if (path.isAbsolute(targetFolder) || path.posix.isAbsolute(normalized)) {
        return null;
    }
    return segments.join('/');
}
function normalizeResourceIdFromFileName(fileName) {
    return path.basename(fileName, path.extname(fileName));
}
function getResourceFileBaseName(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).pop() || normalized;
}
function isIgnoredResourceRelativePath(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized)
        return true;
    if (normalized.toLowerCase() === 'readme.md')
        return true;
    return normalized.split('/').some((segment) => segment.startsWith('.'));
}
function listResourceFiles(rootDir, baseDir = rootDir, options = {}) {
    if (!fs.existsSync(rootDir)) {
        return [];
    }
    const nameMode = options.nameMode || 'relative';
    const result = [];
    for (const item of fs.readdirSync(rootDir, { withFileTypes: true })) {
        if (item.name.startsWith('.'))
            continue;
        const fullPath = path.join(rootDir, item.name);
        if (item.isDirectory()) {
            result.push(...listResourceFiles(fullPath, baseDir, options));
            continue;
        }
        if (!item.isFile()) {
            continue;
        }
        const relativeName = path.relative(baseDir, fullPath).split(path.sep).join('/');
        if (isIgnoredResourceRelativePath(relativeName)) {
            continue;
        }
        const fileName = getResourceFileBaseName(relativeName);
        const ext = path.extname(item.name).toLowerCase();
        let title;
        let description = '';
        if (ext === '.md') {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
                description = content.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('#')) || '';
            }
            catch {
                // ignore read errors for binary/corrupt files
            }
        }
        let fileSize;
        try {
            fileSize = fs.statSync(fullPath).size;
        }
        catch {
            // ignore stat errors
        }
        result.push({
            name: nameMode === 'basename' ? fileName : relativeName,
            displayName: title || fileName.replace(/\.[^.]+$/u, ''),
            description,
            path: relativeName,
            absoluteFilePath: fullPath,
            ...(fileSize !== undefined ? { fileSize } : {}),
        });
    }
    return result;
}
function toKebabBaseName(input, fallbackPrefix) {
    const normalized = String(input || '')
        .trim()
        .replace(/\.[^.]+$/u, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    return normalized || `${fallbackPrefix}-${Date.now()}`;
}
function createUniqueFilePath(dir, baseName, ext) {
    let candidate = path.join(dir, `${baseName}${ext}`);
    let index = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(dir, `${baseName}-${index}${ext}`);
        index += 1;
    }
    return candidate;
}
function stripHeaderParameterQuotes(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed
            .slice(1, -1)
            .replace(/\\(["\\])/g, '$1');
    }
    return trimmed;
}
function decodeHeaderParameterValue(rawValue) {
    return Buffer.from(stripHeaderParameterQuotes(rawValue), 'binary').toString('utf8');
}
function decodeExtendedHeaderParameterValue(rawValue) {
    const value = stripHeaderParameterQuotes(rawValue);
    const match = value.match(/^([^']*)'[^']*'(.*)$/u);
    if (!match) {
        return undefined;
    }
    const charset = match[1].toLowerCase();
    if (charset && charset !== 'utf-8') {
        return undefined;
    }
    try {
        return decodeURIComponent(match[2]);
    }
    catch {
        return undefined;
    }
}
function getContentDispositionParameter(disposition, name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const extendedMatch = disposition.match(new RegExp(`(?:^|;)\\s*${escapedName}\\*\\s*=\\s*("(?:\\\\.|[^"])*"|[^;]*)`, 'iu'));
    if (extendedMatch) {
        const decoded = decodeExtendedHeaderParameterValue(extendedMatch[1]);
        if (decoded) {
            return decoded;
        }
    }
    const match = disposition.match(new RegExp(`(?:^|;)\\s*${escapedName}\\s*=\\s*("(?:\\\\.|[^"])*"|[^;]*)`, 'iu'));
    return match ? decodeHeaderParameterValue(match[1]) : undefined;
}
function createTemplateFile(res, context, params, handlers) {
    if (!handlers.hasResourceWriteCapability(context, 'templateCreate')) {
        handlers.sendResourceWriteAdapterRequired(res, context, params.route);
        return;
    }
    const displayName = String(params.body?.displayName || params.body?.title || params.body?.name || '').trim();
    if (!displayName) {
        sendJson(res, { error: 'Missing displayName' }, { status: 400 });
        return;
    }
    const baseName = toKebabBaseName(displayName, 'template');
    if (!baseName) {
        sendJson(res, { error: 'Invalid displayName' }, { status: 400 });
        return;
    }
    fs.mkdirSync(params.baseDir, { recursive: true });
    const filePath = createUniqueFilePath(params.baseDir, baseName, '.md');
    const fileName = path.basename(filePath);
    const id = normalizeResourceIdFromFileName(fileName);
    const rawContent = typeof params.body?.content === 'string' ? params.body.content : '';
    const content = rawContent ? rawContent : `# ${displayName}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    sendJson(res, {
        success: true,
        projectId: context.project.id,
        name: fileName,
        id,
        displayName,
        absoluteFilePath: filePath,
    }, { status: 201 });
}
export function handleProjectDocsApi(req, res, projectContext, options, pathname, handlers) {
    let projectRoot = projectContext?.project.root || options.projectRoot;
    let docsDir = projectContext ? getDocsDirForContext(projectContext, handlers) : getDocsDir(projectRoot);
    let templatesDir = projectContext ? getTemplatesDirForContext(projectContext, handlers) : getTemplatesDir(projectRoot);
    const updateResolvedProjectContext = (nextContext) => {
        projectContext = nextContext;
        projectRoot = projectContext.project.root;
        docsDir = getDocsDirForContext(projectContext, handlers);
        templatesDir = getTemplatesDirForContext(projectContext, handlers);
    };
    if (pathname === '/api/docs/open-system') {
        if (req.method !== 'POST') {
            return false;
        }
        readJsonBody(req).then(async (body) => {
            const docName = String(body?.docName || '').trim();
            if (!docName) {
                sendJson(res, { error: 'Missing docName' }, { status: 400 });
                return;
            }
            const resourceType = String(body?.type || 'docs').trim();
            if (resourceType !== 'docs' && resourceType !== 'templates') {
                sendJson(res, { error: 'Invalid resource type, expected docs|templates' }, { status: 400 });
                return;
            }
            const baseDir = resourceType === 'templates' ? templatesDir : docsDir;
            const docPath = path.resolve(baseDir, docName);
            if (!isPathInside(baseDir, docPath)) {
                sendJson(res, { error: 'Forbidden' }, { status: 403 });
                return;
            }
            if (!fs.existsSync(docPath)) {
                sendJson(res, { error: 'File not found' }, { status: 404 });
                return;
            }
            try {
                await openPathInSystem(docPath);
                sendJson(res, { success: true, path: docPath });
            }
            catch (error) {
                sendJson(res, { error: `Failed to open file: ${error?.message || String(error)}` }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/docs/upload') {
        if (req.method !== 'POST') {
            return false;
        }
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => {
            try {
                const body = Buffer.concat(chunks);
                const contentType = String(req.headers['content-type'] || '');
                const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/iu);
                const boundary = String(boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim();
                if (!boundary) {
                    sendJson(res, { error: 'Missing multipart boundary' }, { status: 400 });
                    return;
                }
                const bodyStr = body.toString('binary');
                const delimiter = `--${boundary}`;
                const parts = bodyStr
                    .split(delimiter)
                    .slice(1, -1)
                    .map((rawPart) => {
                    const part = rawPart.replace(/^\r\n/u, '').replace(/\r\n$/u, '');
                    const separatorIndex = part.indexOf('\r\n\r\n');
                    if (separatorIndex < 0)
                        return null;
                    const rawHeaders = part.slice(0, separatorIndex);
                    const rawContent = part.slice(separatorIndex + 4);
                    const disposition = rawHeaders.match(/content-disposition:\s*([^\r\n]+)/iu)?.[1] || '';
                    const name = getContentDispositionParameter(disposition, 'name') || '';
                    const filename = getContentDispositionParameter(disposition, 'filename');
                    return { name, filename, data: Buffer.from(rawContent, 'binary') };
                })
                    .filter(Boolean);
                const fileParts = parts.filter((p) => p.name === 'file' && p.filename);
                if (fileParts.length === 0) {
                    sendJson(res, { error: 'No file provided' }, { status: 400 });
                    return;
                }
                const targetFolderPart = parts.find((p) => p.name === 'targetFolder' && !p.filename);
                const rawTargetFolder = targetFolderPart?.data.toString('utf8').trim() || '';
                const normalizedTargetFolder = rawTargetFolder ? normalizeUploadTargetFolder(rawTargetFolder) : null;
                if (targetFolderPart && !normalizedTargetFolder) {
                    sendJson(res, { error: 'Invalid targetFolder' }, { status: 403 });
                    return;
                }
                const projectIdPart = parts.find((p) => p.name === 'projectId' && !p.filename);
                const uploadProjectContext = projectIdPart
                    ? handlers.createProjectContextFromBody(req, res, options, { projectId: projectIdPart.data.toString('utf8').trim() })
                    : projectContext || handlers.createProjectContextFromBody(req, res, options, {});
                if (!uploadProjectContext) {
                    return;
                }
                updateResolvedProjectContext(uploadProjectContext);
                const uploadDocsDir = docsDir;
                const uploadDir = normalizedTargetFolder ? path.join(uploadDocsDir, normalizedTargetFolder) : uploadDocsDir;
                if (!isPathInside(uploadDocsDir, uploadDir)) {
                    sendJson(res, { error: 'Invalid targetFolder' }, { status: 403 });
                    return;
                }
                fs.mkdirSync(uploadDir, { recursive: true });
                const results = [];
                for (const filePart of fileParts) {
                    const sanitizedName = String(filePart.filename || 'unnamed')
                        .replace(/[\\/:*?"<>|]/g, '-')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '')
                        .trim() || `upload-${Date.now()}`;
                    let targetPath = path.join(uploadDir, sanitizedName);
                    if (!isPathInside(uploadDocsDir, targetPath)) {
                        continue;
                    }
                    // avoid overwrite
                    if (fs.existsSync(targetPath)) {
                        const ext = path.extname(sanitizedName);
                        const baseName = sanitizedName.slice(0, sanitizedName.length - ext.length);
                        let index = 2;
                        while (fs.existsSync(path.join(uploadDir, `${baseName}-${index}${ext}`))) {
                            index += 1;
                        }
                        targetPath = path.join(uploadDir, `${baseName}-${index}${ext}`);
                    }
                    fs.writeFileSync(targetPath, filePart.data);
                    const resourcePath = path.relative(uploadDocsDir, targetPath).split(path.sep).join('/');
                    const name = getResourceFileBaseName(resourcePath);
                    const id = normalizeResourceIdFromFileName(name);
                    const ext = path.extname(name).toLowerCase();
                    let displayName = name.replace(/\.[^.]+$/u, '');
                    if (ext === '.md') {
                        try {
                            const content = fs.readFileSync(targetPath, 'utf8');
                            const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
                            if (title)
                                displayName = title;
                        }
                        catch { /* ignore */ }
                    }
                    results.push({
                        success: true,
                        name,
                        id,
                        displayName,
                        path: resourcePath,
                        absoluteFilePath: targetPath,
                    });
                }
                sendJson(res, { success: true, files: results }, { status: 201 });
            }
            catch (error) {
                sendJson(res, { error: error?.message || 'Upload failed' }, { status: 500 });
            }
        });
        req.on('error', (error) => sendJson(res, { error: error.message }, { status: 500 }));
        return true;
    }
    if (!projectContext) {
        return false;
    }
    if (pathname === '/api/docs/check-references' || pathname === '/api/docs/templates/check-references') {
        if (req.method !== 'POST') {
            return false;
        }
        readJsonBody(req).then((body) => {
            const isTemplate = pathname.includes('/templates/');
            const name = String(isTemplate ? body?.templateName : body?.docName || '').trim();
            const protectedDoc = !isTemplate && /^(project-overview|overview|readme)\.md$/i.test(name);
            sendJson(res, {
                [isTemplate ? 'templateName' : 'docName']: name,
                action: String(body?.action || ''),
                references: [],
                hasReferences: false,
                protected: protectedDoc,
                ...(protectedDoc ? {
                    code: 'PROTECTED_DOC',
                    error: '项目总览入口文档禁止删除或改名',
                } : {}),
            });
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/docs/templates' || pathname.startsWith('/api/docs/templates/')) {
        if (req.method === 'GET' && (pathname === '/api/docs/templates' || pathname === '/api/docs/templates/')) {
            sendJson(res, listResourceFiles(templatesDir, templatesDir));
            return true;
        }
        if (req.method === 'POST' && (pathname === '/api/docs/templates' || pathname === '/api/docs/templates/')) {
            readJsonBody(req).then((body) => {
                const bodyContext = handlers.createProjectContextFromBody(req, res, options, body);
                if (!bodyContext)
                    return;
                updateResolvedProjectContext(bodyContext);
                createTemplateFile(res, projectContext, {
                    route: '/api/docs/templates',
                    baseDir: templatesDir,
                    body,
                }, handlers);
            }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
            return true;
        }
        const encodedName = pathname.slice('/api/docs/templates/'.length);
        if (!encodedName) {
            sendJson(res, { error: 'Missing template name' }, { status: 400 });
            return true;
        }
        const templateName = decodeURIComponent(encodedName.replace(/\/copy$/u, ''));
        const templatePath = path.resolve(templatesDir, templateName);
        if (!isPathInside(templatesDir, templatePath)) {
            sendJson(res, { error: 'Forbidden' }, { status: 403 });
            return true;
        }
        if (req.method === 'GET') {
            const projectId = getRequestUrl(req).searchParams.get('projectId')?.trim() || '';
            const openEndpoint = projectId
                ? `/api/docs/open-system?projectId=${encodeURIComponent(projectId)}`
                : '/api/docs/open-system';
            if (sendUnsupportedFilePreview({
                req,
                res,
                docName: templateName,
                filePath: templatePath,
                openEndpoint,
                resourceType: 'templates',
            })) {
                return true;
            }
            if (sendHtmlDocumentPreview(req, res, templatePath)) {
                return true;
            }
            if (!sendFile(res, templatePath)) {
                sendJson(res, { error: 'Template not found' }, { status: 404 });
            }
            return true;
        }
        if (req.method === 'POST' && pathname.endsWith('/copy')) {
            readJsonBody(req).then((body) => {
                const bodyContext = handlers.createProjectContextFromBody(req, res, options, body);
                if (!bodyContext)
                    return;
                updateResolvedProjectContext(bodyContext);
                const activeTemplatePath = path.resolve(templatesDir, templateName);
                if (!isPathInside(templatesDir, activeTemplatePath)) {
                    sendJson(res, { error: 'Forbidden' }, { status: 403 });
                    return;
                }
                if (!handlers.hasResourceWriteCapability(projectContext, 'templateDuplicate')) {
                    handlers.sendResourceWriteAdapterRequired(res, projectContext, '/api/docs/templates/:name/copy');
                    return;
                }
                if (!fs.existsSync(activeTemplatePath)) {
                    sendJson(res, { error: 'Template not found' }, { status: 404 });
                    return;
                }
                const ext = path.extname(activeTemplatePath) || '.md';
                const rawDisplayName = String(body?.displayName || body?.newBaseName || '').trim();
                const fallbackBaseName = `${path.basename(activeTemplatePath, ext)}-copy`;
                const baseName = toKebabBaseName(rawDisplayName || fallbackBaseName, fallbackBaseName);
                const nextPath = createUniqueFilePath(templatesDir, baseName, ext);
                fs.copyFileSync(activeTemplatePath, nextPath);
                const name = path.relative(templatesDir, nextPath).split(path.sep).join('/');
                const id = normalizeResourceIdFromFileName(name);
                sendJson(res, {
                    success: true,
                    projectId: projectContext.project.id,
                    name,
                    id,
                    displayName: rawDisplayName || id,
                    path: handlers.createProjectRelativePath(projectRoot, nextPath),
                    absoluteFilePath: nextPath,
                }, { status: 201 });
            }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
            return true;
        }
        if (req.method === 'DELETE') {
            fs.rmSync(templatePath, { force: true });
            sendJson(res, { success: true });
            return true;
        }
        if (req.method === 'PUT') {
            readJsonBody(req).then((body) => {
                if (Object.prototype.hasOwnProperty.call(body ?? {}, 'content')) {
                    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
                    fs.writeFileSync(templatePath, String(body?.content ?? ''), 'utf8');
                    sendJson(res, { success: true, path: templatePath });
                    return;
                }
                const nextBaseName = sanitizeDocBaseName(String(body?.newBaseName || ''));
                if (!nextBaseName) {
                    sendJson(res, { error: 'Missing newBaseName' }, { status: 400 });
                    return;
                }
                const ext = path.extname(templatePath) || '.md';
                const nextPath = createUniqueFilePath(path.dirname(templatePath), nextBaseName, ext);
                fs.renameSync(templatePath, nextPath);
                const nextName = path.relative(templatesDir, nextPath).split(path.sep).join('/');
                sendJson(res, {
                    success: true,
                    name: nextName,
                    path: handlers.createProjectRelativePath(projectRoot, nextPath),
                    absoluteFilePath: nextPath,
                });
            }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
            return true;
        }
        return false;
    }
    if (pathname === '/api/docs' || pathname === '/api/docs/') {
        if (req.method === 'GET') {
            sendJson(res, listResourceFiles(docsDir, docsDir, { nameMode: 'basename' }));
            return true;
        }
    }
    if (pathname.startsWith('/api/docs/')) {
        const encodedDocName = pathname.slice('/api/docs/'.length);
        const docName = decodeURIComponent(encodedDocName.replace(/\/copy$/u, ''));
        const docPath = path.resolve(docsDir, docName);
        if (!isPathInside(docsDir, docPath)) {
            sendJson(res, { error: 'Forbidden' }, { status: 403 });
            return true;
        }
        if (req.method === 'GET') {
            const projectId = getRequestUrl(req).searchParams.get('projectId')?.trim() || '';
            const openEndpoint = projectId
                ? `/api/docs/open-system?projectId=${encodeURIComponent(projectId)}`
                : '/api/docs/open-system';
            if (sendUnsupportedFilePreview({
                req,
                res,
                docName,
                filePath: docPath,
                openEndpoint,
                resourceType: 'docs',
            })) {
                return true;
            }
            if (sendHtmlDocumentPreview(req, res, docPath, { documentName: docName, projectId })) {
                return true;
            }
            if (!sendFile(res, docPath)) {
                sendJson(res, { error: 'Document not found' }, { status: 404 });
            }
            return true;
        }
        if (req.method === 'DELETE') {
            let docStats;
            try {
                docStats = fs.statSync(docPath);
            }
            catch {
                sendJson(res, { error: 'Document not found' }, { status: 404 });
                return true;
            }
            if (!docStats.isFile()) {
                sendJson(res, { error: 'Document not found' }, { status: 404 });
                return true;
            }
            fs.rmSync(docPath, { force: true });
            sendJson(res, { success: true });
            return true;
        }
        if (req.method === 'POST' && pathname.endsWith('/copy')) {
            readJsonBody(req).then((body) => {
                const bodyContext = handlers.createProjectContextFromBody(req, res, options, body);
                if (!bodyContext)
                    return;
                updateResolvedProjectContext(bodyContext);
                const activeDocPath = path.resolve(docsDir, docName);
                if (!isPathInside(docsDir, activeDocPath)) {
                    sendJson(res, { error: 'Forbidden' }, { status: 403 });
                    return;
                }
                if (!handlers.hasResourceWriteCapability(projectContext, 'docCreate') || !hasWritableDocsDir(projectContext, handlers)) {
                    handlers.sendResourceWriteAdapterRequired(res, projectContext, '/api/docs/:name/copy');
                    return;
                }
                if (!fs.existsSync(activeDocPath)) {
                    sendJson(res, { error: 'Document not found' }, { status: 404 });
                    return;
                }
                const ext = path.extname(activeDocPath) || '.md';
                const rawDisplayName = String(body?.displayName || body?.newBaseName || '').trim();
                const fallbackBaseName = `${path.basename(activeDocPath, ext)}-copy`;
                const baseName = toKebabBaseName(rawDisplayName || fallbackBaseName, fallbackBaseName);
                const nextPath = createUniqueFilePath(path.dirname(activeDocPath), baseName, ext);
                fs.copyFileSync(activeDocPath, nextPath);
                const resourcePath = path.relative(docsDir, nextPath).split(path.sep).join('/');
                const name = getResourceFileBaseName(resourcePath);
                const id = normalizeResourceIdFromFileName(name);
                const content = fs.readFileSync(nextPath, 'utf8');
                const title = rawDisplayName || content.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
                sendJson(res, {
                    success: true,
                    projectId: projectContext.project.id,
                    name,
                    id,
                    displayName: title,
                    path: resourcePath,
                    absoluteFilePath: nextPath,
                }, { status: 201 });
            }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
            return true;
        }
        if (req.method === 'PUT') {
            readJsonBody(req).then((body) => {
                if (Object.prototype.hasOwnProperty.call(body ?? {}, 'content')) {
                    fs.mkdirSync(path.dirname(docPath), { recursive: true });
                    fs.writeFileSync(docPath, String(body?.content ?? ''), 'utf8');
                    sendJson(res, { success: true, path: docPath });
                    return;
                }
                const nextBaseName = sanitizeDocBaseName(String(body?.newBaseName || ''));
                if (!nextBaseName) {
                    sendJson(res, { error: 'Missing newBaseName' }, { status: 400 });
                    return;
                }
                const ext = path.extname(docPath) || '.md';
                const nextPath = createUniqueFilePath(path.dirname(docPath), nextBaseName, ext);
                const previousResourcePath = path.relative(docsDir, docPath).split(path.sep).join('/');
                fs.renameSync(docPath, nextPath);
                const nextResourcePath = path.relative(docsDir, nextPath).split(path.sep).join('/');
                const previousAssetDirectory = getResourceAssetDirectory(docsDir, previousResourcePath);
                const nextAssetDirectory = getResourceAssetDirectory(docsDir, nextResourcePath);
                if (previousAssetDirectory
                    && nextAssetDirectory
                    && previousAssetDirectory !== nextAssetDirectory
                    && fs.existsSync(previousAssetDirectory)) {
                    if (fs.existsSync(nextAssetDirectory)) {
                        fs.renameSync(nextPath, docPath);
                        sendJson(res, { error: 'Resource asset directory already exists' }, { status: 409 });
                        return;
                    }
                    try {
                        fs.mkdirSync(path.dirname(nextAssetDirectory), { recursive: true });
                        fs.renameSync(previousAssetDirectory, nextAssetDirectory);
                    }
                    catch (error) {
                        fs.renameSync(nextPath, docPath);
                        throw error;
                    }
                }
                const nextName = getResourceFileBaseName(nextResourcePath);
                sendJson(res, {
                    success: true,
                    name: nextName,
                    path: nextResourcePath,
                    absoluteFilePath: nextPath,
                });
            }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
            return true;
        }
    }
    return false;
}
