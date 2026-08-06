import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';

import {
  type CursorIntegrationPaths,
  resolveCursorIntegrationPaths,
} from './paths.ts';

export const CURSOR_DEBUG_PORT = 9230;
export const CURSOR_REMOTE_ALLOW_ORIGINS = 'http://127.0.0.1:9230';

export interface CursorLauncherFileSystem {
  access(filePath: string): Promise<void>;
}

export interface CursorCdpTarget {
  id?: unknown;
  title?: unknown;
  type?: unknown;
  url?: unknown;
  webSocketDebuggerUrl?: unknown;
}

export type CursorProcessLauncher = (command: string, args: string[]) => Promise<void>;

export interface CursorLauncherContext {
  platform?: NodeJS.Platform | string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fileSystem?: CursorLauncherFileSystem;
  launch?: CursorProcessLauncher;
  probeTargets?: (debugPort: number) => Promise<CursorCdpTarget[]>;
  isCursorRunning?: (platform: 'darwin' | 'win32') => Promise<boolean>;
  wait?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface OpenCursorIntegrationResult {
  launched: boolean;
  reused: boolean;
  appPath: string;
}

const defaultFileSystem: CursorLauncherFileSystem = {
  access: (filePath) => fs.access(filePath),
};

const defaultWait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

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

async function defaultProbeTargets(debugPort: number): Promise<CursorCdpTarget[]> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) return [];
  const body: unknown = await response.json();
  return Array.isArray(body) ? body as CursorCdpTarget[] : [];
}

async function defaultIsCursorRunning(platform: 'darwin' | 'win32'): Promise<boolean> {
  const command = platform === 'darwin' ? 'pgrep' : 'tasklist.exe';
  const args = platform === 'darwin'
    ? ['-x', 'Cursor']
    : ['/FI', 'IMAGENAME eq Cursor.exe', '/NH'];
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', windowsHide: true }, (error, stdout) => {
      if (platform === 'darwin') {
        resolve(!error && Boolean(String(stdout || '').trim()));
        return;
      }
      resolve(!error && /\bCursor\.exe\b/iu.test(String(stdout || '')));
    });
  });
}

export function isCursorWorkbenchTarget(target: CursorCdpTarget): boolean {
  return target?.title === 'Cursor Agents'
    && target?.type === 'page'
    && typeof target.url === 'string'
    && target.url.startsWith('vscode-file://vscode-app/')
    && target.url.includes('/workbench/workbench.html');
}

function hasCursorWorkbenchTarget(targets: CursorCdpTarget[]): boolean {
  return targets.some(isCursorWorkbenchTarget);
}

async function firstExistingPath(
  fileSystem: CursorLauncherFileSystem,
  candidates: string[],
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await fileSystem.access(candidate);
      return candidate;
    } catch {
      // Continue through standard installation locations.
    }
  }
  return null;
}

function resolvePaths(context: CursorLauncherContext): CursorIntegrationPaths {
  return resolveCursorIntegrationPaths({
    platform: context.platform || process.platform,
    homeDir: context.homeDir || os.homedir(),
    env: context.env || process.env,
  });
}

async function waitForCursorTarget(options: {
  probeTargets: (debugPort: number) => Promise<CursorCdpTarget[]>;
  wait: (delayMs: number) => Promise<void>;
  maxAttempts: number;
  retryDelayMs: number;
}): Promise<void> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      if (hasCursorWorkbenchTarget(await options.probeTargets(CURSOR_DEBUG_PORT))) return;
    } catch {
      // The loopback endpoint is expected to be unavailable while Cursor starts.
    }
    if (attempt + 1 < options.maxAttempts) await options.wait(options.retryDelayMs);
  }
  throw new Error(
    'Cursor did not expose an Axhub CDP target within 20 seconds. Quit Cursor completely and run npx -y @axhub/make@latest cursor open again.',
  );
}

export async function openCursorIntegration(
  context: CursorLauncherContext = {},
): Promise<OpenCursorIntegrationResult> {
  const paths = resolvePaths(context);
  const fileSystem = context.fileSystem || defaultFileSystem;
  const probeTargets = context.probeTargets || defaultProbeTargets;
  const isCursorRunning = context.isCursorRunning || defaultIsCursorRunning;
  const launch = context.launch || defaultLaunch;
  const wait = context.wait || defaultWait;
  const maxAttempts = context.maxAttempts ?? 20;
  const retryDelayMs = context.retryDelayMs ?? 1000;

  try {
    if (hasCursorWorkbenchTarget(await probeTargets(CURSOR_DEBUG_PORT))) {
      return { launched: false, reused: true, appPath: '' };
    }
  } catch {
    // Treat an unreachable loopback endpoint as a normal pre-launch state.
  }

  if (await isCursorRunning(paths.platform)) {
    throw new Error(
      'Cursor is already running without Axhub CDP. Quit Cursor completely, then run npx -y @axhub/make@latest cursor open again.',
    );
  }

  const appPath = await firstExistingPath(fileSystem, paths.cursorAppCandidates);
  if (!appPath) {
    throw new Error('Cursor was not found in a standard installation location. Install Cursor first.');
  }

  const cdpArgs = [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${CURSOR_DEBUG_PORT}`,
    `--remote-allow-origins=${CURSOR_REMOTE_ALLOW_ORIGINS}`,
  ];
  if (paths.platform === 'darwin') {
    await launch('open', ['-n', appPath, '--args', ...cdpArgs]);
  } else {
    await launch(appPath, cdpArgs);
  }

  await waitForCursorTarget({ probeTargets, wait, maxAttempts, retryDelayMs });
  return { launched: true, reused: false, appPath };
}
