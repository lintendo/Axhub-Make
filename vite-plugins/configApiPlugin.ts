import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { exec, execFile, spawn, spawnSync } from 'node:child_process';

type ProjectDefaults = {
  defaultDoc?: string | null;
  defaultTheme?: string | null;
};

type ProjectInfo = {
  name?: string | null;
  description?: string | null;
};

type LegacyPromptClient = 'claude' | 'cursor' | 'codex';
type GeniePromptClient = 'genie:claude' | 'genie:cursor' | 'genie:codex';
type LocalPromptClient = 'local:cursor' | 'local:qoder';
type PromptClient = GeniePromptClient | LocalPromptClient;
type MainIDE = 'cursor' | 'trae' | 'vscode' | 'trae_cn' | 'windsurf' | 'kiro' | 'qoder' | 'antigravity';

const MAIN_IDE_VALUES: MainIDE[] = ['cursor', 'trae', 'vscode', 'trae_cn', 'windsurf', 'kiro', 'qoder', 'antigravity'];

const MAIN_IDE_APP_NAMES: Record<MainIDE, string> = {
  cursor: 'Cursor',
  trae: 'TRAE',
  vscode: 'Visual Studio Code',
  trae_cn: 'TRAE CN',
  windsurf: 'Windsurf',
  kiro: 'Kiro',
  qoder: 'Qoder',
  antigravity: 'Antigravity',
};

const MAIN_IDE_WINDOWS_COMMAND_CANDIDATES: Record<MainIDE, string[]> = {
  cursor: ['cursor'],
  trae: ['trae'],
  vscode: ['code', 'code-insiders'],
  trae_cn: ['trae-cn', 'trae_cn', 'trae'],
  windsurf: ['windsurf'],
  kiro: ['kiro'],
  qoder: ['qoder'],
  antigravity: ['antigravity'],
};

const MAIN_IDE_WINDOWS_EXECUTABLE_NAMES: Record<MainIDE, string[]> = {
  cursor: ['Cursor.exe'],
  trae: ['TRAE.exe', 'Trae.exe'],
  vscode: ['Code.exe', 'Code - Insiders.exe'],
  trae_cn: ['TRAE CN.exe', 'TRAE.exe', 'Trae.exe'],
  windsurf: ['Windsurf.exe'],
  kiro: ['Kiro.exe'],
  qoder: ['Qoder.exe'],
  antigravity: ['Antigravity.exe'],
};

type AutomationConfig = {
  defaultPromptClient?: PromptClient | null;
  defaultIDE?: MainIDE | null;
};

type AssistantConfig = {
  webBaseUrl?: string | null;
  apiBaseUrl?: string | null;
};

type AssistantRuntimeSource = 'axhub-genie' | 'config' | 'cloudcli' | 'env' | 'default';

type AssistantHealthStatus =
  | 'ready'
  | 'missing_cli'
  | 'cli_error'
  | 'runtime_unreachable'
  | 'needs_update';

type AssistantCommandSource = 'axhub-genie' | 'cloudcli' | 'default';

type AssistantHealthHints = {
  installGlobal: string;
  start: string;
  status: string;
};

type AssistantHealthInfo = {
  status: AssistantHealthStatus;
  message: string;
  checkedAt: string;
  commandSource: AssistantCommandSource;
  hints: AssistantHealthHints;
};

type AssistantRuntimeInfo = {
  webBaseUrl: string;
  apiBaseUrl: string;
  projectPath: string;
  source: AssistantRuntimeSource;
  health: AssistantHealthInfo;
};

type AssistantRuntimeResolveOptions = {
  autoStart?: boolean;
};

type AssistantBootstrapMode = 'install_global' | 'start_existing';

type AssistantProbeStatus = 'ready' | 'missing_cli' | 'needs_update' | 'cli_error' | 'not_running';

type AssistantProbeResult = {
  status: AssistantProbeStatus;
  message: string;
  commandSource: Exclude<AssistantCommandSource, 'default'>;
  config: AssistantConfig | null;
};

const ASSISTANT_START_CHECK_DELAY_MS = 500;

type SystemConfig = {
  server: Record<string, any>;
  projectDefaults?: ProjectDefaults;
  projectInfo?: ProjectInfo;
  automation?: AutomationConfig;
  assistant?: AssistantConfig;
};

type AgentDocsPaths = {
  configPath: string;
  agentsTemplatePath: string;
  agentsPath: string;
  claudePath: string;
};

const DEFAULT_ASSISTANT_WEB_BASE_URL = 'http://localhost:32123';
const DEFAULT_ASSISTANT_API_BASE_URL = 'http://localhost:32123/api';
const DEFAULT_ASSISTANT_HEALTH_URL = `${DEFAULT_ASSISTANT_WEB_BASE_URL}/health`;
const ASSISTANT_SERVICE_ID = '@axhub/genie';
const ASSISTANT_SERVICE_NAME = 'Axhub Genie';
const ASSISTANT_RUNTIME_LOG_PREFIX = '[assistant-runtime]';
const CLOUDCLI_STATUS_TIMEOUT_MS = 2_000;

function logAssistantRuntime(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const payload = meta ? `${ASSISTANT_RUNTIME_LOG_PREFIX} ${message}` : `${ASSISTANT_RUNTIME_LOG_PREFIX} ${message}`;
  if (level === 'error') {
    if (meta) {
      console.error(payload, meta);
      return;
    }
    console.error(payload);
    return;
  }
  if (level === 'warn') {
    if (meta) {
      console.warn(payload, meta);
      return;
    }
    console.warn(payload);
    return;
  }
  if (meta) {
    console.info(payload, meta);
    return;
  }
  console.info(payload);
}

