import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';

import {
  buildDesktopClientGracefulQuit,
  buildDesktopClientProcessProbe,
  type DesktopIntegrationInspection,
  waitForDesktopClientExit,
} from '../desktopClientLifecycle.ts';
import {
  type CodexIntegrationPaths,
  resolveCodexIntegrationPaths,
} from './paths.ts';

export const CODEX_DEBUG_PORT = 9229;
export const CODEX_REMOTE_ALLOW_ORIGINS = 'http://127.0.0.1:9229';

export interface CodexLauncherFileSystem {
  access(filePath: string): Promise<void>;
}

export interface CodexCdpTarget {
  id?: unknown;
  type?: unknown;
  url?: unknown;
  webSocketDebuggerUrl?: unknown;
}

export type CodexProcessRunner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
export type CodexProcessLauncher = (command: string, args: string[]) => Promise<void>;

export interface CodexLauncherContext {
  platform?: NodeJS.Platform | string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fileSystem?: CodexLauncherFileSystem;
  run?: CodexProcessRunner;
  launch?: CodexProcessLauncher;
  probeTargets?: (debugPort: number) => Promise<CodexCdpTarget[]>;
  isCodexRunning?: (platform: 'darwin' | 'win32') => Promise<boolean>;
  wait?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface OpenCodexIntegrationResult {
  launched: boolean;
  reused: boolean;
  appPath: string;
}

const defaultFileSystem: CodexLauncherFileSystem = {
  access: (filePath) => fs.access(filePath),
};

const wait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function defaultLaunch(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function defaultRun(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
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

async function defaultProbeTargets(debugPort: number): Promise<CodexCdpTarget[]> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) return [];
  const body: unknown = await response.json();
  return Array.isArray(body) ? body as CodexCdpTarget[] : [];
}

async function defaultIsCodexRunning(
  platform: 'darwin' | 'win32',
  run: CodexProcessRunner,
): Promise<boolean> {
  const probe = buildDesktopClientProcessProbe('chatgpt', platform);
  try {
    const { stdout } = await run(probe.command, probe.args);
    return platform === 'darwin'
      ? Boolean(stdout.trim())
      : /\b(?:ChatGPT|Codex)\b/iu.test(stdout);
  } catch {
    return false;
  }
}

function hasAppTarget(targets: CodexCdpTarget[]): boolean {
  return targets.some((target) => (
    target?.type === 'page'
    && typeof target.url === 'string'
    && target.url.startsWith('app://')
  ));
}

async function firstExistingPath(
  fileSystem: CodexLauncherFileSystem,
  candidates: string[],
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await fileSystem.access(candidate);
      return candidate;
    } catch {
      // Continue to the next well-known current-user install path.
    }
  }
  return null;
}

async function allPathsExist(
  fileSystem: CodexLauncherFileSystem,
  candidates: string[],
): Promise<boolean> {
  try {
    await Promise.all(candidates.map((candidate) => fileSystem.access(candidate)));
    return true;
  } catch {
    return false;
  }
}

function resolvePaths(context: CodexLauncherContext): CodexIntegrationPaths {
  return resolveCodexIntegrationPaths({
    platform: context.platform || process.platform,
    homeDir: context.homeDir || os.homedir(),
    env: context.env || process.env,
  });
}

async function waitForAppTarget({
  probeTargets,
  waitFor,
  maxAttempts,
  retryDelayMs,
}: {
  probeTargets: (debugPort: number) => Promise<CodexCdpTarget[]>;
  waitFor: (delayMs: number) => Promise<void>;
  maxAttempts: number;
  retryDelayMs: number;
}): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (hasAppTarget(await probeTargets(CODEX_DEBUG_PORT))) return;
    } catch {
      // CDP is expected to be unreachable while the app starts.
    }
    if (attempt + 1 < maxAttempts) await waitFor(retryDelayMs);
  }
  throw new Error('Official Codex did not expose an Axhub CDP target within 20 seconds. Quit Codex completely and run axhub-make codex open again.');
}

export async function inspectCodexIntegration(
  context: CodexLauncherContext = {},
): Promise<DesktopIntegrationInspection> {
  const paths = resolvePaths(context);
  const fileSystem = context.fileSystem || defaultFileSystem;
  const run = context.run || defaultRun;
  const probeTargets = context.probeTargets || defaultProbeTargets;
  const isCodexRunning = context.isCodexRunning
    || ((platform: 'darwin' | 'win32') => defaultIsCodexRunning(platform, run));

  let ready = false;
  try {
    ready = hasAppTarget(await probeTargets(CODEX_DEBUG_PORT));
  } catch {
    // An unreachable CDP endpoint means the integration is not ready.
  }
  const running = await isCodexRunning(paths.platform);
  const appPath = await firstExistingPath(fileSystem, [
    ...paths.chatgptCandidates,
    ...paths.codexCandidates,
  ]) || '';
  const integrationInstalled = await allPathsExist(fileSystem, [
    paths.configFile,
    paths.companionFile,
    paths.sidebarSourceFile,
  ]);

  return {
    platform: paths.platform,
    ready,
    running,
    installed: Boolean(appPath),
    integrationInstalled,
    appPath,
  };
}

export async function closeCodexIntegrationGracefully(
  context: CodexLauncherContext = {},
): Promise<void> {
  const paths = resolvePaths(context);
  const run = context.run || defaultRun;
  const isCodexRunning = context.isCodexRunning
    || ((platform: 'darwin' | 'win32') => defaultIsCodexRunning(platform, run));
  const quit = buildDesktopClientGracefulQuit('chatgpt', paths.platform);

  await run(quit.command, quit.args);
  const exited = await waitForDesktopClientExit({
    isRunning: () => isCodexRunning(paths.platform),
    wait: context.wait || wait,
    maxAttempts: context.maxAttempts ?? 20,
    retryDelayMs: context.retryDelayMs ?? 1000,
  });
  if (!exited) {
    throw new Error('ChatGPT 未能自动退出，请手动退出后重试。');
  }
}

export async function openCodexIntegration(
  context: CodexLauncherContext = {},
): Promise<OpenCodexIntegrationResult> {
  const inspection = await inspectCodexIntegration(context);
  const probeTargets = context.probeTargets || defaultProbeTargets;
  const launch = context.launch || defaultLaunch;
  const waitFor = context.wait || wait;
  const maxAttempts = context.maxAttempts ?? 20;
  const retryDelayMs = context.retryDelayMs ?? 1000;

  if (inspection.ready) {
    return { launched: false, reused: true, appPath: inspection.appPath };
  }
  if (inspection.running) {
    throw new Error('ChatGPT is already running without Axhub CDP.');
  }
  if (!inspection.installed) {
    throw new Error('ChatGPT was not found in a supported installation location.');
  }
  if (!inspection.integrationInstalled) {
    throw new Error('The Axhub ChatGPT integration is not installed. Run codex install first.');
  }

  const cdpArgs = [
    `--remote-debugging-port=${CODEX_DEBUG_PORT}`,
    `--remote-allow-origins=${CODEX_REMOTE_ALLOW_ORIGINS}`,
  ];
  if (inspection.platform === 'darwin') {
    await launch('open', ['-n', inspection.appPath, '--args', ...cdpArgs]);
  } else {
    await launch(inspection.appPath, cdpArgs);
  }

  await waitForAppTarget({ probeTargets, waitFor, maxAttempts, retryDelayMs });
  return { launched: true, reused: false, appPath: inspection.appPath };
}
