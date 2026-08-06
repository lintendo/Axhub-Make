import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CODEX_INTEGRATION_ASSET_FILES,
  doctorCodexIntegration,
  installCodexIntegration,
  type CodexIntegrationFileSystem,
  resolvePackageRootFromModule,
  uninstallCodexIntegration,
} from '../codexIntegration/install.ts';
import { CODEX_INTEGRATION_WINDOWS_TASK_NAME } from '../codexIntegration/paths.ts';

const tempRoots: string[] = [];

async function createTempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function createPackageFixture(): Promise<{
  packageRoot: string;
  npmExecPath: string;
  npxCliPath: string;
}> {
  const packageRoot = await createTempRoot('axhub-make-codex-package-');
  const assetRoot = path.join(packageRoot, 'bin', 'codex-integration');
  await fs.mkdir(assetRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@axhub/make',
    version: '0.6.10',
  }));
  for (const asset of CODEX_INTEGRATION_ASSET_FILES) {
    await fs.writeFile(path.join(assetRoot, asset), `asset:${asset}\n`);
  }
  const npmBin = path.join(packageRoot, 'fake-node', 'node_modules', 'npm', 'bin');
  await fs.mkdir(npmBin, { recursive: true });
  const npmExecPath = path.join(npmBin, 'npm-cli.js');
  const npxCliPath = path.join(npmBin, 'npx-cli.js');
  await fs.writeFile(npmExecPath, 'npm');
  await fs.writeFile(npxCliPath, 'npx');
  return { packageRoot, npmExecPath, npxCliPath };
}

function mapWindowsPath(hostRoot: string, value: string): string {
  if (!/^[a-z]:\\/iu.test(value)) return value;
  return path.join(hostRoot, value.replace(':', '').replaceAll('\\', '/'));
}

