import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { getGlobalMakeStateDir } from './projectCore/index.ts';

import { DEFAULT_MAKE_SERVER_PORT } from './defaults.ts';
import { resolveDefaultDiagnosticLogFile, startDiagnosticLog } from './diagnosticLog.ts';
import { startMakeServer } from './index.ts';
import {
  normalizeMakeCliAppId,
  openMakeCliApp,
  type MakeCliAppId,
  type MakeCliAppOpenDependencies,
  type MakeCliAppOpenResult,
} from './cliAppOpen.ts';
import {
  inspectMakeService,
  startMakeServiceInBackground,
  stopMakeService,
  type MakeServiceInspection,
  type MakeServiceResult,
} from './makeServiceLifecycle.ts';

export interface MakeServerCliOptions {
  projectRoot: string;
  port: number;
  host?: string;
  runtimeOrigin?: string;
  adminRoot?: string;
  help?: boolean;
  devMode?: boolean;
  open?: boolean;
  logFile?: string;
  axhubOnlineBaseUrl?: string;
}

export type MakeCliCommand = 'serve' | 'open' | 'status' | 'stop';

export interface MakeCliOptions extends MakeServerCliOptions {
  command: MakeCliCommand;
  app?: MakeCliAppId;
  background?: boolean;
  json?: boolean;
  appPath?: string;
  restart?: boolean;
}

export class CliUsageError extends Error {
  readonly exitCode = 2;
  readonly code: string;

  constructor(message: string, code = 'invalid-usage') {
    super(message);
    this.name = 'CliUsageError';
    this.code = code;
  }
}

export interface MakeCliResult extends MakeServiceResult {
  app?: MakeCliAppId;
  background?: boolean;
  status?: MakeServiceInspection['status'];
}

export interface RunCliDependencies {
  startMakeServer?: typeof startMakeServer;
  inspectMakeService?: typeof inspectMakeService;
  startMakeServiceInBackground?: typeof startMakeServiceInBackground;
  stopMakeService?: typeof stopMakeService;
  openMakeCliApp?: typeof openMakeCliApp;
  openBrowser?: typeof openBrowser;
  startDiagnosticLog?: typeof startDiagnosticLog;
  isInteractive?: () => boolean;
  confirmRestart?: NonNullable<MakeCliAppOpenDependencies['confirmRestart']>;
  entryPath?: string;
}

export const CLI_USAGE = `Usage:
  axhub-make [options]
  axhub-make open <app> [options]
  axhub-make status [--json]
  axhub-make stop [--json]

Apps:
  codex
  cursor
  workbuddy
  traework
  qoderwork

Options:
  --port <port>              Server port. Defaults to ${DEFAULT_MAKE_SERVER_PORT}.
  --host <host>              Server host. Defaults to all interfaces.
  --runtime-origin <origin>  Runtime server origin.
  --admin-root <path>        Admin UI static asset directory.
  --axhub-online-base-url <url>
                             Axhub online service base URL for auth and publishing.
  --dev                      Enable Vite dev middleware for frontend HMR.
  --no-open                  Start the server without opening the admin page.
  --log-file [path]          Tee console and diagnostic logs to a local file.
  --background               Start Make as a detached child and exit when ready.
  --json                     Print one structured result object.
  --app-path <path>          Override App discovery for this open invocation.
  --restart                  Authorize a graceful App restart without prompting.
  -h, --help                 Show this help message.
`;

export function openBrowser(
  url: string,
  platform = process.platform,
  warn: (message: string) => void = (message) => console.warn(message),
): void {
  const command = platform === 'darwin'
    ? 'open'
    : platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.on?.('error', () => {
      warn(`Unable to open browser automatically. Open ${url} manually.`);
    });
    child.unref?.();
  } catch {
    warn(`Unable to open browser automatically. Open ${url} manually.`);
  }
}

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException & { port?: unknown; address?: unknown } {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
}

function resolveVisitUrlHost(host: string): string {
  const normalized = host.trim();
  if (!normalized || normalized === '0.0.0.0' || normalized === '::') {
    return 'localhost';
  }
  return normalized.includes(':') && !normalized.startsWith('[') ? `[${normalized}]` : normalized;
}

function resolvePortInUsePort(error: { port?: unknown }, fallbackPort: number): number {
  const parsed = Number(error.port);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallbackPort;
}

