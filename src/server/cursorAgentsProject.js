import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export const CURSOR_DEBUG_PORT = 9230;
const defaultFileSystem = {
    access: (filePath) => fs.access(filePath),
};
const defaultWait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
function defaultRun(command, args) {
    return new Promise((resolve, reject) => {
        execFile(command, args, {
            encoding: 'utf8',
            shell: false,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}
async function defaultProbeTargets(debugPort) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
    });
    if (!response.ok)
        return [];
    const body = await response.json();
    return Array.isArray(body) ? body : [];
}
function getEnvValue(env, key) {
    const direct = env[key];
    if (direct)
        return direct;
    const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    return match ? env[match] : undefined;
}
function resolveCursorAppCandidates(context) {
    const platform = context.platform || process.platform;
    const homeDir = context.homeDir || os.homedir();
    const env = context.env || process.env;
    if (platform === 'darwin') {
        return {
            platform,
            candidates: ['/Applications/Cursor.app', path.posix.join(homeDir, 'Applications/Cursor.app')],
        };
    }
    if (platform === 'win32') {
        const localAppData = getEnvValue(env, 'LOCALAPPDATA')
            || path.win32.join(homeDir, 'AppData', 'Local');
        const programFiles = getEnvValue(env, 'PROGRAMFILES') || String.raw `C:\Program Files`;
        const programFilesX86 = getEnvValue(env, 'PROGRAMFILES(X86)') || String.raw `C:\Program Files (x86)`;
        return {
            platform,
            candidates: [
                path.win32.join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
                path.win32.join(programFiles, 'Cursor', 'Cursor.exe'),
                path.win32.join(programFilesX86, 'Cursor', 'Cursor.exe'),
            ],
        };
    }
    throw new Error('Cursor Agents project handoff supports macOS and Windows only.');
}
function isCursorWorkbenchPage(target) {
    return target?.type === 'page'
        && typeof target.url === 'string'
        && target.url.startsWith('vscode-file://vscode-app/')
        && target.url.includes('/workbench/workbench.html');
}
export function isCursorWorkbenchTarget(target) {
    return target?.title === 'Cursor Agents' && isCursorWorkbenchPage(target);
}
function cursorTargetKey(target) {
    if (typeof target.id === 'string' && target.id)
        return `id:${target.id}`;
    if (typeof target.url !== 'string')
        return null;
    return `fallback:${String(target.title || '')}:${target.url}`;
}
function assertNoNewNonAgentsWorkbench(before, after) {
    const existingTargets = new Set(before
        .filter(isCursorWorkbenchPage)
        .map(cursorTargetKey)
        .filter((value) => Boolean(value)));
    const incompatibleTarget = after.find((target) => {
        if (!isCursorWorkbenchPage(target) || isCursorWorkbenchTarget(target))
            return false;
        const key = cursorTargetKey(target);
        return Boolean(key && !existingTargets.has(key));
    });
    if (incompatibleTarget) {
        throw new Error('Cursor-version incompatibility: project opened outside Cursor Agents.');
    }
}
async function firstExistingPath(fileSystem, candidates) {
    for (const candidate of candidates) {
        try {
            await fileSystem.access(candidate);
            return candidate;
        }
        catch {
            // Continue through standard installation locations.
        }
    }
    return null;
}
function cursorDesktopRouterPath(platform, appPath) {
    return platform === 'darwin'
        ? path.posix.join(appPath, 'Contents/Resources/app/bin/cursor')
        : appPath;
}
async function ensureCursorDesktopRouter(platform, appPath, fileSystem) {
    const routerPath = cursorDesktopRouterPath(platform, appPath);
    if (platform !== 'darwin')
        return routerPath;
    try {
        await fileSystem.access(routerPath);
    }
    catch {
        throw new Error('Cursor bundled desktop CLI was not found. Reinstall or update Cursor first.');
    }
    return routerPath;
}
async function waitForCursorAgentsTarget(options) {
    for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
        try {
            if ((await options.probeTargets(CURSOR_DEBUG_PORT)).some(isCursorWorkbenchTarget))
                return;
        }
        catch {
            // The loopback endpoint may be unavailable while Cursor starts.
        }
        if (attempt + 1 < options.maxAttempts)
            await options.wait(options.retryDelayMs);
    }
    throw new Error('Cursor Agents did not expose a CDP target within 20 seconds. Start Cursor Agents first.');
}
export async function openCursorAgentsProject(targetPath, context = {}) {
    const fileSystem = context.fileSystem || defaultFileSystem;
    const run = context.run || defaultRun;
    const probeTargets = context.probeTargets || defaultProbeTargets;
    const wait = context.wait || defaultWait;
    const maxAttempts = context.maxAttempts ?? 20;
    const retryDelayMs = context.retryDelayMs ?? 1000;
    const { platform, candidates } = resolveCursorAppCandidates(context);
    const appPath = await firstExistingPath(fileSystem, candidates);
    if (!appPath) {
        throw new Error('Cursor was not found in a standard installation location. Install Cursor first.');
    }
    await waitForCursorAgentsTarget({ probeTargets, wait, maxAttempts, retryDelayMs });
    const routerPath = await ensureCursorDesktopRouter(platform, appPath, fileSystem);
    await run(routerPath, ['--chat']);
    await waitForCursorAgentsTarget({ probeTargets, wait, maxAttempts, retryDelayMs });
    const before = await probeTargets(CURSOR_DEBUG_PORT);
    await run(routerPath, [targetPath]);
    await wait(250);
    const after = await probeTargets(CURSOR_DEBUG_PORT);
    assertNoNewNonAgentsWorkbench(before, after);
    return { appPath, targetPath };
}
