import fs from 'node:fs';
import path from 'node:path';

import type { AxhubServerInfo } from './projectCore/index.ts';

export interface ServerInfoRecordDependencies {
  renameSync(source: string, destination: string): void;
  readFileSync(filePath: string, encoding: 'utf8'): string;
  linkSync(existingPath: string, newPath: string): void;
  unlinkSync(filePath: string): void;
  now(): number;
  pid: number;
}

let cleanupSequence = 0;

function resolveDependencies(
  supplied: Partial<ServerInfoRecordDependencies> = {},
): ServerInfoRecordDependencies {
  return {
    renameSync: fs.renameSync,
    readFileSync: (filePath, encoding) => fs.readFileSync(filePath, encoding),
    linkSync: fs.linkSync,
    unlinkSync: fs.unlinkSync,
    now: Date.now,
    pid: process.pid,
    ...supplied,
  };
}

function isSameServerInfo(left: AxhubServerInfo, right: AxhubServerInfo): boolean {
  return left.pid === right.pid
    && left.port === right.port
    && left.host === right.host
    && left.origin === right.origin
    && left.startedAt === right.startedAt
    && left.timestamp === right.timestamp
    && path.resolve(left.projectRoot) === path.resolve(right.projectRoot);
}

function readClaimedRecord(
  filePath: string,
  dependencies: ServerInfoRecordDependencies,
): AxhubServerInfo | null {
  try {
    const value = JSON.parse(dependencies.readFileSync(filePath, 'utf8'));
    return value && typeof value === 'object' ? value as AxhubServerInfo : null;
  } catch {
    return null;
  }
}

function removeFile(filePath: string, dependencies: ServerInfoRecordDependencies): void {
  try {
    dependencies.unlinkSync(filePath);
  } catch (error: any) {
    if (String(error?.code || '') !== 'ENOENT') throw error;
  }
}

function restoreClaimedRecord(
  claimedPath: string,
  canonicalPath: string,
  dependencies: ServerInfoRecordDependencies,
): void {
  try {
    dependencies.linkSync(claimedPath, canonicalPath);
  } catch (error: any) {
    if (String(error?.code || '') !== 'EEXIST') throw error;
  }
  removeFile(claimedPath, dependencies);
}

export function removeOwnedServerInfoFile(
  infoPath: string,
  expected: AxhubServerInfo,
  suppliedDependencies: Partial<ServerInfoRecordDependencies> = {},
): boolean {
  const dependencies = resolveDependencies(suppliedDependencies);
  cleanupSequence += 1;
  const claimedPath = `${infoPath}.cleanup-${dependencies.pid}-${dependencies.now()}-${cleanupSequence}`;
  try {
    dependencies.renameSync(infoPath, claimedPath);
  } catch (error: any) {
    if (String(error?.code || '') === 'ENOENT') return false;
    throw error;
  }

  const claimed = readClaimedRecord(claimedPath, dependencies);
  if (!claimed || !isSameServerInfo(claimed, expected)) {
    restoreClaimedRecord(claimedPath, infoPath, dependencies);
    return false;
  }

  removeFile(claimedPath, dependencies);
  return true;
}
