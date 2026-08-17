import fs from 'node:fs';
import path from 'node:path';

import { isProcessAlive } from './projectCore/index.ts';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 50;

export interface MakeServiceStartGateOptions {
  stateDirectory: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface MakeServiceStartGateDependencies {
  isProcessAlive?: (pid: number) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pid?: number;
}

export type MakeServiceStartGateResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export interface MakeServiceStartGateLease {
  entryPath: string;
  pid: number;
  token: string;
  ticket: number;
}

interface ResolvedDependencies {
  isProcessAlive: (pid: number) => boolean;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pid: number;
}

interface GateEntry {
  entryPath: string;
  pid: number;
  token: string;
  ticket: number | null;
}

interface GateRecord {
  pid: number;
  token: string;
  ticket: number;
}

let claimSequence = 0;

function resolveDependencies(
  supplied: MakeServiceStartGateDependencies = {},
): ResolvedDependencies {
  return {
    isProcessAlive,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pid: process.pid,
    ...supplied,
  };
}

function removeEntry(entryPath: string): void {
  try {
    fs.unlinkSync(entryPath);
  } catch (error: any) {
    if (String(error?.code || '') !== 'ENOENT') throw error;
  }
}

function readGateRecord(entryPath: string): GateRecord | null {
  try {
    const value = JSON.parse(fs.readFileSync(entryPath, 'utf8')) as Partial<GateRecord>;
    if (!Number.isInteger(value.pid) || Number(value.pid) <= 0
      || !Number.isSafeInteger(value.ticket) || Number(value.ticket) <= 0
      || typeof value.token !== 'string' || !value.token) {
      return null;
    }
    return { pid: Number(value.pid), ticket: Number(value.ticket), token: value.token };
  } catch {
    return null;
  }
}

export function isInheritedMakeServiceStartGate({
  stateDirectory,
  claimPath,
  parentPid = process.ppid,
}: {
  stateDirectory: string;
  claimPath: string | undefined;
  parentPid?: number;
}): boolean {
  if (!claimPath || path.resolve(path.dirname(claimPath)) !== path.resolve(stateDirectory)) {
    return false;
  }
  const record = readGateRecord(claimPath);
  if (!record || record.pid !== parentPid) return false;
  return path.basename(claimPath)
    === `make-start.claim.${record.ticket}.${record.pid}.${record.token}.lock`;
}

function listEntries(stateDirectory: string): GateEntry[] {
  const prefix = 'make-start.';
  const entries: GateEntry[] = [];
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

function createClaim(
  stateDirectory: string,
  dependencies: ResolvedDependencies,
): GateEntry {
  claimSequence += 1;
  const token = [
    dependencies.pid,
    dependencies.now(),
    claimSequence,
    Math.random().toString(36).slice(2),
  ].join('-');
  const choosingPath = path.join(
    stateDirectory,
    `make-start.choosing.${dependencies.pid}.${token}.lock`,
  );
  fs.writeFileSync(choosingPath, JSON.stringify({ pid: dependencies.pid, token }), {
    encoding: 'utf8',
    flag: 'wx',
  });
  try {
    const ticket = listEntries(stateDirectory).reduce(
      (maximum, entry) => Math.max(maximum, entry.ticket ?? 0),
      0,
    ) + 1;
    const entryPath = path.join(
      stateDirectory,
      `make-start.claim.${ticket}.${dependencies.pid}.${token}.lock`,
    );
    fs.writeFileSync(entryPath, JSON.stringify({ pid: dependencies.pid, ticket, token }), {
      encoding: 'utf8',
      flag: 'wx',
    });
    return { entryPath, pid: dependencies.pid, token, ticket };
  } finally {
    removeEntry(choosingPath);
  }
}

function isEarlier(left: GateEntry, right: GateEntry): boolean {
  if (left.ticket === null) return true;
  if (left.ticket !== right.ticket) return left.ticket < right.ticket!;
  return left.token < right.token;
}

async function acquireGate(
  options: MakeServiceStartGateOptions,
  dependencies: ResolvedDependencies,
): Promise<GateEntry | null> {
  fs.mkdirSync(options.stateDirectory, { recursive: true });
  const ownClaim = createClaim(options.stateDirectory, dependencies);
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  let waitedMs = 0;

  while (true) {
    let blocked = false;
    for (const entry of listEntries(options.stateDirectory)) {
      if (entry.entryPath === ownClaim.entryPath) continue;
      if (!dependencies.isProcessAlive(entry.pid)) {
        removeEntry(entry.entryPath);
        continue;
      }
      if (isEarlier(entry, ownClaim)) blocked = true;
    }
    if (!blocked) return ownClaim;
    if (waitedMs >= timeoutMs) {
      removeEntry(ownClaim.entryPath);
      return null;
    }
    const delayMs = Math.min(pollIntervalMs, timeoutMs - waitedMs);
    await dependencies.sleep(delayMs);
    waitedMs += delayMs;
  }
}

export async function withMakeServiceStartGate<T>(
  options: MakeServiceStartGateOptions,
  action: (lease: MakeServiceStartGateLease) => Promise<T>,
  suppliedDependencies: MakeServiceStartGateDependencies = {},
): Promise<MakeServiceStartGateResult<T>> {
  const claim = await acquireGate(options, resolveDependencies(suppliedDependencies));
  if (!claim) return { acquired: false };
  try {
    return {
      acquired: true,
      value: await action({
        entryPath: claim.entryPath,
        pid: claim.pid,
        token: claim.token,
        ticket: claim.ticket!,
      }),
    };
  } finally {
    removeEntry(claim.entryPath);
  }
}
