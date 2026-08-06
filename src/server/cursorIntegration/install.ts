import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type CodexIntegrationFileSystem,
  resolveNpxCliPath,
  resolvePackageRootFromModule,
} from '../codexIntegration/install.ts';
import {
  CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL,
  CURSOR_INTEGRATION_WINDOWS_TASK_NAME,
  type CursorIntegrationPaths,
  resolveCursorIntegrationPaths,
} from './paths.ts';
import {
  type CommandRunner,
  createLaunchAgentPlist,
  createWindowsTaskXml,
  registerBackgroundService,
  unregisterBackgroundService,
} from './service.ts';

export const CURSOR_INTEGRATION_ASSET_FILES = [
  'companion.mjs',
  'cdp-session.mjs',
  'host-protocol.mjs',
  'make-runtime.mjs',
  'axhub-make.cursor-launcher.js',
] as const;

export const CURSOR_INTEGRATION_DEBUG_PORT = 9230;
export const CURSOR_INTEGRATION_ORIGIN = 'http://127.0.0.1:53817';
const CURSOR_INTEGRATION_SCHEMA_VERSION = 1;

export type CursorIntegrationFileSystem = CodexIntegrationFileSystem;

const defaultFileSystem: CursorIntegrationFileSystem = {
  access: (filePath) => fs.access(filePath),
  copyFile: (source, destination) => fs.copyFile(source, destination),
  mkdir: (directory, options) => fs.mkdir(directory, options),
  readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
  rename: (source, destination) => fs.rename(source, destination),
  rm: (filePath, options) => fs.rm(filePath, options),
  stat: (filePath) => fs.stat(filePath),
  writeFile: (filePath, data, options) => fs.writeFile(filePath, data, options),
};

function defaultCommandRunner(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

export interface CursorIntegrationContext {
  platform?: NodeJS.Platform | string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  execPath?: string;
  nodeVersion?: string;
  packageRoot?: string;
  uid?: number;
  now?: () => Date;
  run?: CommandRunner;
  fileSystem?: CursorIntegrationFileSystem;
  fetch?: typeof globalThis.fetch;
  inspectAgentsTarget?: CursorAgentsTargetInspector;
}

export interface CursorAgentsDomState {
  launcherInstalled: boolean;
  entryInstalled: boolean;
  nativeBrowser: boolean;
  browserTab: boolean;
}

interface CursorAgentsTarget {
  id?: unknown;
  title?: unknown;
  type?: unknown;
  url?: unknown;
  webSocketDebuggerUrl?: unknown;
}

export type CursorAgentsTargetInspector = (
  target: CursorAgentsTarget,
) => Promise<CursorAgentsDomState>;

interface ResolvedCursorIntegrationContext {
  platform: NodeJS.Platform | string;
  homeDir: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  execPath: string;
  nodeVersion: string;
  packageRoot: string;
  uid?: number;
  now: () => Date;
  run: CommandRunner;
  fileSystem: CursorIntegrationFileSystem;
  fetch: typeof globalThis.fetch;
  inspectAgentsTarget: CursorAgentsTargetInspector;
}

export interface CursorIntegrationConfig {
  schemaVersion: 1;
  packageSpec: string;
  nodePath: string;
  npxCliPath: string;
  debugPort: 9230;
  origin: 'http://127.0.0.1:53817';
  installedAt: string;
}

export interface InstallCursorResult {
  installed: true;
  paths: CursorIntegrationPaths;
  config: CursorIntegrationConfig;
  warnings: string[];
  nextAction: string;
}

export type CursorDoctorCheckStatus = 'ok' | 'warn' | 'fail';

export interface CursorDoctorCheck {
  id: string;
  status: CursorDoctorCheckStatus;
  message: string;
}

export interface DoctorCursorResult {
  ok: boolean;
  paths: CursorIntegrationPaths;
  checks: CursorDoctorCheck[];
}

export interface UninstallCursorResult {
  uninstalled: true;
  paths: CursorIntegrationPaths;
  warnings: string[];
}

function resolveContext(context: CursorIntegrationContext = {}): ResolvedCursorIntegrationContext {
  return {
    platform: context.platform || process.platform,
    homeDir: context.homeDir || os.homedir(),
    env: context.env || process.env,
    execPath: context.execPath || process.execPath,
    nodeVersion: context.nodeVersion || process.versions.node,
    packageRoot: context.packageRoot || resolvePackageRootFromModule(fileURLToPath(import.meta.url)),
    uid: context.uid ?? process.getuid?.(),
    now: context.now || (() => new Date()),
    run: context.run || defaultCommandRunner,
    fileSystem: context.fileSystem || defaultFileSystem,
    fetch: context.fetch || globalThis.fetch,
    inspectAgentsTarget: context.inspectAgentsTarget || inspectCursorAgentsTarget,
  };
}

function validCursorDebuggerUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'ws:'
      && url.hostname === '127.0.0.1'
      && url.port === String(CURSOR_INTEGRATION_DEBUG_PORT)
      && url.pathname.startsWith('/devtools/page/');
  } catch {
    return false;
  }
}

