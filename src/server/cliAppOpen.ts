import fs from 'node:fs';
import path from 'node:path';

import {
  closeMakeAgentSurfaceHost,
  inspectMakeAgentSurfaceHost,
  openMakeAgentSurface,
  type AgentSurfaceDesktopProvider,
} from './agentSurfaceIntegration.ts';
import type { DesktopIntegrationInspection } from './desktopClientLifecycle.ts';
import { getGlobalMakeStateDir, isProcessAlive } from './projectCore/index.ts';

export const MAKE_CLI_APP_IDS = ['codex', 'cursor', 'workbuddy', 'traework', 'qoderwork'] as const;

export type MakeCliAppId = typeof MAKE_CLI_APP_IDS[number];

const APP_PROVIDERS: Record<MakeCliAppId, AgentSurfaceDesktopProvider> = {
  codex: 'chatgpt',
  cursor: 'cursor',
  workbuddy: 'workbuddy',
  traework: 'traework',
  qoderwork: 'qoderwork',
};

const APP_LABELS: Record<MakeCliAppId, string> = {
  codex: 'Codex',
  cursor: 'Cursor',
  workbuddy: 'WorkBuddy',
  traework: 'TRAEWORK',
  qoderwork: 'QoderWork',
};

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_POLL_INTERVAL_MS = 50;

export interface MakeCliAppOpenOptions {
  app: MakeCliAppId | string;
  makeOrigin: string;
  appPath?: string;
  restart?: boolean;
  homeDir?: string;
  lockTimeoutMs?: number;
  lockPollIntervalMs?: number;
}

export interface MakeCliAppOpenResult {
  ok: boolean;
  code: string;
  message: string;
  app?: MakeCliAppId;
  provider?: AgentSurfaceDesktopProvider;
  launched?: boolean;
  reused?: boolean;
  detail?: string;
  surfaceCode?: string;
}

export interface MakeCliAppOpenDependencies {
  inspectMakeAgentSurfaceHost?: typeof inspectMakeAgentSurfaceHost;
  closeMakeAgentSurfaceHost?: typeof closeMakeAgentSurfaceHost;
  openMakeAgentSurface?: typeof openMakeAgentSurface;
  getGlobalMakeStateDir?: typeof getGlobalMakeStateDir;
  isProcessAlive?: (pid: number) => boolean;
  isInteractive?: () => boolean;
  confirmRestart?: (input: {
    app: MakeCliAppId;
    provider: AgentSurfaceDesktopProvider;
  }) => Promise<boolean>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pid?: number;
}

interface ResolvedDependencies {
  inspectMakeAgentSurfaceHost: typeof inspectMakeAgentSurfaceHost;
  closeMakeAgentSurfaceHost: typeof closeMakeAgentSurfaceHost;
  openMakeAgentSurface: typeof openMakeAgentSurface;
  getGlobalMakeStateDir: typeof getGlobalMakeStateDir;
  isProcessAlive: (pid: number) => boolean;
  isInteractive: () => boolean;
  confirmRestart?: MakeCliAppOpenDependencies['confirmRestart'];
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pid: number;
}

interface AppOpenLockRecord {
  pid: number;
  acquiredAt: number;
  token: string;
}

interface AppOpenGateEntry {
  entryPath: string;
  pid: number;
  token: string;
  ticket: number | null;
}

interface AppOpenWaitBudget {
  timeoutMs: number;
  pollIntervalMs: number;
  waitedMs: number;
}

interface AcquiredAppLock {
  lockPath: string;
  record: AppOpenLockRecord;
  gatePath: string;
}

function resolveDependencies(dependencies: MakeCliAppOpenDependencies = {}): ResolvedDependencies {
  return {
    inspectMakeAgentSurfaceHost,
    closeMakeAgentSurfaceHost,
    openMakeAgentSurface,
    getGlobalMakeStateDir,
    isProcessAlive,
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pid: process.pid,
    ...dependencies,
  };
}

export function normalizeMakeCliAppId(value: unknown): MakeCliAppId | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return MAKE_CLI_APP_IDS.includes(normalized as MakeCliAppId)
    ? normalized as MakeCliAppId
    : null;
}