function createMappedWindowsFileSystem(hostRoot: string): CodexIntegrationFileSystem {
  const mapped = (value: string) => mapWindowsPath(hostRoot, value);
  return {
    access: (filePath) => fs.access(mapped(filePath)),
    copyFile: (source, destination) => fs.copyFile(mapped(source), mapped(destination)),
    mkdir: (directory, options) => fs.mkdir(mapped(directory), options),
    readFile: (filePath, encoding) => fs.readFile(mapped(filePath), encoding),
    rename: (source, destination) => fs.rename(mapped(source), mapped(destination)),
    rm: (filePath, options) => fs.rm(mapped(filePath), options),
    stat: (filePath) => fs.stat(mapped(filePath)),
    writeFile: (filePath, data, options) => fs.writeFile(mapped(filePath), data, options),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('Codex++ integration install lifecycle', () => {
  it('finds the package root from both source and bundled server module locations', async () => {
    const fixture = await createPackageFixture();

    expect(resolvePackageRootFromModule(path.join(
      fixture.packageRoot,
      'src',
      'server',
      'codexIntegration',
      'install.ts',
    ))).toBe(fixture.packageRoot);
    expect(resolvePackageRootFromModule(path.join(
      fixture.packageRoot,
      'dist',
      'server',
      'cli.mjs',
    ))).toBe(fixture.packageRoot);
  });

  it('installs and updates the macOS integration with an exact package version', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-codex-home-');
    await fs.mkdir(path.join(homeDir, 'Applications', 'Codex++.app'), { recursive: true });
    await fs.mkdir(path.join(homeDir, 'Applications', 'Codex.app'), { recursive: true });
    const calls: Array<[string, string[]]> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      return { stdout: '', stderr: '' };
    });

    const context = {
      platform: 'darwin' as const,
      homeDir,
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      uid: 501,
      now: () => new Date('2026-08-05T00:00:00.000Z'),
      run,
    };
    const legacyScript = path.join(homeDir, '.config', 'Codex++', 'user_scripts', 'axhub-make.user.js');
    await fs.mkdir(path.dirname(legacyScript), { recursive: true });
    await fs.writeFile(legacyScript, 'legacy-source\n');
    const first = await installCodexIntegration(context);
    const second = await installCodexIntegration(context);

    expect(first.installed).toBe(true);
    expect(second.installed).toBe(true);
    if (first.paths.platform !== 'darwin') throw new Error('Expected macOS integration paths');
    expect(first.warnings).toEqual([]);
    expect(first.nextAction).toMatch(/Codex\+\+/i);
    expect(first.nextAction).toMatch(/codex open/i);
    const config = JSON.parse(await fs.readFile(first.paths.configFile, 'utf8'));
    expect(config).toEqual({
      schemaVersion: 1,
      packageSpec: '@axhub/make@0.6.10',
      nodePath: process.execPath,
      npxCliPath: fixture.npxCliPath,
      debugPort: 9229,
      origin: 'http://127.0.0.1:53817',
      installedAt: '2026-08-05T00:00:00.000Z',
    });
    await expect(fs.stat(first.paths.legacyUserScriptFile)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(first.paths.sidebarSourceFile, 'utf8')).resolves.toBe('asset:axhub-make.sidebar.js\n');
    for (const asset of CODEX_INTEGRATION_ASSET_FILES) {
      await expect(fs.readFile(path.join(first.paths.installRoot, asset), 'utf8')).resolves.toBe(`asset:${asset}\n`);
    }
    await expect(fs.readFile(first.paths.serviceFile, 'utf8')).resolves.toMatch(/RunAtLoad/);
    expect(calls.some(([command, args]) => command === 'launchctl' && args[0] === 'bootstrap')).toBe(true);
  });

  it('runs the full Windows install and uninstall branches with current-user Task Scheduler', async () => {
    const fixture = await createPackageFixture();
    const hostRoot = await createTempRoot('axhub-make-codex-windows-');
    const fileSystem = createMappedWindowsFileSystem(hostRoot);
    const homeDir = String.raw`C:\Accounts\demo`;
    const localAppData = String.raw`C:\Accounts\demo\AppData\Local`;
    const appData = String.raw`C:\Accounts\demo\AppData\Roaming`;
    const nodePath = String.raw`C:\Program Files\nodejs\node.exe`;
    const npmExecPath = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
    const npxCliPath = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js`;
    for (const filePath of [nodePath, npmExecPath, npxCliPath]) {
      const hostPath = mapWindowsPath(hostRoot, filePath);
      await fs.mkdir(path.dirname(hostPath), { recursive: true });
      await fs.writeFile(hostPath, 'fixture');
    }
    const codexPlusPath = String.raw`C:\Accounts\demo\AppData\Local\Programs\Codex++\codex-plus-plus.exe`;
    await fs.mkdir(path.dirname(mapWindowsPath(hostRoot, codexPlusPath)), { recursive: true });
    await fs.writeFile(mapWindowsPath(hostRoot, codexPlusPath), 'fixture');
    const calls: Array<[string, string[]]> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      if (command === 'whoami.exe') {
        return { stdout: '"DESKTOP\\demo","S-1-5-21-1000-2000-3000-1001"\r\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const context = {
      platform: 'win32' as const,
      homeDir,
      env: { APPDATA: appData, LOCALAPPDATA: localAppData, npm_execpath: npmExecPath },
      execPath: nodePath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      now: () => new Date('2026-08-05T00:00:00.000Z'),
      run,
      fileSystem,
    };

    const result = await installCodexIntegration(context);
    if (result.paths.platform !== 'win32') throw new Error('Expected Windows integration paths');
    expect(result.warnings).toEqual([]);
    const taskXml = await fileSystem.readFile(result.paths.taskXmlFile, 'utf8');
    expect(String(taskXml)).toMatch(/LeastPrivilege/);
    expect(String(taskXml)).toContain('S-1-5-21-1000-2000-3000-1001');
    expect(calls).toContainEqual([
      'schtasks.exe',
      ['/Create', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/XML', result.paths.taskXmlFile, '/F'],
    ]);

    await uninstallCodexIntegration(context);
    await expect(fileSystem.stat(result.paths.installRoot)).rejects.toThrow();
    await expect(fileSystem.stat(result.paths.legacyUserScriptFile)).rejects.toThrow();
    expect(calls).toContainEqual([
      'schtasks.exe',
      ['/Delete', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/F'],
    ]);
  });

  it('treats an official Codex installation as a supported client when Codex++ is absent', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-codex-official-home-');
    await fs.mkdir(path.join(homeDir, 'Applications', 'Codex.app'), { recursive: true });

    const result = await installCodexIntegration({
      platform: 'darwin',
      homeDir,
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      uid: 501,
      run: vi.fn(async () => ({ stdout: '', stderr: '' })),
    });

    expect(result.warnings).toEqual([]);
    expect(result.nextAction).toMatch(/codex open/i);
  });

  it('rejects Node versions that cannot run the zero-dependency WebSocket companion', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-codex-old-node-');

    await expect(installCodexIntegration({
      platform: 'darwin',
      homeDir,
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '20.18.0',
      packageRoot: fixture.packageRoot,
      uid: 501,
      run: vi.fn(),
    })).rejects.toThrow(/Node\.js 22 or newer/);

    await expect(fs.stat(path.join(homeDir, '.config', 'Codex++', 'user_scripts', 'axhub-make.user.js'))).rejects.toThrow();
  });

  it('reports required install checks separately from optional running-state checks', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-codex-doctor-');
    await fs.mkdir(path.join(homeDir, 'Applications', 'Codex++.app'), { recursive: true });
    await fs.mkdir(path.join(homeDir, 'Applications', 'Codex.app'), { recursive: true });
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const context = {
      platform: 'darwin' as const,
      homeDir,
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      uid: 501,
      run,
      fetch: vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/api/health')) {
          return new Response(JSON.stringify({ ok: true, role: 'admin' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify([{ type: 'page', url: 'app://-/index.html' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    };
    await installCodexIntegration(context);

    const healthy = await doctorCodexIntegration(context);
    expect(healthy.ok).toBe(true);
    expect(healthy.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'assets', status: 'ok' }),
      expect.objectContaining({ id: 'service', status: 'ok' }),
      expect.objectContaining({ id: 'make', status: 'ok' }),
      expect.objectContaining({ id: 'codex-cdp', status: 'ok' }),
      expect.objectContaining({ id: 'codex-plus', status: 'ok' }),
      expect.objectContaining({ id: 'codex', status: 'ok' }),
    ]));

    await fs.rm(healthy.paths.companionFile);
    const broken = await doctorCodexIntegration(context);
    expect(broken.ok).toBe(false);
    expect(broken.checks).toContainEqual(expect.objectContaining({ id: 'assets', status: 'fail' }));
  });
});
