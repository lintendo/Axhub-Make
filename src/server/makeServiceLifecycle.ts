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

export type MakeServiceStaleReason =
  | 'record-invalid'
  | 'record-project-root-mismatch'
  | 'process-not-running'
  | 'health-unavailable'
  | 'health-not-healthy'
  | 'health-not-admin'
  | 'health-invalid'
  | 'health-identity-mismatch';

export type MakeServiceDiagnosticAction = 'restart' | 'inspect-port' | 'remove-record';

export type MakeServiceIdentityField =
  | 'pid'
  | 'port'
  | 'host'
  | 'origin'
  | 'projectRoot'
  | 'startedAt'
  | 'timestamp';

export interface MakeServiceInspection {
  status: MakeServiceStatus;
  info?: AxhubServerInfo;
  origin?: string;
  pid?: number;
  reason?: MakeServiceStaleReason;
  action?: MakeServiceDiagnosticAction;
  message?: string;
  mismatchedFields?: MakeServiceIdentityField[];
  recordPath?: string;
}

export interface MakeServiceResult {
  ok: boolean;
  code: string;
  message: string;
  origin?: string;
  pid?: number;
  logFile?: string;
  reusedServer?: boolean;
  reason?: MakeServiceStaleReason;
  action?: MakeServiceDiagnosticAction;
  mismatchedFields?: MakeServiceIdentityField[];
  recordPath?: string;
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
  existsSync?: typeof fs.existsSync;
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
  existsSync: typeof fs.existsSync;
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
    existsSync: fs.existsSync,
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

function getIdentityMismatchFields(
  info: AxhubServerInfo,
  projectRoot: string,
  server: AxhubServerInfo,
): MakeServiceIdentityField[] {
  const mismatchedFields: MakeServiceIdentityField[] = [];
  if (server.pid !== info.pid) mismatchedFields.push('pid');
  if (server.port !== info.port) mismatchedFields.push('port');
  if (server.host !== info.host) mismatchedFields.push('host');
  if (server.origin !== info.origin) mismatchedFields.push('origin');
  if (!isSamePath(server.projectRoot, projectRoot)) mismatchedFields.push('projectRoot');
  if (server.startedAt !== info.startedAt) mismatchedFields.push('startedAt');
  if (server.timestamp !== info.timestamp) mismatchedFields.push('timestamp');
  return mismatchedFields;
}

function staleInspection(
  info: AxhubServerInfo,
  recordPath: string,
  reason: MakeServiceStaleReason,
  action: MakeServiceDiagnosticAction,
  message: string,
  mismatchedFields?: MakeServiceIdentityField[],
): MakeServiceInspection {
  return {
    status: 'stale',
    info,
    origin: info.origin,
    pid: info.pid,
    reason,
    action,
    message,
    recordPath,
    ...(mismatchedFields && mismatchedFields.length > 0 ? { mismatchedFields } : {}),
  };
}

function identityMismatchResult(inspection: MakeServiceInspection): MakeServiceResult {
  return {
    ok: false,
    code: 'server-identity-mismatch',
    message: inspection.message || 'The recorded Axhub Make server could not be identified safely.',
    origin: inspection.origin,
    pid: inspection.pid,
    reason: inspection.reason,
    action: inspection.action,
    mismatchedFields: inspection.mismatchedFields,
    recordPath: inspection.recordPath,
  };
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
  const recorded = getRecordedInfo(options, dependencies);
  if (!recorded.info && dependencies.existsSync(recorded.infoPath)) {
    recorded.info = dependencies.readServerInfo(recorded.projectRoot, 'admin', { homeDir: options.homeDir });
  }
  const { projectRoot, infoPath, info } = recorded;
  if (!info) {
    if (dependencies.existsSync(infoPath)) {
      return {
        status: 'stale',
        reason: 'record-invalid',
        action: 'remove-record',
        message: `The Axhub Make server record at ${infoPath} exists but is invalid or unreadable. Remove that record before starting Make.`,
        recordPath: infoPath,
      };
    }
    return { status: 'stopped' };
  }
  if (!isSamePath(info.projectRoot, projectRoot)) {
    return staleInspection(
      info,
      infoPath,
      'record-project-root-mismatch',
      'remove-record',
      `The Axhub Make server record at ${infoPath} points to a different state directory (${info.projectRoot}). Remove that stale record before starting Make.`,
    );
  }
  if (!dependencies.isProcessAlive(info.pid)) {
    return staleInspection(
      info,
      infoPath,
      'process-not-running',
      'restart',
      `The recorded Axhub Make process (PID ${info.pid}) is no longer running. Start Make again to recreate its server record.`,
    );
  }
  const health = await dependencies.fetchHealth(info.origin);
  if (health === null) {
    return staleInspection(
      info,
      infoPath,
      'health-unavailable',
      'inspect-port',
      `PID ${info.pid} is still running, but no Axhub Make Admin health response was available at ${info.origin}. Check whether another process is using that port.`,
    );
  }
  if (!health || typeof health !== 'object') {
    return staleInspection(
      info,
      infoPath,
      'health-invalid',
      'inspect-port',
      `The service at ${info.origin} returned an invalid Axhub Make health response. Check whether another process is using that port.`,
    );
  }
  const payload = health as { ok?: unknown; role?: unknown };
  if (payload.ok !== true) {
    return staleInspection(
      info,
      infoPath,
      'health-not-healthy',
      'inspect-port',
      `The service at ${info.origin} responded, but its health check did not report ok=true. Check the process using that port.`,
    );
  }
  if (payload.role !== 'admin') {
    return staleInspection(
      info,
      infoPath,
      'health-not-admin',
      'inspect-port',
      `The service at ${info.origin} responded with role ${String(payload.role || 'unknown')}, not the Axhub Make Admin role. Check the process using that port.`,
    );
  }
  const server = dependencies.normalizeHealthServerInfo(health);
  if (!server) {
    return staleInspection(
      info,
      infoPath,
      'health-invalid',
      'inspect-port',
      `The service at ${info.origin} returned an invalid Axhub Make server identity. Check the process using that port.`,
    );
  }
  const mismatchedFields = getIdentityMismatchFields(info, projectRoot, server);
  if (mismatchedFields.length > 0) {
    return staleInspection(
      info,
      infoPath,
      'health-identity-mismatch',
      'inspect-port',
      `The service at ${info.origin} is an Axhub Make Admin server, but its identity differs from the recorded server (${mismatchedFields.join(', ')}). Check the process using that port.`,
      mismatchedFields,
    );
  }
  return { status: 'running', info, origin: info.origin, pid: info.pid };
}

/**
 * Inspect the service for a new start and recover only a provably dead record.
 * Plain inspection stays read-only so `status` can still surface identity issues.
 */
export async function inspectMakeServiceForStart(
  options: MakeServiceOptions = {},
  suppliedDependencies: MakeServiceDependencies = {},
): Promise<MakeServiceInspection> {
  const dependencies = resolveDependencies(suppliedDependencies);
  const current = await inspectMakeService(options, dependencies);
  if (current.status !== 'stale' || !current.info) {
    return current;
  }

  const projectRoot = dependencies.getGlobalMakeStateDir(options.homeDir);
  if (!isSamePath(current.info.projectRoot, projectRoot) || dependencies.isProcessAlive(current.info.pid)) {
    return current;
  }

  removeMatchingRecord(options, current.info, dependencies);
  return inspectMakeService(options, dependencies);
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
    const current = await inspectMakeServiceForStart(options, dependencies);
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
      return identityMismatchResult(current);
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
        if (raced.status === 'stale') {
          return identityMismatchResult(raced);
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
          if (raced.status === 'stale') {
            return {
              ...identityMismatchResult(raced),
              logFile,
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
    return identityMismatchResult(current);
  }

  const rechecked = await inspectMakeService(options, dependencies);
  if (rechecked.status !== 'running' || !rechecked.info) {
    if (rechecked.status === 'stale') {
      return identityMismatchResult(rechecked);
    }
    return {
      ok: false,
      code: 'server-identity-mismatch',
      message: rechecked.message || 'The Axhub Make server identity changed before it could be stopped.',
      reason: rechecked.reason,
      action: rechecked.action,
      mismatchedFields: rechecked.mismatchedFields,
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