function readLockRecord(lockPath: string): AppOpenLockRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<AppOpenLockRecord>;
    if (!Number.isInteger(parsed.pid) || Number(parsed.pid) <= 0 || typeof parsed.acquiredAt !== 'number') {
      return null;
    }
    return {
      pid: Number(parsed.pid),
      acquiredAt: parsed.acquiredAt,
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return null;
  }
}

function lockMatches(lockPath: string, expected: AppOpenLockRecord): boolean {
  const current = readLockRecord(lockPath);
  return current !== null
    && current.pid === expected.pid
    && current.acquiredAt === expected.acquiredAt
    && current.token === expected.token;
}

function unlinkLockFile(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch (error: any) {
    if (String(error?.code || '') !== 'ENOENT') throw error;
  }
}

function listAppOpenGateEntries(stateDirectory: string, app: MakeCliAppId): AppOpenGateEntry[] {
  const prefix = `app-open-${app}.`;
  const entries: AppOpenGateEntry[] = [];
  for (const fileName of fs.readdirSync(stateDirectory)) {
    if (!fileName.startsWith(prefix) || !fileName.endsWith('.lock')) continue;
    const parts = fileName.slice(prefix.length, -'.lock'.length).split('.');
    if (parts[0] === 'choosing' && parts.length === 3) {
      const pid = Number(parts[1]);
      if (Number.isInteger(pid) && pid > 0 && parts[2]) {
        entries.push({
          entryPath: path.join(stateDirectory, fileName),
          pid,
          token: parts[2],
          ticket: null,
        });
      }
      continue;
    }
    if (parts[0] === 'claim' && parts.length === 4) {
      const ticket = Number(parts[1]);
      const pid = Number(parts[2]);
      if (Number.isSafeInteger(ticket) && ticket > 0 && Number.isInteger(pid) && pid > 0 && parts[3]) {
        entries.push({
          entryPath: path.join(stateDirectory, fileName),
          pid,
          token: parts[3],
          ticket,
        });
      }
    }
  }
  return entries;
}

function createAppOpenGateClaim(
  stateDirectory: string,
  app: MakeCliAppId,
  dependencies: ResolvedDependencies,
): { entry: AppOpenGateEntry; record: AppOpenLockRecord } {
  const acquiredAt = dependencies.now();
  const record: AppOpenLockRecord = {
    pid: dependencies.pid,
    acquiredAt,
    token: `${dependencies.pid}-${acquiredAt}-${Math.random().toString(36).slice(2)}`,
  };
  const choosingPath = path.join(
    stateDirectory,
    `app-open-${app}.choosing.${record.pid}.${record.token}.lock`,
  );
  fs.writeFileSync(choosingPath, JSON.stringify(record), { encoding: 'utf8', flag: 'wx' });
  try {
    const ticket = listAppOpenGateEntries(stateDirectory, app).reduce(
      (maximum, entry) => Math.max(maximum, entry.ticket ?? 0),
      0,
    ) + 1;
    const entryPath = path.join(
      stateDirectory,
      `app-open-${app}.claim.${ticket}.${record.pid}.${record.token}.lock`,
    );
    fs.writeFileSync(entryPath, JSON.stringify({ ...record, ticket }), { encoding: 'utf8', flag: 'wx' });
    return {
      entry: { entryPath, pid: record.pid, token: record.token, ticket },
      record,
    };
  } finally {
    unlinkLockFile(choosingPath);
  }
}

async function waitForAppOpenPoll(
  budget: AppOpenWaitBudget,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  if (budget.waitedMs >= budget.timeoutMs) return false;
  const delayMs = Math.min(budget.pollIntervalMs, budget.timeoutMs - budget.waitedMs);
  await dependencies.sleep(delayMs);
  budget.waitedMs += delayMs;
  return true;
}

async function acquireAppOpenGate(
  stateDirectory: string,
  app: MakeCliAppId,
  budget: AppOpenWaitBudget,
  dependencies: ResolvedDependencies,
): Promise<{ entry: AppOpenGateEntry; record: AppOpenLockRecord } | null> {
  const claim = createAppOpenGateClaim(stateDirectory, app, dependencies);
  while (true) {
    let blocked = false;
    for (const entry of listAppOpenGateEntries(stateDirectory, app)) {
      if (entry.entryPath === claim.entry.entryPath) continue;
      if (!dependencies.isProcessAlive(entry.pid)) {
        unlinkLockFile(entry.entryPath);
        continue;
      }
      if (entry.ticket === null
        || entry.ticket < claim.entry.ticket!
        || (entry.ticket === claim.entry.ticket && entry.token < claim.entry.token)) {
        blocked = true;
      }
    }
    if (!blocked) return claim;
    if (!await waitForAppOpenPoll(budget, dependencies)) {
      unlinkLockFile(claim.entry.entryPath);
      return null;
    }
  }
}

