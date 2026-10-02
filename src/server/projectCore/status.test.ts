import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeServerInfoPath, readServerInfo, writeServerInfo } from './status.ts';

const tempRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('server info records', () => {
  it('publishes a complete record through an atomic rename', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-server-info-'));
    tempRoots.push(projectRoot);
    const infoPath = getRuntimeServerInfoPath(projectRoot);
    const writeFileSync = vi.spyOn(fs, 'writeFileSync');
    const renameSync = vi.spyOn(fs, 'renameSync');
    const info = {
      pid: 421,
      port: 53817,
      host: '127.0.0.1',
      origin: 'http://127.0.0.1:53817',
      projectRoot,
      startedAt: '2026-09-11T00:00:00.000Z',
    };

    writeServerInfo(projectRoot, 'runtime', info);

    const temporaryWrite = writeFileSync.mock.calls.find(([filePath]) => (
      typeof filePath === 'string' && filePath.startsWith(`${infoPath}.tmp-`)
    ));
    expect(temporaryWrite).toBeDefined();
    expect(renameSync).toHaveBeenCalledWith(temporaryWrite?.[0], infoPath);
    expect(readServerInfo(projectRoot, 'runtime')).toMatchObject(info);
    expect(fs.readdirSync(path.dirname(infoPath))).not.toEqual(expect.arrayContaining([
      expect.stringContaining('.tmp-'),
    ]));
  });
});