function getAssistantHealthHints(): AssistantHealthHints {
  const installBaseCommand = 'npm install -g @axhub/genie';
  const installGlobal = process.platform === 'darwin'
    ? `sudo ${installBaseCommand}`
    : installBaseCommand;

  return {
    installGlobal,
    start: 'axhub-genie',
    status: 'axhub-genie status',
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeInlineText(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return normalized.replace(/\r?\n+/g, ' ').trim() || null;
}

function normalizeProjectDefaults(value: unknown): ProjectDefaults {
  if (!value || typeof value !== 'object') {
    return { defaultDoc: null, defaultTheme: null };
  }
  const defaults = value as ProjectDefaults;
  return {
    defaultDoc: normalizeOptionalString(defaults.defaultDoc),
    defaultTheme: normalizeOptionalString(defaults.defaultTheme)
  };
}

function normalizeProjectInfo(value: unknown): ProjectInfo {
  if (!value || typeof value !== 'object') {
    return { name: null, description: null };
  }
  const info = value as ProjectInfo;
  return {
    name: normalizeInlineText(info.name),
    description: normalizeInlineText(info.description)
  };
}

function normalizePromptClient(value: unknown): PromptClient | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'genie:claude' || normalized === 'genie:cursor' || normalized === 'genie:codex') return normalized;
  if (normalized === 'local:cursor' || normalized === 'local:qoder') return normalized;
  if (normalized === 'claude') return 'genie:claude';
  if (normalized === 'cursor') return 'genie:cursor';
  if (normalized === 'codex') return 'genie:codex';

  return null;
}

function normalizeExecutePromptClient(value: unknown): LegacyPromptClient | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'claude' || normalized === 'cursor' || normalized === 'codex') {
    return normalized;
  }
  return null;
}

function normalizeMainIDE(value: unknown): MainIDE | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase() as MainIDE;
  return MAIN_IDE_VALUES.includes(normalized) ? normalized : null;
}

function normalizeAutomationConfig(value: unknown): AutomationConfig {
  if (!value || typeof value !== 'object') {
    return { defaultPromptClient: null, defaultIDE: null };
  }
  const config = value as AutomationConfig;
  return {
    defaultPromptClient: normalizePromptClient(config.defaultPromptClient),
    defaultIDE: normalizeMainIDE(config.defaultIDE),
  };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, '');
}

function normalizeBaseUrl(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return trimTrailingSlashes(normalized);
}

function normalizeAssistantConfig(value: unknown): AssistantConfig {
  if (!value || typeof value !== 'object') {
    return { webBaseUrl: null, apiBaseUrl: null };
  }
  const config = value as AssistantConfig;
  return {
    webBaseUrl: normalizeBaseUrl(config.webBaseUrl),
    apiBaseUrl: normalizeBaseUrl(config.apiBaseUrl),
  };
}

function readSystemConfig(configPath: string): SystemConfig {
  let config: SystemConfig = { server: { host: 'localhost', allowLAN: true } };

  if (fs.existsSync(configPath)) {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContent);
  }

  if (!config.server || typeof config.server !== 'object') {
    config.server = { host: 'localhost', allowLAN: true };
  }
  if (config.server.allowLAN === undefined) {
    config.server.allowLAN = true;
  }

  config.projectDefaults = normalizeProjectDefaults(config.projectDefaults);
  config.projectInfo = normalizeProjectInfo(config.projectInfo);
  config.automation = normalizeAutomationConfig(config.automation);
  config.assistant = normalizeAssistantConfig(config.assistant);

  return config;
}

function extractAssistantConfigFromStatusPayload(parsed: any): AssistantConfig | null {
  const endpoint = parsed?.endpoint ?? parsed?.assistant?.endpoint ?? parsed?.runtime?.endpoint ?? {};
  const webBaseUrl = normalizeBaseUrl(
    endpoint?.frontendUrl
    ?? endpoint?.webBaseUrl
    ?? endpoint?.webUrl
    ?? parsed?.frontendUrl
    ?? parsed?.webBaseUrl
    ?? parsed?.webUrl
  );
  const apiBaseUrl = normalizeBaseUrl(
    endpoint?.apiBaseUrl
    ?? endpoint?.apiUrl
    ?? parsed?.apiBaseUrl
    ?? parsed?.apiUrl
  );

  if (!webBaseUrl && !apiBaseUrl) {
    return null;
  }

  return {
    webBaseUrl,
    apiBaseUrl,
  };
}

function containsNeedsUpdateHint(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(need\s*update|needs\s*update|outdated|upgrade|please\s*update|版本过旧|需要更新|请更新)/i.test(normalized);
}

function containsNotRunningHint(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(not\s*running|service\s*not\s*running|not\s*started|未启动|尚未启动|未运行|服务未运行)/i.test(normalized);
}

function getCommandCandidates(command: string): string[] {
  if (process.platform !== 'win32') {
    return [command];
  }

  if (/\.(cmd|exe|bat)$/i.test(command)) {
    return [command];
  }

  return [command, `${command}.cmd`, `${command}.exe`, `${command}.bat`];
}

function quoteForCmdExec(value: string): string {
  if (!value) return '""';
  if (!/[\s"&^|<>]/.test(value)) return value;
  const escaped = value
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1');
  return `"${escaped}"`;
}

function buildWindowsCommandLine(command: string, args: string[]): string {
  const parts = [command, ...args].map((part) => quoteForCmdExec(String(part)));
  return parts.join(' ');
}

function spawnSyncCommand(command: string, args: string[], options?: Parameters<typeof spawnSync>[2]) {
  if (process.platform !== 'win32') {
    return spawnSync(command, args, options);
  }

  const useCmdWrapper = !/\.exe$/i.test(command);
  if (!useCmdWrapper) {
    return spawnSync(command, args, options);
  }

  const commandLine = buildWindowsCommandLine(command, args);
  return spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine], {
    ...options,
    windowsHide: true,
  });
}

function spawnSyncFirstAvailable(command: string, args: string[], options?: Parameters<typeof spawnSync>[2]) {
  for (const candidate of getCommandCandidates(command)) {
    const result = spawnSyncCommand(candidate, args, options);
    const errCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
    if (errCode === 'ENOENT' || errCode === 'EINVAL') {
      continue;
    }

    return {
      command: candidate,
      result,
    };
  }

  return null;
}

