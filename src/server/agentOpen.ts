import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

import {
  buildProjectOpenCommands,
  openProject as openAgentSurfaceProject,
  type ProjectProviderId,
} from '../../vendor/agent-surface/dist/index.js';

import {
  CLI_AGENT_APP_NAMES,
  LOCAL_APP_AGENT_APP_NAMES,
  WEB_AGENT_APP_NAMES,
  normalizeCLIAgent,
  normalizeLocalAppAgent,
  normalizeWebAgent,
  type AgentAvailabilityInfo,
  type CLIAgent,
  type LocalAppAgent,
  type WebAgent,
} from './agentTypes.ts';
import type { ToolOpenMode, ToolOpenStateEntry } from './projectCore/server-config.ts';

export type { CLIAgent, LocalAppAgent, WebAgent };
export { normalizeCLIAgent, normalizeLocalAppAgent, normalizeWebAgent };

export interface OpenAgentResult {
  success: true;
  agent: CLIAgent | LocalAppAgent | WebAgent;
  targetPath: string;
  command: string;
  serverUrl?: string;
  url?: string;
  openInBrowser?: boolean;
  openMode?: ToolOpenMode;
}

interface CommandSpec {
  command: string;
  args: string[];
  displayCommand: string;
}

interface ResolvedOpenTarget {
  targetPath: string;
  workingDirectory: string;
}

const CLI_AGENT_COMMANDS: Record<CLIAgent, CommandSpec> = {
  codex: { command: 'codex', args: [], displayCommand: 'codex' },
  claudecode: { command: 'claude', args: [], displayCommand: 'claude' },
  opencode: { command: 'opencode', args: [], displayCommand: 'opencode' },
};

const WEB_AGENT_COMMANDS: Record<WebAgent, CommandSpec> = {
  opencode: { command: '', args: [], displayCommand: '' },
  acp: { command: 'npx', args: ['@axhub/acp@latest'], displayCommand: 'npx @axhub/acp@latest' },
};

const OPENCODE_WEB_HOSTNAME = 'localhost';
const OPENCODE_WEB_DEFAULT_PORT = 4096;
const OPENCODE_WEB_MAX_PORT_PROBES = 20;
const OPENCODE_WEB_READY_TIMEOUT_MS = 15_000;
const TERMINAL_LAUNCHER_RESULT_TIMEOUT_MS = 2_000;
const OPENCODE_BUILTIN_LOCAL_CORS_ORIGIN_PREFIXES = [
  'http://localhost:',
  'http://127.0.0.1:',
];

const managedOpenCodeServers = new Map<string, {
  child: ChildProcess;
  url: string;
  targetPath: string;
  command: string;
  corsOrigin: string | null;
}>();
let managedOpenCodeCleanupHandlersInstalled = false;

function terminateManagedOpenCodeChild(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid || process.platform === 'win32') {
    child.kill();
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

function stopManagedOpenCodeServer(url: string, child: ChildProcess): void {
  const current = managedOpenCodeServers.get(url);
  if (current?.child === child) {
    managedOpenCodeServers.delete(url);
  }
  terminateManagedOpenCodeChild(child);
}

export function closeManagedOpenCodeServers(): void {
  for (const [url, server] of Array.from(managedOpenCodeServers.entries())) {
    stopManagedOpenCodeServer(url, server.child);
  }
}

function installManagedOpenCodeCleanupHandlers(): void {
  if (managedOpenCodeCleanupHandlersInstalled) {
    return;
  }
  managedOpenCodeCleanupHandlersInstalled = true;

  process.once('beforeExit', closeManagedOpenCodeServers);
  process.once('exit', closeManagedOpenCodeServers);
  process.once('SIGINT', () => {
    closeManagedOpenCodeServers();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    closeManagedOpenCodeServers();
    process.exit(143);
  });
  process.once('SIGHUP', () => {
    closeManagedOpenCodeServers();
    process.exit(129);
  });
}

function quoteForShell(value: string): string {
  return `"${String(value).replace(/["\\$`]/g, '\\$&')}"`;
}

