import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { startMakeServer } from './index.ts';
import {
  getGlobalAdminServerInfoPath,
  getGlobalMakeStateDir,
  getProjectRegistryPath,
  readServerInfo,
  writeServerInfo,
} from './projectCore/index.ts';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createRoots(prefix: string) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-root-`));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-home-`));
  tempRoots.push(projectRoot, homeDir);
  return { projectRoot, homeDir };
}

it('removes its matching admin server record on close', async () => {
  const { projectRoot, homeDir } = createRoots('axhub-make-server-clean');
  const infoPath = getGlobalAdminServerInfoPath(homeDir);
  const server = await startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: getProjectRegistryPath(homeDir),
  });

  expect(fs.existsSync(infoPath)).toBe(true);
  await server.close();

  expect(fs.existsSync(infoPath)).toBe(false);
});

it('does not remove a replacement admin record when an older server closes', async () => {
  const { projectRoot, homeDir } = createRoots('axhub-make-server-replaced');
  const globalProjectRoot = getGlobalMakeStateDir(homeDir);
  const server = await startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: getProjectRegistryPath(homeDir),
  });
  const replacement = writeServerInfo(globalProjectRoot, 'admin', {
    pid: process.pid,
    port: server.port + 1,
    host: 'localhost',
    origin: `http://localhost:${server.port + 1}`,
    projectRoot: globalProjectRoot,
    startedAt: '2026-08-14T00:00:00.000Z',
  }, { homeDir });

  await server.close();

  expect(readServerInfo(globalProjectRoot, 'admin', { homeDir })).toEqual(replacement);
});