function listQuarantineLocks(stateDirectory: string, app: MakeCliAppId): string[] {
  const prefix = `app-open-${app}.lock.`;
  return fs.readdirSync(stateDirectory)
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith('.quarantine'))
    .map((fileName) => path.join(stateDirectory, fileName));
}

function hasLiveQuarantineLock(
  stateDirectory: string,
  app: MakeCliAppId,
  dependencies: ResolvedDependencies,
): boolean {
  let hasLiveOwner = false;
  for (const quarantinePath of listQuarantineLocks(stateDirectory, app)) {
    const owner = readLockRecord(quarantinePath);
    if (!owner || dependencies.isProcessAlive(owner.pid)) {
      hasLiveOwner = true;
      continue;
    }
    if (lockMatches(quarantinePath, owner)) unlinkLockFile(quarantinePath);
  }
  return hasLiveOwner;
}

function removeCanonicalLock(lockPath: string, expected: AppOpenLockRecord): void {
  if (lockMatches(lockPath, expected)) unlinkLockFile(lockPath);
}

async function acquireAppLock(
  app: MakeCliAppId,
  options: MakeCliAppOpenOptions,
  dependencies: ResolvedDependencies,
): Promise<AcquiredAppLock | null> {
  const stateDirectory = dependencies.getGlobalMakeStateDir(options.homeDir);
  fs.mkdirSync(stateDirectory, { recursive: true });
  const lockPath = path.join(stateDirectory, `app-open-${app}.lock`);
  const budget: AppOpenWaitBudget = {
    timeoutMs: Math.max(0, options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS),
    pollIntervalMs: Math.max(1, options.lockPollIntervalMs ?? DEFAULT_LOCK_POLL_INTERVAL_MS),
    waitedMs: 0,
  };
  const gate = await acquireAppOpenGate(stateDirectory, app, budget, dependencies);
  if (!gate) return null;

  try {
    while (true) {
      if (hasLiveQuarantineLock(stateDirectory, app, dependencies)) {
        if (!await waitForAppOpenPoll(budget, dependencies)) return null;
        continue;
      }
      try {
        fs.writeFileSync(lockPath, JSON.stringify(gate.record), { encoding: 'utf8', flag: 'wx' });
        return { lockPath, record: gate.record, gatePath: gate.entry.entryPath };
      } catch (error: any) {
        if (String(error?.code || '') !== 'EEXIST') throw error;
      }

      const owner = readLockRecord(lockPath);
      if (owner && !dependencies.isProcessAlive(owner.pid)) {
        // The gate admits only one contender here, so this ownership check and unlink
        // cannot race another contender replacing the canonical lock.
        removeCanonicalLock(lockPath, owner);
        continue;
      }
      if (!await waitForAppOpenPoll(budget, dependencies)) return null;
    }
  } finally {
    if (!lockMatches(lockPath, gate.record)) unlinkLockFile(gate.entry.entryPath);
  }
}

function appResult(
  app: MakeCliAppId,
  provider: AgentSurfaceDesktopProvider,
  result: Omit<MakeCliAppOpenResult, 'app' | 'provider'>,
): MakeCliAppOpenResult {
  return { ...result, app, provider };
}