function quoteForCmd(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

type DirectoryAppAgent = Extract<LocalAppAgent, 'trae'>;

const DIRECTORY_APP_DEFAULTS: Record<DirectoryAppAgent, {
  application: string;
  command: string;
}> = {
  trae: { application: 'Trae', command: 'trae' },
};

function isDirectoryAppAgent(agent: LocalAppAgent): agent is DirectoryAppAgent {
  return agent === 'trae';
}

function resolveMacApplication(applicationPath: string | undefined, fallback: string): string {
  const appBundleMarkerIndex = applicationPath?.indexOf('.app/') ?? -1;
  if (appBundleMarkerIndex >= 0) {
    return applicationPath!.slice(0, appBundleMarkerIndex + '.app'.length);
  }
  return applicationPath?.endsWith('.app') ? applicationPath : fallback;
}

export function buildLocalAppLaunchCommandForPlatform({
  applicationPath,
  platform = process.platform,
}: {
  applicationPath: string;
  platform?: NodeJS.Platform;
}): CommandSpec {
  const normalizedPath = applicationPath.trim();
  if (!normalizedPath) throw new Error('Application path is required.');
  if (platform === 'darwin') {
    const application = resolveMacApplication(normalizedPath, '');
    if (!application) throw new Error('macOS application path must point to an .app bundle.');
    return {
      command: 'open',
      args: ['-a', application],
      displayCommand: `open -a ${quoteForShell(application)}`,
    };
  }
  return {
    command: normalizedPath,
    args: [],
    displayCommand: normalizedPath,
  };
}

function buildDirectoryAppCommand({
  agent,
  directory,
  platform,
  applicationPath,
}: {
  agent: DirectoryAppAgent;
  directory: string;
  platform: NodeJS.Platform;
  applicationPath?: string;
}): CommandSpec {
  const defaults = DIRECTORY_APP_DEFAULTS[agent];
  if (platform === 'darwin') {
    const application = resolveMacApplication(applicationPath, defaults.application);
    return {
      command: 'open',
      args: ['-a', application, directory],
      displayCommand: `open -a ${quoteForShell(application)} ${quoteForShell(directory)}`,
    };
  }

  const command = applicationPath || defaults.command;
  return {
    command,
    args: [directory],
    displayCommand: `${command} ${quoteForShell(directory)}`,
  };
}

export function buildLocalAppOpenCommandForPlatform({
  agent,
  directory,
  platform = process.platform,
  applicationPath,
}: {
  agent: LocalAppAgent;
  directory: string;
  platform?: NodeJS.Platform;
  applicationPath?: string;
}): CommandSpec {
  if (isDirectoryAppAgent(agent)) {
    return buildDirectoryAppCommand({ agent, directory, platform, applicationPath });
  }
  const command = buildProjectOpenCommands({
    provider: agent as ProjectProviderId,
    targetPath: directory,
    appPath: applicationPath,
    platform,
  })[0];
  if (!command) throw new Error(`No project-opening command is available for ${agent}.`);
  return {
    command: command.executable,
    args: command.args,
    displayCommand: [command.executable, ...command.args].join(' '),
  };
}

export async function buildLocalAppOpenResultForPlatform({
  agent,
  directory,
  platform = process.platform,
  availability,
  preferDeeplink = false,
}: {
  agent: LocalAppAgent;
  directory: string;
  platform?: NodeJS.Platform;
  availability?: AgentAvailabilityInfo;
  preferDeeplink?: boolean;
}): Promise<Pick<OpenAgentResult, 'command' | 'url' | 'openInBrowser' | 'openMode'>> {
  if (isDirectoryAppAgent(agent)) {
    const command = buildLocalAppOpenCommandForPlatform({
      agent,
      directory,
      platform,
      applicationPath: availability?.path,
    });
    return {
      command: await spawnDetachedCommand(command, directory),
      openMode: 'direct-app',
    };
  }
  if (platform !== 'darwin' && platform !== 'win32') {
    const command = buildLocalAppOpenCommandForPlatform({
      agent,
      directory,
      platform,
      applicationPath: availability?.path,
    });
    const url = command.args.find((arg) => arg.includes('://'));
    return {
      command: await spawnDetachedCommand(command, directory),
      ...(url ? { url } : {}),
      openMode: url ? 'deeplink' : 'direct-app',
    };
  }
  const result = await openAgentSurfaceProject({
    provider: agent as ProjectProviderId,
    targetPath: directory,
    appPath: availability?.path,
    platform,
    preferDeeplink,
  });
  if (!result.ok) throw new Error(result.message);
  return {
    command: result.command || '',
    ...(result.url ? { url: result.url } : {}),
    ...(result.openInBrowser ? { openInBrowser: true } : {}),
    openMode: result.url ? 'deeplink' : 'direct-app',
  };
}

function buildUnixTerminalCommand(spec: CommandSpec, cwd: string): CommandSpec {
  const shellCommand = [
    `cd ${quoteForShell(cwd)}`,
    [spec.command, ...spec.args].map(quoteForShell).join(' '),
  ].join(' && ');
  const displayCommand = [
    `cd ${quoteForShell(cwd)}`,
    spec.displayCommand,
  ].join(' && ');

  if (process.platform === 'darwin') {
    const commandFile = path.join(
      os.tmpdir(),
      `axhub-make-cli-${Date.now()}-${Math.random().toString(36).slice(2)}.command`,
    );
    fs.writeFileSync(commandFile, [
      '#!/bin/zsh',
      'set -e',
      `cd ${quoteForShell(cwd)}`,
      [spec.command, ...spec.args].map(quoteForShell).join(' '),
      '',
    ].join('\n'), { mode: 0o700 });

    return {
      command: 'open',
      args: ['-a', 'Terminal', commandFile],
      displayCommand,
    };
  }

  if (process.env.TERM_PROGRAM === 'vscode') {
    return {
      command: 'x-terminal-emulator',
      args: ['-e', shellCommand],
      displayCommand,
    };
  }

  return {
    command: 'x-terminal-emulator',
    args: ['-e', shellCommand],
    displayCommand,
  };
}

function buildWindowsTerminalCommand(spec: CommandSpec, cwd: string): CommandSpec {
  const commandLine = [
    `cd /d ${quoteForCmd(cwd)}`,
    [spec.command, ...spec.args].map(quoteForCmd).join(' '),
  ].join(' && ');
  const displayCommand = [
    `cd /d ${quoteForCmd(cwd)}`,
    spec.displayCommand,
  ].join(' && ');
  return {
    command: 'cmd.exe',
    args: ['/d', '/k', commandLine],
    displayCommand,
  };
}

function openCommandInTerminal(spec: CommandSpec, cwd: string): Promise<OpenAgentResult['command']> {
  const terminalSpec = process.platform === 'win32'
    ? buildWindowsTerminalCommand(spec, cwd)
    : buildUnixTerminalCommand(spec, cwd);

  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = '';
    let resultTimer: NodeJS.Timeout | null = null;
    const child = spawn(terminalSpec.command, terminalSpec.args, {
      cwd,
      detached: true,
      stdio: process.platform === 'darwin' ? ['ignore', 'ignore', 'pipe'] : 'ignore',
      windowsHide: false,
      shell: false,
    });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (resultTimer) {
        clearTimeout(resultTimer);
        resultTimer = null;
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(terminalSpec.displayCommand);
    };

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.once('error', finish);
    child.once('spawn', () => {
      child.unref();
      resultTimer = setTimeout(() => finish(), TERMINAL_LAUNCHER_RESULT_TIMEOUT_MS);
    });
    child.once('close', (code) => {
      if (code && code !== 0) {
        const details = stderr.trim();
        finish(new Error(details || `Terminal launcher exited with code ${code}`));
        return;
      }
      finish();
    });
  });
}