function readAssistantStatusFromCli(command: 'axhub-genie' | 'cloudcli', args: string[]): AssistantProbeResult {
  const commandSource: Exclude<AssistantCommandSource, 'default'> = command === 'axhub-genie' ? 'axhub-genie' : 'cloudcli';

  try {
    const execution = spawnSyncFirstAvailable(command, args, {
      encoding: 'utf8',
      timeout: CLOUDCLI_STATUS_TIMEOUT_MS,
    });

    if (!execution) {
      return {
        status: 'missing_cli',
        message: `未检测到 ${command} 命令`,
        commandSource,
        config: null,
      };
    }

    const result = execution.result;

    if (result.error) {
      const errCode = (result.error as NodeJS.ErrnoException).code;
      if (errCode === 'ENOENT') {
        return {
          status: 'missing_cli',
          message: `未检测到 ${command} 命令`,
          commandSource,
          config: null,
        };
      }

      return {
        status: 'cli_error',
        message: `${command} 执行失败: ${(result.error as Error).message || 'unknown error'}`,
        commandSource,
        config: null,
      };
    }

    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const mergedOutput = [stdout, stderr].filter(Boolean).join('\n');

    if (result.status !== 0) {
      if (command === 'axhub-genie' && containsNeedsUpdateHint(mergedOutput)) {
        return {
          status: 'needs_update',
          message: `检测到 ${command} 版本可能过旧，请更新后重试`,
          commandSource,
          config: null,
        };
      }

      if (command === 'axhub-genie' && containsNotRunningHint(mergedOutput)) {
        return {
          status: 'not_running',
          message: `${command} 服务未启动`,
          commandSource,
          config: null,
        };
      }

      return {
        status: 'cli_error',
        message: `${command} status 执行失败${mergedOutput ? `: ${mergedOutput}` : ''}`,
        commandSource,
        config: null,
      };
    }

    if (!stdout) {
      return {
        status: 'cli_error',
        message: `${command} status 未返回有效输出`,
        commandSource,
        config: null,
      };
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return {
        status: 'cli_error',
        message: `${command} status 返回内容无法解析为 JSON`,
        commandSource,
        config: null,
      };
    }

    const config = extractAssistantConfigFromStatusPayload(parsed);
    const running = typeof parsed?.running === 'boolean' ? parsed.running : null;

    if (running === false) {
      return {
        status: 'not_running',
        message: `${command} 服务未启动`,
        commandSource,
        config,
      };
    }

    if (!config) {
      return {
        status: 'cli_error',
        message: `${command} status 返回中未发现可用地址`,
        commandSource,
        config: null,
      };
    }

    return {
      status: 'ready',
      message: `${command} 已就绪`,
      commandSource,
      config,
    };
  } catch (error: any) {
    return {
      status: 'cli_error',
      message: `${command} status 检查失败: ${error?.message || 'unknown error'}`,
      commandSource,
      config: null,
    };
  }
}

function readAxhubGenieStatus(): AssistantProbeResult {
  const probe = readAssistantStatusFromCli('axhub-genie', ['status', '--json']);
  const level = probe.status === 'ready' ? 'info' : 'warn';
  logAssistantRuntime(level, 'axhub-genie status --json', {
    status: probe.status,
    message: probe.message,
    config: probe.config || null,
  });
  return probe;
}

function readCloudCliAssistantStatus(): AssistantProbeResult {
  return readAssistantStatusFromCli('cloudcli', ['status', '--json']);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runExecutableCommandInBackground(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const useWindowsCmdWrapper = isWindows && !/\.exe$/i.test(command);
    const spawnCommand = useWindowsCmdWrapper ? 'cmd.exe' : command;
    const spawnArgs = useWindowsCmdWrapper
      ? ['/d', '/s', '/c', buildWindowsCommandLine(command, args)]
      : args;

    logAssistantRuntime('info', '后台执行可执行命令', {
      command,
      args,
      spawnCommand,
      spawnArgs,
      cwd,
      platform: process.platform,
    });

    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: process.platform === 'win32',
    });

    if (typeof (child as any)?.once !== 'function') {
      if (typeof child.unref === 'function') {
        child.unref();
      }
      resolve();
      return;
    }

    let settled = false;
    let stderrText = '';
    if (child.stderr && typeof (child.stderr as any).setEncoding === 'function' && typeof (child.stderr as any).on === 'function') {
      (child.stderr as any).setEncoding('utf8');
      (child.stderr as any).on('data', (chunk: string) => {
        if (typeof chunk !== 'string') return;
        if (stderrText.length >= 4000) return;
        stderrText += chunk;
      });
    }

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (typeof child.unref === 'function') {
        child.unref();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    child.once('error', (error) => {
      logAssistantRuntime('error', '可执行命令触发失败', {
        command,
        args,
        cwd,
        error: (error as Error)?.message || 'unknown error',
      });
      finish(error as Error);
    });

    child.once('spawn', () => {
      logAssistantRuntime('info', '可执行命令已触发', {
        command,
        args,
        cwd,
        pid: typeof child.pid === 'number' ? child.pid : null,
      });
      if ((child.stderr as any)?.unref && typeof (child.stderr as any).unref === 'function') {
        (child.stderr as any).unref();
      }
      setTimeout(() => finish(), 150);
    });

    child.once('exit', (code, signal) => {
      const stderrSnippet = stderrText.trim().slice(0, 500);
      const exitMeta = {
        command,
        args,
        cwd,
        code,
        signal,
        stderr: stderrSnippet || null,
      };

      if (typeof code === 'number' && code !== 0) {
        logAssistantRuntime('error', '可执行命令异常退出', exitMeta);
        finish(new Error(`命令退出 code=${code}${stderrSnippet ? ` stderr=${stderrSnippet}` : ''}`));
        return;
      }

      logAssistantRuntime('warn', '可执行命令提前退出', exitMeta);
      finish();
    });

    setTimeout(() => finish(), 500);
  });
}

