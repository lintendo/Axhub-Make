import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';

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
    execFile(command, args, { encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => {
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

async function defaultIsCodexRunning(platform: 'darwin' | 'win32'): Promise<boolean> {
  const command = platform === 'darwin' ? 'pgrep' : 'tasklist.exe';
  const args = platform === 'darwin'
    ? ['-x', 'Codex']
    : ['/FI', 'IMAGENAME eq Codex.exe', '/NH'];
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', windowsHide: true }, (error, stdout) => {
      if (platform === 'darwin') {
        resolve(!error && Boolean(String(stdout || '').trim()));
        return;
      }
      resolve(!error && /\bCodex\.exe\b/iu.test(String(stdout || '')));
    });
  });
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

export async function openCodexIntegration(
  context: CodexLauncherContext = {},
): Promise<OpenCodexIntegrationResult> {
  const paths = resolvePaths(context);
  const fileSystem = context.fileSystem || defaultFileSystem;
  const probeTargets = context.probeTargets || defaultProbeTargets;
  const isCodexRunning = context.isCodexRunning || defaultIsCodexRunning;
  const launch = context.launch || defaultLaunch;
  const waitFor = context.wait || wait;
  const maxAttempts = context.maxAttempts ?? 20;
  const retryDelayMs = context.retryDelayMs ?? 1000;

  try {
    if (hasAppTarget(await probeTargets(CODEX_DEBUG_PORT))) {
      return { launched: false, reused: true, appPath: '' };
    }
  } catch {
    // Treat an unreachable endpoint as a normal pre-launch state.
  }

  if (await isCodexRunning(paths.platform)) {
    throw new Error('Codex is already running without Axhub CDP. Quit Codex completely, then run axhub-make codex open again.');
  }

  const appPath = await firstExistingPath(fileSystem, paths.codexCandidates);
  if (!appPath) {
    throw new Error('Official Codex was not found in its default install location. Open Codex++ instead or install Codex first.');
  }

  const cdpArgs = [
    `--remote-debugging-port=${CODEX_DEBUG_PORT}`,
    `--remote-allow-origins=${CODEX_REMOTE_ALLOW_ORIGINS}`,
  ];
  if (paths.platform === 'darwin') {
    await launch('open', ['-n', appPath, '--args', ...cdpArgs]);
  } else {
    await launch(appPath, cdpArgs);
  }

  await waitForAppTarget({ probeTargets, waitFor, maxAttempts, retryDelayMs });
  return { launched: true, reused: false, appPath };
}
