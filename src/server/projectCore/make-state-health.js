import fs from 'node:fs';
import path from 'node:path';
import { getAdminServerInfoPath, getGlobalServerConfigPath, getProjectRegistryPath, } from './paths.ts';
export const MAKE_STATE_DIR_NOT_WRITABLE = 'MAKE_STATE_DIR_NOT_WRITABLE';
export const MAKE_STATE_NOT_WRITABLE_MESSAGE = 'Axhub Make 无法保存本机项目列表';
function resolveRegistryPath(options = {}) {
    return path.resolve(options.registryPath || getProjectRegistryPath(options.homeDir));
}
function resolveHomeDirFromRegistryPath(registryPath) {
    return path.dirname(path.dirname(path.dirname(registryPath)));
}
function normalizeErrorInfo(error) {
    const looseError = error;
    return {
        ...(typeof looseError?.code === 'string' && looseError.code ? { code: looseError.code } : {}),
        message: typeof looseError?.message === 'string' && looseError.message.trim()
            ? looseError.message
            : String(error || 'Unknown error'),
    };
}
export function isMakeStateWritePermissionError(error) {
    const code = error?.code;
    return code === MAKE_STATE_DIR_NOT_WRITABLE
        || code === 'EPERM'
        || code === 'EACCES'
        || code === 'EROFS';
}
export function createMakeStateNotWritableError(registryPath, error, options = {}) {
    const resolvedRegistryPath = path.resolve(registryPath);
    const targetPath = path.resolve(options.targetPath || resolvedRegistryPath);
    const nextError = new Error(MAKE_STATE_NOT_WRITABLE_MESSAGE);
    nextError.code = MAKE_STATE_DIR_NOT_WRITABLE;
    nextError.status = 500;
    nextError.details = {
        stateDir: path.dirname(resolvedRegistryPath),
        registryPath: resolvedRegistryPath,
        stage: options.stage || 'state-file-overwrite',
        targetPath,
        fileName: path.basename(targetPath),
        error: normalizeErrorInfo(error),
    };
    return nextError;
}
function createMakeStateHealthFailure(params) {
    const targetPath = path.resolve(params.targetPath);
    return {
        ok: false,
        code: MAKE_STATE_DIR_NOT_WRITABLE,
        message: MAKE_STATE_NOT_WRITABLE_MESSAGE,
        stateDir: params.stateDir,
        registryPath: params.registryPath,
        stage: params.stage,
        targetPath,
        ...(params.stage === 'state-file-overwrite' ? { fileName: path.basename(targetPath) } : {}),
        error: normalizeErrorInfo(params.error),
    };
}
function verifyDirectoryWritable(stateDir, registryPath) {
    const probePath = path.join(stateDir, `.projects.json.health-${process.pid}-${Date.now()}`);
    const tempPath = `${probePath}.tmp`;
    const finalPath = `${probePath}.ok`;
    try {
        fs.writeFileSync(tempPath, '{}\n', 'utf8');
        fs.renameSync(tempPath, finalPath);
        fs.unlinkSync(finalPath);
        return null;
    }
    catch (error) {
        return createMakeStateHealthFailure({
            stateDir,
            registryPath,
            stage: 'state-dir-write',
            targetPath: stateDir,
            error,
        });
    }
    finally {
        for (const filePath of [tempPath, finalPath]) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            catch {
                // Ignore cleanup failures; the health result above is the actionable signal.
            }
        }
    }
}
function verifyStateFileOverwritable(filePath, stateDir, registryPath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    let originalContent;
    try {
        originalContent = fs.readFileSync(filePath);
    }
    catch (error) {
        return createMakeStateHealthFailure({
            stateDir,
            registryPath,
            stage: 'state-file-overwrite',
            targetPath: filePath,
            error,
        });
    }
    try {
        const probe = {
            axhubMakeHealthCheck: true,
            fileName: path.basename(filePath),
            checkedAt: new Date(0).toISOString(),
        };
        fs.writeFileSync(filePath, `${JSON.stringify(probe, null, 2)}\n`, 'utf8');
        fs.writeFileSync(filePath, originalContent);
        return null;
    }
    catch (error) {
        try {
            fs.writeFileSync(filePath, originalContent);
        }
        catch {
            // Preserve the original write failure as the actionable error.
        }
        return createMakeStateHealthFailure({
            stateDir,
            registryPath,
            stage: 'state-file-overwrite',
            targetPath: filePath,
            error,
        });
    }
}
export function checkMakeStateHealth(options = {}) {
    const registryPath = resolveRegistryPath(options);
    const stateDir = path.dirname(registryPath);
    const homeDir = options.homeDir || resolveHomeDirFromRegistryPath(registryPath);
    try {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    catch (error) {
        return createMakeStateHealthFailure({
            stateDir,
            registryPath,
            stage: 'state-dir-create',
            targetPath: stateDir,
            error,
        });
    }
    const directoryFailure = verifyDirectoryWritable(stateDir, registryPath);
    if (directoryFailure) {
        return directoryFailure;
    }
    const criticalFiles = [
        getAdminServerInfoPath(undefined, { homeDir }),
        registryPath,
        getGlobalServerConfigPath(homeDir),
    ];
    for (const filePath of criticalFiles) {
        const fileFailure = verifyStateFileOverwritable(filePath, stateDir, registryPath);
        if (fileFailure) {
            return fileFailure;
        }
    }
    return {
        ok: true,
        stateDir,
        registryPath,
    };
}
