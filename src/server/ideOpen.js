import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { buildIDEFileProtocolUrl, getIDEFileProtocolSchemes } from './ideProtocol.ts';
export const MAIN_IDE_VALUES = ['cursor', 'trae', 'vscode', 'trae_cn', 'windsurf', 'qoder', 'antigravity'];
const MAIN_IDE_APP_NAMES = {
    cursor: 'Cursor',
    trae: 'TRAE',
    vscode: 'Visual Studio Code',
    trae_cn: 'TRAE CN',
    windsurf: 'Windsurf',
    qoder: 'Qoder',
    antigravity: 'Antigravity',
};
const MAIN_IDE_DISPLAY_NAMES = {
    cursor: 'Cursor',
    trae: 'TRAE',
    vscode: 'vscode',
    trae_cn: 'TRAE CN',
    windsurf: 'Windsurf',
    qoder: 'Qoder',
    antigravity: 'Antigravity',
};
const MAIN_IDE_WINDOWS_APP_PATH_NAMES = {
    cursor: ['Cursor'],
    trae: ['Trae', 'TRAE'],
    vscode: ['Visual Studio Code', 'Visual Studio Code Insiders'],
    trae_cn: ['Trae CN', 'TRAE CN', 'Trae', 'TRAE'],
    windsurf: ['Windsurf'],
    qoder: ['Qoder'],
    antigravity: ['Antigravity'],
};
const MAIN_IDE_WINDOWS_COMMAND_CANDIDATES = {
    cursor: ['cursor'],
    trae: ['trae'],
    vscode: ['code', 'code-insiders'],
    trae_cn: ['trae-cn', 'trae_cn', 'trae'],
    windsurf: ['windsurf'],
    qoder: ['qoder'],
    antigravity: ['antigravity'],
};
const MAIN_IDE_WINDOWS_EXECUTABLE_NAMES = {
    cursor: ['Cursor.exe'],
    trae: ['TRAE.exe', 'Trae.exe'],
    vscode: ['Code.exe', 'Code - Insiders.exe'],
    trae_cn: ['Trae CN.exe', 'TRAE CN.exe', 'TRAE.exe', 'Trae.exe'],
    windsurf: ['Windsurf.exe'],
    qoder: ['Qoder.exe'],
    antigravity: ['Antigravity.exe'],
};
const WINDOWS_START_PROCESS_RESULT_TIMEOUT_MS = 4_000;
export function normalizeMainIDE(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return MAIN_IDE_VALUES.includes(normalized) ? normalized : null;
}
function quoteForShell(value) {
    return `"${String(value).replace(/["\\$`]/g, '\\$&')}"`;
}
function quoteForPowerShellSingle(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}
function toText(value) {
    if (typeof value === 'string')
        return value;
    if (Buffer.isBuffer(value))
        return value.toString('utf8');
    if (value instanceof Uint8Array)
        return Buffer.from(value).toString('utf8');
    return String(value || '');
}
function resolveWindowsExecutablePath(candidates) {
    for (const candidate of candidates) {
        const trimmed = candidate.trim();
        if (!trimmed)
            continue;
        const result = spawnSync('where', [trimmed], {
            encoding: 'utf8',
            windowsHide: true,
        });
        if (result.status !== 0)
            continue;
        const lines = String(result.stdout || '')
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
        if (!lines.length)
            continue;
        const exePath = lines.find((line) => /\.exe$/i.test(line));
        if (exePath) {
            return exePath;
        }
        const commandWrapper = lines.find((line) => /\.(cmd|bat)$/i.test(line));
        if (commandWrapper) {
            const inferredExePath = commandWrapper.replace(/\.(cmd|bat)$/i, '.exe');
            if (fs.existsSync(inferredExePath)) {
                return inferredExePath;
            }
            return commandWrapper;
        }
        return lines[0] || null;
    }
    return null;
}
function resolveWindowsExecutableFromRegistry(executableNames) {
    const keyRoots = [
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
        'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    ];
    for (const executableName of executableNames) {
        const normalizedName = executableName.trim();
        if (!normalizedName)
            continue;
        for (const keyRoot of keyRoots) {
            const key = `${keyRoot}\\${normalizedName}`;
            const query = spawnSync('reg', ['query', key, '/ve'], {
                encoding: 'utf8',
                windowsHide: true,
            });
            if (query.status !== 0 || query.error) {
                continue;
            }
            const output = String(query.stdout || '');
            const matchedLine = output
                .split(/\r?\n/u)
                .map((line) => line.trim())
                .find((line) => /REG_\w+/i.test(line));
            if (!matchedLine) {
                continue;
            }
            const valueMatch = matchedLine.match(/REG_\w+\s+(.+)$/i);
            const resolvedPath = valueMatch?.[1]?.trim().replace(/^"|"$/g, '') || '';
            if (resolvedPath && fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
        }
    }
    return null;
}
function resolveWindowsFileProtocolRegistration(schemes) {
    const keyRoots = [
        'HKCU\\Software\\Classes',
        'HKLM\\Software\\Classes',
        'HKLM\\Software\\WOW6432Node\\Classes',
    ];
    for (const scheme of schemes) {
        const normalizedScheme = scheme.trim();
        if (!normalizedScheme)
            continue;
        for (const keyRoot of keyRoots) {
            const query = spawnSync('reg', ['query', `${keyRoot}\\${normalizedScheme}\\shell\\open\\command`, '/ve'], {
                encoding: 'utf8',
                windowsHide: true,
            });
            if (query.status === 0 && !query.error) {
                return normalizedScheme;
            }
        }
    }
    return null;
}
function getSpawnCommandSpec(command, args, platform = process.platform) {
    if (platform !== 'win32' || /\.(exe|com)$/i.test(command)) {
        return {
            command,
            args,
            windowsHide: platform === 'win32',
        };
    }
    return {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', [quoteForShell(command), ...args.map(quoteForShell)].join(' ')],
        windowsHide: true,
    };
}
function spawnDetached(command, args, options = {}) {
    const platform = options.platform || process.platform;
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: options.windowsHide ?? platform === 'win32',
            shell: false,
        });
        let settled = false;
        const settleResolve = () => {
            if (settled)
                return;
            settled = true;
            child.unref();
            resolve();
        };
        const settleReject = (error) => {
            if (settled)
                return;
            settled = true;
            reject(new Error(options.errorMessage?.(error) || error.message || `Failed to spawn ${options.commandLabel || command}`));
        };
        child.once('error', settleReject);
        child.once('spawn', settleResolve);
    });
}
function spawnWindowsCommandAndWait(command, args, commandLabel) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let stderr = '';
        let resultTimer = null;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            if (resultTimer) {
                clearTimeout(resultTimer);
                resultTimer = null;
            }
            if (error) {
                reject(error);
                return;
            }
            resolve();
        };
        const child = spawn(command, args, {
            detached: false,
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
            shell: false,
        });
        child.stderr?.on('data', (chunk) => {
            stderr += toText(chunk);
        });
        child.once('error', (error) => {
            finish(new Error(error.message || `Failed to spawn ${commandLabel}`));
        });
        child.once('spawn', () => {
            resultTimer = setTimeout(() => finish(), WINDOWS_START_PROCESS_RESULT_TIMEOUT_MS);
        });
        child.once('close', (code) => {
            if (code && code !== 0) {
                const details = stderr.trim();
                finish(new Error(details || `${commandLabel} exited with code ${code}`));
                return;
            }
            finish();
        });
    });
}
function spawnWindowsStartProcess(args, commandLabel) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let stderr = '';
        let resultTimer = null;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            if (resultTimer) {
                clearTimeout(resultTimer);
                resultTimer = null;
            }
            if (error) {
                reject(error);
                return;
            }
            resolve();
        };
        const child = spawn('powershell', args, {
            detached: false,
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
            shell: false,
        });
        child.stderr?.on('data', (chunk) => {
            stderr += toText(chunk);
        });
        child.once('error', (error) => {
            finish(new Error(error.message || `Failed to spawn ${commandLabel}`));
        });
        child.once('spawn', () => {
            resultTimer = setTimeout(() => finish(), WINDOWS_START_PROCESS_RESULT_TIMEOUT_MS);
        });
        child.once('close', (code) => {
            if (code && code !== 0) {
                const details = stderr.trim();
                finish(new Error(details || `${commandLabel} exited with code ${code}`));
                return;
            }
            finish();
        });
    });
}
function tryOpenWindowsIDEByAppPathNames(appPathNames, targetPath) {
    const candidates = appPathNames.map((name) => name.trim()).filter(Boolean);
    const commandArgs = (candidate) => [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        'Start-Process -FilePath $args[0] -ArgumentList $args[1] -ErrorAction Stop',
        candidate,
        targetPath,
    ];
    return new Promise((resolve, reject) => {
        let lastError = null;
        const tryNext = (index) => {
            if (index >= candidates.length) {
                reject(lastError || new Error('No compatible Windows app path name found'));
                return;
            }
            spawnWindowsStartProcess(commandArgs(candidates[index]), `powershell Start-Process ${candidates[index]}`).then(() => resolve(candidates[index])).catch((error) => {
                lastError = error;
                tryNext(index + 1);
            });
        };
        tryNext(0);
    });
}
function buildWindowsIDEFileProtocolBrowserResult(ide, targetPath, preferredScheme) {
    const schemes = getIDEFileProtocolSchemes(ide);
    const scheme = String(preferredScheme || '').trim() || schemes[0];
    if (!scheme) {
        throw new Error('No compatible Windows file protocol found');
    }
    const url = buildIDEFileProtocolUrl(scheme, targetPath);
    return {
        success: true,
        ide,
        targetPath,
        command: `browser ${url}`,
        url,
        openInBrowser: true,
        openMode: 'browser-deeplink',
    };
}
function openWindowsIDE(ide, targetPath, toolOpenState) {
    const ideAppName = MAIN_IDE_APP_NAMES[ide];
    const executableCandidates = [
        ...(MAIN_IDE_WINDOWS_COMMAND_CANDIDATES[ide] || []),
        ideAppName,
    ];
    const executableNameCandidates = MAIN_IDE_WINDOWS_EXECUTABLE_NAMES[ide] || [];
    const appPathNames = MAIN_IDE_WINDOWS_APP_PATH_NAMES[ide] || [ideAppName];
    const openByExecutable = (resolvedExecutablePath) => {
        const spawnSpec = getSpawnCommandSpec(resolvedExecutablePath, [targetPath], process.platform);
        const launch = /\.(cmd|bat)$/i.test(resolvedExecutablePath) || spawnSpec.command === 'cmd.exe'
            ? spawnWindowsCommandAndWait(spawnSpec.command, spawnSpec.args, resolvedExecutablePath)
            : spawnDetached(spawnSpec.command, spawnSpec.args, {
                platform: process.platform,
                windowsHide: spawnSpec.windowsHide,
                commandLabel: resolvedExecutablePath,
            });
        return launch.then(() => ({
            success: true,
            ide,
            targetPath,
            command: `${quoteForShell(resolvedExecutablePath)} ${quoteForShell(targetPath)}`,
            openMode: 'direct-app',
            executablePath: resolvedExecutablePath,
        }));
    };
    const openByAppPath = (candidates) => tryOpenWindowsIDEByAppPathNames(candidates, targetPath).then((appPathName) => ({
        success: true,
        ide,
        targetPath,
        command: `powershell -NoProfile -Command Start-Process -FilePath ${quoteForPowerShellSingle(appPathName)} -ArgumentList ${quoteForPowerShellSingle(targetPath)} -ErrorAction Stop`,
        openMode: 'app-path',
        appPathName,
    }));
    const openByProtocol = (scheme) => Promise.resolve(buildWindowsIDEFileProtocolBrowserResult(ide, targetPath, scheme));
    const storedOpenMode = toolOpenState?.lastOpenMode || '';
    const storedExecutablePath = String(toolOpenState?.executablePath || '').trim();
    const storedAppPathName = String(toolOpenState?.appPathName || '').trim();
    const appPathCandidates = Array.from(new Set([
        storedAppPathName,
        ...appPathNames,
        ideAppName,
    ].filter(Boolean)));
    if (storedOpenMode === 'browser-deeplink') {
        return openByProtocol();
    }
    if (storedOpenMode === 'direct-app' && storedExecutablePath) {
        return openByExecutable(storedExecutablePath).catch(() => openByProtocol());
    }
    if (storedOpenMode === 'app-path' && storedAppPathName) {
        return openByAppPath(appPathCandidates)
            .catch(() => (storedExecutablePath ? openByExecutable(storedExecutablePath) : openByProtocol()))
            .catch(() => openByProtocol());
    }
    if (storedExecutablePath) {
        return openByExecutable(storedExecutablePath).catch(() => (storedAppPathName
            ? openByAppPath(appPathCandidates)
            : openByProtocol())).catch(() => openByProtocol());
    }
    if (storedAppPathName) {
        return openByAppPath(appPathCandidates).catch(() => openByProtocol());
    }
    const executablePath = storedExecutablePath
        || resolveWindowsExecutablePath(executableCandidates)
        || resolveWindowsExecutablePath(executableNameCandidates)
        || resolveWindowsExecutableFromRegistry(executableNameCandidates);
    const registeredProtocol = resolveWindowsFileProtocolRegistration(getIDEFileProtocolSchemes(ide));
    if (registeredProtocol) {
        return openByProtocol(registeredProtocol);
    }
    if (!executablePath) {
        return openByAppPath(appPathCandidates).catch(() => openByProtocol());
    }
    return openByExecutable(executablePath).catch(() => openByProtocol());
}
function openUnixIDE(ide, targetPath) {
    const ideAppName = MAIN_IDE_APP_NAMES[ide];
    const ideDisplayName = MAIN_IDE_DISPLAY_NAMES[ide];
    const command = `open -a ${quoteForShell(ideAppName)} ${quoteForShell(targetPath)}`;
    return spawnDetached('open', ['-a', ideAppName, targetPath], {
        platform: process.platform,
        windowsHide: false,
        commandLabel: command,
        errorMessage: (error) => `打开 ${ideDisplayName} 失败: ${toText(error.message).trim() || 'unknown error'}`,
    }).then(() => ({
        success: true,
        ide,
        targetPath,
        command,
    }));
}
export function openIDEPath({ ide, targetPath, toolOpenState, }) {
    if (process.platform === 'win32') {
        return openWindowsIDE(ide, targetPath, toolOpenState);
    }
    return openUnixIDE(ide, targetPath);
}
