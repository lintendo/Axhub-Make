import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CURSOR_INTEGRATION_ASSET_FILES,
  doctorCursorIntegration,
  inspectCursorAgentsTarget,
  installCursorIntegration,
  type CursorIntegrationFileSystem,
  uninstallCursorIntegration,
} from '../cursorIntegration/install.ts';
import { CURSOR_INTEGRATION_WINDOWS_TASK_NAME } from '../cursorIntegration/paths.ts';

const tempRoots: string[] = [];

class FakeDiagnosticsWebSocket {
  static last: FakeDiagnosticsWebSocket | null = null;
  static lastExpression = '';
  readyState = 0;
  onopen?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;

  constructor(public readonly url: string) {
    FakeDiagnosticsWebSocket.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(raw: string) {
    const message = JSON.parse(raw) as { id: number; params?: { expression?: string } };
    FakeDiagnosticsWebSocket.lastExpression = message.params?.expression || '';
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({
      id: message.id,
      result: {
        result: {
          value: {
            launcherInstalled: true,
            entryInstalled: true,
            nativeBrowser: true,
            browserTab: true,
          },
        },
      },
    }) }));
  }

  close() {
    this.readyState = 3;
  }
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function createPackageFixture() {
  const packageRoot = await createTempRoot('axhub-make-cursor-package-');
  const assetRoot = path.join(packageRoot, 'bin', 'cursor-integration');
  await fs.mkdir(assetRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@axhub/make',
    version: '0.6.10',
  }));
  for (const asset of CURSOR_INTEGRATION_ASSET_FILES) {
    await fs.writeFile(path.join(assetRoot, asset), `asset:${asset}\n`);
  }
  const npmBin = path.join(packageRoot, 'fake-node', 'node_modules', 'npm', 'bin');
  await fs.mkdir(npmBin, { recursive: true });
  const npmExecPath = path.join(npmBin, 'npm-cli.js');
  const npxCliPath = path.join(npmBin, 'npx-cli.js');
  await fs.writeFile(npmExecPath, 'npm');
  await fs.writeFile(npxCliPath, 'npx');
  return { packageRoot, assetRoot, npmExecPath, npxCliPath };
}

function mapWindowsPath(hostRoot: string, value: string): string {
  if (!/^[a-z]:\\/iu.test(value)) return value;
  return path.join(hostRoot, value.replace(':', '').replaceAll('\\', '/'));
}