async function isHttpServerReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(1500),
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function waitForHttpServerReady(url: string, timeoutMs = OPENCODE_WEB_READY_TIMEOUT_MS): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpServerReady(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

function encodeOpenCodeDirectory(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function buildMakeServerOpenCodeProjectPath(targetPath: string): string {
  const encodedDirectory = encodeOpenCodeDirectory(targetPath);
  return `/opencode/${encodedDirectory}`;
}

function resolveOpenTarget(targetPath: string): ResolvedOpenTarget {
  const resolvedTargetPath = path.resolve(targetPath);
  try {
    const stat = fs.statSync(resolvedTargetPath);
    if (stat.isFile()) {
      return {
        targetPath: resolvedTargetPath,
        workingDirectory: path.dirname(resolvedTargetPath),
      };
    }
  } catch {
    // Keep previous behavior for paths that do not exist yet.
  }

  return {
    targetPath: resolvedTargetPath,
    workingDirectory: resolvedTargetPath,
  };
}

function getExecutableCommand(spec: CommandSpec, availability?: AgentAvailabilityInfo): string {
  const detectedPath = availability?.status === 'installed' ? String(availability.path || '').trim() : '';
  return detectedPath || spec.command;
}

function isPortAvailable(hostname: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, hostname);
  });
}