async function openAvailableApp(
  app: MakeCliAppId,
  provider: AgentSurfaceDesktopProvider,
  options: MakeCliAppOpenOptions,
  inspection: DesktopIntegrationInspection,
  dependencies: ResolvedDependencies,
  restarted: boolean,
): Promise<MakeCliAppOpenResult> {
  let surface;
  try {
    surface = await dependencies.openMakeAgentSurface({
      provider,
      makeOrigin: options.makeOrigin,
      ...(options.appPath ? { appPath: options.appPath } : {}),
      activate: true,
    });
  } catch (error) {
    return appResult(app, provider, {
      ok: false,
      code: 'surface-injection-failed',
      message: `Unable to open Axhub Make in ${APP_LABELS[app]}.`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (!surface.ok) {
    return appResult(app, provider, {
      ok: false,
      code: 'surface-injection-failed',
      message: `Unable to open Axhub Make in ${APP_LABELS[app]}.`,
      detail: surface.message,
      surfaceCode: surface.code,
    });
  }
  return appResult(app, provider, {
    ok: true,
    code: 'surface-opened',
    message: `Axhub Make opened in ${APP_LABELS[app]}.`,
    launched: restarted || surface.startedCommand === true || (!inspection.ready && !inspection.running),
    reused: restarted ? false : (surface.reusedHost ?? inspection.ready),
  });
}

async function openMakeCliAppWithLock(
  app: MakeCliAppId,
  provider: AgentSurfaceDesktopProvider,
  options: MakeCliAppOpenOptions,
  dependencies: ResolvedDependencies,
): Promise<MakeCliAppOpenResult> {
  let inspection: DesktopIntegrationInspection;
  try {
    inspection = await dependencies.inspectMakeAgentSurfaceHost(provider, {
      ...(options.appPath ? { appPath: options.appPath } : {}),
    });
  } catch (error) {
    return appResult(app, provider, {
      ok: false,
      code: 'app-not-installed',
      message: `${APP_LABELS[app]} could not be inspected as a supported installation.`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (inspection.appPathRequired) {
    return appResult(app, provider, {
      ok: false,
      code: 'app-path-required',
      message: `${APP_LABELS[app]} has multiple supported installations. Select one with --app-path.`,
      ...(inspection.detail ? { detail: inspection.detail } : {}),
    });
  }

  if (!inspection.installed && !inspection.ready) {
    return appResult(app, provider, {
      ok: false,
      code: 'app-not-installed',
      message: `${APP_LABELS[app]} was not found in a supported installation location.`,
    });
  }

  const requiresRestart = inspection.running && !inspection.ready;
  if (!requiresRestart) {
    return openAvailableApp(app, provider, options, inspection, dependencies, false);
  }

  if (!options.restart) {
    if (!dependencies.isInteractive() || !dependencies.confirmRestart) {
      return appResult(app, provider, {
        ok: false,
        code: 'restart-required',
        message: `${APP_LABELS[app]} must restart before Axhub Make can open in it.`,
      });
    }
    if (!await dependencies.confirmRestart({ app, provider })) {
      return appResult(app, provider, {
        ok: false,
        code: 'restart-declined',
        message: `${APP_LABELS[app]} restart was declined.`,
      });
    }
  }

  try {
    await dependencies.closeMakeAgentSurfaceHost(provider, {
      ...(options.appPath ? { appPath: options.appPath } : {}),
    });
  } catch (error) {
    return appResult(app, provider, {
      ok: false,
      code: 'app-exit-timeout',
      message: `${APP_LABELS[app]} did not exit in time.`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return openAvailableApp(app, provider, options, inspection, dependencies, true);
}

export async function openMakeCliApp(
  options: MakeCliAppOpenOptions,
  suppliedDependencies: MakeCliAppOpenDependencies = {},
): Promise<MakeCliAppOpenResult> {
  const app = normalizeMakeCliAppId(options.app);
  if (!app) {
    return {
      ok: false,
      code: 'unsupported-app',
      message: `${String(options.app)} is not a supported Axhub Make App ID.`,
    };
  }
  const provider = APP_PROVIDERS[app];
  const dependencies = resolveDependencies(suppliedDependencies);
  let lock;
  try {
    lock = await acquireAppLock(app, options, dependencies);
  } catch (error) {
    return appResult(app, provider, {
      ok: false,
      code: 'app-open-lock-failed',
      message: `Unable to coordinate opening ${APP_LABELS[app]}.`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (!lock) {
    return appResult(app, provider, {
      ok: false,
      code: 'app-open-lock-timeout',
      message: `Another ${APP_LABELS[app]} open operation did not finish in time.`,
    });
  }
  try {
    return await openMakeCliAppWithLock(app, provider, options, dependencies);
  } finally {
    try {
      removeCanonicalLock(lock.lockPath, lock.record);
    } finally {
      unlinkLockFile(lock.gatePath);
    }
  }
}