export function formatPortInUseMessage(error: NodeJS.ErrnoException & { port?: unknown; address?: unknown }, options: MakeServerCliOptions): string {
  const port = resolvePortInUsePort(error, options.port);
  const visitHost = resolveVisitUrlHost(String(error.address || options.host || 'localhost'));
  const url = `http://${visitHost}:${port}`;
  return [
    `Axhub Make 启动失败：端口 ${port} 已经被占用了。`,
    '',
    `你可以先在浏览器里访问：${url}`,
    '如果看到的是 Axhub Make 首页，说明服务可能已经在运行，可以直接使用这个页面。',
    `如果打开的不是 Axhub Make 首页，请先关闭占用 ${port} 端口的应用，然后重新启动 Axhub Make。`,
  ].join('\n');
}

function readOptionValue(args: string[], index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new CliUsageError(`Missing value for ${optionName}`);
  }
  return value;
}

function normalizeOnlineBaseUrlOption(value: string, optionName: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    url.pathname = url.pathname.replace(/\/+$/u, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/u, '');
  } catch {
    throw new CliUsageError(`Invalid ${optionName}: ${value}`);
  }
}

function assertOptionAllowed(
  command: MakeCliCommand,
  optionName: string,
  allowedCommands: readonly MakeCliCommand[],
): void {
  if (!allowedCommands.includes(command)) {
    throw new CliUsageError(`${optionName} is not available for the ${command} command.`);
  }
}

export function parseCliArgs(args: string[], cwd = process.cwd()): MakeCliOptions {
  const tokens = args.filter((arg) => arg !== '--');
  let command: MakeCliCommand = 'serve';
  let cursor = 0;
  let app: MakeCliAppId | undefined;
  const first = tokens[0];
  if (first && !first.startsWith('-')) {
    if (first === 'serve' || first === 'open' || first === 'status' || first === 'stop') {
      command = first;
      cursor = 1;
    } else if (first === 'codex') {
      throw new CliUsageError('Unknown command: codex. Use axhub-make open codex instead.');
    } else if (first === 'canvas') {
      throw new CliUsageError('Unknown command: canvas');
    } else {
      throw new CliUsageError(`Unexpected argument: ${first}`);
    }
  }
  if (command === 'open') {
    const value = tokens[cursor];
    if (!value || value.startsWith('-')) {
      throw new CliUsageError('Missing App ID for open.');
    }
    const normalized = normalizeMakeCliAppId(value);
    if (!normalized) {
      throw new CliUsageError(`Unsupported App ID: ${value}`, 'unsupported-app');
    }
    app = normalized;
    cursor += 1;
  }

  let port = DEFAULT_MAKE_SERVER_PORT;
  let host: string | undefined;
  let runtimeOrigin: string | undefined;
  let adminRoot: string | undefined;
  let help = false;
  let devMode = false;
  let open = true;
  let logFile: string | undefined;
  let axhubOnlineBaseUrl: string | undefined;
  let background = false;
  let json = false;
  let appPath: string | undefined;
  let restart = false;

  for (let index = cursor; index < tokens.length; index += 1) {
    const arg = tokens[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--port') {
      assertOptionAllowed(command, '--port', ['serve', 'open']);
      const value = readOptionValue(tokens, index, '--port');
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new CliUsageError(`Invalid --port: ${value}`);
      }
      port = parsed;
      index += 1;
      continue;
    }
    if (arg === '--host') {
      assertOptionAllowed(command, '--host', ['serve', 'open']);
      host = readOptionValue(tokens, index, '--host');
      index += 1;
      continue;
    }
    if (arg === '--runtime-origin') {
      assertOptionAllowed(command, '--runtime-origin', ['serve', 'open']);
      runtimeOrigin = readOptionValue(tokens, index, '--runtime-origin');
      index += 1;
      continue;
    }
    if (arg === '--admin-root') {
      assertOptionAllowed(command, '--admin-root', ['serve', 'open']);
      adminRoot = path.resolve(cwd, readOptionValue(tokens, index, '--admin-root'));
      index += 1;
      continue;
    }
    if (arg === '--axhub-online-base-url') {
      assertOptionAllowed(command, '--axhub-online-base-url', ['serve', 'open']);
      const value = readOptionValue(tokens, index, '--axhub-online-base-url');
      axhubOnlineBaseUrl = normalizeOnlineBaseUrlOption(value, '--axhub-online-base-url');
      index += 1;
      continue;
    }
    if (arg === '--dev') {
      assertOptionAllowed(command, '--dev', ['serve', 'open']);
      devMode = true;
      continue;
    }
    if (arg === '--no-open') {
      assertOptionAllowed(command, '--no-open', ['serve', 'open']);
      open = false;
      continue;
    }
    if (arg === '--log-file') {
      assertOptionAllowed(command, '--log-file', ['serve', 'open']);
      const next = tokens[index + 1];
      if (next && !next.startsWith('--')) {
        logFile = path.resolve(cwd, next);
        index += 1;
      } else {
        logFile = resolveDefaultDiagnosticLogFile(cwd);
      }
      continue;
    }
    if (arg.startsWith('--log-file=')) {
      assertOptionAllowed(command, '--log-file', ['serve', 'open']);
      const value = arg.slice('--log-file='.length).trim();
      logFile = value ? path.resolve(cwd, value) : resolveDefaultDiagnosticLogFile(cwd);
      continue;
    }
    if (arg === '--background') {
      assertOptionAllowed(command, '--background', ['serve', 'open']);
      background = true;
      continue;
    }
    if (arg === '--app-path') {
      assertOptionAllowed(command, '--app-path', ['open']);
      appPath = path.resolve(cwd, readOptionValue(tokens, index, '--app-path'));
      index += 1;
      continue;
    }
    if (arg === '--restart') {
      assertOptionAllowed(command, '--restart', ['open']);
      restart = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new CliUsageError(`Unknown option: ${arg}`);
    }
    throw new CliUsageError(`Unexpected argument: ${arg}`);
  }

  return {
    command,
    projectRoot: getGlobalMakeStateDir(),
    port,
    ...(host ? { host } : {}),
    ...(runtimeOrigin ? { runtimeOrigin } : {}),
    ...(adminRoot ? { adminRoot } : {}),
    ...(help ? { help } : {}),
    ...(devMode ? { devMode } : {}),
    ...(open === false ? { open } : {}),
    ...(logFile ? { logFile } : {}),
    ...(axhubOnlineBaseUrl ? { axhubOnlineBaseUrl } : {}),
    ...(app ? { app } : {}),
    ...(background ? { background } : {}),
    ...(json ? { json } : {}),
    ...(appPath ? { appPath } : {}),
    ...(restart ? { restart } : {}),
  };
}