export async function inspectCursorAgentsTarget(
  target: CursorAgentsTarget,
  options: {
    WebSocketImpl?: typeof WebSocket;
    timeoutMs?: number;
  } = {},
): Promise<CursorAgentsDomState> {
  if (!validCursorDebuggerUrl(target.webSocketDebuggerUrl)) {
    throw new Error('Cursor Agents target returned an invalid debugger WebSocket URL.');
  }
  const WebSocketImpl = options.WebSocketImpl || WebSocket;
  const socket = new WebSocketImpl(target.webSocketDebuggerUrl);
  const timeoutMs = options.timeoutMs ?? 1500;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cursor Agents debugger connection timed out.')), timeoutMs);
      socket.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Unable to connect to the Cursor Agents debugger target.'));
      };
    });
    const result = await new Promise<CursorAgentsDomState>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cursor Agents DOM inspection timed out.')), timeoutMs);
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          id?: unknown;
          error?: { message?: unknown };
          result?: { result?: { value?: unknown } };
        };
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) {
          reject(new Error(String(message.error.message || 'Cursor DOM inspection failed.')));
          return;
        }
        const value = message.result?.result?.value as Partial<CursorAgentsDomState> | undefined;
        resolve({
          launcherInstalled: value?.launcherInstalled === true,
          entryInstalled: value?.entryInstalled === true,
          nativeBrowser: value?.nativeBrowser === true,
          browserTab: value?.browserTab === true,
        });
      };
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => ({
            launcherInstalled: Boolean(window.__axhubMakeCursorLauncherInstalled),
            entryInstalled: Boolean(document.getElementById('axhub-make-cursor-entry')),
            nativeBrowser: Boolean(document.querySelector('webview[partition="persist:cursor-browser"]')),
            browserTab: Boolean(
              document.getElementById('tab-editor-panel-group-glass-flat-browser-new-tab')
              || document.querySelector('[role="tab"][aria-controls$="glass-flat-browser-new-tab"]')
              || document.querySelector('[role="tab"][id^="tab-editor-panel-group-browser-"]')
              || document.querySelector('[role="tab"][aria-controls^="tabpanel-editor-panel-group-browser-"]')
            ),
          }))()`,
          returnByValue: true,
        },
      }));
    });
    return result;
  } finally {
    if (socket.readyState < 2) socket.close();
  }
}

function pathApiForPlatform(platform: NodeJS.Platform | string): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

async function isFile(fileSystem: CursorIntegrationFileSystem, filePath: string): Promise<boolean> {
  try {
    return (await fileSystem.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function pathExists(fileSystem: CursorIntegrationFileSystem, filePath: string): Promise<boolean> {
  try {
    await fileSystem.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertNodeVersion(nodeVersion: string): void {
  const major = Number(nodeVersion.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    throw new Error(`Node.js 22 or newer is required for the Cursor companion (found ${nodeVersion}).`);
  }
}

async function writeAtomicText(
  fileSystem: CursorIntegrationFileSystem,
  pathApi: typeof path.posix | typeof path.win32,
  destination: string,
  content: string,
): Promise<void> {
  await fileSystem.mkdir(pathApi.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fileSystem.writeFile(temporary, content, { encoding: 'utf8', mode: 0o644 });
    await fileSystem.rename(temporary, destination);
  } catch (error) {
    await fileSystem.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function copyAtomic(
  fileSystem: CursorIntegrationFileSystem,
  pathApi: typeof path.posix | typeof path.win32,
  source: string,
  destination: string,
): Promise<void> {
  await fileSystem.mkdir(pathApi.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fileSystem.copyFile(source, temporary);
    await fileSystem.rename(temporary, destination);
  } catch (error) {
    await fileSystem.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readPackageVersion(context: ResolvedCursorIntegrationContext): Promise<string> {
  const metadata = JSON.parse(await context.fileSystem.readFile(
    path.join(context.packageRoot, 'package.json'),
    'utf8',
  )) as { name?: unknown; version?: unknown };
  if (metadata.name !== '@axhub/make' || typeof metadata.version !== 'string' || !metadata.version.trim()) {
    throw new Error(`Expected a versioned @axhub/make package at ${context.packageRoot}.`);
  }
  return metadata.version.trim();
}

function parseWindowsUserSid(output: string): string {
  const match = output.match(/S-\d-(?:\d+-)+\d+/u);
  if (!match) throw new Error('Unable to determine the current Windows user SID.');
  return match[0];
}

async function resolveWindowsUserSid(run: CommandRunner): Promise<string> {
  return parseWindowsUserSid((await run('whoami.exe', ['/user', '/fo', 'csv', '/nh'])).stdout);
}

async function anyPathExists(
  fileSystem: CursorIntegrationFileSystem,
  candidates: string[],
): Promise<boolean> {
  for (const candidate of candidates) {
    if (await pathExists(fileSystem, candidate)) return true;
  }
  return false;
}

function isValidConfig(value: unknown): value is CursorIntegrationConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<CursorIntegrationConfig>;
  return config.schemaVersion === CURSOR_INTEGRATION_SCHEMA_VERSION
    && /^@axhub\/make@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(config.packageSpec || '')
    && typeof config.nodePath === 'string'
    && typeof config.npxCliPath === 'string'
    && config.debugPort === CURSOR_INTEGRATION_DEBUG_PORT
    && config.origin === CURSOR_INTEGRATION_ORIGIN
    && typeof config.installedAt === 'string';
}

async function readInstalledConfig(
  fileSystem: CursorIntegrationFileSystem,
  configFile: string,
): Promise<CursorIntegrationConfig | null> {
  try {
    const value: unknown = JSON.parse(await fileSystem.readFile(configFile, 'utf8'));
    return isValidConfig(value) ? value : null;
  } catch {
    return null;
  }
}

async function probeJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
): Promise<{ ok: boolean; body?: unknown }> {
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return { ok: false };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false };
  }
}

export async function installCursorIntegration(
  inputContext: CursorIntegrationContext = {},
): Promise<InstallCursorResult> {
  const context = resolveContext(inputContext);
  assertNodeVersion(context.nodeVersion);
  const paths = resolveCursorIntegrationPaths(context);
  const pathApi = pathApiForPlatform(paths.platform);
  if (!await isFile(context.fileSystem, context.execPath)) {
    throw new Error(`Node.js executable was not found at ${context.execPath}.`);
  }
  const npxCliPath = await resolveNpxCliPath({
    platform: paths.platform,
    env: context.env,
    execPath: context.execPath,
    fileSystem: context.fileSystem,
  });
  const packageVersion = await readPackageVersion(context);
  const assetRoot = path.join(context.packageRoot, 'bin', 'cursor-integration');
  for (const asset of CURSOR_INTEGRATION_ASSET_FILES) {
    if (!await isFile(context.fileSystem, path.join(assetRoot, asset))) {
      throw new Error(`The @axhub/make package is missing Cursor integration asset: ${asset}`);
    }
  }
  if (!await anyPathExists(context.fileSystem, paths.cursorAppCandidates)) {
    throw new Error(`Cursor was not found. Checked: ${paths.cursorAppCandidates.join(', ')}.`);
  }

  await context.fileSystem.mkdir(paths.installRoot, { recursive: true });
  await context.fileSystem.mkdir(pathApi.dirname(paths.stdoutLog), { recursive: true });
  for (const asset of CURSOR_INTEGRATION_ASSET_FILES) {
    await copyAtomic(
      context.fileSystem,
      pathApi,
      path.join(assetRoot, asset),
      pathApi.join(paths.installRoot, asset),
    );
  }

  const config: CursorIntegrationConfig = {
    schemaVersion: CURSOR_INTEGRATION_SCHEMA_VERSION,
    packageSpec: `@axhub/make@${packageVersion}`,
    nodePath: context.execPath,
    npxCliPath,
    debugPort: CURSOR_INTEGRATION_DEBUG_PORT,
    origin: CURSOR_INTEGRATION_ORIGIN,
    installedAt: context.now().toISOString(),
  };
  await writeAtomicText(
    context.fileSystem,
    pathApi,
    paths.configFile,
    `${JSON.stringify(config, null, 2)}\n`,
  );

  if (paths.platform === 'darwin') {
    await writeAtomicText(context.fileSystem, pathApi, paths.serviceFile, createLaunchAgentPlist({
      nodePath: config.nodePath,
      companionPath: paths.companionFile,
      configPath: paths.configFile,
      stdoutLog: paths.stdoutLog,
      stderrLog: paths.stderrLog,
    }));
  } else {
    await writeAtomicText(context.fileSystem, pathApi, paths.taskXmlFile, createWindowsTaskXml({
      userSid: await resolveWindowsUserSid(context.run),
      nodePath: config.nodePath,
      companionPath: paths.companionFile,
      configPath: paths.configFile,
      workingDirectory: paths.installRoot,
    }));
  }
  await registerBackgroundService({ paths, run: context.run, uid: context.uid });

  return {
    installed: true,
    paths,
    config,
    warnings: [],
    nextAction: 'Fully quit Cursor, run npx -y @axhub/make@latest cursor open, then click Axhub Make in Cursor Agents. Make starts automatically.',
  };
}

export async function doctorCursorIntegration(
  inputContext: CursorIntegrationContext = {},
): Promise<DoctorCursorResult> {
  const context = resolveContext(inputContext);
  const paths = resolveCursorIntegrationPaths(context);
  const pathApi = pathApiForPlatform(paths.platform);
  const checks: CursorDoctorCheck[] = [];
  const add = (id: string, status: CursorDoctorCheckStatus, message: string) => {
    checks.push({ id, status, message });
  };

  const nodeMajor = Number(context.nodeVersion.split('.')[0]);
  add('node', Number.isInteger(nodeMajor) && nodeMajor >= 22 ? 'ok' : 'fail',
    `Node.js ${context.nodeVersion} at ${context.execPath}`);
  const config = await readInstalledConfig(context.fileSystem, paths.configFile);
  add('config', config ? 'ok' : 'fail', config
    ? `Installed package ${config.packageSpec}`
    : `Missing or invalid config: ${paths.configFile}`);

  const missingAssets: string[] = [];
  for (const asset of CURSOR_INTEGRATION_ASSET_FILES) {
    if (!await isFile(context.fileSystem, pathApi.join(paths.installRoot, asset))) missingAssets.push(asset);
  }
  add('assets', missingAssets.length === 0 ? 'ok' : 'fail', missingAssets.length === 0
    ? 'Cursor companion and launcher assets are installed.'
    : `Missing ${missingAssets.length} Cursor integration asset(s).`);

  if (config) {
    const runtimeReady = await isFile(context.fileSystem, config.nodePath)
      && await isFile(context.fileSystem, config.npxCliPath);
    add('runtime-paths', runtimeReady ? 'ok' : 'fail', runtimeReady
      ? 'Recorded Node.js and npm paths are available.'
      : 'Recorded Node.js or npm path is unavailable; rerun cursor install.');
  }

  const hasCursor = await anyPathExists(context.fileSystem, paths.cursorAppCandidates);
  add('client', hasCursor ? 'ok' : 'fail', hasCursor
    ? 'Cursor application is installed.'
    : `Cursor application was not found: ${paths.cursorAppCandidates.join(', ')}`);

  try {
    if (paths.platform === 'darwin') {
      if (!Number.isInteger(context.uid)) throw new Error('missing uid');
      await context.run('launchctl', ['print', `gui/${context.uid}/${CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL}`]);
    } else {
      await context.run('schtasks.exe', [
        '/Query', '/TN', CURSOR_INTEGRATION_WINDOWS_TASK_NAME, '/FO', 'LIST', '/V',
      ]);
    }
    add('service', 'ok', 'Cursor companion service is registered.');
  } catch {
    add('service', 'fail', 'Cursor companion service is not registered; rerun cursor install.');
  }

  const makeProbe = await probeJson(context.fetch, `${CURSOR_INTEGRATION_ORIGIN}/api/health`);
  const makeBody = makeProbe.body as { ok?: unknown; role?: unknown } | undefined;
  add('make', makeProbe.ok && makeBody?.ok === true && makeBody.role === 'admin' ? 'ok' : 'warn',
    makeProbe.ok ? 'Axhub Make health endpoint responded.' : 'Axhub Make is not currently running.');

  const cdpProbe = await probeJson(
    context.fetch,
    `http://127.0.0.1:${CURSOR_INTEGRATION_DEBUG_PORT}/json`,
  );
  const targets = Array.isArray(cdpProbe.body) ? cdpProbe.body : [];
  const cursorTargets = targets.filter((target) => {
    if (!target || typeof target !== 'object') return false;
    const record = target as { type?: unknown; url?: unknown };
    const title = (target as { title?: unknown }).title;
    return title === 'Cursor Agents'
      && record.type === 'page'
      && typeof record.url === 'string'
      && record.url.startsWith('vscode-file://vscode-app/')
      && record.url.includes('/workbench/workbench.html');
  });
  add('cursor-cdp', cdpProbe.ok && cursorTargets.length > 0 ? 'ok' : 'warn', cursorTargets.length > 0
    ? 'Cursor CDP workbench target is available.'
    : 'No Cursor CDP target is available. Fully quit Cursor and run npx -y @axhub/make@latest cursor open.');
  let domState: CursorAgentsDomState | null = null;
  if (cursorTargets[0]) {
    try {
      domState = await context.inspectAgentsTarget(cursorTargets[0] as CursorAgentsTarget);
    } catch {
      domState = null;
    }
  }
  const injectionReady = domState?.launcherInstalled === true && domState.entryInstalled === true;
  add('injection', injectionReady ? 'ok' : 'warn', injectionReady
    ? 'Axhub Make launcher is injected in Cursor Agents.'
    : 'Axhub Make launcher is not present in Cursor Agents; rerun cursor install and reopen Cursor.');
  const nativeBrowserConsistent = domState != null
    && domState.nativeBrowser === domState.browserTab;
  const nativeBrowserReady = domState?.nativeBrowser === true && domState.browserTab === true;
  add('native-browser', nativeBrowserConsistent ? 'ok' : 'warn', nativeBrowserReady
    ? 'Cursor Agents native browser webview and tab are available.'
    : nativeBrowserConsistent
      ? 'Cursor Agents native browser will be created on the first Axhub Make click.'
      : 'Cursor Agents native browser DOM is unavailable or incompatible.');

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    paths,
    checks,
  };
}

function assertOwnedInstallRoot(paths: CursorIntegrationPaths): void {
  const pathApi = pathApiForPlatform(paths.platform);
  if (
    pathApi.basename(paths.installRoot) !== 'cursor-integration'
    || pathApi.basename(pathApi.dirname(paths.installRoot)) !== 'Axhub Make'
  ) {
    throw new Error(`Refusing to remove unexpected Cursor integration path: ${paths.installRoot}`);
  }
}

export async function uninstallCursorIntegration(
  inputContext: CursorIntegrationContext = {},
): Promise<UninstallCursorResult> {
  const context = resolveContext(inputContext);
  const paths = resolveCursorIntegrationPaths(context);
  assertOwnedInstallRoot(paths);
  await unregisterBackgroundService({ paths, run: context.run, uid: context.uid });
  if (paths.platform === 'darwin') {
    await context.fileSystem.rm(paths.serviceFile, { force: true });
  }
  await context.fileSystem.rm(paths.installRoot, { recursive: true, force: true });
  return { uninstalled: true, paths, warnings: [] };
}

export { resolvePackageRootFromModule };
