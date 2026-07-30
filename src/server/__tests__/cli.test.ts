import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const startMakeServerMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());
const startDiagnosticLogMock = vi.hoisted(() => vi.fn((filePath: string) => ({
  filePath,
  write: vi.fn(),
  close: vi.fn(),
})));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: spawnMock,
  };
});

vi.mock('../index.ts', () => ({
  startMakeServer: startMakeServerMock,
}));

vi.mock('../diagnosticLog.ts', () => ({
  resolveDefaultDiagnosticLogFile: (cwd = process.cwd()) => `${cwd}/.local/logs/axhub-make-test.log`,
  startDiagnosticLog: startDiagnosticLogMock,
}));

import { isCliEntrypoint, parseCliArgs, runCli, shouldAutoRunCli } from '../cli.ts';
import { getGlobalMakeStateDir } from '../projectCore/index.ts';

const DEFAULT_MAKE_SERVER_PORT = 53817;

const tempRoots: string[] = [];

function createProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-server-cli-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  startMakeServerMock.mockReset();
  spawnMock.mockReset();
  startDiagnosticLogMock.mockClear();
  delete process.env.AXHUB_MAKE_HOME_DIR;
  vi.restoreAllMocks();
});

function useMakeHomeDir() {
  const homeDir = createProjectRoot();
  process.env.AXHUB_MAKE_HOME_DIR = homeDir;
  return homeDir;
}