function createMappedWindowsFileSystem(hostRoot: string): CursorIntegrationFileSystem {
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

function createHostFileSystemWithoutSystemCursor(): CursorIntegrationFileSystem {
  const assertVisible = (filePath: string) => {
    if (filePath === '/Applications/Cursor.app' || filePath.startsWith('/Applications/Cursor.app/')) {
      throw Object.assign(new Error('hidden system Cursor fixture'), { code: 'ENOENT' });
    }
  };
  return {
    access: async (filePath) => {
      assertVisible(filePath);
      await fs.access(filePath);
    },
    copyFile: (source, destination) => fs.copyFile(source, destination),
    mkdir: (directory, options) => fs.mkdir(directory, options),
    readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
    rename: (source, destination) => fs.rename(source, destination),
    rm: (filePath, options) => fs.rm(filePath, options),
    stat: async (filePath) => {
      assertVisible(filePath);
      return fs.stat(filePath);
    },
    writeFile: (filePath, data, options) => fs.writeFile(filePath, data, options),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('Cursor integration install lifecycle', () => {
  it('inspects the exact Cursor Agents launcher and native Browser DOM over loopback CDP', async () => {
    const state = await inspectCursorAgentsTarget({
      id: 'agents',
      title: 'Cursor Agents',
      type: 'page',
      url: 'vscode-file://vscode-app/Applications/Cursor.app/workbench/workbench.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9230/devtools/page/agents',
    }, {
      WebSocketImpl: FakeDiagnosticsWebSocket as unknown as typeof WebSocket,
      timeoutMs: 10,
    });

    expect(state).toEqual({
      launcherInstalled: true,
      entryInstalled: true,
      nativeBrowser: true,
      browserTab: true,
    });
    expect(FakeDiagnosticsWebSocket.last?.readyState).toBe(3);
    expect(FakeDiagnosticsWebSocket.lastExpression).toContain('tab-editor-panel-group-browser-');
    await expect(inspectCursorAgentsTarget({
      webSocketDebuggerUrl: 'ws://example.com:9230/devtools/page/agents',
    }, {
      WebSocketImpl: FakeDiagnosticsWebSocket as unknown as typeof WebSocket,
      timeoutMs: 10,
    })).rejects.toThrow(/invalid debugger WebSocket/);
  });

  it('installs and updates macOS assets, config, and service idempotently', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-cursor-home-');
    const cursorApp = path.join(homeDir, 'Applications', 'Cursor.app');
    await fs.mkdir(cursorApp, { recursive: true });
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
      now: () => new Date('2026-08-06T00:00:00.000Z'),
      run,
    };

    const first = await installCursorIntegration(context);
    const second = await installCursorIntegration(context);

    expect(first.installed).toBe(true);
    expect(second.installed).toBe(true);
    if (first.paths.platform !== 'darwin') throw new Error('Expected macOS Cursor integration paths');
    expect(first.warnings).toEqual([]);
    expect(first.nextAction).toMatch(/fully quit Cursor.*npx -y @axhub\/make@latest cursor open.*click Axhub Make/is);
    expect(JSON.parse(await fs.readFile(first.paths.configFile, 'utf8'))).toEqual({
      schemaVersion: 1,
      packageSpec: '@axhub/make@0.6.10',
      nodePath: process.execPath,
      npxCliPath: fixture.npxCliPath,
      debugPort: 9230,
      origin: 'http://127.0.0.1:53817',
      installedAt: '2026-08-06T00:00:00.000Z',
    });
    for (const asset of CURSOR_INTEGRATION_ASSET_FILES) {
      await expect(fs.readFile(path.join(first.paths.installRoot, asset), 'utf8')).resolves.toBe(`asset:${asset}\n`);
    }
    await expect(fs.readFile(first.paths.serviceFile, 'utf8')).resolves.toMatch(/im\.axhub\.cursor/);
  });

  it('uses Cursor.exe argument arrays on Windows and preserves Codex-owned files on uninstall', async () => {
    const fixture = await createPackageFixture();
    const hostRoot = await createTempRoot('axhub-make-cursor-windows-');
    const fileSystem = createMappedWindowsFileSystem(hostRoot);
    const homeDir = String.raw`C:\Users\demo`;
    const localAppData = String.raw`C:\Users\demo\AppData\Local`;
    const nodePath = String.raw`C:\Program Files\nodejs\node.exe`;
    const npmExecPath = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
    const npxCliPath = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js`;
    const cursorExe = String.raw`C:\Users\demo\AppData\Local\Programs\cursor\Cursor.exe`;
    for (const filePath of [nodePath, npmExecPath, npxCliPath, cursorExe]) {
      const hostPath = mapWindowsPath(hostRoot, filePath);
      await fs.mkdir(path.dirname(hostPath), { recursive: true });
      await fs.writeFile(hostPath, 'fixture');
    }
    const codexMarker = mapWindowsPath(hostRoot, String.raw`C:\Users\demo\AppData\Local\Axhub Make\codex-integration\keep.txt`);
    await fs.mkdir(path.dirname(codexMarker), { recursive: true });
    await fs.writeFile(codexMarker, 'keep');
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
      env: { LOCALAPPDATA: localAppData, npm_execpath: npmExecPath },
      execPath: nodePath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      now: () => new Date('2026-08-06T00:00:00.000Z'),
      run,
      fileSystem,
    };

    const result = await installCursorIntegration(context);
    if (result.paths.platform !== 'win32') throw new Error('Expected Windows Cursor integration paths');
    expect(calls).toContainEqual([
      'schtasks.exe',
      ['/Create', '/TN', CURSOR_INTEGRATION_WINDOWS_TASK_NAME, '/XML', result.paths.taskXmlFile, '/F'],
    ]);

    const uninstall = await uninstallCursorIntegration(context);
    expect(uninstall.warnings).toEqual([]);
    await expect(fileSystem.stat(result.paths.installRoot)).rejects.toThrow();
    await expect(fs.readFile(codexMarker, 'utf8')).resolves.toBe('keep');
  });

  it('requires a Cursor application but no Cursor CLI', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-cursor-path-home-');
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await expect(installCursorIntegration({
      platform: 'darwin',
      homeDir,
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      uid: 501,
      run,
      fileSystem: createHostFileSystemWithoutSystemCursor(),
    })).rejects.toThrow(/Cursor was not found/);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects old Node versions before mutating the installation', async () => {
    const fixture = await createPackageFixture();
    await expect(installCursorIntegration({
      platform: 'darwin',
      homeDir: await createTempRoot('axhub-make-cursor-old-node-'),
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '20.18.0',
      packageRoot: fixture.packageRoot,
      uid: 501,
      run: vi.fn(),
    })).rejects.toThrow(/Node\.js 22 or newer/);
  });

  it('reports client, service, Make, CDP, native browser, and injection checks separately', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-cursor-doctor-');
    const cursorApp = path.join(homeDir, 'Applications', 'Cursor.app');
    await fs.mkdir(cursorApp, { recursive: true });
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
        if (String(input).endsWith('/api/health')) {
          return new Response(JSON.stringify({ ok: true, role: 'admin' }), { status: 200 });
        }
        return new Response(JSON.stringify([
          {
            id: 'agents',
            type: 'page',
            url: 'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html',
            title: 'Cursor Agents',
          },
          {
            parentId: 'agents',
            type: 'webview',
            url: 'about:blank',
            title: 'about:blank',
          },
        ]), { status: 200 });
      }),
      inspectAgentsTarget: vi.fn(async () => ({
        launcherInstalled: true,
        entryInstalled: true,
        nativeBrowser: true,
        browserTab: true,
      })),
    };
    await installCursorIntegration(context);

    const result = await doctorCursorIntegration(context);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'assets', status: 'ok' }),
      expect.objectContaining({ id: 'client', status: 'ok' }),
      expect.objectContaining({ id: 'service', status: 'ok' }),
      expect.objectContaining({ id: 'make', status: 'ok' }),
      expect.objectContaining({ id: 'cursor-cdp', status: 'ok' }),
      expect.objectContaining({ id: 'native-browser', status: 'ok' }),
      expect.objectContaining({ id: 'injection', status: 'ok' }),
    ]));
  });

  it('treats a fully absent Browser as idle and warns only for incomplete Browser DOM', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-cursor-doctor-dom-');
    await fs.mkdir(path.join(homeDir, 'Applications', 'Cursor.app'), { recursive: true });
    const inspectAgentsTarget = vi.fn(async () => ({
      launcherInstalled: false,
      entryInstalled: false,
      nativeBrowser: false,
      browserTab: false,
    }));
    const context = {
      platform: 'darwin' as const,
      homeDir,
      env: { npm_execpath: fixture.npmExecPath },
      execPath: process.execPath,
      nodeVersion: '22.21.1',
      packageRoot: fixture.packageRoot,
      uid: 501,
      run: vi.fn(async () => ({ stdout: '', stderr: '' })),
      fetch: vi.fn(async (input: string | URL) => String(input).endsWith('/api/health')
        ? new Response(JSON.stringify({ ok: true, role: 'admin' }), { status: 200 })
        : new Response(JSON.stringify([{
          id: 'agents',
          type: 'page',
          url: 'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html',
          title: 'Cursor Agents',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9230/devtools/page/agents',
        }]), { status: 200 })),
      inspectAgentsTarget,
    };
    await installCursorIntegration(context);

    const result = await doctorCursorIntegration(context);

    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'injection', status: 'warn' }),
      expect.objectContaining({ id: 'native-browser', status: 'ok' }),
    ]));

    inspectAgentsTarget.mockResolvedValueOnce({
      launcherInstalled: true,
      entryInstalled: true,
      nativeBrowser: true,
      browserTab: false,
    });
    const incompleteResult = await doctorCursorIntegration(context);

    expect(incompleteResult.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'injection', status: 'ok' }),
      expect.objectContaining({ id: 'native-browser', status: 'warn' }),
    ]));
  });

  it('keeps installed assets when service removal fails', async () => {
    const fixture = await createPackageFixture();
    const homeDir = await createTempRoot('axhub-make-cursor-uninstall-failure-');
    await fs.mkdir(path.join(homeDir, 'Applications', 'Cursor.app'), { recursive: true });
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
    };
    const installed = await installCursorIntegration(context);
    run.mockRejectedValueOnce(Object.assign(new Error('Operation not permitted'), { code: 1 }));

    await expect(uninstallCursorIntegration(context)).rejects.toThrow(/Operation not permitted/);
    await expect(fs.stat(installed.paths.installRoot)).resolves.toBeTruthy();
  });
});
