import fs from 'node:fs';
import { spawnSync as nodeSpawnSync } from 'node:child_process';

import {
  CLI_AGENT_APP_NAMES,
  CLI_AGENT_VALUES,
  LOCAL_APP_AGENT_APP_NAMES,
  LOCAL_APP_AGENT_VALUES,
  WEB_AGENT_APP_NAMES,
  WEB_AGENT_VALUES,
  type AgentAvailabilityInfo,
  type AgentAvailabilityMap,
  type AgentAvailabilityStatus,
  type AgentAvailabilityConfidence,
  type CLIAgent,
  type LocalAppAgent,
  type RuntimeAgentAvailability,
  type WebAgent,
} from './agentTypes.ts';

type SpawnSyncLike = (
  command: string,
  args?: readonly string[],
  options?: Record<string, unknown>,
) => {
  status?: number | null;
  stdout?: unknown;
  stderr?: unknown;
  error?: Error;
};

interface AgentAvailabilityDetectorOptions {
  platform?: NodeJS.Platform;
  spawnSync?: SpawnSyncLike;
  checkedAt?: () => string;
}

const COMMAND_AVAILABILITY_TIMEOUT_MS = 2_000;

const CLI_AGENT_COMMANDS: Record<CLIAgent, string[]> = {
  codex: ['codex'],
  claudecode: ['claude'],
  opencode: ['opencode'],
};

const WEB_AGENT_COMMANDS: Record<WebAgent, string[]> = {
  opencode: [],
  acp: ['npx'],
};

const LOCAL_APP_AGENT_COMMANDS: Record<LocalAppAgent, string[]> = {
  codex: ['codex'],
  opencode: ['opencode'],
  workbuddy: [],
  traework: ['trae-solo', 'trae-solo-cn'],
  qoderwork: [],
  trae: ['trae', 'trae-cn'],
};

const LOCAL_APP_AGENT_APPLICATION_PATHS: Record<LocalAppAgent, Record<'darwin' | 'win32', string[]>> = {
  codex: {
    darwin: [
      '/Applications/Codex.app/Contents/MacOS/Codex',
      '/Applications/Codex.app/Contents/MacOS/ChatGPT',
      '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
    ],
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

function toText(value: unknown): string {
  if (!value) return '';
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return String(value);
}

function createInfo(
  status: AgentAvailabilityStatus,
  confidence: AgentAvailabilityConfidence,
  checkedAt: string,
  details: Omit<AgentAvailabilityInfo, 'status' | 'confidence' | 'checkedAt'> = {},
): AgentAvailabilityInfo {
  return {
    status,
    confidence,
    checkedAt,
    ...details,
  };
}

function parseFirstOutputLine(output: unknown): string {
  return toText(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function shellCommandForCommandLookup(command: string, platform: NodeJS.Platform) {
  return platform === 'win32'
    ? { command: 'where', args: [command] }
    : { command: process.env.SHELL || '/bin/sh', args: ['-lc', `command -v ${command}`] };
}

function resolveCommandPath(
  candidates: string[],
  platform: NodeJS.Platform,
  spawnSync: SpawnSyncLike,
): string | null {
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) continue;

    const spec = shellCommandForCommandLookup(normalized, platform);
    const result = spawnSync(spec.command, spec.args, {
      encoding: 'utf8',
      timeout: COMMAND_AVAILABILITY_TIMEOUT_MS,
      windowsHide: platform === 'win32',
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) continue;

    const resolved = parseFirstOutputLine(result.stdout);
    if (resolved) return resolved;
  }

  return null;
}

function expandApplicationPath(candidate: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return candidate
      .replace(/^%LOCALAPPDATA%/u, process.env.LOCALAPPDATA || '%LOCALAPPDATA%')
      .replace(/^%APPDATA%/u, process.env.APPDATA || '%APPDATA%');
  }
  return candidate;
}

function resolveApplicationPath(agent: LocalAppAgent, platform: NodeJS.Platform): string | null {
  if (platform !== 'darwin' && platform !== 'win32') return null;
  return LOCAL_APP_AGENT_APPLICATION_PATHS[agent]
    [platform]
    .map((candidate) => expandApplicationPath(candidate, platform))
    .find((candidate) => fs.existsSync(candidate)) || null;
}

export function createAgentAvailabilityDetector(options: AgentAvailabilityDetectorOptions = {}) {
  const platform = options.platform ?? process.platform;
  const spawnSync = options.spawnSync ?? nodeSpawnSync;
  const getCheckedAt = options.checkedAt ?? (() => new Date().toISOString());

  const detectCommands = (
    commands: string[],
    sourcePrefix: string,
    agentName: string,
  ): AgentAvailabilityInfo => {
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
    } catch (error: any) {
      return createInfo('unknown', 'low', checkedAt, {
        source: `${sourcePrefix}-probe-error`,
        reason: error?.message || String(error),
      });
    }
  };

  const detectCLIAgentAvailability = (agent: CLIAgent): AgentAvailabilityInfo => (
    detectCommands(CLI_AGENT_COMMANDS[agent] || [], 'cli-agent', CLI_AGENT_APP_NAMES[agent])
  );

  const detectWebAgentAvailability = (agent: WebAgent): AgentAvailabilityInfo => (
    agent === 'opencode'
      ? createInfo('missing', 'high', getCheckedAt(), {
        source: 'web-agent-disabled',
        reason: 'OpenCode WebUI is temporarily disabled',
      })
      : detectCommands(WEB_AGENT_COMMANDS[agent] || [], 'web-agent', WEB_AGENT_APP_NAMES[agent])
  );

  const detectLocalAppAgentAvailability = (agent: LocalAppAgent): AgentAvailabilityInfo => {
    const applicationPath = resolveApplicationPath(agent, platform);
    if (applicationPath) {
      return createInfo('installed', 'high', getCheckedAt(), {
        source: 'local-app-agent-application',
        path: applicationPath,
      });
    }
    return detectCommands(LOCAL_APP_AGENT_COMMANDS[agent] || [], 'local-app-agent', LOCAL_APP_AGENT_APP_NAMES[agent]);
  };

  const detectAllCLIAgentAvailability = (): AgentAvailabilityMap<CLIAgent> => (
    Object.fromEntries(
      CLI_AGENT_VALUES.map((agent) => [agent, detectCLIAgentAvailability(agent)]),
    ) as AgentAvailabilityMap<CLIAgent>
  );

  const detectAllWebAgentAvailability = (): AgentAvailabilityMap<WebAgent> => (
    Object.fromEntries(
      WEB_AGENT_VALUES.map((agent) => [agent, detectWebAgentAvailability(agent)]),
    ) as AgentAvailabilityMap<WebAgent>
  );

  const detectAllLocalAppAgentAvailability = (): AgentAvailabilityMap<LocalAppAgent> => (
    Object.fromEntries(
      LOCAL_APP_AGENT_VALUES.map((agent) => [agent, detectLocalAppAgentAvailability(agent)]),
    ) as AgentAvailabilityMap<LocalAppAgent>
  );

  const detectAllAgentAvailability = (): RuntimeAgentAvailability => ({
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

export function detectAgentAvailabilityAtStartup(): RuntimeAgentAvailability {
  return createAgentAvailabilityDetector().detectAllAgentAvailability();
}