async function startAxhubGenieAndWait(projectPath: string): Promise<AssistantProbeResult> {
  const startCommand = getAssistantHealthHints().start;
  logAssistantRuntime('info', '准备自动启动 Axhub Genie', {
    command: startCommand,
    cwd: projectPath,
  });

  try {
    await runExecutableCommandInBackground(startCommand, [], projectPath);
  } catch (error: any) {
    logAssistantRuntime('error', '启动命令触发失败', {
      command: startCommand,
      cwd: projectPath,
      error: error?.message || 'unknown error',
    });
    return {
      status: 'cli_error',
      message: `自动启动 Axhub Genie 失败: ${error?.message || 'unknown error'}`,
      commandSource: 'axhub-genie',
      config: null,
    };
  }

  await sleep(ASSISTANT_START_CHECK_DELAY_MS);
  const probe = readAxhubGenieStatus();

  if (probe.status === 'ready') {
    logAssistantRuntime('info', 'Axhub Genie 自动启动成功', {
      config: probe.config || null,
    });
    return {
      ...probe,
      message: 'Axhub Genie 已自动启动并就绪',
    };
  }

  if (probe.status === 'missing_cli' || probe.status === 'needs_update') {
    logAssistantRuntime('warn', '自动启动提前结束', {
      reason: probe.status,
      message: probe.message,
    });
    return probe;
  }

  if (probe.status === 'cli_error') {
    logAssistantRuntime('error', '自动启动失败（cli_error）', {
      message: probe.message,
    });
    return {
      ...probe,
      status: 'not_running',
      message: `${probe.message}。Axhub Genie 自动启动失败，请手动执行 axhub-genie 后重试`,
    };
  }

  logAssistantRuntime('error', '自动启动失败（启动后单次检查未就绪）', {
    status: probe.status,
    message: probe.message,
    config: probe.config || null,
  });
  return {
    ...probe,
    status: 'not_running',
    message: 'Axhub Genie 自动启动失败，请手动执行 axhub-genie 后重试',
  };
}

function resolveRuntimeEndpoints(params: {
  statusConfig: AssistantConfig | null;
  configAssistant: AssistantConfig;
  envAssistant: AssistantConfig;
}): { webBaseUrl: string; apiBaseUrl: string; source: AssistantRuntimeSource } {
  const candidates: Array<{ source: AssistantRuntimeSource; value: AssistantConfig | null }> = [
    { source: 'axhub-genie', value: params.statusConfig },
    { source: 'config', value: params.configAssistant },
    { source: 'env', value: params.envAssistant },
    {
      source: 'default',
      value: {
        webBaseUrl: DEFAULT_ASSISTANT_WEB_BASE_URL,
        apiBaseUrl: DEFAULT_ASSISTANT_API_BASE_URL,
      },
    },
  ];

  let webBaseUrl: string | null = null;
  let apiBaseUrl: string | null = null;
  let source: AssistantRuntimeSource = 'default';

  for (const candidate of candidates) {
    const value = candidate.value;
    if (!value) continue;

    if (!webBaseUrl && value.webBaseUrl) {
      webBaseUrl = value.webBaseUrl;
      if (source === 'default') {
        source = candidate.source;
      }
    }

    if (!apiBaseUrl && value.apiBaseUrl) {
      apiBaseUrl = value.apiBaseUrl;
      if (source === 'default') {
        source = candidate.source;
      }
    }

    if (webBaseUrl && apiBaseUrl) {
      break;
    }
  }

  return {
    webBaseUrl: normalizeBaseUrl(webBaseUrl) || DEFAULT_ASSISTANT_WEB_BASE_URL,
    apiBaseUrl: apiBaseUrl || DEFAULT_ASSISTANT_API_BASE_URL,
    source,
  };
}

function getAssistantBootstrapHints() {
  return getAssistantHealthHints();
}

function createAssistantHealthInfo(params: {
  status: AssistantHealthStatus;
  message: string;
  commandSource: AssistantCommandSource;
}): AssistantHealthInfo {
  return {
    status: params.status,
    message: params.message,
    checkedAt: new Date().toISOString(),
    commandSource: params.commandSource,
    hints: getAssistantHealthHints(),
  };
}

function normalizeAssistantBootstrapMode(value: unknown): AssistantBootstrapMode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized === 'install_global' || normalized === 'start_existing') {
    return normalized;
  }
  return null;
}

function getPreferredNpmCommandForBootstrap(): string {
  if (process.platform !== 'win32') {
    return 'npm';
  }

  return isCommandAvailable('npm.cmd') ? 'npm.cmd' : 'npm';
}

function buildAssistantBootstrapCommand(mode: AssistantBootstrapMode): string {
  const hints = getAssistantHealthHints();
  if (mode === 'install_global') {
    const npmCommand = getPreferredNpmCommandForBootstrap();
    return `${npmCommand} install -g @axhub/genie && ${hints.start}`;
  }
  return hints.start;
}

