import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkMakeStateHealth, createMakeStateNotWritableError, getAdminServerInfoPath, getGlobalServerConfigPath, getProjectRegistryPath, MAKE_STATE_DIR_NOT_WRITABLE, } from '../projectCore/index.ts';
import { startMakeServer } from '../index.ts';
const tempRoots = [];
function createTempRoot(prefix = 'axhub-make-state-health-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('make state health', () => {
    it('checks that the global Make state directory can write and replace files', () => {
        const homeDir = createTempRoot();
        const result = checkMakeStateHealth({ homeDir });
        expect(result).toMatchObject({
            ok: true,
            stateDir: path.dirname(getProjectRegistryPath(homeDir)),
            registryPath: getProjectRegistryPath(homeDir),
        });
        expect(fs.readdirSync(path.dirname(getProjectRegistryPath(homeDir))).filter((file) => file.includes('.health-'))).toEqual([]);
    });
    it('returns a user-facing not-writable result for permission write failures', () => {
        const homeDir = createTempRoot();
        const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
            throw permissionError;
        });
        const result = checkMakeStateHealth({ homeDir });
        expect(result).toMatchObject({
            ok: false,
            code: MAKE_STATE_DIR_NOT_WRITABLE,
            message: 'Axhub Make 无法保存本机项目列表',
            stateDir: path.dirname(getProjectRegistryPath(homeDir)),
            registryPath: getProjectRegistryPath(homeDir),
            error: {
                code: 'EPERM',
                message: 'operation not permitted',
            },
        });
    });
    it('returns a directory create result when the global Make state directory cannot be created', () => {
        const homeDir = createTempRoot();
        const stateDir = path.dirname(getProjectRegistryPath(homeDir));
        const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(fs, 'mkdirSync').mockImplementation(((dirPath, options) => {
            if (path.resolve(String(dirPath)) === stateDir) {
                throw permissionError;
            }
            return undefined;
        }));
        const result = checkMakeStateHealth({ homeDir });
        expect(result).toMatchObject({
            ok: false,
            code: MAKE_STATE_DIR_NOT_WRITABLE,
            stage: 'state-dir-create',
            stateDir,
            registryPath: getProjectRegistryPath(homeDir),
            targetPath: stateDir,
            error: {
                code: 'EPERM',
                message: 'operation not permitted',
            },
        });
    });
    it('checks that existing global Make state files can be overwritten and restored', () => {
        const homeDir = createTempRoot();
        const adminInfoPath = getAdminServerInfoPath(undefined, { homeDir });
        const registryPath = getProjectRegistryPath(homeDir);
        const serverConfigPath = getGlobalServerConfigPath(homeDir);
        fs.mkdirSync(path.dirname(registryPath), { recursive: true });
        fs.writeFileSync(adminInfoPath, '{"kind":"admin"}\n', 'utf8');
        fs.writeFileSync(registryPath, '{"kind":"projects"}\n', 'utf8');
        fs.writeFileSync(serverConfigPath, '{"kind":"config"}\n', 'utf8');
        const result = checkMakeStateHealth({ homeDir });
        expect(result).toMatchObject({
            ok: true,
            stateDir: path.dirname(registryPath),
            registryPath,
        });
        expect(fs.readFileSync(adminInfoPath, 'utf8')).toBe('{"kind":"admin"}\n');
        expect(fs.readFileSync(registryPath, 'utf8')).toBe('{"kind":"projects"}\n');
        expect(fs.readFileSync(serverConfigPath, 'utf8')).toBe('{"kind":"config"}\n');
    });
    it('returns a file overwrite result when admin server info cannot be replaced', () => {
        const homeDir = createTempRoot();
        const adminInfoPath = getAdminServerInfoPath(undefined, { homeDir });
        const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        fs.mkdirSync(path.dirname(adminInfoPath), { recursive: true });
        fs.writeFileSync(adminInfoPath, '{"kind":"admin"}\n', 'utf8');
        const originalWriteFileSync = fs.writeFileSync;
        vi.spyOn(fs, 'writeFileSync').mockImplementation(((filePath, data, options) => {
            if (path.resolve(String(filePath)) === adminInfoPath) {
                throw permissionError;
            }
            return originalWriteFileSync(filePath, data, options);
        }));
        const result = checkMakeStateHealth({ homeDir });
        expect(result).toMatchObject({
            ok: false,
            code: MAKE_STATE_DIR_NOT_WRITABLE,
            stage: 'state-file-overwrite',
            stateDir: path.dirname(adminInfoPath),
            registryPath: getProjectRegistryPath(homeDir),
            targetPath: adminInfoPath,
            fileName: '.admin-server-info.json',
            error: {
                code: 'EPERM',
                message: 'operation not permitted',
            },
        });
        expect(fs.readFileSync(adminInfoPath, 'utf8')).toBe('{"kind":"admin"}\n');
    });
    it('creates a structured registry write error for Make client APIs', () => {
        const homeDir = createTempRoot();
        const registryPath = getProjectRegistryPath(homeDir);
        const originalError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        const error = createMakeStateNotWritableError(registryPath, originalError, { stage: 'state-file-overwrite' });
        expect(error).toMatchObject({
            message: 'Axhub Make 无法保存本机项目列表',
            code: MAKE_STATE_DIR_NOT_WRITABLE,
            status: 500,
            details: {
                stateDir: path.dirname(registryPath),
                registryPath,
                stage: 'state-file-overwrite',
                targetPath: registryPath,
                fileName: 'projects.json',
                error: {
                    code: 'EPERM',
                    message: 'operation not permitted',
                },
            },
        });
    });
    it('exposes the startup Make state health through the Admin API without blocking CLI-style startup', async () => {
        const projectRoot = createTempRoot('axhub-make-state-health-project-');
        const registryHome = createTempRoot('axhub-make-state-health-home-');
        const registryPath = getProjectRegistryPath(registryHome);
        const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        const originalWriteFileSync = fs.writeFileSync;
        vi.spyOn(fs, 'writeFileSync').mockImplementation(((filePath, data, options) => {
            if (String(filePath).includes('.projects.json.health-')) {
                throw permissionError;
            }
            return originalWriteFileSync(filePath, data, options);
        }));
        const server = await startMakeServer({
            projectRoot,
            host: 'localhost',
            port: 0,
            adminRoot: path.join(projectRoot, 'missing-admin'),
            registryPath,
        });
        try {
            const response = await fetch(`${server.origin}/api/make-state/health`);
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                ok: false,
                code: MAKE_STATE_DIR_NOT_WRITABLE,
                stateDir: path.dirname(registryPath),
                registryPath,
            });
        }
        finally {
            await server.close();
        }
    });
    it('keeps CLI-style startup available when the global Make state directory cannot persist server info', async () => {
        const projectRoot = createTempRoot('axhub-make-state-health-project-');
        const registryHome = createTempRoot('axhub-make-state-health-home-');
        const registryPath = getProjectRegistryPath(registryHome);
        const stateDir = path.dirname(registryPath);
        const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        const originalWriteFileSync = fs.writeFileSync;
        vi.spyOn(fs, 'writeFileSync').mockImplementation(((filePath, data, options) => {
            if (String(filePath).startsWith(stateDir)) {
                throw permissionError;
            }
            return originalWriteFileSync(filePath, data, options);
        }));
        const server = await startMakeServer({
            projectRoot,
            host: 'localhost',
            port: 0,
            adminRoot: path.join(projectRoot, 'missing-admin'),
            registryPath,
        });
        try {
            const response = await fetch(`${server.origin}/api/health`);
            const body = await response.json();
            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                ok: true,
                makeState: {
                    ok: false,
                    code: MAKE_STATE_DIR_NOT_WRITABLE,
                },
                server: {
                    origin: server.origin,
                },
            });
        }
        finally {
            await server.close();
        }
    });
});