async function resolveAvailablePort(hostname: string, preferredPort: number): Promise<number> {
  for (let offset = 0; offset < OPENCODE_WEB_MAX_PORT_PROBES; offset += 1) {
    const port = preferredPort + offset;
    if (await isPortAvailable(hostname, port)) {
      return port;
    }
  }

  return preferredPort;
}

function sanitizeCorsOrigin(value?: string | null): string | null {
  const origin = String(value || '').trim();
  if (!origin) return null;

  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return null;
  }
}

function isOpenCodeBuiltinLocalCorsOrigin(origin: string | null): boolean {
  if (!origin) return true;
  return OPENCODE_BUILTIN_LOCAL_CORS_ORIGIN_PREFIXES.some((prefix) => origin.startsWith(prefix));
}

function normalizeOpenCodeCorsOriginForReuse(origin?: string | null): string | null {
  const sanitized = sanitizeCorsOrigin(origin);
  return isOpenCodeBuiltinLocalCorsOrigin(sanitized) ? null : sanitized;
}

async function resolveWebAgentCommand(
  agent: WebAgent,
  spec: CommandSpec,
  options?: { corsOrigin?: string | null },
): Promise<CommandSpec & { url?: string }> {
  if (agent !== 'opencode') {
    return spec;
  }

  const port = await resolveAvailablePort(OPENCODE_WEB_HOSTNAME, OPENCODE_WEB_DEFAULT_PORT);
  const corsOrigin = normalizeOpenCodeCorsOriginForReuse(options?.corsOrigin);
  const corsArgs = corsOrigin ? ['--cors', corsOrigin] : [];
  const corsDisplay = corsOrigin ? ` --cors ${corsOrigin}` : '';
  return {
    ...spec,
    args: [
      ...spec.args,
      '--hostname',
      OPENCODE_WEB_HOSTNAME,
      '--port',
      String(port),
      ...corsArgs,
    ],
    displayCommand: `${spec.displayCommand} --hostname ${OPENCODE_WEB_HOSTNAME} --port ${port}${corsDisplay}`,
    url: `http://${OPENCODE_WEB_HOSTNAME}:${port}`,
  };
}