function serverStartOptions(options: MakeCliOptions) {
  return {
    projectRoot: options.projectRoot,
    port: options.port,
    ...(options.host ? { host: options.host } : {}),
    ...(options.runtimeOrigin ? { runtimeOrigin: options.runtimeOrigin } : {}),
    ...(options.adminRoot ? { adminRoot: options.adminRoot } : {}),
    ...(options.devMode ? { devMode: true } : {}),
    ...(options.json ? { quiet: true } : {}),
    ...(options.open === false ? { open: false } : {}),
    ...(options.logFile ? { logFile: options.logFile } : {}),
    ...(options.axhubOnlineBaseUrl ? { axhubOnlineBaseUrl: options.axhubOnlineBaseUrl } : {}),
  };
}

function renderCliResult(result: MakeCliResult, json = false): void {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  const details = [result.message];
  if (result.origin && !result.message.includes(result.origin)) details.push(result.origin);
  if (result.logFile) details.push(`Log: ${result.logFile}`);
  (result.ok ? console.log : console.error)(details.join('\n'));
}

function inspectionResult(inspection: MakeServiceInspection): MakeCliResult {
  if (inspection.status === 'running') {
    return {
      ok: true,
      code: 'make-running',
      message: 'Axhub Make is running.',
      status: 'running',
      origin: inspection.origin,
      pid: inspection.pid,
      reusedServer: true,
    };
  }
  if (inspection.status === 'stopped') {
    return {
      ok: false,
      code: 'make-stopped',
      message: 'Axhub Make is stopped.',
      status: 'stopped',
    };
  }
  return {
    ok: false,
    code: 'server-identity-mismatch',
    message: 'The recorded Axhub Make server could not be identified safely.',
    status: 'stale',
  };
}

async function confirmCliRestart(input: { app: MakeCliAppId }): Promise<boolean> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question(
      `${input.app} must restart before Axhub Make can open. Restart it now? [y/N] `,
    );
    return /^(?:y|yes)$/iu.test(answer.trim());
  } finally {
    readline.close();
  }
}

function mergeAppResult(
  appResult: MakeCliAppOpenResult,
  origin: string,
  background: boolean,
  reusedServer: boolean,
): MakeCliResult {
  return {
    ...appResult,
    origin,
    background,
    reusedServer,
  };
}

