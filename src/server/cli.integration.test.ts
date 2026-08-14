import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runCli } from './cli.ts';
import { getGlobalAdminServerInfoPath } from './projectCore/index.ts';

const tempRoots: string[] = [];
const originalMakeHomeDir = process.env.AXHUB_MAKE_HOME_DIR;

async function reserveFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalMakeHomeDir === undefined) delete process.env.AXHUB_MAKE_HOME_DIR;
  else process.env.AXHUB_MAKE_HOME_DIR = originalMakeHomeDir;
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('prints one JSON object for a real foreground open and cleans its server record on failure', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-cli-json-'));
  tempRoots.push(homeDir);
  process.env.AXHUB_MAKE_HOME_DIR = homeDir;
  const port = await reserveFreePort();
  const stdout: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => stdout.push(args.map(String).join(' ')));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const exitCode = await runCli([
    'open',
    'cursor',
    '--json',
    '--port',
    String(port),
  ], {
    openBrowser: vi.fn(),
    openMakeCliApp: vi.fn(async () => ({
      ok: false,
      code: 'surface-injection-failed',
      message: 'Unable to inject Axhub Make.',
      app: 'cursor' as const,
    })),
  });

  expect(exitCode).toBe(1);
  expect(stdout).toHaveLength(1);
  expect(JSON.parse(stdout[0])).toMatchObject({
    ok: false,
    code: 'surface-injection-failed',
    app: 'cursor',
  });
  expect(fs.existsSync(getGlobalAdminServerInfoPath(homeDir))).toBe(false);
});
