import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import {
  fetchHealth,
  getGlobalAdminServerInfoPath,
  getGlobalMakeServiceLogPath,
  getGlobalMakeStateDir,
  isProcessAlive,
  normalizeHealthServerInfo,
  readServerInfo,
  type AxhubServerInfo,
} from './projectCore/index.ts';
import { DEFAULT_MAKE_SERVER_PORT } from './defaults.ts';
import { removeOwnedServerInfoFile } from './serverInfoRecord.ts';
import { withMakeServiceStartGate } from './makeServiceStartGate.ts';

const DEFAULT_START_TIMEOUT_MS = 10_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 100;

export type MakeServiceStatus = 'running' | 'stopped' | 'stale';

export interface MakeServiceInspection {
  status: MakeServiceStatus;
  info?: AxhubServerInfo;
  origin?: string;
  pid?: number;
}

export interface MakeServiceResult {
  ok: boolean;
  code: string;
  message: string;
  origin?: string;
  pid?: number;
  logFile?: string;
  reusedServer?: boolean;
}

export interface MakeServiceOptions {
  homeDir?: string;
  platform?: NodeJS.Platform;
  args?: string[];
  entryPath?: string;
  selfContainedExecutable?: boolean;
  host?: string;
  port?: number;
  logFile?: string;
  startTimeoutMs?: number;
  startLockTimeoutMs?: number;
  stopTimeoutMs?: number;
  pollIntervalMs?: number;
}

type ProcessProbe = (pid: number, signal?: NodeJS.Signals | 0) => void;

export interface MakeServiceDependencies {
  readServerInfo?: typeof readServerInfo;
  getGlobalMakeStateDir?: typeof getGlobalMakeStateDir;
  getGlobalAdminServerInfoPath?: typeof getGlobalAdminServerInfoPath;
  getGlobalMakeServiceLogPath?: typeof getGlobalMakeServiceLogPath;
  fetchHealth?: typeof fetchHealth;
  normalizeHealthServerInfo?: typeof normalizeHealthServerInfo;
  isProcessAlive?: (pid: number, probeProcess?: ProcessProbe) => boolean;
  kill?: ProcessProbe;
  spawn?: typeof spawn;
  spawnSync?: typeof spawnSync;
  mkdirSync?: typeof fs.mkdirSync;
  openSync?: typeof fs.openSync;
  closeSync?: typeof fs.closeSync;
  removeOwnedServerInfoFile?: typeof removeOwnedServerInfoFile;
  isPortAvailable?: (host: string | undefined, port: number) => Promise<boolean>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pid?: number;
}

interface ResolvedDependencies {
  readServerInfo: typeof readServerInfo;
  getGlobalMakeStateDir: typeof getGlobalMakeStateDir;
  getGlobalAdminServerInfoPath: typeof getGlobalAdminServerInfoPath;
  getGlobalMakeServiceLogPath: typeof getGlobalMakeServiceLogPath;
  fetchHealth: typeof fetchHealth;
  normalizeHealthServerInfo: typeof normalizeHealthServerInfo;
  isProcessAlive: (pid: number, probeProcess?: ProcessProbe) => boolean;
  kill: ProcessProbe;
  spawn: typeof spawn;
  spawnSync: typeof spawnSync;
  mkdirSync: typeof fs.mkdirSync;
  openSync: typeof fs.openSync;
  closeSync: typeof fs.closeSync;
  removeOwnedServerInfoFile: typeof removeOwnedServerInfoFile;
  isPortAvailable: (host: string | undefined, port: number) => Promise<boolean>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pid: number;
}

function probePortAvailability(host: string | undefined, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ port, ...(host ? { host } : {}) }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

function resolveDependencies(dependencies: MakeServiceDependencies = {}): ResolvedDependencies {
  return {
    readServerInfo,
    getGlobalMakeStateDir,
    getGlobalAdminServerInfoPath,
    getGlobalMakeServiceLogPath,
    fetchHealth,
    normalizeHealthServerInfo,
    isProcessAlive,
    kill: process.kill.bind(process),
    spawn,
    spawnSync,
    mkdirSync: fs.mkdirSync,
    openSync: fs.openSync,
    closeSync: fs.closeSync,
    removeOwnedServerInfoFile,
    isPortAvailable: probePortAvailability,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pid: process.pid,
    ...dependencies,
  };
}

function isSamePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function isMatchingAdminIdentity(
  info: AxhubServerInfo,
  projectRoot: string,
  health: unknown,
  normalize: ResolvedDependencies['normalizeHealthServerInfo'],
): boolean {
  if (!health || typeof health !== 'object') {
    return false;
  }
  const payload = health as { ok?: unknown; role?: unknown };
  const server = normalize(health);
  return payload.ok === true
    && payload.role === 'admin'
    && server !== null
    && server.pid === info.pid
    && server.port === info.port
    && server.host === info.host
    && server.origin === info.origin
    && server.startedAt === info.startedAt
    && server.timestamp === info.timestamp
    && isSamePath(info.projectRoot, projectRoot)
    && isSamePath(server.projectRoot, projectRoot);
}

function getRecordedInfo(options: MakeServiceOptions, dependencies: ResolvedDependencies): {
  projectRoot: string;
  infoPath: string;
  info: AxhubServerInfo | null;
} {
  const projectRoot = dependencies.getGlobalMakeStateDir(options.homeDir);
  return {
    projectRoot,
    infoPath: dependencies.getGlobalAdminServerInfoPath(options.homeDir),
    info: dependencies.readServerInfo(projectRoot, 'admin', { homeDir: options.homeDir }),
  };
}

export async function inspectMakeService(
  options: MakeServiceOptions = {},
  suppliedDependencies: MakeServiceDependencies = {},
): Promise<MakeServiceInspection> {
  const dependencies = resolveDependencies(suppliedDependencies);
  const { projectRoot, info } = getRecordedInfo(options, dependencies);
  if (!info) {
    return { status: 'stopped' };
  }
  if (!isSamePath(info.projectRoot, projectRoot) || !dependencies.isProcessAlive(info.pid)) {
    return { status: 'stale', info, origin: info.origin, pid: info.pid };
  }
  const health = await dependencies.fetchHealth(info.origin);
  if (!isMatchingAdminIdentity(info, projectRoot, health, dependencies.normalizeHealthServerInfo)) {
    return { status: 'stale', info, origin: info.origin, pid: info.pid };
  }
  return { status: 'running', info, origin: info.origin, pid: info.pid };
}

const SERVER_OPTIONS_WITH_VALUES = new Set([
  '--port',
  '--host',
  '--runtime-origin',
  '--admin-root',
  '--axhub-online-base-url',
  '--log-file',
]);

const SERVER_BOOLEAN_OPTIONS = new Set(['--dev']);

export function buildBackgroundServeArgs(options: Pick<MakeServiceOptions, 'args'> = {}): string[] {
  const output = ['serve'];
  const args = options.args || [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === 'open') {
      index += 1;
      continue;
    }
    if (arg === 'serve' || arg === '--background' || arg === '--json' || arg === '--restart' || arg === '--no-open') {
      continue;
    }
    if (arg === '--app-path') {
      index += 1;
      continue;
    }
    if (SERVER_BOOLEAN_OPTIONS.has(arg)) {
      output.push(arg);
      continue;
    }
    if (SERVER_OPTIONS_WITH_VALUES.has(arg)) {
      const value = args[index + 1];
      if (value && !value.startsWith('--')) {
        output.push(arg, value);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--log-file=')) {
      output.push(arg);
    }
  }
  output.push('--no-open');
  return output;
}

async function waitForInspection(
  options: MakeServiceOptions,
  dependencies: ResolvedDependencies,
  timeoutMs: number,
  shouldAbort: () => boolean = () => false,
): Promise<MakeServiceInspection | null> {
  const deadline = dependencies.now() + timeoutMs;
  do {
    const inspection = await inspectMakeService(options, dependencies);
    if (inspection.status === 'running') {
      return inspection;
    }
    if (shouldAbort()) {
      break;
    }
    if (dependencies.now() >= deadline) {
      break;
    }
    await dependencies.sleep(Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS));
  } while (true);
  return null;
}

