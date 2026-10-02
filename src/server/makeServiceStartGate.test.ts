import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  isInheritedMakeServiceStartGate,
  withMakeServiceStartGate,
} from './makeServiceStartGate.ts';

const temporaryDirectories: string[] = [];

function createStateDirectory(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-service-gate-'));
  temporaryDirectories.push(root);
  return path.join(root, '.axhub', 'make');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('serializes concurrent Make startup actions and removes its claims', async () => {
  const stateDirectory = createStateDirectory();
  let active = 0;
  let maximumActive = 0;
  let actionCount = 0;
  let releaseFirst!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const action = async () => {
    actionCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (actionCount === 1) await firstMayFinish;
    active -= 1;
    return actionCount;
  };
  const options = { stateDirectory, timeoutMs: 100, pollIntervalMs: 1 };

  const first = withMakeServiceStartGate(options, action);
  const second = withMakeServiceStartGate(options, action);
  await vi.waitFor(() => expect(actionCount).toBe(1));
  releaseFirst();

  await expect(Promise.all([first, second])).resolves.toEqual([
    { acquired: true, value: 1 },
    { acquired: true, value: 2 },
  ]);
  expect(maximumActive).toBe(1);
  expect(fs.readdirSync(stateDirectory)).toEqual([]);
});

it('removes a dead unique claim without touching a live contender', async () => {
  const stateDirectory = createStateDirectory();
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(stateDirectory, 'make-start.claim.1.999999.dead-owner.lock'),
    JSON.stringify({ pid: 999999, ticket: 1 }),
    'utf8',
  );

  const result = await withMakeServiceStartGate({
    stateDirectory,
    timeoutMs: 20,
    pollIntervalMs: 1,
  }, async () => 'started', {
    isProcessAlive: (pid) => pid === process.pid,
  });

  expect(result).toEqual({ acquired: true, value: 'started' });
  expect(fs.readdirSync(stateDirectory)).toEqual([]);
});

it('bounds waiting behind a live startup claim', async () => {
  const stateDirectory = createStateDirectory();
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(stateDirectory, 'make-start.claim.1.81241.live-owner.lock'),
    JSON.stringify({ pid: 81241, ticket: 1 }),
    'utf8',
  );
  const action = vi.fn(async () => 'started');

  await expect(withMakeServiceStartGate({
    stateDirectory,
    timeoutMs: 2,
    pollIntervalMs: 1,
  }, action, {
    isProcessAlive: () => true,
    sleep: async () => {},
  })).resolves.toEqual({ acquired: false });
  expect(action).not.toHaveBeenCalled();
  expect(fs.readdirSync(stateDirectory)).toEqual([
    'make-start.claim.1.81241.live-owner.lock',
  ]);
});

it('exposes a claim that only its direct child can inherit', async () => {
  const stateDirectory = createStateDirectory();
  let claimPath = '';

  await withMakeServiceStartGate({ stateDirectory }, async (...args: any[]) => {
    claimPath = args[0]?.entryPath || '';
    expect(isInheritedMakeServiceStartGate({
      stateDirectory,
      claimPath,
      parentPid: process.pid,
    })).toBe(true);
    expect(isInheritedMakeServiceStartGate({
      stateDirectory,
      claimPath,
      parentPid: process.pid + 1,
    })).toBe(false);
    return null;
  });

  expect(claimPath).not.toBe('');
  expect(isInheritedMakeServiceStartGate({
    stateDirectory,
    claimPath,
    parentPid: process.pid,
  })).toBe(false);
});
