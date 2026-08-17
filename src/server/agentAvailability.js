import fs from 'node:fs';
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { CLI_AGENT_APP_NAMES, CLI_AGENT_VALUES, LOCAL_APP_AGENT_APP_NAMES, LOCAL_APP_AGENT_VALUES, WEB_AGENT_APP_NAMES, WEB_AGENT_VALUES, } from './agentTypes.ts';
const COMMAND_AVAILABILITY_TIMEOUT_MS = 2_000;
const CLI_AGENT_COMMANDS = {
    codex: ['codex'],
    claudecode: ['claude'],
    opencode: ['opencode'],
};
const WEB_AGENT_COMMANDS = {
    opencode: [],
    acp: ['npx'],
};
const LOCAL_APP_AGENT_COMMANDS = {
    codex: ['codex'],
    opencode: ['opencode'],
    workbuddy: [],
    traework: ['trae-solo', 'trae-solo-cn'],
    qoderwork: [],
    trae: ['trae', 'trae-cn'],
};
const LOCAL_APP_AGENT_APPLICATION_PATHS = {
    codex: {
        darwin: ['/Applications/Codex.app/Contents/MacOS/Codex', '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'],
        win32: ['%LOCALAPPDATA%/Programs/Codex/Codex.exe', '%LOCALAPPDATA%/Programs/ChatGPT/ChatGPT.exe'],
    },
    opencode: {
        darwin: ['/Applications/OpenCode.app/Contents/MacOS/OpenCode'],
        win32: ['%LOCALAPPDATA%/Programs/OpenCode/OpenCode.exe'],
    },
    workbuddy: {
        darwin: ['/Applications/WorkBuddy.app/Contents/MacOS/Electron'],
        win32: ['%LOCALAPPDATA%/Programs/WorkBuddy/WorkBuddy.exe'],
    },
    traework: {
        darwin: [
            '/Applications/TRAE SOLO.app/Contents/MacOS/Electron',
            '/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron',
        ],
        win32: [
            '%LOCALAPPDATA%/Programs/TRAE SOLO/TRAE SOLO.exe',
            'C:/Program Files/TRAE SOLO/TRAE SOLO.exe',
            '%LOCALAPPDATA%/Programs/TRAE SOLO CN/TRAE SOLO CN.exe',
            'C:/Program Files/TRAE SOLO CN/TRAE SOLO CN.exe',
        ],
    },
    qoderwork: {
        darwin: [
            '/Applications/QoderWork.app/Contents/MacOS/QoderWork',
            '/Applications/QoderWork CN.app/Contents/MacOS/QoderWork CN',
        ],
        win32: [
            '%LOCALAPPDATA%/Programs/QoderWork/QoderWork.exe',
            'C:/Program Files/QoderWork/QoderWork.exe',
            '%LOCALAPPDATA%/Programs/QoderWork CN/QoderWork CN.exe',
            'C:/Program Files/QoderWork CN/QoderWork CN.exe',
        ],
    },
    trae: {
        darwin: [
            '/Applications/Trae.app/Contents/MacOS/Electron',
            '/Applications/Trae CN.app/Contents/MacOS/Electron',
        ],
        win32: [
            '%LOCALAPPDATA%/Programs/Trae/Trae.exe',
            'C:/Program Files/Trae/Trae.exe',
            '%LOCALAPPDATA%/Programs/Trae CN/Trae CN.exe',
            'C:/Program Files/Trae CN/Trae CN.exe',
        ],
    },
};
function toText(value) {
    if (!value)
        return '';
    if (Buffer.isBuffer(value))
        return value.toString('utf8');
    if (value instanceof Uint8Array)
        return Buffer.from(value).toString('utf8');
    return String(value);
}
function createInfo(status, confidence, checkedAt, details = {}) {
    return {
        status,
        confidence,
        checkedAt,
        ...details,
    };
}
function parseFirstOutputLine(output) {
    return toText(output)
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find(Boolean) || '';
}
function shellCommandForCommandLookup(command, platform) {
    return platform === 'win32'
        ? { command: 'where', args: [command] }
        : { command: process.env.SHELL || '/bin/sh', args: ['-lc', `command -v ${command}`] };
}
function resolveCommandPath(candidates, platform, spawnSync) {
    for (const candidate of candidates) {
        const normalized = candidate.trim();
        if (!normalized)
            continue;
        const spec = shellCommandForCommandLookup(normalized, platform);
        const result = spawnSync(spec.command, spec.args, {
            encoding: 'utf8',
            timeout: COMMAND_AVAILABILITY_TIMEOUT_MS,
            windowsHide: platform === 'win32',
        });
        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0)
            continue;
        const resolved = parseFirstOutputLine(result.stdout);
        if (resolved)
            return resolved;
    }
    return null;
}
function expandApplicationPath(candidate, platform) {
    if (platform === 'win32') {
        return candidate
            .replace(/^%LOCALAPPDATA%/u, process.env.LOCALAPPDATA || '%LOCALAPPDATA%')
            .replace(/^%APPDATA%/u, process.env.APPDATA || '%APPDATA%');
    }
    return candidate;
}
function resolveApplicationPath(agent, platform) {
    if (platform !== 'darwin' && platform !== 'win32')
        return null;
    return LOCAL_APP_AGENT_APPLICATION_PATHS[agent][platform]
        .map((candidate) => expandApplicationPath(candidate, platform))
        .find((candidate) => fs.existsSync(candidate)) || null;
}
export function createAgentAvailabilityDetector(options = {}) {
    const platform = options.platform ?? process.platform;
    const spawnSync = options.spawnSync ?? nodeSpawnSync;
    const getCheckedAt = options.checkedAt ?? (() => new Date().toISOString());
    const detectCommands = (commands, sourcePrefix, agentName) => {
        const checkedAt = getCheckedAt();
        try {
            const commandPath = resolveCommandPath(commands, platform, spawnSync);
            if (commandPath) {
                return createInfo('installed', 'high', checkedAt, {
                    source: `${sourcePrefix}-command`,
                    path: commandPath,
                });
            }
            return createInfo('missing', 'high', checkedAt, {
                source: `${sourcePrefix}-command`,
                reason: `${agentName} command not found`,
            });
        }
        catch (error) {
            return createInfo('unknown', 'low', checkedAt, {
                source: `${sourcePrefix}-probe-error`,
                reason: error?.message || String(error),
            });
        }
    };
    const detectCLIAgentAvailability = (agent) => (detectCommands(CLI_AGENT_COMMANDS[agent] || [], 'cli-agent', CLI_AGENT_APP_NAMES[agent]));
    const detectWebAgentAvailability = (agent) => (agent === 'opencode'
        ? createInfo('missing', 'high', getCheckedAt(), {
            source: 'web-agent-disabled',
            reason: 'OpenCode WebUI is temporarily disabled',
        })
        : detectCommands(WEB_AGENT_COMMANDS[agent] || [], 'web-agent', WEB_AGENT_APP_NAMES[agent]));
    const detectLocalAppAgentAvailability = (agent) => {
        const applicationPath = resolveApplicationPath(agent, platform);
        if (applicationPath) {
            return createInfo('installed', 'high', getCheckedAt(), {
                source: 'local-app-agent-application',
                path: applicationPath,
            });
        }
        return detectCommands(LOCAL_APP_AGENT_COMMANDS[agent] || [], 'local-app-agent', LOCAL_APP_AGENT_APP_NAMES[agent]);
    };
    const detectAllCLIAgentAvailability = () => Object.fromEntries(CLI_AGENT_VALUES.map((agent) => [agent, detectCLIAgentAvailability(agent)]));
    const detectAllWebAgentAvailability = () => Object.fromEntries(WEB_AGENT_VALUES.map((agent) => [agent, detectWebAgentAvailability(agent)]));
    const detectAllLocalAppAgentAvailability = () => Object.fromEntries(LOCAL_APP_AGENT_VALUES.map((agent) => [agent, detectLocalAppAgentAvailability(agent)]));
    const detectAllAgentAvailability = () => ({
        cli: detectAllCLIAgentAvailability(),
        localApp: detectAllLocalAppAgentAvailability(),
        web: detectAllWebAgentAvailability(),
    });
    return {
        detectCLIAgentAvailability,
        detectLocalAppAgentAvailability,
        detectWebAgentAvailability,
        detectAllCLIAgentAvailability,
        detectAllLocalAppAgentAvailability,
        detectAllWebAgentAvailability,
        detectAllAgentAvailability,
    };
}
export function detectAgentAvailabilityAtStartup() {
    return createAgentAvailabilityDetector().detectAllAgentAvailability();
}