describe('make-server CLI args', () => {
  it('uses global make state as projectRoot when no explicit path is provided', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();

    expect(parseCliArgs([], cwd)).toMatchObject({
      projectRoot: getGlobalMakeStateDir(homeDir),
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    expect(parseCliArgs([], cwd)).not.toHaveProperty('host');
  });

  it('rejects positional project paths', () => {
    const cwd = createProjectRoot();
    const projectRoot = createProjectRoot();

    expect(() => parseCliArgs([
      projectRoot,
      '--port',
      '5200',
      '--host',
      '0.0.0.0',
      '--runtime-origin',
      'http://localhost:51720',
    ], cwd)).toThrow(`Unexpected argument: ${projectRoot}`);
  });

  it('accepts an explicit Axhub online base URL for local or production publishing targets', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();

    expect(parseCliArgs([
      '--axhub-online-base-url',
      'https://axhub.im/',
    ], cwd)).toMatchObject({
      projectRoot: getGlobalMakeStateDir(homeDir),
      axhubOnlineBaseUrl: 'https://axhub.im',
    });
  });

  it('returns help without requiring a project root', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();

    expect(parseCliArgs(['--help'], cwd)).toEqual({
      help: true,
      projectRoot: getGlobalMakeStateDir(homeDir),
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    expect(parseCliArgs(['-h'], cwd)).toMatchObject({ help: true });
  });

  it('accepts an explicit admin root for packaged release assets', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();
    const adminRoot = path.join(cwd, 'admin');

    expect(parseCliArgs(['--admin-root', adminRoot], cwd)).toMatchObject({
      adminRoot,
      projectRoot: getGlobalMakeStateDir(homeDir),
    });
  });

  it('can start without opening the admin page automatically', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();

    expect(parseCliArgs(['--no-open'], cwd)).toMatchObject({
      projectRoot: getGlobalMakeStateDir(homeDir),
      open: false,
    });
  });

  it('accepts a diagnostic log file path', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();
    const logFile = path.join(cwd, '.local', 'logs', 'make.log');

    expect(parseCliArgs(['--log-file', logFile], cwd)).toMatchObject({
      projectRoot: getGlobalMakeStateDir(homeDir),
      logFile,
    });
  });

  it('uses a local diagnostic log path when --log-file is passed without a value', () => {
    const homeDir = useMakeHomeDir();
    const cwd = createProjectRoot();

    const parsed = parseCliArgs(['--log-file', '--no-open'], cwd);

    expect(parsed).toMatchObject({
      projectRoot: getGlobalMakeStateDir(homeDir),
      open: false,
    });
    expect(parsed.logFile).toMatch(new RegExp(`^${cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(parsed.logFile).toContain(`${path.sep}.local${path.sep}logs${path.sep}`);
  });

  it('rejects positional project paths after a pnpm script argument separator', () => {
    const cwd = createProjectRoot();
    const projectRoot = createProjectRoot();

    expect(() => parseCliArgs(['--', projectRoot], cwd)).toThrow(`Unexpected argument: ${projectRoot}`);
  });

  it('rejects missing option values and invalid ports', () => {
    const cwd = createProjectRoot();

    expect(() => parseCliArgs(['--port'], cwd)).toThrow(/Missing value for --port/);
    expect(() => parseCliArgs(['--port', 'abc'], cwd)).toThrow(/Invalid --port/);
    expect(() => parseCliArgs(['--axhub-online-base-url'], cwd)).toThrow(/Missing value for --axhub-online-base-url/);
    expect(() => parseCliArgs(['--axhub-online-base-url', 'localhost:3001'], cwd)).toThrow(/Invalid --axhub-online-base-url/);
  });

  it('detects when cli.ts is executed as the process entrypoint', () => {
    const cliPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'cli.ts');
    const cliUrl = pathToFileURL(cliPath).href;

    expect(isCliEntrypoint(cliPath, cliUrl)).toBe(true);
    expect(isCliEntrypoint(path.join(path.dirname(cliPath), 'index.ts'), cliUrl)).toBe(false);
  });

  it('allows bundled entrypoints to disable cli.ts auto-run', () => {
    const cliPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'cli.ts');
    const cliUrl = pathToFileURL(cliPath).href;

    expect(shouldAutoRunCli(cliPath, cliUrl, { AXHUB_MAKE_DISABLE_AUTO_RUN: '1' })).toBe(false);
    expect(shouldAutoRunCli(cliPath, cliUrl, {})).toBe(true);
  });

  it('opens the admin page in the default browser after starting the server', async () => {
    const homeDir = useMakeHomeDir();
    const unref = vi.fn();
    startMakeServerMock.mockResolvedValue({
      close: vi.fn(),
      host: 'localhost',
      origin: 'http://localhost:53817',
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    spawnMock.mockReturnValue({ on: vi.fn(), unref });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCli([]);

    expect(startMakeServerMock).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: getGlobalMakeStateDir(homeDir),
    }));
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['http://localhost:53817']), {
      detached: true,
      stdio: 'ignore',
    });
    expect(unref).toHaveBeenCalled();
  });

  it('passes the explicit Axhub online base URL to the make server', async () => {
    const homeDir = useMakeHomeDir();
    startMakeServerMock.mockResolvedValue({
      close: vi.fn(),
      host: 'localhost',
      origin: 'http://localhost:53817',
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCli(['--axhub-online-base-url', 'https://axhub.im/', '--no-open']);

    expect(startMakeServerMock).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: getGlobalMakeStateDir(homeDir),
      axhubOnlineBaseUrl: 'https://axhub.im',
      open: false,
    }));
  });

  it('does not open the browser when --no-open is passed', async () => {
    const homeDir = useMakeHomeDir();
    startMakeServerMock.mockResolvedValue({
      close: vi.fn(),
      host: 'localhost',
      origin: 'http://localhost:53817',
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCli(['--no-open']);

    expect(startMakeServerMock).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: getGlobalMakeStateDir(homeDir),
      open: false,
    }));
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('passes the diagnostic log file to the make server', async () => {
    const homeDir = useMakeHomeDir();
    const logFile = path.join(createProjectRoot(), 'make.log');
    startMakeServerMock.mockResolvedValue({
      close: vi.fn(),
      host: 'localhost',
      origin: 'http://localhost:53817',
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCli(['--log-file', logFile, '--no-open']);

    expect(startMakeServerMock).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: getGlobalMakeStateDir(homeDir),
      logFile,
      open: false,
    }));
    expect(startDiagnosticLogMock).toHaveBeenCalledWith(logFile);
  });

  it('rejects canvas as a removed CLI command without starting the server', async () => {
    expect(() => parseCliArgs(['canvas'])).toThrow(/Unknown command: canvas/);

    await expect(runCli(['canvas'])).rejects.toThrow(/Unknown command: canvas/);
    expect(startMakeServerMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('prints a friendly hint with the visit URL when the server port is occupied', async () => {
    const originalExitCode = process.exitCode;
    const portInUseError = Object.assign(new Error('listen EADDRINUSE: address already in use 0.0.0.0:53817'), {
      address: '0.0.0.0',
      code: 'EADDRINUSE',
      port: DEFAULT_MAKE_SERVER_PORT,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    startMakeServerMock.mockRejectedValue(portInUseError);
    process.exitCode = undefined;

    try {
      await runCli([]);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = String(errorSpy.mock.calls[0]?.[0] || '');
      expect(message).toContain(`端口 ${DEFAULT_MAKE_SERVER_PORT} 已经被占用了`);
      expect(message).toContain(`http://localhost:${DEFAULT_MAKE_SERVER_PORT}`);
      expect(message).toContain('如果看到的是 Axhub Make 首页');
      expect(message).toContain(`关闭占用 ${DEFAULT_MAKE_SERVER_PORT} 端口的应用`);
      expect(spawnMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});
