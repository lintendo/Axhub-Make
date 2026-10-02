import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { removeOwnedServerInfoFile } from './serverInfoRecord.ts';
import type { AxhubServerInfo } from './projectCore/index.ts';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createRecord(): { infoPath: string; expected: AxhubServerInfo } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-server-info-record-'));
  tempRoots.push(root);
  const infoPath = path.join(root, '.admin-server-info.json');
  const expected: AxhubServerInfo = {
    pid: 80101,
    port: 53817,
    host: 'localhost',
    origin: 'http://localhost:53817',
    projectRoot: path.join(root, '.axhub', 'make'),
    startedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(infoPath, JSON.stringify(expected), 'utf8');
  return { infoPath, expected };
}

it('removes a record only after atomically claiming the matching file', () => {
  const { infoPath, expected } = createRecord();

  expect(removeOwnedServerInfoFile(infoPath, expected)).toBe(true);

  expect(fs.existsSync(infoPath)).toBe(false);
  expect(fs.readdirSync(path.dirname(infoPath))).toEqual([]);
});

it('preserves a replacement written immediately after the old record is claimed', () => {
  const { infoPath, expected } = createRecord();
  const replacement: AxhubServerInfo = {
    ...expected,
    pid: 80102,
    port: 53818,
    origin: 'http://localhost:53818',
    startedAt: '2026-08-14T00:00:01.000Z',
  };

  expect(removeOwnedServerInfoFile(infoPath, expected, {
    renameSync(source, destination) {
      fs.renameSync(source, destination);
      fs.writeFileSync(infoPath, JSON.stringify(replacement), 'utf8');
    },
  })).toBe(true);

  expect(JSON.parse(fs.readFileSync(infoPath, 'utf8'))).toEqual(replacement);
  expect(fs.readdirSync(path.dirname(infoPath))).toEqual([path.basename(infoPath)]);
});

it('restores a claimed record when it does not belong to the closing server', () => {
  const { infoPath, expected } = createRecord();
  const other = { ...expected, pid: 80103 };
  fs.writeFileSync(infoPath, JSON.stringify(other), 'utf8');

  expect(removeOwnedServerInfoFile(infoPath, expected)).toBe(false);

  expect(JSON.parse(fs.readFileSync(infoPath, 'utf8'))).toEqual(other);
  expect(fs.readdirSync(path.dirname(infoPath))).toEqual([path.basename(infoPath)]);
});
