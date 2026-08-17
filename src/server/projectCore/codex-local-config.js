import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CODEX_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_IMAGE_CONFIG = {
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    apiKey: null,
    model: CODEX_IMAGE_MODEL,
};
function dedupePaths(paths) {
    const seen = new Set();
    const result = [];
    for (const item of paths) {
        if (typeof item !== 'string' || !item.trim())
            continue;
        const key = item.trim();
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(key);
    }
    return result;
}
function splitPathList(value, delimiter = path.delimiter) {
    if (typeof value !== 'string' || !value.trim())
        return [];
    return value.split(delimiter).map((item) => item.trim()).filter(Boolean);
}
function getUnixConfigDirs(env) {
    const configuredDirs = splitPathList(env.XDG_CONFIG_DIRS, ':');
    return dedupePaths([...(configuredDirs.length ? configuredDirs : ['/etc/xdg']), '/etc']);
}
function getWindowsConfigDirs(env, homeDir) {
    return dedupePaths([
        env.APPDATA ? path.win32.join(env.APPDATA, 'Codex') : null,
        env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Codex') : null,
        env.PROGRAMDATA ? path.win32.join(env.PROGRAMDATA, 'Codex') : 'C:\\ProgramData\\Codex',
        path.win32.join(homeDir, 'AppData', 'Roaming', 'Codex'),
        path.win32.join(homeDir, 'AppData', 'Local', 'Codex'),
    ]);
}
export function createCodexLocalConfigPaths(options = {}) {
    const platform = options.platform ?? process.platform;
    const homeDir = options.homeDir ?? os.homedir();
    const env = options.env ?? process.env;
    const useWin32 = platform === 'win32';
    const pathApi = useWin32 ? path.win32 : path.posix;
    const codexHome = pathApi.join(homeDir, '.codex');
    const configuredCodexHome = typeof env.CODEX_HOME === 'string' && env.CODEX_HOME.trim()
        ? env.CODEX_HOME.trim()
        : null;
    const configDirs = [];
    if (useWin32) {
        configDirs.push(...getWindowsConfigDirs(env, homeDir));
    }
    else {
        configDirs.push(env.XDG_CONFIG_HOME
            ? pathApi.join(env.XDG_CONFIG_HOME, 'codex')
            : pathApi.join(homeDir, '.config', 'codex'));
        configDirs.push(...getUnixConfigDirs(env).map((dir) => pathApi.join(dir, 'codex')));
        if (platform === 'darwin') {
            configDirs.push('/Library/Application Support/Codex');
        }
    }
    const roots = dedupePaths([configuredCodexHome, codexHome, ...configDirs]);
    return {
        authPaths: roots.map((root) => pathApi.join(root, 'auth.json')),
        configPaths: roots.map((root) => pathApi.join(root, 'config.toml')),
    };
}
function readExistingTextFiles(paths) {
    const files = [];
    for (const filePath of paths) {
        try {
            files.push({ path: filePath, content: fs.readFileSync(filePath, 'utf8') });
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ENOENT' && code !== 'ENOTDIR')
                throw error;
        }
    }
    return files;
}
function parseTomlScalar(rawValue) {
    const value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
}
function setNestedValue(target, dottedPath, key, value) {
    let cursor = target;
    for (const segment of dottedPath) {
        if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
            cursor[segment] = {};
        }
        cursor = cursor[segment];
    }
    cursor[key] = value;
}
function parseCodexToml(content) {
    const result = {};
    let section = [];
    for (const rawLine of content.split(/\r?\n/u)) {
        const line = rawLine.replace(/\s+#.*$/u, '').trim();
        if (!line)
            continue;
        const sectionMatch = /^\[([^\]]+)\]$/u.exec(line);
        if (sectionMatch) {
            section = sectionMatch[1].split('.').map((item) => item.trim()).filter(Boolean);
            continue;
        }
        const assignmentMatch = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u.exec(line);
        if (!assignmentMatch)
            continue;
        setNestedValue(result, section, assignmentMatch[1], parseTomlScalar(assignmentMatch[2]));
    }
    return result;
}
function mergePlainObjects(base, override) {
    const next = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            next[key] &&
            typeof next[key] === 'object' &&
            !Array.isArray(next[key])) {
            next[key] = mergePlainObjects(next[key], value);
        }
        else {
            next[key] = value;
        }
    }
    return next;
}
function parseConfigFiles(files) {
    const warnings = [];
    let config = {};
    for (const file of files) {
        try {
            config = mergePlainObjects(config, parseCodexToml(file.content));
        }
        catch (error) {
            warnings.push({
                path: file.path,
                message: `Failed to parse Codex config: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    return { config, warnings };
}
function normalizeBaseUrl(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return (trimmed || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/u, '');
}
function getActiveProvider(config) {
    const providerId = typeof config.model_provider === 'string' ? config.model_provider.trim() : '';
    const providers = config.model_providers && typeof config.model_providers === 'object'
        ? config.model_providers
        : {};
    const provider = providerId ? providers[providerId] : null;
    return provider && typeof provider === 'object' ? provider : null;
}
function readApiKeyFromAuth(auth) {
    if (!auth || typeof auth !== 'object')
        return '';
    const record = auth;
    for (const key of ['OPENAI_API_KEY', 'openaiApiKey', 'api_key']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return '';
}
function readFirstAuth(authPaths) {
    const files = readExistingTextFiles(authPaths);
    for (const file of files) {
        try {
            const apiKey = readApiKeyFromAuth(JSON.parse(file.content));
            if (apiKey) {
                return { apiKey, authFile: file.path };
            }
        }
        catch {
            // Ignore malformed auth candidates and continue scanning.
        }
    }
    return { apiKey: '', authFile: files[0]?.path ?? null };
}
export function resolveCodexLocalImageGenerationConfig(options = {}) {
    const paths = options.configPaths && options.authPaths
        ? { configPaths: options.configPaths, authPaths: options.authPaths }
        : createCodexLocalConfigPaths(options);
    const configFiles = readExistingTextFiles(paths.configPaths);
    const { config, warnings } = parseConfigFiles(configFiles);
    const provider = getActiveProvider(config);
    const { apiKey, authFile } = readFirstAuth(paths.authPaths);
    const ready = Boolean(apiKey);
    return {
        ready,
        config: {
            ...DEFAULT_IMAGE_CONFIG,
            baseUrl: normalizeBaseUrl(provider?.base_url ?? config.base_url),
            apiKey: apiKey || null,
        },
        discovery: {
            configFiles: configFiles.map((file) => file.path),
            authFile,
            scannedConfigPaths: paths.configPaths,
            scannedAuthPaths: paths.authPaths,
        },
        warnings: ready
            ? warnings
            : [...warnings, { message: 'No OpenAI API key found in Codex auth files.' }],
    };
}