export async function runCli(
  args = process.argv.slice(2),
  suppliedDependencies: RunCliDependencies = {},
): Promise<number> {
  const dependencies = {
    startMakeServer,
    inspectMakeService,
    startMakeServiceInBackground,
    stopMakeService,
    openMakeCliApp,
    openBrowser,
    startDiagnosticLog,
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirmRestart: confirmCliRestart,
    entryPath: process.argv[1],
    ...suppliedDependencies,
  };
  const options = parseCliArgs(args);
  if (options.help) {
    console.log(CLI_USAGE.trimEnd());
    return 0;
  }

  if (options.command === 'status') {
    const result = inspectionResult(await dependencies.inspectMakeService());
    renderCliResult(result, options.json);
    return result.status === 'running' ? 0 : 1;
  }

  if (options.command === 'stop') {
    const result = await dependencies.stopMakeService();
    renderCliResult(result, options.json);
    return result.ok ? 0 : 1;
  }

  let inspection = await dependencies.inspectMakeService();
  let origin = inspection.origin;
  let reusedServer = inspection.status === 'running';
  let foregroundServer: Awaited<ReturnType<typeof startMakeServer>> | undefined;
  let serviceResult: MakeCliResult | undefined;

  if (inspection.status === 'stale') {
    serviceResult = inspectionResult(inspection);
    renderCliResult(serviceResult, options.json);
    return 1;
  }

  if (inspection.status === 'stopped') {
    if (options.background) {
      const result = await dependencies.startMakeServiceInBackground({
        args,
        entryPath: dependencies.entryPath,
        ...(options.logFile ? { logFile: options.logFile } : {}),
      });
      if (!result.ok || !result.origin) {
        renderCliResult({ ...result, background: true }, options.json);
        return 1;
      }
      origin = result.origin;
      reusedServer = result.reusedServer === true;
      serviceResult = { ...result, background: true };
    } else {
      const diagnosticLog = options.logFile ? dependencies.startDiagnosticLog(options.logFile) : null;
      try {
        foregroundServer = await dependencies.startMakeServer({
          ...serverStartOptions(options),
          ...(diagnosticLog ? { diagnosticLog } : {}),
        });
      } catch (error) {
        if (!isPortInUseError(error)) throw error;
        inspection = await dependencies.inspectMakeService();
        if (inspection.status === 'running' && inspection.origin) {
          origin = inspection.origin;
          reusedServer = true;
        } else {
          const result: MakeCliResult = {
            ok: false,
            code: 'make-port-occupied',
            message: formatPortInUseMessage(error, options),
            background: false,
          };
          renderCliResult(result, options.json);
          return 1;
        }
      }
      if (foregroundServer) {
        origin = foregroundServer.origin;
        serviceResult = {
          ok: true,
          code: 'make-started',
          message: options.devMode
            ? `Axhub Make dev server (Vite HMR) at ${foregroundServer.origin}`
            : `Axhub Make server listening at ${foregroundServer.origin}`,
          origin: foregroundServer.origin,
          background: false,
          reusedServer: false,
          ...(options.logFile ? { logFile: options.logFile } : {}),
        };
      }
    }
  }

  if (!origin) {
    const result: MakeCliResult = {
      ok: false,
      code: 'make-start-failed',
      message: 'Axhub Make did not provide a usable origin.',
      background: options.background === true,
    };
    renderCliResult(result, options.json);
    return 1;
  }

  if (options.open !== false) {
    dependencies.openBrowser(origin, process.platform, options.json ? () => {} : undefined);
  }

  if (options.command === 'open' && options.app) {
    const appResult = await dependencies.openMakeCliApp({
      app: options.app,
      makeOrigin: origin,
      ...(options.appPath ? { appPath: options.appPath } : {}),
      ...(options.restart ? { restart: true } : {}),
    }, {
      isInteractive: () => options.json ? false : dependencies.isInteractive(),
      confirmRestart: dependencies.confirmRestart,
    });
    const result = mergeAppResult(appResult, origin, options.background === true, reusedServer);
    if (!result.ok && foregroundServer) await foregroundServer.close();
    renderCliResult(result, options.json);
    return result.ok ? 0 : 1;
  }

  const result = serviceResult || {
    ...inspectionResult({ ...inspection, status: 'running', origin }),
    background: options.background === true,
    reusedServer: true,
  };
  renderCliResult(result, options.json);
  return 0;
}

export function handleCliError(error: unknown, args = process.argv.slice(2)): number {
  const usageError = error instanceof CliUsageError;
  const message = error instanceof Error ? error.message : String(error);
  if (args.includes('--json')) {
    console.log(JSON.stringify({
      ok: false,
      code: usageError ? error.code : 'unexpected-error',
      message,
    }));
  } else {
    console.error(error instanceof Error ? error.stack || error.message : error);
  }
  return usageError ? error.exitCode : 1;
}

export function isCliEntrypoint(argvPath = process.argv[1] || '', moduleUrl = import.meta.url): boolean {
  return path.resolve(argvPath) === fileURLToPath(moduleUrl);
}

export function shouldAutoRunCli(
  argvPath = process.argv[1] || '',
  moduleUrl = import.meta.url,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.AXHUB_MAKE_DISABLE_AUTO_RUN !== '1' && isCliEntrypoint(argvPath, moduleUrl);
}

if (shouldAutoRunCli()) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.exitCode = handleCliError(error);
    });
}
