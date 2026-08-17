import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_FORCE_KILL_AFTER_DELAY_MS = 5_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const POSIX_GUI_PATHS = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
];
const WINDOWS_NODE_PATHS = [
    'C:\\Program Files\\nodejs',
];
export class LocalCommandError extends Error {
    code;
    exitCode;
    stdout;
    stderr;
    command;
    args;
    escapedCommand;
    constructor(message, options) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'LocalCommandError';
        this.code = options.code || 'LOCAL_COMMAND_FAILED';
        this.exitCode = options.exitCode;
        this.stdout = toText(options.stdout);
        this.stderr = toText(options.stderr);
        this.command = options.command;
        this.args = options.args;
        this.escapedCommand = options.escapedCommand || formatEscapedCommand(options.command, options.args);
    }
}
function toText(value) {
    if (typeof value === 'string')
        return value;
    if (Buffer.isBuffer(value))
        return value.toString('utf8');
    if (value instanceof Uint8Array)
        return Buffer.from(value).toString('utf8');
    return value == null ? '' : String(value);
}
function quoteCommandArg(value) {
    return `"${String(value).replace(/["\\$`]/g, '\\$&')}"`;
}
function formatEscapedCommand(command, args) {
    return [command, ...args].map(quoteCommandArg).join(' ');
}
function appendUniquePathSegment(segments, nextSegment, platform) {
    if (!nextSegment)
        return;
    const exists = segments.some((segment) => (platform === 'win32'
        ? segment.toLowerCase() === nextSegment.toLowerCase()
        : segment === nextSegment));
    if (!exists) {
        segments.push(nextSegment);
    }
}
export function buildLocalCommandEnv(options = {}) {
    const platform = options.platform || process.platform;
    const execPath = options.execPath || process.execPath;
    const env = { ...(options.env || process.env) };
    const pathApi = platform === 'win32' ? path.win32 : path.posix;
    const delimiter = platform === 'win32' ? ';' : ':';
    const pathKey = platform === 'win32' ? 'Path' : 'PATH';
    const existingPath = env[pathKey] || env.PATH || env.Path || '';
    const segments = existingPath.split(delimiter).filter(Boolean);
    appendUniquePathSegment(segments, pathApi.dirname(execPath), platform);
    if (platform === 'win32') {
        if (env.APPDATA) {
            appendUniquePathSegment(segments, path.win32.join(env.APPDATA, 'npm'), platform);
        }
        for (const executablePath of WINDOWS_NODE_PATHS) {
            appendUniquePathSegment(segments, executablePath, platform);
        }
        const pathExt = env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
        const pathExtSegments = pathExt.split(';').filter(Boolean);
        if (!pathExtSegments.some((item) => item.toLowerCase() === '.cmd')) {
            pathExtSegments.push('.CMD');
        }
        env.PATHEXT = pathExtSegments.join(';');
        delete env.PATH;
    }
    else {
        for (const executablePath of POSIX_GUI_PATHS) {
            appendUniquePathSegment(segments, executablePath, platform);
        }
        const homeDir = String(env.HOME || '').trim() || os.homedir();
        appendUniquePathSegment(segments, pathApi.join(homeDir, '.local', 'bin'), platform);
        delete env.Path;
    }
    env[pathKey] = segments.join(delimiter);
    return env;
}
function normalizeErrorCode(error) {
    if (error?.timedOut)
        return 'ETIMEDOUT';
    return String(error?.code || (typeof error?.exitCode === 'number' ? 'EXIT_CODE' : '') || 'LOCAL_COMMAND_FAILED');
}
function localDirectoryForOptions(options) {
    if (!options.preferLocal)
        return undefined;
    return options.cwd || process.cwd();
}
export async function runLocalCommand(command, args = [], options = {}) {
    const executor = options.executor || execa;
    const execaOptions = {
        cwd: options.cwd,
        env: buildLocalCommandEnv({
            platform: options.platform,
            execPath: options.execPath,
            env: options.env,
        }),
        shell: false,
        windowsHide: options.windowsHide ?? true,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        forceKillAfterDelay: DEFAULT_FORCE_KILL_AFTER_DELAY_MS,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        reject: true,
        preferLocal: options.preferLocal,
        localDir: localDirectoryForOptions(options),
    };
    try {
        const result = await executor(command, args, execaOptions);
        return {
            stdout: toText(result.stdout),
            stderr: toText(result.stderr),
            command,
            escapedCommand: result.escapedCommand || formatEscapedCommand(command, args),
        };
    }
    catch (error) {
        const stdout = toText(error?.stdout);
        const stderr = toText(error?.stderr);
        const message = String(error?.shortMessage
            || stderr
            || stdout
            || error?.message
            || `Command failed: ${formatEscapedCommand(command, args)}`).trim();
        throw new LocalCommandError(message, {
            command,
            args,
            code: normalizeErrorCode(error),
            exitCode: typeof error?.exitCode === 'number' ? error.exitCode : null,
            stdout,
            stderr,
            escapedCommand: error?.escapedCommand || formatEscapedCommand(command, args),
            cause: error,
        });
    }
}
function lookupCommandForPlatform(command, platform) {
    return platform === 'win32'
        ? { command: 'where', args: [command] }
        : { command: 'which', args: [command] };
}
export async function resolveLocalCommandPath(command, options = {}) {
    const normalized = String(command || '').trim();
    if (!normalized)
        return null;
    const platform = options.platform || process.platform;
    const lookup = lookupCommandForPlatform(normalized, platform);
    try {
        const result = await runLocalCommand(lookup.command, lookup.args, {
            ...options,
            timeoutMs: options.timeoutMs ?? 2_000,
        });
        return result.stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || null;
    }
    catch {
        return null;
    }
}
export async function commandExists(command, options = {}) {
    return Boolean(await resolveLocalCommandPath(command, options));
}
