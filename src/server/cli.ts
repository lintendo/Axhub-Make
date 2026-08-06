import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getGlobalMakeStateDir } from './projectCore/index.ts';

import { DEFAULT_MAKE_SERVER_PORT } from './defaults.ts';
import { resolveDefaultDiagnosticLogFile, startDiagnosticLog } from './diagnosticLog.ts';
import { startMakeServer } from './index.ts';
import { runCodexIntegrationCli } from './codexIntegration/cli.ts';
import { runCursorIntegrationCli } from './cursorIntegration/cli.ts';

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

export const CLI_USAGE = `Usage: axhub-make [options]

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
  -h, --help                 Show this help message.
`;

export function openBrowser(url: string, platform = process.platform): void {
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
      console.warn(`Unable to open browser automatically. Open ${url} manually.`);
    });
    child.unref?.();
  } catch {
    console.warn(`Unable to open browser automatically. Open ${url} manually.`);
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
    throw new Error(`Missing value for ${optionName}`);
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
    throw new Error(`Invalid ${optionName}: ${value}`);
  }
}

export function parseCliArgs(args: string[], cwd = process.cwd()): MakeServerCliOptions {
  let legacyProjectRoot = '';
  let port = DEFAULT_MAKE_SERVER_PORT;
  let host: string | undefined;
  let runtimeOrigin: string | undefined;
  let adminRoot: string | undefined;
  let help = false;
  let devMode = false;
  let open = true;
  let logFile: string | undefined;
  let axhubOnlineBaseUrl: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--port') {
      const value = readOptionValue(args, index, '--port');
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid --port: ${value}`);
      }
      port = parsed;
      index += 1;
      continue;
    }
    if (arg === '--host') {
      host = readOptionValue(args, index, '--host');
      index += 1;
      continue;
    }
    if (arg === '--runtime-origin') {
      runtimeOrigin = readOptionValue(args, index, '--runtime-origin');
      index += 1;
      continue;
    }
    if (arg === '--admin-root') {
      adminRoot = path.resolve(cwd, readOptionValue(args, index, '--admin-root'));
      index += 1;
      continue;
    }
    if (arg === '--axhub-online-base-url') {
      const value = readOptionValue(args, index, '--axhub-online-base-url');
      axhubOnlineBaseUrl = normalizeOnlineBaseUrlOption(value, '--axhub-online-base-url');
      index += 1;
      continue;
    }
    if (arg === '--dev') {
      devMode = true;
      continue;
    }
    if (arg === '--no-open') {
      open = false;
      continue;
    }
    if (arg === '--log-file') {
      const next = args[index + 1];
      if (next && !next.startsWith('--')) {
        logFile = path.resolve(cwd, next);
        index += 1;
      } else {
        logFile = resolveDefaultDiagnosticLogFile(cwd);
      }
      continue;
    }
    if (arg.startsWith('--log-file=')) {
      const value = arg.slice('--log-file='.length).trim();
      logFile = value ? path.resolve(cwd, value) : resolveDefaultDiagnosticLogFile(cwd);
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!legacyProjectRoot && arg === 'canvas') {
      throw new Error('Unknown command: canvas');
    }
    if (legacyProjectRoot) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    legacyProjectRoot = arg;
  }

  return {
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
  };
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === 'codex') {
    await runCodexIntegrationCli(args.slice(1));
    return;
  }
  if (args[0] === 'cursor') {
    await runCursorIntegrationCli(args.slice(1));
    return;
  }
  const options = parseCliArgs(args);
  if (options.help) {
    console.log(CLI_USAGE.trimEnd());
    return;
  }
  const diagnosticLog = options.logFile ? startDiagnosticLog(options.logFile) : null;
  if (diagnosticLog) {
    console.log(`Axhub Make diagnostic log: ${diagnosticLog.filePath}`);
  }
  let server: Awaited<ReturnType<typeof startMakeServer>>;
  try {
    server = await startMakeServer({
      ...options,
      ...(diagnosticLog ? { diagnosticLog } : {}),
    });
  } catch (error) {
    if (isPortInUseError(error)) {
      console.error(formatPortInUseMessage(error, options));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (options.devMode) {
    console.log(`Axhub Make dev server (Vite HMR) at ${server.origin}`);
  } else {
    console.log(`Axhub Make server listening at ${server.origin}`);
  }
  if (options.open !== false) {
    openBrowser(server.origin);
  }
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
  runCli().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
