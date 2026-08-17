import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isPathInside, readServerInfo, } from './projectCore/index.ts';
import { designKnowledgeThemeCatalog, } from './designKnowledgeThemeCatalog.ts';
import { readJsonBody, sendJson } from './http.ts';
import { runLocalCommand } from './localCommand.ts';
function sendThemeLibraryError(res, status, code, error, details) {
    sendJson(res, {
        ok: false,
        code,
        error,
        ...(details ? { details } : {}),
    }, { status });
}
function parsePlatform(value) {
    return value === 'desktop' || value === 'mobile' ? value : null;
}
function parseListPlatform(req) {
    const value = new URL(req.url || '/', 'http://localhost').searchParams.get('platform');
    return value === null || value === '' ? 'desktop' : parsePlatform(value);
}
function themeLibraryErrorCode(error) {
    return error?.code === 'THEME_LIBRARY_SCHEMA_INVALID'
        ? 'THEME_LIBRARY_SCHEMA_INVALID'
        : 'THEME_LIBRARY_REMOTE_UNAVAILABLE';
}
async function execFilePromise(command, args, cwd) {
    return runLocalCommand(command, args, { cwd, maxBuffer: 1024 * 1024 * 10 });
}
async function extractTarball(tarballPath, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    await execFilePromise('tar', ['-xzf', tarballPath, '-C', targetDir], path.dirname(tarballPath));
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
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
function createProjectRelativePath(projectRoot, absolutePath) {
    return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}
function prependUnique(values, value) {
    return [value, ...values.filter((item) => item !== value)];
}
function resolveThemeClientUrl(options, context, themeId) {
    const projectRuntimeOrigin = readServerInfo(context.project.root, 'runtime')?.origin;
    const base = (projectRuntimeOrigin || options.runtimeOrigin || options.origin || '').replace(/\/+$/u, '');
    return `${base}/themes/${encodeURIComponent(themeId)}`;
}
function updateThemeMetadataAfterImport(context, params) {
    const current = context.metadataStore.getMetadata();
    const themePath = createProjectRelativePath(context.project.root, params.themeDir);
    const filePath = createProjectRelativePath(context.project.root, params.entryPath);
    context.metadata = context.metadataStore.saveMetadata({
        ...current,
        resources: {
            ...current.resources,
            themes: [
                {
                    id: params.theme.slug,
                    name: params.theme.slug,
                    title: params.theme.title,
                    path: themePath,
                    sourcePath: themePath,
                    filePath,
                    absoluteFilePath: params.entryPath,
                    clientUrl: params.clientUrl,
                    previewUrl: params.clientUrl,
                    description: params.theme.description,
                    updatedAt: new Date().toISOString(),
                },
                ...current.resources.themes.filter((theme) => theme.id !== params.theme.slug && theme.name !== params.theme.slug),
            ],
        },
        orders: {
            ...current.orders,
            themes: prependUnique(current.orders.themes, params.theme.slug),
        },
    });
    return filePath;
}
function requireThemeImportTarget(res, context, handlers) {
    const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'themes');
    if (!handlers.hasResourceWriteCapability(context, 'themeImport') || !targetBaseDir) {
        handlers.sendDisabledCapability(res, 424, {
            error: 'Theme library import requires project-side theme write capability in make-server',
            code: 'THEME_LIBRARY_IMPORT_ADAPTER_REQUIRED',
            projectId: context.project.id,
            projectRoot: context.project.root,
            adapterRequired: true,
            details: {
                route: '/api/theme-library/import',
                reason: 'missing-theme-import-capability-or-target',
            },
        });
        return null;
    }
    return targetBaseDir;
}
async function handleListThemeLibrary(req, res) {
    const platform = parseListPlatform(req);
    if (!platform) {
        sendThemeLibraryError(res, 400, 'THEME_LIBRARY_PLATFORM_INVALID', 'platform must be desktop or mobile');
        return;
    }
    try {
        const result = await designKnowledgeThemeCatalog.load(platform);
        sendJson(res, {
            schemaVersion: 1,
            ...result,
        });
    }
    catch (error) {
        const code = themeLibraryErrorCode(error);
        sendThemeLibraryError(res, 502, code, error?.message || 'Failed to load theme library');
    }
}
async function handleImportThemeLibrary(req, res, options, handlers) {
    let body;
    try {
        body = await readJsonBody(req);
    }
    catch {
        sendJson(res, { error: 'Invalid JSON body', code: 'INVALID_JSON_BODY' }, { status: 400 });
        return;
    }
    const context = handlers.createProjectContextFromBody(req, res, options, body);
    if (!context)
        return;
    const targetBaseDir = requireThemeImportTarget(res, context, handlers);
    if (!targetBaseDir)
        return;
    const themeId = typeof body?.themeId === 'string' ? body.themeId.trim() : '';
    if (!themeId) {
        sendThemeLibraryError(res, 400, 'THEME_LIBRARY_THEME_ID_REQUIRED', 'Missing themeId');
        return;
    }
    const platform = parsePlatform(body?.platform);
    if (!platform) {
        sendThemeLibraryError(res, 400, 'THEME_LIBRARY_PLATFORM_INVALID', 'platform must be desktop or mobile');
        return;
    }
    const tempRoot = path.join(context.project.root, 'temp', 'theme-library');
    const tempDir = path.join(tempRoot, `${Date.now()}-${randomUUID()}`);
    let targetDir = '';
    try {
        const theme = await designKnowledgeThemeCatalog.getRecord(platform, themeId);
        if (!theme) {
            sendThemeLibraryError(res, 404, 'THEME_LIBRARY_THEME_NOT_FOUND', `Theme not found: ${themeId}`);
            return;
        }
        if (!theme.canDirectImport) {
            sendThemeLibraryError(res, 409, 'THEME_LIBRARY_NOT_IMPORTABLE', theme.directImportDisabledReason || 'This theme does not provide a verified import package', { themeId, platform });
            return;
        }
        targetDir = path.join(targetBaseDir, theme.slug);
        if (!isPathInside(targetBaseDir, targetDir) || targetDir === path.resolve(targetBaseDir)) {
            throw new Error('Theme target path is unsafe');
        }
        if (fs.existsSync(targetDir)) {
            sendThemeLibraryError(res, 409, 'THEME_LIBRARY_TARGET_EXISTS', `Theme folder already exists: ${theme.slug}`, { themeId, folderName: theme.slug });
            return;
        }
        fs.mkdirSync(tempDir, { recursive: true });
        const tarballPath = path.join(tempDir, 'package.tar.gz');
        fs.writeFileSync(tarballPath, await designKnowledgeThemeCatalog.downloadPackage(theme));
        const extractDir = path.join(tempDir, 'extract');
        await extractTarball(tarballPath, extractDir);
        const sourceEntryPath = path.join(extractDir, 'index.tsx');
        if (!isPathInside(extractDir, sourceEntryPath) || !fs.existsSync(sourceEntryPath) || !fs.statSync(sourceEntryPath).isFile()) {
            throw new Error('Theme package must contain index.tsx at its root');
        }
        fs.mkdirSync(targetBaseDir, { recursive: true });
        copyDirectoryRecursive(extractDir, targetDir);
        const entryPath = path.join(targetDir, 'index.tsx');
        const clientUrl = resolveThemeClientUrl(options, context, theme.slug);
        const filePath = updateThemeMetadataAfterImport(context, {
            theme,
            themeDir: targetDir,
            entryPath,
            clientUrl,
        });
        sendJson(res, {
            success: true,
            projectId: context.project.id,
            themeId: theme.id,
            platform: theme.platform,
            folderName: theme.slug,
            path: `themes/${theme.slug}`,
            filePath,
            absoluteFilePath: entryPath,
            clientUrl,
        });
    }
    catch (error) {
        if (targetDir && fs.existsSync(targetDir) && isPathInside(targetBaseDir, targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }
        const code = error?.code === 'THEME_LIBRARY_SCHEMA_INVALID'
            || error?.code === 'THEME_LIBRARY_REMOTE_UNAVAILABLE'
            ? themeLibraryErrorCode(error)
            : 'THEME_LIBRARY_IMPORT_FAILED';
        sendThemeLibraryError(res, code === 'THEME_LIBRARY_IMPORT_FAILED' ? 400 : 502, code, error?.message || 'Theme library import failed');
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
export function handleThemeLibraryApi(req, res, options, pathname, handlers) {
    if (pathname === '/api/theme-library') {
        if (req.method !== 'GET') {
            sendJson(res, { error: 'Method not allowed' }, { status: 405 });
            return true;
        }
        void handleListThemeLibrary(req, res);
        return true;
    }
    if (pathname === '/api/theme-library/import') {
        if (req.method !== 'POST') {
            sendJson(res, { error: 'Method not allowed' }, { status: 405 });
            return true;
        }
        void handleImportThemeLibrary(req, res, options, handlers);
        return true;
    }
    return false;
}