async function ensureManagedOpenCodeServer(params: {
  spec: CommandSpec & { url?: string };
  targetPath: string;
  workingDirectory: string;
  availability?: AgentAvailabilityInfo;
  corsOrigin?: string | null;
}): Promise<{ command: string; serverUrl: string; url: string }> {
  const url = params.spec.url;
  if (!url) {
    throw new Error('OpenCode server URL is missing');
  }

  const existing = managedOpenCodeServers.get(url);
  if (existing) {
    const sameCorsOrigin = existing.corsOrigin === normalizeOpenCodeCorsOriginForReuse(params.corsOrigin);
    const sameTargetPath = existing.targetPath === params.targetPath;
    const ready = await waitForHttpServerReady(url, 1500);
    if (ready && sameCorsOrigin && sameTargetPath) {
      return {
        command: existing.command,
        url: buildMakeServerOpenCodeProjectPath(params.targetPath),
        serverUrl: url,
      };
    }

    stopManagedOpenCodeServer(url, existing.child);
  }

  const executable = getExecutableCommand(params.spec, params.availability);
  const child = spawn(executable, params.spec.args, {
    cwd: params.workingDirectory,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
  child.unref();
  installManagedOpenCodeCleanupHandlers();

  const command = [
    `cd ${quoteForShell(params.workingDirectory)}`,
    params.spec.displayCommand,
  ].join(' && ');

  managedOpenCodeServers.set(url, {
    child,
    url,
    targetPath: params.targetPath,
    command,
    corsOrigin: normalizeOpenCodeCorsOriginForReuse(params.corsOrigin),
  });

  child.once('exit', () => {
    const current = managedOpenCodeServers.get(url);
    if (current?.child === child) {
      managedOpenCodeServers.delete(url);
    }
  });

  child.once('error', () => {
    const current = managedOpenCodeServers.get(url);
    if (current?.child === child) {
      managedOpenCodeServers.delete(url);
    }
  });

  const ready = await waitForHttpServerReady(url);
  if (!ready) {
    stopManagedOpenCodeServer(url, child);
    throw new Error(`OpenCode 服务启动超时: ${url}`);
  }

  return {
    command,
    url: buildMakeServerOpenCodeProjectPath(params.targetPath),
    serverUrl: url,
  };
}

async function reuseManagedOpenCodeServer(params: {
  targetPath: string;
  workingDirectory: string;
  corsOrigin?: string | null;
}): Promise<{ command: string; serverUrl: string; url: string } | null> {
  for (const [url, existing] of managedOpenCodeServers) {
    const sameCorsOrigin = existing.corsOrigin === normalizeOpenCodeCorsOriginForReuse(params.corsOrigin);
    const sameTargetPath = existing.targetPath === params.workingDirectory;
    if (!sameCorsOrigin || !sameTargetPath) {
      continue;
    }

    const ready = await waitForHttpServerReady(url, 1500);
    if (ready) {
      return {
        command: existing.command,
        serverUrl: url,
        url: buildMakeServerOpenCodeProjectPath(params.workingDirectory),
      };
    }

    stopManagedOpenCodeServer(url, existing.child);
  }

  return null;
}

export function readManagedOpenCodeServerUrl(targetPath?: string): string {
  const resolvedTargetPath = targetPath ? resolveOpenTarget(targetPath).workingDirectory : '';
  const servers = Array.from(managedOpenCodeServers.values()).reverse();
  const matched = resolvedTargetPath
    ? servers.find((server) => path.resolve(server.targetPath) === resolvedTargetPath)
    : servers[0];
  return matched?.url || '';
}

function spawnDetachedCommand(spec: CommandSpec, cwd: string): Promise<OpenAgentResult['command']> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve(spec.displayCommand);
    };

    const child = spawn(spec.command, spec.args, {
      cwd,
      detached: process.platform !== 'win32',
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });

    child.once('error', finish);
    child.once('spawn', () => {
      child.unref();
      finish();
    });
  });
}

export async function openLocalAppApplication({
  applicationPath,
  platform = process.platform,
}: {
  applicationPath: string;
  platform?: NodeJS.Platform;
}): Promise<{ command: string; openMode: 'direct-app' }> {
  const command = buildLocalAppLaunchCommandForPlatform({ applicationPath, platform });
  return {
    command: await spawnDetachedCommand(command, path.dirname(applicationPath)),
    openMode: 'direct-app',
  };
}