function runCommandInBackground(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logAssistantRuntime('info', '后台执行命令', { command, cwd, platform: process.platform });
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', command], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      : spawn('sh', ['-lc', command], {
        cwd,
        detached: true,
        stdio: 'ignore',
      });

    if (typeof (child as any)?.once !== 'function') {
      child.unref();
      logAssistantRuntime('warn', '子进程对象不支持事件监听，按已触发处理', { command, cwd });
      resolve();
      return;
    }

    let settled = false;
    let stderrText = '';
    if (child.stderr && typeof (child.stderr as any).setEncoding === 'function' && typeof (child.stderr as any).on === 'function') {
      (child.stderr as any).setEncoding('utf8');
      (child.stderr as any).on('data', (chunk: string) => {
        if (typeof chunk !== 'string') return;
        if (stderrText.length >= 4000) return;
        stderrText += chunk;
      });
    }

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (typeof child.unref === 'function') {
        child.unref();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    child.once('error', (error) => {
      logAssistantRuntime('error', '后台命令触发失败', {
        command,
        cwd,
        error: (error as Error)?.message || 'unknown error',
      });
      finish(error as Error);
    });
    child.once('spawn', () => {
      logAssistantRuntime('info', '后台命令已触发', {
        command,
        cwd,
        pid: typeof child.pid === 'number' ? child.pid : null,
      });
      setTimeout(() => finish(), 150);
    });
    child.once('exit', (code, signal) => {
      const stderrSnippet = stderrText.trim().slice(0, 500);
      const exitMeta = {
        command,
        cwd,
        code,
        signal,
        stderr: stderrSnippet || null,
      };

      if (typeof code === 'number' && code !== 0) {
        logAssistantRuntime('error', '后台命令异常退出', exitMeta);
        finish(new Error(`命令退出 code=${code}${stderrSnippet ? ` stderr=${stderrSnippet}` : ''}`));
        return;
      }

      logAssistantRuntime('warn', '后台命令提前退出', exitMeta);
      finish();
    });
    setTimeout(() => finish(), 500);
  });
}

function isCommandAvailable(command: string, args: string[] = ['--version']): boolean {
  try {
    const execution = spawnSyncFirstAvailable(command, args, {
      encoding: 'utf8',
      timeout: CLOUDCLI_STATUS_TIMEOUT_MS,
    });

    if (!execution) {
      return false;
    }

    const result = execution.result;

    if (result.error) {
      const errCode = (result.error as NodeJS.ErrnoException).code;
      return errCode !== 'ENOENT';
    }

    return result.status === 0;
  } catch {
    return false;
  }
}

function validateBootstrapPrerequisites(mode: AssistantBootstrapMode): string | null {
  if (mode === 'install_global') {
    if (!isCommandAvailable('npm')) {
      return 'npm 未安装，无法自动安装 Axhub Genie';
    }
    return null;
  }

  if (!isCommandAvailable('axhub-genie')) {
    return '未检测到 axhub-genie 命令，请先安装后重试';
  }

  return null;
}

async function verifyAssistantHealthEndpoint(): Promise<{ ok: boolean; message: string }> {
  const healthUrl = DEFAULT_ASSISTANT_HEALTH_URL;

  try {
    const response = await fetch(healthUrl, { method: 'GET' });
    if (!response.ok) {
      return { ok: false, message: `/health 探测失败: status ${response.status}` };
    }

    const appIdentifier = response.headers.get('X-App-Identifier') || response.headers.get('x-app-identifier') || '';
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, message: '/health 响应不是有效 JSON' };
    }

    const serviceId = payload?.service?.id || '';
    const serviceName = payload?.service?.name || '';

    const idMatched = serviceId === ASSISTANT_SERVICE_ID || appIdentifier === ASSISTANT_SERVICE_ID;
    const nameMatched = typeof serviceName === 'string' && serviceName.toLowerCase().includes(ASSISTANT_SERVICE_NAME.toLowerCase());

    if (!idMatched && !nameMatched) {
      return { ok: false, message: '健康检查服务身份不匹配（非 Axhub Genie）' };
    }

    if (payload?.status !== 'ok') {
      return { ok: false, message: `健康检查状态异常: ${String(payload?.status || 'unknown')}` };
    }

    return { ok: true, message: 'Axhub Genie 健康检查通过' };
  } catch (error: any) {
    return { ok: false, message: `健康检查请求失败: ${error?.message || 'unknown error'}` };
  }
}

async function resolveAssistantRuntime(
  config: SystemConfig,
  projectPath: string,
  options?: AssistantRuntimeResolveOptions,
): Promise<AssistantRuntimeInfo> {
  const shouldAutoStart = options?.autoStart !== false;
  logAssistantRuntime('info', '开始解析助手运行时', { projectPath, autoStart: shouldAutoStart });
  const healthProbe = await verifyAssistantHealthEndpoint();
  logAssistantRuntime(healthProbe.ok ? 'info' : 'warn', '固定地址健康检查结果', {
    healthUrl: DEFAULT_ASSISTANT_HEALTH_URL,
    ok: healthProbe.ok,
    message: healthProbe.message,
  });
  if (healthProbe.ok) {
    return {
      webBaseUrl: DEFAULT_ASSISTANT_WEB_BASE_URL,
      apiBaseUrl: DEFAULT_ASSISTANT_API_BASE_URL,
      projectPath,
      source: 'default',
      health: createAssistantHealthInfo({
        status: 'ready',
        message: healthProbe.message,
        commandSource: 'default',
      }),
    };
  }

  const configAssistant = normalizeAssistantConfig(config.assistant);
  const envAssistant: AssistantConfig = {
    webBaseUrl: normalizeBaseUrl(process.env.AXHUB_ASSISTANT_WEB_BASE_URL),
    apiBaseUrl: normalizeBaseUrl(process.env.AXHUB_ASSISTANT_API_BASE_URL),
  };

  let axhubGenieStatus = readAxhubGenieStatus();

  if (axhubGenieStatus.status === 'not_running' && shouldAutoStart) {
    axhubGenieStatus = await startAxhubGenieAndWait(projectPath);
  } else if (axhubGenieStatus.status === 'not_running' && !shouldAutoStart) {
    logAssistantRuntime('info', '检测到未启动，但本次请求禁用自动启动', {
      projectPath,
    });
  }

  const resolvedEndpoints = resolveRuntimeEndpoints({
    statusConfig: axhubGenieStatus.status === 'ready' ? axhubGenieStatus.config : null,
    configAssistant,
    envAssistant,
  });
  logAssistantRuntime('info', '地址解析结果', {
    source: resolvedEndpoints.source,
    webBaseUrl: resolvedEndpoints.webBaseUrl,
    apiBaseUrl: resolvedEndpoints.apiBaseUrl,
    status: axhubGenieStatus.status,
  });

  let healthStatus: AssistantHealthStatus = 'runtime_unreachable';
  let healthMessage = '未找到可用的助手地址，请确认 Axhub Genie 已启动';
  const commandSource: AssistantCommandSource = 'axhub-genie';

  if (axhubGenieStatus.status === 'ready') {
    healthStatus = 'ready';
    healthMessage = `已通过 axhub-genie status --json 获取服务地址（默认 /health 探测失败：${healthProbe.message}）`;
  } else if (axhubGenieStatus.status === 'missing_cli') {
    healthStatus = 'missing_cli';
    healthMessage = '未检测到 axhub-genie 命令，请先安装后重试';
  } else if (axhubGenieStatus.status === 'needs_update') {
    healthStatus = 'needs_update';
    healthMessage = axhubGenieStatus.message;
  } else if (axhubGenieStatus.status === 'not_running') {
    healthStatus = 'runtime_unreachable';
    healthMessage = 'Axhub Genie 自动启动失败，请手动执行 axhub-genie 后重试';
  } else if (axhubGenieStatus.status === 'cli_error') {
    healthStatus = 'cli_error';
    healthMessage = axhubGenieStatus.message;
  }

  const runtime = {
    webBaseUrl: resolvedEndpoints.webBaseUrl,
    apiBaseUrl: resolvedEndpoints.apiBaseUrl,
    projectPath,
    source: resolvedEndpoints.source,
    health: createAssistantHealthInfo({
      status: healthStatus,
      message: healthMessage,
      commandSource,
    }),
  };
  logAssistantRuntime(healthStatus === 'ready' ? 'info' : 'warn', '运行时判定完成', {
    healthStatus,
    healthMessage,
    commandSource,
    source: runtime.source,
    webBaseUrl: runtime.webBaseUrl,
    apiBaseUrl: runtime.apiBaseUrl,
  });
  return runtime;
}

