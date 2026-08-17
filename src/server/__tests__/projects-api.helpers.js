import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { getGlobalServerConfigPath, getMakeClientMarkerPath, getProjectMetadataPath, getProjectRegistryPath, } from '../projectCore/index.ts';
import { startMakeServer } from '../index.ts';
const tempRoots = [];
export function createTempRoot(prefix = 'axhub-make-projects-api-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
export function cleanupProjectApiTestRoots() {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
}
export function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}
export function writeMakeClientProjectMarker(projectRoot, id, name) {
    writeJson(getMakeClientMarkerPath(projectRoot), {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: { id, name },
    });
    writeJson(path.join(projectRoot, 'package.json'), {
        scripts: {
            dev: 'vite',
            'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        },
    });
}
export function writeProjectMetadata(projectRoot, overrides = {}, options = {}) {
    const docPath = path.join(projectRoot, 'src', 'resources', 'spec.md');
    const project = {
        id: path.basename(projectRoot),
        name: path.basename(projectRoot),
        ...(overrides.project && typeof overrides.project === 'object' && !Array.isArray(overrides.project)
            ? overrides.project
            : {}),
    };
    if (options.makeClientMarker !== false) {
        writeMakeClientProjectMarker(projectRoot, String(project.id), String(project.name));
    }
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(docPath, '# Spec\n', 'utf8');
    writeJson(getProjectMetadataPath(projectRoot), {
        schemaVersion: 1,
        project,
        resources: {
            prototypes: [
                {
                    id: 'home',
                    name: 'home',
                    title: 'Home',
                    clientUrl: 'http://localhost:3000/home',
                },
            ],
            themes: [{ id: 'theme-a', name: 'theme-a' }],
        },
        navigation: { prototypes: ['home'] },
        orders: { themes: ['theme-a'] },
        capabilities: {
            quickEdit: true,
            quickEditMode: 'clientRuntime',
            figmaExport: true,
            axureExport: false,
            multiDevicePreview: true,
        },
        ...overrides,
    });
    return { docPath };
}
export function getTestProjectRegistryPath(registryHome) {
    return getProjectRegistryPath(registryHome);
}
export async function startTestServer(projectRoot, registryHomeOrOptions = createTempRoot('axhub-make-projects-api-home-'), options = {}) {
    const registryHome = typeof registryHomeOrOptions === 'string'
        ? registryHomeOrOptions
        : createTempRoot('axhub-make-projects-api-home-');
    const resolvedOptions = typeof registryHomeOrOptions === 'string' ? options : registryHomeOrOptions;
    if (resolvedOptions.serverConfig) {
        writeJson(getGlobalServerConfigPath(registryHome), resolvedOptions.serverConfig);
    }
    const registryPath = getProjectRegistryPath(registryHome);
    return startMakeServer({
        projectRoot,
        host: 'localhost',
        port: 0,
        adminRoot: path.join(projectRoot, 'missing-admin'),
        registryPath,
        runtimeOrigin: resolvedOptions.runtimeOrigin,
        gitWorkspaceCommandExecutor: resolvedOptions.gitWorkspaceCommandExecutor,
    });
}
export async function registerProject(origin, projectRoot, id, name = id) {
    writeJson(getMakeClientMarkerPath(projectRoot), {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: { id, name },
    });
    writeJson(path.join(projectRoot, 'package.json'), {
        scripts: {
            dev: 'vite',
            'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        },
    });
    const response = await fetch(`${origin}/api/projects/make/register-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: projectRoot }),
    });
    expect(response.status).toBe(201);
    return response.json();
}
export async function setActiveProject(origin, projectId) {
    const response = await fetch(`${origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
    });
    expect(response.status).toBe(200);
    return response.json();
}
export function scopeProjectApiUrl(projectRoot, rawUrl) {
    const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
    const projectId = String(metadata?.project?.id || '').trim();
    if (!projectId) {
        throw new Error(`Missing project id in ${getProjectMetadataPath(projectRoot)}`);
    }
    const url = new URL(rawUrl);
    if (!url.searchParams.has('projectId')) {
        url.searchParams.set('projectId', projectId);
    }
    return url.toString();
}
export function writeTable(projectRoot, fileName, tableName, records) {
    writeJson(path.join(projectRoot, 'src', 'resources', 'data', `${fileName}.json`), { tableName, records });
}
export function createZipFromDirectory(sourceDir, zipPath) {
    fs.rmSync(zipPath, { force: true });
    execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir });
}
export async function initGitRepo(projectRoot) {
    const { execFile } = await import('node:child_process');
    const run = (args) => new Promise((resolve, reject) => {
        execFile('git', args, { cwd: projectRoot }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(String(stderr || stdout || error.message)));
                return;
            }
            resolve();
        });
    });
    await run(['init']);
    await run(['config', 'user.email', 'test@example.com']);
    await run(['config', 'user.name', 'Test User']);
    await run(['add', '.']);
    await run(['commit', '-m', 'initial']);
}