export async function openLocalAppAgent({
  agent,
  targetPath,
  availability,
  toolOpenState,
}: {
  agent: LocalAppAgent;
  targetPath: string;
  availability?: AgentAvailabilityInfo;
  toolOpenState?: ToolOpenStateEntry;
}): Promise<OpenAgentResult> {
  const openTarget = resolveOpenTarget(targetPath);
  const directory = openTarget.workingDirectory;
  const preferDeeplink = toolOpenState?.lastOpenMode === 'deeplink';

  if (agent !== 'trae' && (process.platform === 'darwin' || process.platform === 'win32')) {
    const open = (forceDeeplink = false) => openAgentSurfaceProject({
      provider: agent as ProjectProviderId,
      targetPath: directory,
      appPath: availability?.path || toolOpenState?.commandPath,
      preferDeeplink: forceDeeplink || preferDeeplink,
    });
    let result = await open();
    if (!result.ok && agent === 'codex' && !preferDeeplink) {
      result = await open(true);
    }
    if (!result.ok) throw new Error(result.message);
    return {
      success: true,
      agent,
      targetPath: openTarget.targetPath,
      command: result.command || '',
      ...(result.url ? { url: result.url } : {}),
      ...(result.openInBrowser ? { openInBrowser: true } : {}),
      openMode: result.url ? 'deeplink' : 'direct-app',
    };
  }

  const buildResult = (forceDeeplink = false) => buildLocalAppOpenResultForPlatform({
    agent,
    directory,
    availability,
    preferDeeplink: forceDeeplink || preferDeeplink,
  });

  const result = await buildResult();

  return {
    success: true,
    agent,
    targetPath: openTarget.targetPath,
    ...result,
  };
}

export async function openCLIAgent({
  agent,
  targetPath,
  availability,
}: {
  agent: CLIAgent;
  targetPath: string;
  availability?: AgentAvailabilityInfo;
}): Promise<OpenAgentResult> {
  const spec = CLI_AGENT_COMMANDS[agent];
  if (!spec) {
    throw new Error(`Unsupported CLI agent: ${agent}`);
  }
  const openTarget = resolveOpenTarget(targetPath);
  const command = await openCommandInTerminal({
    ...spec,
    command: getExecutableCommand(spec, availability),
  }, openTarget.workingDirectory);
  return {
    success: true,
    agent,
    targetPath: openTarget.targetPath,
    command,
  };
}

export async function openWebAgent({
  agent,
  targetPath,
  availability,
  corsOrigin: _corsOrigin,
}: {
  agent: WebAgent;
  targetPath: string;
  availability?: AgentAvailabilityInfo;
  corsOrigin?: string | null;
}): Promise<OpenAgentResult> {
  if (agent === 'opencode') {
    throw new Error('OpenCode WebUI is temporarily disabled');
  }

  const spec = WEB_AGENT_COMMANDS[agent];
  if (!spec) {
    throw new Error(`Unsupported web agent: ${agent}`);
  }
  const openTarget = resolveOpenTarget(targetPath);
  const command = await openCommandInTerminal({
    ...spec,
    command: getExecutableCommand(spec, availability),
  }, openTarget.workingDirectory);
  return {
    success: true,
    agent,
    targetPath: openTarget.targetPath,
    command,
  };
}

export function getMissingCLIAgentOpenError(agent: CLIAgent) {
  return {
    statusCode: 404,
    body: {
      error: `未检测到 ${CLI_AGENT_APP_NAMES[agent]}，请先安装后再试`,
      code: 'CLI_AGENT_MISSING',
      agent,
    },
  };
}

export function getMissingWebAgentOpenError(agent: WebAgent) {
  return {
    statusCode: 404,
    body: {
      error: `未检测到 ${WEB_AGENT_APP_NAMES[agent]}，请先安装后再试`,
      code: 'WEB_AGENT_MISSING',
      agent,
    },
  };
}

export function getMissingLocalAppOpenError(agent: LocalAppAgent) {
  return {
    statusCode: 404,
    body: {
      error: `未检测到 ${LOCAL_APP_AGENT_APP_NAMES[agent]}，请先安装后再试`,
      code: 'LOCAL_APP_AGENT_MISSING',
      agent,
    },
  };
}