export const __assistantRuntimeTestUtils = {
  extractAssistantConfigFromStatusPayload,
  containsNeedsUpdateHint,
  normalizeAssistantBootstrapMode,
  buildAssistantBootstrapCommand,
  getAssistantBootstrapHints,
  validateBootstrapPrerequisites,
  readAssistantStatusFromCli,
  startAxhubGenieAndWait,
  resolveRuntimeEndpoints,
  resolveAssistantRuntime,
  verifyAssistantHealthEndpoint,
};

function buildAgentApiUrl(apiBaseUrl: string): string {
  const normalized = trimTrailingSlashes(apiBaseUrl);
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/agent`;
  }
  return `${normalized}/api/agent`;
}

function quoteForShell(value: string) {
  return `"${String(value).replace(/["\\$`]/g, '\\$&')}"`;
}

function quoteForPowerShellSingle(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveWindowsExecutablePath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const result = spawnSync('where', [trimmed], {
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.status !== 0) continue;

    const lines = String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) continue;

    const exePath = lines.find((line) => /\.exe$/i.test(line));
    if (exePath) {
      return exePath;
    }

    const commandWrapper = lines.find((line) => /\.(cmd|bat)$/i.test(line));
    if (commandWrapper) {
      const inferredExePath = commandWrapper.replace(/\.(cmd|bat)$/i, '.exe');
      if (fs.existsSync(inferredExePath)) {
        return inferredExePath;
      }
    }
  }

  return null;
}

function resolveWindowsExecutableFromRegistry(executableNames: string[]): string | null {
  const keyRoots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  ];

  for (const executableName of executableNames) {
    const normalizedName = executableName.trim();
    if (!normalizedName) continue;

    for (const keyRoot of keyRoots) {
      const key = `${keyRoot}\\${normalizedName}`;
      const query = spawnSync('reg', ['query', key, '/ve'], {
        encoding: 'utf8',
        windowsHide: true,
      });

      if (query.status !== 0 || query.error) {
        continue;
      }

      const output = String(query.stdout || '');
      const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const matchedLine = lines.find((line) => /REG_\w+/i.test(line));
      if (!matchedLine) {
        continue;
      }

      const valueMatch = matchedLine.match(/REG_\w+\s+(.+)$/i);
      if (!valueMatch || !valueMatch[1]) {
        continue;
      }

      const resolvedPath = valueMatch[1].trim().replace(/^"|"$/g, '');
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }
    }
  }

  return null;
}

function buildProjectInfoSection(projectInfo: ProjectInfo, projectDefaults: ProjectDefaults): string {
  const lines: string[] = [];
  const projectName = normalizeInlineText(projectInfo.name);
  const projectDescription = normalizeInlineText(projectInfo.description);
  const defaultDoc = normalizeOptionalString(projectDefaults.defaultDoc);
  const defaultTheme = normalizeOptionalString(projectDefaults.defaultTheme);

  if (projectName) lines.push(`- 项目名称：${projectName}`);
  if (projectDescription) lines.push(`- 项目简介：${projectDescription}`);
  if (defaultDoc) lines.push(`- 项目总文档：\`assets/docs/${defaultDoc}\``);
  if (defaultTheme) lines.push(`- 默认主题：\`src/themes/${defaultTheme}\``);

  if (!lines.length) return '';
  return ['## 📌 项目信息', '', ...lines].join('\n');
}

function renderAgentsTemplate(template: string, projectInfo: ProjectInfo, projectDefaults: ProjectDefaults) {
  const projectInfoSection = buildProjectInfoSection(projectInfo, projectDefaults);
  let content = template;

  if (content.includes('{{PROJECT_INFO_SECTION}}')) {
    content = content.replace('{{PROJECT_INFO_SECTION}}', projectInfoSection);
    return content;
  }

  const sectionRegex = /^## 📌 项目信息[\s\S]*?(?=^##\s|\s*$)/m;
  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, projectInfoSection);
  }

  return content;
}