export async function startMakeServiceInBackground(
  options: MakeServiceOptions = {},
  suppliedDependencies: MakeServiceDependencies = {},
): Promise<MakeServiceResult> {
  const dependencies = resolveDependencies(suppliedDependencies);
  const gate = await withMakeServiceStartGate({
    stateDirectory: dependencies.getGlobalMakeStateDir(options.homeDir),
    timeoutMs: options.startLockTimeoutMs,
    pollIntervalMs: options.pollIntervalMs,
  }, async (lease): Promise<MakeServiceResult> => {
    const current = await inspectMakeService(options, dependencies);
    if (current.status === 'running') {
      return {
        ok: true,
        code: 'make-running',
        message: 'Axhub Make is already running.',
        origin: current.origin,
        pid: current.pid,
        reusedServer: true,
      };
    }
    if (current.status === 'stale') {
      return {
        ok: false,
        code: 'server-identity-mismatch',
        message: 'The recorded Axhub Make server could not be identified safely.',
      };
    }

    const host = options.host ?? '0.0.0.0';
    const port = options.port ?? DEFAULT_MAKE_SERVER_PORT;
    try {
      if (!await dependencies.isPortAvailable(host, port)) {
        const raced = await inspectMakeService(options, dependencies);
        if (raced.status === 'running') {
          return {
            ok: true,
            code: 'make-running',
            message: 'Axhub Make is already running.',
            origin: raced.origin,
            pid: raced.pid,
            reusedServer: true,
          };
        }
        return {
          ok: false,
          code: 'make-port-occupied',
          message: `Axhub Make cannot start because port ${port} is already in use.`,
        };
      }
    } catch (error) {
      return {
        ok: false,
        code: 'make-start-failed',
        message: `Unable to check port ${port}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const entryPath = options.entryPath || process.argv[1];
    if (!options.selfContainedExecutable && !entryPath) {
      return {
        ok: false,
        code: 'make-start-failed',
        message: 'Unable to determine the Axhub Make CLI entry path.',
      };
    }
    const logFile = options.logFile || dependencies.getGlobalMakeServiceLogPath(options.homeDir);
    dependencies.mkdirSync(path.dirname(logFile), { recursive: true });
    const logFd = dependencies.openSync(logFile, 'a');
    let childExited = false;
    let childFailure: Error | null = null;
    try {
      const childArgs = options.selfContainedExecutable
        ? buildBackgroundServeArgs(options)
        : [...process.execArgv, entryPath!, ...buildBackgroundServeArgs(options)];
      const child = dependencies.spawn(process.execPath, childArgs, {
        detached: true,
        shell: false,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          AXHUB_MAKE_START_GATE_CLAIM: lease.entryPath,
        },
      });
      child.once?.('error', (error) => {
        childFailure = error;
      });
      child.once?.('exit', () => {
        childExited = true;
      });
      child.unref();
    } catch (error) {
      return {
        ok: false,
        code: 'make-start-failed',
        message: `Unable to start Axhub Make: ${error instanceof Error ? error.message : String(error)}`,
        logFile,
      };
    } finally {
      dependencies.closeSync(logFd);
    }

    const ready = await waitForInspection(
      options,
      dependencies,
      options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS,
      () => childExited || childFailure !== null,
    );
    if (!ready) {
      try {
        if (!await dependencies.isPortAvailable(host, port)) {
          const raced = await inspectMakeService(options, dependencies);
          if (raced.status === 'running') {
            return {
              ok: true,
              code: 'make-running',
              message: 'Axhub Make is already running.',
              origin: raced.origin,
              pid: raced.pid,
              reusedServer: true,
            };
          }
          return {
            ok: false,
            code: 'make-port-occupied',
            message: `Axhub Make cannot start because port ${port} is already in use.`,
            logFile,
          };
        }
      } catch {
        // Preserve the startup result below when a follow-up port probe is inconclusive.
      }
      if (childExited || childFailure) {
        return {
          ok: false,
          code: 'make-start-failed',
          message: childFailure
            ? `Unable to start Axhub Make: ${childFailure.message}`
            : 'Axhub Make exited before it became ready.',
          logFile,
        };
      }
      return {
        ok: false,
        code: 'make-start-timeout',
        message: 'Axhub Make did not become ready in time.',
        logFile,
      };
    }
    return {
      ok: true,
      code: 'make-started',
      message: 'Axhub Make started in the background.',
      origin: ready.origin,
      pid: ready.pid,
      logFile,
      reusedServer: false,
    };
  }, {
    isProcessAlive: dependencies.isProcessAlive,
    now: dependencies.now,
    sleep: dependencies.sleep,
    pid: dependencies.pid,
  });

  if (!gate.acquired) {
    return {
      ok: false,
      code: 'make-start-timeout',
      message: 'Timed out waiting for another Axhub Make startup to finish.',
    };
  }
  return gate.value;
}

function removeMatchingRecord(
  options: MakeServiceOptions,
  expected: AxhubServerInfo,
  dependencies: ResolvedDependencies,
): void {
  dependencies.removeOwnedServerInfoFile(
    dependencies.getGlobalAdminServerInfoPath(options.homeDir),
    expected,
  );
}

async function waitForProcessExit(
  pid: number,
  options: MakeServiceOptions,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const deadline = dependencies.now() + (options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
  do {
    if (!dependencies.isProcessAlive(pid)) {
      return true;
    }
    if (dependencies.now() >= deadline) {
      return false;
    }
    await dependencies.sleep(Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS));
  } while (true);
}

export async function stopMakeService(
  options: MakeServiceOptions = {},
  suppliedDependencies: MakeServiceDependencies = {},
): Promise<MakeServiceResult> {
  const dependencies = resolveDependencies(suppliedDependencies);
  const recorded = getRecordedInfo(options, dependencies);
  const current = await inspectMakeService(options, dependencies);
  if (current.status === 'stopped') {
    return { ok: true, code: 'make-stopped', message: 'Axhub Make is already stopped.' };
  }
  if (current.status === 'stale') {
    if (recorded.info && isSamePath(recorded.info.projectRoot, recorded.projectRoot) && !dependencies.isProcessAlive(recorded.info.pid)) {
      removeMatchingRecord(options, recorded.info, dependencies);
      return { ok: true, code: 'make-stopped', message: 'Removed a stopped Axhub Make server record.' };
    }
    return {
      ok: false,
      code: 'server-identity-mismatch',
      message: 'The recorded Axhub Make server could not be identified safely.',
    };
  }

  const rechecked = await inspectMakeService(options, dependencies);
  if (rechecked.status !== 'running' || !rechecked.info) {
    return {
      ok: false,
      code: 'server-identity-mismatch',
      message: 'The Axhub Make server identity changed before it could be stopped.',
    };
  }

  if ((options.platform || process.platform) === 'win32') {
    dependencies.spawnSync('taskkill.exe', ['/PID', String(rechecked.info.pid)], {
      shell: false,
      windowsHide: true,
      timeout: options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
    });
  } else {
    try {
      dependencies.kill(rechecked.info.pid, 'SIGTERM');
    } catch (error: any) {
      if (String(error?.code || '') !== 'ESRCH') {
        return {
          ok: false,
          code: 'make-stop-failed',
          message: `Unable to stop Axhub Make: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  if (!await waitForProcessExit(rechecked.info.pid, options, dependencies)) {
    return {
      ok: false,
      code: 'make-stop-timeout',
      message: 'Axhub Make did not exit after a graceful stop request.',
      origin: rechecked.info.origin,
      pid: rechecked.info.pid,
    };
  }
  removeMatchingRecord(options, rechecked.info, dependencies);
  return {
    ok: true,
    code: 'make-stopped',
    message: 'Axhub Make stopped.',
    origin: rechecked.info.origin,
    pid: rechecked.info.pid,
  };
}
