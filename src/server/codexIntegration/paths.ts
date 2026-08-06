import path from 'node:path';

export const CODEX_INTEGRATION_LAUNCH_AGENT_LABEL = 'im.axhub.codexplus.make-companion';
export const CODEX_INTEGRATION_WINDOWS_TASK_NAME = 'Axhub Make Codex Companion';

export interface ResolveCodexIntegrationPathsOptions {
  platform: NodeJS.Platform | string;
  homeDir: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

interface CodexIntegrationBasePaths {
  platform: 'darwin' | 'win32';
  homeDir: string;
  installRoot: string;
  configFile: string;
  companionFile: string;
  sidebarSourceFile: string;
  legacyUserScriptFile: string;
  stdoutLog: string;
  stderrLog: string;
  codexPlusCandidates: string[];
  codexCandidates: string[];
}

export interface MacCodexIntegrationPaths extends CodexIntegrationBasePaths {
  platform: 'darwin';
  serviceFile: string;
}

export interface WindowsCodexIntegrationPaths extends CodexIntegrationBasePaths {
  platform: 'win32';
  taskXmlFile: string;
}

export type CodexIntegrationPaths = MacCodexIntegrationPaths | WindowsCodexIntegrationPaths;

function getEnvValue(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | undefined {
  const direct = env[key];
  if (direct) return direct;
  const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

export function resolveCodexIntegrationPaths(
  options: ResolveCodexIntegrationPathsOptions & { platform: 'darwin' },
): MacCodexIntegrationPaths;
export function resolveCodexIntegrationPaths(
  options: ResolveCodexIntegrationPathsOptions & { platform: 'win32' },
): WindowsCodexIntegrationPaths;
export function resolveCodexIntegrationPaths(
  options: ResolveCodexIntegrationPathsOptions,
): CodexIntegrationPaths;
export function resolveCodexIntegrationPaths({
  platform,
  homeDir,
  env,
}: ResolveCodexIntegrationPathsOptions): CodexIntegrationPaths {
  if (platform === 'darwin') {
    const installRoot = path.posix.join(
      homeDir,
      'Library/Application Support/Axhub Make/codex-integration',
    );
    return {
      platform,
      homeDir,
      installRoot,
      configFile: path.posix.join(installRoot, 'config.json'),
      companionFile: path.posix.join(installRoot, 'companion.mjs'),
      sidebarSourceFile: path.posix.join(installRoot, 'axhub-make.sidebar.js'),
      legacyUserScriptFile: path.posix.join(
        homeDir,
        '.config/Codex++/user_scripts/axhub-make.user.js',
      ),
      serviceFile: path.posix.join(
        homeDir,
        `Library/LaunchAgents/${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}.plist`,
      ),
      stdoutLog: path.posix.join(homeDir, 'Library/Logs/Axhub Make Codex++/companion.log'),
      stderrLog: path.posix.join(homeDir, 'Library/Logs/Axhub Make Codex++/companion.error.log'),
      codexPlusCandidates: [
        '/Applications/Codex++.app',
        path.posix.join(homeDir, 'Applications/Codex++.app'),
      ],
      codexCandidates: [
        '/Applications/Codex.app',
        path.posix.join(homeDir, 'Applications/Codex.app'),
      ],
    };
  }

  if (platform === 'win32') {
    const appData = getEnvValue(env, 'APPDATA') || path.win32.join(homeDir, 'AppData', 'Roaming');
    const localAppData = getEnvValue(env, 'LOCALAPPDATA') || path.win32.join(homeDir, 'AppData', 'Local');
    const installRoot = path.win32.join(localAppData, 'Axhub Make', 'codex-integration');
    return {
      platform,
      homeDir,
      installRoot,
      configFile: path.win32.join(installRoot, 'config.json'),
      companionFile: path.win32.join(installRoot, 'companion.mjs'),
      sidebarSourceFile: path.win32.join(installRoot, 'axhub-make.sidebar.js'),
      legacyUserScriptFile: path.win32.join(appData, 'Codex++', 'user_scripts', 'axhub-make.user.js'),
      taskXmlFile: path.win32.join(installRoot, 'scheduled-task.xml'),
      stdoutLog: path.win32.join(installRoot, 'logs', 'companion.log'),
      stderrLog: path.win32.join(installRoot, 'logs', 'companion.error.log'),
      codexPlusCandidates: [
        path.win32.join(localAppData, 'Programs', 'Codex++', 'codex-plus-plus.exe'),
      ],
      codexCandidates: [
        path.win32.join(localAppData, 'Programs', 'Codex', 'Codex.exe'),
      ],
    };
  }

  throw new Error('The Axhub Make Codex++ integration supports macOS and Windows only.');
}