function writeAgentDocs(
  templatePath: string,
  agentsPath: string,
  claudePath: string,
  projectInfo: ProjectInfo,
  projectDefaults: ProjectDefaults
): boolean {
  if (!fs.existsSync(templatePath)) return false;
  const template = fs.readFileSync(templatePath, 'utf8');
  const nextAgentsContent = renderAgentsTemplate(template, projectInfo, projectDefaults);
  fs.writeFileSync(agentsPath, nextAgentsContent, 'utf8');
  fs.writeFileSync(claudePath, nextAgentsContent, 'utf8');
  return true;
}

function syncAgentDocsFromConfig(paths: AgentDocsPaths): void {
  const { configPath, agentsTemplatePath, agentsPath, claudePath } = paths;
  let config: SystemConfig = { server: { host: 'localhost', allowLAN: true } };

  if (fs.existsSync(configPath)) {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContent);
  }

  const projectDefaults = normalizeProjectDefaults(config.projectDefaults);
  const projectInfo = normalizeProjectInfo(config.projectInfo);
  writeAgentDocs(agentsTemplatePath, agentsPath, claudePath, projectInfo, projectDefaults);
}

/**
 * 配置管理 API 插件
 * 提供配置文件的读取和保存功能
 */
export function configApiPlugin(): Plugin {
  const projectRoot = path.resolve(__dirname, '..');
  const configPath = path.resolve(projectRoot, 'axhub.config.json');
  const agentsPath = path.resolve(projectRoot, 'AGENTS.md');
  const claudePath = path.resolve(projectRoot, 'CLAUDE.md');
  const agentsTemplatePath = path.resolve(projectRoot, 'AGENTS.template.md');

  return {
    name: 'config-api-plugin',
    configureServer(server: any) {
      try {
        syncAgentDocsFromConfig({
          configPath,
          agentsTemplatePath,
          agentsPath,
          claudePath
        });
      } catch (e: any) {
        console.warn('Failed to sync AGENTS.md on server start:', e?.message || e);
      }

      // GET /api/config - 读取配置
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.method === 'GET' && req.url === '/api/config') {
          try {
            const config = readSystemConfig(configPath);
            
            // 移除 port 字段（不对外暴露，固定使用 51720 起始）
            if (config.server && 'port' in config.server) {
              delete config.server.port;
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(config));
          } catch (e: any) {
            console.error('Error reading config:', e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: e?.message || 'Failed to read config' }));
          }
          return;
        }

        if (req.method === 'GET' && req.url?.startsWith('/api/assistant/runtime')) {
          try {
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname !== '/api/assistant/runtime') {
              next();
              return;
            }

            const autoStartParam = (url.searchParams.get('autoStart') || '').trim().toLowerCase();
            const shouldAutoStart = !(autoStartParam === '0' || autoStartParam === 'false' || autoStartParam === 'no');
            const config = readSystemConfig(configPath);
            const runtime = await resolveAssistantRuntime(config, projectRoot, {
              autoStart: shouldAutoStart,
            });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(runtime));
          } catch (e: any) {
            const fallback: AssistantRuntimeInfo = {
              webBaseUrl: DEFAULT_ASSISTANT_WEB_BASE_URL,
              apiBaseUrl: DEFAULT_ASSISTANT_API_BASE_URL,
              projectPath: projectRoot,
              source: 'default',
              health: createAssistantHealthInfo({
                status: 'runtime_unreachable',
                message: '助手运行时检查失败，请稍后重试',
                commandSource: 'default',
              }),
            };

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(fallback));
          }
          return;
        }

        if (req.method === 'POST' && req.url === '/api/assistant/bootstrap') {
          const chunks: Buffer[] = [];
          let totalLength = 0;

          req.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > 1024 * 10) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', async () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const body = raw ? JSON.parse(raw) : {};
              const mode = normalizeAssistantBootstrapMode(body?.mode);

              if (!mode) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Invalid bootstrap mode', hints: getAssistantBootstrapHints() }));
                return;
              }

              const prerequisiteError = validateBootstrapPrerequisites(mode);
              if (prerequisiteError) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: prerequisiteError, hints: getAssistantBootstrapHints() }));
                return;
              }

              const command = buildAssistantBootstrapCommand(mode);
              await runCommandInBackground(command, projectRoot);

              const config = readSystemConfig(configPath);
              const runtime = await resolveAssistantRuntime(config, projectRoot);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({
                success: true,
                mode,
                message: '已触发启动，请稍后重试',
                runtime,
              }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({
                error: e?.message || '无法自动启动 Axhub Genie',
                hints: getAssistantBootstrapHints(),
              }));
            }
          });

          return;
        }

        // POST /api/config - 保存配置
        if (req.method === 'POST' && req.url === '/api/config') {
          const chunks: Buffer[] = [];
          let totalLength = 0;

          req.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > 1024 * 10) { // 10KB 限制
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const newConfig: SystemConfig = JSON.parse(raw);

              // 验证配置格式
              if (!newConfig.server || typeof newConfig.server !== 'object') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Invalid config format' }));
                return;
              }

              // 移除 port 字段（不允许配置，固定使用 51720 起始）
              if (newConfig.server && 'port' in newConfig.server) {
                delete newConfig.server.port;
              }

              // 校验/归一化 projectDefaults
              const projectDefaults = normalizeProjectDefaults(newConfig.projectDefaults);
              const projectInfo = normalizeProjectInfo(newConfig.projectInfo);
              const automation = normalizeAutomationConfig(newConfig.automation);
              const assistant = normalizeAssistantConfig(newConfig.assistant);
              newConfig.projectDefaults = projectDefaults;
              newConfig.projectInfo = projectInfo;
              newConfig.automation = automation;
              newConfig.assistant = assistant;

              // 使用模板生成 AGENTS.md（项目参考规范）
              if (!writeAgentDocs(agentsTemplatePath, agentsPath, claudePath, projectInfo, projectDefaults)) {
                console.warn('AGENTS.template.md not found, skip regenerating AGENTS.md');
              }

              // 保存配置文件
              fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ 
                success: true, 
                message: '配置已保存（已根据模板同步 AGENTS.md）' 
              }));
            } catch (e: any) {
              console.error('Error saving config:', e);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: e?.message || 'Failed to save config' }));
            }
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/api/ide/open') {
          const chunks: Buffer[] = [];
          let totalLength = 0;

          req.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > 1024 * 10) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const body = JSON.parse(raw || '{}');

              let configuredIDE: MainIDE | null = null;
              if (fs.existsSync(configPath)) {
                const fileContent = fs.readFileSync(configPath, 'utf8');
                const savedConfig = JSON.parse(fileContent) as SystemConfig;
                configuredIDE = normalizeMainIDE(savedConfig?.automation?.defaultIDE);
              }

              const ide = normalizeMainIDE(body?.ide) || configuredIDE;
              if (!ide) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Main IDE is not configured' }));
                return;
              }

              const rawTargetPath = typeof body?.targetPath === 'string' ? body.targetPath.trim() : '';
              const targetPath = rawTargetPath ? rawTargetPath : projectRoot;
              const absoluteTargetPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(projectRoot, targetPath);
              const ideAppName = MAIN_IDE_APP_NAMES[ide];

              const command = process.platform === 'win32'
                ? `powershell -NoProfile -Command Start-Process -FilePath ${quoteForPowerShellSingle(ideAppName)} -ArgumentList ${quoteForPowerShellSingle(absoluteTargetPath)} -ErrorAction Stop`
                : `open -a ${quoteForShell(ideAppName)} ${quoteForShell(absoluteTargetPath)}`;

              const handleOpenCommandResult = (error: Error | null, _stdout?: string | Buffer, stderr?: string | Buffer) => {
                const stderrText = typeof stderr === 'string'
                  ? stderr.trim()
                  : Buffer.isBuffer(stderr)
                    ? stderr.toString('utf8').trim()
                    : '';

                if (error && stderrText) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ error: `打开 ${ideAppName} 失败: ${stderrText || error.message}` }));
                  return;
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  success: true,
                  ide,
                  targetPath: absoluteTargetPath,
                  command,
                }));
              };

              if (process.platform === 'win32') {
                const executableCandidates = [
                  ...(MAIN_IDE_WINDOWS_COMMAND_CANDIDATES[ide] || []),
                  ideAppName,
                ];
                const executableNameCandidates = MAIN_IDE_WINDOWS_EXECUTABLE_NAMES[ide] || [];

                const executablePath =
                  resolveWindowsExecutablePath(executableCandidates)
                  || resolveWindowsExecutablePath(executableNameCandidates)
                  || resolveWindowsExecutableFromRegistry(executableNameCandidates);

                if (executablePath) {
                  const child = spawn(executablePath, [absoluteTargetPath], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                    shell: false,
                  });

                  child.once('error', (spawnError) => {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ error: `打开 ${ideAppName} 失败: ${spawnError.message}` }));
                  });

                  child.once('spawn', () => {
                    child.unref();
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({
                      success: true,
                      ide,
                      targetPath: absoluteTargetPath,
                      command: `${quoteForShell(executablePath)} ${quoteForShell(absoluteTargetPath)}`,
                    }));
                  });

                  return;
                }

                execFile(
                  'powershell',
                  [
                    '-NoProfile',
                    '-NonInteractive',
                    '-WindowStyle',
                    'Hidden',
                    '-Command',
                    `Start-Process -FilePath ${quoteForPowerShellSingle(ideAppName)} -ArgumentList ${quoteForPowerShellSingle(absoluteTargetPath)} -ErrorAction Stop`,
                  ],
                  { windowsHide: true },
                  handleOpenCommandResult,
                );
              } else {
                exec(command, handleOpenCommandResult);
              }
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: e?.message || 'Failed to open IDE' }));
            }
          });

          return;
        }

        if (req.method === 'POST' && req.url === '/api/prompt/execute') {
          const chunks: Buffer[] = [];
          let totalLength = 0;

          req.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > 1024 * 1024) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', async () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const body = JSON.parse(raw || '{}');
              const client = normalizeExecutePromptClient(body?.client);
              const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
              const scene = typeof body?.scene === 'string' ? body.scene.trim() : '';

              if (!client) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Invalid client' }));
                return;
              }

              if (!prompt) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Prompt is required' }));
                return;
              }

              if (!scene) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Scene is required' }));
                return;
              }

              const config = readSystemConfig(configPath);
              const assistantRuntime = await resolveAssistantRuntime(config, projectRoot);

              if (assistantRuntime.health.status !== 'ready') {
                throw new Error(`${assistantRuntime.health.message}。可尝试：${getAssistantHealthHints().installGlobal}`);
              }

              const provider = client;
              const agentApiUrl = buildAgentApiUrl(assistantRuntime.apiBaseUrl);

              const upstreamResponse = await fetch(agentApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projectPath: assistantRuntime.projectPath,
                  provider,
                  message: prompt,
                  stream: false,
                }),
              });

              const upstreamText = await upstreamResponse.text();
              let upstreamData: any = null;
              try {
                upstreamData = upstreamText ? JSON.parse(upstreamText) : null;
              } catch {
                upstreamData = null;
              }

              if (!upstreamResponse.ok) {
                const upstreamError = upstreamData?.error || upstreamData?.message || upstreamText || `status ${upstreamResponse.status}`;
                throw new Error(`Agent API 调用失败: ${upstreamError}`);
              }

              const sessionId = typeof upstreamData?.sessionId === 'string' ? upstreamData.sessionId : '';
              const sessionUrl = typeof upstreamData?.sessionUrl === 'string' ? upstreamData.sessionUrl : '';

              const url = sessionUrl || (sessionId ? `${assistantRuntime.webBaseUrl}/session/${encodeURIComponent(sessionId)}` : '');

              if (!url) {
                throw new Error('Agent API 返回缺少 sessionUrl/sessionId');
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ success: true, url, sessionId, scene, provider }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: e?.message || 'Failed to execute prompt' }));
            }
          });

          return;
        }

        next();
      });
    }
  };
}
