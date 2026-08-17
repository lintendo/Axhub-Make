import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPathInside, readServerInfo, } from './projectCore/index.ts';
import { sendJson } from './http.ts';
import { runLocalCommand } from './localCommand.ts';
import { PROTOTYPE_PLACEHOLDER_GUIDE } from './prototypePlaceholderGuide.ts';
import { extractZipFileToDirectory } from './zipArchive.ts';
const IGNORED_UPLOAD_ENTRIES = new Set(['__MACOSX', '.DS_Store']);
const SERVER_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_CONVERTER_SCRIPT_DIR = path.join(SERVER_MODULE_DIR, 'converters');
function getMultipartTextField(parts, name) {
    return parts.find((part) => part.name === name && !part.filename)?.data.toString('utf8').trim() || '';
}
function getMultipartTextFields(parts, name) {
    return parts
        .filter((part) => part.name === name && !part.filename)
        .map((part) => part.data.toString('utf8').trim());
}
function getDisplayName(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    const source = fs.readFileSync(filePath, 'utf8');
    const match = source.match(/displayName\s*[:=]\s*['"`]([^'"`]+)['"`]/u);
    const nameCommentMatch = source.match(/@name\s+([^\r\n*]+)/u);
    return match?.[1] || nameCommentMatch?.[1]?.trim() || fallback;
}
function prependUnique(values, value) {
    return prependUniqueExcluding(values, value);
}
function prependUniqueExcluding(values, value, excludedValues = []) {
    const excluded = new Set([value, ...excludedValues.filter(Boolean)]);
    return [value, ...values.filter((item) => !excluded.has(item))];
}
function createProjectRelativePath(projectRoot, absolutePath) {
    return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}
function saveMetadataWithResourceOrder(context, metadata) {
    const saved = context.metadataStore.saveMetadata(metadata);
    context.metadata = saved;
    return saved;
}
function updatePrototypeMetadataAfterUpload(context, params) {
    const current = context.metadataStore.getMetadata();
    const filePath = createProjectRelativePath(context.project.root, params.indexPath);
    const replacedPrototypeName = String(params.replacedPrototypeName || '').trim();
    const existing = current.resources.prototypes.find((prototype) => (prototype.id === params.id || prototype.name === params.id
        || (Boolean(replacedPrototypeName) && (prototype.id === replacedPrototypeName || prototype.name === replacedPrototypeName))));
    const nextPrototype = {
        ...(existing || {}),
        id: params.id,
        name: params.id,
        title: params.title,
        clientUrl: params.clientUrl,
        previewMode: 'clientRuntime',
        description: params.placeholder ? existing?.description || '' : '',
        updatedAt: new Date().toISOString(),
        filePath,
        absoluteFilePath: params.indexPath,
        ...(params.pages && params.pages.length > 0 ? {
            pages: params.pages,
            defaultPageId: params.defaultPageId || params.pages[0]?.id,
        } : {}),
        ...(params.importReport ? { importReport: params.importReport } : {}),
        ...(params.placeholder ? {
            placeholder: true,
            placeholderGuide: PROTOTYPE_PLACEHOLDER_GUIDE,
        } : {
            placeholder: false,
        }),
    };
    const prototypeWithoutPlaceholderGuide = params.placeholder
        ? nextPrototype
        : (() => {
            const { placeholderGuide: _placeholderGuide, ...rest } = nextPrototype;
            return rest;
        })();
    saveMetadataWithResourceOrder(context, {
        ...current,
        resources: {
            ...current.resources,
            prototypes: [
                prototypeWithoutPlaceholderGuide,
                ...current.resources.prototypes.filter((prototype) => (prototype.id !== params.id
                    && prototype.name !== params.id
                    && (!replacedPrototypeName || (prototype.id !== replacedPrototypeName && prototype.name !== replacedPrototypeName)))),
            ],
        },
        navigation: {
            ...current.navigation,
            prototypes: prependUniqueExcluding(current.navigation.prototypes, params.id, replacedPrototypeName ? [replacedPrototypeName] : []),
        },
    });
}
function resolveUploadTargetPrototypeName(context, targetBaseDir, rawTargetPrototypeName) {
    const targetPrototypeName = rawTargetPrototypeName.trim();
    if (!targetPrototypeName)
        return undefined;
    if (targetPrototypeName.includes('/') || targetPrototypeName.includes('\\') || targetPrototypeName.includes('\0')) {
        throw new Error('targetPrototypeName 不合法');
    }
    const existing = context.metadata.resources.prototypes.find((prototype) => (prototype.id === targetPrototypeName || prototype.name === targetPrototypeName));
    if (!existing) {
        throw new Error(`原型不存在：${targetPrototypeName}`);
    }
    const targetDir = path.resolve(targetBaseDir, targetPrototypeName);
    if (targetDir === path.resolve(targetBaseDir) || !isPathInside(targetBaseDir, targetDir)) {
        throw new Error('targetPrototypeName 不安全');
    }
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        throw new Error(`原型目录不存在：${targetPrototypeName}`);
    }
    return targetPrototypeName;
}
function appendTargetPrototypeOverwriteInstruction(prompt, targetPrototypeName, folderName) {
    if (!targetPrototypeName)
        return prompt;
    const renamedFolderName = String(folderName || '').trim();
    if (renamedFolderName && renamedFolderName !== targetPrototypeName) {
        return `${prompt}\n\n**目标原型覆盖要求**：本次导入必须覆盖当前占位原型 \`prototypes/${targetPrototypeName}\` 并将目录重命名为 \`prototypes/${renamedFolderName}\`（来自上传 ZIP 文件名，已清理特殊字符），不要保留原 \`prototypes/${targetPrototypeName}\` 目录，不要改用压缩包内部根目录名。`;
    }
    return `${prompt}\n\n**目标原型覆盖要求**：本次导入必须覆盖当前占位原型 \`prototypes/${targetPrototypeName}\`，不要创建新的原型目录，不要改用上传压缩包或转换产物自带的目录名。`;
}
function updatePrototypeMetadataForGenerationStart(context, params) {
    const current = context.metadataStore.getMetadata();
    const filePath = createProjectRelativePath(context.project.root, params.indexPath);
    const existing = current.resources.prototypes.find((prototype) => (prototype.id === params.id || prototype.name === params.id));
    const nextPrototype = {
        ...(existing || {}),
        id: existing?.id || params.id,
        name: existing?.name || params.id,
        title: existing?.title || params.title,
        clientUrl: existing?.clientUrl || params.clientUrl,
        previewMode: 'clientRuntime',
        description: existing?.description || '',
        updatedAt: new Date().toISOString(),
        generationStatus: 'waiting',
        filePath,
        absoluteFilePath: params.indexPath,
    };
    const { placeholder: _placeholder, placeholderGuide: _placeholderGuide, ...prototypeWithoutPlaceholder } = nextPrototype;
    saveMetadataWithResourceOrder(context, {
        ...current,
        resources: {
            ...current.resources,
            prototypes: [
                prototypeWithoutPlaceholder,
                ...current.resources.prototypes.filter((prototype) => prototype.id !== params.id && prototype.name !== params.id),
            ],
        },
        navigation: {
            ...current.navigation,
            prototypes: prependUnique(current.navigation.prototypes, params.id),
        },
    });
    return prototypeWithoutPlaceholder;
}
function resolveThemeClientUrl(options, context, themeId) {
    const projectRuntimeOrigin = readServerInfo(context.project.root, 'runtime')?.origin;
    const base = (projectRuntimeOrigin || options.runtimeOrigin || options.origin || '').replace(/\/+$/u, '');
    return `${base}/themes/${encodeURIComponent(themeId)}`;
}
function getThemeDisplayName(themeDir, fallback) {
    const tokenPath = path.join(themeDir, 'designToken.json');
    if (fs.existsSync(tokenPath)) {
        try {
            const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            const name = typeof token?.name === 'string' ? token.name.trim() : '';
            if (name) {
                return name;
            }
        }
        catch {
            // Fall through to source displayName lookup.
        }
    }
    return getDisplayName(path.join(themeDir, 'index.tsx'), fallback);
}
function updateThemeMetadataAfterUpload(context, params) {
    const current = context.metadataStore.getMetadata();
    const themePath = createProjectRelativePath(context.project.root, params.themeDir);
    const filePath = params.entryPath ? createProjectRelativePath(context.project.root, params.entryPath) : undefined;
    saveMetadataWithResourceOrder(context, {
        ...current,
        resources: {
            ...current.resources,
            themes: [
                {
                    id: params.id,
                    name: params.id,
                    title: params.title,
                    path: themePath,
                    sourcePath: themePath,
                    ...(filePath ? { filePath, absoluteFilePath: params.entryPath } : {}),
                    clientUrl: params.clientUrl,
                    previewUrl: params.clientUrl,
                    updatedAt: new Date().toISOString(),
                },
                ...current.resources.themes.filter((theme) => theme.id !== params.id && theme.name !== params.id),
            ],
        },
        orders: {
            ...current.orders,
            themes: prependUnique(current.orders.themes, params.id),
        },
    });
}
function truncateName(name, maxLength) {
    return name.length > maxLength ? name.slice(0, maxLength) : name;
}
function sanitizeFolderName(name) {
    return String(name || '')
        .replace(/\.[^.]+$/u, '')
        .replace(/[^a-z0-9-]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}
function buildUploadFolderName(candidate, fallbackPrefix = 'upload') {
    return truncateName(sanitizeFolderName(candidate), 60) || `${fallbackPrefix}-${Date.now()}`;
}
function getTargetedZipFolderName(targetPrototypeName, uploadMode, zipBaseName, fallbackPrefix) {
    if (!targetPrototypeName)
        return undefined;
    return uploadMode === 'zip'
        ? buildUploadFolderName(zipBaseName, fallbackPrefix)
        : targetPrototypeName;
}
function buildUploadBatchId(candidate, fallbackPrefix = 'batch') {
    return truncateName(String(candidate || '')
        .replace(/[^a-z0-9-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase(), 60) || `${fallbackPrefix}-${Date.now()}`;
}
function sanitizeRelativeUploadPath(input) {
    const raw = String(input || '').replace(/\\/g, '/');
    const parts = raw.split('/').filter(Boolean);
    if (path.isAbsolute(raw) || parts.some((part) => part === '..')) {
        throw new Error('上传文件包含不安全路径');
    }
    return parts.filter((part) => part !== '.').join('/');
}
function inferDirectoryRootFolder(directory) {
    if (!fs.existsSync(directory)) {
        return { entryCount: 0, hasRootFolder: false, rootFolderName: '' };
    }
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => !IGNORED_UPLOAD_ENTRIES.has(entry.name));
    if (entries.length === 1 && entries[0].isDirectory()) {
        return { entryCount: entries.length, hasRootFolder: true, rootFolderName: entries[0].name };
    }
    return { entryCount: entries.length, hasRootFolder: false, rootFolderName: '' };
}
function deriveRootFolderNameFromPaths(paths) {
    const roots = new Set();
    for (const rawPath of paths) {
        const sanitized = sanitizeRelativeUploadPath(rawPath);
        const root = sanitized.split('/').filter(Boolean)[0] || '';
        if (root) {
            roots.add(root);
        }
    }
    return roots.size === 1 ? Array.from(roots)[0] : '';
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (IGNORED_UPLOAD_ENTRIES.has(entry.name)) {
            continue;
        }
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(sourcePath, targetPath);
        }
        else if (entry.isFile()) {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}
function moveDirectoryWithFallback(sourceDir, targetDir) {
    try {
        fs.renameSync(sourceDir, targetDir);
    }
    catch {
        copyDirectoryRecursive(sourceDir, targetDir);
        fs.rmSync(sourceDir, { recursive: true, force: true });
    }
}
function sanitizeUploadedFileName(name, fallback = 'file') {
    const basename = path.basename(String(name || '').trim()).replace(/[^\w.\- ]+/g, '-').replace(/\s+/g, '-');
    return basename || fallback;
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
async function execFilePromise(command, args, cwd) {
    return runLocalCommand(command, args, { cwd, maxBuffer: 1024 * 1024 * 10 });
}
async function extractZipToDirectory(zipPath, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    extractZipFileToDirectory(zipPath, targetDir);
}
function getUploadPromptTargetLabel(targetType) {
    if (targetType === 'themes')
        return '主题';
    if (targetType === 'data')
        return '数据资产';
    if (targetType === 'components')
        return '组件';
    return '原型';
}
function buildScreenshotUploadPrompt(targetType, fileCount) {
    const label = getUploadPromptTargetLabel(targetType);
    return `**系统指令**：你将作为 UI/UX 设计架构师和前端工程师，协助用户基于截图导入并创建${label}。

**上传上下文**：
- 已选择 ${fileCount} 张截图
- 截图内容已由系统暂存，请结合当前对话上下文继续处理

**执行要求**：
- 先确认目标范围、命名和是否需要补充文档或数据
- 不要输出或猜测本地文件路径
- 生成结果时遵循项目当前资源约定的位置`;
}
function hasPrototypeUploadWriteTarget(context, handlers) {
    return handlers.hasResourceWriteCapability(context, 'prototypeUpload')
        && Boolean(handlers.getDeclaredResourceWriteDir(context, 'prototypes'));
}
function hasThemeImportWriteTarget(context, handlers) {
    return handlers.hasResourceWriteCapability(context, 'themeImport')
        && Boolean(handlers.getDeclaredResourceWriteDir(context, 'themes'));
}
function sendUploadAdapterRequired(res, context, handlers) {
    handlers.sendDisabledCapability(res, 424, {
        error: 'Upload creation requires project-side save/write capability in make-server',
        code: 'UPLOAD_ADAPTER_REQUIRED',
        projectId: context.project.id,
        projectRoot: context.project.root,
        adapterRequired: true,
    });
}
function sendThemeUploadAdapterRequired(res, context, handlers) {
    handlers.sendDisabledCapability(res, 424, {
        error: 'Theme upload requires project-side theme write capability in make-server',
        code: 'UPLOAD_ADAPTER_REQUIRED',
        projectId: context.project.id,
        projectRoot: context.project.root,
        adapterRequired: true,
    });
}
function getTargetTypeFromParts(parts, fallback = 'prototypes') {
    return getMultipartTextField(parts, 'targetType') || fallback;
}
function requirePrototypeUploadTarget(res, context, targetType, handlers) {
    if (targetType !== 'prototypes' || !hasPrototypeUploadWriteTarget(context, handlers)) {
        sendUploadAdapterRequired(res, context, handlers);
        return null;
    }
    return handlers.getDeclaredResourceWriteDir(context, 'prototypes');
}
function requireThemeUploadTarget(res, context, targetType, handlers) {
    if (targetType !== 'themes' || !hasThemeImportWriteTarget(context, handlers)) {
        sendThemeUploadAdapterRequired(res, context, handlers);
        return null;
    }
    return handlers.getDeclaredResourceWriteDir(context, 'themes');
}
function resolvePrototypeClientUrl(options, context, prototypeId) {
    const projectRuntimeOrigin = readServerInfo(context.project.root, 'runtime')?.origin;
    const base = (projectRuntimeOrigin || options.runtimeOrigin || options.origin || '').replace(/\/+$/u, '');
    return `${base}/prototypes/${encodeURIComponent(prototypeId)}`;
}
function getMultipartFileParts(parts) {
    return parts.filter((part) => Boolean(part.filename));
}
function getPrimaryMultipartFile(parts) {
    return parts.find((part) => part.name === 'file' && part.filename)
        || parts.find((part) => part.filename)
        || null;
}
async function handleUploadScreenshots(res, context, parts, handlers) {
    const targetType = getTargetTypeFromParts(parts);
    if (!requirePrototypeUploadTarget(res, context, targetType, handlers)) {
        return;
    }
    const files = getMultipartFileParts(parts);
    if (files.length === 0) {
        sendJson(res, { error: 'Missing file' }, { status: 400 });
        return;
    }
    const batchId = buildUploadBatchId(getMultipartTextField(parts, 'batchId'), 'screenshots');
    const screenshotsDir = path.join(context.project.root, 'temp', 'screenshots', batchId);
    if (!isPathInside(context.project.root, screenshotsDir)) {
        sendJson(res, { error: 'Invalid upload target' }, { status: 403 });
        return;
    }
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const savedNames = [];
    for (const file of files) {
        const safeName = sanitizeUploadedFileName(file.filename || 'screenshot', 'screenshot');
        const ext = path.extname(safeName);
        const base = ext ? safeName.slice(0, -ext.length) : safeName;
        const filePath = createUniqueFilePath(screenshotsDir, base || 'screenshot', ext || '');
        fs.writeFileSync(filePath, file.data);
        savedNames.push(path.basename(filePath));
    }
    sendJson(res, {
        success: true,
        projectId: context.project.id,
        saved: savedNames.length,
        files: savedNames,
        prompt: buildScreenshotUploadPrompt(targetType, savedNames.length),
    });
}
function writeFolderUploadToTemp(parts, tempDir) {
    const files = getMultipartFileParts(parts);
    if (files.length === 0) {
        throw new Error('Missing file');
    }
    const relativePaths = getMultipartTextFields(parts, 'relativePaths');
    const folderName = getMultipartTextField(parts, 'folderName');
    const derivedRoot = deriveRootFolderNameFromPaths(relativePaths);
    const fallbackRoot = buildUploadFolderName(folderName || derivedRoot || files[0].filename || 'upload');
    let entryCount = 0;
    for (const [index, file] of files.entries()) {
        const rawRelativePath = relativePaths[index] || file.filename || `file-${index}`;
        const sanitizedRelativePath = sanitizeRelativeUploadPath(rawRelativePath);
        const relativePath = sanitizedRelativePath.includes('/')
            ? sanitizedRelativePath
            : `${fallbackRoot}/${sanitizeUploadedFileName(file.filename || sanitizedRelativePath || `file-${index}`)}`;
        const targetPath = path.resolve(tempDir, relativePath);
        if (!isPathInside(tempDir, targetPath)) {
            throw new Error('上传文件包含不安全路径');
        }
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.data);
        entryCount += 1;
    }
    return {
        entryCount,
        rootFolderName: deriveRootFolderNameFromPaths(relativePaths) || fallbackRoot,
    };
}
function moveExtractedUploadToTarget(tempDir, targetBaseDir, fallbackName, forcedFolderName) {
    const inferred = inferDirectoryRootFolder(tempDir);
    if (inferred.entryCount === 0) {
        throw new Error('上传内容为空');
    }
    const folderName = forcedFolderName || buildUploadFolderName(inferred.hasRootFolder ? inferred.rootFolderName : fallbackName);
    const targetDir = path.resolve(targetBaseDir, folderName);
    if (targetDir === path.resolve(targetBaseDir) || !isPathInside(targetBaseDir, targetDir)) {
        throw new Error('目标目录不安全，已阻止写入');
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetBaseDir, { recursive: true });
    if (inferred.hasRootFolder) {
        moveDirectoryWithFallback(path.join(tempDir, inferred.rootFolderName), targetDir);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    else {
        moveDirectoryWithFallback(tempDir, targetDir);
    }
    return { targetDir, folderName };
}
function removeReplacedPrototypeDirectory(targetBaseDir, replacedPrototypeName, folderName) {
    const normalizedName = String(replacedPrototypeName || '').trim();
    if (!normalizedName || normalizedName === folderName) {
        return;
    }
    const replacedDir = path.resolve(targetBaseDir, normalizedName);
    if (replacedDir === path.resolve(targetBaseDir) || !isPathInside(targetBaseDir, replacedDir)) {
        throw new Error('被替换原型目录不安全，已阻止清理');
    }
    fs.rmSync(replacedDir, { recursive: true, force: true });
}
async function handlePrototypeMakeUpload(res, options, context, parts, handlers) {
    const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'prototypes');
    if (!targetBaseDir) {
        sendUploadAdapterRequired(res, context, handlers);
        return;
    }
    const uploadMode = getMultipartTextField(parts, 'uploadMode') || 'zip';
    const tempRoot = path.join(context.project.root, 'temp', 'uploads');
    const tempDir = path.join(tempRoot, `make-${Date.now()}-${randomUUID()}`);
    let fallbackName = getMultipartTextField(parts, 'folderName') || 'prototype';
    try {
        const targetPrototypeName = resolveUploadTargetPrototypeName(context, targetBaseDir, getMultipartTextField(parts, 'targetPrototypeName'));
        let forcedFolderName = targetPrototypeName;
        fs.mkdirSync(tempDir, { recursive: true });
        if (uploadMode === 'folder') {
            const folderResult = writeFolderUploadToTemp(parts, tempDir);
            fallbackName = folderResult.rootFolderName || fallbackName;
        }
        else {
            const filePart = getPrimaryMultipartFile(parts);
            if (!filePart?.filename) {
                throw new Error('Missing file');
            }
            fallbackName = path.basename(filePart.filename, path.extname(filePart.filename));
            forcedFolderName = getTargetedZipFolderName(targetPrototypeName, uploadMode, fallbackName, 'prototype');
            const tempZipPath = path.join(tempRoot, `${randomUUID()}.zip`);
            fs.mkdirSync(tempRoot, { recursive: true });
            fs.writeFileSync(tempZipPath, filePart.data);
            try {
                await extractZipToDirectory(tempZipPath, tempDir);
            }
            finally {
                fs.rmSync(tempZipPath, { force: true });
            }
        }
        const { targetDir, folderName } = moveExtractedUploadToTarget(tempDir, targetBaseDir, fallbackName, forcedFolderName);
        removeReplacedPrototypeDirectory(targetBaseDir, targetPrototypeName, folderName);
        const indexPath = path.join(targetDir, 'index.tsx');
        const clientUrl = resolvePrototypeClientUrl(options, context, folderName);
        updatePrototypeMetadataAfterUpload(context, {
            id: folderName,
            title: getDisplayName(indexPath, folderName),
            folderPath: targetDir,
            indexPath,
            clientUrl,
            replacedPrototypeName: targetPrototypeName,
        });
        sendJson(res, {
            success: true,
            projectId: context.project.id,
            message: '上传并解压成功',
            folderName,
            path: `prototypes/${folderName}`,
            clientUrl,
            hint: '如果页面无法预览，让 AI 处理即可',
        });
    }
    catch (error) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        sendJson(res, { error: error?.message || '上传失败' }, { status: 400 });
    }
}
async function handleThemeZipUpload(res, options, context, parts, handlers) {
    const uploadType = getMultipartTextField(parts, 'uploadType') || 'make_zip';
    const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'themes');
    if (!targetBaseDir) {
        sendThemeUploadAdapterRequired(res, context, handlers);
        return;
    }
    const uploadMode = getMultipartTextField(parts, 'uploadMode') || 'zip';
    if (uploadMode !== 'zip') {
        sendJson(res, { error: '主题导入仅支持 ZIP 上传' }, { status: 400 });
        return;
    }
    const tempRoot = path.join(context.project.root, 'temp', 'uploads');
    const tempDir = path.join(tempRoot, `theme-${Date.now()}-${randomUUID()}`);
    let movedTargetDir = '';
    let fallbackName = getMultipartTextField(parts, 'folderName') || 'theme';
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        const filePart = getPrimaryMultipartFile(parts);
        if (!filePart?.filename) {
            throw new Error('Missing file');
        }
        fallbackName = path.basename(filePart.filename, path.extname(filePart.filename));
        const tempZipPath = path.join(tempRoot, `${randomUUID()}.zip`);
        fs.mkdirSync(tempRoot, { recursive: true });
        fs.writeFileSync(tempZipPath, filePart.data);
        try {
            await extractZipToDirectory(tempZipPath, tempDir);
        }
        finally {
            fs.rmSync(tempZipPath, { force: true });
        }
        const { targetDir, folderName } = moveExtractedUploadToTarget(tempDir, targetBaseDir, fallbackName);
        movedTargetDir = targetDir;
        const indexPath = path.join(targetDir, 'index.tsx');
        const designTokenPath = path.join(targetDir, 'designToken.json');
        if (!fs.existsSync(indexPath) && !fs.existsSync(designTokenPath)) {
            throw new Error('主题 ZIP 必须包含 index.tsx 或 designToken.json');
        }
        const entryPath = fs.existsSync(indexPath) ? indexPath : undefined;
        const clientUrl = resolveThemeClientUrl(options, context, folderName);
        updateThemeMetadataAfterUpload(context, {
            id: folderName,
            title: getThemeDisplayName(targetDir, folderName),
            themeDir: targetDir,
            entryPath,
            clientUrl,
        });
        sendJson(res, {
            success: true,
            projectId: context.project.id,
            uploadType,
            message: uploadType === 'make_zip' ? 'Make ZIP 主题上传并解压成功' : '主题上传并解压成功',
            folderName,
            path: `themes/${folderName}`,
            clientUrl,
            ...(entryPath ? {
                filePath: createProjectRelativePath(context.project.root, entryPath),
                absoluteFilePath: entryPath,
            } : {}),
        });
    }
    catch (error) {
        if (movedTargetDir && isPathInside(targetBaseDir, movedTargetDir)) {
            fs.rmSync(movedTargetDir, { recursive: true, force: true });
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
        sendJson(res, { error: error?.message || '上传失败' }, { status: 400 });
    }
}
function isPrototypeConverterUploadType(value) {
    return value === 'google_stitch' || value === 'figma_make' || value === 'v0' || value === 'google_aistudio' || value === 'axure_html';
}
function getConverterConfig(uploadType) {
    if (uploadType === 'google_stitch') {
        return {
            label: 'Google Stitch',
            scriptFile: 'stitch-converter.mjs',
            tasksFileName: '',
        };
    }
    if (uploadType === 'axure_html') {
        return {
            label: 'Axure HTML',
            scriptFile: 'axure-html-converter.mjs',
            tasksFileName: '',
        };
    }
    if (uploadType === 'figma_make') {
        return {
            label: 'Figma Make',
            scriptFile: 'figma-make-converter.mjs',
            tasksFileName: '.figma-make-tasks.md',
            zipOnly: true,
        };
    }
    if (uploadType === 'v0') {
        return {
            label: 'V0',
            scriptFile: 'v0-converter.mjs',
            tasksFileName: '.v0-tasks.md',
        };
    }
    return {
        label: 'AI Studio',
        scriptFile: 'ai-studio-converter.mjs',
        tasksFileName: '.ai-studio-tasks.md',
    };
}
function parseJsonLastLine(stdout, fallback) {
    const lastLine = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).slice(-1)[0] || '';
    if (!lastLine)
        return fallback;
    try {
        return JSON.parse(lastLine);
    }
    catch {
        return fallback;
    }
}
function normalizePrototypeRoutePages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => {
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const group = typeof item.group === 'string' ? item.group.trim() : '';
        return /^[a-z0-9-]+$/u.test(id) && title
            ? { id, title, ...(group ? { group } : {}) }
            : null;
    })
        .filter((item) => Boolean(item));
}
function normalizeWarnings(value) {
    return Array.isArray(value)
        ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
        : [];
}
function resolveProjectConverterScriptPath(context, scriptFile) {
    if (path.basename(scriptFile) !== scriptFile || scriptFile.includes('\0')) {
        throw new Error('转换脚本路径不安全，已阻止执行');
    }
    const projectScriptPath = path.join(context.project.root, 'scripts', scriptFile);
    if (!isPathInside(context.project.root, projectScriptPath)) {
        throw new Error('转换脚本路径不安全，已阻止执行');
    }
    if (fs.existsSync(projectScriptPath)) {
        return projectScriptPath;
    }
    const bundledScriptPath = path.join(BUNDLED_CONVERTER_SCRIPT_DIR, scriptFile);
    if (!isPathInside(BUNDLED_CONVERTER_SCRIPT_DIR, bundledScriptPath)) {
        throw new Error('内置转换脚本路径不安全，已阻止执行');
    }
    if (!fs.existsSync(bundledScriptPath)) {
        throw new Error(`服务端缺少内置转换脚本：converters/${scriptFile}`);
    }
    return bundledScriptPath;
}
async function preparePrototypeConverterInput(context, parts, uploadType, uploadMode) {
    const tempRoot = path.join(context.project.root, 'temp', 'uploads');
    const tempDir = path.join(tempRoot, `${uploadType}-${Date.now()}-${randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    let fallbackName = getMultipartTextField(parts, 'folderName') || uploadType;
    let zipFolderName = '';
    if (uploadMode === 'folder') {
        const folderResult = writeFolderUploadToTemp(parts, tempDir);
        fallbackName = folderResult.rootFolderName || fallbackName;
    }
    else {
        const filePart = getPrimaryMultipartFile(parts);
        if (!filePart?.filename) {
            throw new Error('Missing file');
        }
        fallbackName = path.basename(filePart.filename, path.extname(filePart.filename));
        zipFolderName = buildUploadFolderName(fallbackName, uploadType);
        const tempZipPath = path.join(tempRoot, `${randomUUID()}.zip`);
        fs.mkdirSync(tempRoot, { recursive: true });
        fs.writeFileSync(tempZipPath, filePart.data);
        try {
            await extractZipToDirectory(tempZipPath, tempDir);
        }
        finally {
            fs.rmSync(tempZipPath, { force: true });
        }
    }
    const inferred = inferDirectoryRootFolder(tempDir);
    if (inferred.entryCount === 0) {
        throw new Error('上传内容为空');
    }
    const inputDir = inferred.hasRootFolder ? path.join(tempDir, inferred.rootFolderName) : tempDir;
    const inputName = inferred.hasRootFolder ? inferred.rootFolderName : fallbackName;
    return {
        inputDir,
        cleanupDir: tempDir,
        fallbackName: buildUploadFolderName(inputName, uploadType),
        ...(zipFolderName ? { zipFolderName } : {}),
    };
}
async function handlePrototypeConverterUpload(res, options, context, parts, uploadType, handlers) {
    const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'prototypes');
    if (!targetBaseDir) {
        sendUploadAdapterRequired(res, context, handlers);
        return;
    }
    const config = getConverterConfig(uploadType);
    const uploadMode = getMultipartTextField(parts, 'uploadMode') || 'zip';
    if (config.zipOnly && uploadMode === 'folder') {
        sendJson(res, { error: 'figma_make 仅支持上传 Figma 原始导出的 ZIP 工程包，请不要上传文件夹' }, { status: 400 });
        return;
    }
    let prepared = null;
    let outputDir = '';
    try {
        prepared = await preparePrototypeConverterInput(context, parts, uploadType, uploadMode);
        const targetPrototypeName = resolveUploadTargetPrototypeName(context, targetBaseDir, getMultipartTextField(parts, 'targetPrototypeName'));
        const folderName = targetPrototypeName
            ? uploadMode === 'zip'
                ? prepared.zipFolderName || buildUploadFolderName(prepared.fallbackName, uploadType)
                : targetPrototypeName
            : buildUploadFolderName(prepared.fallbackName, uploadType);
        outputDir = path.join(targetBaseDir, folderName);
        if (!isPathInside(targetBaseDir, outputDir)) {
            throw new Error('目标目录不安全，已阻止写入');
        }
        fs.rmSync(outputDir, { recursive: true, force: true });
        fs.mkdirSync(targetBaseDir, { recursive: true });
        const scriptPath = resolveProjectConverterScriptPath(context, config.scriptFile);
        const commandResult = await execFilePromise(process.execPath, [
            scriptPath,
            prepared.inputDir,
            folderName,
            '--target-type',
            'prototypes',
            '--project-root',
            context.project.root,
            '--output-base-dir',
            targetBaseDir,
        ], context.project.root);
        const parsed = parseJsonLastLine(commandResult.stdout, {});
        const indexPath = path.join(outputDir, 'index.tsx');
        const clientUrl = resolvePrototypeClientUrl(options, context, folderName);
        const pages = normalizePrototypeRoutePages(parsed.pages);
        const defaultPageId = typeof parsed.defaultPageId === 'string' && pages.some((page) => page.id === parsed.defaultPageId)
            ? parsed.defaultPageId
            : pages[0]?.id;
        const warnings = normalizeWarnings(parsed.warnings);
        const importReport = uploadType === 'axure_html'
            ? {
                source: 'axure_html',
                pageCount: pages.length,
                warningCount: warnings.length,
                warnings,
                ...(typeof parsed.reportFile === 'string' && parsed.reportFile ? { reportFile: parsed.reportFile } : {}),
            }
            : undefined;
        removeReplacedPrototypeDirectory(targetBaseDir, targetPrototypeName, folderName);
        updatePrototypeMetadataAfterUpload(context, {
            id: folderName,
            title: getDisplayName(indexPath, folderName),
            folderPath: outputDir,
            indexPath,
            clientUrl,
            ...(pages.length > 0 ? { pages, defaultPageId } : {}),
            ...(importReport ? { importReport } : {}),
            replacedPrototypeName: targetPrototypeName,
        });
        if (uploadType === 'axure_html') {
            sendJson(res, {
                success: true,
                projectId: context.project.id,
                uploadType,
                message: warnings.length > 0
                    ? 'Axure HTML 原型已转换完成，部分高级交互已降级。'
                    : 'Axure HTML 原型已转换完成。',
                folderName,
                path: `prototypes/${folderName}`,
                clientUrl,
                requiresAi: false,
                pages,
                defaultPageId,
                warnings,
                ...(importReport ? { importReport } : {}),
            });
            return;
        }
        if (uploadType === 'google_stitch') {
            const requiresAi = parsed.requiresAi === true;
            sendJson(res, {
                success: true,
                projectId: context.project.id,
                uploadType,
                message: requiresAi
                    ? '页面已导入完成，可先预览基础效果。部分细节还可继续优化，建议交给 AI 完成。'
                    : '上传并解压成功',
                folderName,
                path: `prototypes/${folderName}`,
                clientUrl,
                requiresAi,
                prompt: typeof parsed.prompt === 'string' ? appendTargetPrototypeOverwriteInstruction(parsed.prompt, targetPrototypeName, folderName) : undefined,
                reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
                hint: requiresAi ? '复制提示词后，可继续完善交互与动态内容' : '如果页面无法预览，让 AI 处理即可',
            });
            return;
        }
        const tasksFile = typeof parsed.tasksFile === 'string' && parsed.tasksFile
            ? parsed.tasksFile
            : createProjectRelativePath(context.project.root, path.join(outputDir, config.tasksFileName));
        const prompt = appendTargetPrototypeOverwriteInstruction(`${config.label} 项目已上传并预处理完成。\n\n请先在仓库中读取以下转换任务清单：\n- ${tasksFile}\n\n然后根据该任务清单和项目 rules，完成具体的转换工作。`, targetPrototypeName, folderName);
        sendJson(res, {
            success: true,
            projectId: context.project.id,
            uploadType,
            pageName: folderName,
            folderName,
            path: `prototypes/${folderName}`,
            clientUrl,
            tasksFile,
            prompt,
            message: '页面文件已导入完成，可继续交给 AI 完成转换。',
            hint: '继续时直接把提示词发给 AI 即可，无需手动查看内部任务文档。',
        });
    }
    catch (error) {
        if (outputDir && isPathInside(targetBaseDir, outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
        sendJson(res, { error: `预处理脚本执行失败: ${error?.message || '上传失败'}` }, { status: 400 });
    }
    finally {
        if (prepared?.cleanupDir) {
            fs.rmSync(prepared.cleanupDir, { recursive: true, force: true });
            const tempRoot = path.join(context.project.root, 'temp', 'uploads');
            try {
                if (fs.existsSync(tempRoot) && fs.readdirSync(tempRoot).length === 0) {
                    fs.rmSync(tempRoot, { recursive: true, force: true });
                }
            }
            catch {
                // Best-effort temp cleanup only.
            }
        }
    }
}
function createPlaceholderIndexTsx(displayName) {
    return `/**
 * @name ${displayName}
 * @axhub-placeholder prototype-empty
 */
import React from 'react';
import './style.css';

const displayName = ${JSON.stringify(displayName)};

export default function Placeholder() {
    return (
        <main className="placeholder-empty-page" aria-label={displayName}>
            <span>正在等待生成</span>
        </main>
    );
}
`;
}
function createPlaceholderStyleCss() {
    return `.placeholder-empty-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #ffffff;
  color: #475569;
  font-size: 14px;
}
`;
}
function createWaitingGenerationIndexTsx(displayName) {
    return `/**
 * @name ${displayName}
 */
import React from 'react';
import './style.css';

const displayName = ${JSON.stringify(displayName)};

export default function WaitingGeneration() {
    return (
        <main className="prototype-waiting-generation-page" aria-label={displayName}>
            <span>正在等待生成</span>
        </main>
    );
}
`;
}
function createWaitingGenerationStyleCss() {
    return `.prototype-waiting-generation-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #ffffff;
  color: #475569;
  font-size: 14px;
}
`;
}
function createUniqueFolderName(baseDir, baseName) {
    let candidate = path.join(baseDir, baseName);
    if (!fs.existsSync(candidate))
        return baseName;
    let index = 2;
    while (fs.existsSync(path.join(baseDir, `${baseName}-${index}`))) {
        index += 1;
    }
    return `${baseName}-${index}`;
}
export async function handleCreatePlaceholderPrototype(req, res, options, context, handlers) {
    const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'prototypes');
    if (!targetBaseDir) {
        sendUploadAdapterRequired(res, context, handlers);
        return;
    }
    try {
        const folderName = createUniqueFolderName(targetBaseDir, 'untitled');
        const displayName = '未命名';
        const targetDir = path.join(targetBaseDir, folderName);
        if (!isPathInside(targetBaseDir, targetDir)) {
            throw new Error('目标目录不安全');
        }
        fs.mkdirSync(targetDir, { recursive: true });
        // Create blank index.tsx and style.css so AI tools have entry points to work with
        fs.writeFileSync(path.join(targetDir, 'index.tsx'), createPlaceholderIndexTsx(displayName), 'utf8');
        fs.writeFileSync(path.join(targetDir, 'style.css'), createPlaceholderStyleCss(), 'utf8');
        const indexPath = path.join(targetDir, 'index.tsx');
        const clientUrl = resolvePrototypeClientUrl(options, context, folderName);
        updatePrototypeMetadataAfterUpload(context, {
            id: folderName,
            title: displayName,
            folderPath: targetDir,
            indexPath,
            clientUrl,
            placeholder: true,
        });
        sendJson(res, {
            success: true,
            projectId: context.project.id,
            name: folderName,
            displayName,
            path: `prototypes/${folderName}`,
            filePath: createProjectRelativePath(context.project.root, indexPath),
            absoluteFilePath: indexPath,
            clientUrl,
            placeholder: true,
            placeholderGuide: PROTOTYPE_PLACEHOLDER_GUIDE,
        }, { status: 201 });
    }
    catch (error) {
        sendJson(res, { error: error?.message || '创建占位原型失败' }, { status: 400 });
    }
}
export async function handleStartPlaceholderPrototypeGeneration(req, res, options, context, prototypeName, handlers) {
    const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'prototypes');
    if (!targetBaseDir) {
        sendUploadAdapterRequired(res, context, handlers);
        return;
    }
    try {
        const normalizedName = String(prototypeName || '').trim();
        if (!normalizedName || normalizedName.includes('/') || normalizedName.includes('\\') || normalizedName.includes('\0')) {
            throw new Error('原型名称不合法');
        }
        const targetDir = path.resolve(targetBaseDir, normalizedName);
        if (targetDir === path.resolve(targetBaseDir) || !isPathInside(targetBaseDir, targetDir)) {
            throw new Error('目标目录不安全');
        }
        if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            throw new Error('原型不存在');
        }
        const indexPath = path.join(targetDir, 'index.tsx');
        const stylePath = path.join(targetDir, 'style.css');
        const existing = context.metadata.resources.prototypes.find((prototype) => (prototype.id === normalizedName || prototype.name === normalizedName));
        const displayName = existing?.title || getDisplayName(indexPath, normalizedName);
        fs.writeFileSync(indexPath, createWaitingGenerationIndexTsx(displayName), 'utf8');
        fs.writeFileSync(stylePath, createWaitingGenerationStyleCss(), 'utf8');
        const clientUrl = resolvePrototypeClientUrl(options, context, normalizedName);
        const prototype = updatePrototypeMetadataForGenerationStart(context, {
            id: normalizedName,
            title: displayName,
            indexPath,
            clientUrl,
        });
        sendJson(res, {
            success: true,
            projectId: context.project.id,
            name: prototype.name || normalizedName,
            displayName: prototype.title || displayName,
            path: `prototypes/${normalizedName}`,
            filePath: prototype.filePath,
            absoluteFilePath: prototype.absoluteFilePath,
            clientUrl: prototype.clientUrl,
            placeholder: false,
            generationStatus: prototype.generationStatus,
        });
    }
    catch (error) {
        sendJson(res, { error: error?.message || '进入原型等待生成态失败' }, { status: 400 });
    }
}
export function handlePrototypeUploadApi(req, res, options, pathname, handlers) {
    if (pathname === '/api/upload-screenshots' && req.method === 'POST') {
        handlers.readMultipartParts(req).then(async (parts) => {
            const context = handlers.createProjectContextFromMultipartParts(req, res, options, parts);
            if (!context)
                return;
            await handleUploadScreenshots(res, context, parts, handlers);
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/upload' && req.method === 'POST') {
        handlers.readMultipartParts(req).then(async (parts) => {
            const context = handlers.createProjectContextFromMultipartParts(req, res, options, parts);
            if (!context)
                return;
            const targetType = getTargetTypeFromParts(parts);
            const uploadType = getMultipartTextField(parts, 'uploadType') || 'make';
            if (targetType === 'themes') {
                if (!requireThemeUploadTarget(res, context, targetType, handlers)) {
                    return;
                }
                await handleThemeZipUpload(res, options, context, parts, handlers);
                return;
            }
            if (!requirePrototypeUploadTarget(res, context, targetType, handlers)) {
                return;
            }
            if (uploadType === 'make') {
                await handlePrototypeMakeUpload(res, options, context, parts, handlers);
                return;
            }
            if (isPrototypeConverterUploadType(uploadType)) {
                await handlePrototypeConverterUpload(res, options, context, parts, uploadType, handlers);
                return;
            }
            handlers.sendDisabledCapability(res, 424, {
                error: 'Prototype converter uploads require a dedicated make-server adapter',
                code: 'PROTOTYPE_CONVERTER_ADAPTER_REQUIRED',
                projectId: context.project.id,
                projectRoot: context.project.root,
                adapterRequired: true,
                details: {
                    uploadType,
                    targetType,
                },
            });
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    return false;
}
