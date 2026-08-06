import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CODEX_INTEGRATION_LAUNCH_AGENT_LABEL,
  CODEX_INTEGRATION_WINDOWS_TASK_NAME,
  type CodexIntegrationPaths,
  resolveCodexIntegrationPaths,
} from './paths.ts';
import {
  type CommandRunner,
  createLaunchAgentPlist,
  createWindowsTaskXml,
  registerBackgroundService,
  unregisterBackgroundService,
} from './service.ts';

export const CODEX_INTEGRATION_ASSET_FILES = [
  'companion.mjs',
  'cdp-session.mjs',
  'host-protocol.mjs',
  'make-runtime.mjs',
  'axhub-make.sidebar.js',
] as const;

export const CODEX_INTEGRATION_DEBUG_PORT = 9229;
export const CODEX_INTEGRATION_ORIGIN = 'http://127.0.0.1:53817';
const CODEX_INTEGRATION_SCHEMA_VERSION = 1;

export interface CodexIntegrationFileSystem {
  access(filePath: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  mkdir(directory: string, options: { recursive: true }): Promise<string | undefined>;
  readFile(filePath: string, encoding: 'utf8'): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  rm(filePath: string, options: { recursive?: boolean; force?: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
  writeFile(
    filePath: string,
    data: string | Uint8Array,
    options?: { encoding?: BufferEncoding; mode?: number },
  ): Promise<void>;
}

const defaultFileSystem: CodexIntegrationFileSystem = {
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

export function resolvePackageRootFromModule(modulePath: string): string {
  let directory = path.dirname(modulePath);
  for (let depth = 0; depth < 6; depth += 1) {
    const packageJsonPath = path.join(directory, 'package.json');
    try {
      const packageJson = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
      if (packageJson.name === '@axhub/make') return directory;
    } catch {
      // Keep walking until the source or bundled npm package root is found.
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Unable to locate the @axhub/make package root from ${modulePath}.`);
}

export interface CodexIntegrationContext {
  platform?: NodeJS.Platform | string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  execPath?: string;
  nodeVersion?: string;
  packageRoot?: string;
  uid?: number;
  now?: () => Date;
  run?: CommandRunner;
  fileSystem?: CodexIntegrationFileSystem;
  fetch?: typeof globalThis.fetch;
}

interface ResolvedCodexIntegrationContext {
  platform: NodeJS.Platform | string;
  homeDir: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  execPath: string;
  nodeVersion: string;
  packageRoot: string;
  uid?: number;
  now: () => Date;
  run: CommandRunner;
  fileSystem: CodexIntegrationFileSystem;
  fetch: typeof globalThis.fetch;
}

export interface CodexIntegrationConfig {
  schemaVersion: 1;
  packageSpec: string;
  nodePath: string;
  npxCliPath: string;
  debugPort: 9229;
  origin: 'http://127.0.0.1:53817';
  installedAt: string;
}

export interface InstallResult {
  installed: true;
  paths: CodexIntegrationPaths;
  config: CodexIntegrationConfig;
  warnings: string[];
  nextAction: string;
}

export type DoctorCheckStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  message: string;
}

export interface DoctorResult {
  ok: boolean;
  paths: CodexIntegrationPaths;
  checks: DoctorCheck[];
}

export interface UninstallResult {
  uninstalled: true;
  paths: CodexIntegrationPaths;
}

function resolveContext(context: CodexIntegrationContext = {}): ResolvedCodexIntegrationContext {
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
  };
}

function pathApiForPlatform(platform: NodeJS.Platform | string): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

function getEnvValue(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | undefined {
  const direct = env[key];
  if (direct) return direct;
  const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

async function isFile(fileSystem: CodexIntegrationFileSystem, filePath: string): Promise<boolean> {
  try {
    return (await fileSystem.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function pathExists(fileSystem: CodexIntegrationFileSystem, filePath: string): Promise<boolean> {
  try {
    await fileSystem.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveNpxCliPath(options: {
  platform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  execPath: string;
  fileSystem: CodexIntegrationFileSystem;
}): Promise<string> {
  const pathApi = pathApiForPlatform(options.platform);
  const npmExecPath = getEnvValue(options.env, 'npm_execpath');
  const candidates: string[] = [];
  if (npmExecPath) {
    candidates.push(
      pathApi.basename(npmExecPath).toLowerCase() === 'npx-cli.js'
        ? npmExecPath
        : pathApi.join(pathApi.dirname(npmExecPath), 'npx-cli.js'),
    );
  }
  const nodeDirectory = pathApi.dirname(options.execPath);
  candidates.push(
    pathApi.join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  );
  if (options.platform !== 'win32') {
    candidates.push(pathApi.resolve(nodeDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'));
  }

  for (const candidate of [...new Set(candidates)]) {
    if (await isFile(options.fileSystem, candidate)) return candidate;
  }
  throw new Error(
    'Unable to locate npm npx-cli.js. Run the installer with npx from a standard Node.js/npm installation.',
  );
}

function assertNodeVersion(nodeVersion: string): void {
  const major = Number(nodeVersion.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    throw new Error(`Node.js 22 or newer is required for the Codex++ companion (found ${nodeVersion}).`);
  }
}

async function writeAtomicText(
  fileSystem: CodexIntegrationFileSystem,
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
  fileSystem: CodexIntegrationFileSystem,
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

async function readPackageMetadata(
  context: ResolvedCodexIntegrationContext,
): Promise<{ name: string; version: string }> {
  const packageJsonPath = path.join(context.packageRoot, 'package.json');
  const raw = JSON.parse(await context.fileSystem.readFile(packageJsonPath, 'utf8')) as {
    name?: unknown;
    version?: unknown;
  };
  if (raw.name !== '@axhub/make' || typeof raw.version !== 'string' || !raw.version.trim()) {
    throw new Error(`Expected a versioned @axhub/make package at ${context.packageRoot}.`);
  }
  return { name: raw.name, version: raw.version.trim() };
}

function parseWindowsUserSid(output: string): string {
  const match = output.match(/S-\d-(?:\d+-)+\d+/u);
  if (!match) throw new Error('Unable to determine the current Windows user SID.');
  return match[0];
}

async function resolveWindowsUserSid(run: CommandRunner): Promise<string> {
  const result = await run('whoami.exe', ['/user', '/fo', 'csv', '/nh']);
  return parseWindowsUserSid(result.stdout);
}

async function anyPathExists(
  fileSystem: CodexIntegrationFileSystem,
  candidates: string[],
): Promise<boolean> {
  for (const candidate of candidates) {
    if (await pathExists(fileSystem, candidate)) return true;
  }
  return false;
}

export async function installCodexIntegration(
  inputContext: CodexIntegrationContext = {},
): Promise<InstallResult> {
  const context = resolveContext(inputContext);
  assertNodeVersion(context.nodeVersion);
  const paths = resolveCodexIntegrationPaths(context);
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
  const packageMetadata = await readPackageMetadata(context);
  const assetRoot = path.join(context.packageRoot, 'bin', 'codex-integration');
  for (const asset of CODEX_INTEGRATION_ASSET_FILES) {
    const source = path.join(assetRoot, asset);
    if (!await isFile(context.fileSystem, source)) {
      throw new Error(`The @axhub/make package is missing Codex integration asset: ${asset}`);
    }
  }

  const warnings: string[] = [];
  const [hasCodexPlus, hasOfficialCodex] = await Promise.all([
    anyPathExists(context.fileSystem, paths.codexPlusCandidates),
    anyPathExists(context.fileSystem, paths.codexCandidates),
  ]);
  if (!hasCodexPlus && !hasOfficialCodex) {
    warnings.push(
      'Neither Codex++ nor official Codex was found at a default install location. The integration remains available for custom locations or a later client install.',
    );
  }

  await context.fileSystem.mkdir(paths.installRoot, { recursive: true });
  await context.fileSystem.mkdir(pathApi.dirname(paths.stdoutLog), { recursive: true });
  for (const asset of CODEX_INTEGRATION_ASSET_FILES) {
    const source = path.join(assetRoot, asset);
    const destination = pathApi.join(paths.installRoot, asset);
    await copyAtomic(context.fileSystem, pathApi, source, destination);
  }
  await context.fileSystem.rm(paths.legacyUserScriptFile, { force: true });

  const config: CodexIntegrationConfig = {
    schemaVersion: CODEX_INTEGRATION_SCHEMA_VERSION,
    packageSpec: `@axhub/make@${packageMetadata.version}`,
    nodePath: context.execPath,
    npxCliPath,
    debugPort: CODEX_INTEGRATION_DEBUG_PORT,
    origin: CODEX_INTEGRATION_ORIGIN,
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
    const userSid = await resolveWindowsUserSid(context.run);
    await writeAtomicText(context.fileSystem, pathApi, paths.taskXmlFile, createWindowsTaskXml({
      userSid,
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
    warnings,
    nextAction: 'Codex++ users: open Codex++ normally and click Axhub Make. Official Codex users: fully quit a normal Codex instance, then run axhub-make codex open.',
  };
}

function isValidConfig(value: unknown): value is CodexIntegrationConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<CodexIntegrationConfig>;
  return config.schemaVersion === CODEX_INTEGRATION_SCHEMA_VERSION
    && /^@axhub\/make@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(config.packageSpec || '')
    && typeof config.nodePath === 'string'
    && typeof config.npxCliPath === 'string'
    && config.debugPort === CODEX_INTEGRATION_DEBUG_PORT
    && config.origin === CODEX_INTEGRATION_ORIGIN
    && typeof config.installedAt === 'string';
}

async function readInstalledConfig(
  fileSystem: CodexIntegrationFileSystem,
  configFile: string,
): Promise<CodexIntegrationConfig | null> {
  try {
    const parsed: unknown = JSON.parse(await fileSystem.readFile(configFile, 'utf8'));
    return isValidConfig(parsed) ? parsed : null;
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

export async function doctorCodexIntegration(
  inputContext: CodexIntegrationContext = {},
): Promise<DoctorResult> {
  const context = resolveContext(inputContext);
  const paths = resolveCodexIntegrationPaths(context);
  const pathApi = pathApiForPlatform(paths.platform);
  const checks: DoctorCheck[] = [];
  const add = (id: string, status: DoctorCheckStatus, message: string) => {
    checks.push({ id, status, message });
  };

  const nodeMajor = Number(context.nodeVersion.split('.')[0]);
  add(
    'node',
    Number.isInteger(nodeMajor) && nodeMajor >= 22 ? 'ok' : 'fail',
    `Node.js ${context.nodeVersion} at ${context.execPath}`,
  );

  const config = await readInstalledConfig(context.fileSystem, paths.configFile);
  add('config', config ? 'ok' : 'fail', config
    ? `Installed package ${config.packageSpec}`
    : `Missing or invalid config: ${paths.configFile}`);

  const requiredAssets = CODEX_INTEGRATION_ASSET_FILES
    .map((asset) => pathApi.join(paths.installRoot, asset));
  const missingAssets: string[] = [];
  for (const asset of requiredAssets) {
    if (!await isFile(context.fileSystem, asset)) missingAssets.push(asset);
  }
  add('assets', missingAssets.length === 0 ? 'ok' : 'fail', missingAssets.length === 0
    ? 'Companion and CDP sidebar source are installed.'
    : `Missing ${missingAssets.length} integration asset(s).`);

  if (config) {
    const runtimePathsReady = await isFile(context.fileSystem, config.nodePath)
      && await isFile(context.fileSystem, config.npxCliPath);
    add('runtime-paths', runtimePathsReady ? 'ok' : 'fail', runtimePathsReady
      ? 'Recorded Node.js and npm paths are available.'
      : 'Recorded Node.js or npm path is no longer available; rerun codex install.');
  }

  add(
    'codex-plus',
    await anyPathExists(context.fileSystem, paths.codexPlusCandidates) ? 'ok' : 'warn',
    'Codex++ default installation location check.',
  );
  add(
    'codex',
    await anyPathExists(context.fileSystem, paths.codexCandidates) ? 'ok' : 'warn',
    'Official Codex default installation location check.',
  );

  try {
    if (paths.platform === 'darwin') {
      if (!Number.isInteger(context.uid)) throw new Error('missing uid');
      await context.run('launchctl', [
        'print', `gui/${context.uid}/${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}`,
      ]);
    } else {
      await context.run('schtasks.exe', [
        '/Query', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/FO', 'LIST', '/V',
      ]);
    }
    add('service', 'ok', 'Background companion service is registered.');
  } catch {
    add('service', 'fail', 'Background companion service is not registered or not available.');
  }

  const makeProbe = await probeJson(context.fetch, `${CODEX_INTEGRATION_ORIGIN}/api/health`);
  const makeBody = makeProbe.body as { ok?: unknown; role?: unknown } | undefined;
  add('make', makeProbe.ok && makeBody?.ok === true && makeBody.role === 'admin' ? 'ok' : 'warn',
    makeProbe.ok ? 'Axhub Make health endpoint responded.' : 'Axhub Make is not currently running.');

  const cdpProbe = await probeJson(context.fetch, `http://127.0.0.1:${CODEX_INTEGRATION_DEBUG_PORT}/json`);
  const cdpTargets = Array.isArray(cdpProbe.body) ? cdpProbe.body : [];
  const hasCodexTarget = cdpTargets.some((target) => {
    if (!target || typeof target !== 'object') return false;
    const record = target as { type?: unknown; url?: unknown };
    return record.type === 'page' && typeof record.url === 'string' && record.url.startsWith('app://');
  });
  add('codex-cdp', cdpProbe.ok && hasCodexTarget ? 'ok' : 'warn',
    hasCodexTarget ? 'Codex CDP target is available.' : 'No Codex CDP target is available. Open Codex++ normally or run axhub-make codex open.');

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    paths,
    checks,
  };
}

function assertOwnedInstallRoot(paths: CodexIntegrationPaths): void {
  const pathApi = pathApiForPlatform(paths.platform);
  if (
    pathApi.basename(paths.installRoot) !== 'codex-integration'
    || pathApi.basename(pathApi.dirname(paths.installRoot)) !== 'Axhub Make'
  ) {
    throw new Error(`Refusing to remove unexpected integration path: ${paths.installRoot}`);
  }
}

export async function uninstallCodexIntegration(
  inputContext: CodexIntegrationContext = {},
): Promise<UninstallResult> {
  const context = resolveContext(inputContext);
  const paths = resolveCodexIntegrationPaths(context);
  assertOwnedInstallRoot(paths);
  await unregisterBackgroundService({ paths, run: context.run, uid: context.uid });
  await context.fileSystem.rm(paths.legacyUserScriptFile, { force: true });
  if (paths.platform === 'darwin') {
    await context.fileSystem.rm(paths.serviceFile, { force: true });
  }
  await context.fileSystem.rm(paths.installRoot, { recursive: true, force: true });
  return { uninstalled: true, paths };
}
